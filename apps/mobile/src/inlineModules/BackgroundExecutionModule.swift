internal import ExpoModulesCore
import UIKit

/// Asks iOS for time to finish a sync pass after the app goes to background.
/// Android has no equivalent here; JS treats the missing module as "no time granted".
class BackgroundExecutionModule: Module {
  // Only touched on the main queue: both functions and the expiration handler run there.
  private var activeTasks = Set<UIBackgroundTaskIdentifier>()

  func definition() -> ModuleDefinition {
    Name("BackgroundExecutionModule")

    Events("onExpire")

    // `granted` is false when iOS refuses the time. `remainingSeconds` is omitted
    // while iOS grants unlimited time (still in foreground).
    AsyncFunction("begin") { (name: String) -> [String: Any] in
      var task: UIBackgroundTaskIdentifier = .invalid
      task = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
        // iOS terminates the app unless the task ends before this handler returns.
        self?.sendEvent("onExpire", ["id": task.rawValue])
        self?.activeTasks.remove(task)
        UIApplication.shared.endBackgroundTask(task)
      }
      guard task != .invalid else { return ["granted": false] }
      activeTasks.insert(task)
      var result: [String: Any] = ["granted": true, "id": task.rawValue]
      let remaining = UIApplication.shared.backgroundTimeRemaining
      if remaining < Double.greatestFiniteMagnitude / 2 {
        result["remainingSeconds"] = remaining
      }
      return result
    }.runOnQueue(.main)

    AsyncFunction("end") { (id: Int) in
      let task = UIBackgroundTaskIdentifier(rawValue: id)
      // The expiration handler may already have ended it.
      guard activeTasks.remove(task) != nil else { return }
      UIApplication.shared.endBackgroundTask(task)
    }.runOnQueue(.main)
  }
}
