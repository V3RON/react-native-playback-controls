import { Text, View, StyleSheet } from 'react-native';
import { PlaybackControls } from 'react-native-playback-controls';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Session active: {String(PlaybackControls.isSessionActive)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
