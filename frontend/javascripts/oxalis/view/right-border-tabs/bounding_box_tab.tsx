import { Button, Tooltip } from "antd";
import { PlusSquareOutlined } from "@ant-design/icons";
import { useSelector, useDispatch } from "react-redux";
import React, { useState } from "react";
import _ from "lodash";
import { UserBoundingBoxInput } from "oxalis/view/components/setting_input_views";
import { Vector3, Vector6, BoundingBoxType, ControlModeEnum } from "oxalis/constants";
import {
  changeUserBoundingBoxAction,
  addUserBoundingBoxAction,
  deleteUserBoundingBoxAction,
} from "oxalis/model/actions/annotation_actions";
import { StartGlobalizeFloodfillsModal } from "oxalis/view/right-border-tabs/starting_job_modals";
import { getActiveSegmentationTracingLayer } from "oxalis/model/accessors/volumetracing_accessor";
import { getSomeTracing } from "oxalis/model/accessors/tracing_accessor";
import { setPositionAction } from "oxalis/model/actions/flycam_actions";
import ExportBoundingBoxModal from "oxalis/view/right-border-tabs/export_bounding_box_modal";
import * as Utils from "libs/utils";
import features from "features";
import { OxalisState, UserBoundingBox } from "oxalis/store";
import { APISegmentationLayer, APIUser } from "types/api_flow_types";

// NOTE: The regexp and getBBoxNameForPartialFloodfill need to stay in sync.
// That way, bboxes created by the floodfill can be detected as such and
// a job for globalizing floodfills can be started.
const GLOBALIZE_FLOODFILL_REGEX =
  /Limits of flood-fill \(source_id=(\d+), target_id=(\d+), seed=([\d,]+), timestamp=(\d+)\)/;
export function getBBoxNameForPartialFloodfill(
  oldSegmentIdAtSeed: number,
  activeCellId: number,
  seedPosition: Vector3,
) {
  return `Limits of flood-fill (source_id=${oldSegmentIdAtSeed}, target_id=${activeCellId}, seed=${seedPosition.join(
    ",",
  )}, timestamp=${new Date().getTime()})`;
}

export default function BoundingBoxTab() {
  const [selectedBoundingBoxForExport, setSelectedBoundingBoxForExport] =
    useState<UserBoundingBox | null>(null);
  const [isGlobalizeFloodfillsModalVisible, setIsGlobalizeFloodfillsModalVisible] = useState(false);
  const tracing = useSelector((state: OxalisState) => state.tracing);
  const allowUpdate = tracing.restrictions.allowUpdate;
  const dataset = useSelector((state: OxalisState) => state.dataset);
  const activeUser = useSelector((state: OxalisState) => state.activeUser);
  const activeSegmentationTracingLayer = useSelector(getActiveSegmentationTracingLayer);
  const { userBoundingBoxes } = getSomeTracing(tracing);
  const dispatch = useDispatch();

  const setChangeBoundingBoxBounds = (id: number, boundingBox: BoundingBoxType) =>
    dispatch(
      changeUserBoundingBoxAction(id, {
        boundingBox,
      }),
    );

  const addNewBoundingBox = () => dispatch(addUserBoundingBoxAction());

  const setPosition = (position: Vector3) => dispatch(setPositionAction(position));

  const deleteBoundingBox = (id: number) => dispatch(deleteUserBoundingBoxAction(id));

  const setBoundingBoxVisibility = (id: number, isVisible: boolean) =>
    dispatch(
      changeUserBoundingBoxAction(id, {
        isVisible,
      }),
    );

  const setBoundingBoxName = (id: number, name: string) =>
    dispatch(
      changeUserBoundingBoxAction(id, {
        name,
      }),
    );

  const setBoundingBoxColor = (id: number, color: Vector3) =>
    dispatch(
      changeUserBoundingBoxAction(id, {
        color,
      }),
    );

  function handleBoundingBoxBoundingChange(id: number, boundingBox: Vector6) {
    setChangeBoundingBoxBounds(id, Utils.computeBoundingBoxFromArray(boundingBox));
  }

  function handleGoToBoundingBox(id: number) {
    const boundingBoxEntry = userBoundingBoxes.find((bbox) => bbox.id === id);

    if (!boundingBoxEntry) {
      return;
    }

    const { min, max } = boundingBoxEntry.boundingBox;
    const center: Vector3 = [
      min[0] + (max[0] - min[0]) / 2,
      min[1] + (max[1] - min[1]) / 2,
      min[2] + (max[2] - min[2]) / 2,
    ];
    setPosition(center);
  }

  const globalizeFloodfillsButtonDisabledReason = getInfoForGlobalizeFloodfill(
    userBoundingBoxes,
    activeSegmentationTracingLayer,
    activeUser,
  );

  const isViewMode = useSelector(
    (state: OxalisState) => state.temporaryConfiguration.controlMode === ControlModeEnum.VIEW,
  );

  let maybeUneditableExplanation;
  if (isViewMode) {
    maybeUneditableExplanation = "Please create a new annotation to add custom bounding boxes.";
  } else if (!allowUpdate) {
    maybeUneditableExplanation =
      "Copy this annotation to your account to adapt the bounding boxes.";
  }

  return (
    <div
      className="padded-tab-content"
      style={{
        minWidth: 300,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Tooltip title={globalizeFloodfillsButtonDisabledReason.title}>
          <Button
            size="small"
            style={{
              marginBottom: 8,
            }}
            disabled={globalizeFloodfillsButtonDisabledReason.disabled}
            onClick={() => setIsGlobalizeFloodfillsModalVisible(true)}
          >
            <i className="fas fa-fill-drip" />
            Globalize Flood-Fills
          </Button>
        </Tooltip>
      </div>

      {/* In view mode, it's okay to render an empty list, since there will be
          an explanation below, anyway.
      */}
      {userBoundingBoxes.length > 0 || isViewMode ? (
        userBoundingBoxes.map((bb) => (
          <UserBoundingBoxInput
            key={bb.id}
            tooltipTitle="Format: minX, minY, minZ, width, height, depth"
            value={Utils.computeArrayFromBoundingBox(bb.boundingBox)}
            color={bb.color}
            name={bb.name}
            isExportEnabled={dataset.jobsEnabled}
            isVisible={bb.isVisible}
            onBoundingChange={_.partial(handleBoundingBoxBoundingChange, bb.id)}
            onDelete={_.partial(deleteBoundingBox, bb.id)}
            onExport={
              dataset.jobsEnabled ? _.partial(setSelectedBoundingBoxForExport, bb) : () => {}
            }
            onGoToBoundingBox={_.partial(handleGoToBoundingBox, bb.id)}
            onVisibilityChange={_.partial(setBoundingBoxVisibility, bb.id)}
            onNameChange={_.partial(setBoundingBoxName, bb.id)}
            onColorChange={_.partial(setBoundingBoxColor, bb.id)}
            allowUpdate={allowUpdate}
          />
        ))
      ) : (
        <div>No Bounding Boxes created yet.</div>
      )}
      <div style={{ color: "rgba(0,0,0,0.25)" }}>{maybeUneditableExplanation}</div>
      {allowUpdate ? (
        <div style={{ display: "inline-block", width: "100%", textAlign: "center" }}>
          <Tooltip title="Click to add another bounding box.">
            <PlusSquareOutlined
              onClick={addNewBoundingBox}
              style={{
                cursor: "pointer",
                marginBottom: userBoundingBoxes.length === 0 ? 12 : 0,
              }}
            />
          </Tooltip>
        </div>
      ) : null}
      {selectedBoundingBoxForExport != null ? (
        <ExportBoundingBoxModal
          dataset={dataset}
          tracing={tracing}
          boundingBox={selectedBoundingBoxForExport.boundingBox}
          handleClose={() => setSelectedBoundingBoxForExport(null)}
        />
      ) : null}
      {isGlobalizeFloodfillsModalVisible ? (
        <StartGlobalizeFloodfillsModal
          handleClose={() => setIsGlobalizeFloodfillsModalVisible(false)}
        />
      ) : null}
    </div>
  );
}

function getInfoForGlobalizeFloodfill(
  userBoundingBoxes: UserBoundingBox[],
  activeSegmentationTracingLayer: APISegmentationLayer | null | undefined,
  activeUser: APIUser | null | undefined,
) {
  if (!userBoundingBoxes.some((bbox) => bbox.name.match(GLOBALIZE_FLOODFILL_REGEX) != null)) {
    return { disabled: true, title: "No partial floodfills to globalize." };
  }
  if (activeSegmentationTracingLayer == null) {
    return {
      disabled: true,
      title:
        "Partial floodfills can only be globalized when a segmentation annotation layer exists.",
    };
  }
  if (activeUser == null) {
    return {
      disabled: true,
      title: "Partial floodfills can only be globalized as a registered user.",
    };
  }
  if (!features().jobsEnabled) {
    return {
      disabled: true,
      title: "Partial floodfills can only be globalized when a WEBKNOSSOS worker was set up.",
    };
  }

  return {
    disabled: false,
    title:
      "For this annotation some floodfill operations have not run to completion, because they covered a too large volume. WEBKNOSSOS can finish these operations via a long-running job.",
  };
}
