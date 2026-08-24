// Navegação lateral única — 3 grupos por frequência de uso.
// Substitui o menu duplicado (cards da sidebar + abas do cabeçalho).
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

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
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`w-full ${itemClass(active, destaque)}`}
        >
          {content}
        </button>
      );
    }
    return (
      <Link key={id} to="/" search={{ tab: id }} className={itemClass(active, destaque)}>
        {content}
      </Link>
    );
  };

  return (
    <nav className="space-y-3" aria-label="Navegação principal">
      <Group titulo="Prospectar" legenda="Sua rotina diária" storageKey="prospectar">
        {homeItem("pre", "📞", "Pré-ligação", true)}
        {homeItem("pos", "📝", "Pós-ligação", true)}
        <Link to="/preparacao" className={itemClass(current === "preparacao", true)}>
          <Row icon="🌙" label="Preparação Noturna" active={current === "preparacao"} destaque />
        </Link>
      </Group>

      <Group titulo="Acompanhar" legenda="Retornos e prioridades" storageKey="acompanhar">
        <Link
          to="/followup"
          search={{ tab: "followups" }}
          className={itemClass(current === "followup")}
        >
          <Row icon="🔔" label="Follow-up" active={current === "followup"} />
        </Link>

        <Link
          to="/painel"
          search={{ q: undefined }}
          className={itemClass(current === "painel")}
        >
          <Row icon="📈" label="Painel Executivo" active={current === "painel"} />
        </Link>
      </Group>

      <Group titulo="Central de Reuniões" legenda="Pós-agendamento" storageKey="reunioes">
        <Link to="/reunioes" className={itemClass(current === "reunioes")}>
          <Row icon="🤝" label="Central de Reuniões" active={current === "reunioes"} />
        </Link>
      </Group>

      <Group
        titulo="Resultados"
        legenda="Consulta ocasional"
        storageKey="resultados"
        defaultOpen={false}
      >
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
        <Link to="/comissao" className={itemClass(current === "comissao")}>
          <Row icon="💰" label="Minha Comissão" active={current === "comissao"} />
        </Link>


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
