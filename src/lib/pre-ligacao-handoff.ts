// Handoff único de "abrir ligação para esta empresa".
// Replica exatamente o que o fluxo do Follow-up já fazia: monta o payload
// completo da Pré-ligação (incluindo o texto bruto da Preparação Noturna) e
// grava também o contexto da Pós-ligação, para que as duas telas abram
// vinculadas à mesma empresa.
import { setActiveLead } from "@/lib/daily-activities";
import { fichaDaEmpresa } from "@/lib/company-ficha";
import {
  PENDING_PRE_LIGACAO_KEY,
  findPreparationForCompany,
} from "@/components/preparacao-noturna";

export const PENDING_POS_CONTEXT_KEY = "bhm.pending-pos-context";

export type IniciarLigacaoInput = {
  empresa: string;
  cnpj?: string | null;
  contato?: string | null;
  cargo?: string | null;
  telefone?: string | null;
  email?: string | null;
  observacoes?: string | null;
  followUpId?: string | null;
  /** Texto bruto já conhecido (ex.: card da Preparação Noturna). */
  textoBruto?: string | null;
  preparationId?: string | null;
};

const first = (v?: string | null) => (v ?? "").split(/[,\s]+/).filter(Boolean)[0] ?? "";

export function buildPreLigacaoPayload(input: IniciarLigacaoInput) {
  const empresa = (input.empresa ?? "").trim();
  const cnpj = (input.cnpj ?? "").trim();

  // Completa dados faltantes a partir da ficha 360° (histórico + lead).
  let ficha: ReturnType<typeof fichaDaEmpresa> = null;
  try {
    ficha = fichaDaEmpresa(empresa, cnpj || null);
  } catch {
    ficha = null;
  }

  const contato = (input.contato ?? ficha?.contato ?? "").trim();
  const cargo = (input.cargo ?? ficha?.cargo ?? "").trim();
  const telefone = (
    input.telefone ||
    ficha?.lead?.telefone ||
    first(ficha?.telefones) ||
    ""
  ).trim();
  const email = (input.email || ficha?.lead?.email || first(ficha?.emails) || "").trim();

  const prep =
    input.textoBruto || input.preparationId
      ? {
          nome: empresa,
          textoBruto: input.textoBruto ?? "",
          preparationId: input.preparationId ?? "",
        }
      : findPreparationForCompany(cnpj || null, empresa);

  const observacoes = (
    input.observacoes ??
    [ficha?.proximaAcao ? `Próximo passo: ${ficha.proximaAcao}` : "", ficha?.sugestao ?? ""]
      .filter(Boolean)
      .join(" · ")
  ).trim();

  const textoBruto =
    prep?.textoBruto?.trim() ||
    [
      `Razão social: ${empresa}`,
      cnpj ? `CNPJ: ${cnpj}` : "",
      contato ? `Contato: ${contato}${cargo ? ` (${cargo})` : ""}` : "",
      telefone ? `Telefone: ${telefone}` : "",
      email ? `E-mail: ${email}` : "",
      observacoes ? `Observações: ${observacoes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  return {
    nome: prep?.nome || empresa,
    razaoSocial: empresa,
    cnpj,
    contato,
    cargo,
    telefone,
    email,
    observacoes,
    textoBruto,
    preparationId:
      prep?.preparationId || (input.followUpId ? `fup-${input.followUpId}` : undefined),
  };
}

/**
 * Grava os dois contextos (Pré e Pós) e marca o lead ativo.
 * A navegação fica por conta de quem chama (`navigate({ to: "/", search: { tab: "pre" } })`).
 */
export function iniciarLigacaoParaEmpresa(input: IniciarLigacaoInput) {
  const payload = buildPreLigacaoPayload(input);

  setActiveLead({
    cnpj: payload.cnpj || undefined,
    razaoSocial: payload.razaoSocial || payload.nome,
    nomeFantasia: payload.nome || payload.razaoSocial,
  });

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(PENDING_PRE_LIGACAO_KEY, JSON.stringify(payload));
      window.sessionStorage.setItem(
        PENDING_POS_CONTEXT_KEY,
        JSON.stringify({
          empresa: payload.razaoSocial || payload.nome,
          cnpj: payload.cnpj,
          contato: payload.contato,
          ...(input.followUpId ? { followUpId: input.followUpId } : {}),
        }),
      );
    } catch {
      /* noop */
    }
  }

  return payload;
}
