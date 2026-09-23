import { useEffect, useRef, useState } from 'react';
import { useStrategy } from './useStrategy.js';

/*
 * Dados do EVENTO EM ANÁLISE. A URL vem do evento ativo selecionado na tela Eventos
 * (strategyStore.activeEvent.dataUrl); sem seleção, cai no default VITE_DATA_URL.
 * Trocar por Supabase Realtime / WebSocket depois muda SÓ este arquivo.
 */
const DATA_URL = import.meta.env.VITE_DATA_URL || '/event-data.json';
const POLL_MS = Number(import.meta.env.VITE_POLL_MS || 10000);

export function useEventData() {
  const [st] = useStrategy();
  const dataUrl = st.activeEvent?.dataUrl || DATA_URL;
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    async function tick() {
      try {
        const res = await fetch(dataUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        // aceita tanto JSON puro quanto "window.EV={...};"
        const json = text.trim().startsWith('window.EV')
          ? JSON.parse(text.replace(/^\s*window\.EV\s*=\s*/, '').replace(/;\s*$/, ''))
          : JSON.parse(text);
        if (alive) setState({ data: json, error: null, loading: false, updatedAt: Date.now() });
      } catch (e) {
        if (alive) setState((s) => ({ ...s, error: e.message, loading: false }));
      }
    }
    tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer.current); };
  }, [dataUrl]);

  return state;
}
