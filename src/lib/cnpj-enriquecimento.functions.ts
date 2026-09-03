// Enriquecimento de empresas da Preparação Noturna via BrasilAPI.
// Roda no servidor (evita CORS) protegido pelo gate BHM.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBhmGate } from "@/lib/bhm-gate";

export type CnpjEnriquecimento =
  | {
      ok: true;
      uf: string | null;
      municipio: string | null;
      setor: string | null;
      regime: string | null;
      telefone: string | null;
      email: string | null;
      razaoSocial: string | null;
      situacaoCadastral: string | null;
      naturezaJuridica: string | null;
      porte: string | null;
      dataAbertura: string | null;
      capitalSocial: string | null;
      endereco: string | null;
      socios: string | null;
    }
  | { ok: false; erro: string };

function formatarTelefone(dddTelefone?: string | null): string | null {
  if (!dddTelefone) return null;
  const d = dddTelefone.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return dddTelefone;
}

function formatarData(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatarCapitalSocial(valor?: number | string | null): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const consultarCnpj = createServerFn({ method: "GET" })
  .middleware([requireBhmGate])
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }): Promise<CnpjEnriquecimento> => {
    const digitos = data.cnpj.replace(/\D/g, "");
    if (digitos.length !== 14) return { ok: false, erro: "CNPJ inválido" };

    // Timeout manual (compatível com qualquer runtime, ao contrário de
    // AbortSignal.timeout, que pode não existir dependendo do ambiente).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      if (res.status === 404) return { ok: false, erro: "CNPJ não encontrado" };
      if (!res.ok) return { ok: false, erro: `Consulta falhou (HTTP ${res.status})` };

      const j = (await res.json()) as {
        uf?: string;
        municipio?: string;
        cnae_fiscal_descricao?: string;
        opcao_pelo_simples?: boolean | null;
        opcao_pelo_mei?: boolean | null;
        ddd_telefone_1?: string | null;
        ddd_telefone_2?: string | null;
        email?: string | null;
        razao_social?: string | null;
        descricao_situacao_cadastral?: string | null;
        natureza_juridica?: string | null;
        descricao_porte?: string | null;
        porte?: string | null;
        data_inicio_atividade?: string | null;
        capital_social?: number | string | null;
        logradouro?: string | null;
        numero?: string | null;
        bairro?: string | null;
        cep?: string | null;
        qsa?: { nome_socio?: string }[] | null;
      };

      // A base pública só informa Simples/MEI com certeza; Presumido x Real
      // não constam — nesses casos deixamos vazio para preenchimento manual.
      let regime: string | null = null;
      if (j.opcao_pelo_mei) regime = "MEI";
      else if (j.opcao_pelo_simples) regime = "Simples Nacional";

      const enderecoPartes = [
        [j.logradouro, j.numero].filter(Boolean).join(", "),
        j.bairro,
        j.municipio && j.uf ? `${j.municipio}/${j.uf}` : j.municipio || j.uf,
        j.cep ? `CEP ${j.cep}` : null,
      ].filter(Boolean);

      const socios = (j.qsa ?? [])
        .map((s) => s.nome_socio)
        .filter((n): n is string => !!n)
        .slice(0, 6)
        .join(", ");

      return {
        ok: true,
        uf: j.uf ?? null,
        municipio: j.municipio ?? null,
        setor: j.cnae_fiscal_descricao ?? null,
        regime,
        telefone: formatarTelefone(j.ddd_telefone_1) ?? formatarTelefone(j.ddd_telefone_2),
        email: j.email?.trim() || null,
        razaoSocial: j.razao_social ?? null,
        situacaoCadastral: j.descricao_situacao_cadastral ?? null,
        naturezaJuridica: j.natureza_juridica ?? null,
        porte: j.descricao_porte ?? j.porte ?? null,
        dataAbertura: formatarData(j.data_inicio_atividade),
        capitalSocial: formatarCapitalSocial(j.capital_social),
        endereco: enderecoPartes.length ? enderecoPartes.join(" - ") : null,
        socios: socios || null,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      const abortado = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        erro: abortado ? "Tempo esgotado ao consultar (10s)" : `Erro técnico: ${msg}`,
      };
    }
  });
