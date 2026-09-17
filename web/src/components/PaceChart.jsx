import { useMemo, useState } from 'react';
import { fmt, col } from '../lib/format.js';

const W = 720, H = 340, padL = 46, padR = 64, padT = 12, padB = 26;

export default function PaceChart({ drivers, maxLap }) {
  const [hover, setHover] = useState(null);

  const geo = useMemo(() => {
    const times = [];
    drivers.forEach((d) => d.laps.forEach((l) => { if (l.ms) times.push(l.ms); }));
    times.sort((a, b) => a - b);
    if (!times.length) return null;
    let lo = times[Math.floor(times.length * 0.02)];
    let hi = times[Math.floor(times.length * 0.75)];
    if (hi <= lo) hi = times[times.length - 1];
    const pad = (hi - lo) * 0.15 || 500;
    const yMin = Math.max(0, lo - pad), yMax = hi + pad;
    const median = times[Math.floor(times.length * 0.5)];
    const X = (n) => padL + (W - padL - padR) * ((n - 1) / (maxLap - 1 || 1));
    const clamp = (v) => Math.max(yMin, Math.min(yMax, v));
    const Y = (ms) => padT + (H - padT - padB) * ((yMax - clamp(ms)) / (yMax - yMin));
    return { yMin, yMax, median, X, Y };
  }, [drivers, maxLap]);

  if (!geo) return <div className="state">sem tempos de volta ainda…</div>;
  const { yMin, yMax, median, X, Y } = geo;
  const gridVals = [0, 1, 2, 3, 4].map((g) => yMin + (yMax - yMin) * g / 4);

  function onMove(e) {
    const svg = e.currentTarget.ownerSVGElement;
    const rc = svg.getBoundingClientRect();
    const sx = (e.clientX - rc.left) * (W / rc.width);
    let n = Math.round(1 + (maxLap - 1) * ((sx - padL) / (W - padL - padR)));
    n = Math.max(1, Math.min(maxLap, n));
    const rows = drivers
      .map((d, si) => { const l = d.laps.find((x) => x.n === n); return l ? { si, num: d.number, ms: l.ms } : null; })
      .filter(Boolean).sort((a, b) => a.ms - b.ms);
    setHover({ n, x: e.clientX, y: e.clientY, rows });
  }

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tempo por volta">
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={Y(v)} x2={W - padR} y2={Y(v)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 6} y={Y(v) + 4} textAnchor="end" fill="var(--muted)" fontSize="10" fontFamily="ui-monospace,monospace">{fmt(v)}</text>
          </g>
        ))}
        <text x={padL} y={H - 8} fill="var(--muted)" fontSize="10">volta 1</text>
        <text x={W - padR} y={H - 8} textAnchor="end" fill="var(--muted)" fontSize="10">volta {maxLap}</text>
        {median && (
          <g>
            <line x1={padL} y1={Y(median)} x2={W - padR} y2={Y(median)} stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 4" opacity="0.55" />
            <text x={W - padR - 2} y={Y(median) - 4} textAnchor="end" fill="var(--accent)" fontSize="9" fontFamily="ui-monospace,monospace">mediana {fmt(median)}</text>
          </g>
        )}
        {drivers.map((d, si) => (
          <polyline key={d.number} fill="none" stroke={col(si)} strokeWidth="1.6" strokeLinejoin="round" opacity="0.9"
            points={d.laps.filter((l) => l.ms).map((l) => `${X(l.n)},${Y(l.ms)}`).join(' ')} />
        ))}
        {hover && <line x1={X(hover.n)} y1={padT} x2={X(hover.n)} y2={H - padB} stroke="var(--axis)" strokeWidth="1" strokeDasharray="3 3" />}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="transparent"
          style={{ cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(hover.x + 14, window.innerWidth - 200), top: hover.y - 12 - hover.rows.length * 20 }}>
          <div className="hd">Volta {hover.n}</div>
          {hover.rows.map((r) => (
            <div className="row" key={r.num}><span><i style={{ background: col(r.si) }} />#{r.num}</span><b className="mono">{fmt(r.ms)}</b></div>
          ))}
        </div>
      )}
    </>
  );
}
