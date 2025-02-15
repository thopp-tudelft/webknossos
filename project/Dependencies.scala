import play.sbt.PlayImport._
import sbt._

object Dependencies {
  private val akkaVersion = "2.6.19"
  private val akkaHttpVersion = "10.2.6"
  private val log4jVersion = "2.17.0"
  private val webknossosWrapVersion = "1.1.15"
  private val silhouetteVersion = "7.0.7"

  private val akkaLogging = "com.typesafe.akka" %% "akka-slf4j" % akkaVersion
  private val akkaTest = "com.typesafe.akka" %% "akka-testkit" % akkaVersion
  private val akkaHttp = "com.typesafe.akka" %% "akka-http-core" % akkaHttpVersion
  private val akkaCaching = "com.typesafe.akka" %% "akka-http-caching" % akkaHttpVersion
  private val commonsCodec = "commons-codec" % "commons-codec" % "1.10"
  private val commonsEmail = "org.apache.commons" % "commons-email" % "1.5"
  private val commonsIo = "commons-io" % "commons-io" % "2.9.0"
  private val commonsLang = "org.apache.commons" % "commons-lang3" % "3.1"
  private val gson = "com.google.code.gson" % "gson" % "1.7.1"
  private val grpc = "io.grpc" % "grpc-netty-shaded" % scalapb.compiler.Version.grpcJavaVersion
  private val grpcServices = "io.grpc" % "grpc-services" % scalapb.compiler.Version.grpcJavaVersion
  private val scalapbRuntime = "com.thesamet.scalapb" %% "scalapb-runtime" % scalapb.compiler.Version.scalapbVersion
  private val scalapbRuntimeGrpc = "com.thesamet.scalapb" %% "scalapb-runtime-grpc" % scalapb.compiler.Version.scalapbVersion
  private val liftCommon = "net.liftweb" %% "lift-common" % "3.0.2"
  private val liftUtil = "net.liftweb" %% "lift-util" % "3.0.2"
  private val log4jApi = "org.apache.logging.log4j" % "log4j-core" % log4jVersion % Provided
  private val log4jCore = "org.apache.logging.log4j" % "log4j-api" % log4jVersion % Provided
  private val playFramework = "com.typesafe.play" %% "play" % "2.8.16"
  private val playJson = "com.typesafe.play" %% "play-json" % "2.8.2"
  private val playIteratees = "com.typesafe.play" %% "play-iteratees" % "2.6.1"
  private val playIterateesStreams = "com.typesafe.play" %% "play-iteratees-reactive-streams" % "2.6.1"
  private val reactiveBson = "org.reactivemongo" %% "reactivemongo-bson" % "0.12.7"
  private val scalaAsync = "org.scala-lang.modules" %% "scala-async" % "0.9.7"
  private val scalaLogging = "com.typesafe.scala-logging" %% "scala-logging" % "3.5.0"
  private val scalaTestPlusPlay = "org.scalatestplus.play" %% "scalatestplus-play" % "5.1.0" % "test"
  private val silhouette = "io.github.honeycomb-cheesecake" %% "play-silhouette" % silhouetteVersion
  private val silhouetteTestkit = "io.github.honeycomb-cheesecake" %% "play-silhouette-testkit" % silhouetteVersion % "test"
  private val silhouetteCrypto = "io.github.honeycomb-cheesecake" %% "play-silhouette-crypto-jca" % silhouetteVersion
  private val webknossosWrap = "com.scalableminds" %% "webknossos-wrap" % webknossosWrapVersion
  private val xmlWriter = "org.glassfish.jaxb" % "txw2" % "2.2.11"
  private val woodstoxXml = "org.codehaus.woodstox" % "wstx-asl" % "3.2.3"
  private val redis = "net.debasishg" %% "redisclient" % "3.9"
  private val spire = "org.typelevel" %% "spire" % "0.14.1"
  private val jgrapht = "org.jgrapht" % "jgrapht-core" % "1.4.0"
  private val swagger = "io.swagger" %% "swagger-play2" % "1.7.1"
  private val jhdf = "cisd" % "jhdf5" % "19.04.0"
  private val ucarCdm = "edu.ucar" % "cdm-core" % "5.3.3"
  private val jblosc = "org.lasersonlab" % "jblosc" % "1.0.1"
  private val scalajHttp = "org.scalaj" %% "scalaj-http" % "2.4.2"
  private val guava = "com.google.guava" % "guava" % "18.0"
  private val awsS3 = "com.amazonaws" % "aws-java-sdk-s3" % "1.12.288"
  private val tika = "org.apache.tika" % "tika-core" % "1.5"
  private val jackson = "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.12.7"
  private val commonsCompress = "org.apache.commons" % "commons-compress" % "1.21"
  private val jwt = "com.github.jwt-scala" %% "jwt-play-json" % "9.1.1"
  private val googleCloudStorage = "com.google.cloud" % "google-cloud-storage" % "2.13.1"
  private val googleCloudStorageNio = "com.google.cloud" % "google-cloud-nio" % "0.123.28"

  private val sql = Seq(
    "com.typesafe.slick" %% "slick" % "3.3.3",
    "com.typesafe.slick" %% "slick-hikaricp" % "3.3.3",
    "com.typesafe.slick" %% "slick-codegen" % "3.3.3",
    "org.postgresql" % "postgresql" % "42.5.2"
  )

  val utilDependencies: Seq[ModuleID] = Seq(
    commonsEmail,
    commonsIo,
    commonsLang,
    liftCommon,
    liftUtil,
    log4jApi,
    log4jCore,
    playJson,
    playIteratees,
    playFramework,
    reactiveBson,
    scalapbRuntime,
    scalaLogging,
    akkaCaching
  )

  val webknossosDatastoreDependencies: Seq[ModuleID] = Seq(
    grpc,
    grpcServices,
    scalapbRuntimeGrpc,
    akkaLogging,
    ehcache,
    gson,
    webknossosWrap,
    playIterateesStreams,
    filters,
    ws,
    guice,
    swagger,
    spire,
    akkaHttp,
    redis,
    jhdf,
    ucarCdm,
    jackson,
    guava,
    awsS3,
    tika,
    jblosc,
    scalajHttp,
    commonsCompress,
    googleCloudStorage,
    googleCloudStorageNio
  )

  val webknossosTracingstoreDependencies: Seq[ModuleID] = Seq(
    jgrapht
  )

  val webknossosDependencies: Seq[ModuleID] = Seq(
    akkaTest,
    commonsCodec,
    scalaAsync,
    scalaTestPlusPlay,
    silhouette,
    silhouetteTestkit,
    silhouetteCrypto,
    specs2 % Test,
    xmlWriter,
    woodstoxXml,
    jwt
  ) ++ sql

}
