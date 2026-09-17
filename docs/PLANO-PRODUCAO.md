# Plano — Produção: sistema hospedado, ao vivo, acesso por link (para aprovação)

> Objetivo (suas palavras): **chegar no dia e só acessar um link** — sem ver um Chrome aberto
> dando refresh. Inclui o **(2) WebSocket** front↔backend. Nada vai para produção antes da sua
> validação.

---

## 1. Por que a arquitetura atual não serve para o dia da prova (seja crítico)

Hoje funciona, mas é um "andaime":
- O worker roda **no seu PC** com **Chrome visível**; se o PC dorme/fecha, acaba.
- O dashboard é um **Artifact** (claude.ai), que **não pode abrir WebSocket** (CSP bloqueia).
  Por isso a atualização é um **hack**: um cron regenera dados e **republica** o artifact de 1 em
  1 min. Não é "ao vivo" de verdade, e depende desta sessão de chat aberta.
- Pareamento exige **escanear um QR numa tela local**.

Para o dia da prova isso é frágil. Precisamos de um **sistema hospedado 24/7** com **live real**.

---

## 2. Arquitetura-alvo

```
        ┌─────────────── VPS / nuvem (Docker Compose) ───────────────┐
        │                                                            │
  mylaptime ──►  WORKER (Playwright headless)  ──►  BACKEND (Node)   │
   (SignalR)      captura + extrai                 • grava no Postgres│
                                                   • BROADCAST WebSocket
                                                   • API REST + página de pareamento
        │                                                │           │
        │                                          Postgres/Supabase │
        └────────────────────────────────────────────────┼──────────┘
                                                          │ WebSocket + HTTPS
                                                          ▼
                                         FRONTEND (web app hospedado)
                                    dashboards + camada de estratégia AO VIVO
                                    (abre por um LINK; sem refresh, sem Chrome local)
```

### Componentes
1. **Worker** (já temos, vira container) — Playwright **headless** (Chromium da imagem oficial),
   captura os eventos (filtro FKI), extrai e **envia ao backend** (via função interna ou HTTP
   local) além de gravar no banco.
2. **Backend** (novo — Node + Express + `ws`/socket.io):
   - Recebe os snapshots do worker.
   - Persiste no **Postgres** (Supabase gerenciado *ou* Postgres no próprio compose).
   - **Faz broadcast por WebSocket** para todos os front-ends conectados (isto é o "ao vivo").
   - Expõe **API REST** (histórico, sessões) e a **página de pareamento** (o `status-server` que
     já temos, com QR/código) para você parear **remotamente pelo celular**, sem tela local.
   - Recebe as **entradas manuais** da estratégia (paradas, pesos, piloto) e as propaga.
3. **Frontend** (novo — substitui o Artifact): app web servido pelo backend/estático, que
   **conecta no WebSocket** e renderiza os dashboards + a camada de estratégia **em tempo real**.
   Abre por um **link** (ex.: `https://enduro.seudominio.com`).

### Pareamento sem Chrome local
O worker headless não tem tela. A **página de pareamento** (`/pair`) mostra o **QR + código**
atual; você abre esse link **do celular**, escaneia/cola no app MyLapTime **uma vez**, e pronto.
Alternativa mais robusta: sessão **headful sob Xvfb + noVNC** (um "desktop remoto" só para o
pareamento), acessível por link protegido. *(Decidir: `/pair` simples vs noVNC.)*

---

## 3. Deploy / infraestrutura

- **Empacotamento:** `docker compose` com serviços `worker`, `backend`, `frontend` e
  (opcional) `postgres`. Já temos `Dockerfile` do worker; faltam backend e frontend.
- **Onde hospedar (opções):**
  | Opção | Custo | Notas |
  |---|---|---|
  | **VPS** (Hetzner/Contabo) | ~€4–5/mês | Controle total, sempre ligado. **Recomendado.** |
  | **Fly.io / Railway** | ~US$5/mês | Deploy fácil por Docker; sempre ligado. |
  | **Oracle Cloud Free** | grátis | VM ARM sempre-gratuita; setup inicial mais chato. |
- **HTTPS + domínio:** Caddy ou Traefik como reverse-proxy com **TLS automático**; um subdomínio
  aponta para o frontend/backend.
- **Confiabilidade:** `restart: unless-stopped` nos containers; healthchecks; reconexão do
  worker (Blazor/SignalR) já tratada; a página de status mostra saúde da captura.
- **Persistência do pareamento:** usar **perfil persistente** do Chromium (userDataDir em volume)
  para reduzir re-pareamentos após reinício. *(A validar se o mylaptime mantém a sessão.)*

---

## 4. WebSocket (ponto 2) — o coração do "ao vivo"

- **Backend → Frontend:** cada atualização do worker vira um evento WS (`update:kart`,
  `update:clock`, `update:flag`) e o backend faz broadcast. O frontend aplica o diff e re-renderiza
  só o que mudou. **Zero refresh, zero republish.**
- **Frontend → Backend:** as **ações do estrategista** (registrar parada, peso, piloto, penalidade)
  vão por WS (ou REST), o backend persiste e **propaga a todos** (você + cronometrista veem o
  mesmo estado ao vivo, em telas diferentes).
- **Robustez:** reconexão automática do WS no front (com backoff); ao reconectar, baixa o
  **snapshot atual** (REST) e volta a receber os diffs.

---

## 5. Migração a partir do que já existe (aproveita ~tudo)
- ✅ **Extractor**, **worker/mylaptime-session**, **schema**, **transform** — reutilizados.
- ✅ **status-server** — vira a base da página `/pair` + `/health`.
- 🆕 **Backend** (WS + API + broadcast) — novo, mas pequeno.
- 🆕 **Frontend** — porta os dashboards atuais (HTML/SVG) para um app que consome WS em vez de
  um JSON estático. O código de gráficos é quase o mesmo.
- 🔻 Aposenta o **hack do cron-republish** e o **Artifact** como fonte ao vivo (o Artifact pode
  seguir como "print" compartilhável pontual).

---

## 6. Fases sugeridas (para discutir)
1. **Backend + WebSocket local** — o worker publica no backend; um frontend simples recebe ao vivo
   (sem banco novo, lê do que já grava). Prova o "ao vivo real".
2. **Frontend definitivo** — porta os dashboards (visão geral + por corrida + estratégia) para WS.
3. **Dockerização completa** (compose) + **deploy na VPS** com HTTPS + domínio.
4. **Pareamento remoto** (`/pair` ou noVNC) + perfil persistente.
5. **Endurecimento** — RLS/keys (worker grava com service_role; frontend só lê), healthchecks,
   auto-restart, dry-run de prova.

---

## 7. Pontos em aberto (para você decidir/validar)
- **Banco:** manter **Supabase gerenciado** (já configurado) ou **Postgres no compose** (tudo num
  VPS só)? *(Recomendo Supabase para simplicidade agora.)*
- **Host:** VPS (Hetzner) vs Railway/Fly vs Oracle Free?
- **Domínio:** você tem um domínio para um subdomínio, ou uso um `*.fly.dev`/IP temporário?
- **Pareamento remoto:** página `/pair` simples (QR/código) basta, ou quer o noVNC (mais à prova
  de mudança do fluxo do mylaptime)?
- **Autenticação do frontend:** o link é aberto (quem tem, vê) ou protegido por senha simples?
- **Stack do frontend:** manter **HTML/SVG puro** (leve, sem build) ou um framework (React)?
  *(Recomendo manter puro para leveza no box.)*

> **Nada será colocado em produção antes da sua validação.** Escolha host/banco/domínio e a ordem
> das fases; eu detalho a implementação e começamos pela Fase 1 (WebSocket ao vivo local).
