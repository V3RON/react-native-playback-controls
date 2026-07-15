import { normalizeCommandConfig } from './internal/commandMapping';
import NativePlaybackControls from './NativePlaybackControls';
import { PlaybackSession } from './PlaybackSession';
import type { CommandConfig } from './types/CommandConfig';

/**
 * Entry point for the app's single system "now playing" session
 * (iOS: `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`; Android: a
 * media3 `MediaSessionService`). Only one session may be active at a time.
 */
export const PlaybackControls: {
  /**
   * Starts the system "now playing" session with the given commands
   * enabled, then returns a handle to it.
   * @throws Rejects with a {@link RangeError}, before any native call is
   * made, if a skip command's `intervalSec` isn't a finite number greater
   * than `0`.
   * @throws Rejects with an error whose `code` is `'session-already-active'`
   * if a session is already active — {@linkcode PlaybackSession.end} it
   * first.
   */
  startSession(options: {
    commands: CommandConfig[];
  }): Promise<PlaybackSession>;
  /** Synchronous snapshot of whether a session is currently active. */
  readonly isSessionActive: boolean;
} = {
  async startSession({ commands }) {
    const nativeCommands = commands.map(normalizeCommandConfig);
    await NativePlaybackControls.startSession(nativeCommands);
    return new PlaybackSession();
  },
  get isSessionActive(): boolean {
    return NativePlaybackControls.isSessionActive();
  },
};
