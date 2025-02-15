package models.task

import com.scalableminds.util.accesscontext.{DBAccessContext, GlobalAccessContext}
import com.scalableminds.util.time.Instant
import com.scalableminds.util.tools.Fox
import com.scalableminds.webknossos.schema.Tables._
import models.user.{UserDAO, UserService}
import play.api.libs.json._
import slick.lifted.Rep
import utils.ObjectId
import utils.sql.{SQLDAO, SqlClient, SqlToken}

import javax.inject.Inject
import scala.concurrent.ExecutionContext

case class Script(
    _id: ObjectId,
    _owner: ObjectId,
    name: String,
    gist: String,
    created: Instant = Instant.now,
    isDeleted: Boolean = false
)

class ScriptService @Inject()(userDAO: UserDAO, userService: UserService) {

  def publicWrites(script: Script): Fox[JsObject] = {
    implicit val ctx: GlobalAccessContext.type = GlobalAccessContext
    for {
      owner <- userDAO.findOne(script._owner) ?~> "user.notFound"
      ownerJs <- userService.compactWrites(owner)
    } yield {
      Json.obj(
        "id" -> script._id.toString,
        "name" -> script.name,
        "gist" -> script.gist,
        "owner" -> ownerJs
      )
    }
  }
}

object Script {
  def fromForm(name: String, gist: String, _owner: ObjectId): Script =
    Script(ObjectId.generate, _owner, name, gist)
}

class ScriptDAO @Inject()(sqlClient: SqlClient)(implicit ec: ExecutionContext)
    extends SQLDAO[Script, ScriptsRow, Scripts](sqlClient) {
  protected val collection = Scripts

  protected def idColumn(x: Scripts): Rep[String] = x._Id
  protected def isDeletedColumn(x: Scripts): Rep[Boolean] = x.isdeleted

  override protected def readAccessQ(requestingUserId: ObjectId): SqlToken =
    q"(select _organization from webknossos.users_ u where u._id = _owner) = (select _organization from webknossos.users_ u where u._id = $requestingUserId)"

  protected def parse(r: ScriptsRow): Fox[Script] =
    Fox.successful(
      Script(
        ObjectId(r._Id),
        ObjectId(r._Owner),
        r.name,
        r.gist,
        Instant.fromSql(r.created),
        r.isdeleted
      ))

  def insertOne(s: Script): Fox[Unit] =
    for {
      _ <- run(q"""insert into webknossos.scripts(_id, _owner, name, gist, created, isDeleted)
                   values(${s._id}, ${s._owner}, ${s.name}, ${s.gist}, ${s.created}, ${s.isDeleted})""".asUpdate)
    } yield ()

  def updateOne(s: Script)(implicit ctx: DBAccessContext): Fox[Unit] =
    for { //note that s.created is skipped
      _ <- assertUpdateAccess(s._id)
      _ <- run(q"""update webknossos.scripts
                          set
                            _owner = ${s._owner},
                            name = ${s.name},
                            gist = ${s.gist},
                            isDeleted = ${s.isDeleted}
                          where _id = ${s._id}""".asUpdate)
    } yield ()

  override def findAll(implicit ctx: DBAccessContext): Fox[List[Script]] =
    for {
      accessQuery <- readAccessQuery
      r <- run(q"select $columns from $existingCollectionName where $accessQuery".as[ScriptsRow])
      parsed <- Fox.combined(r.toList.map(parse))
    } yield parsed
}
