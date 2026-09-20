import { useEffect, useRef, useState } from 'react';
import { useStrategy } from '../hooks/useStrategy.js';
import { strategyStore, DEFAULTS } from '../lib/strategyStore.js';

/*
 * Ponto-chave do plano de estratégia: WATCHDOG ANTI-DQ.
 * Relógio da prova + janela do box (+10 abre / −20 fecha) + contador de paradas por kart
 * + FOLGA até o box fechar (a métrica-mãe do enduro). Estado no store compartilhado
 * (strategyStore): o motor Virtual/Previsão lê as MESMAS paradas em tempo real.
 * A versão sincronizada entre o box (WebSocket) troca só o strategyStore.
 */
function fmtClock(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const neg = sec < 0; sec = Math.abs(Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const str = (h ? h + ':' : '') + (h ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  return (neg ? '−' : '') + str;
}

export default function StrategyPanel() {
  const [st] = useStrategy();
  const [now, setNow] = useState(Date.now());
  const tick = useRef(null);
  useEffect(() => { tick.current = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(tick.current); }, []);

  const elapsedSec = st.running && st.startedAt ? st.pausedElapsed + (now - st.startedAt) / 1000 : st.pausedElapsed;
  const durationSec = st.durationMin * 60;
  const remainingSec = durationSec - elapsedSec;
  const boxOpenSec = st.boxOpenMin * 60;
  const boxCloseSec = durationSec - st.boxCloseBeforeEndMin * 60; // instante em que o box fecha
  const timeToBoxClose = boxCloseSec - elapsedSec;

  const boxState = elapsedSec < boxOpenSec
    ? { txt: 'abre em ' + fmtClock(boxOpenSec - elapsedSec), cls: 'muted' }
    : (elapsedSec > boxCloseSec ? { txt: 'FECHADO', cls: 'crit' } : { txt: 'aberto · fecha em ' + fmtClock(timeToBoxClose), cls: 'ok' });

  function upd(p) { strategyStore.update(p); }
  function start() { upd({ running: true, startedAt: Date.now() }); }
  function pause() { upd({ running: false, pausedElapsed: elapsedSec, startedAt: null }); }
  function reset() { if (confirm('Zerar relógio e paradas?')) strategyStore.set((s) => ({ ...DEFAULTS, karts: s.karts.map((k) => ({ ...k, stops: 0 })), durationMin: s.durationMin, boxOpenMin: s.boxOpenMin, boxCloseBeforeEndMin: s.boxCloseBeforeEndMin, minStopSec: s.minStopSec, stopCycleSec: s.stopCycleSec, totalStops: s.totalStops })); }
  function setStops(i, d) { strategyStore.set((s) => { const k = s.karts.map((x) => ({ ...x })); k[i].stops = Math.max(0, Math.min(s.totalStops, k[i].stops + d)); return { ...s, karts: k }; }); }

  const kartCards = st.karts.map((k, i) => {
    const remaining = st.totalStops - k.stops;
    const required = remaining * st.stopCycleSec;       // tempo mínimo p/ cumprir as restantes
    const folga = timeToBoxClose - required;            // margem anti-DQ
    let cls = 'ok';
    if (k.stops >= st.totalStops) cls = 'done';
    else if (folga < 120) cls = 'crit';
    else if (folga < 300) cls = 'warn';
    return { k, i, remaining, folga, cls, done: k.stops >= st.totalStops };
  });

  return (
    <div>
      <section>
        <div className="clock">
          <div>
            <div className="k">Tempo de prova</div>
            <div className="clock-big mono">{fmtClock(elapsedSec)}</div>
            <div className="foot">restam <b className="mono">{fmtClock(remainingSec)}</b> · box: <b className={'st-' + boxState.cls}>{boxState.txt}</b></div>
          </div>
          <div className="clock-btns">
            {!st.running ? <button className="btn primary" onClick={start}>{st.pausedElapsed ? 'Retomar' : 'Iniciar'}</button>
              : <button className="btn" onClick={pause}>Pausar</button>}
            <button className="btn ghost" onClick={reset}>Zerar</button>
          </div>
        </div>
        <p className="sub" style={{ marginTop: 8 }}>
          Watchdog anti-DQ: <b>folga</b> = tempo até o box fechar − (paradas restantes × ciclo de {Math.round(st.stopCycleSec / 60)}min).
          Verde = tranquilo · amarelo = aperta · vermelho = <b>pare agora</b>.
        </p>
      </section>

      <div className="kart-grid">
        {kartCards.map(({ k, i, remaining, folga, cls, done }) => (
          <div className={'kart ' + cls} key={k.id}>
            <div className="kart-top"><b>{k.label}</b><span className="mono">{k.stops}/{st.totalStops}</span></div>
            {done ? <div className="folga ok-txt">✓ paradas cumpridas</div>
              : <div className={'folga folga-' + cls}>{folga >= 0 ? 'folga ' : 'ATRASADO '}<span className="mono">{fmtClock(folga)}</span></div>}
            <div className="foot" style={{ margin: '2px 0 8px' }}>{remaining} parada(s) restante(s)</div>
            <div className="kart-btns">
              <button className="btn" onClick={() => setStops(i, -1)} disabled={k.stops <= 0}>−</button>
              <button className="btn primary" onClick={() => setStops(i, +1)} disabled={done}>parada +1</button>
            </div>
          </div>
        ))}
      </div>

      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 13, margin: '6px 2px' }}>Configuração da prova (regras FDK)</summary>
        <section>
          <div className="cfg">
            {[['Duração (min)', 'durationMin'], ['Box abre (+min)', 'boxOpenMin'], ['Box fecha (−min do fim)', 'boxCloseBeforeEndMin'],
              ['Parada mín (s)', 'minStopSec'], ['Ciclo por parada (s)', 'stopCycleSec'], ['Paradas obrigatórias', 'totalStops']].map(([lbl, key]) => (
              <label key={key}><span>{lbl}</span>
                <input type="number" value={st[key]} onChange={(e) => upd({ [key]: Number(e.target.value) })} /></label>
            ))}
          </div>
          <p className="foot">Padrões: 240min, abre +10, fecha −20, parada ≥300s, ciclo ~480s (medir no ensaio), 7 paradas.
            Reconfirmar no briefing 13:30 (regra 1.3).</p>
        </section>
      </details>

      <style>{`
        .clock{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
        .clock-big{font-size:38px;letter-spacing:-.02em;line-height:1.05}
        .clock-btns{display:flex;gap:8px}
        .btn{font:13px system-ui;padding:8px 14px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);border-radius:8px;cursor:pointer}
        .btn.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
        .btn.ghost{background:transparent;color:var(--muted)}
        .btn:disabled{opacity:.4;cursor:not-allowed}
        .st-ok{color:var(--good)} .st-crit{color:var(--live)} .st-muted{color:var(--muted)}
        .kart-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
        .kart{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px}
        .kart.warn{border-color:#eda100} .kart.crit{border-color:var(--live)} .kart.done{border-color:var(--good)}
        .kart-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
        .folga{font-size:22px;letter-spacing:-.01em}
        .folga-ok{color:var(--good)} .folga-warn{color:#eda100} .folga-crit{color:var(--live);font-weight:700}
        .ok-txt{color:var(--good);font-size:15px} .kart-btns{display:flex;gap:6px}
        .kart-btns .btn{flex:1;text-align:center}
        .cfg{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .cfg label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
        .cfg input{font:14px ui-monospace,monospace;padding:6px 8px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);border-radius:6px}
        @media (max-width:640px){ .kart-grid{grid-template-columns:repeat(2,1fr)} .cfg{grid-template-columns:repeat(2,1fr)} .clock-big{font-size:30px} }
      `}</style>
    </div>
  );
}
