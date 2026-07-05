/* ============================================================
   comments.js — заметки отладчика (SPEC §7)
   Хранение ТОЛЬКО в памяти. Никакого localStorage/sessionStorage.
   ============================================================ */

// code -> текст заметки
const store = Object.create(null);

export function setNote(code, text) {
  const t = (text || '').trim();
  if (t) store[code] = t;
  else delete store[code];
}

export function getNote(code) {
  return store[code] || '';
}

export function noteCount() {
  return Object.keys(store).length;
}

/**
 * Собирает все заметки в один текст: по порядку сцен + путь прохождения.
 * @param {string[]} orderedCodes — коды сцен в порядке прохождения
 * @param {{code:string, tag:string}[]} pathList — путь (сцена → выбор)
 */
export function buildDump(orderedCodes, pathList) {
  const lines = [];
  lines.push('=== Заметки отладчика · «Анна Каренина» ===');
  lines.push('Сцен с заметками: ' + noteCount());
  lines.push('');

  // заметки по порядку сцен (без дублей кодов)
  const seen = new Set();
  let any = false;
  for (const code of orderedCodes) {
    if (seen.has(code)) continue;
    seen.add(code);
    const note = getNote(code);
    if (!note) continue;
    any = true;
    lines.push(code);
    for (const l of note.split('\n')) lines.push('  ' + l);
    lines.push('');
  }
  if (!any) {
    lines.push('(заметок пока нет)');
    lines.push('');
  }

  lines.push('--- Путь прохождения ---');
  if (pathList.length === 0) {
    lines.push('(путь пуст)');
  } else {
    for (const step of pathList) {
      lines.push(step.code + ' → ' + step.tag);
    }
  }

  return lines.join('\n');
}

/**
 * Показывает модальное окно выгрузки и пытается скопировать текст.
 */
export function openDump(orderedCodes, pathList) {
  const overlay = document.getElementById('dump-overlay');
  const area = document.getElementById('dump-area');
  const status = document.getElementById('dump-status');
  const text = buildDump(orderedCodes, pathList);

  area.value = text;
  status.textContent = '';
  overlay.hidden = false;

  // попытка автоскопировать
  tryCopy(text).then((ok) => {
    status.textContent = ok
      ? 'Скопировано в буфер обмена.'
      : 'Автокопирование недоступно — выделите текст и скопируйте вручную.';
  });

  // выделить для удобства ручного копирования
  area.focus();
  area.select();
}

function tryCopy(text) {
  // 1) современный API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => execCopy(text));
  }
  return Promise.resolve(execCopy(text));
}

function execCopy(text) {
  try {
    const area = document.getElementById('dump-area');
    area.focus();
    area.select();
    const ok = document.execCommand && document.execCommand('copy');
    return !!ok;
  } catch (e) {
    return false;
  }
}

// Кнопки модалки выгрузки
export function wireDumpModal() {
  const overlay = document.getElementById('dump-overlay');
  const closeBtn = document.getElementById('dump-close');
  const copyBtn = document.getElementById('dump-copy');
  const area = document.getElementById('dump-area');
  const status = document.getElementById('dump-status');

  closeBtn.addEventListener('click', () => { overlay.hidden = true; });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
  copyBtn.addEventListener('click', () => {
    tryCopy(area.value).then((ok) => {
      status.textContent = ok ? 'Скопировано.' : 'Копирование не удалось — скопируйте вручную.';
    });
  });
}
