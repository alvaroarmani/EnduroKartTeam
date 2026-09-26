import { useEffect, useMemo, useState } from 'react';

/*
 * Inteligência de ritmo por KART + preparação da captura dos 15 dias em Jardim Camburi.
 * Lê /kart-pace.json (gerado por tools/kart-pace.js). No dia: sorteou o kart X → confere aqui.
 */
const PACE_URL = import.meta.env.VITE_KARTPACE_URL || '/kart-pace.json';

function fmtAgo(iso) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return 'há ' + Math.round(s / 60) + 'min';
  if (s < 86400) return 'há ' + Math.round(s / 3600) + 'h';
  return 'há ' + Math.round(s / 86400) + 'd';
}

export default function KartIntel() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(PACE_URL, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => (data?.byKart || []).map((k) => {
    const pct = (k.relPace - 1) * 100;
    const conf = k.sessions >= 4 && k.laps >= 60 ? 'alta' : k.sessions >= 2 && k.laps >= 25 ? 'média' : 'baixa';
    const tag = pct <= -0.5 ? 'rápido' : pct >= 1.5 ? 'lento' : 'médio';
    return { ...k, pct, conf, tag };
  }), [data]);

  const found = q ? rows.find((r) => String(r.number) === q.trim()) : null;

  return (
    <div>
      {/* PREPARAÇÃO 15 DIAS */}
      <section className="prep">
        <h2>Preparação — 15 dias em Jardim Camburi</h2>
        <p className="sub">popular o banco com o <b>ritmo por kart</b> na pista do campeonato, para no dia
          sabermos qual kart sorteado é lento/rápido (o nº do mylaptime = nº do kart).</p>
        <div className="prep-grid">
          <div className="prep-item"><span className="k">Alvo</span><b>Jardim Camburi</b><small>traçado mensal — capturar a partir do dia 1</small></div>
          <div className="prep-item"><span className="k">Período</span><b>dia 1 → 16</b><small>~15 dias, 24/7</small></div>
          <div className="prep-item"><span className="k">Como rodar</span><b className="mono">EVENT_FILTER=camburi</b><small>worker focado na pista; VPS de preferência (laptop 15d é frágil)</small></div>
          <div className="prep-item"><span className="k">Métrica</span><b>ritmo relativo</b><small>kart ÷ grid por sessão (isola clima e piloto)</small></div>
        </div>
      </section>

      {/* RANKING POR KART */}
      <section>
        <div className="hd"><h2>Ritmo por kart</h2>
          {data && <span className="foot">{data.sessions} sessões · {rows.length} karts · atualizado {fmtAgo(data.generatedAt)}</span>}</div>
        <p className="sub">% vs o grid (negativo = mais rápido). <b>Confiança</b> cresce com o nº de sessões/voltas —
          nos 15 dias, cada kart acumula amostra e o número fica sólido.</p>

        <div className="lookup">
          <span>Sorteou o kart</span>
          <input className="mono" placeholder="nº" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (found
            ? <span className={'look-res ' + found.tag}>#{found.number}: <b>{(found.pct >= 0 ? '+' : '') + found.pct.toFixed(1)}%</b> · {found.tag} · confiança {found.conf}</span>
            : <span className="look-res none">sem histórico do #{q}</span>)}
        </div>

        {err && !data && <div className="state">sem dados de ritmo por kart.<br /><span className="foot">Rode <code>node tools/kart-pace.js camburi</code> após capturar, ou aguarde os 15 dias.</span></div>}
        {data && rows.length === 0 && <div className="state">nenhum kart agregado ainda — captura pendente.</div>}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>#</th><th className="l">Kart</th><th>vs grid</th><th>Classe</th><th>Sessões</th><th>Voltas</th><th>Confiança</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.number}>
                    <td>{i + 1}</td>
                    <td className="l">#{r.number}</td>
                    <td className={'mono ' + r.tag}>{(r.pct >= 0 ? '+' : '') + r.pct.toFixed(1)}%</td>
                    <td><span className={'kt ' + r.tag}>{r.tag}</span></td>
                    <td className="mono">{r.sessions}</td>
                    <td className="mono">{r.laps}</td>
                    <td><span className={'conf ' + r.conf}>{r.conf}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`
        .prep{background:var(--surface);border-left:4px solid var(--accent)}
        .prep-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:6px}
        .prep-item{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
        .prep-item .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
        .prep-item b{font-size:14px} .prep-item small{color:var(--muted);font-size:11.5px}
        .hd{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
        .lookup{display:flex;align-items:center;gap:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:12px;flex-wrap:wrap}
        .lookup>span:first-child{font-size:13px;color:var(--ink-2)}
        .lookup input{width:70px;padding:6px 9px;border:1px solid var(--border);background:var(--surface);color:var(--ink);border-radius:7px;font-size:14px}
        .look-res{font-size:13px} .look-res.none{color:var(--muted)}
        .look-res.rápido{color:var(--good)} .look-res.lento{color:var(--live)}
        td.rápido,.kt.rápido{color:var(--good)} td.lento,.kt.lento{color:var(--live)} td.médio{color:var(--ink-2)}
        .kt{font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid var(--border)}
        .kt.rápido{background:color-mix(in srgb,var(--good) 15%,transparent);border-color:var(--good)}
        .kt.lento{background:color-mix(in srgb,var(--live) 14%,transparent);border-color:var(--live)}
        .conf{font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid var(--border);color:var(--muted)}
        .conf.alta{color:var(--good);border-color:var(--good)} .conf.baixa{color:var(--live);border-color:var(--live)}
        @media (max-width:720px){ .prep-grid{grid-template-columns:repeat(2,1fr)} }
      `}</style>
    </div>
  );
}
