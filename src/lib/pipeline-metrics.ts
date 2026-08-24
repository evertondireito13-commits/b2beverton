// Métricas do pipeline: volume por etapa, tempo médio por etapa e conversão.
// Tudo derivado da timeline determinística dos leads (leads-store).

import {
  listLeads,
  FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
  daysInStage,
  isOverdue,
  creditoTotal,
  honorariosBHM,
  type Lead,
  type LeadStatus,
} from "@/lib/leads-store";
import { listHistoricos } from "@/lib/historico-store";

export type StageMetric = {
  status: LeadStatus;
  label: string;
  total: number;
  atrasados: number;
  /** média de dias que os leads ATUAIS estão parados na etapa */
  diasMedioAtual: number;
  /** média de dias que os leads levaram para SAIR desta etapa (histórico) */
  diasMedioPassagem: number | null;
  /** % dos leads que chegaram nesta etapa e avançaram para a seguinte */
  conversaoParaProxima: number | null;
  valorPotencial: number;
};

export type PipelineMetrics = {
  etapas: StageMetric[];
  totalAtivos: number;
  totalFechados: number;
  totalPerdidos: number;
  totalAtrasados: number;
  taxaFechamento: number; // fechados / (fechados + perdidos) — nao_qualificado fica de fora
  /** Não-fit técnico: não entra no denominador de conversão. */
  totalNaoQualificados: number;
  taxaLigacaoParaReuniao: number; // leads criados / empresas trabalhadas
  cicloMedioDias: number | null; // criação -> fechamento
  valorPipeline: number;
  valorFechado: number;
  honorariosEstimados: number;
  gargalo: StageMetric | null;
};

const STAGE_INDEX = new Map<LeadStatus, number>(FUNNEL_STAGES.map((s, i) => [s, i]));

/** Primeiro momento em que o lead entrou em cada etapa (via timeline). */
function entradasPorEtapa(lead: Lead): Map<LeadStatus, string> {
  const map = new Map<LeadStatus, string>();
  for (const ev of lead.timeline ?? []) {
    if (!map.has(ev.status)) map.set(ev.status, ev.at);
  }
  if (!map.has(lead.status)) map.set(lead.status, lead.stage_since ?? lead.updated_at);
  return map;
}

function diffDias(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function media(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10;
}

function honorarios(lead: Lead): number {
  return honorariosBHM(lead);
}

export function pipelineMetrics(): PipelineMetrics {
  const leads = listLeads();
  const ativos = leads.filter(
    (l) => l.status !== "perdido" && l.status !== "fechado" && l.status !== "nao_qualificado",
  );
  const fechados = leads.filter((l) => l.status === "fechado");
  const perdidos = leads.filter((l) => l.status === "perdido");

  const passagens = new Map<LeadStatus, number[]>();
  const alcancou = new Map<LeadStatus, number>();
  const avancou = new Map<LeadStatus, number>();

  for (const lead of leads) {
    const entradas = entradasPorEtapa(lead);
    const atualIdx = STAGE_INDEX.get(lead.status) ?? 0;
    for (const stage of FUNNEL_STAGES) {
      const idx = STAGE_INDEX.get(stage)!;
      const entrada = entradas.get(stage);
      const chegou = !!entrada || (lead.status !== "perdido" && idx < atualIdx);
      if (!chegou) continue;
      alcancou.set(stage, (alcancou.get(stage) ?? 0) + 1);
      const proximo = FUNNEL_STAGES[idx + 1];
      if (!proximo) continue;
      const entradaProx = entradas.get(proximo);
      if (entradaProx || (lead.status !== "perdido" && idx + 1 <= atualIdx)) {
        avancou.set(stage, (avancou.get(stage) ?? 0) + 1);
        if (entrada && entradaProx) {
          const arr = passagens.get(stage) ?? [];
          arr.push(diffDias(entrada, entradaProx));
          passagens.set(stage, arr);
        }
      }
    }
  }

  const etapas: StageMetric[] = FUNNEL_STAGES.map((status) => {
    const naEtapa = leads.filter((l) => l.status === status);
    const alcance = alcancou.get(status) ?? 0;
    const seguiu = avancou.get(status) ?? 0;
    return {
      status,
      label: LEAD_STATUS_LABEL[status],
      total: naEtapa.length,
      atrasados: naEtapa.filter(isOverdue).length,
      diasMedioAtual: media(naEtapa.map(daysInStage)) ?? 0,
      diasMedioPassagem: media(passagens.get(status) ?? []),
      conversaoParaProxima: alcance > 0 ? Math.round((seguiu / alcance) * 100) : null,
      valorPotencial: naEtapa.reduce((s, l) => s + creditoTotal(l), 0),
    };
  });

  const ciclos: number[] = [];
  for (const l of fechados) {
    const t = l.timeline ?? [];
    if (t.length >= 2) ciclos.push(diffDias(t[0].at, t[t.length - 1].at));
  }

  const empresasTrabalhadas = new Set(
    listHistoricos().map((h) => (h.empresaNome ?? "").trim().toLowerCase()).filter(Boolean),
  ).size;

  const candidatos = etapas.filter((e) => e.total > 0);
  const gargalo =
    candidatos.length > 0
      ? candidatos.reduce((pior, e) => (e.diasMedioAtual > pior.diasMedioAtual ? e : pior))
      : null;

  return {
    etapas,
    totalAtivos: ativos.length,
    totalFechados: fechados.length,
    totalPerdidos: perdidos.length,
    totalNaoQualificados: leads.filter((l) => l.status === "nao_qualificado").length,
    totalAtrasados: leads.filter(isOverdue).length,
    taxaFechamento:
      fechados.length + perdidos.length > 0
        ? Math.round((fechados.length / (fechados.length + perdidos.length)) * 100)
        : 0,
    taxaLigacaoParaReuniao:
      empresasTrabalhadas > 0 ? Math.round((leads.length / empresasTrabalhadas) * 100) : 0,
    cicloMedioDias: media(ciclos),
    valorPipeline: ativos.reduce((s, l) => s + creditoTotal(l), 0),
    valorFechado: fechados.reduce((s, l) => s + creditoTotal(l), 0),
    honorariosEstimados: leads
      .filter((l) => l.status !== "perdido" && l.status !== "nao_qualificado")
      .reduce((s, l) => s + honorarios(l), 0),
    gargalo,
  };
}

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
