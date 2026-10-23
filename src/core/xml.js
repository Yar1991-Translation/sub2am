export function makeWarning(code, message, line) {
  const warning = { code, message };
  if (line !== undefined && line !== null) warning.line = line;
  return warning;
}

export function sanitizeXmlChars(input) {
  const s = String(input === undefined || input === null ? '' : input);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s.charAt(i) + s.charAt(i + 1);
        i++;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += s.charAt(i);
      continue;
    }
    if (code < 0x20 || code === 0x7f) continue;
    if (code >= 0x80 && code <= 0x9f) continue;
    if (code === 0xfffe || code === 0xffff) continue;
    out += s.charAt(i);
  }
  return out;
}

export function escapeXmlText(input) {
  return sanitizeXmlChars(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeXmlAttr(input) {
  return sanitizeXmlChars(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function normalizeColor(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(s)) {
    s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  }
  if (/^[0-9a-f]{6}$/.test(s)) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
      a: 255
    };
  }
  if (/^[0-9a-f]{8}$/.test(s)) {
    return {
      a: parseInt(s.slice(0, 2), 16),
      r: parseInt(s.slice(2, 4), 16),
      g: parseInt(s.slice(4, 6), 16),
      b: parseInt(s.slice(6, 8), 16)
    };
  }
  return null;
}

function toHex2(n) {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  const h = v.toString(16);
  return h.length === 1 ? '0' + h : h;
}

export function colorToHex6(input) {
  const c = normalizeColor(input);
  if (!c) return null;
  return '#' + toHex2(c.r) + toHex2(c.g) + toHex2(c.b);
}

export function argbFromHexAndOpacity(hex, opacityPercent) {
  const c = normalizeColor(hex);
  if (!c) return null;
  const pct = Number(opacityPercent);
  const alpha = Number.isFinite(pct) ? Math.round(Math.max(0, Math.min(100, pct)) * 255 / 100) : 255;
  return '#' + toHex2(alpha) + toHex2(c.r) + toHex2(c.g) + toHex2(c.b);
}

export function padFraction(frac) {
  if (frac === undefined || frac === null || frac === '') return 0;
  return parseInt((String(frac) + '000').slice(0, 3), 10);
}

export function timePartsToMs(h, m, s, frac) {
  const hours = h ? parseInt(h, 10) : 0;
  const minutes = parseInt(m, 10);
  const seconds = parseInt(s, 10) || 0;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + padFraction(frac);
}

export function decodeHtmlEntities(input) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (match, ent) => {
    if (ent.charAt(0) === '#') {
      const cp = ent.charAt(1).toLowerCase() === 'x'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return match;
      try { return String.fromCodePoint(cp); } catch { return match; }
    }
    const key = ent.toLowerCase();
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
  });
}

export function formatTimecode(ms) {
  let total = Math.max(0, Math.round(Number(ms) || 0));
  const hours = Math.floor(total / 3600000);
  total %= 3600000;
  const minutes = Math.floor(total / 60000);
  total %= 60000;
  const seconds = Math.floor(total / 1000);
  const millis = total % 1000;
  return (hours ? hours + ':' : '') +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + '.' +
    String(millis).padStart(3, '0');
}

export function baseNameOf(fileName) {
  return String(fileName === undefined || fileName === null ? '' : fileName)
    .replace(/^.*[\\/]/, '')
    .replace(/\.(srt|lrc|txt)$/i, '');
}

export function sanitizeBaseName(name) {
  let s = String(name === undefined || name === null ? '' : name);
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (!s) s = 'sub2am';
  return Array.from(s).slice(0, 80).join('');
}
