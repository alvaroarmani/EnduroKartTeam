/*
 * Testes das transformações puras do ingestor (sem navegador/rede).
 * Rodar:  node test/ingestor.test.js
 */
const { buildSampleRows, orderEvents } = require('../src/ingestor/transform.js');

let pass = 0, fail = 0;
function ok(label, cond, extra) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); } }
function eq(label, got, want) { ok(label, JSON.stringify(got) === JSON.stringify(want), `obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`); }

// --- buildSampleRows ---
const snap = {
  scrapedAt: 1700000000000,
  raceClock: { text: '1:32:10.284', ms: 5530284 },
  flag: { state: 'green', raw: null },
  competitors: [
    {
      pos: 1, number: '7', name: 'EQUIPE LEKT', state: 'PISTA', category: 'INDOOR',
      lapHistory: [{ n: 40, timeText: '45.203', ms: 45203 }, { n: 39, timeText: '44.998', ms: 44998 }],
      bestLapNum: 18, bestLapTime: { text: '44.812', ms: 44812 }, lapCount: 41,
      lastLapTime: { text: '45.203', ms: 45203 }, diff: { raw: '---', type: 'none' }, gap: { raw: '---', type: 'none' },
    },
    {
      pos: 2, number: '3', name: 'RIVAL', state: 'BOX', category: 'INDOOR', lapHistory: [],
      bestLapNum: 20, bestLapTime: { text: '44.955', ms: 44955 }, lapCount: 41,
      lastLapTime: { text: '45.610', ms: 45610 },
      diff: { raw: '+2.317', type: 'time', ms: 2317 }, gap: { raw: '+1 volta', type: 'laps', laps: 1 },
    },
    { pos: 3, number: null, name: 'sem número', lapHistory: [], diff: { raw: null, type: 'none' }, gap: { raw: null, type: 'none' } },
  ],
};
const compIds = { '7': 'cid-7', '3': 'cid-3' };
const { samples, laps } = buildSampleRows('sess-1', snap, compIds);

eq('2 samples (ignora sem número)', samples.length, 2);
eq('2 laps (só do #7)', laps.length, 2);
eq('sample#7 lap_count', samples[0].lap_count, 41);
eq('sample#7 last_lap_ms', samples[0].last_lap_ms, 45203);
eq('sample#7 flag', samples[0].flag, 'green');
eq('sample#7 race_clock_ms', samples[0].race_clock_ms, 5530284);
eq('sample#3 diff_ms', samples[1].diff_ms, 2317);
eq('sample#3 gap_laps', samples[1].gap_laps, 1);
eq('sample#3 gap_ms null', samples[1].gap_ms, null);
eq('lap[0] number', laps[0].lap_number, 40);
eq('lap[0] competitor', laps[0].competitor_id, 'cid-7');
eq('captured_at ISO', samples[0].captured_at, new Date(1700000000000).toISOString());

// --- orderEvents ---
const events = [
  { index: 0, track: 'ARENA SPEED', name: 'Corrida' },
  { index: 1, track: 'FKI Linhares', name: 'Bateria 1' },
  { index: 2, track: 'KART POINT', name: 'Corrida' },
];
const ordered = orderEvents(events, { priorityTracks: ['FKI', 'Linhares'] });
eq('prioriza FKI no topo', ordered[0].index, 1);
eq('mantém os demais', ordered.length, 3);
const limited = orderEvents(events, { priorityTracks: ['FKI'], maxPerCycle: 2 });
eq('limita por ciclo', limited.length, 2);
eq('limite mantém prioridade', limited[0].index, 1);

console.log(`\n${fail ? '✗' : '✓'} ingestor.test.js — ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
