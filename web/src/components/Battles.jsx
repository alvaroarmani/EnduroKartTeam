import { useMemo, useState } from 'react';
import { useEventData } from '../hooks/useEventData.js';
import { useStrategy } from '../hooks/useStrategy.js';
import { greenPace } from '../lib/strategy-engine.js';
import { pairTrend, catchLaps, degradation } from '../lib/analytics.js';
import { fmt } from '../lib/format.js';

const gapMs = (d) => (d && d.gap && d.gap.type === 'time' ? d.gap.ms : null);

function BattleCard({ side, focus, other, self }) {
  // side: 'ahead' (other à frente) | 'behind' (other atrás)
  if (!other) return <div className="bt-card empty">{side === 'ahead' ? 'líder — ninguém à frente' : 'lanterna — ninguém atrás'}</div>;
  // gap sempre é "do carro para o da frente": à frente usa gap do focus; atrás usa gap do outro
  const g = side === 'ahead' ? gapMs(focus) : gapMs(other);
  // taxa: à frente = focus mais rápido que o outro fecha; atrás = outro mais rápido que focus fecha
  const tr = side === 'ahead' ? pairTrend(focus.laps, other.laps) : pairTrend(other.laps, focus.laps);
  const rate = tr ? tr.ratePerLap : null;
  const EVEN = 25; // < 25 ms/volta = ritmo parelho (não dá pra prever alcance)
  const even = rate != null && Math.abs(rate) < EVEN;
  const closing = rate != null && rate >= EVEN;
  const laps = closing ? catchLaps(g, rate) : null;
  return (
    <div className={'bt-card ' + (closing ? 'closing' : even ? 'even' : 'losing')}>
      <div className="bt-side">{side === 'ahead' ? '▲ À FRENTE' : '▼ ATRÁS'}</div>
      <div className="bt-name">#{other.number} {other.name}</div>
      <div className="bt-gap mono">{g != null ? (g / 1000).toFixed(2) + 's' : '—'}</div>
      <div className={'bt-rate ' + (closing ? 'up' : even ? 'flat' : 'down')}>
        {rate == null ? 'sem ritmo comum' : even ? '≈ ritmo parelho' : (closing
          ? '↑ ' + (side === 'ahead' ? 'você fecha ' : 'ele fecha ') + (rate / 1000).toFixed(2) + 's/volta'
          : '↓ ' + (side === 'ahead' ? 'abrindo ' : 'você abre ') + (Math.abs(rate) / 1000).toFixed(2) + 's/volta')}
      </div>
      <div className="bt-catch">
        {closing && laps ? (side === 'ahead' ? 'alcança em ~' : 'te alcança em ~') + Math.ceil(laps) + ' voltas' : '—'}
      </div>
    </div>
  );
}

export default function Battles() {
  const { data } = useEventData();
  const [st] = useStrategy();
  const drivers = data?.drivers || [];
  const ordered = useMemo(() => [...drivers].sort((a, b) => (a.pos || 99) - (b.pos || 99)), [drivers]);

  // foco: padrão = melhor kart nosso, senão o líder
  const ourNums = new Set((st.karts || []).filter((k) => k.number).map((k) => String(k.number)));
  const defaultFocus = ordered.find((d) => ourNums.has(String(d.number)))?.number || ordered[0]?.number;
  const [focusNum, setFocusNum] = useState(null);
  const fnum = focusNum ?? defaultFocus;

  if (!drivers.length) return <div className="state">sem dados do feed.</div>;

  const idx = ordered.findIndex((d) => String(d.number) === String(fnum));
  const focus = ordered[idx];
  const ahead = idx > 0 ? ordered[idx - 1] : null;
  const behind = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
  const g = greenPace(focus?.laps) || focus?.avg;
  const deg = focus ? degradation(focus.laps, g) : null;

  return (
    <div>
      <div className="bt-head">
        <span>Foco:</span>
        <select className="mono" value={fnum} onChange={(e) => setFocusNum(e.target.value)}>
          {ordered.map((d) => (
            <option key={d.number} value={d.number}>{d.pos}º · #{d.number} {d.name}{ourNums.has(String(d.number)) ? ' (nosso)' : ''}</option>
          ))}
        </select>
      </div>

      <div className="bt-grid">
        <BattleCard side="ahead" focus={focus} other={ahead} />
        <div className="bt-focus">
          <div className="bt-focus-name">#{focus.number} {focus.name}</div>
          <div className="mono bt-focus-pos">{focus.pos}º</div>
          <div className="foot">ritmo {fmt(g)}
            {deg ? <> · stint {deg.dir === 'down' ? <b className="down">▼ caindo {(deg.delta / 1000).toFixed(2)}s</b> : deg.dir === 'up' ? <b className="up">▲ melhorando</b> : 'estável'}</> : null}
          </div>
        </div>
        <BattleCard side="behind" focus={focus} other={behind} />
      </div>

      <p className="foot" style={{ marginTop: 12 }}>
        Taxa de aproximação = diferença média de ritmo nas últimas voltas em comum. <b>Ignore os gaps nas 2–3 voltas
        após qualquer parada</b> (reshuffle, não ritmo). "Caindo" no stint = avaliar troca/box.
      </p>

      <style>{`
        .bt-head{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink-2);margin-bottom:12px}
        .bt-head select{padding:6px 8px;border:1px solid var(--border);background:var(--surface-2);color:var(--ink);border-radius:8px;font-size:13px;max-width:320px}
        .bt-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:stretch}
        .bt-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center}
        .bt-card.closing{border-color:var(--good)} .bt-card.losing{border-color:var(--border)} .bt-card.even{border-color:var(--s4)}
        .bt-card.empty{color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:13px}
        .bt-side{font-size:10.5px;letter-spacing:.06em;color:var(--muted);font-weight:700}
        .bt-name{font-size:14px;margin:4px 0 2px}
        .bt-gap{font-size:30px;letter-spacing:-.02em}
        .bt-rate{font-size:12.5px;margin-top:4px} .bt-rate.up{color:var(--good)} .bt-rate.down{color:var(--ink-2)} .bt-rate.flat{color:var(--s4)}
        .bt-catch{font-size:12px;color:var(--ink-2);margin-top:4px}
        .bt-focus{background:var(--accent-soft);border:1px solid var(--accent);border-radius:12px;padding:14px;text-align:center}
        .bt-focus-name{font-size:14px} .bt-focus-pos{font-size:34px;letter-spacing:-.02em}
        .down{color:var(--live)} .up{color:var(--good)}
        @media (max-width:720px){ .bt-grid{grid-template-columns:1fr} }
      `}</style>
    </div>
  );
}
