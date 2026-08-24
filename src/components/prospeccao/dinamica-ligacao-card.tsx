import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AnaliseAvancada } from "@/lib/prospeccao.functions";

/**
 * Card NOVO e opcional: mostra a dinâmica da ligação (proporção de fala,
 * termos do cliente, sinais de fechamento). Se não houver análise, não
 * renderiza nada — sem mensagem de erro para o operador.
 */
export function DinamicaLigacaoCard({ analise }: { analise: AnaliseAvancada | null }) {
  const [open, setOpen] = useState(true);
  if (!analise) return null;

  const termos = analise.termos_chave_cliente ?? [];
  const sinais = analise.sinais_de_fechamento ?? [];
  const pct = analise.proporcao_fala_vendedor;
  const temAlgo = pct !== null || termos.length > 0 || sinais.length > 0 || analise.vendedor_falou_demais === true;
  if (!temAlgo) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-card shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex items-center gap-2 text-sm font-semibold">
            <span>{open ? "▼" : "▶"}</span>
            <span>🔎 Dinâmica da ligação</span>
          </button>
        </CollapsibleTrigger>
        {analise.vendedor_falou_demais === true && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
            ⚠️ Vendedor falou muito
          </span>
        )}
      </div>

      <CollapsibleContent className="space-y-3 border-t px-3 pb-3 pt-3">
        {pct !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Fala do vendedor</span>
              <span className="font-semibold text-foreground">{Math.round(pct)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${pct > 70 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cliente: {Math.max(0, 100 - Math.round(pct))}%
            </p>
          </div>
        )}

        {termos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Termos-chave do cliente</p>
            <div className="flex flex-wrap gap-1.5">
              {termos.map((t) => (
                <span
                  key={t}
                  className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {sinais.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Sinais de fechamento</p>
            <ul className="space-y-1">
              {sinais.map((s) => (
                <li key={s} className="flex gap-2 text-sm leading-snug">
                  <span className="text-emerald-600">✓</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
