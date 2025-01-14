package oxalis.mail

import models.organization.Organization
import models.user.User
import play.api.i18n.Messages
import utils.WkConf
import views._

import java.net.URL
import javax.inject.Inject
import scala.util.Try

class DefaultMails @Inject()(conf: WkConf) {

  private val uri = conf.Http.uri
  private val defaultSender = conf.Mail.defaultSender
  private val newOrganizationMailingList = conf.WebKnossos.newOrganizationMailingList

  def registerAdminNotifyerMail(name: String,
                                email: String,
                                brainDBResult: Option[String],
                                organization: Organization,
                                autoActivate: Boolean): Mail =
    Mail(
      from = defaultSender,
      subject =
        s"WEBKNOSSOS | A new user ($name, $email) registered on $uri for ${organization.displayName} (${organization.name})",
      bodyHtml = html.mail.notifyAdminNewUser(name, brainDBResult, uri, autoActivate).body,
      recipients = List(organization.newUserMailingList)
    )

  def overLimitMail(user: User,
                    projectName: String,
                    taskId: String,
                    annotationId: String,
                    organization: Organization): Mail =
    Mail(
      from = defaultSender,
      subject = s"WEBKNOSSOS | Time limit reached. ${user.abreviatedName} in $projectName",
      bodyHtml = html.mail.notifyAdminTimeLimit(user.name, projectName, taskId, annotationId, uri).body,
      recipients = List(organization.overTimeMailingList)
    )

  def newUserMail(name: String, receiver: String, brainDBresult: Option[String], enableAutoVerify: Boolean)(
      implicit messages: Messages): Mail =
    Mail(
      from = defaultSender,
      subject = "Welcome to WEBKNOSSOS",
      bodyHtml = html.mail.newUser(name, brainDBresult.map(Messages(_)), enableAutoVerify).body,
      recipients = List(receiver)
    )

  def activatedMail(name: String, receiver: String): Mail =
    Mail(from = defaultSender,
         subject = "WEBKNOSSOS | Account activated",
         bodyHtml = html.mail.validateUser(name, uri).body,
         recipients = List(receiver))

  def changePasswordMail(name: String, receiver: String): Mail =
    Mail(from = defaultSender,
         subject = "WEBKNOSSOS | Password changed",
         bodyHtml = html.mail.passwordChanged(name, uri).body,
         recipients = List(receiver))

  def resetPasswordMail(name: String, receiver: String, token: String): Mail =
    Mail(
      from = defaultSender,
      subject = "WEBKNOSSOS | Password Reset",
      bodyHtml = html.mail.resetPassword(name, uri, token).body,
      recipients = List(receiver)
    )

  def newOrganizationMail(organizationDisplayName: String, creatorEmail: String, domain: String): Mail =
    Mail(
      from = defaultSender,
      subject = s"WEBKNOSSOS | New Organization created on $domain",
      bodyHtml = html.mail.notifyAdminNewOrganization(organizationDisplayName, creatorEmail, domain).body,
      recipients = List(newOrganizationMailingList)
    )

  def inviteMail(receiver: String,
                 inviteTokenValue: String,
                 autoVerify: Boolean,
                 organizationDisplayName: String,
                 senderName: String): Mail = {
    val host = Try { new URL(uri) }.toOption.getOrElse(uri)
    Mail(
      from = defaultSender,
      subject = s"$senderName invited you to join their WEBKNOSSOS organization at $host",
      bodyHtml = html.mail.invite(senderName, organizationDisplayName, inviteTokenValue, uri, autoVerify).body,
      recipients = List(receiver)
    )
  }

  def helpMail(user: User,
               userEmail: String,
               organizationDisplayName: String,
               message: String,
               currentUrl: String): Mail =
    Mail(
      from = defaultSender,
      subject = "Help requested // Feedback provided",
      bodyHtml = html.mail.help(user.name, organizationDisplayName, message, currentUrl).body,
      recipients = List("hello@webknossos.org", userEmail)
    )

  def extendPricingPlanMail(user: User, userEmail: String): Mail =
    Mail(
      from = defaultSender,
      subject = "WEBKNOSSOS Plan Extension Request",
      bodyHtml = html.mail.extendPricingPlan(user.name).body,
      recipients = List(userEmail)
    )

  def upgradePricingPlanToTeamMail(user: User, userEmail: String): Mail =
    Mail(
      from = defaultSender,
      subject = "WEBKNOSSOS Plan Upgrade Request",
      bodyHtml = html.mail.upgradePricingPlanToTeam(user.name).body,
      recipients = List(userEmail)
    )

  def upgradePricingPlanToPowerMail(user: User, userEmail: String): Mail =
    Mail(
      from = defaultSender,
      subject = "WEBKNOSSOS Plan Upgrade Request",
      bodyHtml = html.mail.upgradePricingPlanToPower(user.name).body,
      recipients = List(userEmail)
    )

  def upgradePricingPlanUsersMail(user: User, userEmail: String, requestedUsers: Int): Mail =
    Mail(
      from = defaultSender,
      subject = "Request to upgrade WEBKNOSSOS users",
      bodyHtml = html.mail.upgradePricingPlanUsers(user.name, requestedUsers).body,
      recipients = List(userEmail)
    )

  def upgradePricingPlanStorageMail(user: User, userEmail: String, requestedStorage: Int): Mail =
    Mail(
      from = defaultSender,
      subject = "Request to upgrade WEBKNOSSOS storage",
      bodyHtml = html.mail.upgradePricingPlanStorage(user.name, requestedStorage).body,
      recipients = List(userEmail)
    )

  def upgradePricingPlanRequestMail(user: User,
                                    userEmail: String,
                                    organizationDisplayName: String,
                                    messageBody: String): Mail =
    Mail(
      from = defaultSender,
      subject = "Request to upgrade WEBKNOSSOS plan",
      bodyHtml = html.mail.upgradePricingPlanRequest(user.name, organizationDisplayName, messageBody).body,
      recipients = List("hello@webknossos.org")
    )

}
