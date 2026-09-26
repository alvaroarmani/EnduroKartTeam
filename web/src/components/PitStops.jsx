import { useEffect, useRef, useState } from 'react';
import { useStrategy } from '../hooks/useStrategy.js';
import { strategyStore } from '../lib/strategyStore.js';

/*
 * Checklist de PARADA (operacional do box). Um "secretário de box" opera isto nas ~7 paradas.
 * Cronômetro com as zonas EXATAS do regulamento FDK:
 *   < 4:55.000  → NÃO conta como parada obrigatória
 *   4:55–4:59.999 → conta, mas −2 voltas (9.2)
 *   ≥ 5:00.000  → limpa
 * + kart sorteado (trava anti-DQ 9.4 e alimenta a inteligência por kart), placa, sensor,
 *   pesagem (≥100kg) e lastro removido (9.3).
 */
function mmss(sec) {
  if (sec == null || isNaN(sec)) return '0:00.0';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + Math.floor((s * 10) % 10);
}

export default function PitStops() {
  const [st] = useStrategy();
  const [now, setNow] = useState(Date.now());
  const tick = useRef(null);
  useEffect(() => { tick.current = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(tick.current); }, []);

  const minStop = st.minStopSec || 300;      // 5:00
  const invalidBelow = minStop - 5;          // 4:55
  const bufferTarget = minStop + 5;          // 5:05 (alvo com folga)

  const enter = (k) => strategyStore.set((s) => ({ ...s, pit: { ...(s.pit || {}), [k.id]: { startedAt: Date.now(), drawnKart: '', plate: false, sensor: false, weighed: false, ballastOut: false } } }));
  const upd = (kid, patch) => strategyStore.set((s) => ({ ...s, pit: { ...(s.pit || {}), [kid]: { ...(s.pit?.[kid] || {}), ...patch } } }));
  const cancel = (kid) => strategyStore.set((s) => { const pit = { ...(s.pit || {}) }; delete pit[kid]; return { ...s, pit }; });
  const exit = (k) => strategyStore.set((s) => {
    const p = s.pit?.[k.id]; if (!p) return s;
    const durationMs = Date.now() - p.startedAt;
    const durSec = durationMs / 1000;
    const valid = durSec >= invalidBelow;
    const penalty = valid && durSec < minStop; // 4:55–5:00 = conta com −2 voltas
    const karts = s.karts.map((x) => (x.id === k.id && valid ? { ...x, stops: Math.min(s.totalStops, (x.stops || 0) + 1) } : x));
    const stopsLog = [{ kartId: k.id, label: k.label, endedAt: Date.now(), durationMs, drawnKart: p.drawnKart, valid, penalty }, ...(s.stopsLog || [])].slice(0, 40);
    const pit = { ...(s.pit || {}) }; delete pit[k.id];
    return { ...s, karts, stopsLog, pit };
  });

  const zone = (sec) => {
    if (sec < invalidBelow) return { cls: 'crit', txt: '⛔ ABAIXO DE 4:55 — não conta', hint: 'falta ' + mmss(invalidBelow - sec) + ' pra 4:55' };
    if (sec < minStop) return { cls: 'warn', txt: '⚠ conta, mas −2 VOLTAS', hint: 'espere ' + mmss(minStop - sec) + ' pra fechar 5:00' };
    if (sec < bufferTarget) return { cls: 'ok', txt: '✅ PODE SAIR (5:00 cumprido)', hint: 'buffer até 5:05' };
    return { cls: 'ok', txt: '✅ SAIR — cada segundo é tempo perdido', hint: '' };
  };

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>Opere aqui nas paradas. O relógio <b>oficial é o do sensor</b> — por isso miramos <b>5:03–5:05</b>, não 5:00.
        &lt;4:55 <b>não conta</b> (risco de DQ por faltar parada). 4:55–5:00 = <b>−2 voltas</b>.</p>

      <div className="pit-grid">
        {(st.karts || []).map((k) => {
          const p = st.pit?.[k.id];
          const pending = Math.max(0, st.totalStops - (k.stops || 0));
          if (!p) {
            return (
              <div className="pitc" key={k.id}>
                <div className="pitc-top"><b>{k.label}</b>{k.number ? <span className="mono num">#{k.number}</span> : null}</div>
                <div className="pitc-stops">paradas <b className="mono">{k.stops || 0}/{st.totalStops}</b> · faltam {pending}</div>
                <button className="btn enter" onClick={() => enter(k)} disabled={pending <= 0}>{pending <= 0 ? '✓ paradas cumpridas' : '▶ Entrar no box'}</button>
              </div>
            );
          }
          const sec = (now - p.startedAt) / 1000;
          const z = zone(sec);
          const done = p.drawnKart && p.plate && p.sensor && p.weighed && p.ballastOut;
          return (
            <div className={'pitc inbox ' + z.cls} key={k.id}>
              <div className="pitc-top"><b>{k.label}</b><span className="badge-box">NO BOX</span></div>
              <div className={'timer ' + z.cls}>{mmss(sec)}</div>
              <div className={'zone ' + z.cls}>{z.txt}{z.hint ? <small> · {z.hint}</small> : null}</div>
              <div className="checks">
                <label className="chk-kart">kart sorteado
                  <input className="mono" placeholder="nº" value={p.drawnKart} onChange={(e) => upd(k.id, { drawnKart: e.target.value.trim() })} /></label>
                {[['plate', 'placa no kart'], ['sensor', 'sensor/caneleira'], ['weighed', 'pesagem ≥100kg'], ['ballastOut', 'lastro removido']].map(([key, lbl]) => (
                  <label key={key} className={'chk' + (p[key] ? ' on' : '')}>
                    <input type="checkbox" checked={!!p[key]} onChange={(e) => upd(k.id, { [key]: e.target.checked })} />{lbl}
                  </label>
                ))}
              </div>
              <div className="pit-btns">
                <button className="btn ghost" onClick={() => cancel(k.id)}>cancelar</button>
                <button className={'btn out ' + z.cls} onClick={() => { if (sec < invalidBelow && !confirm('Abaixo de 4:55 — esta parada NÃO conta como obrigatória. Sair mesmo assim?')) return; if (!done && !confirm('Checklist incompleto (kart sorteado/placa/sensor/pesagem/lastro). Sair mesmo assim?')) return; exit(k); }}>
                  Sair (+1)
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {(st.stopsLog || []).length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h2>Paradas registradas</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th className="l">Kart</th><th>Duração</th><th>Kart sorteado</th><th>Válida</th><th className="l">Obs</th></tr></thead>
              <tbody>
                {st.stopsLog.map((l, i) => (
                  <tr key={i}>
                    <td className="l">{l.label}</td>
                    <td className="mono">{mmss(l.durationMs / 1000)}</td>
                    <td className="mono">{l.drawnKart || '—'}</td>
                    <td>{l.valid ? <span className="ok-t">✓{l.penalty ? ' (−2v)' : ''}</span> : <span className="crit-t">não contou</span>}</td>
                    <td className="l foot">{new Date(l.endedAt).toLocaleTimeString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style>{`
        .pit-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .pitc{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px}
        .pitc.inbox{border-width:2px}
        .pitc.inbox.ok{border-color:var(--good)} .pitc.inbox.warn{border-color:var(--s4)} .pitc.inbox.crit{border-color:var(--live)}
        .pitc-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
        .pitc-top .num{color:var(--ink-2);font-size:12px}
        .badge-box{font-size:9.5px;font-weight:800;color:#fff;background:var(--s2);padding:2px 7px;border-radius:20px}
        .pitc-stops{font-size:13px;color:var(--ink-2);margin-bottom:12px}
        .btn{font:600 13px system-ui;padding:9px 14px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);border-radius:9px;cursor:pointer;width:100%}
        .btn.enter{background:var(--accent);border-color:var(--accent);color:#fff}
        .btn:disabled{opacity:.5;cursor:default;background:var(--surface-2);color:var(--muted)}
        .timer{font:800 34px ui-monospace,monospace;text-align:center;letter-spacing:-.02em;margin:2px 0}
        .timer.ok{color:var(--good)} .timer.warn{color:var(--s4)} .timer.crit{color:var(--live)}
        .zone{text-align:center;font-size:12.5px;font-weight:700;margin-bottom:10px}
        .zone.ok{color:var(--good)} .zone.warn{color:var(--s4)} .zone.crit{color:var(--live)}
        .zone small{font-weight:400;color:var(--muted)}
        .checks{display:flex;flex-direction:column;gap:6px;margin-bottom:10px}
        .chk,.chk-kart{font-size:12.5px;color:var(--ink-2);display:flex;align-items:center;gap:7px}
        .chk.on{color:var(--good)} .chk input{width:15px;height:15px}
        .chk-kart{justify-content:space-between} .chk-kart input{width:64px;padding:4px 7px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);border-radius:6px}
        .pit-btns{display:flex;gap:8px} .pit-btns .btn{width:auto;flex:1}
        .btn.ghost{background:transparent;color:var(--muted)}
        .btn.out.ok{background:var(--good);border-color:var(--good);color:#fff}
        .btn.out.warn{background:var(--s4);border-color:var(--s4);color:#000}
        .btn.out.crit{background:var(--live);border-color:var(--live);color:#fff}
        .ok-t{color:var(--good)} .crit-t{color:var(--live)}
        @media (max-width:900px){ .pit-grid{grid-template-columns:repeat(2,1fr)} }
        @media (max-width:480px){ .pit-grid{grid-template-columns:1fr} }
      `}</style>
    </div>
  );
}
