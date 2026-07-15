import type { PlaybackStatus } from './PlaybackStatus';

/**
 * Current playback state reflected on the system controls. Set via
 * {@linkcode PlaybackSession.setPlaybackState}.
 */
export interface PlaybackState {
  status: PlaybackStatus;
  /** Position snapshot. When omitted, the platform keeps the last known position. */
  positionSec?: number;
  /** @default 1 */
  playbackRate?: number;
}
