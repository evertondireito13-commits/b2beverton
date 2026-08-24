// Busca global (⌘K / Ctrl+K) — empresas, leads da Central e navegação rápida.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { scoreEmpresas, PRIORIDADE_LABEL, type EmpresaScore } from "@/lib/lead-score";
import { setActiveLead } from "@/lib/daily-activities";

type NavItem = { label: string; to: string; search?: Record<string, string>; hint: string };

const NAV: NavItem[] = [
  { label: "Pré-ligação", to: "/", search: { tab: "pre" }, hint: "Gerar script" },
  { label: "Pós-ligação", to: "/", search: { tab: "pos" }, hint: "Registrar histórico" },
  { label: "Histórico de empresas", to: "/", search: { tab: "historico" }, hint: "Consultar" },
  { label: "Painel executivo", to: "/painel", hint: "Metas e ranking" },
  { label: "Agenda (calendário)", to: "/agenda", hint: "Compromissos" },
  { label: "Empresas (visão 360°)", to: "/painel", hint: "Timeline" },
  { label: "Central de Reuniões", to: "/reunioes", hint: "Funil" },
  { label: "Preparação Noturna", to: "/preparacao", hint: "Fila do dia" },
  { label: "Follow-up", to: "/followup", hint: "Retornos" },
  { label: "Relatório", to: "/relatorios", hint: "Volume" },
  { label: "Diário", to: "/relatorios", hint: "Relatório comercial" },
  { label: "Centro de Estratégia", to: "/estrategia", hint: "Análises" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [empresas, setEmpresas] = useState<EmpresaScore[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setEmpresas(scoreEmpresas().slice(0, 60));
  }, [open]);

  const go = useCallback(
    (item: NavItem) => {
      setOpen(false);
      navigate({ to: item.to, search: item.search as never });
    },
    [navigate],
  );

  const abrirEmpresa = useCallback(
    (e: EmpresaScore) => {
      setOpen(false);
      setActiveLead({
        razaoSocial: e.empresa,
        cnpj: e.cnpj ?? undefined,
      });
      navigate({ to: "/", search: { tab: "pre" } as never });
    },
    [navigate],
  );

  const grupos = useMemo(
    () => ({
      quentes: empresas.filter((e) => e.prioridade === "quente"),
      resto: empresas.filter((e) => e.prioridade !== "quente"),
    }),
    [empresas],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar empresa, contato ou tela… (⌘K)" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Ir para">
          {NAV.map((n) => (
            <CommandItem key={n.label + n.to} value={`${n.label} ${n.hint}`} onSelect={() => go(n)}>
              {n.label}
              <CommandShortcut>{n.hint}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        {grupos.quentes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Prioridade alta">
              {grupos.quentes.map((e) => (
                <CommandItem
                  key={e.key}
                  value={`${e.empresa} ${e.contato ?? ""} ${e.cargo ?? ""} ${e.cnpj ?? ""} ${e.tags.join(" ")} ${e.proximaAcao ?? ""} ${e.sugestao}`}
                  onSelect={() => abrirEmpresa(e)}
                >
                  <span className="truncate">{e.empresa}</span>
                  <CommandShortcut>
                    {PRIORIDADE_LABEL[e.prioridade]} · {e.score}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {grupos.resto.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Empresas">
              {grupos.resto.map((e) => (
                <CommandItem
                  key={e.key}
                  value={`${e.empresa} ${e.contato ?? ""} ${e.cargo ?? ""} ${e.cnpj ?? ""} ${e.tags.join(" ")} ${e.proximaAcao ?? ""} ${e.sugestao}`}
                  onSelect={() => abrirEmpresa(e)}
                >
                  <span className="truncate">{e.empresa}</span>
                  <CommandShortcut>{e.score}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
