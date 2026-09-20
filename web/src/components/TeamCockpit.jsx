import { useMemo } from 'react';
import { useEventData } from '../hooks/useEventData.js';
import { useStrategy } from '../hooks/useStrategy.js';
import { computeStrategy, greenPace } from '../lib/strategy-engine.js';
import { paceRank, currentStint, degradation } from '../lib/analytics.js';
import { elapsedFrom, boxState, fmtClock } from '../lib/race.js';
import { decideKart } from '../lib/decisions.js';
import { fmt } from '../lib/format.js';

export default function TeamCockpit() {
  const { data } = useEventData();
  const [st] = useStrategy();
  const drivers = data?.drivers || [];
  const elapsedSec = elapsedFrom(data, st);

  const view = useMemo(() => {
    const ranks = paceRank(drivers);
    const ours = new Map((st.karts || []).filter((k) => k.number)
      .map((k) => [String(k.number), { stopsDone: k.stops, label: k.label }]));
    const eng = computeStrategy(drivers, {
      durationSec: st.durationMin * 60, totalStops: st.totalStops,
      stopCycleSec: st.stopCycleSec, minStopSec: st.minStopSec,
    }, ours, elapsedSec);
    const vpos = new Map(eng.virtual.map((r) => [r.number, r.virtualPos]));

    return (st.karts || []).map((k) => {
      const d = k.number ? drivers.find((x) => String(x.number) === String(k.number)) : null;
      const pilot = (st.roster || []).find((r) => r.id === st.current?.[k.id])?.name || null;
      const pending = Math.max(0, st.totalStops - k.stops);
      const box = boxState(st, elapsedSec, pending);
      const done = k.stops >= st.totalStops;
      if (!d) return { k, mapped: !!k.number, d: null, box, pending, done, pilot };
      const g = greenPace(d.laps) || d.avg;
      const stint = currentStint(d.laps, g);
      const deg = degradation(d.laps, g);
      const inBox = /box|pit/i.test(d.state || '') || (stint && stint.justPitted);
      const rank = ranks.get(String(d.number));
      const dec = decideKart({ st, stops: k.stops, elapsedSec, stint, deg, inBox, flag: data?.event?.flag?.state });
      return {
        k, mapped: true, d, pilot, box: dec.box, pending: dec.pending, done: dec.done, g, stint, deg, inBox, rank,
        pos: d.pos, vpos: vpos.get(String(d.number)), action: dec.action,
      };
    });
  }, [data, st, elapsedSec, drivers]);

  const anyMapped = view.some((v) => v.mapped);
  const active = view.filter((v) => v.d);
  const kpi = {
    risk: active.filter((v) => ['dq', 'dq_risk', 'stop_now'].includes(v.action.code)),
    warn: active.filter((v) => ['soon', 'fading', 'flag_stop', 'in_box'].includes(v.action.code)),
    go: active.filter((v) => v.action.code === 'go'),
    done: active.filter((v) => v.done),
  };
  const urgent = [...active].sort((a, b) => b.action.priority - a.action.priority)[0];

  return (
    <div>
      {!anyMapped && (
        <div className="banner">
          <b>Mapeie os nossos 4 karts.</b> Informe o nº de cada kart no feed (aba <b>Virtual + Previsão</b> →
          "Nossos karts") para o cockpit ligar. As paradas x/7 vêm do Watchdog.
        </div>
      )}
      <div className="ck-line">
        <span>Prova <b className="mono">{fmtClock(elapsedSec)}</b></span>
        <span>restam <b className="mono">{fmtClock(st.durationMin * 60 - elapsedSec)}</b></span>
        {data?.event?.flag?.state && <span className={'flag ' + data.event.flag.state}>bandeira {data.event.flag.state}</span>}
      </div>

      {active.length > 0 && (
        <div className="kpi">
          <div className={'kpi-hero ' + (urgent ? urgent.action.cls : 'ok')}>
            <div className="kpi-k">Prioridade agora</div>
            {urgent
              ? <div className="kpi-v"><b>{urgent.k.label}</b>{urgent.pilot ? ' · ' + urgent.pilot : ''} — {urgent.action.txt}</div>
              : <div className="kpi-v">tudo sob controle</div>}
          </div>
          <div className="kpi-counts">
            <span className="cnt risk"><b>{kpi.risk.length}</b> risco</span>
            <span className="cnt warn"><b>{kpi.warn.length}</b> atenção</span>
            <span className="cnt go"><b>{kpi.go.length}</b> seguindo</span>
            <span className="cnt done"><b>{kpi.done.length}</b> ok</span>
          </div>
        </div>
      )}

      <div className="ck-grid">
        {view.map((v) => (
          <div className={'ck ' + (v.d ? (v.inBox ? 'box' : v.box.level) : 'empty')} key={v.k.id}>
            <div className="ck-top">
              <div><b>{v.k.label}</b>{v.pilot ? <span className="pilot"> {v.pilot}</span> : null}</div>
              {v.k.number ? <span className="mono num">#{v.k.number}</span> : <span className="muted">sem nº</span>}
            </div>
            {!v.d ? (
              <div className="ck-empty">{v.mapped ? 'kart #' + v.k.number + ' não está no feed' : 'mapear nº do feed'}</div>
            ) : (
              <>
                <div className="ck-action"><span className={'act act-' + v.action.cls}>{v.action.txt}</span></div>
                <div className="ck-rows">
                  <div><span className="lbl">Pista / Virtual</span><span className="mono">{v.pos}º / {v.vpos}º</span></div>
                  <div><span className="lbl">Paradas</span><span className="mono">{v.k.stops}/{st.totalStops} · faltam {v.pending}</span></div>
                  <div><span className="lbl">Stint</span><span className="mono">{v.stint ? (v.inBox ? 'no box' : v.stint.lapsInStint + ' v · ' + fmtClock(v.stint.msInStint / 1000)) : '—'}</span></div>
                  <div><span className="lbl">Ritmo</span><span className="mono">{fmt(v.g)} {v.rank ? <small>({v.rank.rank}º)</small> : ''} {v.deg && v.deg.dir === 'down' ? <em className="warn-t">▼caindo</em> : v.deg && v.deg.dir === 'up' ? <em className="ok-t">▲</em> : ''}</span></div>
                  <div><span className="lbl">Folga anti-DQ</span><span className={'mono folga-' + v.box.level}>{v.done ? '✓' : fmtClock(v.box.folga)}</span></div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="foot">
        <b>Próxima ação</b> = folga + janela do box (metrônomo das {st.totalStops} paradas). 🟢 seguir · 🟡 aperta · 🔴 pare já ·
        🟠 no box. "Ritmo (nº)" = posição do kart no ranking de ritmo do grid. ▼caindo = degradação do stint.
        {data?.event?.flag?.state === 'yellow' || data?.event?.flag?.state === 'red'
          ? <b> · Bandeira {data.event.flag.state}: reavaliar box (parar sob neutralização é tempo grátis).</b> : null}
      </p>

      <style>{`
        .banner{background:var(--accent-soft);border:1px solid var(--accent);border-radius:10px;padding:10px 13px;font-size:13px;margin-bottom:14px;line-height:1.45}
        .ck-line{display:flex;gap:18px;align-items:center;font-size:13px;color:var(--ink-2);margin-bottom:12px;flex-wrap:wrap}
        .kpi{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;align-items:stretch}
        .kpi-hero{flex:1;min-width:260px;border:1px solid var(--border);border-left-width:5px;border-radius:12px;padding:12px 15px;background:var(--surface)}
        .kpi-hero.ok{border-left-color:var(--good)} .kpi-hero.warn{border-left-color:var(--s4)} .kpi-hero.crit{border-left-color:var(--live)} .kpi-hero.box{border-left-color:var(--s2)} .kpi-hero.muted{border-left-color:var(--muted)}
        .kpi-k{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
        .kpi-v{font-size:16px;margin-top:3px;letter-spacing:-.01em}
        .kpi-counts{display:flex;gap:8px;align-items:center}
        .cnt{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:62px;border:1px solid var(--border);border-radius:12px;padding:8px 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);background:var(--surface)}
        .cnt b{font:700 20px ui-monospace,monospace;color:var(--ink)}
        .cnt.risk b{color:var(--live)} .cnt.warn b{color:var(--s4)} .cnt.go b{color:var(--good)} .cnt.done b{color:var(--accent)}
        .pilot{font-size:12px;color:var(--ink-2);font-weight:400}
        .ck-line .flag{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
        .flag.green{background:var(--good);color:#fff} .flag.yellow{background:var(--s4);color:#000} .flag.red{background:var(--live);color:#fff} .flag.unknown{background:var(--muted);color:#fff}
        .ck-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px}
        .ck{background:var(--surface);border:1px solid var(--border);border-left-width:4px;border-radius:12px;padding:12px}
        .ck.ok{border-left-color:var(--good)} .ck.warn{border-left-color:var(--s4)} .ck.crit{border-left-color:var(--live)}
        .ck.box{border-left-color:var(--s2)} .ck.done{border-left-color:var(--accent)} .ck.empty{border-left-color:var(--border);opacity:.7}
        .ck-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
        .ck-top .num{color:var(--ink-2);font-size:12px} .ck-top .muted{color:var(--muted);font-size:11px}
        .ck-empty{color:var(--muted);font-size:12px;padding:14px 0;text-align:center}
        .ck-action{margin-bottom:9px}
        .act{font-size:13px;font-weight:700;display:block}
        .act-ok{color:var(--good)} .act-warn{color:var(--s4)} .act-crit{color:var(--live)} .act-box{color:var(--s2)} .act-muted{color:var(--muted)}
        .ck-rows{display:flex;flex-direction:column;gap:5px;font-size:12.5px}
        .ck-rows>div{display:flex;justify-content:space-between;gap:8px}
        .ck-rows .lbl{color:var(--muted)}
        .folga-crit{color:var(--live);font-weight:700} .folga-warn{color:var(--s4)} .folga-ok{color:var(--good)} .folga-done{color:var(--accent)}
        .warn-t{color:var(--live);font-style:normal;font-size:11px} .ok-t{color:var(--good);font-style:normal}
        @media (max-width:820px){ .ck-grid{grid-template-columns:repeat(2,1fr)} }
        @media (max-width:460px){ .ck-grid{grid-template-columns:1fr} }
      `}</style>
    </div>
  );
}
