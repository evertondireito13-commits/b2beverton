import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  RefreshCcw,
  RotateCcw,
  X,
  Loader2,
  Plus,
  Handshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listCalls, updateCall, logCall, type CallLog } from "@/lib/call-logs.functions";
import { createFollowUp } from "@/lib/follow-ups.functions";
import { getConsultor, getSessionConsultor } from "@/lib/historico-store";
import { NegociacoesPipeline, buildNotesWithStage } from "@/components/negociacoes-pipeline";
import { PipelineMetricsSection } from "@/components/painel-secoes";


type Outcome = "realizada" | "cancelada";
type TabKey = "agendadas" | "realizadas" | "canceladas" | "negociacao";


function consultorSlug(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

function outcomesKey() {
  return `bhm.reunioes.outcomes::${consultorSlug()}`;
}

function loadOutcomes(): Record<string, Outcome> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(outcomesKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    // migração: "remanejada" volta a ser tratada como agendada
    const clean: Record<string, Outcome> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "realizada" || v === "cancelada") clean[k] = v;
    }
    return clean;
  } catch {
    return {};
  }
}

function saveOutcomes(m: Record<string, Outcome>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(outcomesKey(), JSON.stringify(m));
  } catch {
    /* noop */
  }
}

const DR_BRUNO_EMAIL = "brunomorais@brunohenriquemorais.adv.br";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
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
function buildGoogleCalendarUrl(row: CallLog) {
  const start = new Date(row.meeting_at!);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
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

function fmtDataHora(s: string) {
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CentralReunioes() {
  const [rows, setRows] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>(() =>
    loadOutcomes(),
  );
  const [tab, setTab] = useState<TabKey>("agendadas");
  const [period, setPeriod] = useState<"hoje" | "semana" | "mes" | "todas">("hoje");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [manualOpen, setManualOpen] = useState(false);
  const runList = useServerFn(listCalls);
  const runUpdate = useServerFn(updateCall);
  const runLog = useServerFn(logCall);
  const runCreateFollowUp = useServerFn(createFollowUp);

  async function moveToNegociacao(row: CallLog) {
    // Cria um follow_up de negociação com estágio inicial "aguardando_calculo"
    // e próximo retorno em +3 dias úteis 10:00. Fica invisível para /followup.
    const next = new Date();
    let added = 0;
    while (added < 3) {
      next.setDate(next.getDate() + 1);
      const d = next.getDay();
      if (d !== 0 && d !== 6) added++;
    }
    next.setHours(10, 0, 0, 0);
    const cleanNotes = [
      `Origem: reunião realizada em ${fmtDataHora(row.meeting_at!)}`,
      row.notes ? `\nNotas anteriores:\n${row.notes}` : "",
    ]
      .filter(Boolean)
      .join("");
    try {
      await runCreateFollowUp({
        data: {
          companyName: row.company_name,
          cnpj: row.cnpj || null,
          contactPerson: null,
          actionType: "negociacao",
          scheduledAt: next.toISOString(),
          notes: buildNotesWithStage("aguardando_calculo", cleanNotes),
          consultor: consultorSlug(),
        },
      });
      toast.success("Empresa movida para o pipeline de Negociação");
      window.dispatchEvent(new Event("bhm:negociacao-updated"));
      setTab("negociacao");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao mover para negociação");
    }
  }



  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 180);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setDate(to.getDate() + 90);
      const list = await runList({
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          limit: 300,
          consultor: consultorSlug(),
        },
      });
      setRows(list.filter((r) => r.meeting_scheduled && r.meeting_at));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar reuniões");
    } finally {
      setLoading(false);
    }
  }, [runList]);

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("bhm:historico-updated", onUpdate);
    window.addEventListener("bhm:session-changed", onUpdate);
    return () => {
      window.removeEventListener("bhm:historico-updated", onUpdate);
      window.removeEventListener("bhm:session-changed", onUpdate);
    };
  }, [refresh]);

  const { agendadas, realizadas, canceladas } = useMemo(() => {
    const agendadas: CallLog[] = [];
    const realizadas: CallLog[] = [];
    const canceladas: CallLog[] = [];
    for (const r of rows) {
      const o = outcomes[r.id];
      if (o === "realizada") realizadas.push(r);
      else if (o === "cancelada") canceladas.push(r);
      else agendadas.push(r);
    }
    const asc = (a: CallLog, b: CallLog) =>
      new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime();
    const desc = (a: CallLog, b: CallLog) =>
      new Date(b.meeting_at!).getTime() - new Date(a.meeting_at!).getTime();
    agendadas.sort(asc);
    realizadas.sort(desc);
    canceladas.sort(desc);
    return { agendadas, realizadas, canceladas };
  }, [rows, outcomes]);

  function setOutcome(id: string, o: Outcome | null) {
    setOutcomes((prev) => {
      const next = { ...prev };
      if (o === null) delete next[id];
      else next[id] = o;
      saveOutcomes(next);
      return next;
    });
    if (o === "realizada") toast.success("Reunião marcada como realizada");
    if (o === "cancelada") toast.message("Reunião cancelada");
  }

  function startRemanejar(row: CallLog) {
    setEditingId(row.id);
    setEditingValue(toLocalDatetimeInput(row.meeting_at!));
  }

  async function confirmRemanejar(row: CallLog) {
    if (!editingValue) {
      setEditingId(null);
      return;
    }
    const iso = new Date(editingValue).toISOString();
    try {
      await runUpdate({
        data: {
          id: row.id,
          meetingAt: iso,
          consultor: consultorSlug(),
        },
      });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, meeting_at: iso } : r)));
      toast.success("Reunião remanejada");
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remanejar");
    }
  }

  async function createManualMeeting(input: ManualMeetingInput) {
    const meetingAtIso = new Date(input.meetingAt).toISOString();
    const notesParts: string[] = [];
    if (input.contact) notesParts.push(`Contato: ${input.contact}${input.role ? ` (${input.role})` : ""}`);
    if (input.phone) notesParts.push(`Telefone: ${input.phone}`);
    if (input.link) notesParts.push(`Link/Local: ${input.link}`);
    if (input.origin) notesParts.push(`Origem: ${input.origin}`);
    if (input.notes) notesParts.push(input.notes);
    const notes = notesParts.join("\n") || null;
    try {
      await runLog({
        data: {
          companyName: input.company,
          cnpj: input.cnpj || null,
          meetingScheduled: true,
          meetingAt: meetingAtIso,
          meetingEmail: input.email || null,
          notes,
          consultor: consultorSlug(),
        },
      });
      toast.success("Reunião cadastrada");
      setManualOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cadastrar reunião");
      throw err;
    }
  }

  const rawList =
    tab === "agendadas" ? agendadas : tab === "realizadas" ? realizadas : canceladas;

  const periodCounts = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday); endToday.setDate(endToday.getDate() + 1);
    const startWeek = new Date(startToday);
    const dow = (startWeek.getDay() + 6) % 7; // segunda como início
    startWeek.setDate(startWeek.getDate() - dow);
    const endWeek = new Date(startWeek); endWeek.setDate(endWeek.getDate() + 7);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    let hoje = 0, semana = 0, mes = 0;
    for (const r of realizadas) {
      const d = new Date(r.meeting_at!);
      if (d >= startToday && d < endToday) hoje++;
      if (d >= startWeek && d < endWeek) semana++;
      if (d >= startMonth && d < endMonth) mes++;
    }
    return { hoje, semana, mes, todas: realizadas.length, ranges: { startToday, endToday, startWeek, endWeek, startMonth, endMonth } };
  }, [realizadas]);

  const list = useMemo(() => {
    if (tab !== "realizadas" || period === "todas") return rawList;
    const { startToday, endToday, startWeek, endWeek, startMonth, endMonth } = periodCounts.ranges;
    return rawList.filter((r) => {
      const d = new Date(r.meeting_at!);
      if (period === "hoje") return d >= startToday && d < endToday;
      if (period === "semana") return d >= startWeek && d < endWeek;
      return d >= startMonth && d < endMonth;
    });
  }, [rawList, tab, period, periodCounts]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">Central de Reuniões</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={() => setManualOpen(true)}
            className="h-7 gap-1 bg-navy-deep text-white hover:bg-navy-deep/90"
            title="Cadastrar reunião avulsa (WhatsApp, indicação, etc.)"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold">Nova Reunião</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={refresh}
            disabled={loading}
            title="Atualizar"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>


      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1 sm:grid-cols-4">
        <TabBtn active={tab === "agendadas"} onClick={() => setTab("agendadas")}>
          📅 {agendadas.length}
        </TabBtn>
        <TabBtn
          active={tab === "realizadas"}
          onClick={() => setTab("realizadas")}
          tone="emerald"
        >
          ✔️ {realizadas.length}
        </TabBtn>
        <TabBtn
          active={tab === "negociacao"}
          onClick={() => setTab("negociacao")}
          tone="blue"
        >
          🤝 Negociação
        </TabBtn>
        <TabBtn
          active={tab === "canceladas"}
          onClick={() => setTab("canceladas")}
          tone="red"
        >
          ❌ {canceladas.length}
        </TabBtn>
      </div>


      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {tab === "agendadas"
          ? "Agendadas"
          : tab === "realizadas"
            ? "Realizadas"
            : "Canceladas"}
      </div>

      {tab === "negociacao" ? (
        <div className="space-y-4">
          <PipelineMetricsSection />
          <NegociacoesPipeline />
        </div>
      ) : (
        <>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {tab === "agendadas"
              ? "Agendadas"
              : tab === "realizadas"
                ? "Realizadas"
                : "Canceladas"}
          </div>

          {tab === "realizadas" && (
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-emerald-50/60 p-1 sm:grid-cols-4">
              <TabBtn active={period === "hoje"} onClick={() => setPeriod("hoje")} tone="emerald">
                Hoje ({periodCounts.hoje})
              </TabBtn>
              <TabBtn active={period === "semana"} onClick={() => setPeriod("semana")} tone="emerald">
                Semana ({periodCounts.semana})
              </TabBtn>
              <TabBtn active={period === "mes"} onClick={() => setPeriod("mes")} tone="emerald">
                Mês ({periodCounts.mes})
              </TabBtn>
              <TabBtn active={period === "todas"} onClick={() => setPeriod("todas")} tone="emerald">
                Todas ({periodCounts.todas})
              </TabBtn>
            </div>
          )}


          {list.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">Nenhuma reunião.</p>
          ) : (
            <ul className="space-y-1.5">
              {list.map((r) => (
                <ReuniaoCard
                  key={r.id}
                  row={r}
                  tab={tab}
                  onOutcome={setOutcome}
                  onStartRemanejar={startRemanejar}
                  onConfirmRemanejar={confirmRemanejar}
                  editing={editingId === r.id}
                  editingValue={editingValue}
                  onEditingValueChange={setEditingValue}
                  onCancelEdit={() => setEditingId(null)}
                  onMoveToNegociacao={moveToNegociacao}
                />
              ))}
            </ul>
          )}
        </>
      )}


      {Object.keys(outcomes).length > 0 && tab !== "agendadas" && (
        <button
          onClick={() => {
            saveOutcomes({});
            setOutcomes({});
          }}
          className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Restaurar todas para Agendadas
        </button>
      )}

      <ManualMeetingDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={createManualMeeting}
      />
    </div>
  );
}

type ManualMeetingInput = {
  company: string;
  cnpj: string;
  contact: string;
  role: string;
  phone: string;
  email: string;
  meetingAt: string; // datetime-local
  link: string;
  origin: string;
  notes: string;
};

function ManualMeetingDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ManualMeetingInput) => Promise<void>;
}) {
  const empty: ManualMeetingInput = {
    company: "",
    cnpj: "",
    contact: "",
    role: "",
    phone: "",
    email: "",
    meetingAt: "",
    link: "",
    origin: "",
    notes: "",
  };
  const [form, setForm] = useState<ManualMeetingInput>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // Data padrão: amanhã 10:00
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      const dl = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setForm({ ...empty, meetingAt: dl });
    }
  }, [open]);

  function upd<K extends keyof ManualMeetingInput>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.company.trim()) {
      toast.error("Informe o nome da empresa");
      return;
    }
    if (!form.meetingAt) {
      toast.error("Informe data e horário da reunião");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        company: form.company.trim(),
        cnpj: form.cnpj.trim(),
        contact: form.contact.trim(),
        role: form.role.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        link: form.link.trim(),
        origin: form.origin.trim(),
        notes: form.notes.trim(),
      });
    } catch {
      /* toast já exibido */
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar reunião avulsa</DialogTitle>
          <DialogDescription>
            Registre uma reunião vinda de WhatsApp, indicação ou abordagem externa —
            sem precisar passar pelo fluxo de ligação.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MField label="Empresa *" value={form.company} onChange={(v) => upd("company", v)} />
            <MField label="CNPJ" value={form.cnpj} onChange={(v) => upd("cnpj", v)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MField label="Contato" value={form.contact} onChange={(v) => upd("contact", v)} />
            <MField label="Cargo" value={form.role} onChange={(v) => upd("role", v)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MField label="Telefone" value={form.phone} onChange={(v) => upd("phone", v)} />
            <MField label="E-mail" value={form.email} onChange={(v) => upd("email", v)} type="email" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[11px]">Data e horário *</Label>
            <Input
              type="datetime-local"
              value={form.meetingAt}
              onChange={(e) => upd("meetingAt", e.target.value)}
              className="h-9 text-[12px]"
            />
          </div>
          <MField label="Link da chamada / Local" value={form.link} onChange={(v) => upd("link", v)} />
          <MField
            label='Origem (ex: "WhatsApp", "Indicação")'
            value={form.origin}
            onChange={(v) => upd("origin", v)}
          />
          <div className="grid gap-1.5">
            <Label className="text-[11px]">Observações</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => upd("notes", e.target.value)}
              className="text-[11px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={saving}
            className="bg-navy-deep text-white hover:bg-navy-deep/90"
          >
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="mr-1 h-4 w-4" />
            )}
            Cadastrar reunião
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MField({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[11px]">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type ?? "text"}
        className="h-9 text-[12px]"
      />
    </div>
  );
}


function TabBtn({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "emerald" | "red" | "blue";
}) {
  const activeClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "red"
        ? "bg-red-100 text-red-800"
        : tone === "blue"
          ? "bg-blue-100 text-blue-800"
          : "bg-background text-foreground shadow-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md py-1 text-[10px] font-medium transition-colors ${
        active ? activeClass : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ReuniaoCard({
  row,
  tab,
  onOutcome,
  onStartRemanejar,
  onConfirmRemanejar,
  editing,
  editingValue,
  onEditingValueChange,
  onCancelEdit,
  onMoveToNegociacao,
}: {
  row: CallLog;
  tab: TabKey;
  onOutcome: (id: string, o: Outcome | null) => void;
  onStartRemanejar: (row: CallLog) => void;
  onConfirmRemanejar: (row: CallLog) => void;
  editing: boolean;
  editingValue: string;
  onEditingValueChange: (v: string) => void;
  onCancelEdit: () => void;
  onMoveToNegociacao?: (row: CallLog) => void;
}) {
  const gcalUrl = buildGoogleCalendarUrl(row);
  const cardTone =
    tab === "realizadas"
      ? "border-emerald-300/60 bg-emerald-50/60"
      : tab === "canceladas"
        ? "border-red-200/70 bg-red-50/40 opacity-80"
        : "border-border bg-background/60";
  return (
    <li className={`rounded-lg border px-2.5 py-2 text-xs ${cardTone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-medium ${tab === "canceladas" ? "text-muted-foreground line-through" : "text-foreground"}`}
            title={row.company_name}
          >
            {row.company_name}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {fmtDataHora(row.meeting_at!)}
          </div>
        </div>
        <a
          href={gcalUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir no Google Calendar"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <CalendarPlus className="h-3 w-3" />
          Agenda
        </a>
      </div>

      {tab === "agendadas" && (
        <>
          {editing ? (
            <div className="mt-2 flex items-center gap-1">
              <Input
                type="datetime-local"
                value={editingValue}
                onChange={(e) => onEditingValueChange(e.target.value)}
                className="h-7 text-[11px]"
              />
              <Button
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={() => onConfirmRemanejar(row)}
              >
                OK
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px]"
                onClick={onCancelEdit}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1">
              <ActionBtn
                title="Realizada"
                className="text-emerald-600 hover:bg-emerald-50"
                onClick={() => onOutcome(row.id, "realizada")}
              >
                <Check className="h-3.5 w-3.5" />
              </ActionBtn>
              <ActionBtn
                title="Cancelada"
                className="text-red-600 hover:bg-red-50"
                onClick={() => onOutcome(row.id, "cancelada")}
              >
                <X className="h-3.5 w-3.5" />
              </ActionBtn>
              <ActionBtn
                title="Remanejar data/hora"
                className="text-amber-600 hover:bg-amber-50"
                onClick={() => onStartRemanejar(row)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </ActionBtn>
            </div>
          )}
        </>
      )}

      {tab === "realizadas" && onMoveToNegociacao && (
        <div className="mt-2 flex items-center gap-1">
          <button
            onClick={() => onMoveToNegociacao(row)}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
            title="Iniciar acompanhamento pós-reunião (cálculo, proposta, decisão)"
          >
            <Handshake className="h-3 w-3" />
            → Negociação
          </button>
        </div>
      )}

      {tab !== "agendadas" && (
        <div className="mt-2">
          <button
            onClick={() => onOutcome(row.id, null)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
            title="Voltar para Agendadas"
          >
            ↩ Voltar para Agendadas
          </button>
        </div>
      )}
    </li>
  );
}

function ActionBtn({
  children,
  onClick,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent transition-colors ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
