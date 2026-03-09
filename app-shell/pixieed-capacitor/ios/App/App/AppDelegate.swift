import UIKit
import Capacitor
import Photos

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

@objc(AppViewController)
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PiXiEEDMediaPlugin())
    }
}

@objc(PiXiEEDMediaPlugin)
class PiXiEEDMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PiXiEEDMediaPlugin"
    public let jsName = "PiXiEEDMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImageToLibrary", returnType: CAPPluginReturnPromise)
    ]

    @objc func saveImageToLibrary(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"), !base64.isEmpty else {
            call.reject("Missing image data")
            return
        }
        let filename = sanitizeFilename(call.getString("filename") ?? "PiXiEED.png")
        let mimeType = (call.getString("mimeType") ?? "image/png").lowercased()
        guard mimeType.hasPrefix("image/"), mimeType != "image/svg+xml" else {
            call.reject("Unsupported image type")
            return
        }
        guard let data = decodeBase64(base64), !data.isEmpty else {
            call.reject("Invalid image data")
            return
        }

        requestPhotoLibraryAccess { [weak self] granted in
            guard let self else {
                call.reject("Plugin unavailable")
                return
            }
            guard granted else {
                call.reject("Photo library permission not granted")
                return
            }
            self.writeImage(data: data, filename: filename, mimeType: mimeType, call: call)
        }
    }

    private func requestPhotoLibraryAccess(completion: @escaping (Bool) -> Void) {
        let finish: (PHAuthorizationStatus) -> Void = { status in
            let granted = status == .authorized || status == .limited
            DispatchQueue.main.async {
                completion(granted)
            }
        }
        if #available(iOS 14, *) {
            PHPhotoLibrary.requestAuthorization(for: .addOnly, handler: finish)
        } else {
            PHPhotoLibrary.requestAuthorization(finish)
        }
    }

    private func writeImage(data: Data, filename: String, mimeType: String, call: CAPPluginCall) {
        let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: tempUrl, options: .atomic)
        } catch {
            call.reject("Failed to stage image", nil, error)
            return
        }

        var createdAssetId: String?
        PHPhotoLibrary.shared().performChanges({
            let creationRequest = PHAssetCreationRequest.forAsset()
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = filename
            creationRequest.addResource(with: .photo, fileURL: tempUrl, options: options)
            createdAssetId = creationRequest.placeholderForCreatedAsset?.localIdentifier
        }, completionHandler: { success, error in
            try? FileManager.default.removeItem(at: tempUrl)
            DispatchQueue.main.async {
                if success {
                    call.resolve([
                        "saved": true,
                        "localIdentifier": createdAssetId ?? "",
                        "filename": filename,
                        "mimeType": mimeType
                    ])
                } else {
                    call.reject("Failed to save image to Photos", nil, error)
                }
            }
        })
    }

    private func decodeBase64(_ value: String) -> Data? {
        let payload: String
        if let commaIndex = value.firstIndex(of: ",") {
            payload = String(value[value.index(after: commaIndex)...])
        } else {
            payload = value
        }
        return Data(base64Encoded: payload, options: [.ignoreUnknownCharacters])
    }

    private func sanitizeFilename(_ value: String) -> String {
        let basename = URL(fileURLWithPath: value).lastPathComponent
        let invalidCharacters = CharacterSet(charactersIn: "<>:\"/\\|?*").union(.controlCharacters)
        let cleanedScalars = basename.unicodeScalars.map { scalar in
            invalidCharacters.contains(scalar) ? "_" : String(scalar)
        }
        let cleaned = cleanedScalars.joined().trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "PiXiEED.png" : cleaned
    }
}
