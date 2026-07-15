# Task 01 — Public JS API, Turbo Module spec, and facade

**Depends on:** nothing (first task)
**Produces:** the complete TypeScript layer: codegen spec, public types, session
facade, hook, unit tests. No native code in this task.

## Goal

Replace the `multiply` scaffold with the real JS layer. The library exposes a
single system "now playing" session per app via a lifecycle handle.

## Requirements

### 1. Codegen spec — `src/NativePlaybackControls.ts`

Internal only (never re-exported from `src/index.ts` for users; it may be
imported by the facade). Codegen cannot express unions, so spec types are
deliberately loose — the facade narrows them.

```ts
import { TurboModuleRegistry, type TurboModule, type CodegenTypes } from 'react-native';

export interface NativeCommandConfig {
  command: string;
  intervalSec?: number;
}

export interface NativeNowPlayingInfo {
  title: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
  durationSec?: number;
  isLiveStream?: boolean;
}

export interface NativePlaybackState {
  status: string;
  positionSec?: number;
  playbackRate?: number;
}

export interface NativeCommandEvent {
  command: string;
  positionSec?: number;
  intervalSec?: number;
  playbackRate?: number;
}

export interface Spec extends TurboModule {
  startSession(commands: NativeCommandConfig[]): Promise<void>;
  endSession(): Promise<void>;
  setNowPlaying(info: NativeNowPlayingInfo): void;
  setPlaybackState(state: NativePlaybackState): void;
  setCommands(commands: NativeCommandConfig[]): void;
  isSessionActive(): boolean;
  readonly onCommand: CodegenTypes.EventEmitter<NativeCommandEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('PlaybackControls');
```

If the `CodegenTypes` import path differs in RN 0.83, verify against the
official docs (`react-native/Libraries/Types/CodegenTypes` is the fallback) and
use whatever the codegen actually parses.

### 2. Public types — one exported type per file under `src/types/`

```ts
// PlaybackStatus.ts
export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'buffering';

// Command.ts
export type SimpleCommand =
  | 'play' | 'pause' | 'toggle-play-pause' | 'stop'
  | 'next-track' | 'previous-track'
  | 'seek-to' | 'change-playback-rate';
export type SkipCommand = 'skip-forward' | 'skip-backward';
export type Command = SimpleCommand | SkipCommand;

// CommandConfig.ts — skip commands MUST carry an explicit interval
export type CommandConfig =
  | SimpleCommand
  | { command: SkipCommand; intervalSec: number };

// CommandEvent.ts — discriminated union, payload fields non-optional per variant
export type CommandEvent =
  | { command: 'play' } | { command: 'pause' } | { command: 'toggle-play-pause' }
  | { command: 'stop' } | { command: 'next-track' } | { command: 'previous-track' }
  | { command: 'skip-forward'; intervalSec: number }
  | { command: 'skip-backward'; intervalSec: number }
  | { command: 'seek-to'; positionSec: number }
  | { command: 'change-playback-rate'; playbackRate: number };

// NowPlayingMetadata.ts
import type { ImageRequireSource } from 'react-native';
export interface NowPlayingMetadata {
  title: string;
  artist?: string;
  album?: string;
  /** Remote URL, file:// URI, or a local `require('./cover.png')` asset. */
  artwork?: string | ImageRequireSource;
  durationSec?: number;
  /** Hides/adapts the seek UI for live content. @default false */
  isLiveStream?: boolean;
}

// PlaybackState.ts
export interface PlaybackState {
  status: PlaybackStatus;
  /** Position snapshot. When omitted, the platform keeps the last known position. */
  positionSec?: number;
  /** @default 1 */
  playbackRate?: number;
}

// ListenerSubscription.ts
export interface ListenerSubscription {
  /** Idempotent. */
  remove(): void;
}
```

### 3. Session handle — `src/PlaybackSession.ts`

A class users receive but never construct (constructor not exported / marked
`@internal`; only the type is exported from the index).

- `setNowPlaying(metadata: NowPlayingMetadata): void` — resolves `artwork`:
  numbers go through `Image.resolveAssetSource(...)` → `.uri`; strings pass
  through unchanged; result maps to `artworkUri`.
- `setPlaybackState(state: PlaybackState): void` — applies `playbackRate`
  default of 1 in the facade (the natives receive resolved values).
- `setCommands(commands: CommandConfig[]): void` — normalizes string shorthands
  to `{ command }` objects; validates `intervalSec > 0` (throw `RangeError`).
- `addCommandListener(listener: (event: CommandEvent) => void): ListenerSubscription`
  — subscribes to the spec's `onCommand` emitter; narrows `NativeCommandEvent`
  into the `CommandEvent` union (build the exact variant per `command`, dropping
  irrelevant fields). Unknown command strings from native are ignored
  (forward-compat with newer natives), not thrown.
- `end(): Promise<void>` — calls `endSession()`, removes all of this session's
  native subscriptions, marks the handle ended. Idempotent (second call
  resolves immediately).
- `readonly isEnded: boolean`.
- Every mutating method on an ended session throws
  `Error('session-ended: ...')` with a helpful message.

### 4. Root — `src/PlaybackControls.ts`

```ts
export const PlaybackControls: {
  /** Rejects with code 'session-already-active' if a session exists. */
  startSession(options: { commands: CommandConfig[] }): Promise<PlaybackSession>;
  readonly isSessionActive: boolean; // getter → native sync isSessionActive()
};
```

`startSession` performs the same command normalization/validation as
`setCommands`, awaits the native start, then returns a fresh handle.

### 5. Hook — `src/hooks/useRemoteCommand.ts`

```ts
export function useRemoteCommand<C extends Command>(
  session: PlaybackSession | null | undefined,
  command: C,
  handler: (event: Extract<CommandEvent, { command: C }>) => void,
): void;
```

Subscribe in `useEffect` keyed on `[session, command]`; keep `handler` in a ref
so re-renders don't resubscribe; remove the subscription on cleanup.

### 6. Index & cleanup

- `src/index.ts(x)`: direct re-exports only (`export type { ... } from`,
  `export { PlaybackControls } from ...`, `export { useRemoteCommand }`,
  `export type { PlaybackSession }`). Delete `src/multiply.tsx`,
  `src/multiply.native.tsx`, and the old test.
- JSDoc every export per LOOP.md; link related symbols with `{@linkcode ...}`.

### 7. Unit tests — `src/__tests__/`

Mock the spec module (`jest.mock('../NativePlaybackControls', ...)` with a fake
emitter). Cover at least:

- `startSession` normalizes shorthand + skip configs; rejects invalid interval.
- Double `startSession` propagates the native rejection.
- Artwork: `require()` number resolves via `Image.resolveAssetSource`; string
  URL passes through.
- Event narrowing: native `{command:'seek-to',positionSec:12.5}` reaches the
  listener as the exact variant; unknown command is dropped silently.
- `end()` idempotent; post-`end` mutations throw; subscription `remove()`
  idempotent and stops delivery.
- `useRemoteCommand` (React Testing Library is not installed — test via a tiny
  react-test-renderer harness or restructure so the subscription logic is a
  plain function tested directly; add dev-deps only if unavoidable).

## Acceptance criteria

1. `yarn typecheck`, `yarn lint`, `yarn test` all pass.
2. `src/index` exports exactly: `PlaybackControls`, `useRemoteCommand`, and the
   public types above (plus `PlaybackSession` as type). No `multiply` remnants
   anywhere (grep for it).
3. The spec file parses under codegen conventions: named `Native*.ts`, default
   export via `TurboModuleRegistry.getEnforcing`, no union types, no imports of
   non-codegen types.
4. All exported symbols have JSDoc.
5. Committed per LOOP.md.
