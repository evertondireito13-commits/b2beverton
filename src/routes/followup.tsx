import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFollowUp } from "@/lib/follow-ups.functions";

import { listFollowUps, type FollowUp } from "@/lib/follow-ups.functions";
import {
  getExcludedFollowUpCnpjs,
  getExcludedFollowUpCompanyNames,
  LEADS_EVENT,
} from "@/lib/leads-store";
import { cacheRemoteFollowUps } from "@/lib/followup-bridge";
import { AppShell } from "./index";
import { AgendaCalendar } from "./agenda";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Loader2, RefreshCcw, CheckCircle2, ArrowLeft } from "lucide-react";


import { followUpEncerradoPorHistorico } from "@/lib/historico-store";
import {
  FollowUpList,
  EditFollowUpDialog,
  RescheduleDialog,
} from "@/components/followup/follow-up-list";
import {
  activeConsultor,
  useFollowUpActions,
} from "@/components/followup/use-follow-up-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanySheet, type CompanyTarget } from "@/components/company-timeline-sheet";


export const Route = createFileRoute("/followup")({
  head: () => ({
    meta: [
      { title: "Follow-up · Central de Prospecção" },
      {
        name: "description",
        content:
          "Acompanhe retornos de prospecção por ligação, e-mail, WhatsApp e reunião, com visão executiva de metas e ranking.",
      },
      { property: "og:title", content: "Follow-up · Central de Prospecção" },
      {
        property: "og:description",
        content: "Operação do dia e painel executivo na mesma tela, com timeline 360° de cada empresa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search['tab'] === "visao-geral" ? ("visao-geral" as const) : ("followups" as const),
  }),
  component: FollowUpPage,
});


function FollowUpPage() {
  const [rows, setRows] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [companyTarget, setCompanyTarget] = useState<CompanyTarget>(null);

  const runList = useServerFn(listFollowUps);
  const runCreate = useServerFn(createFollowUp);
  const actions = useFollowUpActions({
    applyPatch: (id, patch) =>
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    applyRemove: (id) => setRows((rs) => rs.filter((r) => r.id !== id)),
  });
  const { editingRow, setEditingRow, reschedulingRow, setReschedulingRow } = actions;
  


  

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setDate(to.getDate() + 365);
      to.setHours(23, 59, 59, 999);

      const consultor = activeConsultor();
      const list = await runList({
        data: { from: from.toISOString(), to: to.toISOString(), limit: 500, consultor },
      });
      // Follow-up é EXCLUSIVAMENTE para prospecção fria (retornos de ligação).
      // Reuniões e negociações pós-reunião vivem na Central de Reuniões.
      cacheRemoteFollowUps(list);
      const excludedCnpjs = getExcludedFollowUpCnpjs();
      const excludedNames = getExcludedFollowUpCompanyNames();
      setRows(
        list.filter((item: FollowUp) => {
          if (item.action_type === "meeting" || item.action_type === "negociacao") return false;
          if (followUpEncerradoPorHistorico(item)) return false;
          const cnpjDigits = (item.cnpj ?? "").replace(/\D/g, "");
          if (cnpjDigits && excludedCnpjs.has(cnpjDigits)) return false;
          if (excludedNames.has(item.company_name.trim().toLowerCase())) return false;
          return true;
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
  }, [runList]);


  useEffect(() => {
    refresh();
    const t = setInterval(() => setNow(new Date()), 60_000);
    const onSession = () => {
      setRows([]);
      refresh();
    };
    const onLeads = () => refresh();
    if (typeof window !== "undefined") {
      window.addEventListener("bhm:session-changed", onSession);
      window.addEventListener(LEADS_EVENT, onLeads);
      window.addEventListener("bhm:followups-updated", onLeads);
    }
    return () => {
      clearInterval(t);
      if (typeof window !== "undefined") {
        window.removeEventListener("bhm:session-changed", onSession);
        window.removeEventListener(LEADS_EVENT, onLeads);
        window.removeEventListener("bhm:followups-updated", onLeads);
      }
    };
  }, [refresh]);

  const groups = useMemo(() => groupRows(rows, now), [rows, now]);
  // Lista única, já ordenada por urgência (atrasados primeiro, depois por data).
  const pendentes = useMemo(
    () => [...groups.overdue, ...groups.today, ...groups.soon, ...groups.later],
    [groups],
  );
  const [verConcluidos, setVerConcluidos] = useState(false);
  const [vista, setVista] = useState<"fila" | "agenda">("fila");
  const [filtro, setFiltro] = useState<"todas" | "overdue" | "today" | "soon" | "later">("todas");
  const listaFiltrada = useMemo(() => {
    if (filtro === "todas") return pendentes;
    return groups[filtro];
  }, [filtro, pendentes, groups]);



  const {
    markDone,
    remove,
    toggleEmailSent,
    saveReschedule,
    saveEdit,
    renameRow,
    goToPosLigacao,
  } = actions;

  async function quickScheduleFollowUp(empresa: string, cnpj?: string | null) {
    try {
      const when = new Date();
      when.setDate(when.getDate() + 1);
      when.setHours(9, 0, 0, 0);
      await runCreate({
        data: {
          companyName: empresa,
          cnpj: cnpj ?? null,
          actionType: "call",
          scheduledAt: when.toISOString(),
          notes: "Retorno agendado pela timeline da empresa.",
          consultor: activeConsultor(),
        },
      });
      toast.success(`Follow-up agendado para amanhã 09:00 — ${empresa}`);
      setCompanyTarget(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao agendar follow-up");
    }
  }

  const openCompany = (empresa: string, cnpj?: string | null) =>
    setCompanyTarget({ empresa, cnpj: cnpj ?? null });

  return (
    <AppShell current="followup">
      <Toaster richColors position="top-right" />

      <div className="mt-4 space-y-4">
        {firstLoad ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-56 rounded-xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant={vista === "fila" ? "default" : "outline"}
              className="h-9"
              onClick={() => setVista("fila")}
            >
              🔔 Follow-ups
            </Button>
            <Button
              size="sm"
              variant={vista === "agenda" ? "default" : "outline"}
              className="h-9"
              onClick={() => setVista("agenda")}
            >
              🗓️ Agenda
            </Button>
          </div>

          {vista === "agenda" ? (
            <AgendaCalendar embedded />
          ) : (
          <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-base font-semibold">
                {verConcluidos ? "Follow-ups concluídos" : "Fila de follow-ups"}{" "}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({(verConcluidos ? groups.done : pendentes).length})
                </span>
              </h1>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {verConcluidos
                  ? "Últimos retornos marcados como feitos."
                  : "Ordenada por urgência — atrasados primeiro."}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setVerConcluidos((v) => !v)}>
                {verConcluidos ? (
                  <>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Voltar à fila
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Ver concluídos
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-1 h-4 w-4" />
                )}
                Atualizar
              </Button>
            </div>
          </div>

          {!verConcluidos && (
            <div className="flex flex-wrap gap-1.5">
              {([
                ["todas", `Todas (${pendentes.length})`],
                ["overdue", `Atrasadas (${groups.overdue.length})`],
                ["today", `Hoje (${groups.today.length})`],
                ["soon", `7 dias (${groups.soon.length})`],
                ["later", `Mais de 7 dias (${groups.later.length})`],
              ] as const).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filtro === key ? "secondary" : "ghost"}
                  className={`h-8 rounded-full border text-[11px] ${
                    filtro === key ? "border-primary/40" : "border-border/70"
                  }`}
                  onClick={() => setFiltro(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}

          <FollowUpList
            rows={verConcluidos ? groups.done : listaFiltrada}
            now={now}
            onDone={markDone}
            onRemove={remove}
            onEdit={setEditingRow}
            onRename={renameRow}
            onToggleEmail={toggleEmailSent}
            onReschedule={setReschedulingRow}
            onViewHistory={(r) => openCompany(r.company_name, r.cnpj)}
            onGoToPos={goToPosLigacao}
            emptyLabel={
              verConcluidos
                ? "Nenhum concluído ainda."
                : "Nenhum follow-up neste filtro. 👌"
            }
          />
          </>
          )}
        </div>
        )}
      </div>


      <CompanySheet
        target={companyTarget}
        onClose={() => setCompanyTarget(null)}
        onScheduleFollowUp={(f) => quickScheduleFollowUp(f.empresa, f.cnpj)}
      />


      <EditFollowUpDialog
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={saveEdit}
      />
      <RescheduleDialog
        row={reschedulingRow}
        onClose={() => setReschedulingRow(null)}
        onSave={saveReschedule}
      />

    </AppShell>
  );
}

function groupRows(rows: FollowUp[], now: Date) {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const endWeek = new Date(startToday);
  endWeek.setDate(endWeek.getDate() + 7);

  const overdue: FollowUp[] = [];
  const today: FollowUp[] = [];
  const soon: FollowUp[] = [];
  const later: FollowUp[] = [];
  const done: FollowUp[] = [];

  for (const r of rows) {
    if (r.status === "cancelled") continue;
    if (r.status === "done") {
      done.push(r);
      continue;
    }
    const at = new Date(r.scheduled_at).getTime();
    if (at < startToday.getTime()) overdue.push(r);
    else if (at <= endToday.getTime()) today.push(r);
    else if (at <= endWeek.getTime()) soon.push(r);
    else later.push(r);
  }
  // Ordena
  overdue.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  today.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  soon.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  later.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  done.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  return { overdue, today, soon, later, done: done.slice(0, 10) };
}
