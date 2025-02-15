package com.scalableminds.webknossos.datastore.services

import com.google.inject.Inject
import com.scalableminds.util.enumeration.ExtendedEnumeration
import com.scalableminds.util.tools.Fox
import com.scalableminds.webknossos.datastore.models.datasource.DataSourceId
import play.api.cache.SyncCacheApi
import play.api.libs.json.{Json, OFormat}
import play.api.mvc.Result
import play.api.mvc.Results.Forbidden

import scala.concurrent.duration._
import scala.concurrent.{ExecutionContext, Future}

object AccessMode extends ExtendedEnumeration {
  type AccessMode = Value
  val administrate, list, read, write, delete = Value
}

object AccessResourceType extends ExtendedEnumeration {
  type AccessResourceType = Value
  val datasource, tracing, webknossos, jobExport = Value
}

case class UserAccessRequest(resourceId: DataSourceId, resourceType: AccessResourceType.Value, mode: AccessMode.Value) {
  def toCacheKey(token: Option[String]) = s"$token#$resourceId#$resourceType#$mode"
}

case class UserAccessAnswer(granted: Boolean, msg: Option[String] = None)
object UserAccessAnswer { implicit val jsonFormat: OFormat[UserAccessAnswer] = Json.format[UserAccessAnswer] }

object UserAccessRequest {
  implicit val jsonFormat: OFormat[UserAccessRequest] = Json.format[UserAccessRequest]

  def deleteDataSource(dataSourceId: DataSourceId): UserAccessRequest =
    UserAccessRequest(dataSourceId, AccessResourceType.datasource, AccessMode.delete)
  def administrateDataSources: UserAccessRequest =
    UserAccessRequest(DataSourceId("", ""), AccessResourceType.datasource, AccessMode.administrate)
  def administrateDataSources(organizationName: String): UserAccessRequest =
    UserAccessRequest(DataSourceId("", organizationName), AccessResourceType.datasource, AccessMode.administrate)
  def readDataSources(dataSourceId: DataSourceId): UserAccessRequest =
    UserAccessRequest(dataSourceId, AccessResourceType.datasource, AccessMode.read)
  def writeDataSource(dataSourceId: DataSourceId): UserAccessRequest =
    UserAccessRequest(dataSourceId, AccessResourceType.datasource, AccessMode.write)

  def readTracing(tracingId: String): UserAccessRequest =
    UserAccessRequest(DataSourceId(tracingId, ""), AccessResourceType.tracing, AccessMode.read)
  def writeTracing(tracingId: String): UserAccessRequest =
    UserAccessRequest(DataSourceId(tracingId, ""), AccessResourceType.tracing, AccessMode.write)

  def downloadJobExport(jobId: String): UserAccessRequest =
    UserAccessRequest(DataSourceId(jobId, ""), AccessResourceType.jobExport, AccessMode.read)

  def webknossos: UserAccessRequest =
    UserAccessRequest(DataSourceId("webknossos", ""), AccessResourceType.webknossos, AccessMode.administrate)
}

trait AccessTokenService {
  val remoteWebKnossosClient: RemoteWebKnossosClient
  val cache: SyncCacheApi

  val AccessExpiration: FiniteDuration = 2.minutes

  def validateAccessForSyncBlock(accessRequest: UserAccessRequest, token: Option[String])(block: => Result)(
      implicit ec: ExecutionContext): Fox[Result] =
    validateAccess(accessRequest, token) {
      Future.successful(block)
    }

  def validateAccess[A](accessRequest: UserAccessRequest, token: Option[String])(block: => Future[Result])(
      implicit ec: ExecutionContext): Fox[Result] =
    for {
      userAccessAnswer <- hasUserAccess(accessRequest, token) ?~> "Failed to check data access, token may be expired, consider reloading."
      result <- executeBlockOnPositiveAnswer(userAccessAnswer, block)
    } yield result

  private def hasUserAccess(accessRequest: UserAccessRequest, token: Option[String]): Fox[UserAccessAnswer] = {
    val key = accessRequest.toCacheKey(token)
    cache.getOrElseUpdate(key, AccessExpiration) {
      remoteWebKnossosClient.requestUserAccess(token, accessRequest)
    }
  }

  private def executeBlockOnPositiveAnswer[A](userAccessAnswer: UserAccessAnswer,
                                              block: => Future[Result]): Future[Result] =
    userAccessAnswer match {
      case UserAccessAnswer(true, _) =>
        block
      case UserAccessAnswer(false, Some(msg)) =>
        Future.successful(Forbidden("Token may be expired, consider reloading. Access forbidden: " + msg))
      case _ =>
        Future.successful(Forbidden("Token may be expired, consider reloading. Token authentication failed."))
    }
}

class DataStoreAccessTokenService @Inject()(val remoteWebKnossosClient: DSRemoteWebKnossosClient,
                                            val cache: SyncCacheApi)
    extends AccessTokenService
