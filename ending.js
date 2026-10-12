// The stop sequence as a pure function of time, plus a clock that can play, pause and seek.
// 0–0.4 s merge the command · 0.4–1.6 s the card sinks · 1.6–4 s lights out, the horizon draws in
// ~3 s the command turns from light to ink · 4 s HALTED. · 5.5–8.9 s two lines from the card
// 9.5 s I Love— stays · 11–12 s the way onward.
export const ENDING_DURATION = 12;

export const LINES = {
  halted: { text: 'HALTED.', at: 4.0, step: 0.06 },
  stay: { text: 'I’ll Stay Below.', at: 5.5, step: 0.05 },
  ahead: { text: 'You Go Ahead, Mother.', at: 6.5, step: 0.05 },
  love: { text: 'I Love—', at: 9.5, step: 0.11 }
};

const clamp = value => Math.min(1, Math.max(0, value));
export function ramp(t, start, end) { const p = clamp((t - start) / (end - start)); return p * p * (3 - 2 * p); }
const typed = (t, { text, at, step }) => t < at ? 0 : Math.min(text.length, Math.floor((t - at) / step) + 1);

export function endingFrame(t) {
  return {
    t,
    sink: t >= 0.4,
    power: 1 - ramp(t, 1.6, 4),
    horizon: 1 - 0.88 * ramp(t, 1.6, 4),
    ink: ramp(t, 2.6, 3.4),
    typed: Object.fromEntries(Object.entries(LINES).map(([key, line]) => [key, typed(t, line)])),
    echo: 1 - ramp(t, 8.1, 8.9),
    links: ramp(t, 11, 12),
    complete: t >= ENDING_DURATION
  };
}

export class EndingClock {
  constructor({ onFrame, onComplete }) {
    this.onFrame = onFrame; this.onComplete = onComplete;
    this.time = 0; this.speed = 1; this.playing = false; this.frame = 0; this.previous = 0;
    this.tick = this.tick.bind(this);
  }
  seek(seconds) {
    const before = this.time;
    this.time = Math.max(0, Math.min(ENDING_DURATION, seconds));
    this.onFrame(this.time);
    if (this.time >= ENDING_DURATION) {
      this.pause();
      if (before < ENDING_DURATION) this.onComplete?.();
    }
  }
  play() {
    if (this.playing) return;
    if (this.time >= ENDING_DURATION) this.time = 0;
    this.playing = true; this.previous = 0;
    this.frame = requestAnimationFrame(this.tick);
  }
  pause() { this.playing = false; cancelAnimationFrame(this.frame); }
  stop() { this.pause(); this.time = 0; }
  tick(now) {
    if (!this.playing) return;
    const delta = this.previous ? Math.min(now - this.previous, 100) * this.speed / 1000 : 0;
    this.previous = now;
    this.seek(this.time + delta);
    if (this.playing) this.frame = requestAnimationFrame(this.tick);
  }
}
