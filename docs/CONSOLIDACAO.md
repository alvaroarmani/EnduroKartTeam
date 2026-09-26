# Consolidação — unificar no `enduro-race-app` (Next.js/TS), pegando o melhor dos dois

> Decisão (22/09): consolidar no repo do parceiro **pdr606/enduro-race-app** (Next.js 16 + TS +
> Tailwind/shadcn + Supabase + Vitest) e **portar os trunfos do nosso** (EnduroKartTeam). Este doc
> é o mapa do que migra, para onde, e em que ordem. Portável para o repo dele.

## Por que a base é a dele
- Arquitetura limpa e tipada (domínio puro, **provider abstraction**, **repos Supabase**, Vitest).
- **Regras oficiais da FDK já codificadas e testadas** (`domain/race/rules.ts`, `domain/pit/control.ts`).
- **Supabase realtime + persistência** — é o backbone (estado compartilhado do box + acesso por link)
  que faltava na gente.
- Conceito correto de **Entry** (a placa/sensor da equipe é estável; o kart físico é sorteado a cada
  parada) + **roles** (leader/attack/support/recovery) e **modos** (performance/participação).

## O que PORTAMOS do nosso (os diferenciais já prontos/validados)

### 1. Worker de captura ao vivo → vira o `TimingProvider` real dele  ⭐ maior valor
O nosso [`src/ingestor/worker.js`](../src/ingestor/worker.js) + [`mylaptime-session.js`](../src/ingestor/mylaptime-session.js)
já resolvem o que o repo dele ainda não validou ao vivo: pareamento 1×, navegação
`card → Assistir → board` **sem reload**, expandir o painel de voltas, resiliência (`Blazor.reconnect`),
e o [`extractor`](../src/extractor/mylaptime-extractor.js) que lê o DOM real.
- **Como encaixa:** implementar um `TimingProvider` (interface dele) cujo `getSnapshot()` roda o nosso
  extractor e devolve o `TimingSnapshot`/`TimingEntry[]` dele. O mapeamento é direto:
  `number→entryNumber`, `name→displayName`, `pos→position`, `gap→gapToNext`, `diff→gapToLeader`,
  `state`, `raceClock→raceClockMs`, `flag`; o nosso `lapHistory` alimenta os `LapEvent[]`.
- Portar o worker/sessão para TS em `integrations/mylaptime/` (ao lado do `playwright-provider.ts` dele).

### 2. Motor de decisão (o "cérebro") → novos módulos em `domain/strategy/`
Traduzir os nossos módulos puros (JS→TS; já são sem efeito colateral):
- **Classificação virtual** ([`strategy-engine.js`](../web/src/lib/strategy-engine.js)) — posição corrigida
  pelas paradas devidas. (O motor dele não tem.)
- **Previsão de resultado** — voltas projetadas na bandeirada. (Não tem.)
- **Planejador de alocação 16×4×8** ([`allocation.js`](../web/src/lib/allocation.js)) — ases nas stints
  finais, forte no kart lento, ~2 stints/piloto, sem seguidos. (Não tem.)
- **Análise** ([`analytics.js`](../web/src/lib/analytics.js)) — degradação de stint, taxa de aproximação
  ("alcança em N voltas"), timeline reconstruída.
- **Decisão por kart** ([`decisions.js`](../web/src/lib/decisions.js)) — `decideKart` + `driverRating`
  (habilidade híbrida) + traço de **pressão**.
- **Testes:** portar os 18 cenários / 35 asserções do nosso [`strategy-sim.mjs`](../web/test/strategy-sim.mjs)
  para **Vitest** (`*.test.ts`).

### 3. UI (adaptar ao shadcn/Tailwind dele)
Ele já tem `app-shell` + cockpit + rotas (setup, drivers, analysis, **iPad read-only**). Trazer as
**ideias** (não o CSS): faixa de **KPI** ("prioridade agora" + risco/atenção/seguindo/ok), card por
entry com stint/folga/**próxima ação**, e a grade de rotação com **zona de pressão**.

## O que ADOTAMOS dele (parar de manter na gente)
Regras exatas, `Entry`+roles+modos, provider pattern, Supabase repos+realtime, iPad read-only, TS+Vitest.

## Lacunas de regra a fechar nos DOIS (do regulamento oficial — ver `REGULAMENTO-FDK.md`)
Mesmo com as regras dele, faltam (checar/implementar):
- **Pesagem:** `<100kg` = −2 voltas; `<98kg` = **DQ**; obrigatório **tirar o lastro** no box.
- **Tracker de penalidades:** tipos −2 voltas / +20s / DQ com seus gatilhos (queima de largada,
  ultrapassagem em amarela, andar lento p/ controlar parada, kart errado = DQ, 50min = +20s…).
- **Sorteio de kart** na parada + conferência de placa/sensor (checklist); sair em kart não sorteado = DQ.
- **Rotação entre karts:** "2–4 pilotos/kart, todos usam todos os karts" — a alocação deve rotacionar
  pilotos entre os 4 entries, não prender um piloto a um kart.

## Roadmap sugerido (via PRs no repo dele)
1. **Fundações de dados reais** — importar o regulamento + nosso schema/dados; alinhar `TimingSnapshot`.
2. **Provider de captura ao vivo** (item 1) — o worker validado como `TimingProvider`, com dry-run/replay.
3. **Motor** (item 2) — virtual + previsão + alocação + análise, com testes Vitest.
4. **UI** (item 3) — KPIs + cockpit + rotação/pressão sobre o shell dele.
5. **Regras faltantes** (pesagem/penalidades/sorteio) — nos dois lados.
6. **Produção** — Supabase realtime (estado compartilhado do box) + deploy por link (o backbone adiado).

## Workflow de colaboração
Trabalhar por **branches de feature + Pull Requests** no `pdr606/enduro-race-app` (o parceiro revisa
e faz merge). Nada de copiar em massa — portar peça por peça, com teste, como o PLAN.md dele pede.
