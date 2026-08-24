# Correção: botão "Ligar" do Painel Executivo não leva dados nem histórico

## O que está acontecendo

No fluxo do Follow-up ("acompanhar follow-up → iniciar ligação"), a ação faz três coisas antes de navegar:

1. define a empresa ativa (razão social + CNPJ);
2. grava um contexto para a **Pós-ligação** (`bhm.pending-pos-context`), que é o que faz a tela de pós-ligação abrir já preparada com o nome da empresa e o contato;
3. grava um pacote completo para a **Pré-ligação**, buscando os dados brutos já cadastrados na Preparação Noturna (`findPreparationForCompany`) — nome, texto bruto da empresa e o id da preparação.

O botão "Ligar" do ranking do Painel Executivo grava só um pacote mínimo: nome, CNPJ, contato e cargo, com telefone, e-mail e observações vazios, e **não grava nada para a Pós-ligação**. Por isso a empresa chega "seca" na tela de ligação e a pós-ligação não sabe de qual empresa se trata.

O mesmo pacote incompleto é usado no botão "Ligar" da linha do tempo (drawer 360°) e no "Chamar na Pré-ligação" da ficha de empresa.

## O que será feito

Criar uma função única de "abrir ligação para esta empresa" e usá-la nos três pontos, replicando exatamente o comportamento do Follow-up:

- monta o pacote com **todos** os dados disponíveis da empresa: razão social, CNPJ, contato, cargo, telefone e e-mail extraídos da ficha/histórico, próxima ação e sugestão como observações;
- anexa o **texto bruto e o id da preparação** quando a empresa já existe na Preparação Noturna (mesma busca que o Follow-up usa), para que o campo "Dados da empresa" venha preenchido;
- grava também o contexto da **Pós-ligação**, para que a tela de pós-ligação abra já vinculada à empresa (nome, CNPJ, contato);
- define a empresa ativa e navega para a aba Pré-ligação.

Resultado: clicar em "Ligar" no ranking passa a se comportar igual ao caso da Rezza vindo do Follow-up — dados cadastrais preenchidos, histórico da empresa disponível na tela e pós-ligação já amarrada à empresa certa.

## Detalhes técnicos

- Novo módulo `src/lib/pre-ligacao-handoff.ts` com `iniciarLigacaoParaEmpresa({ empresa, cnpj, contato, cargo, telefone, email, observacoes, followUpId? })`:
  - resolve a ficha via `fichaDaEmpresa()` para completar telefone/e-mail/contato/cargo quando não vierem preenchidos;
  - chama `findPreparationForCompany(cnpj, empresa)` e mescla `textoBruto` + `preparationId` no payload;
  - escreve `PENDING_PRE_LIGACAO_KEY` e `bhm.pending-pos-context`;
  - chama `setActiveLead(...)`.
- Consumidores atualizados para usar o helper (e receber a função `navigate` de quem chama):
  - `src/components/painel-executivo.tsx` (botão "Ligar" do ranking);
  - `src/components/company-timeline-sheet.tsx` ("Registrar nova ligação");
  - `src/components/empresa-ficha.tsx` ("📞 Chamar na Pré-ligação").
- `src/components/followup/use-follow-up-actions.ts` passa a usar o mesmo helper, para que os dois fluxos não voltem a divergir. Nenhuma mudança de formato dos payloads já consumidos por `pre-ligacao.tsx` e `pos-ligacao.tsx`.
