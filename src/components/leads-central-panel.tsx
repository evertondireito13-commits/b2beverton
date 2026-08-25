import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { E2ESimulator } from "@/components/central/e2e-simulator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FUNNEL_STAGES,
  LEADS_EVENT,
  LEAD_STATUS_LABEL,
  Lead,
  LeadStatus,
  STAGE_HINT,
  daysInStage,
  deleteLead,
  findLead,
  isOverdue,
  listLeads,
  pendingLeadFollowUps,
  updateLead,
  upsertLead,
  effectiveStage,
  isPauseDue,
} from "@/lib/leads-store";
import { estagnacao, estagnacaoLabel, ESTAGNACAO_RING, ESTAGNACAO_TONE } from "@/lib/lead-activity";
import { stableUuid } from "@/lib/cloud-store";
import { WhatsAppQuickButton } from "@/components/central/whatsapp-quick";
import { pipelineMetrics, formatBRL } from "@/lib/pipeline-metrics";
import { sendRdStationNote } from "@/lib/prospeccao.functions";
import { mesclarLeadsDuplicados, deleteLeads as deleteLeadsCloud } from "@/lib/leads.functions";
import { listMeetings } from "@/lib/follow-ups.functions";
import { getConsultor, getSessionConsultor } from "@/lib/historico-store";
import { LeadDetailDialog, fmtDateTime } from "@/components/central/lead-detail-dialog";


const STATUS_ICON: Record<LeadStatus, string> = {
  pausado: "⏸️",
  reuniao_agendada: "📅",
  resgate_reuniao: "🚑",
  pos_reuniao: "🤝",
  levantamento_docs: "📄",
  apresentacao_calculos: "📊",
  fechado: "🏆",
  perdido: "📦",
  nao_qualificado: "🚫",
};

const COLUMN_TONE: Record<LeadStatus, string> = {
  pausado: "border-slate-300 bg-slate-100/60",
  reuniao_agendada: "border-blue-200 bg-blue-50/50",
  resgate_reuniao: "border-orange-200 bg-orange-50/50",
  pos_reuniao: "border-amber-200 bg-amber-50/50",
  levantamento_docs: "border-indigo-200 bg-indigo-50/50",
  apresentacao_calculos: "border-purple-200 bg-purple-50/50",
  fechado: "border-emerald-200 bg-emerald-50/50",
  perdido: "border-slate-200 bg-slate-50/50",
  nao_qualificado: "border-zinc-200 bg-zinc-50/50",
};

const STAGE_SLA_DAYS: Partial<Record<LeadStatus, number>> = {
  levantamento_docs: 5,
  apresentacao_calculos: 4,
  pos_reuniao: 3,
  resgate_reuniao: 2,
};

export function LeadsCentralPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"esteira" | "reativacao">("esteira");
  const [fase, setFase] = useState<LeadStatus | "todas">("todas");
  const [colapsadas, setColapsadas] = useState<Partial<Record<LeadStatus, boolean>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visao, setVisao] = useState<"kanban" | "tabela">("kanban");
  const [filtro, setFiltro] = useState<
    "todos" | "parados" | "atrasados" | "followup" | "valor" | "pausados"
  >(
    "todos",
  );

  const [mesclando, setMesclando] = useState(false);
  const [verMetricas, setVerMetricas] = useState(false);
  const [verFiltros, setVerFiltros] = useState(false);

  const mesclarDuplicados = useCallback(async () => {
    setMesclando(true);
    try {
      const consultor = (getSessionConsultor() ?? getConsultor()) || "shared";
      const res = await mesclarLeadsDuplicados({ data: { consultor } });
      const { hydrateFromCloud } = await import("@/lib/cloud-store");
      await hydrateFromCloud(consultor);
      toast.success(
        res.grupos > 0
          ? `${res.grupos} grupo(s) de duplicatas mesclado(s).`
          : "Nenhuma duplicata encontrada.",
      );
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível mesclar os duplicados.");
    } finally {
      setMesclando(false);
    }
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("bhm-central-visao") === "tabela") setVisao("tabela");
    } catch {
      /* noop */
    }
  }, []);

  function trocarVisao(v: "kanban" | "tabela") {
    setVisao(v);
    try {
      window.localStorage.setItem("bhm-central-visao", v);
    } catch {
      /* noop */
    }
  }


  const runRd = useServerFn(sendRdStationNote);
  const runListMeetings = useServerFn(listMeetings);

  const refresh = useCallback(() => setLeads(listLeads()), []);

  const runDeleteLeadsCloud = useServerFn(deleteLeadsCloud);

  // Exclui um lead da Central de Reuniões: remove do cache local e também
  // da nuvem (senão o próximo carregamento pode "trazer ele de volta",
  // já que o app agora nunca apaga localmente algo que ainda existe na
  // nuvem — ver correção do hydrateFromCloud em cloud-store.ts).
  const handleExcluir = useCallback(
    async (lead: Lead) => {
      const ok = window.confirm(
        `Excluir "${lead.empresa}" da Central de Reuniões? Essa ação não pode ser desfeita.`,
      );
      if (!ok) return;
      deleteLead(lead.id);
      refresh();
      window.dispatchEvent(new CustomEvent(LEADS_EVENT));
      try {
        const consultor = (getSessionConsultor() ?? getConsultor()) || "shared";
        await runDeleteLeadsCloud({ data: { consultor, ids: [stableUuid(lead.id)] } });
      } catch (err) {
        console.error("Falha ao excluir lead na nuvem:", err);
        toast.error("Excluído aqui, mas houve um erro ao remover da nuvem. Pode reaparecer ao atualizar.");
      }
    },
    [refresh, runDeleteLeadsCloud],
  );

  const hydrateFromMeetings = useCallback(async () => {
    try {
      const from = new Date();
      from.setDate(from.getDate() - 60);
      const to = new Date();
      to.setDate(to.getDate() + 120);
      const consultor = (getSessionConsultor() ?? getConsultor()) || "shared";
      const meetings = await runListMeetings({
        data: { from: from.toISOString(), to: to.toISOString(), consultor },
      });
      let touched = 0;
      for (const m of meetings) {
        const existente = findLead(m.company_name, m.cnpj ?? "");
        // NUNCA sobrescrever a fase escolhida manualmente pelo operador nem
        // ressuscitar leads arquivados: a sincronização da agenda só cria
        // leads novos e completa dados de contato dos já existentes.
        upsertLead({
          empresa: m.company_name,
          cnpj: m.cnpj ?? "",
          contato: m.contact_person ?? existente?.contato ?? "",
          ...(existente
            ? {}
            : {
                data_reuniao: m.meeting_at,
                status: m.meeting_held ? "pos_reuniao" : "reuniao_agendada",
                ultima_observacao: m.notes ?? "",
              }),
          em_followup_frio: false,
        });
        touched++;
      }
      if (touched > 0) setLeads(listLeads());

    } catch {
      /* silencioso */
    }
  }, [runListMeetings]);

  useEffect(() => {
    refresh();
    hydrateFromMeetings();
    const h = () => refresh();
    window.addEventListener(LEADS_EVENT, h);
    window.addEventListener("bhm:session-changed", h);
    return () => {
      window.removeEventListener(LEADS_EVENT, h);
      window.removeEventListener("bhm:session-changed", h);
    };
  }, [refresh, hydrateFromMeetings]);

  const termo = busca.trim().toLowerCase();
  const termoDigitos = termo.replace(/\D/g, "");
  const visiveis = useMemo(
    () =>
      leads.filter((l) => {
        const casaTermo =
          !termo ||
          l.empresa.toLowerCase().includes(termo) ||
          (l.contato ?? "").toLowerCase().includes(termo) ||
          (!!termoDigitos && (l.cnpj ?? "").replace(/\D/g, "").includes(termoDigitos));
        if (!casaTermo) return false;
        if (filtro === "parados") return estagnacao(l) !== "ok";
        if (filtro === "atrasados") return isOverdue(l);
        if (filtro === "followup") return pendingLeadFollowUps(l).length > 0;
        if (filtro === "valor") return (l.valor_credito ?? 0) > 0;
        if (filtro === "pausados") return l.status === "pausado";
        return true;
      }),
    [leads, termo, termoDigitos, filtro],
  );

  const metricas = useMemo(() => {
    void leads;
    try {
      return pipelineMetrics();
    } catch {
      return null;
    }
  }, [leads]);


  const arquivados = useMemo(
    () =>
      visiveis
        .filter((l) => l.status === "perdido" || l.status === "nao_qualificado")
        .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
    [visiveis],
  );

  const porFase = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>();
    for (const s of FUNNEL_STAGES) map.set(s, []);
    for (const l of visiveis) {
      if (l.status === "perdido" || l.status === "nao_qualificado") continue;
      map.get(effectiveStage(l))?.push(l);
    }
    for (const [, list] of map)
      list.sort((a, b) => +new Date(a.data_reuniao) - +new Date(b.data_reuniao));
    return map;
  }, [visiveis]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  /**
   * Atualização otimista: a fase muda na tela na hora; se a sincronização com o
   * RD Station falhar, avisamos e recarregamos do store (fonte da verdade).
   */
  function notifyRd(lead: Lead, next: LeadStatus, obs: string) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id
          ? { ...l, status: next, ultima_observacao: obs || l.ultima_observacao }
          : l,
      ),
    );
    if (!lead.rd_deal_id?.trim()) return;
    const nota = `[BHM Central] ${lead.empresa} → ${LEAD_STATUS_LABEL[next]}${obs ? `\n${obs}` : ""}`;
    runRd({ data: { dealId: lead.rd_deal_id, text: nota } }).catch(() => {
      toast.warning("Fase salva localmente, mas a nota não foi enviada ao RD Station.");
      refresh();
    });
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragStart(ev: DragStartEvent) {
    setDragId(String(ev.active.id));
  }

  /** Soltar em outra coluna = mesma transição de fase da edição manual. */
  function onDragEnd(ev: DragEndEvent) {
    setDragId(null);
    const overId = ev.over?.id ? String(ev.over.id) : null;
    if (!overId) return;
    const next = overId.replace(/^col:/, "") as LeadStatus;
    const lead = leads.find((l) => l.id === String(ev.active.id));
    if (!lead || lead.status === next) return;
    updateLead(lead.id, { status: next });
    notifyRd(lead, next, "");
    toast.success(`${lead.empresa} → ${LEAD_STATUS_LABEL[next]}`);
  }

  const draggedLead = dragId ? leads.find((l) => l.id === dragId) ?? null : null;


  const pausadosCount = useMemo(
    () => leads.filter((l) => l.status === "pausado").length,
    [leads],
  );

  const paradosCount = useMemo(
    () => leads.filter((l) => l.status !== "perdido" && estagnacao(l) !== "ok").length,
    [leads],
  );

  return (
    <div className="space-y-3">
      {/* Banner executivo — indicadores em tempo real */}
      <button
        type="button"
        onClick={() => setVerMetricas((v) => !v)}
        className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-navy-deep transition hover:bg-accent"
      >
        {verMetricas ? "▴ Ocultar métricas" : "▾ Ver métricas"}
      </button>
      {metricas && verMetricas && (
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-navy-deep/15 bg-navy-deep/[0.04] p-2 lg:grid-cols-4">
          <MetricPill
            label="Créditos em negociação"
            value={formatBRL(metricas.valorPipeline)}
            hint={`Honorários est.: ${formatBRL(metricas.honorariosEstimados)}`}
          />
          <MetricPill
            label="Empresas ativas"
            value={String(metricas.totalAtivos)}
            hint={`${paradosCount} parada(s) 24h+`}
            alerta={paradosCount > 0}
          />
          <MetricPill
            label="Ciclo médio"
            value={metricas.cicloMedioDias !== null ? `${metricas.cicloMedioDias} dias` : "—"}
            hint="Reunião → fechamento"
          />
          <MetricPill
            label="Conversão"
            value={`${metricas.taxaFechamento}%`}
            hint={`${metricas.totalFechados} fechado(s) · ${metricas.totalPerdidos} perdido(s) · ${metricas.totalNaoQualificados} não qualificado(s), fora da conta`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
          <TabsList>
            <TabsTrigger value="esteira">
              Esteira ativa ({visiveis.length - arquivados.length})
            </TabsTrigger>
            <TabsTrigger value="reativacao">Reativação futura ({arquivados.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar empresa, decisor ou CNPJ…"
          className="h-9 w-full max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={mesclando}
            onClick={mesclarDuplicados}
            title="Consolida leads duplicados da mesma empresa"
            className="rounded-lg border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition hover:bg-amber-500/25 disabled:opacity-60 dark:text-amber-300"
          >
            {mesclando ? "Mesclando…" : "🧹 Mesclar duplicados"}
          </button>
          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["kanban", "tabela"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => trocarVisao(v)}
                className={`px-2.5 py-1.5 text-xs font-semibold transition ${
                  visao === v
                    ? "bg-navy-deep text-white"
                    : "bg-card text-navy-deep hover:bg-accent"
                }`}
              >
                {v === "kanban" ? "▦ Kanban" : "▤ Tabela"}
              </button>
            ))}
          </div>
          {import.meta.env.DEV && <E2ESimulator />}
        </div>
      </div>

      {aba === "esteira" ? (
        <div className="space-y-3">
          {/* Navegação por fase — sem rolagem horizontal */}
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 rounded-xl bg-card/95 px-1 py-2 backdrop-blur">
            <button
              type="button"
              onClick={() => setFase("todas")}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                fase === "todas"
                  ? "border-navy-deep bg-navy-deep text-white"
                  : "border-border bg-card text-navy-deep hover:bg-accent"
              }`}
            >
              Todas ({visiveis.length - arquivados.length})
            </button>
            {FUNNEL_STAGES.map((s) => {
              const n = (porFase.get(s) ?? []).length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFase(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    fase === s
                      ? "border-navy-deep bg-navy-deep text-white"
                      : `${COLUMN_TONE[s]} text-navy-deep hover:brightness-95`
                  }`}
                >
                  <span aria-hidden className="mr-1">
                    {STATUS_ICON[s]}
                  </span>
                  {LEAD_STATUS_LABEL[s].replace(/^\S+\s/, "")} ({n})
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setVerFiltros((v) => !v)}
              className={`ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filtro !== "todos" || verFiltros
                  ? "border-navy-deep bg-navy-deep/10 text-navy-deep"
                  : "border-dashed border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {verFiltros ? "− filtros" : "+ filtros"}
            </button>
          </div>

          {verFiltros && (
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["todos", "Todos"],
                  ["parados", `🛑 Parados 24h+ (${paradosCount})`],
                  ["atrasados", "⏰ Compromisso atrasado"],
                  ["followup", "📌 Com follow-up pendente"],
                  ["valor", "💰 Com crédito apurado"],
                  ["pausados", `⏸️ Pausados (${pausadosCount})`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFiltro(k)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    filtro === k
                      ? "border-navy-deep bg-navy-deep text-white"
                      : "border-border bg-card text-navy-deep hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {visao === "tabela" ? (
            <LeadsTable
              stages={fase === "todas" ? FUNNEL_STAGES : [fase]}
              porFase={porFase}
              onOpen={setSelectedId}
            />
          ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          {(fase === "todas" ? FUNNEL_STAGES : [fase]).map((stage) => {
            const list = porFase.get(stage) ?? [];
            if (fase === "todas" && list.length === 0 && !dragId) return null;
            const aberto = colapsadas[stage] !== true;
            return (
              <StageDroppable key={stage} stage={stage}>
                <button
                  type="button"
                  onClick={() => setColapsadas((c) => ({ ...c, [stage]: c[stage] !== true }))}

                  className="flex w-full items-center gap-2 px-1 pb-2 text-left"
                >
                  <span aria-hidden>{STATUS_ICON[stage]}</span>
                  <span className="text-sm font-semibold text-navy-deep">
                    {LEAD_STATUS_LABEL[stage].replace(/^\S+\s/, "")}
                  </span>
                  <span className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                    {list.length}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {aberto ? "▲ recolher" : "▼ expandir"}
                  </span>
                </button>
                {aberto && (
                  <>
                    <p className="px-1 pb-2 text-[11px] leading-snug text-muted-foreground">
                      {STAGE_HINT[stage]}
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {list.length === 0 && (
                        <li className="rounded-xl border border-dashed border-border/70 p-3 text-center text-[11px] text-muted-foreground">
                          {dragId ? "Solte aqui para mover" : "Nenhum lead nesta fase"}
                        </li>
                      )}
                      {list.map((lead) => (
                        <LeadMiniCard
                          key={lead.id}
                          lead={lead}
                          draggable
                          onOpen={() => setSelectedId(lead.id)}
                          onExcluir={() => handleExcluir(lead)}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </StageDroppable>
            );
          })}
          <DragOverlay>
            {draggedLead ? (
              <div className="pointer-events-none rounded-xl border border-navy-deep/40 bg-card p-3 text-sm font-semibold text-navy-deep shadow-lg">
                {draggedLead.empresa}
              </div>
            ) : null}
          </DragOverlay>
          </DndContext>
          )}


        </div>
      ) : (

        <ul className="space-y-2">
          {arquivados.length === 0 && (
            <li className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Nenhuma empresa arquivada. Ao registrar uma recusa, o lead vem para cá com todo o
              histórico preservado.
            </li>
          )}
          {arquivados.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                onClick={() => setSelectedId(lead.id)}
                className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:border-navy-deep/40 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-navy-deep">{lead.empresa}</span>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                    {lead.motivo_perda || "Sem motivo registrado"}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Arquivado em {fmtDateTime(lead.updated_at)}
                  </span>
                </div>
                {lead.ultima_observacao && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {lead.ultima_observacao}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <LeadDetailDialog
        lead={selected}
        onClose={() => setSelectedId(null)}
        onStageChange={notifyRd}
      />
    </div>
  );
}

function MetricPill({
  label,
  value,
  hint,
  alerta,
}: {
  label: string;
  value: string;
  hint?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-bold leading-tight ${
          alerta ? "text-rose-600" : "text-navy-deep"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StageDroppable({
  stage,
  children,
}: {
  stage: LeadStatus;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  return (
    <section
      ref={setNodeRef}
      className={`rounded-2xl border p-2 ${COLUMN_TONE[stage]} ${
        isOver ? "ring-2 ring-navy-deep/40" : ""
      }`}
    >
      {children}
    </section>
  );
}

function LeadMiniCard({
  lead,
  onOpen,
  onExcluir,
  draggable = false,
}: {
  lead: Lead;
  onOpen: () => void;
  onExcluir?: () => void;
  draggable?: boolean;
}) {
  const overdue = isOverdue(lead);
  const dias = daysInStage(lead);
  const sla = STAGE_SLA_DAYS[lead.status];
  const slaAlert = sla !== undefined && dias > sla;
  const tentativas = (lead.timeline ?? []).length;
  const pendentes = pendingLeadFollowUps(lead);
  const fups = pendentes.length;
  const fupAtrasado = pendentes.some((f) => +new Date(f.scheduled_at) < Date.now());
  const parado = estagnacao(lead);
  const drag = useDraggable({ id: lead.id, disabled: !draggable });

  return (
    <li>
      <div
        ref={draggable ? drag.setNodeRef : undefined}
        {...(draggable ? drag.attributes : {})}
        {...(draggable ? drag.listeners : {})}
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={`w-full cursor-pointer rounded-xl border bg-card p-3 text-left shadow-sm transition hover:shadow-md ${
          drag.isDragging ? "opacity-40" : ""
        } ${
          parado !== "ok"
            ? ESTAGNACAO_RING[parado]
            : overdue
              ? "border-rose-300 ring-1 ring-rose-100"
              : slaAlert
                ? "border-amber-300 ring-1 ring-amber-100"
                : "border-border hover:border-navy-deep/40"
        }`}
      >

        <h4 className="line-clamp-2 text-sm font-semibold leading-tight text-navy-deep">
          {lead.empresa}
        </h4>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
          {lead.contato || "Decisor não informado"}
          {lead.cargo ? ` · ${lead.cargo}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {lead.status === "pausado" && (
            <span
              className={`rounded-md px-1.5 py-0.5 font-semibold ${
                isPauseDue(lead)
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {isPauseDue(lead)
                ? `🔔 Retomar contato — estava pausado até ${fmtDateTime(lead.pausado_ate ?? "")}`
                : `⏸️ Pausado até ${fmtDateTime(lead.pausado_ate ?? "")}`}
            </span>
          )}
          {parado !== "ok" && (
            <span
              className={`rounded-md px-1.5 py-0.5 font-semibold ${ESTAGNACAO_TONE[parado]}`}
              title="Sem registro de ligação ou follow-up nesta etapa"
            >
              {estagnacaoLabel(lead)}
            </span>
          )}
          <span
            className={`rounded-md px-1.5 py-0.5 font-medium ${
              overdue ? "bg-rose-100 text-rose-700" : "bg-muted text-foreground/80"
            }`}
          >
            📆 {fmtDateTime(lead.data_reuniao)}
          </span>
          <span
            className={`rounded-md px-1.5 py-0.5 font-semibold ${
              slaAlert ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
            }`}
          >
            ⏱ {dias}d
          </span>
          {fups > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 font-semibold ${
                fupAtrasado ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-800"
              }`}
              title="Follow-ups pendentes desta negociação"
            >
              📌 {fups}
            </span>
          )}
          {tentativas > 0 && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700">
              🧭 {tentativas}
            </span>
          )}
          {(lead.valor_credito ?? 0) > 0 && (
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">
              💰 {formatBRL(lead.valor_credito ?? 0)}
            </span>
          )}
        </div>
        {lead.proximo_passo && (
          <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">
            ➡️ {lead.proximo_passo}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <WhatsAppQuickButton
            empresa={lead.empresa}
            contato={lead.contato}
            telefone={lead.telefone}
            consultor={(getSessionConsultor() ?? getConsultor()) || ""}
            compact
          />
          {lead.telefone && (
            <a
              href={`tel:${lead.telefone.replace(/\D/g, "")}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-semibold text-navy-deep transition hover:bg-accent"
            >
              ☎️ Ligar
            </a>
          )}
          {onExcluir && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExcluir();
              }}
              title="Excluir esta empresa da Central de Reuniões"
              className="ml-auto rounded-md border border-transparent px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              🗑️ Excluir
            </button>
          )}
        </div>
      </div>
    </li>
  );
}


/** Visão compacta em tabela — mesma fonte de dados do Kanban. */
function LeadsTable({
  stages,
  porFase,
  onOpen,
}: {
  stages: readonly LeadStatus[];
  porFase: Map<LeadStatus, Lead[]>;
  onOpen: (id: string) => void;
}) {
  const linhas = stages.flatMap((s) => porFase.get(s) ?? []);
  if (linhas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Nenhum lead nesta seleção.
      </p>
    );
  }
  return (
    <>
      {/* Mobile: cartões (mesma informação, empilhada) */}
      <ul className="space-y-2 md:hidden">
        {linhas.map((lead) => {
          const dias = daysInStage(lead);
          const sla = STAGE_SLA_DAYS[lead.status];
          const alerta = isOverdue(lead) || (sla !== undefined && dias > sla);
          const parado = estagnacao(lead);
          return (
            <li
              key={lead.id}
              className="rounded-xl border border-border bg-card p-3 text-xs"
            >
              <button
                type="button"
                onClick={() => onOpen(lead.id)}
                className="block w-full text-left"
              >
                <p className="font-semibold text-navy-deep">
                  {lead.empresa}
                  {parado !== "ok" && (
                    <span
                      className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold ${ESTAGNACAO_TONE[parado]}`}
                    >
                      {estagnacaoLabel(lead)}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-muted-foreground">
                  <span aria-hidden>{STATUS_ICON[lead.status]}</span>{" "}
                  {LEAD_STATUS_LABEL[lead.status].replace(/^\S+\s/, "")} ·{" "}
                  <span className={alerta ? "font-semibold text-rose-600" : ""}>{dias}d</span>
                </p>
                <p className="mt-1 text-muted-foreground">
                  Decisor: {lead.contato || "—"}
                </p>
                <p className="text-muted-foreground">
                  Reunião: {fmtDateTime(lead.data_reuniao)}
                </p>
                <p className="text-muted-foreground">
                  Próximo passo: {lead.proximo_passo || "—"}
                </p>
              </button>
              <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                <WhatsAppQuickButton
                  empresa={lead.empresa}
                  contato={lead.contato}
                  telefone={lead.telefone}
                  consultor={(getSessionConsultor() ?? getConsultor()) || ""}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Tablet/desktop: tabela completa */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
      <table className="w-full text-left text-xs">

        <thead className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Empresa</th>
            <th className="px-3 py-2">Decisor</th>
            <th className="px-3 py-2">Fase</th>
            <th className="px-3 py-2">Reunião</th>
            <th className="px-3 py-2">Dias</th>
            <th className="px-3 py-2">Próximo passo</th>
            <th className="px-3 py-2">Ação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((lead) => {
            const dias = daysInStage(lead);
            const sla = STAGE_SLA_DAYS[lead.status];
            const alerta = isOverdue(lead) || (sla !== undefined && dias > sla);
            const parado = estagnacao(lead);
            return (
              <tr
                key={lead.id}
                onClick={() => onOpen(lead.id)}
                className="cursor-pointer border-t border-border/70 transition hover:bg-accent/50"
              >
                <td className="px-3 py-2 font-semibold text-navy-deep">
                  {lead.empresa}
                  {parado !== "ok" && (
                    <span
                      className={`ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold ${ESTAGNACAO_TONE[parado]}`}
                    >
                      {estagnacaoLabel(lead)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{lead.contato || "—"}</td>
                <td className="px-3 py-2">
                  <span className="mr-1" aria-hidden>
                    {STATUS_ICON[lead.status]}
                  </span>
                  {LEAD_STATUS_LABEL[lead.status].replace(/^\S+\s/, "")}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(lead.data_reuniao)}</td>
                <td className={`px-3 py-2 font-semibold ${alerta ? "text-rose-600" : ""}`}>
                  {dias}d
                </td>
                <td className="max-w-[22ch] truncate px-3 py-2 text-muted-foreground">
                  {lead.proximo_passo || "—"}
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <WhatsAppQuickButton
                    empresa={lead.empresa}
                    contato={lead.contato}
                    telefone={lead.telefone}
                    consultor={(getSessionConsultor() ?? getConsultor()) || ""}
                    compact
                  />
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>

  );
}

