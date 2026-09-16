'use strict';
/*
 * Worker do ingestor: mantém UM navegador pareado vivo e, em ciclos, consome TODOS
 * os eventos ativos do mylaptime, gravando no Supabase (+ buffer local .jsonl).
 * Nunca dá reload (preserva o circuito Blazor/pareamento).
 */
const fs = require('fs');
const path = require('path');

// .env simples (sem dependência) — só se existir.
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
const { MyLapSession } = require('./mylaptime-session');
const { buildSampleRows, orderEvents } = require('./transform');
const { startStatusServer } = require('./status-server');

// Estado ao vivo exposto pelo servidor de status (se PORT setado).
const state = { paired: false, pairingCode: null, cycles: 0, activeEvents: 0, samples: 0, lastEvent: null, status: '—', updatedAt: Date.now() };

function log(...a) { console.log(new Date().toISOString(), ...a); }
function banner(msg) { const line = '='.repeat(Math.min(60, msg.length + 4)); console.log('\n' + line + '\n  ' + msg + '\n' + line + '\n'); }

const dataDir = path.join(process.cwd(), CONFIG.DATA_DIR);
function ensureDataDir() { try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {} }
function bufferSnapshot(rec) {
  try { ensureDataDir(); fs.appendFileSync(path.join(dataDir, `snapshots-${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify(rec) + '\n'); } catch (e) {}
}

const compIdCache = new Map(); // `${sessionId}::${number}` -> competitor id

async function persist(meta, snap) {
  bufferSnapshot({ at: Date.now(), meta, snap });
  if (!meta.mylaptime_uid) { log('  (sem GUID — só buffer local)'); return; }
  const sessionId = await SB.upsertSession(meta);
  if (!sessionId) return;
  // garante competidores e cacheia ids
  const compIds = {};
  for (const c of snap.competitors) {
    if (c.number == null) continue;
    const key = `${sessionId}::${c.number}`;
    let cid = compIdCache.get(key);
    if (!cid) { cid = await SB.upsertCompetitor(sessionId, c, false); if (cid) compIdCache.set(key, cid); }
    if (cid) compIds[c.number] = cid;
  }
  const { samples, laps } = buildSampleRows(sessionId, snap, compIds);
  await SB.insertSamples(samples);
  if (CONFIG.CAPTURE_LAPS) await SB.upsertLaps(laps);
  return { sessionId, samples: samples.length, laps: laps.length };
}

let staleStreak = 0;
async function healthCheck(session) {
  const h = await session.connectionHealth();
  if (h.reconnecting) { staleStreak++; log('  conexão: RECONECTANDO…'); await session.tryReconnect(); }
  else staleStreak = 0;
  state.status = h.reconnecting ? 'RECONECTANDO' : 'ok'; state.updatedAt = Date.now();
  if (staleStreak >= 5) banner('ATENÇÃO: circuito instável. Pode ser necessário re-parear/reiniciar o worker.');
}

async function cycle(session) {
  let live = await session.listEvents();
  if (CONFIG.EVENT_FILTER.length) {
    const flt = CONFIG.EVENT_FILTER.map((s) => s.toLowerCase());
    live = live.filter((e) => { const hay = ((e.track || '') + ' ' + (e.name || '')).toLowerCase(); return flt.some((f) => hay.includes(f)); });
  }
  const events = orderEvents(live, { priorityTracks: CONFIG.PRIORITY_TRACKS, maxPerCycle: CONFIG.MAX_EVENTS_PER_CYCLE });
  log(`ciclo: ${events.length} evento(s)` + (CONFIG.EVENT_FILTER.length ? ` [filtro: ${CONFIG.EVENT_FILTER.join(', ')}]` : ' ativo(s)'));
  state.cycles++; state.activeEvents = events.length; state.updatedAt = Date.now();
  const seenUids = [];
  for (const ev of events) {
    const res = await session.captureEvent(ev.index, { expandLaps: CONFIG.CAPTURE_LAPS, cleanMeta: { name: ev.name, track: ev.track, type: ev.type } }).catch(() => null);
    if (!res || !res.snapshot) { log(`  [${ev.index}] ${ev.track} — falhou ao abrir`); continue; }
    const nComp = res.snapshot.competitors.length;
    const saved = await persist(res.meta, res.snapshot).catch((e) => { log('  erro persist:', e.message); });
    if (res.meta.mylaptime_uid) seenUids.push(res.meta.mylaptime_uid);
    if (saved) state.samples += saved.samples;
    state.lastEvent = `${res.meta.track || ev.track} · ${res.meta.name || ev.name}`; state.updatedAt = Date.now();
    log(`  [${ev.index}] ${res.meta.track || ev.track} · ${res.meta.name || ev.name} · ${nComp} comp` + (saved ? ` · +${saved.samples}s/+${saved.laps}v` : ''));
    await session.page.waitForTimeout(CONFIG.BETWEEN_EVENTS_MS);
  }
  // reconciliação: fecha sessões ativas que sumiram da lista
  try { await SB.closeStaleSessions(seenUids); } catch (e) { log('  erro reconciliação:', e.message); }
  await healthCheck(session);
}

async function main() {
  banner('EnduroKart · Ingestor mylaptime');
  log('Supabase:', CONFIG.SUPABASE_ENABLED ? CONFIG.SUPABASE_URL : 'DRY-RUN (sem gravar)');
  log('Prioridade:', CONFIG.PRIORITY_TRACKS.join(', ') || '(nenhuma)', '| laps:', CONFIG.CAPTURE_LAPS);

  const session = new MyLapSession();
  await session.launch();

  if (CONFIG.PORT) startStatusServer(CONFIG.PORT, () => state, () => session.screenshotQR());

  banner('PAREAMENTO — abra o app MyLapTime (Carreira) e escaneie/cole o código abaixo'
    + (CONFIG.PORT ? ` · ou abra http://localhost:${CONFIG.PORT}` : ''));
  const paired = await session.waitForPairing((code) => {
    banner('CÓDIGO DE PAREAMENTO: ' + code);
    state.pairingCode = code; state.updatedAt = Date.now();
    try { ensureDataDir(); fs.writeFileSync(path.join(dataDir, CONFIG.PAIRING_CODE_FILE), code + '\n'); } catch (e) {}
  });
  if (!paired) { banner('Não pareado a tempo. Encerrando. (Ajuste PAIRING_WAIT_MS e rode de novo.)'); await session.close(); process.exit(1); }

  state.paired = true; state.updatedAt = Date.now();
  banner('Pareado. Iniciando captura contínua. Ctrl+C para parar.');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; log('encerrando…'); await session.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);

  // loop contínuo (rodízio). LIST_REFRESH_MS controla o intervalo mínimo entre ciclos.
  while (!stopping) {
    const t0 = Date.now();
    try { await cycle(session); } catch (e) { log('erro no ciclo:', e.message); }
    const elapsed = Date.now() - t0;
    const wait = Math.max(0, CONFIG.LIST_REFRESH_MS - elapsed);
    if (wait) await session.page.waitForTimeout(wait);
  }
}

// Só roda o worker quando executado diretamente (permite require em testes/tools).
if (require.main === module) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
