// Score e priorização determinística de leads.
// Combina o histórico local de ligações com os leads da Central de Reuniões
// para responder: "para quem eu ligo agora?".

import {
  listHistoricos,
  empresaKey,
  type HistoricoEmpresa,
} from "@/lib/historico-store";
import { listLeads, isLeadIsolated, type Lead, LEAD_STATUS_LABEL } from "@/lib/leads-store";
import { getPendingMirroredFollowUps } from "@/lib/followup-bridge";
import type { FollowUp } from "@/lib/follow-ups.functions";

export type Prioridade = "quente" | "morno" | "frio" | "arquivado";

export const PRIORIDADE_TONE: Record<Prioridade, string> = {
  quente: "bg-emerald-100 text-emerald-800 border-emerald-200",
  morno: "bg-amber-100 text-amber-800 border-amber-200",
  frio: "bg-slate-100 text-slate-700 border-slate-200",
  arquivado: "bg-rose-100 text-rose-700 border-rose-200",
};

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  quente: "🔥 Quente",
  morno: "🟡 Morno",
  frio: "🧊 Frio",
  arquivado: "📦 Arquivado",
};

export type EmpresaScore = {
  key: string;
  empresa: string;
  cnpj?: string | null;
  contato?: string | null;
  cargo?: string | null;
  score: number; // 0-100 (ordenação da fila, inclui urgência)
  temperaturaScore: number; // 0-100 (qualidade do lead, sem urgência)
  prioridade: Prioridade;
  motivos: string[];
  proximaAcao?: string | null;
  proximaAcaoData?: string | null;
  ultimoContatoIso?: string | null;
  tentativas: number;
  naCentral: boolean;
  statusCentral?: string | null;
  sugestao: string;
  tags: string[];
};

function dias(from: string | null | undefined): number | null {
  if (!from) return null;
  const t = new Date(from).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function interesseScore(interesse?: string | null): number {
  const v = (interesse ?? "").toLowerCase();
  if (v.includes("alto")) return 30;
  if (v.includes("m")) return 18; // médio
  if (v.includes("baixo")) return 8;
  if (v.includes("nenhum")) return -25;
  return 0;
}

function resultadoScore(resultado?: string | null): number {
  const v = (resultado ?? "").toLowerCase();
  if (v.includes("decisor")) return 22;
  if (v.includes("gatekeeper") || v.includes("recep")) return 8;
  if (v.includes("não atendeu") || v.includes("nao atendeu")) return -4;
  return 0;
}

/** Agrupa os históricos por empresa (mais recente primeiro). */
function agruparHistoricos(): Map<string, HistoricoEmpresa[]> {
  const map = new Map<string, HistoricoEmpresa[]>();
  const list = [...listHistoricos()].sort(
    (a, b) => new Date(b.dataIso).getTime() - new Date(a.dataIso).getTime(),
  );
  for (const r of list) {
    const k = empresaKey(r.empresaNome) || (r.cnpj ?? "").replace(/\D/g, "");
    if (!k) continue;
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return map;
}

function sugerirAcao(e: Omit<EmpresaScore, "sugestao">): string {
  if (e.naCentral) return `Avançar etapa na Central (${e.statusCentral ?? "em andamento"}).`;
  if (e.prioridade === "arquivado") return "Reabordar em nova safra (pitch diferente).";
  const d = dias(e.proximaAcaoData ?? null);
  if (e.proximaAcaoData && d !== null && d >= 0) return "Follow-up vencido — ligar agora.";
  if (e.proximaAcaoData) return `Follow-up agendado para ${new Date(e.proximaAcaoData).toLocaleDateString("pt-BR")}.`;
  if (e.tentativas === 0) return "Primeira abordagem — gerar script na Pré-ligação.";
  if (e.tentativas >= 3) return "Muitas tentativas — tentar WhatsApp ou e-mail.";
  return "Nova tentativa de contato com o decisor.";
}

export function scoreEmpresas(): EmpresaScore[] {
  const grupos = agruparHistoricos();
  const leads = listLeads();
  const leadPorKey = new Map<string, Lead>();
  for (const l of leads) {
    const k = empresaKey(l.empresa) || (l.cnpj ?? "").replace(/\D/g, "");
    if (k) leadPorKey.set(k, l);
  }

  // Empresas com follow-up pendente (mesma fonte da fila do Follow-up) também
  // entram no universo, mesmo sem histórico de ligação nem lead na Central.
  const followUpPorKey = new Map<string, FollowUp>();
  for (const f of getPendingMirroredFollowUps()) {
    const k = empresaKey(f.company_name) || (f.cnpj ?? "").replace(/\D/g, "");
    if (!k) continue;
    const atual = followUpPorKey.get(k);
    if (!atual || +new Date(f.scheduled_at) < +new Date(atual.scheduled_at)) {
      followUpPorKey.set(k, f);
    }
  }

  const keys = new Set<string>([
    ...grupos.keys(),
    ...leadPorKey.keys(),
    ...followUpPorKey.keys(),
  ]);
  const out: EmpresaScore[] = [];

  for (const key of keys) {
    const hist = grupos.get(key) ?? [];
    const ultimo = hist[0];
    const lead = leadPorKey.get(key);
    const followUp = followUpPorKey.get(key);
    if (lead && isLeadIsolated(lead.empresa, lead.cnpj)) continue;
    const motivos: string[] = [];
    const tags: string[] = [];
    let score = 30;

    if (lead) {
      score += 35;
      motivos.push("Lead ativo na Central de Reuniões");
      tags.push("central");
      if (lead.status === "fechado") score += 10;
      if (lead.status === "perdido" || lead.status === "nao_qualificado") score -= 55;
      if (lead.valor_credito && lead.valor_credito > 0) {
        score += 10;
        tags.push("crédito apurado");
      }
    }

    if (ultimo) {
      const i = interesseScore(ultimo.interesse);
      const r = resultadoScore(ultimo.resultado);
      score += i + r;
      if (i > 15) motivos.push(`Interesse ${ultimo.interesse}`);
      if (r > 15) motivos.push("Falou com o decisor");
      if (i < 0) motivos.push("Última conversa sem interesse");
      const d = dias(ultimo.dataIso);
      if (d !== null) {
        if (d <= 2) {
          score += 8;
          motivos.push("Contato muito recente");
        } else if (d >= 30) {
          score -= 10;
          motivos.push(`Sem contato há ${d} dias`);
          tags.push("esfriando");
        }
      }
      if (ultimo.status === "arquivado") score -= 30;
    } else if (!lead && !followUp) {
      motivos.push("Sem histórico registrado");
    } else if (!lead && followUp) {
      motivos.push("Follow-up pendente na fila");
    }

    // Score de temperatura = qualidade do lead, sem urgência de calendário.
    let temperatura = score;

    const proximaAcaoData = ultimo?.proximaAcaoData ?? followUp?.scheduled_at ?? null;
    if (proximaAcaoData) {
      const d = dias(proximaAcaoData);
      if (d !== null && d > 0) {
        score += 20;
        motivos.push(`Follow-up vencido há ${d} dia(s)`);
        tags.push("atrasado");
      } else if (d === 0) {
        score += 25;
        motivos.push("Follow-up para hoje");
        tags.push("hoje");
      } else {
        score += 8;
      }
    }

    const tentativas = hist.length;
    if (tentativas >= 4) {
      score -= 6;
      temperatura -= 6;
      tags.push("muitas tentativas");
    }

    const finalScore = clamp(score);
    const temperaturaScore = clamp(temperatura);
    const temProximaAcaoPendente = !!proximaAcaoData;
    const prioridade: Prioridade =
      lead?.status === "perdido" || (ultimo?.status === "arquivado" && !temProximaAcaoPendente)
        ? "arquivado"
        : temperaturaScore >= 70
          ? "quente"
          : temperaturaScore >= 45
            ? "morno"
            : "frio";


    const base: Omit<EmpresaScore, "sugestao"> = {
      key,
      empresa: lead?.empresa ?? ultimo?.empresaNome ?? followUp?.company_name ?? key,
      cnpj: lead?.cnpj ?? ultimo?.cnpj ?? followUp?.cnpj ?? null,
      contato: lead?.contato ?? ultimo?.contato ?? followUp?.contact_person ?? null,
      cargo: lead?.cargo ?? ultimo?.cargo ?? null,
      score: finalScore,
      temperaturaScore,
      prioridade,
      motivos,
      proximaAcao:
        ultimo?.proximaAcao ??
        lead?.proximo_passo ??
        followUp?.notes?.split("\n")[0] ??
        null,
      proximaAcaoData,
      ultimoContatoIso: ultimo?.dataIso ?? lead?.updated_at ?? null,
      tentativas,
      naCentral: !!lead && lead.status !== "perdido" && lead.status !== "nao_qualificado",
      statusCentral: lead ? LEAD_STATUS_LABEL[lead.status] : null,
      tags,
    };

    out.push({ ...base, sugestao: sugerirAcao(base) });
  }

  return out.sort((a, b) => b.score - a.score);
}

/**
 * Top N empresas recomendadas para atacar agora.
 * Exclui arquivados e empresas que já viraram lead ativo na Central de Reuniões
 * (essas são conduzidas por lá, não fazem parte da fila de ataque).
 */
export function rankingProspeccao(limit = 10): EmpresaScore[] {
  return scoreEmpresas()
    .filter((e) => e.prioridade !== "arquivado" && !e.naCentral)
    .slice(0, limit);
}
