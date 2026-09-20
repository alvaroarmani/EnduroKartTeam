/*
 * DECISÃO POR KART — "o que fazer com este kart AGORA". Puro e testável.
 * Centraliza a lógica que o Cockpit mostra e que o simulador valida.
 * Prioridade (priority) maior = mais urgente → usada para ordenar os KPIs da equipe.
 */
import { boxState, fmtClock } from './race.js';

export function decideKart({ st, stops, elapsedSec, stint = null, deg = null, inBox = false, flag = null }) {
  const pending = Math.max(0, st.totalStops - stops);
  const done = stops >= st.totalStops;
  const box = boxState(st, elapsedSec, pending);

  // DQ: as paradas restantes NÃO cabem mais antes do box fechar.
  const cannotFit = !done && box.timeToBoxClose < box.required;   // folga < 0
  const boxClosedUndone = !done && box.closed;

  let a;
  if (done) {
    a = { code: 'done', txt: '✓ paradas cumpridas', cls: 'ok', priority: 0 };
  } else if (boxClosedUndone) {
    a = { code: 'dq', txt: '⛔ box fechado · faltam ' + pending + ' parada(s)', cls: 'crit', priority: 100 };
  } else if (inBox) {
    a = { code: 'in_box', txt: '🟠 NO BOX', cls: 'box', priority: 55 };
  } else if (cannotFit) {
    a = { code: 'dq_risk', txt: '⛔ RISCO DE DQ — parar já (folga ' + fmtClock(box.folga) + ')', cls: 'crit', priority: 95 };
  } else if (box.level === 'crit') {
    a = { code: 'stop_now', txt: '🔴 PARAR AGORA · folga ' + fmtClock(box.folga), cls: 'crit', priority: 90 };
  } else if ((flag === 'yellow' || flag === 'red') && box.open) {
    a = { code: 'flag_stop', txt: '🟡 neutralização — PARAR é tempo grátis', cls: 'warn', priority: 70 };
  } else if (deg && deg.dir === 'down' && deg.delta > 800) {
    a = { code: 'fading', txt: '⚠ ritmo caindo ' + (deg.delta / 1000).toFixed(1) + 's — avaliar troca/box', cls: 'warn', priority: 50 };
  } else if (box.level === 'warn') {
    a = { code: 'soon', txt: '🟡 parar em breve · até ' + fmtClock(box.timeToNextDeadline), cls: 'warn', priority: 45 };
  } else if (!box.open) {
    a = { code: 'wait', txt: 'box abre em ' + fmtClock(box.timeToOpen), cls: 'muted', priority: 15 };
  } else {
    a = { code: 'go', txt: '🟢 seguir · próx. box até ' + fmtClock(box.timeToNextDeadline), cls: 'ok', priority: 20 };
  }
  return { pending, done, box, cannotFit, boxClosedUndone, action: a };
}

/*
 * HABILIDADE DO PILOTO (0–100) a partir do desempenho medido.
 * Combina ritmo relativo ao melhor do grid (speed) e consistência (regularidade).
 * refBestMs = melhor ritmo verde do grid; refSdMs = melhor desvio observado.
 */
export function driverRating({ greenMs, sdMs }, { refBestMs, refSdMs }) {
  if (!greenMs || !refBestMs) return null;
  // velocidade: 100 no ref; cada 1% mais lento tira ~4 pontos
  const slowPct = (greenMs - refBestMs) / refBestMs * 100;
  const speed = Math.max(0, 100 - slowPct * 4);
  // consistência: 100 no melhor desvio; penaliza a variação relativa ao ritmo
  let consist = 60;
  if (sdMs != null && greenMs) {
    const cv = sdMs / greenMs; // coef. de variação (menor = melhor)
    consist = Math.max(0, 100 - cv * 100 * 8); // 1% de CV ~ -8 pts
  }
  const overall = Math.round(speed * 0.6 + consist * 0.4);
  return { overall: Math.max(0, Math.min(100, overall)), speed: Math.round(speed), consist: Math.round(consist) };
}
