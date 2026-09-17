import { fmt } from '../lib/format.js';

export default function Tiles({ drivers, maxLap }) {
  const leader = drivers[0] || {};
  const bests = drivers.map((d) => d.best).filter((x) => x && x > 8000 && x < 180000);
  const fastest = bests.length ? Math.min(...bests) : null;
  const fastestD = drivers.find((d) => d.best === fastest) || {};
  const tiles = [
    { k: 'Pilotos', v: drivers.length },
    { k: 'Voltas líder', v: leader.lapCount || maxLap },
    { k: 'Volta + rápida', v: fmt(fastest), s: '#' + (fastestD.number || '?') },
    { k: 'Líder', v: '#' + (leader.number || '?'), s: (leader.name || '').split(' ')[0] },
  ];
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div className="tile" key={t.k}>
          <div className="k">{t.k}</div>
          <div className="v mono">{t.v}{t.s ? <small> {t.s}</small> : null}</div>
        </div>
      ))}
    </div>
  );
}
