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
      };

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
