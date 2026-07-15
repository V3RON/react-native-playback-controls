import { Image } from 'react-native';
import {
  narrowCommandEvent,
  normalizeCommandConfig,
} from './internal/commandMapping';
import NativePlaybackControls from './NativePlaybackControls';
import type { CommandConfig } from './types/CommandConfig';
import type { CommandEvent } from './types/CommandEvent';
import type { ListenerSubscription } from './types/ListenerSubscription';
import type { NowPlayingMetadata } from './types/NowPlayingMetadata';
import type { PlaybackState } from './types/PlaybackState';

function resolveArtworkUri(
  artwork: NowPlayingMetadata['artwork']
): string | undefined {
  if (artwork == null) {
    return undefined;
  }
  return typeof artwork === 'string'
    ? artwork
    : Image.resolveAssetSource(artwork)?.uri;
}

/**
 * A live system "now playing" session, returned by
 * {@linkcode PlaybackControls.startSession}. There is only ever one active
 * session per app.
 *
 * Do not construct this class yourself — the package only exports its type;
 * obtain an instance by awaiting `PlaybackControls.startSession(...)`.
 */
export class PlaybackSession {
  private readonly nativeSubscriptions = new Set<ListenerSubscription>();
  private ended = false;

  /**
   * Whether {@linkcode end} has been called on this session. Every mutating
   * method throws once this is `true`.
   */
  get isEnded(): boolean {
    return this.ended;
  }

  /**
   * Updates the metadata shown on the system now-playing UI (lock screen,
   * Control Center / notification shade, CarPlay, Android Auto).
   *
   * `artwork` is resolved before reaching native: a `require('./cover.png')`
   * asset is resolved via `Image.resolveAssetSource(...).uri`; a string
   * (remote URL or `file://` URI) passes through unchanged.
   * @throws {Error} if the session has already {@linkcode end}ed.
   */
  setNowPlaying(metadata: NowPlayingMetadata): void {
    this.assertNotEnded('setNowPlaying');
    NativePlaybackControls.setNowPlaying({
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      artworkUri: resolveArtworkUri(metadata.artwork),
      durationSec: metadata.durationSec,
      isLiveStream: metadata.isLiveStream,
    });
  }

  /**
   * Updates the playback status/position/rate reflected on the system
   * controls. `playbackRate` defaults to `1` when omitted.
   * @throws {Error} if the session has already {@linkcode end}ed.
   */
  setPlaybackState(state: PlaybackState): void {
    this.assertNotEnded('setPlaybackState');
    NativePlaybackControls.setPlaybackState({
      status: state.status,
      positionSec: state.positionSec,
      playbackRate: state.playbackRate ?? 1,
    });
  }

  /**
   * Replaces the set of remote commands enabled on the system controls.
   * String shorthands are normalized to `{ command }` objects.
   * @throws {RangeError} if a skip command's `intervalSec` isn't a finite
   * number greater than `0`.
   * @throws {Error} if the session has already {@linkcode end}ed.
   */
  setCommands(commands: CommandConfig[]): void {
    this.assertNotEnded('setCommands');
    NativePlaybackControls.setCommands(commands.map(normalizeCommandConfig));
  }

  /**
   * Subscribes to remote command presses from the system controls. The
   * native, loosely-typed event is narrowed into the exact
   * {@linkcode CommandEvent} variant for its command; command names the
   * current JS layer doesn't recognize (forward-compat with newer natives)
   * are silently dropped rather than delivered or thrown.
   * @throws {Error} if the session has already {@linkcode end}ed.
   */
  addCommandListener(
    listener: (event: CommandEvent) => void
  ): ListenerSubscription {
    this.assertNotEnded('addCommandListener');

    const nativeSubscription = NativePlaybackControls.onCommand((event) => {
      const commandEvent = narrowCommandEvent(event);
      if (commandEvent) {
        listener(commandEvent);
      }
    });

    let removed = false;
    const subscription: ListenerSubscription = {
      remove: () => {
        if (removed) {
          return;
        }
        removed = true;
        nativeSubscription.remove();
        this.nativeSubscriptions.delete(subscription);
      },
    };
    this.nativeSubscriptions.add(subscription);
    return subscription;
  }

  /**
   * Ends the session: tears down the system controls, removes every
   * subscription created via {@linkcode addCommandListener} on this handle,
   * and marks it {@linkcode isEnded}. Idempotent — a second call resolves
   * immediately without making another native call.
   */
  async end(): Promise<void> {
    if (this.ended) {
      return;
    }
    this.ended = true;
    for (const subscription of [...this.nativeSubscriptions]) {
      subscription.remove();
    }
    await NativePlaybackControls.endSession();
  }

  private assertNotEnded(method: string): void {
    if (this.ended) {
      throw new Error(
        `session-ended: cannot call ${method}() — this PlaybackSession has already ended. Start a new session via PlaybackControls.startSession().`
      );
    }
  }
}
