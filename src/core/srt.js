import { decodeHtmlEntities, makeWarning, timePartsToMs } from './xml.js';

const SRT_TIME_RE = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*-->\s*(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?(?:\s+.*)?$/;

export function cleanSubtitleText(raw) {
  let s = String(raw === undefined || raw === null ? '' : raw).replace(/\r/g, '');
  s = s.replace(/<\s*br\b[^>]*>/gi, '\n');
  s = s.replace(/<\/?[A-Za-z][^>]*>/g, '');
  s = s.replace(/\{\\[^}]*\}/g, '');
  s = decodeHtmlEntities(s);
  s = s.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n');
  s = s.replace(/[ \t]+\n/g, '\n');
  return s.replace(/^\s+/, '').replace(/\s+$/, '');
}

export function normalizeCues(cues, opts = {}) {
  const minDur = Number.isFinite(Number(opts.minDurationMs)) ? Math.max(1, Number(opts.minDurationMs)) : 1000;
  const warnings = [];
  const out = [];
  let fixed = 0;
  let invalid = 0;
  const list = Array.isArray(cues) ? cues : [];
  for (const c of list) {
    if (!c) continue;
    const start = Number(c.startMs);
    const end = Number(c.endMs);
    const text = String(c.text === undefined || c.text === null ? '' : c.text).trim();
    if (!text) continue;
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      invalid++;
      continue;
    }
    const startMs = Math.max(0, Math.round(start));
    let endMs = Math.round(end);
    if (endMs <= startMs) {
      endMs = startMs + minDur;
      fixed++;
    }
    out.push({ startMs, endMs, text, sourceLine: c.sourceLine });
  }
  out.sort((a, b) => a.startMs - b.startMs || (a.sourceLine || 0) - (b.sourceLine || 0));
  if (fixed) warnings.push(makeWarning('CUE_DURATION_FIXED', fixed + ' 条时长修正为 ' + minDur + 'ms'));
  if (invalid) warnings.push(makeWarning('CUE_INVALID_TIME', invalid + ' 条时间无效，已跳过'));
  return { cues: out, warnings };
}

export function parseSRT(text) {
  const src = String(text === undefined || text === null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const warnings = [];
  const rawCues = [];
  let badTiming = 0;
  let emptyCues = 0;
  let badDuration = 0;
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    const m = trimmed.match(SRT_TIME_RE);
    if (!m) {
      if (trimmed.includes('-->')) badTiming++;
      i++;
      continue;
    }
    const startMs = timePartsToMs(m[1], m[2], m[3], m[4]);
    const endMs = timePartsToMs(m[5], m[6], m[7], m[8]);
    const startLine = i + 1;
    let j = i + 1;
    const textLines = [];
    while (j < lines.length) {
      const tl = lines[j];
      if (tl.trim() === '') break;
      if (tl.includes('-->')) break;
      if (SRT_TIME_RE.test(tl.trim())) break;
      if (/^\d+$/.test(tl.trim())) {
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === '') k++;
        if (k < lines.length && SRT_TIME_RE.test(lines[k].trim())) break;
      }
      textLines.push(tl);
      j++;
    }
    const clean = cleanSubtitleText(textLines.join('\n'));
    if (!clean) emptyCues++;
    else if (endMs <= startMs) badDuration++;
    else rawCues.push({ startMs, endMs, text: clean, sourceLine: startLine });
    i = j > i ? j : i + 1;
  }
  const normalized = normalizeCues(rawCues, { minDurationMs: 1000 });
  const cues = normalized.cues;
  warnings.push(...normalized.warnings);
  let overlaps = 0;
  let maxEnd = -1;
  for (const c of cues) {
    if (c.startMs < maxEnd) overlaps++;
    if (c.endMs > maxEnd) maxEnd = c.endMs;
  }
  if (overlaps) warnings.push(makeWarning('SRT_OVERLAP', overlaps + ' 条时间重叠'));
  if (badTiming) warnings.push(makeWarning('SRT_BAD_TIMING', badTiming + ' 行时间轴无效'));
  if (emptyCues) warnings.push(makeWarning('SRT_EMPTY_CUE', emptyCues + ' 条空字幕'));
  if (badDuration) warnings.push(makeWarning('SRT_BAD_DURATION', badDuration + ' 条结束早于开始，已跳过'));
  if (!cues.length) warnings.push(makeWarning('NO_CUES', '未读到字幕'));
  return { format: 'srt', cues, warnings };
}
