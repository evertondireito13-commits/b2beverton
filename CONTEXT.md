# CONTEXT.md — Painel Central de Prospecção (b2beverton)

> Este arquivo existe pra qualquer sessão nova do Claude (em qualquer conta) entender o projeto **sem precisar de upload de zip**. Basta colar o link bruto (raw) deste arquivo no chat e pedir pra buscar (fetch). Atualize este arquivo sempre que algo relevante mudar.

## Visão geral
- **Painel Central de Prospecção**: ferramenta de prospecção B2B para gestão de leads, histórico de empresas, follow-ups e reuniões, usada pela BHM Advogados (Curitiba/PR).
- Everton é **usuário não-técnico**, sem créditos de IA restantes no Lovable — mudanças de código precisam ser feitas manualmente, direto pelo editor web do GitHub. Editar localmente (Notepad etc.) **não sincroniza** com o app publicado.
- Stack: **Lovable (builder/deploy) + React/TanStack Start (frontend) + Supabase (backend/banco de dados) + Tailwind CSS + @dnd-kit (drag-and-drop)**.
- Repositório: https://github.com/evertondireito13-commits/b2beverton
- Projeto conectado ao Lovable (sync automático via git — cuidado, o Lovable AI pode sobrescrever edições manuais feitas direto no GitHub).
- Uma colega, **Eloane Manfroni**, também usa o sistema; o app suporta sessões isoladas por consultor.

## Fluxo de edição de código (importante)
- **Editar direto pelo GitHub (interface web)** — Edit no arquivo → alterar → Commit changes.
- **Editar localmente NÃO funciona** — não sincroniza com o app publicado.
- Sempre que o Lovable AI mexer em algo por conta própria, **verificar se não sobrescreveu correções feitas manualmente no GitHub**.
- **Regra de ouro por causa de um incidente real**: `preparacao-noturna.tsx` (o arquivo real) contém o componente `PreparacaoNoturna` (a tela cheia de gestão da pipeline noturna — pastas, drag-and-drop, importação em massa, etc.). Esse **não é** o mesmo arquivo do componente `PreLigacao` (a tela de Script de Abordagem/Pré-ligação), mesmo que `PreLigacao` importe algumas constantes (`LOAD_PRE_LIGACAO_EVENT`, `PREPARACAO_REALIZADA_EVENT`, `ACTIVE_PREPARATION_ID_KEY`, `PENDING_PRE_LIGACAO_KEY`) de dentro de `@/components/preparacao-noturna`. **Nunca colar o conteúdo de um componente por cima do arquivo do outro.** Isso já causou um build failed (`[MISSING_EXPORT] "PreparacaoNoturna" is not exported`) que precisou ser revertido.
- **PENDÊNCIA ATIVA**: o caminho/nome exato do arquivo onde `PreLigacao` vive de verdade **ainda não foi confirmado** por Everton. Antes de fazer qualquer edição nova nesse componente, perguntar/confirmar o nome do arquivo primeiro.

## Estrutura relevante do repo
- `src/` — código-fonte da aplicação.
- `supabase/` — configuração/migrations do backend.
- `.lovable/` — metadados do Lovable.
- `AGENTS.md` — regras do projeto para agentes de IA.
- `src/components/preparacao-noturna.tsx` — componente `PreparacaoNoturna` (tela cheia + versão compact de sidebar). Contém: gestão de empresas por data ou por "pasta" (carteira), cadastro individual e importação em massa por CNPJ, enriquecimento automático via BrasilAPI (com backoff exponencial contra rate limit 429), edição completa (`EditEmpresaDialog`), grupos matriz/filial, drag-and-drop de reordenação (via `@dnd-kit`), filtros (busca, status, UF, setor, regime, etapa da esteira), ações em lote (copiar/mover selecionadas entre datas/pastas), e o handoff pro Pré-ligação via `LOAD_PRE_LIGACAO_EVENT` / `PENDING_PRE_LIGACAO_KEY`.
- Componente `PreLigacao` (Script de Abordagem / Pré-ligação) — **arquivo real ainda não identificado** (ver pendência acima). Contém: busca por CNPJ (BrasilAPI) ou nome/razão social, enriquecimento de telefones, Modo Esteira (compilação local sem IA) vs geração via IA, Modo Manual de Contingência (quando as APIs públicas falham), gravação automática de chamada, e o bloco de Script gerado com atalho Alt+S para copiar.
- `src/**/cloud-store.ts` (ou caminho equivalente) — lógica de sincronização com o Supabase (`hydrateFromCloud`).
- `automatic-backup.tsx` — lógica de restauração automática de backup.
- `data-backup.functions.ts` — funções de backup (`getBestAppDataBackup`).

## Tabelas principais no Supabase
- `leads`
- `historico_empresas`
- `follow_ups`

## Trabalho recente — Tela Pré-ligação (`PreLigacao`) — sessão atual
Melhorias de interface aplicadas (arquivo entregue avulso, aguardando confirmação de onde colar):
1. **Botão "Limpar tudo"** no cabeçalho (fundo navy), com `AlertDialog` de confirmação antes de disparar `limparTudo()` — função já existia no código mas não tinha gatilho na UI.
2. **Remoção de botões duplicados** no bloco do script gerado — "Baixar"/"Copiar" apareciam tanto no topo quanto no rodapé do `Collapsible`; agora só existem na barra superior (junto ao gravador de chamada). O rodapé ficou só com "Recolher script", centralizado.
3. **Cabeçalhos de etapa** — "1. Buscar empresa", "2. Conferir dados", "3. Gerar script" — bolinha numerada + texto em caixa alta, com linha divisória sutil entre etapas 2 e 3, no mesmo estilo já usado na Preparação Noturna.
4. **Toggle CNPJ/Razão social restilizado** — ganhou borda (`border-input`), `ring` no estado ativo e transição suave, alinhado ao acabamento do `Select`/`Switch` do resto do app.
5. **Dica de estado vazio** — quando CNPJ, dados e busca por nome estão todos vazios, aparece "Cole um CNPJ ou o nome da empresa logo abaixo para começar."
6. **Banner do Modo Manual de Contingência** — antes era um badge pequeno ao lado do label "Dados da empresa"; agora é um banner âmbar com ícone e explicação, acima da textarea, só quando `contingenciaAtiva` está ativo.
7. **Atalho Alt+S visível** — o botão "Copiar" do script agora mostra um selo `Alt+S` (estilo `<kbd>`) e tem `title="Atalho: Alt+S"`.

## Problemas identificados e correções feitas (sessões anteriores)

### 1. Perda de dados via `hydrateFromCloud` (cloud-store.ts) — CORRIGIDO, mas verificar
- **Causa raiz**: `hydrateFromCloud` sobrescrevia silenciosamente o localStorage com dados vazios vindos da nuvem, quando o Supabase estava vazio/mal configurado.
- **Status**: correção commitada via GitHub web editor. **Pendência**: o Lovable AI modificou esse arquivo depois, por conta própria — precisa verificar se a correção de segurança não foi sobrescrita.

### 2. Restauração de backup errada (automatic-backup.tsx) — CORRIGIDO
- **Causa raiz**: o sistema sempre restaurava o backup mais recente, não o com mais registros.
- **Correção**: criada a função `getBestAppDataBackup` em `data-backup.functions.ts`, que escolhe o backup com mais registros em vez do mais recente.

### 3. Supabase mal configurado
- O backend do Lovable Cloud está apontando pra um projeto Supabase novo e vazio, faltando a variável `SUPABASE_SERVICE_ROLE_KEY`.
- **Pendência em aberto**: configurar a `SUPABASE_SERVICE_ROLE_KEY` corretamente e confirmar que o projeto Supabase certo está conectado.

### 4. Painel Executivo mostrando 0 registros
- Depende de um cache em `localStorage` que foi apagado (relacionado ao problema #1).
- Follow-ups (fila) e Central de Reuniões continuam funcionando normalmente, pois leem direto das tabelas na nuvem.

## Pendências abertas (resumo)
1. **Confirmar o nome/caminho do arquivo real de `PreLigacao`** — bloqueia qualquer nova edição de UI nesse componente até ser identificado.
2. Confirmar se a correção do `cloud-store.ts` sobreviveu às edições do Lovable AI.
3. Configurar `SUPABASE_SERVICE_ROLE_KEY` no projeto Supabase correto.
4. Repopular/confirmar dados nas tabelas `leads`, `historico_empresas`, `follow_ups`.
5. Verificar se o Painel Executivo volta a mostrar registros depois que o cache/local storage for restaurado corretamente.
6. Hide o `AppNav` (sidebar global) na rota da Preparação Noturna (pendência antiga, ainda não retomada).
7. Adicionar "Descobrir Empresas" (🧭) ao `app-nav.tsx` sob o grupo Prospectar (arquivo já preparado antes, ainda não commitado).
8. Limpar arquivos soltos na raiz do repo (zip antigo, markdown duplicado) — opcional, organização.

## Aprendizados importantes (não esquecer)
- Editar localmente **não sincroniza** — sempre usar o editor web do GitHub.
- **Nunca colar o conteúdo de um componente por cima do arquivo de outro** — `preparacao-noturna.tsx` ≠ arquivo de `PreLigacao`, mesmo compartilhando algumas constantes exportadas. Confirmar sempre o nome do arquivo antes de entregar uma edição.
- Falha silenciosa é o inimigo aqui: qualquer lógica de sync com a nuvem precisa checar se os dados vindos da nuvem não estão vazios antes de sobrescrever dados locais.
- Lógica de "restaurar backup" deve sempre preferir o backup mais completo, não o mais recente.
- Depois de qualquer atividade do Lovable AI no projeto, revisar os arquivos que já foram corrigidos manualmente.
- Everton prefere melhorias de UI feitas uma de cada vez ou em pequenos lotes (2–4), confirmando que cada uma funciona antes de seguir.

---
**Como usar este arquivo numa conta nova do Claude:**
1. Cole o link bruto: `https://raw.githubusercontent.com/evertondireito13-commits/b2beverton/main/CONTEXT.md`
2. Peça: "busca esse link e me diz que já entendeu o projeto."
3. Só peça upload de arquivo específico (não o zip inteiro) se for mexer em algo pontual daquele arquivo.

**Convenção "SALVAR":** quando o Everton escrever a palavra `SALVAR` sozinha numa mensagem, o Claude deve: (1) resumir o que foi resolvido/decidido nesta conversa desde a última atualização; (2) reescrever este arquivo CONTEXT.md inteiro, já atualizado, pronto pra ele copiar e colar no GitHub (Edit → Ctrl+A → colar → Commit changes); (3) não esperar o fim da conversa pra isso — pode e deve ser pedido a qualquer momento, assim que algo importante for concluído.
