package com.scalableminds.webknossos.datastore.models

import com.scalableminds.util.geometry.{BoundingBox, Vec3Double, Vec3Int}
import com.scalableminds.webknossos.datastore.models.datasource.DataSetViewConfiguration.DataSetViewConfiguration
import com.scalableminds.webknossos.datastore.models.datasource.inbox.GenericInboxDataSource
import play.api.libs.json._

import scala.annotation.nowarn

package object datasource {

  case class DataSourceId(name: String, team: String) // here team is not (yet) renamed to organization to avoid migrating all jsons

  object DataSourceId {
    implicit val dataSourceIdFormat: Format[DataSourceId] = Json.format[DataSourceId]
  }

  object DataSetViewConfiguration {
    type DataSetViewConfiguration = Map[String, JsValue]
    implicit val dataSetViewConfigurationFormat: Format[DataSetViewConfiguration] = Format.of[DataSetViewConfiguration]
  }

  case class GenericDataSource[+T <: DataLayerLike](id: DataSourceId,
                                                    dataLayers: List[T],
                                                    scale: Vec3Double,
                                                    defaultViewConfiguration: Option[DataSetViewConfiguration] = None)
      extends GenericInboxDataSource[T] {

    val toUsable: Option[GenericDataSource[T]] = Some(this)

    val scaleOpt: Option[Vec3Double] = Some(scale)

    val statusOpt: Option[String] = None

    def getDataLayer(name: String): Option[T] =
      dataLayers.find(_.name == name)

    val center: Vec3Int = boundingBox.center

    lazy val boundingBox: BoundingBox =
      BoundingBox.union(dataLayers.map(_.boundingBox))

    def segmentationLayers: List[SegmentationLayer] = dataLayers.flatMap {
      case layer: SegmentationLayer => Some(layer)
      case _                        => None
    }
  }

  object GenericDataSource {
    @nowarn // Suppress unused warning. The passed Format[T] is expanded to more than what is really used. It can not be omitted, though.
    implicit def dataSourceFormat[T <: DataLayerLike](implicit fmt: Format[T]): Format[GenericDataSource[T]] =
      Json.format[GenericDataSource[T]]
  }

  type DataSource = GenericDataSource[DataLayer]
  type DataSourceLike = GenericDataSource[DataLayerLike]
}
