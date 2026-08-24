import type { KeyboardEvent, ReactNode } from "react";
import { Trash2, Pencil } from "lucide-react";
import { EditableCompanyName } from "@/components/editable-company-name";

// ============================================================
// LeadCard — "Padrão Ouro" (Design System unificado)
// Estrutura fixa em 4 linhas:
//   1) Nome da Empresa (editável opcional)
//   2) Contato · Cargo
//   3) Status chip + Interesse/Resultado
//   4) Ações (slot livre) + Data opcional
// ============================================================

export type LeadCardStatus =
  | "decisor"
  | "portaria"
  | "pending"
  | "done"
  | "overdue"
  | "neutral";

const STATUS_STYLES: Record<LeadCardStatus, { chip: string; label: string }> = {
  decisor: {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    label: "Decisor",
  },
  portaria: {
    chip: "bg-muted text-muted-foreground",
    label: "Portaria/Outro",
  },
  pending: {
    chip: "bg-amber-100 text-amber-800",
    label: "Pendente",
  },
  done: {
    chip: "bg-emerald-100 text-emerald-800",
    label: "Concluído",
  },
  overdue: {
    chip: "bg-red-100 text-red-800",
    label: "Atrasado",
  },
  neutral: {
    chip: "bg-muted text-muted-foreground",
    label: "—",
  },
};

export interface LeadCardProps {
  empresa: string;
  contato?: string | null;
  cargo?: string | null;
  status?: LeadCardStatus;
  statusLabel?: string;
  interesse?: string | null;
  metaLine?: ReactNode; // linha secundária extra (ex: data, CNPJ)
  iconLeft?: ReactNode; // botão à esquerda (checkbox, ação)
  actions?: ReactNode;  // slot direita (edit/delete/link)
  onRename?: (novoNome: string) => void | Promise<void>;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  extra?: ReactNode; // slot inferior (Google Calendar link, etc)
  dimmed?: boolean;
}

export function LeadCard({
  empresa,
  contato,
  cargo,
  status = "neutral",
  statusLabel,
  interesse,
  metaLine,
  iconLeft,
  actions,
  onRename,
  onClick,
  onEdit,
  onDelete,
  extra,
  dimmed,
}: LeadCardProps) {
  const style = STATUS_STYLES[status];
  const clickable = !!onClick;

  const contatoCargo = [contato?.trim(), cargo?.trim()].filter(Boolean).join(" · ");
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      className={`group relative flex w-full min-w-0 max-w-full flex-wrap items-stretch gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:flex-nowrap ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      {iconLeft ? (
        <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          {iconLeft}
        </div>
      ) : null}

      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? onClick : undefined}
        onKeyDown={handleKeyDown}
        className={`flex min-w-0 flex-1 flex-col text-left ${clickable ? "cursor-pointer" : "cursor-default"}`}
        title={clickable ? "Clique para carregar este lead" : undefined}
      >
        {/* Linha 1 — Empresa */}
        <div
          className={`break-words text-[15px] font-bold leading-tight tracking-tight text-foreground ${
            dimmed ? "line-through text-muted-foreground" : ""
          }`}
          onClick={(e) => onRename && e.stopPropagation()}

        >
          {onRename ? (
            <EditableCompanyName value={empresa} onSave={onRename} />
          ) : (
            empresa
          )}
        </div>


        {/* Linha 2 — Contato · Cargo */}
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {contatoCargo || <span className="italic opacity-70">Contato não informado</span>}
        </div>

        {/* Linha 3 — Status chip + Interesse/Resultado */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}
          >
            {statusLabel ?? style.label}
          </span>
          {interesse ? (
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {interesse}
            </span>
          ) : null}
        </div>

        {/* Linha 4 — Meta (data, CNPJ) */}
        {metaLine ? (
          <div className="mt-1 text-[11px] leading-snug text-muted-foreground/80">
            {metaLine}
          </div>
        ) : null}


        {/* Slot extra (ex: link Google Calendar) */}
        {extra ? <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>{extra}</div> : null}
      </div>

      {(actions || onEdit || onDelete) && (
        <div
          className="flex w-full shrink-0 flex-wrap items-center justify-end gap-0.5 border-t border-border/60 pt-1.5 sm:w-auto sm:items-start sm:justify-start sm:border-0 sm:pt-0"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted-foreground/70 transition hover:bg-muted hover:text-primary sm:h-8 sm:w-8"
              title="Editar"
              aria-label={`Editar ${empresa}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted-foreground/70 transition hover:bg-red-50 hover:text-red-600 sm:h-8 sm:w-8"
              title="Remover"
              aria-label={`Remover ${empresa}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
