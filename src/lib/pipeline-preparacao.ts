// Esteira (pipeline) visível da Preparação Noturna:
// Descobrir → Validar → Enriquecer → Pontuar.
// Cada empresa cai numa etapa de forma determinística, a partir dos dados que
// já existem no cadastro + o score do ranking (lead-score.ts).

export type EtapaPipeline = "descobrir" | "validar" | "enriquecer" | "pontuar";

export const ETAPAS: { id: EtapaPipeline; label: string; ajuda: string }[] = [
  {
    id: "descobrir",
    label: "Descobrir",
    ajuda: "Empresa na lista, mas ainda sem CNPJ válido para consultar.",
  },
  {
    id: "validar",
    label: "Validar",
    ajuda: "CNPJ válido — pronta para enriquecer (UF, setor, regime).",
  },
  {
    id: "enriquecer",
    label: "Enriquecer",
    ajuda: "Dados cadastrais preenchidos — falta histórico para pontuar.",
  },
  {
    id: "pontuar",
    label: "Pontuar",
    ajuda: "Já tem pontuação de prioridade calculada pelo ranking.",
  },
];

export const ETAPA_LABEL: Record<EtapaPipeline, string> = {
  descobrir: "Descobrir",
  validar: "Validar",
  enriquecer: "Enriquecer",
  pontuar: "Pontuar",
};

/** Valida os dígitos verificadores do CNPJ (14 dígitos). */
export function cnpjValido(cnpj: string | null | undefined): boolean {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    let soma = 0;
    let peso = len - 7;
    for (let i = 0; i < len; i++) {
      soma += Number(d[i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export type EmpresaPipelineInput = {
  cnpj?: string;
  uf?: string;
  setor?: string;
  regime?: string;
};

/** Etapa atual da empresa na esteira. */
export function etapaDaEmpresa(
  e: EmpresaPipelineInput,
  score?: number | null,
): EtapaPipeline {
  const enriquecida = !!(e.uf && e.setor);
  if (typeof score === "number" && enriquecida) return "pontuar";
  if (enriquecida) return "enriquecer";
  if (cnpjValido(e.cnpj)) return "validar";
  return "descobrir";
}
