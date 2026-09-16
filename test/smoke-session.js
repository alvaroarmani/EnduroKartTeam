/*
 * Smoke test do controlador Playwright contra o mylaptime REAL (caminho gate-free).
 * Não pareia — só valida: launch, injeção do extractor, e listEvents().
 * Rodar:  BROWSER_CHANNEL=chrome HEADLESS=true node test/smoke-session.js
 */
const { MyLapSession } = require('../src/ingestor/mylaptime-session');

(async () => {
  const s = new MyLapSession();
  try {
    console.log('launch…');
    await s.launch();

    const hasExtractor = await s.page.evaluate(() => typeof window.MyLapExtractor !== 'undefined');
    console.log('window.MyLapExtractor injetado:', hasExtractor);

    const clock = await s.page.evaluate(() => (document.querySelector('.lt-timer-value') || {}).textContent || null);
    console.log('relógio (na lista deve ser null):', clock);

    const events = await s.listEvents();
    console.log('eventos ativos:', events.length);
    events.slice(0, 10).forEach((e) => console.log(`  [${e.index}] ${e.track} · ${e.name} · ${e.type} · live=${e.live}`));

    const code = await s.readPairingCode();
    console.log('código de pareamento visível:', code ? code.slice(0, 8) + '…' : '(nenhum)');

    console.log(hasExtractor && Array.isArray(events) ? '\n✓ smoke OK' : '\n✗ smoke com problemas');
  } catch (e) {
    console.error('✗ smoke FALHOU:', e.message);
    process.exitCode = 1;
  } finally {
    await s.close();
  }
})();
