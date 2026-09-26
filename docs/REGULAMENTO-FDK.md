# Regulamento FDK 100 Milhas Endurance — regras que o sistema precisa

> Fonte: regulamento oficial (PDF "FDK 100 Milhas Endurance", 1ª edição), obtido via repo do
> parceiro. Aqui ficam só os pontos que viram lógica/alerta no sistema. Regra 1.3: **pode mudar a
> qualquer momento** — reconfirmar no briefing das **13:30**.

## Formato
- **4 horas + 1 volta**. Largada **Le Mans**. Classificatória de 5 min às **13:50**; prova às **14:00**.
- **7 paradas obrigatórias → 8 stints.** Cada parada troca **kart E piloto**.
- Campeã = quem cruza à frente **tendo cumprido todos os obrigatórios**.

## Equipe / pilotos
- **2 a 4 pilotos por kart**; com vários karts, o máximo multiplica pela quantidade e **todos os
  pilotos usam todos os karts** (4 karts ⇒ até **16 pilotos**, rotacionando entre os karts).
- Máx. 15 karts inscritos (mín. 10 pra acontecer) + 5 karts reserva pros boxes.

## Parada obrigatória (o cronômetro)
- Duração **≥ 5:00.000** = válida limpa.
- **4:55.000 – 4:59.999** = **válida, mas −2 voltas** (uma punição por parada nessa faixa).
- **< 4:55.000** = **não conta** como obrigatória.
- **Box abre com 10 min de prova** e **fecha faltando 20 min**. Quem já está no box no fechamento
  ainda valida a parada. Box sinalizado com/sem cones.
- Ao entrar, o piloto que vai assumir **sorteia na urna o número do próximo kart**.
- Antes de sair: conferir **placa de identificação** + **caneleira/sensor** no kart novo.

## Stint
- **Tempo máximo em pista por stint = 50 min** (da 1ª passagem na linha até a última antes do box).
  Passar disso = **+20s** no tempo total.

## Lastro e pesagem
- Peso mínimo **100 kg** (piloto + indumentária). Kartódromo fornece lastro até **25 kg**.
- Pesagem **a cada parada obrigatória e no fim da prova** (pesa quem acabou o stint).
- **Obrigatório tirar o lastro do kart** na parada e no fim (punição se não).
- `< 100 kg` em qualquer momento = **−2 voltas**. `< 98 kg` = **DESCLASSIFICAÇÃO**.

## Bandeira vermelha / relargada (regra 7)
- Piloto no box na vermelha: o tempo da parada é **interrompido** (vale o cumprido até a passagem do
  líder na volta anterior ao acionamento); o **restante se completa após a relargada**.
- Relargada: fila única, karts em movimento; **distâncias da volta anterior são neutralizadas**.
- Quebra na corrida: kart substituído pelo **mesmo processo de sorteio**.

## Penalidades (para o tracker)
- **−2 voltas (advertência):** peso < 100 kg · parada 4:55–4:59.999 (por parada) · ajuste/alteração
  mecânica no kart · parar na pista por pane seca.
- **+20 s no tempo total:** queimar a largada · ultrapassar sob **amarela** · andar lento/parar para
  controlar tempo de parada · cortar caminho · **passar de 50 min** no stint · não tirar o lastro.
- **DESCLASSIFICAÇÃO:** 2 advertências por atitude antidesportiva · **sair em kart não sorteado** ·
  não comparecer/recusar pesagem · peso **< 98 kg** · **não fazer todas as paradas obrigatórias**.

## Direção de prova / outros
- Decisões de pista são da **Direção de Prova** (resultado oficial é o dela). Não abordar durante o evento.
- Indumentária obrigatória (capacete, balaclava, luvas, macacão, calçado fechado).
- Premiação: troféus para as **5 primeiras**.

## Constantes já usadas no código (conferem com o regulamento)
`durationMs=240min` · `mandatoryStops=7` · `stints=8` · `pitOpenAfter=10min` ·
`pitCloseBeforeEnd=20min` · `stopMinimum=5:00` · `stopPenaltyThreshold=4:55` · `stintMaximum=50min`
(warning 45 / critical 48) · `weightMin=100kg` · `weightDQ=98kg`.
