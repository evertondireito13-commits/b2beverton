// Classificação por IA do desfecho da reunião — mesmo padrão de
// extractFollowUpFromCall (Lovable AI Gateway + gemini-2.5-flash + JSON).
import { createServerFn } from "@tanstack/react-start";
import { requireBhmGate } from "@/lib/bhm-gate";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { RESULTADO_IDS, catalogoParaPrompt, type ResultadoId } from "./resultado-reuniao-opcoes";

export type ResultadoDetectado = {
  ok: boolean;
  resultado?: ResultadoId;
  confianca?: "alta" | "media" | "baixa";
  justificativa?: string;
  motivo?: string;
};

export const classificarResultadoReuniao = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        texto: z.string().trim().min(1).max(20000),
        empresa: z.string().trim().max(300).optional().nullable(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<ResultadoDetectado> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const system = `Você classifica o desfecho de uma reunião comercial B2B (recuperação de créditos tributários).

Leia o relato livre do consultor e escolha EXATAMENTE UMA das categorias abaixo:
${catalogoParaPrompt()}

REGRAS:
- Responda APENAS um objeto JSON válido, sem markdown e sem crases.
- Formato: {"resultado": "<id>", "confianca": "alta"|"media"|"baixa", "justificativa": "1 frase curta em português"}
- Use o id exatamente como escrito na lista.
- "recusa_imediata" é recusa comercial; "desqualificacao" é falta de fit técnico (regime, porte, janela de 5 anos).
- "reagendamento" = avisou antes; "no_show" = não apareceu e não avisou.
- Se o relato for ambíguo, escolha a categoria mais provável e marque confianca "baixa".`;

    let raw = "";
    try {
      const gateway = createLovableAiGatewayProvider(key);
      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system,
        prompt: `EMPRESA: ${data.empresa ?? "—"}\n\n--- RELATO DA REUNIÃO ---\n${data.texto}`,
      });
      raw = text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) throw new Error("Limite de requisições atingido. Tente em alguns segundos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha na IA: ${msg}`);
    }

    const cleaned = raw.replace(/```json|```/gi, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return { ok: false, motivo: "IA não retornou JSON" };
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return { ok: false, motivo: "JSON inválido da IA" };
    }

    const safe = z
      .object({
        resultado: z.enum(RESULTADO_IDS),
        confianca: z.enum(["alta", "media", "baixa"]).default("media"),
        justificativa: z.string().trim().max(400).optional().default(""),
      })
      .safeParse({
        resultado: parsed.resultado,
        confianca: parsed.confianca ?? "media",
        justificativa: parsed.justificativa ?? "",
      });
    if (!safe.success) return { ok: false, motivo: "Categoria não reconhecida" };

    return {
      ok: true,
      resultado: safe.data.resultado,
      confianca: safe.data.confianca,
      justificativa: safe.data.justificativa,
    };
  });
