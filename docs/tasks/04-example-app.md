# Task 04 — Example app: fake player driving real system controls

**Depends on:** 01, 02, 03 (full library on the branch)
**Produces:** a demo in `example/` that exercises the whole API on both
platforms, including the iOS audio-session requirement.

## Why the example needs audio

iOS only shows lock-screen/Control Center controls for the app that is actually
rendering audio through an active `AVAudioSession`. The library (by design)
never touches the audio session — so the **example app** stands in for "your
real player" by looping a silent audio file via `expo-audio`. Android needs no
audio, but needs the `POST_NOTIFICATIONS` runtime permission on 13+.

## Requirements

### 1. Dependencies & config

- Add `expo-audio` (version compatible with Expo SDK 55) to
  `example/package.json`.
- `example/app.json`:
  - `ios.infoPlist.UIBackgroundModes: ["audio"]`
  - Android: add `POST_NOTIFICATIONS` to permissions (and whatever `expo-audio`
    requires per its docs, e.g. its config plugin if one exists).
- Generate a small silent audio asset `example/assets/silence.wav` (~1–5 s of
  PCM silence, < 100 KB). Write it programmatically (tiny Node script emitting
  a valid WAV header + zero samples is fine; don't commit the script, just the
  asset) or via `afconvert`/`ffmpeg` if available.

### 2. Fake player (`example/src/`)

A small in-JS "player" model — this is the thing the library pretends to
control:

- State: `status` (`playing`/`paused`/`stopped`/`buffering`), `positionSec`,
  `playbackRate`, current track index in a hardcoded 2–3 track playlist
  (titles/artists/durations + artwork URLs; one track should use a local
  `require()` asset to exercise that path).
- A 1 s interval advances `positionSec` while playing (UI only — the system
  seek bar interpolates natively; do NOT call `setPlaybackState` from the
  interval).
- While `status === 'playing'`, the silent `expo-audio` player loops; paused
  otherwise. Configure the audio mode for background playback + silent-mode
  playback per expo-audio docs (`staysActiveInBackground`, etc.).

### 3. Wiring the library

- "Start session" button → `PlaybackControls.startSession` with all commands:
  play, pause, toggle-play-pause, stop, next/previous-track,
  skip-forward/backward (15 s), seek-to, change-playback-rate.
- On every fake-player transition (play/pause/seek/track change) call
  `session.setPlaybackState` / `session.setNowPlaying` appropriately.
- Handle commands with `useRemoteCommand` (use it for at least two commands to
  demo the hook) and one catch-all `addCommandListener` that appends to an
  on-screen event log (last ~20 events with timestamps).
- "End session" button → `session.end()`; session also ended on unmount.
- Android 13+: request `POST_NOTIFICATIONS` via `PermissionsAndroid` before
  starting the session; show a hint if denied.
- Guard `startSession` rejections (`session-already-active`,
  `foreground-required`) with visible error text, not silent catch.

### 4. UI

Single screen, plain React Native components (no UI libs): artwork preview,
title/artist, position/duration text, transport buttons (play/pause, prev,
next, ±15 s), a playback-rate toggle (1x/1.5x/2x), start/end session buttons,
and the event log. Keep it clean but simple — this is a functional demo, not a
design showcase.

### 5. Example docs

`example/README.md`: how to run (`yarn example ios` / `android` after
`npx expo prebuild`), what to look for on each platform (lock screen, Control
Center, Android notification + lock screen, Bluetooth buttons), and why the
silent audio exists.

## Acceptance criteria

1. `yarn typecheck && yarn lint` pass (example is part of the workspace lint).
2. Both example builds compile:
   `cd example && npx expo prebuild --clean` then `yarn example build:ios`
   and `yarn example build:android`.
3. If a simulator/emulator is available, boot one and smoke-test: session
   starts, Android notification appears with the configured buttons, pressing
   them updates the event log. Record what you actually verified vs. couldn't
   (e.g. iOS lock screen needs a device) in the handoff.
4. The interval never calls `setPlaybackState` (grep-check your own code).
5. Self-review per LOOP.md, commit (e.g. `feat: add example app demo`).
