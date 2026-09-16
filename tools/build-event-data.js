'use strict';
/*
 * Extrai UM evento (o snapshot mais completo que casa com o filtro) do buffer local
 * e gera data/event-data.js (window.EV = {...}) para o dashboard focado.
 *   node tools/build-event-data.js FKI
 */
const fs = require('fs'), path = require('path');
const filter = (process.argv[2] || 'FKI').toLowerCase();
const dir = path.join(process.cwd(), 'data');
const files = fs.readdirSync(dir).filter((f) => /^snapshots-.*\.jsonl$/.test(f)).map((f) => path.join(dir, f));

// ATENÇÃO: mylaptime_uid = GUID da PISTA/empresa, não da bateria. Todas as baterias do
// FKI compartilham o mesmo uid. Então agrupamos pela BATERIA (nome), não pelo uid.
const nameOf = (m) => String(m.name || '').split('\n').map((s) => s.trim()).filter(Boolean)
  .find((p) => !/^(corrida|race|tomada de tempo|classificat)/i.test(p))
  || String(m.name || '').trim() || '?';
const byBateria = {};
for (const file of files) {
  for (const line of fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
    let r; try { r = JSON.parse(line); } catch (e) { continue; }
    const hay = ((r.meta.track || '') + ' ' + (r.meta.name || '')).toLowerCase();
    if (!hay.includes(filter)) continue;
    const key = nameOf(r.meta);
    const laps = r.snap.competitors.reduce((s, c) => s + ((c.lapHistory && c.lapHistory.length) || 0), 0);
    const g = byBateria[key] || (byBateria[key] = { latestAt: 0, laps: -1, rec: null });
    g.latestAt = Math.max(g.latestAt, r.at || 0);
    if (laps >= g.laps) { g.laps = laps; g.rec = r; }   // snapshot mais completo dessa bateria
  }
}
const groups = Object.values(byBateria);
if (!groups.length) { console.error('nenhum evento casou com o filtro:', filter); process.exit(1); }
// escolhe a bateria vista mais recentemente (empate: mais voltas)
groups.sort((a, b) => (b.latestAt - a.latestAt) || (b.laps - a.laps));
const best = groups[0];

const r = best.rec;
const clean = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const track = clean(r.meta.track)[0] || '?';
const name = clean(r.meta.name).find((p) => !/^(corrida|race|tomada de tempo|classificat)/i.test(p)) || clean(r.meta.name)[0] || '?';

const drivers = r.snap.competitors.filter((c) => c.number != null).map((c) => {
  const laps = (c.lapHistory || []).filter((l) => l.n != null && l.ms != null)
    .map((l) => ({ n: l.n, ms: l.ms, pos: (l.pos != null ? l.pos : null) }))
    .sort((a, b) => a.n - b.n);
  const times = laps.map((l) => l.ms);
  const best = times.length ? Math.min(...times) : null;
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const sd = times.length > 1 ? Math.round(Math.sqrt(times.reduce((a, b) => a + (b - avg) * (b - avg), 0) / times.length)) : null;
  return { number: c.number, name: c.name || ('#' + c.number), pos: c.pos, lapCount: c.lapCount, best, avg, sd, laps };
}).sort((a, b) => (a.pos || 99) - (b.pos || 99));

const out = {
  generatedAt: new Date().toISOString(),
  event: { track, name, uid: r.meta.mylaptime_uid, capturedAt: r.at, raceClock: r.snap.raceClock, flag: r.snap.flag },
  drivers,
};
fs.writeFileSync(path.join(dir, 'event-data.json'), JSON.stringify(out));
fs.writeFileSync(path.join(dir, 'event-data.js'), 'window.EV=' + JSON.stringify(out) + ';');
const kb = (fs.statSync(path.join(dir, 'event-data.js')).size / 1024).toFixed(0);
console.log(`event-data: ${track} · ${name} · ${drivers.length} pilotos · ${best.laps} voltas · ${kb} KB`);
