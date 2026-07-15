import {
  TurboModuleRegistry,
  type TurboModule,
  type CodegenTypes,
} from 'react-native';

/**
 * Codegen-facing command descriptor. Loose by design — codegen cannot express
 * unions, so this collapses {@linkcode CommandConfig} into a single shape;
 * the facade narrows/validates it before it ever reaches JS consumers.
 * @internal
 */
export interface NativeCommandConfig {
  command: string;
  intervalSec?: number;
}

/**
 * Codegen-facing now-playing metadata. See {@linkcode NowPlayingMetadata} for
 * the public, richer shape this is derived from.
 * @internal
 */
export interface NativeNowPlayingInfo {
  title: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
  durationSec?: number;
  isLiveStream?: boolean;
}

/**
 * Codegen-facing playback state. See {@linkcode PlaybackState} for the
 * public shape this is derived from.
 * @internal
 */
export interface NativePlaybackState {
  status: string;
  positionSec?: number;
  playbackRate?: number;
}

/**
 * Codegen-facing command event payload emitted by native. See
 * {@linkcode CommandEvent} for the public discriminated union this is
 * narrowed into.
 * @internal
 */
export interface NativeCommandEvent {
  command: string;
  positionSec?: number;
  intervalSec?: number;
  playbackRate?: number;
}

/** @internal */
export interface Spec extends TurboModule {
  startSession(commands: NativeCommandConfig[]): Promise<void>;
  endSession(): Promise<void>;
  setNowPlaying(info: NativeNowPlayingInfo): void;
  setPlaybackState(state: NativePlaybackState): void;
  setCommands(commands: NativeCommandConfig[]): void;
  isSessionActive(): boolean;
  readonly onCommand: CodegenTypes.EventEmitter<NativeCommandEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('PlaybackControls');
