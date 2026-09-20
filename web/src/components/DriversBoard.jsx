import { useMemo, useState } from 'react';
import { useEventData } from '../hooks/useEventData.js';
import { useStrategy } from '../hooks/useStrategy.js';
import { strategyStore } from '../lib/strategyStore.js';
import { greenPace } from '../lib/strategy-engine.js';
import { driverRating } from '../lib/decisions.js';
import { fmt } from '../lib/format.js';

const uid = () => 'p' + Math.random().toString(36).slice(2, 8);
const EXP = { A: { t: 'experiente', bump: 8 }, B: { t: 'médio', bump: 0 }, C: { t: 'novato', bump: -8 } };
const ROSTER_MAX = 16; // plantel da equipe

export default function DriversBoard() {
  const { data } = useEventData();
  const [st] = useStrategy();
  const [newName, setNewName] = useState('');
  const drivers = data?.drivers || [];
  const nStints = st.totalStops + 1;
  const roster = st.roster || [];

  // referências do grid para normalizar a habilidade medida
  const ref = useMemo(() => {
    const greens = drivers.map((d) => greenPace(d.laps)).filter(Boolean);
    const sds = drivers.map((d) => d.sd).filter((x) => x != null);
    return { refBestMs: greens.length ? Math.min(...greens) : null, refSdMs: sds.length ? Math.min(...sds) : null };
  }, [drivers]);

  // kart em que cada piloto está agora (st.current[kartId] = driverId) → dados medidos
  const measuredByDriver = useMemo(() => {
    const m = new Map();
    for (const k of st.karts || []) {
      const did = st.current?.[k.id];
      if (!did || !k.number) continue;
      const d = drivers.find((x) => String(x.number) === String(k.number));
      if (!d) continue;
      const rating = driverRating({ greenMs: greenPace(d.laps) || d.avg, sdMs: d.sd }, ref);
      m.set(did, { kart: k, feed: d, rating });
    }
    return m;
  }, [st.karts, st.current, drivers, ref]);

  // ranking de ritmo dos karts (base p/ "piloto forte no kart fraco")
  const kartRank = useMemo(() => {
    const ourNums = new Set((st.karts || []).filter((k) => k.number).map((k) => String(k.number)));
    const rows = drivers
      .filter((d) => !ourNums.size || ourNums.has(String(d.number)))
      .map((d) => ({ number: String(d.number), name: d.name, green: greenPace(d.laps) || d.avg, sd: d.sd, ours: ourNums.has(String(d.number)) }))
      .sort((a, b) => (a.green || 9e9) - (b.green || 9e9));
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [drivers, st.karts]);

  // ── ações no store ──
  const addDriver = () => {
    const name = newName.trim(); if (!name) return;
    strategyStore.set((s) => ({ ...s, roster: [...(s.roster || []), { id: uid(), name, exp: 'B', pressure: false }] }));
    setNewName('');
  };
  const setExp = (id, exp) => strategyStore.set((s) => ({ ...s, roster: s.roster.map((r) => (r.id === id ? { ...r, exp } : r)) }));
  const togglePressure = (id) => strategyStore.set((s) => ({ ...s, roster: s.roster.map((r) => (r.id === id ? { ...r, pressure: !r.pressure } : r)) }));
  const rmDriver = (id) => strategyStore.set((s) => ({
    ...s, roster: s.roster.filter((r) => r.id !== id),
    plan: Object.fromEntries(Object.entries(s.plan || {}).map(([k, arr]) => [k, (arr || []).map((x) => (x === id ? '' : x))])),
    current: Object.fromEntries(Object.entries(s.current || {}).map(([k, v]) => [k, v === id ? '' : v])),
  }));
  const setCurrent = (kartId, driverId) => strategyStore.set((s) => ({ ...s, current: { ...(s.current || {}), [kartId]: driverId } }));
  const setPlan = (kartId, stintIdx, driverId) => strategyStore.set((s) => {
    const plan = { ...(s.plan || {}) };
    const arr = (plan[kartId] || []).slice(); arr[stintIdx] = driverId; plan[kartId] = arr;
    return { ...s, plan };
  });

  const rating = (r) => {
    const measured = measuredByDriver.get(r.id)?.rating || null;
    const overall = measured ? Math.max(0, Math.min(100, measured.overall + EXP[r.exp].bump)) : null;
    return { measured, overall };
  };
  const pressureZone = (si) => si >= nStints - 2; // últimas 2 stints = pressão
  const weakInPressure = (r) => r && (r.exp === 'C' || !r.pressure);

  return (
    <div>
      {/* PLANTEL */}
      <section>
        <div className="hd"><h2>Plantel ({roster.length}/{ROSTER_MAX})</h2></div>
        <p className="sub">habilidade <b>híbrida</b>: <b>medido</b> (ritmo+consistência dos dados) + seu <b>nível</b> e a
          aptidão para <b>pressão</b> (quem entra nas stints finais).</p>
        <div className="ros">
          {roster.map((r) => {
            const { measured, overall } = rating(r);
            const cur = measuredByDriver.get(r.id);
            return (
              <div className="pcard" key={r.id}>
                <div className="pcard-top">
                  <span className="pname">{r.name}</span>
                  <span className={'score' + (overall == null ? ' na' : overall >= 85 ? ' hi' : overall >= 70 ? ' mid' : ' lo')}>
                    {overall == null ? '—' : overall}
                  </span>
                </div>
                <div className="pmeta">
                  {measured
                    ? <span>ritmo <b>{measured.speed}</b> · regul. <b>{measured.consist}</b>{cur ? <> · {cur.kart.label}</> : null}</span>
                    : <span className="muted">sem dados medidos (defina o piloto atual num kart)</span>}
                </div>
                <div className="ptraits">
                  <div className="exp">
                    {['A', 'B', 'C'].map((e) => (
                      <button key={e} className={'chip' + (r.exp === e ? ' on' : '')} title={EXP[e].t} onClick={() => setExp(r.id, e)}>{e}</button>
                    ))}
                  </div>
                  <button className={'chip pr' + (r.pressure ? ' on' : '')} onClick={() => togglePressure(r.id)} title="aptidão para stints de pressão">
                    {r.pressure ? '🔥 pressão' : 'pressão?'}
                  </button>
                  <button className="chip rm" onClick={() => rmDriver(r.id)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
        {roster.length < ROSTER_MAX && (
          <div className="ros-add">
            <input placeholder="nome do piloto" value={newName}
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDriver()} />
            <button className="btn" onClick={addDriver}>+ adicionar</button>
          </div>
        )}
        <p className="foot">Nota medida = ritmo vs o mais rápido do grid + consistência (0–100). Nível ajusta ±8. 🔥 = apto a pressão.</p>
      </section>

      {/* QUEM ESTÁ EM CADA KART AGORA */}
      <section>
        <h2>Piloto atual por kart</h2>
        <p className="sub">liga o piloto aos dados medidos e aparece no Cockpit.</p>
        <div className="cur-grid">
          {(st.karts || []).map((k) => (
            <label key={k.id} className="cur">
              <span>{k.label}{k.number ? ' #' + k.number : ''}</span>
              <select value={st.current?.[k.id] || ''} onChange={(e) => setCurrent(k.id, e.target.value)} className={st.current?.[k.id] ? '' : 'empty'}>
                <option value="">—</option>
                {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      {/* RITMO DOS KARTS */}
      <section>
        <h2>Ritmo dos karts {kartRank.some((r) => r.ours) ? '(nossos)' : '(grid)'}</h2>
        <p className="sub">kart de aluguel varia — ponha o piloto mais forte no kart mais lento.</p>
        <table>
          <thead><tr><th>Rank</th><th className="l">Kart</th><th>Ritmo verde</th><th>Consist.</th></tr></thead>
          <tbody>
            {kartRank.map((r) => (
              <tr key={r.number} className={r.ours ? 'ours' : ''}>
                <td><b>{r.rank}º</b></td>
                <td className="l">#{r.number} {r.name}{r.ours ? <em className="tag">NOSSO</em> : ''}</td>
                <td className="mono">{fmt(r.green)}</td>
                <td className="mono">{r.sd != null ? '±' + (r.sd / 1000).toFixed(3) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ROTAÇÃO */}
      <section>
        <div className="hd"><h2>Rotação — {st.karts.length} karts × {nStints} stints</h2>
          <span className="pz-key">🔥 stints finais = pressão</span></div>
        <p className="sub">quem dirige cada stint. As <b>últimas 2 stints</b> são zona de pressão: o sistema avisa se cair um novato ou alguém não-apto ali.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="plan">
            <thead>
              <tr><th className="l">Stint</th>{st.karts.map((k) => <th key={k.id}>{k.label}{k.number ? ' #' + k.number : ''}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: nStints }, (_, si) => (
                <tr key={si} className={pressureZone(si) ? 'pz' : ''}>
                  <td className="l mono">{si + 1}{si === 0 ? ' (largada)' : pressureZone(si) ? ' 🔥' : ''}</td>
                  {st.karts.map((k) => {
                    const val = (st.plan?.[k.id] || [])[si] || '';
                    const r = roster.find((x) => x.id === val);
                    const warn = pressureZone(si) && weakInPressure(r);
                    return (
                      <td key={k.id}>
                        <select value={val} onChange={(e) => setPlan(k.id, si, e.target.value)}
                          className={(val ? '' : 'empty') + (warn ? ' warn' : '')} title={warn ? 'stint de pressão com piloto novato/não-apto' : ''}>
                          <option value="">—</option>
                          {roster.map((rr) => <option key={rr.id} value={rr.id}>{rr.name}{rr.pressure ? ' 🔥' : ''}</option>)}
                        </select>
                        {warn && <span className="warn-ic" title="pressão: reveja">⚠</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {roster.length > 0 && (
          <p className="foot">Uso: {roster.map((r) => {
            const used = st.karts.reduce((n, k) => n + ((st.plan?.[k.id] || []).filter((x) => x === r.id).length), 0);
            return <span key={r.id} className="use">{r.name} <b>{used}</b></span>;
          })}</p>
        )}
      </section>

      <style>{`
        .hd{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
        .pz-key{font-size:11px;color:var(--muted)}
        tr.ours td{background:var(--accent-soft)} tr.ours td:first-child{color:var(--ink)}
        .tag{font-style:normal;font-size:9.5px;font-weight:700;color:#fff;background:var(--accent);padding:1px 5px;border-radius:9px;margin-left:6px}
        .ros{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
        .pcard{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
        .pcard-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
        .pname{font-size:14px;font-weight:600}
        .score{font:700 15px ui-monospace,monospace;min-width:30px;text-align:center;padding:1px 7px;border-radius:7px}
        .score.hi{background:color-mix(in srgb,var(--good) 20%,transparent);color:var(--good)}
        .score.mid{background:color-mix(in srgb,var(--s4) 20%,transparent);color:var(--s4)}
        .score.lo{background:color-mix(in srgb,var(--live) 18%,transparent);color:var(--live)}
        .score.na{background:var(--surface);color:var(--muted)}
        .pmeta{font-size:11.5px;color:var(--ink-2);margin-bottom:7px;min-height:15px}
        .ptraits{display:flex;gap:5px;align-items:center}
        .exp{display:flex;gap:3px}
        .chip{font-size:11px;padding:3px 7px;border:1px solid var(--border);background:var(--surface);color:var(--muted);border-radius:6px;cursor:pointer}
        .chip.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
        .chip.pr{margin-left:auto} .chip.pr.on{background:var(--s2);border-color:var(--s2);color:#fff}
        .chip.rm{color:var(--live)}
        .ros-add{display:flex;gap:8px;margin-bottom:4px}
        .ros-add input{flex:1;padding:7px 10px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);border-radius:8px;font-size:13px}
        .btn{font-size:13px;padding:7px 14px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:8px;cursor:pointer;font-weight:600}
        .cur-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .cur{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted)}
        .cur select,.plan select{padding:6px 8px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);border-radius:6px;font-size:12.5px;width:100%}
        .cur select.empty,.plan select.empty{color:var(--muted)}
        .plan select.warn{border-color:var(--live);color:var(--live)}
        .plan td,.plan th{text-align:center;position:relative} .plan td.l,.plan th.l{text-align:left}
        tr.pz td{background:color-mix(in srgb,var(--s2) 8%,transparent)}
        .warn-ic{position:absolute;top:2px;right:3px;color:var(--live);font-size:11px}
        .use{margin-right:12px;color:var(--ink-2)}
        @media (max-width:640px){ .ros{grid-template-columns:repeat(2,1fr)} .cur-grid{grid-template-columns:repeat(2,1fr)} }
      `}</style>
    </div>
  );
}
