import { useEffect, useMemo, useState } from 'react';
import { useEventData } from './hooks/useEventData.js';
import { col } from './lib/format.js';
import Tiles from './components/Tiles.jsx';
import PaceChart from './components/PaceChart.jsx';
import PositionChart from './components/PositionChart.jsx';
import ConsistencyTable from './components/ConsistencyTable.jsx';
import StrategyPanel from './components/StrategyPanel.jsx';
import StrategyEngine from './components/StrategyEngine.jsx';
import TeamCockpit from './components/TeamCockpit.jsx';
import Battles from './components/Battles.jsx';
import DriversBoard from './components/DriversBoard.jsx';
import RaceTimeline from './components/RaceTimeline.jsx';
import EventsScreen from './components/EventsScreen.jsx';
import KartIntel from './components/KartIntel.jsx';
import PitStops from './components/PitStops.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

/* ---------- ícones (stroke, herdam currentColor) ---------- */
const P = {
  gauge: <><circle cx="12" cy="12" r="8" /><path d="M12 12l3.5-2.5" /><path d="M12 12h.01" /></>,
  swords: <><path d="M5 5l14 14" /><path d="M19 5L5 19" /></>,
  timeline: <><path d="M8 6h11M8 12h11M8 18h11" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0111 0" /><path d="M16 5.5a3 3 0 010 5.5" /><path d="M15.5 14.5A6 6 0 0121 20" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 12h.01" /></>,
  flag: <><path d="M6 21V4" /><path d="M6 4h11l-2.4 4L17 12H6" /></>,
  activity: <><path d="M3 12h4l3 8 4-16 3 8h4" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>,
  stop: <><circle cx="12" cy="13" r="8" /><path d="M12 13V9" /><path d="M9.5 3h5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  moon: <><path d="M20 14a8 8 0 11-9-11 6 6 0 009 11z" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  chevron: <><path d="M15 6l-6 6 6 6" /></>,
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{P[name]}</svg>
);

const NAV = [
  { group: 'Ao vivo', items: [
    { id: 'cockpit', label: 'Cockpit', icon: 'gauge' },
    { id: 'box', label: 'Box', icon: 'stop' },
    { id: 'batalhas', label: 'Batalhas', icon: 'swords' },
    { id: 'timeline', label: 'Timeline', icon: 'timeline' },
  ] },
  { group: 'Planejar', items: [
    { id: 'pilotos', label: 'Pilotos & Kart', icon: 'people' },
    { id: 'motor', label: 'Virtual + Previsão', icon: 'target' },
    { id: 'estrategia', label: 'Estratégia', icon: 'flag' },
  ] },
  { group: 'Dados', items: [
    { id: 'eventos', label: 'Eventos', icon: 'layers' },
    { id: 'karts', label: 'Karts', icon: 'target' },
    { id: 'telemetria', label: 'Telemetria', icon: 'activity' },
  ] },
];
const HEADERS = {
  cockpit: ['Cockpit', 'os 4 karts numa tela: stint, paradas, folga e a próxima ação de cada um.'],
  box: ['Box — checklist de parada', 'cronômetro com as zonas 4:55/5:00, kart sorteado, placa, sensor, pesagem e lastro.'],
  batalhas: ['Batalhas & tendências', 'gap ao vivo, aproximação e quando você alcança / é alcançado.'],
  timeline: ['Timeline & alertas', 'a memória da corrida + os alertas acionáveis do momento.'],
  pilotos: ['Pilotos & Kart', 'habilidade híbrida, pesagem e rotação — ases nas stints finais.'],
  motor: ['Virtual + Previsão', 'quem está ganhando de verdade e como isso termina.'],
  estrategia: ['Estratégia', '4 karts · 7 paradas obrigatórias · o alarme anti-DQ da prova.'],
  eventos: ['Eventos', 'todos os eventos online — escolha qual manter em análise.'],
  karts: ['Karts & prep 15 dias', 'ritmo por kart em Jardim Camburi — qual kart sorteado é lento/rápido.'],
  telemetria: ['Telemetria', 'ritmo, posição e consistência do evento em análise.'],
};

function Telemetria() {
  const { data, error, loading } = useEventData();
  const view = useMemo(() => {
    if (!data || !data.drivers) return null;
    const drivers = data.drivers;
    const maxLap = drivers.reduce((m, d) => Math.max(m, d.laps.length ? d.laps[d.laps.length - 1].n : 0), 0) || 1;
    const top = drivers.slice(0, 8);
    const bests = drivers.map((d) => d.best).filter((x) => x && x > 8000 && x < 180000);
    const fastest = bests.length ? Math.min(...bests) : null;
    return { event: data.event || {}, drivers, top, maxLap, fastest };
  }, [data]);

  if (!view && loading) return <div className="state">carregando dados…</div>;
  if (!view && error) return <div className="state">sem dados ({error}). Confira o worker / VITE_DATA_URL.</div>;
  if (!view) return <div className="state">sem dados do feed.</div>;
  return (
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
  );
}

function StatusPill() {
  const { data, updatedAt } = useEventData();
  const fresh = data?.event?.capturedAt ? (Date.now() - data.event.capturedAt) < 45000 : false;
  return (
    <span className={'spill' + (fresh ? '' : ' off')} title={data?.event?.name || ''}>
      <i />{fresh ? 'AO VIVO' : 'SEM SINAL'}
      {updatedAt ? <span className="dt">{new Date(updatedAt).toLocaleTimeString('pt-BR')}</span> : null}
    </span>
  );
}

const PAGES = {
  cockpit: TeamCockpit, box: PitStops, batalhas: Battles, timeline: RaceTimeline,
  pilotos: DriversBoard, motor: StrategyEngine, estrategia: StrategyPanel,
  eventos: EventsScreen, karts: KartIntel, telemetria: Telemetria,
};

export default function App() {
  const [tab, setTab] = useState('cockpit');
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('ek_theme') || 'dark'; } catch { return 'dark'; } });
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('ek_nav') === '1'; } catch { return false; } });
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('ek_theme', theme); } catch { /* */ }
  }, [theme]);
  useEffect(() => { try { localStorage.setItem('ek_nav', collapsed ? '1' : '0'); } catch { /* */ } }, [collapsed]);

  const Page = PAGES[tab];
  const [title, subtitle] = HEADERS[tab];
  const go = (id) => { setTab(id); setNavOpen(false); };

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '') + (navOpen ? ' navopen' : '')}>
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <aside className="sidebar">
        <div className="brand">
          <div className="mark">EK</div>
          <div className="word">EnduroKart<small>FDK 100 Milhas</small></div>
        </div>
        <nav className="nav">
          {NAV.map((g) => (
            <div className="nav-group" key={g.group}>
              <div className="nav-lbl">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.id} className={'nav-item' + (tab === it.id ? ' on' : '')} onClick={() => go(it.id)} title={it.label}>
                  <span className="ic"><Icon name={it.icon} /></span>
                  <span className="txt">{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <button className="nav-item" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expandir' : 'Recolher'}>
            <span className="ic" style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }}><Icon name="chevron" /></span>
            <span className="txt">Recolher menu</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn hamb" onClick={() => setNavOpen((o) => !o)} aria-label="menu"><Icon name="menu" /></button>
          <div>
            <div className="page-t">{title}</div>
            <div className="page-s">{subtitle}</div>
          </div>
          <div className="top-right">
            <StatusPill />
            <button className="icon-btn" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} aria-label="tema" title="Alternar tema">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </div>
        </header>
        <main className="content">
          <ErrorBoundary key={tab}>
            <Page />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
