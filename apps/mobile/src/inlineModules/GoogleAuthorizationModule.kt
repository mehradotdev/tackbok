package app

import android.accounts.Account
import android.accounts.AccountManager
import android.app.Activity
import android.content.Intent
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.AccountPicker
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val AUTHORIZATION_REQUEST_CODE = 18074
private const val ACCOUNT_PICKER_REQUEST_CODE = 18075
private const val GOOGLE_ACCOUNT_TYPE = "com.google"
private const val GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
private const val ERROR_BUSY = "E_GOOGLE_AUTH_BUSY"
private const val ERROR_CANCELLED = "E_GOOGLE_AUTH_CANCELLED"
private const val ERROR_CONSENT_REQUIRED = "E_GOOGLE_AUTH_CONSENT_REQUIRED"
private const val ERROR_PERMISSION_REQUIRED = "E_GOOGLE_AUTH_PERMISSION_REQUIRED"
private const val ERROR_NO_ACTIVITY = "E_GOOGLE_AUTH_NO_ACTIVITY"
private const val ERROR_FAILED = "E_GOOGLE_AUTH_FAILED"

/**
 * Free Android authorization binding chosen by ADR 0005. It requests only
 * Drive appData plus basic identity scopes and never requests offline/server
 * access, so no client secret or refresh token exists on-device.
 *
 * Interactive authorization always starts with the device account chooser and
 * pins the authorization request to the chosen account. Without the pin, Play
 * services silently reuses whichever account already holds a grant, which made
 * both account switching and a real disconnect impossible (phase3 finding
 * 0002). Silent authorization accepts the previously chosen account from
 * JavaScript for the same reason.
 */
class GoogleAuthorizationModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingAccountEmail: String? = null

  override fun definition() = ModuleDefinition {
    Name("GoogleAuthorizationModule")

    AsyncFunction("authorize") { interactive: Boolean, accountEmail: String?, promise: Promise ->
      if (pendingPromise != null) {
        promise.reject(ERROR_BUSY, "Another Google authorization is in progress", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(ERROR_NO_ACTIVITY, "No active activity", null)
        return@AsyncFunction
      }
      if (interactive) {
        // The chooser is not optional: skipping it lets an existing grant for
        // any device account satisfy the request with no UI at all.
        val intent =
          AccountPicker.newChooseAccountIntent(
            AccountPicker.AccountChooserOptions.Builder()
              .setAllowableAccountsTypes(listOf(GOOGLE_ACCOUNT_TYPE))
              .build(),
          )
        pendingPromise = promise
        pendingAccountEmail = null
        try {
          activity.startActivityForResult(intent, ACCOUNT_PICKER_REQUEST_CODE)
        } catch (error: Exception) {
          clearPending()
          promise.reject(ERROR_FAILED, error.message ?: "Unable to open the account chooser", error)
        }
      } else {
        startAuthorization(activity, promise, accountEmail, interactive = false)
      }
    }

    AsyncFunction("invalidateAccessToken") { accessToken: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      // Best effort by contract: JavaScript clears its stored copy regardless,
      // and a failure here must never block 401 recovery. Without this call the
      // next silent authorization re-reads the same dead token from the Play
      // services cache (phase3 finding 0001).
      Thread {
        try {
          GoogleAuthUtil.clearToken(context, accessToken)
        } catch (_: Exception) {
          // Ignored: invalidation is an optimization, not a correctness gate.
        }
        promise.resolve(null)
      }.start()
    }

    AsyncFunction("signOut") {
      // Intentionally local-only. JS deletes SecureStore state. Never call
      // AuthorizationClient.revokeAccess or Google's global revoke endpoint.
    }

    OnActivityResult { activity, (requestCode, resultCode, data) ->
      val promise = pendingPromise
      if (promise == null) return@OnActivityResult
      when (requestCode) {
        ACCOUNT_PICKER_REQUEST_CODE -> {
          if (resultCode != Activity.RESULT_OK) {
            clearPending()
            promise.reject(ERROR_CANCELLED, "Google account selection was cancelled", null)
            return@OnActivityResult
          }
          val accountName = data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
          if (accountName.isNullOrBlank()) {
            clearPending()
            promise.reject(ERROR_FAILED, "The account chooser returned no account", null)
            return@OnActivityResult
          }
          pendingAccountEmail = accountName
          // pendingPromise stays set: the same promise now waits on
          // authorization, and possibly on the consent activity after that.
          startAuthorization(activity, promise, accountName, interactive = true)
        }
        AUTHORIZATION_REQUEST_CODE -> {
          val accountEmail = pendingAccountEmail
          clearPending()
          if (resultCode != Activity.RESULT_OK) {
            promise.reject(ERROR_CANCELLED, "Google authorization was cancelled", null)
            return@OnActivityResult
          }
          try {
            val result = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)
            resolveAuthorization(result, promise, accountEmail)
          } catch (error: ApiException) {
            promise.reject(ERROR_FAILED, error.message ?: "Google authorization failed", error)
          }
        }
      }
    }

    OnDestroy {
      pendingPromise?.reject(ERROR_CANCELLED, "Google authorization was cancelled", null)
      clearPending()
    }
  }

  private fun clearPending() {
    pendingPromise = null
    pendingAccountEmail = null
  }

  /**
   * Silent authorizations never own the pending state, and an interactive flow
   * may start while one is in flight. Callbacks may only clear state that
   * belongs to their own promise.
   */
  private fun clearPendingIf(promise: Promise) {
    if (pendingPromise === promise) clearPending()
  }

  private fun startAuthorization(
    activity: Activity,
    promise: Promise,
    accountEmail: String?,
    interactive: Boolean,
  ) {
    val builder =
      AuthorizationRequest.builder()
        .setRequestedScopes(
          listOf(
            Scope(GOOGLE_DRIVE_SCOPE),
            Scope("openid"),
            Scope("email"),
          ),
        )
    // An unpinned request is served by any device account with a surviving
    // grant. Interactive calls always pin to the chooser result; silent calls
    // pin to the account stored at connect time. Null only happens for
    // credentials stored before pinning existed.
    if (!accountEmail.isNullOrBlank()) {
      builder.setAccount(Account(accountEmail, GOOGLE_ACCOUNT_TYPE))
    }

    Identity.getAuthorizationClient(activity)
      .authorize(builder.build())
      .addOnSuccessListener { result ->
        if (result.hasResolution()) {
          if (!interactive) {
            clearPendingIf(promise)
            promise.reject(
              ERROR_CONSENT_REQUIRED,
              "Google authorization requires interactive consent",
              null,
            )
            return@addOnSuccessListener
          }
          val pendingIntent = result.pendingIntent
          if (pendingIntent == null) {
            clearPendingIf(promise)
            promise.reject(ERROR_FAILED, "Authorization resolution is unavailable", null)
            return@addOnSuccessListener
          }
          pendingPromise = promise
          try {
            activity.startIntentSenderForResult(
              pendingIntent.intentSender,
              AUTHORIZATION_REQUEST_CODE,
              null,
              0,
              0,
              0,
            )
          } catch (error: Exception) {
            clearPendingIf(promise)
            promise.reject(ERROR_FAILED, error.message ?: "Unable to open authorization", error)
          }
        } else {
          clearPendingIf(promise)
          resolveAuthorization(result, promise, accountEmail)
        }
      }
      .addOnFailureListener { error ->
        clearPendingIf(promise)
        promise.reject(ERROR_FAILED, error.message ?: "Google authorization failed", error)
      }
  }

  private fun resolveAuthorization(
    result: AuthorizationResult,
    promise: Promise,
    accountEmail: String?,
  ) {
    if (!result.grantedScopes.contains(GOOGLE_DRIVE_SCOPE)) {
      promise.reject(
        ERROR_PERMISSION_REQUIRED,
        "Google Drive access was not granted",
        null,
      )
      return
    }
    val accessToken = result.accessToken
    if (accessToken.isNullOrBlank()) {
      promise.reject(ERROR_FAILED, "Google did not return an access token", null)
      return
    }
    promise.resolve(
      mapOf(
        "accessToken" to accessToken,
        // AuthorizationResult exposes no real expiry. The old fabricated
        // "now + 55 minutes" made a revoked token look fresh for another hour
        // (phase3 finding 0001); zero tells JavaScript to revalidate through
        // Play services — a local IPC call — on every use.
        "expiresAt" to 0,
        "accountEmail" to accountEmail,
      ),
    )
  }
}
