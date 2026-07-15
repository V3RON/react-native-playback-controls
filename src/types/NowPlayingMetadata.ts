import type { ImageRequireSource } from 'react-native';

/**
 * Metadata for the item currently playing, shown on the lock screen, Control
 * Center / notification shade, and connected surfaces (CarPlay, Android
 * Auto). Set via {@linkcode PlaybackSession.setNowPlaying}.
 */
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
