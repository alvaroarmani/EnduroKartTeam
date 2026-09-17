// Formata milissegundos em "SS.mmm" ou "M:SS.mmm".
export function fmt(ms) {
  if (ms == null) return '—';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m ? m + ':' + (r < 10 ? '0' : '') + r.toFixed(3) : r.toFixed(3);
}

// Cores de série (via CSS custom properties, para respeitar o tema).
export const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
export const col = (i) => `var(${SERIES[i % SERIES.length]})`;
