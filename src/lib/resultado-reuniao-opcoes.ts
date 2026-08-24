// Catálogo das 11 opções de desfecho de reunião.
// Compartilhado entre a UI (resultado-reuniao-dialog.tsx) e a classificação
// por IA (resultado-reuniao.functions.ts) para não duplicar a lista.

export type ResultadoId =
  | "aceite_imediato"
  | "recusa_imediata"
  | "aprovacao_pendente"
  | "timing_inadequado"
  | "reagendamento"
  | "no_show"
  | "sem_poder_decisao"
  | "desqualificacao"
  | "fechamento_direto"
  | "parceria_operacional"
  | "mudanca_escopo";

export type OpcaoResultado = {
  id: ResultadoId;
  rotulo: string;
  descricao: string;
};

export const OPCOES_RESULTADO: OpcaoResultado[] = [
  {
    id: "aceite_imediato",
    rotulo: "✅ Aceite imediato",
    descricao: "Cliente topou seguir — vai para Levantamento de Docs.",
  },
  {
    id: "recusa_imediata",
    rotulo: "❌ Recusa imediata",
    descricao: "Não quer seguir. Arquiva como perdido com o motivo da anotação.",
  },
  {
    id: "aprovacao_pendente",
    rotulo: "🕒 Aprovação pendente / submeter a terceiros",
    descricao: "Vai ser avaliado por sócios, contabilidade ou jurídico. Pausa a negociação.",
  },
  {
    id: "timing_inadequado",
    rotulo: "📆 Timing inadequado",
    descricao: "Momento ruim. Pausa com data de retomada (opcional).",
  },
  {
    id: "reagendamento",
    rotulo: "🔁 Reagendamento com aviso",
    descricao: "Avisou antes. Mantém a fase e só atualiza a data da reunião.",
  },
  {
    id: "no_show",
    rotulo: "👻 Não comparecimento (no-show)",
    descricao: "Não apareceu nem avisou. Mantém a fase e conta o no-show.",
  },
  {
    id: "sem_poder_decisao",
    rotulo: "🙋 Pessoa sem poder de decisão",
    descricao: "Só marca na timeline. Nenhuma mudança de fase é forçada.",
  },
  {
    id: "desqualificacao",
    rotulo: "🚫 Desqualificação técnica",
    descricao: "Sem fit (não é Lucro Real, porte, janela de 5 anos…). Não é recusa comercial.",
  },
  {
    id: "fechamento_direto",
    rotulo: "🏆 Fechamento direto na reunião",
    descricao: "Fechou na hora, sem passar pelo funil completo.",
  },
  {
    id: "parceria_operacional",
    rotulo: "🤝 Pivotar para parceria operacional",
    descricao: "Muda o tipo de negociação para parceria. Mantém a fase.",
  },
  {
    id: "mudanca_escopo",
    rotulo: "📉 Mudança de escopo",
    descricao: "Vira reestruturação financeira — a coleta passa a pedir Balanços/DRE.",
  },
];

export const RESULTADO_IDS = OPCOES_RESULTADO.map((o) => o.id) as [ResultadoId, ...ResultadoId[]];

export function catalogoParaPrompt(): string {
  return OPCOES_RESULTADO.map((o) => `- ${o.id}: ${o.rotulo} — ${o.descricao}`).join("\n");
}
