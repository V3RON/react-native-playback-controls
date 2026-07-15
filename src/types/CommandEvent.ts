/**
 * A remote command press, narrowed into the exact variant for `command` with
 * only the fields that variant carries. Delivered via
 * {@linkcode PlaybackSession.addCommandListener} or {@linkcode useRemoteCommand}.
 */
export type CommandEvent =
  | { command: 'play' }
  | { command: 'pause' }
  | { command: 'toggle-play-pause' }
  | { command: 'stop' }
  | { command: 'next-track' }
  | { command: 'previous-track' }
  | { command: 'skip-forward'; intervalSec: number }
  | { command: 'skip-backward'; intervalSec: number }
  | { command: 'seek-to'; positionSec: number }
  | { command: 'change-playback-rate'; playbackRate: number };
