import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Image,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {
  PlaybackControls,
  useRemoteCommand,
  type CommandConfig,
  type PlaybackSession,
} from 'react-native-playback-controls';
import { useFakePlayer } from './useFakePlayer';
import { useEventLog } from './useEventLog';
import type { Track } from './playlist';

/** Every remote command the demo session exposes, with the two skip intervals. */
const COMMANDS: CommandConfig[] = [
  'play',
  'pause',
  'toggle-play-pause',
  'stop',
  'next-track',
  'previous-track',
  { command: 'skip-forward', intervalSec: 15 },
  { command: 'skip-backward', intervalSec: 15 },
  'seek-to',
  'change-playback-rate',
];

const PLAYBACK_RATES = [1, 1.5, 2];

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function artworkSource(track: Track): ImageSourcePropType {
  return typeof track.artwork === 'string'
    ? { uri: track.artwork }
    : track.artwork;
}

/** Extracts a stable rejection `code` (see PlaybackControls.startSession) if present. */
function rejectionCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { code: unknown };
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export default function App() {
  const player = useFakePlayer();
  const { entries, log } = useEventLog();

  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [permissionHint, setPermissionHint] = useState<string | null>(null);

  const {
    togglePlayPause,
    stop,
    nextTrack,
    previousTrack,
    skipForward,
    skipBackward,
    seekTo,
    changePlaybackRate,
  } = player;

  // Push metadata whenever the session becomes active or the current track changes.
  useEffect(() => {
    if (!session) {
      return;
    }
    session.setNowPlaying({
      title: player.track.title,
      artist: player.track.artist,
      album: player.track.album,
      artwork: player.track.artwork,
      durationSec: player.track.durationSec,
    });
  }, [session, player.track]);

  // Push playback state on every explicit transition (revision bump) and
  // whenever a session first becomes active. The 1s UI ticker in
  // useFakePlayer never bumps `revision`, so it never lands here.
  useEffect(() => {
    if (!session) {
      return;
    }
    session.setPlaybackState({
      status: player.status,
      positionSec: player.positionSec,
      playbackRate: player.playbackRate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, player.revision]);

  // Demo of useRemoteCommand for two commands; both are also visible in the
  // catch-all log below since that listener logs every command.
  useRemoteCommand(session, 'play', () => {
    player.play();
    log('play (via useRemoteCommand)');
  });
  useRemoteCommand(session, 'pause', () => {
    player.pause();
    log('pause (via useRemoteCommand)');
  });

  // Catch-all listener: logs every remote command press and drives the fake
  // player for everything not already handled by useRemoteCommand above.
  useEffect(() => {
    if (!session) {
      return;
    }
    const subscription = session.addCommandListener((event) => {
      log(JSON.stringify(event));
      switch (event.command) {
        case 'play':
        case 'pause':
          // handled by useRemoteCommand
          break;
        case 'toggle-play-pause':
          togglePlayPause();
          break;
        case 'stop':
          stop();
          break;
        case 'next-track':
          nextTrack();
          break;
        case 'previous-track':
          previousTrack();
          break;
        case 'skip-forward':
          skipForward(event.intervalSec);
          break;
        case 'skip-backward':
          skipBackward(event.intervalSec);
          break;
        case 'seek-to':
          seekTo(event.positionSec);
          break;
        case 'change-playback-rate':
          changePlaybackRate(event.playbackRate);
          break;
      }
    });
    return () => subscription.remove();
  }, [
    session,
    log,
    togglePlayPause,
    stop,
    nextTrack,
    previousTrack,
    skipForward,
    skipBackward,
    seekTo,
    changePlaybackRate,
  ]);

  // End the session on unmount (and whenever it's replaced).
  useEffect(() => {
    return () => {
      session?.end();
    };
  }, [session]);

  const handleStartSession = useCallback(async () => {
    setStartError(null);
    setPermissionHint(null);

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setPermissionHint(
          'Notification permission denied — the Android media notification will not appear until it is granted.'
        );
        return;
      }
    }

    try {
      const newSession = await PlaybackControls.startSession({
        commands: COMMANDS,
      });
      setSession(newSession);
      log('session started');
    } catch (error) {
      const code = rejectionCode(error);
      if (code === 'session-already-active') {
        setStartError(
          'A session is already active — end it before starting a new one.'
        );
      } else if (code === 'foreground-required') {
        setStartError(
          'Starting a session requires the app to be in the foreground (Android).'
        );
      } else {
        setStartError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [log]);

  const handleEndSession = useCallback(async () => {
    if (!session) {
      return;
    }
    await session.end();
    setSession(null);
    log('session ended');
  }, [session, log]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Image source={artworkSource(player.track)} style={styles.artwork} />
        <Text style={styles.title}>{player.track.title}</Text>
        <Text style={styles.artist}>
          {player.track.artist}
          {player.track.album ? ` — ${player.track.album}` : ''}
        </Text>
        <Text style={styles.position}>
          {formatTime(player.positionSec)} /{' '}
          {formatTime(player.track.durationSec)}
        </Text>
        <Text style={styles.status}>
          {player.status} · {player.playbackRate}x
        </Text>

        <View style={styles.row}>
          <Button title="⏮ Prev" onPress={player.previousTrack} />
          <Button title="-15s" onPress={() => player.skipBackward(15)} />
          <Button
            title={player.status === 'playing' ? 'Pause' : 'Play'}
            onPress={player.togglePlayPause}
          />
          <Button title="+15s" onPress={() => player.skipForward(15)} />
          <Button title="Next ⏭" onPress={player.nextTrack} />
        </View>
        <Button title="Stop" onPress={player.stop} />

        <View style={styles.row}>
          {PLAYBACK_RATES.map((rate) => (
            <Button
              key={rate}
              title={`${rate}x`}
              disabled={player.playbackRate === rate}
              onPress={() => player.changePlaybackRate(rate)}
            />
          ))}
        </View>

        <View style={styles.row}>
          <Button
            title="Start session"
            disabled={session != null}
            onPress={handleStartSession}
          />
          <Button
            title="End session"
            disabled={session == null}
            onPress={handleEndSession}
          />
        </View>

        {permissionHint ? (
          <Text style={styles.warning}>{permissionHint}</Text>
        ) : null}
        {startError ? (
          <Text style={styles.error}>Error: {startError}</Text>
        ) : null}

        <Text style={styles.logHeader}>Event log</Text>
        <View style={styles.log}>
          {entries.length === 0 ? (
            <Text style={styles.logEmpty}>No events yet.</Text>
          ) : (
            entries.map((entry) => (
              <Text key={entry.id} style={styles.logEntry}>
                [{entry.timestamp}] {entry.message}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  artist: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  position: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  status: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  warning: {
    color: '#b26a00',
    textAlign: 'center',
  },
  error: {
    color: '#c62828',
    textAlign: 'center',
  },
  logHeader: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  log: {
    alignSelf: 'stretch',
  },
  logEmpty: {
    color: '#999',
  },
  logEntry: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});
