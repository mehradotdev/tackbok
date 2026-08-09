package app

import android.app.Activity
import android.content.Intent
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val AUTHORIZATION_REQUEST_CODE = 18074
private const val ERROR_BUSY = "E_GOOGLE_AUTH_BUSY"
private const val ERROR_CANCELLED = "E_GOOGLE_AUTH_CANCELLED"
private const val ERROR_CONSENT_REQUIRED = "E_GOOGLE_AUTH_CONSENT_REQUIRED"
private const val ERROR_NO_ACTIVITY = "E_GOOGLE_AUTH_NO_ACTIVITY"
private const val ERROR_FAILED = "E_GOOGLE_AUTH_FAILED"

/**
 * Free Android authorization binding chosen by ADR 0005. It requests only
 * Drive appData plus basic identity scopes and never requests offline/server
 * access, so no client secret or refresh token exists on-device.
 */
class GoogleAuthorizationModule : Module() {
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("GoogleAuthorizationModule")

    AsyncFunction("authorize") { interactive: Boolean, promise: Promise ->
      if (pendingPromise != null) {
        promise.reject(ERROR_BUSY, "Another Google authorization is in progress", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(ERROR_NO_ACTIVITY, "No active activity", null)
        return@AsyncFunction
      }
      val request =
        AuthorizationRequest.builder()
          .setRequestedScopes(
            listOf(
              Scope("https://www.googleapis.com/auth/drive.appdata"),
              Scope("openid"),
              Scope("email"),
            ),
          )
          .build()

      Identity.getAuthorizationClient(activity)
        .authorize(request)
        .addOnSuccessListener { result ->
          if (result.hasResolution()) {
            if (!interactive) {
              promise.reject(
                ERROR_CONSENT_REQUIRED,
                "Google authorization requires interactive consent",
                null,
              )
              return@addOnSuccessListener
            }
            val pendingIntent = result.pendingIntent
            if (pendingIntent == null) {
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
              pendingPromise = null
              promise.reject(ERROR_FAILED, error.message ?: "Unable to open authorization", error)
            }
          } else {
            resolveAuthorization(result, promise)
          }
        }
        .addOnFailureListener { error ->
          promise.reject(ERROR_FAILED, error.message ?: "Google authorization failed", error)
        }
    }

    AsyncFunction("signOut") {
      // Intentionally local-only. JS deletes SecureStore state. Never call
      // AuthorizationClient.revokeAccess or Google's global revoke endpoint.
    }

    OnActivityResult { activity, (requestCode, resultCode, data) ->
      if (requestCode != AUTHORIZATION_REQUEST_CODE || pendingPromise == null) {
        return@OnActivityResult
      }
      val promise = pendingPromise!!
      pendingPromise = null
      if (resultCode != Activity.RESULT_OK) {
        promise.reject(ERROR_CANCELLED, "Google authorization was cancelled", null)
        return@OnActivityResult
      }
      try {
        val result = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)
        resolveAuthorization(result, promise)
      } catch (error: ApiException) {
        promise.reject(ERROR_FAILED, error.message ?: "Google authorization failed", error)
      }
    }

    OnDestroy {
      pendingPromise?.reject(ERROR_CANCELLED, "Google authorization was cancelled", null)
      pendingPromise = null
    }
  }

  private fun resolveAuthorization(result: AuthorizationResult, promise: Promise) {
    val accessToken = result.accessToken
    if (accessToken.isNullOrBlank()) {
      promise.reject(ERROR_FAILED, "Google did not return an access token", null)
      return
    }
    promise.resolve(
      mapOf(
        "accessToken" to accessToken,
        // Google access tokens are normally one hour; refresh five minutes early.
        "expiresAt" to (System.currentTimeMillis() + 55L * 60L * 1000L),
      ),
    )
  }
}
