// Navegação lateral única — 3 grupos por frequência de uso.
// Substitui o menu duplicado (cards da sidebar + abas do cabeçalho).
// Os itens de cada grupo podem ser arrastados (⋮⋮) para reordenar; a ordem
// escolhida fica salva no navegador (localStorage) por grupo.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type NavKey =
  | "pre"
  | "pos"
  | "historico"
  | "followup"
  | "diario"
  | "relatorio"
  | "estrategia"
  | "reunioes"
  | "preparacao"
  | "painel"
  | "agenda"
  | "comissao"
  | "empresas";

type HomeTab = "pre" | "pos" | "historico";

const ITEM_BASE =
  "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all duration-150";
const ITEM_IDLE =
  "border-transparent bg-transparent text-foreground/80 hover:border-primary/30 hover:bg-primary/5 hover:text-foreground";
const ITEM_ACTIVE = "border-primary bg-primary/10 text-primary shadow-card";

function itemClass(active: boolean, destaque = false) {
  return [
    ITEM_BASE,
    active ? ITEM_ACTIVE : ITEM_IDLE,
    destaque ? "py-2.5 font-semibold" : "font-medium",
  ].join(" ");
}

function Row({
  icon,
  label,
  hint,
  active,
  destaque,
}: {
  icon: string;
  label: string;
  hint?: string;
  active: boolean;
  destaque?: boolean;
}) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="text-base leading-none">
          {icon}
        </span>
        <span className={`truncate ${destaque ? "text-sm" : "text-[13px]"}`}>{label}</span>
      </span>
      {hint && (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider opacity-60">
          {hint}
        </span>
      )}
      {active && !hint && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
    </>
  );
}

function Group({
  titulo,
  legenda,
  children,
  defaultOpen = true,
  storageKey,
}: {
  titulo: string;
  legenda?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`bhm.nav.${storageKey}`);
      if (saved !== null) setOpen(saved === "1");
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  const toggle = () => {
    setOpen((v) => {
      try {
        window.localStorage.setItem(`bhm.nav.${storageKey}`, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-2 shadow-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {titulo}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && (
        <>
          {legenda && <p className="px-2 pb-1 text-[10px] text-muted-foreground">{legenda}</p>}
          <div className="space-y-0.5">{children}</div>
        </>
      )}
    </div>
  );
}

// --- Reordenação por arrastar-e-soltar -------------------------------------

/** Lê/grava a ordem escolhida pelo usuário para um grupo de itens no localStorage. */
function useOrderedIds(storageKey: string, defaultOrder: string[]): [string[], (ids: string[]) => void] {
  const stableDefault = useMemo(() => defaultOrder, [defaultOrder.join("|")]);
  const [order, setOrder] = useState<string[]>(stableDefault);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`bhm.nav.order.${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const known = parsed.filter(
            (id): id is string => typeof id === "string" && stableDefault.includes(id),
          );
          const missing = stableDefault.filter((id) => !known.includes(id));
          setOrder([...known, ...missing]);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setOrder(stableDefault);
  }, [storageKey, stableDefault]);

  const persist = (ids: string[]) => {
    setOrder(ids);
    try {
      window.localStorage.setItem(`bhm.nav.order.${storageKey}`, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  };

  return [order, persist];
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="group/nav-item relative flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Arrastar para reordenar"
        className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground focus-visible:opacity-100 group-hover/nav-item:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Lista de itens arrastável dentro de um grupo. */
function SortableGroupList({
  storageKey,
  defaultOrder,
  renderItem,
}: {
  storageKey: string;
  defaultOrder: string[];
  renderItem: (id: string) => React.ReactNode;
}) {
  const [order, setOrder] = useOrderedIds(storageKey, defaultOrder);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(String(active.id));
      const newIndex = order.indexOf(String(over.id));
      if (oldIndex !== -1 && newIndex !== -1) {
        setOrder(arrayMove(order, oldIndex, newIndex));
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {order.map((id) => (
            <SortableItem key={id} id={id}>
              {renderItem(id)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// --- Menu principal ----------------------------------------------------------

const PROSPECTAR_ORDER = ["pre", "pos", "preparacao"];
const ACOMPANHAR_ORDER = ["followup", "painel"];
const REUNIOES_ORDER = ["reunioes"];
const RESULTADOS_ORDER = ["relatorio", "comissao"];

export function AppNav({
  current,
  onSelect,
}: {
  current: NavKey;
  onSelect?: (v: HomeTab) => void;
}) {
  const onHome = current === "pre" || current === "pos" || current === "historico";

  const homeItem = (id: HomeTab, icon: string, label: string, destaque = false) => {
    const active = current === id;
    const content = <Row icon={icon} label={label} active={active} destaque={destaque} />;
    if (onHome && onSelect) {
      return (
        <button
          type="button"
          onClick={() => onSelect(id)}
          className={`w-full ${itemClass(active, destaque)}`}
        >
          {content}
        </button>
      );
    }
    return (
      <Link to="/" search={{ tab: id }} className={itemClass(active, destaque)}>
        {content}
      </Link>
    );
  };

  const renderProspectar = (id: string) => {
    switch (id) {
      case "pre":
        return homeItem("pre", "📞", "Pré-ligação", true);
      case "pos":
        return homeItem("pos", "📝", "Pós-ligação", true);
      case "preparacao":
        return (
          <Link to="/preparacao" className={itemClass(current === "preparacao", true)}>
            <Row icon="🌙" label="Preparação Noturna" active={current === "preparacao"} destaque />
          </Link>
        );
      default:
        return null;
    }
  };

  const renderAcompanhar = (id: string) => {
    switch (id) {
      case "followup":
        return (
          <Link
            to="/followup"
            search={{ tab: "followups" }}
            className={itemClass(current === "followup")}
          >
            <Row icon="🔔" label="Follow-up" active={current === "followup"} />
          </Link>
        );
      case "painel":
        return (
          <Link to="/painel" search={{ q: undefined }} className={itemClass(current === "painel")}>
            <Row icon="📈" label="Painel Executivo" active={current === "painel"} />
          </Link>
        );
      default:
        return null;
    }
  };

  const renderReunioes = (id: string) => {
    switch (id) {
      case "reunioes":
        return (
          <Link to="/reunioes" className={itemClass(current === "reunioes")}>
            <Row icon="🤝" label="Central de Reuniões" active={current === "reunioes"} />
          </Link>
        );
      default:
        return null;
    }
  };

  const renderResultados = (id: string) => {
    switch (id) {
      case "relatorio":
        return (
          <Link
            to="/relatorios"
            search={{ tab: "diario" }}
            className={itemClass(current === "relatorio" || current === "diario")}
          >
            <Row
              icon="📊"
              label="Relatórios"
              active={current === "relatorio" || current === "diario"}
            />
          </Link>
        );
      case "comissao":
        return (
          <Link to="/comissao" className={itemClass(current === "comissao")}>
            <Row icon="💰" label="Minha Comissão" active={current === "comissao"} />
          </Link>
        );
      default:
        return null;
    }
  };

  return (
    <nav className="space-y-3" aria-label="Navegação principal">
      <Group titulo="Prospectar" legenda="Sua rotina diária" storageKey="prospectar">
        <SortableGroupList
          storageKey="prospectar"
          defaultOrder={PROSPECTAR_ORDER}
          renderItem={renderProspectar}
        />
      </Group>

      <Group titulo="Acompanhar" legenda="Retornos e prioridades" storageKey="acompanhar">
        <SortableGroupList
          storageKey="acompanhar"
          defaultOrder={ACOMPANHAR_ORDER}
          renderItem={renderAcompanhar}
        />
      </Group>

      <Group titulo="Central de Reuniões" legenda="Pós-agendamento" storageKey="reunioes">
        <SortableGroupList
          storageKey="reunioes"
          defaultOrder={REUNIOES_ORDER}
          renderItem={renderReunioes}
        />
      </Group>

      <Group
        titulo="Resultados"
        legenda="Consulta ocasional"
        storageKey="resultados"
        defaultOpen={false}
      >
        <SortableGroupList
          storageKey="resultados"
          defaultOrder={RESULTADOS_ORDER}
          renderItem={renderResultados}
        />

        <Link
          to="/estrategia"
          className={`mt-0.5 block rounded-lg px-3 py-1.5 text-[11px] transition-colors ${
            current === "estrategia"
              ? "text-primary underline"
              : "text-muted-foreground hover:text-primary"
          }`}
        >
          🧠 Centro de Estratégia (auditoria)
        </Link>
      </Group>
    </nav>
  );
}
