import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null | undefined;
  onSave: (novoNome: string) => void | Promise<void>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  emptyLabel?: string;
  title?: string;
  as?: "span" | "div";
  stopPropagation?: boolean;
};

const EMPTY_VALUES = new Set(["", "[não informado]", "não informado", "n/i", "sem nome"]);

function isEmpty(v: string | null | undefined) {
  return !v || EMPTY_VALUES.has(v.trim().toLowerCase());
}

/**
 * Nome da empresa editável em linha. Clique para transformar em input;
 * Enter/blur salva; Esc cancela. Usado em Pós-ligação, Follow-up, Histórico,
 * Diário e Centro de Estratégia.
 */
export function EditableCompanyName({
  value,
  onSave,
  className,
  inputClassName,
  placeholder = "Nome da empresa",
  emptyLabel = "✏️ Digitar nome da empresa",
  title = "Clique para editar o nome da empresa",
  as = "span",
  stopPropagation = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setTempValue(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const empty = isEmpty(value ?? "");
  const Wrapper = as;

  async function commit() {
    const next = tempValue.trim();
    if (!editing) return;
    setEditing(false);
    if (!next || next === (value ?? "").trim()) return;
    try {
      await onSave(next);
    } catch {
      /* onSave deve tratar; UI já saiu do modo edição */
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setTempValue(value ?? "");
            setEditing(false);
          }
        }}
        onClick={(e) => stopPropagation && e.stopPropagation()}
        placeholder={placeholder}
        className={cn(
          "min-w-0 max-w-full rounded-md border border-border/70 bg-white px-1.5 py-0.5 text-sm text-navy-deep outline-none ring-1 ring-primary/30 focus:ring-2 focus:ring-primary/50",
          inputClassName,
        )}
      />
    );
  }

  return (
    <Wrapper
      role="button"
      tabIndex={0}
      title={title}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        "group inline-flex max-w-full cursor-text items-center gap-1 rounded-md px-0.5 hover:bg-primary/5",
        empty && "italic text-primary/80",
        className,
      )}
    >
      <span className="min-w-0 truncate">{empty ? emptyLabel : value}</span>
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/60 opacity-60 transition sm:opacity-0 sm:group-hover:opacity-100" />
    </Wrapper>
  );
}
