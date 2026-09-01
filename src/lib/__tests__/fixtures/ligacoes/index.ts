// Exemplos reais de ligações (anonimizados) usados nos testes do extrator de
// follow-up. Para adicionar um caso: cole a transcrição e liste o que a
// observação DEVE conter e o que ela NUNCA pode conter.

export type LigacaoFixture = {
  id: string;
  descricao: string;
  transcricao: string;
  historico?: string;
  empresaFallback?: string;
  /** Observação problemática já produzida pela IA (regressão conhecida). */
  notesRuins?: string;
  contactPersonRuim?: string | null;
  /** Regex que NÃO podem casar com a observação final. */
  naoPodeConter: RegExp[];
  /** Trechos que devem sobreviver ao saneamento. */
  deveConter?: (string | RegExp)[];
};

export const LIGACOES: LigacaoFixture[] = [
  {
    id: "samuel-daniele-email-informado",
    descricao:
      "Recepção informa e-mail para contato com a Daniele; nada foi enviado ainda e nenhum cargo foi confirmado.",
    transcricao: `Bom dia, você fala com o Everton, tudo bem? Tá conseguindo me ouvir?
— Alô, bom dia, com quem eu falo?
— Everton, da BHM Advogados. Eu queria falar com quem cuida da parte tributária aí.
— Ah, então, isso aí quem vê é a Daniele.
— Perfeito. Consigo falar com ela agora?
— Agora ela não está. Manda um e-mail que ela olha.
— Qual e-mail?
— 3m@mmm.com.
— Anotado, obrigado. Meu nome é Everton, eu retorno depois.`,
    empresaFallback: "3M INDUSTRIA LTDA",
    notesRuins:
      "Samuel forneceu o e-mail 3m@mmm.com para contato com Daniele do fiscal da BHN Advogados sobre área tributária. E-mail enviado para o endereço indicado para a Daniele.",
    contactPersonRuim: "Daniele (deduzido)",
    naoPodeConter: [
      /e-?mail\s+enviado/i,
      /\bBHN\b/,
      /Daniele\s+d[oa]\s+fiscal/i,
      /\(deduzido\)/i,
      /Daniele\s+d[ae]\s+BH[MN]/i,
    ],
    deveConter: [/3m@mmm\.com/i, /Daniele/],
  },
  {
    id: "recepcao-sem-decisor",
    descricao: "Recepcionista atende, decisor ausente, nada combinado.",
    transcricao: `— Boa tarde, aqui é o Everton. O responsável financeiro está?
— Ele saiu, volta amanhã.
— Obrigado, eu retorno.`,
    empresaFallback: "USINAGEM SUL LTDA",
    notesRuins:
      "Recado deixado com a recepcionista (recepcionista). Diretor demonstrou alto interesse e proposta enviada.",
    contactPersonRuim: "Contato (recepcionista)",
    naoPodeConter: [
      /proposta\s+enviada/i,
      /demonstrou\s+.*interesse/i,
      /\(recepcionista\)/i,
      /\bDiretor\b/,
    ],
  },
  {
    id: "reuniao-realmente-marcada",
    descricao: "Contato confirma reunião — o texto legítimo não pode ser mutilado.",
    transcricao: `— Pode marcar sexta às 15h, confirmado. Sou o Carlos, diretor financeiro. Tenho interesse em ver os cálculos.`,
    empresaFallback: "METALÚRGICA PARANÁ LTDA",
    notesRuins: "Reunião confirmada com Carlos, diretor financeiro, sexta às 15h.",
    contactPersonRuim: "Carlos (Diretor Financeiro)",
    naoPodeConter: [/\(deduzido\)/i, /\bBHN\b/],
    deveConter: [/Reunião confirmada/i, /Carlos/, /diretor/i],
  },
];
