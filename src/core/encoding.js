import { makeWarning } from './xml.js';

function scoreDecodedText(text, encoding) {
  let score = 0;
  let replacements = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i);
    if (cp > 0xffff) i++;
    if (cp === 0xfffd) {
      score -= 100;
      replacements++;
    } else if ((cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || cp === 0x7f) {
      score -= 50;
    } else if (cp >= 0x80 && cp <= 0x9f) {
      score -= 30;
    } else if (cp >= 0x4e00 && cp <= 0x9fff) {
      score += 3;
    } else if (cp >= 0x3400 && cp <= 0x4dbf) {
      score += 2;
    } else if (cp >= 0x3040 && cp <= 0x30ff) {
      score += 3;
    } else if (cp >= 0xac00 && cp <= 0xd7af) {
      score += 3;
    } else if (cp >= 0x3000 && cp <= 0x303f) {
      score += 2;
    } else if (cp >= 0xff00 && cp <= 0xffef) {
      score += 1;
    } else if (cp >= 0xe000 && cp <= 0xf8ff) {
      score -= 5;
    } else if (cp >= 0x20 && cp < 0x7f) {
      score += 0.05;
    } else {
      score += 0.2;
    }
  }
  if (encoding === 'shift_jis' && /[぀-ヿ]/.test(text)) score += 8;
  return { score, replacements };
}

function toUint8(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (bytes && bytes.buffer) return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
  throw new Error('无法读取文件');
}

function countReplacements(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.codePointAt(i) === 0xfffd) n++;
  return n;
}

export function decodeSubtitle(bytes, encodingChoice) {
  const u8 = toUint8(bytes);
  const choice = String(encodingChoice || 'auto').toLowerCase();
  const warnings = [];
  let text = '';
  let encoding = choice;
  const usedOverride = choice !== 'auto';
  let hadBom = false;

  if (choice === 'auto') {
    if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
      hadBom = true;
      text = new TextDecoder('utf-8').decode(u8.subarray(3));
      encoding = 'utf-8';
    } else if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
      hadBom = true;
      text = new TextDecoder('utf-16le').decode(u8.subarray(2));
      encoding = 'utf-16le';
    } else if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
      hadBom = true;
      text = new TextDecoder('utf-16be').decode(u8.subarray(2));
      encoding = 'utf-16be';
    } else {
      let strictOk = true;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
      } catch {
        strictOk = false;
      }
      if (strictOk) {
        encoding = 'utf-8';
      } else {
        const candidates = ['gb18030', 'big5', 'shift_jis', 'windows-1252'];
        let best = null;
        for (const enc of candidates) {
          let decoded;
          try {
            decoded = new TextDecoder(enc, { fatal: false }).decode(u8);
          } catch {
            continue;
          }
          const score = scoreDecodedText(decoded, enc);
          if (!best || score.score > best.score) {
            best = { enc, text: decoded, score: score.score, replacements: score.replacements };
          }
        }
        if (!best) throw new Error('不支持该编码');
        text = best.text;
        encoding = best.enc;
        if (best.replacements > 0) {
          warnings.push(makeWarning(
            'DECODE_REPLACEMENTS',
            best.replacements + ' 个字符解码失败（' + encoding + '）'
          ));
        }
      }
    }
  } else {
    const label = choice === 'gbk' ? 'gb18030' : choice;
    try {
      text = new TextDecoder(label, { fatal: false }).decode(u8);
    } catch {
      throw new Error('不支持编码：' + choice);
    }
    encoding = label;
    const reps = countReplacements(text);
    if (reps > 0) {
      warnings.push(makeWarning('DECODE_REPLACEMENTS', reps + ' 个字符解码失败'));
    }
  }

  text = text.replace(/^﻿/, '');
  return {
    text,
    encoding,
    usedOverride,
    hadBom,
    replacements: countReplacements(text),
    warnings
  };
}
