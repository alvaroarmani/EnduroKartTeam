'use strict';
/*
 * Inteligência de ritmo POR KART (o número do mylaptime = nº do kart físico).
 * Lê os snapshots capturados e produz, por PISTA × KART, o RITMO RELATIVO ao grid
 * (mediana do kart ÷ mediana do grid na sessão) — isso isola a velocidade do kart
 * das condições do dia e, agregando muitas sessões (pilotos diferentes), do piloto.
 *
 *   node tools/kart-pace.js [filtroPista]      # ex.: camburi
 * Gera data/kart-pace.json (consumido pela aba Karts) e imprime o ranking.
 *
 * No dia da prova: sorteou o kart X -> olha o ritmo relativo dele aqui.
 */
const fs = require('fs');
const path = require('path');

const filter = (process.argv[2] || '').toLowerCase();
const dir = path.join(process.cwd(), 'data');
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => /^snapshots-.*\.jsonl$/.test(f)).map((f) => path.join(dir, f))
  : [];

const median = (arr) => {
  const s = arr.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
// ritmo verde de uma lista de voltas (mediana das limpas: descarta box/tráfego)
function greenMs(lapMsList) {
  const v = lapMsList.filter((x) => x > 8000 && x < 600000);
  if (!v.length) return null;
  const raw = median(v);
  const clean = v.filter((x) => x <= raw * 1.3);
  return median(clean.length ? clean : v);
}
const clean = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const nameOf = (m) => clean(m.name).find((p) => !/^(corrida|race|tomada|classif|treino)/i.test(p)) || clean(m.name)[0] || '?';
const trackOf = (m) => clean(m.track)[0] || '?';

// 1) agrupa por SESSÃO (pista+bateria), guardando o snapshot mais completo.
const bySession = new Map();
for (const file of files) {
  for (const line of fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean)) {
    let r; try { r = JSON.parse(line); } catch (e) { continue; }
    const track = trackOf(r.meta);
    if (filter && !((track + ' ' + (r.meta.name || '')).toLowerCase().includes(filter))) continue;
    const key = track + ' :: ' + nameOf(r.meta);
    const laps = (r.snap.competitors || []).reduce((s, c) => s + ((c.lapHistory && c.lapHistory.length) || 0), 0);
    const prev = bySession.get(key);
    if (!prev || laps >= prev.laps) bySession.set(key, { track, rec: r, laps });
  }
}

// 2) por sessão: mediana de cada kart + mediana do grid -> ritmo relativo do kart.
// 3) agrega por (pista, kart) ao longo das sessões.
const agg = new Map(); // `${track}::${number}` -> { track, number, rels:[], laps, sessions }
for (const { track, rec } of bySession.values()) {
  const perKart = [];
  for (const c of rec.snap.competitors || []) {
    if (c.number == null) continue;
    const times = (c.lapHistory || []).map((l) => l.ms).filter((x) => x != null);
    const g = greenMs(times);
    if (g) perKart.push({ number: String(c.number), green: g, laps: times.length });
  }
  const fieldMedian = median(perKart.map((k) => k.green));
  if (!fieldMedian) continue;
  for (const k of perKart) {
    const rel = k.green / fieldMedian; // <1 = mais rápido que o grid; >1 = mais lento
    const key = track + '::' + k.number;
    const a = agg.get(key) || { track, number: k.number, rels: [], laps: 0, sessions: 0 };
    a.rels.push(rel); a.laps += k.laps; a.sessions += 1;
    agg.set(key, a);
  }
}

const byKart = [...agg.values()].map((a) => ({
  track: a.track, number: a.number,
  relPace: Number(median(a.rels.map((r) => Math.round(r * 1000))) / 1000), // mediana do relativo
  sessions: a.sessions, laps: a.laps,
})).sort((a, b) => a.relPace - b.relPace);

const out = { generatedAt: new Date().toISOString(), filter: filter || null, sessions: bySession.size, byKart };
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'kart-pace.json'), JSON.stringify(out));
try { fs.mkdirSync(path.join(process.cwd(), 'web', 'public'), { recursive: true }); fs.writeFileSync(path.join(process.cwd(), 'web', 'public', 'kart-pace.json'), JSON.stringify(out)); } catch (e) {}

console.log(`sessões: ${bySession.size} · karts: ${byKart.length}` + (filter ? ` [pista ~ ${filter}]` : ''));
for (const k of byKart.slice(0, 12)) {
  const pct = ((k.relPace - 1) * 100);
  const tag = pct <= -0.5 ? 'RÁPIDO' : pct >= 1.5 ? 'LENTO' : 'médio';
  console.log(`  #${String(k.number).padEnd(3)} ${(pct >= 0 ? '+' : '') + pct.toFixed(1)}%  ${tag.padEnd(7)} (${k.sessions} sessões, ${k.laps} voltas) · ${k.track}`);
}
