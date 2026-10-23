// Rough advance width in em units, used to lay out per-character lyrics.
// CJK/kana are treated as full-width; ASCII uses simple proportional widths.
function estimateCharUnits(cp) {
  if (cp === 0x09 || cp === 0x20 || cp === 0xa0) return 0.28;
  if (cp >= 0x0300 && cp <= 0x036f) return 0;
  if (cp >= 0x3000 && cp <= 0x303f) return 1.0; // CJK punctuation / full-width space
  if (cp >= 0x3040 && cp <= 0x30ff) return 1.0; // kana
  if (cp >= 0x3400 && cp <= 0x4dbf) return 1.0; // CJK extension A
  if (cp >= 0x4e00 && cp <= 0x9fff) return 1.0; // CJK unified
  if (cp >= 0xf900 && cp <= 0xfaff) return 1.0; // CJK compatibility
  if (cp >= 0xac00 && cp <= 0xd7af) return 1.0; // Hangul
  if (cp >= 0xff61 && cp <= 0xff9f) return 0.5; // half-width kana
  if (cp >= 0xff00 && cp <= 0xffef) return 1.0; // full-width forms
  if (cp < 0x80) {
    const ch = String.fromCharCode(cp);
    if ('iIlj.,:;\'!|'.includes(ch)) return 0.28;
    if ('mMwW@%'.includes(ch)) return 0.9;
    if (ch >= 'A' && ch <= 'Z') return 0.65;
    if (ch >= 'a' && ch <= 'z') return 0.55;
    if (ch >= '0' && ch <= '9') return 0.55;
    return 0.4;
  }
  return 1.0;
}

export function estimateAdvanceUnits(input) {
  const s = String(input === undefined || input === null ? '' : input);
  let units = 0;
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i);
    if (cp > 0xffff) i++;
    units += estimateCharUnits(cp);
  }
  return units;
}
