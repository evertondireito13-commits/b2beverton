# Testes automatizados do prompt de follow-up

## Vale a pena?

Sim, mas testar o prompt sozinho não resolve. Um modelo de IA pode responder diferente na mesma pergunta,
então um teste que só chama a IA vai falhar de vez em quando sem haver bug. A proteção de verdade vem de
duas camadas:

1. **Rede de segurança em código** — uma validação que roda sempre, em produção, e corrige/bloqueia a
   observação antes de virar follow-up (ex.: "e-mail enviado" quando ninguém enviou).
2. **Testes automatizados** — rápidos e determinísticos em cima dessa validação, mais uma bateria opcional
   com ligações reais chamando a IA de verdade, rodada só quando eu quiser conferir a qualidade do prompt.

Assim o erro que você viu (afirmar envio de e-mail, inventar cargo, tratar a BHM como empresa do contato)
passa a ser impossível de chegar na tela, mesmo que a IA escorregue.

## O que será feito

### 1. Separar a lógica do prompt em um módulo testável
Hoje o prompt, a leitura do JSON e as regras estão dentro da função de servidor, que não dá para testar
isolada. Extrair para um arquivo próprio (sem mudar comportamento):
- montagem do prompt (a partir da data de referência),
- leitura/parsing da resposta,
- **novo:** saneamento da observação.

### 2. Saneador de observação (novo)
Regras aplicadas sempre, antes de salvar:
- Ação não executada vira pendência: "e-mail enviado" → "e-mail a enviar"; idem "material encaminhado",
  "proposta enviada", "reunião confirmada" — só permitidas se o texto original disser explicitamente.
- Remove qualificadores deduzidos em nomes: "(deduzido)", "(provável)", "(recepcionista)".
- Remove cargo/interesse atribuído a alguém quando esse cargo não aparece na transcrição.
- Corrige a confusão BHM/BHN: nenhuma pessoa do prospect pode ser descrita como sendo da BHM Advogados.
- Se sobrar algo insalvável, a observação cai para um texto neutro baseado só no que foi dito.

### 3. Casos de teste com ligações reais
Uma pasta de exemplos com transcrições reais anonimizadas, começando pela ligação do Samuel/Daniele que
gerou o erro, cada uma com o que **deve** e o que **não pode** aparecer na observação. Fáceis de aumentar:
é só colar uma nova transcrição e o resultado esperado.

### 4. Duas suítes
- **Rápida (padrão):** roda sem IA, valida o saneador e o parsing contra todos os exemplos. É a que trava
  regressão de verdade.
- **Com IA (opcional):** roda o prompt real contra as ligações reais e checa as mesmas proibições; ligada
  por uma variável de ambiente para não gastar crédito nem quebrar por variação do modelo.

## Detalhes técnicos

- Novo `src/lib/follow-up-prompt.ts`: `buildFollowUpPrompt(now)`, `parseFollowUpResponse(raw)`,
  `sanitizeFollowUpNotes({ notes, contactPerson, sourceText })`.
- `src/lib/follow-ups.functions.ts` passa a importar essas funções; handler mantém o mesmo contrato e chama
  o saneador antes do retorno.
- Fixtures em `src/lib/__tests__/fixtures/ligacoes/*.ts` (`{ id, transcricao, historico, deveConter[],
  naoPodeConter[] (regex) }`).
- Testes: `src/lib/__tests__/follow-up-prompt.test.ts` (rápido) e `follow-up-prompt.live.test.ts`
  (`describe.skipIf(!process.env.RUN_AI_EVALS)`).
- Vitest instalado como devDependency + script `test`; execução via `bunx vitest run`.
- Sem mudança de schema, de UI ou de banco.
