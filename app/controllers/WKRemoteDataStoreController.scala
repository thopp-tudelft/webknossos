package controllers

import com.scalableminds.util.accesscontext.{AuthorizedAccessContext, GlobalAccessContext}
import com.scalableminds.util.tools.Fox
import com.scalableminds.webknossos.datastore.controllers.JobExportProperties
import com.scalableminds.webknossos.datastore.models.datasource.DataSourceId
import com.scalableminds.webknossos.datastore.models.datasource.inbox.{InboxDataSourceLike => InboxDataSource}
import com.scalableminds.webknossos.datastore.services.{
  DataStoreStatus,
  LinkedLayerIdentifier,
  ReserveUploadInformation
}
import com.typesafe.scalalogging.LazyLogging
import javax.inject.Inject
import models.analytics.{AnalyticsService, UploadDatasetEvent}
import models.binary._
import models.binary.credential.CredentialDAO
import models.folder.FolderDAO
import models.job.JobDAO
import models.organization.OrganizationDAO
import models.storage.UsedStorageService
import models.user.{User, UserDAO, UserService}
import net.liftweb.common.Full
import oxalis.mail.{MailchimpClient, MailchimpTag}
import oxalis.security.{WebknossosBearerTokenAuthenticatorService, WkSilhouetteEnvironment}
import play.api.i18n.{Messages, MessagesProvider}
import play.api.libs.json.{JsError, JsSuccess, JsValue, Json}
import play.api.mvc.{Action, AnyContent, PlayBodyParsers}
import utils.ObjectId

import scala.concurrent.{ExecutionContext, Future}

class WKRemoteDataStoreController @Inject()(
    dataSetService: DataSetService,
    dataStoreService: DataStoreService,
    dataStoreDAO: DataStoreDAO,
    analyticsService: AnalyticsService,
    userService: UserService,
    organizationDAO: OrganizationDAO,
    usedStorageService: UsedStorageService,
    dataSetDAO: DataSetDAO,
    userDAO: UserDAO,
    folderDAO: FolderDAO,
    jobDAO: JobDAO,
    credentialDAO: CredentialDAO,
    mailchimpClient: MailchimpClient,
    wkSilhouetteEnvironment: WkSilhouetteEnvironment)(implicit ec: ExecutionContext, bodyParsers: PlayBodyParsers)
    extends Controller
    with LazyLogging {

  val bearerTokenService: WebknossosBearerTokenAuthenticatorService =
    wkSilhouetteEnvironment.combinedAuthenticatorService.tokenAuthenticatorService

  def reserveDataSetUpload(name: String, key: String, token: String): Action[ReserveUploadInformation] =
    Action.async(validateJson[ReserveUploadInformation]) { implicit request =>
      dataStoreService.validateAccess(name, key) { dataStore =>
        val uploadInfo = request.body
        for {
          user <- bearerTokenService.userForToken(token)
          organization <- organizationDAO.findOneByName(uploadInfo.organization)(GlobalAccessContext) ?~> Messages(
            "organization.notFound",
            uploadInfo.organization) ~> NOT_FOUND
          _ <- bool2Fox(organization._id == user._organization) ?~> "notAllowed" ~> FORBIDDEN
          _ <- dataSetService.assertValidDataSetName(uploadInfo.name)
          _ <- dataSetService.assertNewDataSetName(uploadInfo.name, organization._id) ?~> "dataSet.name.alreadyTaken"
          _ <- bool2Fox(dataStore.onlyAllowedOrganization.forall(_ == organization._id)) ?~> "dataSet.upload.Datastore.restricted"
          folderId <- ObjectId.fromString(uploadInfo.folderId.getOrElse(organization._rootFolder.toString)) ?~> "dataset.upload.folderId.invalid"
          _ <- folderDAO.assertUpdateAccess(folderId)(AuthorizedAccessContext(user)) ?~> "folder.noWriteAccess"
          _ <- Fox.serialCombined(uploadInfo.layersToLink.getOrElse(List.empty))(l => validateLayerToLink(l, user)) ?~> "dataSet.upload.invalidLinkedLayers"
          dataSet <- dataSetService.createPreliminaryDataset(uploadInfo.name, uploadInfo.organization, dataStore) ?~> "dataSet.name.alreadyTaken"
          _ <- dataSetDAO.updateFolder(dataSet._id, folderId)(GlobalAccessContext)
          _ <- dataSetService.addInitialTeams(dataSet, uploadInfo.initialTeams)(AuthorizedAccessContext(user))
          _ <- dataSetService.addUploader(dataSet, user._id)(AuthorizedAccessContext(user))
        } yield Ok
      }
    }

  def validateLayerToLink(layerIdentifier: LinkedLayerIdentifier,
                          requestingUser: User)(implicit ec: ExecutionContext, m: MessagesProvider): Fox[Unit] =
    for {
      organization <- organizationDAO.findOneByName(layerIdentifier.organizationName)(GlobalAccessContext) ?~> Messages(
        "organization.notFound",
        layerIdentifier.organizationName) ~> NOT_FOUND
      dataSet <- dataSetDAO.findOneByNameAndOrganization(layerIdentifier.dataSetName, organization._id)(
        AuthorizedAccessContext(requestingUser)) ?~> Messages("dataSet.notFound", layerIdentifier.dataSetName)
      isTeamManagerOrAdmin <- userService.isTeamManagerOrAdminOfOrg(requestingUser, dataSet._organization)
      _ <- Fox.bool2Fox(isTeamManagerOrAdmin || requestingUser.isDatasetManager || dataSet.isPublic) ?~> "dataSet.upload.linkRestricted"
    } yield ()

  def reportDatasetUpload(name: String,
                          key: String,
                          token: String,
                          dataSetName: String,
                          dataSetSizeBytes: Long): Action[AnyContent] =
    Action.async { implicit request =>
      dataStoreService.validateAccess(name, key) { dataStore =>
        for {
          user <- bearerTokenService.userForToken(token)
          dataSet <- dataSetDAO.findOneByNameAndOrganization(dataSetName, user._organization)(GlobalAccessContext) ?~> Messages(
            "dataSet.notFound",
            dataSetName) ~> NOT_FOUND
          _ <- usedStorageService.refreshStorageReportForDataset(dataSet)
          _ = analyticsService.track(UploadDatasetEvent(user, dataSet, dataStore, dataSetSizeBytes))
          _ = mailchimpClient.tagUser(user, MailchimpTag.HasUploadedOwnDataset)
        } yield Ok
      }
    }

  def statusUpdate(name: String, key: String): Action[JsValue] = Action.async(parse.json) { implicit request =>
    dataStoreService.validateAccess(name, key) { _ =>
      request.body.validate[DataStoreStatus] match {
        case JsSuccess(status, _) =>
          logger.debug(s"Status update from data store '$name'. Status: " + status.ok)
          for {
            _ <- dataStoreDAO.updateUrlByName(name, status.url)
            _ <- dataStoreDAO.updateReportUsedStorageEnabledByName(name,
                                                                   status.reportUsedStorageEnabled.getOrElse(false))
          } yield Ok
        case e: JsError =>
          logger.error("Data store '$name' sent invalid update. Error: " + e)
          Future.successful(JsonBadRequest(JsError.toJson(e)))
      }
    }
  }

  def updateAll(name: String, key: String): Action[JsValue] = Action.async(parse.json) { implicit request =>
    dataStoreService.validateAccess(name, key) { dataStore =>
      request.body.validate[List[InboxDataSource]] match {
        case JsSuccess(dataSources, _) =>
          for {
            _ <- Fox.successful(
              logger.info(s"Received dataset list from datastore '${dataStore.name}': " +
                s"${dataSources.count(_.isUsable)} active, ${dataSources.count(!_.isUsable)} inactive datasets"))
            existingIds <- dataSetService.updateDataSources(dataStore, dataSources)(GlobalAccessContext)
            _ <- dataSetService.deactivateUnreportedDataSources(existingIds, dataStore)
          } yield {
            JsonOk
          }

        case e: JsError =>
          logger.warn("Data store reported invalid json for data sources.")
          Fox.successful(JsonBadRequest(JsError.toJson(e)))
      }
    }
  }

  def updateOne(name: String, key: String): Action[JsValue] = Action.async(parse.json) { implicit request =>
    dataStoreService.validateAccess(name, key) { dataStore =>
      request.body.validate[InboxDataSource] match {
        case JsSuccess(dataSource, _) =>
          for {
            _ <- dataSetService.updateDataSources(dataStore, List(dataSource))(GlobalAccessContext)
          } yield {
            JsonOk
          }
        case e: JsError =>
          logger.warn("Data store reported invalid json for data source.")
          Fox.successful(JsonBadRequest(JsError.toJson(e)))
      }
    }
  }

  def deleteDataset(name: String, key: String): Action[JsValue] = Action.async(parse.json) { implicit request =>
    dataStoreService.validateAccess(name, key) { _ =>
      for {
        datasourceId <- request.body.validate[DataSourceId].asOpt.toFox ?~> "dataStore.upload.invalid"
        existingDataset = dataSetDAO
          .findOneByNameAndOrganizationName(datasourceId.name, datasourceId.team)(GlobalAccessContext)
          .futureBox
        _ <- existingDataset.flatMap {
          case Full(dataset) => {
            dataSetDAO
              .deleteDataset(dataset._id)
              .flatMap(_ => usedStorageService.refreshStorageReportForDataset(dataset))
          }
          case _ => Fox.successful(())
        }
      } yield Ok
    }
  }

  def jobExportProperties(name: String, key: String, jobId: String): Action[AnyContent] = Action.async {
    implicit request =>
      dataStoreService.validateAccess(name, key) { _ =>
        for {
          jobIdValidated <- ObjectId.fromString(jobId)
          job <- jobDAO.findOne(jobIdValidated)(GlobalAccessContext)
          jobOwner <- userDAO.findOne(job._owner)(GlobalAccessContext)
          organization <- organizationDAO.findOne(jobOwner._organization)(GlobalAccessContext)
          latestRunId <- job.latestRunId.toFox ?~> "job.notRun"
          exportFileName <- job.exportFileName.toFox ?~> "job.noExportFileName"
          jobExportProperties = JobExportProperties(jobId, latestRunId, organization.name, exportFileName)
        } yield Ok(Json.toJson(jobExportProperties))
      }
  }

  def findCredential(name: String, key: String, credentialId: String): Action[AnyContent] = Action.async {
    implicit request =>
      dataStoreService.validateAccess(name, key) { _ =>
        for {
          credentialIdValidated <- ObjectId.fromString(credentialId)
          credential <- credentialDAO.findOne(credentialIdValidated)
        } yield Ok(Json.toJson(credential))
      }
  }

}
