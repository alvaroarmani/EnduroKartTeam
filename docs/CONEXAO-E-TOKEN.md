# Conexão e "token" do mylaptime — o que descobri e a estratégia de resiliência

> Investigado ao vivo em 15–16/09/2026 no `mylaptime.com.br/LiveTime`, inspecionando
> localStorage, cookies e o runtime da página. Resumo honesto do que existe e do que
> **não** existe.

> **✅ ATUALIZAÇÃO 16/09 (validado com CAPTURA REAL).** O fluxo correto de um evento é
> **card → página de detalhe → botão "Assistir" → board** (a versão inicial deste doc supôs
> que "Assistir" era público — **não é**). O board **exige parear o dispositivo uma vez** pelo
> app MyLapTime (QR/código). Pareado, a captura funciona (confirmado: nomes, posições, voltas,
> gaps reais gravados). O pareamento fica **atrelado à sessão viva do navegador/circuito** — um
> restart do worker exige parear de novo (não há cookie persistente). Ainda assim, **não há
> "token que expira"** durante a sessão: uma vez dentro, o que pode cair é o WebSocket, e o
> Blazor reconecta. Resiliência = manter a sessão viva + reconectar, não renovar token.

## TL;DR — não existe um "token que expira" para *ver* a cronometragem

Sua preocupação ("se o token não for válido, ele não puxa as informações; como damos
refresh pra nunca expirar?") parte de um modelo que **não é** o do mylaptime. O que existe:

- **Nenhum JWT / bearer token / cookie de sessão** para visualizar o LiveTime. Vasculhei
  todo o armazenamento e só há:
  - `localStorage.accept_term = "accepted"` → flag do **modal de termos** (client-side).
  - `localStorage.company_livetime_selected` → base64 de um **GUID do evento** selecionado
    (ex.: `4ccb9bcd-4f5b-4285-975d-a6d6714ab3c5`). É *qual evento ver*, não autenticação.
  - `cookie_consent`, `_clck`, `_clsk`, `_cltk` → analytics (Microsoft Clarity). Irrelevantes.
- Os dados ao vivo chegam por um **circuito Blazor Server (SignalR / websocket)**, não por
  uma API com token. Confirmei: `window.Blazor` expõe `reconnect`, `disconnect`,
  `defaultReconnectionHandler`; e existe o `#components-reconnect-modal` com estados
  `reconnect-text-connecting / failed / rejected`.

**Conclusão:** não há token para "dar refresh". O que pode "cair" é o **circuito SignalR**
(a conexão websocket) — e para isso o Blazor já tem reconexão automática embutida. O nosso
trabalho é tornar essa reconexão **infalível e observável**, não gerenciar token.

## O portão de acesso (o que realmente trava)

Abrir um evento passa por um modal ("Bem-vindo → Aceitar Termos e gerar código") e, ao que
tudo indica, exige **parear o dispositivo uma vez** via app MyLapTime (QR code / código).
O código do QR expira em ~75s, mas isso é só a *janela do handshake* de pareamento — não é
a sessão. Depois de pareado/aceito no navegador do box, a página abre e não vi evidência de
sessão de vida curta.

> ⚠️ **A confirmar num treino** (não consegui parear no meu ambiente de teste, sem o app
> logado): quanto tempo a sessão/circuito fica vivo numa aba aberta por horas, e se um
> reload reautentica sozinho. Isso se mede num dry-run de prática — ver "Plano de validação".

## As duas camadas de conexão (mapa mental correto)

1. **Sessão de acesso ao evento** (aceite de termos + eventual pareamento). Feita **uma vez**
   no notebook do box, antes da prova. Persiste em localStorage. Não é por-requisição.
2. **Circuito SignalR** (o fluxo de dados ao vivo). Pode cair por wifi ruim, aba em segundo
   plano ou timeout. O Blazor reconecta sozinho; se o servidor **rejeitar** a reconexão
   (circuito expirou após desconexão longa), a cura é **recarregar a página**.

Como o nosso extrator **lê o DOM já renderizado**, ele funciona enquanto a aba estiver
aberta mostrando o evento — independente de "token". Resiliência = manter a aba viva +
recuperar o circuito + detectar dados "parados" + **persistir cada leitura no banco na hora**
(um problema de conexão nunca apaga o que já capturamos).

## Estratégia de resiliência (implementada no userscript)

O `src/scraper/mylaptime-scraper.user.js` implementa:

1. **Watchdog de "frescor"**: monitora o relógio da prova (`.lt-timer-value`). Se ele parar
   de avançar por > `STALE_SECONDS` (ex.: 15s), assume desconexão.
2. **Auto-reconexão**: ao detectar desconexão ou o `#components-reconnect-modal` visível,
   chama `Blazor.reconnect()`. Se falhar/rejeitar N vezes → `location.reload()` para
   reestabelecer o circuito (o `accept_term` e o `company_livetime_selected` persistem, então
   o reload volta rápido; confirmar no dry-run se cai direto no evento ou na lista).
3. **Anti-throttling de aba**: mantém a aba ativa/visível; alerta se ela for para segundo
   plano (navegadores congelam websockets de abas ocultas). Recomendação operacional: aba do
   mylaptime **sempre em primeiro plano** num monitor/tablet dedicado.
4. **Buffer + persistência imediata**: cada snapshot vai para um buffer local (IndexedDB) e é
   enviado ao banco. Se o envio falhar (rede), fica no buffer e reenvia quando voltar
   (fila com retry). Nada capturado se perde.
5. **HUD de status**: um painel flutuante mostra CONECTADO / PARADO / RECONECTANDO, nº de
   leituras, último envio ao banco e tamanho da fila — para o estrategista *ver* a saúde da
   captura sem adivinhar.

## Plano de validação (dry-run num treino antes de 17/10)

- [ ] Parear o notebook do box no app e abrir uma sessão; medir por quanto tempo fica vivo.
- [ ] Simular queda: desligar wifi 30s / 2min / 5min e observar se o Blazor reconecta e se o
      reload reautentica sem novo pareamento.
- [ ] Confirmar que o reload volta ao evento certo (senão, automatizar reselecionar o GUID em
      `company_livetime_selected` + reabrir).
- [ ] Medir a cadência de atualização do feed (de quantos em quantos segundos o DOM muda) para
      calibrar `STALE_SECONDS` e o intervalo de captura.
- [ ] Confirmar a estrutura interna do painel de voltas expandido e os formatos reais de
      T.U.V/GAP/DIFF/estado (o extrator já é defensivo, mas calibramos com dados reais).
