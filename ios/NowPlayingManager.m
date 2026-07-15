#import "NowPlayingManager.h"

#import <MediaPlayer/MediaPlayer.h>
#import <UIKit/UIKit.h>

typedef NSDictionary<NSString *, id> * _Nullable (^PayloadBuilder)(MPRemoteCommandEvent *event);

@interface NowPlayingManager ()

/** Command name -> opaque `addTargetWithHandler:` token, for commands currently registered. */
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *activeTargets;
/** Backing store mirrored into `MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo`. */
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *nowPlayingInfo;
@property (nonatomic, copy, nullable) NSString *lastAppliedArtworkURI;
@property (nonatomic, strong, nullable) MPMediaItemArtwork *lastArtwork;
/** Bumped on every new artwork fetch/teardown; guards against stale async completions. */
@property (nonatomic, assign) NSUInteger artworkGeneration;
/** The in-flight remote artwork fetch, if any, so `teardown` can cancel it outright. */
@property (nonatomic, strong, nullable) NSURLSessionDataTask *currentArtworkTask;
/** Whether a session is currently configured (set by `applyCommandConfigs:`, cleared by `teardown`). */
@property (nonatomic, assign) BOOL active;

@end

@implementation NowPlayingManager

- (instancetype)init
{
  self = [super init];
  if (self) {
    _activeTargets = [NSMutableDictionary dictionary];
    _nowPlayingInfo = [NSMutableDictionary dictionary];
    _artworkGeneration = 0;
    _active = NO;
  }
  return self;
}

#pragma mark - Command configuration

+ (NSArray<NSString *> *)allCommandNames
{
  static NSArray<NSString *> *names;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    names = @[
      @"play",
      @"pause",
      @"toggle-play-pause",
      @"stop",
      @"next-track",
      @"previous-track",
      @"skip-forward",
      @"skip-backward",
      @"seek-to",
      @"change-playback-rate",
    ];
  });
  return names;
}

- (nullable MPRemoteCommand *)remoteCommandForName:(NSString *)name
{
  MPRemoteCommandCenter *center = [MPRemoteCommandCenter sharedCommandCenter];
  if ([name isEqualToString:@"play"]) {
    return center.playCommand;
  } else if ([name isEqualToString:@"pause"]) {
    return center.pauseCommand;
  } else if ([name isEqualToString:@"toggle-play-pause"]) {
    return center.togglePlayPauseCommand;
  } else if ([name isEqualToString:@"stop"]) {
    return center.stopCommand;
  } else if ([name isEqualToString:@"next-track"]) {
    return center.nextTrackCommand;
  } else if ([name isEqualToString:@"previous-track"]) {
    return center.previousTrackCommand;
  } else if ([name isEqualToString:@"skip-forward"]) {
    return center.skipForwardCommand;
  } else if ([name isEqualToString:@"skip-backward"]) {
    return center.skipBackwardCommand;
  } else if ([name isEqualToString:@"seek-to"]) {
    return center.changePlaybackPositionCommand;
  } else if ([name isEqualToString:@"change-playback-rate"]) {
    return center.changePlaybackRateCommand;
  }
  return nil;
}

- (nullable PayloadBuilder)payloadBuilderForCommandName:(NSString *)name
{
  if ([name isEqualToString:@"skip-forward"] || [name isEqualToString:@"skip-backward"]) {
    return ^NSDictionary<NSString *, id> *(MPRemoteCommandEvent *event) {
      MPSkipIntervalCommandEvent *skipEvent = (MPSkipIntervalCommandEvent *)event;
      return @{@"intervalSec" : @(skipEvent.interval)};
    };
  } else if ([name isEqualToString:@"seek-to"]) {
    return ^NSDictionary<NSString *, id> *(MPRemoteCommandEvent *event) {
      MPChangePlaybackPositionCommandEvent *positionEvent = (MPChangePlaybackPositionCommandEvent *)event;
      return @{@"positionSec" : @(positionEvent.positionTime)};
    };
  } else if ([name isEqualToString:@"change-playback-rate"]) {
    return ^NSDictionary<NSString *, id> *(MPRemoteCommandEvent *event) {
      MPChangePlaybackRateCommandEvent *rateEvent = (MPChangePlaybackRateCommandEvent *)event;
      return @{@"playbackRate" : @(rateEvent.playbackRate)};
    };
  }
  return nil;
}

- (id)registerTargetOnCommand:(MPRemoteCommand *)command name:(NSString *)name
{
  PayloadBuilder payloadBuilder = [self payloadBuilderForCommandName:name];
  __weak typeof(self) weakSelf = self;
  return [command addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event) {
    typeof(self) strongSelf = weakSelf;
    if (strongSelf == nil || strongSelf.onCommand == nil) {
      return MPRemoteCommandHandlerStatusCommandFailed;
    }

    NSMutableDictionary<NSString *, id> *payload = [NSMutableDictionary dictionaryWithObject:name forKey:@"command"];
    NSDictionary<NSString *, id> *extras = payloadBuilder != nil ? payloadBuilder(event) : nil;
    if (extras != nil) {
      [payload addEntriesFromDictionary:extras];
    }

    strongSelf.onCommand(payload);
    return MPRemoteCommandHandlerStatusSuccess;
  }];
}

- (void)applyCommandConfigs:(NSArray<NSDictionary *> *)configs
{
  self.active = YES;

  // command name -> intervalSec (NSNumber) or NSNull when no interval was given.
  NSMutableDictionary<NSString *, id> *desired = [NSMutableDictionary dictionary];
  for (NSDictionary *config in configs) {
    NSString *name = config[@"command"];
    if (![name isKindOfClass:[NSString class]]) {
      continue;
    }
    id interval = config[@"intervalSec"];
    desired[name] = [interval isKindOfClass:[NSNumber class]] ? interval : [NSNull null];
  }

  for (NSString *name in [NowPlayingManager allCommandNames]) {
    MPRemoteCommand *command = [self remoteCommandForName:name];
    if (command == nil) {
      continue;
    }

    id desiredInterval = desired[name];
    if (desiredInterval == nil) {
      id token = self.activeTargets[name];
      if (token != nil) {
        [command removeTarget:token];
        [self.activeTargets removeObjectForKey:name];
      }
      command.enabled = NO;
      continue;
    }

    if ([command isKindOfClass:[MPSkipIntervalCommand class]] && [desiredInterval isKindOfClass:[NSNumber class]]) {
      ((MPSkipIntervalCommand *)command).preferredIntervals = @[ desiredInterval ];
    }

    if (self.activeTargets[name] == nil) {
      self.activeTargets[name] = [self registerTargetOnCommand:command name:name];
    }
    command.enabled = YES;
  }
}

#pragma mark - Now playing metadata

- (void)mergeNowPlayingInfo:(NSDictionary<NSString *, id> *)info
{
  id title = info[@"title"];
  if ([title isKindOfClass:[NSString class]]) {
    self.nowPlayingInfo[MPMediaItemPropertyTitle] = title;
  }
  id artist = info[@"artist"];
  if ([artist isKindOfClass:[NSString class]]) {
    self.nowPlayingInfo[MPMediaItemPropertyArtist] = artist;
  }
  id album = info[@"album"];
  if ([album isKindOfClass:[NSString class]]) {
    self.nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = album;
  }
  id durationSec = info[@"durationSec"];
  if ([durationSec isKindOfClass:[NSNumber class]]) {
    self.nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = durationSec;
  }
  id isLiveStream = info[@"isLiveStream"];
  if ([isLiveStream isKindOfClass:[NSNumber class]]) {
    self.nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = isLiveStream;
  }

  [self publishNowPlayingInfo];
  [self applyArtworkFromInfo:info];
}

- (void)applyPlaybackState:(NSDictionary<NSString *, id> *)state
{
  id positionSec = state[@"positionSec"];
  if ([positionSec isKindOfClass:[NSNumber class]]) {
    self.nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = positionSec;
  }

  NSString *status = state[@"status"];
  BOOL isPlaying = [status isEqualToString:@"playing"];
  id playbackRateValue = state[@"playbackRate"];
  double rate = isPlaying ? ([playbackRateValue isKindOfClass:[NSNumber class]] ? [playbackRateValue doubleValue] : 1.0) : 0.0;
  self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = @(rate);

  // MPNowPlayingInfoCenter.playbackState is available on iOS 13.0+ (also macOS/Catalyst) —
  // verified against the iphoneos SDK header (MPNowPlayingInfoCenter.h), not Catalyst/macOS-only.
  MPNowPlayingPlaybackState mpState = MPNowPlayingPlaybackStateUnknown;
  if (isPlaying) {
    mpState = MPNowPlayingPlaybackStatePlaying;
  } else if ([status isEqualToString:@"paused"] || [status isEqualToString:@"buffering"]) {
    mpState = MPNowPlayingPlaybackStatePaused;
  } else if ([status isEqualToString:@"stopped"]) {
    mpState = MPNowPlayingPlaybackStateStopped;
  }
  [MPNowPlayingInfoCenter defaultCenter].playbackState = mpState;

  [self publishNowPlayingInfo];
}

- (void)publishNowPlayingInfo
{
  [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = [self.nowPlayingInfo copy];
}

#pragma mark - Artwork

- (nullable NSURL *)resolveArtworkURL:(NSString *)uri
{
  if ([uri hasPrefix:@"/"]) {
    return [NSURL fileURLWithPath:uri];
  }
  return [NSURL URLWithString:uri];
}

- (void)applyArtworkFromInfo:(NSDictionary<NSString *, id> *)info
{
  id artworkUri = info[@"artworkUri"];
  if (![artworkUri isKindOfClass:[NSString class]] || [(NSString *)artworkUri length] == 0) {
    return;
  }
  NSString *uri = (NSString *)artworkUri;

  if (self.lastArtwork != nil && [uri isEqualToString:self.lastAppliedArtworkURI]) {
    self.nowPlayingInfo[MPMediaItemPropertyArtwork] = self.lastArtwork;
    [self publishNowPlayingInfo];
    return;
  }

  NSURL *url = [self resolveArtworkURL:uri];
  if (url == nil) {
#if DEBUG
    NSLog(@"[PlaybackControls] Unable to parse artwork URI: %@", uri);
#endif
    return;
  }

  NSUInteger generation = ++self.artworkGeneration;
  __weak typeof(self) weakSelf = self;

  if (url.isFileURL) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
      NSData *data = [NSData dataWithContentsOfFile:url.path];
      UIImage *image = data != nil ? [UIImage imageWithData:data] : nil;
      dispatch_async(dispatch_get_main_queue(), ^{
        [weakSelf handleArtworkImage:image forURI:uri generation:generation];
      });
    });
  } else {
    [self.currentArtworkTask cancel];
    NSURLSessionDataTask *task =
        [[NSURLSession sharedSession] dataTaskWithURL:url
                                     completionHandler:^(NSData *_Nullable data, NSURLResponse *_Nullable response, NSError *_Nullable error) {
                                       UIImage *image = (data != nil && error == nil) ? [UIImage imageWithData:data] : nil;
                                       dispatch_async(dispatch_get_main_queue(), ^{
                                         [weakSelf handleArtworkImage:image forURI:uri generation:generation];
                                       });
                                     }];
    self.currentArtworkTask = task;
    [task resume];
  }
}

- (void)handleArtworkImage:(nullable UIImage *)image forURI:(NSString *)uri generation:(NSUInteger)generation
{
  self.currentArtworkTask = nil;

  if (!self.active || generation != self.artworkGeneration) {
    // Session ended, or a newer artwork request superseded this one.
    return;
  }
  if (image == nil) {
#if DEBUG
    NSLog(@"[PlaybackControls] Failed to load artwork for URI: %@", uri);
#endif
    return;
  }

  MPMediaItemArtwork *artwork = [[MPMediaItemArtwork alloc] initWithBoundsSize:image.size
                                                                 requestHandler:^UIImage *_Nonnull(CGSize size) {
                                                                   return image;
                                                                 }];
  self.lastArtwork = artwork;
  self.lastAppliedArtworkURI = uri;
  self.nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork;
  [self publishNowPlayingInfo];
}

#pragma mark - Lifecycle

- (void)teardown
{
  for (NSString *name in [NowPlayingManager allCommandNames]) {
    MPRemoteCommand *command = [self remoteCommandForName:name];
    if (command == nil) {
      continue;
    }
    id token = self.activeTargets[name];
    if (token != nil) {
      [command removeTarget:token];
    }
    command.enabled = NO;
  }
  [self.activeTargets removeAllObjects];

  self.active = NO;
  self.artworkGeneration++;
  [self.currentArtworkTask cancel];
  self.currentArtworkTask = nil;
  self.lastArtwork = nil;
  self.lastAppliedArtworkURI = nil;
  self.nowPlayingInfo = [NSMutableDictionary dictionary];

  [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = nil;
}

@end
