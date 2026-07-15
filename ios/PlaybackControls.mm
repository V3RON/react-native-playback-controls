#import "PlaybackControls.h"
#import "NowPlayingManager.h"

#import <atomic>

@interface PlaybackControls () {
  // Guards `isSessionActive()` (a sync Turbo Module call made from the JS
  // thread) without hopping to main, and lets `startSession`/`endSession`
  // atomically test-and-set active state before dispatching the actual
  // MediaPlayer-framework work to main.
  std::atomic<bool> _sessionActive;
}

@property (nonatomic, strong) NowPlayingManager *manager;

@end

@implementation PlaybackControls

- (instancetype)init
{
  self = [super init];
  if (self) {
    _sessionActive = false;
    _manager = [NowPlayingManager new];

    __weak __typeof(self) weakSelf = self;
    _manager.onCommand = ^(NSDictionary<NSString *, id> *payload) {
      [weakSelf emitOnCommand:payload];
    };
  }
  return self;
}

- (void)startSession:(NSArray *)commands
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject
{
  bool expected = false;
  if (!_sessionActive.compare_exchange_strong(expected, true)) {
    reject(@"session-already-active", @"A playback session is already active. Call endSession() before starting a new one.", nil);
    return;
  }

  NowPlayingManager *manager = self.manager;
  dispatch_async(dispatch_get_main_queue(), ^{
    [manager applyCommandConfigs:commands];
    resolve(nil);
  });
}

- (void)endSession:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  bool expected = true;
  if (!_sessionActive.compare_exchange_strong(expected, false)) {
    // No session active — end() is idempotent per the JS facade contract.
    resolve(nil);
    return;
  }

  NowPlayingManager *manager = self.manager;
  dispatch_async(dispatch_get_main_queue(), ^{
    [manager teardown];
    resolve(nil);
  });
}

- (void)setNowPlaying:(JS::NativePlaybackControls::NativeNowPlayingInfo &)info
{
  if (!_sessionActive.load()) {
#if DEBUG
    NSLog(@"[PlaybackControls] setNowPlaying called with no active session; ignoring.");
#endif
    return;
  }

  NSMutableDictionary<NSString *, id> *dict = [NSMutableDictionary dictionary];
  dict[@"title"] = info.title();
  if (info.artist() != nil) {
    dict[@"artist"] = info.artist();
  }
  if (info.album() != nil) {
    dict[@"album"] = info.album();
  }
  if (info.artworkUri() != nil) {
    dict[@"artworkUri"] = info.artworkUri();
  }
  if (info.durationSec().has_value()) {
    dict[@"durationSec"] = @(info.durationSec().value());
  }
  if (info.isLiveStream().has_value()) {
    dict[@"isLiveStream"] = @(info.isLiveStream().value());
  }

  NowPlayingManager *manager = self.manager;
  dispatch_async(dispatch_get_main_queue(), ^{
    [manager mergeNowPlayingInfo:dict];
  });
}

- (void)setPlaybackState:(JS::NativePlaybackControls::NativePlaybackState &)state
{
  if (!_sessionActive.load()) {
#if DEBUG
    NSLog(@"[PlaybackControls] setPlaybackState called with no active session; ignoring.");
#endif
    return;
  }

  NSMutableDictionary<NSString *, id> *dict = [NSMutableDictionary dictionary];
  dict[@"status"] = state.status();
  if (state.positionSec().has_value()) {
    dict[@"positionSec"] = @(state.positionSec().value());
  }
  if (state.playbackRate().has_value()) {
    dict[@"playbackRate"] = @(state.playbackRate().value());
  }

  NowPlayingManager *manager = self.manager;
  dispatch_async(dispatch_get_main_queue(), ^{
    [manager applyPlaybackState:dict];
  });
}

- (void)setCommands:(NSArray *)commands
{
  if (!_sessionActive.load()) {
#if DEBUG
    NSLog(@"[PlaybackControls] setCommands called with no active session; ignoring.");
#endif
    return;
  }

  NowPlayingManager *manager = self.manager;
  dispatch_async(dispatch_get_main_queue(), ^{
    [manager applyCommandConfigs:commands];
  });
}

- (NSNumber *)isSessionActive
{
  return @(_sessionActive.load());
}

// Turbo Module teardown hook, invoked on Metro reload/bridge invalidation.
// Without this, a dev reload would leak the previous session's
// MPRemoteCommandCenter target registrations and double-register on the next
// JS bundle load.
- (void)invalidate
{
  _sessionActive.store(false);

  // The manager (including its `onCommand` block) is only ever touched on
  // main — clearing it off-main here would race with command-handler blocks
  // MediaPlayer invokes on main.
  NowPlayingManager *manager = self.manager;
  void (^teardown)(void) = ^{
    manager.onCommand = nil;
    [manager teardown];
  };

  if ([NSThread isMainThread]) {
    teardown();
  } else {
    dispatch_sync(dispatch_get_main_queue(), teardown);
  }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativePlaybackControlsSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"PlaybackControls";
}

@end
