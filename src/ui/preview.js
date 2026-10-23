import * as Core from '../core/index.js';
import { $ } from './dom.js';

export function applyStage(settings) {
  const stage = $('stage');
  if (!settings || !settings.width || !settings.height) return;
  stage.style.aspectRatio = settings.width + ' / ' + settings.height;
  if (settings.bgTransparent) {
    stage.classList.add('transparent');
    stage.style.background = '';
  } else {
    stage.classList.remove('transparent');
    stage.style.background = settings.bgColor || '#000000';
  }
  $('stageBadge').textContent = settings.width + ' × ' + settings.height;
}

export function updatePreviewFontSize(settings) {
  if (!settings || !settings.width) return;
  const stageEl = $('stage');
  const stageWidth = stageEl.clientWidth || 1;
  const textEl = $('stageText');
  const px = Number(settings.size) * 3 * Number(settings.scale) * (stageWidth / Number(settings.width));
  textEl.style.fontSize = Math.max(6, px).toFixed(2) + 'px';
  textEl.style.lineHeight = '1.2';

  const spans = $('stageChars').querySelectorAll('.stage-char');
  const basePx = Number(settings.size) * 3 * (stageWidth / Number(settings.width));
  for (const span of spans) {
    const spanScale = Number(span.dataset.scale) || Number(settings.scale) || 1;
    span.style.fontSize = Math.max(6, basePx * spanScale).toFixed(2) + 'px';
  }
}

export function renderPreview(state) {
  const cues = state.parse ? state.parse.cues : [];
  const textEl = $('stageText');
  const charsEl = $('stageChars');
  let settings = state.lastSettings;
  if (settings) applyStage(settings);
  charsEl.textContent = '';

  if (!cues.length) {
    charsEl.style.display = 'none';
    textEl.style.display = '';
    textEl.textContent = state.bytes ? '无字幕' : '拖入文件或点示例';
    textEl.style.color = 'var(--md-sys-color-on-surface-variant, #cac4d0)';
    textEl.style.fontSize = '14px';
    textEl.style.left = '50%';
    textEl.style.top = '50%';
    textEl.style.width = '90%';
    textEl.style.textAlign = 'center';
    textEl.style.fontWeight = '400';
    $('cuePosition').textContent = cues.length ? '—' : '未读到字幕';
    return;
  }

  if (!settings) settings = Core.normalizeSettings({});
  state.selected = Math.max(0, Math.min(state.selected, cues.length - 1));
  const cue = cues[state.selected];
  const geo = Core.computeGeometry(settings);
  const color = Core.normalizeColor(settings.color) || { r: 255, g: 255, b: 255 };
  const rgbaColor = 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + (settings.opacity / 100) + ')';
  const weight = /[?&]weight=(\d{2,4})/.exec(settings.font || '');
  const fontWeight = weight ? weight[1] : '700';
  const fontFamily = 'Roboto, "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Yu Gothic", sans-serif';

  if (cue.layout && cue.layout.totalUnits > 0) {
    textEl.style.display = 'none';
    charsEl.style.display = 'block';
    charsEl.style.color = rgbaColor;
    charsEl.style.fontWeight = fontWeight;
    charsEl.style.fontFamily = fontFamily;
    const lineId = cue.layout.lineId;
    const active = [];
    for (const c of cues) {
      if (c.layout && c.layout.lineId === lineId && c.startMs <= cue.startMs && c.endMs > cue.startMs) {
        active.push(c);
      }
    }
    if (!active.length) active.push(cue);
    for (const c of active) {
      const tr = Core.computeCueTransform(c, settings, geo);
      const span = document.createElement('span');
      span.className = 'stage-char';
      span.textContent = c.text;
      span.dataset.scale = String(tr.scale);
      span.style.left = (tr.x / settings.width * 100) + '%';
      span.style.top = (tr.y / settings.height * 100) + '%';
      charsEl.appendChild(span);
    }
    updatePreviewFontSize(settings);
    $('cuePosition').textContent = (state.selected + 1) + ' / ' + cues.length + ' · ' +
      Core.formatTimecode(cue.startMs) + ' – ' + Core.formatTimecode(cue.endMs);
    return;
  }

  charsEl.style.display = 'none';
  textEl.style.display = '';
  textEl.style.left = (geo.x / settings.width * 100) + '%';
  textEl.style.top = (geo.y / settings.height * 100) + '%';
  textEl.style.width = settings.wrapPct + '%';
  textEl.style.textAlign = settings.align;
  textEl.style.color = rgbaColor;
  textEl.style.fontWeight = fontWeight;
  textEl.style.fontFamily = fontFamily;
  textEl.textContent = cue.text;
  updatePreviewFontSize(settings);
  $('cuePosition').textContent = (state.selected + 1) + ' / ' + cues.length + ' · ' +
    Core.formatTimecode(cue.startMs) + ' – ' + Core.formatTimecode(cue.endMs);
}
