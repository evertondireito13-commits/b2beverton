// Camada de persistência em nuvem para o histórico de empresas e os leads.
//
// Os stores (historico-store / leads-store) continuam SÍNCRONOS lendo do
// localStorage (cache instantâneo/offline). Este módulo espelha toda escrita
// para o Supabase e hidrata o cache local a partir da nuvem na abertura do app.
import { upsertHistoricos, deleteHistoricos, listarHistoricos } from "@/lib/historico.functions";
import { upsertLeads, deleteLeads, listarLeads } from "@/lib/leads.functions";
import type { HistoricoEmpresa, HistoricoStatus } from "@/lib/historico-store";
import type { Lead, LeadStatus } from "@/lib/leads-store";

export const HISTORICO_KEY_BASE = "bhm_historico_empresas";
export const LEADS_KEY_BASE = "bhm-leads-central";
const MIGRATED_FLAG = "bhm.migrado_supabase";
const HASH_KEY = "bhm.sync.hashes";

/** Sinaliza para a UI que a leitura atual veio do cache local (nuvem indisponível). */
export const CLOUD_STATUS_EVENT = "bhm:cloud-status";
let cloudStale = false;
export function isCloudStale() {
  return cloudStale;
}
function setCloudStale(v: boolean) {
  if (cloudStale === v) return;
  cloudStale = v;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CLOUD_STATUS_EVENT));
}

const isBrowser = () => typeof window !== "undefined";

/** UUID determinístico a partir de um id local (que nem sempre é UUID). */
export function stableUuid(seed: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seed)) return seed;
  const bytes = new Uint8Array(16);
  let h1 = 0x811c9dc5;
  for (let i = 0; i < 16; i++) {
    let h = h1 ^ (i * 0x01000193);
    for (let j = 0; j < seed.length; j++) {
      h ^= seed.charCodeAt(j);
      h = Math.imul(h, 0x01000193);
    }
    bytes[i] = h >>> 24;
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hashOf(v: unknown): string {
  const s = JSON.stringify(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ":" + s.length;
}

type HashMap = Record<string, string>;
function loadHashes(scope: string): HashMap {
  if (!isBrowser()) return {};
  try {
    const all = JSON.parse(window.localStorage.getItem(HASH_KEY) ?? "{}");
    return (all?.[scope] as HashMap) ?? {};
  } catch {
    return {};
  }
}
function saveHashes(scope: string, map: HashMap) {
  if (!isBrowser()) return;
  try {
    const all = JSON.parse(window.localStorage.getItem(HASH_KEY) ?? "{}");
    all[scope] = map;
    window.localStorage.setItem(HASH_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}

function iso(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------- mapeamentos

export function historicoToRow(r: HistoricoEmpresa, consultor: string) {
  return {
    id: stableUuid(r.id),
    consultor,
    data_iso: iso(r.dataIso) ?? new Date().toISOString(),
    empresa_nome: r.empresaNome ?? "",
    cnpj: r.cnpj ?? null,
    contato: r.contato ?? null,
    cargo: r.cargo ?? null,
    resultado: r.resultado ?? null,
    interesse: r.interesse ?? null,
    proxima_acao: r.proximaAcao ?? null,
    proxima_acao_data: iso(r.proximaAcaoData),
    objecao: r.objecao ?? null,
    texto_historico_completo: r.textoHistoricoCompleto ?? "",
    descricao_original: r.descricaoOriginal ?? null,
    status: r.status ?? "pendente",
    arquivado_manual: r.arquivadoManual ?? false,
  };
}

type HistoricoRow = ReturnType<typeof historicoToRow>;

export function rowToHistorico(row: HistoricoRow, consultor: string): HistoricoEmpresa {
  const d = new Date(row.data_iso);
  return {
    id: row.id,
    dataIso: row.data_iso,
    dataFormatada: d.toLocaleDateString("pt-BR"),
    empresaNome: row.empresa_nome,
    cnpj: row.cnpj,
    contato: row.contato,
    cargo: row.cargo,
    resultado: row.resultado,
    interesse: row.interesse,
    proximaAcao: row.proxima_acao,
    proximaAcaoData: row.proxima_acao_data,
    objecao: row.objecao,
    textoHistoricoCompleto: row.texto_historico_completo,
    descricaoOriginal: row.descricao_original,
    consultor: consultor as HistoricoEmpresa["consultor"],
    status: (row.status as HistoricoStatus) ?? "pendente",
    arquivadoManual: row.arquivado_manual,
  };
}

export function leadToRow(l: Lead, consultor: string) {
  return {
    id: stableUuid(l.id),
    consultor,
    cnpj: l.cnpj ?? "",
    empresa: l.empresa ?? "",
    contato: l.contato ?? null,
    cargo: l.cargo ?? null,
    telefone: l.telefone ?? null,
    email: l.email ?? null,
    proximo_passo: l.proximo_passo ?? null,
    rd_deal_id: l.rd_deal_id ?? null,
    status: l.status,
    em_followup_frio: !!l.em_followup_frio,
    data_reuniao: iso(l.data_reuniao),
    ultima_observacao: l.ultima_observacao ?? null,
    motivo_perda: l.motivo_perda ?? null,
    stage_since: iso(l.stage_since),
    reagendamentos: l.reagendamentos ?? 0,
    pausado_ate: iso(l.pausado_ate ?? undefined) ?? null,
    fase_antes_pausa: l.fase_antes_pausa ?? null,
    pausado_motivo: l.pausado_motivo ?? [],
    no_show_count: l.no_show_count ?? 0,
    fechamento_direto: !!l.fechamento_direto,
    tipo_negociacao: l.tipo_negociacao ?? "cliente_direto",
    area_negociacao: l.area_negociacao ?? "tributario",
    timeline: l.timeline ?? [],
    follow_ups: l.follow_ups ?? [],
    ata_executiva: l.ata_executiva ?? null,
    ata_enviada_em: iso(l.ata_enviada_em),
    modalidade_coleta: l.modalidade_coleta ?? null,
    docs_recebidos_em: iso(l.docs_recebidos_em),
    valor_credito: l.valor_credito ?? null,
    percentual_honorarios: l.percentual_honorarios ?? null,
    oportunidades: l.oportunidades ?? [],
    anexos: l.anexos ?? [],
    comissao_percentual: l.comissao_percentual ?? null,
    contrato_assinado_em: iso(l.contrato_assinado_em),
    updated_at: iso(l.updated_at) ?? new Date().toISOString(),
  };
}

type LeadRow = ReturnType<typeof leadToRow>;

export function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    cnpj: row.cnpj ?? "",
    empresa: row.empresa ?? "",
    contato: row.contato ?? "",
    cargo: row.cargo ?? "",
    telefone: row.telefone ?? undefined,
    email: row.email ?? undefined,
    proximo_passo: row.proximo_passo ?? undefined,
    rd_deal_id: row.rd_deal_id ?? "",
    status: row.status as LeadStatus,
    em_followup_frio: !!row.em_followup_frio,
    data_reuniao: row.data_reuniao ?? "",
    ultima_observacao: row.ultima_observacao ?? "",
    motivo_perda: row.motivo_perda ?? undefined,
    stage_since: row.stage_since ?? undefined,
    reagendamentos: row.reagendamentos ?? 0,
    pausado_ate: row.pausado_ate ?? null,
    fase_antes_pausa: (row.fase_antes_pausa as LeadStatus | null) ?? undefined,
    pausado_motivo: row.pausado_motivo ?? [],
    no_show_count: row.no_show_count ?? 0,
    fechamento_direto: !!row.fechamento_direto,
    tipo_negociacao: (row.tipo_negociacao as Lead["tipo_negociacao"]) ?? "cliente_direto",
    area_negociacao: (row.area_negociacao as Lead["area_negociacao"]) ?? "tributario",
    timeline: (row.timeline as Lead["timeline"]) ?? [],
    follow_ups: (row.follow_ups as Lead["follow_ups"]) ?? [],
    ata_executiva: row.ata_executiva ?? undefined,
    ata_enviada_em: row.ata_enviada_em ?? undefined,
    modalidade_coleta: (row.modalidade_coleta as Lead["modalidade_coleta"]) ?? undefined,
    docs_recebidos_em: row.docs_recebidos_em ?? undefined,
    valor_credito: row.valor_credito ?? undefined,
    percentual_honorarios: row.percentual_honorarios ?? undefined,
    oportunidades: (row.oportunidades as Lead["oportunidades"]) ?? [],
    anexos: (row.anexos as Lead["anexos"]) ?? [],
    comissao_percentual: row.comissao_percentual ?? undefined,
    contrato_assinado_em: row.contrato_assinado_em ?? undefined,
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

// ------------------------------------------------------------ sync (escrita)

type Kind = "historico" | "leads";


const timers: Partial<Record<Kind, ReturnType<typeof setTimeout>>> = {};

/**
 * Espelha a lista completa do consultor na nuvem (debounced).
 * Só envia linhas que mudaram e apaga as que sumiram localmente.
 */
export function scheduleCloudSync(kind: Kind, rows: Array<HistoricoRow | LeadRow>, consultor: string) {
  if (!isBrowser()) return;
  if (timers[kind]) clearTimeout(timers[kind]);
  timers[kind] = setTimeout(() => {
    void pushRows(kind, rows, consultor);
  }, 700);
}

async function pushRows(kind: Kind, rows: Array<HistoricoRow | LeadRow>, consultor: string) {
  const scope = `${kind}::${consultor}`;
  const prev = loadHashes(scope);
  const next: HashMap = {};
  const changed: Array<HistoricoRow | LeadRow> = [];
  for (const row of rows) {
    const h = hashOf(row);
    next[row.id] = h;
    if (prev[row.id] !== h) changed.push(row);
  }
  const removed = Object.keys(prev).filter((id) => !(id in next));

  try {
    for (let i = 0; i < changed.length; i += 200) {
      const chunk = changed.slice(i, i + 200) as unknown as Array<Record<string, unknown>>;
      if (kind === "historico") await upsertHistoricos({ data: { consultor, rows: chunk } });
      else await upsertLeads({ data: { consultor, rows: chunk } });
    }
    if (removed.length) {
      if (kind === "historico") await deleteHistoricos({ data: { consultor, ids: removed } });
      else await deleteLeads({ data: { consultor, ids: removed } });
    }
    saveHashes(scope, next);
    setCloudStale(false);
  } catch (err) {
    console.warn(`[cloud-store] falha ao sincronizar ${kind}:`, err);
    setCloudStale(true);
  }
}

// ------------------------------------------------------------ hidratação

function localKey(kind: Kind, consultor: string) {
  return kind === "historico"
    ? `${HISTORICO_KEY_BASE}::${consultor}`
    : `${LEADS_KEY_BASE}::${consultor}`;
}

/** Junta o que veio da nuvem com o que já está no navegador, por id.
 *  Nunca "esquece" um item que só existe localmente — se a nuvem devolver
 *  uma lista vazia (ex.: banco recém-criado numa transferência de conta,
 *  ou o marcador de migração ficou preso de um backend antigo), o item
 *  local simplesmente é mantido, em vez de apagado. Quando o mesmo id
 *  existe nos dois lados, a versão da nuvem vence (é a mais "oficial"). */
function mergeById<T extends { id: string }>(local: T[], remoto: T[]): T[] {
  const porId = new Map<string, T>();
  for (const item of local) porId.set(item.id, item);
  for (const item of remoto) porId.set(item.id, item); // nuvem tem prioridade quando existe dos dois lados
  return Array.from(porId.values());
}

function lerLocal<T>(kind: Kind, consultor: string): T[] {
  try {
    const raw = window.localStorage.getItem(localKey(kind, consultor));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Baixa os dados da nuvem e MISTURA com o cache local (nunca substitui puro).
 * Se a nuvem falhar, mantém o cache atual e marca o estado como
 * "possivelmente desatualizado".
 */
export async function hydrateFromCloud(consultor: string): Promise<void> {
  if (!isBrowser()) return;
  await runOneShotMigration(consultor);
  try {
    const [hist, leads] = await Promise.all([
      listarHistoricos({ data: { consultor } }),
      listarLeads({ data: { consultor } }),
    ]);

    const historicosRemoto = (hist ?? []).map((r) => rowToHistorico(r as unknown as HistoricoRow, consultor));
    const leadsRemoto = (leads ?? []).map((r) => rowToLead(r as unknown as LeadRow));

    const historicoLocal = lerLocal<HistoricoEmpresa>("historico", consultor);
    const leadsLocal = lerLocal<Lead>("leads", consultor);

    const historicos = mergeById(historicoLocal, historicosRemoto);
    const leadList = mergeById(leadsLocal, leadsRemoto);

    window.localStorage.setItem(localKey("historico", consultor), JSON.stringify(historicos));
    window.localStorage.setItem(localKey("leads", consultor), JSON.stringify(leadList));
    saveHashes(
      `historico::${consultor}`,
      Object.fromEntries(historicos.map((r) => [r.id, hashOf(historicoToRow(r, consultor))])),
    );
    saveHashes(
      `leads::${consultor}`,
      Object.fromEntries(leadList.map((l) => [l.id, hashOf(leadToRow(l, consultor))])),
    );
    setCloudStale(false);
    window.dispatchEvent(new Event("bhm:historico-updated"));
    window.dispatchEvent(new CustomEvent("bhm:leads-updated"));

    // Auto-cura: qualquer item que só existia localmente (ainda não tinha
    // chegado na nuvem) é reenviado agora — fecha o buraco de vez, mesmo
    // que o marcador de "já migrei" estivesse preso de um backend antigo.
    scheduleCloudSync(
      "historico",
      historicos.map((r) => historicoToRow(r, consultor)),
      consultor,
    );
    scheduleCloudSync(
      "leads",
      leadList.map((l) => leadToRow(l, consultor)),
      consultor,
    );
  } catch (err) {
    console.warn("[cloud-store] leitura da nuvem falhou, usando cache local:", err);
    setCloudStale(true);
  }
}

/** Envia uma única vez tudo que já existe no localStorage para a nuvem. */
export async function runOneShotMigration(consultor: string): Promise<void> {
  if (!isBrowser()) return;
  const flagKey = `${MIGRATED_FLAG}::${consultor}`;
  if (window.localStorage.getItem(flagKey) === "true") return;
  try {
    const rawHist = window.localStorage.getItem(localKey("historico", consultor));
    const rawLeads = window.localStorage.getItem(localKey("leads", consultor));
    const historicos: HistoricoEmpresa[] = rawHist ? JSON.parse(rawHist) : [];
    const leads: Lead[] = rawLeads ? JSON.parse(rawLeads) : [];

    if (Array.isArray(historicos) && historicos.length) {
      const rows = historicos.map((r) => historicoToRow(r, consultor)) as unknown as Array<
        Record<string, unknown>
      >;
      for (let i = 0; i < rows.length; i += 200) {
        await upsertHistoricos({ data: { consultor, rows: rows.slice(i, i + 200) } });
      }
    }
    if (Array.isArray(leads) && leads.length) {
      const rows = leads.map((l) => leadToRow(l, consultor)) as unknown as Array<
        Record<string, unknown>
      >;
      for (let i = 0; i < rows.length; i += 200) {
        await upsertLeads({ data: { consultor, rows: rows.slice(i, i + 200) } });
      }
    }
    window.localStorage.setItem(flagKey, "true");
  } catch (err) {
    console.warn("[cloud-store] migração inicial adiada:", err);
  }
}
