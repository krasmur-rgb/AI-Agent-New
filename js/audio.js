/* ============================================================
   audio.js — музыка заставки.
   Браузеры блокируют автозапуск звука до первого жеста пользователя,
   поэтому: пробуем тихий автозапуск (сработает, если разрешено),
   иначе музыка включается кнопкой 🔊 на заставке.
   ============================================================ */

const SRC = 'audio/intro.mp3';
const TARGET_VOLUME = 0.55;

let el = null;          // единственный <audio>
let fadeTimer = null;

function ensure() {
  if (el) return el;
  el = new Audio(SRC);
  el.loop = true;
  el.preload = 'auto';
  el.volume = TARGET_VOLUME;
  return el;
}

export function isPlaying() {
  return !!(el && !el.paused);
}

/* Попытка автозапуска: тихо глотаем отказ. Возвращает Promise<boolean>. */
export function tryAutoplay() {
  const a = ensure();
  return a.play().then(() => true).catch(() => false);
}

export function toggle() {
  const a = ensure();
  if (a.paused) {
    stopFade();
    a.volume = TARGET_VOLUME;
    return a.play().then(() => true).catch(() => false);
  }
  a.pause();
  return Promise.resolve(false);
}

/* Плавное затухание и остановка (при старте игры). */
export function fadeOutAndStop(ms = 1200) {
  if (!el || el.paused) return;
  stopFade();
  const a = el;
  const startVol = a.volume;
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = startVol * (1 - k);
    if (k >= 1) {
      stopFade();
      a.pause();
      a.currentTime = 0;
      a.volume = TARGET_VOLUME;
    }
  }, 50);
}

function stopFade() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
}
