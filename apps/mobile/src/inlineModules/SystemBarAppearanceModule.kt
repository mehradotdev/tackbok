package app

import android.os.Build
import android.view.WindowInsetsController
import androidx.core.view.WindowCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SystemBarAppearanceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SystemBarAppearanceModule")

    AsyncFunction("setStyle") { darkIcons: Boolean ->
      val window = appContext.throwingActivity.window
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // Resolve the controller from the attached view on every update. The window-level
        // controller can retain stale appearance state after a runtime theme change.
        val flag = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
        window.decorView.windowInsetsController
          ?.setSystemBarsAppearance(if (darkIcons) flag else 0, flag)
      } else {
        WindowCompat.getInsetsController(window, window.decorView)
          .isAppearanceLightStatusBars = darkIcons
      }
    }.runOnQueue(Queues.MAIN)
  }
}
