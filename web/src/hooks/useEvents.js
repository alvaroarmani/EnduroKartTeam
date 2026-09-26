import { useEffect, useRef, useState } from 'react';

/*
 * Índice de eventos ONLINE do mylaptime. Vem do worker (endpoint /events, gate-free —
 * não precisa parear) ou de um events.json estático. Trocar por WebSocket/Realtime
 * depois muda só este arquivo.
 *
 * Cada item: { id, name, track, karts, laps, flag, live, capturedAt, dataUrl }
 */
export const EVENTS_URL = import.meta.env.VITE_EVENTS_URL || '/events.json';
const POLL_MS = Number(import.meta.env.VITE_POLL_MS || 10000);

/*
 * Resolve o dataUrl do evento (que vem relativo, ex.: "/events/<id>") contra a ORIGEM
 * do endpoint de eventos. Assim funciona tanto com arquivos estáticos (mesma origem)
 * quanto com o worker em outra porta (ex.: VITE_EVENTS_URL=http://host:8080/events).
 */
export function resolveDataUrl(dataUrl) {
  if (!dataUrl) return dataUrl;
  try { return new URL(dataUrl, new URL(EVENTS_URL, window.location.href)).href; } catch { return dataUrl; }
}

/* URL de um caminho no WORKER (mesma origem do endpoint de eventos). Ex.: workerUrl('/health'). */
export function workerUrl(path = '') {
  try { return new URL(path, new URL(EVENTS_URL, window.location.href)).href; } catch { return path; }
}

/*
 * Manda o FOCO (ids dos eventos analisando + fixados) pro worker: ele passa a capturar
 * só esses. Vai para <origem do EVENTS_URL>/focus. Sem worker (fixture estático) falha
 * em silêncio — não atrapalha o demo.
 */
export function postFocus(ids) {
  try {
    const url = new URL('/focus', new URL(EVENTS_URL, window.location.href)).href;
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {});
  } catch { /* sem worker */ }
}

export function useEvents() {
  const [state, setState] = useState({ events: [], error: null, loading: true, updatedAt: null });
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch(EVENTS_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        const events = Array.isArray(json) ? json : (json.events || []);
        if (alive) setState({ events, error: null, loading: false, updatedAt: Date.now() });
      } catch (e) {
        if (alive) setState((s) => ({ ...s, error: e.message, loading: false }));
      }
    }
    tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer.current); };
  }, []);

  return state;
}
