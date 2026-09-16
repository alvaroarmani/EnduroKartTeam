// ==UserScript==
// @name         EnduroKart · Extrator mylaptime
// @namespace    endurokart
// @version      0.1.0
// @description  Extrai a cronometragem ao vivo do mylaptime (LiveTime), com resiliência de conexão, buffer local e gravação no Supabase. Uso da equipe FDK 100 Milhas.
// @match        https://mylaptime.com.br/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      supabase.co
// ==/UserScript==
/*
 * COMO USAR
 *   1. Instale o Tampermonkey (extensão do navegador).
 *   2. Crie um novo script e cole este arquivo.
 *   3. Preencha CONFIG abaixo (Supabase e os karts da equipe). Sem Supabase, roda
 *      em modo offline (buffer local + botão Exportar JSON no HUD).
 *   4. Abra o mylaptime, entre num evento (LiveTime → evento → Assistir) e clique
 *      "Iniciar" no HUD.
 *
 * O núcleo de extração é espelho de src/extractor/mylaptime-extractor.js (testado).
 */
(function () {
  'use strict';

  // ===========================================================================
  // CONFIG — PREENCHA
  // ===========================================================================
  const CONFIG = {
    // Supabase (deixe vazio para modo offline). Ver docs/BANCO-DE-DADOS.md.
    SUPABASE_URL: '',            // ex.: 'https://xxxx.supabase.co'
    SUPABASE_ANON_KEY: '',       // chave anon (pública)

    // Karts da SUA equipe (para marcar is_team). Casa por número OU substring do nome.
    TEAM: { numbers: [], names: [] },   // ex.: numbers:[7,12], names:['LEKT']

    CAPTURE_INTERVAL_MS: 4000,   // cadência de leitura
    STALE_SECONDS: 15,           // relógio parado > isto => assume desconexão
    RELOAD_AFTER_FAILS: 4,       // reconexões falhas seguidas => reload
    AUTO_EXPAND_TEAM: true,      // expande as linhas da equipe p/ ler o histórico
    SET_PAGE_SIZE_100: true,     // paginação de voltas em 100
    CAPTURE_ALL_COMPETITORS: true, // false = grava só os karts da equipe
  };

  // ===========================================================================
  // NÚCLEO DE EXTRAÇÃO (espelho de mylaptime-extractor.js — manter em sincronia)
  // ===========================================================================
  const X = (function () {
    function parseTimeToMs(str) {
      if (str == null) return null;
      const s = String(str).trim().replace(',', '.');
      if (!s || /^-+$/.test(s)) return null;
      const parts = s.split(':');
      if (parts.length > 3 || !parts.every((p) => /^\d{1,2}(?:\.\d{1,3})?$/.test(p))) return null;
      let hr = 0, min = 0, sec = 0;
      if (parts.length === 1) sec = parseFloat(parts[0]);
      else if (parts.length === 2) { min = +parts[0]; sec = parseFloat(parts[1]); }
      else { hr = +parts[0]; min = +parts[1]; sec = parseFloat(parts[2]); }
      return Math.round(((hr * 60 + min) * 60 + sec) * 1000);
    }
    function parseGap(str) {
      if (str == null) return { raw: null, type: 'none' };
      const raw = String(str).trim();
      if (!raw || /^-+$/.test(raw)) return { raw, type: 'none' };
      const lap = raw.match(/([+-]?\d+)\s*voltas?/i);
      if (lap) return { raw, type: 'laps', laps: parseInt(lap[1], 10) };
      const ms = parseTimeToMs(raw.replace(/^\+/, ''));
      if (ms != null) return { raw, type: 'time', ms };
      return { raw, type: 'other' };
    }
    function toInt(str) { if (str == null) return null; const m = String(str).replace(/[^\d-]/g, ''); return m === '' ? null : parseInt(m, 10); }
    function text(el) { return el ? (el.textContent || '').trim() : null; }
    function getRaceClock(root) { const el = (root || document).querySelector('.lt-timer-value'); const t = text(el); return { text: t, ms: parseTimeToMs(t) }; }
    function colorToFlagState(str) {
      if (!str) return null; let r, g, b;
      const hex = str.match(/#([0-9a-f]{6})/i); const rgb = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (hex) { r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16); }
      else if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; } else return null;
      if (r > 180 && g > 150 && b < 120) return 'yellow';
      if (r > 140 && r > g + 50 && r > b + 50) return 'red';
      if (g > 110 && g > r + 20 && g > b + 20) return 'green';
      if (r > 200 && g > 200 && b > 200) return 'white';
      return null;
    }
    function getFlag(root) {
      const scope = root || document;
      const container = scope.querySelector('.lt-timer-flag') || scope.querySelector('.lt-racing-flag-icon');
      if (!container) return { state: 'unknown', raw: null };
      const icon = container.querySelector('.lt-racing-flag-icon, i, svg') || container;
      const clsOf = (el) => (el.className && el.className.baseVal != null) ? el.className.baseVal : String(el.className || '');
      const hay = [clsOf(container), clsOf(icon), container.getAttribute('style') || '', icon.getAttribute('style') || '', icon.getAttribute('fill') || ''].join(' ').toLowerCase();
      let state = 'unknown';
      if (/\b(red|vermelh)/.test(hay)) state = 'red';
      else if (/\b(yellow|amarel)/.test(hay)) state = 'yellow';
      else if (/\b(green|verde)/.test(hay)) state = 'green';
      else if (/\b(checker|xadrez|finish|final|bandeirada)/.test(hay)) state = 'checkered';
      else state = colorToFlagState(hay) || 'unknown';
      return { state, raw: (clsOf(icon) || icon.getAttribute('style') || null) };
    }
    function readMobileStats(row) { const out = {}; row.querySelectorAll('.lt-mobile-stat').forEach((s) => { const label = text(s.querySelector('.lt-stat-label')); const value = text(s.querySelector('.lt-stat-value')); if (label) out[label.toUpperCase().replace(/\s+/g, '')] = value; }); return out; }
    function getHeaderLabels(root) { return [...(root || document).querySelectorAll('.lt-table-header .lt-th-center')].filter((h) => !h.classList.contains('lt-column-hidden')).map((h) => text(h)); }
    function readDesktopStats(row, headerLabels) { const out = {}; const cells = [...row.querySelectorAll('.lt-row-desktop .lt-data-cell')].filter((c) => !c.classList.contains('lt-data-cell--pos') && !c.classList.contains('lt-data-cell--driver')); cells.forEach((c, i) => { const label = headerLabels[i]; if (label) out[label.toUpperCase().replace(/\s+/g, '')] = text(c); }); return out; }
    function readLaps(row) {
      const panel = row.querySelector('.lt-expansion-panel'); if (!panel) return [];
      if (panel.querySelector('.lt-expansion-empty')) return [];
      const laps = []; const lines = panel.querySelectorAll('.lt-lap-row, .lt-passage-row, [class*="lap"], tr, li');
      const scan = lines.length ? lines : panel.children;
      [...scan].forEach((line) => { const t = (line.textContent || '').trim(); if (!t) return; const timeTok = t.match(/(?:\d+:)?\d{1,2}[.:]\d{1,3}/); const numTok = t.match(/^\s*(\d+)/); if (timeTok) laps.push({ n: numTok ? parseInt(numTok[1], 10) : laps.length + 1, timeText: timeTok[0], ms: parseTimeToMs(timeTok[0]) }); });
      return laps;
    }
    function mkTime(str) { return { text: str, ms: parseTimeToMs(str) }; }
    function normalizeCompetitor(stats) { const g = (k) => (k in stats ? stats[k] : null); return { bestLapNum: toInt(g('M.V') || g('MV')), bestLapTime: mkTime(g('T.M.V') || g('TMV')), lapCount: toInt(g('LAP')), lastLapTime: mkTime(g('T.U.V') || g('TUV')), diff: parseGap(g('DIFF')), gap: parseGap(g('GAP')), _rawStats: stats }; }
    function getCompetitors(root) {
      const scope = root || document; const headerLabels = getHeaderLabels(scope);
      return [...scope.querySelectorAll('.lt-competitor-row')].map((row, idx) => {
        let stats = readMobileStats(row); if (Object.keys(stats).length === 0) stats = readDesktopStats(row, headerLabels);
        const numRaw = text(row.querySelector('.lt-driver-number')); const catRaw = text(row.querySelector('.lt-driver-category'));
        return Object.assign({ pos: toInt(text(row.querySelector('.lt-pos-badge'))) ?? (idx + 1), number: numRaw ? numRaw.replace(/^#/, '') : null, name: text(row.querySelector('.lt-driver-name')), state: text(row.querySelector('.lt-driver-state')) || null, category: catRaw ? catRaw.replace(/^categoria:?\s*/i, '') : null, lapHistory: readLaps(row) }, normalizeCompetitor(stats));
      });
    }
    function extractAll(root) { const scope = root || document; return { scrapedAt: Date.now(), raceClock: getRaceClock(scope), flag: getFlag(scope), competitors: getCompetitors(scope) }; }
    return { parseTimeToMs, parseGap, getFlag, extractAll };
  })();

  // ===========================================================================
  // Estado da sessão / metadados do evento
  // ===========================================================================
  function decodeUid() { try { return atob(localStorage.getItem('company_livetime_selected') || '') || null; } catch (e) { return null; } }
  function readSessionMeta() {
    const name = (document.querySelector('.lt-racing-info .lt-racing-type-name, .lt-event-name') || {}).textContent;
    const track = (document.querySelector('.lt-company-name, .lt-racing-info') || {}).textContent;
    const typeTxt = (document.body.textContent.match(/\b(RACE|Corrida|Tomada de Tempo|Classificat)/i) || [])[0] || '';
    let event_type = 'unknown';
    if (/race|corrida/i.test(typeTxt)) event_type = 'race';
    else if (/tomada/i.test(typeTxt)) event_type = 'practice';
    else if (/classificat/i.test(typeTxt)) event_type = 'quali';
    return { mylaptime_uid: decodeUid(), name: (name || '').trim() || null, track: (track || '').trim().slice(0, 80) || null, event_type };
  }

  function isTeam(c) {
    const nums = (CONFIG.TEAM.numbers || []).map(String);
    const names = (CONFIG.TEAM.names || []).map((n) => n.toLowerCase());
    if (c.number != null && nums.includes(String(c.number))) return true;
    if (c.name && names.some((n) => c.name.toLowerCase().includes(n))) return true;
    return false;
  }

  // ===========================================================================
  // Buffer local (IndexedDB) — fila de escritas resiliente a quedas
  // ===========================================================================
  const DB = (function () {
    const NAME = 'endurokart', STORE = 'queue'; let db = null;
    function open() { return new Promise((res, rej) => { const r = indexedDB.open(NAME, 1); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); }; r.onsuccess = () => { db = r.result; res(db); }; r.onerror = () => rej(r.error); }); }
    async function push(item) { if (!db) await open(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).add({ item, ts: Date.now() }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
    async function all() { if (!db) await open(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const rq = tx.objectStore(STORE).getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); }); }
    async function remove(ids) { if (!db) await open(); return new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); const s = tx.objectStore(STORE); ids.forEach((id) => s.delete(id)); tx.oncomplete = res; }); }
    async function count() { if (!db) await open(); return new Promise((res) => { const tx = db.transaction(STORE, 'readonly'); const rq = tx.objectStore(STORE).count(); rq.onsuccess = () => res(rq.result); }); }
    async function clear() { if (!db) await open(); return new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = res; }); }
    return { open, push, all, remove, count, clear };
  })();

  // ===========================================================================
  // Cliente Supabase (via GM_xmlhttpRequest p/ furar CSP da página)
  // ===========================================================================
  const SB = (function () {
    const enabled = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
    function req(method, path, body, prefer) {
      return new Promise((resolve, reject) => {
        const url = CONFIG.SUPABASE_URL.replace(/\/$/, '') + path;
        const headers = { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
        if (prefer) headers['Prefer'] = prefer;
        const done = (status, text) => { if (status >= 200 && status < 300) { try { resolve(text ? JSON.parse(text) : null); } catch (e) { resolve(null); } } else reject(new Error('SB ' + status + ': ' + text)); };
        if (typeof GM_xmlhttpRequest === 'function') {
          GM_xmlhttpRequest({ method, url, headers, data: body ? JSON.stringify(body) : undefined, onload: (r) => done(r.status, r.responseText), onerror: (e) => reject(new Error('SB net error')) });
        } else {
          fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }).then(async (r) => done(r.status, await r.text())).catch(reject);
        }
      });
    }
    return { enabled, req };
  })();

  // ===========================================================================
  // Persistência de alto nível (sessão, competidores, samples, laps)
  // ===========================================================================
  let sessionId = null;
  const compIdByNumber = {};   // number -> uuid (evita recriar)

  async function ensureSession(meta) {
    const key = 'ek_session_' + (meta.mylaptime_uid || 'x') + '_' + new Date().toISOString().slice(0, 10);
    const cached = localStorage.getItem(key);
    if (cached) { sessionId = cached; return; }
    if (!SB.enabled()) { sessionId = 'local-' + Date.now(); localStorage.setItem(key, sessionId); return; }
    const rows = await SB.req('POST', '/rest/v1/sessions', [{ mylaptime_uid: meta.mylaptime_uid, name: meta.name, track: meta.track, event_type: meta.event_type }], 'return=representation');
    sessionId = rows && rows[0] && rows[0].id;
    if (sessionId) localStorage.setItem(key, sessionId);
  }

  async function ensureCompetitor(c) {
    if (compIdByNumber[c.number]) return compIdByNumber[c.number];
    if (!SB.enabled()) { const id = 'local-' + c.number; compIdByNumber[c.number] = id; return id; }
    const rows = await SB.req('POST', '/rest/v1/competitors?on_conflict=session_id,number', [{ session_id: sessionId, number: c.number, name: c.name, category: c.category, is_team: isTeam(c) }], 'return=representation,resolution=merge-duplicates');
    const id = rows && rows[0] && rows[0].id; if (id) compIdByNumber[c.number] = id; return id;
  }

  async function persistSnapshot(snap) {
    const rows = CONFIG.CAPTURE_ALL_COMPETITORS ? snap.competitors : snap.competitors.filter(isTeam);
    const samples = [], lapRows = [];
    for (const c of rows) {
      if (c.number == null) continue;
      const cid = await ensureCompetitor(c);
      samples.push({ session_id: sessionId, competitor_id: cid, captured_at: new Date(snap.scrapedAt).toISOString(), race_clock_ms: snap.raceClock.ms, pos: c.pos, lap_count: c.lapCount, last_lap_ms: c.lastLapTime.ms, best_lap_ms: c.bestLapTime.ms, best_lap_num: c.bestLapNum, diff_ms: c.diff.ms ?? null, diff_laps: c.diff.laps ?? null, diff_raw: c.diff.raw, gap_ms: c.gap.ms ?? null, gap_laps: c.gap.laps ?? null, gap_raw: c.gap.raw, state: c.state, flag: snap.flag.state });
      (c.lapHistory || []).forEach((l) => lapRows.push({ session_id: sessionId, competitor_id: cid, lap_number: l.n, lap_ms: l.ms, lap_text: l.timeText }));
    }
    // buffer local sempre (fonte da verdade offline)
    await DB.push({ kind: 'samples', rows: samples });
    if (lapRows.length) await DB.push({ kind: 'laps', rows: lapRows });
    stats.captured += samples.length;
    await flush();
  }

  let flushing = false;
  async function flush() {
    if (flushing || !SB.enabled()) return; flushing = true;
    try {
      const items = await DB.all();
      const okIds = [];
      for (const it of items) {
        try {
          if (it.item.kind === 'samples') await SB.req('POST', '/rest/v1/competitor_samples', it.item.rows, 'return=minimal');
          else if (it.item.kind === 'laps') await SB.req('POST', '/rest/v1/laps?on_conflict=competitor_id,lap_number', it.item.rows, 'return=minimal,resolution=merge-duplicates');
          okIds.push(it.id); stats.lastPush = Date.now();
        } catch (e) { break; } // rede caiu: para e tenta no próximo ciclo
      }
      if (okIds.length) await DB.remove(okIds);
    } finally { flushing = false; }
  }

  // ===========================================================================
  // Resiliência de conexão
  // ===========================================================================
  let lastClockMs = null, lastClockChange = Date.now(), reconnectFails = 0;
  function connectionWatch() {
    const modal = document.getElementById('components-reconnect-modal');
    const reconnecting = modal && getComputedStyle(modal).display !== 'none' && modal.style.display !== 'none';
    const clock = X.extractAll(document).raceClock.ms;
    if (clock != null && clock !== lastClockMs) { lastClockMs = clock; lastClockChange = Date.now(); reconnectFails = 0; }
    const staleFor = (Date.now() - lastClockChange) / 1000;
    let status = 'CONECTADO';
    if (reconnecting) status = 'RECONECTANDO';
    else if (staleFor > CONFIG.STALE_SECONDS) {
      status = 'PARADO';
      reconnectFails++;
      try { if (window.Blazor && typeof window.Blazor.reconnect === 'function') window.Blazor.reconnect(); } catch (e) {}
      if (reconnectFails >= CONFIG.RELOAD_AFTER_FAILS) { HUD.log('Reconexão falhou — recarregando página…'); setTimeout(() => location.reload(), 1500); }
    }
    stats.status = status;
    if (document.hidden) stats.status += ' (aba oculta!)';
    HUD.render();
  }

  // ===========================================================================
  // Ajustes na página (paginação 100 + expandir linhas da equipe)
  // ===========================================================================
  function tunePage() {
    if (CONFIG.SET_PAGE_SIZE_100) {
      const sel = document.querySelector('.lt-page-select'); if (sel && sel.value !== '100') { sel.value = '100'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (CONFIG.AUTO_EXPAND_TEAM) {
      document.querySelectorAll('.lt-competitor-row').forEach((row) => {
        const num = (row.querySelector('.lt-driver-number') || {}).textContent; const name = (row.querySelector('.lt-driver-name') || {}).textContent;
        const team = isTeam({ number: (num || '').replace(/^#/, '').trim(), name });
        if (team && !row.querySelector('.lt-expansion-panel') && row.classList.contains('lt-competitor-row--clickable')) { row.click(); }
      });
    }
  }

  // ===========================================================================
  // Loop principal
  // ===========================================================================
  const stats = { running: false, captured: 0, status: '—', lastPush: null };
  let timer = null, watchTimer = null;
  async function tick() {
    if (!stats.running) return;
    if (!document.querySelector('.lt-competitors-list')) { stats.status = 'aguardando evento…'; HUD.render(); return; }
    try {
      if (!sessionId) await ensureSession(readSessionMeta());
      tunePage();
      const snap = X.extractAll(document);
      if (snap.competitors.length) await persistSnapshot(snap);
    } catch (e) { HUD.log('erro tick: ' + e.message); }
    HUD.render();
  }
  function start() { if (stats.running) return; stats.running = true; timer = setInterval(tick, CONFIG.CAPTURE_INTERVAL_MS); watchTimer = setInterval(connectionWatch, 3000); tick(); HUD.log('captura iniciada'); }
  function stop() { stats.running = false; clearInterval(timer); clearInterval(watchTimer); HUD.log('captura pausada'); HUD.render(); }

  async function exportJson() {
    const items = await DB.all();
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessionId, meta: readSessionMeta(), items: items.map((i) => i.item) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'endurokart-captura-' + Date.now() + '.json'; document.body.appendChild(a); a.click(); a.remove();
  }

  // ===========================================================================
  // HUD flutuante
  // ===========================================================================
  const HUD = (function () {
    let el, logEl; const logs = [];
    function build() {
      if (typeof GM_addStyle === 'function') GM_addStyle('#ek-hud{position:fixed;z-index:2147483647;right:12px;bottom:12px;width:280px;background:#0f1115;color:#e6e6e6;font:12px system-ui,sans-serif;border:1px solid #2a2f3a;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.4);overflow:hidden}#ek-hud h4{margin:0;padding:8px 10px;background:#171a21;font-size:12px;display:flex;justify-content:space-between;cursor:move}#ek-hud .b{padding:8px 10px;display:grid;gap:6px}#ek-hud button{font:11px system-ui;padding:5px 8px;border:1px solid #2a2f3a;background:#1f2430;color:#e6e6e6;border-radius:6px;cursor:pointer}#ek-hud .row{display:flex;gap:6px;flex-wrap:wrap}#ek-hud .kv{display:flex;justify-content:space-between}#ek-hud .st{font-weight:700}#ek-hud .log{max-height:70px;overflow:auto;color:#9aa4b2;font:10px ui-monospace,monospace;border-top:1px solid #2a2f3a;padding-top:4px}');
      el = document.createElement('div'); el.id = 'ek-hud';
      el.innerHTML = '<h4><span>🏁 EnduroKart</span><span id="ek-x" style="cursor:pointer">▾</span></h4><div class="b" id="ek-body">'
        + '<div class="kv">status <span class="st" id="ek-st">—</span></div>'
        + '<div class="kv">leituras <span id="ek-cap">0</span></div>'
        + '<div class="kv">fila local <span id="ek-q">0</span></div>'
        + '<div class="kv">banco <span id="ek-sb">offline</span></div>'
        + '<div class="kv">últ. envio <span id="ek-lp">—</span></div>'
        + '<div class="row"><button id="ek-go">Iniciar</button><button id="ek-stop">Pausar</button></div>'
        + '<div class="row"><button id="ek-exp">Exportar JSON</button><button id="ek-clr">Limpar fila</button></div>'
        + '<div class="log" id="ek-log"></div></div>';
      document.body.appendChild(el); logEl = el.querySelector('#ek-log');
      el.querySelector('#ek-go').onclick = start; el.querySelector('#ek-stop').onclick = stop; el.querySelector('#ek-exp').onclick = exportJson;
      el.querySelector('#ek-clr').onclick = async () => { await DB.clear(); render(); };
      el.querySelector('#ek-x').onclick = () => { const b = el.querySelector('#ek-body'); b.hidden = !b.hidden; };
      dragify(el, el.querySelector('h4'));
      el.querySelector('#ek-sb').textContent = SB.enabled() ? 'Supabase' : 'offline';
    }
    function dragify(box, handle) { let x, y, ox, oy, on = false; handle.addEventListener('mousedown', (e) => { on = true; x = e.clientX; y = e.clientY; const r = box.getBoundingClientRect(); ox = r.left; oy = r.top; e.preventDefault(); }); document.addEventListener('mousemove', (e) => { if (!on) return; box.style.left = (ox + e.clientX - x) + 'px'; box.style.top = (oy + e.clientY - y) + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; }); document.addEventListener('mouseup', () => on = false); }
    async function render() {
      if (!el) return;
      el.querySelector('#ek-st').textContent = stats.status;
      el.querySelector('#ek-st').style.color = /CONECTADO/.test(stats.status) ? '#4ade80' : /RECONE|PARADO|oculta/.test(stats.status) ? '#f87171' : '#e6e6e6';
      el.querySelector('#ek-cap').textContent = stats.captured;
      el.querySelector('#ek-lp').textContent = stats.lastPush ? new Date(stats.lastPush).toLocaleTimeString() : '—';
      try { el.querySelector('#ek-q').textContent = await DB.count(); } catch (e) {}
    }
    function log(m) { logs.unshift(new Date().toLocaleTimeString() + ' · ' + m); logs.splice(30); if (logEl) logEl.innerHTML = logs.map((l) => '<div>' + l + '</div>').join(''); }
    return { build, render, log };
  })();

  // ===========================================================================
  // Bootstrap
  // ===========================================================================
  function boot() { if (!document.body) return setTimeout(boot, 300); DB.open().catch(() => {}); HUD.build(); HUD.log('pronto. Entre num evento e clique Iniciar.'); HUD.render(); }
  boot();
})();
