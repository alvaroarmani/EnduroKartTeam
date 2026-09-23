'use strict';
/*
 * Controla UM navegador Playwright vivo sobre o mylaptime LiveTime.
 * Regra de ouro: carregar a página UMA vez (goto) e depois navegar só por cliques
 * do SPA — nunca reload — para preservar o circuito Blazor/pareamento.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('./config');

const LIVE_URL = 'https://mylaptime.com.br/LiveTime';
const EXTRACTOR_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'extractor', 'mylaptime-extractor.js'), 'utf8');

function log(...a) { console.log('[session]', ...a); }

class MyLapSession {
  constructor() { this.browser = null; this.ctx = null; this.page = null; this.paired = false; }

  async launch() {
    // Perfil PERSISTENTE (userDataDir): cookies/localStorage/IndexedDB sobrevivem ao
    // restart, então o pareamento/login do mylaptime fica salvo — pareia 1× e pronto.
    const userDataDir = CONFIG.USER_DATA_DIR || path.join(process.cwd(), CONFIG.DATA_DIR || 'data', 'browser-profile');
    try { fs.mkdirSync(userDataDir, { recursive: true }); } catch (e) {}
    const launchOpts = {
      headless: CONFIG.HEADLESS,
      locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1280, height: 900 },
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    };
    if (CONFIG.BROWSER_CHANNEL) launchOpts.channel = CONFIG.BROWSER_CHANNEL; // 'chrome' | 'msedge' do sistema
    this.ctx = await chromium.launchPersistentContext(userDataDir, launchOpts);
    this.browser = this.ctx.browser(); // pode ser null em contexto persistente — usamos ctx p/ fechar
    this.userDataDir = userDataDir;
    // Define window.MyLapExtractor em toda navegação de documento.
    await this.ctx.addInitScript({ content: EXTRACTOR_SRC });
    this.page = this.ctx.pages()[0] || await this.ctx.newPage();
    this.page.setDefaultTimeout(CONFIG.NAV_TIMEOUT_MS);
    await this.page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2500);
    await this.acceptTerms();
    log('LiveTime carregado.');
  }

  async ensureExtractor() {
    const ok = await this.page.evaluate(() => typeof window.MyLapExtractor !== 'undefined').catch(() => false);
    if (!ok) await this.page.evaluate(EXTRACTOR_SRC);
  }

  // Clica "Aceitar Termos e gerar codigo" se o modal de boas-vindas estiver presente.
  async acceptTerms() {
    try {
      const btn = this.page.locator('button', { hasText: /Aceitar Termos/i }).first();
      if (await btn.count()) { await btn.click({ timeout: 4000 }).catch(() => {}); await this.page.waitForTimeout(800); }
    } catch (e) {}
  }

  // Lê o código de pareamento do modal ("Ou copie e cole o codigo").
  // O código (32 hex) pode vir quebrado em 2 linhas; normalizamos removendo espaços.
  async readPairingCode() {
    return this.page.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, '');
      // pega o menor elemento cujo texto normalizado é 24-40 hex
      let best = null;
      for (const e of document.querySelectorAll('div,span,p,code,strong')) {
        const t = norm(e.textContent);
        if (/^[0-9a-f]{24,40}$/i.test(t)) { if (!best || t.length <= best.length) best = t; }
      }
      return best;
    }).catch(() => null);
  }

  async dismissModals() {
    await this.page.evaluate(() => {
      [...document.querySelectorAll('body *')].forEach((d) => {
        const c = getComputedStyle(d);
        if (c.position === 'fixed' && d.offsetWidth > innerWidth * 0.4 && d.offsetHeight > innerHeight * 0.4 &&
            /Bem-vindo|QR Code|c[oó]digo de acesso/i.test(d.textContent || '') &&
            !d.querySelector('.lt-event-card, .lt-competitors-list')) d.remove();
      });
    }).catch(() => {});
  }

  // Espera você parear no app. Prioriza um SINAL EXPLÍCITO por arquivo (data/paired.flag),
  // acionado quando você confirma que pareou — robusto e sem depender de auto-detecção.
  // Como backup, também testa "abrir evento" a cada 30s e emite o código via onCode.
  async waitForPairing(onCode) {
    const flagPath = path.join(process.cwd(), CONFIG.DATA_DIR, 'paired.flag');
    try { fs.unlinkSync(flagPath); } catch (e) {} // limpa flag antiga
    const deadline = Date.now() + CONFIG.PAIRING_WAIT_MS;
    let lastCode = null, lastOpenTest = Date.now(), lastBeat = 0;
    while (Date.now() < deadline) {
      if (fs.existsSync(flagPath)) { this.paired = true; log('sinal de pareamento (paired.flag) recebido — seguindo para captura.'); return true; }
      await this.acceptTerms();
      const code = await this.readPairingCode();
      if (code && code !== lastCode) { lastCode = code; if (onCode) onCode(code); }
      if (Date.now() - lastBeat > 10000) { lastBeat = Date.now(); log(`aguardando pareamento… código atual=${lastCode ? lastCode.slice(0, 8) + '…' : '(?)'} · (crie data/paired.flag para forçar)`); }
      if (Date.now() - lastOpenTest > 30000) {
        lastOpenTest = Date.now();
        const opened = await this._tryOpenFirstEvent().catch(() => false);
        if (opened) { this.paired = true; log('pareado (auto-detecção)! board acessível.'); await this.backToList().catch(() => {}); return true; }
      }
      await this.page.waitForTimeout(2500);
    }
    return false;
  }

  async _tryOpenFirstEvent() { return this._openEventByIndex(0); }

  // Clica o botão "Assistir" da página de detalhe do evento (passo intermediário
  // entre o card e o board). Devolve true se clicou.
  async _clickAssistir() {
    return this.page.evaluate(() => {
      const b = [...document.querySelectorAll('button,a,div,span')].find((e) => {
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        return /^(play_arrow\s*)?assistir$/i.test(t);
      });
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // Abre o evento de índice `index`: card -> (detalhe) -> "Assistir" -> board.
  async _openEventByIndex(index) {
    try {
      await this.dismissModals();
      const clicked = await this.page.evaluate((i) => {
        const cards = document.querySelectorAll('.lt-event-card'); if (!cards[i]) return false; cards[i].click(); return true;
      }, index).catch(() => false);
      if (!clicked) return false;
      // espera aparecer o board OU o botão "Assistir"
      try {
        await this.page.waitForFunction(() =>
          !!document.querySelector('.lt-competitors-list') ||
          [...document.querySelectorAll('button,a,div,span')].some((e) => /^(play_arrow\s*)?assistir$/i.test((e.textContent || '').replace(/\s+/g, ' ').trim())),
          { timeout: 8000 });
      } catch (e) { return false; }
      const hasBoard = await this.page.$('.lt-competitors-list').catch(() => null);
      if (!hasBoard) {
        await this.dismissModals();
        await this._clickAssistir();
      }
      try { await this.page.waitForSelector('.lt-competitors-list', { timeout: 8000 }); return true; }
      catch (e) { return false; }
    } catch (e) { return false; } // navegação/reconexão no meio não pode derrubar o worker
  }

  // Garante estar na lista de eventos. Do board/detalhe, clica "Voltar" até ver os cards.
  // Atenção: no board há 2 elementos com .lt-back-button (voltar E modo-escuro) — por isso
  // selecionamos pelo TEXTO "Voltar", excluindo o botão de tema.
  async backToList() {
    for (let i = 0; i < 5; i++) {
      const onList = await this.page.evaluate(() => !!document.querySelector('.lt-event-card')).catch(() => false);
      if (onList) { await this.dismissModals(); return true; }
      const clicked = await this.page.evaluate(() => {
        const cand = [...document.querySelectorAll('button,a')].filter((e) => {
          if (e.classList.contains('lt-dark-mode-btn')) return false;
          const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
          return /(^|\b)voltar(\b|$)/i.test(t);
        });
        const b = cand[0];
        if (b) { b.click(); return true; } return false;
      }).catch(() => false);
      await this.page.waitForTimeout(900);
      if (!clicked) break;
    }
    await this.dismissModals();
    return await this.page.evaluate(() => !!document.querySelector('.lt-event-card')).catch(() => false);
  }

  // Lê os cards da lista (gate-free). Não precisa de pareamento.
  async listEvents() {
    await this.backToList();
    await this.dismissModals();
    return this.page.evaluate(() => {
      return [...document.querySelectorAll('.lt-event-card')].map((card, index) => {
        const t = (sel) => (card.querySelector(sel) || {}).textContent || '';
        return {
          index,
          name: (t('.lt-event-name') || '').trim(),
          track: (t('.lt-company-name') || '').trim(),
          type: (t('.lt-racing-type-name') || '').trim(),
          live: /AO VIVO/i.test(card.textContent || ''),
        };
      });
    }).catch(() => []);
  }

  decodeUid(b64) { try { return Buffer.from(b64 || '', 'base64').toString('utf8') || null; } catch (e) { return null; } }

  // Abre o evento de índice `index`, aplica page-size 100, expande linhas (se pedido),
  // e devolve { meta, snapshot }. Assume já pareado.
  async captureEvent(index, { expandLaps, cleanMeta } = {}) {
    await this.backToList();
    const opened = await this._openEventByIndex(index);
    if (!opened) { await this.dismissModals(); return null; }

    // paginação 100 (mais voltas por página no painel expandido)
    await this.page.evaluate(() => {
      document.querySelectorAll('.lt-page-select').forEach((sel) => {
        if (sel.value !== '100') { sel.value = '100'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }).catch(() => {});

    if (expandLaps) {
      // expande cada linha clicável que ainda não tem painel; tenta o alvo clicável interno.
      await this.page.evaluate(() => {
        document.querySelectorAll('.lt-competitor-row.lt-competitor-row--clickable').forEach((row) => {
          if (row.querySelector('.lt-expansion-panel')) return;
          const target = row.querySelector('.lt-row-desktop, .lt-row-mobile, .lt-mobile-header') || row;
          target.click();
        });
      }).catch(() => {});
      await this.page.waitForTimeout(1600);
    }

    // DEBUG: salva o HTML do board 1x por evento para depurar a estrutura das voltas.
    if (CONFIG.DEBUG) await this._dumpBoardHtml(cleanMeta);

    await this.ensureExtractor();
    const snapshot = await this.page.evaluate(() => window.MyLapExtractor.extractAll(document)).catch(() => null);
    const rawMeta = await this.page.evaluate(() => {
      const uidB64 = localStorage.getItem('company_livetime_selected');
      // nome específico da bateria do cabeçalho do board (evita o genérico "Corrida"/"Race")
      const info = document.querySelector('.lt-racing-info');
      let boardName = null;
      if (info) {
        const parts = (info.textContent || '').split('\n').map((s) => s.trim()).filter(Boolean);
        boardName = parts.find((p) => !/^(corrida|race|tomada de tempo|classificat)/i.test(p)) || parts[0] || null;
      }
      const body = document.body.textContent || '';
      let event_type = 'unknown';
      if (/tomada de tempo/i.test(body)) event_type = 'practice';
      else if (/classificat/i.test(body)) event_type = 'quali';
      else if (/\brace\b|corrida/i.test(body)) event_type = 'race';
      return { uidB64, boardName, event_type };
    }).catch(() => ({}));
    const meta = {
      mylaptime_uid: this.decodeUid(rawMeta.uidB64),
      name: rawMeta.boardName || (cleanMeta && cleanMeta.name) || null,
      track: (cleanMeta && cleanMeta.track) || null,
      event_type: rawMeta.event_type || 'unknown',
    };
    return { meta, snapshot };
  }

  // DEBUG: grava o HTML da lista de competidores (com um painel expandido) 1x por evento,
  // para descobrir a estrutura real das voltas e calibrar readLaps.
  async _dumpBoardHtml(cleanMeta) {
    try {
      this._dumped = this._dumped || new Set();
      const key = (cleanMeta && (cleanMeta.track + cleanMeta.name)) || 'x';
      if (this._dumped.has(key)) return;
      this._dumped.add(key);
      const html = await this.page.evaluate(() => {
        const list = document.querySelector('.lt-competitors-list');
        if (!list) return null;
        const firstPanel = document.querySelector('.lt-expansion-panel');
        return { listHead: list.outerHTML.slice(0, 4000), panel: firstPanel ? firstPanel.outerHTML.slice(0, 4000) : '(sem painel)' };
      }).catch(() => null);
      if (!html) return;
      const dir = path.join(process.cwd(), CONFIG.DATA_DIR); fs.mkdirSync(dir, { recursive: true });
      const safe = String(key).replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
      fs.writeFileSync(path.join(dir, `debug-board-${safe}.html`), `<!-- LIST -->\n${html.listHead}\n\n<!-- PANEL -->\n${html.panel}`);
      log('DEBUG board salvo:', safe);
    } catch (e) {}
  }

  // Saúde da conexão: relógio + modal de reconexão do Blazor.
  async connectionHealth() {
    return this.page.evaluate(() => {
      const clock = (document.querySelector('.lt-timer-value') || {}).textContent || null;
      const modal = document.getElementById('components-reconnect-modal');
      const reconnecting = modal && getComputedStyle(modal).display !== 'none' && modal.style.display !== 'none';
      return { clock, reconnecting: !!reconnecting };
    }).catch(() => ({ clock: null, reconnecting: false }));
  }

  async tryReconnect() {
    await this.page.evaluate(() => { try { if (window.Blazor && window.Blazor.reconnect) window.Blazor.reconnect(); } catch (e) {} }).catch(() => {});
  }

  async screenshotQR() { try { return await this.page.screenshot({ type: 'png' }); } catch (e) { return null; } }

  async close() { try { if (this.ctx) await this.ctx.close(); else if (this.browser) await this.browser.close(); } catch (e) {} }
}

module.exports = { MyLapSession, LIVE_URL };
