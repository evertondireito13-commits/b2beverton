
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listCalls,
  logCall,
  updateCall,
  deleteCall,
  type CallLog,
} from "@/lib/call-logs.functions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Loader2, RefreshCcw, CheckCircle2, CalendarPlus, ChevronDown } from "lucide-react";
import { getConsultor, getSessionConsultor } from "@/lib/historico-store";
import { LeadCard } from "@/components/lead-card";
import { ProdutividadeSection } from "@/components/painel-secoes";

function activeConsultor(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

const MIN_CALLS_PER_DAY = 30;
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;

export function CallLogsReport() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const runList = useServerFn(listCalls);
  const runLog = useServerFn(logCall);
  const runUpdate = useServerFn(updateCall);
  const runDelete = useServerFn(deleteCall);

  async function refresh() {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 45);
      from.setHours(0, 0, 0, 0);
      const rows = await runList({ data: { from: from.toISOString(), limit: 500, consultor: activeConsultor() } });
      setLogs(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(() => setNow(new Date()), 60_000);
    const onHist = () => {
      setNow(new Date());
      refresh();
    };
    window.addEventListener("bhm:historico-updated", onHist);
    window.addEventListener("storage", onHist);
    window.addEventListener("bhm:session-changed", onHist);
    return () => {
      clearInterval(t);
      window.removeEventListener("bhm:historico-updated", onHist);
      window.removeEventListener("storage", onHist);
      window.removeEventListener("bhm:session-changed", onHist);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => computeStats(logs, now), [logs, now]);
  const pace = useMemo(() => computePace(stats.today.calls, now), [stats, now]);


  async function toggleMeeting(row: CallLog) {
    try {
      await runUpdate({
        data: { id: row.id, meetingScheduled: !row.meeting_scheduled, consultor: activeConsultor() },
      });
      setLogs((ls) =>
        ls.map((l) =>
          l.id === row.id ? { ...l, meeting_scheduled: !row.meeting_scheduled } : l,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
    }
  }

  async function remove(row: CallLog) {
    if (!confirm(`Remover ligação da empresa "${row.company_name}"?`)) return;
    try {
      await runDelete({ data: { id: row.id, consultor: activeConsultor() } });
      setLogs((ls) => ls.filter((l) => l.id !== row.id));
      toast.success("Registro removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    }
  }

  return (
    <>
      <Toaster richColors position="top-right" />

      <div className="mb-6">
        <ProdutividadeSection />
      </div>


      {/* Pace warning */}
      <div
        className={`rounded-2xl border px-5 py-4 text-sm shadow-card ${paceStyle(pace.state)}`}
      >
        <div className="font-medium">{pace.title}</div>
        <div className="mt-1 text-xs opacity-90">{pace.detail}</div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Stats cards */}
        <div className="grid gap-4 lg:col-span-3 lg:grid-cols-3">
          <PeriodCard
            title="Hoje"
            calls={stats.today.calls}
            meetings={stats.today.meetings}
            highlight={stats.today.calls < MIN_CALLS_PER_DAY}
            footer={`Meta diária: ${MIN_CALLS_PER_DAY} ligações`}
          />
          <PeriodCard
            title="Esta semana"
            calls={stats.week.calls}
            meetings={stats.week.meetings}
            footer={`De ${fmtDate(stats.week.from)} até hoje`}
          />
          <PeriodCard
            title="Este mês"
            calls={stats.month.calls}
            meetings={stats.month.meetings}
            footer={`${fmtMonth(now)}`}
          />
        </div>

        {/* Empresas ligadas hoje (aberto por padrão) */}
        <Collapsible defaultOpen className="lg:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
              <CollapsibleTrigger className="group flex flex-1 items-center gap-2 text-left">
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                <CardTitle className="text-base">
                  Empresas ligadas hoje ({stats.today.calls})
                </CardTitle>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
                disabled={loading}
                title="Atualizar"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <CallList
                  rows={stats.today.rows}
                  emptyLabel="Nenhuma ligação registrada hoje ainda."
                  onToggleMeeting={toggleMeeting}
                  onRemove={remove}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Histórico da semana (recolhido por padrão) */}
        <Collapsible className="lg:col-span-3">
          <Card>
            <CardHeader className="py-3">
              <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                <CardTitle className="text-base">
                  Histórico da semana ({stats.week.calls} ligações · {stats.week.meetings} reuniões)
                </CardTitle>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <CallList
                  rows={stats.week.rows}
                  emptyLabel="Nenhuma ligação nesta semana ainda."
                  onToggleMeeting={toggleMeeting}
                  onRemove={remove}
                  showDate
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </>
  );
}

function PeriodCard({
  title,
  calls,
  meetings,
  highlight,
  footer,
}: {
  title: string;
  calls: number;
  meetings: number;
  highlight?: boolean;
  footer?: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-card px-6 py-5 shadow-card transition-shadow hover:shadow-elegant ${
        highlight ? "border-amber-400/70 ring-1 ring-amber-200" : "border-border"
      }`}
    >
      <div className="text-[10px] font-medium tracking-[0.22em] uppercase text-muted-foreground">
        {title}
      </div>
      <div className="mt-3 flex items-baseline gap-6">
        <div>
          <div className="font-display text-4xl tracking-tight text-foreground">{calls}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            ligações
          </div>
        </div>
        <div>
          <div className="font-display text-4xl tracking-tight text-primary">{meetings}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            reuniões
          </div>
        </div>
      </div>
      {footer && <div className="mt-4 text-[11px] text-muted-foreground">{footer}</div>}
    </div>
  );
}

function CallList({
  rows,
  emptyLabel,
  onToggleMeeting,
  onRemove,
  showDate,
}: {
  rows: CallLog[];
  emptyLabel: string;
  onToggleMeeting: (row: CallLog) => void;
  onRemove: (row: CallLog) => void;
  showDate?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <LeadCard
          key={r.id}
          empresa={r.company_name}
          status={r.meeting_scheduled ? "done" : "neutral"}
          statusLabel={r.meeting_scheduled ? "Reunião agendada" : "Ligação"}
          interesse={r.notes ?? undefined}
          metaLine={
            <>
              {showDate ? fmtDateTime(r.called_at) : fmtTime(r.called_at)}
              {r.cnpj ? ` · ${r.cnpj}` : ""}
            </>
          }
          iconLeft={
            <button
              onClick={() => onToggleMeeting(r)}
              title={r.meeting_scheduled ? "Reunião agendada" : "Marcar reunião agendada"}
              className={`rounded-full p-1 transition-colors ${
                r.meeting_scheduled
                  ? "text-primary"
                  : "text-muted-foreground/40 hover:text-primary"
              }`}
            >
              <CheckCircle2 className="h-5 w-5" />
            </button>
          }
          extra={
            r.meeting_scheduled && r.meeting_at ? (
              <div className="flex items-center gap-2">
                <span className="truncate text-[11px] font-medium text-primary">
                  Reunião: {fmtDateTime(r.meeting_at)}
                </span>
                <a
                  href={buildGoogleCalendarUrl(r)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
                  title="Abrir Google Calendar já preenchido — revise e envie o convite"
                >
                  <CalendarPlus className="h-3 w-3" />
                  Google Calendar
                </a>
              </div>
            ) : null
          }
          onDelete={() => onRemove(r)}
        />
      ))}
    </div>
  );
}

function paceStyle(state: "ok" | "behind" | "warn" | "off") {
  if (state === "behind") return "border-red-300 bg-red-50 text-red-900";
  if (state === "warn") return "border-amber-300 bg-amber-50 text-amber-900";
  if (state === "off") return "border-border bg-muted text-muted-foreground";
  return "border-emerald-300 bg-emerald-50 text-emerald-900";
}

function computePace(callsToday: number, now: Date) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const remaining = Math.max(0, MIN_CALLS_PER_DAY - callsToday);
  const fmtRange = `${DAY_START_HOUR}h–${DAY_END_HOUR}h`;

  if (hour < DAY_START_HOUR) {
    return {
      state: "off" as const,
      title: `Expediente começa às ${DAY_START_HOUR}h`,
      detail: `Meta do dia: ${MIN_CALLS_PER_DAY} ligações (${fmtRange}).`,
    };
  }
  if (hour >= DAY_END_HOUR) {
    if (callsToday >= MIN_CALLS_PER_DAY) {
      return {
        state: "ok" as const,
        title: `Meta batida! ${callsToday}/${MIN_CALLS_PER_DAY} ligações hoje.`,
        detail: "Bom trabalho — expediente encerrado.",
      };
    }
    return {
      state: "behind" as const,
      title: `Expediente encerrado — ${callsToday}/${MIN_CALLS_PER_DAY} ligações.`,
      detail: `Faltaram ${remaining} ligações para bater a meta do dia.`,
    };
  }

  // Dentro do expediente
  const totalMin = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const elapsedMin = (hour - DAY_START_HOUR) * 60;
  const expected = Math.round((elapsedMin / totalMin) * MIN_CALLS_PER_DAY);
  const remainingMin = totalMin - elapsedMin;
  const remainingHours = remainingMin / 60;
  const perHourNeeded = remainingHours > 0 ? remaining / remainingHours : remaining;

  if (callsToday >= MIN_CALLS_PER_DAY) {
    return {
      state: "ok" as const,
      title: `Meta batida! ${callsToday}/${MIN_CALLS_PER_DAY} ligações.`,
      detail: `Ainda dá pra somar mais até às ${DAY_END_HOUR}h.`,
    };
  }
  if (callsToday >= expected) {
    return {
      state: "ok" as const,
      title: `No ritmo: ${callsToday}/${MIN_CALLS_PER_DAY} ligações.`,
      detail: `Faltam ${remaining} em ~${remainingHours.toFixed(1)}h (${perHourNeeded.toFixed(1)}/h).`,
    };
  }
  if (expected - callsToday >= 10) {
    return {
      state: "behind" as const,
      title: `Atrasado: ${callsToday}/${MIN_CALLS_PER_DAY} ligações.`,
      detail: `Talvez não dê para bater as ${MIN_CALLS_PER_DAY} hoje — precisa fazer ${perHourNeeded.toFixed(1)} ligações/hora até às ${DAY_END_HOUR}h.`,
    };
  }
  return {
    state: "warn" as const,
    title: `Ligeiramente atrasado: ${callsToday}/${MIN_CALLS_PER_DAY}.`,
    detail: `Faça ${perHourNeeded.toFixed(1)} ligações/hora nas próximas ${remainingHours.toFixed(1)}h para bater a meta.`,
  };
}

function computeStats(logs: CallLog[], now: Date) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  // ISO week: começa na segunda
  const weekStart = new Date(dayStart);
  const dow = (weekStart.getDay() + 6) % 7; // 0 = segunda
  weekStart.setDate(weekStart.getDate() - dow);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const inRange = (row: CallLog, from: Date) =>
    new Date(row.called_at).getTime() >= from.getTime();

  const todayRows = logs.filter((r) => inRange(r, dayStart));
  const weekRows = logs.filter((r) => inRange(r, weekStart));
  const monthRows = logs.filter((r) => inRange(r, monthStart));

  const count = (rows: CallLog[]) => ({
    calls: rows.length,
    meetings: rows.filter((r) => r.meeting_scheduled).length,
    rows,
  });

  return {
    today: { ...count(todayRows), from: dayStart },
    week: { ...count(weekRows), from: weekStart },
    month: { ...count(monthRows), from: monthStart },
  };
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
// Formato exigido pelo Google Calendar (UTC): YYYYMMDDTHHMMSSZ
function toGCalUtc(d: Date) {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}
// Dr. Bruno é sempre convidado primeiro. O segundo convidado (opcional)
// é o e-mail que a IA extraiu da conversa.
const DR_BRUNO_EMAIL = "brunomorais@brunohenriquemorais.adv.br";

function buildGoogleCalendarUrl(row: CallLog) {
  const start = new Date(row.meeting_at!);
  const end = new Date(start.getTime() + 15 * 60 * 1000); // 15 minutos
  const title = `REUNIÃO | BHM ADVOGADOS - ${row.company_name.toUpperCase()}`;
  const details = [
    row.cnpj ? `CNPJ: ${row.cnpj}` : null,
    row.meeting_email ? `Contato: ${row.meeting_email}` : null,
    row.notes ? `\nObservações:\n${row.notes}` : null,
    `\nAgendada automaticamente pela Central de Prospecção.`,
  ]
    .filter(Boolean)
    .join("\n");
  const guests = [DR_BRUNO_EMAIL, row.meeting_email].filter(Boolean) as string[];
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toGCalUtc(start)}/${toGCalUtc(end)}`,
    details,
  });
  guests.forEach((g) => params.append("add", g));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}


