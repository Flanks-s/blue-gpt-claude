// Overlay geometry for assets/blue-original.png, expressed in a 1620 × 976 reference frame.
// The overlay SVG stretches this frame over the rendered image, so only proportions matter.
// Measured from the original card; ?author=1 can draw every box for an alignment check.
import { ROWS, RAILS, SOLUTION, LEGACY, decodePair } from './puzzle.js';

export const FRAME = { width: 1620, height: 976 };

// Twelve registration holes along the top edge, read left to right as RAILS (12 11 0 1 … 9).
const HOLE_START = 128, HOLE_PITCH = 123.36;
export const HOLE_Y = 63;
export const holeX = index => HOLE_START + index * HOLE_PITCH;
export const railX = rail => holeX(RAILS.indexOf(rail));

// Word column c stands directly under the hole for digit c. That alignment is the key the
// card teaches: a partner's position is the digit it punches.
export const columnRail = column => RAILS[column + 2];
export const columnX = column => holeX(column + 2);

export const ROW_Y = [418, 469, 560, 611, 662, 713, 764, 815, 867];
export const LEGACY_Y = [148, 180, 209, 239, 328];

export function wordBox(row, column) {
  const w = Math.max(48, ROWS[row][column].length * 10.6 + 24), h = 34;
  return { x: columnX(column) - w / 2, y: ROW_Y[row] - h / 2, w, h };
}
export const holeBox = index => ({ x: holeX(index) - 19, y: HOLE_Y - 19, w: 38, h: 38 });
export const slotBox = (legacyRow, rail) => ({ x: railX(rail) - 33, y: LEGACY_Y[legacyRow] - 12, w: 66, h: 24 });
export const legacyBand = legacyRow => ({ x: 206, y: LEGACY_Y[legacyRow] - 16, w: 1326, h: 32 });
export const columnBand = column => ({ x: columnX(column) - 62, y: 392, w: 124, h: 500 });
export const rowBand = row => ({ x: 314, y: ROW_Y[row] - 22, w: 1240, h: 44 });

// The two blank bands are spaces: one after STOP, one after the second decoded letter.
export const BANDS = {
  upper: { x: 206, y: 258, w: 1326, h: 50 },
  lower: { x: 314, y: 492, w: 1240, h: 48 }
};

// Three repaired punches: the previous investigator's rejected partners for close.
// Each sits on the digit rail of the word it would have paired with.
export const PATCHES = [
  { rail: 8, legacyRow: 0 },
  { rail: 2, legacyRow: 1 },
  { rail: 9, legacyRow: 2 }
].map(p => ({ ...p, box: { x: railX(p.rail) - 36, y: LEGACY_Y[p.legacyRow] - 22, w: 72, h: 44 } }));

export const RELATION = { 12: '≈', 11: '↔', 0: '=' };
export const RELATION_NAME = { 12: '相近', 11: '相反', 0: '相同' };

// A wrong pick in the author-defined row may land on a word an earlier hand already tried.
export function patchFor(row, column) {
  if (!SOLUTION[row]?.authorDefined) return null;
  return PATCHES.find(p => p.rail === columnRail(column)) || null;
}

export function judgePartner(row, column) {
  const target = SOLUTION[row];
  if (!target || !Number.isInteger(column) || column < 0 || column > 9) return null;
  if (column === 0) return { kind: 'origin' };
  if (column !== target.column) return { kind: 'miss', patch: patchFor(row, column) };
  const digit = columnRail(column);
  return {
    kind: 'pair', zone: target.zone, digit, sign: RELATION[target.zone],
    letter: decodePair(target.zone, digit), authorDefined: Boolean(target.authorDefined)
  };
}

// The nine-letter strip, with the space that the lower blank band marks.
export function decodedStrip(known) {
  const letters = SOLUTION.map((s, i) => known.has(i) ? decodePair(s.zone, s.column) : '_');
  return `${letters.slice(0, 2).join('')} ${letters.slice(2).join('')}`;
}

export const legacyLetters = () => LEGACY.map(p => decodePair(p.zone, p.column));

// Second-look regions after the command has been accepted.
export const REGIONS = {
  blue: { boxes: [{ x: 44, y: 332, w: 230, h: 208 }], pin: [270, 340] },
  alarm: { boxes: [wordBox(0, 1)], pin: [columnX(1) + 46, ROW_Y[0] - 30] },
  patches: { boxes: PATCHES.map(p => p.box), pin: [1440, 108] },
  legacy: { boxes: [{ x: 206, y: 122, w: 1326, h: 226 }], pin: [214, 116] }
};

export const pct = (value, axis) => `${(value / (axis === 'x' ? FRAME.width : FRAME.height)) * 100}%`;
