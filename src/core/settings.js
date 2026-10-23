import { DEFAULT_SETTINGS } from './constants.js';
import { colorToHex6 } from './xml.js';

export function computeGeometry(settings) {
  const width = Number(settings.width);
  const height = Number(settings.height);
  const marginPct = Number.isFinite(Number(settings.marginPct)) ? Number(settings.marginPct) : 15;
  const wrapPct = Number.isFinite(Number(settings.wrapPct)) ? Number(settings.wrapPct) : 90;
  let y;
  if (settings.position === 'top') y = height * marginPct / 100;
  else if (settings.position === 'middle') y = height / 2;
  else y = height * (1 - marginPct / 100);
  return {
    x: width / 2,
    y,
    wrapWidth: Math.max(1, Math.round(width * wrapPct / 100))
  };
}

export function computeCueTransform(cue, settings, geo) {
  if (!geo) geo = computeGeometry(settings);
  const baseScale = Number(settings.scale);
  const layout = cue && cue.layout;
  if (layout && Number(layout.totalUnits) > 0) {
    const em = Number(settings.size) * 3 * baseScale;
    const spacingPct = Number.isFinite(Number(settings.advanceFactorPct)) ? Number(settings.advanceFactorPct) : 100;
    const spacing = spacingPct / 100;
    const totalPx = Number(layout.totalUnits) * em * spacing;
    const boxWidth = Number(settings.width) * Number(settings.wrapPct) / 100;
    const fit = totalPx > boxWidth && totalPx > 0 ? boxWidth / totalPx : 1;
    const effEm = em * fit;
    const lineWidth = totalPx * fit;
    const boxLeft = (Number(settings.width) - boxWidth) / 2;
    let lineLeft;
    if (settings.align === 'left') lineLeft = boxLeft;
    else if (settings.align === 'right') lineLeft = boxLeft + boxWidth - lineWidth;
    else lineLeft = (Number(settings.width) - lineWidth) / 2;
    let x = lineLeft + (Number(layout.offsetUnits) + Number(layout.displayUnits) / 2) * effEm * spacing;
    let finalScale = baseScale * fit;
    if (!Number.isFinite(x)) x = geo.x;
    if (!Number.isFinite(finalScale)) finalScale = baseScale;
    return { x, y: geo.y, scale: finalScale };
  }
  return { x: geo.x, y: geo.y, scale: baseScale };
}

export function normalizeSettings(raw = {}) {
  const pick = (key) => raw[key] === undefined ? DEFAULT_SETTINGS[key] : raw[key];
  const intIn = (value, min, max, label) => {
    const n = Number(value);
    if (!Number.isFinite(n) || Math.round(n) !== n || n < min || n > max) {
      throw new Error(label + '：' + min + '–' + max + ' 整数');
    }
    return n;
  };
  const numIn = (value, min, max, label) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(label + '：' + min + '–' + max);
    }
    return n;
  };

  const width = intIn(pick('width'), 16, 8192, '画布宽度');
  const height = intIn(pick('height'), 16, 8192, '画布高度');
  const fps = Number(pick('fps'));
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error('FPS：24/25/30/50/60');
  const font = String(pick('font') === null ? '' : pick('font')).trim();
  if (!font) throw new Error('字体为空');
  if (font.length > 1024) throw new Error('字体过长');
  const size = numIn(pick('size'), 1, 1000, '字号');
  const scale = numIn(pick('scale'), 0.01, 100, '缩放');
  const color = colorToHex6(pick('color'));
  if (!color) throw new Error('文字颜色无效');
  const bgColor = colorToHex6(pick('bgColor'));
  if (!bgColor) throw new Error('背景颜色无效');
  const opacity = numIn(pick('opacity'), 0, 100, '不透明度');
  const align = String(pick('align')).toLowerCase();
  if (!['left', 'center', 'right'].includes(align)) throw new Error('对齐无效');
  const position = String(pick('position')).toLowerCase();
  if (!['bottom', 'middle', 'top'].includes(position)) throw new Error('位置无效');
  const marginPct = numIn(pick('marginPct'), 0, 50, '边距');
  const wrapPct = numIn(pick('wrapPct'), 1, 100, '换行宽度');
  const advanceFactorPct = numIn(pick('advanceFactorPct'), 20, 300, '字距微调');
  const tailMs = intIn(pick('tailMs'), 0, 600000, '尾部留白');
  const lastCueDurationMs = intIn(pick('lastCueDurationMs'), 100, 600000, '末句时长');
  const fixedRaw = raw.fixedDurationMs;
  let fixedDurationMs = null;
  if (fixedRaw !== null && fixedRaw !== undefined && fixedRaw !== '') {
    fixedDurationMs = intIn(fixedRaw, 1, 86400000, '固定时长');
  }
  let title = String(pick('title') === null || pick('title') === undefined ? '' : pick('title')).trim();
  if (!title) title = DEFAULT_SETTINGS.title;

  return {
    title,
    width,
    height,
    fps,
    bgColor,
    bgTransparent: Boolean(raw.bgTransparent),
    font,
    size,
    scale,
    color,
    opacity,
    align,
    position,
    marginPct,
    wrapPct,
    advanceFactorPct,
    tailMs,
    fixedDurationMs,
    lastCueDurationMs,
    shadow: Boolean(raw.shadow)
  };
}
