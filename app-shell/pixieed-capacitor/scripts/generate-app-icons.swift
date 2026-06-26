#!/usr/bin/env swift

import AppKit
import Foundation

struct IconSpec {
  let path: String
  let size: CGFloat
  let iconScale: CGFloat
  let backgroundHex: String?
}

enum IconGeneratorError: Error {
  case sourceMissing(String)
  case sourceLoadFailed(String)
  case representationMissing(String)
  case bitmapConversionFailed(String)
  case pngEncodingFailed(String)
}

private let fileManager = FileManager.default

private func repositoryRoot() -> URL {
  let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
  return scriptURL
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
}

private func color(hex: String?) -> NSColor {
  guard let hex else {
    return .clear
  }
  let normalized = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
  let scanner = Scanner(string: normalized)
  var value: UInt64 = 0
  scanner.scanHexInt64(&value)
  let red = CGFloat((value >> 16) & 0xff) / 255
  let green = CGFloat((value >> 8) & 0xff) / 255
  let blue = CGFloat(value & 0xff) / 255
  return NSColor(calibratedRed: red, green: green, blue: blue, alpha: 1)
}

private func writePNG(from bitmap: NSBitmapImageRep, to destination: URL) throws {
  guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    throw IconGeneratorError.pngEncodingFailed(destination.path)
  }
  let directory = destination.deletingLastPathComponent()
  try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
  try pngData.write(to: destination)
}

private func renderIcon(
  source: NSImage,
  size: CGFloat,
  iconScale: CGFloat,
  backgroundHex: String?
) throws -> NSBitmapImageRep {
  let pixelSize = Int(size.rounded())
  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: pixelSize,
    pixelsHigh: pixelSize,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    throw IconGeneratorError.bitmapConversionFailed("Icon \(pixelSize)x\(pixelSize)")
  }
  bitmap.size = NSSize(width: pixelSize, height: pixelSize)

  NSGraphicsContext.saveGraphicsState()
  defer { NSGraphicsContext.restoreGraphicsState() }

  let context = NSGraphicsContext(bitmapImageRep: bitmap)
  NSGraphicsContext.current = context
  context?.imageInterpolation = .none

  let canvasRect = NSRect(origin: .zero, size: bitmap.size)
  color(hex: backgroundHex).setFill()
  canvasRect.fill()

  let sourceSize = source.size
  let iconMaxEdge = floor(size * iconScale)
  let scale = min(iconMaxEdge / sourceSize.width, iconMaxEdge / sourceSize.height)
  let targetWidth = floor(sourceSize.width * scale)
  let targetHeight = floor(sourceSize.height * scale)
  let drawRect = NSRect(
    x: floor((size - targetWidth) / 2),
    y: floor((size - targetHeight) / 2),
    width: targetWidth,
    height: targetHeight
  )
  source.draw(
    in: drawRect,
    from: NSRect(origin: .zero, size: sourceSize),
    operation: .sourceOver,
    fraction: 1
  )
  return bitmap
}

let repoRoot = repositoryRoot()
let sourceURL = repoRoot.appendingPathComponent("icon/PiXiEED.icon512.png")
guard fileManager.fileExists(atPath: sourceURL.path) else {
  throw IconGeneratorError.sourceMissing(sourceURL.path)
}
guard let sourceImage = NSImage(contentsOf: sourceURL) else {
  throw IconGeneratorError.sourceLoadFailed(sourceURL.path)
}

let specs: [IconSpec] = [
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-mdpi/ic_launcher.png",
    size: 48,
    iconScale: 0.70,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png",
    size: 48,
    iconScale: 0.64,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png",
    size: 48,
    iconScale: 0.60,
    backgroundHex: nil
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
    size: 72,
    iconScale: 0.72,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png",
    size: 72,
    iconScale: 0.66,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png",
    size: 72,
    iconScale: 0.61,
    backgroundHex: nil
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png",
    size: 96,
    iconScale: 0.74,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png",
    size: 96,
    iconScale: 0.68,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png",
    size: 96,
    iconScale: 0.62,
    backgroundHex: nil
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png",
    size: 144,
    iconScale: 0.76,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png",
    size: 144,
    iconScale: 0.70,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png",
    size: 144,
    iconScale: 0.63,
    backgroundHex: nil
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
    size: 192,
    iconScale: 0.78,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
    size: 192,
    iconScale: 0.72,
    backgroundHex: "020816"
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png",
    size: 192,
    iconScale: 0.64,
    backgroundHex: nil
  ),
  IconSpec(
    path: "app-shell/pixieed-capacitor/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    size: 1024,
    iconScale: 0.76,
    backgroundHex: "020816"
  ),
]

for spec in specs {
  let destinationURL = repoRoot.appendingPathComponent(spec.path)
  let image = try renderIcon(
    source: sourceImage,
    size: spec.size,
    iconScale: spec.iconScale,
    backgroundHex: spec.backgroundHex
  )
  try writePNG(from: image, to: destinationURL)
}

print("Updated Android and iOS app icons from \(sourceURL.path)")
