# CONTEXT.md — Painel Central de Prospecção (b2beverton)

> Este arquivo existe pra qualquer sessão nova do Claude (em qualquer conta) entender o projeto **sem precisar de upload de zip**. Basta colar o link bruto (raw) deste arquivo no chat e pedir pra buscar (fetch). Atualize este arquivo sempre que algo relevante mudar.

## Visão geral
- **Painel Central de Prospecção**: ferramenta de prospecção B2B para gestão de leads, histórico de empresas, follow-ups e reuniões.
- Everton é **usuário não-técnico**, sem créditos de IA garantidos no Lovable — mudanças de código muitas vezes precisam ser feitas manualmente.
- Stack: **Lovable (builder/deploy) + React/TanStack (frontend) + Supabase (backend/banco de dados)** + `@dnd-kit` (arrastar-e-soltar, já instalado).
- Repositório: https://github.com/evertondireito13-commits/b2beverton
- Projeto conectado ao Lovable (sync automático via git — cuidado, o Lovable AI pode sobrescrever edições manuais feitas direto no GitHub, e vice-versa).

## Fluxo de edição de código (importante)
- **Editar direto pelo GitHub (interface web)** — Edit no arquivo → Ctrl+A → apagar → colar → Commit changes.
- **Editar localmente (ex: Notepad, salvar no computador) NÃO funciona** — não sincroniza com o app publicado nem com o Lovable. Já causou confusão grande antes (correções "aplicadas" que nunca chegaram no ar).
- Ícone de vídeo nos arquivos `.ts` no Windows Explorer é só um problema de associação de ícone — não afeta o conteúdo. Abrir com Bloco de Notas funciona normalmente.
- **ANTES DE EDITAR QUALQUER ARQUIVO**: sempre pedir pro Everton o link "Raw" atual do GitHub (Abrir arquivo → botão "Raw" → copiar URL) e buscar (fetch) esse link antes de gerar qualquer correção. **Uploads de zip antigos ficam desatualizados rápido** — o Lovable AI e edições diretas no GitHub mudam arquivos sem o Claude saber. Editar em cima de uma versão desatualizada corre o risco de apagar trabalho recente (já aconteceu com `preparacao-noturna.tsx`, que tinha ganhado filtros de UF/setor/regime e um redesign visual completo que não estavam no zip enviado).
- Sempre que o Lovable AI mexer em algo por conta própria, **verificar se não sobrescreveu correções feitas manualmente no GitHub** (e vice-versa).

## Estrutura relevante do repo
- `src/` — código-fonte da aplicação.
- `src/routes/index.tsx` — define `AppShell` (layout raiz: header + sidebar `AppNav` + conteúdo da página). Usado por todas as rotas, inclusive `/preparacao`.
- `src/components/app-nav.tsx` — menu lateral global (Prospectar, Acompanhar, Central de Reuniões, Resultados). Agora com itens arrastáveis (drag-and-drop) dentro de cada grupo.
- `src/components/preparacao-noturna.tsx` — tela de Preparação Noturna. Tem filtros de UF/setor/regime, botão "Enriquecer via CNPJ", e agora (depois desta sessão) as pastas na coluna lateral esquerda em vez da prateleira horizontal.
- `supabase/` — configuração/migrations do backend.
- `AGENTS.md` — regras do projeto para agentes de IA.
- Arquivos já trabalhados nesta sessão (ver detalhes abaixo): `cloud-store.ts`, `automatic-backup.tsx`, `data-backup.functions.ts`, `app-nav.tsx`, `preparacao-noturna.tsx`.

## Tabelas principais no Supabase
- `leads`, `historico_empresas`, `follow_ups`, `app_data_backups`, `call_logs`, `daily_reports`, `user_prompts`.
- `rd_deal_id` (coluna em `leads`): **inerte, não é mais lida nem escrita** desde a remoção do RD Station (ver abaixo). Pode ser removida numa migração futura, sem pressa.

## Problemas identificados e correções feitas

### 1. Perda de dados via `hydrateFromCloud` (cloud-store.ts)
- **Causa raiz**: `hydrateFromCloud` sobrescrevia silenciosamente o localStorage com dados vazios vindos da nuvem, quando o Supabase estava vazio/mal configurado — isso gerou sustos de perda de dados reais (leads e histórico zerados).
- **Correção do Claude**: commitada via GitHub — trava que impede sobrescrever local com dados vazios da nuvem quando o local já tinha dados.
- **Depois**: o Lovable AI também mexeu nesse mesmo arquivo por conta própria (validação `Array.isArray`, auto-reenvio de dados locais quando a nuvem volta vazia). **Pendência**: confirmar que as duas correções convivem bem e nenhuma foi sobrescrita.

### 2. Restauração de backup errada (automatic-backup.tsx + data-backup.functions.ts) — CORRIGIDO
- **Causa raiz**: o sistema sempre restaurava o **backup mais recente**, não o **backup com mais registros** — um backup vazio (salvo por engano depois de uma perda de dados) podia sobrescrever um backup bom.
- **Correção**: criada a função `getBestAppDataBackup`, que escolhe o backup com mais itens em vez do mais recente. `automatic-backup.tsx` atualizado para usá-la.
- **Status**: commitado via GitHub (depois de descobrir que edições locais/Notepad não sincronizavam — ver "Fluxo de edição" acima).

### 3. Backend Supabase / Lovable Cloud mal configurado
- Em algum momento o Lovable conectou um banco (Lovable Cloud) novo e vazio, faltando `SUPABASE_SERVICE_ROLE_KEY` — isso causava falhas de build e deixava `leads`, `historico_empresas`, `follow_ups` vazios na nuvem.
- Diagnóstico confirmado direto na tela "Cloud → Database" do Lovable: tabelas existiam mas com 0 registros (exceto `app_data_backups` e `user_prompts`, que tinham alguns).
- **Pendência em aberto**: confirmar que a `SUPABASE_SERVICE_ROLE_KEY` está configurada corretamente hoje e que os dados foram repovoados (última vez que checamos, o Painel Executivo ainda mostrava 0 registros — não recebemos confirmação final de que voltou a mostrar dados depois dos commits via GitHub).

### 4. Nenhum programa sincronizava a pasta local com o GitHub
- Descoberto que o Everton só salvava os arquivos localmente (Notepad), sem nenhum programa de sync (GitHub Desktop, git, etc.) — por isso **nenhuma correção anterior a um certo ponto desta sessão chegou a ser aplicada de verdade**.
- **Solução adotada**: editar direto pelo site do GitHub (github.com/evertondireito13-commits/b2beverton), sem precisar instalar nada.

### 5. RD Station CRM — REMOVIDO
- O Lovable AI removeu toda a integração com RD Station (server functions, botões/campos nas telas de Pré-ligação, Pós-ligação e Central de Reuniões, menção no rodapé). Typecheck passou sem erros.
- Coluna `rd_deal_id` deixada no banco, inofensiva.

### 6. Menu lateral (app-nav.tsx) — arrastar e soltar adicionado
- Itens de cada grupo (Prospectar, Acompanhar, Central de Reuniões, Resultados) agora podem ser reordenados por arrastar-e-soltar (ícone ⋮⋮ ao passar o mouse), usando `@dnd-kit` (já estava instalado). Ordem escolhida fica salva no navegador.
- **Pendência**: confirmar se o commit foi feito e se o build passou (não recebemos confirmação final).

### 7. Preparação Noturna — redesign de usabilidade (em andamento)
- Everton achou a tela confusa (pastas, filtros, seleção em lote tudo empilhado). Foram propostos 3 cenários visuais; escolhido o cenário 2 (pastas na coluna lateral esquerda, como um "explorador de arquivos", em vez da prateleira horizontal no topo).
- **Feito**: `preparacao-noturna.tsx` reescrito com as pastas em coluna lateral fixa à esquerda dentro do próprio componente; abas, filtros (UF/setor/regime/busca), "Enriquecer via CNPJ" e a lista ficam na coluna principal à direita. Nada de UF/setor/regime/RD Station foi alterado nessa mudança.
- **Ajuste feito a pedido do Everton**: a barra de ações em lote (copiar/mover, destino, enviar) agora fica **sempre visível** (antes só aparecia depois de selecionar pelo menos 1 empresa).
- **Pendência aberta**: o menu lateral GLOBAL do app (`AppNav`, renderizado pelo `AppShell` em `src/routes/index.tsx`) continua aparecendo ao lado da nova coluna de pastas da Preparação Noturna, deixando a tela apertada com duas colunas laterais simultâneas. Precisa editar `src/routes/index.tsx` (aguardando o Everton mandar o link Raw atual desse arquivo) pra esconder/colapsar o `AppNav` global quando `current === "preparacao"`.
- Cor/fonte roxo-magenta que apareceu no menu: **não foi alteração do Claude** — as classes de cor do `app-nav.tsx` não mudaram; provavelmente vem de um seletor de tema (☀️/🌙/✨) que já existe no app.

## Pendências abertas (resumo)
1. Confirmar se a correção do `cloud-store.ts` (a do Claude) sobreviveu às edições do Lovable AI no mesmo arquivo.
2. Confirmar `SUPABASE_SERVICE_ROLE_KEY` configurada e dados repovoados em `leads`/`historico_empresas`/`follow_ups` — checar Painel Executivo.
3. Confirmar se o commit do `app-nav.tsx` (drag-and-drop) foi feito e testado.
4. Confirmar se o commit mais recente do `preparacao-noturna.tsx` (barra de lote sempre visível) foi aplicado.
5. Editar `src/routes/index.tsx` pra esconder o `AppNav` global na tela de Preparação Noturna (aguardando link Raw do Everton).
6. Limpar arquivos soltos na raiz do repo (zip antigo, markdown duplicado) — opcional, organização.

## Aprendizados importantes (não esquecer)
- Editar localmente (Notepad, sem git/GitHub Desktop) **não sincroniza** — sempre usar o editor web do GitHub.
- Falha silenciosa é o inimigo: qualquer lógica de sync com a nuvem precisa **checar se os dados vindos da nuvem não estão vazios** antes de sobrescrever dados locais.
- Lógica de "restaurar backup" deve sempre preferir o backup **mais completo**, não o mais recente.
- **Uploads de zip ficam desatualizados rápido.** Antes de editar qualquer arquivo, pedir o link Raw atual do GitHub e buscar (fetch) — nunca assumir que o zip enviado no início da conversa ainda reflete o estado real do arquivo.
- Depois de qualquer atividade do Lovable AI no projeto, **revisar os arquivos que a gente já corrigiu manualmente** (e vice-versa).
- Ícone de vídeo em arquivos `.ts` no Windows é só aparência (conflito de extensão) — abrir com Bloco de Notas funciona normal.

---
**Como usar este arquivo numa conta nova do Claude:**
1. Cole o link bruto: `https://raw.githubusercontent.com/evertondireito13-commits/b2beverton/main/CONTEXT.md`
2. Peça: "busca esse link e me diz que já entendeu o projeto."
3. Antes de editar qualquer arquivo específico, peça o link Raw ATUAL dele no GitHub (Abrir arquivo → "Raw" → copiar URL) — não confie em uploads de zip antigos para decidir o conteúdo a editar.

**Convenção "SALVAR":** quando o Everton escrever a palavra `SALVAR` sozinha numa mensagem, o Claude deve: (1) resumir o que foi resolvido/decidido nesta conversa desde a última atualização; (2) reescrever este arquivo CONTEXT.md inteiro, já atualizado, pronto pra ele copiar e colar no GitHub (Edit → Ctrl+A → colar → Commit changes); (3) não esperar o fim da conversa pra isso — pode e deve ser pedido a qualquer momento, assim que algo importante for concluído.
