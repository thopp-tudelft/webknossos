// This file is only for documentation:
// Types which were used for creating the datasource.schema.js
// The `flow2schema` node module has been used for conversion.
// Please note that some manual changes to the schema are required.
type Vector3 = [number, number, number];
type BoundingBox = {
  topLeft: Vector3;
  width: number;
  height: number;
  depth: number;
};
type DataLayerWKWPartial = {
  dataFormat: "wkw";
  boundingBox: BoundingBox;
  wkwResolutions: Array<{
    resolution: number | Vector3;
    cubeLength: number;
  }>;
};
type DataLayerKnossosPartial = {
  dataFormat: "knossos";
  sections: Array<{
    name: string;
    resolutions: Array<number>;
    boundingBox: BoundingBox;
  }>;
};
export type DataLayer = {
  name: string;
  category: "color" | "segmentation";
  elementClass:
    | "uint8"
    | "uint16"
    | "uint24"
    | "uint32"
    | "uint64"
    | "float"
    | "double"
    | "int8"
    | "int16"
    | "int32"
    | "int64";
} & (
  | {
      category: "color";
    }
  | {
      category: "segmentation";
      // Add minimum=1
      largestSegmentId: number;
      mappings: Array<string>;
    }
) &
  (DataLayerWKWPartial | DataLayerKnossosPartial);
export type DatasourceConfiguration = {
  id: {
    name: string;
    team: string;
  };
  dataLayers: Array<DataLayer>;
  scale: Vector3;
};
