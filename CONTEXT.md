[CONTEXT.md](https://github.com/user-attachments/files/32146561/CONTEXT.md)
# CONTEXT.md — Painel Central de Prospecção (b2beverton)

**Última atualização:** via palavra-chave "SALVAR" — sessão de UX/dados da
Preparação Noturna (badge de prontidão, correção do parser de UF, robustez
do enriquecimento via BrasilAPI, barra de ações em lote).

---

## Propósito & contexto

Sistema de prospecção B2B chamado **"Painel Central de Prospecção" /
b2beverton**, hospedado em `github.com/evertondireito13-commits/b2beverton`
(repositório privado). Mantido por Everton William — usuário **não-técnico**,
todas as edições de código são feitas exclusivamente pela **interface web do
GitHub** (sem Git local, sem créditos de IA restantes no Lovable).

Stack: React / TanStack Start / TanStack Router, Supabase **via Lovable
Cloud** (não é uma conta Supabase externa — operações SQL passam pela aba
"SQL editor" do Lovable Cloud), shadcn/ui, `@dnd-kit` para drag-and-drop,
fonte Inter. O sistema gira em torno de um pipeline noturno de preparação em
múltiplos estágios ("Preparação Noturna"): **Descobrir → Validar →
Enriquecer → Pontuar**, com telas interligadas: Preparação Noturna,
Pré-ligação, Pós-ligação, Central de Reuniões, Painel Executivo e
acompanhamento de comissões.

A identidade visual do app já passou por uma transição de marca: do losango
"BHM" (BHM Advogados) para a logo da **Hezus Capital & Tributos** — daí
nomes de classes CSS como `hub-gold` no código, que são intencionais
(convenção de redesign visual, não código legado).

Toda comunicação é em **português do Brasil (pt-BR)**. Este arquivo fica na
raiz do repositório e é reescrito por completo sob demanda ao digitar a
palavra-chave **"SALVAR"**.

---

## ⚠️ Risco conhecido — verificar antes de mexer em sincronização

`hydrateFromCloud` (em `cloud-store.ts`) já teve uma regressão real: em vez
de mesclar por ID, ele sobrescrevia o localStorage inteiro com o cloud a
cada abertura do app — se as tabelas na nuvem estivessem vazias (ex.: após
transferência de conta Lovable), os dados locais eram apagados. A correção
(merge por ID + reenvio de itens só-locais pra nuvem) já foi commitada e
confirmada funcionando (empresas em "Reunião Agendada" sobrevivem a
refresh). **Mas atividade do Lovable AI já sobrescreveu essa correção uma
vez antes** — então é o primeiro lugar a checar sempre que voltar a
aparecer "empresas sumindo depois de atualizar a página".

---

## Estado atual

**Concluído em sessões anteriores:**
- Identidade visual do cabeçalho (logo Hezus + foto do consultor,
  editáveis pelo operador, salvos em `localStorage`).
- Correção de dados obsoletos ao trocar de empresa em Pré/Pós-ligação.
- Confirmação explícita obrigatória antes de arquivar como "sem interesse".
- Modal "Editar empresa" (`preparacao-noturna.tsx`) estendido com: múltiplos
  contatos além do principal, telefone/e-mail secundários, e bloco "Grupo
  econômico" (matriz + filiais do mesmo CNPJ raiz) com atalho clicável.
- `cnpj-raw-parser.ts` extraindo todos os sócios/administradores (não só o
  primeiro), até dois telefones/e-mails, Setor (via CNAE principal) e
  Regime tributário — incluindo correção de um gap de regex que ignorava
  sócias mulheres ("Sócia").
- Três pontos de entrada para adicionar empresas unificados num botão único
  "Adicionar Empresas" com seletor de 3 opções; cadastro de empresa única
  já enriquece automaticamente via BrasilAPI logo após salvar.
- Drag-and-drop de pastas na barra lateral (`@dnd-kit`, ícone sempre
  visível, não depende de hover — pensado pra mobile).
- Botão "🗑️ Excluir" em cada card de `leads-central-panel.tsx`, apagando
  local e na nuvem (evita ressurreição de registros após o merge fix do
  `hydrateFromCloud`).

**Concluído nesta sessão (arquivos entregues: `preparacao-noturna.tsx` e
`cnpj-raw-parser.ts`, ambos completos e validados com `esbuild`/`tsc`):**
- **Card da lista de empresas simplificado**: o cluster de 3 ícones
  (✓/✗ de CNPJ/dados/ligação) virou um badge de texto dinâmico — "Pronto
  para ligação" (verde) ou "Faltando: CNPJ, dados, ligação" (âmbar),
  listando só o que realmente está pendente, sem precisar de tooltip
  (importante pra uso no celular).
- **Checagem de "dados ok" agora exige Regime tributário também** (antes só
  checava UF + Setor) — decisão explícita do Everton.
- **Removido o badge isolado de UF (ex.: "PR")** do card da lista — era
  redundante e não comunicava o que faltava; a UF continua visível dentro
  do modal de edição.
- **Bug real corrigido no `cnpj-raw-parser.ts`**: a extração de UF só
  funcionava quando o endereço vinha no formato exato
  `"Curitiba PR 80420-060"` (UF colada no CEP, só com espaço). Qualquer
  variação comum — `"Curitiba - PR - CEP: 80420-060"`, ou UF e CEP em
  linhas separadas — fazia a UF ficar vazia mesmo estando no texto colado.
  Corrigido: agora busca numa janela da linha do CEP + até 2 linhas
  anteriores por um código de 2 letras que seja UF válida, pegando o mais
  próximo do CEP. Validado com 5 formatos de texto reais via `npx tsx`.
- **Enriquecimento via BrasilAPI mais resistente ao limite de requisições
  (HTTP 429)**: pausa entre empresas subiu de 1200ms para 2500ms; máximo de
  tentativas por empresa subiu de 3 para 5; backoff no 429 trocou de linear
  (`4000 × tentativa`) para exponencial (`3000 × 2^(tentativa-1)` — 3s, 6s,
  12s, 24s). Reduz falhas em listas grandes, mas não elimina 100% o risco
  em picos muito altos.
- **Barra de "ações em lote" (copiar/mover selecionadas) movida do rodapé
  fixo pro topo da lista**, agora recolhida por padrão atrás de um botão
  "Ações em lote" (com contador de selecionadas) ao lado de "Selecionar
  todas" / "Só pendentes" — não fica mais ocupando espaço permanentemente
  na tela.

**Pendente (ainda não iniciado ou pausado):**
- Exportação multi-formato de "pastas" de empresas da Preparação Noturna
  (campos: Nome, Razão Social, CNPJ, Telefone, Contato, Cargo, E-mail,
  Verificar, UF, Setor, Regime Tributário).
- Remoção dos campos de CRM RD Station das telas de Pré-ligação e
  Pós-ligação (parcialmente iniciada, pausada).
- Adicionar (manualmente) uma empresa nova à Central de Reuniões — o botão
  de excluir já existe, o de adicionar ainda não.
- `FloatingNotepad.tsx` não minimiza pra uma bolha no mobile (cobre a tela
  inteira) — é o bloco de notas *dentro do app*, não o do celular.
- Módulos iniciados pelo Lovable AI só no banco (tabelas criadas, sem
  funções de servidor nem telas): Mural de Atualizações, Biblioteca de
  Conteúdos, Passagem de Bastão.
- Validar com uso real se o seletor de 3 opções em "Adicionar Empresas" é
  claro o suficiente ou precisa simplificar.

---

## No horizonte

- Concluir a exportação multi-formato das pastas da Preparação Noturna.
- Retomar e concluir a remoção dos campos do RD Station CRM.
- Implementar "adicionar empresa" na Central de Reuniões.
- Corrigir o `FloatingNotepad.tsx` no mobile.
- Terminar os três módulos com tabela criada mas sem UI (Mural de
  Atualizações, Biblioteca de Conteúdos, Passagem de Bastão).
- Re-verificar o `hydrateFromCloud` antes de qualquer sessão que envolva
  sincronização com a nuvem (ver risco conhecido acima).
- Monitorar se o novo backoff do BrasilAPI é suficiente em listas muito
  grandes (dezenas de empresas de uma vez) ou se vai precisar de fila com
  processamento em lotes menores no futuro.

---

## Aprendizados & princípios-chave

- Empresas só chegam ao estágio "Pontuar" após ligações registradas — esse
  é o comportamento correto e intencional.
- A integração com a Overpass API para "Descobrir Empresas" precisa de
  failover entre múltiplos espelhos (overpass-api.de → overpass.kumi.systems
  → overpass.openstreetmap.ru) por instabilidade.
- Eventos de ponteiro que "sequestram" o drag em cabeçalhos de UI flutuante
  podem bloquear cliques em botões silenciosamente — resolvido com
  `onPointerDown={(e) => e.stopPropagation()}` nos botões filhos.
- `contentEditable` para renomear inline é pouco confiável entre
  navegadores; um `<input>` com ref e foco/seleção programáticos no mount é
  mais robusto.
- Ao subir arquivos estáticos para `public/` via upload do GitHub, o nome
  pode duplicar a extensão (ex.: `logo-hezus.png.png`) — sempre conferir e
  corrigir via "rename" antes de referenciar o caminho no código.
- **Duas fontes de dados de CNPJ nunca devem se misturar**: o caminho
  "Dados Brutos" (colar texto → `parseDadosCnpj` em `cnpj-raw-parser.ts`,
  determinístico, sem IA) e o caminho "Enriquecer via CNPJ" (chamada à
  BrasilAPI via `cnpj-enriquecimento.functions.ts`). São completamente
  separados — um nunca deve sobrescrever dado que o outro já preencheu.
- **Merge nunca sobrescreve dado existente**: ao colar um CNPJ duplicado,
  UF/Setor/Regime e outros campos enriquecidos não podem ser sobrescritos
  pelo merge.
- **Parsers de texto colado precisam de janela de tolerância, não só regex
  rígido colado**: a extração de UF falhava porque exigia adjacência exata
  entre UF e CEP; texto real varia (traços, "CEP:", quebras de linha) — o
  fix foi olhar uma janela de linhas próximas em vez de um único padrão
  rígido. Vale revisar outras extrações do parser com a mesma lente se
  aparecerem bugs parecidos.
- **Limite de requisição de API pública (BrasilAPI) é mais apertado do que
  parece**: mesmo com retry, picos de uso batem 429 — backoff exponencial
  ajuda bem mais que linear.
- **Drag-and-drop é o padrão do app pra listas reordenáveis** —
  `@dnd-kit` com `GripVertical` sempre visível (não depende de hover, por
  causa do mobile). Botões de seta não são aceitáveis como substituto.
- Barras de ação fixas (sticky) que ficam sempre visíveis mesmo sem uso
  ativo (ex.: seleção em lote com 0 itens selecionados) poluem a tela —
  o padrão preferido é recolher por padrão e expandir sob demanda, com
  contador visível no botão de toggle.
- **Alias de consultor**: `findPreparationForCompany()` e
  `markPreparacaoRealizadaByCompany()` não usam os aliases de nome do
  consultor (diferente de `load()`) — pode fazer empresas salvas sob um
  nome legado não serem encontradas no Follow-up/Pós-ligação. Ainda não
  corrigido, só documentado.

---

## Abordagem & padrões

- **Formato de entrega de código**: Everton quer **arquivos completos,
  prontos para colar** — nunca diffs, snippets parciais ou instruções de
  find-and-replace. Preferência explícita, reafirmada nesta sessão
  ("preciso trocar o código completo, colar só partes não dá certo, me
  confunde").
- **Fluxo de trabalho no GitHub**: abrir arquivo → ícone de lápis → Ctrl+A
  → colar substituição completa → commit direto na main. Lovable
  sincroniza automaticamente a cada commit.
- **Validação antes de entregar**: Claude testa cada arquivo antes de
  mandar — `npx esbuild` (sintaxe/JSX), `npx tsc --noEmit` (tipos), e
  `npx tsx` rodando casos de teste reais contra funções de parsing antes
  de propor uma correção (usado nesta sessão pra confirmar o bug de UF com
  5 formatos de texto diferentes antes de mexer no código).
  Isso reduz o risco de entregar algo quebrado pro Everton colar direto em
  produção.
  - **Correções de bug**: Everton questiona diagnósticos ativamente e
  espera precisão sobre o que é bug vs. comportamento esperado — Claude
  não deve assumir, deve perguntar ou verificar com o código real antes de
  propor a correção.
- **Cuidado com caminho de arquivo**: a interface do GitHub pode duplicar
  segmentos de caminho (ex.: `src/components/src/components/`) ou
  extensões em upload (`.png.png`) — sempre conferir o nome/caminho final.
- **Método de recuperação**: se um arquivo for sobrescrito por engano,
  usar "Browse files" de um commit anterior no GitHub pra recuperar a
  versão correta.
- Antes de gerar funcionalidade nova, pedir o arquivo existente relevante
  pra entender a estrutura de dados atual em vez de assumir.
- Raw GitHub URLs de arquivos individuais precisam ser fornecidas
  manualmente pelo Everton (API do GitHub sem autenticação bate rate limit;
  a URL do app Lovable só renderiza o shell da SPA) — repositório é
  privado, Claude não consegue buscar arquivos sozinho.

---

## Ferramentas & recursos

- **Plataforma**: Lovable (build/deploy), GitHub web editor (edição de
  código), Lovable Cloud SQL editor (operações de banco).
- **Stack**: React, TanStack Start/Router, Supabase (via Lovable Cloud),
  shadcn/ui, `@dnd-kit` (drag-and-drop), fonte Inter.
- **APIs externas**: Overpass API (descoberta de empresas via OSM,
  failover multi-espelho), BrasilAPI (enriquecimento de CNPJ — gratuita,
  com limite de requisições por segundo).
- **Identidade visual**: `public/logo-hezus.png`, `public/everton-pereira.png`.
- **Repo**: `github.com/evertondireito13-commits/b2beverton` (privado).
- **Validação (lado Claude)**: `npx tsx`, `npx esbuild`, `npx tsc --noEmit`,
  script Node.js de balanceamento de chaves CSS.
- **Contexto persistente**: este arquivo (`CONTEXT.md`), reescrito por
  completo sob demanda via palavra-chave "SALVAR".
