import type { PlaybackSession } from '../PlaybackSession';
import type { Command } from '../types/Command';
import type { CommandEvent } from '../types/CommandEvent';

/**
 * Subscribes `handler` to a single {@linkcode Command} on `session`,
 * filtering out every other command. Returns an unsubscribe function; a
 * no-op session (`null`/`undefined`/already-ended) yields a no-op
 * unsubscribe instead of throwing, so it's safe to call unconditionally from
 * a `useEffect`.
 *
 * Extracted from {@linkcode useRemoteCommand} so the subscription logic can
 * be unit tested without a React renderer.
 * @internal
 */
export function subscribeToCommand<C extends Command>(
  session: PlaybackSession | null | undefined,
  command: C,
  handler: (event: Extract<CommandEvent, { command: C }>) => void
): () => void {
  if (!session || session.isEnded) {
    return () => {};
  }

  const subscription = session.addCommandListener((event) => {
    if (event.command === command) {
      handler(event as Extract<CommandEvent, { command: C }>);
    }
  });

  return () => subscription.remove();
}
