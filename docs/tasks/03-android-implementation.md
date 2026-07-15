# Task 03 — Android implementation (media3 MediaSessionService + SimpleBasePlayer)

**Depends on:** 01 (spec + facade committed); 02 is independent but will already
be on the branch.
**Produces:** working Android native module in `android/`, Kotlin, media3.

## Architecture

Everything runs in the app process; no IPC `MediaController` — module and
service share state through a singleton.

- `PlaybackControlsModule.kt` — implements the codegen-generated
  `NativePlaybackControlsSpec`. Validates, hops to the main thread
  (`Handler(Looper.getMainLooper())`), forwards to the holder, emits
  `emitOnCommand` events. Implements `invalidate()` → end session (dev-reload
  safety).
- `SessionHolder.kt` — `object` singleton: current config, metadata, playback
  state, references to the live `ControlsPlayer`/`MediaSession`, and the
  event sink (set by the module). Single source of truth both the module and
  the service read.
- `ControlsPlayer.kt` — `SimpleBasePlayer` subclass. Its `getState()` renders
  exactly what JS last set; its `handle*` methods emit JS events (via the
  holder's sink) and update local state optimistically so notification buttons
  feel responsive. JS remains the source of truth and reconciles via
  `setPlaybackState`.
- `PlaybackControlsService.kt` — `MediaSessionService`. `onCreate` builds the
  player + `MediaSession` from the holder; `onGetSession` returns it;
  `onTaskRemoved` **releases the session and stops itself** (decided design:
  controls must never outlive the JS that handles them); `onDestroy` releases
  everything and clears the holder references.

## Gradle & manifest

- `android/build.gradle`: add `androidx.media3:media3-session:<latest stable 1.x>`
  — check the current version on maven.google.com / the media3 releases page.
- `android/src/main/AndroidManifest.xml`:
  - `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`
  - `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />`
  - the service, exported with
    `android:foregroundServiceType="mediaPlayback"` and intent-filter action
    `androidx.media3.session.MediaSessionService`.
  - Do NOT add `POST_NOTIFICATIONS` here — requesting it is the app's job
    (Task 04/05 handle the example + docs).

## Player state mapping (`SimpleBasePlayer.State`)

- Playlist: a single `MediaItemData` whose `MediaMetadata` carries title,
  artist, album, duration (`durationUs`), and `artworkUri` (media3's default
  bitmap loader fetches it for the notification — verify `file://` URIs load;
  if not, plug a suitable `BitmapLoader` into the session).
- `playWhenReady`: `status == 'playing'`.
- `playbackState`: `STATE_READY` for playing/paused, `STATE_BUFFERING` for
  buffering, `STATE_READY` + paused for `stopped` too — using `STATE_IDLE`
  would tear the notification down mid-session; keep IDLE only before the
  first `setPlaybackState`. Note this choice in code.
- Position: use `PositionSupplier.getExtrapolating(positionMs, playbackRate)`
  while playing and a constant supplier while paused, so media3 interpolates
  the seek bar without JS polling.
- `seekBackIncrementMs` / `seekForwardIncrementMs`: from the skip command
  configs (media3 renders these on the seek-back/forward buttons).
- Available commands: build a `Player.Commands` mask strictly from the JS
  command config (Android 13+ derives the visible buttons from it). Include
  `COMMAND_GET_*` basics needed for the notification to render; map:
  - `play`/`pause`/`toggle-play-pause` → `COMMAND_PLAY_PAUSE`
  - `stop` → `COMMAND_STOP`
  - `next-track` → `COMMAND_SEEK_TO_NEXT` (+ `_MEDIA_ITEM` variant)
  - `previous-track` → `COMMAND_SEEK_TO_PREVIOUS` (+ variant)
  - `skip-forward` → `COMMAND_SEEK_FORWARD`
  - `skip-backward` → `COMMAND_SEEK_BACK`
  - `seek-to` → `COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM`
  - `change-playback-rate` → `COMMAND_SET_SPEED_AND_PITCH`

Command config changes (`setCommands`) update holder state and call
`invalidateState()` on the player.

## Handler → JS event mapping

Emit payload keys exactly `command` (+ extras), matching Task 01's
`NativeCommandEvent`:

| SimpleBasePlayer handler | Emitted event |
|---|---|
| `handleSetPlayWhenReady(true)` | `{command:'play'}` |
| `handleSetPlayWhenReady(false)` | `{command:'pause'}` |
| `handleStop()` | `{command:'stop'}` |
| `handleSeek(..., COMMAND_SEEK_TO_NEXT*)` | `{command:'next-track'}` |
| `handleSeek(..., COMMAND_SEEK_TO_PREVIOUS*)` | `{command:'previous-track'}` |
| `handleSeek(..., COMMAND_SEEK_FORWARD)` | `{command:'skip-forward', intervalSec: <configured>}` |
| `handleSeek(..., COMMAND_SEEK_BACK)` | `{command:'skip-backward', intervalSec: <configured>}` |
| `handleSeek(..., positionMs, COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)` | `{command:'seek-to', positionSec: positionMs / 1000.0}` |
| `handleSetPlaybackParameters(p)` | `{command:'change-playback-rate', playbackRate: p.speed}` |

Verify the exact `handleSeek` signature/dispatch against the installed media3
version — the seek routing has changed across releases. `toggle-play-pause` has
no Android equivalent; the system always sends play or pause (document nothing
here — Task 05 covers docs).

## Method semantics

- `startSession(commands)` — reject `session-already-active` if active. Store
  config in the holder, then start the service via `context.startService`
  (the app is foregrounded when this is called; media3 promotes to FGS when
  the player reports playing). If `startService` throws
  (background start restriction), reject with code `foreground-required`.
  Resolve once the service is created and the session exists (holder can
  expose a completion callback; don't poll).
- `endSession()` — clear holder, release session, stop service, resolve;
  resolve silently when nothing is active.
- `setNowPlaying` / `setPlaybackState` — update holder, `invalidateState()` on
  main. No-op (DEBUG log) when inactive.
- `isSessionActive()` — sync read of a volatile/atomic flag.
- Module `invalidate()` — same as `endSession` (fire-and-forget), plus clear
  the event sink.

## Verification / acceptance criteria

1. `yarn typecheck && yarn lint && yarn test` pass.
2. Example Android app builds:
   `cd example && npx expo prebuild --platform android --clean`, then
   `yarn example build:android`. This compiles the Kotlin against the
   generated spec — it must succeed.
3. Manifest merge is valid (the assembleDebug above proves it).
4. No `POST_NOTIFICATIONS` in the library manifest; no AVAudioSession-style
   session grabbing beyond the media3 session itself.
5. Self-review per LOOP.md (threading: every media3 touch on main; no leaked
   holder references after `onDestroy`), then commit
   (e.g. `feat: implement Android media session service`).
