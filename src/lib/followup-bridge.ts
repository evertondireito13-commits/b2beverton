// Ponte entre as três representações de "follow-up" do app:
//   1. tabela follow_ups (servidor) — src/lib/follow-ups.functions.ts
//   2. LeadFollowUp dentro do Lead (localStorage) — src/lib/leads-store.ts
//   3. proximaAcaoData do histórico (localStorage) — src/lib/historico-store.ts
//
// Nada é removido: mantemos as três, mas espelhamos a tabela no localStorage
// (para Agenda e timeline lerem de forma síncrona) e propagamos concluir /
// reagendar para as outras estruturas, de modo que todas mostrem a MESMA data.

import type { FollowUp } from "@/lib/follow-ups.functions";
import {
  getConsultor,
  getSessionConsultor,
  historicoMatchesEmpresa,
  setProximaAcaoDataEmpresa,
} from "@/lib/historico-store";
import {
  addLeadFollowUp,
  completeLeadFollowUp,
  listLeadFollowUps,
  listLeads,
  rescheduleLeadFollowUp,
  type Lead,
  type LeadFollowUp,
} from "@/lib/leads-store";

export const FOLLOWUPS_EVENT = "bhm:followups-updated";

function isBrowser() {
  return typeof window !== "undefined";
}

export function activeConsultor(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

function mirrorKey(): string {
  return `bhm:followups-mirror:${activeConsultor()}`;
}

// ---------------------------------------------------------------------------
// Espelho local da tabela follow_ups
// ---------------------------------------------------------------------------

/** Guarda a última lista vinda do servidor para leitura síncrona nas telas. */
export function cacheRemoteFollowUps(rows: FollowUp[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(mirrorKey(), JSON.stringify(rows));
  } catch {
    /* quota */
  }
}

export function getMirroredFollowUps(): FollowUp[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(mirrorKey());
    if (!raw) return [];
    const arr = JSON.parse(raw) as FollowUp[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function getPendingMirroredFollowUps(): FollowUp[] {
  return getMirroredFollowUps().filter((f) => f.status === "pending");
}

/** Aplica a alteração de um registro no espelho, sem esperar novo fetch. */
export function patchMirroredFollowUp(id: string, patch: Partial<FollowUp>): void {
  const rows = getMirroredFollowUps();
  const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
  cacheRemoteFollowUps(next);
}

export function removeMirroredFollowUp(id: string): void {
  cacheRemoteFollowUps(getMirroredFollowUps().filter((r) => r.id !== id));
}

// ---------------------------------------------------------------------------
// Casamento empresa <-> follow-up / lead
// ---------------------------------------------------------------------------

export type CompanyRef = { empresaNome?: string | null; cnpj?: string | null };

export function followUpMatchesEmpresa(fu: FollowUp, target: CompanyRef): boolean {
  return historicoMatchesEmpresa({ empresaNome: fu.company_name, cnpj: fu.cnpj }, target);
}

/** Follow-ups da tabela relacionados a uma empresa (todos os status). */
export function mirroredFollowUpsForCompany(target: CompanyRef): FollowUp[] {
  return getMirroredFollowUps()
    .filter((f) => followUpMatchesEmpresa(f, target))
    .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
}

export function findLeadForCompany(target: CompanyRef): Lead | null {
  const digits = (target.cnpj ?? "").replace(/\D/g, "");
  return (
    listLeads().find((l) => {
      const ld = (l.cnpj ?? "").replace(/\D/g, "");
      if (digits.length >= 8 && ld.length >= 8 && ld === digits) return true;
      return historicoMatchesEmpresa(
        { empresaNome: l.empresa, cnpj: l.cnpj },
        target,
      );
    }) ?? null
  );
}

function nearestPendingLeadFollowUp(lead: Lead, iso?: string | null): LeadFollowUp | null {
  const pend = listLeadFollowUps(lead).filter((f) => !f.done);
  if (!pend.length) return null;
  if (!iso) return pend[0] ?? null;
  const alvo = +new Date(iso);
  return pend.reduce((best, cur) =>
    Math.abs(+new Date(cur.scheduled_at) - alvo) < Math.abs(+new Date(best.scheduled_at) - alvo)
      ? cur
      : best,
  );
}

function emit() {
  if (isBrowser()) window.dispatchEvent(new Event(FOLLOWUPS_EVENT));
}

// ---------------------------------------------------------------------------
// Propagação: tabela -> lead + histórico
// ---------------------------------------------------------------------------

/** Follow-up concluído em /followup: dá baixa no lead e limpa a data do histórico. */
export function propagateFollowUpDone(row: FollowUp): void {
  const target: CompanyRef = { empresaNome: row.company_name, cnpj: row.cnpj };
  const lead = findLeadForCompany(target);
  if (lead) {
    const alvo = nearestPendingLeadFollowUp(lead, row.scheduled_at);
    if (alvo) completeLeadFollowUp(lead.id, alvo.id, row.notes ?? undefined);
  }
  setProximaAcaoDataEmpresa(target, null);
  emit();
}

/** Follow-up reagendado em /followup: move o lead e o histórico para a mesma data. */
export function propagateFollowUpReschedule(row: FollowUp, scheduledAt: string): void {
  const target: CompanyRef = { empresaNome: row.company_name, cnpj: row.cnpj };
  const lead = findLeadForCompany(target);
  if (lead) {
    const alvo = nearestPendingLeadFollowUp(lead, row.scheduled_at);
    if (alvo) {
      rescheduleLeadFollowUp(lead.id, alvo.id, scheduledAt, false);
    } else {
      addLeadFollowUp(lead.id, {
        scheduled_at: scheduledAt,
        canal: row.action_type === "whatsapp" ? "whatsapp" : row.action_type === "email" ? "email" : "ligacao",
        assunto: row.notes?.trim() || "Retorno agendado no Follow-up",
        sincronizarCompromisso: false,
      });
    }
  }
  setProximaAcaoDataEmpresa(target, scheduledAt);
  patchMirroredFollowUp(row.id, { scheduled_at: scheduledAt, status: "pending" });
  emit();
}

/** Follow-up excluído em /followup: limpa a data do histórico da empresa. */
export function propagateFollowUpRemoved(row: FollowUp): void {
  setProximaAcaoDataEmpresa({ empresaNome: row.company_name, cnpj: row.cnpj }, null);
  removeMirroredFollowUp(row.id);
  emit();
}

// ---------------------------------------------------------------------------
// Propagação: lead -> tabela (usada pelo drawer da Central)
// ---------------------------------------------------------------------------

/**
 * Descobre qual registro da tabela corresponde ao follow-up concluído/removido
 * dentro do lead, para que a tela chame updateFollowUp com esse id.
 */
export function remoteFollowUpIdForLead(lead: Lead, fu: LeadFollowUp): string | null {
  const candidatos = mirroredFollowUpsForCompany({
    empresaNome: lead.empresa,
    cnpj: lead.cnpj,
  }).filter((f) => f.status === "pending");
  if (!candidatos.length) return null;
  const alvo = +new Date(fu.scheduled_at);
  const melhor = candidatos.reduce((best, cur) =>
    Math.abs(+new Date(cur.scheduled_at) - alvo) < Math.abs(+new Date(best.scheduled_at) - alvo)
      ? cur
      : best,
  );
  return melhor.id;
}

/** Ajustes locais após concluir/remover um follow-up dentro do lead. */
export function propagateLeadFollowUpClosed(lead: Lead, remoteId: string | null): void {
  if (remoteId) patchMirroredFollowUp(remoteId, { status: "done" });
  setProximaAcaoDataEmpresa({ empresaNome: lead.empresa, cnpj: lead.cnpj }, null);
  emit();
}
