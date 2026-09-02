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
    }
  | { ok: false; erro: string };

export const consultarCnpj = createServerFn({ method: "GET" })
  .middleware([requireBhmGate])
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }): Promise<CnpjEnriquecimento> => {
    const digitos = data.cnpj.replace(/\D/g, "");
    if (digitos.length !== 14) return { ok: false, erro: "CNPJ inválido" };

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) return { ok: false, erro: "CNPJ não encontrado" };
      if (!res.ok) return { ok: false, erro: `Consulta falhou (${res.status})` };

      const j = (await res.json()) as {
        uf?: string;
        municipio?: string;
        cnae_fiscal_descricao?: string;
        opcao_pelo_simples?: boolean | null;
        opcao_pelo_mei?: boolean | null;
      };

      // A base pública só informa Simples/MEI com certeza; Presumido x Real
      // não constam — nesses casos deixamos vazio para preenchimento manual.
      let regime: string | null = null;
      if (j.opcao_pelo_mei) regime = "MEI";
      else if (j.opcao_pelo_simples) regime = "Simples Nacional";

      return {
        ok: true,
        uf: j.uf ?? null,
        municipio: j.municipio ?? null,
        setor: j.cnae_fiscal_descricao ?? null,
        regime,
      };
    } catch {
      return { ok: false, erro: "Falha de rede ao consultar o CNPJ" };
    }
  });
