export class AudioEngine {
  constructor(options = {}) {
    this.tracks = new Map();

    this.fadeDuration = options.fadeDuration ?? 900;
    this.fadeStep = options.fadeStep ?? 30;

    this.audioContext = null;
  }

  getContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    return this.audioContext;
  }

  async ensureContext() {
    const context = this.getContext();

    if (context.state === "suspended") {
      await context.resume();
    }

    return context;
  }

  registerSound(sound) {
    // Оставляем Audio-элемент для совместимости с существующим UI:
    // получение duration и другие обращения к аудио продолжают работать.
    const audio = new Audio(sound.file);

    audio.preload = "auto";

    const track = {
      audio,

      targetVolume: sound.defaultVolume ?? 0.5,

      isPlaying: false,

      fadeTimer: null,

      buffer: null,
      source: null,
      gainNode: null,

      loadingPromise: null,

      startedAt: 0,
      offset: 0,
    };

    this.tracks.set(sound.id, track);
  }

  getTrack(soundId) {
    const track = this.tracks.get(soundId);

    if (!track) {
      throw new Error(`Sound with id "${soundId}" is not registered.`);
    }

    return track;
  }

  async loadBuffer(soundId) {
    const track = this.getTrack(soundId);

    if (track.buffer) {
      return track.buffer;
    }

    if (track.loadingPromise) {
      return track.loadingPromise;
    }

    const context = this.getContext();

    track.loadingPromise = fetch(track.audio.src)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load audio: ${response.status} ${response.statusText}`
          );
        }

        return response.arrayBuffer();
      })
      .then((arrayBuffer) => {
        return context.decodeAudioData(arrayBuffer);
      })
      .then((buffer) => {
        track.buffer = buffer;
        return buffer;
      })
      .catch((error) => {
        track.loadingPromise = null;
        throw error;
      });

    return track.loadingPromise;
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

    this.clearFade(track);

    try {
      const context = await this.ensureContext();
      const buffer = await this.loadBuffer(soundId);

      // Если за время загрузки пользователь уже включил/выключил звук,
      // не создаём второй источник.
      if (track.isPlaying) {
        return;
      }

      const source = context.createBufferSource();
      const gainNode = context.createGain();

      source.buffer = buffer;

      // Главное отличие от HTMLAudio:
      // loop происходит непосредственно внутри Web Audio API.
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;

      gainNode.gain.value = 0;

      source.connect(gainNode);
      gainNode.connect(context.destination);

      const now = context.currentTime;

      source.start(now);

      track.source = source;
      track.gainNode = gainNode;
      track.startedAt = now;
      track.offset = 0;
      track.isPlaying = true;

      const targetVolume = track.targetVolume;

      // Плавный fade-in через Web Audio API.
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(
        targetVolume,
        now + this.fadeDuration / 1000
      );
    } catch (error) {
      console.error("Audio play was blocked or failed:", error);

      track.isPlaying = false;
      track.source = null;
      track.gainNode = null;
    }
  }

  async fadeOut(soundId) {
    const track = this.getTrack(soundId);

    this.clearFade(track);

    if (!track.isPlaying || !track.source || !track.gainNode) {
      track.isPlaying = false;
      return;
    }

    const context = this.getContext();
    const source = track.source;
    const gainNode = track.gainNode;

    const now = context.currentTime;

    // Запоминаем положение внутри трека.
    track.offset = this.getProgress(soundId) * (
      track.buffer?.duration || 0
    );

    gainNode.gain.cancelScheduledValues(now);

    const currentGain = gainNode.gain.value;

    gainNode.gain.setValueAtTime(currentGain, now);

    gainNode.gain.linearRampToValueAtTime(
      0,
      now + this.fadeDuration / 1000
    );

    await new Promise((resolve) => {
      setTimeout(() => {
        try {
          source.stop();
        } catch {
          // source уже мог быть остановлен
        }

        source.disconnect();
        gainNode.disconnect();

        track.source = null;
        track.gainNode = null;

        track.isPlaying = false;
        track.offset = 0;

        resolve();
      }, this.fadeDuration);
    });
  }

  setVolume(soundId, volume) {
    const track = this.getTrack(soundId);
    const safeVolume = this.normalizeVolume(volume);

    track.targetVolume = safeVolume;

    if (track.isPlaying && track.gainNode) {
      const context = this.getContext();

      track.gainNode.gain.setTargetAtTime(
        safeVolume,
        context.currentTime,
        0.01
      );
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

    if (!track.buffer || !track.isPlaying || !track.source) {
      return 0;
    }

    const context = this.getContext();

    const duration = track.buffer.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
      return 0;
    }

    const elapsed = context.currentTime - track.startedAt;

    const position = elapsed % duration;

    return position / duration;
  }

  getDuration(soundId) {
    const track = this.getTrack(soundId);

    if (track.buffer && Number.isFinite(track.buffer.duration)) {
      return track.buffer.duration;
    }

    if (
      Number.isFinite(track.audio.duration) &&
      track.audio.duration > 0
    ) {
      return track.audio.duration;
    }

    return 0;
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
