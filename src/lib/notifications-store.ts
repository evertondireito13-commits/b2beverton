// Central de notificações persistente.
// As notificações são DERIVADAS do estado real (leads, follow-ups, metas) com
// IDs determinísticos, e o que o operador já leu/dispensou fica salvo por
// consultor no localStorage — nada se perde ao recarregar a página.

import {
  getConsultor,
  getSessionConsultor,
  calcularRelatorioDiario,
  proximosFollowUps,
} from "@/lib/historico-store";
import {
  listLeads,
  isOverdue,
  daysInStage,
  LEAD_STATUS_LABEL,
  type LeadStatus,
} from "@/lib/leads-store";

export const NOTIFICATIONS_EVENT = "bhm:notifications-updated";

export type NotificationKind =
  | "followup_vencido"
  | "followup_hoje"
  | "reuniao_hoje"
  | "reuniao_atrasada"
  | "sla_parado"
  | "meta";

export type NotificationSeverity = "alta" | "media" | "info";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  titulo: string;
  descricao: string;
  empresa?: string;
  cnpj?: string | null;
  quando?: string; // ISO
  href?: string;
  lida: boolean;
  dispensada: boolean;
};

type PersistedState = { lidas: string[]; dispensadas: string[] };

const BASE_KEY = "bhm-notificacoes";
const META_DIA = 30;

const SLA_POR_ETAPA: Partial<Record<LeadStatus, number>> = {
  reuniao_agendada: 7,
  resgate_reuniao: 2,
  pos_reuniao: 3,
  levantamento_docs: 5,
  apresentacao_calculos: 4,
};

function isBrowser() {
  return typeof window !== "undefined";
}

function key(): string {
  const c = (getSessionConsultor() ?? getConsultor()) || "shared";
  return `${BASE_KEY}::${c}`;
}

function readState(): PersistedState {
  if (!isBrowser()) return { lidas: [], dispensadas: [] };
  try {
    const raw = window.localStorage.getItem(key());
    if (!raw) return { lidas: [], dispensadas: [] };
    const p = JSON.parse(raw) as Partial<PersistedState>;
    return {
      lidas: Array.isArray(p.lidas) ? p.lidas : [],
      dispensadas: Array.isArray(p.dispensadas) ? p.dispensadas : [],
    };
  } catch {
    return { lidas: [], dispensadas: [] };
  }
}

function writeState(s: PersistedState) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key(), JSON.stringify(s));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function sameDay(iso: string): boolean {
  return new Date(iso).toISOString().slice(0, 10) === hoje();
}

/** Gera a lista atual de notificações a partir do estado real do sistema. */
export function buildNotifications(): AppNotification[] {
  if (!isBrowser()) return [];
  const state = readState();
  const lidas = new Set(state.lidas);
  const dispensadas = new Set(state.dispensadas);
  const out: AppNotification[] = [];

  const push = (n: Omit<AppNotification, "lida" | "dispensada">) => {
    out.push({ ...n, lida: lidas.has(n.id), dispensada: dispensadas.has(n.id) });
  };

  // 1) Leads da Central com compromisso vencido ou reunião hoje.
  for (const lead of listLeads()) {
    if (lead.status === "perdido" || lead.status === "fechado" || lead.status === "nao_qualificado")
      continue;
    if (isOverdue(lead)) {
      push({
        id: `lead-atraso:${lead.id}:${lead.data_reuniao}`,
        kind: "reuniao_atrasada",
        severity: "alta",
        titulo: `Compromisso vencido — ${lead.empresa}`,
        descricao: `${LEAD_STATUS_LABEL[lead.status]} · previsto para ${new Date(lead.data_reuniao).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
        empresa: lead.empresa,
        cnpj: lead.cnpj,
        quando: lead.data_reuniao,
        href: "/reunioes",
      });
    } else if (sameDay(lead.data_reuniao)) {
      push({
        id: `lead-hoje:${lead.id}:${hoje()}`,
        kind: "reuniao_hoje",
        severity: "media",
        titulo: `Reunião hoje — ${lead.empresa}`,
        descricao: `${new Date(lead.data_reuniao).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · ${lead.contato || "decisor não informado"}`,
        empresa: lead.empresa,
        cnpj: lead.cnpj,
        quando: lead.data_reuniao,
        href: "/reunioes",
      });
    }
    const sla = SLA_POR_ETAPA[lead.status];
    const dias = daysInStage(lead);
    if (sla !== undefined && dias > sla) {
      push({
        id: `sla:${lead.id}:${lead.status}:${dias}`,
        kind: "sla_parado",
        severity: "media",
        titulo: `${lead.empresa} parada há ${dias} dias`,
        descricao: `${LEAD_STATUS_LABEL[lead.status]} — SLA da etapa é de ${sla} dias. Registre um avanço.`,
        empresa: lead.empresa,
        cnpj: lead.cnpj,
        href: "/reunioes",
      });
    }
  }

  // 2) Follow-ups locais vencidos / do dia.
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  for (const f of proximosFollowUps(30)) {
    const d = new Date(f.dataIso);
    const vencido = d < inicioHoje;
    const eHoje = d.toISOString().slice(0, 10) === hoje();
    if (!vencido && !eHoje) continue;
    push({
      id: `fup:${f.id}:${f.dataIso.slice(0, 10)}`,
      kind: vencido ? "followup_vencido" : "followup_hoje",
      severity: vencido ? "alta" : "media",
      titulo: `${vencido ? "Follow-up vencido" : "Follow-up hoje"} — ${f.empresaNome}`,
      descricao: f.proximaAcao || "Retorno agendado",
      empresa: f.empresaNome,
      cnpj: f.cnpj,
      quando: f.dataIso,
      href: "/followup",
    });
  }

  // 3) Meta do dia.
  const rel = calcularRelatorioDiario();
  const feitas = rel.hoje.ligacoes;
  if (feitas >= META_DIA) {
    push({
      id: `meta-ok:${hoje()}`,
      kind: "meta",
      severity: "info",
      titulo: "🏆 Meta diária batida",
      descricao: `${feitas} ligações registradas hoje (meta ${META_DIA}).`,
      href: "/painel",
    });
  } else if (new Date().getHours() >= 15) {
    push({
      id: `meta-alerta:${hoje()}`,
      kind: "meta",
      severity: "media",
      titulo: `Faltam ${META_DIA - feitas} ligações para a meta`,
      descricao: `${feitas}/${META_DIA} registradas até agora.`,
      href: "/painel",
    });
  }

  const ordem: Record<NotificationSeverity, number> = { alta: 0, media: 1, info: 2 };
  return out
    .filter((n) => !n.dispensada)
    .sort(
      (a, b) =>
        ordem[a.severity] - ordem[b.severity] ||
        (a.quando ?? "").localeCompare(b.quando ?? ""),
    );
}

export function unreadCount(): number {
  return buildNotifications().filter((n) => !n.lida).length;
}

export function markRead(id: string) {
  const s = readState();
  if (!s.lidas.includes(id)) s.lidas.push(id);
  writeState(s);
}

export function markAllRead() {
  const s = readState();
  const ids = buildNotifications().map((n) => n.id);
  s.lidas = [...new Set([...s.lidas, ...ids])];
  writeState(s);
}

export function dismissNotification(id: string) {
  const s = readState();
  if (!s.dispensadas.includes(id)) s.dispensadas.push(id);
  if (!s.lidas.includes(id)) s.lidas.push(id);
  writeState(s);
}

export function restoreDismissed() {
  const s = readState();
  s.dispensadas = [];
  writeState(s);
}

export const NOTIFICATION_ICON: Record<NotificationKind, string> = {
  followup_vencido: "⏰",
  followup_hoje: "📞",
  reuniao_hoje: "📅",
  reuniao_atrasada: "🚨",
  sla_parado: "🐢",
  meta: "🎯",
};

export const SEVERITY_TONE: Record<NotificationSeverity, string> = {
  alta: "border-rose-200 bg-rose-50",
  media: "border-amber-200 bg-amber-50",
  info: "border-emerald-200 bg-emerald-50",
};
