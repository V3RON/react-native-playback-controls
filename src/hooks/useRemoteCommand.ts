import { useEffect, useRef } from 'react';
import { subscribeToCommand } from '../internal/subscribeToCommand';
import type { PlaybackSession } from '../PlaybackSession';
import type { Command } from '../types/Command';
import type { CommandEvent } from '../types/CommandEvent';

/**
 * Subscribes `handler` to a single remote {@linkcode Command} for the
 * lifetime of the component. Re-subscribes only when `session` or `command`
 * change — `handler` is kept in a ref, so passing a new inline function each
 * render does not resubscribe. Pass a `null`/`undefined` session (e.g. before
 * {@linkcode PlaybackControls.startSession} resolves) to safely no-op.
 */
export function useRemoteCommand<C extends Command>(
  session: PlaybackSession | null | undefined,
  command: C,
  handler: (event: Extract<CommandEvent, { command: C }>) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribeToCommand(session, command, (event) =>
      handlerRef.current(event)
    );
  }, [session, command]);
}
