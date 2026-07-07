/* ============================================================
   engine.js — движок русел: состояние, тяга, переходы, финал.
   Точка входа модуля. Читает data/scenario_data.json через fetch;
   тексты сцен в код НЕ вшиты (SPEC §1).
   ============================================================ */

import { renderScene, renderStart, showResolution, showFinale, showNavigation, showConfirm } from './render.js?v=17';
import { wireDumpModal, noteCount } from './comments.js?v=3';

/* ---------- ЧЕРНОВЫЕ КОНСТАНТЫ МЕХАНИКИ (SPEC §3) ----------
   Калибруются автором после пилота. Значения по умолчанию — из
   meta.constants JSON, с запасными 0.4/0.4. Держим на виду. */
let STICK = 0.4;   // липкость: ход down съедает по STICK у C и R
let VISC  = 0.4;   // вязкость: ход вверх (down:false) весит amt × VISC

// Природа хода → вклад в силу развязки акта (SPEC §4)
const NATURE_WEIGHT = { open: 2, force: 2, omen: 1, hedge: 0, guard: -1 };

/* ---------- глобальные данные ---------- */
let DATA = null;
let RIVERS = null;      // {L:'любовь', ...}
let RIVER_ORDER = ['L', 'C', 'R', 'F', 'X'];

/* ---------- состояние прохождения ---------- */
let pull, dead, movesLog, actNatures, path, visitedOrder;
let actPos, sceneList, scenePos, currentAct, currentBranch;
let sceneRegistry;    // code -> снимок открытой сцены (для навигации/просмотра)
let answeredChoice;   // code -> индекс сделанного выбора (зафиксирован навсегда)
let runActive;        // прохождение начато и финал ещё не показан
let resumeRun;        // как вернуться к текущему месту прохождения (сцена или развязка)

function resetState() {
  pull = { L: 0, C: 0, R: 0, F: 0, X: 0 };
  dead = new Set();
  movesLog = [];      // массив массивов русел последних ходов (тренд)
  actNatures = [];    // природы ходов текущего акта
  path = [];          // [{code, tag}] — путь прохождения
  visitedOrder = [];  // коды сцен по порядку показа
  actPos = 0;
  sceneList = [];
  scenePos = 0;
  currentAct = null;
  currentBranch = null;
  sceneRegistry = {};
  answeredChoice = {};
  runActive = false;
  resumeRun = null;
}

/* ============================================================
   ЯДРО АСИММЕТРИИ — применение вектора (SPEC §3, дословно)
   ============================================================ */
function applyVec(vec) {
  vec.forEach((v) => {
    if (v.down) {
      pull[v.river] += v.amt;                       // полный вес вниз
      ['C', 'R'].forEach((s) => {                   // липкость
        if (s !== v.river) pull[s] = Math.max(0, pull[s] - STICK);
      });
    } else {
      pull[v.river] += v.amt * VISC;                // вязкий ход вверх — доля веса
    }
  });
}

/* ---------- лидер русла (SPEC §3) ----------
   максимум pull среди не-dead; при равенстве — русло, чаще
   встречавшееся в последних 3 ходах (тренд); затем — порядок русел. */
function leader() {
  let alive = RIVER_ORDER.filter((r) => !dead.has(r));
  if (alive.length === 0) alive = RIVER_ORDER.slice(); // страховка: не оставить без финала

  let max = -Infinity;
  alive.forEach((r) => { if (pull[r] > max) max = pull[r]; });
  const tied = alive.filter((r) => pull[r] === max);
  if (tied.length === 1) return tied[0];

  // тренд: считаем частоту в последних 3 ходах
  const recent = movesLog.slice(-3).flat();
  let best = tied[0];
  let bestCount = -1;
  for (const r of tied) {
    const c = recent.filter((x) => x === r).length;
    if (c > bestCount) { bestCount = c; best = r; }   // при равенстве остаётся порядок RIVER_ORDER
  }
  return best;
}

function aliveRivers() {
  return RIVER_ORDER.filter((r) => !dead.has(r));
}

/* ---------- имя файла картинки (SPEC §2, §5) ---------- */
function imageBaseFor(code, branch) {
  // ветки C/R/X Акта IV используют placeholder-{river} для всех 3 сцен
  if (branch && ['C', 'R', 'X'].includes(branch) && /^IV\./.test(code)) {
    return 'placeholder-' + branch;
  }
  return code.replace(/\./g, '-');  // точки → дефисы; дефисы веток (IV.1-LF) сохраняются
}

/* ---------- сбор служебной инфо для debug-панели ---------- */
function debugSnapshot() {
  return {
    pull: { ...pull },
    dead: [...dead],
    leader: leader(),
    order: RIVER_ORDER,
    rivers: RIVERS,
    alive: aliveRivers(),
  };
}

function debugTextLine() {
  const pulls = RIVER_ORDER.map((r) => `${r}:${pull[r].toFixed(1)}`).join(' ');
  const deadStr = dead.size ? [...dead].join(',') : '—';
  const pathStr = path.map((p) => p.code).join(' → ') || '—';
  return `тяги [${pulls}] · закрыто [${deadStr}] · лидер ${leader()} · путь ${pathStr}`;
}

/* ============================================================
   Поток актов
   ============================================================ */
function start() {
  resetState();
  runActive = true;
  enterAct(0);
}

/* ---------- стартовая страница ---------- */
function showStartScreen() {
  const meta = DATA.meta || {};
  const st = meta.start || {};
  renderStart({
    title: meta.title || 'Анна Каренина',
    subtitle: st.subtitle || meta.subtitle || '',
    introTitle: st.introTitle || '',
    intro: st.intro || [],
    buttonLabel: st.button || 'Начать историю',
    imageBase: 'main',            // img/desktop/main.jpg · img/mobile/main.jpg
    onStart: start,
    // живое прохождение можно продолжить с текущего места
    canContinue: !!(runActive && resumeRun),
    continueLabel: runActive && currentAct ? 'Продолжить · ' + currentAct.num : 'Продолжить',
    onContinue: () => { if (resumeRun) resumeRun(); },
  });
}

/* ---------- уход на главную с защитой прохождения ---------- */
function goHomeGuarded() {
  if (runActive && path.length > 0) {
    showConfirm(
      'Вы уходите из прохождения. Вернуться можно будет кнопкой «Продолжить» — пока вкладка открыта.',
      showStartScreen,                                   // уйти
      () => { if (resumeRun) resumeRun(); },             // остаться — вернуть текущий экран
    );
  } else {
    showStartScreen();
  }
}

function enterAct(i) {
  actPos = i;
  actNatures = [];
  currentAct = DATA.acts[i];
  currentBranch = null;

  if (currentAct.branches) {
    // Акт IV: выбор ветки по лидеру на входе; F идёт по ветке L (SPEC §4)
    let br = leader();
    if (br === 'F') br = 'L';
    if (!currentAct.branches[br]) br = 'L';  // страховка
    currentBranch = br;
    sceneList = currentAct.branches[br];
  } else {
    sceneList = currentAct.scenes;
  }
  scenePos = 0;
  showScene();
}

function showScene() {
  const scene = sceneList[scenePos];

  // регистрируем сцену как «открытую» только при первом показе
  if (!sceneRegistry[scene.code]) {
    // текст: V.1 берёт прозу по руслу-лидеру (SPEC §4) — снимок на момент открытия
    let proseHtml = scene.prose;
    if (scene.proseByRiver) {
      proseHtml = scene.proseByRiver[leader()] || scene.proseByRiver.L || '';
    }
    visitedOrder.push(scene.code);
    sceneRegistry[scene.code] = {
      scene,
      proseHtml,
      imageBase: imageBaseFor(scene.code, currentBranch),
      actNum: currentAct.num,
      actTitle: currentAct.title,
      actQ: currentAct.q,
    };
  }
  resumeRun = showScene;   // «Продолжить» возвращает на текущую сцену
  renderSceneEntry(sceneRegistry[scene.code], false);
}

/* Отрисовка открытой сцены: живой (frontier) или в режиме просмотра —
   выбор уже сделан и изменить его нельзя. */
function renderSceneEntry(entry, readOnly) {
  const scene = entry.scene;
  const view = {
    actHeader: { num: entry.actNum, title: entry.actTitle, q: entry.actQ },
    code: scene.code,
    proseHtml: entry.proseHtml,
    choices: scene.choices,
    imageBase: entry.imageBase,
    debug: debugSnapshot(),
    orderedCodes: visitedOrder.slice(),
    pathList: path.slice(),
    readOnly,
    chosenIdx: answeredChoice[scene.code],
  };
  // из просмотра пройденного эпизода можно вернуться к текущему месту
  const frontier = runActive && sceneList && sceneList[scenePos]
    && answeredChoice[sceneList[scenePos].code] === undefined
    ? sceneList[scenePos].code : null;
  view.frontierCode = readOnly && frontier && frontier !== scene.code ? frontier : null;

  renderScene(view, {
    onChoice: readOnly ? () => {} : (idx) => onChoice(scene, idx),
    onGoFrontier: () => { if (resumeRun) resumeRun(); },
  });
}

/* Текущая «живая» сцена — последняя открытая, выбор в ней ещё не сделан. */
function isFrontier(code) {
  return !!(sceneList && sceneList[scenePos] && sceneList[scenePos].code === code
    && answeredChoice[code] === undefined);
}

/* Переход по навигации: frontier рисуем живьём, остальные — просмотр. */
function goToScene(code) {
  const entry = sceneRegistry[code];
  if (!entry) return;
  if (isFrontier(code)) showScene();
  else renderSceneEntry(entry, true);
}

/* Данные для окна навигации: ТОЛЬКО открытые акты и эпизоды,
   по порядку открытия. Неоткрытое не показываем вовсе. */
function navData() {
  const groups = [];
  const byAct = {};
  visitedOrder.forEach((code) => {
    const e = sceneRegistry[code];
    if (!e) return;
    if (!byAct[e.actNum]) {
      byAct[e.actNum] = { num: e.actNum, title: e.actTitle, episodes: [] };
      groups.push(byAct[e.actNum]);
    }
    const ansIdx = answeredChoice[code];
    byAct[e.actNum].episodes.push({
      code,
      tag: ansIdx !== undefined ? e.scene.choices[ansIdx].tag : null,
      current: isFrontier(code),
    });
  });
  return groups;
}

function onChoice(scene, idx) {
  // выбор фиксируется навсегда — повторное нажатие невозможно
  if (answeredChoice[scene.code] !== undefined) return;
  answeredChoice[scene.code] = idx;

  const choice = scene.choices[idx];

  // 1) закрыть финалы
  if (choice.kills) choice.kills.forEach((k) => dead.add(k));
  // 2) применить вектор
  applyVec(choice.vec);
  // 3) учесть природу для силы развязки акта
  if (choice.nature) actNatures.push(choice.nature);
  // 4) тренд + путь
  movesLog.push(choice.vec.map((v) => v.river));
  path.push({ code: scene.code, tag: choice.tag });

  advance();
}

function advance() {
  scenePos++;
  if (scenePos < sceneList.length) {
    showScene();
  } else {
    endAct();
  }
}

function endAct() {
  // Акт V (последний) → финал без развязки
  if (actPos >= DATA.acts.length - 1) {
    showFinaleScreen();
    return;
  }
  // Акты I–IV → развязка, затем следующий акт
  const res = computeResolution();
  const openResolution = () => showResolution(res, () => enterAct(actPos + 1), goHomeGuarded);
  resumeRun = openResolution;   // «Продолжить»/«остаться» возвращает развязку
  openResolution();
}

/* ---------- сила развязки акта (SPEC §4) ---------- */
function computeResolution() {
  let s = actNatures.reduce((a, n) => a + (NATURE_WEIGHT[n] ?? 0), 0);
  const lvl = Math.max(1, Math.min(5, Math.round((s + 5) / 3) + 1));
  const r = DATA.resolutions[String(lvl)] || DATA.resolutions[lvl];
  return {
    kicker: 'Развязка · ' + currentAct.num,
    title: currentAct.title,
    scene: r.scene,
    silent: r.silent,
    level: lvl,
    debugText: `сила=${lvl} (natures: ${actNatures.join(',') || '—'}, s=${s}) · ` + debugTextLine(),
  };
}

/* ---------- финал (SPEC §4) ---------- */
function showFinaleScreen() {
  const lead = leader();                 // лидер среди живых
  const fin = DATA.finales[lead];
  const finale = {
    name: fin.name,
    paid: fin.paid,
    scene: fin.scene,
    silent: fin.silent,
    code: 'fin-' + lead,
    imageBase: 'fin-' + lead,            // fin-L.jpg … fin-X.jpg
  };
  runActive = false;    // прохождение завершено — защита больше не нужна
  resumeRun = null;
  showFinale({
    finale,
    rule: DATA.rule || '',
    debugText: 'ФИНАЛ ' + lead + ' · ' + debugTextLine(),
    onRestart: showStartScreen,
  });
}

/* ============================================================
   Инициализация
   ============================================================ */
/* Служебный слой доступен только с ?debug=1 (SPEC §6: чистый режим —
   как у конечного игрока; пилотный вход для автора — через параметр). */
function wireDebugToggle() {
  const cb = document.getElementById('debug-checkbox');
  const debugAllowed = new URLSearchParams(location.search).get('debug') === '1';
  if (debugAllowed) {
    document.body.classList.add('debug-avail');   // показывает сам переключатель
    cb.checked = true;
  }
  const apply = () => document.body.classList.toggle('debug', debugAllowed && cb.checked);
  cb.addEventListener('change', apply);
  apply();
}

/* Предупреждение при закрытии/обновлении вкладки: гибнут прохождение и заметки */
function wireUnloadGuard() {
  window.addEventListener('beforeunload', (e) => {
    if ((runActive && path && path.length > 0) || noteCount() > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* «На главную» в шапке: сброс прохождения, возврат на стартовый экран.
   Шапка скрыта на старте, так что кнопка видна только в игре. */
function wireHomeButton() {
  document.getElementById('btn-home').addEventListener('click', goHomeGuarded);
}

/* «Навигация»: переключение между ОТКРЫТЫМИ актами и эпизодами. */
function wireNavButton() {
  document.getElementById('btn-nav').addEventListener('click', () => {
    if (!visitedOrder || !visitedOrder.length) return;
    showNavigation(navData(), goToScene);
  });
}

async function init() {
  wireDebugToggle();
  wireUnloadGuard();
  wireHomeButton();
  wireNavButton();
  wireDumpModal();

  try {
    const resp = await fetch('data/scenario_data.json?v=10');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    DATA = await resp.json();
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<div class="loading">Не удалось загрузить сценарий (data/scenario_data.json).<br>' +
      'Запустите через локальный сервер, а не открытием файла. ' +
      '<br><small>' + (e && e.message ? e.message : e) + '</small></div>';
    console.error('Ошибка загрузки сценария:', e);
    return;
  }

  // мета: русла, порядок, константы
  RIVERS = (DATA.meta && DATA.meta.rivers) || RIVERS;
  if (DATA.meta && DATA.meta.riverOrder) RIVER_ORDER = DATA.meta.riverOrder;
  if (DATA.meta && DATA.meta.constants) {
    if (typeof DATA.meta.constants.STICK === 'number') STICK = DATA.meta.constants.STICK;
    if (typeof DATA.meta.constants.VISC === 'number') VISC = DATA.meta.constants.VISC;
  }

  // заголовок/подзаголовок
  if (DATA.meta) {
    if (DATA.meta.title) document.getElementById('doc-title').textContent = DATA.meta.title;
    if (DATA.meta.subtitle) document.getElementById('doc-subtitle').textContent = DATA.meta.subtitle;
    if (DATA.meta.title) document.title = DATA.meta.title + ' · интерактивная драма';
  }

  showStartScreen();
}

init();
