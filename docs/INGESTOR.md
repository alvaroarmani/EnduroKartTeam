# Ingestor multi-evento — rodar e operar

Worker Node + Playwright que mantém **um navegador pareado vivo** e, em ciclos, consome
**todos os eventos ativos** do mylaptime, gravando no Supabase (+ buffer local `.jsonl`).
Nunca dá reload (preserva o circuito Blazor/pareamento).

## O modelo (importante)
- **Lista de eventos = gate-free.** Monitorar quantos ativos / novos / fechados não exige login.
- **Board de cada evento = precisa parear 1×** pelo app MyLapTime (QR/código). Depois de pareado,
  o worker troca de evento por navegação interna (sem reload) e captura.
- Sem token que expira; o que pode cair é o WebSocket, e o Blazor reconecta. Detalhes em
  [`CONEXAO-E-TOKEN.md`](CONEXAO-E-TOKEN.md).

## Rodar local (Windows, com seu Chrome) — mais rápido para testar
```bash
npm install                 # instala o playwright (o Chromium do sistema é usado via channel)
# 1ª vez, opcional: npx playwright install chromium  (senão, use o Chrome do sistema abaixo)

# rodar com o Chrome do sistema e janela visível (para escanear o QR):
#   PowerShell:  $env:BROWSER_CHANNEL="chrome"; $env:HEADLESS="false"; npm start
#   Git Bash:    BROWSER_CHANNEL=chrome HEADLESS=false npm start
```
Ao iniciar, abre uma janela do Chrome no mylaptime mostrando o **QR / código de pareamento**.
Escaneie no app (Carreira → câmera). Em ~25s o worker detecta e começa a capturar.

Sem `SUPABASE_URL/KEY`, roda em **DRY-RUN**: não grava no banco, só acumula em
`data/snapshots-YYYY-MM-DD.jsonl` (ótimo para validar a extração).

## Rodar no Docker (Chromium embutido — bom para a nuvem)
```bash
docker build -t endurokart-ingestor .
docker run --rm -it --env-file .env -v "$PWD/data:/app/data" endurokart-ingestor
```
No container é **headless** (sem tela): pareie pelo **código** — ele é impresso no log e escrito em
`data/pairing-code.txt`. Cole esse código no app MyLapTime. *(Na fase de nuvem, dá para expor o
código por uma página HTTP simples — ver "Próximos passos".)*

## Deploy na nuvem (sempre-ligado, sem seu PC)
Alvos recomendados (o `Dockerfile` serve a todos):
- **Railway / Fly.io**: `docker`-based, sobem em minutos, sempre ligado (~US$5/mês). Montar volume
  para `/app/data`. Setar as env (Supabase, `HEADLESS=true`).
- **Oracle Cloud Free**: VM ARM sempre-gratuita; instalar Docker e rodar o container.
- Pareamento na nuvem: leia `data/pairing-code.txt` (ou o log) e cole no app 1×.

## Variáveis (.env — ver `.env.example`)
| var | efeito |
|---|---|
| `SUPABASE_URL`/`SUPABASE_KEY` | gravar no Supabase; vazio = dry-run local |
| `BROWSER_CHANNEL` | `chrome`/`msedge` (usa navegador do sistema) ou vazio (Chromium do Playwright/Docker) |
| `HEADLESS` | `false` para ver a janela (escanear QR) |
| `PRIORITY_TRACKS` | substrings priorizadas no rodízio (ex.: `FKI,Linhares`) |
| `MAX_EVENTS_PER_CYCLE` | 0 = todos |
| `CAPTURE_LAPS` | expandir e gravar histórico de voltas |
| `LIST_REFRESH_MS` | intervalo mínimo entre ciclos |
| `PAIRING_WAIT_MS` | janela para você parear no início |

## Banco (Supabase)
1. Criar projeto (ver [`BANCO-DE-DADOS.md`](BANCO-DE-DADOS.md)).
2. Rodar [`../src/db/schema.sql`](../src/db/schema.sql) no SQL Editor.
3. Preencher `SUPABASE_URL` e `SUPABASE_KEY` no `.env`.

O worker faz upsert de `sessions` (por GUID), `competitors` (por sessão+número), insere
`competitor_samples` e faz upsert de `laps` (por competidor+volta). A reconciliação marca como
`closed` as sessões ativas que sumiram da lista.

## Verificar a captura
- Dry-run: inspecione `data/snapshots-*.jsonl` (um registro por evento por ciclo).
- Supabase: `select count(*) from competitor_samples;` e a view `v_pace_by_competitor`.

## Página de status/pareamento (para a nuvem headless)
Setar `PORT` (ex.: `PORT=8080`) liga um servidor HTTP simples:
- `http://host:PORT` mostra **status ao vivo** e, se ainda não pareado, o **QR + código** para
  parear de qualquer lugar (essencial quando não há tela, como na nuvem).
- `/health` devolve JSON; `/qr.png` a imagem do QR atual.

## Replay: carregar capturas locais no banco
Depois de configurar o Supabase, envie o que foi capturado em dry-run:
```bash
npm run replay                      # todos os data/snapshots-*.jsonl
node src/ingestor/replay.js data/snapshots-2026-09-16.jsonl
```

## Fluxo de um evento (importante)
`card do evento → página de detalhe → botão "Assistir" → board`. O board **exige parear** o
dispositivo 1× (app MyLapTime, QR/código). Ver [`CONEXAO-E-TOKEN.md`](CONEXAO-E-TOKEN.md).

## Depurar a estrutura das voltas
`DEBUG=true` faz o worker salvar, 1× por evento, o HTML do board em
`data/debug-board-*.html` (lista + um painel de voltas expandido). Use isso para calibrar o
parser de histórico de voltas (`readLaps` em `mylaptime-extractor.js`).

## Estado conhecido (16/09)
- ✅ Feed principal por competidor (posição, nº+nome, LAP, melhor/última volta, DIFF, GAP)
  **capturando corretamente**. Formatos reais: tempo `MM:SS.mmm` (ex.: `00:27.450`);
  GAP/DIFF sempre em tempo (ex.: `53:35.049`), não "+N voltas".
- ✅ **Histórico volta a volta** funcionando (corrigido 16/09): painel `.lt-expansion-panel >
  .lt-passings-grid > .lt-passing-item` (campos Lap/Pos/Tempo/Diff/Líder/Delta). O `readLaps`
  extrai `{n, timeText, ms, pos}` por volta. Verificado contra Supabase (voltas reais gravando).
- ✅ Gravação ao vivo no Supabase (upsert idempotente de sessions/competitors/samples/laps).
