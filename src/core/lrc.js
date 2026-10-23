import { makeWarning, timePartsToMs } from './xml.js';
import { estimateAdvanceUnits } from './layout.js';

const LRC_META_RE = /^\s*\[([A-Za-z]+):([^\]]*)\]\s*$/;

export function parseLRC(text, opts = {}) {
  const mode = opts.mode === 'karaoke' || opts.mode === 'line' ? opts.mode : 'chars';
  const lastCueDurationMs = Number.isFinite(Number(opts.lastCueDurationMs))
    ? Math.max(1, Math.round(Number(opts.lastCueDurationMs)))
    : 3000;
  const src = String(text === undefined || text === null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const warnings = [];
  const meta = {};
  let offset = 0;
  let offsetCount = 0;
  let badOffset = 0;
  let untimed = 0;
  const knownMeta = { ti: 1, ar: 1, al: 1, by: 1, length: 1 };

  // Pass 1: metadata. An offset tag can appear anywhere; the last valid one wins.
  for (const line of lines) {
    const metaMatch = line.match(LRC_META_RE);
    if (!metaMatch) continue;
    const key = metaMatch[1].toLowerCase();
    const value = metaMatch[2].trim();
    if (key === 'offset') {
      offsetCount++;
      const n = parseInt(value.replace(/^\+/, ''), 10);
      if (Number.isFinite(n)) offset = n;
      else badOffset++;
    } else if (knownMeta[key]) {
      meta[key] = value;
    }
  }

  // Pass 2: split every timed line into segments. Both [mm:ss.xx] and
  // <mm:ss.xx> are timing tags; the text after a tag belongs to that tag.
  let clamped = 0;
  let decreased = 0;
  let textBefore = 0;
  const parsedLines = [];
  const allStarts = [];
  const tagRe = /([\[<])(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?([\]>])/g;
  const inlineMetaRe = /\[(ti|ar|al|by|offset|length):[^\]]*\]/gi;

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    if (raw.match(LRC_META_RE)) continue;
    const tags = [];
    tagRe.lastIndex = 0;
    let m;
    while ((m = tagRe.exec(raw)) !== null) {
      tags.push({
        time: timePartsToMs(0, m[2], m[3], m[4]),
        kind: m[1] === '[' ? 'bracket' : 'angle',
        start: m.index,
        end: tagRe.lastIndex
      });
    }
    if (!tags.length) {
      const trimmed = raw.trim();
      if (trimmed && trimmed.charAt(0) !== '[') untimed++;
      continue;
    }
    const preText = raw.slice(0, tags[0].start).replace(inlineMetaRe, '');
    if (preText.trim() !== '') textBefore++;
    const segs = [];
    for (let ti = 0; ti < tags.length; ti++) {
      const textStart = tags[ti].end;
      const textEnd = ti + 1 < tags.length ? tags[ti + 1].start : raw.length;
      const segText = raw.slice(textStart, textEnd).replace(inlineMetaRe, '');
      let adj = tags[ti].time - offset;
      if (adj < 0) {
        adj = 0;
        clamped++;
      }
      segs.push({ time: adj, kind: tags[ti].kind, text: segText });
    }
    if (preText.trim() !== '') segs[0].text = preText + segs[0].text;

    let prevTime = -1;
    for (const seg of segs) {
      if (seg.time < prevTime) {
        seg.time = prevTime;
        decreased++;
      }
      prevTime = seg.time;
    }

    let firstNonEmpty = -1;
    let lastNonEmpty = -1;
    let nonEmptyCount = 0;
    const fullParts = [];
    for (let sj = 0; sj < segs.length; sj++) {
      fullParts.push(segs[sj].text);
      if (segs[sj].text.trim() !== '') {
        if (firstNonEmpty === -1) firstNonEmpty = sj;
        lastNonEmpty = sj;
        nonEmptyCount++;
      }
    }
    const fullText = fullParts.join('').trim();
    let trailingEnd = null;
    if (lastNonEmpty >= 0) {
      const lastSeg = segs[segs.length - 1];
      if (lastSeg.text.trim() === '' && lastSeg.time > segs[lastNonEmpty].time) {
        trailingEnd = lastSeg.time;
      }
    }
    parsedLines.push({
      index: li,
      segs,
      firstTime: segs[0].time,
      firstNonEmpty,
      lastNonEmpty,
      nonEmptyCount,
      fullText,
      trailingEnd
    });
    allStarts.push(segs[0].time);
  }

  const uniqueStarts = Array.from(new Set(allStarts)).sort((a, b) => a - b);
  const nextStartAfter = (time) => {
    for (const start of uniqueStarts) {
      if (start > time) return start;
    }
    return null;
  };

  const cues = [];
  let invalidEnds = 0;

  const addCue = (start, end, cueText, sourceLine, mergeable, layout) => {
    const s = Math.round(Number(start));
    let e = Math.round(Number(end));
    const t = String(cueText || '');
    if (!t) return;
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      e = (Number.isFinite(s) ? s : 0) + Math.max(1, Math.min(lastCueDurationMs, 1000));
      invalidEnds++;
    }
    const cue = { startMs: s, endMs: e, text: t, sourceLine, mergeable: !!mergeable };
    if (layout) cue.layout = layout;
    cues.push(cue);
  };

  const lineEndFor = (lineObj, lastTime, nextStart) => {
    if (lineObj.trailingEnd !== null && lineObj.trailingEnd > lastTime) return lineObj.trailingEnd;
    if (nextStart !== null && nextStart > lastTime) return nextStart;
    if (nextStart !== null) {
      invalidEnds++;
      return lastTime + Math.max(1, Math.min(lastCueDurationMs, 1000));
    }
    return lastTime + lastCueDurationMs;
  };

  for (const lineObj of parsedLines) {
    if (!lineObj.fullText) continue;
    const nextStart = nextStartAfter(lineObj.firstTime);

    if (lineObj.nonEmptyCount === 1) {
      const seg = lineObj.segs[lineObj.firstNonEmpty];
      const leadingBrackets = [];
      for (let bi = 0; bi < lineObj.firstNonEmpty; bi++) {
        if (lineObj.segs[bi].kind === 'bracket' && lineObj.segs[bi].text.trim() === '') {
          leadingBrackets.push(lineObj.segs[bi].time);
        }
      }
      let occurrences;
      if (seg.kind === 'bracket') {
        occurrences = leadingBrackets.concat([seg.time]);
      } else if (mode === 'line') {
        occurrences = leadingBrackets.length ? leadingBrackets.slice() : [seg.time];
      } else {
        occurrences = [seg.time];
      }
      occurrences = Array.from(new Set(occurrences)).sort((a, b) => a - b);
      const wholeLastTime = occurrences[occurrences.length - 1];
      const wholeEnd = lineEndFor(lineObj, wholeLastTime, nextStartAfter(wholeLastTime));
      for (let oi = 0; oi < occurrences.length; oi++) {
        const os = occurrences[oi];
        const oe = oi + 1 < occurrences.length ? occurrences[oi + 1] : wholeEnd;
        addCue(os, oe, lineObj.fullText, lineObj.index + 1, true);
      }
      continue;
    }

    if (mode === 'line') {
      const lastLineTime = lineObj.segs[lineObj.lastNonEmpty].time;
      addCue(lineObj.firstTime, lineEndFor(lineObj, lastLineTime, nextStart), lineObj.fullText, lineObj.index + 1, true);
      continue;
    }

    // Group consecutive segments sharing one timestamp (fast karaoke notes).
    const groups = [];
    for (const cur of lineObj.segs) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.time === cur.time) {
        lastGroup.parts.push(cur.text);
      } else {
        groups.push({ time: cur.time, parts: [cur.text] });
      }
    }

    if (mode === 'chars') {
      let runningUnits = 0;
      const layoutItems = [];
      for (const group of groups) {
        const rawGroupText = group.parts.join('');
        const groupUnits = estimateAdvanceUnits(rawGroupText);
        const displayText = rawGroupText.trim();
        const withoutLeading = rawGroupText.replace(/^\s+/, '');
        const leadingText = rawGroupText.slice(0, rawGroupText.length - withoutLeading.length);
        const item = {
          time: group.time,
          text: displayText,
          beforeUnits: runningUnits,
          leadingUnits: estimateAdvanceUnits(leadingText),
          displayUnits: estimateAdvanceUnits(displayText)
        };
        runningUnits += groupUnits;
        if (displayText) layoutItems.push(item);
      }
      if (!layoutItems.length) continue;
      const firstItem = layoutItems[0];
      const lastItem = layoutItems[layoutItems.length - 1];
      const lineStartUnits = firstItem.beforeUnits + firstItem.leadingUnits;
      const lineEndUnits = lastItem.beforeUnits + lastItem.leadingUnits + lastItem.displayUnits;
      const totalUnits = Math.max(0, lineEndUnits - lineStartUnits);
      const charEnd = lineEndFor(lineObj, lastItem.time, nextStart);
      for (const item of layoutItems) {
        // Every character stays visible until the whole lyric line ends.
        addCue(item.time, charEnd, item.text, lineObj.index + 1, false, {
          lineId: lineObj.index,
          offsetUnits: item.beforeUnits + item.leadingUnits - lineStartUnits,
          displayUnits: item.displayUnits,
          totalUnits
        });
      }
      continue;
    }

    // karaoke: cumulative prefixes, so the line grows character by character.
    let acc = '';
    const steps = [];
    for (const group of groups) {
      acc += group.parts.join('');
      const display = acc.trim();
      if (!display) continue;
      if (steps.length && steps[steps.length - 1].text === display) continue;
      steps.push({ time: group.time, text: display });
    }
    if (!steps.length) continue;
    const stepEnd = lineEndFor(lineObj, steps[steps.length - 1].time, nextStart);
    for (let st = 0; st < steps.length; st++) {
      const ste = st + 1 < steps.length ? steps[st + 1].time : stepEnd;
      addCue(steps[st].time, ste, steps[st].text, lineObj.index + 1, false);
    }
  }

  // Merge same-start whole-line cues (bilingual LRC); in line mode every cue
  // can merge, so identical-start lines become one multi-line text layer.
  const merged = new Map();
  const others = [];
  for (const cue of cues) {
    if (!cue.mergeable) {
      const other = { startMs: cue.startMs, endMs: cue.endMs, text: cue.text, sourceLine: cue.sourceLine };
      if (cue.layout) other.layout = cue.layout;
      others.push(other);
      continue;
    }
    let mg = merged.get(cue.startMs);
    if (!mg) {
      mg = { texts: [], endMs: cue.endMs, sourceLine: cue.sourceLine };
      merged.set(cue.startMs, mg);
    }
    if (!mg.texts.includes(cue.text)) mg.texts.push(cue.text);
    if (cue.endMs > mg.endMs) mg.endMs = cue.endMs;
  }
  const finalCues = others.slice();
  merged.forEach((mg, start) => {
    const mergedText = mg.texts.join('\n');
    if (!mergedText) return;
    let mergedEnd = mg.endMs;
    if (mergedEnd <= start) mergedEnd = start + Math.max(1, Math.min(lastCueDurationMs, 1000));
    finalCues.push({ startMs: start, endMs: mergedEnd, text: mergedText, sourceLine: mg.sourceLine });
  });
  finalCues.sort((a, b) => a.startMs - b.startMs || (a.sourceLine || 0) - (b.sourceLine || 0));

  if (badOffset) warnings.push(makeWarning('LRC_BAD_OFFSET', badOffset + ' 个 offset 无效'));
  if (offsetCount && offset) {
    warnings.push(makeWarning('LRC_OFFSET_APPLIED', 'offset：' + (offset > 0 ? '提前' : '延后') + ' ' + Math.abs(offset) + 'ms'));
  }
  if (clamped) warnings.push(makeWarning('LRC_OFFSET_CLAMPED', clamped + ' 个时间钳到 0'));
  if (decreased) warnings.push(makeWarning('LRC_TIME_DECREASED', decreased + ' 个时间戳乱序，已顺延'));
  if (textBefore) warnings.push(makeWarning('LRC_TEXT_BEFORE_TIME', textBefore + ' 行首字前有文本，已并入'));
  if (invalidEnds) warnings.push(makeWarning('LRC_INVALID_END', invalidEnds + ' 处行尾无效，已延长'));
  if (untimed) warnings.push(makeWarning('LRC_UNTIMED', untimed + ' 行无时间标签'));
  if (!finalCues.length) warnings.push(makeWarning('NO_CUES', '未读到歌词'));

  return { format: 'lrc', cues: finalCues, warnings, meta, mode };
}
