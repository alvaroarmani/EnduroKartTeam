# Onde paramos — sessão de 16/09 (noite)

Leia isto primeiro ao voltar.

## O que está acontecendo agora
- Um **worker** (Node + Playwright, Chrome visível) está **capturando eventos ao vivo do
  mylaptime** e gravando em `data/snapshots-*.jsonl` (modo dry-run, sem banco ainda).
- Até o momento: **3 eventos distintos, ~286 amostras de competidor, 14+ ciclos**. Ele
  descobre eventos novos sozinho e faz rodízio entre eles.
- O Chrome que abriu ficou **pareado** (você escaneou). **Se você fechar esse Chrome ou o
  worker, perde o pareamento** e precisa parear de novo para capturar boards.

### Se quiser parar o worker
Feche a janela do Chrome que ele abriu, ou finalize o processo `node` (Gerenciador de Tarefas),
ou rode: `taskkill /F /IM node.exe` (mata todos os node).

### Onde estão os dados
`data/snapshots-2026-09-16.jsonl` — um registro JSON por evento por ciclo.

## O que VALIDAMOS com dados reais ✅
- **Extração do feed principal está correta**: posição, nº+nome do kart (nomes reais),
  nº de voltas, melhor/última volta (`00:27.450` = 27,45s), DIFF e GAP.
- **Formatos reais**: tempo é `MM:SS.mmm`; GAP/DIFF vêm sempre em **tempo** (ex.: `53:35.049`),
  não em "+N voltas".
- **Fluxo de acesso**: `card → detalhe → "Assistir" → board`, e o board **exige parear 1×**
  (foi o que travava antes — eu não clicava em "Assistir"). Corrigido.
- **Navegação entre eventos** (voltar para a lista) corrigida — o bug era clicar no botão de
  "Modo Escuro" em vez de "Voltar".

## O que ficou PENDENTE ⏳ (o único furo)
- **Histórico volta a volta**: está capturando só a **última volta** por piloto (deveria pegar
  todas, via painel expansível). Não deu para depurar sem um board pareado enquanto você estava
  fora. **Já deixei pronto o modo `DEBUG=true`** que, no próximo run pareado, salva o HTML real
  do painel em `data/debug-board-*.html` — aí eu calibro o parser (`readLaps`) e resolvo.
  *O feed principal não depende disso.*

## Próximos passos (quando você puder)
1. **Criar o Supabase** (10 min) — [`BANCO-DE-DADOS.md`](BANCO-DE-DADOS.md) — e rodar
   [`../src/db/schema.sql`](../src/db/schema.sql). Preencher `SUPABASE_URL`/`SUPABASE_KEY` no `.env`.
2. **Levar o que já capturamos para o banco**: `npm run replay`.
3. **Calibrar as voltas**: rodar 1 vez com `DEBUG=true` num evento e me mandar o
   `data/debug-board-*.html` — eu ajusto o `readLaps`.
4. **Para as 2 baterias de amanhã (FKI Linhares, 20:00/20:30)**: rodar
   `BROWSER_CHANNEL=chrome HEADLESS=false npm start`, parear 1× (QR na tela), e definir
   `PRIORITY_TRACKS=FKI,Linhares` no `.env` para priorizá-las.
5. **Nuvem sem PC** (quando quiser): `Dockerfile` pronto; use `PORT=8080` para ver o QR/status
   por uma página web e parear de qualquer lugar. Ver [`INGESTOR.md`](INGESTOR.md).

## Comandos úteis
```bash
npm start        # roda o ingestor (headful p/ escanear: BROWSER_CHANNEL=chrome HEADLESS=false)
npm test         # 28 testes (extractor + ingestor)
npm run replay   # envia data/*.jsonl ao Supabase (após configurar .env)
```

## Arquivos criados nesta sessão
`src/ingestor/` (worker, mylaptime-session, supabase, transform, replay, status-server, config),
`Dockerfile`, `.env.example`, `test/ingestor.test.js`, `test/smoke-*.js`, e docs em `docs/`.
Nada foi commitado — deixei para você revisar.
