'use strict';
/*
 * TESTE DE VALIDADE DO TOKEN DE PAREAMENTO.
 * A cada execução: cria um perfil de navegador ZERADO, injeta o section_access_token
 * salvo e verifica se consegue ABRIR UM BOARD (= token ainda vale) ou se cai na tela de
 * pareamento (= expirou). Registra o resultado com timestamp em data/token-validity.log.
 *
 * Rode pontual, e agende pra descobrir se/quando o token expira:
 *   node tools/token-validity.js
 *   # loop simples (a cada 3h):
 *   while true; do node tools/token-validity.js; sleep 10800; done
 *   # cron (a cada 3h):  0 *\/3 * * *  cd /caminho && node tools/token-validity.js
 *
 * O token vem de SECTION_ACCESS_TOKEN ou de data/section-token.txt.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// perfil ZERADO por execução → qualquer "pareado" vem do TOKEN, não de perfil salvo.
const fresh = path.join(os.tmpdir(), 'ek-token-test-' + Date.now());
process.env.USER_DATA_DIR = fresh;
process.env.HEADLESS = process.env.HEADLESS || 'true';
if (!process.env.BROWSER_CHANNEL) process.env.BROWSER_CHANNEL = 'chrome';
process.env.PORT = '0';

const CONFIG = require('../src/ingestor/config');
const { MyLapSession } = require('../src/ingestor/mylaptime-session');

const dataDir = path.join(process.cwd(), 'data');
const tokenFile = path.join(dataDir, 'section-token.txt');
const token = (process.env.SECTION_ACCESS_TOKEN || '').trim()
  || (() => { try { return fs.readFileSync(tokenFile, 'utf8').trim(); } catch (e) { return ''; } })();

function record(paired, note) {
  const line = `${new Date().toISOString()} · token=${(token || '—').slice(0, 8)} · paired=${paired === null ? 'INCONCLUSIVO' : paired ? 'SIM' : 'NAO'}` + (note ? ' · ' + note : '');
  console.log(line);
  try { fs.mkdirSync(dataDir, { recursive: true }); fs.appendFileSync(path.join(dataDir, 'token-validity.log'), line + '\n'); } catch (e) {}
}

(async () => {
  if (!token) { record(false, 'sem token (pareie 1x)'); process.exit(2); }
  const s = new MyLapSession();
  let exit = 3;
  try {
    await s.launch();
    const events = await s.listEvents().catch(() => []);
    if (!events.length) { record(null, 'sem eventos online p/ testar'); exit = 4; }
    else {
      let paired = false, sawCode = false;
      for (let i = 0; i < 4 && !paired; i++) {
        if (await s._openEventByIndex(0).catch(() => false)) { paired = true; break; }
        const code = await s.readPairingCode().catch(() => null);
        if (code) { sawCode = true; break; } // apareceu código = não está pareado
        await s.page.waitForTimeout(3000);
      }
      record(paired, paired ? 'board acessível' : sawCode ? 'pediu pareamento (token expirado?)' : 'board não abriu');
      exit = paired ? 0 : 1;
    }
  } catch (e) { record(false, 'erro: ' + String(e.message || e).slice(0, 50)); }
  finally {
    try { await s.close(); } catch (e) {}
    try { fs.rmSync(fresh, { recursive: true, force: true }); } catch (e) {}
    process.exit(exit);
  }
})();
