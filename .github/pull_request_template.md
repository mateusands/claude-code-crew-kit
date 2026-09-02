## Contexto

O problema em uma frase: quem sofre, o que vê hoje, o que deveria ver.
Se for bug, como reproduzir. Se for melhoria, o que motivou agora.

## O que muda

A solução e por que esta forma, não outra. Cite `arquivo:linha` no que for central.

## O que NÃO muda

Fronteira explícita. Sem isto, um PR de correção é lido como refactor.

## Como validar

| Nível | O que cobre | Resultado |
|---|---|---|
| N1 | `npm test` + `node --check` em cada `server.mjs` e no `core.mjs` | |
| N2 | Os servidores respondem `initialize` e `tools/list` por stdio | |
| N3 | Ponta a ponta contra o CLI executor real, em repositório descartável | |

**Não coberto:** o que ficou de fora e por quê.

## Mudança de comportamento

Sim/Não. Se sim: o que o orquestrador ou o executor passa a ver de diferente.

## Risco e rollback

O pior caminho é o que PARECE sucesso: auditoria que deixa passar escrita fora de escopo, job que
reporta DONE sem ter escrito nada, veredito verde numa árvore que ninguém olhou. Aponte o SHA de
partida para `git revert`.

## Ordem de merge

Se empilha em outro PR, diga qual e por que a ordem importa.

<!--
═══════════════════════════════════════════════════════════════════════════════
REGRAS DE ESCRITA — apague este bloco antes de abrir o PR

Sem atribuição a ferramenta interna. Nada de "o Codex apontou", "revisão adversarial",
"o Gemini sugeriu". O achado entra pelo que é e por como foi provado — a prova é o que dá
autoridade, não quem a produziu.

Poucos emotes. No máximo onde marcam severidade real numa tabela. Corpo de PR não é chat.

Resultado, não intenção. "Rodei o N1" não vale nada; "N1: 30 testes, 30 passam" vale.
Cole o número.

Declare o que NÃO foi coberto. Um PR que lista só o que passou é lido como cobertura total.
O limite escrito vale mais que o limite escondido.

Título: `tipo(escopo): descrição objetiva`, e `[n/N]` quando a PR faz parte de uma fila.

───────────────────────────────────────────────────────────────────────────────
ARMADILHAS QUE JÁ CUSTARAM UMA RODADA NESTE REPOSITÓRIO

Suíte verde não prova runtime. Vinte e um testes passavam e a auditoria tinha quatro furos —
todos porque cada teste partia de árvore LIMPA, que não é como um repositório em uso se parece.
Quando escrever teste de auditoria, comece sujo.

O comando documentado precisa funcionar na versão dos outros. `node --test tests/` funciona no
Node 26 e falha no 22 com `Cannot find module`. Era o primeiro comando do README, e uma suíte
verde parecia kit quebrado. Rode `npm test`, que nomeia os arquivos.

O git registra QUE um arquivo mudou, nunca QUEM mudou. Escrita do orquestrador em paralelo é
indistinguível de executor saindo do escopo. Se você mexeu na árvore durante o job, declare
(`reserved_files` ou `orchestrator_writing`) antes de tratar a violação como real.

Servidor MCP não acorda o cliente. O sinal de término vem do host mandando o `*_await` para
background — `*_status` em laço não substitui, só gasta turno.
═══════════════════════════════════════════════════════════════════════════════
-->
