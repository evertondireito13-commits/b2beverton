// Banco local de históricos de prospecção (localStorage).
// Salva cada histórico gerado no Pós-ligação para consulta futura e
// para alimentar o Relatório Diário Comercial e o alerta de follow-ups.

export type Consultor = "Everton Pereira" | "Eloane Manfroni";
export const CONSULTORES: Consultor[] = ["Everton Pereira", "Eloane Manfroni"];
const CONSULTOR_KEY = "bhm.consultor";

export function getConsultor(): Consultor {
  if (typeof window === "undefined") return "Everton Pereira";
  const v = window.localStorage.getItem(CONSULTOR_KEY);
  // aceita também "Heluane Manfroni" (valor legado) e mapeia para o nome novo
  if (v === "Eloane Manfroni" || v === "Heluane Manfroni") return "Eloane Manfroni";
  return "Everton Pereira";
}
export function setConsultor(c: Consultor) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSULTOR_KEY, c);
  window.dispatchEvent(new Event("bhm:historico-updated"));
}

export type HistoricoStatus = "pendente" | "concluido" | "arquivado";

export type HistoricoEmpresa = {
  id: string;
  dataIso: string; // ISO completo
  dataFormatada: string; // dd/mm/aaaa
  empresaNome: string;
  cnpj?: string | null;
  contato?: string | null;
  cargo?: string | null;
  resultado?: string | null; // Falou com decisor / Não atendeu / etc
  interesse?: string | null; // Alto / Médio / Baixo / Nenhum
  proximaAcao?: string | null; // Texto completo
  proximaAcaoData?: string | null; // ISO se identificamos DD/MM/AAAA
  objecao?: string | null;
  textoHistoricoCompleto: string;
  descricaoOriginal?: string | null;
  consultor?: Consultor | null;
  status?: HistoricoStatus; // 'pendente' padrão; 'arquivado' após negativa; 'concluido' quando reunião marcada
  arquivadoManual?: boolean; // marcação explícita "dar baixa" no formulário
  /** ISO — quando este registro foi excluído junto com a empresa (soft-delete). */
  excluidoEm?: string | null;
  /** Motivo informado ao excluir a empresa (mesmo motivo do lead). */
  excluidoMotivo?: string | null;
};


const KEY_BASE = "bhm_historico_empresas";

function isBrowser() {
  return typeof window !== "undefined";
}

function historicosKey(): string {
  const c = getSessionConsultor() ?? getConsultor();
  return `${KEY_BASE}::${c}`;
}

/** Grava o cache local e espelha a lista na nuvem (Supabase). */
function writeHistoricos(list: HistoricoEmpresa[]) {
  if (!isBrowser()) return;
  const c = getSessionConsultor() ?? getConsultor();
  window.localStorage.setItem(historicosKey(), JSON.stringify(list));
  void import("@/lib/cloud-store").then((m) =>
    m.scheduleCloudSync("historico", list.map((r) => m.historicoToRow(r, c)), c),
  );
}

/** Leitura crua do storage — inclui registros excluídos. Uso interno. */
function readAllHistoricos(): HistoricoEmpresa[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(historicosKey());
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoricoEmpresa[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Histórico ativo (não excluído). É o que o resto do app deve usar. */
export function listHistoricos(): HistoricoEmpresa[] {
  return readAllHistoricos().filter((r) => !r.excluidoEm);
}

/** Registros de histórico excluídos junto com uma empresa (soft-delete). */
export function listHistoricosExcluidos(): HistoricoEmpresa[] {
  return readAllHistoricos().filter((r) => !!r.excluidoEm);
}

export function saveHistorico(reg: HistoricoEmpresa): HistoricoEmpresa[] {
  if (!isBrowser()) return [];
  const list = readAllHistoricos();
  list.unshift(reg);
  const trimmed = list.slice(0, 2000);
  try {
    writeHistoricos(trimmed);
    window.dispatchEvent(new Event("bhm:historico-updated"));
  } catch {
    /* quota */
  }
  return trimmed;
}

/**
 * Remove TODOS os registros de histórico do consultor logado
 * (inclui a chave legada global para não voltarem via merge).
 */
export function clearHistoricos(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(KEY_BASE);
    writeHistoricos([]);
    window.dispatchEvent(new Event("bhm:historico-updated"));
  } catch {
    /* noop */
  }
}

/**
 * Remove APENAS os registros de histórico que casam com a empresa informada
 * (por CNPJ, quando presente, ou por nome normalizado). Permite retestar o
 * mesmo lead sem apagar a carteira inteira do operador.
 */
export function deleteHistoricosByEmpresa(
  target: { cnpj?: string | null; empresaNome?: string | null },
): number {
  if (!isBrowser()) return 0;
  const cnpjDigits = (target.cnpj ?? "").replace(/\D/g, "");
  const nomeKey = target.empresaNome
    ? normalizarTexto(target.empresaNome).replace(/[^a-z0-9]/g, "")
    : "";
  if (!cnpjDigits && !nomeKey) return 0;
  const list = readAllHistoricos();
  const filtered = list.filter((r) => {
    const rc = (r.cnpj ?? "").replace(/\D/g, "");
    if (cnpjDigits && rc && rc === cnpjDigits) return false;
    if (nomeKey) {
      const rn = normalizarTexto(r.empresaNome ?? "").replace(/[^a-z0-9]/g, "");
      if (rn && rn === nomeKey) return false;
    }
    return true;
  });
  const removed = list.length - filtered.length;
  if (removed > 0) {
    try {
      writeHistoricos(filtered);
      window.dispatchEvent(new Event("bhm:historico-updated"));
    } catch { /* quota */ }
  }
  return removed;
}

/**
 * Soft-delete: marca os registros de histórico que casam com a empresa
 * (mesmo critério de `historicoMatchesEmpresa`) como excluídos, sem apagar
 * nada — usado junto com `deleteLead` no fluxo de "Excluir empresa" da
 * Central, para que a restauração traga o histórico completo de volta.
 */
export function softDeleteHistoricosByEmpresa(
  target: { cnpj?: string | null; empresaNome?: string | null },
  motivo?: string,
): number {
  if (!isBrowser()) return 0;
  const list = readAllHistoricos();
  const now = new Date().toISOString();
  const motivoLimpo = motivo?.trim() || null;
  let count = 0;
  const next = list.map((r) => {
    if (r.excluidoEm) return r; // já excluído, não mexe
    if (!historicoMatchesEmpresa(r, target)) return r;
    count++;
    return { ...r, excluidoEm: now, excluidoMotivo: motivoLimpo };
  });
  if (count > 0) {
    try {
      writeHistoricos(next);
      window.dispatchEvent(new Event("bhm:historico-updated"));
    } catch { /* quota */ }
  }
  return count;
}

/**
 * Reverte o soft-delete dos registros de histórico de uma empresa —
 * usado junto com `restoreLead` para trazer o histórico completo de volta.
 */
export function restoreHistoricosByEmpresa(
  target: { cnpj?: string | null; empresaNome?: string | null },
): number {
  if (!isBrowser()) return 0;
  const list = readAllHistoricos();
  let count = 0;
  const next = list.map((r) => {
    if (!r.excluidoEm) return r;
    if (!historicoMatchesEmpresa(r, target)) return r;
    count++;
    return { ...r, excluidoEm: null, excluidoMotivo: null };
  });
  if (count > 0) {
    try {
      writeHistoricos(next);
      window.dispatchEvent(new Event("bhm:historico-updated"));
    } catch { /* quota */ }
  }
  return count;
}

/**
 * Atualiza o status do histórico (ex.: após classificação assíncrona do
 * desfecho da conversa). Sem id, aplica no registro mais recente.
 */
export function updateHistoricoStatus(status: HistoricoStatus, id?: string): HistoricoEmpresa | null {
  if (!isBrowser()) return null;
  const list = readAllHistoricos();
  if (list.length === 0) return null;
  const idx = id ? list.findIndex((r) => r.id === id) : 0;
  if (idx < 0) return null;
  const updated: HistoricoEmpresa = { ...list[idx], status };
  list[idx] = updated;
  try {
    writeHistoricos(list);
    window.dispatchEvent(new Event("bhm:historico-updated"));
  } catch {
    /* quota */
  }
  return updated;
}

/**
 * Arquiva uma empresa: marca o histórico MAIS RECENTE dela como 'arquivado'
 * (baixa manual). O histórico continua existindo e acessível pelos filtros.
 */
export function arquivarEmpresaHistorico(
  empresa: string,
  cnpj?: string | null,
): boolean {
  if (!isBrowser()) return false;
  const list = readAllHistoricos();
  const key = empresaKey(empresa);
  const digitos = (cnpj ?? "").replace(/\D/g, "");
  const candidatos = list
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => {
      if (r.excluidoEm) return false;
      const rk = empresaKey(r.empresaNome);
      const rc = (r.cnpj ?? "").replace(/\D/g, "");
      return (!!digitos && !!rc && rc === digitos) || (!!key && rk === key);
    })
    .sort(
      (a, b) => new Date(b.r.dataIso).getTime() - new Date(a.r.dataIso).getTime(),
    );
  if (candidatos.length === 0) return false;
  const alvo = candidatos[0];
  list[alvo.idx] = { ...alvo.r, status: "arquivado", arquivadoManual: true };
  try {
    writeHistoricos(list);
    window.dispatchEvent(new Event("bhm:historico-updated"));
  } catch {
    /* quota */
  }
  return true;
}



/**
 * Renomeia a empresa de um histórico específico (por id) e propaga para todos
 * os registros que casem por CNPJ ou pelo nome anterior normalizado. Dispara
 * `bhm:historico-updated` para reatividade global.
 */
export function updateHistoricoEmpresa(id: string, novoNome: string): HistoricoEmpresa | null {
  if (!isBrowser()) return null;
  const nome = novoNome.trim();
  if (!nome) return null;
  const list = readAllHistoricos();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const alvo = list[idx];
  const cnpjDigits = (alvo.cnpj ?? "").replace(/\D/g, "");
  const antigo = normalizarTexto(alvo.empresaNome ?? "").replace(/\s+/g, "");
  const next = list.map((r) => {
    if (r.id === alvo.id) return { ...r, empresaNome: nome };
    const rc = (r.cnpj ?? "").replace(/\D/g, "");
    const rn = normalizarTexto(r.empresaNome ?? "").replace(/\s+/g, "");
    if ((cnpjDigits && rc && rc === cnpjDigits) || (antigo && rn === antigo)) {
      return { ...r, empresaNome: nome };
    }
    return r;
  });
  try {
    writeHistoricos(next);
    window.dispatchEvent(new Event("bhm:historico-updated"));
  } catch {
    /* quota */
  }
  return next[idx] ?? null;
}

/**
 * Atualiza contato/cargo de um registro específico e dispara evento global
 * `bhm:historico-updated` para reatividade em toda a app.
 */
export function updateHistoricoContatoCargo(
  id: string,
  patch: { contato?: string | null; cargo?: string | null },
): HistoricoEmpresa | null {
  if (!isBrowser()) return null;
  const list = readAllHistoricos();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const updated: HistoricoEmpresa = {
    ...list[idx],
    ...(patch.contato !== undefined ? { contato: patch.contato?.trim() || null } : {}),
    ...(patch.cargo !== undefined ? { cargo: patch.cargo?.trim() || null } : {}),
  };
  list[idx] = updated;
  try {
    writeHistoricos(list);
    window.dispatchEvent(new Event("bhm:historico-updated"));
  } catch { /* quota */ }
  return updated;
}





/**
 * Chave canônica de empresa: minúscula, sem acentos, sem pontuação e sem
 * sufixos societários (ltda, s/a, me, epp, eireli, indústria, comércio…).
 * Usada para casar "TOMAZELLI IND. E COM. LTDA" com "Tomazelli".
 */
export function empresaKey(nome: string | null | undefined): string {
  const base = normalizarTexto(nome ?? "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  const STOP = new Set([
    "ltda", "ltd", "sa", "s", "a", "me", "epp", "eireli", "mei", "cia",
    "industria", "industrial", "comercio", "comercial", "servicos", "servico",
    "e", "de", "da", "do", "das", "dos", "em", "ind", "com", "grupo",
    "empresa", "transportes", "transporte", "distribuidora", "produtos",
  ]);
  const tokens = base.split(" ").filter((t) => t && !STOP.has(t));
  return (tokens.length ? tokens : base.split(" ")).join(" ");
}

/** Primeiro token significativo (marca) da empresa. */
function empresaMarca(nome: string | null | undefined): string {
  const k = empresaKey(nome);
  const first = k.split(" ")[0] ?? "";
  return first.length >= 4 ? first : k;
}

/** Comparação tolerante entre dois nomes de empresa. */
export function mesmaEmpresa(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = empresaKey(a);
  const kb = empresaKey(b);
  if (!ka || !kb) return false;
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
  const ma = empresaMarca(a);
  const mb = empresaMarca(b);
  return !!ma && !!mb && ma === mb;
}

/**
 * Casa um registro de histórico com uma empresa alvo, por CNPJ limpo OU por
 * nome normalizado. Garante que a conversa nunca "suma" quando um dos lados
 * está sem CNPJ ou com razão social abreviada.
 */
export function historicoMatchesEmpresa(
  h: { cnpj?: string | null; empresaNome?: string | null },
  target: { cnpj?: string | null; empresaNome?: string | null },
): boolean {
  const hc = (h.cnpj ?? "").replace(/\D/g, "");
  const tc = (target.cnpj ?? "").replace(/\D/g, "");
  if (hc && tc && hc.length >= 8 && hc === tc) return true;
  return mesmaEmpresa(h.empresaNome, target.empresaNome);
}

export function searchHistoricos(term: string): HistoricoEmpresa[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const digits = t.replace(/\D/g, "");
  const termKey = empresaKey(t);
  return listHistoricos().filter((r) => {
    const nome = (r.empresaNome ?? "").toLowerCase();
    if (nome.includes(t)) return true;
    if (digits.length >= 4 && r.cnpj && r.cnpj.replace(/\D/g, "").includes(digits)) return true;
    if (termKey) {
      const rKey = empresaKey(r.empresaNome);
      if (rKey && (rKey.includes(termKey) || termKey.includes(rKey))) return true;
    }
    if ((r.contato ?? "").toLowerCase().includes(t)) return true;
    return false;
  });
}


// -------- Parsers do texto do histórico ----------

function limparMarcacao(v: string): string {
  return v.replace(/\*\*|__/g, "").trim().replace(/[.\s]+$/, "").trim();
}

export function normalizarTexto(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function textoIndicaNegativaComercial(texto: string): boolean {
  const blob = normalizarTexto(texto);
  if (!blob) return false;

  return [
    /\brecus\w*/,
    /\bnegativ\w*/,
    /\bdeclin\w*/,
    /\bdispens\w*/,
    /\bdesist\w*/,
    /\bsem interesse\b/,
    /\bsem (necessidade|demanda|abertura|fit|perfil)\b/,
    /\bsem (intencao|pretensao) de (seguir|prosseguir|avancar|contratar|trocar|continuar)\b/,
    /\bnao (tem|tenho|temos|ha|possui|existe) (interesse|necessidade|demanda|abertura)\b/,
    /\bnao (ve|viu|enxerga|enxergou) (interesse|necessidade|demanda|valor)\b/,
    /\bnao (quer|querem|quero|queremos|quis|queria|deseja|desejam|pretende|pretendem|vai|vamos|vou)\b.{0,80}\b(seguir|prosseguir|avancar|contratar|trocar|receber|continuar|agenda|agendar|reuniao|proposta)\b/,
    /\bnao (vamos|vou) (seguir|prosseguir|avancar)\b/,
    /\bnao (insistir|retornar|ligar|contactar|contatar|acionar)\b/,
    /\bnao (me )?lig(ue|uem|a) (mais|de novo)\b/,
    /\bpediu para nao (ligar|insistir|retornar|acionar|contatar)\b/,
    /\bsolicitou (nao|para nao) (ligar|insistir|retornar|acionar|contatar)\b/,
    /\bencerrar (contato|tratativa|abordagem|prospect|prospeccao)\b/,
    /\bencerrad[ao] por (recusa|negativa|falta de interesse)\b/,
    /\bja (tem|tenho|temos|possui) (fornecedor|advogado|contador|escritorio)\b.{0,120}\bnao (quer|querem|pretende|pretendem|deseja|desejam)\b.{0,80}\btroc/,
    /\binteresse\s*:\s*(nenhum|zero|baixo\/nenhum|sem interesse)\b/,
  ].some((rx) => rx.test(blob));
}

function chaveEmpresa(r: Pick<HistoricoEmpresa, "empresaNome" | "cnpj">): string {
  const cnpj = r.cnpj?.replace(/\D/g, "");
  if (cnpj && cnpj.length >= 8) return `cnpj:${cnpj}`;
  return `nome:${normalizarTexto(r.empresaNome).replace(/[^a-z0-9]/g, "")}`;
}

function nomeEmpresaLimpo(nome: string): string {
  return normalizarTexto(nome).replace(/[^a-z0-9]/g, "");
}

function empresaValida(nome: string): boolean {
  const n = nomeEmpresaLimpo(nome);
  if (n.length < 3) return false;
  return ![
    "naoinformado",
    "naoinformada",
    "empresanaoinformada",
    "empresanaoidentificada",
    "desconhecida",
    "semnome",
  ].includes(n);
}

function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j];
  }
  return prev[b.length];
}

function telefonesDoHistorico(r: HistoricoEmpresa): string[] {
  const blob = [r.contato, r.textoHistoricoCompleto, r.descricaoOriginal].filter(Boolean).join(" ");
  return Array.from(blob.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/g))
    .map((m) => m[0].replace(/\D/g, ""))
    .map((d) => (d.startsWith("55") && d.length > 10 ? d.slice(2) : d))
    .filter((d) => d.length >= 8);
}

function palavrasEmpresa(nome: string): string[] {
  const comuns = new Set([
    "industria",
    "industrias",
    "comercio",
    "comercial",
    "servicos",
    "servico",
    "ltda",
    "eireli",
    "me",
    "epp",
    "sa",
    "brasil",
  ]);
  return normalizarTexto(nome)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4 && !comuns.has(p));
}

function mesmaEmpresaOuParecida(a: HistoricoEmpresa, b: HistoricoEmpresa): boolean {
  const cnpjA = a.cnpj?.replace(/\D/g, "");
  const cnpjB = b.cnpj?.replace(/\D/g, "");
  if (cnpjA && cnpjB && cnpjA === cnpjB) return true;

  const phonesA = new Set(telefonesDoHistorico(a));
  if (phonesA.size > 0 && telefonesDoHistorico(b).some((p) => phonesA.has(p))) return true;

  const contatoA = normalizarTexto(a.contato ?? "").replace(/[^a-z0-9]/g, "");
  const contatoB = normalizarTexto(b.contato ?? "").replace(/[^a-z0-9]/g, "");
  if (contatoA.length >= 5 && contatoA === contatoB) return true;

  const nomeA = nomeEmpresaLimpo(a.empresaNome);
  const nomeB = nomeEmpresaLimpo(b.empresaNome);
  if (!nomeA || !nomeB) return false;
  if (nomeA === nomeB) return true;
  if (Math.min(nomeA.length, nomeB.length) >= 6 && (nomeA.includes(nomeB) || nomeB.includes(nomeA))) {
    return true;
  }

  const tokensA = palavrasEmpresa(a.empresaNome);
  const tokensB = palavrasEmpresa(b.empresaNome);
  if (tokensA.some((ta) => tokensB.some((tb) => distanciaLevenshtein(ta, tb) <= Math.max(1, Math.floor(Math.max(ta.length, tb.length) * 0.25))))) {
    return true;
  }

  const maxLen = Math.max(nomeA.length, nomeB.length);
  if (maxLen < 6) return false;
  return distanciaLevenshtein(nomeA, nomeB) <= Math.max(1, Math.floor(maxLen * 0.18));
}

export function historicoEncerraFollowUp(r: HistoricoEmpresa): boolean {
  const blob = normalizarTexto(
    [
      r.resultado,
      r.interesse,
      r.proximaAcao,
      r.objecao,
      r.textoHistoricoCompleto,
      r.descricaoOriginal,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return textoIndicaNegativaComercial(blob);
}

export function proximaAcaoEhReuniao(proximaAcao: string | null | undefined): boolean {
  if (!proximaAcao) return false;
  return /\b(reuniao|reunioes|apresentacao|visita|meeting)\b/i.test(normalizarTexto(proximaAcao));
}

// Deriva o status atual de um histórico. Regra:
// - 'arquivado' quando o operador marcou baixa manual OU o texto indica negativa/recusa/perda.
// - 'concluido' quando uma reunião/visita/apresentação foi marcada como próxima ação.
// - 'pendente' caso contrário (aparece na agenda de retornos).
export function computeHistoricoStatus(r: HistoricoEmpresa): HistoricoStatus {
  if (r.status === "arquivado") return "arquivado";
  if (r.arquivadoManual) return "arquivado";
  if (historicoEncerraFollowUp(r)) return "arquivado";
  if (r.status === "concluido") return "concluido";
  if (proximaAcaoEhReuniao(r.proximaAcao)) return "concluido";
  return r.status ?? "pendente";
}


function historicoMencionaEmpresa(historico: HistoricoEmpresa, empresa: HistoricoEmpresa): boolean {
  const tokens = palavrasEmpresa(empresa.empresaNome);
  if (tokens.length === 0) return false;
  const blob = normalizarTexto(
    [
      historico.empresaNome,
      historico.contato,
      historico.textoHistoricoCompleto,
      historico.descricaoOriginal,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const compactBlob = blob.replace(/[^a-z0-9]/g, "");
  return tokens.some((token) => blob.includes(token) || compactBlob.includes(token.replace(/[^a-z0-9]/g, "")));
}

function historicoResolveEmpresa(maisRecente: HistoricoEmpresa, candidato: HistoricoEmpresa): boolean {
  return mesmaEmpresaOuParecida(candidato, maisRecente) || historicoMencionaEmpresa(maisRecente, candidato);
}

export type FollowUpReferencia = {
  company_name: string;
  cnpj?: string | null;
  contact_person?: string | null;
  notes?: string | null;
};

export function followUpEncerradoPorHistorico(followUp: FollowUpReferencia): boolean {
  const candidato: HistoricoEmpresa = {
    id: "follow-up-ref",
    dataIso: new Date(0).toISOString(),
    dataFormatada: "",
    empresaNome: followUp.company_name,
    cnpj: followUp.cnpj ?? null,
    contato: followUp.contact_person ?? null,
    textoHistoricoCompleto: [followUp.company_name, followUp.contact_person, followUp.notes]
      .filter(Boolean)
      .join("\n"),
  };

  const historicosDaEmpresa = listHistoricos().filter((h) => historicoResolveEmpresa(h, candidato));
  if (historicosDaEmpresa.length === 0) return false;
  const maisRecente = historicosDaEmpresa.reduce((a, b) =>
    new Date(a.dataIso).getTime() >= new Date(b.dataIso).getTime() ? a : b,
  );
  return historicoEncerraFollowUp(maisRecente);
}

export function parseCampo(text: string, label: string): string | null {
  // Robusto contra Markdown de negrito (**LABEL:**), sublinhado (__LABEL__:)
  // e variações de caixa. Ancora no início da linha para não colidir com
  // ocorrências no meio de outro campo.
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:\\*\\*|__)?\\s*${escaped}\\s*(?:\\*\\*|__)?\\s*:\\s*(?:\\*\\*|__)?\\s*(.+)`,
    "i",
  );
  const m = text.match(re);
  if (!m) return null;
  const v = limparMarcacao(m[1]);
  return v.length ? v : null;
}

export function parseCheckbox(text: string, block: string): string | null {
  // Ex.: bloco "RESULTADO:" com "[x] Falou com decisor" — aceita [X], [ x ] etc.
  const idx = text.toUpperCase().indexOf(block.toUpperCase());
  if (idx < 0) return null;
  const slice = text.slice(idx, idx + 600);
  const m = slice.match(/\[\s*x\s*\]\s*(.+)/i);
  return m ? limparMarcacao(m[1]) : null;
}

// Extrai a data prevista para o retorno. Tenta primeiro a linha PRÓXIMA AÇÃO
// (formatos DD/MM/AAAA, DD/MM/AA, DD/MM, YYYY-MM-DD, "DD de mês [de AAAA]")
// e depois cai nos textos de fallback (histórico completo + descrição bruta),
// para garantir sincronia mesmo quando a IA não repete a data na linha final.
export function parseProximaAcaoData(
  proximaAcao: string | null,
  fallbackTexts: string[] = [],
): string | null {
  const meses = [
    "janeiro","fevereiro","marco","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro",
  ];
  const candidates = [proximaAcao ?? "", ...fallbackTexts].filter((t) => !!t && t.trim().length > 0);

  for (const raw of candidates) {
    const txt = raw.toString();
    // 1) DD/MM/AAAA ou DD/MM/AA
    let m = txt.match(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yyyy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const d = new Date(yyyy, mm - 1, dd, 9, 0, 0);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    // 2) ISO YYYY-MM-DD
    m = txt.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    // 3) "DD de <mês> [de AAAA]"
    const lower = txt.toLowerCase();
    m = lower.match(/\b(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?/);
    if (m) {
      const mi = meses.indexOf(m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      if (mi >= 0) {
        const year = m[3] ? Number(m[3]) : new Date().getFullYear();
        const d = new Date(year, mi, Number(m[1]), 9, 0, 0);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    }
    // 4) DD/MM sem ano — assume ano corrente
    m = txt.match(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/);
    if (m) {
      const year = new Date().getFullYear();
      const d = new Date(year, Number(m[2]) - 1, Number(m[1]), 9, 0, 0);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}


export function extractCnpj(text: string): string | null {
  const m = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  return m ? m[0] : null;
}

export function buildRegistroFromHistorico(opts: {
  historico: string;
  descricao?: string;
  consultor?: Consultor | null;
  arquivadoManual?: boolean;
}): HistoricoEmpresa | null {
  const { historico, descricao, consultor, arquivadoManual } = opts;
  const empresaNome = parseCampo(historico, "EMPRESA");
  if (!empresaNome) return null;
  const now = new Date();
  const proxima = parseCampo(historico, "PRÓXIMA AÇÃO") ?? parseCampo(historico, "PROXIMA ACAO");
  const base: HistoricoEmpresa = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    dataIso: now.toISOString(),
    dataFormatada: now.toLocaleDateString("pt-BR"),
    empresaNome,
    cnpj: extractCnpj(historico) ?? (descricao ? extractCnpj(descricao) : null),
    contato: parseCampo(historico, "CONTATO"),
    cargo: parseCampo(historico, "CARGO"),
    resultado: parseCheckbox(historico, "RESULTADO"),
    interesse: parseCheckbox(historico, "INTERESSE"),
    objecao: parseCampo(historico, "OBJEÇÃO PRINCIPAL") ?? parseCampo(historico, "OBJECAO PRINCIPAL"),
    proximaAcao: proxima,
    proximaAcaoData: parseProximaAcaoData(proxima, [historico, descricao ?? ""]),

    textoHistoricoCompleto: historico,
    descricaoOriginal: descricao ?? null,
    consultor: consultor ?? null,
    arquivadoManual: arquivadoManual ?? false,
  };
  // Deriva status já no registro persistido — self-healing na próxima leitura.
  return { ...base, status: computeHistoricoStatus(base) };
}


// -------- Agregações para o Relatório Diário ----------

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = domingo
  const diff = (day + 6) % 7; // segunda-feira como início
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

export type PeriodoMetricas = {
  ligacoes: number;
  decisor: number;
  reunioes: number;
  documentos: number;
};

/** Um registro conta como "reunião agendada"? (mesma regra do relatório diário) */
export function registroEhReuniao(r: HistoricoEmpresa): boolean {
  return (
    /(reuni[ãa]o|apresenta[çc][ãa]o|visita|meeting)/i.test(r.proximaAcao ?? "") ||
    /(reuni[ãa]o|apresenta[çc][ãa]o|visita)/i.test(r.textoHistoricoCompleto)
  );
}

/** Um registro conta como "não atendida"? */
export function registroNaoAtendida(r: HistoricoEmpresa): boolean {
  const alvo = `${r.resultado ?? ""} ${r.textoHistoricoCompleto ?? ""}`;
  return /(n[ãa]o atend|caixa postal|ocupado|n[ãa]o retornou a liga)/i.test(alvo);
}

function metricasDaLista(arr: HistoricoEmpresa[]): PeriodoMetricas {
  const decisor = arr.filter((r) => /decisor/i.test(r.resultado ?? "")).length;
  const reunioes = arr.filter(registroEhReuniao).length;
  const documentos = arr.filter((r) =>
    /(enviar|envio|mandar|manda(r)?)\s+(proposta|documento|contrato|minuta|material|apresenta[çc][ãa]o)/i.test(
      r.proximaAcao ?? "",
    ) ||
    /(proposta enviada|contrato enviado|documento enviado|material enviado)/i.test(
      r.textoHistoricoCompleto,
    ),
  ).length;
  return { ligacoes: arr.length, decisor, reunioes, documentos };
}

function metricasPara(list: HistoricoEmpresa[], from: Date): PeriodoMetricas {
  return metricasDaLista(list.filter((r) => new Date(r.dataIso) >= from));
}

/** Métricas de um intervalo [from, to) — usado pelo dashboard de Volume. */
export function metricasNoIntervalo(from: Date, to: Date, list?: HistoricoEmpresa[]): PeriodoMetricas {
  const base = list ?? listHistoricos();
  const a = from.getTime();
  const b = to.getTime();
  return metricasDaLista(
    base.filter((r) => {
      const t = new Date(r.dataIso).getTime();
      return t >= a && t < b;
    }),
  );
}



export type RelatorioDiario = {
  hoje: PeriodoMetricas;
  semana: PeriodoMetricas;
  mes: PeriodoMetricas;
  empresasHoje: HistoricoEmpresa[];
};

export function calcularRelatorioDiario(now = new Date(), consultor?: Consultor | null): RelatorioDiario {
  const all = listHistoricos();
  const list = consultor ? all.filter((r) => (r.consultor ?? "Everton Pereira") === consultor) : all;
  const hoje = startOfDay(now);
  const semana = startOfWeek(now);
  const mes = startOfMonth(now);
  const empresasHoje = list.filter((r) => new Date(r.dataIso) >= hoje);
  return {
    hoje: metricasPara(list, hoje),
    semana: metricasPara(list, semana),
    mes: metricasPara(list, mes),
    empresasHoje,
  };
}

// -------- Follow-ups próximos 7 dias ----------

export type FollowUpLocal = {
  id: string;
  empresaNome: string;
  cnpj?: string | null;
  contato?: string | null;
  dataIso: string;
  dataFormatada: string;
  proximaAcao: string;
};


export function proximosFollowUps(dias = 7, now = new Date()): FollowUpLocal[] {
  const start = startOfDay(now);
  const limit = new Date(start);
  limit.setDate(limit.getDate() + dias);
  const list = [...listHistoricos()].sort(
    (a, b) => new Date(b.dataIso).getTime() - new Date(a.dataIso).getTime(),
  );
  const map = new Map<string, FollowUpLocal>();
  const handled = new Set<string>();
  const resolvidos: HistoricoEmpresa[] = [];
  for (const r of list) {
    const encerra = historicoEncerraFollowUp(r);
    const reuniao = proximaAcaoEhReuniao(r.proximaAcao);

    // Mesmo quando a IA não capturou bem o nome da empresa, um histórico recente
    // com negativa/reunião deve servir como fonte de verdade para limpar alertas antigos.
    if (!empresaValida(r.empresaNome)) {
      if (encerra || reuniao) resolvidos.push(r);
      continue;
    }

    const key = chaveEmpresa(r);
    // A lista está em ordem decrescente: só o histórico mais recente da empresa manda.
    // Se a última conversa foi uma recusa, ou se o follow-up já foi feito e gerou
    // um novo histórico sem próxima ação, não reaparece o alerta antigo.
    if (handled.has(key)) continue;
    if (!r.proximaAcaoData || encerra || reuniao) {
      handled.add(key);
      resolvidos.push(r);
      continue;
    }
    if (resolvidos.some((x) => historicoResolveEmpresa(x, r))) {
      handled.add(key);
      continue;
    }
    const d = new Date(r.proximaAcaoData);
    if (d < start || d > limit) {
      handled.add(key);
      continue;
    }
    handled.add(key);
    map.set(key, {
      id: r.id,
      empresaNome: r.empresaNome,
      cnpj: r.cnpj ?? null,
      contato: r.contato,
      dataIso: r.proximaAcaoData,
      dataFormatada: d.toLocaleDateString("pt-BR"),
      proximaAcao: r.proximaAcao ?? "",
    });

  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.dataIso).getTime() - new Date(b.dataIso).getTime(),
  );
}

/**
 * Sincroniza a data da próxima ação do histórico mais recente de uma empresa.
 * Usado quando o follow-up é reagendado/concluído em outra tela — assim a
 * Agenda (que lê o histórico) mostra sempre a mesma data do card.
 */
export function setProximaAcaoDataEmpresa(
  target: { cnpj?: string | null; empresaNome?: string | null },
  dataIso: string | null,
  proximaAcao?: string | null,
): HistoricoEmpresa | null {
  if (!isBrowser()) return null;
  const list = readAllHistoricos();
  const idx = list.findIndex((r) => !r.excluidoEm && historicoMatchesEmpresa(r, target));
  if (idx < 0) return null;
  const atual = list[idx];
  const atualizado: HistoricoEmpresa = {
    ...atual,
    proximaAcaoData: dataIso,
    ...(proximaAcao !== undefined && proximaAcao !== null ? { proximaAcao } : {}),
  };
  list[idx] = atualizado;
  try {
    writeHistoricos(list);
    window.dispatchEvent(new Event("bhm:historico-updated"));
  } catch {
    /* quota */
  }
  return atualizado;
}



// -------- Persistência de estado dos formulários ----------

export function persistState<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export function loadState<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// -------- Autenticação simples por consultor ----------

export type Credencial = { user: string; pass: string; consultor: Consultor };

export const CREDENCIAIS: Credencial[] = [
  { user: "everton", pass: "bhm", consultor: "Everton Pereira" },
  { user: "eloane", pass: "bhm", consultor: "Eloane Manfroni" },
  // compatibilidade com o login antigo
  { user: "heluane", pass: "bhm", consultor: "Eloane Manfroni" },
];

const SESSION_KEY = "bhm.session";

export function getSessionConsultor(): Consultor | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(SESSION_KEY);
  if (v === "Everton Pereira") return "Everton Pereira";
  if (v === "Eloane Manfroni" || v === "Heluane Manfroni") return "Eloane Manfroni";
  return null;
}

export function loginConsultor(userInput: string, passInput: string): Consultor | null {
  const u = (userInput ?? "").toLowerCase().trim();
  const p = (passInput ?? "").toLowerCase().trim();
  const match = CREDENCIAIS.find((c) => c.user === u && c.pass === p);
  if (!match) return null;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_KEY, match.consultor);
  }
  setConsultor(match.consultor);
  window.dispatchEvent(new Event("bhm:session-changed"));
  return match.consultor;
}

export function logoutConsultor() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("bhm:session-changed"));
}

// -------- Rascunho unificado (isolado por conta logada) ----------

export type Rascunho = {
  pre?: { cnpj?: string; dados?: string; script?: string; empresaResumo?: string | null; nomeBusca?: string };
  pos?: {
    descricao?: string;
    historico?: string;
    dealId?: string;
    lastRegId?: string | null;
    lastRegName?: string;
    lastRegCnpj?: string | null;
    lastRegContato?: string;
    lastRegCargo?: string;
    historicoOpen?: boolean;
  };
};

const RASCUNHO_BASE = "bhm_rascunho_atual";

function rascunhoKey(): string {
  const c = getSessionConsultor() ?? getConsultor();
  return `${RASCUNHO_BASE}::${c}`;
}

export function loadRascunho(): Rascunho {
  return loadState<Rascunho>(rascunhoKey(), {});
}

export function updateRascunho(patch: Rascunho) {
  const cur = loadRascunho();
  const next: Rascunho = {
    pre: { ...(cur.pre ?? {}), ...(patch.pre ?? {}) },
    pos: { ...(cur.pos ?? {}), ...(patch.pos ?? {}) },
  };
  persistState(rascunhoKey(), next);
}

export function clearRascunho() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(rascunhoKey());
    window.localStorage.removeItem("bhm.pre.state");
    window.localStorage.removeItem("bhm.pos.state");
  }
}


// -------- Extração granular do histórico (telefones, e-mails, pessoas) ----------

const HEADER_RE = /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ0-9 ,./()"'&–—-]{4,}:\s*.{0,120}$/;

function isHeaderLine(raw: string): boolean {
  // remove o conteúdo entre parênteses antes de avaliar — cabeçalhos como
  // "OUTROS DADOS ÚTEIS MENCIONADOS (site, WhatsApp, LinkedIn):" têm
  // minúsculas dentro dos parênteses e antes eram ignorados.
  const l = raw.replace(/\([^)]*\)/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!l.includes(":")) return false;
  const label = l.slice(0, l.indexOf(":")).trim();
  if (label.length < 4) return false;
  // rótulo em caixa alta (sem letras minúsculas) => nova seção
  return !/[a-záéíóúâêîôûãõç]/.test(label) && HEADER_RE.test(l);
}

const VAZIO_RE =
  /^(?:[-•*\s—–]*)(?:—|-|n\/a|na|não informado|nao informado|não informada|nenhum[ao]?|sem informação|sem informacao|indisponível|indisponivel|\?+)?\s*$/i;

function limparLinhas(bloco: string, manter: (l: string) => boolean): string[] {
  return bloco
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/\(deduzid[oa][^)]*\)/gi, "")
        .replace(/\(n[ãa]o informad[oa][^)]*\)/gi, "")
        .replace(/^[\s•*]*[-–]\s*/, "")
        .replace(/\s{2,}/g, " ")
        .replace(/(?:\s*[—–-]\s*)+$/, "")
        .trim(),
    )
    .filter((l) => l && !VAZIO_RE.test(l) && manter(l));
}

/** Uma seção só "tem conteúdo" se alguma linha for diferente de vazio/"—". */
function temConteudo(bloco: string): boolean {
  return bloco.split(/\r?\n/).some((l) => l.trim() && !VAZIO_RE.test(l.trim()));
}

function extrairSecao(text: string, titulo: RegExp): string | null {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => titulo.test(l.trim()));
  if (idx < 0) return null;
  const out: string[] = [];
  // conteúdo pode vir na mesma linha do rótulo
  const first = lines[idx].trim();
  const após = first.slice(first.indexOf(":") + 1).trim();
  if (first.includes(":") && após) out.push(após);
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (isHeaderLine(l)) break;
    out.push(l);
  }
  const bloco = out.join("\n").trim();
  return temConteudo(bloco) ? bloco : "";
}

export function extractTelefones(historico: string): string {
  const sec = extrairSecao(historico, /^TELEFONES\s*\/?\s*RAMAIS/i);
  if (!sec) return "";
  // só linhas que realmente contêm um número
  return limparLinhas(sec, (l) => (l.replace(/\D/g, "").length >= 3)).join("\n");
}

export function extractEmails(historico: string): string {
  const raw = extrairSecao(historico, /^E-MAILS\s+INFORMADOS/i) ?? "";
  return limparLinhas(raw, (l) => l.includes("@")).join("\n");
}

export function extractPessoasParaProcurar(historico: string): string {
  const raw = extrairSecao(historico, /^PESSOAS\s+PARA\s+PROCURAR/i) ?? "";
  return limparLinhas(raw, (l) => /[a-záéíóúâêîôûãõç]/i.test(l)).join("\n");
}

/** @deprecated use extractEmails + extractPessoasParaProcurar */
export function extractEmailsPessoas(historico: string): string {
  const emails = extractEmails(historico);
  const pessoas = extractPessoasParaProcurar(historico);
  return [
    emails ? "E-MAILS:\n" + emails : "",
    pessoas ? "PESSOAS PARA PROCURAR:\n" + pessoas : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
