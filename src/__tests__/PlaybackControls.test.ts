import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PlaybackControls } from '../PlaybackControls';
import NativePlaybackControls from '../NativePlaybackControls';
import { PlaybackSession } from '../PlaybackSession';

jest.mock('../NativePlaybackControls');

const mockNative =
  NativePlaybackControls as unknown as typeof import('../__mocks__/NativePlaybackControls').default;

beforeEach(() => {
  mockNative.__reset();
});

describe('PlaybackControls.startSession', () => {
  it('normalizes string shorthands and skip command configs', async () => {
    await PlaybackControls.startSession({
      commands: ['play', 'pause', { command: 'skip-forward', intervalSec: 15 }],
    });

    expect(mockNative.startSession).toHaveBeenCalledWith([
      { command: 'play' },
      { command: 'pause' },
      { command: 'skip-forward', intervalSec: 15 },
    ]);
  });

  it('rejects with a RangeError for a non-positive skip interval, without calling native', async () => {
    await expect(
      PlaybackControls.startSession({
        commands: [{ command: 'skip-backward', intervalSec: 0 }],
      })
    ).rejects.toThrow(RangeError);

    expect(mockNative.startSession).not.toHaveBeenCalled();
  });

  it('returns a PlaybackSession handle on success', async () => {
    const session = await PlaybackControls.startSession({
      commands: ['play'],
    });

    expect(session).toBeInstanceOf(PlaybackSession);
    expect(session.isEnded).toBe(false);
  });

  it('propagates the native rejection when a session is already active', async () => {
    const nativeError = Object.assign(new Error('already active'), {
      code: 'session-already-active',
    });
    mockNative.startSession.mockRejectedValueOnce(nativeError);

    await expect(
      PlaybackControls.startSession({ commands: ['play'] })
    ).rejects.toBe(nativeError);
  });
});

describe('PlaybackControls.isSessionActive', () => {
  it('reflects the native synchronous getter', () => {
    mockNative.isSessionActive.mockReturnValue(true);
    expect(PlaybackControls.isSessionActive).toBe(true);

    mockNative.isSessionActive.mockReturnValue(false);
    expect(PlaybackControls.isSessionActive).toBe(false);
  });
});
