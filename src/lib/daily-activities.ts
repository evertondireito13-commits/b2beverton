// Registro local (localStorage) das atividades comerciais do dia.
// A partir desta versão, os dados vêm ESTRUTURADOS direto da UI
// (ActiveLeadData + checkboxes de resultado), eliminando o parsing de texto
// gerado pela IA e garantindo 100% de acurácia nas somas do relatório.

export type ActiveLeadLike = {
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnaePrincipal?: string;
  cidade?: string;
  uf?: string;
  endereco?: string;
};

export type ResultadoUf =
  | "Falou com decisor"
  | "Falou com portaria"
  | "Não atendeu"
  | "Caixa postal"
  | "Sem classificação";

export type BhmActivityStatus = "pendente" | "concluido" | "arquivado";

export interface BhmActivityLog {
  id: string;
  dateStr: string; // yyyy-mm-dd (America/Sao_Paulo)
  empresa: string;
  cargo: string;
  contato: string;
  resultado: string;
  falouDecisor: boolean;
  cnpj?: string;
  cidade?: string;
  uf?: string;
  historico?: string;
  proximaAcao?: string;
  proximaAcaoData?: string;
  createdAtIso?: string;
  status?: BhmActivityStatus; // 'pendente' default; classificador atualiza pós-geração
}

import { getSessionConsultor, getConsultor } from "@/lib/historico-store";

export const BHM_DAILY_ACTIVITIES_KEY = "bhm-daily-activities";

function activeConsultor(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

function activitiesKey(): string {
  return `${BHM_DAILY_ACTIVITIES_KEY}::${activeConsultor()}`;
}

export function todaySaoPauloISO(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function loadActivities(): BhmActivityLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(activitiesKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BhmActivityLog[]) : [];
  } catch {
    return [];
  }
}

export function saveActivities(list: BhmActivityLog[]) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = list.slice(-500);
    window.localStorage.setItem(activitiesKey(), JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent("bhm:activities-updated"));
  } catch {
    /* noop */
  }
}


/**
 * Registra uma atividade a partir do estado ESTRUTURADO da UI.
 * A UI passa o lead ativo + o resultado marcado + o boolean "falou com decisor".
 * Idempotência opcional: se `extras.dedupeKey` for informado, chamadas
 * subsequentes com a mesma chave no mesmo dia são ignoradas (evita duplicar
 * após já ter salvo pelo checkbox).
 */
export function addActivity(
  lead: ActiveLeadLike,
  resultadoUf: ResultadoUf | string,
  falouComDecisor: boolean,
  extras?: {
    contato?: string;
    cargo?: string;
    historico?: string;
    proximaAcao?: string | null;
    proximaAcaoData?: string | null;
    status?: BhmActivityStatus;
    dedupeKey?: string;
  },
): BhmActivityLog | null {
  const dateStr = todaySaoPauloISO();
  const list = loadActivities();

  if (extras?.dedupeKey) {
    const exists = list.some(
      (a) => a.dateStr === dateStr && a.id.endsWith(`:${extras.dedupeKey}`),
    );
    if (exists) return null;
  }

  const empresa =
    (lead.razaoSocial || lead.nomeFantasia || "").trim() ||
    "Empresa não identificada";

  const now = new Date();
  const suffix = extras?.dedupeKey ? `:${extras.dedupeKey}` : "";
  const entry: BhmActivityLog = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}${suffix}`,
    dateStr,
    empresa,
    cargo: (extras?.cargo ?? "").trim(),
    contato: (extras?.contato ?? "").trim(),
    resultado: (resultadoUf || "Sem classificação").trim(),
    falouDecisor: !!falouComDecisor,
    cnpj: lead.cnpj?.trim() || undefined,
    cidade: lead.cidade?.trim() || undefined,
    uf: lead.uf?.trim() || undefined,
    historico: extras?.historico?.trim() || undefined,
    proximaAcao: extras?.proximaAcao?.trim() || undefined,
    proximaAcaoData: extras?.proximaAcaoData?.trim() || undefined,
    createdAtIso: now.toISOString(),
    status: extras?.status,
  };

  list.push(entry);
  saveActivities(list);
  return entry;
}

export function getTodayActivities(): BhmActivityLog[] {
  const today = todaySaoPauloISO();
  return loadActivities().filter((a) => a.dateStr === today);
}

/**
 * Remove uma atividade específica pelo id do array do consultor logado.
 * Dispara `bhm:activities-updated` para atualização reativa da UI.
 */
export function deleteActivity(id: string): boolean {
  if (!id) return false;
  const list = loadActivities();
  const filtered = list.filter((a) => a.id !== id);
  if (filtered.length === list.length) return false;
  saveActivities(filtered);
  return true;
}

function normalizeName(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Remove APENAS as atividades diárias que casam com a empresa informada
 * (CNPJ quando presente OU nome normalizado). Usado para retestar um lead
 * sem apagar o restante do dia/semana/mês do operador.
 */
export function deleteActivitiesByEmpresa(
  target: { cnpj?: string | null; empresaNome?: string | null },
): number {
  const cnpjDigits = (target.cnpj ?? "").replace(/\D/g, "");
  const nomeKey = target.empresaNome ? normalizeName(target.empresaNome) : "";
  if (!cnpjDigits && !nomeKey) return 0;
  const list = loadActivities();
  const filtered = list.filter((a) => {
    const ac = (a.cnpj ?? "").replace(/\D/g, "");
    if (cnpjDigits && ac && ac === cnpjDigits) return false;
    if (nomeKey) {
      const an = normalizeName(a.empresa ?? "");
      if (an && an === nomeKey) return false;
    }
    return true;
  });
  const removed = list.length - filtered.length;
  if (removed > 0) saveActivities(filtered);
  return removed;
}

/**
 * Atualiza o status de uma atividade previamente registrada.
 * Se `id` for omitido, atualiza a MAIS RECENTE do dia — cobre o caso
 * comum de o classificador retornar logo após addActivity() sem
 * termos guardado o id.
 */
export function updateActivityStatus(
  status: BhmActivityStatus,
  id?: string,
): BhmActivityLog | null {
  const list = loadActivities();
  if (list.length === 0) return null;
  let idx = -1;
  if (id) {
    idx = list.findIndex((a) => a.id === id);
  } else {
    const today = todaySaoPauloISO();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].dateStr === today) { idx = i; break; }
    }
  }
  if (idx < 0) return null;
  const updated: BhmActivityLog = { ...list[idx], status };
  list[idx] = updated;
  saveActivities(list);
  return updated;
}

/**
 * Renomeia a empresa de uma atividade específica (por id).
 * Dispara `bhm:activities-updated` para reatividade global.
 */
export function updateActivityEmpresa(id: string, novoNome: string): BhmActivityLog | null {
  const nome = novoNome.trim();
  if (!nome) return null;
  const list = loadActivities();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const updated: BhmActivityLog = { ...list[idx], empresa: nome };
  list[idx] = updated;
  saveActivities(list);
  try {
    window.dispatchEvent(new Event("bhm:activities-updated"));
  } catch { /* noop */ }
  return updated;
}

/**
 * Atualiza contato/cargo de uma atividade. Se `id` omitido, aplica na atividade
 * MAIS RECENTE do dia. Dispara `bhm:activities-updated` para reatividade global.
 */
export function updateActivityContatoCargo(
  patch: { contato?: string; cargo?: string },
  id?: string,
): BhmActivityLog | null {
  const list = loadActivities();
  if (list.length === 0) return null;
  let idx = -1;
  if (id) {
    idx = list.findIndex((a) => a.id === id);
  } else {
    const today = todaySaoPauloISO();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].dateStr === today) { idx = i; break; }
    }
  }
  if (idx < 0) return null;
  const updated: BhmActivityLog = {
    ...list[idx],
    ...(patch.contato !== undefined ? { contato: patch.contato.trim() } : {}),
    ...(patch.cargo !== undefined ? { cargo: patch.cargo.trim() } : {}),
  };
  list[idx] = updated;
  saveActivities(list);
  return updated;
}

/**
 * Renomeia em massa TODAS as atividades cuja empresa case pelo CNPJ (preferencial)
 * ou pelo nome anterior normalizado. Usado para propagar renomeação global.
 */
export function renameActivitiesByEmpresa(
  target: { cnpj?: string | null; empresaAntiga?: string | null },
  novoNome: string,
): number {
  const nome = novoNome.trim();
  if (!nome) return 0;
  const cnpjDigits = (target.cnpj ?? "").replace(/\D/g, "");
  const antigo = target.empresaAntiga ? normalizeName(target.empresaAntiga) : "";
  if (!cnpjDigits && !antigo) return 0;
  const list = loadActivities();
  let count = 0;
  const next = list.map((a) => {
    const ac = (a.cnpj ?? "").replace(/\D/g, "");
    const an = normalizeName(a.empresa ?? "");
    const hit =
      (cnpjDigits && ac && ac === cnpjDigits) ||
      (!!antigo && an === antigo);
    if (!hit) return a;
    count += 1;
    return { ...a, empresa: nome };
  });
  if (count > 0) {
    saveActivities(next);
    try {
      window.dispatchEvent(new Event("bhm:activities-updated"));
    } catch { /* noop */ }
  }
  return count;
}


// -------- Lead ativo (compartilhado entre Pré e Pós-ligação) --------

const ACTIVE_LEAD_KEY = "bhm.activeLead";
export const ACTIVE_LEAD_EVENT = "bhm:active-lead-updated";

export function setActiveLead(lead: ActiveLeadLike | null) {
  if (typeof window === "undefined") return;
  try {
    if (lead) window.sessionStorage.setItem(ACTIVE_LEAD_KEY, JSON.stringify(lead));
    else window.sessionStorage.removeItem(ACTIVE_LEAD_KEY);
    window.dispatchEvent(new CustomEvent(ACTIVE_LEAD_EVENT));
  } catch {
    /* noop */
  }
}

export function getActiveLead(): ActiveLeadLike | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_LEAD_KEY);
    return raw ? (JSON.parse(raw) as ActiveLeadLike) : null;
  } catch {
    return null;
  }
}

