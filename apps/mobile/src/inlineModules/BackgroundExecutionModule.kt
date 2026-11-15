package app

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.backgroundtask.BackgroundTaskConsumer
import expo.modules.interfaces.taskManager.TaskServiceProviderHelper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Keeps the process running while a backup pass finishes after the app goes to
 * background: the Android side of the iOS module of the same name. Android can
 * freeze a background process within seconds; a running WorkManager job keeps
 * it running. No foreground service and no notification: API 31+ enqueues
 * expedited work (a JobScheduler job), older versions ordinary work, because
 * WorkManager runs expedited work there as a foreground service.
 *
 * The worker runs no sync itself while the app's JavaScript is alive: JS runs
 * the pass in its own runtime (one engine, one pass at a time) and the worker
 * waits for it. `begin` registers such a pass. `requestRun` asks for a pass once
 * the device is online, for a backup that waited offline: the worker then emits
 * `onRun`. If the process died meanwhile (the app was swiped away), the worker
 * runs the registered expo-background-task task headless instead, as the
 * periodic background task does.
 */
class BackgroundExecutionModule : Module() {
  /** The headless task keeping JS timers running; touched on the UI thread only. */
  private var timerTaskId: Int? = null

  override fun definition() = ModuleDefinition {
    Name("BackgroundExecutionModule")

    Events("onExpire", "onRun")

    OnCreate { BackgroundExecutionCoordinator.attach(this@BackgroundExecutionModule) }

    OnDestroy {
      BackgroundExecutionCoordinator.detach(this@BackgroundExecutionModule)
      // Detached, it has no pass: finish its timer task too.
      syncTimerTask()
    }

    // Same result shape as iOS. Android reports no remaining time; JS applies its budget.
    AsyncFunction("begin") { _: String ->
      val id = BackgroundExecutionCoordinator.begin(context(), this@BackgroundExecutionModule)
      mapOf("granted" to true, "id" to id)
    }

    AsyncFunction("end") { id: Int -> BackgroundExecutionCoordinator.end(id) }

    AsyncFunction("requestRun") { BackgroundExecutionCoordinator.requestRun(context()) }
  }

  private fun context(): Context =
    appContext.reactContext?.applicationContext
      ?: throw CodedException("ERR_NO_CONTEXT", "React context is unavailable", null)

  internal fun emit(event: String, body: Map<String, Any>) {
    try {
      sendEvent(event, body)
    } catch (error: Exception) {
      Log.w(TAG, "Could not send $event", error)
    }
  }

  /**
   * React Native pauses JS timers while the activity is paused unless a
   * headless JS task runs, which would stop the pass's deadline, request
   * timeouts and retry backoff. While this runtime has a pass, it runs the
   * no-op task JS registers (backgroundExecution.ts); native finishes it.
   * Reads the coordinator's current state, so calls posted out of order settle.
   */
  internal fun syncTimerTask() {
    val reactContext = appContext.reactContext as? ReactContext ?: return
    UiThreadUtil.runOnUiThread {
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      val wanted = BackgroundExecutionCoordinator.hasActiveFor(this)
      val running = timerTaskId
      if (wanted && running == null && reactContext.hasActiveReactInstance()) {
        timerTaskId = try {
          tasks.startTask(
            HeadlessJsTaskConfig(TIMER_TASK_KEY, Arguments.createMap(), 0, true),
          )
        } catch (error: Throwable) {
          // React Native asserts (an Error, not an Exception) if the context is gone.
          Log.w(TAG, "Could not keep JS timers running", error)
          null
        }
      } else if (!wanted && running != null) {
        tasks.finishTask(running)
        timerTaskId = null
      }
    }
  }
}

private const val TAG = "TackbokBackgroundExec"

/** Registered in backgroundExecution.ts; must match. */
private const val TIMER_TASK_KEY = "TackbokBackgroundExecution"

/** One unique work for every pass, so backgrounding repeatedly never stacks jobs. */
private const val WORK_NAME = "tackbok-background-execution"

/** Waits for JS to start a pass after `onRun` before the job ends. */
private const val RUN_GRACE_MS = 15_000L

/**
 * Backstop if JS never ends its pass (reload, crash): JS cancels its pass at
 * its 4-minute budget, so this only fires when JS is gone.
 */
private const val MAX_WAIT_MS = 4 * 60_000L + 30_000L

internal object BackgroundExecutionCoordinator {
  private enum class WorkState { IDLE, PENDING, RUNNING }

  private val lock = Any()
  private val modules = mutableSetOf<BackgroundExecutionModule>()
  private val active = mutableMapOf<Int, BackgroundExecutionModule>()
  private var nextId = 1
  private var workState = WorkState.IDLE
  /**
   * JS asked for a pass once online (requestRun), or the OS stopped a job whose
   * passes were cancelled. Only then does a job with no pass ask JS for one, so
   * a pass that finished before its job started causes no second pass.
   */
  private var wakeRequested = false
  /** The running job asked JS for a pass, and none has begun yet. */
  private var unansweredWake = false
  private var appContext: Context? = null

  /** Bumped on every change the worker waits for. */
  val changes = MutableStateFlow(0)

  fun attach(module: BackgroundExecutionModule) = synchronized(lock) { modules.add(module) }

  fun detach(module: BackgroundExecutionModule) {
    synchronized(lock) {
      modules.remove(module)
      // A reloaded or destroyed runtime ends its passes; the worker may finish.
      active.values.removeAll { it === module }
    }
    changed()
  }

  fun begin(context: Context, module: BackgroundExecutionModule): Int {
    val id = synchronized(lock) {
      appContext = context
      val id = nextId++
      active[id] = module
      unansweredWake = false
      enqueue(context)
      id
    }
    changed()
    return id
  }

  fun end(id: Int) {
    synchronized(lock) { active.remove(id) }
    changed()
  }

  fun requestRun(context: Context) = synchronized(lock) {
    appContext = context
    wakeRequested = true
    // A running job's wake-up is enqueued when it ends (settleAfterWork).
    enqueue(context)
  }

  fun hasActiveFor(module: BackgroundExecutionModule): Boolean =
    synchronized(lock) { active.values.any { it === module } }

  /**
   * Called with the lock held. A running job already serves every pass. When
   * the previous job has just decided to finish, WorkManager may still report
   * it running, so new work is appended after it rather than dropped (KEEP) or
   * cancelling it (REPLACE, which would read as an OS stop). A pending job is
   * re-enqueued with KEEP: a no-op while it is really queued, and a recovery if
   * it was cancelled or never rescheduled.
   */
  private fun enqueue(context: Context) {
    val policy = when (workState) {
      WorkState.RUNNING -> return
      WorkState.PENDING -> ExistingWorkPolicy.KEEP
      WorkState.IDLE -> ExistingWorkPolicy.APPEND_OR_REPLACE
    }
    val builder = OneTimeWorkRequestBuilder<BackgroundExecutionWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    }
    WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, policy, builder.build())
    workState = WorkState.PENDING
  }

  /** Called with the lock held when the job ends: idle, or a wake-up someone asked for. */
  private fun settleAfterWork() {
    workState = WorkState.IDLE
    // JS was woken and started no pass (it still sees no connection, e.g. a
    // captive portal): a wake-up it asked for meanwhile would start another job
    // at once, and again. Its network listener and the periodic job take over.
    if (unansweredWake) wakeRequested = false
    unansweredWake = false
    val context = appContext
    if (wakeRequested && context != null) enqueue(context)
  }

  enum class Start { HEADLESS, WAIT, WAKE }

  /**
   * HEADLESS when no JavaScript runs in this process (it was started for this
   * job), WAKE when JS should run a pass for a requested wake-up, WAIT otherwise.
   */
  fun startWork(): Start = synchronized(lock) {
    workState = WorkState.RUNNING
    val wake = wakeRequested
    wakeRequested = false
    unansweredWake = false
    when {
      modules.isEmpty() -> Start.HEADLESS
      wake && active.isEmpty() -> {
        unansweredWake = true
        Start.WAKE
      }
      else -> Start.WAIT
    }
  }

  /** A pass began since the job asked JS for one, even if it already ended. */
  fun wakeAnswered(): Boolean = synchronized(lock) { !unansweredWake }

  fun requestPass() {
    val targets = synchronized(lock) { modules.toList() }
    targets.forEach { it.emit("onRun", emptyMap()) }
  }

  /** Finishes only once no pass is registered, so a `begin` racing it gets a new job. */
  fun finishIfIdle(): Boolean = synchronized(lock) {
    if (active.isNotEmpty()) return false
    settleAfterWork()
    true
  }

  /**
   * The OS stopped the job (quota, constraints, time limit) or the backstop
   * fired: every pass it kept running must cancel. WorkManager reschedules a
   * stopped job, and that run asks JS for a fresh pass.
   */
  fun expireAll(rescheduled: Boolean) {
    val expired = synchronized(lock) {
      val expired = active.toMap()
      active.clear()
      if (rescheduled) {
        // The retry asks JS for a fresh pass in place of the cancelled ones.
        wakeRequested = true
        workState = WorkState.PENDING
      } else {
        settleAfterWork()
      }
      expired
    }
    expired.forEach { (id, module) -> module.emit("onExpire", mapOf("id" to id)) }
    changed()
  }

  private fun changed() {
    changes.update { it + 1 }
    val targets = synchronized(lock) { modules.toList() }
    targets.forEach { it.syncTimerTask() }
  }
}

class BackgroundExecutionWorker(context: Context, params: WorkerParameters) :
  CoroutineWorker(context, params) {

  override suspend fun doWork(): Result {
    try {
      when (BackgroundExecutionCoordinator.startWork()) {
        // The app may have been reopened meanwhile and registered a pass: wait for it below.
        BackgroundExecutionCoordinator.Start.HEADLESS -> runHeadlessTask()
        BackgroundExecutionCoordinator.Start.WAKE -> {
          // A backup waited offline, or was stopped: ask JS for a pass now.
          BackgroundExecutionCoordinator.requestPass()
          withTimeoutOrNull(RUN_GRACE_MS) {
            BackgroundExecutionCoordinator.changes.first { BackgroundExecutionCoordinator.wakeAnswered() }
          }
        }
        BackgroundExecutionCoordinator.Start.WAIT -> Unit
      }
      val finished = withTimeoutOrNull(MAX_WAIT_MS) {
        BackgroundExecutionCoordinator.changes.first { BackgroundExecutionCoordinator.finishIfIdle() }
      }
      if (finished == null) BackgroundExecutionCoordinator.expireAll(rescheduled = false)
      return Result.success()
    } catch (error: CancellationException) {
      Log.i(TAG, "Stopped by the system (reason ${stopReasonOrUnknown()})")
      BackgroundExecutionCoordinator.expireAll(rescheduled = true)
      throw error
    }
  }

  private fun stopReasonOrUnknown(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) stopReason else -1

  /**
   * No JavaScript in this process: the app was closed before its pass finished.
   * Runs the cloud sync background task (registered with expo-background-task,
   * with its own 4-minute budget) through the same task service as the
   * periodic job, without rescheduling that job.
   */
  private suspend fun runHeadlessTask() {
    val taskService = TaskServiceProviderHelper.getTaskServiceImpl(applicationContext) ?: return
    val consumers = taskService.getTaskConsumers(applicationContext.packageName)
      .filterIsInstance<BackgroundTaskConsumer>()
    Log.i(TAG, "Running ${consumers.size} background task(s) headless")
    val tasks = consumers.map { consumer ->
      val done = CompletableDeferred<Unit>()
      try {
        consumer.executeTask { done.complete(Unit) }
      } catch (error: Exception) {
        Log.w(TAG, "Background task failed to start", error)
        done.complete(Unit)
      }
      done
    }
    withTimeoutOrNull(MAX_WAIT_MS) { tasks.awaitAll() }
  }
}
