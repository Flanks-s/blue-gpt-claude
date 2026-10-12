import { ROWS, LEGACY, normalizeCode, isCorrectCode } from './puzzle.js';
import { createTerminalInput, englishKey } from './terminal-input.js';
import { REGIONS, PATCHES, BANDS, ROW_Y, pct, wordBox, holeBox, slotBox } from './card-geometry.js';
import { createLamp, veil } from './lamp.js';
import { createZoom } from './card-zoom.js';
import { ENDING_DURATION, LINES, endingFrame, EndingClock } from './ending.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = document.documentElement, stage = $('#stage'), response = $('#response'), menu = $('#menu');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const systemReduce = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

// ── Settings and progress ────────────────────────────────────────────────
const SETTINGS_KEY = 'blue-study-settings-v4', PROGRESS_KEY = 'blue-study-progress-v4';
const DEFAULTS = { theme: 'system', motion: 'system', glow: 38, scan: 38, speed: 100 };
const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null') || {}; } catch { return {}; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ } };
let settings = { ...DEFAULTS };
function loadSettings(saved) {
  settings = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (typeof saved[key] === typeof DEFAULTS[key]) settings[key] = saved[key];
  if (!['system', 'dark', 'light'].includes(settings.theme)) settings.theme = 'system';
  if (!['system', 'reduce'].includes(settings.motion)) settings.motion = 'system';
  for (const [key, min, max] of [['glow', 0, 100], ['scan', 0, 100], ['speed', 50, 175]]) settings[key] = Math.min(max, Math.max(min, settings[key]));
}
loadSettings(read(SETTINGS_KEY));
const progress = read(PROGRESS_KEY);
const state = {
  view: 'threshold', phase: 'waiting', cardMode: 'original', annotate: false, artifact: null,
  unlocked: Boolean(progress.unlocked), cardSeen: Boolean(progress.cardSeen),
  history: [], response: '', soundEnabled: false, calibration: false, author: false
};
const saveProgress = () => write(PROGRESS_KEY, { lamp: progress.lamp || {}, cardSeen: state.cardSeen, unlocked: state.unlocked });
const reduced = () => settings.motion === 'reduce' || systemReduce.matches;
const live = text => { const el = $('#live-message'); el.textContent = ''; requestAnimationFrame(() => { el.textContent = text; }); };

// ── Terminal ─────────────────────────────────────────────────────────────
const input = createTerminalInput($('#code-input'), {
  keyboard: $('#terminal-keyboard'),
  placeholder: '',
  onSubmit: () => $('#code-form').requestSubmit(),
  onChange: () => { if (state.response) setResponse(''); },
  onInvalid: () => setResponse('A–Z / SPACE', 'error', '代码只使用英文字母和空格。触屏上点击命令行会打开英文键盘。')
});
function setResponse(text, kind = '', spoken = text) {
  state.response = text;
  response.className = `response${kind ? ` ${kind}` : ''}`;
  response.innerHTML = text ? `<span aria-hidden="true">${esc(text)}</span><span class="sr-only">${esc(spoken)}</span>` : '';
}
function renderHistory() {
  $('#history').innerHTML = state.history.map(value => `<li lang="en">${esc(value)}</li>`).join('');
}
function flashHorizon() {
  if (reduced()) return;
  const horizon = $('#horizon');
  horizon.classList.remove('flash'); void horizon.offsetWidth; horizon.classList.add('flash');
}

$('#code-form').addEventListener('submit', event => {
  event.preventDefault();
  if (state.phase !== 'waiting') return;
  const value = normalizeCode(input.value);
  if (!value) { setResponse('AWAITING INPUT', 'quiet', '还没有输入。'); input.focus(); return; }
  if (isCorrectCode(value)) { startEnding(); return; }
  // The attempt stays editable; the last three remain faintly above, as the card keeps its patches.
  state.history.unshift(`STOP T${input.value}`); state.history.length = Math.min(state.history.length, 3);
  renderHistory();
  setResponse('NOT ACCEPTED.', 'error', '未被接受。输入仍保留，可以修改后再试。');
  flashHorizon(); tone('error'); input.focus();
});

// ── Settings UI ──────────────────────────────────────────────────────────
function applySettings() {
  const theme = settings.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : settings.theme;
  root.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#070b10' : '#eef1f2';
  if (reduced()) root.dataset.motion = 'reduce'; else delete root.dataset.motion;
  root.style.setProperty('--glow', String(settings.glow / 100));
  root.style.setProperty('--scan', String(settings.scan / 100));
  clock.speed = settings.speed / 100;
  $$('input[name="theme"]').forEach(el => { el.checked = el.value === settings.theme; });
  $$('input[name="motion"]').forEach(el => { el.checked = el.value === settings.motion; });
  write(SETTINGS_KEY, settings);
  authorUpdate();
}
$$('input[name="theme"], input[name="motion"]').forEach(el => el.addEventListener('change', () => { settings[el.name] = el.value; applySettings(); }));
systemDark.addEventListener('change', () => { if (settings.theme === 'system') applySettings(); });
systemReduce.addEventListener('change', applySettings);

// ── Sound: off until the reader turns it on ──────────────────────────────
let audio, master, hum;
async function enableSound() {
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.gain.value = 0.055; master.connect(audio.destination);
      hum = audio.createGain(); hum.gain.value = 0; hum.connect(master);
      for (const frequency of [55, 110]) { const osc = audio.createOscillator(); osc.type = 'sine'; osc.frequency.value = frequency; osc.connect(hum); osc.start(); }
    }
    await audio.resume(); state.soundEnabled = true;
  } catch { state.soundEnabled = false; live('声音暂不可用；画面不受影响。'); }
  renderSound(); setHum();
}
function renderSound() { const b = $('#sound'); b.setAttribute('aria-pressed', String(state.soundEnabled)); b.textContent = state.soundEnabled ? '开' : '关'; }
function setHum() {
  if (!hum || !audio) return;
  const power = state.phase === 'waiting' ? 1 : endingFrame(clock.time).power;
  hum.gain.setTargetAtTime(state.soundEnabled && !document.hidden ? 0.24 * power : 0, audio.currentTime, 0.18);
}
function tone(kind) {
  if (!state.soundEnabled || !audio) return;
  const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
  osc.type = 'sine'; osc.frequency.setValueAtTime(kind === 'accepted' ? 420 : 140, t);
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.3, t + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  osc.connect(gain); gain.connect(master); osc.start(t); osc.stop(t + 0.3);
}
$('#sound').addEventListener('click', () => { if (state.soundEnabled) { state.soundEnabled = false; renderSound(); setHum(); } else enableSound(); });
document.addEventListener('visibilitychange', setHum);

// ── Views: threshold · card · notes, staged along the horizon ────────────
function setView(view) {
  if (state.view === view) return;
  const leaving = state.view;
  state.view = view; stage.dataset.view = view;
  $('#threshold').inert = view !== 'threshold';
  $('#card-view').inert = view !== 'card';
  $('#notes-view').inert = view !== 'notes';
  if (view === 'card') {
    if (!state.cardSeen) { state.cardSeen = true; saveProgress(); }
    $('#card-dots').classList.add('seen');
  }
  if (leaving === 'card') zoom.reset();
  if (view === 'notes') { $('#notes-view').scrollTop = 0; requestAnimationFrame(() => $('#notes-title').focus({ preventScroll: true })); }
  else restoreFocus();
  authorUpdate();
}
function restoreFocus() {
  if (state.phase === 'stopping') return; // endingComplete() places focus when the links appear
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest('[inert]') && !(active === input.element && input.disabled)) return;
    if (state.phase === 'waiting') input.focus();
    else if (state.phase === 'halted' && state.view === 'threshold') $('#ending-notes').focus({ preventScroll: true });
    else $('#menu-button').focus({ preventScroll: true });
  });
}
function openCard() {
  state.annotate = state.unlocked && state.phase !== 'waiting';
  setView('card'); renderCardView();
}
function openSecondLook(key) {
  if (!state.unlocked) return;
  state.annotate = true;
  if (key) state.artifact = key;
  if (state.cardMode !== 'original') setCardMode('original');
  setView('card'); renderCardView();
}
function openNotes(anchor) {
  if (!state.unlocked) return;
  setView('notes');
  if (anchor) requestAnimationFrame(() => $(`#${anchor}`)?.scrollIntoView({ block: 'start' }));
}
function renderCardView() {
  $('#lamp').hidden = state.annotate;
  $('#artifact-panel').hidden = !state.annotate;
  $('#card-body').classList.toggle('annotated', state.annotate);
  $('#card-view').classList.toggle('annotating', state.annotate);
  renderArtifact(); renderOverlay();
}

// ── The card: original / text / scan, zoom, and the overlay of light ────
const zoom = createZoom($('#card-frame'), $('#card-zoom'), {
  onChange: z => {
    $('#zoom-label').textContent = `${Number.isInteger(z) ? z : z.toFixed(1)}×`;
    $('#zoom-out').disabled = z <= 1; $('#zoom-in').disabled = z >= 3;
  }
});
$('#zoom-in').addEventListener('click', () => zoom.zoomBy(0.5));
$('#zoom-out').addEventListener('click', () => zoom.zoomBy(-0.5));

function buildTextView() {
  const grid = $('#word-grid');
  ROWS.forEach((row, r) => {
    if (r === 2) grid.insertAdjacentHTML('beforeend', '<tr class="band" aria-hidden="true"><td colspan="10"></td></tr>');
    grid.insertAdjacentHTML('beforeend', `<tr>${row.map(word => `<td>${esc(word)}</td>`).join('')}</tr>`);
  });
  $('#voice-list').innerHTML = ROWS[0].map((_, c) => `<li>${ROWS.map(row => esc(row[c])).join(' ')}</li>`).join('');
}
function setCardMode(mode, { keepLamp = false } = {}) {
  state.cardMode = mode;
  $$('[data-card-mode]').forEach(b => { const on = b.dataset.cardMode === mode; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  $('#card-frame').hidden = mode === 'text';
  $('#card-text').hidden = mode !== 'text';
  $('.zoom-tools').hidden = mode === 'text';
  const src = mode === 'scan' ? './assets/blue-scan.png' : './assets/blue-original.png';
  const img = $('#card-image');
  if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  // The scan is a reading copy; light is only ever cast on the original.
  if (mode !== 'original' && !keepLamp && lamp.level > 0) lamp.setLevel(0);
  zoom.reset(); renderOverlay(); authorUpdate();
}
$('.mode-switch').addEventListener('click', event => { const b = event.target.closest('[data-card-mode]'); if (b) setCardMode(b.dataset.cardMode); });
$('.mode-switch').addEventListener('keydown', event => {
  const keys = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
  if (!(event.key in keys)) return;
  event.preventDefault(); event.stopPropagation();
  const modes = ['original', 'text', 'scan'], next = modes[(modes.indexOf(state.cardMode) + keys[event.key] + 3) % 3];
  setCardMode(next); $(`[data-card-mode="${next}"]`).focus();
});

function renderOverlay() {
  const svg = $('#lamp-overlay');
  let markup = '';
  if (state.cardMode === 'original') {
    if (state.annotate) { if (state.artifact) markup = veil(REGIONS[state.artifact].boxes.map(b => ({ ...b, cls: 'strong' }))); }
    else markup = lamp.overlayMarkup();
    if (state.calibration) markup += calibrationMarkup();
  }
  svg.innerHTML = markup;
  svg.classList.toggle('is-lit', Boolean(markup));
  $('#hotspots').hidden = !(state.annotate && state.cardMode === 'original');
}
// Author alignment check: every measured box, drawn as a hairline.
function calibrationMarkup() {
  const box = b => `<rect class="calib" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" vector-effect="non-scaling-stroke"/>`;
  const boxes = [];
  ROWS.forEach((row, r) => row.forEach((_, c) => boxes.push(wordBox(r, c))));
  for (let i = 0; i < 12; i++) boxes.push(holeBox(i));
  LEGACY.forEach((p, r) => boxes.push(slotBox(r, p.zone), slotBox(r, p.column)));
  boxes.push(...PATCHES.map(p => p.box), BANDS.upper, BANDS.lower);
  Object.values(REGIONS).forEach(region => boxes.push(...region.boxes));
  return `<g class="calibration">${boxes.map(box).join('')}${ROW_Y.map(y => `<line class="calib" x1="290" x2="1580" y1="${y}" y2="${y}" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
}

// ── Lamp ─────────────────────────────────────────────────────────────────
const lamp = createLamp({
  host: $('#lamp'), store: progress.lamp || {}, reducedMotion: reduced,
  onChange: snapshot => { progress.lamp = snapshot; saveProgress(); syncMask(); authorUpdate(); },
  onLevel: level => { stage.dataset.lamp = String(level); if (level > 0 && state.cardMode !== 'original') setCardMode('original', { keepLamp: true }); }
});
lamp.onRender = renderOverlay;
lamp.bindOverlay($('#lamp-overlay'));
// The word-count mask is the third light, not a free placeholder.
function syncMask() { const mask = lamp.maskVisible ? '__ _______' : ''; if (input.placeholder !== mask) input.placeholder = mask; }

// ── Second look (after the command is accepted) ──────────────────────────
// Post-solve observations are drawn from verified author messages; they are not new fiction.
const ARTIFACTS = {
  blue: { title: '一个名字，几层含义。', quote: '因为HORIZON上面是什么？BLUE。', body: 'BLUE 在早期构想中已经是标题。后来，它也是档案编号；上一位调查员使用的马克笔，恰好留下蓝色。', source: 'Louis · 2026.08.12 ·《TWT混战分析》\n2026.09.04 · 读者交流', note: 'note-title' },
  alarm: { title: '一个更早的词。', quote: '不解释。其实是彩蛋uwu，以前的mandatory word是ALARM。', body: 'ALARM. 在这一列里是一声警报，也保留了作者对旧比赛主题词的回应。这个彩蛋从原卡创作时就已经存在。', source: 'Louis · 2026.08.12 ·《项目文件解析》', note: 'note-terminal' },
  patches: { title: '错误也留在纸上。', quote: '最终打孔就是正确答案，补丁是上一个调查员的错误答案', body: '三个被补上的孔，对应 close. 与 dead.、in、SOFTLY 的错误配对。留下的正确读法是 Stay close.。你看见的修补，也是一次次判断留下的记录。', source: 'Louis · 2026.09.04 · 读者交流\n配对依据 · 原卡设计记录', note: 'note-investigation' },
  legacy: { title: '从别人停下的地方继续。', quote: '上面是教程，也是一部分编码了的信息', body: '上部的孔已经读出 STOP T。它留下了编码的示范，也留下整句的开头。余下九行继续读出 HE MADNESS；上下两部分按顺序接在一起。', source: 'Louis · 2026.09.04 · 读者交流', note: 'note-investigation' }
};
function selectArtifact(key) {
  if (!Object.hasOwn(ARTIFACTS, key)) return;
  state.artifact = key; renderArtifact(); renderOverlay(); authorUpdate();
}
function renderArtifact() {
  $$('[data-artifact]').forEach(b => { const on = b.dataset.artifact === state.artifact; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('selected', on); });
  const item = ARTIFACTS[state.artifact];
  $('#artifact-copy').innerHTML = item
    ? `<h3>${esc(item.title)}</h3><blockquote>“${esc(item.quote)}”</blockquote><p>${esc(item.body)}</p><cite>${esc(item.source).replace(/\n/g, '<br>')}</cite>`
    : '<p class="artifact-empty">点一个编号，灯会照到那里。</p>';
  $('#artifact-to-notes').hidden = !item;
}
$$('[data-artifact]').forEach(b => b.addEventListener('click', () => selectArtifact(b.dataset.artifact)));
$$('.hotspot').forEach(b => { const [x, y] = REGIONS[b.dataset.artifact].pin; b.style.left = pct(x, 'x'); b.style.top = pct(y, 'y'); });
$$('[data-open-artifact]').forEach(b => b.addEventListener('click', () => openSecondLook(b.dataset.openArtifact)));
$('#artifact-to-notes').addEventListener('click', () => openNotes(ARTIFACTS[state.artifact]?.note));
$$('.notes-contents a').forEach(a => a.addEventListener('click', event => {
  event.preventDefault();
  $(a.hash)?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
}));

// ── Ending ───────────────────────────────────────────────────────────────
const clock = new EndingClock({ onFrame: applyEnding, onComplete: endingComplete });
function setPhase(phase) {
  if (state.phase === phase) return;
  state.phase = phase; stage.dataset.phase = phase;
  $('#menu-state').textContent = phase === 'waiting' ? 'LISTENING' : phase === 'stopping' ? 'HALTING' : 'HALTED';
  updateMenu();
}
function startEnding({ play = true, at = 0 } = {}) {
  if (menu.open) menu.close();
  input.hideKeyboard(); input.disabled = true;
  state.history = []; renderHistory(); setResponse('');
  state.unlocked = true; state.annotate = false; saveProgress();
  $('#aftermath').hidden = false;
  clock.pause(); clock.time = 0;
  setPhase('stopping');
  if (play) { tone('accepted'); live('命令已接受。系统正在停止。'); }
  if (play && reduced()) clock.seek(ENDING_DURATION);
  else { clock.seek(at); if (play) clock.play(); }
  authorUpdate();
}
function applyEnding(t) {
  if (state.phase === 'waiting') return;
  const f = endingFrame(t);
  if (f.sink && state.view !== 'threshold') setView('threshold');
  stage.style.setProperty('--power', f.power.toFixed(3));
  stage.style.setProperty('--hscale', f.horizon.toFixed(3));
  stage.style.setProperty('--inked', f.ink.toFixed(3));
  for (const el of $$('.type-line')) {
    const { text } = LINES[el.dataset.line], n = f.typed[el.dataset.line];
    if (el.dataset.n === String(n)) continue;
    el.dataset.n = String(n);
    el.innerHTML = `<span class="typed">${esc(text.slice(0, n))}</span><span class="untyped">${esc(text.slice(n))}</span>`;
  }
  $('.echo').style.opacity = f.echo.toFixed(3);
  $('#ending-links').style.opacity = f.links.toFixed(3);
  $('#ending-links').inert = !f.complete;
  setPhase(f.complete ? 'halted' : 'stopping');
  setHum(); authorUpdate();
}
function endingComplete() {
  live('HALTED。停止命令已生效。留下的话：I Love—。可以打开手记，或再看这张卡。');
  if (state.view !== 'threshold') return;
  const active = document.activeElement;
  if (!active || active === document.body || active === input.element) $('#ending-notes').focus({ preventScroll: true });
}
function resetToWaiting({ focus = true } = {}) {
  clock.stop();
  setPhase('waiting'); state.annotate = false;
  for (const property of ['--power', '--hscale', '--inked']) stage.style.removeProperty(property);
  $$('.type-line').forEach(el => { el.textContent = ''; delete el.dataset.n; });
  $('.echo').style.opacity = ''; $('#ending-links').style.opacity = ''; $('#ending-links').inert = true;
  $('#aftermath').hidden = true;
  input.disabled = false; input.value = ''; setResponse('');
  setView('threshold'); setHum(); updateMenu();
  if (focus) input.focus();
  authorUpdate();
}
$('#ending-notes').addEventListener('click', () => openNotes());
$('#ending-card').addEventListener('click', () => openSecondLook());
$('#again').addEventListener('click', () => resetToWaiting());

// ── Menu ─────────────────────────────────────────────────────────────────
function updateMenu() {
  $('#menu-notes').hidden = !state.unlocked;
  $('#menu-second-look').hidden = !state.unlocked;
  $('#menu-keyboard').disabled = state.phase !== 'waiting';
}
function openMenu() {
  input.hideKeyboard(); updateMenu(); disarmClear();
  if (!menu.open) menu.showModal();
  $('#menu-button').setAttribute('aria-expanded', 'true');
}
$('#menu-button').addEventListener('click', () => (menu.open ? menu.close() : openMenu()));
$('[data-close-menu]').addEventListener('click', () => menu.close());
menu.addEventListener('click', event => {
  if (event.target !== menu) return;
  const r = menu.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) menu.close();
});
menu.addEventListener('close', () => { $('#menu-button').setAttribute('aria-expanded', 'false'); disarmClear(); restoreFocus(); });
$('#menu-card').addEventListener('click', () => { menu.close(); openCard(); });
$('#menu-keyboard').addEventListener('click', () => { menu.close(); input.showKeyboard(); });
$('#menu-notes').addEventListener('click', () => { menu.close(); openNotes(); });
$('#menu-second-look').addEventListener('click', () => { menu.close(); openSecondLook(); });
let clearArmed = false;
function disarmClear() { clearArmed = false; const b = $('#clear-progress'); b.textContent = '清除'; b.classList.remove('armed'); }
$('#clear-progress').addEventListener('click', () => {
  const b = $('#clear-progress');
  if (!clearArmed) { clearArmed = true; b.textContent = '确认清除？'; b.classList.add('armed'); return; }
  disarmClear(); clearProgress(); live('进度已清除。');
});
function clearProgress() {
  lamp.reset(); stage.dataset.lamp = '0';
  state.history = []; renderHistory();
  state.unlocked = false; state.cardSeen = false; state.artifact = null;
  $('#card-dots').classList.remove('seen');
  progress.lamp = {}; saveProgress();
  resetToWaiting({ focus: !menu.open });
  setCardMode('original'); updateMenu();
}

// ── Input routing: keys, pointers, swipes ────────────────────────────────
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || menu.open) return;
  const target = event.target;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (input.keyboardOpen) input.hideKeyboard();
    else if (state.view !== 'threshold') setView('threshold');
    else openMenu();
    return;
  }
  if (target.closest?.('input, select, textarea, .author-panel')) return;
  // While the terminal is listening, any letter goes to it — from any view.
  if (state.phase === 'waiting' && target !== input.element) {
    const letter = englishKey(event);
    if (letter && letter !== ' ') { event.preventDefault(); input.focus(); input.insert(letter); return; }
  }
  const local = target.closest?.('.card-frame, .lamp, .mode-switch, .artifact-panel, .notes-view');
  if (state.view === 'threshold' && state.phase !== 'stopping' && (event.key === 'ArrowDown' || event.key === 'PageDown')) { event.preventDefault(); openCard(); }
  else if (state.view === 'card' && !local && (event.key === 'ArrowUp' || event.key === 'PageUp')) { event.preventDefault(); setView('threshold'); }
});
$('#sky').addEventListener('pointerdown', event => {
  if (state.phase !== 'waiting' || event.target.closest('button, #code-input')) return;
  if (event.pointerType === 'mouse') event.preventDefault();
  input.focus();
  if (event.pointerType === 'touch' || event.pointerType === 'pen') input.showKeyboard();
});
$('#threshold').addEventListener('pointerdown', event => {
  if (state.phase !== 'waiting' || event.target.closest('button')) return;
  if (event.pointerType === 'mouse') event.preventDefault();
  input.focus();
});
$('#card-dots').addEventListener('click', openCard);
$('#card-close').addEventListener('click', () => setView('threshold'));
$('#notes-close').addEventListener('click', () => setView('threshold'));
$('#notes-back').addEventListener('click', () => setView('threshold'));

let swipe = null;
const below = $('#below');
below.addEventListener('touchstart', event => {
  if (event.touches.length !== 1) { swipe = null; return; }
  const t = event.touches[0], scroller = state.view === 'card' ? $('#card-view') : state.view === 'notes' ? $('#notes-view') : null;
  swipe = {
    x: t.clientX, y: t.clientY, top: scroller ? scroller.scrollTop : 0,
    blocked: Boolean(event.target.closest('.artifact-panel, .lamp-readout')) || (Boolean(event.target.closest('.card-frame')) && zoom.z > 1)
  };
}, { passive: true });
below.addEventListener('touchend', event => {
  if (!swipe) return;
  const t = event.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, s = swipe;
  swipe = null;
  if (Math.abs(dx) > Math.abs(dy) * 0.6) return;
  if (state.view === 'threshold' && dy < -56 && state.phase !== 'stopping') openCard();
  else if (state.view !== 'threshold' && dy > 72 && s.top <= 0 && !s.blocked) setView('threshold');
}, { passive: true });

// ── Author controls, only with ?author=1 ─────────────────────────────────
const authorHooks = new Set();
function authorUpdate() { authorHooks.forEach(fn => fn()); }
const authorApi = {
  duration: ENDING_DURATION,
  get time() { return clock.time; }, get playing() { return clock.playing; }, get settings() { return { ...settings }; },
  play() { if (state.phase === 'waiting') startEnding(); else { clock.play(); authorUpdate(); } },
  pause() { clock.pause(); authorUpdate(); },
  seek(t) { if (state.phase === 'waiting') startEnding({ play: false, at: t }); else { clock.pause(); clock.seek(t); } },
  preview() { startEnding(); },
  reset() { resetToWaiting(); },
  setSetting(key, value) { settings[key] = value; applySettings(); },
  setLamp(level) {
    if (state.phase !== 'waiting') resetToWaiting({ focus: false });
    state.annotate = false; setView('card'); renderCardView();
    for (let i = 1; i <= level; i++) lamp.setLevel(i);
    if (!level) lamp.setLevel(0);
  },
  setCalibration(on) { state.calibration = Boolean(on); renderOverlay(); authorUpdate(); },
  resetAll() { clearProgress(); loadSettings({}); applySettings(); },
  onUpdate(fn) { authorHooks.add(fn); },
  getState: () => window.BLUE_STUDY.getState()
};
if (new URLSearchParams(location.search).get('author') === '1') {
  state.author = true;
  import('./author.js').then(module => module.mountAuthor(authorApi)).catch(() => {});
}

// ── Runtime inspection (state only; it does not bypass the solve flow) ───
window.BLUE_STUDY = {
  getState: () => ({
    view: state.view, phase: state.phase,
    lamp: lamp.snapshot(), maskVisible: lamp.maskVisible, placeholder: input.placeholder,
    inputValue: input.value, selection: input.selection, keyboardOpen: input.keyboardOpen, inputDisabled: input.disabled,
    history: [...state.history], response: state.response,
    cardMode: state.cardMode, zoom: zoom.z, cardSeen: state.cardSeen, annotate: state.annotate, selectedArtifact: state.artifact,
    hotspotsVisible: !$('#hotspots').hidden, overlayLit: $('#lamp-overlay').classList.contains('is-lit'),
    unlocked: state.unlocked, endingTime: clock.time, endingPlaying: clock.playing, endingSpeed: clock.speed,
    settings: { ...settings }, resolvedTheme: root.dataset.theme, reducedMotion: reduced(), soundEnabled: state.soundEnabled,
    horizonY: Math.round($('#horizon').getBoundingClientRect().top),
    author: state.author, calibration: state.calibration
  }),
  tokenCount: ROWS.flat().length
};

// ── Start ────────────────────────────────────────────────────────────────
buildTextView();
applySettings();
setCardMode('original');
syncMask();
renderHistory();
updateMenu();
renderSound();
if (state.cardSeen) $('#card-dots').classList.add('seen');
$('#ending-links').inert = true;
if (!coarse.matches) requestAnimationFrame(() => input.focus());
