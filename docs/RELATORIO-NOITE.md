# Relatório da noite — 15→16/09/2026

Bom dia. Resumo do que fiz enquanto você dormia, na ordem das suas três perguntas.
Cada item aponta para o documento/código detalhado.

---

## 1. "Conseguiu extrair tudo corretamente?" — ✅ o extrator está validado

- Núcleo de extração pronto em [`src/extractor/mylaptime-extractor.js`](../src/extractor/mylaptime-extractor.js),
  cobrindo **todos** os campos que o mylaptime expõe: posição, nº+nome do kart, M.V, T.M.V,
  LAP, T.U.V, DIFF, GAP, estado do piloto, categoria, **histórico volta a volta**, relógio da
  prova e bandeira.
- Validado de duas formas:
  - Teste visual com DOM sintético fiel ao esquema real: [`test/extractor.test.html`](../test/extractor.test.html) → **"✓ tudo ok"**.
  - Teste de regressão em Node das funções de parsing: `node test/parse.test.js` → **12/12**.
- No caminho, o teste **pegou e eu corrigi dois bugs reais**: tempo `1:02.540` era lido como
  2,5s (agora 62,5s) e a detecção de bandeira verde. Bom sinal de que a validação funciona.

**Ressalva honesta:** eu **não consegui capturar baterias reais sozinho** esta noite. Abrir um
evento no mylaptime exige passar por um portão que, ao que tudo indica, pede **parear o
dispositivo pelo app** (login). No seu ambiente logado isso não existe — você abre e captura
normal. Deixei tudo pronto para você fazer isso em uma sessão (passo a passo no item 4).
O extrator é defensivo, mas **calibramos os formatos finais com os primeiros dados reais**.

---

## 2. "Previu o problema do token/expiração?" — ✅ e a notícia é boa

Investiguei o mylaptime por dentro. **Não existe um "token que expira" para ver a
cronometragem.** Detalhes e provas em [`docs/CONEXAO-E-TOKEN.md`](CONEXAO-E-TOKEN.md). Em resumo:

- Não há JWT/bearer/cookie de sessão. Só flags no `localStorage` (`accept_term`) e o **GUID do
  evento** selecionado. O QR/código é para vincular seu *perfil* no app, não para os dados.
- Os dados vêm por um **circuito Blazor Server (SignalR/websocket)**, que **reconecta sozinho**
  (confirmei `window.Blazor.reconnect` e o `components-reconnect-modal`).
- Ou seja: não há token para "dar refresh". O que pode cair é a **conexão websocket** — e a
  cura é reconectar/recarregar, não renovar token.

**O que já implementei no scraper para "nunca perder a conexão":** watchdog de frescor (se o
relógio parar, assume queda), auto-reconexão via `Blazor.reconnect()`, **reload automático** se
a reconexão falhar N vezes, aviso de aba oculta, e — o mais importante — **cada leitura é
gravada localmente e no banco na hora**, então uma queda nunca apaga o que já foi capturado.

---

## 3. "Postgres próprio ou Supabase/free tier?" — ✅ recomendo **Supabase**

Justificativa completa em [`docs/BANCO-DE-DADOS.md`](BANCO-DE-DADOS.md). Resumo: Supabase **é**
Postgres (relacional, SQL, pronto para o futuro agente), mas já vem com **API REST + Realtime
de graça** — o scraper grava direto e o dashboard consome ao vivo, **sem você escrever
backend**. Free tier sobra para o nosso volume. Postgres próprio dá mais trabalho (hospedar +
API); Neon é bom mas sem API/realtime prontos; Firebase é NoSQL (pior para SQL/análise).

- Esquema pronto para aplicar: [`src/db/schema.sql`](../src/db/schema.sql) — tabelas de captura
  (`sessions`, `competitors`, `competitor_samples`, `laps`) + camada de estratégia (paradas,
  pilotos, pesos, penalidades) para a fase seguinte, e `views` de ritmo/último estado.

---

## 4. Como capturar baterias de estudo (você, logado) — passo a passo

O scraper está em [`src/scraper/mylaptime-scraper.user.js`](../src/scraper/mylaptime-scraper.user.js).
Funciona **com ou sem banco**:

1. Instale a extensão **Tampermonkey** no navegador.
2. Novo script → cole o conteúdo do `mylaptime-scraper.user.js` → salve.
3. (Opcional agora, recomendado depois) Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` no topo.
   Sem isso, roda em **modo offline**: acumula em IndexedDB e você baixa com **"Exportar JSON"**.
4. Preencha `TEAM` com os números/nomes dos seus karts (para marcar `is_team`).
5. Abra o mylaptime → LiveTime → entre num evento (Assistir).
6. No **HUD** (canto inferior direito) clique **Iniciar**. Ele passa a paginação para 100,
   expande as linhas da equipe e começa a gravar. O HUD mostra status/leituras/fila.

> Sugestão: capture 2–3 baterias variadas hoje/amanhã em modo offline e me mande os JSON —
> uso para **calibrar os formatos reais** (T.U.V/GAP/estado e a estrutura do painel de voltas)
> e endurecer o extrator antes de plugar o Supabase.

---

## 5. Sobre o futuro "agente que interpreta e sugere decisões"

A escolha do Postgres/Supabase já prepara isso: com os dados estruturados + a lógica de
estratégia que já documentamos ([`regras-estrategia-fdk-100-milhas.md`](../regras-estrategia-fdk-100-milhas.md)),
um agente (Claude) consulta o banco por SQL/REST (ou um MCP de Postgres) e cruza o feed com o
**virtual/previsão** para sugerir "parar agora", "acelerar", "trocar ordem". Isso é a fase
depois da captura — mas nada no que montei hoje atrapalha; pelo contrário, é o alicerce.

---

## O que eu recomendo validar de manhã

- [ ] Rodar `node test/parse.test.js` e abrir `test/extractor.test.html` (via o servidor) → ver verde.
- [ ] Ler [`CONEXAO-E-TOKEN.md`](CONEXAO-E-TOKEN.md) e dizer se a estratégia de resiliência te convence.
- [ ] Decidir criar o projeto Supabase (10 min, passo a passo no doc do banco) — ou seguir offline por ora.
- [ ] Capturar 1–2 baterias logado e me mandar o JSON para calibrarmos com dados reais.
- [ ] Marcar um **dry-run de treino** para medir a longevidade da sessão/reconexão na prática.

Arquivos criados nesta noite: `src/extractor/`, `src/scraper/`, `src/db/schema.sql`,
`test/`, e os docs em `docs/`. Nada foi commitado (deixei para você revisar antes).
