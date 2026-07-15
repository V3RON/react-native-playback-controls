package com.playbackcontrols

import android.net.Uri
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlin.math.roundToLong

/** Stable, arbitrary identity for the single [SimpleBasePlayer.MediaItemData] this player ever exposes. */
private const val MEDIA_ITEM_ID = "now-playing"

/**
 * `PlaybackParameters(speed)` throws `IllegalArgumentException` for `speed <= 0`, but
 * `PlaybackState.playbackRate` isn't validated by the JS facade (unlike `intervalSec`) — clamp
 * rather than let a `0`/negative rate crash the app on the main thread.
 */
private const val MIN_PLAYBACK_SPEED = 0.01f

/**
 * `SimpleBasePlayer` facade over JS-driven playback state.
 *
 * [getState] always renders exactly what [SessionHolder] last had set by JS (`setNowPlaying` /
 * `setPlaybackState` / `setCommands`) — it never invents state. The `handle*` overrides below emit
 * a JS event for the press and nudge [SessionHolder]'s state optimistically (so the notification
 * feels responsive while the JS round-trip is in flight); JS remains the source of truth and
 * reconciles the real value via `setPlaybackState` on its next call.
 *
 * Constructed with [Looper.getMainLooper]: every `SimpleBasePlayer` entry point (`getState`,
 * every `handle*`, `invalidateState`) is invoked by media3 on that looper, so everything here runs
 * on the main thread — matching [SessionHolder]'s single-threaded-after-main-hop contract.
 */
class ControlsPlayer : SimpleBasePlayer(Looper.getMainLooper()) {

  /** Public wrapper — [invalidateState] is `protected` on the base class. */
  fun refreshState() {
    invalidateState()
  }

  override fun getState(): State {
    val builder = State.Builder()
      .setAvailableCommands(SessionHolder.resolvedCommands.playerCommands)
      .setSeekBackIncrementMs(SessionHolder.resolvedCommands.seekBackIncrementMs)
      .setSeekForwardIncrementMs(SessionHolder.resolvedCommands.seekForwardIncrementMs)

    val metadata = SessionHolder.metadata
      // No `setNowPlaying` yet — empty playlist requires STATE_IDLE/STATE_ENDED.
      ?: return builder.setPlaybackState(Player.STATE_IDLE).build()

    builder.setPlaylist(listOf(buildMediaItemData(metadata))).setCurrentMediaItemIndex(0)

    val playback = SessionHolder.playbackState
      // Metadata is known but JS hasn't called `setPlaybackState` yet — still IDLE; see the
      // comment below for why every later state avoids IDLE.
      ?: return builder.setPlaybackState(Player.STATE_IDLE).build()

    val playWhenReady = playback.status == "playing"
    val positionMs = (playback.positionSec * 1000).roundToLong()
    val positionSupplier = if (playWhenReady) {
      PositionSupplier.getExtrapolating(positionMs, playback.playbackRate)
    } else {
      PositionSupplier.getConstant(positionMs)
    }

    return builder
      .setPlayWhenReady(playWhenReady, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      // `playing`/`paused`/`stopped` all map to STATE_READY (`buffering` -> STATE_BUFFERING).
      // STATE_IDLE is reserved for "JS hasn't set a playback state yet" above — reusing it for
      // `stopped` would tear the notification down mid-session on every JS-initiated stop.
      .setPlaybackState(
        if (playback.status == "buffering") Player.STATE_BUFFERING else Player.STATE_READY
      )
      .setContentPositionMs(positionSupplier)
      .setPlaybackParameters(
        PlaybackParameters(playback.playbackRate.coerceAtLeast(MIN_PLAYBACK_SPEED))
      )
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    SessionHolder.emit(if (playWhenReady) "play" else "pause")
    SessionHolder.applyOptimisticStatus(if (playWhenReady) "playing" else "paused")
    invalidateState()
    return Futures.immediateVoidFuture()
  }

  override fun handleStop(): ListenableFuture<*> {
    SessionHolder.emit("stop")
    SessionHolder.applyOptimisticStatus("stopped")
    invalidateState()
    return Futures.immediateVoidFuture()
  }

  override fun handleSeek(
    mediaItemIndex: Int,
    positionMs: Long,
    seekCommand: Int,
  ): ListenableFuture<*> {
    when (seekCommand) {
      Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM ->
        SessionHolder.emit("next-track")

      Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM ->
        SessionHolder.emit("previous-track")

      Player.COMMAND_SEEK_FORWARD -> {
        SessionHolder.emit(
          "skip-forward",
          intervalSec = SessionHolder.resolvedCommands.seekForwardIncrementMs / 1000.0,
        )
        SessionHolder.applyOptimisticPositionMs(positionMs)
      }

      Player.COMMAND_SEEK_BACK -> {
        SessionHolder.emit(
          "skip-backward",
          intervalSec = SessionHolder.resolvedCommands.seekBackIncrementMs / 1000.0,
        )
        SessionHolder.applyOptimisticPositionMs(positionMs)
      }

      Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM -> {
        SessionHolder.emit("seek-to", positionSec = positionMs / 1000.0)
        SessionHolder.applyOptimisticPositionMs(positionMs)
      }

      // Not one of the seek commands we enable — nothing to forward to JS.
      else -> return Futures.immediateVoidFuture()
    }
    invalidateState()
    return Futures.immediateVoidFuture()
  }

  override fun handleSetPlaybackParameters(
    playbackParameters: PlaybackParameters
  ): ListenableFuture<*> {
    SessionHolder.emit("change-playback-rate", playbackRate = playbackParameters.speed.toDouble())
    SessionHolder.applyOptimisticRate(playbackParameters.speed)
    invalidateState()
    return Futures.immediateVoidFuture()
  }

  // Required so that `Player.release()` (which no-ops unless COMMAND_RELEASE is in the available
  // mask — see SessionHolder's baseline commands) actually runs. No extra cleanup needed here:
  // real teardown happens in PlaybackControlsService/SessionHolder.
  override fun handleRelease(): ListenableFuture<*> = Futures.immediateVoidFuture()

  private fun buildMediaItemData(metadata: NowPlayingMetadataState): MediaItemData {
    val mediaMetadata = MediaMetadata.Builder()
      .setTitle(metadata.title)
      .setArtist(metadata.artist)
      .setAlbumTitle(metadata.album)
      .apply {
        metadata.artworkUri?.let { setArtworkUri(Uri.parse(it)) }
      }
      .build()

    // Live streams never report a finite duration; media3 uses `isDynamic` to render the
    // "live" affordance on the seek bar instead of a fixed-length scrubber.
    val durationUs = if (!metadata.isLiveStream && metadata.durationSec != null) {
      (metadata.durationSec * 1_000_000).roundToLong()
    } else {
      C.TIME_UNSET
    }

    return MediaItemData.Builder(MEDIA_ITEM_ID)
      .setMediaItem(
        MediaItem.Builder().setMediaId(MEDIA_ITEM_ID).setMediaMetadata(mediaMetadata).build()
      )
      .setMediaMetadata(mediaMetadata)
      .setDurationUs(durationUs)
      .setIsDynamic(metadata.isLiveStream)
      .setIsSeekable(true)
      .build()
  }
}
