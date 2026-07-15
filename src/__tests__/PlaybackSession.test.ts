import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Image } from 'react-native';
import NativePlaybackControls from '../NativePlaybackControls';
import { PlaybackSession } from '../PlaybackSession';
import type { ImageRequireSource } from 'react-native';

jest.mock('../NativePlaybackControls');

const mockNative =
  NativePlaybackControls as unknown as typeof import('../__mocks__/NativePlaybackControls').default;

beforeEach(() => {
  mockNative.__reset();
});

describe('PlaybackSession#setNowPlaying', () => {
  it('resolves a require() artwork asset via Image.resolveAssetSource', () => {
    const resolveAssetSourceSpy = jest
      .spyOn(Image, 'resolveAssetSource')
      .mockReturnValue({
        uri: 'file://resolved-artwork.png',
        width: 1,
        height: 1,
        scale: 1,
      });

    const session = new PlaybackSession();
    const artworkAsset = 42 as unknown as ImageRequireSource;
    session.setNowPlaying({ title: 'Track', artwork: artworkAsset });

    expect(resolveAssetSourceSpy).toHaveBeenCalledWith(artworkAsset);
    expect(mockNative.setNowPlaying).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Track',
        artworkUri: 'file://resolved-artwork.png',
      })
    );

    resolveAssetSourceSpy.mockRestore();
  });

  it('passes a string artwork URL through unchanged', () => {
    const session = new PlaybackSession();
    session.setNowPlaying({
      title: 'Track',
      artwork: 'https://example.com/cover.jpg',
    });

    expect(mockNative.setNowPlaying).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Track',
        artworkUri: 'https://example.com/cover.jpg',
      })
    );
  });
});

describe('PlaybackSession#setCommands', () => {
  it('normalizes shorthands and skip configs, and rejects invalid intervals', () => {
    const session = new PlaybackSession();

    session.setCommands(['play', { command: 'skip-forward', intervalSec: 30 }]);
    expect(mockNative.setCommands).toHaveBeenCalledWith([
      { command: 'play' },
      { command: 'skip-forward', intervalSec: 30 },
    ]);

    expect(() =>
      session.setCommands([{ command: 'skip-backward', intervalSec: -5 }])
    ).toThrow(RangeError);
  });
});

describe('PlaybackSession#addCommandListener', () => {
  it('narrows a native event into the exact CommandEvent variant', () => {
    const session = new PlaybackSession();
    const listener = jest.fn();
    session.addCommandListener(listener);

    mockNative.__emit({ command: 'seek-to', positionSec: 12.5 });

    expect(listener).toHaveBeenCalledWith({
      command: 'seek-to',
      positionSec: 12.5,
    });
  });

  it('silently drops an unknown command instead of throwing', () => {
    const session = new PlaybackSession();
    const listener = jest.fn();
    session.addCommandListener(listener);

    expect(() =>
      mockNative.__emit({ command: 'some-future-command' })
    ).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('remove() is idempotent and stops further delivery', () => {
    const session = new PlaybackSession();
    const listener = jest.fn();
    const subscription = session.addCommandListener(listener);

    subscription.remove();
    subscription.remove(); // idempotent, must not throw

    mockNative.__emit({ command: 'play' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('PlaybackSession#end', () => {
  it('is idempotent and calls native endSession only once', async () => {
    const session = new PlaybackSession();

    await session.end();
    await session.end();

    expect(mockNative.endSession).toHaveBeenCalledTimes(1);
    expect(session.isEnded).toBe(true);
  });

  it("removes this session's native subscriptions", async () => {
    const session = new PlaybackSession();
    const listener = jest.fn();
    session.addCommandListener(listener);

    await session.end();

    mockNative.__emit({ command: 'play' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('causes mutating methods to throw a session-ended error afterwards', async () => {
    const session = new PlaybackSession();
    await session.end();

    expect(() => session.setNowPlaying({ title: 'x' })).toThrow(
      /session-ended/
    );
    expect(() => session.setPlaybackState({ status: 'playing' })).toThrow(
      /session-ended/
    );
    expect(() => session.setCommands(['play'])).toThrow(/session-ended/);
    expect(() => session.addCommandListener(jest.fn())).toThrow(
      /session-ended/
    );
  });
});
