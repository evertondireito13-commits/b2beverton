# Filtros na Preparação Noturna (estilo Balcão de Negócios)

## Objetivo

Adicionar uma barra de filtros na Preparação Noturna, inspirada na imagem de referência: busca por razão social/CNPJ + filtros de status, UF, setor e regime tributário, com contador de empresas filtradas.

## O que será feito

### 1. Novos campos na empresa da preparação

Estender o tipo `Empresa` em `src/components/preparacao-noturna.tsx` com:

- `uf?: string` (ex.: "PR")
- `setor?: string` (ex.: "Metalurgia")
- `regime?: string` ("Simples Nacional" | "Lucro Presumido" | "Lucro Real" | "MEI" etc.)

Campos opcionais — empresas antigas continuam funcionando sem eles.

### 2. Barra de filtros (visual inspirado na imagem)

Barra acima da lista de empresas do dia/pastas com:

- Caixa de busca: filtra por razão social ou CNPJ (com/sem pontuação).
- Dropdown **Status**: Todas / Pendentes / Realizadas / Sem interesse.
- Dropdown **UF**: montado dinamicamente com as UFs presentes na lista.
- Dropdown **Setor**: idem, com os setores cadastrados.
- Dropdown **Regime**: Todas / Simples / Presumido / Real / Não informado.
- Contador "X empresa(s)" ao lado, atualizando conforme o filtro.
- Botão "Limpar filtros".

Os filtros valem para a lista do dia e, quando uma pasta estiver aberta, para o conteúdo da pasta.

### 3. Enriquecimento automático via CNPJ

- Botão **"Enriquecer via CNPJ"** na barra de filtros (e ícone por empresa sem UF): consulta API pública de CNPJ (BrasilAPI) via server function para evitar CORS, e preenche `uf`, `setor` (a partir do CNAE principal) e `regime` quando disponível.
- Só preenche campos vazios — nunca sobrescreve o que você digitou manualmente.
- Feedback de progresso (ex.: "12/34 empresas enriquecidas") e aviso para CNPJs inválidos/não encontrados.

### 4. Edição manual

- Na edição de cada empresa da preparação, adicionar os 3 campos (UF com dropdown de estados, setor texto livre, regime dropdown) para preencher/corrigir manualmente.

## Detalhes técnicos

- Persistência: os novos campos entram no mesmo payload já salvo (localStorage + backup em nuvem via `app_data_backups`) — **nenhuma migração de banco necessária**.
- Nova server function `consultarCnpj` (ex.: `src/lib/cnpj-enriquecimento.functions.ts`) fazendo fetch na BrasilAPI (`/cnpj/v1/{cnpj}`) com o gate `BHM_GATE_KEY` já existente; mapeia `uf`, `cnae_fiscal_descricao` → setor e `opcao_pelo_simples`/`porte` → regime aproximado.
- Parsing do texto bruto: ao extrair empresa do texto, tentar capturar UF de endereço quando presente (melhoria simples no parser existente).
- Filtros implementados com `useMemo` sobre a lista já existente; normalização de CNPJ removendo pontuação para a busca.
- Verificação: typecheck (`tsgo`) + teste visual com Playwright aplicando cada filtro.

## Fora do escopo

- Importação de Excel (a imagem mostra, mas a preparação já tem colagem de texto em lote; posso adicionar depois se quiser).
- Cores verde/amarelo de disponibilidade do Balcão (lá é outro conceito — "em atendimento por outro consultor").
