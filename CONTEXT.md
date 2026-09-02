# CONTEXT.md — Painel Central de Prospecção (b2beverton)

> Este arquivo existe pra qualquer sessão nova do Claude (em qualquer conta) entender o projeto **sem precisar de upload de zip**. Basta colar o link bruto (raw) deste arquivo no chat e pedir pra buscar (fetch). Atualize este arquivo sempre que algo relevante mudar.

## Visão geral
- **Painel Central de Prospecção**: ferramenta de prospecção B2B para gestão de leads, histórico de empresas, follow-ups e reuniões.
- Everton é **usuário não-técnico**, sem créditos de IA restantes no Lovable — mudanças de código precisam ser feitas manualmente.
- Stack: **Lovable (builder/deploy) + React/TanStack (frontend) + Supabase (backend/banco de dados)**.
- Repositório: https://github.com/evertondireito13-commits/b2beverton
- Projeto conectado ao Lovable (sync automático via git — cuidado, o Lovable AI pode sobrescrever edições manuais feitas direto no GitHub).

## Fluxo de edição de código (importante)
- **Editar direto pelo GitHub (interface web)** — Edit no arquivo → alterar → Commit changes.
- **Editar localmente (ex: Notepad) NÃO funciona** — não sincroniza com o app publicado. Já causou confusão antes.
- Sempre que o Lovable AI mexer em algo por conta própria, **verificar se não sobrescreveu correções feitas manualmente no GitHub**.

## Estrutura relevante do repo
- `src/` — código-fonte da aplicação.
- `supabase/` — configuração/migrations do backend.
- `.lovable/` — metadados do Lovable.
- `AGENTS.md` — regras do projeto para agentes de IA.
- `README.md`, `panorama-central-prospeccao (2).md` — documentação existente no repo.
- Principais arquivos já trabalhados nesta sessão:
  - `src/**/cloud-store.ts` (ou caminho equivalente) — lógica de sincronização com o Supabase (`hydrateFromCloud`).
  - `automatic-backup.tsx` — lógica de restauração automática de backup.
  - `data-backup.functions.ts` — funções de backup (`getBestAppDataBackup`).

## Tabelas principais no Supabase
- `leads`
- `historico_empresas`
- `follow_ups`

## Problemas identificados e correções feitas

### 1. Perda de dados via `hydrateFromCloud` (cloud-store.ts) — CORRIGIDO, mas verificar
- **Causa raiz**: `hydrateFromCloud` sobrescrevia silenciosamente o localStorage com dados vazios vindos da nuvem, quando o Supabase estava vazio/mal configurado — isso gerou sustos de perda de dados.
- **Status**: correção commitada via GitHub web editor. **Pendência**: o Lovable AI modificou esse arquivo depois, por conta própria — precisa verificar se a correção de segurança não foi sobrescrita.

### 2. Restauração de backup errada (automatic-backup.tsx) — CORRIGIDO
- **Causa raiz**: o sistema sempre restaurava o **backup mais recente**, não o **backup com mais registros** — ou seja, um backup vazio (pós-perda de dados) podia ser restaurado por cima de um backup bom.
- **Correção**: criada a função `getBestAppDataBackup` em `data-backup.functions.ts`, que escolhe o backup com mais registros em vez do mais recente.

### 3. Supabase mal configurado
- O backend do Lovable Cloud está apontando pra um **projeto Supabase novo e vazio**, faltando a variável `SUPABASE_SERVICE_ROLE_KEY` — isso causa falhas de build e deixa as tabelas principais (`leads`, `historico_empresas`, `follow_ups`) vazias na nuvem.
- **Pendência em aberto**: configurar a `SUPABASE_SERVICE_ROLE_KEY` corretamente e confirmar que o projeto Supabase certo está conectado.

### 4. Painel Executivo mostrando 0 registros
- Depende de um cache em `localStorage` que foi apagado (relacionado ao problema #1).
- **Follow-ups (fila)** e **Central de Reuniões** continuam funcionando normalmente, pois leem direto das tabelas na nuvem (não dependem do cache local).

## Pendências abertas (resumo)
1. Confirmar se a correção do `cloud-store.ts` sobreviveu às edições do Lovable AI.
2. Configurar `SUPABASE_SERVICE_ROLE_KEY` no projeto Supabase correto.
3. Repopular/confirmar dados nas tabelas `leads`, `historico_empresas`, `follow_ups`.
4. Verificar se o Painel Executivo volta a mostrar registros depois que o cache/local storage for restaurado corretamente.
5. Limpar arquivos soltos na raiz do repo (zip antigo, markdown duplicado) — opcional, organização.

## Aprendizados importantes (não esquecer)
- Editar localmente **não sincroniza** — sempre usar o editor web do GitHub.
- Falha silenciosa é o inimigo aqui: qualquer lógica de sync com a nuvem precisa **checar se os dados vindos da nuvem não estão vazios** antes de sobrescrever dados locais.
- Lógica de "restaurar backup" deve sempre preferir o backup **mais completo**, não o mais recente.
- Depois de qualquer atividade do Lovable AI no projeto, **revisar os arquivos que a gente já corrigiu manualmente**.

---
**Como usar este arquivo numa conta nova do Claude:**
1. Cole o link bruto: `https://raw.githubusercontent.com/evertondireito13-commits/b2beverton/main/CONTEXT.md`
2. Peça: "busca esse link e me diz que já entendeu o projeto."
3. Só peça upload de arquivo específico (não o zip inteiro) se for mexer em algo pontual daquele arquivo.

**Convenção "SALVAR":** quando o Everton escrever a palavra `SALVAR` sozinha numa mensagem, o Claude deve: (1) resumir o que foi resolvido/decidido nesta conversa desde a última atualização; (2) reescrever este arquivo CONTEXT.md inteiro, já atualizado, pronto pra ele copiar e colar no GitHub (Edit → Ctrl+A → colar → Commit changes); (3) não esperar o fim da conversa pra isso — pode e deve ser pedido a qualquer momento, assim que algo importante for concluído.
