import { jest } from '@jest/globals';
import type { NativeCommandEvent } from '../NativePlaybackControls';

type CommandListener = (event: NativeCommandEvent) => void;

const listeners = new Set<CommandListener>();

const NativePlaybackControlsMock = {
  startSession: jest.fn(async () => undefined),
  endSession: jest.fn(async () => undefined),
  setNowPlaying: jest.fn(),
  setPlaybackState: jest.fn(),
  setCommands: jest.fn(),
  isSessionActive: jest.fn(() => false),
  onCommand: jest.fn((listener: CommandListener) => {
    listeners.add(listener);
    return {
      remove: jest.fn(() => {
        listeners.delete(listener);
      }),
    };
  }),
  /** Test-only helper: fires a fake native command event to every subscriber. */
  __emit(event: NativeCommandEvent): void {
    for (const listener of [...listeners]) {
      listener(event);
    }
  },
  /** Test-only helper: clears mock call state and active listeners. */
  __reset(): void {
    listeners.clear();
    NativePlaybackControlsMock.startSession.mockReset();
    NativePlaybackControlsMock.startSession.mockImplementation(
      async () => undefined
    );
    NativePlaybackControlsMock.endSession.mockReset();
    NativePlaybackControlsMock.endSession.mockImplementation(
      async () => undefined
    );
    NativePlaybackControlsMock.setNowPlaying.mockReset();
    NativePlaybackControlsMock.setPlaybackState.mockReset();
    NativePlaybackControlsMock.setCommands.mockReset();
    NativePlaybackControlsMock.isSessionActive.mockReset();
    NativePlaybackControlsMock.isSessionActive.mockReturnValue(false);
    NativePlaybackControlsMock.onCommand.mockClear();
  },
};

export default NativePlaybackControlsMock;
