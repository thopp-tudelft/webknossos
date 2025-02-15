package models.binary.explore
import com.scalableminds.util.geometry.{BoundingBox, Vec3Double, Vec3Int}
import com.scalableminds.util.tools.Fox
import com.scalableminds.webknossos.datastore.dataformats.MagLocator
import com.scalableminds.webknossos.datastore.dataformats.precomputed.{
  PrecomputedDataLayer,
  PrecomputedLayer,
  PrecomputedSegmentationLayer
}
import com.scalableminds.webknossos.datastore.datareaders.AxisOrder
import com.scalableminds.webknossos.datastore.datareaders.precomputed.{PrecomputedHeader, PrecomputedScale}
import com.scalableminds.webknossos.datastore.models.datasource.{Category, ElementClass}

import java.nio.file.Path
import scala.concurrent.ExecutionContext.Implicits.global

class PrecomputedExplorer extends RemoteLayerExplorer {
  override def name: String = "Neuroglancer Precomputed"

  override def explore(remotePath: Path, credentialId: Option[String]): Fox[List[(PrecomputedLayer, Vec3Double)]] =
    for {
      infoPath <- Fox.successful(remotePath.resolve(PrecomputedHeader.FILENAME_INFO))
      precomputedHeader <- parseJsonFromPath[PrecomputedHeader](infoPath) ?~> s"Failed to read neuroglancer precomputed metadata at $infoPath"
      layerAndVoxelSize <- layerFromPrecomputedHeader(precomputedHeader, remotePath, credentialId)
    } yield List(layerAndVoxelSize)

  private def layerFromPrecomputedHeader(precomputedHeader: PrecomputedHeader,
                                         remotePath: Path,
                                         credentialId: Option[String]): Fox[(PrecomputedLayer, Vec3Double)] =
    for {
      name <- guessNameFromPath(remotePath)
      firstScale <- precomputedHeader.scales.headOption.toFox
      _ <- bool2Fox(firstScale.sharding.isEmpty) ?~> "Failed to read dataset: sharding not supported"
      boundingBox <- BoundingBox.fromSizeArray(firstScale.size).toFox
      elementClass: ElementClass.Value <- elementClassFromPrecomputedDataType(precomputedHeader.data_type) ?~> "Unknown data type"
      smallestResolution = firstScale.resolution
      voxelSize <- Vec3Int.fromArray(smallestResolution).toFox
      mags: List[MagLocator] <- Fox.serialCombined(precomputedHeader.scales)(
        getMagFromScale(_, smallestResolution, remotePath, credentialId))
      layer = if (precomputedHeader.describesSegmentationLayer) {
        PrecomputedSegmentationLayer(name, boundingBox, elementClass, mags, None)
      } else PrecomputedDataLayer(name, boundingBox, Category.color, elementClass, mags)
    } yield (layer, Vec3Double.fromVec3Int(voxelSize))

  private def elementClassFromPrecomputedDataType(precomputedDataType: String): Fox[ElementClass.Value] =
    precomputedDataType.toLowerCase match {
      case "uint8"   => Some(ElementClass.uint8)
      case "uint16"  => Some(ElementClass.uint16)
      case "uint32"  => Some(ElementClass.uint32)
      case "uint64"  => Some(ElementClass.uint64)
      case "float32" => Some(ElementClass.float)
      case _         => None
    }

  private def getMagFromScale(scale: PrecomputedScale,
                              minimalResolution: Array[Int],
                              remotePath: Path,
                              credentialId: Option[String]): Fox[MagLocator] = {
    val normalizedResolution = (scale.resolution, minimalResolution).zipped.map((r, m) => r / m)
    for {
      mag <- Vec3Int.fromList(normalizedResolution.toList)
      path = remotePath.resolve(scale.key)

      // Neuroglancer precomputed specification does not specify axis order, but uses x,y,z implicitly.
      // https://github.com/google/neuroglancer/blob/master/src/neuroglancer/datasource/precomputed/volume.md#unsharded-chunk-storage
      axisOrder = AxisOrder(0, 1, 2)
    } yield MagLocator(mag, Some(path.toUri.toString), None, Some(axisOrder), channelIndex = None, credentialId)
  }
}
