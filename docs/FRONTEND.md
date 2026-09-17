# Frontend (React + Vite) — `web/`

App React que consome a captura do mylaptime e mostra **telemetria ao vivo** + o **watchdog de
estratégia** (anti-DQ). Substitui, para o dia da prova, o dashboard-Artifact (que não pode falar
com backend por causa do CSP). Hospedável por link (Vercel/Netlify/VPS) → ver
[`PLANO-PRODUCAO.md`](PLANO-PRODUCAO.md).

## Rodar (dev)
```bash
cd web
npm install
npm run dev            # http://localhost:5173
```
Fonte de dados em dev: `web/public/event-data.json` (gere com
`node tools/build-event-data.js FKI` na raiz e copie para `web/public/`).

## Build (produção)
```bash
cd web && npm run build     # gera web/dist/ (estático)
```
Deploy o `dist/` num host estático. Config via `.env` (ver `web/.env.example`):
- `VITE_DATA_URL` — de onde o app busca os dados (JSON). Default `/event-data.json`.
- `VITE_POLL_MS` — intervalo de polling (default 10s).

## Estrutura
```
web/src/
  App.jsx                     abas: Telemetria (FKI) | Estratégia (nossa prova)
  hooks/useEventData.js       fetch + polling do JSON  ← trocar por WebSocket/Realtime aqui
  components/
    Tiles, PaceChart, PositionChart, ConsistencyTable   (telemetria)
    StrategyPanel              WATCHDOG anti-DQ: relógio + janela do box + paradas/kart + folga
  lib/format.js               fmt(tempo), cores de série
  styles.css                  paleta (clara/escura) validada
```

## Duas telas
- **Telemetria (FKI):** tiles, **tempo por volta** (faixa competitiva + mediana), **posição por
  volta** (exata), **ritmo e consistência**. Dados do worker (bateria mais recente do FKI).
- **Estratégia (nossa prova):** o ponto-chave do plano — relógio da prova, **box abre +10 / fecha
  −20**, contador de **paradas por kart (x/7)** e a **folga** anti-DQ com alarme
  (verde/amarelo/vermelho). Estado salvo em `localStorage` (a versão compartilhada no box, via
  WebSocket, é a fase de produção).

## Próximo passo (live real)
Trocar `useEventData` (polling de JSON) por **Supabase Realtime** ou um **WebSocket** do backend
→ atualização instantânea, sem polling. Ver [`PLANO-PRODUCAO.md`](PLANO-PRODUCAO.md).

> Nota: os dados no Supabase hoje **conflam baterias** (o `mylaptime_uid` é da pista). Antes de
> ligar o Realtime, ajustar o modelo (sessão por bateria) — o `build-event-data.js` já separa por
> nome da bateria e é a referência.
