package app

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import java.util.concurrent.atomic.AtomicReference
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
 * process keeps running), so JS asks before switching, or queues the switch
 * until the user leaves the app.
 */
class AppIconModule : Module() {
  /** An icon to switch to once the user leaves the app: name (null is the default) and the alternates. */
  private val iconOnLeave = AtomicReference<Pair<String?, List<String>>?>(null)
  private var application: Application? = null

  // Stop, not pause: a deep link or notification tap while open, or a dialog
  // over the app, only pauses it.
  private val lifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityStopped(activity: Activity) {
      val queued = iconOnLeave.get() ?: return
      if (activity.isChangingConfigurations || !userLeftApp(activity)) return
      // Skip if JS replaced or cancelled the choice meanwhile; it stays queued.
      if (!iconOnLeave.compareAndSet(queued, null)) return
      val (name, icons) = queued
      runCatching { switchIcon(name, icons) }.onFailure {
        Log.w("AppIconModule", "Failed to switch the app icon", it)
        // Try again on the next leave unless JS queued something else.
        iconOnLeave.compareAndSet(null, queued)
      }
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
  }

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

  /** Icon names this binary registered, including the default. MainActivity itself is not an alias. */
  private fun registeredIcons(): List<String> {
    val prefix = context.packageName + ALIAS_PREFIX
    return context.packageManager
      .getPackageInfo(context.packageName, PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS)
      .activities
      .orEmpty()
      .filter { it.targetActivity != null && it.name.startsWith(prefix) }
      .map { it.name.removePrefix(prefix) }
  }

  // Settings and a queued switch run on different threads; one at a time keeps one alias enabled.
  @Synchronized
  private fun switchIcon(name: String?, icons: List<String>) {
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

  /**
   * True when the stop means the user left the app (Home, Recents, another
   * app): the screen is on and nothing else opened over it in its own task
   * (a picker or sign-in sheet).
   */
  private fun userLeftApp(activity: Activity): Boolean {
    // The activity, not the React context, which may already be gone.
    val power = activity.getSystemService(PowerManager::class.java)
    if (power?.isInteractive != true) return false
    val activities = activity.getSystemService(ActivityManager::class.java)
    val top = activities?.appTasks?.firstOrNull()?.taskInfo?.topActivity ?: return false
    return top.packageName == activity.packageName
  }

  /** Listens for stops; done when a switch is queued too, in case the context was missing at create. */
  @Synchronized
  private fun registerLifecycleCallbacks() {
    if (application != null) return
    application = appContext.reactContext?.applicationContext as? Application
    application?.registerActivityLifecycleCallbacks(lifecycleCallbacks)
  }

  override fun definition() = ModuleDefinition {
    Name("AppIconModule")

    // Alternate names only; lets JS offer just the icons this binary can switch to.
    // Read when JS imports the module, so a failure falls back to the default icon only.
    Constant("registeredIcons") {
      runCatching { registeredIcons().filter { it != DEFAULT_ICON } }.getOrDefault(emptyList())
    }

    // `icons` is the full list of alternate names so JS stays the source of truth.
    AsyncFunction("getAppIconName") { icons: List<String> ->
      icons.firstOrNull { isEnabled(it) }
    }

    AsyncFunction("setAppIcon") { name: String?, icons: List<String> ->
      iconOnLeave.set(null)
      switchIcon(name, icons)
    }

    // Switching ends the task, so onboarding queues the switch until the user leaves.
    AsyncFunction("setAppIconOnLeave") { name: String?, icons: List<String> ->
      val target = name ?: DEFAULT_ICON
      require(target in registeredIcons() && (target == DEFAULT_ICON || target in icons)) { "Unknown app icon: $name" }
      registerLifecycleCallbacks()
      iconOnLeave.set(name to icons)
    }

    AsyncFunction("cancelAppIconOnLeave") {
      iconOnLeave.set(null)
    }

    OnCreate {
      registerLifecycleCallbacks()
    }

    OnDestroy {
      synchronized(this@AppIconModule) {
        application?.unregisterActivityLifecycleCallbacks(lifecycleCallbacks)
        application = null
      }
    }
  }
}
