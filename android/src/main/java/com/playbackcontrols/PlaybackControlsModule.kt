package com.playbackcontrols

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

private const val TAG = "PlaybackControls"

private fun ReadableMap.stringOrNull(key: String): String? =
  if (hasKey(key) && !isNull(key)) getString(key) else null

private fun ReadableMap.doubleOrNull(key: String): Double? =
  if (hasKey(key) && !isNull(key)) getDouble(key) else null

private fun ReadableMap.booleanOrNull(key: String): Boolean? =
  if (hasKey(key) && !isNull(key)) getBoolean(key) else null

private fun parseCommandConfigs(commands: ReadableArray): List<CommandEntry> {
  val entries = mutableListOf<CommandEntry>()
  for (i in 0 until commands.size()) {
    val config = commands.getMap(i) ?: continue
    val command = config.stringOrNull("command") ?: continue
    entries.add(CommandEntry(command, config.doubleOrNull("intervalSec")))
  }
  return entries
}

/**
 * Turbo Module implementing the codegen-generated `NativePlaybackControlsSpec`. Validates and
 * extracts plain values from bridge types on the calling (JS) thread, then hops to main via
 * [mainHandler] before touching [SessionHolder]/[ControlsPlayer]/[PlaybackControlsService] — all
 * media3 APIs are main-thread-only.
 */
class PlaybackControlsModule(reactContext: ReactApplicationContext) :
  NativePlaybackControlsSpec(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())

  init {
    SessionHolder.eventSink = { payload -> emitOnCommand(payload) }
  }

  override fun startSession(commands: ReadableArray, promise: Promise) {
    val entries = parseCommandConfigs(commands)

    if (!SessionHolder.tryActivate()) {
      promise.reject(
        "session-already-active",
        "A playback session is already active. Call endSession() before starting a new one.",
      )
      return
    }

    val context = reactApplicationContext
    mainHandler.post {
      SessionHolder.configureCommands(entries)
      try {
        context.startService(Intent(context, PlaybackControlsService::class.java))
        SessionHolder.awaitReady { promise.resolve(null) }
      } catch (error: Exception) {
        SessionHolder.forceDeactivate()
        promise.reject(
          "foreground-required",
          "Unable to start the playback controls service. The app must be in the foreground " +
            "when calling startSession().",
          error,
        )
      }
    }
  }

  override fun endSession(promise: Promise) {
    if (!SessionHolder.tryDeactivate()) {
      // No session active — end() is idempotent per the JS facade contract.
      promise.resolve(null)
      return
    }

    val context = reactApplicationContext
    mainHandler.post {
      SessionHolder.clearState()
      context.stopService(Intent(context, PlaybackControlsService::class.java))
      promise.resolve(null)
    }
  }

  override fun setNowPlaying(info: ReadableMap) {
    if (!SessionHolder.isSessionActive()) {
      Log.d(TAG, "setNowPlaying called with no active session; ignoring.")
      return
    }

    val metadata = NowPlayingMetadataState(
      title = info.stringOrNull("title") ?: "",
      artist = info.stringOrNull("artist"),
      album = info.stringOrNull("album"),
      artworkUri = info.stringOrNull("artworkUri"),
      durationSec = info.doubleOrNull("durationSec"),
      isLiveStream = info.booleanOrNull("isLiveStream") ?: false,
    )

    mainHandler.post {
      SessionHolder.updateMetadata(metadata)
      SessionHolder.player?.refreshState()
    }
  }

  override fun setPlaybackState(state: ReadableMap) {
    if (!SessionHolder.isSessionActive()) {
      Log.d(TAG, "setPlaybackState called with no active session; ignoring.")
      return
    }

    val status = state.stringOrNull("status") ?: return
    val positionSec = state.doubleOrNull("positionSec")
    val playbackRate = state.doubleOrNull("playbackRate")

    mainHandler.post {
      SessionHolder.updatePlaybackState(status, positionSec, playbackRate)
      SessionHolder.player?.refreshState()
    }
  }

  override fun setCommands(commands: ReadableArray) {
    if (!SessionHolder.isSessionActive()) {
      Log.d(TAG, "setCommands called with no active session; ignoring.")
      return
    }

    val entries = parseCommandConfigs(commands)
    mainHandler.post {
      SessionHolder.configureCommands(entries)
      SessionHolder.player?.refreshState()
    }
  }

  override fun isSessionActive(): Boolean = SessionHolder.isSessionActive()

  // Turbo Module teardown hook, invoked on Metro reload/bridge invalidation. Without this, a dev
  // reload would leak the previous session's MediaSessionService/MediaSession and the new JS
  // bundle would find `isSessionActive()` still true with no way to recover.
  override fun invalidate() {
    super.invalidate()
    SessionHolder.eventSink = null

    if (SessionHolder.forceDeactivate()) {
      val context = reactApplicationContext
      mainHandler.post {
        context.stopService(Intent(context, PlaybackControlsService::class.java))
      }
    }
  }

  companion object {
    const val NAME = NativePlaybackControlsSpec.NAME
  }
}
