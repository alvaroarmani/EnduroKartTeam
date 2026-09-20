/*
 * PLANEJADOR DE ALOCAÇÃO — sugere quem dirige cada stint (grade karts × stints).
 * Puro e testável. Respeita, nesta ordem:
 *   1) ases (nível A / apto a pressão) nas STINTS FINAIS (zona de pressão);
 *   2) piloto mais forte no kart mais LENTO (kart de aluguel varia);
 *   3) uso equilibrado (~mesmo nº de stints por piloto);
 *   4) sem stints seguidos no mesmo kart (fadiga).
 * É uma SUGESTÃO — o estrategista ajusta em cima.
 */
const EXP_BASE = { A: 84, B: 70, C: 56 };

export function driverScore(d, measuredOverall) {
  return measuredOverall != null ? measuredOverall : (EXP_BASE[d.exp] ?? 70);
}

export function suggestAllocation({ roster, karts, nStints, measured = new Map(), kartPace = new Map() }) {
  const plan = {};
  karts.forEach((k) => { plan[k.id] = Array(nStints).fill(''); });
  if (!roster.length || !karts.length) return plan;

  const scored = roster.map((d) => ({
    id: d.id, exp: d.exp, pressure: !!d.pressure, score: driverScore(d, measured.get(d.id)),
  }));

  // ordem dos karts: mais LENTO primeiro (recebe os pilotos mais fortes).
  const paces = karts.map((k) => kartPace.get(k.id)).filter((v) => v != null);
  const avgPace = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : 0;
  const kOrder = [...karts].sort((a, b) => (kartPace.get(b.id) ?? avgPace) - (kartPace.get(a.id) ?? avgPace));

  // snake draft: pilotos mais fortes distribuídos entre as crews (kart lento escolhe 1º).
  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const crews = new Map(kOrder.map((k) => [k.id, []]));
  let idx = 0, dir = 1;
  for (const d of byScore) {
    crews.get(kOrder[idx].id).push(d);
    idx += dir;
    if (idx >= kOrder.length) { idx = kOrder.length - 1; dir = -1; }
    else if (idx < 0) { idx = 0; dir = 1; }
  }

  // dentro de cada kart: padrão ascendente por (score + bônus de pressão) → os mais
  // fortes/aptos caem nas stints finais; ciclo evita repetição seguida.
  for (const k of karts) {
    const crew = (crews.get(k.id) || []).slice()
      .sort((a, b) => (a.score + (a.pressure ? 15 : 0)) - (b.score + (b.pressure ? 15 : 0)));
    if (!crew.length) continue;
    for (let s = 0; s < nStints; s++) plan[k.id][s] = crew[s % crew.length].id;
  }
  return plan;
}
