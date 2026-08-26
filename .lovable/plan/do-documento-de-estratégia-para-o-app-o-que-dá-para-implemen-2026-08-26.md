# Do documento de estratégia para o app: o que dá para implementar

Seu texto descreve um sistema de gestão da informação. O app hoje já cobre a execução (pré/pós-ligação, histórico, follow-up, reuniões, painel, relatórios), mas **não tem** três coisas centrais do documento: uma biblioteca pesquisável de abordagem, um mural de atualizações com prioridade P0–P4 e uma passagem de bastão estruturada. É aí que está o maior ganho.

Proposta em 4 entregas, na ordem de impacto.

## 1. Biblioteca "Como abordar" (resolve: tempo procurando a frase certa)

Nova página com busca instantânea e filtros por segmento industrial, cargo do contato, etapa da conversa, objeção e NCM/insumo.

- Três tipos de card: **Script**, **Objeção** (objeção → resposta recomendada → pergunta de avanço → quando não usar) e **Nota fiscal/técnica** (NCM, insumo, critério, impacto na prospecção).
- Versionamento simples: cada card guarda versão, data de vigência e responsável pela aprovação; versões antigas ficam arquivadas, não apagadas.
- Botão "copiar frase" e "usar na ligação" que joga o conteúdo direto no painel da Pré-ligação.
- Registro de buscas sem resultado, para expor lacunas de conteúdo.

## 2. Mural de Atualizações com prioridade (resolve: ruído e duplicidade)

Novo módulo onde toda comunicação oficial é publicada no formato do seu template: o que mudou, quem age, ação esperada, prazo, impacto, fonte, versão.

- Etiqueta obrigatória de prioridade **P0 crítica / P1 alta / P2 operacional / P3 base de conhecimento / P4 arquivo** e de categoria (Leads e contas, Inteligência fiscal, Execução, Desempenho, Gestão).
- Assistente de classificação com a sua matriz de pontuação (impacto em receita, urgência, risco, pessoas impactadas, reversibilidade) sugerindo a prioridade automaticamente.
- Status por item: novo, lido, aplicado, arquivado — o que gera a taxa de leitura.
- Só P0 aparece como alerta interruptivo; P1/P2 entram no resumo diário; P3/P4 ficam só na biblioteca.
- Botão "gerar mensagem de WhatsApp" que produz o texto curto no padrão *ação + responsável + prazo + link oficial*, para o canal virar só alerta.

## 3. Passagem de bastão estruturada (resolve: ruído na transferência)

Formulário obrigatório a partir de qualquer empresa/lead, com os campos do seu template (empresa, CNPJ, segmento, contato e cargo, canal, resumo, dor, objeção, nível de interesse, contexto fiscal, próxima ação, responsável, prazo, pendências).

- Bloqueia envio com campos essenciais vazios e marca o lead como "bastão pendente" até ser aceito.
- Ações de **aceitar** ou **devolver com motivo** — o que alimenta os indicadores de qualidade.
- Lista de pendências de bastão entra no Painel "Hoje" e no resumo diário.

## 4. Painel "Hoje" e Resumos diário/semanal (resolve: foco e sobrecarga)

- Reorganizar a home num painel "Hoje" enxuto: no máximo **3 prioridades do dia**, leads quentes, follow-ups vencendo, alertas P0 ativos, script/segmento em foco e pendências de bastão. Nada além disso na primeira dobra.
- Botão **Gerar resumo diário** que monta automaticamente as 7 seções do seu modelo a partir dos dados já existentes (ligações, contatos efetivos, decisores, reuniões, objeções do dia, registros incompletos) e deixa o texto pronto para copiar.
- **Resumo semanal** analítico: resultado x meta, objeções recorrentes com frequência, segmentos mais receptivos, aprendizados e decisões da próxima semana.
- Modo **Bloco de foco**: durante o bloco de ligações a interface esconde tudo que não seja fila, script, objeções e registro; só P0 rompe o bloco.

## Indicadores (fase final)

Painel de efetividade com o que o próprio app consegue medir sem trabalho manual: tempo médio até o registro pós-contato, follow-ups no prazo, taxa de leitura de resumos e de P0, buscas sem resultado, percentual de registros completos, bastões devolvidos e conversão contato efetivo → reunião. Mais uma pesquisa quinzenal de sobrecarga (1 a 5) dentro do app.

## Notas técnicas

- Novas tabelas no backend: `conteudos_biblioteca` (+ histórico de versões), `atualizacoes` e `atualizacoes_leituras`, `passagens_bastao`, `pesquisa_sobrecarga`. Todas seguindo o padrão atual do projeto (acesso via server functions com chave de serviço, RLS deny-by-default como nas demais tabelas).
- Novas rotas: `/biblioteca`, `/atualizacoes`, `/bastao`; painel "Hoje" reaproveitando `PainelExecutivo` e o resumo diário estendendo os componentes de relatório já existentes.
- Geração dos resumos e classificação por matriz de pontuação usando o gateway de IA já configurado no projeto.
- Busca da biblioteca client-side sobre o cache local, no mesmo modelo de hidratação usado hoje (`cloud-store`), para funcionar rápido e offline.

## Sugestão de ordem

Entrega 1 e 2 primeiro (são as que mais reduzem sobrecarga), depois 3, depois 4 e os indicadores.
