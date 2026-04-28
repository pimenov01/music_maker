export class AudioEngine {
  constructor(options = {}) {
    this.tracks = new Map();

    this.fadeDuration = options.fadeDuration ?? 900;
    this.fadeStep = options.fadeStep ?? 30;
  }

  registerSound(sound) {
    const audio = new Audio(sound.file);

    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;

    this.tracks.set(sound.id, {
      audio,
      targetVolume: sound.defaultVolume ?? 0.5,
      isPlaying: false,
      fadeTimer: null,
    });
  }

  getTrack(soundId) {
    const track = this.tracks.get(soundId);

    if (!track) {
      throw new Error(`Sound with id "${soundId}" is not registered.`);
    }

    return track;
  }

  async toggle(soundId) {
    const track = this.getTrack(soundId);

    if (track.isPlaying) {
      await this.fadeOut(soundId);
    } else {
      await this.fadeIn(soundId);
    }

    return track.isPlaying;
  }

  async fadeIn(soundId) {
    const track = this.getTrack(soundId);
    const { audio } = track;

    this.clearFade(track);

    audio.volume = 0;

    try {
      await audio.play();
    } catch (error) {
      console.error("Audio play was blocked or failed:", error);
      return;
    }

    track.isPlaying = true;

    const targetVolume = track.targetVolume;
    const steps = Math.max(1, this.fadeDuration / this.fadeStep);
    const volumeIncrement = targetVolume / steps;

    track.fadeTimer = setInterval(() => {
      const nextVolume = Math.min(audio.volume + volumeIncrement, targetVolume);
      audio.volume = nextVolume;

      if (nextVolume >= targetVolume) {
        this.clearFade(track);
      }
    }, this.fadeStep);
  }

  async fadeOut(soundId) {
    const track = this.getTrack(soundId);
    const { audio } = track;

    this.clearFade(track);

    const startVolume = audio.volume;
    const steps = Math.max(1, this.fadeDuration / this.fadeStep);
    const volumeDecrement = startVolume / steps;

    return new Promise((resolve) => {
      track.fadeTimer = setInterval(() => {
        const nextVolume = Math.max(audio.volume - volumeDecrement, 0);
        audio.volume = nextVolume;

        if (nextVolume <= 0.001) {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 0;
          track.isPlaying = false;

          this.clearFade(track);
          resolve();
        }
      }, this.fadeStep);
    });
  }

  setVolume(soundId, volume) {
    const track = this.getTrack(soundId);
    const safeVolume = this.normalizeVolume(volume);

    track.targetVolume = safeVolume;

    if (track.isPlaying) {
      track.audio.volume = safeVolume;
    }
  }

  getVolume(soundId) {
    const track = this.getTrack(soundId);
    return track.targetVolume;
  }

  isPlaying(soundId) {
    const track = this.getTrack(soundId);
    return track.isPlaying;
  }

  async stopAll() {
    const fadePromises = [];

    for (const soundId of this.tracks.keys()) {
      const track = this.getTrack(soundId);

      if (track.isPlaying) {
        fadePromises.push(this.fadeOut(soundId));
      }
    }

    await Promise.all(fadePromises);
  }

getAudioElement(soundId) {
  const track = this.getTrack(soundId);
  return track.audio;
}

getProgress(soundId) {
  const track = this.getTrack(soundId);
  const { audio } = track;

  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return 0;
  }

  return audio.currentTime / audio.duration;
}

getDuration(soundId) {
  const track = this.getTrack(soundId);
  const { audio } = track;

  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return 0;
  }

  return audio.duration;
}
  
  clearFade(track) {
    if (track.fadeTimer) {
      clearInterval(track.fadeTimer);
      track.fadeTimer = null;
    }
  }

  normalizeVolume(value) {
    const numberValue = Number(value);

    if (Number.isNaN(numberValue)) {
      return 0.5;
    }

    return Math.min(1, Math.max(0, numberValue));
  }
}
