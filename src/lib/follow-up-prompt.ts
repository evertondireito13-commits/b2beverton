// Lógica pura (testável) por trás da extração de follow-up feita por IA.
// Sem imports de servidor: pode ser importado por testes e pelo handler.

export type FollowUpPromptInput = {
  transcricao?: string | null;
  historico?: string | null;
  empresaFallback?: string | null;
  cnpjFallback?: string | null;
};

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Monta system + prompt do extrator, ancorados em `now` (fuso São Paulo). */
export function buildFollowUpPrompt(now: Date, input: FollowUpPromptInput) {
  const tzNow = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  const spTodayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [spYear, spMonth] = spTodayISO.split("-");
  const nomeMesAtual = MESES[Number(spMonth) - 1];

  const system = `Você é um assistente de prospecção B2B. Sua tarefa: ler a transcrição/histórico de uma ligação e extrair o próximo follow-up combinado (retornar ligação, enviar e-mail, falar com outra pessoa, agendar reunião etc.).

REGRAS:
- Responda APENAS um objeto JSON válido, sem markdown, sem crase, sem comentários.
- IMPORTANTE — RECUSA/SEM INTERESSE: se o contato deixou claro que NÃO quer seguir, NÃO tem interesse, pediu para NÃO ligar mais, disse que já tem fornecedor/advogado e não quer trocar, ou qualquer outra forma explícita de recusa, responda OBRIGATORIAMENTE: {"hasFollowUp": false, "reason": "Empresa sem interesse — não insistir", "refused": true}. NÃO invente follow-up nesses casos.
- SEM RECUSA EXPLÍCITA = SEMPRE CRIA FOLLOW-UP. Se não houve recusa clara, responda OBRIGATORIAMENTE {"hasFollowUp": true, ...} — mesmo que a ligação tenha sido neutra ou sem compromisso combinado (não atendeu, caixa postal, caiu a ligação, recado com recepcionista, conversa sem definição). Nesses casos use a REGRA PADRÃO de +2 dias úteis (abaixo) e escreva em "notes" o motivo real, ex.: "Não atendeu — novo contato agendado automaticamente", "Recado deixado com a recepcionista, sem retorno definido — novo contato agendado automaticamente".
- Só responda {"hasFollowUp": false} nos casos de recusa explícita descritos acima.
- Se houver, responda: {"hasFollowUp": true, "companyName": "...", "cnpj": "..." | null, "contactPerson": "..." | null, "contactEmail": "..." | null, "actionType": "call" | "email" | "whatsapp" | "meeting" | "other", "scheduledAt": "ISO-8601 com timezone -03:00", "notes": "..."}
- "actionType": use "call" para ligar de volta, "email" para enviar e-mail, "whatsapp" para mandar mensagem, "meeting" para reunião marcada, "other" para o resto.
- "contactEmail": se a pessoa citou um e-mail para receber o convite/envio (ex: "manda pro meu email joao@empresa.com"), coloque-o aqui EM MINÚSCULAS. Se não houver e-mail claro, use null. NUNCA invente e-mail.

⚠️ ATENÇÃO — DATAS E VIRADA DE MÊS (CRÍTICO):
- HOJE é ${spTodayISO} (${nomeMesAtual} de ${spYear}, fuso America/Sao_Paulo).
- SEMPRE devolva "scheduledAt" no formato ISO-8601 com timezone -03:00 (Brasília).
- A data agendada JAMAIS pode ser anterior a HOJE. Se o texto citar um mês/dia que já passou neste ano, entenda que se refere ao PRÓXIMO mês/ano correspondente (o contato está falando do futuro, não do passado).
- Se o contato citou uma data EXPLÍCITA — "dia 3 de agosto", "03/08", "primeira semana de agosto", "amanhã 10h", "sexta 15h", "retorno das férias em 05/08" — respeite-a e converta corretamente considerando o mês atual (${nomeMesAtual}/${spYear}). Exemplos com HOJE=${spTodayISO}: "3 de agosto" → ${spYear}-08-03; "dia 15" (sem mês, e 15 ainda não passou neste mês) → ${spYear}-${spMonth}-15; "dia 15" (sem mês, mas 15 já passou) → mês seguinte, dia 15.
- REGRA PADRÃO (só se o contato NÃO deu data específica): agende para +2 DIAS ÚTEIS a partir de AGORA (${tzNow}), mantendo o MESMO HORÁRIO da ligação atual. Sábado/domingo pulam para segunda. Se disse só "semana que vem" sem dia, use segunda-feira no mesmo horário da ligação.
- "notes": resumo curto (máx 2 frases) em português. Inclua o nome de quem atendeu e a pessoa a procurar (fiscal, decisor). Se o contato citou e-mail para envio, mencione-o como PENDENTE ("e-mail a enviar para X"). Se o retorno é longo (férias, viagem, agenda cheia), mencione o motivo.

🚫 ANTI-INVENÇÃO (CRÍTICO — vale para "notes" e todos os campos):
- Descreva SOMENTE o que está literalmente na transcrição/histórico. NUNCA afirme que algo já foi feito se isso não aparece no texto: proibido escrever "e-mail enviado", "material encaminhado", "proposta enviada", "reunião confirmada" quando o texto só mostra que um e-mail foi INFORMADO/pedido.
- Ação ainda não executada deve aparecer como pendência futura ("enviar e-mail para ...", "retornar ligação para falar com ...").
- Não deduza cargos, intenções, interesse ou combinados que não foram ditos. Na dúvida, omita.
- "BHM Advogados" (ou variações como "BHN") é a NOSSA empresa, do consultor. NUNCA descreva o contato, a Daniele, o decisor ou qualquer pessoa da empresa prospectada como sendo da BHM, nem trate a BHM como cliente/prospect.
- "contactPerson": nome LIMPO da pessoa a procurar/que atendeu, sem parênteses/qualificadores tipo "(deduzido)", "(recepcionista)". Se só a recepcionista atendeu e não disse o nome do decisor, use o nome dela mesmo. Formato "Nome" ou "Nome (Cargo curto)" — sem frases longas.
- "companyName" e "cnpj": se o texto não trouxer, use os fallbacks fornecidos.`;

  const prompt = `AGORA: ${tzNow}
HOJE (ISO, fuso SP): ${spTodayISO}
EMPRESA (fallback, se o texto não citar): ${input.empresaFallback ?? "—"}
CNPJ (fallback, se o texto não citar): ${input.cnpjFallback ?? "—"}

--- HISTÓRICO GERADO ---
${input.historico || "(vazio)"}

--- TRANSCRIÇÃO / DESCRIÇÃO ---
${input.transcricao || "(vazio)"}`;

  return { system, prompt, tzNow, spTodayISO };
}

/** Extrai o primeiro objeto JSON da resposta da IA, tolerando cercas ```json. */
export function parseFollowUpResponse(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  const cleaned = (raw ?? "").replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, reason: "IA não retornou JSON" };
  }
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "JSON inválido da IA" };
  }
}

// ---------------------------------------------------------------------------
// Saneamento anti-invenção
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Frases de ação executada → forma pendente, quando a fonte não confirma. */
const ACOES_EXECUTADAS: { re: RegExp; replacement: string; evidencia: RegExp }[] = [
  {
    re: /\be-?mails?\s+(j[áa]\s+)?(foi|foram)?\s*enviad[oa]s?\b/gi,
    replacement: "e-mail a enviar",
    evidencia: /\b(enviei|mandei|acabei de enviar|j[áa] enviei|encaminhei)\b/i,
  },
  {
    re: /\benvi(ei|amos|ado|ada)\s+(o\s+)?e-?mail\b/gi,
    replacement: "e-mail a enviar",
    evidencia: /\b(enviei|mandei|encaminhei)\b/i,
  },
  {
    re: /\bmaterial\s+(foi\s+)?(encaminhado|enviado)\b/gi,
    replacement: "material a enviar",
    evidencia: /\b(enviei|mandei|encaminhei)\s+(o\s+)?material\b/i,
  },
  {
    re: /\bproposta\s+(foi\s+)?enviada\b/gi,
    replacement: "proposta a enviar",
    evidencia: /\b(enviei|mandei|encaminhei)\s+(a\s+)?proposta\b/i,
  },
  {
    re: /\breuni[ãa]o\s+confirmada\b/gi,
    replacement: "reunião a confirmar",
    evidencia: /\b(confirmad[ao]|confirmo|confirmamos|fechado|pode marcar|agendad[ao])\b/i,
  },
  {
    re: /\bapresenta[çc][ãa]o\s+(foi\s+)?realizada\b/gi,
    replacement: "apresentação a realizar",
    evidencia: /\bapresent(ei|amos)\b/i,
  },
];

/** Qualificadores deduzidos que nunca devem sobrar no texto. */
const QUALIFICADORES = /\s*\((deduzido|deduzida|prov[áa]vel|presumid[oa]|suposto|suposta|inferido|inferida|recepcionista)\)/gi;

/** Cargos comuns — só podem ser mencionados se aparecerem na fonte. */
const CARGOS = [
  "fiscal",
  "contador",
  "contadora",
  "diretor",
  "diretora",
  "gerente",
  "s[óo]cio",
  "s[óo]cia",
  "propriet[áa]rio",
  "propriet[áa]ria",
  "controller",
  "cfo",
  "ceo",
  "supervisor",
  "supervisora",
  "coordenador",
  "coordenadora",
  "advogado",
  "advogada",
  "respons[áa]vel financeiro",
  "decisor",
];

export type SanitizeInput = {
  notes?: string | null;
  contactPerson?: string | null;
  /** Transcrição + histórico concatenados (a "verdade"). */
  sourceText?: string | null;
};

export type SanitizeResult = {
  notes: string | null;
  contactPerson: string | null;
  /** Regras que precisaram intervir — útil em testes e diagnóstico. */
  changes: string[];
};

/**
 * Rede de segurança determinística: reescreve ações não executadas como
 * pendências, remove cargos/interesses deduzidos e corrige a atribuição
 * indevida da BHM Advogados a pessoas do prospect.
 */
export function sanitizeFollowUpNotes(input: SanitizeInput): SanitizeResult {
  const changes: string[] = [];
  const source = normalize(input.sourceText ?? "");

  let contactPerson = (input.contactPerson ?? "").replace(QUALIFICADORES, "").trim();
  if (contactPerson && contactPerson !== (input.contactPerson ?? "").trim()) {
    changes.push("qualificador-removido:contactPerson");
  }
  // Cargo no contactPerson que não existe na fonte
  contactPerson = contactPerson.replace(/\s*\(([^)]{1,40})\)\s*$/, (full, cargo: string) => {
    return source.includes(normalize(cargo)) ? full : "";
  }).trim();
  if (!contactPerson) contactPerson = (input.contactPerson ?? "").replace(QUALIFICADORES, "").replace(/\s*\([^)]*\)\s*$/, "").trim();

  let notes = (input.notes ?? "").trim();
  if (!notes) {
    return { notes: null, contactPerson: contactPerson || null, changes };
  }

  // 1) Ações não executadas
  for (const rule of ACOES_EXECUTADAS) {
    if (rule.re.test(notes)) {
      rule.re.lastIndex = 0;
      if (!rule.evidencia.test(input.sourceText ?? "")) {
        notes = notes.replace(rule.re, rule.replacement);
        changes.push(`acao-nao-executada:${rule.replacement}`);
      }
      rule.re.lastIndex = 0;
    }
  }

  // 2) Qualificadores deduzidos
  if (QUALIFICADORES.test(notes)) {
    QUALIFICADORES.lastIndex = 0;
    notes = notes.replace(QUALIFICADORES, "");
    changes.push("qualificador-removido:notes");
  }
  QUALIFICADORES.lastIndex = 0;

  // 3) Cargos deduzidos: "Daniele do fiscal" / "Daniele (Diretora)" sem base na fonte
  for (const cargo of CARGOS) {
    const re = new RegExp(`\\s*(?:\\(|,\\s*|\\s+d[oae]\\s+|\\s+)(${cargo})(?:\\))?`, "gi");
    notes = notes.replace(re, (full, achado: string) =>
      source.includes(normalize(achado)) ? full : "",
    );
  }
  if (notes !== (input.notes ?? "").trim()) {
    // marcado abaixo apenas se ainda não houver registro de mudança
  }

  // 4) BHM/BHN é sempre a nossa empresa
  const bhm = /\b(?:d[aoe]s?\s+)?BH[MN]\s*(?:Advogados)?\b/gi;
  if (bhm.test(notes)) {
    bhm.lastIndex = 0;
    notes = notes
      // "Fulano da BHM Advogados" -> "Fulano"
      .replace(/\s+d[aoe]s?\s+BH[MN]\s*(?:Advogados)?/gi, "")
      // "empresa BHM Advogados" citada como prospect
      .replace(/\bempresa\s+BH[MN]\s*(?:Advogados)?\b/gi, "BHM Advogados")
      .replace(/\bBHN\b/g, "BHM");
    changes.push("bhm-corrigido");
  }
  bhm.lastIndex = 0;

  // 5) Interesse deduzido sem base na fonte
  const interesse = /\bdemonstrou\s+(alto\s+|forte\s+|muito\s+)?interesse\b/gi;
  if (interesse.test(notes)) {
    interesse.lastIndex = 0;
    if (!/\binteress/i.test(input.sourceText ?? "")) {
      notes = notes.replace(interesse, "sem interesse declarado");
      changes.push("interesse-deduzido");
    }
  }
  interesse.lastIndex = 0;

  // Limpeza de espaços/pontuação órfã
  notes = notes
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*([,.;])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();

  return { notes: notes || null, contactPerson: contactPerson || null, changes };
}
