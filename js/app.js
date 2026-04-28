import { soundCategories } from "./sounds-config.js";
import { AudioEngine } from "./audio.js";

const soundBoard = document.querySelector("#soundBoard");
const stopAllButton = document.querySelector("#stopAllButton");

const audioEngine = new AudioEngine({
  fadeDuration: 900,
  fadeStep: 30,
});

init();

function init() {
  registerSounds();
  renderSoundBoard();
  bindGlobalControls();
  startProgressLoop();
}

function registerSounds() {
  soundCategories.forEach((category) => {
    category.sounds.forEach((sound) => {
      audioEngine.registerSound(sound);
    });
  });
}

function renderSoundBoard() {
  soundBoard.innerHTML = "";

  soundCategories.forEach((category) => {
    const categoryElement = createCategoryElement(category);
    soundBoard.appendChild(categoryElement);
  });
}

function createCategoryElement(category) {
  const section = document.createElement("section");
  section.className = "category";
  section.dataset.category = category.id;

  section.innerHTML = `
    <div class="category__header">
      <div class="category__icon-wrap">
        <img class="category__icon" src="${category.icon}" alt="" />
      </div>

      <div>
        <h2>${category.title}</h2>
        <p>${category.subtitle}</p>
      </div>
    </div>

    <div class="category__sounds"></div>
  `;

  const soundsContainer = section.querySelector(".category__sounds");

  category.sounds.forEach((sound) => {
    const soundCard = createSoundCard(sound);
    soundsContainer.appendChild(soundCard);
  });

  return section;
}

function createSoundCard(sound) {
  const card = document.createElement("article");
  card.className = "sound-card";
  card.dataset.soundId = sound.id;

  const volumePercent = Math.round((sound.defaultVolume ?? 0.5) * 100);

  card.innerHTML = `
    <button class="sound-card__main" type="button" aria-label="Play ${sound.title}">
      <div class="sound-card__icon-frame" style="--track-progress-angle: 0deg;">
        <img class="sound-card__icon" src="${sound.icon}" alt="" />
        <span class="sound-card__duration">--:--</span>
      </div>

      <div class="sound-card__content">
        <h3>${sound.title}</h3>
        <p>${sound.description}</p>
      </div>

      <div class="sound-card__status">
        <span class="status-dot"></span>
        <span class="status-text">OFF</span>
      </div>
    </button>

    <div class="volume-control">
      <span class="volume-control__label">Volume</span>

      <input
        class="volume-control__slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value="${sound.defaultVolume ?? 0.5}"
        aria-label="${sound.title} volume"
      />

      <span class="volume-control__value">${volumePercent}%</span>
    </div>
  `;

  const playButton = card.querySelector(".sound-card__main");
  const slider = card.querySelector(".volume-control__slider");
  const volumeValue = card.querySelector(".volume-control__value");
  const durationElement = card.querySelector(".sound-card__duration");
  const audioElement = audioEngine.getAudioElement(sound.id);

  audioElement.addEventListener("loadedmetadata", () => {
    durationElement.textContent = formatTime(audioElement.duration);
  });

  if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
    durationElement.textContent = formatTime(audioElement.duration);
  }

  playButton.addEventListener("click", async () => {
    const isPlaying = await audioEngine.toggle(sound.id);
    updateCardState(card, isPlaying);
  });

  slider.addEventListener("input", () => {
    const volume = Number(slider.value);
    audioEngine.setVolume(sound.id, volume);
    volumeValue.textContent = `${Math.round(volume * 100)}%`;
  });

  return card;
}

function updateCardState(card, isPlaying) {
  const statusText = card.querySelector(".status-text");

  card.classList.toggle("is-playing", isPlaying);
  statusText.textContent = isPlaying ? "ON" : "OFF";
}

function bindGlobalControls() {
  stopAllButton.addEventListener("click", async () => {
    await audioEngine.stopAll();

    document.querySelectorAll(".sound-card").forEach((card) => {
      updateCardState(card, false);
    });
  });
}

function startProgressLoop() {
  function updateProgress() {
    document.querySelectorAll(".sound-card").forEach((card) => {
      const soundId = card.dataset.soundId;
      const iconFrame = card.querySelector(".sound-card__icon-frame");

      if (!soundId || !iconFrame) {
        return;
      }

      const isPlaying = audioEngine.isPlaying(soundId);
      const progress = isPlaying ? audioEngine.getProgress(soundId) : 0;
      const angle = `${progress * 360}deg`;
      
      iconFrame.style.setProperty("--track-progress-angle", angle);
    });

    requestAnimationFrame(updateProgress);
  }

  requestAnimationFrame(updateProgress);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--:--";
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.floor(seconds % 60);

  return `${minutes}:${String(restSeconds).padStart(2, "0")}`;
}
