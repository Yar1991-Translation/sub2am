import { SCENE_VERSION } from './constants.js';
import { argbFromHexAndOpacity, escapeXmlAttr, escapeXmlText, makeWarning } from './xml.js';
import { computeCueTransform, computeGeometry } from './settings.js';

function makeLabel(text, index) {
  const first = String(text).split('\n')[0].replace(/\s+/g, ' ').trim();
  const snippet = Array.from(first).slice(0, 24).join('');
  return '字幕 ' + String(index + 1).padStart(3, '0') + (snippet ? ' ' + snippet : '');
}

export function buildProject(settings, cues, modifiedTimeMs) {
  if (!Array.isArray(cues) || cues.length === 0) throw new Error('没有字幕');
  const s = settings;
  const geo = computeGeometry(s);
  const textColor = argbFromHexAndOpacity(s.color, s.opacity);
  let bgColor = argbFromHexAndOpacity(s.bgColor, 100);
  if (!textColor || !bgColor) throw new Error('颜色无效');
  if (s.bgTransparent) bgColor = '#00000000';

  const ordered = cues.slice().sort((a, b) =>
    Number(a.startMs) - Number(b.startMs) || (a.sourceLine || 0) - (b.sourceLine || 0)
  );
  let maxCueEndMs = 0;
  for (let i = 0; i < ordered.length; i++) {
    const endValue = Math.round(Number(ordered[i].endMs));
    if (!Number.isFinite(endValue)) throw new Error('第 ' + (i + 1) + ' 条时间无效');
    if (endValue > maxCueEndMs) maxCueEndMs = endValue;
  }
  if (!(maxCueEndMs > 0)) throw new Error('时间无效');

  const warnings = [];
  let totalTime;
  if (s.fixedDurationMs !== null && s.fixedDurationMs !== undefined && Number(s.fixedDurationMs) > 0) {
    totalTime = Math.round(Number(s.fixedDurationMs));
    if (totalTime < maxCueEndMs) {
      const requested = totalTime;
      totalTime = maxCueEndMs;
      warnings.push(makeWarning('FIXED_DURATION_SHORT', '总时长过短，已延长到 ' + totalTime + 'ms'));
    }
  } else {
    totalTime = Math.max(1, maxCueEndMs + Math.max(0, Math.round(Number(s.tailMs) || 0)));
  }

  const size = Number(s.size).toFixed(6);
  const wrapWidth = geo.wrapWidth;
  const modifiedValue = Number(modifiedTimeMs);
  const modified = Number.isFinite(modifiedValue) ? Math.round(modifiedValue) : Date.now();
  const v = SCENE_VERSION;

  const lines = [];
  lines.push("<?xml version='1.0' encoding='UTF-8' ?>");
  lines.push('<scene title="' + escapeXmlAttr(s.title) + '" width="' + s.width + '" height="' + s.height +
    '" exportWidth="' + s.width + '" exportHeight="' + s.height +
    '" precompose="' + v.precompose + '" bgcolor="' + bgColor + '" totalTime="' + totalTime +
    '" fps="' + s.fps + '" modifiedTime="' + modified +
    '" amver="' + v.amver + '" ffver="' + v.ffver + '" am="' + v.am + '" amplatform="' + v.amplatform +
    '" retime="' + v.retime + '" retimeAdaptFPS="' + v.retimeAdaptFPS + '">');

  for (let c = 0; c < ordered.length; c++) {
    const cue = ordered[c];
    const startMs = Math.round(Number(cue.startMs));
    const endMs = Math.round(Number(cue.endMs));
    if (!Number.isFinite(startMs) || startMs < 0 || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error('第 ' + (c + 1) + ' 条时间无效');
    }
    const label = makeLabel(cue.text, c);
    const transform = computeCueTransform(cue, s, geo);
    const cueX = Number(transform.x).toFixed(6);
    const cueY = Number(transform.y).toFixed(6);
    const cueScale = Number(transform.scale).toFixed(6);
    const cueAlign = cue.layout ? 'center' : s.align;
    lines.push('  <text id="' + (c + 1) + '" label="' + escapeXmlAttr(label) +
      '" startTime="' + startMs + '" endTime="' + endMs +
      '" fillType="color" mediaFillMode="fill" size="' + size +
      '" font="' + escapeXmlAttr(s.font) + '" wrapWidth="' + wrapWidth + '" align="' + cueAlign + '">');
    lines.push('    <transform>');
    lines.push('      <location value="' + cueX + ',' + cueY + ',0.000000" />');
    lines.push('      <scale value="' + cueScale + ',' + cueScale + '" />');
    lines.push('    </transform>');
    lines.push('    <fillColor value="' + textColor + '" />');
    if (s.shadow) {
      lines.push('    <shadow direction="outside" enabled="true">');
      lines.push('      <opacity value="0.300000" />');
      lines.push('      <size value="300.000000" />');
      lines.push('      <offset value="15.000000,15.000000" />');
      lines.push('    </shadow>');
    }
    lines.push('    <content>' + escapeXmlText(cue.text) + '</content>');
    lines.push('  </text>');
  }
  lines.push('</scene>');

  return {
    xml: lines.join('\n') + '\n',
    totalTime,
    maxCueEndMs,
    warnings
  };
}
