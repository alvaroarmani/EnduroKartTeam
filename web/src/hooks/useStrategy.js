import { useSyncExternalStore } from 'react';
import { strategyStore } from '../lib/strategyStore.js';

/*
 * Assina o estado de estratégia compartilhado. Retorna [estado, update, set].
 * Qualquer componente que use este hook re-renderiza quando o box mexe nas paradas,
 * na config ou no relógio — o Watchdog e o motor Virtual/Previsão ficam em sincronia.
 */
export function useStrategy() {
  const state = useSyncExternalStore(strategyStore.subscribe, strategyStore.get, strategyStore.get);
  return [state, strategyStore.update, strategyStore.set];
}
