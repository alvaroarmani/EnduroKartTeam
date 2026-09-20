# EnduroKart — Estratégia, cronometragem e telemetria

Sistema de apoio ao estrategista da equipe na **FDK 100 Milhas Endurance** (4h + 1 volta,
17/10/2026 · Jardim Camburi/ES · 4 karts, 16 pilotos). Extrai a cronometragem ao vivo do
**mylaptime**, grava num banco (**Supabase/Postgres**) e gera **dashboards** de telemetria.

> Entrada rápida: [`docs/ONDE-PARAMOS.md`](docs/ONDE-PARAMOS.md) e [`docs/RELATORIO-NOITE.md`](docs/RELATORIO-NOITE.md).

## O que já funciona
- **Extrator** do mylaptime (DOM scraping) — feed por competidor + **histórico volta a volta**
  (posição/tempo por volta). Validado contra dados reais.
- **Ingestor** (Node + Playwright headless) — mantém um navegador pareado, consome os eventos
  ao vivo (com filtro por local), reconcilia novos/fechados e grava no Supabase + buffer local.
- **Banco** — esquema Postgres (`src/db/schema.sql`) no Supabase; upserts idempotentes.
- **Dashboards** (Artifacts) — visão geral multi-evento e um **dashboard focado por corrida**
  (tempo por volta, posição por volta, consistência) com auto-update.

## Estrutura
```
src/
  extractor/mylaptime-extractor.js   Núcleo de extração (puro, testado)
  scraper/mylaptime-scraper.user.js  Userscript Tampermonkey (alternativa no navegador)
  ingestor/                          Worker Playwright: worker, mylaptime-session, supabase,
                                     transform, replay, status-server, config
  db/schema.sql, db/grants.sql       Esquema + permissões (Supabase)
tools/                               build-viz-data, build-event-data, fki-tick, check-db
viz/                                 Dashboards (HTML)
test/                                Testes (node + fixtures de navegador)
docs/                                Documentação
regras-estrategia-fdk-100-milhas.md  Estratégia de corrida (fonte da verdade)
```

## Rodar
```bash
npm install                          # instala o Playwright
npm test                             # testes (extractor + ingestor)

# Ingestor (Windows, com Chrome do sistema; janela visível p/ parear 1x):
#   Git Bash:  BROWSER_CHANNEL=chrome HEADLESS=false npm start
# Filtrar por local:  EVENT_FILTER=FKI  (ex.: só FKI / Fãs de Kart)
```
Config via `.env` (ver `.env.example`). Detalhes em [`docs/INGESTOR.md`](docs/INGESTOR.md) e
[`docs/BANCO-DE-DADOS.md`](docs/BANCO-DE-DADOS.md).

## Notas
- `data/`, `.env` e logs **não** vão para o git (dados voláteis e segredos).
- `mylaptime_uid` identifica a **pista**, não a bateria — a análise por corrida agrupa por nome
  da bateria (ver `tools/build-event-data.js`).
