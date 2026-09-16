'use strict';
/*
 * Configuração do ingestor. Lê variáveis de ambiente (.env carregado pelo worker)
 * com defaults sensatos. Nada aqui é segredo além das chaves do Supabase.
 */
function bool(v, def) { if (v == null || v === '') return def; return /^(1|true|yes|sim)$/i.test(String(v)); }
function num(v, def) { const n = Number(v); return Number.isFinite(n) ? n : def; }

const CONFIG = {
  // Supabase (obrigatório para gravar; sem isso roda em modo "dry-run" só logando).
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '',

  // Navegador
  HEADLESS: bool(process.env.HEADLESS, true),
  // Usar um navegador do sistema em vez do Chromium do Playwright:
  // 'chrome' | 'msedge' (evita baixar o Chromium; ideal no Windows). Vazio = Chromium do Playwright.
  BROWSER_CHANNEL: process.env.BROWSER_CHANNEL || '',
  NAV_TIMEOUT_MS: num(process.env.NAV_TIMEOUT_MS, 30000),

  // Ciclos (ms)
  LIST_REFRESH_MS: num(process.env.LIST_REFRESH_MS, 45000),   // reconciliar a lista de eventos
  PER_EVENT_DWELL_MS: num(process.env.PER_EVENT_DWELL_MS, 6000), // tempo lendo cada evento por visita
  BETWEEN_EVENTS_MS: num(process.env.BETWEEN_EVENTS_MS, 800),
  STALE_SECONDS: num(process.env.STALE_SECONDS, 20),          // relógio parado => desconexão

  // Pareamento
  PAIRING_WAIT_MS: num(process.env.PAIRING_WAIT_MS, 180000),  // quanto esperar você parear no app
  PAIRING_CODE_FILE: process.env.PAIRING_CODE_FILE || 'pairing-code.txt', // onde escrever o código (nuvem)

  // Captura
  CAPTURE_LAPS: bool(process.env.CAPTURE_LAPS, true),         // expandir e gravar histórico de voltas
  MAX_EVENTS_PER_CYCLE: num(process.env.MAX_EVENTS_PER_CYCLE, 0), // 0 = todos
  PRIORITY_TRACKS: (process.env.PRIORITY_TRACKS || '')          // substrings priorizadas (ex.: "FKI,Linhares")
    .split(',').map((s) => s.trim()).filter(Boolean),
  // Filtro ESTRITO: se preenchido, captura SÓ eventos cujo nome/pista casem com algum destes.
  EVENT_FILTER: (process.env.EVENT_FILTER || '')
    .split(',').map((s) => s.trim()).filter(Boolean),

  // Servidor de status/pareamento (opcional). Vazio/0 = desligado.
  // Numa nuvem headless, abra http://host:PORT para ver o QR/código e o status.
  PORT: num(process.env.PORT, 0),

  // Diagnóstico
  DEBUG: bool(process.env.DEBUG, false),
  DATA_DIR: process.env.DATA_DIR || 'data',                  // buffer/estado persistente do worker
};

CONFIG.SUPABASE_ENABLED = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);

module.exports = CONFIG;
