import { createServerFn } from "@tanstack/react-start";
import { requireBhmGate } from "@/lib/bhm-gate";
import { generateText, generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { extractFinalScriptOnly } from "./script-output";

export const transcribeAudio = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Envie um arquivo de áudio");
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Arquivo de áudio vazio");
    if (file.size > 24 * 1024 * 1024) throw new Error("Áudio maior que 24MB — divida em partes menores");
    return data;
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const file = data.get("file") as File;
    const mime = (file.type || "").split(";")[0];
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
      "audio/m4a": "m4a",
      "audio/x-m4a": "m4a",
      "audio/flac": "flac",
    };
    const nameFromClient = file.name || "";
    const guessedExt = extMap[mime] ?? nameFromClient.split(".").pop() ?? "webm";
    const filename = /\.[a-z0-9]+$/i.test(nameFromClient) ? nameFromClient : `audio.${guessedExt}`;

    const upstream = new FormData();
    upstream.append("model", "openai/gpt-4o-mini-transcribe");
    upstream.append("file", file, filename);
    upstream.append("language", "pt");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });
    const bodyText = await res.text();
    if (!res.ok) {
      if (res.status === 402)
        throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Plans & credits.");
      if (res.status === 429) throw new Error("Limite de requisições atingido. Tente em alguns segundos.");
      throw new Error(`Falha na transcrição (${res.status}): ${bodyText.slice(0, 200)}`);
    }
    let parsed: { text?: string } = {};
    try {
      parsed = JSON.parse(bodyText) as { text?: string };
    } catch {
      throw new Error("Resposta inválida do serviço de transcrição");
    }
    const text = (parsed.text ?? "").trim();
    if (!text) throw new Error("Não foi possível transcrever (áudio silencioso ou inaudível)");
    return { text };
  });

const GenerateInput = z.object({
  systemPrompt: z.string().min(1),
  userContent: z.string().min(1),
  modo: z.enum(["script", "livre"]).optional(),
});

const ContactNameInput = z.object({
  textoBruto: z.string().min(1),
});

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractCnaeDivision(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const codeAtStart = line.match(/^(\d{4})(?:[-.\/]\d|\d{3}\s*-)/);
    if (codeAtStart) return codeAtStart[1].slice(0, 2);
  }
  const cnaeContext = text.match(
    /(?:atividade\s*principal(?:\s*\(cnae\))?|cnae\s*principal|cnae)[^\n\d]{0,80}(\d{2})[\d.\/-]{2,}/i,
  );
  return cnaeContext?.[1] ?? "";
}

function extractLeadBlockFromUserContent(userContent: string): string {
  const match = userContent.match(/\[DADOS DO LEAD\]:\s*([\s\S]*?)(?:\n\[DIA DA SEMANA ATUAL\]:|\n\[TEMPLATE DO SCRIPT|$)/i);
  return (match?.[1] ?? userContent).trim();
}

function extractValidatedNameFromUserContent(userContent: string): string | undefined {
  const match = userContent.match(/\{NOME\}:\s*([^\n]+)/i);
  const value = match?.[1]?.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (!value) return undefined;
  return value.slice(0, 40);
}

function normalizeAiContactName(raw: string): string {
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const clean = firstLine
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[.!]+$/g, "")
    .trim();
  if (!clean || clean.toLowerCase() === "tudo bem?") return "tudo bem?";
  const first = clean.split(/\s+/)[0]?.replace(/[^A-Za-zÀ-ú'-]/g, "") ?? "";
  if (!first || first.length < 2 || first.length > 24) return "tudo bem?";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Regex de áreas prioritárias (fiscal, financeiro, contábil, controladoria etc.)
const CONTATO_PRIORITARIO_REGEX_SRV = /(fiscal|financeir[oa]|finaceir[oa]|cont[aá]bil|contabilidade|contador[a]?|controladori[ao]|controller|tesourari[ao]|tribut[aá]ri[ao]|aux\.?\s*(financeir[oa]|finaceir[oa]|fiscal|cont[aá]bil)|auxiliar\s+(financeir[oa]|finaceir[oa]|fiscal|cont[aá]bil)|assistente\s+(admin|administrativ|financeir|finaceir|fiscal|cont[aá]bil)|analista\s+(fiscal|financeir|finaceir|cont[aá]bil|tribut[aá]ri)|coord(enador)?\s+(fiscal|financeir|finaceir|cont[aá]bil|tribut[aá]ri)|gerent[ea]\s+(fiscal|financeir|finaceir|cont[aá]bil|tribut[aá]ri|administrativ)|diretor(a)?\s+(fiscal|financeir|finaceir|cont[aá]bil|administrativ))/i;

function cleanNameToken(line: string): string | undefined {
  const cleaned = line
    .replace(/^[-–—•\d.)\s]+/, "")
    .replace(/^(contato|nome|nome\s+do\s+s[óo]cio|s[óo]cio|administrador)\s*[:\-]\s*/i, "")
    .split(/\s*[·\-–—|/]\s*|,\s*|\s+\(/)[0]
    .replace(/\b(CPF|RG|ADMINISTRADOR|S[ÓO]CIO[-\s]*ADMINISTRADOR|S[ÓO]CIO|TITULAR|DIRETOR|GERENTE|ANALISTA|ASSISTENTE|COORDENADOR|CONTADOR[A]?|CONTROLLER|FISCAL|FINANCEIR[OA]|CONT[AÁ]BIL|TRIBUT[AÁ]RI[OA])\b/gi, " ")
    .replace(/[{}\[\]():;·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\b(CNPJ|LTDA|EIRELI|EPP|ME\b|S\.?A\.?|SOCIEDADE|PARTICIPA[CÇ][ÕO]ES|HOLDING|ADMINISTRADORA|GRUPO)\b/i.test(cleaned)) return undefined;
  if (/\b(INSCRI[CÇ][ÕO]ES?|ESTADUAIS?|ATIVIDADES?|ECON[ÔO]MICAS?|REGIME|TRIBUT[ÁA]RIO|SUFRAMA|CNAE|RECEITA|FEDERAL|SIMPLES|NACIONAL|EMPRESAS?|NEG[ÓO]CIOS?|DETALHES|LISTA|CARGO|SETOR|SITE|LINKEDIN|FABRICA[CÇ][AÃ]O|COM[EÉ]RCIO|ESTRUTURAS?|MET[AÁ]LICAS?|METAL[ÚU]RGIC[AO]S?|IND[ÚU]STRIA|DESCRI[CÇ][AÃ]O|PRINCIPAL|SECUND[AÁ]RIA|MUNIC[ÍI]PIO|CIDADE|ENDERE[CÇ]O|SITUA[CÇ][AÃ]O|PORTE|CAPITAL|ABERTURA|GRUPO)\b/i.test(cleaned)) return undefined;
  const first = cleaned.split(/\s+/).find((p) => /^[A-Za-zÀ-ú'.-]{2,}$/.test(p));
  if (!first) return undefined;
  if (/^(inscri[cç][õo]es?|estaduais?|atividades?|economicas?|regime|tributario|suframa|cnae|administrador(?:es)?|socio(?:s)?|socios|analista|assistente|cargo|setor|site|lista|detalhes|empresas?|negocios?|fabrica[cç][aã]o|com[eé]rcio|estruturas?|met[aá]licas?|metal[uú]rgic[ao]s?|ind[uú]stria|descri[cç][aã]o|principal|secund[aá]ria|munic[ií]pio|cidade|endere[cç]o|situa[cç][aã]o|porte|capital|abertura|grupo)$/i.test(first)) return undefined;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function containsNonHumanContent(line?: string): boolean {
  const clean = (line ?? "").trim();
  if (!clean) return true;
  return /\b(CNPJ|CPF|LTDA|EIRELI|EPP|S\.?A\.?|HOLDING|PARTICIPA[CÇ][ÕO]ES|GRUPO|IND[ÚU]STRIA|COM[EÉ]RCIO|EMPRESAS?|NEG[ÓO]CIOS?|DETALHES|LISTA|LINKEDIN|SETOR|LOCALIZA[CÇ][AÃ]O|EMPREGO|CARGO|SITE|BRASIL|ATIVA|PRESENTE|REMOVER|DADOS|RECEITA|FEDERAL|SIMPLES|NACIONAL|CNAE|SUFRAMA|INSCRI[CÇ][ÕO]ES?|ESTADUAIS?|ATIVIDADES?|ECON[ÔO]MICAS?|REGIME|TRIBUT[ÁA]RIO|S[ÓO]CIOS?|ADMINISTRADORES?|FABRICA[CÇ][AÃ]O|ESTRUTURAS?|MET[AÁ]LICAS?|METAL[ÚU]RGIC[AO]S?|METALURGIA|AÇO|ACO|FERRO|USINAGEM|SOLDA|CALDEIRARIA|DESCRI[CÇ][AÃ]O|PRINCIPAL|SECUND[AÁ]RIA|MUNIC[ÍI]PIO|CIDADE|ENDERE[CÇ]O|SITUA[CÇ][AÃ]O|PORTE|CAPITAL|ABERTURA)\b/i.test(clean);
}

function tokensLookLikeHumanName(line: string): boolean {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) return false;
  return tokens.every((token, index) => {
    const cleaned = token.replace(/[.'-]/g, "");
    if (/^(de|da|do|das|dos|e)$/i.test(cleaned)) return true;
    if (index > 0 && /^[a-zà-ú][a-zà-ú'.-]{1,}$/.test(token)) return true;
    return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú'.-]{1,}$/.test(token) || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}$/.test(cleaned);
  });
}

function lineHasPriorityRole(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  const context = `${line} ${/^(cargo|setor|fun[cç][aã]o|departamento)\s*:?$/i.test(line) ? next : ""}`.trim();
  if (!CONTATO_PRIORITARIO_REGEX_SRV.test(context)) return false;
  if (/\b(REGIME\s+TRIBUT[ÁA]RIO|LUCRO\s+REAL|PRESUMIDO|SIMPLES\s+NACIONAL|ATIVIDADES?\s+ECON[ÔO]MICAS?|INSCRI[CÇ][ÕO]ES?\s+ESTADUAIS?|SUFRAMA|CNAE|RECEITA\s+FEDERAL)\b/i.test(context)) return false;
  return /\b(CARGO|SETOR|FUN[CÇ][AÃ]O|DEPARTAMENTO|AUX\.?|AUXILIAR|ASSISTENTE|ANALISTA|COORDENADOR|GERENTE|DIRETOR|CONTROLLER|CONTADOR|FISCAL|FINANCEIR[OA]|FINACEIR[OA]|CONT[AÁ]BIL|CONTROLADORIA|TESOURARI[AO])\b/i.test(context);
}

function priorityRoleExistsInWindow(lines: string[], startIndex: number): boolean {
  for (let i = startIndex + 1; i < Math.min(lines.length, startIndex + 70); i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (/^(atividades?\s+econ[ôo]micas?|inscri[cç][õo]es?\s+estaduais?|suframa|cnae)\s*:?$/i.test(line)) return false;
    if (i > startIndex + 1 && looksLikePersonNameLine(line, previousUsefulLine(lines, i))) return false;
    if (lineHasPriorityRole(lines, i)) return true;
  }
  return false;
}

function previousUsefulLine(lines: string[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (line) return line;
  }
  return undefined;
}

function looksLikePersonNameLine(line?: string, previousLine?: string): boolean {
  const clean = (line ?? "").trim();
  if (!clean || clean.length > 80) return false;
  if (previousLine && /^(empresa|raz[aã]o social|nome fantasia)\s*:?$/i.test(previousLine.trim())) return false;
  if (previousLine && /^(cargo|setor|fun[cç][aã]o|departamento)\s*:?$/i.test(previousLine.trim())) return false;
  if (previousLine && /\b(rodovia|rua|avenida|av\.?|estrada|travessa|alameda|bairro|lote|quadra|km|br-|rs-)\b/i.test(previousLine.trim())) return false;
  if (/@|https?:|www\.|\d|:|,/.test(clean)) return false;
  if (containsNonHumanContent(clean)) return false;
  const tokens = clean.split(/\s+/).filter((p) => /^[A-Za-zÀ-ú'.-]{2,}$/.test(p));
  if (tokens.length < 2 || tokens.length > 5) return false;
  return tokens.length === clean.split(/\s+/).length && tokensLookLikeHumanName(clean);
}

function normalizeTextForContactExtraction(text: string): string {
  return text
    .replace(
      /(Receita\s+Federal|Simples\s+Nacional|Telefone\s+da\s+sede\s*:?)\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+){1,5})/g,
      "$1\n$2",
    )
    .replace(
      /(\d{6,})([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ú'.-]+){1,5})/g,
      "$1\n$2",
    );
}

function extractPhysicalAdminName(leadText: string): string {
  const lines = normalizeTextForContactExtraction(leadText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1º) Contato fiscal/financeiro/contábil/controladoria (prioridade máxima)
  // Caso mais confiável em listas coladas: o bloco do contato começa com o nome
  // e depois aparecem E-mail/Emprego/Empresa/Cargo. A análise fica dentro desse
  // bloco para não capturar bairro/endereço (ex.: "Alpes do Vale") como pessoa.
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!looksLikePersonNameLine(line, previousUsefulLine(lines, i))) continue;
    let blockEnd = Math.min(lines.length, i + 90);
    for (let j = i + 1; j < Math.min(lines.length, i + 90); j += 1) {
      if (looksLikePersonNameLine(lines[j], previousUsefulLine(lines, j))) {
        blockEnd = j;
        break;
      }
    }
    const block = lines.slice(i, blockEnd);
    if (block.some((_, idx) => lineHasPriorityRole(block, idx))) {
      const name = cleanNameToken(line);
      if (name) return name;
    }
  }

  for (const line of lines) {
    if (!lineHasPriorityRole([line], 0)) continue;
    if (containsNonHumanContent(line)) continue;
    const candidate = line
      .replace(/^[-–—•\d.)\s]+/, "")
      .replace(/^(contato|nome)\s*[:\-]\s*/i, "")
      .split(/\s*[·\-–—|/]\s*|,\s*|\s+\(/)[0]
      .trim();
    if (!tokensLookLikeHumanName(candidate)) continue;
    const name = cleanNameToken(candidate);
    if (name) return name;
  }

  // Caso comum em textos brutos do RD/LinkedIn: o nome vem em uma linha e o cargo
  // prioritário aparece algumas linhas abaixo como "Cargo:\nAnalista financeiro".
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!looksLikePersonNameLine(line, previousUsefulLine(lines, i))) continue;
    if (priorityRoleExistsInWindow(lines, i)) {
      const name = cleanNameToken(line);
      if (name) return name;
    }
  }

  for (const line of lines) {
    if (!lineHasPriorityRole([line], 0)) continue;
    if (containsNonHumanContent(line)) continue;
    const candidate = line
      .replace(/^[-–—•\d.)\s]+/, "")
      .replace(/^(contato|nome)\s*[:\-]\s*/i, "")
      .split(/\s*[·\-–—|/]\s*|,\s*|\s+\(/)[0]
      .trim();
    if (!tokensLookLikeHumanName(candidate)) continue;
    const name = cleanNameToken(candidate);
    if (name) return name;
  }

  // 2º) Pessoa física do QSA
  let insidePartnersBlock = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^(s[óo]cios?\s+e\s+administradores?|quadro\s+societ[aá]rio|qsa)\s*:?$/i.test(line)) {
      insidePartnersBlock = true;
      continue;
    }
    if (/^(atividades?\s+econ[ôo]micas?|inscri[cç][õo]es?\s+estaduais?|suframa|cnae|regime\s+tribut[aá]rio)\s*:?$/i.test(line)) {
      insidePartnersBlock = false;
      continue;
    }
    const hasCorporateRole = /(administrador|s[óo]cio[-\s]*administrador|s[óo]cio|qsa|quadro\s+societ)/i.test(line);
    const nextHasCorporateRole = /(administrador|s[óo]cio[-\s]*administrador|s[óo]cio)/i.test(lines[i + 1] ?? "");
    const isLoosePersonName = insidePartnersBlock && looksLikePersonNameLine(line, previousUsefulLine(lines, i)) && nextHasCorporateRole;
    if (!hasCorporateRole && !isLoosePersonName) continue;
    if (/^(quadro\s+societ[aá]rio|qsa|s[óo]cios?|administradores?)\s*:?$/i.test(line)) continue;
    if (/^qualifica[cç][aã]o\s+(do\s+)?s[óo]cio\s*:/i.test(line)) continue;
    if (/\b(CNPJ|LTDA|EIRELI|EPP|S\.?A\.?|HOLDING|PARTICIPA[CÇ][ÕO]ES|PESSOA\s+JUR[ÍI]DICA)\b/i.test(line)) continue;
    const name = cleanNameToken(line);
    if (name) return name;
  }

  // 3º) Sem pessoa física — usa a expressão neutra "tudo bem?"
  return "tudo bem?";
}

function inferSegmentAndInputs(leadText: string): { segmento: string; insumos: string } {
  const normalized = normalizeForMatch(leadText);
  const cnaeDigits = extractCnaeDivision(leadText);
  const mentionsMetal =
    /\b(metalurg|metalmecan|metalicas?|metais|aco|aço|ferro|siderurg|usinagem|solda|caldeiraria|serralheria)\b/.test(normalized) ||
    /estruturas?\s+metalicas?/.test(normalized);
  if (["24", "25", "28", "29", "30"].includes(cnaeDigits) || mentionsMetal) {
    return {
      segmento: "Metalurgia e Metalmecânica",
      insumos: "eletrodos de solda, discos de corte abrasivos e rebolos de desbaste",
    };
  }
  if (cnaeDigits === "31" || /\b(moveis|mobiliario|madeira|marcenaria)\b/.test(normalized)) {
    return {
      segmento: "Móveis e Artefatos de Madeira",
      insumos: "lixas industriais, brocas de vídea e colas estruturais",
    };
  }
  if (cnaeDigits === "22" || /\b(plasticos?|polimeros?|resinas?)\b/.test(normalized)) {
    return {
      segmento: "Plásticos e Transformação",
      insumos: "resinas termoplásticas, pigmentos industriais e componentes de desgaste de moldes",
    };
  }
  if (["10", "11", "12"].includes(cnaeDigits) || /\b(alimentos?|laticinios?|bebidas?|frigorifico)\b/.test(normalized)) {
    return {
      segmento: "Alimentos e Refrigeração",
      insumos: "fluidos hidráulicos protetivos, amônia para refrigeração e esteiras de lavagem",
    };
  }
  return {
    segmento: "Industrial",
    insumos: "partes, peças de reposição e componentes de desgaste operacional",
  };
}

// ------------------------------------------------------------------
// Sanitização rígida da saída de script: devolve APENAS o script final,
// sem cercas markdown, sem intro/outro e sem eco das instruções do prompt.
// Roda ANTES da substituição de tags, para que regras ecoadas nunca sejam
// "preenchidas" e acabem impressas na tela como parte do script.
// ------------------------------------------------------------------
function normalizeForEcho(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[*_`>#•·\-–—]/g, "")
    .trim();
}

const INSTRUCTION_LINE_RE =
  /^\s*(?:[•\-*>#]\s*)?(?:(?:REGRAS?|REGRA|INSTRU[ÇC][ÕO]ES?|IMPORTANTE|ATEN[ÇC][ÃA]O|OBSERVA[ÇC][ÃA]O|OBS|PROIBIDO|N[ÃA]O FA[ÇC]A|FORMATO|SA[ÍI]DA|OUTPUT|CONTEXTO|OBJETIVO|TAREFA|HIERARQUIA|DIRETRIZES?|PASSO A PASSO|EXEMPLO)\b[^\n]*:?|(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ]{8,}):)\s*$/;

const INTRO_OUTRO_RE =
  /^\s*(?:[•\-*>#]\s*)?(?:claro|certo|com certeza|perfeito|aqui est[áa][^\n]*|segue[^\n]*script[^\n]*|abaixo[^\n]*script[^\n]*|espero (?:ter )?ajud[^\n]*|bo(?:a|as) (?:liga[çc][ãa]o|vendas)[^\n]*|qualquer (?:coisa|d[úu]vida)[^\n]*|se precisar[^\n]*|script (?:final|preenchido|gerado)\s*:?)\s*[:.!]?\s*$/i;

function sanitizeScriptOutput(text: string, systemPrompt: string): string {
  let out = extractFinalScriptOnly(text);

  // 1. Remove cercas de código markdown (```text ... ```).
  out = out.replace(/^\s*```[a-zA-Z]*\s*\n?/g, "").replace(/\n?```\s*$/g, "");
  out = out.replace(/```[a-zA-Z]*\n?/g, "");

  // 2. Índice de linhas do prompt para detectar eco literal das instruções.
  const promptLines = new Set(
    systemPrompt
      .split("\n")
      .map(normalizeForEcho)
      .filter((l) => l.length >= 18),
  );

  const kept = out.split("\n").filter((raw) => {
    const line = raw.trim();
    if (!line) return true;
    const norm = normalizeForEcho(line);
    if (norm.length >= 18 && promptLines.has(norm)) return false; // eco literal do prompt
    if (INSTRUCTION_LINE_RE.test(line)) return false; // cabeçalho de regra
    if (INTRO_OUTRO_RE.test(line)) return false; // saudação / despedida
    return true;
  });

  out = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return extractFinalScriptOnly(out);
}


function enforceScriptTagReplacement(text: string, userContent: string): string {
  const leadText = extractLeadBlockFromUserContent(userContent);
  const name = extractValidatedNameFromUserContent(userContent) ?? "tudo bem?";
  const locationMatch =
    leadText.match(/(?:munic[íi]pio|cidade)\s*:?\s*([A-Za-zÀ-ú\s.'-]{2,})\s*\/\s*([A-Z]{2})\b/i) ??
    leadText.match(/([A-Za-zÀ-ú\s.'-]{2,})\s*\/\s*([A-Z]{2})\b/);
  const city = locationMatch?.[1]
    ?.split(/[·,-]/)
    .pop()
    ?.replace(/\b(munic[íi]pio|cidade)\b\s*:?/gi, "")
    .trim() || "aí na região";
  const cityState = locationMatch?.[2] ? `${city}/${locationMatch[2]}` : city;
  const { segmento, insumos } = inferSegmentAndInputs(leadText);

  const filled = text
    .replace(/\{\s*NOME\s*\}/gi, name)
    .replace(/\{\s*CIDADE_ESTADO\s*\}/gi, cityState)
    .replace(/\{\s*CIDADE\s*\}/gi, city)
    .replace(/\{\s*SEGMENTO\s*\}/gi, segmento)
    .replace(/\{\s*INSUMOS\s*\}/gi, insumos)
    .replace(/\[\s*NOME\s*\]/gi, name)
    .replace(/\[\s*CIDADE_ESTADO\s*\]/gi, cityState)
    .replace(/\[\s*CIDADE\s*\]/gi, city)
    .replace(/\[\s*SEGMENTO\s*\]/gi, segmento)
    .replace(/\[\s*INSUMOS\s*\]/gi, insumos);

  if (name.toLowerCase() === "tudo bem?") return filled;
  return filled
    .replace(
      /\b(Grupo|Empresa|Fabrica[cç][aã]o|Com[eé]rcio|Inscri[cç][õo]es?|Atividades?|CNAE|S[óo]cios?|Administradores?)\s*,/gi,
      `${name},`,
    )
    .replace(
      /(^|[\n"])([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ú'.-]{2,})\s*,(?=\s*(?:tudo bem|estou|90%|eu entendo|sem custo|vou|hoje|a gente|e se|quero|compartilho))/g,
      (_match, prefix, vocative) => (vocative === name ? `${prefix}${vocative},` : `${prefix}${name},`),
    );
}

// ------------------------------------------------------------------
// Classificador isolado de desfecho da conversa.
// Roda em paralelo à geração do histórico usando um prompt de sistema
// FIXO do desenvolvedor — não toca no prompt customizado do usuário.
// Retorna apenas: 'arquivado' | 'reuniao' | 'follow_up'.
// ------------------------------------------------------------------
const StatusConversaInput = z.object({
  descricao: z.string().min(1),
});

export type StatusConversa = "arquivado" | "reuniao" | "follow_up";
export type TipoContato = "decisor" | "portaria";

export type InterpretacaoConversa = {
  status: StatusConversa;
  contatoNome: string | null;
  contatoCargo: string | null;
  tipoContato: TipoContato;
};

const STATUS_SYSTEM_PROMPT = `Você é um analisador silencioso de ligações comerciais B2B.
Leia a descrição livre da ligação escrita pelo consultor e devolva EXCLUSIVAMENTE um JSON válido (sem markdown, sem crase, sem texto extra) com esta forma exata:

{
  "status": "arquivado" | "reuniao" | "follow_up",
  "contato_nome": string | null,
  "contato_cargo": string | null,
  "tipo_contato": "decisor" | "portaria"
}

Regras de "status":
- "arquivado"  => empresa recusou, descartou, sem interesse, já tem fornecedor e não quer trocar, pediu para não ligar mais, ou qualquer negativa clara.
- "reuniao"    => reunião/visita/apresentação/call agendada, marcada ou confirmada (mesmo sem data exata).
- "follow_up"  => qualquer outro caso (retornar depois, aguardando decisor, mandar material, não atendeu, caixa postal, etc).
- Em dúvida entre reuniao e follow_up => follow_up.
- Em dúvida entre arquivado e follow_up => follow_up.

Regras de extração:
- "contato_nome": nome próprio da pessoa com quem se falou DIRETAMENTE (ex.: "Marcelo Souza"). Se apenas mencionaram "recepcionista", "secretária", "portaria" sem nome => null. Se a secretária/recepção apenas CITOU o nome do responsável (ex.: "quem cuida disso é o Guido", "fale com o Jonas", "o responsável é a Fulana") mas o consultor NÃO conversou com essa pessoa, esse nome NÃO é o contato — retorne o nome de quem realmente atendeu, ou null se anônimo.
- "contato_cargo": cargo/função de quem realmente atendeu. Sem cargo claro => null.
- "tipo_contato":
    * "decisor"  => o consultor CONVERSOU DIRETAMENTE com o tomador de decisão (sócio, diretor, gerente responsável, dono, CFO, controller, comprador autorizado). Precisa ter havido DIÁLOGO com essa pessoa, não apenas menção ao nome dela.
    * "portaria" => ficou travado na recepção/secretária/portaria/telefonista/intermediário; ou a secretária apenas INFORMOU quem é o responsável / pediu para enviar e-mail / disse que o responsável está ocupado / transferiu mas o responsável não atendeu; ou o consultor foi transferido para um setor mas falou com outro intermediário; ou o responsável foi apenas indicado/citado sem conversa efetiva.
- REGRA CRÍTICA: "sugeriu falar com X", "o responsável é X", "quem cuida é X", "vou transferir para X" (sem confirmação de que X atendeu e conversou), "pediu para enviar e-mail para X", "X está em reunião/ocupado" => SEMPRE "portaria". Só marque "decisor" se ficar EXPLÍCITO no texto que o consultor efetivamente dialogou com o decisor (ex.: "falei com o Guido, ele disse que...", "conversei com o diretor João e ele...", "o sócio me atendeu e informou...").
- Se não atendeu / caixa postal / sem contato humano => "portaria".


NUNCA escreva explicações. Só o JSON.`;

function parseInterpretacao(raw: string): InterpretacaoConversa {
  const fallback: InterpretacaoConversa = {
    status: "follow_up",
    contatoNome: null,
    contatoCargo: null,
    tipoContato: "portaria",
  };
  if (!raw) return fallback;
  // Remove crase/markdown que alguns modelos insistem em adicionar
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback;
  try {
    const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const statusRaw = String(obj.status ?? "").toLowerCase();
    const status: StatusConversa = statusRaw.includes("arquiv")
      ? "arquivado"
      : statusRaw.includes("reuni")
        ? "reuniao"
        : "follow_up";
    const tipoRaw = String(obj.tipo_contato ?? "").toLowerCase();
    const tipoContato: TipoContato = tipoRaw.includes("decis") ? "decisor" : "portaria";
    const norm = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const t = v.trim();
      if (!t || /^(null|nulo|nao informado|não informado|n\/a|na)$/i.test(t)) return null;
      return t.slice(0, 200);
    };
    return {
      status,
      contatoNome: norm(obj.contato_nome),
      contatoCargo: norm(obj.contato_cargo),
      tipoContato,
    };
  } catch {
    return fallback;
  }
}

export const interpretarStatusConversa = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => StatusConversaInput.parse(input))
  .handler(async ({ data }): Promise<InterpretacaoConversa> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const gateway = createLovableAiGatewayProvider(key);
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system: STATUS_SYSTEM_PROMPT,
        prompt: `Descrição da ligação:\n${data.descricao}`,
      });
      return parseInterpretacao(text ?? "");
    } catch {
      // Falha silenciosa: assume follow_up/portaria para não sumir cards nem inflar métricas.
      return {
        status: "follow_up",
        contatoNome: null,
        contatoCargo: null,
        tipoContato: "portaria",
      };
    }
  });

/* ------------------------------------------------------------------ *
 * Análise estruturada da conversa (JSON padronizado via generateObject)
 * ------------------------------------------------------------------ */

const AnaliseConversaSchema = z.object({
  resumo_executivo: z.string(),
  nivel_interesse: z.enum(["alto", "medio", "baixo", "nenhum"]),
  objecoes_encontradas: z.array(z.string()),
  proximo_passo_sugerido: z.string(),
});

export type AnaliseConversa = z.infer<typeof AnaliseConversaSchema>;

const ANALISE_SYSTEM_PROMPT = `Você analisa ligações de prospecção tributária (BHM Advogados).
Leia a transcrição/relato e devolva uma análise objetiva em português do Brasil.

Regras:
- resumo_executivo: 1 a 3 frases sobre o que FOI conversado e o que FOI conquistado (tom positivo, factual).
- nivel_interesse: alto | medio | baixo | nenhum.
- objecoes_encontradas: lista curta das objeções reais ditas pelo contato (vazia se não houve).
- proximo_passo_sugerido: ação concreta e única (ex.: "Retornar dia 12/05 falando com a Luana do financeiro").
Não invente dados que não estejam no texto.`;

export const analisarConversaEstruturada = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((input: unknown) => z.object({ descricao: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<AnaliseConversa | null> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const gateway = createLovableAiGatewayProvider(key);
    try {
      const { object } = await generateObject({
        model: gateway("google/gemini-2.5-flash"),
        schema: AnaliseConversaSchema,
        system: ANALISE_SYSTEM_PROMPT,
        prompt: `Conversa:\n${data.descricao.slice(0, 20000)}`,
        temperature: 0.2,
      });
      return object;
    } catch (err) {
      // Degrada em silêncio: a análise é um complemento, nunca bloqueia o histórico.
      if (NoObjectGeneratedError.isInstance(err)) return null;
      return null;
    }
  });


const CONTACT_NAME_SYSTEM_PROMPT = `Analise o texto fornecido. Seu objetivo é extrair APENAS o PRIMEIRO NOME de uma PESSOA FÍSICA real.

Regra 1: Dê preferência absoluta a pessoas com cargos nas áreas Financeira, Fiscal, Contábil ou Administrativa (ex: Luana, Daiana, Shaiani, Kélin).
Regra 2: Se não houver ninguém dessas áreas, use o nome de um Sócio/Administrador pessoa física (ex: Monique, Vitor).
Regra 3: Ignore completamente botões de UI (como "Ver mais", "Obter número"), termos de endereço, bairros, nomes de empresa, cabeçalhos, CNAEs, atividades econômicas e palavras de interface.
Regra 4: Se NÃO houver nenhuma pessoa física no texto, retorne exatamente a expressão: tudo bem?

Responda somente com uma destas duas opções: o primeiro nome da pessoa, ou tudo bem?. Não explique.`;

export const extractContactNameWithAI = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => ContactNameInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const gateway = createLovableAiGatewayProvider(key);
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system: CONTACT_NAME_SYSTEM_PROMPT,
        prompt: `[TEXTO BRUTO DA EMPRESA]:\n${data.textoBruto.slice(0, 12000)}`,
        temperature: 0,
      });
      return { nome: normalizeAiContactName(text ?? "") };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) throw new Error("Limite de requisições atingido. Tente em alguns segundos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Plans & credits.");
      throw new Error(`Falha ao extrair contato: ${msg}`);
    }
  });

export const generateWithAI = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const gateway = createLovableAiGatewayProvider(key);
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system: data.systemPrompt,
        prompt: data.userContent,
        temperature: 0.2,
      });
      const base = data.modo === "script" ? sanitizeScriptOutput(text ?? "", data.systemPrompt) : (text ?? "");
      return { text: enforceScriptTagReplacement(base, data.userContent) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) throw new Error("Limite de requisições atingido. Tente em alguns segundos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Plans & credits.");
      throw new Error(`Falha na IA: ${msg}`);
    }
  });

const CnpjInput = z.object({
  cnpj: z.string().transform((v) => v.replace(/\D/g, "")),
});

export const lookupCnpj = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => CnpjInput.parse(input))
  .handler(async ({ data }) => {
    if (data.cnpj.length !== 14) {
      throw new Error("CNPJ deve ter 14 dígitos");
    }

    const fmtCnpj = (v?: string) =>
      v && v.length === 14
        ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`
        : v ?? "";
    const fmtMoney = (v?: number) =>
      typeof v === "number"
        ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";
    const fmtDate = (v?: string | null) => {
      if (!v) return "";
      const d = new Date(v);
      if (isNaN(d.getTime())) return v;
      return d.toLocaleDateString("pt-BR");
    };

    // Primeiro tenta BrasilAPI (grátis). Se falhar por rate-limit/anti-bot/erro,
    // cai para CNPJá (pago, chave configurada) como fallback automático.
    let brasilApiError: string | null = null;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${data.cnpj}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; ProspeccaoB2B/1.0)",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const j = (await res.json()) as {
          cnpj?: string;
          razao_social?: string;
          nome_fantasia?: string;
          cnae_fiscal?: number;
          cnae_fiscal_descricao?: string;
          cnaes_secundarios?: Array<{ codigo?: number; descricao?: string }>;
          natureza_juridica?: string;
          logradouro?: string;
          numero?: string;
          complemento?: string;
          bairro?: string;
          municipio?: string;
          uf?: string;
          cep?: string;
          ddd_telefone_1?: string;
          ddd_telefone_2?: string;
          email?: string;
          capital_social?: number;
          porte?: string;
          opcao_pelo_simples?: boolean;
          data_opcao_pelo_simples?: string | null;
          opcao_pelo_mei?: boolean;
          data_opcao_pelo_mei?: string | null;
          descricao_situacao_cadastral?: string;
          data_situacao_cadastral?: string;
          motivo_situacao_cadastral?: number;
          data_inicio_atividade?: string;
          descricao_identificador_matriz_filial?: string;
          descricao_tipo_de_logradouro?: string;
          ente_federativo_responsavel?: string;
          qsa?: Array<{
            nome_socio?: string;
            qualificacao_socio?: string;
            data_entrada_sociedade?: string;
            faixa_etaria?: string;
            pais?: string;
          }>;
        };

        const endereco = [
          [
            [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(" "),
            j.numero,
          ]
            .filter(Boolean)
            .join(", "),
          j.complemento,
          j.bairro,
          [j.municipio, j.uf].filter(Boolean).join("/"),
          j.cep,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          cnpj: fmtCnpj(j.cnpj) || fmtCnpj(data.cnpj),
          razaoSocial: j.razao_social ?? "",
          nomeFantasia: j.nome_fantasia ?? "",
          matrizFilial: j.descricao_identificador_matriz_filial ?? "",
          situacao: j.descricao_situacao_cadastral ?? "",
          dataSituacao: fmtDate(j.data_situacao_cadastral),
          dataAbertura: fmtDate(j.data_inicio_atividade),
          naturezaJuridica: j.natureza_juridica ?? "",
          cnaePrincipal: j.cnae_fiscal
            ? `${j.cnae_fiscal} - ${j.cnae_fiscal_descricao ?? ""}`.trim()
            : j.cnae_fiscal_descricao ?? "",
          cnaesSecundarios: (j.cnaes_secundarios ?? [])
            .filter((c) => c && (c.codigo || c.descricao))
            .map((c) => `${c.codigo ?? ""} - ${c.descricao ?? ""}`.trim()),
          endereco,
          telefone1: j.ddd_telefone_1 ?? "",
          telefone2: j.ddd_telefone_2 ?? "",
          email: j.email ?? "",
          porte: j.porte ?? "",
          capitalSocial: fmtMoney(j.capital_social),
          simples: !!j.opcao_pelo_simples,
          dataSimples: fmtDate(j.data_opcao_pelo_simples),
          mei: !!j.opcao_pelo_mei,
          dataMei: fmtDate(j.data_opcao_pelo_mei),
          enteFederativo: j.ente_federativo_responsavel ?? "",
          socios: (j.qsa ?? []).map((s) => ({
            nome: s.nome_socio ?? "",
            qualificacao: s.qualificacao_socio ?? "",
            dataEntrada: fmtDate(s.data_entrada_sociedade),
            faixaEtaria: s.faixa_etaria ?? "",
            pais: s.pais ?? "",
          })),
          _fonte: "BrasilAPI" as const,
        };
      }
      if (res.status === 404) throw new Error("CNPJ não encontrado");
      brasilApiError = `HTTP ${res.status}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "CNPJ não encontrado") throw e;
      brasilApiError = msg;
    }

    // ---------- Fallback: CNPJá ----------
    const cnpjaKey = process.env.CNPJA_API_KEY;
    if (!cnpjaKey) {
      throw new Error(
        `BrasilAPI falhou (${brasilApiError}) e CNPJA_API_KEY não está configurada para fallback.`,
      );
    }

    const rc = await fetch(`https://api.cnpja.com/office/${data.cnpj}`, {
      headers: { Accept: "application/json", Authorization: cnpjaKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!rc.ok) {
      if (rc.status === 404) throw new Error("CNPJ não encontrado");
      throw new Error(
        `BrasilAPI falhou (${brasilApiError}) e CNPJá também (HTTP ${rc.status}).`,
      );
    }
    const c = (await rc.json()) as {
      taxId?: string;
      alias?: string | null;
      head?: boolean;
      founded?: string;
      status?: { text?: string; date?: string };
      company?: {
        name?: string;
        equity?: number;
        nature?: { text?: string };
        size?: { text?: string };
        simples?: { optant?: boolean; since?: string | null };
        simei?: { optant?: boolean; since?: string | null };
        members?: Array<{
          person?: { name?: string; age?: string; country?: { name?: string } };
          role?: { text?: string };
          since?: string;
        }>;
      };
      address?: {
        street?: string;
        number?: string;
        details?: string;
        district?: string;
        city?: string;
        state?: string;
        zip?: string;
      };
      phones?: Array<{ area?: string | number; number?: string }>;
      emails?: Array<{ address?: string }>;
      mainActivity?: { id?: number; text?: string };
      sideActivities?: Array<{ id?: number; text?: string }>;
    };

    const fone = (p?: { area?: string | number; number?: string }) =>
      p ? `${p.area ?? ""}${p.number ?? ""}`.replace(/\D/g, "") : "";
    const enderecoC = [
      [c.address?.street, c.address?.number].filter(Boolean).join(", "),
      c.address?.details,
      c.address?.district,
      [c.address?.city, c.address?.state].filter(Boolean).join("/"),
      c.address?.zip,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      cnpj: fmtCnpj((c.taxId ?? "").replace(/\D/g, "")) || fmtCnpj(data.cnpj),
      razaoSocial: c.company?.name ?? "",
      nomeFantasia: c.alias ?? "",
      matrizFilial: c.head === true ? "Matriz" : c.head === false ? "Filial" : "",
      situacao: c.status?.text ?? "",
      dataSituacao: fmtDate(c.status?.date),
      dataAbertura: fmtDate(c.founded),
      naturezaJuridica: c.company?.nature?.text ?? "",
      cnaePrincipal: c.mainActivity
        ? `${c.mainActivity.id ?? ""} - ${c.mainActivity.text ?? ""}`.trim()
        : "",
      cnaesSecundarios: (c.sideActivities ?? [])
        .filter((a) => a && (a.id || a.text))
        .map((a) => `${a.id ?? ""} - ${a.text ?? ""}`.trim()),
      endereco: enderecoC,
      telefone1: fone(c.phones?.[0]),
      telefone2: fone(c.phones?.[1]),
      email: c.emails?.[0]?.address ?? "",
      porte: c.company?.size?.text ?? "",
      capitalSocial: fmtMoney(c.company?.equity),
      simples: !!c.company?.simples?.optant,
      dataSimples: fmtDate(c.company?.simples?.since ?? null),
      mei: !!c.company?.simei?.optant,
      dataMei: fmtDate(c.company?.simei?.since ?? null),
      enteFederativo: "",
      socios: (c.company?.members ?? []).map((m) => ({
        nome: m.person?.name ?? "",
        qualificacao: m.role?.text ?? "",
        dataEntrada: fmtDate(m.since),
        faixaEtaria: m.person?.age ?? "",
        pais: m.person?.country?.name ?? "",
      })),
      _fonte: "CNPJá (fallback)" as const,
    };
  });


const NameInput = z.object({
  nome: z.string().trim().min(3, "Digite ao menos 3 caracteres"),
});

export const searchCompanyByName = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => NameInput.parse(input))
  .handler(async ({ data }) => {
    const term = data.nome.trim();
    const digits = term.replace(/\D/g, "");
    if (digits.length === 14) {
      // Se o usuário colou um CNPJ no campo de nome, deixa o front chamar lookupCnpj direto.
      return { itens: [], dica: "cnpj" as const };
    }

    const apiKey = process.env.CNPJA_API_KEY;
    if (!apiKey) throw new Error("CNPJA_API_KEY não configurada");

    // CNPJá — busca em razão social + nome fantasia via filtro names.in
    // Docs: /office aceita `names.in` para full-text nos dois campos.
    const url = new URL("https://api.cnpja.com/office");
    url.searchParams.set("names.in", term);
    url.searchParams.set("limit", "25");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
      },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error("CNPJá: chave inválida ou sem permissão");
      if (res.status === 429)
        throw new Error("CNPJá: limite de requisições atingido. Aguarde alguns segundos.");
      if (res.status === 404) return { itens: [], dica: null };
      const body = await res.text();
      throw new Error(`CNPJá falhou (${res.status}): ${body.slice(0, 200)}`);
    }

    const j = (await res.json()) as {
      records?: Array<{
        taxId?: string;
        alias?: string | null;
        head?: boolean;
        status?: { text?: string };
        company?: { name?: string };
        address?: { city?: string; state?: string };
        mainActivity?: { id?: number; text?: string };
      }>;
    };

    const itens = (j.records ?? [])
      .map((r) => {
        const cnpj = (r.taxId ?? "").replace(/\D/g, "");
        const cidadeUf = [r.address?.city, r.address?.state].filter(Boolean).join("/");
        return {
          cnpj,
          cnpjFormatado:
            cnpj.length === 14
              ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
              : cnpj,
          razaoSocial: r.company?.name ?? "",
          nomeFantasia: r.alias ?? "",
          tipo: r.head === true ? "Matriz" : r.head === false ? "Filial" : "",
          situacao: r.status?.text ?? "",
          cidadeUf,
          atividade: r.mainActivity
            ? `${r.mainActivity.id ?? ""} - ${r.mainActivity.text ?? ""}`.trim()
            : "",
        };
      })
      .filter((x) => x.cnpj.length === 14);

    return { itens, dica: null };
  });

const RdNoteInput = z.object({
  dealId: z.string().trim().min(1, "Informe o ID do negócio"),
  text: z.string().trim().min(1, "Histórico vazio"),
});

function stripHtmlToText(html: string): string {
  return String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const sendRdStationNote = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => z.object({ dealId: z.string(), text: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const token = process.env.RD_STATION_CRM_TOKEN;
    if (!token) throw new Error("RD_STATION_CRM_TOKEN não configurado");
    const cleanId = data.dealId.match(/[a-f0-9]{24}/i)?.[0] || data.dealId.trim();
    const url = `https://crm.rdstation.com/api/v1/notes?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ note: { text: data.text, deal_id: cleanId } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Falha ao enviar anotação para o RD Station: ${res.status} ${body.slice(0, 200)}`);
    }
    return { ok: true };
  });

export const searchRdDeals = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => z.object({ query: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const token = process.env.RD_STATION_CRM_TOKEN;
    if (!token) throw new Error("RD_STATION_CRM_TOKEN não configurado");

    // Se for CNPJ, usa só dígitos; senão, mantém o termo trimado.
    const raw = data.query.trim();
    const digits = raw.replace(/\D/g, "");
    const query = digits.length === 14 ? digits : raw.replace(/[^\p{L}\p{N}\s.&/-]+/gu, "").trim();
    if (!query) return { deals: [] as { id: string; name: string; organization: string | null; stage: string | null }[] };

    const url =
      `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}` +
      `&query=${encodeURIComponent(query)}&limit=5`;

    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return { deals: [] };
      const body = (await res.json().catch(() => null)) as
        | { deals?: unknown[] }
        | unknown[]
        | null;
      const raw = Array.isArray(body) ? body : Array.isArray(body?.deals) ? body!.deals : [];
      const deals = raw
        .map((d) => {
          const x = d as Record<string, unknown>;
          // O RD retorna o id como string simples ou objeto aninhado ({$oid}).
          const rawId = (x.id ?? x._id ?? x.deal_id ?? null) as unknown;
          const idStr =
            typeof rawId === "string"
              ? rawId
              : rawId && typeof rawId === "object"
                ? String(
                    (rawId as { $oid?: unknown; id?: unknown }).$oid ??
                      (rawId as { id?: unknown }).id ??
                      "",
                  )
                : rawId != null
                  ? String(rawId)
                  : "";
          const id = (idStr.match(/[a-f0-9]{24}/i)?.[0] ?? idStr).trim();
          if (!id) return null;

          const name = String((x.name ?? x.title ?? "Negócio sem nome") as string);
          const orgRaw = x.organization as Record<string, unknown> | string | null | undefined;
          const organization =
            typeof orgRaw === "string"
              ? orgRaw
              : orgRaw && typeof orgRaw === "object" && "name" in orgRaw
                ? String((orgRaw as { name?: unknown }).name ?? "")
                : null;
          const stageRaw = x.deal_stage as Record<string, unknown> | undefined;
          const stage = stageRaw && typeof stageRaw === "object" && "name" in stageRaw
            ? String((stageRaw as { name?: unknown }).name ?? "")
            : (x.stage as string | null) ?? null;
          return { id, name, organization: organization || null, stage: stage || null };
        })
        .filter(Boolean) as { id: string; name: string; organization: string | null; stage: string | null }[];
      return { deals };
    } catch {
      return { deals: [] };
    }
  });

export const searchRdStationDeals = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => z.object({ query: z.string().trim().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const token = process.env.RD_STATION_CRM_TOKEN;
    if (!token) throw new Error("RD_STATION_CRM_TOKEN não configurado");
    const url = `https://crm.rdstation.com/api/v1/deals?token=${encodeURIComponent(token)}&name=${encodeURIComponent(data.query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Erro API RD: ${res.status}`);
    const body = (await res.json().catch(() => null)) as { deals?: unknown[] } | unknown[] | null;
    const dealsArray = Array.isArray(body) ? body : Array.isArray(body?.deals) ? body!.deals : [];
    return dealsArray
      .map((d) => {
        const x = d as Record<string, unknown>;
        const id = String((x.id ?? x._id ?? "") as string).trim();
        if (!id) return null;
        const name = String((x.name ?? x.title ?? "Negócio sem nome") as string);
        const orgRaw = x.organization as Record<string, unknown> | string | null | undefined;
        const empresa =
          typeof orgRaw === "string"
            ? orgRaw
            : orgRaw && typeof orgRaw === "object" && "name" in orgRaw
              ? String((orgRaw as { name?: unknown }).name ?? "Empresa não vinculada")
              : "Empresa não vinculada";
        const stageRaw = x.deal_stage as Record<string, unknown> | undefined;
        const stage = stageRaw && typeof stageRaw === "object" && "name" in stageRaw
          ? String((stageRaw as { name?: unknown }).name ?? "Sem Etapa")
          : "Sem Etapa";
        return { id, name, empresa: empresa || "Empresa não vinculada", stage };
      })
      .filter(Boolean) as { id: string; name: string; empresa: string; stage: string }[];
  });

export const fetchRdStationDeal = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => z.object({ dealId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const token = process.env.RD_STATION_CRM_TOKEN;
    if (!token) throw new Error("RD_STATION_CRM_TOKEN não configurado");
    const t = encodeURIComponent(token);
    const cleanId = data.dealId.match(/[a-f0-9]{24}/i)?.[0] || data.dealId.trim();
    const dealId = encodeURIComponent(cleanId);

    async function get(url: string, allow404 = false): Promise<any> {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      const body = await r.text();
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) throw new Error("Token CRM inválido");
        if (r.status === 404) {
          if (allow404) return null;
          throw new Error("Negócio não encontrado");
        }
        throw new Error(`Erro RD: ${r.status}`);
      }
      return body ? JSON.parse(body) : {};
    }

    const [deal, notas, atividades] = await Promise.all([
      get(`https://crm.rdstation.com/api/v1/deals/${dealId}?token=${t}`, true),
      get(`https://crm.rdstation.com/api/v1/deals/${dealId}/notes?token=${t}`, true),
      get(`https://crm.rdstation.com/api/v1/activities?token=${t}&deal_id=${dealId}`, true),
    ]);
    if (!deal) return { texto: "", totalNotas: 0, totalAtividades: 0, notFound: true as const };

    const notesArr: any[] = notas ? (Array.isArray(notas) ? notas : notas.notes ?? []) : [];
    const activitiesArr: any[] = atividades
      ? Array.isArray(atividades)
        ? atividades
        : atividades.activities ?? []
      : [];

    // Data de hoje YYYY-MM-DD no fuso de Brasília
    const hojeStr = new Date()
      .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      .split("/")
      .reverse()
      .join("-");

    const fmtHora = (iso: string) =>
      iso
        ? new Date(iso).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })
        : "";

    const isFichaLixo = (low: string) =>
      low.includes("ficha de qualificação") ||
      low.includes("status e qualificação") ||
      low.includes("dados para copiar e colar");

    type Feed = {
      tipo: "NOTA" | "GRAVAÇÃO/TAREFA";
      texto: string;
      hora: string;
      timestamp: number;
      user: string;
      data: string;
    };

    const feedUnificado: Feed[] = [];

    // 1. Notas
    notesArr.forEach((n: any) => {
      const texto = stripHtmlToText(n.text ?? "").trim();
      const data = n.created_at ? String(n.created_at).slice(0, 10) : "";
      if (!texto || isFichaLixo(texto.toLowerCase())) return;
      feedUnificado.push({
        tipo: "NOTA",
        texto,
        hora: fmtHora(n.created_at),
        timestamp: n.created_at ? new Date(n.created_at).getTime() : 0,
        user: n.user?.name || "Operador",
        data,
      });
    });

    // 2. Atividades (ligações da discadora/Attention entram aqui)
    activitiesArr.forEach((a: any) => {
      const titulo = (a.subject || a.title || "Interação Comercial").toString().trim();
      const corpo = stripHtmlToText(a.description || a.text || a.notes || "").trim();
      if (!titulo && !corpo) return;
      const iso = a.created_at || a.updated_at || a.date || "";
      const data = iso ? String(iso).slice(0, 10) : "";
      const texto = corpo ? `[${titulo}]\n${corpo}` : `[${titulo}]`;
      if (isFichaLixo(texto.toLowerCase())) return;
      feedUnificado.push({
        tipo: "GRAVAÇÃO/TAREFA",
        texto,
        hora: fmtHora(iso),
        timestamp: iso ? new Date(iso).getTime() : 0,
        user: a.user?.name || "Discadora",
        data,
      });
    });

    const feedHoje = feedUnificado.filter((f) => f.data === hojeStr);

    const linhas: string[] = [];
    if (deal.name) linhas.push(`NEGÓCIO CRM: ${deal.name}`);

    if (feedHoje.length > 0) {
      feedHoje.sort((a, b) => a.timestamp - b.timestamp);
      linhas.push(
        `\n▲ [LINHA DO TEMPO DE INTERAÇÕES DE HOJE — ${hojeStr.split("-").reverse().join("/")}]:`,
      );
      feedHoje.forEach((item, index) => {
        linhas.push(
          `\n--- REGISTRO #${index + 1} [${item.tipo}] às ${item.hora} por ${item.user} ---`,
          item.texto,
        );
      });
      linhas.push("\n▲ [FIM DA LINHA DO TEMPO DIÁRIA]");

      return {
        texto: linhas.join("\n").trim(),
        totalNotas: notesArr.length,
        totalAtividades: activitiesArr.length,
        totalTranscricoes: feedHoje.length,
      };
    }

    // Fallback: último registro válido do histórico geral (nota ou atividade)
    if (feedUnificado.length > 0) {
      feedUnificado.sort((a, b) => b.timestamp - a.timestamp);
      linhas.push(
        "\n[NENHUMA INTERAÇÃO HOJE. EXIBINDO ÚLTIMO REGISTRO DO HISTÓRICO]:",
        feedUnificado[0].texto,
      );
      return {
        texto: linhas.join("\n").trim(),
        totalNotas: notesArr.length,
        totalAtividades: activitiesArr.length,
        totalTranscricoes: 0,
      };
    }

    return {
      texto: "",
      totalNotas: notesArr.length,
      totalAtividades: activitiesArr.length,
      msg: "Sem registros novos." as const,
    };
  });

// ============================================================
// enrichPhones — junta telefones de BrasilAPI + cnpja.com + cnpj.biz + site oficial
// ============================================================

const EnrichPhonesInput = z.object({
  cnpj: z.string().transform((v) => v.replace(/\D/g, "")),
});

type Fonte = "BrasilAPI" | "CNPJá" | "CNPJ.biz" | "Site oficial";
type TelefoneAchado = {
  numero: string; // formatado (XX) XXXX-XXXX ou (XX) 9XXXX-XXXX
  digits: string; // só dígitos (para dedupe)
  setor: string | null;
  prioridade: number;
  fontes: Fonte[];
};

// DDDs válidos no Brasil
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function formatFone(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return null;
  const rest = d.slice(2);
  if (rest.length === 10) {
    // 9XXXX-XXXX
    return `(${d.slice(0, 2)}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  // XXXX-XXXX
  return `(${d.slice(0, 2)}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

// Detecta setor a partir do contexto (150 chars ao redor do match)
function detectSetor(contexto: string): { setor: string | null; prioridade: number } {
  const t = contexto.toLowerCase();
  // ordem = prioridade (menor número = maior prioridade)
  const regras: Array<[RegExp, string, number]> = [
    [/\bfiscal\b/, "Fiscal", 1],
    [/contab|contad/, "Contabilidade", 1],
    [/tribut/, "Tributário", 1],
    [/financ/, "Financeiro", 2],
    [/\b(diretor|ceo|s[oó]cio|presiden|gerente)\b/, "Direção", 3],
    [/comerc|vendas|atendiment|sac/, "Comercial", 4],
    [/rh\b|recursos\s+humanos|departamento\s+pessoal|dp\b/, "RH/DP", 5],
    [/whatsapp|whats\b/, "WhatsApp", 6],
    [/celular|m[oó]vel/, "Celular", 6],
    [/fixo|telefone/, "Fixo", 7],
  ];
  for (const [re, nome, p] of regras) {
    if (re.test(t)) return { setor: nome, prioridade: p };
  }
  return { setor: null, prioridade: 8 };
}

// Extrai telefones de um texto qualquer, retorna com contexto
function extractPhonesFromText(text: string): Array<{ digits: string; contexto: string }> {
  if (!text) return [];
  const found: Array<{ digits: string; contexto: string }> = [];
  // Aceita: (11) 3456-7890, 11 34567890, +55 11 3456-7890, 11.3456.7890, etc.
  const re = /(?:\+?55\s*)?\(?(\d{2})\)?[\s\-.]{0,3}(9?\d{4})[\s\-.]{0,3}(\d{4})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) continue;
    const start = Math.max(0, m.index - 80);
    const end = Math.min(text.length, m.index + m[0].length + 80);
    const contexto = text.slice(start, end).replace(/\s+/g, " ");
    found.push({ digits, contexto });
  }
  return found;
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 1500,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data?: { markdown?: string };
      markdown?: string;
    };
    return j.data?.markdown ?? j.markdown ?? null;
  } catch {
    return null;
  }
}


export const enrichPhones = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((input: unknown) => EnrichPhonesInput.parse(input))
  .handler(async ({ data }) => {
    const cnpj = data.cnpj;
    if (cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos");

    const acumulador = new Map<string, TelefoneAchado>();
    const fontesUsadas: Fonte[] = [];
    const fontesFalhas: Array<{ fonte: Fonte; motivo: string }> = [];
    let siteOficial: string | null = null;

    function registrar(rawDigits: string, contexto: string, fonte: Fonte) {
      const numero = formatFone(rawDigits);
      if (!numero) return;
      const digits = rawDigits.replace(/\D/g, "");
      const { setor, prioridade } = detectSetor(contexto);
      const existente = acumulador.get(digits);
      if (existente) {
        if (!existente.fontes.includes(fonte)) existente.fontes.push(fonte);
        // se novo contexto trouxe setor melhor, atualiza
        if (setor && prioridade < existente.prioridade) {
          existente.setor = setor;
          existente.prioridade = prioridade;
        }
        return;
      }
      acumulador.set(digits, {
        numero,
        digits,
        setor,
        prioridade,
        fontes: [fonte],
      });
    }

    // ---- Estágio 1: BrasilAPI + CNPJá + CNPJ.biz em PARALELO ----
    // (independentes entre si; ganho de UX significativo — antes rodavam em série)
    const cnpjaKey = process.env.CNPJA_API_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;

    const brasilApiTask = (async () => {
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return { ok: false as const, motivo: `HTTP ${r.status}` };
        const j = (await r.json()) as { ddd_telefone_1?: string; ddd_telefone_2?: string };
        return { ok: true as const, data: j };
      } catch (e) {
        return { ok: false as const, motivo: e instanceof Error ? e.message : "erro" };
      }
    })();

    const cnpjaTask = cnpjaKey
      ? (async () => {
          try {
            const r = await fetch(`https://api.cnpja.com/office/${cnpj}`, {
              headers: { Accept: "application/json", Authorization: cnpjaKey },
              signal: AbortSignal.timeout(10000),
            });
            if (!r.ok) return { ok: false as const, motivo: `HTTP ${r.status}` };
            const j = (await r.json()) as {
              phones?: Array<{ area?: string | number; number?: string; type?: string }>;
              emails?: Array<{ address?: string }>;
            };
            return { ok: true as const, data: j };
          } catch (e) {
            return { ok: false as const, motivo: e instanceof Error ? e.message : "erro" };
          }
        })()
      : Promise.resolve({ ok: false as const, motivo: "CNPJA_API_KEY não configurada" });

    const cnpjBizTask = firecrawlKey
      ? firecrawlScrape(`https://cnpj.biz/${cnpj}`, firecrawlKey)
      : Promise.resolve(null);

    const [brasilRes, cnpjaRes, cnpjBizMd] = await Promise.all([
      brasilApiTask,
      cnpjaTask,
      cnpjBizTask,
    ]);

    // Processa BrasilAPI
    if (brasilRes.ok) {
      const j = brasilRes.data;
      if (j.ddd_telefone_1) registrar(j.ddd_telefone_1, "telefone principal cadastrado na Receita", "BrasilAPI");
      if (j.ddd_telefone_2) registrar(j.ddd_telefone_2, "telefone secundário cadastrado na Receita", "BrasilAPI");
      fontesUsadas.push("BrasilAPI");
    } else {
      fontesFalhas.push({ fonte: "BrasilAPI", motivo: brasilRes.motivo });
    }

    // Processa CNPJá
    if (cnpjaRes.ok) {
      const j = cnpjaRes.data;
      for (const p of j.phones ?? []) {
        const raw = `${p.area ?? ""}${p.number ?? ""}`.replace(/\D/g, "");
        const ctx = `${p.type ?? ""} cadastrado na Receita`;
        registrar(raw, ctx, "CNPJá");
      }
      if (!siteOficial) {
        for (const e of j.emails ?? []) {
          const dominio = e.address?.split("@")[1];
          if (
            dominio &&
            !/gmail|hotmail|outlook|yahoo|uol|bol|terra|live|icloud/i.test(dominio)
          ) {
            siteOficial = `https://${dominio}`;
            break;
          }
        }
      }
      fontesUsadas.push("CNPJá");
    } else {
      fontesFalhas.push({ fonte: "CNPJá", motivo: cnpjaRes.motivo });
    }

    // Processa CNPJ.biz
    if (!firecrawlKey) {
      fontesFalhas.push({ fonte: "CNPJ.biz", motivo: "FIRECRAWL_API_KEY não configurada" });
    } else if (cnpjBizMd) {
      if (!siteOficial) {
        const mSite = cnpjBizMd.match(/https?:\/\/(?!cnpj\.biz|receita|brasilapi|whatsapp|wa\.me|facebook|instagram|linkedin|youtube|twitter|maps\.google|google\.com)([a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/i);
        if (mSite) siteOficial = mSite[0];
      }
      for (const ph of extractPhonesFromText(cnpjBizMd)) {
        registrar(ph.digits, ph.contexto, "CNPJ.biz");
      }
      fontesUsadas.push("CNPJ.biz");
    } else {
      fontesFalhas.push({ fonte: "CNPJ.biz", motivo: "sem resposta do Firecrawl" });
    }

    // ---- Estágio 2: Site oficial (home + /contato em PARALELO) ----
    if (siteOficial && firecrawlKey) {
      const base = siteOficial.replace(/\/$/, "");
      const urls: string[] = [siteOficial, `${base}/contato`];
      const results = await Promise.all(urls.map((u) => firecrawlScrape(u, firecrawlKey)));
      let algumaOk = false;
      for (const md of results) {
        if (!md) continue;
        algumaOk = true;
        for (const ph of extractPhonesFromText(md)) {
          registrar(ph.digits, ph.contexto, "Site oficial");
        }
      }
      if (algumaOk) fontesUsadas.push("Site oficial");
      else fontesFalhas.push({ fonte: "Site oficial", motivo: `nenhuma página respondeu (${siteOficial})` });
    } else if (!siteOficial) {
      fontesFalhas.push({ fonte: "Site oficial", motivo: "site não identificado" });
    }



    // ordena: prioridade ↑, depois número de fontes ↓ (quanto mais fontes confirmarem, melhor)
    const telefones = Array.from(acumulador.values()).sort((a, b) => {
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
      return b.fontes.length - a.fontes.length;
    });

    return {
      telefones: telefones.map((t) => ({
        numero: t.numero,
        setor: t.setor,
        fontes: t.fontes,
      })),
      siteOficial,
      fontesUsadas,
      fontesFalhas,
    };
  });


// ==============================================================
// Gerador de Ata Executiva (Central de Reuniões — Estágio 2)
// ==============================================================
export const generateMeetingMinutes = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) => {
    const s = z
      .object({
        empresa: z.string().min(1),
        contato: z.string().optional().default(""),
        cargo: z.string().optional().default(""),
        cnpj: z.string().optional().default(""),
        observacoes: z.string().optional().default(""),
        dataReuniao: z.string().optional().default(""),
      })
      .parse(data);
    return s;
  })
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    const gateway = createLovableAiGatewayProvider(key);
    const prompt = `Você é advogado tributarista da BHM Advogados. Redija a ATA EXECUTIVA DE ALINHAMENTO da reunião abaixo, em português formal e objetivo (máx. 350 palavras), estruturada nesta ordem exata:

1. **CABEÇALHO**: Empresa, CNPJ, Interlocutor, Data da reunião.
2. **CONTEXTO E DIAGNÓSTICO PRELIMINAR**: 2-3 linhas sobre atividade e potencial tributário.
3. **TESES APRESENTADAS** (bullet points, cite apenas as pertinentes ao caso):
   - ICMS/IPI sobre Insumos Intermediários (recuperação de créditos)
   - PIS/COFINS — exclusão de ICMS da base + insumos essenciais
   - IRPJ/CSLL — reversão de adições indevidas / exclusões do lucro real
4. **PRÓXIMOS PASSOS ACORDADOS**.
5. **DADOS PARA PROCURAÇÃO E-CAC** (bloco fixo, copiar literal):
   > Razão Social: G2 Consulting - Soluções Fiscais Ltda | CNPJ: 62.633.741/0001-67 | Poderes: Todos os poderes.
   > ALTERNATIVA: Envio direto de arquivos .TXT dos últimos 5 anos (EFD ICMS/IPI, EFD Contribuições, ECD, ECF).

DADOS DA REUNIÃO:
Empresa: ${data.empresa}
CNPJ: ${data.cnpj || "não informado"}
Contato: ${data.contato || "não informado"}${data.cargo ? ` (${data.cargo})` : ""}
Data: ${data.dataReuniao || "não informada"}
Observações do consultor: ${data.observacoes || "sem observações registradas"}

Retorne APENAS o texto da ata em Markdown, sem preâmbulo.`;
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      prompt,
    });
    return { ata: text.trim() };
  });

/* ------------------------------------------------------------------ *
 * Análise AVANÇADA da dinâmica da conversa (aditiva, opcional)
 * ------------------------------------------------------------------ */

const AnaliseAvancadaSchema = z.object({
  proporcao_fala_vendedor: z.number().min(0).max(100).nullable(),
  termos_chave_cliente: z.array(z.string()).max(8),
  sinais_de_fechamento: z.array(z.string()).max(5),
  vendedor_falou_demais: z.boolean().nullable(),
});

export type AnaliseAvancada = z.infer<typeof AnaliseAvancadaSchema>;

const ANALISE_AVANCADA_SYSTEM_PROMPT = `Você analisa a DINÂMICA de uma ligação de
prospecção tributária (BHM Advogados) a partir da transcrição/relato.
Não repita o resumo da conversa — foque em PADRÕES: quem dominou a fala, que
termos o CLIENTE usou (não o vendedor), e se houve sinais concretos de avanço.
Se o texto não permitir estimar algo (ex.: proporção de fala), devolva null
nesse campo em vez de inventar um número.`;

export const analisarConversaAvancada = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((input: unknown) => z.object({ descricao: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<AnaliseAvancada | null> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const gateway = createLovableAiGatewayProvider(key);
    try {
      const { object } = await generateObject({
        model: gateway("google/gemini-2.5-flash"),
        schema: AnaliseAvancadaSchema,
        system: ANALISE_AVANCADA_SYSTEM_PROMPT,
        prompt: `Conversa:\n${data.descricao.slice(0, 20000)}`,
        temperature: 0.2,
      });
      return object;
    } catch (err) {
      // Degrada em silêncio: nunca bloqueia o histórico.
      if (NoObjectGeneratedError.isInstance(err)) return null;
      return null;
    }
  });

/** Persiste a análise de dinâmica (tabela travada — só via service role). */
export const salvarAnaliseConversa = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        historico_id: z.string().uuid(),
        proporcao_fala_vendedor: z.number().nullable().optional(),
        termos_chave_cliente: z.array(z.string()).default([]),
        sinais_de_fechamento: z.array(z.string()).default([]),
        vendedor_falou_demais: z.boolean().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("analises_conversa").insert({
      historico_id: data.historico_id,
      proporcao_fala_vendedor: data.proporcao_fala_vendedor ?? null,
      termos_chave_cliente: data.termos_chave_cliente,
      sinais_de_fechamento: data.sinais_de_fechamento,
      vendedor_falou_demais: data.vendedor_falou_demais ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
