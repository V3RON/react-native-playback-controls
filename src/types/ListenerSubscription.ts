/**
 * Handle returned by subscription APIs (e.g.
 * {@linkcode PlaybackSession.addCommandListener}) used to stop receiving
 * events.
 */
export interface ListenerSubscription {
  /** Idempotent. */
  remove(): void;
}
