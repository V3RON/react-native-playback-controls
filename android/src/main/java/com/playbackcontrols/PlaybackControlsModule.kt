package com.playbackcontrols

import com.facebook.react.bridge.ReactApplicationContext

class PlaybackControlsModule(reactContext: ReactApplicationContext) :
  NativePlaybackControlsSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativePlaybackControlsSpec.NAME
  }
}
