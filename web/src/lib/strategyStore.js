/*
 * Estado ÚNICO de estratégia da prova (config + paradas por kart + relógio manual).
 * Persistido em localStorage e compartilhado entre o Watchdog (StrategyPanel) e o
 * motor Virtual/Previsão (StrategyEngine). Na produção, sincronizar o box entre os
 * 4 membros troca SÓ este arquivo (WebSocket/Realtime no lugar do localStorage).
 */
const LS = 'ek_strategy_v1';

export const DEFAULTS = {
  durationMin: 240, boxOpenMin: 10, boxCloseBeforeEndMin: 20,
  minStopSec: 300, stopCycleSec: 480, totalStops: 7, targetWeightKg: 100,
  karts: [
    { id: 'A', label: 'Kart A', number: '', stops: 0 },
    { id: 'B', label: 'Kart B', number: '', stops: 0 },
    { id: 'C', label: 'Kart C', number: '', stops: 0 },
    { id: 'D', label: 'Kart D', number: '', stops: 0 },
  ],
  startedAt: null,   // epoch ms quando a prova começou (null = não iniciada)
  pausedElapsed: 0,  // segundos acumulados se pausar
  running: false,
  roster: [],        // plantel: [{ id, name, exp }]  (exp: 'A'|'B'|'C' experiência)
  plan: {},          // rotação: { [kartId]: [driverId por stint] }
  current: {},       // piloto atual por kart: { [kartId]: driverId }
};

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || '{}');
    const st = { ...DEFAULTS, ...saved };
    // garante o campo `number` em karts vindos de versões antigas do estado salvo
    st.karts = (st.karts || DEFAULTS.karts).map((k, i) => ({
      id: k.id || DEFAULTS.karts[i]?.id || String(i),
      label: k.label || DEFAULTS.karts[i]?.label || ('Kart ' + i),
      number: k.number || '',
      stops: k.stops || 0,
    }));
    st.roster = Array.isArray(st.roster) ? st.roster : [];
    st.plan = st.plan && typeof st.plan === 'object' ? st.plan : {};
    st.current = st.current && typeof st.current === 'object' ? st.current : {};
    return st;
  } catch { return { ...DEFAULTS }; }
}

let state = read();
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

export const strategyStore = {
  get: () => state,
  set: (next) => {
    state = typeof next === 'function' ? next(state) : next;
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch { /* modo privado */ }
    emit();
  },
  update: (patch) => strategyStore.set((s) => ({ ...s, ...patch })),
  subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
};

// sincroniza entre abas do navegador (mesmo dispositivo)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === LS) { state = read(); emit(); } });
}
