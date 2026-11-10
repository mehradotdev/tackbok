internal import ExpoModulesCore
import UIKit

/// Switches between the alternate icons registered by plugins/withAlternateAppIcons.js.
class AppIconModule: Module {
  func definition() -> ModuleDefinition {
    Name("AppIconModule")

    // `icons` (the alternate names) is only needed on Android.
    AsyncFunction("getAppIconName") { (_: [String]) -> String? in
      UIApplication.shared.alternateIconName
    }.runOnQueue(.main)

    // nil restores the primary icon. iOS shows its own confirmation alert.
    AsyncFunction("setAppIcon") { (name: String?, _: [String], promise: Promise) in
      UIApplication.shared.setAlternateIconName(name) { error in
        if let error {
          promise.reject(error)
        } else {
          promise.resolve(nil)
        }
      }
    }.runOnQueue(.main)
  }
}
