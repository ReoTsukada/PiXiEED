import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

struct ManifestEntry: Decodable {
  let file: String
  let label: String?
  let date: String?
  let alt: String?
}

struct OutputRecord {
  let file: String
  let scale: Int
  let originalWidth: Int
  let originalHeight: Int
  let outputWidth: Int
  let outputHeight: Int
}

enum UpscaleError: Error {
  case invalidArguments
  case manifestReadFailed(String)
  case sourceOpenFailed(String)
  case frameReadFailed(String, Int)
  case destinationCreateFailed(String)
  case finalizeFailed(String)
}

func scaledImage(_ image: CGImage, scale: Int) -> CGImage? {
  let width = image.width * scale
  let height = image.height * scale
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

  guard let context = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: bitmapInfo
  ) else {
    return nil
  }

  context.interpolationQuality = .none
  context.setShouldAntialias(false)
  context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  return context.makeImage()
}

func suggestedScale(forMaxDimension maxDimension: Int) -> Int {
  if maxDimension >= 900 {
    return 1
  }
  let target = 1200
  let computed = target / maxDimension
  return max(2, computed)
}

func readManifest(at url: URL) throws -> [ManifestEntry] {
  guard let data = try? Data(contentsOf: url) else {
    throw UpscaleError.manifestReadFailed(url.path)
  }
  return try JSONDecoder().decode([ManifestEntry].self, from: data)
}

func writeSummary(_ records: [OutputRecord], to url: URL) throws {
  var lines: [String] = []
  lines.append("PiXiEED portfolio upscaled exports")
  lines.append("")
  for record in records {
    lines.append("\(record.file)\t\(record.originalWidth)x\(record.originalHeight)\t\(record.scale)x\t\(record.outputWidth)x\(record.outputHeight)")
  }
  let text = lines.joined(separator: "\n") + "\n"
  try text.write(to: url, atomically: true, encoding: .utf8)
}

func removeItemIfExists(at url: URL) throws {
  if FileManager.default.fileExists(atPath: url.path) {
    try FileManager.default.removeItem(at: url)
  }
}

func upscaleEntry(_ entry: ManifestEntry, sourceDirectory: URL, outputDirectory: URL) throws -> OutputRecord {
  let sourceURL = sourceDirectory.appendingPathComponent(entry.file)
  guard let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil) else {
    throw UpscaleError.sourceOpenFailed(sourceURL.path)
  }
  let frameCount = CGImageSourceGetCount(imageSource)
  guard frameCount > 0 else {
    throw UpscaleError.sourceOpenFailed(sourceURL.path)
  }

  guard let firstFrame = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    throw UpscaleError.frameReadFailed(sourceURL.path, 0)
  }

  let scale = suggestedScale(forMaxDimension: max(firstFrame.width, firstFrame.height))
  let outputURL = outputDirectory.appendingPathComponent(entry.file)
  try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
  try removeItemIfExists(at: outputURL)

  let type = CGImageSourceGetType(imageSource) ?? UTType.png.identifier as CFString
  guard let destination = CGImageDestinationCreateWithURL(outputURL as CFURL, type, frameCount, nil) else {
    throw UpscaleError.destinationCreateFailed(outputURL.path)
  }

  if let containerProps = CGImageSourceCopyProperties(imageSource, nil) as? [CFString: Any] {
    CGImageDestinationSetProperties(destination, containerProps as CFDictionary)
  }

  for index in 0..<frameCount {
    guard let frame = CGImageSourceCreateImageAtIndex(imageSource, index, nil) else {
      throw UpscaleError.frameReadFailed(sourceURL.path, index)
    }
    guard let scaled = scaledImage(frame, scale: scale) else {
      throw UpscaleError.frameReadFailed(sourceURL.path, index)
    }
    let frameProps = CGImageSourceCopyPropertiesAtIndex(imageSource, index, nil)
    CGImageDestinationAddImage(destination, scaled, frameProps)
  }

  guard CGImageDestinationFinalize(destination) else {
    throw UpscaleError.finalizeFailed(outputURL.path)
  }

  return OutputRecord(
    file: entry.file,
    scale: scale,
    originalWidth: firstFrame.width,
    originalHeight: firstFrame.height,
    outputWidth: firstFrame.width * scale,
    outputHeight: firstFrame.height * scale
  )
}

func main() throws {
  let arguments = CommandLine.arguments
  guard arguments.count == 4 else {
    throw UpscaleError.invalidArguments
  }

  let sourceDirectory = URL(fileURLWithPath: arguments[1], isDirectory: true)
  let manifestURL = URL(fileURLWithPath: arguments[2], isDirectory: false)
  let outputDirectory = URL(fileURLWithPath: arguments[3], isDirectory: true)

  try removeItemIfExists(at: outputDirectory)
  try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

  let entries = try readManifest(at: manifestURL)
  var records: [OutputRecord] = []

  for entry in entries {
    let record = try upscaleEntry(entry, sourceDirectory: sourceDirectory, outputDirectory: outputDirectory)
    records.append(record)
    print("\(entry.file)\t\(record.scale)x\t\(record.outputWidth)x\(record.outputHeight)")
  }

  try writeSummary(records, to: outputDirectory.appendingPathComponent("README.txt"))
}

do {
  try main()
} catch UpscaleError.invalidArguments {
  fputs("usage: swift upscale_portfolio.swift <source_dir> <manifest.json> <output_dir>\n", stderr)
  exit(64)
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
