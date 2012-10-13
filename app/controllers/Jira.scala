package controllers

import play.api.libs.json.Json._
import play.api.libs.json._
import brainflight.security.Secured
import models.Role
import models.DataSet
import play.api.mvc._
import play.api.Logger
import models.graph.Experiment
import models.User
import org.apache.commons.codec.binary.Base64
import com.sun.jersey.api.client.WebResource
import com.sun.jersey.api.client.Client
import com.sun.jersey.api.client.ClientResponse
import views.html
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import brainflight.security.InsecureSSLSocketFactory._
import play.api.Play
import play.api.Play.current

object Jira extends Controller with Secured {

  val jiraUrl = "https://jira.scm.io"
  val conf = Play.configuration
  val branchName = conf.getString( "branchname" ) getOrElse "master"

  def index = Authenticated { implicit request =>
    Ok(html.jira.index(request.user))
  }

  def createIssue(user: User, summary: String, description: String) {
    val auth = new String(Base64.encodeBase64("autoreporter:frw378iokl!24".getBytes))
    val client = Client.create();

    val issue = Json.obj(
      "fields" -> Json.obj(
        "project" -> Json.obj(
          "key" -> "OX"),
        "summary" -> summary,
        "customfield_10008" -> branchName,
        "description" -> (description + "\n\n Reported by: %s (%s)".format(user.name, user.email)),
        "issuetype" -> Json.obj(
          "name" -> "Bug"))).toString

    usingSelfSignedCert {
      val webResource: WebResource = client.resource(jiraUrl + "/rest/api/2/issue")

      val response = webResource.header("Authorization", "Basic " + auth).`type`("application/json").accept("application/json").post(classOf[ClientResponse], issue);
      println(response)
    }
  }

  def submit(summary: String, description: String) = Authenticated { implicit request =>
    createIssue(request.user, summary, description)
    Ok
  }
}