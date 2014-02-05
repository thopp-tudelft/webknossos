package braingames.binary

import braingames.binary.models.{DataSource, DataLayer, DataLayerSection}
import braingames.geometry.Point3D

trait DataStoreBlock {
  def dataSource: DataSource
  def dataLayer: DataLayer
  def dataLayerSection: DataLayerSection
  def resolution: Int
  def block: Point3D }


case class LoadBlock(
  dataSource: DataSource,
  dataLayer: DataLayer,
  dataLayerSection: DataLayerSection,
  resolution: Int,
  block: Point3D) extends DataStoreBlock

case class SaveBlock(
  dataSource: DataSource,
  dataLayer: DataLayer,
  dataLayerSection: DataLayerSection,
  resolution: Int,
  block: Point3D,
  data: Array[Byte]) extends DataStoreBlock