import type {
  NativeCommandConfig,
  NativeCommandEvent,
} from '../NativePlaybackControls';
import type { CommandConfig } from '../types/CommandConfig';
import type { CommandEvent } from '../types/CommandEvent';

/**
 * Normalizes a {@linkcode CommandConfig} (string shorthand or explicit
 * object) into the loose shape the native side expects.
 * @throws {RangeError} if a skip command's `intervalSec` isn't a finite
 * number greater than `0`.
 * @internal
 */
export function normalizeCommandConfig(
  config: CommandConfig
): NativeCommandConfig {
  if (typeof config === 'string') {
    return { command: config };
  }

  if (!Number.isFinite(config.intervalSec) || config.intervalSec <= 0) {
    throw new RangeError(
      `intervalSec for command "${config.command}" must be a finite number greater than 0, received ${config.intervalSec}.`
    );
  }

  return { command: config.command, intervalSec: config.intervalSec };
}

/**
 * Narrows a loosely-typed {@linkcode NativeCommandEvent} into the exact
 * {@linkcode CommandEvent} variant for its `command`. Returns `undefined`
 * for command names/payloads the current JS layer doesn't recognize, so
 * callers can silently ignore forward-compat events from newer natives.
 * @internal
 */
export function narrowCommandEvent(
  event: NativeCommandEvent
): CommandEvent | undefined {
  switch (event.command) {
    case 'play':
    case 'pause':
    case 'toggle-play-pause':
    case 'stop':
    case 'next-track':
    case 'previous-track':
      return { command: event.command };
    case 'skip-forward':
    case 'skip-backward':
      return event.intervalSec == null
        ? undefined
        : { command: event.command, intervalSec: event.intervalSec };
    case 'seek-to':
      return event.positionSec == null
        ? undefined
        : { command: 'seek-to', positionSec: event.positionSec };
    case 'change-playback-rate':
      return event.playbackRate == null
        ? undefined
        : { command: 'change-playback-rate', playbackRate: event.playbackRate };
    default:
      return undefined;
  }
}
