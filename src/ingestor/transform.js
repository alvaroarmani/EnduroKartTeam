'use strict';
/*
 * Transformações puras (sem navegador, sem rede) — testáveis isoladamente.
 */

// Monta as linhas de competitor_samples e laps a partir de um snapshot do extractor.
function buildSampleRows(sessionId, snap, compIds) {
  const iso = new Date(snap.scrapedAt).toISOString();
  const samples = [];
  const lapMap = new Map(); // dedupe (competitor_id, lap_number) dentro do lote
  const seenSample = new Set(); // dedupe (competitor_id) por snapshot
  for (const c of snap.competitors) {
    if (c.number == null) continue;
    const cid = compIds[c.number]; if (!cid) continue;
    if (!seenSample.has(cid)) {
      seenSample.add(cid);
      samples.push({
        session_id: sessionId, competitor_id: cid, captured_at: iso,
        race_clock_ms: snap.raceClock && snap.raceClock.ms, pos: c.pos,
        lap_count: c.lapCount, last_lap_ms: c.lastLapTime && c.lastLapTime.ms,
        best_lap_ms: c.bestLapTime && c.bestLapTime.ms, best_lap_num: c.bestLapNum,
        diff_ms: c.diff.ms != null ? c.diff.ms : null, diff_laps: c.diff.laps != null ? c.diff.laps : null, diff_raw: c.diff.raw,
        gap_ms: c.gap.ms != null ? c.gap.ms : null, gap_laps: c.gap.laps != null ? c.gap.laps : null, gap_raw: c.gap.raw,
        state: c.state, flag: snap.flag && snap.flag.state,
      });
    }
    (c.lapHistory || []).forEach((l) => {
      if (l.n == null) return;
      lapMap.set(cid + ':' + l.n, { session_id: sessionId, competitor_id: cid, lap_number: l.n, lap_ms: l.ms, lap_text: l.timeText });
    });
  }
  return { samples, laps: [...lapMap.values()] };
}

// Ordena eventos priorizando pistas escolhidas; limita por ciclo se maxPerCycle>0.
function orderEvents(events, { priorityTracks = [], maxPerCycle = 0 } = {}) {
  const prio = priorityTracks.map((s) => String(s).toLowerCase());
  const score = (e) => { const hay = ((e.track || '') + ' ' + (e.name || '')).toLowerCase(); return prio.some((p) => hay.includes(p)) ? 0 : 1; };
  const sorted = events.slice().sort((a, b) => score(a) - score(b));
  return maxPerCycle > 0 ? sorted.slice(0, maxPerCycle) : sorted;
}

module.exports = { buildSampleRows, orderEvents };
