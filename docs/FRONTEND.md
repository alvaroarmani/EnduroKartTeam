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
  App.jsx                     abas: Cockpit | Batalhas | Pilotos | Timeline | Telemetria | Virtual+Prev | Estratégia
  hooks/
    useEventData.js           fetch + polling do JSON  ← trocar por WebSocket/Realtime aqui
    useStrategy.js            assina o store de estratégia compartilhado (useSyncExternalStore)
  lib/
    format.js                 fmt(tempo), cores de série
    strategyStore.js          ESTADO ÚNICO da prova (config + paradas/kart + relógio + plantel + plano) ← seam p/ WS
    strategy-engine.js        MOTOR puro: greenPace, estimateStops, computeStrategy (virtual+prev.)
    analytics.js              DERIVA do histórico: stints, degradação, aproximação, paceRank, timeline
    race.js                   relógio (elapsedFrom) + folga/janela do box (boxState) + fmtClock
    decisions.js              DECISÃO por kart (decideKart → o que fazer) + driverRating (habilidade)
    allocation.js             PLANEJADOR: suggestAllocation (16 pilotos → grade 4×8) + driverScore
  test/strategy-sim.mjs       SIMULADOR: 18 cenários / 35 asserções (npm run sim)
  components/
    Tiles, PaceChart, PositionChart, ConsistencyTable   (telemetria)
    TeamCockpit                COCKPIT: 4 karts, stint, folga, próxima ação
    Battles                    BATALHAS: gap ao vivo, aproximação, alcance
    DriversBoard               PILOTOS: ranking de ritmo dos karts, plantel, rotação 4×8
    RaceTimeline               TIMELINE: história reconstruída + alertas acionáveis
    StrategyEngine             VIRTUAL + PREVISÃO (consome feed + store)
    StrategyPanel              WATCHDOG anti-DQ: relógio + janela do box + paradas/kart + folga
  styles.css                  paleta (clara/escura) validada
```

## Sete telas (por utilidade na pista)
- **Cockpit** — tela-mãe: nossos 4 karts com stint, paradas x/7, folga anti-DQ, ritmo+rank e a
  **próxima ação** (🟢 seguir / 🟡 aperta / 🔴 pare já / 🟠 no box). Metrônomo das paradas.
- **Batalhas** — carro à frente/atrás do foco: gap, taxa de aproximação (s/volta) e "alcança em N
  voltas". Guard de "ritmo parelho".
- **Pilotos & Kart** — plantel (até 16) com habilidade híbrida (medido + nível + 🔥 pressão),
  **ficha & pesagem** (peso → lastro para o alvo), piloto atual por kart, ranking de ritmo dos
  karts, e a rotação (4×8) com **✨ sugerir alocação** (ases na pressão, forte no kart lento,
  ~2 stints/piloto, sem seguidos) + alerta de novato na zona de pressão.
- **Timeline** — história da corrida reconstruída do histórico (paradas, recordes, liderança) +
  eventos ao vivo (bandeira/líder) + **alertas** (folga crítica, ritmo caindo, bandeira → box).
- **Telemetria (FKI)**, **Virtual + Previsão**, **Estratégia (watchdog)** — como antes.

> **Tudo derivado de dados que já capturamos.** O `analytics.js` reconstrói stint, degradação,
> gaps e timeline do histórico volta a volta. O `build-event-data.js` agora repassa também
> `state` (pista/box), `gap`, `diff` e `categoria` (antes eram descartados).

O **Virtual + Previsão** funde o feed (auto) com as **paradas manuais** por kart (do watchdog, via
store). Sem karts mapeados → **modo validação** (paradas estimadas por voltas longas); mapeando os
4 karts ao nº do feed → **modo corrida real**. Ver
[`CONHECIMENTO-ENDURANCE.md`](CONHECIMENTO-ENDURANCE.md) §5 (P1) para o racional.

> **Store compartilhado:** todas as telas leem/escrevem o MESMO estado (`strategyStore`,
> persistido em `localStorage`). Mudou parada no watchdog → o virtual reflete na hora. Na produção,
> sincronizar o box entre os 4 membros troca só o `strategyStore` (WebSocket/Realtime).

## Próximo passo (live real)
Trocar `useEventData` (polling de JSON) por **Supabase Realtime** ou um **WebSocket** do backend
→ atualização instantânea, sem polling. Ver [`PLANO-PRODUCAO.md`](PLANO-PRODUCAO.md).

> Nota: os dados no Supabase hoje **conflam baterias** (o `mylaptime_uid` é da pista). Antes de
> ligar o Realtime, ajustar o modelo (sessão por bateria) — o `build-event-data.js` já separa por
> nome da bateria e é a referência.
