package app

import android.app.Activity
import android.app.ActivityManager
import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.ModuleDefinition

// Launcher entries are activity-aliases of MainActivity named MainActivity<Icon>,
// added by plugins/withAlternateAppIcons.js. Exactly one is enabled at a time.
private const val ALIAS_PREFIX = ".MainActivity"
private const val DEFAULT_ICON = "Default"
private const val PREFS = "tackbok.appIcon"
private const val PENDING_KEY = "pending"
// Gives JS time to report background work (setPendingIconHeld) after the app leaves the screen.
private const val BACKGROUND_DELAY_MS = 2000L

/**
 * Switches the launcher icon by enabling one activity-alias.
 *
 * Disabling the alias the running task was launched from ends that task, even
 * with DONT_KILL_APP, so the choice is stored and applied only once no activity
 * of the app is visible and JS holds nothing (unsaved edits, a sync pass).
 * The process itself keeps running.
 */
class AppIconModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is unavailable", null)

  private val prefs
    get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private val handler = Handler(Looper.getMainLooper())
  private val startedActivities = mutableSetOf<Activity>()
  private var application: Application? = null
  private var isHeld = false

  private val applyIfBackground = Runnable {
    if (startedActivities.isEmpty() && !isHeld) {
      // Runs outside any JS call, so a failure must not crash the app; the next background retries.
      runCatching { applyPendingIcon() }.onFailure { Log.w("AppIconModule", "Failed to apply app icon", it) }
    }
  }

  private val lifecycleCallbacks = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityStarted(activity: Activity) {
      startedActivities.add(activity)
      handler.removeCallbacks(applyIfBackground)
    }

    override fun onActivityStopped(activity: Activity) {
      startedActivities.remove(activity)
      // A configuration change starts the new activity right away.
      if (!activity.isChangingConfigurations) scheduleApply()
    }

    override fun onActivityDestroyed(activity: Activity) {
      startedActivities.remove(activity)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
  }

  private fun scheduleApply() {
    if (startedActivities.isNotEmpty() || isHeld) return
    handler.removeCallbacks(applyIfBackground)
    handler.postDelayed(applyIfBackground, BACKGROUND_DELAY_MS)
  }

  private fun component(icon: String) = ComponentName(context, context.packageName + ALIAS_PREFIX + icon)

  private fun isEnabled(icon: String): Boolean =
    when (context.packageManager.getComponentEnabledSetting(component(icon))) {
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
      // Unchanged since install: the manifest enables only the default alias.
      PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> icon == DEFAULT_ICON
      else -> false
    }

  private fun pendingIcon(): String? = prefs.getString(PENDING_KEY, null)

  /** Activities of other apps (photo picker, sign-in) can run inside our task; ending it would lose them. */
  private fun isShowingOtherApp(): Boolean {
    val tasks = context.getSystemService(ActivityManager::class.java)?.appTasks ?: return false
    return tasks.any { task ->
      runCatching { task.taskInfo?.topActivity?.packageName }
        .getOrNull()
        ?.let { it != context.packageName } == true
    }
  }

  private fun applyPendingIcon() {
    val target = runCatching { pendingIcon() }.getOrNull() ?: return
    // Applied on the next background instead, once that activity has finished.
    if (isShowingOtherApp()) return
    val pm = context.packageManager
    val aliases = pm.getPackageInfo(
      context.packageName,
      PackageManager.GET_ACTIVITIES or PackageManager.MATCH_DISABLED_COMPONENTS,
    )
      .activities
      .orEmpty()
      .map { it.name }
      .filter { it.startsWith(context.packageName + ALIAS_PREFIX) }
      .map { it.removePrefix(context.packageName + ALIAS_PREFIX) }
    // Stale choice, e.g. an icon removed in an update: keep the current icon.
    if (target !in aliases) {
      prefs.edit().remove(PENDING_KEY).apply()
      return
    }
    // Enable the target before disabling the others so a launcher entry always exists.
    pm.setComponentEnabledSetting(
      component(target),
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
      PackageManager.DONT_KILL_APP,
    )
    // Each change makes the launcher reload, so already disabled aliases are left alone.
    aliases.filter { it != target && isEnabled(it) }.forEach {
      pm.setComponentEnabledSetting(
        component(it),
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.DONT_KILL_APP,
      )
    }
    prefs.edit().remove(PENDING_KEY).apply()
  }

  override fun definition() = ModuleDefinition {
    Name("AppIconModule")

    OnCreate {
      val app = context.applicationContext as Application
      // Lifecycle callbacks and the activity set stay on the main thread.
      handler.post {
        // The current activity may have started before this module was created.
        val activity = appContext.currentActivity
        if ((activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) == true) {
          startedActivities.add(activity)
        }
        app.registerActivityLifecycleCallbacks(lifecycleCallbacks)
        application = app
      }
    }

    OnDestroy {
      handler.post {
        handler.removeCallbacks(applyIfBackground)
        isHeld = false
        application?.unregisterActivityLifecycleCallbacks(lifecycleCallbacks)
        application = null
        startedActivities.clear()
      }
    }

    // `icons` is the full list of alternate names so JS stays the source of truth.
    // A choice waiting for the app to go to background counts as the current icon.
    AsyncFunction("getAppIconName") { icons: List<String> ->
      when (val pending = pendingIcon()) {
        null -> icons.firstOrNull { isEnabled(it) }
        DEFAULT_ICON -> null
        else -> pending
      }
    }

    // JS holds the change while ending the task would lose work: unsaved edits or a sync pass.
    AsyncFunction("setPendingIconHeld") { held: Boolean ->
      isHeld = held
      if (held) handler.removeCallbacks(applyIfBackground) else scheduleApply()
    }.runOnQueue(Queues.MAIN)

    // Resolves "pending" when the change waits for the app to go to background,
    // or null when nothing changes (the icon already in use cancels a pending choice).
    AsyncFunction("setAppIcon") { name: String?, icons: List<String> ->
      val target = name ?: DEFAULT_ICON
      require(target == DEFAULT_ICON || target in icons) { "Unknown app icon: $name" }
      if (isEnabled(target)) {
        prefs.edit().remove(PENDING_KEY).commit()
        null
      } else {
        prefs.edit().putString(PENDING_KEY, target).commit()
        "pending"
      }
    }
  }
}
