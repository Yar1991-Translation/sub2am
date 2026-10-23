export const $ = (id) => document.getElementById(id);

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

export function setStatus(text, kind) {
  const el = $('status');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

export function showSnackbar(message) {
  const bar = $('snackbar');
  if (!bar || !message) return;
  bar.textContent = message;
  bar.open = false;
  requestAnimationFrame(() => {
    bar.open = true;
  });
}
