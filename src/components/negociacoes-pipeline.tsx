import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Handshake,
  RefreshCcw,
  Loader2,
  CalendarClock,
  Trophy,
  XCircle,
  ArrowRight,
  Pencil,
  Trash2,
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
import {
  listFollowUps,
  updateFollowUp,
  deleteFollowUp,
  type FollowUp,
} from "@/lib/follow-ups.functions";
import { getConsultor, getSessionConsultor } from "@/lib/historico-store";

function consultorSlug(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

export type NegStage =
  | "aguardando_calculo"
  | "proposta_enviada"
  | "aguardando_decisao"
  | "fechada"
  | "perdida";

const STAGE_LABEL: Record<NegStage, string> = {
  aguardando_calculo: "📊 Apresentação de Cálculos",
  proposta_enviada: "⏳ Follow-up de Fechamento",
  aguardando_decisao: "🤝 Negociação Final",
  fechada: "🏆 Contrato Fechado",
  perdida: "❌ Perdida",
};

const ACTIVE_STAGES: NegStage[] = [
  "aguardando_calculo",
  "proposta_enviada",
  "aguardando_decisao",
];

const STAGE_TONE: Record<NegStage, string> = {
  aguardando_calculo: "border-amber-200 bg-amber-50/60",
  proposta_enviada: "border-blue-200 bg-blue-50/60",
  aguardando_decisao: "border-violet-200 bg-violet-50/60",
  fechada: "border-emerald-300 bg-emerald-50/60",
  perdida: "border-red-200 bg-red-50/60 opacity-80",
};

const STAGE_HEADER: Record<NegStage, string> = {
  aguardando_calculo: "text-amber-700",
  proposta_enviada: "text-blue-700",
  aguardando_decisao: "text-violet-700",
  fechada: "text-emerald-700",
  perdida: "text-red-600",
};

const STAGE_MARKER_RE = /^\[STAGE:([a-z_]+)\]\s*/i;

export function parseStage(notes: string | null): {
  stage: NegStage;
  clean: string;
} {
  const raw = (notes ?? "").trim();
  const m = raw.match(STAGE_MARKER_RE);
  if (m && (STAGE_LABEL as Record<string, string>)[m[1]]) {
    return { stage: m[1] as NegStage, clean: raw.replace(STAGE_MARKER_RE, "").trim() };
  }
  return { stage: "aguardando_calculo", clean: raw };
}

export function buildNotesWithStage(stage: NegStage, clean: string): string {
  const body = (clean ?? "").trim();
  return body ? `[STAGE:${stage}]\n${body}` : `[STAGE:${stage}]`;
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function toLocalInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NegociacoesPipeline() {
  const [rows, setRows] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const runList = useServerFn(listFollowUps);
  const runUpdate = useServerFn(updateFollowUp);
  const runDelete = useServerFn(deleteFollowUp);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 180);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setDate(to.getDate() + 180);
      const list = await runList({
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          limit: 500,
          consultor: consultorSlug(),
        },
      });
      setRows(list.filter((f) => f.action_type === "negociacao"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar negociações");
    } finally {
      setLoading(false);
    }
  }, [runList]);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener("bhm:negociacao-updated", on);
    window.addEventListener("bhm:session-changed", on);
    return () => {
      window.removeEventListener("bhm:negociacao-updated", on);
      window.removeEventListener("bhm:session-changed", on);
    };
  }, [refresh]);

  const bucketed = useMemo(() => {
    const map: Record<NegStage, FollowUp[]> = {
      aguardando_calculo: [],
      proposta_enviada: [],
      aguardando_decisao: [],
      fechada: [],
      perdida: [],
    };
    for (const r of rows) {
      let stage: NegStage;
      if (r.status === "done") stage = "fechada";
      else if (r.status === "cancelled") stage = "perdida";
      else stage = parseStage(r.notes).stage;
      map[stage].push(r);
    }
    const asc = (a: FollowUp, b: FollowUp) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    for (const k of Object.keys(map) as NegStage[]) map[k].sort(asc);
    return map;
  }, [rows]);

  const totalAtivas =
    bucketed.aguardando_calculo.length +
    bucketed.proposta_enviada.length +
    bucketed.aguardando_decisao.length;

  async function setStage(row: FollowUp, next: NegStage) {
    try {
      const { clean } = parseStage(row.notes);
      const newNotes = buildNotesWithStage(
        next === "fechada" || next === "perdida" ? parseStage(row.notes).stage : next,
        clean,
      );
      const status =
        next === "fechada" ? "done" : next === "perdida" ? "cancelled" : "pending";
      const updated = await runUpdate({
        data: {
          id: row.id,
          notes: newNotes,
          status,
          consultor: consultorSlug(),
        },
      });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      toast.success(`Movida para "${STAGE_LABEL[next]}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao mover");
    }
  }

  async function reopen(row: FollowUp) {
    try {
      const updated = await runUpdate({
        data: { id: row.id, status: "pending", consultor: consultorSlug() },
      });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      toast.success("Negociação reaberta");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reabrir");
    }
  }

  async function remove(row: FollowUp) {
    if (!confirm(`Remover negociação de "${row.company_name}"?`)) return;
    try {
      await runDelete({ data: { id: row.id, consultor: consultorSlug() } });
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast.success("Removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    }
  }

  async function saveEdit(patch: {
    id: string;
    scheduledAt: string;
    stage: NegStage;
    clean: string;
    row: FollowUp;
  }) {
    try {
      const notes = buildNotesWithStage(patch.stage, patch.clean);
      const status =
        patch.stage === "fechada" ? "done" : patch.stage === "perdida" ? "cancelled" : "pending";
      const updated = await runUpdate({
        data: {
          id: patch.id,
          scheduledAt: patch.scheduledAt,
          notes,
          status,
          consultor: consultorSlug(),
        },
      });
      setRows((rs) => rs.map((r) => (r.id === patch.id ? { ...r, ...updated } : r)));
      toast.success("Negociação atualizada");
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Handshake className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">
            Pipeline de Negociação{" "}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({totalAtivas} ativas)
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowClosed((s) => !s)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            title="Alternar visibilidade das negociações encerradas"
          >
            {showClosed ? "Ocultar encerradas" : `Ver encerradas (${bucketed.fechada.length + bucketed.perdida.length})`}
          </button>
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

      {totalAtivas === 0 && !showClosed ? (
        <p className="text-xs text-muted-foreground/70">
          Nenhuma negociação em andamento. Marque uma reunião como realizada e clique em
          <span className="mx-1 font-medium text-foreground">→ Negociação</span>
          para começar a acompanhar aqui.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {ACTIVE_STAGES.map((s) => (
            <StageColumn
              key={s}
              stage={s}
              rows={bucketed[s]}
              onSetStage={setStage}
              onEdit={setEditing}
              onRemove={remove}
            />
          ))}
        </div>
      )}

      {showClosed && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ClosedColumn
            stage="fechada"
            rows={bucketed.fechada}
            onReopen={reopen}
            onRemove={remove}
          />
          <ClosedColumn
            stage="perdida"
            rows={bucketed.perdida}
            onReopen={reopen}
            onRemove={remove}
          />
        </div>
      )}

      <EditNegDialog row={editing} onClose={() => setEditing(null)} onSave={saveEdit} />
    </div>
  );
}

function StageColumn({
  stage,
  rows,
  onSetStage,
  onEdit,
  onRemove,
}: {
  stage: NegStage;
  rows: FollowUp[];
  onSetStage: (r: FollowUp, next: NegStage) => void;
  onEdit: (r: FollowUp) => void;
  onRemove: (r: FollowUp) => void;
}) {
  const idx = ACTIVE_STAGES.indexOf(stage);
  const nextStage = idx >= 0 && idx < ACTIVE_STAGES.length - 1 ? ACTIVE_STAGES[idx + 1] : null;
  const prevStage = idx > 0 ? ACTIVE_STAGES[idx - 1] : null;
  return (
    <div className={`rounded-xl border p-2 ${STAGE_TONE[stage]}`}>
      <div className={`mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide ${STAGE_HEADER[stage]}`}>
        <span>{STAGE_LABEL[stage]}</span>
        <span className="text-[10px] font-normal text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">—</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <NegCard
              key={r.id}
              row={r}
              stage={stage}
              nextStage={nextStage}
              prevStage={prevStage}
              onSetStage={onSetStage}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClosedColumn({
  stage,
  rows,
  onReopen,
  onRemove,
}: {
  stage: NegStage;
  rows: FollowUp[];
  onReopen: (r: FollowUp) => void;
  onRemove: (r: FollowUp) => void;
}) {
  return (
    <div className={`rounded-xl border p-2 ${STAGE_TONE[stage]}`}>
      <div className={`mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide ${STAGE_HEADER[stage]}`}>
        <span>{stage === "fechada" ? "🏆 Fechadas" : "❌ Perdidas"}</span>
        <span className="text-[10px] font-normal text-muted-foreground">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">—</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const { clean } = parseStage(r.notes);
            return (
              <li key={r.id} className="rounded-lg border border-border bg-white/70 px-2.5 py-2 text-xs">
                <div className="truncate font-medium">{r.company_name}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {r.contact_person ?? "—"}
                </div>
                {clean && (
                  <div className="mt-1 whitespace-pre-wrap text-[10px] text-muted-foreground/90 line-clamp-2">
                    {clean}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1">
                  <button
                    onClick={() => onReopen(r)}
                    className="rounded p-1 text-muted-foreground hover:text-primary"
                    title="Reabrir"
                  >
                    <RefreshCcw className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onRemove(r)}
                    className="rounded p-1 text-muted-foreground hover:text-red-600"
                    title="Remover"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NegCard({
  row,
  stage,
  nextStage,
  prevStage,
  onSetStage,
  onEdit,
  onRemove,
}: {
  row: FollowUp;
  stage: NegStage;
  nextStage: NegStage | null;
  prevStage: NegStage | null;
  onSetStage: (r: FollowUp, next: NegStage) => void;
  onEdit: (r: FollowUp) => void;
  onRemove: (r: FollowUp) => void;
}) {
  const { clean } = parseStage(row.notes);
  const now = Date.now();
  const scheduled = new Date(row.scheduled_at).getTime();
  const overdue = scheduled < now;
  return (
    <li className={`rounded-lg border bg-white/80 px-2.5 py-2 text-xs ${overdue ? "border-red-300" : "border-border"}`}>
      <div className="mb-1">
        <span className={`inline-block rounded-full border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide ${STAGE_TONE[stage]} ${STAGE_HEADER[stage]}`}>
          {STAGE_LABEL[stage]}
        </span>
      </div>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={row.company_name}>
            {row.company_name}
          </div>
          {row.contact_person && (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {row.contact_person}
            </div>
          )}
          <div className={`mt-0.5 text-[10px] ${overdue ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
            <CalendarClock className="mr-0.5 inline h-3 w-3 -translate-y-[1px]" />
            {overdue ? "Atrasado · " : "Retorno · "}
            {fmtDataHora(row.scheduled_at)}
          </div>
        </div>
      </div>
      {clean && (
        <div className="mt-1 whitespace-pre-wrap text-[10px] leading-snug text-muted-foreground/90 line-clamp-3">
          {clean}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {prevStage && (
          <button
            onClick={() => onSetStage(row, prevStage)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
            title={`Voltar para "${STAGE_LABEL[prevStage]}"`}
          >
            ← Voltar
          </button>
        )}
        {nextStage && (
          <button
            onClick={() => onSetStage(row, nextStage)}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
            title={`Mover para "${STAGE_LABEL[nextStage]}"`}
          >
            <ArrowRight className="h-3 w-3" />
            {STAGE_LABEL[nextStage]}
          </button>
        )}
        <button
          onClick={() => onSetStage(row, "fechada")}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
          title="Marcar como fechada"
        >
          <Trophy className="h-3 w-3" />
          Fechada
        </button>
        <button
          onClick={() => onSetStage(row, "perdida")}
          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
          title="Marcar como perdida"
        >
          <XCircle className="h-3 w-3" />
          Perdida
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => onEdit(row)}
            className="rounded p-1 text-muted-foreground hover:text-primary"
            title="Editar retorno / observação / estágio"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => onRemove(row)}
            className="rounded p-1 text-muted-foreground hover:text-red-600"
            title="Remover"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </li>
  );
}

function EditNegDialog({
  row,
  onClose,
  onSave,
}: {
  row: FollowUp | null;
  onClose: () => void;
  onSave: (patch: {
    id: string;
    scheduledAt: string;
    stage: NegStage;
    clean: string;
    row: FollowUp;
  }) => Promise<void> | void;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [stage, setStage] = useState<NegStage>("aguardando_calculo");
  const [clean, setClean] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    const parsed = parseStage(row.notes);
    setStage(
      row.status === "done" ? "fechada" : row.status === "cancelled" ? "perdida" : parsed.stage,
    );
    setClean(parsed.clean);
    setScheduledAt(toLocalInput(row.scheduled_at));
  }, [row]);

  function quickShift(days: number) {
    if (!row) return;
    const base = new Date(row.scheduled_at);
    base.setDate(base.getDate() + days);
    setScheduledAt(toLocalInput(base.toISOString()));
  }

  async function submit() {
    if (!row || !scheduledAt) return;
    setSaving(true);
    try {
      await onSave({
        id: row.id,
        scheduledAt: new Date(scheduledAt).toISOString(),
        stage,
        clean,
        row,
      });
    } finally {
      setSaving(false);
    }
  }

  const open = row !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atualizar negociação</DialogTitle>
          <DialogDescription>
            {row ? row.company_name : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(1)}>+1 dia</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(3)}>+3 dias</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(7)}>+1 semana</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(14)}>+2 semanas</Button>
          </div>
          <div className="grid gap-1.5">
            <Label>Próximo retorno</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Estágio</Label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as NegStage)}
              className="h-9 rounded-md border border-border bg-background px-2 text-[12px]"
            >
              {(Object.keys(STAGE_LABEL) as NegStage[]).map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Observações do avanço</Label>
            <Textarea
              rows={4}
              value={clean}
              onChange={(e) => setClean(e.target.value)}
              placeholder="Ex.: Cálculo enviado por e-mail. Aguardando retorno da diretoria até sexta."
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !scheduledAt}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
