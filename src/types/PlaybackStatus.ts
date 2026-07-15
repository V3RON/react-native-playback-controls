/**
 * Coarse playback status surfaced to the system "now playing" UI. Drives
 * whether the OS shows a play or pause affordance and, on some platforms,
 * a loading indicator.
 */
export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'buffering';
