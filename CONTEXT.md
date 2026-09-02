# CONTEXT.md — Painel Central de Prospecção (b2beverton)

> Este arquivo existe pra qualquer sessão nova do Claude (em qualquer conta) entender o projeto **sem precisar de upload de zip**. Basta colar o link bruto (raw) deste arquivo no chat e pedir pra buscar (fetch). Atualize este arquivo sempre que algo relevante mudar.

## Visão geral
- **Painel Central de Prospecção**: ferramenta de prospecção B2B para gestão de leads, histórico de empresas, follow-ups e reuniões (BHM Advogados).
- Everton é **usuário não-técnico**, sem créditos de IA restantes no Lovable — mudanças de código são feitas manualmente (Claude edita, Everton cola no GitHub via editor web).
- Stack: **Lovable (builder/deploy) + React/TanStack Start (frontend) + Supabase (backend/banco de dados)**.
- Repositório: https://github.com/evertondireito13-commits/b2beverton (branch `main`)
- Projeto conectado ao Lovable (sync automático via git — cuidado, o Lovable AI pode sobrescrever edições manuais feitas direto no GitHub).

## Fluxo de trabalho (importante)
- **Editar direto pelo GitHub (interface web)** — Edit no arquivo → alterar → Commit changes. Editar localmente (Notepad) NÃO sincroniza com o app publicado.
- Everton prefere **substituir o arquivo inteiro** (abrir, Ctrl+A, apagar, colar novo conteúdo, salvar) em vez de aplicar trechos/patches — mais fácil pra ele.
- Sempre que o Lovable AI mexer em algo por conta própria, **verificar se não sobrescreveu correções feitas manualmente no GitHub**.
- Requisito permanente: tudo precisa funcionar bem em computador, tablet e celular (responsivo) — aplicar automaticamente, sem precisar narrar isso a cada pedido.
- Everton quer feedback de usabilidade geral (fluxo, organização, redundância), não só comentários pontuais de responsividade/tamanho de botão.
- Checar proativamente as conexões entre partes do app (CNPJ↔RD↔Preparação Noturna↔Follow-up↔Painel Executivo↔Agenda) sem esperar ele apontar cada uma — regra permanente.
- Pedidos de mudança de UX/visual devem deixar explícito o que NÃO pode ser removido, com checklist de verificação pós-entrega (Everton tem receio de perder funcionalidade).
- **Convenção "SALVAR"**: quando Everton escrever `SALVAR` sozinho numa mensagem, o Claude deve (1) resumir o que foi resolvido desde a última atualização, (2) reescrever este CONTEXT.md inteiro atualizado pronto pra colar no GitHub, (3) fazer isso a qualquer momento, não só no fim da conversa.

## Estrutura relevante do repo
- `src/` — código-fonte da aplicação (React + TanStack Start).
- `supabase/` — configuração/migrations do backend.
- `.lovable/` — metadados do Lovable.
- `AGENTS.md` — regras do projeto para agentes de IA.
- Principais arquivos já trabalhados:
  - `src/components/preparacao-noturna.tsx` — tela Preparação Noturna completa (lista de empresas, EditEmpresaDialog, filtros, tipo `Empresa`, tudo num único arquivo).
  - `src/lib/cnpj-enriquecimento.functions.ts` — server function `consultarCnpj` (BrasilAPI, protegida pelo gate BHM).
  - `src/lib/lead-score.ts` — scoring/ranking de prospecção.
  - `src/lib/company-ficha.ts` — monta ficha da empresa no Painel Executivo.
  - `src/**/cloud-store.ts` — sincronização com Supabase (`hydrateFromCloud`).
  - `automatic-backup.tsx` / `data-backup.functions.ts` — backup automático (`getBestAppDataBackup`).

## Tabelas principais no Supabase
- `leads`, `historico_empresas`, `follow_ups`

## Estrutura de navegação final decidida
Prospectar / Acompanhar (Follow-up, Agenda, Painel Executivo) / Central de Reuniões / Resultados (Relatórios, Comissão, Centro de Estratégia).

## ✅ CONCLUÍDO nesta sessão: Filtros de CNPJ/UF/Setor/Regime na Preparação Noturna
Recurso pedido pelo Everton (queria um filtro parecido com uma referência visual que mandou). Já estava parcialmente feito numa sessão anterior sem créditos Lovable; **finalizado agora**:
- `consultarCnpj` (BrasilAPI) retorna UF, município, setor (CNAE) e regime (Simples/MEI quando consta).
- Tipo `Empresa` com `uf`, `setor`, `regime`; constantes `UFS_BR` e `REGIMES`.
- Barra de filtros (busca por razão social/CNPJ, status, UF, setor, regime incl. "Não informado"), `empresasFiltradas`, `limparFiltros`, botão "Enriquecer via CNPJ" (`enriquecerCnpjs`, só preenche campos vazios).
- **Feito agora**: UF/Setor/Regime adicionados ao `EditEmpresaDialog` (select UF, campo texto Setor, select Regime — mesmo padrão visual dos filtros — incluídos no `buildPatch`); badges de UF e Setor na linha da empresa (`SortableEmpresaRow`).
- Typecheck (`tsc --noEmit`) rodado e limpo, sem erros.
- Arquivo entregue completo pra Everton colar no GitHub. **Aguardando ele confirmar visualmente no preview/produção.**

## Arquitetura conhecida do app (achados recorrentes)
- Havia 3 sistemas paralelos de follow-up sem sincronia (FollowUp no banco/tela followup, LeadFollowUp no lead/drawer, FollowUpLocal calculado pro Agenda a partir do histórico) — causa raiz de vários bugs de "não reflete em outra aba". Pedidos de unificação enviados.
- Vários botões de "enviar empresa pra Pré-ligação" usavam mecanismos diferentes — corrigido com função compartilhada, CONFIRMADO aplicado.
- `scoreEmpresas()`/`rankingProspeccao()` (lead-score.ts) tinham bug: incluíam empresas já convertidas em reunião (bônus +35 indevido) e não excluíam recusas comerciais nem empresas sem histórico. Corrigido.
- Critério Quente/Morno/Frio misturava urgência de calendário com qualidade real do lead — pedido de separação enviado.
- Preparação Noturna JÁ TEM detecção automática de grupo matriz/filial (mesmo CNPJ raiz) com diálogo de escolha de unidade ao enviar pra Pré-ligação — implementado.
- Drag-and-drop: SIM no kanban da Central de Reuniões e na Preparação Noturna; NÃO na fila de Follow-up, Ranking do Painel Executivo, nem menu lateral.

## Itens concluídos e confirmados (não precisa retrabalhar)
- Unificação/reorganização geral do CRM (drawer de empresa, navegação em grupos, visual profissional) — concluído.
- Responsividade geral (tabelas viram cards, toque 40px, sem scroll horizontal) — concluído.
- Botão "Ligar" do Ranking e ficha de empresa carregando dados na Pré-ligação — confirmado aplicado.
- Sync Pós-ligação → Preparação Noturna (`markPreparacaoRealizadaByCompany`) já existe.
- Filtros CNPJ/UF/Setor/Regime na Preparação Noturna (ver seção acima) — completo, aguardando confirmação visual.

## Pendente / em andamento
- Correção do Ranking (lead-score.ts usando `followUp?.scheduled_at` como fonte única de "follow-up vencido" em vez de regex de texto) — arquivo pronto, **aguardando Everton aplicar e dar git push**.
- Bug reportado: empresas somem da Preparação Noturna ao atualizar a página — ainda não investigado.
- Dashboard de Volume: trocar regex de texto por `Lead.data_reuniao` real; adicionar série de follow-ups; menos texto corrido, mais visual.
- Barra lateral global reduzida (só nav + card Follow-ups; remover Volume do Dia, Notificações quebrada, CallTimerWidget, placeholder de e-mail).
- WhatsApp "Contato rápido" — Everton precisa testar de novo pra dizer se o botão trava sem telefone (pedido de remoção da Pós-ligação já enviado).
- Ficha da empresa (Painel Executivo) deve preencher telefone/e-mail vazios com dados já cadastrados na Preparação Noturna, somando (não substituindo) com o que veio da ligação — pedido enviado.
- Central de Reuniões: esconder "Simulador E2E" em produção, permitir excluir lead de teste, novo status "pausado" com data de retomada, reduzir controles empilhados no topo — pedido enviado.
- Central de Reuniões com duplicação de cards (causa suspeita: `hydrateFromMeetings()` sem match confiável por CNPJ) — botão "Mesclar duplicados" existe (canto direito da fileira de filtros, estilo discreto) mas usuário não achava; pedido de destaque visual enviado; pedido de correção da causa raiz (hydrateFromMeetings conservador) também enviado.
- Métricas de funil (conversão ligação→decisor→reunião→fechamento) e testes automatizados (Vitest cobrindo lead-score.ts/leads-store.ts/historico-store.ts/follow-ups.functions.ts/resultado-reuniao.functions.ts) — priorizados, pedidos enviados.
- Itens de menor prioridade sem ordem definida: cadência, LGPD, confiança nos dados de IA, log de auditoria, offline.

## Projeto "Resultado da reunião" — desenhado, pedido formalizado e enviado
Mapeamento de 11 resultados possíveis de uma reunião (aceite imediato, recusa, aprovação pendente, timing inadequado, reagendamento, no-show, sem poder de decisão, desqualificação técnica, fechamento direto, pivô pra parceria, mudança de escopo), cada um com sua consequência de status/campo. Ação universal "Enviar ata" (gerada fora do app via Gemine, só marcar "ata enviada"). UI: diálogo único "Registrar resultado da reunião" com anotação obrigatória.
- Novos campos pedidos: status "pausado" (pausado_ate opcional, pausado_motivo[], fase_antes_pausa), "nao_qualificado" (separado de perdido nas métricas), tipo_negociacao (cliente_direto/parceria_operacional), area_negociacao (tributario/reestruturacao_financeira), fechamento_direto (bool), no_show_count.
- Funil pós-reunião confirmado: Resgate é tag dentro de "Reunião Agendada" (não coluna própria); Follow-up interno = LeadFollowUp já separado do frio; Levantamento de Docs confirmado. Ata manual (campo `ata_executiva` já existe), sem integração automática Gmail/Drive por enquanto.
- Nova aba "Comunicações" (ata/e-mails/whatsapp num só lugar) e card do lead reestruturado em formato progressivo/wizard — pedido enviado.
- Complementos pedidos: (1) Follow-up interno da Central de Reuniões deve reaproveitar a timeline rica já usada no Follow-up frio (company-ficha.ts/company-timeline-sheet.tsx); (2) diálogo de resultado deve aceitar texto livre com IA sugerindo qual das 11 opções se aplica (mesmo padrão do extractFollowUpFromCall).
- Próximo passo: Everton ainda vai mandar a parte "pós-reunião" (o que acontece depois que a reunião já rolou) como pedido separado.

## Aprendizados importantes (não esquecer)
- Editar localmente **não sincroniza** — sempre usar o editor web do GitHub.
- Falha silenciosa é o inimigo: lógica de sync com a nuvem precisa checar se os dados vindos da nuvem não estão vazios antes de sobrescrever dados locais.
- Lógica de "restaurar backup" deve preferir o backup **mais completo**, não o mais recente.
- Depois de qualquer atividade do Lovable AI no projeto, revisar os arquivos já corrigidos manualmente.

## Pendências antigas ainda não confirmadas (Supabase/cloud-store)
1. Confirmar se a correção do `cloud-store.ts` (hydrateFromCloud não sobrescrever com dados vazios) sobreviveu às edições do Lovable AI.
2. Configurar `SUPABASE_SERVICE_ROLE_KEY` no projeto Supabase correto (backend apontava pra projeto novo/vazio).
3. Repopular/confirmar dados nas tabelas `leads`, `historico_empresas`, `follow_ups`.
4. Verificar se o Painel Executivo volta a mostrar registros depois que o cache/localStorage for restaurado corretamente.
5. Limpar arquivos soltos na raiz do repo (zip antigo, markdown duplicado) — opcional, organização.

---
**Como usar este arquivo numa conta nova do Claude:**
1. Cole o link bruto: `https://raw.githubusercontent.com/evertondireito13-commits/b2beverton/main/CONTEXT.md`
2. Peça: "busca esse link e me diz que já entendeu o projeto."
3. Só peça upload de arquivo específico (não o zip inteiro) se for mexer em algo pontual daquele arquivo.
