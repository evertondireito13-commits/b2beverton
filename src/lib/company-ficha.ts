// Fonte única da "ficha 360°" de uma empresa.
// Usada tanto pela rota /empresas quanto pelo drawer aberto no Follow-up —
// nada de duplicar a lógica de histórico.

import {
  listHistoricos,
  historicoMatchesEmpresa,
  extractTelefones,
  extractEmails,
  extractPessoasParaProcurar,
  type HistoricoEmpresa,
} from "@/lib/historico-store";
import { listLeads, listLeadFollowUps, type Lead, type LeadFollowUp } from "@/lib/leads-store";
import { scoreEmpresas, type EmpresaScore } from "@/lib/lead-score";
import { mirroredFollowUpsForCompany } from "@/lib/followup-bridge";
import { findPreparationForCompany } from "@/components/preparacao-noturna";

export type Ficha = EmpresaScore & {
  historicos: HistoricoEmpresa[];
  lead: Lead | null;
  telefones: string;
  emails: string;
  pessoas: string;
  blobBusca: string;
};

const onlyDigits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/**
 * Soma o valor do cadastro original aos valores extraídos da ligação,
 * identificando a origem e evitando duplicar o mesmo dado.
 */
function mesclarValores(
  daLigacao: string,
  doCadastro: string | null | undefined,
  chave: (v: string) => string,
): string {
  const cadastro = (doCadastro ?? "").trim();
  if (!cadastro) return daLigacao;
  const partes = daLigacao
    .split(/[,;]\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
  const jaTem = partes.some((v) => chave(v) === chave(cadastro));
  const cadastroLabel = `${cadastro} — cadastro original`;
  if (jaTem) {
    return partes
      .map((v) => (chave(v) === chave(cadastro) ? cadastroLabel : `${v} — informado na ligação`))
      .join(", ");
  }
  return [cadastroLabel, ...partes.map((v) => `${v} — informado na ligação`)].join(", ");
}

function encontrarLead(leads: Lead[], empresa: string, cnpj?: string | null): Lead | null {
  const d = onlyDigits(cnpj);
  return (
    leads.find(
      (l) =>
        (d.length >= 8 && onlyDigits(l.cnpj) === d) ||
        l.empresa.trim().toLowerCase() === empresa.trim().toLowerCase(),
    ) ?? null
  );
}

function montarFicha(
  base: EmpresaScore,
  historicos: HistoricoEmpresa[],
  leads: Lead[],
): Ficha {
  const alvo = { empresaNome: base.empresa, cnpj: base.cnpj ?? null };
  const hs = historicos
    .filter((h) => historicoMatchesEmpresa(h, alvo))
    .sort((a, b) => +new Date(b.dataIso) - +new Date(a.dataIso));
  const lead = encontrarLead(leads, base.empresa, base.cnpj);
  const textoTudo = hs.map((h) => h.textoHistoricoCompleto ?? "").join("\n");
  const telefonesLigacao = extractTelefones(textoTudo);
  const emailsLigacao = extractEmails(textoTudo);
  const pessoas = extractPessoasParaProcurar(textoTudo);

  // Soma (sem substituir) os dados do cadastro original da Preparação Noturna.
  const cadastro = findPreparationForCompany(base.cnpj ?? null, base.empresa);
  const telefones = mesclarValores(telefonesLigacao, cadastro?.telefone, onlyDigits);
  const emails = mesclarValores(emailsLigacao, cadastro?.email, (v) =>
    (v ?? "").trim().toLowerCase(),
  );
  const contato = base.contato || cadastro?.contato || null;
  const cargo = base.cargo || cadastro?.cargo || null;
  return {
    ...base,
    contato,
    cargo,
    historicos: hs,
    lead,
    telefones,
    emails,
    pessoas,
    blobBusca: [
      base.empresa,
      base.cnpj ?? "",
      contato ?? "",
      cargo ?? "",
      lead?.telefone ?? "",
      lead?.email ?? "",
      telefones,
      emails,
      pessoas,
      textoTudo,
      hs.map((h) => `${h.objecao ?? ""} ${h.proximaAcao ?? ""} ${h.resultado ?? ""}`).join(" "),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

export function montarFichas(): Ficha[] {
  const historicos = listHistoricos();
  const leads = listLeads();
  return scoreEmpresas().map((e) => montarFicha(e, historicos, leads));
}

/**
 * Ficha de uma empresa específica (por nome e/ou CNPJ). Se a empresa ainda não
 * estiver pontuada pelo score, devolve uma ficha mínima com o histórico bruto.
 */
export function fichaDaEmpresa(empresa: string, cnpj?: string | null): Ficha | null {
  const nome = (empresa ?? "").trim();
  if (!nome && !onlyDigits(cnpj)) return null;
  const historicos = listHistoricos();
  const leads = listLeads();
  const d = onlyDigits(cnpj);

  const score =
    scoreEmpresas().find(
      (e) =>
        (d.length >= 8 && onlyDigits(e.cnpj) === d) ||
        e.empresa.trim().toLowerCase() === nome.toLowerCase(),
    ) ?? null;

  if (score) return montarFicha(score, historicos, leads);

  const lead = encontrarLead(leads, nome, cnpj);
  const fallback: EmpresaScore = {
    key: d || nome.toLowerCase(),
    empresa: nome || lead?.empresa || "Empresa",
    cnpj: cnpj ?? lead?.cnpj ?? null,
    contato: lead?.contato ?? null,
    cargo: lead?.cargo ?? null,
    score: 0,
    temperaturaScore: 0,
    prioridade: "frio",
    motivos: [],
    proximaAcao: lead?.proximo_passo ?? null,
    proximaAcaoData: null,
    ultimoContatoIso: lead?.updated_at ?? null,
    tentativas: 0,
    naCentral: !!lead,
    statusCentral: null,
    sugestao: "Sem histórico registrado ainda.",
    tags: [],
  };
  return montarFicha(fallback, historicos, leads);
}

// ---------------------------------------------------------------------------
// Timeline unificada (histórico de ligações + eventos e follow-ups do lead)
// ---------------------------------------------------------------------------

export type TimelineItem = {
  id: string;
  at: string; // ISO
  kind: "historico" | "evento" | "followup";
  titulo: string;
  subtitulo?: string | null;
  detalhe?: string | null;
  canal?: string | null;
  autor?: string | null;
  texto?: string | null;
  objecao?: string | null;
  proximaAcao?: string | null;
  concluido?: boolean;
};

const CANAL_LABEL: Record<LeadFollowUp["canal"], string> = {
  ligacao: "☎️ Ligação",
  whatsapp: "💬 WhatsApp",
  email: "✉️ E-mail",
  reuniao: "🤝 Reunião",
};

const REMOTE_CANAL_LABEL: Record<string, string> = {
  call: "☎️ Ligação",
  whatsapp: "💬 WhatsApp",
  email: "✉️ E-mail",
  meeting: "🤝 Reunião",
  negociacao: "💼 Negociação",
  other: "📌 Follow-up",
};

export function timelineDaFicha(ficha: Ficha): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const h of ficha.historicos) {
    items.push({
      id: `h_${h.id}`,
      at: h.dataIso,
      kind: "historico",
      titulo: h.resultado || "Ligação registrada",
      subtitulo: [h.contato, h.cargo].filter(Boolean).join(" · ") || null,
      canal: "☎️ Ligação",
      autor: h.consultor ?? null,
      detalhe: h.interesse ? `Interesse ${h.interesse}` : null,
      texto: h.textoHistoricoCompleto ?? null,
      objecao: h.objecao ?? null,
      proximaAcao: h.proximaAcao ?? null,
    });
  }

  const lead = ficha.lead;
  if (lead) {
    for (const ev of lead.timeline ?? []) {
      items.push({
        id: `e_${ev.id}`,
        at: ev.at,
        kind: "evento",
        titulo: ev.titulo,
        detalhe: ev.detalhe ?? null,
        canal: "📌 Central",
      });
    }
    for (const f of listLeadFollowUps(lead)) {
      items.push({
        id: `f_${f.id}`,
        at: f.scheduled_at,
        kind: "followup",
        titulo: f.assunto || "Follow-up agendado",
        canal: CANAL_LABEL[f.canal],
        detalhe: f.notas ?? null,
        concluido: f.done,
      });
    }
  }

  // Follow-ups da tabela (mesma fonte dos cards em /followup) — antes eles não
  // apareciam na timeline da empresa.
  for (const r of mirroredFollowUpsForCompany({ empresaNome: ficha.empresa, cnpj: ficha.cnpj })) {
    if (r.status === "cancelled") continue;
    items.push({
      id: `r_${r.id}`,
      at: r.scheduled_at,
      kind: "followup",
      titulo: r.notes?.split("\n")[0] || "Follow-up agendado",
      canal: REMOTE_CANAL_LABEL[r.action_type] ?? "📌 Follow-up",
      subtitulo: r.contact_person ?? null,
      detalhe: r.notes ?? null,
      concluido: r.status === "done",
    });
  }

  return items.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}
