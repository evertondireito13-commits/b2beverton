[CONTEXT.md](https://github.com/user-attachments/files/32084014/CONTEXT.md)
# CONTEXT.md — Painel Central de Prospecção (b2beverton)

**Última atualização:** via palavra-chave "SALVAR"

---

## Propósito & contexto

A Hezus Capital & Tributos está construindo um sistema de prospecção B2B chamado
**"Painel Central de Prospecção" / b2beverton**, hospedado em
`github.com/evertondireito13-commits/b2beverton`. Stack: Lovable + React +
TanStack Router + Supabase. O sistema gira em torno de um pipeline noturno de
preparação em múltiplos estágios ("Preparação Noturna"):
**Descobrir → Validar → Enriquecer → Pontuar**, com três telas interligadas:
Pré-ligação, Pós-ligação e uma camada de gestão de follow-up/pipeline.

Toda comunicação é em **português do Brasil (pt-BR)**. Este arquivo
(`CONTEXT.md`) fica na raiz do repositório e é atualizado sob demanda ao
digitar a palavra-chave **"SALVAR"**.

---

## Estado atual

- Pipeline principal e as três telas centrais estão funcionais e já passaram
  por várias rodadas de correção e refinamento.
- **Identidade visual do cabeçalho (concluído nesta sessão):**
  - Arquivo alterado: `src/routes/index.tsx`, função `AppHeader`.
  - Logo trocada de "BHM" (losango com a letra B) para a logo da Hezus
    (`/public/logo-hezus.png`) + texto **"HEZUS CAPITAL & TRIBUTOS"**
    (subtítulo "PROSPECÇÃO B2B" mantido).
  - Avatar do consultor: as iniciais ("EP") foram substituídas pela foto do
    Everton (`/public/everton-pereira.png`) como padrão; nome/cargo
    (Everton Pereira · ADVOGADO) seguem vindos da sessão de login, sem
    alteração de lógica.
  - Ambos (logo+nome e foto do avatar) agora são **editáveis pelo próprio
    operador a qualquer momento**, via botão de upload (ícone de seta para
    cima) e — no caso do nome — um ícone de lápis para renomear inline.
    As trocas ficam salvas no `localStorage` do navegador:
    - `bhm-custom-logo-img` / `bhm-custom-logo-name` (globais)
    - `bhm-custom-avatar::<nome do consultor>` (por consultor — Everton e
      Eloane guardam fotos separadas)
  - Função antiga `BhmDiamond` (SVG do losango "B") foi removida por não ser
    mais usada.
  - Pré-requisito: os arquivos `logo-hezus.png` e `everton-pereira.png`
    precisam existir em `public/` no repositório (já enviados via GitHub
    web upload).
- Bugs recentes resolvidos:
  - **Dados obsoletos ao carregar empresa**: dados antigos (CNPJ, script,
    telefones, estado do lead) não eram limpos ao carregar nova empresa em
    Pré-ligação/Pós-ligação — corrigido via `limparRascunhoPre()` + limpeza
    de listeners de evento.
  - **Arquivamento sem confirmação em "sem interesse"**: empresas eram
    auto-arquivadas sem confirmação do operador — corrigido com estado
    `arquivarConfirm` + `AlertDialog` exigindo confirmação explícita antes
    de disparar `PREPARACAO_REALIZADA_EVENT`.
- **Pendente**: função de exportação de "pastas" de empresas na Preparação
  Noturna, com suporte a múltiplos formatos, cobrindo os campos: Nome,
  Razão Social, CNPJ, Telefone, Contato, Cargo, E-mail, Verificar, UF,
  Setor e Regime Tributário. O arquivo `preparacao-noturna.tsx` foi pedido
  antes de a implementação começar — ainda não concluída.
- **Parcialmente iniciado / pausado**: remoção dos campos de CRM RD Station
  das telas de pré-ligação e pós-ligação.

---

## No horizonte

- Concluir a exportação multi-formato das pastas da Preparação Noturna
  (precisa de `preparacao-noturna.tsx` como entrada).
- Retomar e concluir a remoção dos campos do RD Station CRM em Pré-ligação
  e Pós-ligação.
- Validar visualmente a nova identidade do cabeçalho (logo Hezus + foto do
  Everton) em produção e ajustar caso alguma imagem não carregue.

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
  mais robusto (aplicado tanto no nome editável do cabeçalho quanto em
  outros componentes do projeto).
- Ao subir arquivos estáticos para `public/` via upload do GitHub, o nome
  do arquivo pode duplicar a extensão (ex: `logo-hezus.png.png`) — sempre
  conferir e corrigir via "rename" antes de referenciar o caminho no código.

---

## Abordagem & padrões

- **Formato de entrega de código**: Hezus quer **arquivos completos,
  prontos para colar** — sem explicações, sem diffs parciais, sem
  instruções de find-and-replace. Preferência explícita: código completo
  sempre ("GOSTO DO COPIA E COLA MUDAR TUDO NAO SO AS PARTES PRECISO DO
  CODIGO COMPLETO").
- **Fluxo de trabalho no GitHub**: todas as edições são feitas
  exclusivamente pela **interface web do GitHub** (nunca localmente).
  Fluxo: Claude gera arquivo completo → pessoa abre o arquivo no GitHub →
  Ctrl+A → apagar → colar → commit na main.
- **Cuidado com caminho de arquivo**: a interface de criação de arquivos do
  GitHub pode duplicar segmentos de caminho silenciosamente (ex:
  `src/components/src/components/`) ou duplicar extensões em uploads
  (ex: `.png.png`) — sempre verificar o nome/caminho final antes de seguir.
- **Método de recuperação**: quando arquivos são sobrescritos por engano,
  usar "Browse files" de um commit anterior no GitHub para recuperar a
  versão correta.
- Antes de gerar novas funcionalidades, Claude deve pedir o arquivo
  existente relevante para entender a estrutura de dados atual.

---

## Ferramentas & recursos

- **Stack**: React, TanStack Router, Supabase, Lovable
- **Repo**: `github.com/evertondireito13-commits/b2beverton`
- **Mapas/descoberta**: OpenStreetMap + Overpass API (failover multi-espelho)
- **Identidade visual**: `public/logo-hezus.png`, `public/everton-pereira.png`
- **Contexto persistente**: `CONTEXT.md` na raiz, atualizado via palavra-chave "SALVAR"
