// Loaded only with ?author=1. A small panel for timing and tuning; readers never see it.
export function mountAuthor(api) {
  const panel = document.createElement('aside');
  panel.className = 'author-panel';
  panel.setAttribute('aria-label', '作者控制');
  panel.innerHTML = `
    <details>
      <summary>AUTHOR</summary>
      <div class="author-body">
        <div class="author-row">
          <button type="button" data-a="play" aria-label="播放结局">▷</button>
          <input type="range" data-a="seek" min="0" max="${api.duration}" step="0.05" value="0" aria-label="结局时间轴">
          <output data-a="time">00.0</output>
        </div>
        <label class="author-row">速度<input type="range" data-a="speed" min="50" max="175" step="5"><output data-a="speed-out"></output></label>
        <div class="author-row"><button type="button" data-a="preview">预览结局</button><button type="button" data-a="reset">回到输入</button></div>
        <label class="author-row">提示级<select data-a="lamp">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">${n}</option>`).join('')}</select></label>
        <label class="author-row">辉光<input type="range" data-a="glow" min="0" max="100"><output data-a="glow-out"></output></label>
        <label class="author-row">扫描线<input type="range" data-a="scan" min="0" max="100"><output data-a="scan-out"></output></label>
        <label class="author-row author-check"><input type="checkbox" data-a="calibration">词框对齐检查</label>
        <button type="button" data-a="reset-all" class="author-danger">全部重置</button>
      </div>
    </details>`;
  document.body.append(panel);
  const el = name => panel.querySelector(`[data-a="${name}"]`);

  el('play').addEventListener('click', () => (api.playing ? api.pause() : api.play()));
  el('seek').addEventListener('input', event => api.seek(Number(event.target.value)));
  el('preview').addEventListener('click', () => api.preview());
  el('reset').addEventListener('click', () => api.reset());
  el('lamp').addEventListener('change', event => api.setLamp(Number(event.target.value)));
  for (const key of ['speed', 'glow', 'scan']) el(key).addEventListener('input', event => api.setSetting(key, Number(event.target.value)));
  el('calibration').addEventListener('change', event => api.setCalibration(event.target.checked));
  let armed = false;
  el('reset-all').addEventListener('click', event => {
    if (!armed) { armed = true; event.target.textContent = '确认全部重置？'; return; }
    armed = false; event.target.textContent = '全部重置'; api.resetAll();
  });

  function sync() {
    const s = api.settings, state = api.getState();
    el('play').textContent = api.playing ? 'Ⅱ' : '▷';
    el('play').setAttribute('aria-label', api.playing ? '暂停结局' : '播放结局');
    if (document.activeElement !== el('seek')) el('seek').value = String(api.time);
    el('time').textContent = `${api.time.toFixed(1).padStart(4, '0')} / ${api.duration.toFixed(1)} · ${state.phase}`;
    el('speed').value = String(s.speed); el('speed-out').textContent = `${(s.speed / 100).toFixed(2)}×`;
    el('glow').value = String(s.glow); el('glow-out').textContent = String(s.glow);
    el('scan').value = String(s.scan); el('scan-out').textContent = String(s.scan);
    if (document.activeElement !== el('lamp')) el('lamp').value = String(state.lamp.level);
    el('calibration').checked = state.calibration;
  }
  api.onUpdate(sync);
  sync();
}
