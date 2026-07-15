import type { SimpleCommand, SkipCommand } from './Command';

/**
 * Enables a single remote command on the system controls. Most commands are
 * enabled by name alone; {@linkcode SkipCommand} variants must carry an
 * explicit `intervalSec` (the OS displays it, e.g. "+15s" / "-15s") and
 * therefore require the object form.
 */
export type CommandConfig =
  SimpleCommand | { command: SkipCommand; intervalSec: number };
