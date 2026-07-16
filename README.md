# react-native-playback-controls

[![npm version](https://img.shields.io/npm/v/react-native-playback-controls.svg)](https://www.npmjs.com/package/react-native-playback-controls)
[![license](https://img.shields.io/npm/l/react-native-playback-controls.svg)](./LICENSE)

Control the system media UI — the iOS lock screen / Control Center, the
Android media notification, and Bluetooth / hardware media buttons — without
this library ever playing any audio itself. It's a modern, New-Architecture,
Turbo-Module replacement for `react-native-music-control`: you own the player
(react-native-video, `expo-audio`, a native `AVPlayer`, anything), this
library owns the system-level "now playing" surface.

- Lock screen and Control Center controls on iOS
- Media notification on Android
- Bluetooth / hardware media button handling
- New Architecture (Turbo Modules) only — no old-architecture fallback

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

No other native setup is required beyond the platform sections below.

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

The required foreground-service permissions and manifest declarations are
handled automatically. Two things remain the app's responsibility:

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

`PlaybackControls.startSession(options)` starts the single app-wide "now
playing" session; the returned `PlaybackSession` exposes `setNowPlaying`,
`setPlaybackState`, `setCommands`, and `addCommandListener`. The
`useRemoteCommand(session, command, handler)` hook subscribes to a single
command for the lifetime of a component.

```tsx
const session = await PlaybackControls.startSession({
  commands: ['play', 'pause', 'toggle-play-pause', 'stop'],
});

session.setNowPlaying({ title: 'Song title', artist: 'Artist name' });
session.setPlaybackState({ status: 'playing', positionSec: 0 });
```

Full method signatures, error codes, type definitions (`CommandConfig`,
`NowPlayingMetadata`, `PlaybackState`, ...), and iOS/Android behavior
differences (e.g. `setNowPlaying` merge-vs-replace semantics, how
`toggle-play-pause` is delivered) are documented in
[`docs/API.md`](docs/API.md).

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
see the "app swiped away" behavior in [`docs/API.md`](docs/API.md). There is
no revival mechanism in this version.

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
