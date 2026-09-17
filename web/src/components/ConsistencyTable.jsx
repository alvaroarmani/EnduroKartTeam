import { fmt } from '../lib/format.js';

export default function ConsistencyTable({ drivers, fastest }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Pos</th><th className="l">Piloto</th><th>Voltas</th>
            <th>Melhor</th><th>Média</th><th>Consist.</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.number}>
              <td>{d.pos ? d.pos + 'º' : ''}</td>
              <td className="l">#{d.number} {d.name}</td>
              <td className="mono">{d.lapCount || d.laps.length}</td>
              <td className={'mono' + (d.best === fastest ? ' best' : '')}>{fmt(d.best)}</td>
              <td className="mono">{fmt(d.avg)}</td>
              <td className="mono">{d.sd != null ? '±' + (d.sd / 1000).toFixed(3) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
