'use strict';
/*
 * Processa data/snapshots-*.jsonl em um JSON compacto para o dashboard visual.
 * Saída: data/viz-data.json
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(process.cwd(), 'data');
const files = fs.readdirSync(dir).filter((f) => /^snapshots-.*\.jsonl$/.test(f)).map((f) => path.join(dir, f));

function cleanName(m) {
  const parts = String(m.name || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return parts.find((p) => !/^(corrida|race|tomada de tempo|classificat)/i.test(p)) || parts[0] || '?';
}
function cleanTrack(m) {
  return String(m.track || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '?';
}

const ev = {}; // uid -> { meta, readingIndex, comps }
for (const file of files) {
  for (const line of fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
    let r; try { r = JSON.parse(line); } catch (e) { continue; }
    const u = r.meta.mylaptime_uid; if (!u) continue;
    const E = ev[u] || (ev[u] = { uid: u, name: cleanName(r.meta), track: cleanTrack(r.meta), idx: 0, comps: {} });
    const i = E.idx++;
    for (const c of r.snap.competitors) {
      if (c.number == null) continue;
      const C = E.comps[c.number] || (E.comps[c.number] = { number: c.number, name: c.name || ('#' + c.number), best: null, lastLap: null, laps: 0, series: [] });
      const best = c.bestLapTime && c.bestLapTime.ms;
      if (best && (C.best == null || best < C.best)) C.best = best;
      if (c.lastLapTime && c.lastLapTime.ms) C.lastLap = c.lastLapTime.ms;
      if (c.lapCount != null) C.laps = c.lapCount;
      C.series.push({ i, pos: c.pos, last: c.lastLapTime && c.lastLapTime.ms });
    }
  }
}

function downsample(series, max) {
  if (series.length <= max) return series;
  const step = Math.ceil(series.length / max);
  return series.filter((_, k) => k % step === 0);
}

const events = [];
for (const u in ev) {
  const E = ev[u];
  const comps = Object.values(E.comps);
  const nComp = comps.length;
  const readings = E.idx;
  // melhor volta global do evento (para escala)
  const bests = comps.map((c) => c.best).filter((x) => x != null && x > 3000); // >3s (ignora ruído)
  const eventBest = bests.length ? Math.min(...bests) : null;
  // top competidores por nº de voltas (mais ativos) para os gráficos de série
  const top = comps.slice().sort((a, b) => (b.laps || 0) - (a.laps || 0)).slice(0, 12)
    .map((c) => ({ number: c.number, name: c.name, best: c.best, laps: c.laps, series: downsample(c.series, 60) }));
  events.push({ uid: u, name: E.name, track: E.track, readings, nComp, eventBest, top });
}
events.sort((a, b) => b.readings - a.readings);

const out = {
  generatedAt: new Date().toISOString(),
  totals: {
    events: events.length,
    readings: events.reduce((s, e) => s + e.readings, 0),
    samples: events.reduce((s, e) => s + e.nComp * 0 + e.readings, 0), // placeholder
  },
  chartable: events.filter((e) => e.nComp >= 3 && e.readings >= 15).map((e) => e.uid),
  events,
};
// contagem real de amostras
out.totals.samples = events.reduce((s, e) => s + e.top.reduce((a, c) => a + c.series.length, 0), 0);

const outPath = path.join(dir, 'viz-data.json');
fs.writeFileSync(outPath, JSON.stringify(out));
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`viz-data.json: ${events.length} eventos, ${out.chartable.length} com gráfico, ${kb} KB`);
