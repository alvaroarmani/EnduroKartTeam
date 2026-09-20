# Base de conhecimento — Endurance (Le Mans/WEC, IMSA, 24h Kart) → o que o nosso sistema precisa

> Pesquisa consolidada (set/2026) sobre como as grandes equipes de endurance decidem, o que
> monitoram, e as decisões que **ganharam e perderam** corridas. Objetivo: destilar em requisitos
> concretos para os dashboards da **FDK 100 Milhas** (4h+1volta, 4 karts, 13 pilotos, 7 paradas
> obrigatórias, kart de aluguel/sorteio, DQ-first). Fontes no fim.

---

## 1. As 7 leis do endurance (o que a pesquisa diz, sem exceção)

1. **"Para vencer, primeiro é preciso terminar."** Endurance não se ganha com a volta mais rápida
   — se ganha com **ritmo médio + menos erros**. P7 cedo vira P1 na bandeirada se você for
   consistente e os outros errarem.
2. **Consistência > velocidade de pico.** A métrica-rainha do piloto é o **desvio-padrão das
   voltas** (quanto menor, melhor). "Não dirija toda volta a 10/10; dirija toda volta igual, sem
   erro. Deixe o erro acontecer com os outros."
3. **Pit stop é onde a corrida se ganha/perde.** No 24h de Spa (kart), a equipe vencedora fez
   troca em ~1:40 vs 2:04 da equipe novata → **~3 voltas** de diferença ao longo da prova. Andar
   devagar no pit lane (10 vs 18 km/h) custou **+22s** por passagem.
4. **Menos paradas do que o rival, quando possível.** Stint mais longo = menos tempo no box.
   Equipes fortes fazem stints duplos; novatas trocam toda hora e perdem.
5. **Erro e penalidade custam mais em prova longa.** Penalidades são mais duras e há mais tempo
   pra elas te alcançarem. Um erro de procedimento no box apaga vantagem construída em horas.
6. **Safety car / bandeira vermelha reembaralha tudo.** No Le Mans 2026 o SC **salvou** um Toyota
   (juntou o pelotão e apagou os gaps). Parar **logo antes/durante** um FCY/SC é tempo grátis. Na
   FDK, **bandeira vermelha neutraliza distâncias (regra 7.2)** — é a maior alavanca da prova.
7. **Fadiga vira erro.** Piloto cansado = volta lenta + risco de batida. Duração do stint tem que
   respeitar o físico, não só o relógio.

---

## 2. O que as grandes equipes MONITORAM ao vivo (e por quê)

Mapeado das telas de WEC/F1/IMSA e do que os race engineers de fato usam:

| Dado | Para que serve | Já temos? |
|---|---|---|
| **Gap (p/ líder) × Interval (p/ carro à frente)** | São coisas diferentes. Interval decide briga direta; Gap decide a corrida. | Gap sim; **Interval não** |
| **Ritmo do stint (média/mediana móvel)** | Ritmo real, filtrando voltas de tráfego/box. | Sim (mediana) |
| **Degradação dentro do stint** | Queda de ritmo = kart cansando / piloto cansando / combustível. Diz **quando trocar**. | Parcial |
| **Consistência (desvio-padrão)** | Compara pilotos de forma justa; escolhe quem vai pra qual kart. | Sim |
| **Delta para um alvo** | "Estou X s acima do meu ritmo-alvo" — feedback ao piloto por stint. | **Não** |
| **Posição REAL vs VIRTUAL** | Quem lidera **depois** que todos cumprirem as paradas devidas. | **Não (motor a construir)** |
| **Janela de box + paradas cumpridas/kart** | Anti-DQ. A função nº1 numa prova com paradas obrigatórias. | Sim (watchdog) |
| **Tempo real de cada parada (cronômetro 5:00)** | Cumprir o mínimo sem desperdiçar. Fila/pit lane conta. | Parcial |
| **Estado da bandeira** | Verde/amarela/vermelha muda toda a estratégia na hora. | Sim (extraível) |

> **Regra de leitura crítica (dos engenheiros):** depois de qualquer ciclo de paradas, **espere
> 2–3 voltas** antes de confiar nos gaps — a primeira volta pós-box mostra reshuffle, não ritmo. E
> a tela **nunca diz o porquê** de um gap: o sistema informa, a decisão é humana.

---

## 3. Decisões que ganharam / perderam (casos reais → lição pro nosso painel)

- **Le Mans 2026 — SC salva o Toyota #7:** uma falha técnica custaria a vitória, mas o safety car
  juntou o pelotão e apagou a desvantagem. **Lição:** o sistema tem que sinalizar na hora "estamos
  em SC/amarela — reavaliar box AGORA", porque a janela de ganho é curta.
- **Le Mans 2026 — Toyota #8 erra o timing do pneu:** trocou tarde, ficou preso atrás de um
  Cadillac e perdeu a corrida pro carro-irmão. **Lição:** timing de box **relativo aos rivais**
  (undercut/overcut) e ao tráfego, não só ao relógio.
- **Cadillac #12 — parada de emergência no FCY:** teve que parar por combustível e **de novo** pra
  parada de verdade = perdeu tudo. **Lição:** nunca deixar o combustível/obrigação te forçar a uma
  parada dupla; o painel precisa avisar "se não parar até volta N, vira parada extra".
- **24h Spa Kart — piloto bom no kart ruim:** vencedores põem o **piloto mais experiente no kart
  pior** (não o contrário). Kart de aluguel varia muito. **Lição:** o sistema deve **rankear os
  nossos 4 karts por ritmo** e ajudar a realocar pilotos.
- **24h Spa Kart — manutenção que não precisava:** equipe perdeu 10 min "consertando" sem ganho.
  **Lição:** só entra no box fora de janela se for falha real; o painel mostra o **custo** (voltas
  perdidas) de qualquer parada não planejada.

---

## 4. O que é EXTRAÍVEL (mylaptime) × o que é MANUAL

O sistema só gera informação **válida** se a fronteira estiver clara. Metade do valor do endurance
mora nos dados manuais.

**Extraível automático (mylaptime, já validado):** posição, nº/nome do kart, melhor volta, última
volta, LAP (voltas), DIFF, GAP, histórico volta a volta completo, relógio da prova, bandeira.

**Manual — a rede de segurança (o sistema TEM que aceitar entrada rápida):**
- **Paradas obrigatórias cumpridas por kart (0–7)** ← o dado mais importante; destrava virtual,
  previsão e anti-DQ. (Semi-auto: detectar voltas longas como candidatas a parada e pedir
  confirmação.)
- **Qual dos 13 pilotos está em cada kart agora** (a rotação é nossa; o feed só mostra o kart).
- **Peso/lastro em cada pesagem** (100/98 kg) — medição física.
- **Cronômetro da nossa parada** (os 5:00) — é nosso, não do feed.
- **Penalidades/advertências** — decisão da direção de prova.
- **Sorteio do kart, placa, sensor** — checklist físico.

**Calculado (nem feed nem manual):** box aberto/fechado (relógio +10/−20), folga anti-DQ, posição
virtual, previsão de resultado.

---

## 5. Requisitos concretos do sistema (priorizados)

### 🔴 P0 — não pode faltar (anti-DQ + o que ganha a prova)
1. **Watchdog anti-DQ** (já temos): relógio, janela de box, **paradas/kart x/7**, **folga**
   (tempo até o box fechar − paradas restantes × ciclo). Verde/amarelo/vermelho. → *é a lei nº6.*
2. **Contador de paradas por kart com entrada 1-clique** + cronômetro dos 5:00 por parada
   (zonas 5:05 / 4:55). → *pit é onde se ganha (lei 3).*
3. **Placar de consistência por piloto** (média + **desvio-padrão**), já temos — usar pra decidir
   rotação. → *lei 2.*

### 🟠 P1 — o cérebro (transforma dado em decisão)
4. **Classificação VIRTUAL:** posição real corrigida pelas paradas que cada kart ainda deve. Entre
   os nossos 4 é 100% calculável; contra rivais é estimativa (inferir paradas por voltas longas,
   sempre marcado "estimado"). → *"quem lidera de verdade".*
5. **Previsão de resultado à bandeirada (~18:00):** voltas projetadas ≈ f(ritmo médio, tempo
   restante − paradas ainda devidas). Mostra posição/gap final previstos. Caveat: bandeira vermelha
   neutraliza (7.2). → *planejamento minuto-a-minuto.*
6. **Ranking dos nossos 4 karts por ritmo** (kart de aluguel varia) → apoia "piloto forte no kart
   fraco". → *caso Spa.*

### 🟡 P2 — refino de corrida
7. **Interval** (p/ carro à frente), além do Gap. + regra "ignore 2–3 voltas pós-box".
8. **Degradação do stint** (tendência de ritmo) → alerta "kart/piloto caindo, avaliar troca".
9. **Delta para ritmo-alvo** por stint (feedback ao piloto).
10. **Alerta de SC/bandeira** na hora + botão "reavaliar box" (janela de ganho curta). → *lei 5.*
11. **Alocação dos 13 pilotos × 4 karts × 8 stints** respeitando físico (fadiga) e experiência.

### Princípio de arquitetura (inegociável)
**As funções críticas não podem depender do feed.** Relógio, watchdog, cronômetro de parada,
pesagem e penalidades rodam só com o relógio + entrada manual. O mylaptime **enriquece** (ritmo,
gaps, virtual, previsão). Se a extração cair, o sistema anti-DQ continua de pé. → *lei 1: terminar.*

---

## 6. Anti-padrões (o que NÃO fazer no painel)

- Mostrar "volta mais rápida" como métrica-herói → engana; endurance é ritmo médio.
- Confiar em gap logo após parada → ruído de reshuffle.
- Encher de número sem hierarquia → sob pressão, o box precisa de **1 número por kart** (a folga).
- Otimizar stint isolado → o ótimo é o conjunto (nº de paradas + duração + rotação), não a melhor
  parada sozinha.
- Prometer previsão exata → sempre exibir o caveat (bandeira vermelha / SC quebram a projeção).

---

## Fontes
- Motorsport.com — [Como o Toyota #8 perdeu Le Mans 2026](https://www.motorsport.com/wec/news/how-the-8-toyota-lost-the-2026-le-mans-24-hours/10830494/) · [Análise: o carro mais rápido não venceu](https://www.motorsport.com/wec/news/2026-le-mans-24h-analysis-the-fastest-car-didnt-win/10830687/)
- FIA WEC — [Recursos de estratégia do Le Mans](https://www.fiawec.com/en/news/dive-into-the-heart-of-le-mans-strategy-with-fiawec-s-new-features/13593)
- Karting4u — [A importância da estratégia no 24h de Spa (kart de aluguel)](https://www.karting4u.info/post/the-importance-of-strategy-in-rental-kart-endurance-races)
- TKART — [10 estratégias para corrida de kart endurance](https://tkart.it/en/magazine/how-to/strategies-kart-endurance-race)
- Fanatec — [Estratégia de pit em endurance](https://www.fanatec.com/us/en/explorer/games/gaming-tips/pit-stop-strategy-in-endurance-sim-racing/)
- BoxThisLap — [Dicas de endurance](https://boxthislap.org/endurance-tips/)
- The Field — [Como ler a tela de cronometragem (Gap × Interval)](https://www.thefieldf1.com/charts/how-to-read-timing-screen)
- Campbell Racing — [O papel da estratégia no endurance](https://campbellracingteam.com/the-role-of-strategy-in-endurance-racing-more-than-just-speed/)
- KartPulse — [Desvio-padrão de voltas na corrida](https://forums.kartpulse.com/t/lap-standard-deviation-during-race/3939)
- MDPI — [Virtual Strategy Engineer (redes neurais para decisão de estratégia)](https://www.mdpi.com/2076-3417/10/21/7805)
