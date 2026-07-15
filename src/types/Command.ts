/**
 * Remote commands that take no configuration beyond being enabled.
 */
export type SimpleCommand =
  | 'play'
  | 'pause'
  | 'toggle-play-pause'
  | 'stop'
  | 'next-track'
  | 'previous-track'
  | 'seek-to'
  | 'change-playback-rate';

/**
 * Remote commands that require an explicit interval to be enabled — see
 * {@linkcode CommandConfig}.
 */
export type SkipCommand = 'skip-forward' | 'skip-backward';

/**
 * Every remote command a session can expose on the system controls.
 */
export type Command = SimpleCommand | SkipCommand;
