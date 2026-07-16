import type { ImageRequireSource } from 'react-native';

/** A single hardcoded demo track. */
export interface Track {
  title: string;
  artist: string;
  album?: string;
  /** Seconds. Drives the fake player's simulated seek bar. */
  durationSec: number;
  /** Remote URL for two tracks, a local `require()` asset for one — exercises both artwork paths. */
  artwork: string | ImageRequireSource;
}

/**
 * Hardcoded 3-track demo playlist. Track 0 uses a local `require()` asset for
 * artwork; the rest use remote URLs — together they exercise both branches of
 * {@link NowPlayingMetadata.artwork}.
 */
export const PLAYLIST: readonly Track[] = [
  {
    title: 'Analog Sunrise',
    artist: 'The Faux Signals',
    album: 'Placeholder EP',
    durationSec: 214,
    artwork: require('../assets/favicon.png'),
  },
  {
    title: 'Static Bloom',
    artist: 'Nullwave Collective',
    album: 'Silent Demo',
    durationSec: 183,
    artwork: 'https://picsum.photos/seed/static-bloom/600',
  },
  {
    title: 'Idle Horizon',
    artist: 'Mock Data Trio',
    durationSec: 260,
    artwork: 'https://picsum.photos/seed/idle-horizon/600',
  },
];
