/*
 * Valida a LEITURA do código de pareamento (o único passo interativo do usuário).
 * Não pareia de fato. Rodar:
 *   BROWSER_CHANNEL=chrome HEADLESS=true node test/smoke-pairing.js
 */
const { MyLapSession } = require('../src/ingestor/mylaptime-session');

(async () => {
  const s = new MyLapSession();
  try {
    await s.launch();               // launch() já chama acceptTerms()
    await s.acceptTerms();          // idempotente, garante o modal
    await s.page.waitForTimeout(1500);
    const code = await s.readPairingCode();
    console.log('código lido:', code || '(NENHUM)');
    console.log(code && /^[0-9a-f]{24,40}$/i.test(code) ? '✓ leitura do código OK' : '✗ não conseguiu ler o código');
    if (!code) process.exitCode = 1;
  } catch (e) { console.error('✗ falhou:', e.message); process.exitCode = 1; }
  finally { await s.close(); }
})();
