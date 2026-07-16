import { useCallback, useEffect, useReducer } from 'react';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { PlaybackStatus } from 'react-native-playback-controls';
import { PLAYLIST, type Track } from './playlist';

interface FakePlayerState {
  trackIndex: number;
  status: PlaybackStatus;
  positionSec: number;
  playbackRate: number;
  /**
   * Bumped by every action *except* the 1s tick. Callers watch this (not
   * `positionSec`) to know when to push a fresh `setPlaybackState` — the
   * per-second position tick is UI-only and must never reach the native side.
   */
  revision: number;
}

type FakePlayerAction =
  | { type: 'tick' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle-play-pause' }
  | { type: 'stop' }
  | { type: 'next-track' }
  | { type: 'previous-track' }
  | { type: 'skip-forward'; intervalSec: number }
  | { type: 'skip-backward'; intervalSec: number }
  | { type: 'seek-to'; positionSec: number }
  | { type: 'change-playback-rate'; playbackRate: number };

const initialState: FakePlayerState = {
  trackIndex: 0,
  status: 'paused',
  positionSec: 0,
  playbackRate: 1,
  revision: 0,
};

function clampPosition(positionSec: number, durationSec: number): number {
  return Math.max(0, Math.min(durationSec, positionSec));
}

function reducer(
  state: FakePlayerState,
  action: FakePlayerAction
): FakePlayerState {
  const duration = PLAYLIST[state.trackIndex]!.durationSec;

  switch (action.type) {
    case 'tick':
      if (state.status !== 'playing') {
        return state;
      }
      return {
        ...state,
        positionSec: clampPosition(
          state.positionSec + state.playbackRate,
          duration
        ),
      };
    case 'play':
      return { ...state, status: 'playing', revision: state.revision + 1 };
    case 'pause':
      return { ...state, status: 'paused', revision: state.revision + 1 };
    case 'toggle-play-pause':
      return {
        ...state,
        status: state.status === 'playing' ? 'paused' : 'playing',
        revision: state.revision + 1,
      };
    case 'stop':
      return {
        ...state,
        status: 'stopped',
        positionSec: 0,
        revision: state.revision + 1,
      };
    case 'next-track':
      return {
        ...state,
        trackIndex: (state.trackIndex + 1) % PLAYLIST.length,
        positionSec: 0,
        revision: state.revision + 1,
      };
    case 'previous-track':
      return {
        ...state,
        trackIndex: (state.trackIndex - 1 + PLAYLIST.length) % PLAYLIST.length,
        positionSec: 0,
        revision: state.revision + 1,
      };
    case 'skip-forward':
      return {
        ...state,
        positionSec: clampPosition(
          state.positionSec + action.intervalSec,
          duration
        ),
        revision: state.revision + 1,
      };
    case 'skip-backward':
      return {
        ...state,
        positionSec: clampPosition(
          state.positionSec - action.intervalSec,
          duration
        ),
        revision: state.revision + 1,
      };
    case 'seek-to':
      return {
        ...state,
        positionSec: clampPosition(action.positionSec, duration),
        revision: state.revision + 1,
      };
    case 'change-playback-rate':
      return {
        ...state,
        playbackRate: action.playbackRate,
        revision: state.revision + 1,
      };
    default:
      return state;
  }
}

export interface FakePlayer extends FakePlayerState {
  track: Track;
  play(): void;
  pause(): void;
  togglePlayPause(): void;
  stop(): void;
  nextTrack(): void;
  previousTrack(): void;
  skipForward(intervalSec: number): void;
  skipBackward(intervalSec: number): void;
  seekTo(positionSec: number): void;
  changePlaybackRate(playbackRate: number): void;
}

/**
 * A fake in-JS "player" — this is the thing the library pretends to control.
 * It owns simulated playback state (status/position/rate/track) and loops a
 * silent `expo-audio` track while `status === 'playing'` so iOS keeps an
 * active `AVAudioSession` (required for lock-screen controls to appear; the
 * library itself never touches the audio session).
 *
 * `positionSec` advances once per second locally for UI display only — the
 * system seek bar interpolates natively from the last pushed
 * `setPlaybackState`, so callers must not push on every tick.
 */
export function useFakePlayer(): FakePlayer {
  const [state, dispatch] = useReducer(reducer, initialState);
  const track = PLAYLIST[state.trackIndex]!;

  const silentPlayer = useAudioPlayer(require('../assets/silence.wav'));

  useEffect(() => {
    setAudioModeAsync({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {
      // Best-effort: audio mode failures shouldn't block the demo UI.
    });
  }, []);

  useEffect(() => {
    silentPlayer.loop = true;
  }, [silentPlayer]);

  useEffect(() => {
    if (state.status === 'playing') {
      silentPlayer.play();
    } else {
      silentPlayer.pause();
    }
  }, [state.status, silentPlayer]);

  // UI-only 1s position ticker. Deliberately dispatches 'tick', which never
  // bumps `revision` — see the reducer above and the sync effect in App.tsx.
  useEffect(() => {
    if (state.status !== 'playing') {
      return;
    }
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, [state.status]);

  return {
    ...state,
    track,
    play: useCallback(() => dispatch({ type: 'play' }), []),
    pause: useCallback(() => dispatch({ type: 'pause' }), []),
    togglePlayPause: useCallback(
      () => dispatch({ type: 'toggle-play-pause' }),
      []
    ),
    stop: useCallback(() => dispatch({ type: 'stop' }), []),
    nextTrack: useCallback(() => dispatch({ type: 'next-track' }), []),
    previousTrack: useCallback(() => dispatch({ type: 'previous-track' }), []),
    skipForward: useCallback(
      (intervalSec: number) => dispatch({ type: 'skip-forward', intervalSec }),
      []
    ),
    skipBackward: useCallback(
      (intervalSec: number) => dispatch({ type: 'skip-backward', intervalSec }),
      []
    ),
    seekTo: useCallback(
      (positionSec: number) => dispatch({ type: 'seek-to', positionSec }),
      []
    ),
    changePlaybackRate: useCallback(
      (playbackRate: number) =>
        dispatch({ type: 'change-playback-rate', playbackRate }),
      []
    ),
  };
}
