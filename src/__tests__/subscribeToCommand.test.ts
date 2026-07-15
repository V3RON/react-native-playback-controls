import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import NativePlaybackControls from '../NativePlaybackControls';
import { PlaybackSession } from '../PlaybackSession';
import { subscribeToCommand } from '../internal/subscribeToCommand';

jest.mock('../NativePlaybackControls');

const mockNative =
  NativePlaybackControls as unknown as typeof import('../__mocks__/NativePlaybackControls').default;

beforeEach(() => {
  mockNative.__reset();
});

describe('subscribeToCommand', () => {
  it('delivers only events matching the requested command', () => {
    const session = new PlaybackSession();
    const handler = jest.fn();
    subscribeToCommand(session, 'seek-to', handler);

    mockNative.__emit({ command: 'play' });
    mockNative.__emit({ command: 'seek-to', positionSec: 3 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      command: 'seek-to',
      positionSec: 3,
    });
  });

  it('unsubscribing stops further delivery', () => {
    const session = new PlaybackSession();
    const handler = jest.fn();
    const unsubscribe = subscribeToCommand(session, 'play', handler);

    unsubscribe();
    mockNative.__emit({ command: 'play' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('is a safe no-op for a null/undefined session', () => {
    const handler = jest.fn();
    expect(() => {
      const unsubscribe = subscribeToCommand(null, 'play', handler);
      unsubscribe();
    }).not.toThrow();
  });

  it('is a safe no-op for an already-ended session', async () => {
    const session = new PlaybackSession();
    await session.end();

    const handler = jest.fn();
    expect(() => subscribeToCommand(session, 'play', handler)).not.toThrow();
  });
});
