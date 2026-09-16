'use strict';
/*
 * Cliente REST de escrita no Supabase (PostgREST). Usa fetch nativo (Node >=18).
 * Sem SUPABASE_URL/KEY, opera em DRY-RUN: não grava, só devolve ids sintéticos e loga.
 */
const CONFIG = require('./config');

function headers(extraPrefer) {
  const h = {
    'apikey': CONFIG.SUPABASE_KEY,
    'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
    'Content-Type': 'application/json',
  };
  if (extraPrefer) h['Prefer'] = extraPrefer;
  return h;
}

async function rest(method, path, body, prefer) {
  const url = CONFIG.SUPABASE_URL.replace(/\/$/, '') + path;
  const res = await fetch(url, { method, headers: headers(prefer), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status} ${method} ${path}: ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
}

// --- Sessões ---------------------------------------------------------------

// Upsert por mylaptime_uid; devolve o id da sessão.
async function upsertSession(meta) {
  if (!CONFIG.SUPABASE_ENABLED) return 'dry-' + (meta.mylaptime_uid || meta.name || Math.random());
  const row = {
    mylaptime_uid: meta.mylaptime_uid,
    name: meta.name || null,
    track: meta.track || null,
    event_type: meta.event_type || 'unknown',
    status: 'active',
    last_seen_at: new Date().toISOString(),
  };
  const rows = await rest('POST', '/rest/v1/sessions?on_conflict=mylaptime_uid', [row],
    'return=representation,resolution=merge-duplicates');
  return rows && rows[0] && rows[0].id;
}

async function touchSession(uid) {
  if (!CONFIG.SUPABASE_ENABLED || !uid) return;
  await rest('PATCH', `/rest/v1/sessions?mylaptime_uid=eq.${encodeURIComponent(uid)}`,
    { last_seen_at: new Date().toISOString(), status: 'active' }, 'return=minimal');
}

// Marca como 'closed' as sessões ativas cujo GUID não está mais na lista de ativos.
async function closeStaleSessions(activeUids) {
  if (!CONFIG.SUPABASE_ENABLED) return;
  const list = (activeUids || []).filter(Boolean);
  const notIn = list.length ? `&mylaptime_uid=not.in.(${list.map((u) => `"${u}"`).join(',')})` : '';
  await rest('PATCH', `/rest/v1/sessions?status=eq.active${notIn}`,
    { status: 'closed', closed_at: new Date().toISOString() }, 'return=minimal');
}

// --- Competidores ----------------------------------------------------------

async function upsertCompetitor(sessionId, c, isTeam) {
  if (!CONFIG.SUPABASE_ENABLED) return 'dry-comp-' + sessionId + '-' + c.number;
  const rows = await rest('POST', '/rest/v1/competitors?on_conflict=session_id,number',
    [{ session_id: sessionId, number: c.number, name: c.name, category: c.category, is_team: !!isTeam }],
    'return=representation,resolution=merge-duplicates');
  return rows && rows[0] && rows[0].id;
}

// --- Samples / Laps --------------------------------------------------------

async function insertSamples(rows) {
  if (!rows.length) return;
  if (!CONFIG.SUPABASE_ENABLED) return;
  // upsert idempotente por (competitor_id, captured_at) — exige o índice único (schema.sql)
  await rest('POST', '/rest/v1/competitor_samples?on_conflict=competitor_id,captured_at', rows,
    'return=minimal,resolution=merge-duplicates');
}

async function upsertLaps(rows) {
  if (!rows.length) return;
  if (!CONFIG.SUPABASE_ENABLED) return;
  await rest('POST', '/rest/v1/laps?on_conflict=competitor_id,lap_number', rows,
    'return=minimal,resolution=merge-duplicates');
}

module.exports = {
  rest, upsertSession, touchSession, closeStaleSessions,
  upsertCompetitor, insertSamples, upsertLaps,
};
