# Task 02 — iOS implementation (MPNowPlayingInfoCenter + MPRemoteCommandCenter)

**Depends on:** 01 (spec + facade committed)
**Produces:** working iOS native module in `ios/`, Obj-C / Obj-C++ (match the
scaffold — do NOT introduce Swift).

## Architecture

- `ios/PlaybackControls.h/.mm` — Turbo Module glue only: implements the
  codegen-generated `NativePlaybackControlsSpec` protocol (generated into the
  example app's Pods as `PlaybackControlsSpec`), forwards to the manager, owns
  event emission.
- `ios/NowPlayingManager.h/.m` — plain Obj-C class owning all MediaPlayer
  framework state: the `MPNowPlayingInfoCenter` dictionary and the
  `MPRemoteCommandCenter` target registrations. Callback block
  (`onCommand:(NSDictionary *)payload`) set by the module.

**Threading:** Turbo Module methods arrive off the main thread. Every
MediaPlayer-framework access must be dispatched to the main queue
(`dispatch_async(dispatch_get_main_queue(), ...)`). Promise resolve/reject may
be called from the main queue. Keep an internal serial notion of state — the
manager is only ever touched on main.

## Command mapping

| JS command | MPRemoteCommandCenter | Event payload extras |
|---|---|---|
| `play` | `playCommand` | — |
| `pause` | `pauseCommand` | — |
| `toggle-play-pause` | `togglePlayPauseCommand` | — |
| `stop` | `stopCommand` | — |
| `next-track` | `nextTrackCommand` | — |
| `previous-track` | `previousTrackCommand` | — |
| `skip-forward` | `skipForwardCommand` (+ `preferredIntervals` = `@[interval]`) | `intervalSec` (from `MPSkipIntervalCommandEvent.interval`) |
| `skip-backward` | `skipBackwardCommand` (+ `preferredIntervals`) | `intervalSec` |
| `seek-to` | `changePlaybackPositionCommand` | `positionSec` (from `MPChangePlaybackPositionCommandEvent.positionTime`) |
| `change-playback-rate` | `changePlaybackRateCommand` | `playbackRate` (from `MPChangePlaybackRateCommandEvent.playbackRate`) |

Applying a command config (used by both `startSession` and `setCommands`):

- Enabled command: `command.enabled = YES` **and** `addTarget` returning
  `MPRemoteCommandHandlerStatusSuccess` after invoking the callback.
- Disabled (absent from config): `command.enabled = NO` **and** remove the
  previously added target (keep the returned target token / use
  `removeTarget:`). Both are required — enabled-without-target shows dead
  buttons, target-without-cleanup produces ghost callbacks after reconfig.
- `setCommands` reconciles: previously enabled commands not in the new list get
  fully disabled.

## Method semantics

- `startSession(commands)` — if already active, reject with code
  `session-already-active`. Otherwise mark active, apply the command config,
  resolve. Do NOT touch AVAudioSession anywhere (decided design constraint —
  the host app owns it).
- `endSession()` — disable+remove all commands, set
  `MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo = nil`, cancel any
  in-flight artwork fetch, mark inactive, resolve. Resolve (not reject) when no
  session is active — the facade makes `end()` idempotent.
- `setNowPlaying(info)` / `setPlaybackState(state)` / `setCommands` — if no
  session is active, no-op (log in DEBUG); the JS facade already throws for
  ended handles.
- `setNowPlaying(info)` — merge into the existing now-playing dict:
  `MPMediaItemPropertyTitle`, `MPMediaItemPropertyArtist`,
  `MPMediaItemPropertyAlbumTitle`, `MPMediaItemPropertyPlaybackDuration`,
  `MPNowPlayingInfoPropertyIsLiveStream`. Preserve previously set
  elapsed-time/rate keys.
- `setPlaybackState(state)` — set
  `MPNowPlayingInfoPropertyElapsedPlaybackTime` (when `positionSec` provided)
  and `MPNowPlayingInfoPropertyPlaybackRate`: the given rate when status is
  `playing`, `0` for `paused`/`buffering`/`stopped`. iOS interpolates the
  lock-screen scrubber from these — never poll. Also set
  `MPNowPlayingInfoCenter.playbackState` if (and only if) that property is
  available on iOS in the current SDK — verify against Apple docs; if it is
  Catalyst/macOS-only, skip it with a code comment.
- `isSessionActive()` — sync, returns the flag (plain BOOL read; no main-queue
  hop — guard with the module's own atomic/lock since sync calls run on the JS
  thread).

## Artwork loading

- Accept `https://`, `http://`, and `file://` URIs (the facade already resolved
  `require()` assets to URIs; in release builds those are file paths — handle a
  bare `/...` path by treating it as a file URL).
- Fetch async (`NSURLSession` for remote, `NSData contentsOfFile` on a
  background queue for local), then on main create
  `MPMediaItemArtwork` (`initWithBoundsSize:requestHandler:`) and merge it into
  the now-playing dict **only if** the session is still active and the artwork
  URI hasn't changed since the fetch started (track a generation counter).
- Cache: if the URI equals the last successfully applied URI, reuse the
  existing `MPMediaItemArtwork` without refetching.
- Fetch failures: keep metadata without artwork; log in DEBUG. Never reject.

## Events & lifecycle

- Emit via the codegen-generated `emitOnCommand:` (check the generated base
  class in the example Pods for the exact signature/payload type after the
  first build). Payload keys exactly: `command`, plus the extras table above.
- Implement `invalidate` (Turbo Module teardown — Metro reload): behave like
  `endSession` synchronously-on-main and drop the callback. Without this, dev
  reloads double-register targets.

## Verification / acceptance criteria

1. `yarn typecheck && yarn lint && yarn test` still pass (no JS changes
   expected beyond none).
2. Example iOS app builds:
   `cd example && npx expo prebuild --platform ios --clean`, then
   `yarn example build:ios` (pod install runs during prebuild; if not, run
   `pod install` in `example/ios`). The build compiling proves the codegen
   protocol conformance is correct.
3. `PlaybackControls.podspec` still lists all source files (add `.m` handling
   if the glob misses it).
4. Grep proves no `AVAudioSession` reference exists in `ios/`.
5. Self-review per LOOP.md, then commit (e.g. `feat: implement iOS now-playing
   session`).

**Note for handoff:** you cannot verify lock-screen behavior without real audio
playing — that is expected (Task 04's example app provides the audio-session
stand-in). Say so in the report rather than claiming runtime verification.
