// Leads Central — armazenamento local particionado por consultor.
// Uma empresa vira LEAD assim que uma reunião é agendada. Isso a remove
// automaticamente do Follow-up Frio (em_followup_frio=false).

import { getConsultor, getSessionConsultor } from "@/lib/historico-store";

export type LeadStatus =
  | "reuniao_agendada"
  | "resgate_reuniao"
  | "pos_reuniao"
  | "levantamento_docs"
  | "apresentacao_calculos"
  | "fechado"
  | "perdido"
  | "nao_qualificado"
  | "pausado";

export type TipoNegociacao = "cliente_direto" | "parceria_operacional";

export type AreaNegociacao = "tributario" | "reestruturacao_financeira";

export const TIPO_NEGOCIACAO_LABEL: Record<TipoNegociacao, string> = {
  cliente_direto: "🏢 Cliente direto",
  parceria_operacional: "🤝 Parceria operacional",
};

export const AREA_NEGOCIACAO_LABEL: Record<AreaNegociacao, string> = {
  tributario: "⚖️ Tributário",
  reestruturacao_financeira: "📉 Reestruturação financeira",
};

export const AREA_COLETA_LABEL: Record<AreaNegociacao, string> = {
  tributario: "Modalidade de coleta (SPED / e-CAC)",
  reestruturacao_financeira: "Modalidade de coleta (Balanços / DRE)",
};

export type ModalidadeColeta = "procuracao_ecac" | "arquivos_txt";

export type MarcoId = 1 | 2 | 3 | 4;

export type MarcoEvent = {
  id: string;
  at: string;
  marco: MarcoId;
  status: LeadStatus;
  titulo: string;
  detalhe?: string;
  categoria?: "comunicacao";
};

export const MARCO_LABEL: Record<MarcoId, string> = {
  1: "📅 Marco 1 — Reunião",
  2: "📄 Marco 2 — Documentos / EFDs",
  3: "📊 Marco 3 — Cálculos",
  4: "📝 Marco 4 — Fechamento / Minuta",
};

export function marcoDoStatus(status: LeadStatus): MarcoId {
  switch (status) {
    case "reuniao_agendada":
    case "resgate_reuniao":
    case "pos_reuniao":
      return 1;
    case "levantamento_docs":
      return 2;
    case "apresentacao_calculos":
      return 3;
    case "fechado":
    case "perdido":
    case "nao_qualificado":
      return 4;
    case "pausado":
      return 1;
    default:
      return 1;
  }
}

export type LeadFollowUp = {
  id: string;
  scheduled_at: string;
  canal: "ligacao" | "whatsapp" | "email" | "reuniao";
  assunto: string;
  notas?: string;
  done: boolean;
  done_at?: string;
  created_at: string;
};

export const LEAD_FOLLOWUP_CANAL_LABEL: Record<LeadFollowUp["canal"], string> = {
  ligacao: "☎️ Ligação",
  whatsapp: "💬 WhatsApp",
  email: "✉️ E-mail",
  reuniao: "🤝 Reunião",
};

export type AtaEntrada = {
  id: string;
  criadoEm: string;
  texto?: string;
  pdfBase64?: string;
  pdfNome?: string;
  pdfTipo?: string;
};

export type Lead = {
  id: string;
  cnpj: string;
  empresa: string;
  contato: string;
  cargo: string;
  telefone?: string;
  email?: string;
  proximo_passo?: string;
  rd_deal_id: string;
  status: LeadStatus;
  em_followup_frio: boolean;
  data_reuniao: string;
  ultima_observacao: string;
  motivo_perda?: string;
  stage_since?: string;
  reagendamentos?: number;
  pausado_ate?: string | null;
  fase_antes_pausa?: LeadStatus;
  pausado_motivo?: string[];
  no_show_count?: number;
  fechamento_direto?: boolean;
  tipo_negociacao?: TipoNegociacao;
  area_negociacao?: AreaNegociacao;
  timeline?: MarcoEvent[];
  follow_ups?: LeadFollowUp[];
  ata_executiva?: string;
  ata_enviada_em?: string;
  ata_arquivo?: { nome: string; tipo: string; dados: string; anexado_em: string } | null;
  ata_entradas?: AtaEntrada[];
  convite_calendario_em?: string | null;
  modalidade_coleta?: ModalidadeColeta;
  docs_recebidos_em?: string;
  valor_credito?: number;
  percentual_honorarios?: number;
  oportunidades?: LeadOportunidade[];
  anexos?: LeadAnexo[];
  comissao_percentual?: number;
  contrato_assinado_em?: string;
  updated_at: string;
};

export type LeadOportunidade = {
  id: string;
  tese: string;
  credito: number;
  selic: number;
  percentual_honorarios?: number;
  situacao: "apurada" | "apresentada" | "aprovada" | "descartada";
  observacao?: string;
  created_at: string;
};

export type LeadAnexo = {
  id: string;
  titulo: string;
  url: string;
  tipo: "diagnostico" | "planilha" | "proposta" | "contrato" | "outro";
  created_at: string;
};

export const OPORTUNIDADE_SITUACAO_LABEL: Record<LeadOportunidade["situacao"], string> = {
  apurada: "🧮 Apurada",
  apresentada: "📊 Apresentada",
  aprovada: "✅ Aprovada",
  descartada: "🚫 Descartada",
};

export const ANEXO_TIPO_LABEL: Record<LeadAnexo["tipo"], string> = {
  diagnostico: "📑 Diagnóstico",
  planilha: "📊 Planilha de cálculos",
  proposta: "💼 Proposta",
  contrato: "📝 Contrato / Minuta",
  outro: "📎 Outro",
};

export const COMISSAO_PADRAO = 30;

export function oportunidadeTotal(o: LeadOportunidade): number {
  return (o.credito || 0) + (o.selic || 0);
}

export function creditoTotal(lead: Lead): number {
  const ativas = (lead.oportunidades ?? []).filter((o) => o.situacao !== "descartada");
  if (ativas.length > 0) return ativas.reduce((s, o) => s + oportunidadeTotal(o), 0);
  return lead.valor_credito ?? 0;
}

export function honorariosBHM(lead: Lead): number {
  const padrao = lead.percentual_honorarios ?? 25;
  const ativas = (lead.oportunidades ?? []).filter((o) => o.situacao !== "descartada");
  if (ativas.length > 0) {
    return ativas.reduce(
      (s, o) => s + (oportunidadeTotal(o) * (o.percentual_honorarios ?? padrao)) / 100,
      0,
    );
  }
  return ((lead.valor_credito ?? 0) * padrao) / 100;
}

export function comissaoConsultor(lead: Lead): number {
  return (honorariosBHM(lead) * (lead.comissao_percentual ?? COMISSAO_PADRAO)) / 100;
}

export function addOportunidade(
  id: string,
  input: { tese: string; credito: number; selic?: number; percentual_honorarios?: number; observacao?: string },
): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  const o: LeadOportunidade = {
    id: crypto.randomUUID(),
    tese: input.tese,
    credito: input.credito || 0,
    selic: input.selic || 0,
    percentual_honorarios: input.percentual_honorarios,
    situacao: "apurada",
    observacao: input.observacao,
    created_at: new Date().toISOString(),
  };
  const updated = updateLead(id, { oportunidades: [...(lead.oportunidades ?? []), o] });
  addMarco(id, {
    status: lead.status,
    titulo: `🧮 Tese apurada — ${input.tese}`,
    detalhe: `Crédito R$ ${oportunidadeTotal(o).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  });
  return updated;
}

export function updateOportunidade(
  id: string,
  oportunidadeId: string,
  patch: Partial<Omit<LeadOportunidade, "id" | "created_at">>,
): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  return updateLead(id, {
    oportunidades: (lead.oportunidades ?? []).map((o) =>
      o.id === oportunidadeId ? { ...o, ...patch } : o,
    ),
  });
}

export function removeOportunidade(id: string, oportunidadeId: string): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  return updateLead(id, {
    oportunidades: (lead.oportunidades ?? []).filter((o) => o.id !== oportunidadeId),
  });
}

export function addAnexo(
  id: string,
  input: { titulo: string; url: string; tipo?: LeadAnexo["tipo"] },
): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  const a: LeadAnexo = {
    id: crypto.randomUUID(),
    titulo: input.titulo,
    url: input.url,
    tipo: input.tipo ?? "outro",
    created_at: new Date().toISOString(),
  };
  const updated = updateLead(id, { anexos: [...(lead.anexos ?? []), a] });
  addMarco(id, { status: lead.status, titulo: `📎 Material anexado — ${input.titulo}` });
  return updated;
}

export function removeAnexo(id: string, anexoId: string): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  return updateLead(id, { anexos: (lead.anexos ?? []).filter((a) => a.id !== anexoId) });
}

const BASE_KEY = "bhm-leads-central";
export const LEADS_EVENT = "bhm:leads-updated";

function key(): string {
  const c = (getSessionConsultor() ?? getConsultor()) || "shared";
  return `${BASE_KEY}::${c}`;
}

function safeParse(raw: string | null): Lead[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return (arr as Lead[]).map((l) =>
      l?.status === "resgate_reuniao" ? { ...l, status: "reuniao_agendada" as LeadStatus } : l,
    );
  } catch {
    return [];
  }
}

function normalizeCnpj(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

export function normalizeNomeEmpresa(v: string): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,\-/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function listLeads(): Lead[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(key()));
}

function persist(list: Lead[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(), JSON.stringify(list));
  const c = (getSessionConsultor() ?? getConsultor()) || "shared";
  void import("@/lib/cloud-store").then((m) =>
    m.scheduleCloudSync("leads", list.map((l) => m.leadToRow(l, c)), c),
  );
  window.dispatchEvent(new CustomEvent(LEADS_EVENT));
}

function findIndex(list: Lead[], cnpj: string, empresa: string): number {
  const digits = normalizeCnpj(cnpj);
  if (digits.length >= 8) {
    const i = list.findIndex((l) => normalizeCnpj(l.cnpj) === digits);
    if (i >= 0) return i;
  }
  const nome = normalizeNomeEmpresa(empresa ?? "");
  if (!nome) return -1;
  return list.findIndex((l) => normalizeNomeEmpresa(l.empresa) === nome);
}

export function findLead(empresa?: string | null, cnpj?: string | null): Lead | null {
  const list = listLeads();
  const idx = findIndex(list, cnpj ?? "", empresa ?? "");
  return idx >= 0 ? list[idx] : null;
}

// ==============================================================
// Memória de exclusões — evita que a sincronização de reuniões
// "ressuscite" uma empresa que foi apagada de propósito no app.
// ==============================================================

const DELETED_KEY = "bhm-leads-deleted-signatures";

function deletedKey(): string {
  const c = (getSessionConsultor() ?? getConsultor()) || "shared";
  return `${DELETED_KEY}::${c}`;
}

type DeletedSignature = { cnpj: string; nome: string; deleted_at: string };

function listDeletedSignatures(): DeletedSignature[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(deletedKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persistDeletedSignatures(list: DeletedSignature[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(deletedKey(), JSON.stringify(list));
}

function markAsDeleted(cnpj: string, empresa: string) {
  const list = listDeletedSignatures();
  list.push({
    cnpj: normalizeCnpj(cnpj),
    nome: normalizeNomeEmpresa(empresa),
    deleted_at: new Date().toISOString(),
  });
  persistDeletedSignatures(list);
}

export function isLeadDeletedSignature(empresa?: string | null, cnpj?: string | null): boolean {
  const digits = normalizeCnpj(cnpj ?? "");
  const nome = normalizeNomeEmpresa(empresa ?? "");
  return listDeletedSignatures().some(
    (d) =>
      (digits.length >= 8 && d.cnpj.length >= 8 && d.cnpj === digits) ||
      (!!nome && d.nome === nome),
  );
}

export type UpsertLeadInput = Partial<Lead> & {
  empresa: string;
  cnpj?: string;
};

export function upsertLead(input: UpsertLeadInput): Lead {
  const list = listLeads();
  const idx = findIndex(list, input.cnpj ?? "", input.empresa);
  const now = new Date().toISOString();
  const base: Lead =
    idx >= 0
      ? list[idx]
      : {
          id: crypto.randomUUID(),
          cnpj: input.cnpj ?? "",
          empresa: input.empresa,
          contato: "",
          cargo: "",
          rd_deal_id: "",
          status: "reuniao_agendada",
          em_followup_frio: false,
          data_reuniao: input.data_reuniao ?? now,
          ultima_observacao: "",
          updated_at: now,
        };
  const merged: Lead = {
    ...base,
    ...input,
    empresa: input.empresa || base.empresa,
    cnpj: input.cnpj ?? base.cnpj,
    em_followup_frio: false,
    timeline: base.timeline ?? [],
    updated_at: now,
  };
  if (idx < 0 || (input.status && input.status !== base.status)) {
    merged.timeline = appendMarco(merged.timeline, {
      status: merged.status,
      titulo:
        idx < 0
          ? `Entrou na Central de Reuniões — ${LEAD_STATUS_LABEL[merged.status]}`
          : `Avançou para ${LEAD_STATUS_LABEL[merged.status]}`,
      detalhe: input.ultima_observacao || merged.ultima_observacao,
    });
  }
  if (idx >= 0) list[idx] = merged;
  else list.unshift(merged);
  persist(list);
  return merged;
}

function appendMarco(
  timeline: MarcoEvent[] | undefined,
  ev: {
    status: LeadStatus;
    titulo: string;
    detalhe?: string;
    at?: string;
    categoria?: MarcoEvent["categoria"];
  },
): MarcoEvent[] {
  const list = timeline ?? [];
  return [
    ...list,
    {
      id: crypto.randomUUID(),
      at: ev.at ?? new Date().toISOString(),
      marco: marcoDoStatus(ev.status),
      status: ev.status,
      titulo: ev.titulo,
      detalhe: ev.detalhe?.trim() || undefined,
      categoria: ev.categoria,
    },
  ];
}

export function addMarco(
  id: string,
  ev: {
    status?: LeadStatus;
    titulo: string;
    detalhe?: string;
    categoria?: MarcoEvent["categoria"];
  },
): Lead | null {
  const list = listLeads();
  const idx = list.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const prev = list[idx];
  const updated: Lead = {
    ...prev,
    timeline: appendMarco(prev.timeline, {
      status: ev.status ?? prev.status,
      titulo: ev.titulo,
      detalhe: ev.detalhe,
      categoria: ev.categoria,
    }),
    updated_at: new Date().toISOString(),
  };
  list[idx] = updated;
  persist(list);
  return updated;
}

export function updateLead(id: string, patch: Partial<Lead>): Lead | null {
  const list = listLeads();
  const idx = list.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const prev = list[idx];
  const statusChanged = patch.status && patch.status !== prev.status;
  const dateChanged = patch.data_reuniao && patch.data_reuniao !== prev.data_reuniao;
  const updated: Lead = {
    ...prev,
    ...patch,
    updated_at: new Date().toISOString(),
    stage_since: statusChanged ? new Date().toISOString() : prev.stage_since ?? prev.updated_at,
    reagendamentos:
      dateChanged && !statusChanged ? (prev.reagendamentos ?? 0) + 1 : prev.reagendamentos ?? 0,
  };
  updated.em_followup_frio = false;

  if (statusChanged) {
    updated.timeline = appendMarco(prev.timeline, {
      status: updated.status,
      titulo: `Alterou fase de ${LEAD_STATUS_LABEL[prev.status]} para ${LEAD_STATUS_LABEL[updated.status]}`,
      detalhe:
        [patch.ultima_observacao, patch.motivo_perda ? `Motivo: ${patch.motivo_perda}` : ""]
          .filter(Boolean)
          .join(" · ") || undefined,
    });
  } else if (dateChanged) {
    updated.timeline = appendMarco(prev.timeline, {
      status: updated.status,
      titulo: `Reagendado para ${new Date(updated.data_reuniao).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
      detalhe: patch.ultima_observacao,
    });
  } else if (patch.ata_executiva && patch.ata_executiva !== prev.ata_executiva) {
    updated.timeline = appendMarco(prev.timeline, {
      status: updated.status,
      titulo: "Ata executiva da reunião gerada",
    });
  } else if (patch.modalidade_coleta && patch.modalidade_coleta !== prev.modalidade_coleta) {
    updated.timeline = appendMarco(prev.timeline, {
      status: "levantamento_docs",
      titulo:
        patch.modalidade_coleta === "procuracao_ecac"
          ? "Coleta via Procuração e-CAC definida"
          : "Coleta via Arquivos TXT (EFDs) definida",
    });
  } else if (patch.valor_credito !== undefined && patch.valor_credito !== prev.valor_credito) {
    updated.timeline = appendMarco(prev.timeline, {
      status: "apresentacao_calculos",
      titulo: `Crédito apurado: R$ ${(patch.valor_credito ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    });
  }

  list[idx] = updated;
  persist(list);
  return updated;
}

export function deleteLead(id: string): void {
  const list = listLeads();
  const alvo = list.find((l) => l.id === id);
  if (alvo) markAsDeleted(alvo.cnpj, alvo.empresa);
  persist(list.filter((l) => l.id !== id));
}

function isolatedLeads(): Lead[] {
  return listLeads().filter((l) => l.status !== "perdido");
}

export function getExcludedFollowUpCnpjs(): Set<string> {
  return new Set(
    isolatedLeads()
      .map((l) => normalizeCnpj(l.cnpj))
      .filter((v) => v.length >= 8),
  );
}

export function getExcludedFollowUpCompanyNames(): Set<string> {
  return new Set(
    isolatedLeads()
      .map((l) => l.empresa.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isLeadIsolated(empresa?: string | null, cnpj?: string | null): boolean {
  const digits = normalizeCnpj(cnpj ?? "");
  const nome = (empresa ?? "").trim().toLowerCase();
  return isolatedLeads().some(
    (l) =>
      (digits.length >= 8 && normalizeCnpj(l.cnpj) === digits) ||
      (!!nome && l.empresa.trim().toLowerCase() === nome),
  );
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  reuniao_agendada: "📅 Reunião Agendada",
  resgate_reuniao: "🚑 Resgate de Reunião",
  pos_reuniao: "🤝 Pós-Reunião",
  levantamento_docs: "📄 Levantamento de Docs",
  apresentacao_calculos: "📊 Apresentação de Cálculos",
  fechado: "🏆 Fechado",
  perdido: "❌ Perdido",
  nao_qualificado: "🚫 Não Qualificado",
  pausado: "⏸️ Pausado",
};

export const LEAD_STATUS_TONE: Record<LeadStatus, string> = {
  reuniao_agendada: "bg-blue-100 text-blue-800 border-blue-200",
  resgate_reuniao: "bg-orange-100 text-orange-800 border-orange-200",
  pos_reuniao: "bg-amber-100 text-amber-800 border-amber-200",
  levantamento_docs: "bg-indigo-100 text-indigo-800 border-indigo-200",
  apresentacao_calculos: "bg-purple-100 text-purple-800 border-purple-200",
  fechado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  perdido: "bg-rose-100 text-rose-700 border-rose-200",
  nao_qualificado: "bg-zinc-100 text-zinc-700 border-zinc-300",
  pausado: "bg-slate-200 text-slate-700 border-slate-300",
};

export function daysInStage(lead: Lead): number {
  const since = lead.stage_since ?? lead.updated_at;
  const ms = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function isOverdue(lead: Lead): boolean {
  if (
    lead.status === "fechado" ||
    lead.status === "perdido" ||
    lead.status === "nao_qualificado" ||
    lead.status === "pausado"
  )
    return false;
  const d = new Date(lead.data_reuniao).getTime();
  return Number.isFinite(d) && d < Date.now();
}

export const FUNNEL_STAGES: LeadStatus[] = [
  "reuniao_agendada",
  "pos_reuniao",
  "levantamento_docs",
  "apresentacao_calculos",
  "fechado",
];

export const STAGE_HINT: Record<LeadStatus, string> = {
  reuniao_agendada: "Reunião marcada — confirmar presença.",
  resgate_reuniao: "Não compareceu — resgatar e reagendar.",
  pos_reuniao: "Enviar ata e acompanhar análise da diretoria.",
  levantamento_docs: "Coletar EFDs .TXT / procuração e-CAC.",
  apresentacao_calculos: "Apresentar créditos apurados e aguardar OK.",
  fechado: "Minuta assinada — iniciar PER/DCOMPs.",
  perdido: "Arquivado — reabordar no futuro.",
  nao_qualificado: "Sem fit técnico — não conta como recusa comercial.",
  pausado: "Decisão adiada — retomar na data combinada.",
};

export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return d;
}

export type AttemptKind =
  | "nao_atendeu"
  | "em_analise"
  | "ata_enviada"
  | "reagendar"
  | "retorno_positivo"
  | "outro";

export const ATTEMPT_LABEL: Record<AttemptKind, string> = {
  nao_atendeu: "📵 Não atendeu",
  em_analise: "🕒 Em análise com a diretoria",
  ata_enviada: "📨 Ata enviada",
  reagendar: "📅 Pediu para reagendar",
  retorno_positivo: "👍 Retorno positivo",
  outro: "📝 Registro",
};

export const ATTEMPT_TEXT: Record<AttemptKind, string> = {
  nao_atendeu: "Tentativa de contato: Cliente não atendeu a ligação.",
  em_analise: "Status: Proposta e minuta em análise com a diretoria.",
  ata_enviada: "Ação: Ata da reunião e alinhamentos enviados por e-mail/WhatsApp.",
  retorno_positivo: "Ação: Recebido retorno positivo do cliente sobre a proposta.",
  reagendar: "Ação: Solicitado reagendamento de conversa/reunião.",
  outro: "Registro manual da negociação.",
};

export function logAttempt(id: string, kind: AttemptKind, detalhe?: string): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  const texto = [ATTEMPT_TEXT[kind], detalhe?.trim()].filter(Boolean).join(" — ");
  const updated = addMarco(id, {
    status: lead.status,
    titulo: ATTEMPT_LABEL[kind],
    detalhe: texto,
    categoria: kind === "ata_enviada" ? "comunicacao" : undefined,
  });

  if (updated && kind === "ata_enviada") {
    updateLead(id, {
      ata_enviada_em: new Date().toISOString(),
      ultima_observacao: texto,
    });
  } else if (updated) {
    updateLead(id, { ultima_observacao: texto });
  }
  return listLeads().find((l) => l.id === id) ?? null;
}

export function registrarComunicacao(
  id: string,
  canal: "ata" | "email" | "whatsapp" | "outro",
  resumo: string,
): Lead | null {
  const titulo =
    canal === "ata"
      ? "📨 Ata enviada ao cliente"
      : canal === "email"
        ? "✉️ E-mail enviado"
        : canal === "whatsapp"
          ? "💬 WhatsApp enviado"
          : "📤 Comunicação enviada";
  return addMarco(id, { titulo, detalhe: resumo, categoria: "comunicacao" });
}

export function listComunicacoes(lead: Lead): MarcoEvent[] {
  const RE = /(ata enviada|e-?mail|whatsapp|proposta enviada|minuta enviada)/i;
  return [...(lead.timeline ?? [])]
    .filter((e) => e.categoria === "comunicacao" || RE.test(`${e.titulo} ${e.detalhe ?? ""}`))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function scheduleLeadReturn(id: string, scheduledAt: string, detalhe?: string): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  const d = new Date(scheduledAt);
  const dataFmt = d.toLocaleDateString("pt-BR");
  updateLead(id, { data_reuniao: d.toISOString() });
  return addMarco(id, {
    status: lead.status,
    titulo: `📅 Próximo retorno agendado para ${dataFmt}`,
    detalhe: [
      `Próximo retorno agendado para ${dataFmt} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
      detalhe?.trim(),
    ]
      .filter(Boolean)
      .join(" — "),
  });
}

export function archiveLead(id: string, motivo: string, detalhe?: string): Lead | null {
  const updated = updateLead(id, {
    status: "perdido",
    motivo_perda: motivo,
    ultima_observacao: detalhe || motivo,
  });
  if (updated) {
    addMarco(id, {
      status: "perdido",
      titulo: "📦 Arquivado para Reativação Futura",
      detalhe: `Lead arquivado por motivo: ${[motivo, detalhe?.trim()].filter(Boolean).join(" — ")}`,
    });
  }
  return listLeads().find((l) => l.id === id) ?? null;
}

export function reactivateLead(id: string, status: LeadStatus = "reuniao_agendada", obs?: string): Lead | null {
  const updated = updateLead(id, {
    status,
    motivo_perda: undefined,
    ultima_observacao: obs || "Lead reativado para nova abordagem.",
  });
  if (updated) addMarco(id, { status, titulo: "♻️ Reativado para nova abordagem", detalhe: obs });
  return updated;
}

export function pauseLead(
  id: string,
  pausadoAte: string | null,
  obs?: string,
  motivos?: string[],
): Lead | null {
  const atual = listLeads().find((l) => l.id === id);
  if (!atual) return null;
  const anterior: LeadStatus =
    atual.status === "pausado" ? atual.fase_antes_pausa ?? "reuniao_agendada" : atual.status;
  const updated = updateLead(id, {
    status: "pausado",
    fase_antes_pausa: anterior,
    pausado_ate: pausadoAte ?? null,
    pausado_motivo: motivos && motivos.length > 0 ? motivos : undefined,
    ultima_observacao:
      obs ||
      (pausadoAte ? `Decisão adiada — retomar em ${fmtData(pausadoAte)}.` : "Decisão adiada — sem data definida."),
  });
  if (updated) {
    addMarco(id, {
      status: "pausado",
      titulo: pausadoAte ? `⏸️ Pausado até ${fmtData(pausadoAte)}` : "⏸️ Pausado (sem data definida)",
      detalhe: [
        obs,
        motivos && motivos.length > 0 ? `Avaliação com: ${motivos.join(", ")}` : "",
        `Estava em ${LEAD_STATUS_LABEL[anterior]}`,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return listLeads().find((l) => l.id === id) ?? null;
}

export function resumeLead(id: string, obs?: string): Lead | null {
  const atual = listLeads().find((l) => l.id === id);
  if (!atual) return null;
  const destino = atual.fase_antes_pausa ?? "reuniao_agendada";
  const updated = updateLead(id, {
    status: destino,
    pausado_ate: null,
    pausado_motivo: undefined,
    fase_antes_pausa: undefined,
    ultima_observacao: obs || "Contato retomado após pausa.",
  });
  if (updated)
    addMarco(id, { status: destino, titulo: "▶️ Retomado após pausa", detalhe: obs });
  return updated;
}

export function effectiveStage(lead: Lead): LeadStatus {
  return lead.status === "pausado" ? lead.fase_antes_pausa ?? "reuniao_agendada" : lead.status;
}

export function isPauseDue(lead: Lead): boolean {
  if (lead.status !== "pausado" || !lead.pausado_ate) return false;
  const t = new Date(lead.pausado_ate).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(+d) ? d.toLocaleDateString("pt-BR") : iso;
}

function newFollowUpId(): string {
  return `lfu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listLeadFollowUps(lead: Lead): LeadFollowUp[] {
  return [...(lead.follow_ups ?? [])].sort(
    (a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at),
  );
}

export function addLeadFollowUp(
  id: string,
  input: {
    scheduled_at: string;
    canal?: LeadFollowUp["canal"];
    assunto: string;
    notas?: string;
    sincronizarCompromisso?: boolean;
  },
): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  const fu: LeadFollowUp = {
    id: newFollowUpId(),
    scheduled_at: input.scheduled_at,
    canal: input.canal ?? "ligacao",
    assunto: input.assunto,
    notas: input.notas,
    done: false,
    created_at: new Date().toISOString(),
  };
  const patch: Partial<Lead> = {
    follow_ups: [...(lead.follow_ups ?? []), fu],
    proximo_passo: input.assunto,
  };
  if (input.sincronizarCompromisso !== false) patch.data_reuniao = input.scheduled_at;
  const updated = updateLead(id, patch);
  addMarco(id, {
    status: lead.status,
    titulo: `📌 Follow-up agendado — ${new Date(input.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    detalhe: [LEAD_FOLLOWUP_CANAL_LABEL[fu.canal], input.assunto, input.notas]
      .filter(Boolean)
      .join(" · "),
  });
  return updated;
}

export function completeLeadFollowUp(
  id: string,
  followUpId: string,
  resultado?: string,
): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  const alvo = (lead.follow_ups ?? []).find((f) => f.id === followUpId);
  const updated = updateLead(id, {
    follow_ups: (lead.follow_ups ?? []).map((f) =>
      f.id === followUpId ? { ...f, done: true, done_at: new Date().toISOString() } : f,
    ),
  });
  addMarco(id, {
    status: lead.status,
    titulo: "✅ Follow-up realizado",
    detalhe: [alvo?.assunto, resultado].filter(Boolean).join(" · ") || undefined,
  });
  return updated;
}

export function removeLeadFollowUp(id: string, followUpId: string): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  return updateLead(id, {
    follow_ups: (lead.follow_ups ?? []).filter((f) => f.id !== followUpId),
  });
}

export function rescheduleLeadFollowUp(
  id: string,
  followUpId: string,
  scheduledAt: string,
  sincronizarCompromisso = true,
): Lead | null {
  const lead = listLeads().find((l) => l.id === id);
  if (!lead) return null;
  const patch: Partial<Lead> = {
    follow_ups: (lead.follow_ups ?? []).map((f) =>
      f.id === followUpId ? { ...f, scheduled_at: scheduledAt, done: false } : f,
    ),
  };
  if (sincronizarCompromisso) patch.data_reuniao = scheduledAt;
  return updateLead(id, patch);
}

export function pendingLeadFollowUps(lead: Lead): LeadFollowUp[] {
  return listLeadFollowUps(lead).filter((f) => !f.done);
}
