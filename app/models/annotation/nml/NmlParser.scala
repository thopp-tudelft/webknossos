package models.annotation.nml

import com.scalableminds.util.geometry.{BoundingBox, Vec3Double, Vec3Int}
import com.scalableminds.util.tools.ExtendedTypes.{ExtendedDouble, ExtendedString}
import com.scalableminds.webknossos.datastore.SkeletonTracing._
import com.scalableminds.webknossos.datastore.VolumeTracing.{Segment, VolumeTracing}
import com.scalableminds.webknossos.datastore.geometry.{ColorProto, NamedBoundingBoxProto, Vec3IntProto}
import com.scalableminds.webknossos.datastore.helpers.{NodeDefaults, ProtoGeometryImplicits, SkeletonTracingDefaults}
import com.scalableminds.webknossos.datastore.models.datasource.ElementClass
import com.scalableminds.webknossos.tracingstore.tracings.ColorGenerator
import com.scalableminds.webknossos.tracingstore.tracings.skeleton.{MultiComponentTreeSplitter, TreeValidator}
import com.typesafe.scalalogging.LazyLogging
import models.annotation.UploadedVolumeLayer
import net.liftweb.common.Box._
import net.liftweb.common.{Box, Empty, Failure}
import play.api.i18n.{Messages, MessagesProvider}

import java.io.InputStream
import scala.collection.{immutable, mutable}
import scala.xml.{NodeSeq, XML, Node => XMLNode}

object NmlParser extends LazyLogging with ProtoGeometryImplicits with ColorGenerator {

  private val DEFAULT_TIME = 0L
  private val DEFAULT_VIEWPORT = 0
  private val DEFAULT_RESOLUTION = 0
  private val DEFAULT_BITDEPTH = 0
  private val DEFAULT_DESCRIPTION = ""
  private val DEFAULT_INTERPOLATION = false
  private val DEFAULT_TIMESTAMP = 0L

  def parse(name: String,
            nmlInputStream: InputStream,
            overwritingDataSetName: Option[String],
            isTaskUpload: Boolean,
            basePath: Option[String] = None)(
      implicit m: MessagesProvider): Box[(Option[SkeletonTracing], List[UploadedVolumeLayer], String)] =
    try {
      val data = XML.load(nmlInputStream)
      for {
        parameters <- (data \ "parameters").headOption ?~ Messages("nml.parameters.notFound")
        timestamp = parseTime(parameters \ "time")
        comments <- parseComments(data \ "comments")
        branchPoints <- parseBranchPoints(data \ "branchpoints", timestamp)
        trees <- parseTrees(data \ "thing", buildBranchPointMap(branchPoints), buildCommentMap(comments))
        treeGroups <- extractTreeGroups(data \ "groups")
        volumes = extractVolumes(data \ "volume")
        treesAndGroupsAfterSplitting = MultiComponentTreeSplitter.splitMulticomponentTrees(trees, treeGroups)
        treesSplit = treesAndGroupsAfterSplitting._1
        treeGroupsAfterSplit = treesAndGroupsAfterSplitting._2
        _ <- TreeValidator.validateTrees(treesSplit, treeGroupsAfterSplit, branchPoints, comments)
      } yield {
        val dataSetName = overwritingDataSetName.getOrElse(parseDataSetName(parameters \ "experiment"))
        val description = parseDescription(parameters \ "experiment")
        val organizationName =
          if (overwritingDataSetName.isDefined) None else parseOrganizationName(parameters \ "experiment")
        val activeNodeId = parseActiveNode(parameters \ "activeNode")
        val editPosition =
          parseEditPosition(parameters \ "editPosition").getOrElse(SkeletonTracingDefaults.editPosition)
        val editRotation =
          parseEditRotation(parameters \ "editRotation").getOrElse(SkeletonTracingDefaults.editRotation)
        val zoomLevel = parseZoomLevel(parameters \ "zoomLevel").getOrElse(SkeletonTracingDefaults.zoomLevel)
        var userBoundingBoxes = parseBoundingBoxes(parameters \ "userBoundingBox")
        var taskBoundingBox: Option[BoundingBox] = None
        parseTaskBoundingBox(parameters \ "taskBoundingBox", isTaskUpload, userBoundingBoxes).foreach {
          case Left(value)  => taskBoundingBox = Some(value)
          case Right(value) => userBoundingBoxes = userBoundingBoxes :+ value
        }

        logger.debug(s"Parsed NML file. Trees: ${treesSplit.size}, Volumes: ${volumes.size}")

        val volumeLayers: List[UploadedVolumeLayer] =
          volumes.toList.map { v =>
            UploadedVolumeLayer(
              VolumeTracing(
                None,
                boundingBoxToProto(taskBoundingBox.getOrElse(BoundingBox.empty)),
                timestamp,
                dataSetName,
                editPosition,
                editRotation,
                ElementClass.uint32,
                v.fallbackLayerName,
                v.largestSegmentId,
                0,
                zoomLevel,
                None,
                userBoundingBoxes,
                organizationName,
                segments = v.segments
              ),
              basePath.getOrElse("") + v.dataZipPath,
              v.name,
            )
          }

        val skeletonTracingOpt: Option[SkeletonTracing] =
          if (treesSplit.isEmpty) None
          else
            Some(
              SkeletonTracing(
                dataSetName,
                treesSplit,
                timestamp,
                taskBoundingBox,
                activeNodeId,
                editPosition,
                editRotation,
                zoomLevel,
                version = 0,
                None,
                treeGroupsAfterSplit,
                userBoundingBoxes,
                organizationName
              )
            )

        (skeletonTracingOpt, volumeLayers, description)
      }
    } catch {
      case e: org.xml.sax.SAXParseException if e.getMessage.startsWith("Premature end of file") =>
        logger.debug(s"Tried  to parse empty NML file $name.")
        Empty
      case e: org.xml.sax.SAXParseException =>
        logger.debug(s"Failed to parse NML $name due to " + e)
        Failure(
          s"Failed to parse NML '$name'. Error in Line ${e.getLineNumber} " +
            s"(column ${e.getColumnNumber}): ${e.getMessage}")
      case e: Exception =>
        logger.error(s"Failed to parse NML $name due to " + e)
        Failure(s"Failed to parse NML '$name': " + e.toString)
    }

  private def extractTreeGroups(treeGroupContainerNodes: NodeSeq)(
      implicit m: MessagesProvider): Box[List[TreeGroup]] = {
    val treeGroupNodes = treeGroupContainerNodes.flatMap(_ \ "group")
    treeGroupNodes.map(parseTreeGroup).toList.toSingleBox(Messages("nml.element.invalid", "tree groups"))
  }

  private def parseTreeGroup(node: XMLNode)(implicit m: MessagesProvider): Box[TreeGroup] = {
    val idText = getSingleAttribute(node, "id")
    for {
      id <- idText.toIntOpt ?~ Messages("nml.treegroup.id.invalid", idText)
      children <- (node \ "group").map(parseTreeGroup).toList.toSingleBox("")
      name = getSingleAttribute(node, "name")
    } yield TreeGroup(name, id, children)
  }

  private def extractVolumes(volumeNodes: NodeSeq): immutable.Seq[NmlVolumeTag] =
    volumeNodes.map(
      node => {
        NmlVolumeTag(
          getSingleAttribute(node, "location"),
          getSingleAttributeOpt(node, "fallbackLayer"),
          getSingleAttributeOpt(node, "name"),
          parseVolumeSegmentMetadata(node \ "segments" \ "segment"),
          getSingleAttributeOpt(node, "largestSegmentId").flatMap(_.toLongOpt)
        )
      }
    )

  private def parseVolumeSegmentMetadata(segmentNodes: NodeSeq): Seq[Segment] =
    segmentNodes.map(node => {
      val anchorPositionX = getSingleAttributeOpt(node, "anchorPositionX")
      val anchorPositionY = getSingleAttributeOpt(node, "anchorPositionY")
      val anchorPositionZ = getSingleAttributeOpt(node, "anchorPositionZ")
      val anchorPosition = (anchorPositionX, anchorPositionY, anchorPositionZ) match {
        case (Some(x), Some(y), Some(z)) => Some(Vec3IntProto(x.toInt, y.toInt, z.toInt))
        case _                           => None
      }
      Segment(
        segmentId = getSingleAttribute(node, "id").toLong,
        anchorPosition = anchorPosition,
        name = getSingleAttributeOpt(node, "name"),
        creationTime = getSingleAttributeOpt(node, "created").flatMap(_.toLongOpt),
        color = parseColorOpt(node)
      )
    })

  private def parseTrees(treeNodes: NodeSeq,
                         branchPoints: Map[Int, List[BranchPoint]],
                         comments: Map[Int, List[Comment]])(implicit m: MessagesProvider) =
    treeNodes
      .map(treeNode => parseTree(treeNode, branchPoints, comments))
      .toList
      .toSingleBox(Messages("nml.element.invalid", "trees"))

  @SuppressWarnings(Array("TraversableHead")) // We check that size == 1 before accessing head
  private def parseBoundingBoxes(boundingBoxNodes: NodeSeq)(implicit m: MessagesProvider): Seq[NamedBoundingBoxProto] =
    if (boundingBoxNodes.size == 1 && getSingleAttribute(boundingBoxNodes.head, "id").isEmpty) {
      Seq.empty ++ parseBoundingBox(boundingBoxNodes.head).map(NamedBoundingBoxProto(0, None, None, None, _))
    } else {
      boundingBoxNodes.flatMap(node => {
        val idText = getSingleAttribute(node, "id")
        for {
          id <- idText.toIntOpt ?~ Messages("nml.boundingbox.id.invalid", idText)
          name = getSingleAttribute(node, "name")
          isVisible = getSingleAttribute(node, "isVisible").toBooleanOpt
          color = parseColorOpt(node)
          boundingBox <- parseBoundingBox(node)
          nameOpt = if (name.isEmpty) None else Some(name)
        } yield NamedBoundingBoxProto(id, nameOpt, isVisible, color, boundingBox)
      })
    }

  private def parseTaskBoundingBox(
      nodes: NodeSeq,
      isTask: Boolean,
      userBoundingBoxes: Seq[NamedBoundingBoxProto]): Option[Either[BoundingBox, NamedBoundingBoxProto]] =
    nodes.headOption.flatMap(node => parseBoundingBox(node)).map { bb =>
      if (isTask) {
        Left(bb)
      } else {
        val newId = if (userBoundingBoxes.isEmpty) 0 else userBoundingBoxes.map(_.id).max + 1
        Right(NamedBoundingBoxProto(newId, Some("task bounding box"), None, Some(getRandomColor), bb))
      }
    }

  private def parseBoundingBox(node: XMLNode) =
    for {
      topLeftX <- getSingleAttribute(node, "topLeftX").toIntOpt
      topLeftY <- getSingleAttribute(node, "topLeftY").toIntOpt
      topLeftZ <- getSingleAttribute(node, "topLeftZ").toIntOpt
      width <- getSingleAttribute(node, "width").toIntOpt
      height <- getSingleAttribute(node, "height").toIntOpt
      depth <- getSingleAttribute(node, "depth").toIntOpt
    } yield BoundingBox(Vec3Int(topLeftX, topLeftY, topLeftZ), width, height, depth)

  private def parseDataSetName(nodes: NodeSeq): String =
    nodes.headOption.map(node => getSingleAttribute(node, "name")).getOrElse("")

  private def parseDescription(nodes: NodeSeq): String =
    nodes.headOption.map(node => getSingleAttribute(node, "description")).getOrElse(DEFAULT_DESCRIPTION)

  private def parseOrganizationName(nodes: NodeSeq): Option[String] =
    nodes.headOption.flatMap(node => getSingleAttributeOpt(node, "organization"))

  private def parseActiveNode(nodes: NodeSeq): Option[Int] =
    nodes.headOption.flatMap(node => getSingleAttribute(node, "id").toIntOpt)

  private def parseTime(nodes: NodeSeq): Long =
    nodes.headOption.flatMap(node => getSingleAttribute(node, "ms").toLongOpt).getOrElse(DEFAULT_TIME)

  private def parseEditPosition(nodes: NodeSeq): Option[Vec3Int] =
    nodes.headOption.flatMap(parseVec3Int)

  private def parseEditRotation(nodes: NodeSeq): Option[Vec3Double] =
    nodes.headOption.flatMap(parseRotationForParams)

  private def parseZoomLevel(nodes: NodeSeq) =
    nodes.headOption.flatMap(node => getSingleAttribute(node, "zoom").toDoubleOpt)

  private def parseBranchPoints(branchPoints: NodeSeq, defaultTimestamp: Long)(
      implicit m: MessagesProvider): Box[List[BranchPoint]] =
    (branchPoints \ "branchpoint").zipWithIndex.map {
      case (branchPoint, index) =>
        getSingleAttribute(branchPoint, "id").toIntOpt.map { nodeId =>
          val parsedTimestamp = getSingleAttribute(branchPoint, "time").toLongOpt
          val timestamp = parsedTimestamp.getOrElse(defaultTimestamp - index)
          BranchPoint(nodeId, timestamp)
        } ?~ Messages("nml.node.id.invalid", "branchpoint", getSingleAttribute(branchPoint, "id"))
    }.toList.toSingleBox(Messages("nml.element.invalid", "branchpoints"))

  private def parseVec3Int(node: XMLNode) = {
    val xText = getSingleAttribute(node, "x")
    val yText = getSingleAttribute(node, "y")
    val zText = getSingleAttribute(node, "z")
    for {
      x <- xText.toIntOpt.orElse(xText.toFloatOpt.map(math.round))
      y <- yText.toIntOpt.orElse(yText.toFloatOpt.map(math.round))
      z <- zText.toIntOpt.orElse(zText.toFloatOpt.map(math.round))
    } yield Vec3Int(x, y, z)
  }

  private def parseRotationForParams(node: XMLNode) =
    for {
      rotX <- getSingleAttribute(node, "xRot").toDoubleOpt
      rotY <- getSingleAttribute(node, "yRot").toDoubleOpt
      rotZ <- getSingleAttribute(node, "zRot").toDoubleOpt
    } yield Vec3Double(rotX, rotY, rotZ)

  private def parseRotationForNode(node: XMLNode) =
    for {
      rotX <- getSingleAttribute(node, "rotX").toDoubleOpt
      rotY <- getSingleAttribute(node, "rotY").toDoubleOpt
      rotZ <- getSingleAttribute(node, "rotZ").toDoubleOpt
    } yield Vec3Double(rotX, rotY, rotZ)

  private def parseColorOpt(node: XMLNode) =
    for {
      colorRed <- getSingleAttribute(node, "color.r").toFloatOpt
      colorBlue <- getSingleAttribute(node, "color.g").toFloatOpt
      colorGreen <- getSingleAttribute(node, "color.b").toFloatOpt
      colorAlpha <- getSingleAttribute(node, "color.a").toFloatOpt
    } yield {
      ColorProto(colorRed, colorBlue, colorGreen, colorAlpha)
    }

  private def parseName(node: XMLNode) =
    getSingleAttribute(node, "name")

  private def parseGroupId(node: XMLNode) =
    getSingleAttribute(node, "groupId").toIntOpt

  private def parseVisibility(node: XMLNode, color: Option[ColorProto]): Option[Boolean] =
    getSingleAttribute(node, "isVisible").toBooleanOpt match {
      case Some(isVisible) => Some(isVisible)
      case None            => color.map(c => !c.a.isNearZero)
    }

  private def parseTree(tree: XMLNode, branchPoints: Map[Int, List[BranchPoint]], comments: Map[Int, List[Comment]])(
      implicit m: MessagesProvider): Box[Tree] = {
    val treeIdText = getSingleAttribute(tree, "id")
    for {
      id <- treeIdText.toIntOpt ?~ Messages("nml.tree.id.invalid", treeIdText)
      color = parseColorOpt(tree)
      name = parseName(tree)
      groupId = parseGroupId(tree)
      isVisible = parseVisibility(tree, color)
      nodes <- (tree \ "nodes" \ "node")
        .map(parseNode)
        .toList
        .toSingleBox(Messages("nml.tree.elements.invalid", "nodes", id))
      edges <- (tree \ "edges" \ "edge")
        .map(parseEdge)
        .toList
        .toSingleBox(Messages("nml.tree.elements.invalid", "edges", id))
      nodeIds = nodes.map(_.id)
      treeBranchPoints = nodeIds.flatMap(nodeId => branchPoints.getOrElse(nodeId, List()))
      treeComments = nodeIds.flatMap(nodeId => comments.getOrElse(nodeId, List()))
      createdTimestamp = if (nodes.isEmpty) System.currentTimeMillis()
      else nodes.minBy(_.createdTimestamp).createdTimestamp
    } yield Tree(id, nodes, edges, color, treeBranchPoints, treeComments, name, createdTimestamp, groupId, isVisible)
  }

  private def parseComments(comments: NodeSeq)(implicit m: MessagesProvider): Box[List[Comment]] =
    (for {
      commentNode <- comments \ "comment"
    } yield {
      for {
        nodeId <- getSingleAttribute(commentNode, "node").toIntOpt ?~ Messages("nml.comment.node.invalid",
                                                                               getSingleAttribute(commentNode, "node"))
      } yield {
        val content = getSingleAttribute(commentNode, "content")
        Comment(nodeId, content)
      }
    }).toList.toSingleBox(Messages("nml.element.invalid", "comments"))

  private def buildCommentMap(comments: List[Comment]): Map[Int, List[Comment]] = {
    val commentMap = new mutable.HashMap[Int, List[Comment]]()
    comments.foreach { c =>
      if (commentMap.contains(c.nodeId)) {
        commentMap(c.nodeId) = c :: commentMap(c.nodeId)
      } else {
        commentMap(c.nodeId) = List(c)
      }
    }
    commentMap.toMap
  }

  private def buildBranchPointMap(branchPoints: List[BranchPoint]): Map[Int, List[BranchPoint]] = {
    val branchPointMap = new mutable.HashMap[Int, List[BranchPoint]]()
    branchPoints.foreach { b =>
      if (branchPointMap.contains(b.nodeId)) {
        branchPointMap(b.nodeId) = b :: branchPointMap(b.nodeId)
      } else {
        branchPointMap(b.nodeId) = List(b)
      }
    }
    branchPointMap.toMap
  }

  private def getSingleAttribute(xmlNode: XMLNode, attribute: String): String =
    getSingleAttributeOpt(xmlNode, attribute).getOrElse("")

  private def getSingleAttributeOpt(xmlNode: XMLNode, attribute: String): Option[String] =
    xmlNode.attribute(attribute).flatMap(_.headOption.map(_.text))

  private def parseEdge(edge: XMLNode)(implicit m: MessagesProvider): Box[Edge] = {
    val sourceStr = getSingleAttribute(edge, "source")
    val targetStr = getSingleAttribute(edge, "target")
    for {
      source <- sourceStr.toIntOpt ?~ Messages("nml.edge.invalid", sourceStr)
      target <- targetStr.toIntOpt ?~ Messages("nml.edge.invalid", targetStr)
    } yield {
      Edge(source, target)
    }
  }

  private def parseViewport(node: XMLNode) =
    getSingleAttribute(node, "inVp").toIntOpt.getOrElse(DEFAULT_VIEWPORT)

  private def parseResolution(node: XMLNode) =
    getSingleAttribute(node, "inMag").toIntOpt.getOrElse(DEFAULT_RESOLUTION)

  private def parseBitDepth(node: XMLNode) =
    getSingleAttribute(node, "bitDepth").toIntOpt.getOrElse(DEFAULT_BITDEPTH)

  private def parseInterpolation(node: XMLNode) =
    getSingleAttribute(node, "interpolation").toBooleanOpt.getOrElse(DEFAULT_INTERPOLATION)

  private def parseTimestamp(node: XMLNode) =
    getSingleAttribute(node, "time").toLongOpt.getOrElse(DEFAULT_TIMESTAMP)

  private def parseNode(node: XMLNode)(implicit m: MessagesProvider): Box[Node] = {
    val nodeIdText = getSingleAttribute(node, "id")
    for {
      id <- nodeIdText.toIntOpt ?~ Messages("nml.node.id.invalid", "", nodeIdText)
      radius = getSingleAttribute(node, "radius").toFloatOpt.getOrElse(NodeDefaults.radius)
      position <- parseVec3Int(node) ?~ Messages("nml.node.attribute.invalid", "position", id)
    } yield {
      val viewport = parseViewport(node)
      val resolution = parseResolution(node)
      val timestamp = parseTimestamp(node)
      val bitDepth = parseBitDepth(node)
      val interpolation = parseInterpolation(node)
      val rotation = parseRotationForNode(node).getOrElse(NodeDefaults.rotation)
      Node(id, position, rotation, radius, viewport, resolution, bitDepth, interpolation, timestamp)
    }
  }

}
