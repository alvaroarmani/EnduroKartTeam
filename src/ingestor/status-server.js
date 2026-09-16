'use strict';
/*
 * Servidor HTTP de status/pareamento (opcional, via CONFIG.PORT).
 * Numa nuvem headless, abra http://host:PORT: mostra o QR + código para parear,
 * e as estatísticas de captura. Atualiza sozinho a cada 5s.
 */
const http = require('http');

function startStatusServer(port, getState, getQrPng) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(getState()));
      }
      if (req.url === '/qr.png') {
        const png = await getQrPng().catch(() => null);
        if (!png) { res.writeHead(404); return res.end('sem qr'); }
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
        return res.end(png);
      }
      const s = getState();
      const pairing = s.paired ? '' : `
        <p>Para capturar as voltas, pareie uma vez: no app <b>MyLapTime</b> → Carreira → câmera,
        escaneie o QR abaixo (ou cole o código).</p>
        <img src="/qr.png?t=${Date.now()}" alt="QR" style="width:280px;background:#fff;padding:8px;border-radius:10px"/>
        <p>Código: <code style="font-size:16px">${s.pairingCode || '…'}</code></p>`;
      const color = s.paired ? '#4ade80' : '#f5a623';
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="refresh" content="5"><title>EnduroKart · Ingestor</title></head>
        <body style="font:15px system-ui,sans-serif;background:#0f1115;color:#e6e6e6;margin:0;padding:22px;max-width:560px">
        <h2 style="margin:.2em 0">🏁 EnduroKart · Ingestor</h2>
        <p>Status: <b style="color:${color}">${s.paired ? 'CAPTURANDO' : 'AGUARDANDO PAREAMENTO'}</b>
           &nbsp;·&nbsp;conexão: ${s.status || '—'}</p>
        ${pairing}
        <table style="border-collapse:collapse;margin-top:14px">
          <tr><td style="padding:3px 12px 3px 0;color:#9aa4b2">ciclos</td><td>${s.cycles}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#9aa4b2">eventos ativos</td><td>${s.activeEvents}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#9aa4b2">amostras gravadas</td><td>${s.samples}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#9aa4b2">último evento</td><td>${(s.lastEvent || '—')}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;color:#9aa4b2">atualizado</td><td>${s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString('pt-BR') : '—'}</td></tr>
        </table>
        </body></html>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500); res.end('erro');
    }
  });
  server.listen(port, () => console.log(`[status] servidor em http://localhost:${port}`));
  server.on('error', (e) => console.log('[status] erro ao subir servidor:', e.message));
  return server;
}

module.exports = { startStatusServer };
