import { useEffect, useRef } from 'react';
import { useEvents, resolveDataUrl, postFocus } from '../hooks/useEvents.js';
import { useStrategy } from '../hooks/useStrategy.js';
import { strategyStore } from '../lib/strategyStore.js';

const FLAG_LABEL = { green: 'verde', yellow: 'amarela', red: 'vermelha', checkered: 'bandeirada', unknown: '—' };

// locais de prioridade da equipe — sempre no topo. match pelo nome do LOCAL (track).
const PRIORITIES = [
  { key: 'fki-linhares', label: 'FKI Linhares', match: (e) => /linhares/i.test(e.track || '') },
  { key: 'fki-fasdekart', label: 'FKI / Fãs de Kart', match: (e) => /(f[aã]s\s*de\s*kart|fki\s*racing)/i.test(e.track || '') },
];

function fmtAgo(ms) {
  if (!ms) return null;
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.round(s / 60) + 'min';
  return Math.round(s / 3600) + 'h';
}

function EventCard({ e, active, pinned, always, onAnalyze, onPin }) {
  const ago = fmtAgo(e.capturedAt);
  return (
    <div className={'ev' + (active ? ' active' : '') + (e.live ? '' : ' idle')}>
      <div className="ev-live" title={e.live ? 'ao vivo' : 'sem sinal'}>
        <span className={'dot' + (e.live ? ' on' : '')} />
      </div>
      <div className="ev-body">
        {e.track && <div className="ev-local">{e.track}</div>}
        <div className="ev-name">
          {e.name}
          {active && <span className="ribbon">ANALISANDO</span>}
        </div>
        <div className="ev-pills">
          {e.karts != null && <span className="pill">{e.karts} karts</span>}
          {e.laps != null && <span className="pill">{e.laps} voltas</span>}
          {e.flag && <span className={'pill flag ' + e.flag}><i />{FLAG_LABEL[e.flag] || e.flag}</span>}
          {ago && <span className="pill ghost">há {ago}</span>}
          {e.karts == null && <span className="pill ghost">sem dados capturados</span>}
        </div>
      </div>
      <div className="ev-cta">
        {always
          ? <span className="pin on lock" title="prioridade da equipe — sempre capturado"><span className="pin-ic">📌</span>sempre</span>
          : <button className={'pin' + (pinned ? ' on' : '')} onClick={onPin}
              title={pinned ? 'fixado — o worker captura' : 'fixar para o worker capturar'}>
              <span className="pin-ic">📌</span>{pinned ? 'fixado' : 'fixar'}
            </button>}
        <button className={'analyze' + (active ? ' on' : '')} onClick={onAnalyze} disabled={active}>
          {active ? '✓ analisando' : 'Analisar'}
        </button>
      </div>
    </div>
  );
}

export default function EventsScreen() {
  const { events, error, loading, updatedAt } = useEvents();
  const [st] = useStrategy();
  const activeId = st.activeEvent?.id || null;
  const pinned = new Set(st.pinnedEventIds || []);

  // ids dos eventos de prioridade que estão AO VIVO agora (sempre capturados por padrão).
  const priorityLiveIds = () => events.filter((e) => e.live && PRIORITIES.some((p) => p.match(e))).map((e) => e.id);
  const isPriority = (e) => PRIORITIES.some((p) => p.match(e));

  // foco = analisando + fixados + prioridades ao vivo → o worker captura só esse conjunto.
  const lastFocus = useRef('');
  const pushFocus = () => {
    const s = strategyStore.get();
    const ids = [...new Set([s.activeEvent?.id, ...(s.pinnedEventIds || []), ...priorityLiveIds()].filter(Boolean))];
    const key = ids.slice().sort().join(',');
    if (key === lastFocus.current) return; // evita reenvio idêntico
    lastFocus.current = key;
    postFocus(ids);
  };
  useEffect(() => { pushFocus(); }); // reenvia quando muda (inclui quando prioridade entra ao vivo)

  const setActive = (e) => {
    strategyStore.update({ activeEvent: { id: e.id, name: e.name, dataUrl: resolveDataUrl(e.dataUrl || '/event-data.json') } });
    pushFocus();
  };
  const togglePin = (e) => {
    strategyStore.set((s) => {
      const set = new Set(s.pinnedEventIds || []);
      set.has(e.id) ? set.delete(e.id) : set.add(e.id);
      return { ...s, pinnedEventIds: [...set] };
    });
    pushFocus();
  };

  // prioridades no topo (cada evento entra numa só); o resto vai para as listas normais.
  const prioIds = new Set();
  const prioGroups = PRIORITIES.map((p) => {
    const matched = events.filter((e) => !prioIds.has(e.id) && p.match(e));
    matched.forEach((e) => prioIds.add(e.id));
    return { ...p, matched };
  });
  const rest = events.filter((e) => !prioIds.has(e.id));
  const live = rest.filter((e) => e.live);
  const idle = rest.filter((e) => !e.live);
  const pinnedList = events.filter((e) => pinned.has(e.id));

  const card = (e) => (
    <EventCard key={e.id} e={e} active={e.id === activeId} pinned={pinned.has(e.id)} always={isPriority(e)}
      onAnalyze={() => setActive(e)} onPin={() => togglePin(e)} />
  );

  return (
    <div>
      <div className="ev-top">
        <div className="ev-stats">
          <span className="s-live"><i />{live.length} ao vivo</span>
          {pinnedList.length > 0 && <span className="s-pin">📌 {pinnedList.length} fixado{pinnedList.length > 1 ? 's' : ''}</span>}
          {activeId && <span className="s-an">● analisando 1</span>}
        </div>
        <span className="s-upd">{updatedAt ? 'atualizado há ' + fmtAgo(updatedAt) : ''}</span>
      </div>
      <p className="ev-hint">
        Todos os eventos ativos no mylaptime (não precisa parear). <b>Analisar</b> = os dashboards passam
        a mostrar esse evento. <b>Fixar 📌</b> = o worker segue capturando (foco = analisando + fixados).
      </p>

      <div className="prio">
        <div className="grp-lbl">⭐ Prioridade da equipe</div>
        <div className="prio-slots">
          {prioGroups.map((p) => (
            <div className="prio-slot" key={p.key}>
              <div className="prio-lbl">{p.label}</div>
              {p.matched.length
                ? <div className="ev-list">{p.matched.map((e) => card(e))}</div>
                : <div className="prio-empty">sem eventos</div>}
            </div>
          ))}
        </div>
      </div>

      {pinnedList.length > 0 && (
        <div className="pinbar">
          <span className="pinbar-lbl">📌 Fixados</span>
          {pinnedList.map((e) => (
            <button key={e.id} className={'chip-ev' + (e.id === activeId ? ' on' : '')} onClick={() => setActive(e)}>
              {e.live && <span className="cdot" />}{e.name}
            </button>
          ))}
        </div>
      )}

      {loading && !events.length && <div className="state">carregando eventos…</div>}
      {error && !events.length && (
        <div className="state">
          <div style={{ color: 'var(--live)', fontWeight: 600, marginBottom: 4 }}>sem lista de eventos</div>
          <span className="foot">{error} — rode o worker (<code>/events</code>) ou publique um <code>events.json</code>, e aponte <code>VITE_EVENTS_URL</code>.</span>
        </div>
      )}

      {[['Ao vivo', live], ['Encerrados / sem sinal', idle]].map(([label, list]) => list.length > 0 && (
        <div className="ev-group" key={label}>
          <div className="grp-lbl">{label} <span className="grp-n">{list.length}</span></div>
          <div className="ev-list">
            {list.map((e) => card(e))}
          </div>
        </div>
      ))}

      {!loading && !error && !events.length && (
        <div className="state">nenhum evento online no momento.</div>
      )}

      <style>{`
        .ev-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:4px}
        .ev-stats{display:flex;gap:8px;flex-wrap:wrap}
        .ev-stats span{font-size:12px;font-weight:600;padding:4px 11px;border-radius:20px;border:1px solid var(--border);display:inline-flex;align-items:center;gap:6px}
        .s-live{color:var(--good)} .s-live i{width:7px;height:7px;border-radius:50%;background:var(--good);animation:pulse 1.5s infinite}
        .s-pin{color:var(--ink-2)} .s-an{color:var(--accent);border-color:var(--accent)!important;background:var(--accent-soft)}
        .s-upd{font-size:12px;color:var(--muted);white-space:nowrap}
        .ev-hint{font-size:12.5px;color:var(--muted);margin:0 0 16px;line-height:1.5}
        .pinbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
        .pinbar-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
        .chip-ev{font-size:12.5px;padding:6px 12px;border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:20px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.12s}
        .chip-ev:hover{border-color:var(--border-2)}
        .chip-ev.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
        .chip-ev .cdot{width:6px;height:6px;border-radius:50%;background:var(--good)}
        .chip-ev.on .cdot{background:#fff}
        .ev-group{margin-bottom:18px}
        .grp-lbl{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin:0 2px 9px;display:flex;align-items:center;gap:8px}
        .prio{margin-bottom:20px;padding-bottom:18px;border-bottom:1px solid var(--border)}
        .prio .grp-lbl{color:var(--accent)}
        .prio-slots{display:flex;flex-direction:column;gap:12px}
        .prio-slot{}
        .prio-lbl{font-size:12.5px;font-weight:700;color:var(--ink);margin:0 2px 7px}
        .prio-empty{border:1px dashed var(--border-2);border-radius:12px;padding:16px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface-2)}
        .grp-n{font:700 11px ui-monospace,monospace;background:var(--surface-2);border-radius:20px;padding:1px 8px;color:var(--ink-2)}
        .ev-list{display:flex;flex-direction:column;gap:10px}
        .ev{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;transition:.14s;position:relative;overflow:hidden}
        .ev:hover{border-color:var(--border-2)}
        .ev.active{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent),0 0 0 1px var(--accent)}
        .ev.active::before{content:'';position:absolute;inset:0;background:var(--accent);opacity:.06;pointer-events:none}
        .ev.idle{opacity:.62}
        .ev-live{flex:0 0 auto}
        .ev-live .dot{display:block;width:9px;height:9px;border-radius:50%;background:var(--muted)}
        .ev-live .dot.on{background:var(--good);box-shadow:0 0 0 4px color-mix(in srgb,var(--good) 22%,transparent);animation:pulse 1.6s infinite}
        .ev-body{flex:1;min-width:0}
        .ev-local{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:2px}
        .ev-name{font-size:15.5px;font-weight:650;display:flex;align-items:center;gap:9px;flex-wrap:wrap;letter-spacing:-.01em}
        .ribbon{font-size:9.5px;font-weight:800;letter-spacing:.05em;color:#fff;background:var(--accent);padding:2px 8px;border-radius:20px}
        .ev-pills{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
        .pill{font-size:11.5px;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--border);border-radius:7px;padding:3px 9px;display:inline-flex;align-items:center;gap:6px}
        .pill.ghost{color:var(--muted);background:transparent}
        .pill.flag i{width:8px;height:8px;border-radius:50%;background:var(--muted)}
        .pill.flag.green i{background:var(--good)} .pill.flag.yellow i{background:var(--s4)} .pill.flag.red i{background:var(--live)} .pill.flag.checkered i{background:var(--ink-2)}
        .ev-cta{display:flex;align-items:center;gap:8px;flex:0 0 auto}
        .pin{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:8px 12px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);border-radius:9px;cursor:pointer;transition:.12s}
        .pin:hover{color:var(--ink-2);border-color:var(--border-2)}
        .pin .pin-ic{filter:grayscale(1);opacity:.6}
        .pin.on{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)}
        .pin.on .pin-ic{filter:none;opacity:1}
        .pin.lock{cursor:default}
        .analyze{font-size:13px;font-weight:600;padding:8px 18px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:9px;cursor:pointer;transition:.12s}
        .analyze:hover{background:var(--accent-2)}
        .analyze.on,.analyze:disabled{background:var(--surface-2);color:var(--good);border-color:var(--border);cursor:default}
        code{background:var(--surface-2);padding:1px 5px;border-radius:5px;font-size:12px}
        @media (max-width:640px){
          .ev{flex-wrap:wrap} .ev-cta{width:100%;justify-content:flex-end;margin-top:4px}
          .analyze{flex:1}
        }
      `}</style>
    </div>
  );
}
