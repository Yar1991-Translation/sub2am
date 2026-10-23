import { $ } from './dom.js';

export function readSettings() {
  const fixedText = $('fixedDurationInput').value.trim();
  let fixedMs = null;
  if (fixedText !== '') {
    const fixedSec = Number(fixedText);
    fixedMs = Number.isFinite(fixedSec) ? Math.round(fixedSec * 1000) : NaN;
  }
  const lastSec = Number($('lastCueInput').value);
  const lastMs = (Number.isFinite(lastSec) && lastSec >= 0.1) ? Math.round(lastSec * 1000) : 3000;
  const advanceRaw = Number($('advanceInput').value);
  const advanceFactorPct = Number.isFinite(advanceRaw) ? Math.max(20, Math.min(300, advanceRaw)) : 100;

  return {
    title: $('titleInput').value,
    width: Number($('widthInput').value),
    height: Number($('heightInput').value),
    fps: Number($('fpsSelect').value),
    bgColor: $('bgColorInput').value,
    bgTransparent: $('bgTransparentInput').checked,
    font: $('fontInput').value,
    size: Number($('sizeInput').value),
    scale: Number($('scaleInput').value),
    color: $('colorInput').value,
    opacity: Number($('opacityInput').value),
    align: $('alignSelect').value,
    position: $('positionSelect').value,
    marginPct: Number($('marginInput').value),
    wrapPct: Number($('wrapInput').value),
    advanceFactorPct,
    tailMs: Number($('tailInput').value),
    fixedDurationMs: fixedMs,
    lastCueDurationMs: lastMs,
    shadow: $('shadowInput').checked
  };
}

export function syncBgControls() {
  $('bgColorInput').disabled = $('bgTransparentInput').checked;
}

export function toggleMargin() {
  $('marginInput').disabled = $('positionSelect').value === 'middle';
}

export function getOrientation() {
  const segments = document.querySelectorAll('#orientationBtns m3e-button-segment');
  const checked = Array.from(segments).find((segment) => segment.checked);
  return checked ? checked.value : 'custom';
}

export function markOrientation(orient) {
  const segments = document.querySelectorAll('#orientationBtns m3e-button-segment');
  for (const segment of segments) {
    segment.checked = segment.value === orient;
  }
}

export function syncOrientationFromSize() {
  const w = Number($('widthInput').value);
  const h = Number($('heightInput').value);
  if (w === 1920 && h === 1080) markOrientation('landscape');
  else if (w === 1080 && h === 1920) markOrientation('portrait');
  else markOrientation('custom');
}
