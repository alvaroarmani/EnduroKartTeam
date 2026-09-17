import { useMemo, useState } from 'react';
import { col } from '../lib/format.js';

const W = 720, H = 300, padL = 34, padR = 60, padT = 12, padB = 24;

export default function PositionChart({ drivers, maxLap }) {
  const [hover, setHover] = useState(null);

  const geo = useMemo(() => {
    const maxPos = Math.max(
      drivers.length,
      drivers.reduce((m, d) => Math.max(m, d.laps.reduce((a, l) => Math.max(a, l.pos || 0), 0)), 0)
    ) || 2;
    const X = (n) => padL + (W - padL - padR) * ((n - 1) / (maxLap - 1 || 1));
    const Y = (p) => padT + (H - padT - padB) * ((p - 1) / (maxPos - 1));
    return { maxPos, X, Y };
  }, [drivers, maxLap]);

  const { maxPos, X, Y } = geo;
  const gridPos = [];
  for (let p = 1; p <= maxPos; p += (maxPos > 10 ? 2 : 1)) gridPos.push(p);

  function onMove(e) {
    const svg = e.currentTarget.ownerSVGElement;
    const rc = svg.getBoundingClientRect();
    const sx = (e.clientX - rc.left) * (W / rc.width);
    let n = Math.round(1 + (maxLap - 1) * ((sx - padL) / (W - padL - padR)));
    n = Math.max(1, Math.min(maxLap, n));
    const rows = drivers
      .map((d, si) => { const l = d.laps.find((x) => x.n === n && x.pos != null); return l ? { si, num: d.number, pos: l.pos } : null; })
      .filter(Boolean).sort((a, b) => a.pos - b.pos);
    setHover({ n, x: e.clientX, y: e.clientY, rows });
  }

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Posição por volta">
        {gridPos.map((p) => (
          <g key={p}>
            <line x1={padL} y1={Y(p)} x2={W - padR} y2={Y(p)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 6} y={Y(p) + 4} textAnchor="end" fill="var(--muted)" fontSize="10" fontFamily="ui-monospace,monospace">{p}º</text>
          </g>
        ))}
        {drivers.map((d, si) => {
          const lp = d.laps.filter((l) => l.pos != null);
          if (!lp.length) return null;
          const last = lp[lp.length - 1];
          return (
            <g key={d.number}>
              <polyline fill="none" stroke={col(si)} strokeWidth="2" strokeLinejoin="round" points={lp.map((l) => `${X(l.n)},${Y(l.pos)}`).join(' ')} />
              <text x={X(last.n) + 7} y={Y(last.pos) + 3.5} fill={col(si)} fontSize="11" fontFamily="ui-monospace,monospace">#{d.number}</text>
            </g>
          );
        })}
        {hover && <line x1={X(hover.n)} y1={padT} x2={X(hover.n)} y2={H - padB} stroke="var(--axis)" strokeWidth="1" strokeDasharray="3 3" />}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="transparent"
          style={{ cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(hover.x + 14, window.innerWidth - 180), top: hover.y - 12 - hover.rows.length * 20 }}>
          <div className="hd">Volta {hover.n}</div>
          {hover.rows.map((r) => (
            <div className="row" key={r.num}><span><i style={{ background: col(r.si) }} />#{r.num}</span><b>{r.pos}º</b></div>
          ))}
        </div>
      )}
    </>
  );
}
