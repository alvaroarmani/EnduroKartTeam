/*
 * Estado de corrida derivado do relógio + config (compartilhado por cockpit/timeline).
 * Prioriza o relógio do FEED (autoridade); cai pro relógio manual do watchdog se não houver.
 */
export function elapsedFrom(data, st) {
  const feed = data?.event?.raceClock?.ms;
  if (feed != null) return feed / 1000;
  return st.running && st.startedAt ? st.pausedElapsed + (Date.now() - st.startedAt) / 1000 : (st.pausedElapsed || 0);
}

/* Janela do box e folga anti-DQ para um kart com `pending` paradas a cumprir. */
export function boxState(st, elapsedSec, pending) {
  const durationSec = st.durationMin * 60;
  const boxOpenSec = st.boxOpenMin * 60;
  const boxCloseSec = durationSec - st.boxCloseBeforeEndMin * 60; // instante em que o box fecha
  const timeToBoxClose = boxCloseSec - elapsedSec;
  const required = pending * st.stopCycleSec;         // tempo mínimo p/ cumprir as restantes
  const folga = timeToBoxClose - required;            // margem anti-DQ
  // prazo-limite da PRÓXIMA parada mantendo espaçamento das demais (metrônomo)
  const nextDeadlineSec = boxCloseSec - Math.max(0, pending - 1) * st.stopCycleSec;
  const open = elapsedSec >= boxOpenSec && elapsedSec <= boxCloseSec;
  return {
    durationSec, boxOpenSec, boxCloseSec, timeToBoxClose, required, folga,
    timeToOpen: boxOpenSec - elapsedSec,
    nextDeadlineSec, timeToNextDeadline: nextDeadlineSec - elapsedSec, open,
    closed: elapsedSec > boxCloseSec,
    level: pending <= 0 ? 'done' : folga < 120 ? 'crit' : folga < 300 ? 'warn' : 'ok',
  };
}

export function fmtClock(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const neg = sec < 0; sec = Math.abs(Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const str = (h ? h + ':' : '') + (h ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  return (neg ? '−' : '') + str;
}
