# react-native-playback-controls

Control the system media UI — the iOS lock screen / Control Center, the
Android media notification, and Bluetooth / hardware media buttons — without
this library ever playing any audio itself. It's a modern, New-Architecture,
Turbo-Module replacement for `react-native-music-control`: you own the player
(react-native-video, `expo-audio`, a native `AVPlayer`, anything), this
library owns the system-level "now playing" surface.

**New Architecture only.** There is no old-architecture fallback.

## Requirements

- React Native with the New Architecture enabled (Turbo Modules + the
  codegen `EventEmitter`). Developed and tested against **RN 0.83**; older
  0.8x versions with the New Architecture may work but aren't verified.
- iOS **15.1+** (see `PlaybackControls.podspec`).
- Android **minSdkVersion 24+** / compileSdk 36 (see `android/build.gradle`).

## Installation

```sh
yarn add react-native-playback-controls
# or: npm install react-native-playback-controls
```

```sh
cd ios && pod install
```

No other native setup is required beyond the platform sections below — the
library's `AndroidManifest.xml` and podspec are merged automatically by
autolinking.

## iOS setup

Controls only appear while your app is the system's active "Now Playing"
app, which on iOS means **an active `AVAudioSession` configured for
`.playback` and actually producing audio**. This library deliberately never
touches `AVAudioSession` — your player (react-native-video, `expo-audio`,
a native `AVPlayer`, …) owns it. If nothing is playing audio through an
active session, `MPNowPlayingInfoCenter` won't surface your metadata on the
lock screen or in Control Center, no matter how correctly you call this
library's API.

Add background audio capability so command delivery keeps working while the
app is backgrounded:

```xml
<!-- ios/YourApp/Info.plist -->
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

## Android setup

The library's manifest already merges the foreground-service permissions it
needs (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`) and
declares the `MediaSessionService`. Two things remain the app's
responsibility:

- **Request `POST_NOTIFICATIONS` at runtime on Android 13+** before calling
  `startSession` — the library deliberately never requests runtime
  permissions itself. Without it, the session still starts, but no
  notification is shown.
- **Call `startSession` while the app is in the foreground.** Starting the
  underlying foreground service from the background throws (see
  [Troubleshooting](#troubleshooting)).

Also by design: when the user swipes the app away from Android's recents
screen, the controls/notification are dismissed. Dead JS can't handle button
presses, so there's nothing to keep them alive for.

## Quick start

```tsx
import { useEffect, useState } from 'react';
import {
  PlaybackControls,
  useRemoteCommand,
  type PlaybackSession,
} from 'react-native-playback-controls';

function NowPlaying() {
  const [session, setSession] = useState<PlaybackSession | null>(null);

  useEffect(() => {
    let active = true;
    PlaybackControls.startSession({
      commands: ['play', 'pause', 'toggle-play-pause', 'stop'],
    }).then((s) => {
      if (active) {
        setSession(s);
      }
    });
    return () => {
      active = false;
      session?.end();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    session?.setNowPlaying({ title: 'Song title', artist: 'Artist name' });
    session?.setPlaybackState({ status: 'playing', positionSec: 0 });
  }, [session]);

  // iOS only delivers `toggle-play-pause`; Android always delivers
  // `play`/`pause`. Register all three to cover both platforms.
  useRemoteCommand(session, 'play', () => {
    /* resume your player */
  });
  useRemoteCommand(session, 'pause', () => {
    /* pause your player */
  });
  useRemoteCommand(session, 'toggle-play-pause', () => {
    /* toggle your player */
  });

  return null;
}
```

## API reference

### `PlaybackControls`

The entry point for the app's single system "now playing" session. Only one
session may be active at a time.

| Member | Signature | Notes |
|---|---|---|
| `startSession` | `(options: { commands: CommandConfig[] }) => Promise<PlaybackSession>` | Starts the session with the given commands enabled and returns a handle. |
| `isSessionActive` | `boolean` (getter) | Synchronous snapshot of whether a session is currently active. |

`startSession` rejects:

| `code` | When |
|---|---|
| `session-already-active` | A session is already active — call `end()` on the existing handle first. |
| `foreground-required` | *(Android)* The app wasn't in the foreground when `startSession` was called. |
| — (`RangeError`) | A `skip-forward`/`skip-backward` config's `intervalSec` isn't a finite number `> 0`. Thrown synchronously before any native call. |

### `PlaybackSession`

Returned by `startSession`. Every mutating method throws once the session
has ended.

| Method | Signature | Notes |
|---|---|---|
| `setNowPlaying` | `(metadata: NowPlayingMetadata) => void` | Updates title/artist/artwork/etc. Always pass the full object — see the platform note below. |
| `setPlaybackState` | `(state: PlaybackState) => void` | Updates status/position/rate. Call on transitions and seeks only, never on a polling timer. |
| `setCommands` | `(commands: CommandConfig[]) => void` | Replaces the enabled command set. |
| `addCommandListener` | `(listener: (event: CommandEvent) => void) => ListenerSubscription` | Subscribes to every remote command press. |
| `end` | `() => Promise<void>` | Tears down the system controls and removes this handle's listeners. Idempotent. |
| `isEnded` | `boolean` (getter) | Whether `end()` has already been called on this handle. |

Calling any mutating method (`setNowPlaying`, `setPlaybackState`,
`setCommands`, `addCommandListener`) after `end()` throws an `Error`.

### `useRemoteCommand(session, command, handler)`

```ts
function useRemoteCommand<C extends Command>(
  session: PlaybackSession | null | undefined,
  command: C,
  handler: (event: Extract<CommandEvent, { command: C }>) => void
): void;
```

Subscribes `handler` to a single command for the lifetime of the component.
Re-subscribes only when `session` or `command` change — `handler` itself can
be a fresh inline function every render. Passing `null`/`undefined` as
`session` (e.g. before `startSession` resolves) safely no-ops.

### Types

#### `Command` / `CommandConfig`

| Command | Config form | Event payload |
|---|---|---|
| `'play'` | `'play'` | `{ command: 'play' }` |
| `'pause'` | `'pause'` | `{ command: 'pause' }` |
| `'toggle-play-pause'` | `'toggle-play-pause'` | `{ command: 'toggle-play-pause' }` |
| `'stop'` | `'stop'` | `{ command: 'stop' }` |
| `'next-track'` | `'next-track'` | `{ command: 'next-track' }` |
| `'previous-track'` | `'previous-track'` | `{ command: 'previous-track' }` |
| `'skip-forward'` | `{ command: 'skip-forward', intervalSec: number }` | `{ command: 'skip-forward', intervalSec: number }` |
| `'skip-backward'` | `{ command: 'skip-backward', intervalSec: number }` | `{ command: 'skip-backward', intervalSec: number }` |
| `'seek-to'` | `'seek-to'` | `{ command: 'seek-to', positionSec: number }` |
| `'change-playback-rate'` | `'change-playback-rate'` | `{ command: 'change-playback-rate', playbackRate: number }` |

Skip commands must use the object form with an explicit `intervalSec` (the OS
displays it, e.g. "+15s"); every other command may be enabled by name alone.

#### `NowPlayingMetadata`

| Field | Type | Default | Notes |
|---|---|---|---|
| `title` | `string` | — | Required. |
| `artist` | `string?` | — | |
| `album` | `string?` | — | |
| `artwork` | `string \| ImageRequireSource` | — | Remote URL, `file://` URI, or `require('./cover.png')`. |
| `durationSec` | `number?` | — | |
| `isLiveStream` | `boolean?` | `false` | Hides/adapts the seek UI for live content. |

#### `PlaybackState`

| Field | Type | Default | Notes |
|---|---|---|---|
| `status` | `PlaybackStatus` | — | Required — `'playing' \| 'paused' \| 'stopped' \| 'buffering'`. |
| `positionSec` | `number?` | keeps last-known value | Position snapshot, not a live clock — the OS interpolates between calls. |
| `playbackRate` | `number?` | `1` | Values `< 0.01` are clamped up to `0.01` on Android (a media3 constraint). |

#### `ListenerSubscription`

`{ remove(): void }` — returned by `addCommandListener`; `remove()` is
idempotent.

## Platform behavior notes

| Behavior | iOS | Android |
|---|---|---|
| `toggle-play-pause` | Delivered as its own event. | Never delivered — the OS always sends `play`/`pause` directly. |
| `setNowPlaying` semantics | **Merges**: a field omitted from a call keeps its previous value. | **Replaces**: a field omitted from a call is cleared. |
| Position updates | Snapshot-based; the OS interpolates the seek bar between calls. Never poll — call only on transitions/seeks. | Same. |
| Button placement/order | OS-controlled. | OS-controlled. |
| `change-playback-rate` | Registers `MPRemoteCommandCenter`'s change-playback-rate command; the OS decides if/where it exposes a rate control. | Registers media3's `COMMAND_SET_PLAYBACK_SPEED`; whether/how the OS surfaces a speed control on the notification depends on the Android version and surface (phone notification, Android Auto, etc.). |
| App swiped away (task killed) | Governed by standard iOS background-audio rules, outside this library's control. | Controls are dismissed immediately (by design — dead JS can't handle presses). |
| `'stopped'` status | Sets `MPNowPlayingInfoCenter`'s playback state to stopped. | The notification stays visible in a paused state (`STATE_READY`, paused) rather than disappearing — only the pre-first-`setPlaybackState` state is `STATE_IDLE`. |

Because of the merge-vs-replace difference, the safe cross-platform contract
is: **always pass the complete `NowPlayingMetadata` object on every
`setNowPlaying` call**, even for fields that haven't changed. Relying on iOS's
merge behavior will silently drop those fields on Android.

Exactly one thing in your app should own the media session at a time. Using
this library alongside another controller of the system media UI — for
example react-native-video's `showNotificationControls` or
react-native-track-player — will produce duplicate/conflicting controls.
Pick one.

## Troubleshooting

**Controls don't show on iOS.** The app isn't the current "Now Playing" app.
Confirm you have an active `AVAudioSession` (category `.playback`) with
audio actually flowing, and that `UIBackgroundModes: audio` is set if you
need controls while backgrounded.

**No notification on Android 13+.** Request the `POST_NOTIFICATIONS`
runtime permission before calling `startSession` — the library does not
request it for you.

**`session-already-active`.** A session is already running. Call `end()` on
the existing `PlaybackSession` handle before starting a new one.

**`foreground-required`.** `startSession` was called while the app was
backgrounded on Android. Only start a session from a foreground-initiated
action.

**Controls disappear after swiping the app away (Android).** By design —
see [Platform behavior notes](#platform-behavior-notes). There is no revival
mechanism in this version.

**Buttons do nothing after a Metro reload.** This should not happen — the
native module tears itself down via `invalidate` on JS context invalidation.
If you can reproduce it, please file an issue with repro steps.

## Roadmap

Features intentionally deferred out of v1 (ratings/feedback commands, custom
notification buttons, shuffle/repeat, queue metadata, CarPlay/Android Auto
browsing, and more) are tracked in [`docs/IDEAS.md`](docs/IDEAS.md).

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
</content>
