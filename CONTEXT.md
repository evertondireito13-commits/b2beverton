[CONTEXT.md](https://github.com/user-attachments/files/31795747/CONTEXT.md)
# CONTEXT.md — Painel Central de Prospecção (b2beverton)

> Este arquivo existe pra qualquer sessão nova do Claude (em qualquer conta) entender o projeto **sem precisar de upload de zip**. Basta colar o link bruto (raw) deste arquivo no chat e pedir pra buscar (fetch). Atualize este arquivo sempre que algo relevante mudar.

## Visão geral
- **Painel Central de Prospecção**: ferramenta de prospecção B2B para gestão de leads, histórico de empresas, follow-ups e reuniões.
- Everton é **usuário não-técnico**, sem créditos de IA restantes no Lovable — mudanças de código precisam ser feitas manualmente.
- Stack: **Lovable (builder/deploy) + React/TanStack (frontend) + Supabase via Lovable Cloud (backend/banco de dados)**.
- Repositório: https://github.com/evertondireito13-commits/b2beverton
- Projeto conectado ao Lovable (sync automático via git — cuidado, o Lovable AI pode sobrescrever edições manuais feitas direto no GitHub).

## Fluxo de edição de código (importante)
- **Editar direto pelo GitHub (interface web)** — abrir arquivo → ícone de lápis (Edit) → Ctrl+A → Delete → colar → Commit changes direto na `main`.
- **Editar localmente (ex: Notepad, Git Bash) NÃO é usado** — Everton não usa Git local, só o editor web do GitHub. O Lovable sincroniza sozinho a partir da `main`.
- Sempre que o Lovable AI mexer em algo por conta própria, **verificar se não sobrescreveu correções feitas manualmente no GitHub**.
- Acesso ao banco: aba **Cloud** do próprio Lovable → SQL editor (não é o supabase.com externo, é integrado).

## Estrutura relevante do repo
- `src/lib/cloud-store.ts` — sincronização com a nuvem (`hydrateFromCloud`).
- `src/lib/cnpj-raw-parser.ts` — parser determinístico (`parseDadosCnpj`) do texto colado em "Dados Brutos".
- `src/lib/cnpj-enriquecimento.functions.ts` — server function que consulta a BrasilAPI (botão "Enriquecer via CNPJ").
- `src/components/preparacao-noturna.tsx` — tela principal de cadastro/edição de empresas, cadastro novo, botão Enriquecer, modal de edição.
- `src/components/leads-central-panel.tsx` — Central de Reuniões (cards, botão excluir).
- `src/**/automatic-backup.tsx`, `data-backup.functions.ts` — backup automático (`getBestAppDataBackup`).
- `src/**/painel-executivo.tsx`, `lead-score.ts` — dashboard executivo e score de leads.

## Tabelas principais no Supabase (via Lovable Cloud)
- `leads`
- `historico_empresas`
- `follow_ups`

## Duas fontes de dados de empresa — nunca podem se misturar
1. **"Dados Brutos" (colar texto)** → roda `parseDadosCnpj` (`cnpj-raw-parser.ts`). Extrai a partir do texto que Everton cola (formato tipo Casa dos Dados/CNPJ.biz): Razão Social, CNPJ, Telefone, E-mail, Contato (1º sócio/administrador), Cargo, Observações (CNAE principal + Endereço + Capital social), e agora também **UF, Setor e Regime tributário**.
2. **Botão "Enriquecer via CNPJ"** → chama a BrasilAPI (`cnpj-enriquecimento.functions.ts`). Preenche UF, Setor, Regime, Telefone, E-mail e joga o restante (situação cadastral, natureza jurídica, porte, data de abertura, capital social, endereço, sócios) em Observações **só se Observações estiver vazio**.
- **Regra de ouro em ambos**: nunca sobrescrever campo que já tem valor — só preencher o que está vazio.

## Problemas identificados e correções feitas

### 1. Perda de dados via `hydrateFromCloud` (cloud-store.ts) — CORRIGIDO e validado
- Causa raiz: sobrescrevia localStorage com dados vazios da nuvem (pós-transferência de conta com Supabase vazio).
- Correção: merge por ID (local + nuvem), com re-sync de itens locais que não estavam na nuvem.
- Validado: 5 empresas em "Reunião Agendada" sobrevivem a F5/refresh.

### 2. Restauração de backup errada (automatic-backup.tsx) — CORRIGIDO
- Trocado "backup mais recente" por "backup com mais registros" via `getBestAppDataBackup`.

### 3. Parser de Dados Brutos não extraía UF/Setor/Regime — CORRIGIDO nesta sessão
- **Sintoma**: colar o texto bruto de uma empresa (ex.: HEZUS LTDA) preenchia Telefone/E-mail/Observações, mas UF, Setor e Regime tributário ficavam vazios — só o botão "Enriquecer via CNPJ" preenchia esses três.
- **Causa raiz**: `parseDadosCnpj` nunca teve lógica pra extrair esses três campos do texto colado — não era bug, era ausência de funcionalidade.
- **Correção**: adicionada extração de UF (a partir da linha de endereço, validada contra a lista oficial de UFs), Setor (descrição do CNAE principal — mesma fonte que o botão Enriquecer usa) e Regime (busca no texto por "Simples Nacional", "MEI", "Lucro Presumido", "Lucro Real").
- **Validado**: rodando o parser de verdade (`npx tsx`) contra o texto real da HEZUS LTDA → saiu `uf: "PR"`, `setor: "Treinamento em desenvolvimento profissional e gerencial"`, `regime: "Simples Nacional"`, sem alterar nenhum campo que já funcionava.
- **Proteção adicional**: no cadastro, se o CNPJ colado já existe (mesma unidade), a fusão de dados agora preserva UF/Setor/Regime já existentes — não sobrescreve mais.

### 4. Modal de edição não reprocessava "Dados Brutos" ao colar texto novo — CORRIGIDO nesta sessão
- **Sintoma**: ao abrir uma empresa já cadastrada e colar um texto novo no campo "Dados Brutos", nada era preenchido automaticamente (Telefone, E-mail, Contato, Cargo, Razão Social, Observações, UF, Setor, Regime).
- **Causa raiz**: o `onChange` do textarea só salvava o texto puro (`setTextoBruto`), nunca rodava `parseDadosCnpj` de novo. A extração só acontecia uma vez, ao abrir o modal, usando o texto que já estava salvo no banco.
- **Correção**: criada `handleTextoBrutoChange`, que roda `parseDadosCnpj` a cada edição do campo e preenche **somente os campos que estiverem vazios no momento** — nunca sobrescreve o que já foi preenchido manualmente ou via Enriquecer.

### 5. Botão "Enriquecer via CNPJ" ampliado (sessão anterior a esta)
- Antes só buscava UF, Setor, Regime. Agora também busca Telefone, E-mail, situação cadastral, natureza jurídica, porte, data de abertura, capital social, endereço e sócios — o que não tem campo próprio no cadastro cai em Observações (só se Observações estiver vazio).

### 6. Supabase mal configurado — AINDA PENDENTE
- Falta confirmar a `SUPABASE_SERVICE_ROLE_KEY` no projeto Lovable Cloud correto.

## Pendências abertas (resumo)
1. **HTTP 429 no "Enriquecer via CNPJ"**: BrasilAPI retornou rate limit ("Consulta falhou (HTTP 429)") numa tentativa recente — falta implementar delay/retry com backoff entre chamadas. Ainda não corrigido.
2. Adicionar empresa manualmente na Central de Reuniões (delete já existe, add está pendente).
3. Configurar `SUPABASE_SERVICE_ROLE_KEY`.
4. Novos módulos com tabela criada mas sem função/tela: Mural de Atualizações, Biblioteca de Conteúdos, Passagem de Bastão.
5. Confirmar se a correção do `cloud-store.ts` sobreviveu a edições do Lovable AI por conta própria.
6. Limpeza de arquivos soltos na raiz do repo (opcional).

## Aprendizados importantes (não esquecer)
- Editar localmente **não sincroniza** — sempre usar o editor web do GitHub.
- Falha silenciosa é o inimigo: qualquer sync com a nuvem precisa checar se os dados vindos de lá não estão vazios antes de sobrescrever local.
- Backup deve preferir o **mais completo**, não o mais recente.
- As duas fontes de enriquecimento (Dados Brutos colados vs. botão Enriquecer via CNPJ) devem continuar **isoladas uma da outra** e sempre respeitar "só preenche vazio, nunca sobrescreve".
- Antes de entregar qualquer correção de parser/extração, **testar rodando o código de verdade** (`npx tsx` a partir da raiz do repo, clonado via `git clone --depth 1`) contra um texto real do usuário — não vale confiar só em leitura de código.
- Everton identifica bugs com precisão e costuma estar certo quando diz que algo não está batendo — levar a sério imediatamente.
- Todo arquivo entregue é **substituição completa**, nunca diff/trecho parcial.

---
**Como usar este arquivo numa conta nova do Claude:**
1. Cole o link bruto: `https://raw.githubusercontent.com/evertondireito13-commits/b2beverton/main/CONTEXT.md`
2. Peça: "busca esse link e me diz que já entendeu o projeto."
3. Só peça upload de arquivo específico (não o zip inteiro) se for mexer em algo pontual daquele arquivo — ou, melhor, clone o repo direto (`git clone --depth 1 https://github.com/evertondireito13-commits/b2beverton.git`) pra ler os arquivos com certeza de que estão atualizados.

**Convenção "SALVAR":** quando o Everton escrever a palavra `SALVAR` sozinha numa mensagem, o Claude deve: (1) resumir o que foi resolvido/decidido nesta conversa desde a última atualização; (2) reescrever este arquivo CONTEXT.md inteiro, já atualizado, pronto pra ele copiar e colar no GitHub (Edit → Ctrl+A → colar → Commit changes); (3) não esperar o fim da conversa pra isso — pode e deve ser pedido a qualquer momento, assim que algo importante for concluído.
