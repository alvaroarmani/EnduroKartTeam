/*
 * SIMULADOR + SUÍTE DE CENÁRIOS — prova que os cálculos e as INDICAÇÕES estão corretos.
 * Roda: node web/test/strategy-sim.mjs   (ou npm run sim, se configurado)
 *
 * Não é sobre "compila" — é sobre "a estratégia que ele sugere está certa?".
 * Cada cenário monta uma situação de corrida e afirma o que o sistema DEVE indicar.
 */
import { computeStrategy, greenPace, estimateStops } from '../src/lib/strategy-engine.js';
import { stints, currentStint, degradation, pairTrend, catchLaps, paceRank } from '../src/lib/analytics.js';
import { decideKart, driverRating } from '../src/lib/decisions.js';

const ST = { durationMin: 240, boxOpenMin: 10, boxCloseBeforeEndMin: 20, minStopSec: 300, stopCycleSec: 480, totalStops: 7 };
const BOX_CLOSE = ST.durationMin * 60 - ST.boxCloseBeforeEndMin * 60; // 13200s

// ---- mini framework de asserção ----
let pass = 0, fail = 0; const fails = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; fails.push(name); console.log('  \x1b[31m✗ ' + name + '\x1b[0m  ' + detail); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- helpers de dados ----
// gera voltas ~baseMs com ruído determinístico; insere paradas (voltas longas) em pitIdx.
function makeLaps({ number = 1, baseMs = 41000, sd = 250, degPerLap = 0, n = 30, pitEvery = null, pitMs = 300000 }) {
  const laps = []; let seed = number * 7 + 3, since = 0;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 1; i <= n; i++) {
    since++;
    let ms = baseMs + degPerLap * since + (rnd() - 0.5) * 2 * sd;
    if (pitEvery && since >= pitEvery) { ms += pitMs; since = 0; }
    laps.push({ n: i, ms: Math.round(ms), pos: null });
  }
  return laps;
}
const driver = (number, name, opts) => ({ number: String(number), name, pos: opts.pos || 1, lapCount: (opts.n || 30), laps: makeLaps({ number, ...opts }) });

console.log('\n=== SIMULAÇÃO DE ESTRATÉGIA — FDK 100 Milhas ===\n');

// ─────────────────────────────────────────────────────────────────────────────
console.log('S1. VIRTUAL: kart à frente que deve mais paradas cai no virtual');
{
  const A = { number: '10', name: 'KART A', pos: 1, lapCount: 40, laps: makeLaps({ number: 10, n: 40 }) };
  const B = { number: '20', name: 'KART B', pos: 2, lapCount: 40, laps: makeLaps({ number: 20, n: 40 }) };
  const ours = new Map([['10', { stopsDone: 5 }], ['20', { stopsDone: 1 }]]);
  const { virtual, prediction } = computeStrategy([A, B], { durationSec: 14400, ...ST }, ours, 7200);
  const vA = virtual.find(r => r.number === '10'), vB = virtual.find(r => r.number === '20');
  check('A (5 paradas) fica à frente de B (1 parada) no virtual', vA.virtualPos < vB.virtualPos, `A=${vA.virtualPos} B=${vB.virtualPos}`);
  check('netLaps de A > netLaps de B', vA.netLaps > vB.netLaps);
  const pA = prediction.find(r => r.number === '10'), pB = prediction.find(r => r.number === '20');
  check('PREVISÃO: A projeta MAIS voltas que B (menos tempo de box a gastar)', pA.projLaps > pB.projLaps, `A=${pA.projLaps.toFixed(1)} B=${pB.projLaps.toFixed(1)}`);
}

console.log('\nS2. PREVISÃO: com paradas iguais, o mais RÁPIDO projeta mais voltas');
{
  const A = { number: '1', name: 'RÁPIDO', pos: 2, lapCount: 40, laps: makeLaps({ number: 1, baseMs: 40500, n: 40 }) };
  const B = { number: '2', name: 'LENTO', pos: 1, lapCount: 40, laps: makeLaps({ number: 2, baseMs: 41500, n: 40 }) };
  const ours = new Map([['1', { stopsDone: 3 }], ['2', { stopsDone: 3 }]]);
  const { prediction } = computeStrategy([A, B], { durationSec: 14400, ...ST }, ours, 7200);
  check('RÁPIDO fica em 1º na previsão', prediction[0].number === '1', `1º=${prediction[0].number}`);
}

console.log('\nS3. ESTIMATIVA DE PARADAS de rival por voltas longas');
{
  const R = driver(30, 'RIVAL', { baseMs: 41000, n: 50, pitEvery: 15, pitMs: 320000 }); // ~3 paradas
  const g = greenPace(R.laps);
  const est = estimateStops(R.laps, g, ST.minStopSec * 1000);
  check('detecta ~3 paradas nas voltas longas', est === 3, `estimou ${est}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nS4. DECISÃO: risco de DQ quando as paradas não cabem mais');
{
  // pending 5 → precisa 2400s; deixa só 2000s até o box fechar
  const elapsed = BOX_CLOSE - 2000;
  const d = decideKart({ st: ST, stops: 2, elapsedSec: elapsed });
  check('indica dq_risk (parar já)', d.action.code === 'dq_risk', `code=${d.action.code} folga=${Math.round(d.box.folga)}`);
  check('folga negativa', d.box.folga < 0);
}

console.log('\nS5. DECISÃO: box fechado com paradas faltando → DQ');
{
  const d = decideKart({ st: ST, stops: 6, elapsedSec: BOX_CLOSE + 120 });
  check('indica dq (box fechado)', d.action.code === 'dq', `code=${d.action.code}`);
}

console.log('\nS6. DECISÃO: PARAR AGORA quando a folga fica crítica (<2min)');
{
  // pending 3 → 1440s; folga alvo ~100s
  const elapsed = BOX_CLOSE - 1540;
  const d = decideKart({ st: ST, stops: 4, elapsedSec: elapsed });
  check('indica stop_now (folga crítica)', d.action.code === 'stop_now', `code=${d.action.code} folga=${Math.round(d.box.folga)}`);
  check('folga entre 0 e 120s', d.box.folga > 0 && d.box.folga < 120);
}

console.log('\nS7. DECISÃO: "parar em breve" na zona amarela (2–5min de folga)');
{
  const elapsed = BOX_CLOSE - (1440 + 200); // folga ~200s
  const d = decideKart({ st: ST, stops: 4, elapsedSec: elapsed, flag: 'green' });
  check('indica soon (amarelo)', d.action.code === 'soon', `code=${d.action.code} folga=${Math.round(d.box.folga)}`);
}

console.log('\nS8. DECISÃO: cedo na prova com poucas paradas devidas → seguir');
{
  const d = decideKart({ st: ST, stops: 1, elapsedSec: 1200, flag: 'green' });
  check('indica seguir (verde)', d.action.code === 'go', `code=${d.action.code}`);
  check('folga folgada (>5min)', d.box.folga > 300);
}

console.log('\nS9. DECISÃO: bandeira amarela com box aberto → parar é grátis');
{
  const d = decideKart({ st: ST, stops: 3, elapsedSec: 5000, flag: 'yellow' });
  check('indica flag_stop', d.action.code === 'flag_stop', `code=${d.action.code}`);
}

console.log('\nS10. DECISÃO: ritmo caindo no stint → avaliar troca');
{
  const deg = { dir: 'down', delta: 1500, base: 41000, recent: 42500 };
  const d = decideKart({ st: ST, stops: 2, elapsedSec: 4000, flag: 'green', deg });
  check('indica fading (ritmo caindo)', d.action.code === 'fading', `code=${d.action.code}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nS11. METRÔNOMO: quem cumpre as paradas no ritmo do tempo fica sempre verde');
{
  let ok = true, worst = Infinity;
  for (const frac of [0.2, 0.4, 0.6, 0.8, 0.95]) {
    const elapsed = BOX_CLOSE * frac;
    const stops = Math.round(ST.totalStops * frac);
    const d = decideKart({ st: ST, stops, elapsedSec: elapsed, flag: 'green' });
    worst = Math.min(worst, d.box.folga);
    if (d.action.code === 'dq_risk' || d.action.code === 'dq' || d.box.folga < 0) ok = false;
  }
  check('nunca entra em risco de DQ seguindo o metrônomo', ok, `pior folga=${Math.round(worst)}s`);
}

console.log('\nS12. STINT: segmenta paradas e conta certo');
{
  const laps = makeLaps({ number: 5, n: 45, pitEvery: 15, pitMs: 320000 }); // 3 paradas (voltas 15,30,45)
  const g = greenPace(laps);
  const segs = stints(laps, g);
  check('separa em 3 segmentos', segs.length === 3, `segs=${segs.length}`);
  const cs = currentStint(laps, g);
  check('conta 3 paradas até agora', cs.stopsSoFar === 3, `stopsSoFar=${cs.stopsSoFar}`);
}

console.log('\nS13. DEGRADAÇÃO: detecta ritmo subindo (piorando) vs estável');
{
  const fading = makeLaps({ number: 6, baseMs: 41000, degPerLap: 250, sd: 60, n: 20 });
  const steady = makeLaps({ number: 7, baseMs: 41000, degPerLap: 0, sd: 60, n: 20 });
  const dF = degradation(fading, greenPace(fading));
  const dS = degradation(steady, greenPace(steady));
  check('kart que degrada → dir "down"', dF && dF.dir === 'down', `dir=${dF && dF.dir} delta=${dF && Math.round(dF.delta)}`);
  check('kart estável → dir "flat"', dS && dS.dir === 'flat', `dir=${dS && dS.dir} delta=${dS && Math.round(dS.delta)}`);
}

console.log('\nS14. APROXIMAÇÃO: estima em quantas voltas alcança o rival');
{
  // eu 0.5s/volta mais rápido que o rival à frente, gap 5s → alcança em ~10 voltas
  const me = makeLaps({ number: 8, baseMs: 40500, sd: 30, n: 20 });
  const ahead = makeLaps({ number: 9, baseMs: 41000, sd: 30, n: 20 });
  const tr = pairTrend(me, ahead, 8);
  const laps = catchLaps(5000, tr.ratePerLap);
  check('taxa ~0.5s/volta a meu favor', tr.ratePerLap > 300 && tr.ratePerLap < 700, `rate=${Math.round(tr.ratePerLap)}`);
  check('alcança em ~10 voltas', near(laps, 10, 2), `laps=${laps && laps.toFixed(1)}`);
  // ritmo parelho
  const evenAhead = makeLaps({ number: 11, baseMs: 40500, sd: 30, n: 20 });
  const trEven = pairTrend(me, evenAhead, 8);
  check('ritmo parelho → taxa perto de zero', Math.abs(trEven.ratePerLap) < 60, `rate=${Math.round(trEven.ratePerLap)}`);
}

console.log('\nS15. HABILIDADE DO PILOTO: rápido+regular > lento+irregular, dentro de 0–100');
{
  const ref = { refBestMs: 40500, refSdMs: 200 };
  const ace = driverRating({ greenMs: 40500, sdMs: 200 }, ref);
  const mid = driverRating({ greenMs: 41200, sdMs: 500 }, ref);
  const low = driverRating({ greenMs: 42500, sdMs: 1200 }, ref);
  check('ás perto de 100', ace.overall >= 90, `ace=${ace.overall}`);
  check('ordena ás > médio > fraco', ace.overall > mid.overall && mid.overall > low.overall, `${ace.overall}/${mid.overall}/${low.overall}`);
  check('sempre dentro de 0–100', [ace, mid, low].every(x => x.overall >= 0 && x.overall <= 100));
}

console.log('\nS16. KPI DA EQUIPE: o kart mais urgente aparece com maior prioridade');
{
  const karts = [
    decideKart({ st: ST, stops: 5, elapsedSec: 2000, flag: 'green' }),               // go
    decideKart({ st: ST, stops: 2, elapsedSec: BOX_CLOSE - 1900, flag: 'green' }),    // dq_risk/stop
    decideKart({ st: ST, stops: 7, elapsedSec: 8000, flag: 'green' }),               // done
  ];
  const sorted = [...karts].sort((a, b) => b.action.priority - a.action.priority);
  check('o mais urgente é o de risco (prioridade máxima)', sorted[0].action.priority >= 90, `top=${sorted[0].action.code}`);
  check('o "done" tem prioridade mínima', karts[2].action.priority === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`RESULTADO: \x1b[32m${pass} passaram\x1b[0m` + (fail ? `, \x1b[31m${fail} falharam\x1b[0m` : '') + `  (${pass}/${pass + fail})`);
if (fail) { console.log('Falhas: ' + fails.join(', ')); process.exit(1); }
console.log('Todos os cenários bateram com o esperado. ✅\n');
