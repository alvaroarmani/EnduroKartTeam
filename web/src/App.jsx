import { useMemo, useState } from 'react';
import { useEventData } from './hooks/useEventData.js';
import { col } from './lib/format.js';
import Tiles from './components/Tiles.jsx';
import PaceChart from './components/PaceChart.jsx';
import PositionChart from './components/PositionChart.jsx';
import ConsistencyTable from './components/ConsistencyTable.jsx';
import StrategyPanel from './components/StrategyPanel.jsx';

function Telemetria() {
  const { data, error, loading, updatedAt } = useEventData();
  const view = useMemo(() => {
    if (!data || !data.drivers) return null;
    const drivers = data.drivers;
    const maxLap = drivers.reduce((m, d) => Math.max(m, d.laps.length ? d.laps[d.laps.length - 1].n : 0), 0) || 1;
    const top = drivers.slice(0, 8);
    const bests = drivers.map((d) => d.best).filter((x) => x && x > 8000 && x < 180000);
    const fastest = bests.length ? Math.min(...bests) : null;
    const fresh = data.event?.capturedAt ? (Date.now() - data.event.capturedAt) < 45000 : false;
    return { event: data.event || {}, drivers, top, maxLap, fastest, fresh };
  }, [data]);

  return (
    <>
      <h1>{view?.event?.track || 'Telemetria FKI'}</h1>
      <p className="subttl">
        <span className={'live' + (view?.fresh ? '' : ' off')}><i />{view?.fresh ? 'AO VIVO' : 'ÚLTIMA CAPTURA'}</span>{' '}
        {view?.event?.name || ''}
        {updatedAt ? <span className="foot"> · atualizado {new Date(updatedAt).toLocaleTimeString('pt-BR')}</span> : null}
      </p>

      {!view && loading && <div className="state">carregando dados…</div>}
      {!view && error && <div className="state">sem dados ({error}). Confira o worker / VITE_DATA_URL.</div>}

      {view && (
        <>
          <Tiles drivers={view.drivers} maxLap={view.maxLap} />
          <section>
            <h2>Tempo por volta</h2>
            <p className="sub">ritmo e degradação (top 8) — faixa competitiva; voltas lentas (tráfego/box) clipam no topo.</p>
            <PaceChart drivers={view.top} maxLap={view.maxLap} />
            <div className="legend">
              {view.top.map((d, si) => (
                <span key={d.number}><i style={{ background: col(si) }} />#{d.number} {(d.name || '').split(' ').slice(0, 2).join(' ')}</span>
              ))}
            </div>
          </section>
          <section>
            <h2>Posição por volta</h2>
            <p className="sub">progressão exata da corrida (1º no topo).</p>
            <PositionChart drivers={view.top} maxLap={view.maxLap} />
          </section>
          <section>
            <h2>Ritmo e consistência</h2>
            <p className="sub">melhor, média e desvio-padrão dos tempos (menor = mais regular).</p>
            <ConsistencyTable drivers={view.drivers} fastest={view.fastest} />
          </section>
        </>
      )}
    </>
  );
}

const TABS = [
  { id: 'telemetria', label: 'Telemetria (FKI)' },
  { id: 'estrategia', label: 'Estratégia (nossa prova)' },
];

export default function App() {
  const [tab, setTab] = useState('telemetria');
  return (
    <div className="wrap">
      <div className="eyebrow">FDK 100 Milhas Endurance · sistema da equipe</div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {tab === 'telemetria' ? <Telemetria /> : (
        <>
          <h1>Watchdog de estratégia</h1>
          <p className="subttl">4 karts · 7 paradas obrigatórias · o alarme anti-DQ da prova.</p>
          <StrategyPanel />
        </>
      )}
      <p className="foot" style={{ marginTop: 18 }}>
        Fonte: captura mylaptime → Supabase/buffer (polling; troca para WebSocket/Realtime isolada em <code>useEventData</code>).
      </p>
      <style>{`
        .tabs{display:flex;gap:6px;margin:10px 0 4px;flex-wrap:wrap}
        .tab{font:13px system-ui;padding:7px 14px;border:1px solid var(--border);background:var(--surface-2);
          color:var(--ink-2);border-radius:20px;cursor:pointer}
        .tab.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
      `}</style>
    </div>
  );
}
