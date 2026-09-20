/*
 * ANÁLISE DE CORRIDA — deriva do histórico volta a volta (que já capturamos) as
 * informações de decisão que a cronometragem crua não mostra: estado do stint,
 * degradação, tendência de gaps (aproximação), ranking de ritmo e a linha do tempo.
 *
 * Tudo função pura sobre `laps: [{ n, ms, pos }]`. Sem React/DOM.
 */
import { greenPace } from './strategy-engine.js';

export const median = (arr) => {
  const s = arr.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

/* Uma volta é "de box" se muito mais longa que o ritmo verde (parada embutida). */
function isPitLap(ms, greenMs, opts = {}) {
  if (!greenMs) return false;
  if (opts.minStopMs) return ms >= greenMs + opts.minStopMs * 0.6;
  return ms >= greenMs * (opts.pitFactor || 2.0);
}

/* Segmenta as voltas em stints, cortando nas voltas de box. */
export function stints(laps, greenMs, opts = {}) {
  const segs = [];
  let cur = [];
  for (const l of laps) {
    cur.push(l);
    if (isPitLap(l.ms, greenMs, opts)) { segs.push(cur); cur = []; }
  }
  if (cur.length) segs.push(cur);
  return segs.map((s, i) => ({
    idx: i, startN: s[0].n, endN: s[s.length - 1].n,
    laps: s, count: s.length,
    ms: s.reduce((a, l) => a + l.ms, 0),
    pitLapMs: isPitLap(s[s.length - 1].ms, greenMs, opts) ? s[s.length - 1].ms : null,
  }));
}

/* Estado do stint ATUAL: voltas desde a última parada + tempo acumulado. */
export function currentStint(laps, greenMs, opts = {}) {
  if (!laps || !laps.length) return null;
  const segs = stints(laps, greenMs, opts);
  const last = segs[segs.length - 1];
  // se a última volta foi de box, o kart acabou de parar → stint "zerando"
  const justPitted = isPitLap(laps[laps.length - 1].ms, greenMs, opts);
  // paradas = nº de voltas-de-box (contar direto evita subcontagem quando a última é parada)
  const stopsSoFar = laps.filter((l) => isPitLap(l.ms, greenMs, opts)).length;
  return {
    startN: last.startN, lapsInStint: justPitted ? 0 : last.count,
    msInStint: justPitted ? 0 : last.laps.reduce((a, l) => a + l.ms, 0),
    stopsSoFar, justPitted,
  };
}

/* Média móvel de ritmo (para gráfico/tendência). */
export function rollingPace(laps, w = 5) {
  return laps.map((l, i) => {
    const win = laps.slice(Math.max(0, i - w + 1), i + 1).map((x) => x.ms);
    return { n: l.n, ms: mean(win) };
  });
}

/*
 * Degradação do stint atual: compara o ritmo das últimas w voltas limpas com o
 * começo do stint. delta > 0 = ritmo caindo (kart/piloto cansando ou problema).
 */
export function degradation(laps, greenMs, w = 5, opts = {}) {
  if (!laps || laps.length < 3) return null;
  const segs = stints(laps, greenMs, opts);
  const seg = segs[segs.length - 1].laps.filter((l) => !isPitLap(l.ms, greenMs, opts));
  if (seg.length < 4) return null;
  const clean = seg.filter((l) => l.ms <= (greenMs || Infinity) * 1.25).map((l) => l.ms);
  const use = clean.length >= 4 ? clean : seg.map((l) => l.ms);
  const base = mean(use.slice(0, Math.min(w, use.length)));
  const recent = mean(use.slice(-w));
  const delta = recent - base;
  return {
    base, recent, delta,
    dir: delta > 400 ? 'down' : delta < -400 ? 'up' : 'flat', // down = mais lento
  };
}

/* Ranking do grid por ritmo verde. Retorna Map<number, { green, rank }>. */
export function paceRank(drivers) {
  const arr = drivers.map((d) => ({ number: String(d.number), green: greenPace(d.laps) || d.avg || d.best || Infinity }));
  arr.sort((a, b) => a.green - b.green);
  const m = new Map();
  arr.forEach((x, i) => m.set(x.number, { green: isFinite(x.green) ? x.green : null, rank: i + 1 }));
  return m;
}

/*
 * Tendência entre dois karts (eu vs outro) nas últimas w voltas em comum.
 * ratePerLap > 0 = estou mais rápido que o outro (ganhando ~X ms/volta nele).
 * Se o outro está à frente, isso é a TAXA DE APROXIMAÇÃO.
 */
export function pairTrend(meLaps, otherLaps, w = 5) {
  const om = new Map(otherLaps.map((l) => [l.n, l.ms]));
  const common = meLaps.filter((l) => om.has(l.n)).slice(-w);
  if (common.length < 2) return null;
  const deltas = common.map((l) => om.get(l.n) - l.ms); // outro − eu
  const ratePerLap = mean(deltas);
  return { ratePerLap, laps: common.length };
}

/* Em quantas voltas fecho um gap (ms), dada a taxa de aproximação (ms/volta). */
export function catchLaps(gapMs, ratePerLap) {
  if (!gapMs || !ratePerLap || ratePerLap <= 0) return null;
  return gapMs / ratePerLap;
}

/*
 * LINHA DO TEMPO retrospectiva reconstruída do histórico: paradas, trocas de
 * liderança e recordes de volta. Ordenada da mais recente para a mais antiga.
 */
export function timeline(drivers, opts = {}) {
  const events = [];
  let overallBest = Infinity, overallBestBy = null;
  // recordes de volta (varre em ordem de volta, no grid inteiro)
  const maxN = drivers.reduce((m, d) => Math.max(m, d.laps.length ? d.laps[d.laps.length - 1].n : 0), 0);
  const byNum = new Map(drivers.map((d) => [String(d.number), d]));
  const greens = new Map(drivers.map((d) => [String(d.number), greenPace(d.laps)]));

  for (let n = 1; n <= maxN; n++) {
    let leaderThisLap = null;
    for (const d of drivers) {
      const lap = d.laps.find((l) => l.n === n);
      if (!lap) continue;
      // parada (volta de box)
      if (isPitLap(lap.ms, greens.get(String(d.number)), opts)) {
        events.push({ n, type: 'pit', number: String(d.number), name: d.name, ms: lap.ms });
      }
      // recorde geral de volta
      if (lap.ms < overallBest && lap.ms > 8000) {
        overallBest = lap.ms; overallBestBy = String(d.number);
        events.push({ n, type: 'fastest', number: String(d.number), name: d.name, ms: lap.ms });
      }
      if (lap.pos === 1) leaderThisLap = d;
    }
  }
  // trocas de liderança (a partir do campo pos por volta)
  let prevLeader = null;
  for (let n = 1; n <= maxN; n++) {
    const leader = drivers.find((d) => d.laps.some((l) => l.n === n && l.pos === 1));
    if (leader && String(leader.number) !== prevLeader) {
      if (prevLeader != null) events.push({ n, type: 'lead', number: String(leader.number), name: leader.name });
      prevLeader = String(leader.number);
    }
  }
  return events.sort((a, b) => b.n - a.n).slice(0, opts.limit || 40);
}
