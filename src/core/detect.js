export function detectFormat(fileName, text) {
  const ext = (/\.([a-z0-9]+)$/i.exec(String(fileName || '')) || [])[1];
  if (ext === 'lrc') return 'lrc';
  if (ext === 'srt') return 'srt';
  const s = String(text === undefined || text === null ? '' : text);
  if (s.includes('-->')) return 'srt';
  if (/^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(s)) return 'lrc';
  if (/^\s*\[(?:ti|ar|al|by|offset|length):/mi.test(s)) return 'lrc';
  return null;
}
