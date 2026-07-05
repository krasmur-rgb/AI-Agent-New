/* ============================================================
   render.js — отрисовка сцены, картинки, выборов, панели тяг,
   модалок развязки и финала. Никакой игровой логики: рисует то,
   что передал движок.
   ============================================================ */

import { getNote, setNote, openDump } from './comments.js?v=3';

const app = document.getElementById('app');

/* ---------- утилиты картинки ---------- */
// basename без расширения → блок картинки с заглушкой
function imageBlock(imageBase, code) {
  const wrap = el('div', 'scene-img-wrap');

  const ph = el('div', 'scene-img-placeholder');
  const phLabel = el('span');
  phLabel.textContent = code;
  ph.appendChild(phLabel);
  wrap.appendChild(ph);

  const pic = document.createElement('picture');
  const src = document.createElement('source');
  src.media = '(max-width: 767px)';
  src.srcset = `img/mobile/${imageBase}.jpg`;
  const img = document.createElement('img');
  img.className = 'scene-img';
  img.alt = '';
  img.decoding = 'async';
  img.src = `img/desktop/${imageBase}.jpg`;
  img.addEventListener('load', () => img.classList.add('loaded'));
  // при ошибке оставляем прозрачным → видна нейтральная заглушка (SPEC §5)
  img.addEventListener('error', () => img.classList.remove('loaded'));
  pic.appendChild(src);
  pic.appendChild(img);
  wrap.appendChild(pic);

  return wrap;
}

/* ---------- формат служебных строк ---------- */
function fmtVec(vec, rivers) {
  return vec.map((v) => {
    const name = (rivers && rivers[v.river]) || v.river;
    const arrow = v.down ? '▼' : '▲';
    return `<span class="vecpart">${name}${arrow}+${v.amt}</span>`;
  }).join(', ');
}

/* ============================================================
   Стартовая страница
   ============================================================ */
export function renderStart(view) {
  const { title, subtitle, intro, buttonLabel, imageBase, onStart } = view;

  document.body.classList.add('on-start');   // прячем шапку сайта: заголовок живёт на картинке
  const wrap = el('div', 'start-screen');

  // картинка во всю ширину; заголовок — на картинке в верхнем левом углу,
  // кнопка — в левом нижнем
  const hero = imageBlock(imageBase, 'Анна Каренина');

  const overlay = el('div', 'start-hero-overlay');
  overlay.appendChild(txtEl('h1', 'start-title', title));
  if (subtitle) overlay.appendChild(txtEl('p', 'start-subtitle', subtitle));
  hero.appendChild(overlay);

  const cta = el('div', 'start-cta');
  const btn = el('button', 'btn btn-primary start-btn');
  btn.type = 'button';
  btn.textContent = buttonLabel || 'Начать';
  btn.addEventListener('click', onStart);
  cta.appendChild(btn);
  hero.appendChild(cta);
  wrap.appendChild(hero);

  const box = el('div', 'start-box');

  // предисловие
  if (intro && intro.length) {
    const introBlock = el('div', 'start-intro');
    if (view.introTitle) introBlock.appendChild(txtEl('h2', 'start-intro-title', view.introTitle));
    intro.forEach((par) => introBlock.appendChild(txtEl('p', null, par)));
    box.appendChild(introBlock);
  }

  wrap.appendChild(box);

  app.innerHTML = '';
  app.appendChild(wrap);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ============================================================
   Отрисовка сцены
   ============================================================ */
export function renderScene(view, handlers) {
  document.body.classList.remove('on-start');
  const { actHeader, code, proseHtml, choices, imageBase, debug } = view;

  const scene = el('div', 'scene');

  // заголовок акта (только на первой сцене акта)
  if (actHeader) {
    const head = el('div', 'act-head');
    head.appendChild(txtEl('div', 'act-num', actHeader.num));
    head.appendChild(txtEl('div', 'act-title', actHeader.title));
    if (actHeader.q) head.appendChild(txtEl('div', 'act-q', actHeader.q));
    scene.appendChild(head);
  }

  // верх: слева описание сцены, справа картинка (широкий экран)
  const top = el('div', 'scene-top');

  const text = el('div', 'scene-text');
  const prose = el('div', 'prose');
  prose.innerHTML = proseHtml;
  text.appendChild(prose);
  top.appendChild(text);

  const visual = el('div', 'scene-visual');
  visual.appendChild(imageBlock(imageBase, code));
  top.appendChild(visual);

  // объединительная рамка: картинка + описание + выборы = один большой блок
  const episode = el('div', 'episode');
  episode.appendChild(top);

  // плашка-призыв между сценой и вариантами
  const askBanner = el('div', 'ask-banner');
  askBanner.textContent = 'Как отреагирует Анна?';
  episode.appendChild(askBanner);

  // выборы
  const list = el('ul', 'choices');
  choices.forEach((ch, i) => {
    const li = el('li', 'choice');

    const btn = el('button', 'choice-btn');
    btn.type = 'button';
    btn.appendChild(txtEl('span', 'choice-tag', ch.tag));
    const htmlSpan = el('span', 'choice-html');
    htmlSpan.innerHTML = ch.html;
    btn.appendChild(htmlSpan);
    btn.addEventListener('click', () => handlers.onChoice(i));
    li.appendChild(btn);

    // служебная строка выбора (debug)
    const dbg = el('div', 'choice-dbg');
    let dbgHtml = fmtVec(ch.vec, debug.rivers);
    if (ch.kills && ch.kills.length) {
      dbgHtml += ` · <span class="kills">закрывает: ${ch.kills.join(', ')}</span>`;
    }
    dbgHtml += ` · <span class="nat">природа: ${ch.nature}</span>`;
    dbg.innerHTML = dbgHtml;
    li.appendChild(dbg);

    list.appendChild(li);
  });
  episode.appendChild(list);
  scene.appendChild(episode);

  // панель тяг (debug)
  scene.appendChild(pullPanel(debug));

  // заметки отладчика
  scene.appendChild(noteBox(code, view));

  // заменить содержимое
  app.innerHTML = '';
  app.appendChild(scene);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ---------- панель тяг ---------- */
function pullPanel(debug) {
  const { pull, dead, leader, order, rivers, alive } = debug;
  const panel = el('div', 'pull-panel');
  panel.appendChild(txtEl('h4', null, 'Служебная панель · тяги русел'));

  const max = Math.max(1, ...order.map((r) => pull[r] || 0));
  const rows = el('div', 'pull-rows');
  order.forEach((r) => {
    const isDead = dead.includes(r);
    const row = el('div', 'pull-row' + (isDead ? ' dead' : '') + (r === leader ? ' leader' : ''));
    const label = el('div', 'pull-label');
    label.textContent = `${r} · ${rivers[r] || r}`;
    const track = el('div', 'pull-bar-track');
    const fill = el('div', 'pull-bar-fill');
    fill.style.width = Math.round(((pull[r] || 0) / max) * 100) + '%';
    track.appendChild(fill);
    const val = el('div', 'pull-val');
    val.textContent = (pull[r] || 0).toFixed(1);
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(val);
    rows.appendChild(row);
  });
  panel.appendChild(rows);

  const meta = el('div', 'pull-meta');
  meta.innerHTML =
    `Лидер: <b>${leader} · ${rivers[leader] || leader}</b><br>` +
    `Достижимые финалы: ${alive.join(', ') || '—'}<br>` +
    `Закрытые русла: ${dead.length ? dead.join(', ') : '—'}`;
  panel.appendChild(meta);

  return panel;
}

/* ---------- поле заметки ---------- */
function noteBox(code, view) {
  const box = el('div', 'note-box');
  const label = document.createElement('label');
  label.textContent = `Заметка отладчика к сцене ${code}`;
  const area = el('textarea', 'note-area');
  area.value = getNote(code);
  label.htmlFor = 'note-' + code;
  area.id = 'note-' + code;
  box.appendChild(label);
  box.appendChild(area);

  const actions = el('div', 'note-actions');
  const saveBtn = el('button', 'btn btn-small');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Сохранить заметку';
  const saved = el('span', 'note-saved');
  saved.textContent = 'сохранено';
  saveBtn.addEventListener('click', () => {
    setNote(code, area.value);
    saved.classList.add('show');
    setTimeout(() => saved.classList.remove('show'), 1200);
  });

  const dumpBtn = el('button', 'btn btn-small');
  dumpBtn.type = 'button';
  dumpBtn.textContent = 'Выгрузить все заметки';
  dumpBtn.addEventListener('click', () => {
    // сохранить текущую заметку перед выгрузкой
    setNote(code, area.value);
    openDump(view.orderedCodes, view.pathList);
  });

  actions.appendChild(saveBtn);
  actions.appendChild(dumpBtn);
  actions.appendChild(saved);
  box.appendChild(actions);

  return box;
}

/* ============================================================
   Модальное окно развязки акта
   ============================================================ */
export function showResolution(res, onContinue) {
  const body = document.getElementById('modal-body');
  const overlay = document.getElementById('modal-overlay');
  const btn = document.getElementById('modal-continue');

  const frag = document.createDocumentFragment();
  frag.appendChild(txtEl('div', 'res-kicker', res.kicker));         // "Развязка · Акт I"
  if (res.title) frag.appendChild(txtEl('div', 'res-title', res.title));
  frag.appendChild(txtEl('p', 'res-scene', res.scene));
  frag.appendChild(txtEl('p', 'res-silent', res.silent));

  // шкала силы 1–5
  const strength = el('div', 'strength');
  const pips = el('div', 'strength-pips');
  for (let i = 1; i <= 5; i++) {
    const pip = el('div', 'pip' + (i <= res.level ? ' on' : ''));
    pips.appendChild(pip);
  }
  strength.appendChild(pips);
  strength.appendChild(txtEl('span', 'strength-label', `сила ${res.level}/5`));
  frag.appendChild(strength);

  // служебная строка
  frag.appendChild(dbgLine(res.debugText));

  body.innerHTML = '';
  body.appendChild(frag);
  btn.textContent = 'Дальше';
  overlay.hidden = false;

  const handler = () => {
    overlay.hidden = true;
    btn.removeEventListener('click', handler);
    onContinue();
  };
  btn.addEventListener('click', handler);
}

/* ============================================================
   Финал
   ============================================================ */
export function showFinale(view) {
  document.body.classList.remove('on-start');
  const { finale, rule, debugText, onRestart } = view;
  app.innerHTML = '';

  const wrap = el('div', 'scene finale');
  wrap.appendChild(txtEl('div', 'finale-kicker', 'Финал'));
  wrap.appendChild(txtEl('div', 'finale-name', finale.name));
  wrap.appendChild(txtEl('p', 'finale-paid', 'Заплачено: ' + finale.paid));

  wrap.appendChild(imageBlock(finale.imageBase, finale.code));

  wrap.appendChild(txtEl('p', 'finale-scene', finale.scene));
  wrap.appendChild(txtEl('p', 'finale-silent', finale.silent));
  wrap.appendChild(txtEl('p', 'finale-rule', rule));

  // служебная строка (debug)
  const dbg = dbgLine(debugText);
  dbg.style.marginTop = '16px';
  wrap.appendChild(dbg);

  const actions = el('div', 'finale-actions');
  const restart = el('button', 'btn btn-primary');
  restart.textContent = 'Начать заново';
  restart.addEventListener('click', onRestart);
  actions.appendChild(restart);
  wrap.appendChild(actions);

  app.appendChild(wrap);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ---------- служебная строка модалки/финала ---------- */
function dbgLine(text) {
  const d = el('div', 'modal-dbg');
  d.textContent = text;
  return d;
}

/* ---------- маленькие DOM-хелперы ---------- */
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function txtEl(tag, cls, text) {
  const e = el(tag, cls);
  e.textContent = text;
  return e;
}
