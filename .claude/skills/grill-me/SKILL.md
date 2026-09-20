---
name: grill-me
description: Entrevista o usuário sem dó sobre um plano ou design até chegarem a um entendimento compartilhado, resolvendo cada ramo da árvore de decisão. Use quando o usuário quiser estressar um plano, "ser grelhado" sobre um design, ou disser "grill me" / "me grelha".
license: MIT
metadata:
  original_author: "Matt Pocock (@mattpocock)"
  source: "https://github.com/mattpocock/skills"
  original_license: MIT
---

# Grill Me

Entreviste-me sem dó sobre cada aspecto deste plano até chegarmos a um entendimento
compartilhado. Percorra cada ramo da árvore de decisões, resolvendo as dependências entre
decisões uma a uma. Para cada pergunta, dê a sua resposta recomendada.

Faça as perguntas **uma de cada vez**.

Se uma pergunta pode ser respondida explorando o código, explore o código em vez de perguntar.

## Regras

1. **Uma pergunta por turno.** Nunca agrupe várias.
2. **Dê uma resposta recomendada em cada pergunta.** Cair no "o que você acha?" é preguiça.
3. **Explore o código antes de perguntar.** Se `Grep` / `Glob` / `Read` resolve, faça isso
   primeiro — economiza um turno.
4. **Percorra a árvore em profundidade.** Termine um ramo antes de abrir outro.
5. **Rastreie dependências.** Se a decisão B depende da decisão A, pergunte A primeiro.

## Fluxo

1. O usuário fornece um plano/design (ou o caminho para um).
2. Extraia mentalmente os ramos de decisão (o que ainda não está decidido).
3. Comece pelo ramo do qual mais coisas dependem.
4. Caminhe pela árvore, uma pergunta por turno, registrando as respostas conforme avança.
5. Quando todos os ramos estiverem resolvidos: declare **"entendimento compartilhado atingido"**
   e liste as decisões travadas.

## Formato de cada pergunta

```
P[i]/[total]: [pergunta]
Resposta recomendada: [sua escolha + 1 frase de justificativa]

(Ou: explorei o código e encontrei [evidência]. Confirma?)
```

---

Derivado do [grill-me do Matt Pocock](https://github.com/mattpocock/skills) (MIT).
