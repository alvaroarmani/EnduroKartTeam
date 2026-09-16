# Banco de dados — recomendação e por quê

## Recomendação: **Supabase (free tier)**

Você perguntou: "criar um Postgres ou usar o free tier do Supabase / outro banco?"
Minha recomendação clara é **Supabase**, que **é** Postgres — você não abre mão de nada
relacional e ganha muita coisa de graça.

### Por que Supabase encaixa perfeitamente aqui

- **É Postgres de verdade** → estrutura relacional, SQL, `views`, índices. Nada de NoSQL
  bagunçado. Perfeito para análise e para um agente/LLM consultar depois com SQL.
- **API REST + Realtime automáticos** → o scraper **grava direto** via REST com a chave
  pública (`anon`), e o dashboard **assina** mudanças em tempo real. **Zero backend para
  escrever.** Isso é enorme para um projeto solo: sem servidor, sem API própria, sem deploy.
- **Free tier generoso** para o nosso volume (linhas de cronometragem são minúsculas):
  ~500 MB de banco, o suficiente para dezenas de baterias inteiras.
- **Row Level Security** → dá para deixar a chave `anon` só gravando na camada de captura,
  com segurança, sem expor o resto.
- **Cresce com o projeto** → quando você quiser o agente interpretando dados, ele fala com
  o mesmo Postgres (via REST, SQL direto, ou um MCP de Postgres).

### Alternativas que considerei (e por que não)

| Opção | Veredito |
|---|---|
| **Postgres próprio** (local/VPS) | Mais trabalho: você hospeda, protege, e ainda **escreve uma API** para o dashboard consumir. Pior num notebook de box. Só vale se você já tivesse infra. |
| **Neon** (Postgres serverless) | Ótimo banco, free tier bom — mas **sem API/realtime prontos**; você teria que construir a camada de acesso. Supabase já entrega isso. |
| **Firebase / Firestore** | Realtime bom, porém **NoSQL**: pior para SQL/análise e para o agente. Estrutura menos clara. |
| **PlanetScale (MySQL)** | Bom, mas MySQL e sem realtime nativo; ecossistema menos alinhado ao nosso uso. |

> Resumo: **Supabase = Postgres + API + realtime + free tier**, que é exatamente o combo
> "extrair → salvar → consumir no sistema" que você descreveu, com o mínimo de código.

### Ressalva honesta
O projeto free do Supabase **pausa após ~7 dias sem uso**. Como vamos capturar baterias com
frequência e usar na prova, não é problema; basta abrir o painel de vez em quando. Se quiser
zero risco disso, dá para migrar para Neon depois — a modelagem é a mesma (Postgres).

## Passo a passo para deixar pronto (10 min)

1. Criar conta em [supabase.com](https://supabase.com) → **New project** (região São Paulo
   se disponível; senão a mais próxima). Guarde a senha do banco.
2. No projeto: **SQL Editor** → colar e rodar `src/db/schema.sql` (cria as tabelas e views).
3. **Project Settings → API** → copiar:
   - **Project URL** (ex.: `https://xxxx.supabase.co`)
   - **anon public key** (chave pública, pode ir no scraper).
4. Colocar esses dois valores no topo do `src/scraper/mylaptime-scraper.user.js`
   (`SUPABASE_URL` e `SUPABASE_ANON_KEY`).
5. (Opcional, recomendado antes da prova real) Endurecer o RLS — ver comentários no fim do
   `schema.sql`. Para a fase de "estudo" pode deixar aberto.

## Como os dados fluem

```
[aba mylaptime logada] → userscript lê o DOM → normaliza (extractor)
        │
        ├─ grava em IndexedDB (buffer local, à prova de queda de rede)
        └─ POST REST → Supabase (sessions, competitors, competitor_samples, laps)
                          │
                          ├─ dashboard assina Realtime e mostra ao vivo
                          └─ (futuro) agente/LLM consulta via SQL e sugere decisões
```

## Modo sem banco (para capturar já, hoje/amanhã)
O scraper também funciona **sem Supabase configurado**: ele acumula tudo em IndexedDB e o HUD
tem um botão **"Exportar JSON"**. Assim você já captura baterias de estudo agora e importa
para o Supabase depois. Ver `docs/RELATORIO-NOITE.md`.
