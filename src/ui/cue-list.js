import * as Core from '../core/index.js';
import { $ } from './dom.js';

export function renderCueList(state, onSelect) {
  const list = $('cueList');
  list.textContent = '';
  const cues = state.parse ? state.parse.cues : [];
  const maxRows = 2000;
  const frag = document.createDocumentFragment();
  const rows = Math.min(cues.length, maxRows);
  for (let i = 0; i < rows; i++) {
    const cue = cues[i];
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cue-row';
    row.dataset.index = String(i);
    const time = document.createElement('span');
    time.className = 'cue-time';
    time.textContent = Core.formatTimecode(cue.startMs);
    const text = document.createElement('span');
    text.className = 'cue-text';
    text.textContent = cue.text.replace(/\n/g, ' / ');
    row.appendChild(time);
    row.appendChild(text);
    row.addEventListener('click', () => onSelect(i));
    frag.appendChild(row);
  }
  list.appendChild(frag);
  $('cueListHint').textContent = cues.length > maxRows
    ? '前 ' + maxRows + ' / ' + cues.length
    : '';
  state.selected = Math.max(0, Math.min(state.selected, cues.length - 1));
  updateSelectedUI(state);
}

export function updateSelectedUI(state) {
  const cues = state.parse ? state.parse.cues : [];
  const hasCues = cues.length > 0;
  const slider = $('cueSlider');
  const thumb = $('cueSliderThumb');
  const max = Math.max(0, cues.length - 1);
  if (slider) {
    slider.max = max;
    slider.disabled = !hasCues;
  }
  if (thumb) {
    thumb.value = Math.max(0, Math.min(state.selected, max));
    thumb.disabled = !hasCues;
  }
  $('prevBtn').disabled = state.selected <= 0 || !hasCues;
  $('nextBtn').disabled = state.selected >= cues.length - 1 || !hasCues;
  const rows = $('cueList').querySelectorAll('.cue-row');
  for (const row of rows) {
    row.classList.toggle('active', Number(row.dataset.index) === state.selected);
  }
  const active = $('cueList').querySelector('.cue-row.active');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
}
