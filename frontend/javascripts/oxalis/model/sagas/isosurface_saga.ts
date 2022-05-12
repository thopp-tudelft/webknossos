import { saveAs } from "file-saver";
import _ from "lodash";
import { V3 } from "libs/mjs";
import { sleep } from "libs/utils";
import ErrorHandling from "libs/error_handling";
import type { APIDataLayer } from "types/api_flow_types";
import {
  ResolutionInfo,
  getResolutionInfo,
  getMappingInfo,
  getVisibleSegmentationLayer,
  getSegmentationLayerByName,
} from "oxalis/model/accessors/dataset_accessor";
import type {
  LoadAdHocMeshAction,
  LoadPrecomputedMeshAction,
  IsosurfaceMappingInfo,
} from "oxalis/model/actions/segmentation_actions";
import type { Action } from "oxalis/model/actions/actions";
import type { Vector3 } from "oxalis/constants";
import { MappingStatusEnum } from "oxalis/constants";
import type {
  ImportIsosurfaceFromStlAction,
  UpdateIsosurfaceVisibilityAction,
  RemoveIsosurfaceAction,
  RefreshIsosurfaceAction,
  TriggerIsosurfaceDownloadAction,
} from "oxalis/model/actions/annotation_actions";
import {
  removeIsosurfaceAction,
  addAdHocIsosurfaceAction,
  addPrecomputedIsosurfaceAction,
  finishedLoadingIsosurfaceAction,
  startedLoadingIsosurfaceAction,
} from "oxalis/model/actions/annotation_actions";
import type { Saga } from "oxalis/model/sagas/effect-generators";
import { select } from "oxalis/model/sagas/effect-generators";
import { actionChannel, takeEvery, call, take, race, put } from "typed-redux-saga";
import { stlIsosurfaceConstants } from "oxalis/view/right-border-tabs/segments_tab/segments_view";
import {
  computeIsosurface,
  sendAnalyticsEvent,
  getMeshfileChunksForSegment,
  getMeshfileChunkData,
} from "admin/admin_rest_api";
import { getFlooredPosition } from "oxalis/model/accessors/flycam_accessor";
import { setImportingMeshStateAction } from "oxalis/model/actions/ui_actions";
import { zoomedAddressToAnotherZoomStepWithInfo } from "oxalis/model/helpers/position_converter";
import DataLayer from "oxalis/model/data_layer";
import Model from "oxalis/model";
import ThreeDMap from "libs/ThreeDMap";
import * as Utils from "libs/utils";
import exportToStl from "libs/stl_exporter";
import getSceneController from "oxalis/controller/scene_controller_provider";
import parseStlBuffer from "libs/parse_stl_buffer";
import window from "libs/window";
import { getActiveSegmentationTracing } from "oxalis/model/accessors/volumetracing_accessor";
import { saveNowAction } from "oxalis/model/actions/save_actions";
import Toast from "libs/toast";
import messages from "messages";
import processTaskWithPool from "libs/task_pool";
import { getBaseSegmentationName } from "oxalis/view/right-border-tabs/segments_tab/segments_view_helper";
const MAX_RETRY_COUNT = 5;
const RETRY_WAIT_TIME = 5000;
const PARALLEL_PRECOMPUTED_MESH_LOADING_COUNT = 6;

/*
 *
 * Ad Hoc Meshes
 *
 */
const isosurfacesMapByLayer: Record<string, Map<number, ThreeDMap<boolean>>> = {};
const cubeSize: Vector3 = [256, 256, 256];
const modifiedCells: Set<number> = new Set();
export function isIsosurfaceStl(buffer: ArrayBuffer): boolean {
  const dataView = new DataView(buffer);
  const isIsosurface = stlIsosurfaceConstants.isosurfaceMarker.every(
    (marker, index) => dataView.getUint8(index) === marker,
  );
  return isIsosurface;
}

function getOrAddMapForSegment(layerName: string, segmentId: number): ThreeDMap<boolean> {
  isosurfacesMapByLayer[layerName] = isosurfacesMapByLayer[layerName] || new Map();
  const isosurfacesMap = isosurfacesMapByLayer[layerName];
  const maybeMap = isosurfacesMap.get(segmentId);

  if (maybeMap == null) {
    const newMap = new ThreeDMap();
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'ThreeDMap<unknown>' is not assig... Remove this comment to see the full error message
    isosurfacesMap.set(segmentId, newMap);
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'ThreeDMap<unknown>' is not assignable to typ... Remove this comment to see the full error message
    return newMap;
  }

  return maybeMap;
}

function removeMapForSegment(layerName: string, segmentId: number): void {
  if (isosurfacesMapByLayer[layerName] == null) {
    return;
  }

  isosurfacesMapByLayer[layerName].delete(segmentId);
}

function getZoomedCubeSize(zoomStep: number, resolutionInfo: ResolutionInfo): Vector3 {
  const [x, y, z] = zoomedAddressToAnotherZoomStepWithInfo(
    [...cubeSize, zoomStep],
    resolutionInfo,
    0,
  );
  // Drop the last element of the Vector4;
  return [x, y, z];
}

function clipPositionToCubeBoundary(
  position: Vector3,
  zoomStep: number,
  resolutionInfo: ResolutionInfo,
): Vector3 {
  const zoomedCubeSize = getZoomedCubeSize(zoomStep, resolutionInfo);
  const currentCube = Utils.map3((el, idx) => Math.floor(el / zoomedCubeSize[idx]), position);
  const clippedPosition = Utils.map3((el, idx) => el * zoomedCubeSize[idx], currentCube);
  return clippedPosition;
}

// front_xy, front_xz, front_yz, back_xy, back_xz, back_yz
const NEIGHBOR_LOOKUP = [
  [0, 0, -1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
];

function getNeighborPosition(
  clippedPosition: Vector3,
  neighborId: number,
  zoomStep: number,
  resolutionInfo: ResolutionInfo,
): Vector3 {
  const zoomedCubeSize = getZoomedCubeSize(zoomStep, resolutionInfo);
  const neighborMultiplier = NEIGHBOR_LOOKUP[neighborId];
  const neighboringPosition = [
    clippedPosition[0] + neighborMultiplier[0] * zoomedCubeSize[0],
    clippedPosition[1] + neighborMultiplier[1] * zoomedCubeSize[1],
    clippedPosition[2] + neighborMultiplier[2] * zoomedCubeSize[2],
  ];
  // @ts-expect-error ts-migrate(2322) FIXME: Type 'number[]' is not assignable to type 'Vector3... Remove this comment to see the full error message
  return neighboringPosition;
}

// The calculation of an isosurface is spread across multiple requests.
// In order to avoid, that too many chunks are computed for one user interaction,
// we store the amount of requests in a batch per segment.
const batchCounterPerSegment: Record<number, number> = {};
const MAXIMUM_BATCH_SIZE = 50;

function* loadAdHocIsosurfaceFromAction(action: LoadAdHocMeshAction): Saga<void> {
  yield* call(
    loadAdHocIsosurface,
    action.seedPosition,
    action.cellId,
    false,
    action.layerName,
    action.mappingInfo,
  );
}

function* loadAdHocIsosurface(
  seedPosition: Vector3,
  cellId: number,
  removeExistingIsosurface: boolean = false,
  layerName?: string | null | undefined,
  maybeMappingInfo?: IsosurfaceMappingInfo,
): Saga<void> {
  const layer =
    layerName != null ? Model.getLayerByName(layerName) : Model.getVisibleSegmentationLayer();

  if (cellId === 0 || layer == null) {
    return;
  }

  const isosurfaceMappingInfo = yield* call(getIsosurfaceMappingInfo, layer.name, maybeMappingInfo);
  yield* call(
    loadIsosurfaceForSegmentId,
    cellId,
    seedPosition,
    isosurfaceMappingInfo,
    removeExistingIsosurface,
    layer,
  );
}

function* getIsosurfaceMappingInfo(
  layerName: string,
  maybeMappingInfo: IsosurfaceMappingInfo | null | undefined,
): Saga<IsosurfaceMappingInfo> {
  const activeMappingByLayer = yield* select(
    (state) => state.temporaryConfiguration.activeMappingByLayer,
  );
  if (maybeMappingInfo != null) return maybeMappingInfo;
  const mappingInfo = getMappingInfo(activeMappingByLayer, layerName);
  const isMappingActive = mappingInfo.mappingStatus === MappingStatusEnum.ENABLED;
  const mappingName = isMappingActive ? mappingInfo.mappingName : null;
  const mappingType = isMappingActive ? mappingInfo.mappingType : null;
  return {
    mappingName,
    mappingType,
  };
}

function* getInfoForIsosurfaceLoading(layer: DataLayer): Saga<{
  zoomStep: number;
  resolutionInfo: ResolutionInfo;
}> {
  const resolutionInfo = getResolutionInfo(layer.resolutions);
  const preferredZoomStep = yield* select(
    (state) => state.temporaryConfiguration.preferredQualityForMeshAdHocComputation,
  );
  const zoomStep = resolutionInfo.getClosestExistingIndex(preferredZoomStep);
  return {
    zoomStep,
    resolutionInfo,
  };
}

function* loadIsosurfaceForSegmentId(
  segmentId: number,
  seedPosition: Vector3,
  isosurfaceMappingInfo: IsosurfaceMappingInfo,
  removeExistingIsosurface: boolean,
  layer: DataLayer,
): Saga<void> {
  const { zoomStep, resolutionInfo } = yield* call(getInfoForIsosurfaceLoading, layer);
  batchCounterPerSegment[segmentId] = 0;
  // If a REMOVE_ISOSURFACE action is dispatched and consumed
  // here before loadIsosurfaceWithNeighbors is finished, the latter saga
  // should be canceled automatically to avoid populating mesh data even though
  // the mesh was removed. This is accomplished by redux-saga's race effect.
  yield* race({
    loadIsosurfaceWithNeighbors: call(
      loadIsosurfaceWithNeighbors,
      layer,
      segmentId,
      seedPosition,
      zoomStep,
      isosurfaceMappingInfo,
      resolutionInfo,
      removeExistingIsosurface,
    ),
    cancel: take(
      (action: Action) =>
        action.type === "REMOVE_ISOSURFACE" &&
        action.cellId === segmentId &&
        action.layerName === layer.name,
    ),
  });
}

function* loadIsosurfaceWithNeighbors(
  layer: DataLayer,
  segmentId: number,
  position: Vector3,
  zoomStep: number,
  isosurfaceMappingInfo: IsosurfaceMappingInfo,
  resolutionInfo: ResolutionInfo,
  removeExistingIsosurface: boolean,
): Saga<void> {
  let isInitialRequest = true;
  const { mappingName, mappingType } = isosurfaceMappingInfo;
  const clippedPosition = clipPositionToCubeBoundary(position, zoomStep, resolutionInfo);
  let positionsToRequest = [clippedPosition];
  const hasIsosurface = yield* select(
    (state) =>
      state.localSegmentationData[layer.name].isosurfaces != null &&
      state.localSegmentationData[layer.name].isosurfaces[segmentId] != null,
  );

  if (!hasIsosurface) {
    yield* put(addAdHocIsosurfaceAction(layer.name, segmentId, position, mappingName, mappingType));
  }

  yield* put(startedLoadingIsosurfaceAction(layer.name, segmentId));

  while (positionsToRequest.length > 0) {
    const currentPosition = positionsToRequest.shift();
    if (currentPosition == null) {
      throw new Error("Satisfy typescript");
    }

    const neighbors = yield* call(
      maybeLoadIsosurface,
      layer,
      segmentId,
      currentPosition,
      zoomStep,
      isosurfaceMappingInfo,
      resolutionInfo,
      isInitialRequest,
      removeExistingIsosurface && isInitialRequest,
    );
    isInitialRequest = false;
    positionsToRequest = positionsToRequest.concat(neighbors);
  }

  yield* put(finishedLoadingIsosurfaceAction(layer.name, segmentId));
}

function getAdHocMeshLoadingLimit(): number {
  // @ts-expect-error ts-migrate(2339) FIXME: Property '__isosurfaceMaxBatchSize' does not exist... Remove this comment to see the full error message
  return window.__isosurfaceMaxBatchSize || MAXIMUM_BATCH_SIZE;
}

function hasBatchCounterExceededLimit(segmentId: number): boolean {
  return batchCounterPerSegment[segmentId] > getAdHocMeshLoadingLimit();
}

function _warnAboutAdHocMeshLimit(segmentId: number) {
  const warning = "Reached ad-hoc mesh loading limit";
  console.warn(`${warning} for segment ${segmentId}`);
  // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'string' is not assignable to par... Remove this comment to see the full error message
  ErrorHandling.notify(warning, {
    segmentId,
    limit: getAdHocMeshLoadingLimit(),
  });
}

// Avoid warning about the same segment multiple times
const warnAboutAdHocMeshLimit = _.memoize(_warnAboutAdHocMeshLimit);

function* maybeLoadIsosurface(
  layer: DataLayer,
  segmentId: number,
  clippedPosition: Vector3,
  zoomStep: number,
  isosurfaceMappingInfo: IsosurfaceMappingInfo,
  resolutionInfo: ResolutionInfo,
  isInitialRequest: boolean,
  removeExistingIsosurface: boolean,
): Saga<Vector3[]> {
  const threeDMap = getOrAddMapForSegment(layer.name, segmentId);

  if (threeDMap.get(clippedPosition)) {
    return [];
  }

  if (hasBatchCounterExceededLimit(segmentId)) {
    warnAboutAdHocMeshLimit(segmentId);
    return [];
  }

  batchCounterPerSegment[segmentId]++;
  threeDMap.set(clippedPosition, true);
  // @ts-expect-error ts-migrate(2339) FIXME: Property '__isosurfaceSubsamplingStrides' does not... Remove this comment to see the full error message
  const subsamplingStrides = window.__isosurfaceSubsamplingStrides || [4, 4, 4];
  const scale = yield* select((state) => state.dataset.dataSource.scale);
  const dataStoreHost = yield* select((state) => state.dataset.dataStore.url);
  const owningOrganization = yield* select((state) => state.dataset.owningOrganization);
  const datasetName = yield* select((state) => state.dataset.name);
  const tracingStoreHost = yield* select((state) => state.tracing.tracingStore.url);
  const dataStoreUrl = `${dataStoreHost}/data/datasets/${owningOrganization}/${datasetName}/layers/${
    layer.fallbackLayer != null ? layer.fallbackLayer : layer.name
  }`;
  const tracingStoreUrl = `${tracingStoreHost}/tracings/volume/${layer.name}`;
  const volumeTracing = yield* select((state) => getActiveSegmentationTracing(state));
  // Fetch from datastore if no volumetracing exists or if the tracing has a fallback layer.
  const useDataStore = volumeTracing == null || volumeTracing.fallbackLayer != null;
  const mag = resolutionInfo.getResolutionByIndexOrThrow(zoomStep);

  if (isInitialRequest) {
    sendAnalyticsEvent("request_isosurface", {
      mode: useDataStore ? "view" : "annotation",
    });
  }

  let retryCount = 0;

  while (retryCount < MAX_RETRY_COUNT) {
    try {
      const { buffer: responseBuffer, neighbors } = yield* call(
        {
          context: null,
          fn: computeIsosurface,
        },
        useDataStore ? dataStoreUrl : tracingStoreUrl,
        {
          position: clippedPosition,
          mag,
          segmentId,
          subsamplingStrides,
          cubeSize,
          scale,
          ...isosurfaceMappingInfo,
        },
      );
      const vertices = new Float32Array(responseBuffer);

      if (removeExistingIsosurface) {
        getSceneController().removeIsosurfaceById(segmentId);
      }

      getSceneController().addIsosurfaceFromVertices(vertices, segmentId);
      return neighbors.map((neighbor) =>
        getNeighborPosition(clippedPosition, neighbor, zoomStep, resolutionInfo),
      );
    } catch (exception) {
      retryCount++;
      // @ts-ignore
      ErrorHandling.notify(exception);
      console.warn("Retrying mesh generation...");
      yield* call(sleep, RETRY_WAIT_TIME * 2 ** retryCount);
    }
  }

  return [];
}

function* markEditedCellAsDirty(): Saga<void> {
  const volumeTracing = yield* select((state) => getActiveSegmentationTracing(state));

  if (volumeTracing != null && volumeTracing.fallbackLayer == null) {
    const activeCellId = volumeTracing.activeCellId;
    modifiedCells.add(activeCellId);
  }
}

function* refreshIsosurfaces(): Saga<void> {
  yield* put(saveNowAction());
  // We reload all cells that got modified till the start of reloading.
  // By that we avoid to remove cells that got annotated during reloading from the modifiedCells set.
  const currentlyModifiedCells = new Set(modifiedCells);
  modifiedCells.clear();
  const segmentationLayer = Model.getVisibleSegmentationLayer();

  if (!segmentationLayer) {
    return;
  }

  isosurfacesMapByLayer[segmentationLayer.name] =
    isosurfacesMapByLayer[segmentationLayer.name] || new Map();
  const isosurfacesMapForLayer = isosurfacesMapByLayer[segmentationLayer.name];

  for (const [cellId, threeDMap] of Array.from(isosurfacesMapForLayer.entries())) {
    if (!currentlyModifiedCells.has(cellId)) {
      continue;
    }

    yield* call(_refreshIsosurfaceWithMap, cellId, threeDMap, segmentationLayer.name);
  }
}

function* refreshIsosurface(action: RefreshIsosurfaceAction): Saga<void> {
  const { cellId, layerName } = action;
  const threeDMap = isosurfacesMapByLayer[action.layerName].get(cellId);
  if (threeDMap == null) return;
  yield* call(_refreshIsosurfaceWithMap, cellId, threeDMap, layerName);
}

function* _refreshIsosurfaceWithMap(
  cellId: number,
  threeDMap: ThreeDMap<boolean>,
  layerName: string,
): Saga<void> {
  const isosurfaceInfo = yield* select(
    (state) => state.localSegmentationData[layerName].isosurfaces[cellId],
  );
  yield* call(
    [ErrorHandling, ErrorHandling.assert],
    !isosurfaceInfo.isPrecomputed,
    "_refreshIsosurfaceWithMap was called for a precomputed isosurface.",
  );
  if (isosurfaceInfo.isPrecomputed) return;
  const { mappingName, mappingType } = isosurfaceInfo;
  const isosurfacePositions = threeDMap.entries().filter(([value, _position]) => value);

  if (isosurfacePositions.length === 0) {
    return;
  }

  yield* put(startedLoadingIsosurfaceAction(layerName, cellId));
  // Remove isosurface from cache.
  yield* call(removeIsosurface, removeIsosurfaceAction(layerName, cellId), false);
  // The isosurface should only be removed once after re-fetching the isosurface first position.
  let shouldBeRemoved = true;

  for (const [, position] of isosurfacePositions) {
    // Reload the isosurface at the given position if it isn't already loaded there.
    // This is done to ensure that every voxel of the isosurface is reloaded.
    yield* call(loadAdHocIsosurface, position, cellId, shouldBeRemoved, layerName, {
      mappingName,
      mappingType,
    });
    shouldBeRemoved = false;
  }

  yield* put(finishedLoadingIsosurfaceAction(layerName, cellId));
}

/*
 *
 * Precomputed Meshes
 *
 */
function* loadPrecomputedMesh(action: LoadPrecomputedMeshAction) {
  const { cellId, seedPosition, meshFileName, layerName } = action;
  const layer = yield* select((state) =>
    layerName != null
      ? getSegmentationLayerByName(state.dataset, layerName)
      : getVisibleSegmentationLayer(state),
  );
  if (layer == null) return;
  // If a REMOVE_ISOSURFACE action is dispatched and consumed
  // here before loadPrecomputedMeshForSegmentId is finished, the latter saga
  // should be canceled automatically to avoid populating mesh data even though
  // the mesh was removed. This is accomplished by redux-saga's race effect.
  yield* race({
    loadPrecomputedMeshForSegmentId: call(
      loadPrecomputedMeshForSegmentId,
      cellId,
      seedPosition,
      meshFileName,
      layer,
    ),
    cancel: take(
      // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'otherAction' implicitly has an 'any' ty... Remove this comment to see the full error message
      (otherAction) =>
        otherAction.type === "REMOVE_ISOSURFACE" &&
        otherAction.cellId === cellId &&
        otherAction.layerName === layer.name,
    ),
  });
}

function* loadPrecomputedMeshForSegmentId(
  id: number,
  seedPosition: Vector3,
  meshFileName: string,
  segmentationLayer: APIDataLayer,
): Saga<void> {
  const layerName = segmentationLayer.name;
  yield* put(addPrecomputedIsosurfaceAction(layerName, id, seedPosition, meshFileName));
  yield* put(startedLoadingIsosurfaceAction(layerName, id));
  const dataset = yield* select((state) => state.dataset);
  let availableChunks = null;

  try {
    availableChunks = yield* call(
      getMeshfileChunksForSegment,
      dataset.dataStore.url,
      dataset,
      getBaseSegmentationName(segmentationLayer),
      meshFileName,
      id,
    );
  } catch (exception) {
    console.warn("Mesh chunk couldn't be loaded due to", exception);
    Toast.warning(messages["tracing.mesh_listing_failed"]);
    yield* put(finishedLoadingIsosurfaceAction(layerName, id));
    yield* put(removeIsosurfaceAction(layerName, id));
    return;
  }

  // Sort the chunks by distance to the seedPosition, so that the mesh loads from the inside out
  const sortedAvailableChunks = _.sortBy(availableChunks, (chunkPosition) =>
    V3.length(V3.sub(seedPosition, chunkPosition)),
  );

  const tasks = sortedAvailableChunks.map(
    (chunkPosition) =>
      function* loadChunk() {
        const stlData = yield* call(
          getMeshfileChunkData,
          dataset.dataStore.url,
          dataset,
          getBaseSegmentationName(segmentationLayer),
          meshFileName,
          id,
          chunkPosition,
        );
        const geometry = yield* call(parseStlBuffer, stlData);
        const sceneController = yield* call(getSceneController);
        yield* call(
          { context: sceneController, fn: sceneController.addIsosurfaceFromGeometry },
          geometry,
          id,
        );
      },
  );

  try {
    yield* call(processTaskWithPool, tasks, PARALLEL_PRECOMPUTED_MESH_LOADING_COUNT);
  } catch (exception) {
    console.error(exception);
    Toast.warning("Some mesh objects could not be loaded.");
  }

  yield* put(finishedLoadingIsosurfaceAction(layerName, id));
}

/*
 *
 * Ad Hoc and Precomputed Meshes
 *
 */
function* downloadIsosurfaceCellById(cellName: string, cellId: number): Saga<void> {
  const sceneController = getSceneController();
  const geometry = sceneController.getIsosurfaceGeometry(cellId);

  if (geometry == null) {
    const errorMessage = messages["tracing.not_isosurface_available_to_download"];
    Toast.error(errorMessage, {
      sticky: false,
    });
    return;
  }

  const stl = exportToStl(geometry);
  // Encode isosurface and cell id property
  const { isosurfaceMarker, cellIdIndex } = stlIsosurfaceConstants;
  isosurfaceMarker.forEach((marker, index) => {
    stl.setUint8(index, marker);
  });
  stl.setUint32(cellIdIndex, cellId, true);
  const blob = new Blob([stl]);
  yield* call(saveAs, blob, `${cellName}-${cellId}.stl`);
}

function* downloadIsosurfaceCell(action: TriggerIsosurfaceDownloadAction): Saga<void> {
  yield* call(downloadIsosurfaceCellById, action.cellName, action.cellId);
}

function* importIsosurfaceFromStl(action: ImportIsosurfaceFromStlAction): Saga<void> {
  const { layerName, buffer } = action;
  const dataView = new DataView(buffer);
  const segmentId = dataView.getUint32(stlIsosurfaceConstants.cellIdIndex, true);
  const geometry = yield* call(parseStlBuffer, buffer);
  getSceneController().addIsosurfaceFromGeometry(geometry, segmentId);
  yield* put(setImportingMeshStateAction(false));
  // TODO: Ideally, persist the seed position in the STL file. As a workaround,
  // we simply use the current position as a seed position.
  const seedPosition = yield* select((state) => getFlooredPosition(state.flycam));
  // TODO: This code is not used currently and it will not be possible to share these
  // isosurfaces via link.
  // The mesh file the isosurface was computed from is not known.
  yield* put(addPrecomputedIsosurfaceAction(layerName, segmentId, seedPosition, "unknown"));
}

function removeIsosurface(action: RemoveIsosurfaceAction, removeFromScene: boolean = true): void {
  const { layerName, cellId } = action;

  if (removeFromScene) {
    getSceneController().removeIsosurfaceById(cellId);
  }

  removeMapForSegment(layerName, cellId);
}

function* handleIsosurfaceVisibilityChange(action: UpdateIsosurfaceVisibilityAction): Saga<void> {
  const { id, visibility } = action;
  const SceneController = yield* call(getSceneController);
  SceneController.setIsosurfaceVisibility(id, visibility);
}

export default function* isosurfaceSaga(): Saga<void> {
  // Buffer actions since they might be dispatched before WK_READY
  const loadAdHocMeshActionChannel = yield* actionChannel("LOAD_AD_HOC_MESH_ACTION");
  const loadPrecomputedMeshActionChannel = yield* actionChannel("LOAD_PRECOMPUTED_MESH_ACTION");
  yield* take("WK_READY");
  yield* takeEvery(loadAdHocMeshActionChannel, loadAdHocIsosurfaceFromAction);
  yield* takeEvery(loadPrecomputedMeshActionChannel, loadPrecomputedMesh);
  yield* takeEvery("TRIGGER_ISOSURFACE_DOWNLOAD", downloadIsosurfaceCell);
  yield* takeEvery("IMPORT_ISOSURFACE_FROM_STL", importIsosurfaceFromStl);
  yield* takeEvery("REMOVE_ISOSURFACE", removeIsosurface);
  yield* takeEvery("REFRESH_ISOSURFACES", refreshIsosurfaces);
  yield* takeEvery("REFRESH_ISOSURFACE", refreshIsosurface);
  yield* takeEvery("UPDATE_ISOSURFACE_VISIBILITY", handleIsosurfaceVisibilityChange);
  yield* takeEvery(["START_EDITING", "COPY_SEGMENTATION_LAYER"], markEditedCellAsDirty);
}