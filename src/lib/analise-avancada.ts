import { salvarAnaliseConversa } from "./prospeccao.functions";
import { stableUuid } from "./cloud-store";
import type { AnaliseAvancada } from "./prospeccao.functions";

/**
 * Persiste a análise de dinâmica da ligação na tabela `analises_conversa`.
 * 100% aditivo e opcional: qualquer falha é engolida (a análise é um extra,
 * nunca bloqueia nem invalida o histórico já salvo).
 *
 * O histórico é espelhado na nuvem por um sync com debounce (~700ms), então
 * tentamos algumas vezes até a linha-pai existir (FK).
 */
export async function saveAnaliseAvancada(
  historicoLocalId: string,
  analise: AnaliseAvancada,
): Promise<void> {
  const historicoId = stableUuid(historicoLocalId);
  const row = {
    historico_id: historicoId,
    proporcao_fala_vendedor: analise.proporcao_fala_vendedor,
    termos_chave_cliente: analise.termos_chave_cliente ?? [],
    sinais_de_fechamento: analise.sinais_de_fechamento ?? [],
    vendedor_falou_demais: analise.vendedor_falou_demais,
  };

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    await new Promise((r) => setTimeout(r, tentativa === 0 ? 1500 : 2500));
    try {
      await salvarAnaliseConversa({ data: row });
      return;
    } catch {
      /* noop */
    }
  }
}
