package models.knowledge

import models.basics.BasicDAO
import com.mongodb.casbah.Imports._
import com.novus.salat.annotations._
import play.api.Logger

object StacksQueued extends BasicDAO[Stack]("stacksQueued"){
  this.collection.ensureIndex(MongoDBObject("level.levelId" -> 1, "mission._id" -> 1))
  
  
  def popOne() = {
    findOne(MongoDBObject.empty).map{ e =>
      removeById(e._id)
      e
    }
  }
  
  def remove(level: Level, mission: Mission): WriteResult = {
    remove(MongoDBObject("level.levelId" -> level.levelId, "mission._id" -> mission._id))
  }
  
  def findFor(levelId: LevelId) = {
    val m = MongoDBObject("level.levelId" -> levelId)
    Logger.error("FIND FOR: " + m.toMap())
    find(m).toList
  }
  
  def find(level: Level, mission: Mission): List[Stack] = {
    find(MongoDBObject("level.levelId" -> level.levelId, "mission._id" -> mission._id)).toList
  }
}