import { useEffect, useMemo, useRef, useState } from 'react';
import { useEventData } from '../hooks/useEventData.js';
import { useStrategy } from '../hooks/useStrategy.js';
import { greenPace } from '../lib/strategy-engine.js';
import { timeline, degradation } from '../lib/analytics.js';
import { elapsedFrom, boxState, fmtClock } from '../lib/race.js';
import { fmt } from '../lib/format.js';

const ICON = { pit: '🅿️', fastest: '⚡', lead: '🏁', flag: '🚩', live: '•' };

export default function RaceTimeline() {
  const { data, updatedAt } = useEventData();
  const [st] = useStrategy();
  const drivers = data?.drivers || [];
  const elapsedSec = elapsedFrom(data, st);

  // acumulador AO VIVO: registra troca de bandeira e de líder entre atualizações.
  const [liveEvents, setLiveEvents] = useState([]);
  const last = useRef({ flag: null, leader: null });
  useEffect(() => {
    if (!data) return;
    const flag = data.event?.flag?.state;
    const leader = drivers.find((d) => d.pos === 1);
    const add = [];
    if (flag && last.current.flag && flag !== last.current.flag) add.push({ t: Date.now(), type: 'flag', txt: 'bandeira ' + flag });
    if (leader && last.current.leader && String(leader.number) !== last.current.leader) add.push({ t: Date.now(), type: 'lead', txt: 'novo líder #' + leader.number + ' ' + leader.name });
    last.current = { flag: flag ?? last.current.flag, leader: leader ? String(leader.number) : last.current.leader };
    if (add.length) setLiveEvents((prev) => [...add, ...prev].slice(0, 30));
  }, [updatedAt]); // eslint-disable-line

  // ALERTAS acionáveis do estado atual
  const alerts = useMemo(() => {
    const out = [];
    const flag = data?.event?.flag?.state;
    if (flag === 'yellow' || flag === 'red') out.push({ cls: 'warn', txt: 'Bandeira ' + flag + ' — reavaliar box (parar sob neutralização é tempo grátis).' });
    for (const k of (st.karts || []).filter((x) => x.number)) {
      const d = drivers.find((x) => String(x.number) === String(k.number));
      if (!d) continue;
      const pending = Math.max(0, st.totalStops - k.stops);
      const box = boxState(st, elapsedSec, pending);
      if (pending > 0 && box.level === 'crit') out.push({ cls: 'crit', txt: k.label + ' (#' + k.number + '): folga crítica — PARAR AGORA.' });
      else if (pending > 0 && box.level === 'warn') out.push({ cls: 'warn', txt: k.label + ' (#' + k.number + '): parar em breve (até ' + fmtClock(box.timeToNextDeadline) + ').' });
      const deg = degradation(d.laps, greenPace(d.laps) || d.avg);
      if (deg && deg.dir === 'down' && deg.delta > 800) out.push({ cls: 'warn', txt: k.label + ' (#' + k.number + '): ritmo caindo ' + (deg.delta / 1000).toFixed(1) + 's — avaliar troca/box.' });
    }
    return out;
  }, [data, st, elapsedSec, drivers]);

  const story = useMemo(() => timeline(drivers, { limit: 40 }), [drivers]);

  if (!drivers.length) return <div className="state">sem dados do feed.</div>;

  return (
    <div>
      <section>
        <h2>Alertas</h2>
        {alerts.length === 0 ? <p className="sub">tudo sob controle — nenhum alerta ativo.</p> : (
          <div className="alerts">
            {alerts.map((a, i) => <div key={i} className={'alert ' + a.cls}>{a.txt}</div>)}
          </div>
        )}
      </section>

      {liveEvents.length > 0 && (
        <section>
          <h2>Ao vivo</h2>
          <ul className="tl">
            {liveEvents.map((e, i) => (
              <li key={i}><span className="tl-ic">{ICON[e.type] || ICON.live}</span>
                <span className="tl-tx">{e.txt}</span>
                <span className="tl-at mono">{new Date(e.t).toLocaleTimeString('pt-BR')}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>História da corrida</h2>
        <p className="sub">reconstruída do histórico volta a volta: paradas, recordes de volta e trocas de liderança.</p>
        <ul className="tl">
          {story.map((e, i) => (
            <li key={i}>
              <span className="tl-ic">{ICON[e.type]}</span>
              <span className="tl-lap mono">V{e.n}</span>
              <span className="tl-tx">
                {e.type === 'pit' && <>#{e.number} {e.name} — <b>parada</b> ({fmtClock(e.ms / 1000)})</>}
                {e.type === 'fastest' && <>#{e.number} {e.name} — volta rápida <b className="best">{fmt(e.ms)}</b></>}
                {e.type === 'lead' && <>#{e.number} {e.name} — <b>assumiu a liderança</b></>}
              </span>
            </li>
          ))}
          {story.length === 0 && <li className="muted">sem eventos ainda.</li>}
        </ul>
      </section>

      <style>{`
        .alerts{display:flex;flex-direction:column;gap:8px}
        .alert{padding:9px 12px;border-radius:8px;font-size:13px;border:1px solid;font-weight:500}
        .alert.crit{background:color-mix(in srgb,var(--live) 14%,transparent);border-color:var(--live);color:var(--live)}
        .alert.warn{background:color-mix(in srgb,var(--s4) 16%,transparent);border-color:var(--s4)}
        .tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
        .tl li{display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid var(--border);font-size:13px}
        .tl li.muted{color:var(--muted);border:0}
        .tl-ic{width:20px;text-align:center}
        .tl-lap{color:var(--muted);width:38px;font-size:12px}
        .tl-tx{flex:1;color:var(--ink-2)}
        .tl-at{color:var(--muted);font-size:12px}
        .best{color:var(--good)}
      `}</style>
    </div>
  );
}
