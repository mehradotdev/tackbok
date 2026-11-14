package app

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Launcher entries are activity-aliases of MainActivity named MainActivity<Icon>,
// added by plugins/withAlternateAppIcons.js. Exactly one is enabled at a time.
private const val ALIAS_PREFIX = ".MainActivity"
private const val DEFAULT_ICON = "Default"

/**
 * Switches the launcher icon by enabling one activity-alias.
 *
 * Disabling the alias the running task was launched from ends that task (the
 * process keeps running), so JS asks before switching.
 */
class AppIconModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is unavailable", null)

  private fun component(icon: String) = ComponentName(context, context.packageName + ALIAS_PREFIX + icon)

  private fun isEnabled(icon: String): Boolean =
    when (context.packageManager.getComponentEnabledSetting(component(icon))) {
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
      // Unchanged since install: the manifest enables only the default alias.
      PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> icon == DEFAULT_ICON
      else -> false
    }

  /** Icon names this binary registered, including the default. */
  private fun registeredIcons(): List<String> {
    val prefix = context.packageName + ALIAS_PREFIX
    return context.packageManager
      .getPackageInfo(context.packageName, PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS)
      .activities
      .orEmpty()
      .map { it.name }
      .filter { it.startsWith(prefix) }
      .map { it.removePrefix(prefix) }
  }

  override fun definition() = ModuleDefinition {
    Name("AppIconModule")

    // Alternate names only; lets JS offer just the icons this binary can switch to.
    Constant("registeredIcons") {
      registeredIcons().filter { it != DEFAULT_ICON }
    }

    // `icons` is the full list of alternate names so JS stays the source of truth.
    AsyncFunction("getAppIconName") { icons: List<String> ->
      icons.firstOrNull { isEnabled(it) }
    }

    AsyncFunction("setAppIcon") { name: String?, icons: List<String> ->
      val target = name ?: DEFAULT_ICON
      val registered = registeredIcons()
      require(target in registered && (target == DEFAULT_ICON || target in icons)) { "Unknown app icon: $name" }
      val pm = context.packageManager
      // Enable the target before disabling the others so a launcher entry always exists.
      pm.setComponentEnabledSetting(
        component(target),
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.DONT_KILL_APP,
      )
      // Each change makes the launcher reload, so already disabled aliases are left alone.
      registered.filter { it != target && isEnabled(it) }.forEach {
        pm.setComponentEnabledSetting(
          component(it),
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP,
        )
      }
    }
  }
}
