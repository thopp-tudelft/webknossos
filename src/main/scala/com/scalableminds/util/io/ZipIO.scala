/*
 * Copyright (C) 20011-2014 Scalable minds UG (haftungsbeschränkt) & Co. KG. <http://scm.io>
 */
package com.scalableminds.util.io

import java.io.File
import java.io.FileInputStream
import java.io.OutputStream
import java.io.InputStream
import java.util.zip._
import java.util.zip.{GZIPOutputStream => DefaultGZIPOutputStream}
import java.io.FileOutputStream

object ZipIO {

  /** The size of the byte or char buffer used in various methods. */

  class GZIPOutputStream(out: OutputStream, compressionLevel: Int) extends DefaultGZIPOutputStream(out) {
    `def`.setLevel(compressionLevel)
  }

  def zip(sources: Stream[NamedFileStream], out: OutputStream) = {
    if (!sources.isEmpty)
      writeZip(sources, new ZipOutputStream(out))
  }

  def gzip(source: InputStream, out: OutputStream) = {
    val t = System.currentTimeMillis()
    val gout = new GZIPOutputStream(out, Deflater.BEST_COMPRESSION);
    var buffer = new Array[Byte](1024)
    var len = 0
    do {
      len = source.read(buffer)
      if (len > 0)
        gout.write(buffer, 0, len)
    } while (len > 0)
    source.close()
    gout.close()
  }

  def gzipToTempFile(f: File) = {
    val gzipped = File.createTempFile("temp", System.nanoTime().toString + "_" + f.getName())
    gzip(new FileInputStream(f), new FileOutputStream(gzipped))
    gzipped
  }

  private def writeZip(sources: Stream[NamedFileStream], zip: ZipOutputStream) = {
    sources.foreach {
      source =>
        zip.putNextEntry(new ZipEntry(source.normalizedName))
        var buffer = new Array[Byte](1024)
        var len = 0
        do {
          len = source.stream.read(buffer)
          if (len > 0)
            zip.write(buffer, 0, len)
        } while (len > 0)
        source.stream.close()
        zip.closeEntry()
    }
    zip.close()
  }

  def unzip(file: File): List[InputStream] = {
    unzip(new java.util.zip.ZipFile(file))
  }

  def unzip(zip: ZipFile): List[InputStream] = {
    import collection.JavaConverters._
    zip
      .entries
      .asScala
      .filter(e => !e.isDirectory())
      .map(entry => zip.getInputStream(entry))
      .toList
  }
}