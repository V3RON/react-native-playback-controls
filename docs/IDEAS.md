# Ideas & Follow-up Tasks

Features intentionally left out of v1, with enough context to pick them up later
without re-deriving the design. The v1 API was shaped so that each of these can
land as a **minor** release (additive), not a breaking change.

## 1. Ratings / feedback commands (like, dislike, bookmark)

**What:** Let users rate the current item straight from the system controls.

- **iOS:** maps 1:1 to `MPRemoteCommandCenter` feedback commands
  (`likeCommand`, `dislikeCommand`, `bookmarkCommand`), including
  `localizedTitle` and the `active` state.
- **Android:** no native equivalent — must be emulated with custom
  notification buttons (see below), or skipped.

**API sketch:** new `Command` variants (`'like' | 'dislike' | 'bookmark'`) plus a
config object carrying `title` and `isActive`. Document clearly that Android
support depends on the custom-buttons feature.

**Blocked by:** custom buttons (task 2) for Android parity.

## 2. Custom notification buttons (Android)

**What:** App-defined extra buttons in the media notification / system controls.

- **Android:** media3 `CommandButton` + `MediaSession.setCustomLayout` with
  custom `SessionCommand`s. Android 13+ places custom buttons after the
  transport controls; ordering/placement is OS-controlled.
- **iOS:** no equivalent — the lock screen only shows system commands.
  Degrade gracefully (buttons simply don't appear); do not throw.

**API sketch:**

```ts
{ command: 'custom', id: 'sleep-timer', title: 'Sleep timer', icon: require('./moon.png') }
// event: { command: 'custom', id: 'sleep-timer' }
```

**Pitfalls noted during v1 design:** icons must be Android drawable resources or
bitmaps (resolve via `Image.resolveAssetSource`); compact-view button slots are
limited; custom `SessionCommand`s must be declared in `onConnect`'s available
session commands or presses are silently dropped.

## 3. Shuffle & repeat mode commands

**What:** `change-shuffle-mode` and `change-repeat-mode` commands plus the
corresponding display state.

- **iOS:** `changeShuffleModeCommand` / `changeRepeatModeCommand`.
- **Android:** `COMMAND_SET_SHUFFLE_MODE` / `COMMAND_SET_REPEAT_MODE` on the
  `SimpleBasePlayer` state (`handleSetShuffleModeEnabled`, `handleSetRepeatMode`).

**API sketch:** new command variants with typed payloads
(`{ command: 'change-repeat-mode', mode: 'off' | 'one' | 'all' }`), and new
optional fields on `PlaybackState` (`shuffleEnabled`, `repeatMode`) so the
system UI reflects the current mode. Cross-platform mapping is clean; this is
low-hanging fruit once there's demand.

## 4. Queue / chapter metadata

**What:** Expose queue position ("track 3 of 12") and chapter info.

- **iOS:** `MPNowPlayingInfoPropertyPlaybackQueueIndex` / `...QueueCount`,
  `MPNowPlayingInfoPropertyChapterNumber` / `...ChapterCount`.
- **Android:** media3 timeline with multiple `MediaItem`s in the
  `SimpleBasePlayer` state; also feeds Android Auto browsing later.

**API sketch:** optional `queue: { index: number; count: number }` on
`NowPlayingMetadata`. Full queue objects (list of items with own metadata) are a
bigger step — only needed if we pursue Android Auto / CarPlay (task 8).

## 5. Headless revival on Android (controls survive app kill)

**What:** v1 dismisses controls in `onTaskRemoved` (decided 2026-07-15) because
dead JS can't handle presses. The alternative: keep the `MediaSessionService`
alive and revive JS via a Headless JS task when a command arrives.

**Why deferred:** significant complexity — Headless JS startup latency makes the
first press feel dead; FGS restart restrictions apply; state (metadata,
handlers) must be re-registered by the revived JS before the press can be
handled. Realistically requires a persisted "session descriptor" and an app-side
headless entry point.

**Revisit if:** users demand parity with react-native-track-player's background
behavior. Consider documenting "use a full playback library if you need this"
instead of building it.

## 6. AVAudioSession helper (iOS)

**What:** v1 deliberately never touches `AVAudioSession` (app/audio library owns
it — decided 2026-07-15). A future opt-in helper could cover apps whose player
doesn't configure the session:

```ts
await PlaybackControls.activateAudioSession(); // sets .playback + setActive(true)
```

**Constraints:** must stay strictly opt-in, documented as mutually exclusive
with players that manage the session themselves; consider surfacing
interruption events (`AVAudioSession.interruptionNotification`) if we go here.

## 7. Declarative React component

**What:** `<NowPlayingSession metadata={…} state={…} commands={…} onCommand={…} />`
as a wrapper over the imperative core, for apps that keep playback state in
React. Rejected as the *primary* API (hides lifecycle, awkward outside React),
but fine as an additive convenience once the imperative API is stable. Hooks
(`useRemoteCommand`) ship in v1; the component builds on the same session handle.

## 8. CarPlay / Android Auto / Wear surfaces

**What:** The v1 session already propagates to CarPlay Now Playing and Android
Auto's playback screen "for free" (both read the system session). Going further
means browsable content:

- **Android:** upgrade `MediaSessionService` → `MediaLibraryService` with a
  content tree (`onGetLibraryRoot`, `onGetChildren`).
- **iOS:** CarPlay audio app entitlement + `CPNowPlayingTemplate` /
  `CPListTemplate` scene setup.

**Why deferred:** large surface, needs a real content-browsing API design, and
the entitlement/manifest requirements are app-level. Verify first that the v1
session displays correctly in CarPlay/Auto and document that.

## 9. External playback-state observation

**What:** Events for things the system does *to* the session: notification
dismissed, session released, audio-route changes (headphones unplugged →
usually a pause command anyway). Small additive listener API
(`session.addLifecycleListener`) if real use cases appear.

## 10. tvOS / macOS (Catalyst) / visionOS support

**What:** `MPNowPlayingInfoCenter` / `MPRemoteCommandCenter` exist on all Apple
platforms; enabling is mostly podspec `s.platforms` plus testing. Do it when a
consumer actually asks — untested platform claims are worse than none.

## 11. Interop guard against duplicate MediaSessions

**What:** The #1 foreseeable support issue: the app's audio library
(react-native-video `showNotificationControls`, react-native-track-player, …)
also creates a session, producing duplicate controls. Beyond documentation,
a dev-mode Android check could detect another active `MediaSession` in the
process and warn. Low effort, high support-ticket savings; needs research on
detection reliability first.
