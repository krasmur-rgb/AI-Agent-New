/* ============================================================
   audio.js — музыка заставки.
   Браузеры блокируют автозапуск звука до первого жеста пользователя,
   поэтому: пробуем тихий автозапуск (сработает, если разрешено),
   иначе музыка включается кнопкой 🔊 на заставке.
   ============================================================ */

const SRC = 'audio/intro.mp3';
const TARGET_VOLUME = 0.55;   // громкость на заставке
const DUCK_VOLUME = 0.20;     // фоновая громкость в эпизоде I.1

let el = null;          // единственный <audio>
let fadeTimer = null;

function ensure() {
  if (el) return el;
  el = new Audio(SRC);
  el.loop = true;
  el.preload = 'auto';
  el.volume = TARGET_VOLUME;
  window.__introAudio = el;   // для отладки
  return el;
}

/* Плавный переход громкости; pauseAtEnd — остановить по завершении. */
function rampTo(target, ms, pauseAtEnd = false) {
  stopFade();
  const a = el;
  const startVol = a.volume;
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = startVol + (target - startVol) * k;
    if (k >= 1) {
      stopFade();
      if (pauseAtEnd) {
        a.pause();
        a.currentTime = 0;
        a.volume = TARGET_VOLUME;
      }
    }
  }, 50);
}

export function isPlaying() {
  return !!(el && !el.paused);
}

let userMuted = false;  // пользователь явно выключил музыку — не навязываем

/* Попытка автозапуска: тихо глотаем отказ. Возвращает Promise<boolean>.
   Если музыка уже играет (вернулись на главную из I.1) — плавно
   возвращаем полную громкость. */
export function tryAutoplay() {
  if (userMuted) return Promise.resolve(false);
  const a = ensure();
  if (!a.paused) {
    rampTo(TARGET_VOLUME, 700);
    return Promise.resolve(true);
  }
  a.volume = TARGET_VOLUME;
  return a.play().then(() => true).catch(() => false);
}

export function toggle() {
  const a = ensure();
  if (a.paused) {
    userMuted = false;
    stopFade();
    a.volume = TARGET_VOLUME;
    return a.play().then(() => true).catch(() => false);
  }
  userMuted = true;
  a.pause();
  return Promise.resolve(false);
}

/* Приглушить до фонового уровня (эпизод I.1): музыка продолжается тише. */
export function duckToBackground(ms = 1200) {
  if (!el || el.paused) return;
  rampTo(DUCK_VOLUME, ms);
}

/* Плавное затухание и полная остановка (переход дальше I.1). */
export function fadeOutAndStop(ms = 1200) {
  if (!el || el.paused) return;
  rampTo(0, ms, true);
}

function stopFade() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
}
