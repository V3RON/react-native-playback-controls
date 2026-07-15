package com.playbackcontrols

import androidx.media3.common.Player
import androidx.media3.session.MediaSession
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToLong

/** Default skip interval used until a `skip-forward`/`skip-backward` command config overrides it. */
private const val DEFAULT_SEEK_INCREMENT_MS = 15_000L

/** One entry of the loose `NativeCommandConfig[]` sent from JS (`{ command, intervalSec? }`). */
data class CommandEntry(val command: String, val intervalSec: Double?)

/** Holder-side mirror of the last `NativeNowPlayingInfo` JS set via `setNowPlaying`. */
data class NowPlayingMetadataState(
  val title: String,
  val artist: String?,
  val album: String?,
  val artworkUri: String?,
  val durationSec: Double?,
  val isLiveStream: Boolean,
)

/** Holder-side mirror of the last `NativePlaybackState` JS set via `setPlaybackState`. */
data class PlaybackStateSnapshot(
  val status: String = "stopped",
  val positionSec: Double = 0.0,
  val playbackRate: Float = 1f,
)

/** The `Player.Commands` mask and skip increments derived from the JS command config. */
data class ResolvedCommands(
  val playerCommands: Player.Commands,
  val seekBackIncrementMs: Long,
  val seekForwardIncrementMs: Long,
)

private val EMPTY_RESOLVED_COMMANDS = ResolvedCommands(
  playerCommands = baselinePlayerCommands().build(),
  seekBackIncrementMs = DEFAULT_SEEK_INCREMENT_MS,
  seekForwardIncrementMs = DEFAULT_SEEK_INCREMENT_MS,
)

/**
 * Commands the notification/session always needs regardless of JS config: enough `COMMAND_GET_*`
 * for media3 to render the single media item, plus `COMMAND_RELEASE` so
 * [androidx.media3.common.Player.release] on [ControlsPlayer] actually runs `handleRelease()`
 * (without it in the mask, `SimpleBasePlayer.release()` is a silent no-op).
 */
private fun baselinePlayerCommands(): Player.Commands.Builder =
  Player.Commands.Builder()
    .add(Player.COMMAND_GET_CURRENT_MEDIA_ITEM)
    .add(Player.COMMAND_GET_METADATA)
    .add(Player.COMMAND_GET_TIMELINE)
    .add(Player.COMMAND_RELEASE)

/** Builds the [ResolvedCommands] the JS `CommandConfig[]` describes, on top of the baseline. */
fun resolveCommands(entries: List<CommandEntry>): ResolvedCommands {
  val builder = baselinePlayerCommands()
  var seekBackMs = DEFAULT_SEEK_INCREMENT_MS
  var seekForwardMs = DEFAULT_SEEK_INCREMENT_MS

  for (entry in entries) {
    when (entry.command) {
      "play", "pause", "toggle-play-pause" -> builder.add(Player.COMMAND_PLAY_PAUSE)
      "stop" -> builder.add(Player.COMMAND_STOP)
      "next-track" ->
        builder.add(Player.COMMAND_SEEK_TO_NEXT).add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
      "previous-track" ->
        builder
          .add(Player.COMMAND_SEEK_TO_PREVIOUS)
          .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
      "skip-forward" -> {
        builder.add(Player.COMMAND_SEEK_FORWARD)
        entry.intervalSec?.let { seekForwardMs = (it * 1000).roundToLong() }
      }
      "skip-backward" -> {
        builder.add(Player.COMMAND_SEEK_BACK)
        entry.intervalSec?.let { seekBackMs = (it * 1000).roundToLong() }
      }
      "seek-to" -> builder.add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
      "change-playback-rate" -> builder.add(Player.COMMAND_SET_SPEED_AND_PITCH)
      // Unknown command names (forward-compat with a newer JS layer) are ignored, matching
      // narrowCommandEvent()'s "drop what we don't recognize" contract on the JS side.
    }
  }

  return ResolvedCommands(builder.build(), seekBackMs, seekForwardMs)
}

/**
 * Single source of truth shared by [PlaybackControlsModule] and [PlaybackControlsService]: the
 * current session config/metadata/playback state, the live [ControlsPlayer]/[MediaSession] (once
 * the service has created them), and the event sink the module wires up to `emitOnCommand`.
 *
 * Every method that isn't explicitly a synchronous flag read (`isSessionActive`,
 * `tryActivate`/`tryDeactivate`) is only ever called from the main thread — the module hops via
 * `Handler(Looper.getMainLooper())` before touching anything else here, and media3 invokes
 * [ControlsPlayer] callbacks on the same looper it was constructed with (also main).
 */
object SessionHolder {
  private val active = AtomicBoolean(false)

  /** Set once by [PlaybackControlsModule]'s constructor; cleared by its `invalidate()`. */
  @Volatile
  var eventSink: ((WritableMap) -> Unit)? = null

  @Volatile
  var player: ControlsPlayer? = null
    private set

  @Volatile
  var mediaSession: MediaSession? = null
    private set

  var resolvedCommands: ResolvedCommands = EMPTY_RESOLVED_COMMANDS
    private set

  var metadata: NowPlayingMetadataState? = null
    private set

  var playbackState: PlaybackStateSnapshot? = null
    private set

  private var onReady: (() -> Unit)? = null

  /** Synchronous flag read — safe to call from the JS thread without hopping to main. */
  fun isSessionActive(): Boolean = active.get()

  /** Atomically claims the session; `false` means one is already active. */
  fun tryActivate(): Boolean = active.compareAndSet(false, true)

  /** Atomically releases the session; `false` means none was active (idempotent `endSession`). */
  fun tryDeactivate(): Boolean = active.compareAndSet(true, false)

  fun configureCommands(entries: List<CommandEntry>) {
    resolvedCommands = resolveCommands(entries)
  }

  fun updateMetadata(metadata: NowPlayingMetadataState) {
    this.metadata = metadata
  }

  /** Merges in fields JS omitted (`positionSec`/`playbackRate`) from the previous snapshot. */
  fun updatePlaybackState(status: String, positionSec: Double?, playbackRate: Double?) {
    val previous = playbackState
    playbackState = PlaybackStateSnapshot(
      status = status,
      positionSec = positionSec ?: previous?.positionSec ?: 0.0,
      playbackRate = (playbackRate ?: previous?.playbackRate?.toDouble() ?: 1.0).toFloat(),
    )
  }

  fun applyOptimisticStatus(status: String) {
    playbackState = (playbackState ?: PlaybackStateSnapshot()).copy(status = status)
  }

  fun applyOptimisticPositionMs(positionMs: Long) {
    playbackState =
      (playbackState ?: PlaybackStateSnapshot()).copy(positionSec = positionMs / 1000.0)
  }

  fun applyOptimisticRate(rate: Float) {
    playbackState = (playbackState ?: PlaybackStateSnapshot()).copy(playbackRate = rate)
  }

  /** Called by [PlaybackControlsService] once `onCreate` has built the player + session. */
  fun attach(player: ControlsPlayer, mediaSession: MediaSession) {
    this.player = player
    this.mediaSession = mediaSession
    val callback = onReady
    onReady = null
    callback?.invoke()
  }

  /** Called by [PlaybackControlsService] on teardown; no-ops if `session` isn't the live one. */
  fun detach(mediaSession: MediaSession) {
    if (this.mediaSession === mediaSession) {
      this.mediaSession = null
      this.player = null
    }
  }

  /** Resolves immediately if the session already exists, otherwise waits for [attach]. */
  fun awaitReady(callback: () -> Unit) {
    if (mediaSession != null) {
      callback()
    } else {
      onReady = callback
    }
  }

  /** Clears all session state but leaves [eventSink] untouched (it outlives individual sessions). */
  fun clearState() {
    player = null
    mediaSession = null
    resolvedCommands = EMPTY_RESOLVED_COMMANDS
    metadata = null
    playbackState = null
    onReady = null
  }

  /** Unconditional teardown for error paths (`invalidate()`, failed `startService`). */
  fun forceDeactivate(): Boolean {
    val wasActive = active.getAndSet(false)
    clearState()
    return wasActive
  }

  fun emit(
    command: String,
    intervalSec: Double? = null,
    positionSec: Double? = null,
    playbackRate: Double? = null,
  ) {
    val sink = eventSink ?: return
    val payload = Arguments.createMap().apply {
      putString("command", command)
      intervalSec?.let { putDouble("intervalSec", it) }
      positionSec?.let { putDouble("positionSec", it) }
      playbackRate?.let { putDouble("playbackRate", it) }
    }
    sink(payload)
  }
}
