// The lamp: six progressive hints drawn only in light — a veil over the card with lit openings
// and hairline edges. Nothing here is drawn like the marker ink already on the card.
import { ROWS, RAILS, SOLUTION, LEGACY, decodePair } from './puzzle.js';
import {
  FRAME, HOLE_Y, holeX, holeBox, columnX, ROW_Y, wordBox, slotBox, legacyBand, columnBand, rowBand,
  BANDS, PATCHES, RELATION, RELATION_NAME, judgePartner, decodedStrip
} from './card-geometry.js';

export const LAMP_STEPS = ['方向', '孔', '形状', '示范', '逐行', '答案'];
const W = FRAME.width, H = FRAME.height;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attrs = b => `x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}"`;
const pad = (b, p) => ({ ...b, x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

// holes: [{x,y,w,h,cls}] cut out of the veil; each gets a hairline edge of light.
export function veil(holes, extra = '') {
  return `<defs><mask id="lamp-veil" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${holes.map(h => `<rect ${attrs(h)} rx="7" fill="#000"/>`).join('')}</mask></defs>`
    + `<rect class="veil" width="${W}" height="${H}" mask="url(#lamp-veil)"/>`
    + holes.map(h => `<rect class="lit-edge ${h.cls || ''}" ${attrs(h)} rx="7" vector-effect="non-scaling-stroke"/>`).join('')
    + extra;
}
const line = (x1, y1, x2, y2, cls = '') => `<line class="light-line ${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" vector-effect="non-scaling-stroke"/>`;
const label = (x, y, text, cls = '') => `<text class="lamp-label ${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(text)}</text>`;
const railLabels = (on = []) => RAILS.map((rail, i) => label(holeX(i), HOLE_Y - 30, rail, on.includes(rail) ? 'on' : '')).join('');
const allHoles = cls => RAILS.map((_, i) => ({ ...holeBox(i), cls }));
const holeFor = rail => holeBox(RAILS.indexOf(rail));
const rise = (rail, fromY) => line(holeX(RAILS.indexOf(rail)), fromY, holeX(RAILS.indexOf(rail)), HOLE_Y + 20);

const LEGACY_STEPS = [0, 1, 2, 3, 'space', 4];
const validRows = list => Array.isArray(list) ? list.filter(r => Number.isInteger(r) && r >= 0 && r < 9) : [];

export function createLamp({ host, store = {}, onChange, onLevel, reducedMotion = () => false }) {
  const toggle = host.querySelector('#lamp-toggle'), rings = [...host.querySelectorAll('.ring')];
  const caption = host.querySelector('#lamp-caption'), strip = host.querySelector('#lamp-strip');
  const controls = host.querySelector('#lamp-controls'), readout = host.querySelector('#lamp-readout');
  const s = {
    level: 0,
    reached: Math.min(6, Math.max(0, Number.parseInt(store.reached, 10) || 0)),
    solved: new Set(validRows(store.solved)),
    shown: new Set(validRows(store.shown)),
    wrong: new Map(Object.entries(store.wrong || {}).map(([row, cols]) => [Number(row), new Set(Array.isArray(cols) ? cols : [])])),
    revealAll: Boolean(store.revealAll),
    confirming: false, mode: 'column', column: 5, line: 0, legacy: 0, row: 0, note: '', flash: null
  };
  let flashTimer;
  const known = () => s.revealAll ? new Set(SOLUTION.keys()) : new Set([...s.solved, ...s.shown]);
  const isKnown = row => known().has(row);
  const nextOpen = (from = -1) => { for (let i = 1; i <= 9; i++) { const r = (from + i + 9) % 9; if (!isKnown(r)) return r; } return (from + 1 + 9) % 9; };
  s.row = nextOpen();

  const persist = () => onChange?.({
    reached: s.reached, solved: [...s.solved], shown: [...s.shown], revealAll: s.revealAll,
    wrong: Object.fromEntries([...s.wrong].map(([row, cols]) => [row, [...cols]]))
  });

  function setLevel(level) {
    level = Math.max(0, Math.min(6, Number(level) || 0));
    if (level > s.reached + 1) return false;
    s.level = level; s.reached = Math.max(s.reached, level);
    s.confirming = false; s.note = ''; s.flash = null; clearTimeout(flashTimer);
    render(); onLevel?.(level); persist();
    return true;
  }

  function pairLine(row) {
    const t = SOLUTION[row];
    return `${ROWS[row][0]} ${RELATION[t.zone]} ${ROWS[row][t.column]} → ${t.zone} + ${t.column} → ${decodePair(t.zone, t.column)}`;
  }

  function pick(row, column) {
    if (s.level !== 5) return;
    if (row !== s.row) { s.row = row; s.note = ''; if (column === 0) { render(); return; } }
    const result = judgePartner(row, column);
    if (!result) return;
    clearTimeout(flashTimer); s.flash = null;
    if (result.kind === 'origin') s.note = '这是起点。';
    else if (result.kind === 'miss') {
      if (!s.wrong.has(row)) s.wrong.set(row, new Set());
      s.wrong.get(row).add(column);
      if (result.patch) {
        s.note = '有人在这里试过。'; s.flash = result.patch.rail;
        if (!reducedMotion()) flashTimer = setTimeout(() => { s.flash = null; render(); }, 1900);
      } else s.note = '不是这个。';
    } else {
      s.solved.add(row);
      s.note = pairLine(row) + (known().size === 9 ? ' · 九行都读出来了。' : '');
    }
    render(); persist();
  }

  // Panels are re-rendered on every action; keep keyboard focus on the equivalent control.
  const keyOf = b => [b.dataset.act, b.dataset.col, b.dataset.row, b.dataset.step, b.dataset.mode, b.dataset.d].join('|');
  const FALLBACK = { reveal: '[data-act="reveal-confirm"]', 'reveal-cancel': '[data-act="reveal"]', 'reveal-confirm': '.ring[data-level="6"]', 'show-row': '[data-act="next-row"]', 'next-row': '[data-act="show-row"]' };
  function act(button) {
    const a = button.dataset.act, key = keyOf(button);
    if (a === 'mode') s.mode = button.dataset.mode;
    else if (a === 'step') { const d = Number(button.dataset.d); if (s.mode === 'column') s.column = (s.column + d + 10) % 10; else s.line = (s.line + d + 9) % 9; }
    else if (a === 'legacy') s.legacy = Number(button.dataset.step);
    else if (a === 'row') { s.row = Number(button.dataset.row); s.note = ''; }
    else if (a === 'pick') { if (button.getAttribute('aria-disabled') === 'true') { s.note = '这是起点。'; } else { pick(s.row, Number(button.dataset.col)); } }
    else if (a === 'show-row') { s.shown.add(s.row); s.note = pairLine(s.row); persist(); }
    else if (a === 'next-row') { s.row = nextOpen(s.row); s.note = ''; }
    else if (a === 'reveal') s.confirming = true;
    else if (a === 'reveal-cancel') s.confirming = false;
    else if (a === 'reveal-confirm') { s.revealAll = true; s.confirming = false; persist(); }
    else return;
    if (a !== 'pick' || button.getAttribute('aria-disabled') === 'true') render();
    const again = [...host.querySelectorAll('[data-act]')].find(b => keyOf(b) === key)
      || (FALLBACK[a] && host.querySelector(FALLBACK[a])) || toggle;
    again.focus({ preventScroll: true });
  }

  host.addEventListener('click', event => {
    const ring = event.target.closest('.ring');
    if (ring) { setLevel(Number(ring.dataset.level)); return; }
    if (event.target.closest('#lamp-toggle')) { setLevel(s.level ? 0 : Math.max(1, s.reached)); return; }
    const button = event.target.closest('[data-act]');
    if (button && !button.disabled) act(button);
  });

  function captionText() {
    switch (s.level) {
      case 0: return '需要时，点亮一盏。';
      case 1: return '竖着读，每一列是一个声音。横着，每一行另有用处。';
      case 2: return LEGACY_STEPS[s.legacy] === 'space' ? '这道空白是空格。T 属于下一个词。' : '一排孔 = 一个区位孔 + 一个数字孔。';
      case 3: return '下面九行，每行一个字母。这里又是一个空格。';
      case 4: return '数字来自搭档站的位置，不是字母个数。';
      case 5: return s.note || '选一行，点出起点的搭档。';
      default: return s.revealAll ? '完整代码已在灯下。仍需亲手输入。' : s.confirming ? '确定？之后仍需亲手输入。' : '最后一盏会照出全部。';
    }
  }

  const seg = (items, label) => `<div class="seg" role="group" aria-label="${label}">${items}</div>`;
  const btn = (act, text, extra = '', pressed) => `<button type="button" data-act="${act}" ${extra}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${text}</button>`;

  function hollerith(zone, digit) {
    const head = Array.from({ length: 9 }, (_, i) => `<th scope="col"${digit === i + 1 ? ' class="on"' : ''}>${i + 1}</th>`).join('');
    const body = [12, 11, 0].map(z => `<tr><th scope="row"${z === zone ? ' class="on"' : ''}>${z}</th>${Array.from({ length: 9 }, (_, i) => {
      const letter = decodePair(z, i + 1) || '·';
      return `<td${z === zone && digit === i + 1 ? ' class="hit"' : ''}>${letter}</td>`;
    }).join('')}</tr>`).join('');
    return `<table class="hollerith"><caption class="sr-only">打孔字母表：区位孔 12、11、0 与数字孔 1–9 的组合</caption><thead><tr><td></td>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function panels() {
    const L = s.level;
    if (L === 1) {
      const column = s.mode === 'column';
      const words = column ? ROWS.map(r => r[s.column]) : ROWS[s.line];
      return [
        seg(btn('mode', '↓ 列', 'data-mode="column"', column) + btn('mode', '→ 行', 'data-mode="row"', !column), '阅读方向')
        + `<div class="stepper">${btn('step', '‹', `data-d="-1" aria-label="${column ? '上一列' : '上一行'}"`)}<span class="count">${column ? `${s.column + 1} / 10` : `${s.line + 1} / 9`}</span>${btn('step', '›', `data-d="1" aria-label="${column ? '下一列' : '下一行'}"`)}</div>`,
        `<p class="voice${column ? '' : ' across'}" lang="en">${words.map(w => `<span>${esc(w)}</span>`).join(' ')}</p>`
      ];
    }
    if (L === 2) {
      const step = LEGACY_STEPS[s.legacy];
      const letters = LEGACY.map(p => decodePair(p.zone, p.column));
      const items = LEGACY_STEPS.map((st, i) => btn('legacy', st === 'space' ? '␣' : letters[st], `data-step="${i}" aria-label="${st === 'space' ? '空白' : `第 ${st + 1} 排：${letters[st]}`}"`, i === s.legacy)).join('');
      const p = step === 'space' ? null : LEGACY[step];
      return [seg(items, '上方的五排孔与一道空白'),
        `${hollerith(p?.zone, p?.column)}<p class="equation" lang="en">${p ? `${p.zone} + ${p.column} → <b>${letters[step]}</b>` : '␣ → <b>SPACE</b>'}</p>`];
    }
    if (L === 3) return ['', '<p class="aside">终端里出现了字数。</p>'];
    if (L === 4) return ['', `<div class="demo" lang="en"><p class="pair-line"><span class="tok">go,<small>0</small></span><b>=</b><span class="tok">go,<small>2</small></span></p><p class="equation">= → 0 · 0 + 2 → <b>S</b></p></div><p class="legend"><span><b>=</b> 相同 → 0</span><span><b>≈</b> 相近 → 12</span><span><b>↔</b> 相反 → 11</span></p>`];
    if (L === 5) {
      const k = known(), row = s.row, wrong = s.wrong.get(row) || new Set(), target = SOLUTION[row];
      const rowsUi = SOLUTION.map((t, r) => `${r === 2 ? '<i class="gap" aria-hidden="true"></i>' : ''}${btn('row', `${r + 1}<small>${k.has(r) ? decodePair(t.zone, t.column) : ''}</small>`, `data-row="${r}" aria-label="第 ${r + 1} 行${k.has(r) ? `，已读出 ${decodePair(t.zone, t.column)}` : ''}"`, r === row)}`).join('');
      const chips = ROWS[row].map((word, c) => {
        const state = c === 0 ? 'origin' : k.has(row) && c === target.column ? 'pair' : wrong.has(c) ? 'wrong' : '';
        const note = state === 'origin' ? '，起点' : state === 'pair' ? '，搭档' : state === 'wrong' ? '，已排除' : '';
        return `<button type="button" class="chip" data-act="pick" data-col="${c}" data-state="${state}" lang="en"${c === 0 ? ' aria-disabled="true"' : ''} aria-label="${c} 号位 ${esc(word)}${note}"><small>${c}</small><span>${esc(word)}</span></button>`;
      }).join('');
      let result = '';
      if (k.has(row)) {
        const d = judgePartner(row, target.column);
        result = `<p class="pair-line" lang="en"><span class="tok">${esc(ROWS[row][0])}</span><b>${d.sign}</b><span class="tok">${esc(ROWS[row][target.column])}</span></p><p class="equation">${d.sign} ${RELATION_NAME[d.zone]} → ${d.zone} · ${d.zone} + ${d.digit} → <b>${d.letter}</b></p>`
          + (d.authorDefined ? '<p class="exception">这一行的 ≈ 是作者设定的语境配对：Stay close.。它不是词典意义上的近义。</p>' : '');
      }
      return [seg(rowsUi, '选择一行'),
        `<p class="origin">第 ${row + 1} 行 · 起点 <b lang="en">${esc(ROWS[row][0])}</b></p><div class="chips" role="group" aria-label="第 ${row + 1} 行的十个词，前面的数字是它所在的孔位">${chips}</div><div class="result">${result}</div><div class="row-actions">${k.has(row) ? '' : btn('show-row', '显示这一行')}${k.size < 9 ? btn('next-row', '下一行 ↓') : ''}</div>`];
    }
    if (L === 6) {
      const ui = s.revealAll ? '' : s.confirming ? btn('reveal-confirm', '确定显示') + btn('reveal-cancel', '取消') : btn('reveal', '显示完整代码');
      const list = s.revealAll ? `<ol class="pairs" lang="en">${SOLUTION.map((t, r) => `<li><span>${esc(ROWS[r][0])}</span><b>${RELATION[t.zone]}</b><span>${esc(ROWS[r][t.column])}</span><em>${t.zone} + ${t.column} → ${decodePair(t.zone, t.column)}</em></li>`).join('')}</ol><p class="exception">第 2 行的 ≈ 是作者设定的语境配对：Stay close.。它不是词典意义上的近义。</p>` : '';
      return [ui, list];
    }
    return ['', ''];
  }

  function render() {
    host.dataset.level = String(s.level);
    toggle.setAttribute('aria-pressed', String(s.level > 0));
    rings.forEach(ring => {
      const n = Number(ring.dataset.level);
      ring.dataset.state = n === s.level ? 'current' : n <= s.reached ? 'seen' : n === s.reached + 1 ? 'open' : 'locked';
      ring.disabled = n > s.reached + 1;
      ring.setAttribute('aria-pressed', String(n === s.level));
    });
    caption.textContent = captionText();
    strip.hidden = s.reached < 3;
    if (!strip.hidden) {
      const k = known(), text = decodedStrip(k);
      strip.innerHTML = `<span class="prefix">STOP T</span>${[...text].map(ch => `<span class="${ch === '_' ? 'blank' : ch === ' ' ? 'space' : 'letter'}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}`;
      strip.setAttribute('aria-label', `已读出 ${k.size} / 9 个字母`);
    }
    const [ui, out] = panels();
    controls.innerHTML = ui; readout.innerHTML = out;
    controls.hidden = !ui; readout.hidden = !out;
    onRender?.();
  }
  let onRender = null;

  function overlayMarkup() {
    const L = s.level;
    if (L === 1) return veil([{ ...(s.mode === 'column' ? columnBand(s.column) : rowBand(s.line)), cls: 'strong' }]);
    if (L === 2) {
      const step = LEGACY_STEPS[s.legacy];
      if (step === 'space') return veil([...allHoles('faint'), { ...BANDS.upper, cls: 'strong' }], railLabels());
      const p = LEGACY[step];
      return veil([...allHoles('faint'), { ...legacyBand(step), cls: 'faint' }, { ...slotBox(step, p.zone), cls: 'strong' }, { ...slotBox(step, p.column), cls: 'strong' }, { ...holeFor(p.zone), cls: 'strong' }, { ...holeFor(p.column), cls: 'strong' }],
        railLabels([p.zone, p.column]) + rise(p.zone, slotBox(step, p.zone).y - 2) + rise(p.column, slotBox(step, p.column).y - 2));
    }
    if (L === 3) {
      const ticks = ROW_Y.map(y => `<rect class="tick" x="296" y="${y - 13}" width="9" height="26"/>`).join('');
      return veil([{ ...BANDS.lower, cls: 'strong' }, { ...BANDS.upper, cls: 'faint' }], ticks);
    }
    if (L === 4) {
      const a = wordBox(7, 0), b = wordBox(7, 2), mid = (columnX(0) + columnX(2)) / 2, y = ROW_Y[7] + 27;
      return veil([...allHoles('faint'), { ...pad(a, 4), cls: 'strong' }, { ...pad(b, 4), cls: 'strong' }, { ...holeFor(0), cls: 'strong' }, { ...holeFor(2), cls: 'strong' }],
        railLabels([0, 2]) + rise(2, b.y - 6) + line(columnX(0), y, columnX(2), y) + `<rect class="label-bg" x="${mid - 22}" y="${y - 16}" width="44" height="32" rx="4"/>` + label(mid, y + 9, '='));
    }
    if (L === 5) {
      const row = s.row, k = known(), t = SOLUTION[row], wrong = s.wrong.get(row) || new Set();
      const holes = [...allHoles('faint'), { ...rowBand(row), cls: 'faint' }, { ...pad(wordBox(row, 0), 3), cls: 'strong' }];
      let extra = railLabels(k.has(row) ? [t.zone, t.column] : []);
      if (k.has(row)) {
        const b = wordBox(row, t.column);
        holes.push({ ...pad(b, 3), cls: 'strong' }, { ...holeFor(t.zone), cls: 'strong' }, { ...holeFor(t.column), cls: 'strong' });
        extra += rise(t.column, b.y - 4);
      }
      const patch = PATCHES.find(p => p.rail === s.flash);
      if (patch) holes.push({ ...patch.box, cls: `strong flash${reducedMotion() ? ' still' : ''}` });
      extra += [...wrong].map(c => `<rect class="dim" ${attrs(pad(wordBox(row, c), 2))} rx="5"/>`).join('');
      extra += ROWS[row].map((_, c) => `<rect class="hit" data-row="${row}" data-col="${c}" ${attrs(pad(wordBox(row, c), 8))}/>`).join('');
      extra += ROWS.map((_, r) => r === row ? '' : `<rect class="hit" data-row="${r}" data-col="0" ${attrs(pad(wordBox(r, 0), 8))}/>`).join('');
      return veil(holes, extra);
    }
    if (L === 6) {
      const holes = [];
      SOLUTION.forEach((t, r) => { holes.push({ ...pad(wordBox(r, 0), 2), cls: 'strong' }); if (s.revealAll) holes.push({ ...pad(wordBox(r, t.column), 2), cls: 'strong' }); });
      return veil(holes);
    }
    return '';
  }

  function bindOverlay(svg) {
    svg.addEventListener('click', event => {
      const hit = event.target.closest?.('.hit');
      if (hit) pick(Number(hit.dataset.row), Number(hit.dataset.col));
    });
  }

  function reset() {
    Object.assign(s, { level: 0, reached: 0, revealAll: false, confirming: false, note: '', flash: null, mode: 'column', column: 5, line: 0, legacy: 0 });
    s.solved.clear(); s.shown.clear(); s.wrong.clear(); s.row = nextOpen();
    render(); persist();
  }

  render();
  return {
    setLevel, render, overlayMarkup, bindOverlay, pick, reset,
    set onRender(fn) { onRender = fn; },
    get level() { return s.level; },
    get reached() { return s.reached; },
    get maskVisible() { return s.reached >= 3; },
    snapshot() {
      return {
        level: s.level, reached: s.reached, step: s.level ? LAMP_STEPS[s.level - 1] : null,
        direction: { mode: s.mode, index: s.mode === 'column' ? s.column : s.line },
        legacyStep: LEGACY_STEPS[s.legacy], activeRow: s.row,
        solvedRows: [...s.solved].sort(), shownRows: [...s.shown].sort(), revealedAll: s.revealAll,
        knownRows: [...known()].sort(), strip: decodedStrip(known()),
        wrongPicks: Object.fromEntries([...s.wrong].map(([r, c]) => [r, [...c].sort()])),
        patchLit: s.flash, caption: caption.textContent
      };
    }
  };
}
