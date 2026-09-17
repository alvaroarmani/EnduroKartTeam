# Plano — Camada de Estratégia (para aprovação)

> Escrito na ótica de um **estrategista de corrida** (mentalidade F1) adaptada ao **enduro de
> kart** da FDK 100 Milhas. Objetivo deste doc: **esquematizar tudo** — que dados ter, que
> decisões tomar, e que sistema construir — para você **validar antes de a gente codar**.

---

## 1. A tese: onde a corrida é ganha e perdida (seja crítico)

Num enduro de kart de **aluguel com kart sorteado e paradas de tempo fixo**, metade do
arsenal clássico de estratégia **não existe**: não há undercut/overcut real (tempo de parada é
mínimo fixo), não há escolha de kart (sorteio), não há estratégia de pneu/combustível. Então é
fácil "estrategizar demais" no lugar errado. As alavancas **reais**, em ordem de impacto:

1. **Não ser desclassificado.** É o maior gerador de resultado. DQ vem fácil: peso <98kg, kart
   errado, ou **não fechar as 7 paradas antes do box fechar (T−20)**. Um time que só garante
   "7 paradas válidas + peso legal + kart certo" já passa metade do grid que se autoelimina.
2. **Quando** disparar cada parada (espaçamento + proteger o prazo T−20 + reagir a bandeira).
3. **Quem** pilota **qual** stint (13 pilotos × 4 karts × 8 stints; ases nos momentos certos).
4. **Reagir à variância** (kart ruim sorteado, piloto cansando, bandeira vermelha, quebra, peso).

Conclusão crítica: o sistema **não** é um otimizador de décimos. É um **painel de disciplina +
alarmes + apoio à decisão** que impede erro caro e avisa cedo quando o cronograma aperta.

---

## 2. Catálogo de dados (o que um estrategista quer — e por quê, no enduro)

Dividido em **automático** (do mylaptime, já capturamos) e **manual/derivado**.

### Já temos (feed mylaptime)
Posição, nº+nome do kart, LAP, melhor/última volta, DIFF (p/ líder), GAP (p/ próximo), estado
(pista/box), **histórico volta a volta com posição por volta**, relógio da prova, bandeira.

### Precisamos ADICIONAR (o que torna a análise de estrategista)
| Dado | Por quê (enduro) | Fonte |
|---|---|---|
| **Índice de desempenho por kart físico** | Kart é sorteado e varia. Saber se um stint lento é *kart ruim* ou *piloto* muda a decisão (cobrar vs aceitar). | derivado (pace por nº de kart) |
| **Curva de fadiga do piloto** | Em stints de ~25min por 4h, o piloto degrada. Detectar queda de ritmo dentro do stint antecipa a parada. | derivado (deriva do lap time no stint) |
| **Consistência / taxa de erro por piloto** | Enduro premia regularidade; um piloto rápido mas errático custa caro. | derivado (desvio-padrão + outliers) |
| **Folga até T−20 (watchdog anti-DQ)** | A métrica-mãe do enduro: (tempo até box fechar) − (paradas restantes × ciclo mín). | derivado + manual |
| **Paradas cumpridas por kart (0–7)** | O mylaptime NÃO marca isso. Destrava virtual + previsão. | **manual** |
| **Classificação virtual** | Posição normalizada pelas paradas que cada um ainda deve. | derivado |
| **Previsão de resultado na bandeirada** | Projeção com ritmo + paradas restantes + tempo restante. | derivado |
| **Margem de peso por piloto** | Perda de líquido em stint quente aproxima do limite 100/98kg. | manual (pesagens) |
| **Modelo de tráfego / lapeamento** | Campo de ritmos mistos: saber quando o piloto vai pegar/tomar volta. | derivado |
| **Exposição a bandeira vermelha** | Quanto você perde se neutralizar agora (gaps evaporam) — decide se "seguro" ou "arrisca". | derivado |
| **Evolução de pista (grip/temperatura)** | Indoor evolui em 4h; ritmo-base desloca. | derivado (mediana móvel do grid) |

---

## 3. As decisões ao vivo (o "apoio à decisão")

O sistema deve, a cada momento, responder e/ou alarmar:
- **"Preciso parar AGORA?"** — watchdog de folga apertando; teto de 50min do stint; piloto caiu
  de ritmo (fadiga) vs kart ruim; bandeira vermelha com parada devendo (parar no box **pausa** o
  tempo e as distâncias são neutralizadas na relargada — pode ser vantagem).
- **"Estou seguro para o fim?"** — vou fechar as 7 paradas antes de T−20 com folga?
- **"Estou realmente ganhando?"** — virtual (não a posição bruta na pista).
- **"Vou terminar onde?"** — previsão na bandeirada.
- **"Algum risco de DQ/punição iminente?"** — peso perto do limite, kart sorteado conferido,
  lastro/placa/sensor, advertências (2 = DQ), +20s.

---

## 4. Módulos do sistema (o schematic para aprovar)

### A) Pré-prova (planejamento)
1. **Elenco & tiers** — cadastro dos 13 pilotos: força/experiência (tier), peso de macacão,
   notas (melhor tipo de stint, largada Le Mans, chuva emocional/fadiga).
2. **Planejador de alocação** — grade **4 karts × 8 stints = 32 vagas**; distribui os 13 pilotos
   respeitando "não emendar stints"; posiciona **ases nos momentos cruciais** (stint 1 = quali +
   largada Le Mans; stint 8 = chegada; stints de recuperação). Decisão a registrar: **ambição
   por kart** (espalhar ases nos 4 vs concentrar num kart "A").
3. **Config de parâmetros** — 4h, box abre +10 / fecha −20, parada mín 5:00 + ciclo real medido,
   peso 100/98, teto 50min. (Reconfirmar no briefing 13:30 — regra 1.3.)
4. **Ensaio de parada** — cronometrar a coreografia (sorteio→conferência→lastro→placa→sensor→
   pesagem→troca) para calibrar o "ciclo mínimo" do watchdog e os papéis do box.

### B) Durante (operação ao vivo) — painel multi-kart (4 karts) + drill-down
- **Relógio da prova** + status do box (abre +10 / **fecha −20**).
- **Watchdog de paradas** (por kart) — paradas x/7 e **folga**; alarme "pare agora".
- **Stint atual** — piloto, kart sorteado, tempo × teto 50min.
- **Cronômetro de parada** — zonas 5:05/4:55/<4:55 + checklist obrigatório.
- **Log de pesagem** — alerta 100kg / DQ 98kg.
- **Ritmo** — por piloto **e por kart**: última, média, tendência (fadiga), consistência,
  gráfico de evolução do stint; separa "kart ruim" de "piloto cansando".
- **Contador de paradas (manual)** — botão "parada +1" por kart (o dado que destrava tudo).
- **Classificação virtual** + **Previsão** + **exposição a bandeira vermelha**.
- **Penalidades/incidentes** — advertências (2=DQ) e +20s.
- **Rotação** — planejado × real, sem emendar.

### C) Pós-prova (debrief)
Planejado × real (paradas, pesos, ritmo por piloto/kart), o que custou tempo, curva de fadiga
real de cada piloto, desempenho por kart sorteado, lições para a próxima.

---

## 5. Modelo de dados (adições — já parcialmente no schema)
- `drivers` (13): tier, peso base, notas. *(já existe)*
- `team_karts` (4): vínculo com a linha do mylaptime (nº/nome). *(já existe)*
- `pit_stops` (MANUAL): stop#, entrada, duração, piloto_sai/entra, peso, kart_sorteado, válida. *(já existe)*
- `stints`, `penalties`. *(já existem)*
- **Derivados (views/serviço):** índice por kart, fadiga por stint, virtual, previsão.

---

## 6. Papéis do box (o sistema pressupõe equipe)
Estrategista (decide) · Cronometrista (dispara/registra) · Mão de box (lastro/placa/sensor/
confere sorteio) · Piloto que entra (conferência legal — regra 8.3). O sistema tem telas/atalhos
pensados para cada papel (ex.: tela "cronometrista" só com o timer + checklist + pesagem).

---

## 7. Pontos em aberto (para você decidir/validar)
- **Ambição por kart:** espalhar ases nos 4 karts (todos mirando pódio) ou concentrar num kart A?
- **Nível de automação do contador de paradas:** 100% manual, ou semi-auto (detectar volta longa
  ~5min como candidata a parada e pedir confirmação)?
- **Virtual dos rivais:** estimar paradas dos rivais (inferir do histórico) ou só entre nossos 4?
- **Escopo do painel no dia:** um estrategista com 4 karts numa tela só, ou 1 aba por kart + visão
  geral? (afeta o layout)
- **Entrada manual:** quem digita (peso, parada, piloto) no dia — você ou um cronometrista?

> **Nada disso será codado antes da sua aprovação.** Ajuste/priorize os módulos e eu detalho a
> implementação (telas, cálculos exatos do virtual/previsão, e ordem de construção).
