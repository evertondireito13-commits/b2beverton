// Componente único da linha do tempo de uma empresa — usado em todos os lugares
// que mostram histórico (drawer 360°, pré-ligação, agenda) para manter o mesmo
// nível de detalhe em todo o app.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TEXT, TONE, isRecent } from "@/lib/status-tokens";
import type { TimelineItem } from "@/lib/company-ficha";

export function CompanyTimelineRow({ item }: { item: TimelineItem }) {
  const [aberto, setAberto] = useState(false);
  const dot =
    item.kind === "historico"
      ? "bg-primary"
      : item.kind === "followup"
        ? item.concluido
          ? "bg-emerald-500"
          : "bg-amber-500"
        : "bg-slate-400";
  return (
    <li className="relative">
      <span className={`absolute -left-[22px] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-card ${dot}`} />
      <div className="rounded-xl border border-border/70 bg-card px-3 py-2 transition-colors hover:border-primary/40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={TEXT.title}>{item.titulo}</span>
          {isRecent(item.at) && (
            <Badge variant="outline" className={`text-[9px] ${TONE.success}`}>
              novo
            </Badge>
          )}
          {item.kind === "followup" && (
            <Badge variant="outline" className={`text-[9px] ${item.concluido ? TONE.success : TONE.warning}`}>
              {item.concluido ? "concluído" : "agendado"}
            </Badge>
          )}
        </div>
        <p className={`mt-0.5 ${TEXT.meta}`}>
          {new Date(item.at).toLocaleString("pt-BR")}
          {item.canal ? ` · ${item.canal}` : ""}
          {item.autor ? ` · ${item.autor}` : ""}
          {item.subtitulo ? ` · ${item.subtitulo}` : ""}
        </p>
        {item.detalhe && <p className={`mt-1 ${TEXT.body}`}>{item.detalhe}</p>}
        {item.proximaAcao && (
          <p className="mt-1 text-[11px] text-foreground/70">➡️ {item.proximaAcao}</p>
        )}
        {item.objecao && <p className="mt-1 text-[11px] text-amber-700">⚠️ {item.objecao}</p>}
        {item.texto?.trim() && (
          <>
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="mt-1 text-[10px] font-medium text-primary transition hover:underline"
            >
              {aberto ? "Ocultar texto completo" : "Ver texto completo"}
            </button>
            {aberto && (
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-2 text-[11px] text-foreground/80">
                {item.texto}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function CompanyTimelineList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className={TEXT.body}>Nenhuma interação registrada para esta empresa ainda.</p>
      </div>
    );
  }
  return (
    <ol className="relative space-y-3 border-l-2 border-border/70 pl-4">
      {items.map((item) => (
        <CompanyTimelineRow key={item.id} item={item} />
      ))}
    </ol>
  );
}
