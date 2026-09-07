// Exportação das empresas da busca do Painel Executivo.
// Tudo gerado no navegador, sem servidor: planilha (CSV), JSON e cartões de
// contato (vCard). Nenhum campo é inventado — o que não existe fica vazio.

import type { Ficha } from "@/lib/company-ficha";
import { PRIORIDADE_LABEL } from "@/lib/lead-score";

export type FormatoExport = "csv" | "json" | "vcf";

export const FORMATO_LABEL: Record<FormatoExport, string> = {
  csv: "Planilha (CSV)",
  json: "JSON",
  vcf: "Cartões de contato (vCard)",
};

type Linha = Record<string, string>;

function primeiro(valor: string): string {
  return (valor ?? "").split(/[,;]\s*/)[0]?.replace(/\s*—.*$/, "").trim() ?? "";
}

function linhaDe(f: Ficha): Linha {
  return {
    Empresa: f.empresa,
    CNPJ: f.cnpj ?? "",
    Contato: f.contato ?? "",
    Cargo: f.cargo ?? "",
    Telefone: f.lead?.telefone ?? primeiro(f.telefones),
    Email: f.lead?.email ?? primeiro(f.emails),
    Score: String(f.score),
    Prioridade: PRIORIDADE_LABEL[f.prioridade],
    "Etapa na Central": f.statusCentral ?? "",
    "Próximo passo": f.proximaAcao ?? "",
    "Último contato": f.ultimoContatoIso
      ? new Date(f.ultimoContatoIso).toLocaleDateString("pt-BR")
      : "",
    Interações: String(f.historicos.length),
  };
}

function paraCsv(fichas: Ficha[]): string {
  const linhas = fichas.map(linhaDe);
  const cols = Object.keys(linhas[0] ?? linhaDe({} as Ficha));
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  return [
    cols.join(";"),
    ...linhas.map((l) => cols.map((c) => esc(l[c] ?? "")).join(";")),
  ].join("\r\n");
}

function paraVcf(fichas: Ficha[]): string {
  return fichas
    .map((f) => {
      const l = linhaDe(f);
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${l['Contato'] || l['Empresa']}`,
        `ORG:${l['Empresa']}`,
        l['Cargo'] ? `TITLE:${l['Cargo']}` : "",
        l['Telefone'] ? `TEL;TYPE=WORK:${l['Telefone']}` : "",
        l['Email'] ? `EMAIL;TYPE=WORK:${l['Email']}` : "",
        l['CNPJ'] ? `NOTE:CNPJ ${l['CNPJ']}` : "",
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");
}

export function exportarEmpresas(fichas: Ficha[], formato: FormatoExport) {
  const data = new Date().toISOString().slice(0, 10);
  let conteudo = "";
  let tipo = "text/plain;charset=utf-8";
  let ext = formato as string;

  if (formato === "csv") {
    conteudo = "\uFEFF" + paraCsv(fichas);
    tipo = "text/csv;charset=utf-8";
  } else if (formato === "json") {
    conteudo = JSON.stringify(fichas.map(linhaDe), null, 2);
    tipo = "application/json;charset=utf-8";
  } else {
    conteudo = paraVcf(fichas);
    tipo = "text/vcard;charset=utf-8";
    ext = "vcf";
  }

  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `empresas-${data}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
