/*
 * mylaptime-extractor.js — Núcleo de extração da cronometragem ao vivo do mylaptime.
 *
 * Fonte da verdade da lógica de scraping. Puro (sem dependências, sem GM_*),
 * exposto como window.MyLapExtractor. Usado por:
 *   - test/extractor.test.html  (validação contra fixture)
 *   - src/extractor/mylaptime-scraper.user.js  (userscript espelha este núcleo)
 *
 * Esquema do DOM mapeado em 15/09/2026 contra o LiveTime real. Usa apenas classes
 * semânticas `lt-*` (estáveis); NUNCA o atributo `b-xxxx` (hash de build do Blazor).
 *
 * Campos por competidor (rótulos do mylaptime → chave normalizada):
 *   M.V   → bestLapNum    (nº da volta em que fez a melhor)
 *   T.M.V → bestLapTime   (tempo da melhor volta)
 *   LAP   → laps          (voltas completadas)
 *   T.U.V → lastLapTime   (tempo da última volta)
 *   DIFF  → diff          (para o líder)
 *   GAP   → gap           (para o próximo à frente)
 */
(function (global) {
  'use strict';

  // ---- Helpers de parsing --------------------------------------------------

  /**
   * "1:30:52.497" | "1:02.345" | "45.678" → milissegundos (número) ou null.
   * Interpreta pela contagem de segmentos separados por ":" —
   * 1 seg = ss, 2 seg = mm:ss, 3 seg = hh:mm:ss (nunca hh:ss).
   */
  function parseTimeToMs(str) {
    if (str == null) return null;
    const s = String(str).trim().replace(',', '.');
    if (!s || /^-+$/.test(s)) return null;
    const parts = s.split(':');
    if (parts.length > 3 || !parts.every((p) => /^\d{1,2}(?:\.\d{1,3})?$/.test(p))) return null;
    let hr = 0, min = 0, sec = 0;
    if (parts.length === 1) { sec = parseFloat(parts[0]); }
    else if (parts.length === 2) { min = +parts[0]; sec = parseFloat(parts[1]); }
    else { hr = +parts[0]; min = +parts[1]; sec = parseFloat(parts[2]); }
    return Math.round(((hr * 60 + min) * 60 + sec) * 1000);
  }

  /** Normaliza GAP/DIFF: "+0.523" | "0.523" | "+1 volta" | "2 voltas" | "---". */
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

  function toInt(str) {
    if (str == null) return null;
    const m = String(str).replace(/[^\d-]/g, '');
    return m === '' ? null : parseInt(m, 10);
  }

  function text(el) { return el ? (el.textContent || '').trim() : null; }

  // ---- Extração de campos globais -----------------------------------------

  function getRaceClock(root) {
    const el = (root || document).querySelector('.lt-timer-value');
    const t = text(el);
    return { text: t, ms: parseTimeToMs(t) };
  }

  /** Converte "#rrggbb" | "rgb(r,g,b)" em estado de bandeira por dominância de cor. */
  function colorToFlagState(str) {
    if (!str) return null;
    let r, g, b;
    const hex = str.match(/#([0-9a-f]{6})/i);
    const rgb = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (hex) { r = parseInt(hex[1].slice(0, 2), 16); g = parseInt(hex[1].slice(2, 4), 16); b = parseInt(hex[1].slice(4, 6), 16); }
    else if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; }
    else return null;
    if (r > 180 && g > 150 && b < 120) return 'yellow';
    if (r > 140 && r > g + 50 && r > b + 50) return 'red';
    if (g > 110 && g > r + 20 && g > b + 20) return 'green';
    if (r > 200 && g > 200 && b > 200) return 'white'; // relargada?
    return null;
  }

  /** Estado da bandeira: por classe/keyword e, se preciso, pela cor do ícone. */
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

  // ---- Extração por competidor --------------------------------------------

  /** Lê os pares rótulo→valor do layout mobile (auto-descritivos, mais robustos). */
  function readMobileStats(row) {
    const out = {};
    row.querySelectorAll('.lt-mobile-stat').forEach((s) => {
      const label = text(s.querySelector('.lt-stat-label'));
      const value = text(s.querySelector('.lt-stat-value'));
      if (label) out[label.toUpperCase().replace(/\s+/g, '')] = value;
    });
    return out;
  }

  /**
   * Fallback: layout desktop. Casa as células numéricas com os rótulos do
   * cabeçalho (.lt-table-header) na ordem em que aparecem.
   */
  function readDesktopStats(row, headerLabels) {
    const out = {};
    const cells = [...row.querySelectorAll('.lt-row-desktop .lt-data-cell')]
      .filter((c) => !c.classList.contains('lt-data-cell--pos') &&
                     !c.classList.contains('lt-data-cell--driver'));
    cells.forEach((c, i) => {
      const label = headerLabels[i];
      if (label) out[label.toUpperCase().replace(/\s+/g, '')] = text(c);
    });
    return out;
  }

  function getHeaderLabels(root) {
    const scope = root || document;
    return [...scope.querySelectorAll('.lt-table-header .lt-th-center')]
      .filter((h) => !h.classList.contains('lt-column-hidden'))
      .map((h) => text(h));
  }

  /**
   * Voltas do painel expansível (.lt-expansion-panel). Estrutura real (confirmada 16/09):
   *   .lt-passings-grid > .lt-passing-item (uma por volta)
   *      .lt-passing-field: <span>Lap|Pos|Tempo|Diff|Líder|Delta</span><strong>valor</strong>
   * Devolve [{n, timeText, ms, pos}].
   */
  function readLaps(row) {
    const panel = row.querySelector('.lt-expansion-panel');
    if (!panel) return [];
    if (panel.querySelector('.lt-expansion-empty')) return [];
    const items = panel.querySelectorAll('.lt-passing-item');
    if (items.length) {
      const laps = [];
      items.forEach((it) => {
        const f = {};
        it.querySelectorAll('.lt-passing-field').forEach((fld) => {
          const label = text(fld.querySelector('span'));
          const val = text(fld.querySelector('strong'));
          if (label) f[label.toLowerCase().replace(/[íi]der/, 'lider')] = val;
        });
        const n = toInt(f['lap']);
        if (n == null) return;
        laps.push({ n, timeText: f['tempo'] || null, ms: parseTimeToMs(f['tempo']), pos: toInt(f['pos']) });
      });
      return laps;
    }
    // fallback genérico (estruturas não previstas)
    const laps = [];
    const lines = panel.querySelectorAll('.lt-lap-row, .lt-passage-row, tr, li');
    [...(lines.length ? lines : panel.children)].forEach((line) => {
      const t = (line.textContent || '').trim(); if (!t) return;
      const timeTok = t.match(/(?:\d+:)?\d{1,2}[.:]\d{1,3}/); const numTok = t.match(/^\s*(\d+)/);
      if (timeTok) laps.push({ n: numTok ? parseInt(numTok[1], 10) : laps.length + 1, timeText: timeTok[0], ms: parseTimeToMs(timeTok[0]) });
    });
    return laps;
  }

  function normalizeCompetitor(stats) {
    const g = (k) => (k in stats ? stats[k] : null);
    return {
      bestLapNum: toInt(g('M.V') || g('MV')),
      bestLapTime: mkTime(g('T.M.V') || g('TMV')),
      lapCount: toInt(g('LAP')),
      lastLapTime: mkTime(g('T.U.V') || g('TUV')),
      diff: parseGap(g('DIFF')),
      gap: parseGap(g('GAP')),
      _rawStats: stats,
    };
  }

  function mkTime(str) { return { text: str, ms: parseTimeToMs(str) }; }

  function getCompetitors(root) {
    const scope = root || document;
    const headerLabels = getHeaderLabels(scope);
    const rows = [...scope.querySelectorAll('.lt-competitor-row')];
    return rows.map((row, idx) => {
      let stats = readMobileStats(row);
      if (Object.keys(stats).length === 0) stats = readDesktopStats(row, headerLabels);
      const numRaw = text(row.querySelector('.lt-driver-number'));
      const catRaw = text(row.querySelector('.lt-driver-category'));
      return Object.assign({
        pos: toInt(text(row.querySelector('.lt-pos-badge'))) ?? (idx + 1),
        number: numRaw ? numRaw.replace(/^#/, '') : null,
        name: text(row.querySelector('.lt-driver-name')),
        state: text(row.querySelector('.lt-driver-state')) || null,
        category: catRaw ? catRaw.replace(/^categoria:?\s*/i, '') : null,
        lapHistory: readLaps(row),
      }, normalizeCompetitor(stats));
    });
  }

  // ---- API pública ---------------------------------------------------------

  /** Snapshot completo do estado atual da tela. */
  function extractAll(root) {
    const scope = root || document;
    return {
      scrapedAt: Date.now(),
      raceClock: getRaceClock(scope),
      flag: getFlag(scope),
      competitors: getCompetitors(scope),
    };
  }

  /**
   * Filtra as linhas da SUA equipe. `matchers` = { numbers:[...], names:[...] }.
   * Casa por número do kart (exato) ou substring do nome (case-insensitive).
   */
  function filterTeam(competitors, matchers) {
    if (!matchers) return competitors;
    const nums = (matchers.numbers || []).map(String);
    const names = (matchers.names || []).map((n) => n.toLowerCase());
    return competitors.filter((c) => {
      if (c.number != null && nums.includes(String(c.number))) return true;
      if (c.name && names.some((n) => c.name.toLowerCase().includes(n))) return true;
      return false;
    });
  }

  const API = {
    parseTimeToMs, parseGap, toInt,
    getRaceClock, getFlag, getCompetitors,
    getHeaderLabels, readLaps,
    extractAll, filterTeam,
    VERSION: '0.1.0',
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.MyLapExtractor = API;
})(typeof window !== 'undefined' ? window : globalThis);
