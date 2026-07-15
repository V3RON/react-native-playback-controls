package com.playbackcontrols

import android.content.Intent
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * `MediaSessionService` that renders whatever [SessionHolder] currently holds. Runs in the app
 * process and shares state with [PlaybackControlsModule] through [SessionHolder] — there is no
 * cross-process `MediaController`.
 *
 * `onTaskRemoved`/`onDestroy` both release the session and stop the service outright (decided
 * design, see docs/IDEAS.md #5): controls must never outlive the JS that handles their presses,
 * since a killed task means the JS runtime is gone too.
 */
class PlaybackControlsService : MediaSessionService() {

  private var player: ControlsPlayer? = null
  private var mediaSession: MediaSession? = null

  override fun onCreate() {
    super.onCreate()

    // No active session to render — e.g. the OS resurrected this service after the process died
    // independently of a `startSession()` call. Refuse to stand up a session with no JS behind it.
    if (!SessionHolder.isSessionActive()) {
      stopSelf()
      return
    }

    val controlsPlayer = ControlsPlayer()
    val session = MediaSession.Builder(this, controlsPlayer).build()

    player = controlsPlayer
    mediaSession = session
    SessionHolder.attach(controlsPlayer, session)
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
    mediaSession

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    releaseSessionAndStop()
  }

  override fun onDestroy() {
    releaseSessionAndStop()
    super.onDestroy()
  }

  private fun releaseSessionAndStop() {
    mediaSession?.let { session ->
      SessionHolder.detach(session)
      session.release()
    }
    player?.release()
    player = null
    mediaSession = null
    stopSelf()
  }
}
