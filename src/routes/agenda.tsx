// Agenda em formato calendário — reuniões da Central + follow-ups locais.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./index";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listLeads, isLeadIsolated, LEAD_STATUS_LABEL, type Lead } from "@/lib/leads-store";
import { HistoricoEmpresaSheet } from "@/components/prospeccao/historico-empresa-sheet";
import { proximosFollowUps, historicoMatchesEmpresa, type FollowUpLocal } from "@/lib/historico-store";
import { getPendingMirroredFollowUps } from "@/lib/followup-bridge";
import { useFollowUpMirror } from "@/lib/use-followup-mirror";
import type { FollowUp } from "@/lib/follow-ups.functions";
import { setActiveLead } from "@/lib/daily-activities";
import { FollowUpList, EditFollowUpDialog, RescheduleDialog } from "@/components/followup/follow-up-list";
import { useFollowUpActions } from "@/components/followup/use-follow-up-actions";
import { CompanySheet, type CompanyTarget } from "@/components/company-timeline-sheet";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda — Calendário de Prospecção BHM" },
      {
        name: "description",
        content:
          "Calendário mensal com reuniões da Central, follow-ups do dia e compromissos vencidos em uma visão só.",
      },
      { property: "og:title", content: "Agenda — Calendário de Prospecção BHM" },
      {
        property: "og:description",
        content: "Veja reuniões e retornos por dia, semana e mês em formato calendário.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});

type Evento = {
  id: string;
  tipo: "reuniao" | "followup";
  empresa: string;
  cnpj?: string | null;
  quando: string; // ISO
  detalhe: string;
  contato?: string | null;
  acao?: string | null;
  notas?: string | null;
};

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const ACAO_LABEL: Record<string, string> = {
  call: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  meeting: "Reunião",
  negociacao: "Negociação",
  other: "Outro",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildEventos(leads: Lead[], fups: FollowUpLocal[], remotos: FollowUp[]): Evento[] {
  const out: Evento[] = [];
  for (const l of leads) {
    if (l.status === "perdido" || l.status === "nao_qualificado") continue;
    out.push({
      id: `lead-${l.id}`,
      tipo: "reuniao",
      empresa: l.empresa,
      cnpj: l.cnpj,
      quando: l.data_reuniao,
      detalhe: LEAD_STATUS_LABEL[l.status],
    });
  }
  // Fonte principal dos retornos: a tabela de follow-ups (mesma que /followup).
  for (const f of remotos) {
    if (isLeadIsolated(f.company_name, f.cnpj)) continue;
    out.push({
      id: `rfup-${f.id}`,
      tipo: "followup",
      empresa: f.company_name,
      cnpj: f.cnpj,
      quando: f.scheduled_at,
      detalhe: f.notes?.split("\n")[0] || "Retorno agendado",
      contato: f.contact_person,
      acao: ACAO_LABEL[f.action_type] ?? f.action_type,
      notas: f.notes,
    });
  }
  // Complemento: retornos que só existem no histórico (sem card na tabela).
  for (const f of fups) {
    if (isLeadIsolated(f.empresaNome, f.cnpj)) continue;
    const jaTem = remotos.some((r) =>
      historicoMatchesEmpresa(
        { empresaNome: r.company_name, cnpj: r.cnpj },
        { empresaNome: f.empresaNome, cnpj: f.cnpj },
      ),
    );
    if (jaTem) continue;

    out.push({
      id: `fup-${f.id}`,
      tipo: "followup",
      empresa: f.empresaNome,
      cnpj: f.cnpj,
      quando: f.dataIso,
      detalhe: f.proximaAcao || "Retorno agendado",
      notas: f.proximaAcao,
    });
  }
  return out;
}

function AgendaPage() {
  return (
    <AppShell current="agenda">
      <AgendaCalendar />
    </AppShell>
  );
}

export function AgendaCalendar({ embedded = false }: { embedded?: boolean }) {
  const [hydrated, setHydrated] = useState(false);
  const [ref, setRef] = useState(() => new Date());
  const [selecionado, setSelecionado] = useState<string>(() => ymd(new Date()));
  const [tick, setTick] = useState(0);
  const mirrorVersion = useFollowUpMirror();
  
  const [overrides, setOverrides] = useState<Record<string, Partial<FollowUp>>>({});
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [companyTarget, setCompanyTarget] = useState<CompanyTarget>(null);

  const actions = useFollowUpActions({
    applyPatch: (id, patch) => setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } })),
    applyRemove: (id) => setRemovidos((r) => [...r, id]),
  });

  const [detalheAberto, setDetalheAberto] = useState(false);

  const selecionarDia = (k: string) => {
    setSelecionado(k);
    setDetalheAberto(true);
  };

  useEffect(() => {
    setHydrated(true);
    const bump = () => setTick((n) => n + 1);
    const evts = [
      "bhm:leads-updated",
      "bhm:historico-updated",
      "bhm:followups-updated",
      "bhm:session-changed",
      "storage",
    ];
    evts.forEach((e) => window.addEventListener(e, bump));
    return () => evts.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  const remotos = useMemo(() => {
    if (!hydrated) return [] as FollowUp[];
    void tick;
    void mirrorVersion;
    return getPendingMirroredFollowUps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tick, mirrorVersion]);

  const eventos = useMemo(() => {
    if (!hydrated) return [];
    void tick;
    void mirrorVersion;
    return buildEventos(listLeads(), proximosFollowUps(120), remotos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tick, mirrorVersion, remotos]);

  const porDia = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const e of eventos) {
      const d = new Date(e.quando);
      if (!Number.isFinite(d.getTime())) continue;
      const k = ymd(d);
      const arr = map.get(k);
      if (arr) arr.push(e);
      else map.set(k, [e]);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.quando.localeCompare(b.quando));
    return map;
  }, [eventos]);

  const grade = useMemo(() => {
    const primeiro = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const inicio = new Date(primeiro);
    inicio.setDate(inicio.getDate() - ((primeiro.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [ref]);

  const hojeKey = ymd(new Date());
  const doDia = porDia.get(selecionado) ?? [];
  // Compromissos "simples" (reuniões da Central e retornos que só existem no histórico).
  const doDiaSimples = doDia.filter((e) => !e.id.startsWith("rfup-"));
  // Follow-ups reais do dia: renderizados com o MESMO card da fila de Follow-up.
  const followUpsDoDia = useMemo(
    () =>
      remotos
        .filter((r) => !removidos.includes(r.id))
        .map((r) => ({ ...r, ...(overrides[r.id] ?? {}) }))
        .filter((r) => !isLeadIsolated(r.company_name, r.cnpj))
        .filter((r) => {
          const d = new Date(r.scheduled_at);
          return Number.isFinite(d.getTime()) && ymd(d) === selecionado;
        })
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [remotos, overrides, removidos, selecionado],
  );

  return (
    <>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-card">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-navy-deep">
              {embedded ? "Agenda de compromissos" : "Agenda"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Reuniões da Central e follow-ups no mesmo calendário. Clique num dia para ver os
              compromissos.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-1.5 sm:ml-auto sm:w-auto sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))}
            >
              ←
            </Button>
            <span className="min-w-0 flex-1 text-center text-sm font-semibold capitalize text-navy-deep sm:min-w-[150px] sm:flex-none">
              {ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </span>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))}
            >
              →
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRef(new Date());
                setSelecionado(hojeKey);
              }}
            >
              Hoje
            </Button>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-3 shadow-card">
          <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
            {DIAS_SEMANA.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grade.map((d) => {
              const k = ymd(d);
              const list = porDia.get(k) ?? [];
              const foraDoMes = d.getMonth() !== ref.getMonth();
              const reunioes = list.filter((e) => e.tipo === "reuniao").length;
              const fups = list.length - reunioes;
              const vencido = list.some((e) => new Date(e.quando) < new Date() && k < hojeKey);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => selecionarDia(k)}
                  className={`min-h-[72px] rounded-lg border p-1.5 text-left transition ${
                    selecionado === k
                      ? "border-primary bg-primary/10"
                      : k === hojeKey
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/70 bg-background hover:border-primary/40"
                  } ${foraDoMes ? "opacity-40" : ""}`}
                >
                  <span className="text-[11px] font-semibold text-navy-deep">{d.getDate()}</span>
                  <div className="mt-1 space-y-0.5">
                    {reunioes > 0 && (
                      <span className="block rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-800">
                        📅 {reunioes}
                      </span>
                    )}
                    {fups > 0 && (
                      <span
                        className={`block rounded px-1 text-[10px] font-semibold ${
                          vencido ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        📞 {fups}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

      </div>

      <Dialog open={detalheAberto} onOpenChange={setDetalheAberto}>
        <DialogContent className="w-[92vw] max-w-lg overflow-x-hidden overflow-y-auto [&>*]:min-w-0 max-h-[80vh] break-words">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base capitalize">
              {new Date(`${selecionado}T12:00:00`).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
              <Badge variant="outline">{doDia.length}</Badge>
            </DialogTitle>
            <DialogDescription>Compromissos deste dia.</DialogDescription>
          </DialogHeader>

          {followUpsDoDia.length > 0 ? (
            <div className="mb-3 min-w-0 max-w-full">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                📞 Follow-ups do dia
              </p>
              <FollowUpList
                bare
                rows={followUpsDoDia}
                now={new Date()}
                onDone={actions.markDone}
                onRemove={actions.remove}
                onEdit={actions.setEditingRow}
                onRename={actions.renameRow}
                onToggleEmail={actions.toggleEmailSent}
                onReschedule={actions.setReschedulingRow}
                onViewHistory={(r) => setCompanyTarget({ empresa: r.company_name, cnpj: r.cnpj ?? null })}
                onGoToPos={actions.goToPosLigacao}
                emptyLabel="Nenhum follow-up neste dia."
              />
            </div>
          ) : null}
          {doDia.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum compromisso neste dia.</p>
          ) : doDiaSimples.length === 0 ? null : (
            <ul className="space-y-2">
              {doDiaSimples.map((e) => (
                <li key={e.id} className="rounded-lg border border-border/70 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">{e.tipo === "reuniao" ? "📅" : "📞"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-navy-deep">{e.empresa}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {[e.acao, e.contato].filter(Boolean).join(" · ") || e.detalhe}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {new Date(e.quando).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        setActiveLead({ razaoSocial: e.empresa, cnpj: e.cnpj ?? undefined });
                        window.location.href = "/?tab=pre";
                      }}
                    >
                      Abrir
                    </Button>
                    <div className="w-full sm:w-auto">
                      <HistoricoEmpresaSheet empresa={e.empresa} cnpj={e.cnpj ?? null} variant="dialog" />
                    </div>
                  </div>
                  {e.notas?.trim() ? (
                    <p className="mt-1.5 whitespace-pre-line rounded-md bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {e.notas.trim()}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/reunioes">Central de Reuniões</Link>
            </Button>
            {!embedded && (
              <Button asChild size="sm" variant="outline">
                <Link to="/followup" search={{ tab: "followups" }}>Follow-up</Link>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>


      <CompanySheet target={companyTarget} onClose={() => setCompanyTarget(null)} />
      <EditFollowUpDialog
        row={actions.editingRow}
        onClose={() => actions.setEditingRow(null)}
        onSave={actions.saveEdit}
      />
      <RescheduleDialog
        row={actions.reschedulingRow}
        onClose={() => actions.setReschedulingRow(null)}
        onSave={actions.saveReschedule}
      />
    </>
  );
}
