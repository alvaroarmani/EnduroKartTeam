import { useMemo } from 'react';
import { useEventData } from '../hooks/useEventData.js';
import { useStrategy } from '../hooks/useStrategy.js';
import { strategyStore } from '../lib/strategyStore.js';
import { computeStrategy } from '../lib/strategy-engine.js';
import { fmt } from '../lib/format.js';

function cfgFrom(st) {
  return {
    durationSec: st.durationMin * 60, totalStops: st.totalStops,
    stopCycleSec: st.stopCycleSec, minStopSec: st.minStopSec,
  };
}
function clock(sec) {
  if (sec == null || isNaN(sec)) return '—';
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' : '') + (h ? String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
const gapLaps = (n) => (n <= 0.02 ? '—' : '−' + n.toFixed(2) + ' v');

export default function StrategyEngine() {
  const { data } = useEventData();
  const [st] = useStrategy();

  const competitors = data?.drivers || [];
  const feedElapsed = data?.event?.raceClock?.ms ? data.event.raceClock.ms / 1000 : null;
  const wdElapsed = st.running && st.startedAt
    ? st.pausedElapsed + (Date.now() - st.startedAt) / 1000 : st.pausedElapsed;
  const elapsedSec = feedElapsed ?? wdElapsed;

  const res = useMemo(() => {
    const ours = new Map(
      (st.karts || []).filter((k) => k.number)
        .map((k) => [String(k.number), { stopsDone: k.stops, label: k.label }]),
    );
    const cfg = { ...cfgFrom(st), flag: data?.event?.flag?.state };
    return computeStrategy(competitors, cfg, ours, elapsedSec);
  }, [data, st, elapsedSec, competitors]);

  const { virtual, prediction, meta } = res;
  const setKartNum = (id, number) => strategyStore.set((s) => ({
    ...s, karts: s.karts.map((k) => (k.id === id ? { ...k, number: number.trim() } : k)),
  }));

  if (!competitors.length) {
    return <div className="state">sem dados do feed. O motor liga assim que o worker capturar um evento.</div>;
  }

  return (
    <div>
      {!meta.anyOurs && (
        <div className="banner">
          <b>Modo validação.</b> Nenhum kart nosso mapeado ao feed — as paradas de todos são
          <b> estimadas</b> (voltas longas no histórico) e a previsão usa a config da prova
          ({st.durationMin}min). Mapeie os nossos 4 karts abaixo para virar o modo de corrida real.
        </div>
      )}

      <section>
        <div className="clock-line">
          <span>Tempo de prova <b className="mono">{clock(meta.elapsedSec)}</b></span>
          <span>restam <b className="mono">{clock(meta.remainingSec)}</b></span>
          <span>paradas <b className="mono">{meta.totalStops}</b>/kart · ciclo <b className="mono">{Math.round(meta.stopLossSec / 60)}min</b></span>
          <span className="src">{feedElapsed != null ? 'relógio: feed' : 'relógio: watchdog'}</span>
        </div>
      </section>

      {/* CLASSIFICAÇÃO VIRTUAL */}
      <section>
        <h2>Classificação virtual — quem está ganhando de verdade</h2>
        <p className="sub">
          ordem se todos cumprissem AGORA as paradas que ainda devem. Δ = ganho/perda vs posição na pista.
          Rivais em <i>itálico</i> = paradas estimadas.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>V</th><th className="l">Kart</th><th>Pista</th><th>Δ</th>
                <th>Voltas</th><th>Paradas</th><th>Faltam</th><th>Gap virt.</th>
              </tr>
            </thead>
            <tbody>
              {virtual.map((r) => (
                <tr key={r.number} className={r.isOurs ? 'ours' : ''}>
                  <td><b>{r.virtualPos}º</b></td>
                  <td className="l"><span className={r.estimated ? 'est' : ''}>#{r.number} {r.name}</span>{r.isOurs ? <em className="tag">NOSSO</em> : null}</td>
                  <td className="mono">{r.pos}º</td>
                  <td className={'mono ' + (r.deltaPos > 0 ? 'up' : r.deltaPos < 0 ? 'down' : '')}>
                    {r.deltaPos > 0 ? '▲' + r.deltaPos : r.deltaPos < 0 ? '▼' + (-r.deltaPos) : '='}
                  </td>
                  <td className="mono">{r.lapsDone}</td>
                  <td className="mono">{r.stopsDone}/{meta.totalStops}</td>
                  <td className="mono">{r.pending}</td>
                  <td className="mono">{r.virtualPos === 1 ? '—' : gapLaps(r.vGapLaps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PREVISÃO */}
      <section>
        <h2>Previsão de resultado — bandeirada</h2>
        <p className="sub">
          voltas projetadas ≈ ritmo verde × (tempo restante − paradas que faltam × ciclo). Ordem final prevista.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>P</th><th className="l">Kart</th><th>Ritmo</th>
                <th>Voltas hoje</th><th>+ projetadas</th><th>Total prev.</th><th>Gap prev.</th>
              </tr>
            </thead>
            <tbody>
              {prediction.map((r) => (
                <tr key={r.number} className={r.isOurs ? 'ours' : ''}>
                  <td><b>{r.projPos}º</b></td>
                  <td className="l"><span className={r.estimated ? 'est' : ''}>#{r.number} {r.name}</span>{r.isOurs ? <em className="tag">NOSSO</em> : null}</td>
                  <td className="mono">{fmt(r.green)}</td>
                  <td className="mono">{r.lapsDone}</td>
                  <td className="mono">+{r.addLaps.toFixed(1)}</td>
                  <td className="mono"><b>{r.projLaps.toFixed(1)}</b></td>
                  <td className="mono">{r.projPos === 1 ? '—' : (r.projGapSec != null && r.projGapLaps < 1 ? '−' + fmt(r.projGapSec) : gapLaps(r.projGapLaps))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="foot">
          ⚠ Projeção assume corrida sem interrupção. <b>Bandeira vermelha neutraliza distâncias (regra 7.2)</b> e
          safety car reembaralha — reavaliar na hora. Ignore os gaps nas 2–3 voltas após qualquer ciclo de box.
        </p>
      </section>

      {/* MAPEAMENTO DOS NOSSOS KARTS */}
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 13, margin: '6px 2px' }}>
          Nossos karts → nº no mylaptime (destrava o modo de corrida real)
        </summary>
        <section>
          <p className="sub">
            Informe o número de cada kart nosso como aparece no feed. Aí as paradas deixam de ser
            estimadas e passam a vir do Watchdog (contador x/7). Paradas se editam na aba Estratégia.
          </p>
          <div className="map-grid">
            {(st.karts || []).map((k) => (
              <label key={k.id}>
                <span>{k.label} · paradas {k.stops}/{st.totalStops}</span>
                <input className="mono" placeholder="nº feed" value={k.number || ''}
                  onChange={(e) => setKartNum(k.id, e.target.value)} />
              </label>
            ))}
          </div>
        </section>
      </details>

      <style>{`
        .banner{background:var(--accent-soft);border:1px solid var(--accent);border-radius:10px;
          padding:10px 13px;font-size:13px;color:var(--ink);margin-bottom:16px;line-height:1.45}
        .clock-line{display:flex;gap:18px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--ink-2)}
        .clock-line .src{margin-left:auto;color:var(--muted);font-size:12px}
        tr.ours td{background:var(--accent-soft)}
        tr.ours td:first-child{color:var(--ink)}
        .tag{font-style:normal;font-size:9.5px;font-weight:700;letter-spacing:.04em;color:#fff;
          background:var(--accent);padding:1px 5px;border-radius:9px;margin-left:6px;vertical-align:middle}
        .est{font-style:italic;color:var(--ink-2)}
        td.up{color:var(--good);font-weight:600} td.down{color:var(--live);font-weight:600}
        .map-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .map-grid label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
        .map-grid input{padding:6px 8px;border:1px solid var(--border);background:var(--surface-2);
          color:var(--ink);border-radius:6px;font-size:14px}
        @media (max-width:640px){ .map-grid{grid-template-columns:repeat(2,1fr)} }
      `}</style>
    </div>
  );
}
