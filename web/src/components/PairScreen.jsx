import { useEffect, useState } from 'react';
import { workerUrl } from '../hooks/useEvents.js';

/*
 * Tela de PAREAMENTO. Fala com o status-server do worker (/health, /qr.png).
 * Se pareado → mostra que está capturando. Se não → mostra código + QR para
 * escanear/colar no app MyLapTime (Carreira). Roda em qualquer lugar que
 * enxergue o worker (VITE_EVENTS_URL aponta pra origem dele).
 */
export default function PairScreen() {
  const [h, setH] = useState(null);
  const [err, setErr] = useState(null);
  const [bust, setBust] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const tick = () => fetch(workerUrl('/health'), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => { if (alive) { setH(j); setErr(null); } })
      .catch((e) => { if (alive) setErr(e.message); });
    tick();
    const t = setInterval(() => { tick(); setBust(Date.now()); }, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const target = workerUrl('/health').replace('/health', '');

  if (err && !h) {
    return (
      <div className="state">
        <div style={{ color: 'var(--live)', fontWeight: 700, marginBottom: 6 }}>Worker não encontrado</div>
        <p className="foot">Não consegui falar com o worker em <code>{target}</code> ({err}).<br />
          Suba o worker (local ou VPS — ver <code>docs/VPS-CAPTURA.md</code>) e aponte <code>VITE_EVENTS_URL</code> pra ele.</p>
      </div>
    );
  }

  const paired = h?.paired;
  return (
    <div className="pair-wrap">
      {paired ? (
        <div className="pair-card ok">
          <div className="pair-ic">✅</div>
          <h2>Pareado — capturando</h2>
          <p className="sub">o worker está conectado e lendo os boards.</p>
          <div className="pair-stats">
            <span><b className="mono">{h.cycles ?? 0}</b> ciclos</span>
            <span><b className="mono">{(h.events || []).length}</b> eventos online</span>
            <span><b className="mono">{h.samples ?? 0}</b> amostras</span>
            <span className={'st ' + (h.status === 'ok' ? 'g' : 'y')}>{h.status || '—'}</span>
          </div>
          {h.lastEvent && <p className="foot">último: {h.lastEvent}</p>}
        </div>
      ) : (
        <div className="pair-card">
          <div className="pair-live"><i />aguardando pareamento</div>
          <h2>Parear o worker (1×)</h2>
          <ol className="pair-steps">
            <li>Abra o app <b>MyLapTime</b> → <b>Carreira</b> → câmera.</li>
            <li>Escaneie o QR abaixo <b>ou</b> cole o código.</li>
          </ol>
          <img className="pair-qr" alt="QR de pareamento" src={workerUrl('/qr.png') + '?t=' + bust}
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div className="pair-code">
            <span className="k">Código</span>
            <code>{h?.pairingCode || 'gerando…'}</code>
          </div>
          <p className="foot">O perfil do navegador é persistente — a ideia é parear uma vez e ficar salvo.
            (Estamos testando se o mylaptime mantém a sessão após reiniciar.)</p>
        </div>
      )}

      <style>{`
        .pair-wrap{display:flex;justify-content:center;padding-top:6px}
        .pair-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:26px 28px;max-width:460px;width:100%;text-align:center}
        .pair-card.ok{border-color:var(--good)}
        .pair-ic{font-size:40px;line-height:1}
        .pair-card h2{font-size:18px;margin:8px 0 2px}
        .pair-live{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#fff;background:var(--s4);color:#000;padding:3px 10px;border-radius:20px;margin-bottom:6px}
        .pair-live i{width:7px;height:7px;border-radius:50%;background:#000;animation:pulse 1.4s infinite}
        .pair-steps{text-align:left;color:var(--ink-2);font-size:13.5px;margin:12px auto;max-width:340px;padding-left:18px;line-height:1.7}
        .pair-qr{width:240px;height:240px;object-fit:contain;background:#fff;border-radius:12px;padding:8px;margin:6px auto 12px;display:block}
        .pair-code{display:flex;flex-direction:column;align-items:center;gap:3px;margin-bottom:10px}
        .pair-code .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
        .pair-code code{font:600 15px ui-monospace,monospace;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;word-break:break-all;max-width:100%}
        .pair-stats{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin:12px 0 4px;font-size:12.5px;color:var(--ink-2)}
        .pair-stats .st{padding:2px 10px;border-radius:20px;border:1px solid var(--border)}
        .pair-stats .st.g{color:var(--good);border-color:var(--good)} .pair-stats .st.y{color:var(--s4);border-color:var(--s4)}
      `}</style>
    </div>
  );
}
