/*
 * MOTOR VIRTUAL + PREVISÃO — o "cérebro" do sistema.
 *
 * Funde o que é AUTOMÁTICO (feed do mylaptime: voltas, ritmo, posição) com o que é
 * MANUAL (paradas obrigatórias cumpridas por kart) para responder as duas perguntas
 * que a cronometragem crua não responde:
 *   1) Classificação VIRTUAL  → "quem está ganhando DE VERDADE" (ordem se todos
 *      cumprissem agora as paradas que ainda devem).
 *   2) PREVISÃO de resultado  → "como isso termina na bandeirada" (voltas projetadas).
 *
 * Funções puras, sem React/DOM — dá para rodar igual no navegador e no backend.
 * Referência conceitual em docs/CONHECIMENTO-ENDURANCE.md (seção 5, P1).
 */

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/*
 * Ritmo "verde": mediana das voltas LIMPAS. Descarta voltas de box/tráfego/incidente
 * (> mediana bruta × outlierFactor). Endurance se mede por ritmo médio, não pela volta
 * mais rápida — daí mediana das limpas, não o `best`.
 */
export function greenPace(laps, outlierFactor = 1.3) {
  const ms = (laps || []).map((l) => l.ms).filter((x) => x > 0);
  if (!ms.length) return null;
  const rawMed = median(ms);
  const clean = ms.filter((x) => x <= rawMed * outlierFactor);
  return median(clean.length ? clean : ms);
}

/*
 * Estima paradas cumpridas de um RIVAL (não sabemos as dele). Uma parada obrigatória
 * (≥ minStopMs) aparece como UMA volta anormalmente longa no histórico. Contamos essas.
 * Sempre marcado como estimativa na saída (nunca tratar como verdade).
 */
export function estimateStops(laps, greenMs, minStopMs) {
  if (!greenMs || !laps) return 0;
  const thr = greenMs + minStopMs * 0.6; // volta que embute uma parada de box
  return laps.filter((l) => l.ms >= thr).length;
}

/*
 * Núcleo. Recebe:
 *   competitors: [{ number, name, pos, lapCount, laps:[{n,ms,pos}], best, avg }]
 *   cfg: { durationSec, totalStops, stopCycleSec, minStopSec, flag? }
 *   ours: Map<numeroDoKart, { stopsDone, label }>   (nossos karts; paradas MANUAIS)
 *   elapsedSec: tempo de prova decorrido (do relógio do feed, ou do watchdog)
 *
 * Retorna { virtual, prediction, meta }.
 */
export function computeStrategy(competitors, cfg, ours, elapsedSec) {
  const durationSec = cfg.durationSec || 240 * 60;
  const totalStops = cfg.totalStops ?? 7;
  const stopLossSec = cfg.stopCycleSec ?? 480;   // s consumidos por parada (fora de pista)
  const minStopMs = (cfg.minStopSec ?? 300) * 1000;
  const remainingSec = Math.max(0, durationSec - (elapsedSec || 0));
  ours = ours || new Map();

  const rows = (competitors || []).map((c) => {
    const num = String(c.number);
    const green = greenPace(c.laps) || c.avg || c.best || null;   // ms/volta
    const isOurs = ours.has(num);
    const manual = isOurs ? ours.get(num) : null;
    const stopsDone = manual
      ? clamp(Number(manual.stopsDone) || 0, 0, totalStops)
      : estimateStops(c.laps, green, minStopMs);
    const pending = Math.max(0, totalStops - stopsDone);
    const lapsDone = c.lapCount || (c.laps ? c.laps.length : 0);

    // PREVISÃO: voltas extra que ainda dá, com o RITMO DO PRÓPRIO kart (kart mais rápido
    // faz mais voltas no tempo restante). Desconta o tempo das paradas que faltam.
    let addLaps = 0, projLaps = lapsDone;
    if (green) {
      const raceTimeLeft = Math.max(0, remainingSec - pending * stopLossSec);
      addLaps = raceTimeLeft / (green / 1000);
      projLaps = lapsDone + addLaps;
    }
    return {
      number: num, name: c.name, pos: c.pos || 999,
      lapsDone, green, stopsDone, pending, isOurs, estimated: !isOurs,
      addLaps, projLaps,
    };
  });

  // Ritmo de REFERÊNCIA único (mediana do grid) para converter a dívida de paradas em
  // voltas-equivalente no VIRTUAL. Usar o ritmo de cada kart aqui distorceria (kart lento
  // teria "dívida" menor em voltas). A posição na pista é tempo, não voltas próprias.
  const refGreen = median(rows.map((r) => r.green).filter(Boolean)) || 45000;
  rows.forEach((r) => {
    const debtLaps = (r.pending * stopLossSec) / (refGreen / 1000);
    r.netLaps = r.lapsDone - debtLaps;
  });

  // ---- PREVISÃO: ordena por voltas projetadas (desc); empate → quem está à frente hoje.
  const prediction = [...rows]
    .sort((a, b) => b.projLaps - a.projLaps || a.pos - b.pos)
    .map((r, i) => ({ ...r, projPos: i + 1 }));
  const pLead = prediction[0];
  if (pLead) prediction.forEach((r) => {
    r.projGapLaps = pLead.projLaps - r.projLaps;
    r.projGapSec = pLead.green ? r.projGapLaps * (pLead.green / 1000) : null;
  });

  // ---- VIRTUAL AGORA: ordem se todos cumprissem já as paradas devidas (netLaps desc).
  const virtual = [...rows]
    .sort((a, b) => b.netLaps - a.netLaps || a.pos - b.pos)
    .map((r, i) => ({ ...r, virtualPos: i + 1 }));
  const vLead = virtual[0];
  if (vLead) virtual.forEach((r) => {
    r.vGapLaps = vLead.netLaps - r.netLaps;
    r.vGapSec = vLead.green ? r.vGapLaps * (vLead.green / 1000) : null;
    // quanto a posição virtual difere da posição na pista (+ = virtualmente melhor)
    r.deltaPos = (r.pos || 0) - r.virtualPos;
  });

  return {
    virtual, prediction,
    meta: {
      elapsedSec: elapsedSec || 0, remainingSec, durationSec,
      totalStops, stopLossSec,
      anyOurs: rows.some((r) => r.isOurs),
      flag: cfg.flag || null,
      count: rows.length,
    },
  };
}
