'use strict';
/*
 * Replay: carrega capturas locais (data/snapshots-*.jsonl) para o Supabase.
 * Útil para levar ao banco o que foi capturado em DRY-RUN.
 *
 *   node src/ingestor/replay.js                 # todos os snapshots-*.jsonl em data/
 *   node src/ingestor/replay.js data/x.jsonl    # arquivos específicos
 */
const fs = require('fs');
const path = require('path');

(function loadEnv() {
  try {
    const p = path.join(process.cwd(), '.env');
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) {}
})();

const CONFIG = require('./config');
const SB = require('./supabase');
const { buildSampleRows } = require('./transform');

async function main() {
  if (!CONFIG.SUPABASE_ENABLED) { console.error('Configure SUPABASE_URL/KEY no .env antes do replay.'); process.exit(1); }
  const dir = path.join(process.cwd(), CONFIG.DATA_DIR);
  const args = process.argv.slice(2);
  const files = args.length ? args
    : fs.readdirSync(dir).filter((f) => /^snapshots-.*\.jsonl$/.test(f)).map((f) => path.join(dir, f));
  if (!files.length) { console.error('Nenhum arquivo snapshots-*.jsonl encontrado em', dir); process.exit(1); }

  let recs = 0, samples = 0, laps = 0, skipped = 0;
  const compCache = new Map();
  const sessCache = new Map(); // uid -> sessionId (upsert 1x por evento)
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      let rec; try { rec = JSON.parse(line); } catch (e) { skipped++; continue; }
      const meta = rec.meta, snap = rec.snap;
      if (!meta || !snap || !meta.mylaptime_uid) { skipped++; continue; }
      let sessionId = sessCache.get(meta.mylaptime_uid);
      if (!sessionId) { sessionId = await SB.upsertSession(meta); if (sessionId) sessCache.set(meta.mylaptime_uid, sessionId); }
      if (!sessionId) { skipped++; continue; }
      if (recs % 100 === 0) process.stdout.write(`\r  enviando… ${recs} registros`);
      const compIds = {};
      for (const c of snap.competitors) {
        if (c.number == null) continue;
        const key = sessionId + '::' + c.number;
        let cid = compCache.get(key);
        if (!cid) { cid = await SB.upsertCompetitor(sessionId, c, false); if (cid) compCache.set(key, cid); }
        if (cid) compIds[c.number] = cid;
      }
      const built = buildSampleRows(sessionId, snap, compIds);
      await SB.insertSamples(built.samples);
      await SB.upsertLaps(built.laps);
      recs++; samples += built.samples.length; laps += built.laps.length;
    }
  }
  console.log(`replay concluído: ${recs} registros, ${samples} samples, ${laps} laps enviados ao Supabase (${skipped} ignorados).`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
