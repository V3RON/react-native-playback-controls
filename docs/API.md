# API reference

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
| `playbackRate` | `number?` | `1` | Values `< 0.01` are clamped up to `0.01` on Android. |

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
| `change-playback-rate` | The OS decides if/where it exposes a rate control. | Whether/how the OS surfaces a speed control on the notification depends on the Android version and surface (phone notification, Android Auto, etc.). |
| App swiped away (task killed) | Governed by standard iOS background-audio rules, outside this library's control. | Controls are dismissed immediately (by design — dead JS can't handle presses). |
| `'stopped'` status | Sets the playback state to stopped. | The notification stays visible in a paused state rather than disappearing. |

Because of the merge-vs-replace difference, the safe cross-platform contract
is: **always pass the complete `NowPlayingMetadata` object on every
`setNowPlaying` call**, even for fields that haven't changed. Relying on iOS's
merge behavior will silently drop those fields on Android.

Exactly one thing in your app should own the media session at a time. Using
this library alongside another controller of the system media UI — for
example react-native-video's `showNotificationControls` or
react-native-track-player — will produce duplicate/conflicting controls.
Pick one.
