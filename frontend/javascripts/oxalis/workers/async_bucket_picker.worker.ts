import PriorityQueue from "js-priority-queue";
import type { Area } from "oxalis/model/accessors/flycam_accessor";
import type { LoadingStrategy } from "oxalis/store";
import { Matrix4x4 } from "libs/mjs";
import type { OrthoViewMap, Vector3, Vector4, ViewMode } from "oxalis/constants";
import constants from "oxalis/constants";
import determineBucketsForFlight from "oxalis/model/bucket_data_handling/bucket_picker_strategies/flight_bucket_picker";
import determineBucketsForOblique from "oxalis/model/bucket_data_handling/bucket_picker_strategies/oblique_bucket_picker";
import determineBucketsForOrthogonal from "oxalis/model/bucket_data_handling/bucket_picker_strategies/orthogonal_bucket_picker";
import { expose } from "./comlink_wrapper";

type PriorityItem = {
  bucketAddress: Vector4;
  priority: number;
};

const comparator = (b: PriorityItem, a: PriorityItem) => b.priority - a.priority;

function dequeueToArrayBuffer(bucketQueue: PriorityQueue<PriorityItem>): ArrayBuffer {
  const itemCount = bucketQueue.length;
  const intsPerItem = 5; // [x, y, z, zoomStep, priority]

  const bytesPerInt = 4; // Since we use uint32

  const buffer = new ArrayBuffer(itemCount * intsPerItem * bytesPerInt);
  const bucketsWithPriorities = new Uint32Array(buffer);
  let currentElementIndex = 0;

  while (bucketQueue.length > 0) {
    const { bucketAddress, priority } = bucketQueue.dequeue();
    const currentBufferIndex = currentElementIndex * intsPerItem;
    bucketsWithPriorities[currentBufferIndex] = bucketAddress[0];
    bucketsWithPriorities[currentBufferIndex + 1] = bucketAddress[1];
    bucketsWithPriorities[currentBufferIndex + 2] = bucketAddress[2];
    bucketsWithPriorities[currentBufferIndex + 3] = bucketAddress[3];
    bucketsWithPriorities[currentBufferIndex + 4] = priority;
    currentElementIndex++;
  }

  return buffer;
}

function pick(
  viewMode: ViewMode,
  resolutions: Array<Vector3>,
  position: Vector3,
  sphericalCapRadius: number,
  matrix: Matrix4x4,
  logZoomStep: number,
  loadingStrategy: LoadingStrategy,
  anchorPoint: Vector4,
  areas: OrthoViewMap<Area>,
  subBucketLocality: Vector3,
  gpuFactor: number,
): ArrayBuffer {
  const bucketQueue = new PriorityQueue({
    // small priorities take precedence
    comparator,
  });

  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'bucketAddress' implicitly has an 'any' ... Remove this comment to see the full error message
  const enqueueFunction = (bucketAddress, priority) => {
    bucketQueue.queue({
      bucketAddress,
      priority,
    });
  };

  if (viewMode === constants.MODE_ARBITRARY_PLANE) {
    determineBucketsForOblique(resolutions, position, enqueueFunction, matrix, logZoomStep);
  } else if (viewMode === constants.MODE_ARBITRARY) {
    determineBucketsForFlight(
      resolutions,
      position,
      sphericalCapRadius,
      enqueueFunction,
      matrix,
      logZoomStep,
    );
  } else {
    determineBucketsForOrthogonal(
      resolutions,
      enqueueFunction,
      loadingStrategy,
      logZoomStep,
      anchorPoint,
      areas,
      subBucketLocality,
      null,
      gpuFactor,
    );
  }

  return dequeueToArrayBuffer(bucketQueue);
}

export default expose(pick);
