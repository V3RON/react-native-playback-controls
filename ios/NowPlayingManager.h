#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Owns all `MediaPlayer` framework state for a session: the
 * `MPNowPlayingInfoCenter` dictionary and the `MPRemoteCommandCenter` target
 * registrations. Every method must be called on the main thread — the caller
 * (`PlaybackControls`) is responsible for the `dispatch_async` hop off the
 * Turbo Module thread.
 */
@interface NowPlayingManager : NSObject

/**
 * Invoked with the command payload (`command` plus any extras) whenever a
 * registered `MPRemoteCommandCenter` target fires. Set once by the owning
 * Turbo Module; never retains the module.
 */
@property (nonatomic, copy, nullable) void (^onCommand)(NSDictionary<NSString *, id> *payload);

/**
 * Reconciles the live `MPRemoteCommandCenter` registrations against
 * `configs` (an array of `{ command: string, intervalSec?: number }`
 * dictionaries, as received from JS). Commands present in `configs` are
 * enabled and (re-)registered; previously-enabled commands absent from
 * `configs` are disabled and have their target removed. Used by both
 * `startSession` and `setCommands`.
 */
- (void)applyCommandConfigs:(NSArray<NSDictionary *> *)configs;

/**
 * Merges `info` (`title`, `artist`, `album`, `artworkUri`, `durationSec`,
 * `isLiveStream`) into the current now-playing dictionary, preserving any
 * previously-set elapsed-time/rate keys. Kicks off async artwork loading
 * when `artworkUri` is present and has changed since the last apply.
 */
- (void)mergeNowPlayingInfo:(NSDictionary<NSString *, id> *)info;

/**
 * Sets `MPNowPlayingInfoPropertyElapsedPlaybackTime` (when `positionSec` is
 * present) and `MPNowPlayingInfoPropertyPlaybackRate`/`playbackState` from
 * `state` (`status`, `positionSec`, `playbackRate`).
 */
- (void)applyPlaybackState:(NSDictionary<NSString *, id> *)state;

/**
 * Disables and removes the target for every remote command, cancels any
 * in-flight artwork fetch, and clears `MPNowPlayingInfoCenter.nowPlayingInfo`.
 * Used by `endSession` and Turbo Module `invalidate`.
 */
- (void)teardown;

@end

NS_ASSUME_NONNULL_END
