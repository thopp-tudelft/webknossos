package models.job

import akka.actor.ActorSystem
import com.scalableminds.util.accesscontext.GlobalAccessContext
import com.scalableminds.util.mvc.Formatter
import com.scalableminds.util.time.Instant
import com.scalableminds.util.tools.Fox
import com.scalableminds.webknossos.datastore.helpers.IntervalScheduler
import com.scalableminds.webknossos.schema.Tables._
import com.typesafe.scalalogging.LazyLogging
import models.binary.DataStoreDAO
import oxalis.telemetry.SlackNotificationService
import play.api.inject.ApplicationLifecycle
import play.api.libs.json.{JsObject, Json}
import slick.lifted.Rep
import utils.sql.{SQLDAO, SqlClient}
import utils.{ObjectId, WkConf}

import javax.inject.Inject
import scala.concurrent.ExecutionContext
import scala.concurrent.duration._

case class Worker(_id: ObjectId,
                  _dataStore: String,
                  key: String,
                  maxParallelJobs: Int,
                  lastHeartBeat: Long = 0,
                  created: Instant = Instant.now,
                  isDeleted: Boolean = false)

class WorkerDAO @Inject()(sqlClient: SqlClient)(implicit ec: ExecutionContext)
    extends SQLDAO[Worker, WorkersRow, Workers](sqlClient) {
  protected val collection = Workers

  protected def idColumn(x: Workers): Rep[String] = x._Id

  protected def isDeletedColumn(x: Workers): Rep[Boolean] = x.isdeleted

  protected def parse(r: WorkersRow): Fox[Worker] =
    Fox.successful(
      Worker(
        ObjectId(r._Id),
        r._Datastore,
        r.key,
        r.maxparalleljobs,
        r.lastheartbeat.getTime,
        Instant.fromSql(r.created),
        r.isdeleted
      )
    )

  def findOneByKey(key: String): Fox[Worker] =
    for {
      r: Seq[WorkersRow] <- run(q"select $columns from $existingCollectionName where key = $key".as[WorkersRow])
      parsed <- parseFirst(r, "key")
    } yield parsed

  def findOneByDataStore(dataStoreName: String): Fox[Worker] =
    for {
      r: Seq[WorkersRow] <- run(
        q"select $columns from $existingCollectionName where _dataStore = $dataStoreName".as[WorkersRow])
      parsed <- parseFirst(r, "dataStoreName")
    } yield parsed

  def updateHeartBeat(_id: ObjectId): Unit = {
    run(q"update webknossos.workers set lastHeartBeat = NOW() where _id = ${_id}".asUpdate)
    // Note that this should not block the jobs polling operation, failures here are not critical
    ()
  }
}

class WorkerService @Inject()(conf: WkConf, dataStoreDAO: DataStoreDAO, workerDAO: WorkerDAO) {

  def lastHeartBeatIsRecent(worker: Worker): Boolean =
    System.currentTimeMillis() - worker.lastHeartBeat < conf.Jobs.workerLivenessTimeout.toMillis

  def publicWrites(worker: Worker): JsObject =
    Json.obj(
      "id" -> worker._id.id,
      "maxParallelJobs" -> worker.maxParallelJobs,
      "created" -> worker.created,
      "lastHeartBeat" -> worker.lastHeartBeat,
      "lastHeartBeatIsRecent" -> lastHeartBeatIsRecent(worker)
    )

}

class WorkerLivenessService @Inject()(workerService: WorkerService,
                                      workerDAO: WorkerDAO,
                                      slackNotificationService: SlackNotificationService,
                                      val lifecycle: ApplicationLifecycle,
                                      val system: ActorSystem)
    extends IntervalScheduler
    with Formatter
    with LazyLogging {

  override protected def tickerInitialDelay: FiniteDuration = 1 minute

  override protected def tickerInterval: FiniteDuration = 1 minute

  override protected def tick(): Unit = {
    for {
      workers <- workerDAO.findAll(GlobalAccessContext)
      _ = workers.foreach(reportIfLivenessChanged)
    } yield ()
    ()
  }

  private val reportedAsDead: scala.collection.mutable.Set[ObjectId] = scala.collection.mutable.Set()

  private def reportIfLivenessChanged(worker: Worker): Unit = {
    val heartBeatIsRecent = workerService.lastHeartBeatIsRecent(worker)
    if (!heartBeatIsRecent && !reportedAsDead.contains(worker._id)) {
      reportAsDead(worker)
      reportedAsDead.add(worker._id)
    }
    if (heartBeatIsRecent && reportedAsDead.contains(worker._id)) {
      reportAsResurrected(worker)
      reportedAsDead.remove(worker._id)
    }
  }

  private def reportAsDead(worker: Worker): Unit = {
    val msg = s"Worker ${worker._id} is not reporting. Last heartbeat was at ${formatDate(worker.lastHeartBeat)}"
    slackNotificationService.warn("Worker missing", msg)
    logger.warn(msg)
  }

  private def reportAsResurrected(worker: Worker): Unit = {
    val msg = s"Worker ${worker._id} is reporting again. Last heartbeat was at ${formatDate(worker.lastHeartBeat)}"
    slackNotificationService.success("Worker return", msg)
    logger.info(msg)
  }

}
