import * as Core from '../core/index.js';
import { $, formatBytes, setStatus, showSnackbar } from './dom.js';
import {
  readSettings,
  syncBgControls,
  toggleMargin,
  getOrientation,
  markOrientation,
  syncOrientationFromSize
} from './options.js';
import { renderPreview, updatePreviewFontSize } from './preview.js';
import { renderCueList, updateSelectedUI } from './cue-list.js';
import { SAMPLE_SRT, SAMPLE_LRC } from './samples.js';

const state = {
  fileName: '',
  bytes: null,
  decode: null,
  parse: null,
  selected: 0,
  lastSettings: null,
  generated: null,
  error: ''
};

let refreshTimer = null;
let reparseTimer = null;

const SCHEME_KEY = 'sub2am.scheme';

function applyScheme(scheme, persist = true) {
  const value = scheme === 'light' ? 'light' : 'dark';
  const theme = document.querySelector('m3e-theme');
  if (theme) theme.scheme = value;
  const scope = $('themeScope');
  if (scope) {
    scope.classList.toggle('light', value === 'light');
    scope.classList.toggle('dark', value !== 'light');
  }
  document.documentElement.classList.toggle('light', value === 'light');
  document.documentElement.classList.toggle('dark', value !== 'light');
  const toggle = $('schemeToggle');
  if (toggle) {
    toggle.selected = value === 'light';
    toggle.setAttribute('aria-label', value === 'light' ? '切换到深色' : '切换到浅色');
  }
  if (persist) {
    try {
      localStorage.setItem(SCHEME_KEY, value);
    } catch {
      /* storage may be unavailable on file:// */
    }
  }
}

function initScheme() {
  let value = 'dark';
  try {
    const saved = localStorage.getItem(SCHEME_KEY);
    if (saved === 'light' || saved === 'dark') value = saved;
  } catch {
    /* use default */
  }
  applyScheme(value, false);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 120);
}

function scheduleReparse() {
  clearTimeout(reparseTimer);
  reparseTimer = setTimeout(() => parseNow(), 220);
}

function setSelectValue(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value;
}

function updateSourceInfo(format, decode) {
  const info = [];
  info.push(state.fileName || '未命名');
  if (state.bytes) info.push(formatBytes(state.bytes.length));
  if (decode) {
    let encText = decode.encoding + (decode.hadBom ? '（含 BOM）' : '');
    if (decode.replacements) encText += ' · ' + decode.replacements + ' 个字符解码失败';
    info.push(encText);
  }
  if (state.parse) {
    info.push(format ? format.toUpperCase() : '格式未知');
    info.push(state.parse.cues.length + ' 条');
    if (state.parse.meta?.ti) info.push(state.parse.meta.ti);
    if (state.parse.meta?.ar) info.push(state.parse.meta.ar);
  }
  $('sourceInfo').textContent = info.join(' · ');
}

function showLrcControls(format) {
  const isLrc = format === 'lrc';
  const mode = $('lrcModeSelect').value || 'chars';
  $('lastCueRow').style.display = isLrc ? '' : 'none';
  $('lrcModeRow').style.display = isLrc ? '' : 'none';
  $('advanceRow').style.display = isLrc && mode === 'chars' ? '' : 'none';
}

function parseNow(options = {}) {
  if (!state.bytes) {
    state.parse = null;
    state.decode = null;
    state.generated = null;
    $('generateBtn').disabled = true;
    $('sourceInfo').textContent = '未选择文件';
    $('stats').textContent = '—';
    renderWarnings([], '');
    renderPreview(state);
    return;
  }

  let decode;
  try {
    decode = Core.decodeSubtitle(state.bytes, $('encodingSelect').value || 'auto');
  } catch (e) {
    state.decode = null;
    state.parse = null;
    state.generated = null;
    $('generateBtn').disabled = true;
    state.error = e.message;
    setStatus(e.message, 'err');
    showSnackbar(e.message);
    updateSourceInfo(null, null);
    $('stats').textContent = '—';
    renderWarnings([], e.message);
    renderPreview(state);
    return;
  }
  state.decode = decode;

  const manualFormat = $('formatSelect').value || 'auto';
  const format = manualFormat === 'auto' ? Core.detectFormat(state.fileName, decode.text) : manualFormat;
  const decodeWarnings = decode.warnings || [];

  if (!format) {
    state.parse = {
      format: 'unknown',
      cues: [],
      warnings: decodeWarnings.concat([{ code: 'FORMAT_UNKNOWN', message: '格式未知' }]),
      meta: {}
    };
    state.selected = 0;
    state.generated = null;
    $('generateBtn').disabled = true;
    setStatus('格式未知', 'err');
    updateSourceInfo(null, decode);
    showLrcControls('unknown');
    $('lastCueRow').style.display = 'none';
    $('lrcModeRow').style.display = 'none';
    $('advanceRow').style.display = 'none';
    renderCueList(state, selectCue);
    refresh();
    return;
  }

  let result;
  try {
    if (format === 'lrc') {
      let lastMs = Math.round(Number($('lastCueInput').value) * 1000);
      if (!(lastMs >= 100)) lastMs = 3000;
      result = Core.parseLRC(decode.text, {
        lastCueDurationMs: lastMs,
        mode: $('lrcModeSelect').value || 'chars'
      });
    } else {
      result = Core.parseSRT(decode.text);
    }
  } catch (e) {
    state.parse = null;
    state.generated = null;
    $('generateBtn').disabled = true;
    state.error = e.message;
    setStatus(e.message, 'err');
    showSnackbar(e.message);
    updateSourceInfo(format, decode);
    renderCueList(state, selectCue);
    refresh();
    return;
  }

  result.warnings = decodeWarnings.concat(result.warnings || []);
  if (result.cues.length > 2000) {
    result.warnings.push({ code: 'MANY_CUES', message: '字幕超过 2000 条，AM 可能卡' });
  } else if (format === 'lrc' && ($('lrcModeSelect').value || 'chars') !== 'line' && result.cues.length > 800) {
    result.warnings.push({
      code: 'KARAOKE_MANY_CUES',
      message: result.cues.length + ' 个文字层，AM 可能卡'
    });
  }
  state.parse = result;
  state.selected = options.newSource ? 0 : Math.min(state.selected, Math.max(0, result.cues.length - 1));
  state.error = '';

  if (format === 'lrc' && result.meta?.ti && options.newSource) {
    $('titleInput').value = result.meta.ti;
  }

  showLrcControls(format);
  updateSourceInfo(format, decode);
  renderCueList(state, selectCue);
  refresh();
}

function refresh() {
  const cues = state.parse ? state.parse.cues : [];
  const warnings = state.parse ? state.parse.warnings.slice() : [];

  let settings;
  try {
    settings = Core.normalizeSettings(readSettings());
    state.lastSettings = settings;
    state.error = '';
  } catch (e) {
    state.generated = null;
    $('generateBtn').disabled = true;
    state.error = e.message;
    setStatus(e.message, 'err');
    renderStats(cues, null, warnings);
    renderWarnings(warnings, e.message);
    renderPreview(state);
    return;
  }

  if (!cues.length) {
    state.generated = null;
    $('generateBtn').disabled = true;
    setStatus('未读到字幕', '');
    renderStats(cues, null, warnings);
    renderWarnings(warnings, '');
    renderPreview(state);
    return;
  }

  let out;
  try {
    out = Core.buildProject(settings, cues, Date.now());
  } catch (e) {
    state.generated = null;
    $('generateBtn').disabled = true;
    state.error = e.message;
    setStatus(e.message, 'err');
    renderStats(cues, null, warnings);
    renderWarnings(warnings, e.message);
    renderPreview(state);
    return;
  }

  warnings.push(...(out.warnings || []));
  const validation = validateXmlString(out.xml, cues.length);
  state.generated = { settings, out, valid: validation.ok, error: validation.error || '' };
  $('generateBtn').disabled = !validation.ok;
  if (!validation.ok) {
    state.error = validation.error;
    setStatus(validation.error, 'err');
  } else if (!state.error) {
    setStatus('', '');
  }
  renderStats(cues, out, warnings);
  renderWarnings(warnings, validation.ok ? '' : validation.error);
  renderPreview(state);
}

function validateXmlString(xml, cueCount) {
  try {
    if (typeof DOMParser === 'undefined') return { ok: true };
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      return { ok: false, error: 'XML 语法错误' };
    }
    if (!doc.documentElement || doc.documentElement.tagName !== 'scene') {
      return { ok: false, error: 'XML 根节点错误' };
    }
    const texts = doc.getElementsByTagName('text');
    if (texts.length !== cueCount) {
      return { ok: false, error: '文字层数量不匹配' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'XML 校验失败' };
  }
}

function renderStats(cues, out, warnings) {
  const parts = [];
  if (state.parse?.format) parts.push(state.parse.format.toUpperCase());
  parts.push(cues.length + ' 条');
  if (out) parts.push(Core.formatTimecode(out.totalTime));
  if (warnings && warnings.length) parts.push(warnings.length + ' 提示');
  $('stats').textContent = parts.join(' · ');
}

function renderWarnings(warnings, error) {
  const box = $('warnings');
  box.textContent = '';
  const items = [];
  if (error) items.push({ message: error, error: true });
  items.push(...warnings);
  if (!items.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const title = document.createElement('div');
  title.className = 'warn-title';
  title.textContent = items.length + ' 条提示';
  box.appendChild(title);
  const ul = document.createElement('ul');
  const limit = Math.min(items.length, 30);
  for (let i = 0; i < limit; i++) {
    const w = items[i];
    const li = document.createElement('li');
    li.textContent = (w.line ? '第 ' + w.line + ' 行：' : '') + w.message;
    if (w.error) li.className = 'error';
    ul.appendChild(li);
  }
  if (items.length > limit) {
    const more = document.createElement('li');
    more.textContent = '还有 ' + (items.length - limit) + ' 条';
    ul.appendChild(more);
  }
  box.appendChild(ul);
}

function selectCue(index) {
  const cues = state.parse ? state.parse.cues : [];
  if (!cues.length) return;
  state.selected = Math.max(0, Math.min(index, cues.length - 1));
  updateSelectedUI(state);
  renderPreview(state);
}

async function loadFile(file) {
  if (!file) return;
  state.fileName = file.name || '字幕文件';
  try {
    state.bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    showSnackbar('文件读取失败');
    setStatus('文件读取失败', 'err');
    return;
  }
  state.selected = 0;
  setSelectValue('encodingSelect', 'auto');
  setSelectValue('formatSelect', 'auto');
  $('titleInput').value = Core.baseNameOf(state.fileName) || '字幕';
  parseNow({ newSource: true });
}

function loadSample(kind) {
  const text = kind === 'lrc' ? SAMPLE_LRC : SAMPLE_SRT;
  state.fileName = kind === 'lrc' ? '示例歌词.lrc' : '示例字幕.srt';
  state.bytes = new TextEncoder().encode(text);
  state.selected = 0;
  setSelectValue('encodingSelect', 'auto');
  setSelectValue('formatSelect', 'auto');
  $('titleInput').value = kind === 'lrc' ? '示例歌词' : '示例字幕';
  parseNow({ newSource: true });
}

function download() {
  if (!state.parse || !state.parse.cues.length) return;
  let settings;
  try {
    settings = Core.normalizeSettings(readSettings());
  } catch (e) {
    state.error = e.message;
    setStatus(e.message, 'err');
    showSnackbar(e.message);
    return;
  }
  let out;
  try {
    out = Core.buildProject(settings, state.parse.cues, Date.now());
  } catch (e) {
    state.error = e.message;
    setStatus(e.message, 'err');
    showSnackbar(e.message);
    return;
  }
  const validation = validateXmlString(out.xml, state.parse.cues.length);
  if (!validation.ok) {
    state.error = validation.error;
    setStatus(validation.error, 'err');
    showSnackbar(validation.error);
    return;
  }
  const base = Core.sanitizeBaseName(Core.baseNameOf(state.fileName) || 'sub2am');
  const blob = new Blob([out.xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = base + '.xml';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  setStatus('已生成', 'ok');
  showSnackbar('已生成 ' + base + '.xml');
}

function wireEvents() {
  const dropzone = $('dropzone');
  const fileInput = $('fileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) await loadFile(file);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) loadFile(files[0]);
  });
  ['dragover', 'drop'].forEach((evt) => {
    window.addEventListener(evt, (e) => e.preventDefault());
  });

  $('loadSampleSrt').addEventListener('click', () => loadSample('srt'));
  $('loadSampleLrc').addEventListener('click', () => loadSample('lrc'));

  $('encodingSelect').addEventListener('change', () => parseNow());
  $('formatSelect').addEventListener('change', () => parseNow());
  $('lrcModeSelect').addEventListener('change', () => parseNow());
  $('lastCueInput').addEventListener('input', scheduleReparse);

  $('orientationBtns').addEventListener('change', () => {
    const orient = getOrientation();
    if (orient === 'landscape') {
      $('widthInput').value = '1920';
      $('heightInput').value = '1080';
    } else if (orient === 'portrait') {
      $('widthInput').value = '1080';
      $('heightInput').value = '1920';
    }
    scheduleRefresh();
  });

  ['widthInput', 'heightInput'].forEach((id) => {
    $(id).addEventListener('input', () => {
      syncOrientationFromSize();
      scheduleRefresh();
    });
  });

  ['sizeInput', 'scaleInput', 'opacityInput', 'marginInput', 'wrapInput', 'advanceInput',
    'tailInput', 'fixedDurationInput', 'titleInput', 'colorInput', 'bgColorInput'].forEach((id) => {
    $(id).addEventListener('input', scheduleRefresh);
  });

  ['fpsSelect', 'alignSelect', 'positionSelect'].forEach((id) => {
    $(id).addEventListener('change', scheduleRefresh);
  });
  $('positionSelect').addEventListener('change', toggleMargin);

  $('bgTransparentInput').addEventListener('change', () => {
    syncBgControls();
    scheduleRefresh();
  });
  $('shadowInput').addEventListener('change', scheduleRefresh);

  $('prevBtn').addEventListener('click', () => selectCue(state.selected - 1));
  $('nextBtn').addEventListener('click', () => selectCue(state.selected + 1));
  const onSlider = () => selectCue(Number($('cueSliderThumb').value));
  $('cueSlider').addEventListener('input', onSlider);
  $('cueSliderThumb').addEventListener('input', onSlider);

  $('generateBtn').addEventListener('click', download);

  $('schemeToggle').addEventListener('change', () => {
    applyScheme($('schemeToggle').selected ? 'light' : 'dark');
  });

  $('helpBtn').addEventListener('click', () => {
    const dialog = $('helpDialog');
    if (dialog) dialog.open = true;
  });

  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (state.lastSettings) updatePreviewFontSize(state.lastSettings);
    }).observe($('stage'));
  }
}

function init() {
  setSelectValue('encodingSelect', 'auto');
  setSelectValue('formatSelect', 'auto');
  setSelectValue('lrcModeSelect', 'chars');
  setSelectValue('fpsSelect', '60');
  setSelectValue('alignSelect', 'center');
  setSelectValue('positionSelect', 'bottom');

  wireEvents();
  toggleMargin();
  syncBgControls();
  markOrientation('landscape');
  initScheme();
  loadSample('srt');
}

export function initApp() {
  init();
}
