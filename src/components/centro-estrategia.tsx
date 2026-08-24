import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  addDays,
  isBefore,
  isSameDay,
  isAfter,
  parseISO,
  startOfDay as dfStartOfDay,
} from "date-fns";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, FileDown, Printer, AlertTriangle, CalendarDays, ClockAlert, Trash2 } from "lucide-react";
import {
  deleteHistoricosByEmpresa,
  getConsultor,
  getSessionConsultor,
} from "@/lib/historico-store";
import {
  setActiveLead,
  deleteActivitiesByEmpresa,
  updateActivityEmpresa,
  renameActivitiesByEmpresa,
  BHM_DAILY_ACTIVITIES_KEY,
  type BhmActivityLog,
} from "@/lib/daily-activities";
import { updateHistoricoEmpresa } from "@/lib/historico-store";
import { listFollowUps, type FollowUp } from "@/lib/follow-ups.functions";
import { EditableCompanyName } from "@/components/editable-company-name";
import { emitHistoricoUpdated } from "@/components/historico-panel";

// ------------------------------------------------------------------
// Utilitários de data
// ------------------------------------------------------------------
function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function toInputDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const CENTRO_HOJE_ISO = "2026-07-18";

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (br) {
    const yyyy = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    const d = new Date(yyyy, Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function centroActivitiesKey(): string {
  const consultor = getSessionConsultor() ?? getConsultor();
  return `${BHM_DAILY_ACTIVITIES_KEY}::${consultor}`;
}

function loadCentroActivities(): BhmActivityLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(centroActivitiesKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BhmActivityLog[]) : [];
  } catch {
    return [];
  }
}

function useHistoricoVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const h = () => setV((x) => x + 1);
    window.addEventListener("bhm:historico-updated", h);
    window.addEventListener("bhm:activities-updated", h);
    window.addEventListener("bhm:session-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("bhm:historico-updated", h);
      window.removeEventListener("bhm:activities-updated", h);
      window.removeEventListener("bhm:session-changed", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return v;
}

// ------------------------------------------------------------------
// Guard de estado sujo compartilhado (Pós-ligação em andamento)
// Mantém a mesma semântica do listener global existente.
// ------------------------------------------------------------------
function activateLeadWithGuard(lead: { cnpj?: string | null; empresaNome: string }) {
  const digits = (lead.cnpj ?? "").replace(/\D/g, "");
  setActiveLead({
    cnpj: digits || undefined,
    razaoSocial: lead.empresaNome,
    nomeFantasia: lead.empresaNome,
  });
  toast.success(`Lead ativado: ${lead.empresaNome}`, {
    description: digits
      ? "Aberto na Pré-ligação com dossiê hidratado."
      : "Sem CNPJ salvo — informe na Pré-ligação.",
  });
}

// ==================================================================
// COMPONENTE MESTRE
// ==================================================================
export function CentroEstrategiaAuditoria() {
  return (
    <section className="print:hidden mt-10 rounded-2xl border border-navy-deep/15 bg-gradient-to-br from-white via-white to-gold/5 p-6 shadow-sm">
      <header className="mb-5 border-b border-gold/40 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-gold">
          BHM Advogados
        </p>
        <h2 className="mt-1 font-display text-2xl tracking-tight text-navy-deep">
          Centro de Estratégia e Auditoria Comercial
        </h2>
        <p className="mt-1 text-sm text-navy-deep/70">
          Agenda visual de retornos + exportação executiva de relatórios históricos.
        </p>
      </header>

      <Tabs defaultValue="agenda" className="w-full">
        <TabsList className="mb-4 grid w-full grid-cols-2 bg-navy-deep/5">
          <TabsTrigger value="agenda" className="data-[state=active]:bg-navy-deep data-[state=active]:text-white">
            <CalendarClock className="mr-2 h-4 w-4" />
            Agenda de Retornos
          </TabsTrigger>
          <TabsTrigger value="export" className="data-[state=active]:bg-navy-deep data-[state=active]:text-white">
            <FileDown className="mr-2 h-4 w-4" />
            Exportador de Relatórios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agenda">
          <AgendaRetornos />
        </TabsContent>
        <TabsContent value="export">
          <ExportadorRelatorios />
        </TabsContent>
      </Tabs>
    </section>
  );
}

// ==================================================================
// ABA 1 — Agenda de Retornos
// ==================================================================
function AgendaRetornos() {
  const v = useHistoricoVersion();
  const atividades = useMemo(() => loadCentroActivities(), [v]);
  const listFollowUpsFn = useServerFn(listFollowUps);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  const loadFollowUps = useCallback(async () => {
    try {
      const consultor = getSessionConsultor() ?? getConsultor();
      const rows = await listFollowUpsFn({ data: { consultor } });
      setFollowUps(rows);
    } catch {
      /* offline / erro de rede: mantém estado */
    }
  }, [listFollowUpsFn]);

  useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps, v]);

  const grupos = useMemo(
    () => classificarAgenda(atividades, followUps),
    [atividades, followUps],
  );

  const total =
    grupos.atrasados.length + grupos.hoje.length + grupos.proximos.length;

  function excluirLead(item: AgendaItem) {
    const ok = typeof window === "undefined"
      ? true
      : window.confirm(
          `Remover apenas os registros de "${item.empresaNome}" para permitir um novo teste? As demais empresas serão preservadas.`,
        );
    if (!ok) return;
    try {
      const removidosHist = deleteHistoricosByEmpresa({
        cnpj: item.cnpj ?? undefined,
        empresaNome: item.empresaNome,
      });
      const removidosAct = deleteActivitiesByEmpresa({
        cnpj: item.cnpj ?? undefined,
        empresaNome: item.empresaNome,
      });
      emitHistoricoUpdated();
      window.dispatchEvent(new Event("bhm:activities-updated"));
      toast.success(`"${item.empresaNome}" removida deste operador`, {
        description: `Históricos: ${removidosHist} · Atividades: ${removidosAct}. Demais empresas intocadas.`,
      });
    } catch {
      toast.error("Não foi possível excluir este lead.");
    }
  }

  return (
    <div>
      {total === 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-navy-deep/20 bg-white/60 p-4 text-center">
          <p className="text-sm text-navy-deep/70">
            Nenhum retorno agendado — cadastre follow-ups pela aba correspondente ou preencha "Próxima ação" no histórico.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ColunaAgenda
          titulo="Urgentes / Atrasados"
          descricao="Retornos com data anterior a hoje"
          tone="danger"
          Icon={ClockAlert}
          items={grupos.atrasados}
          onDelete={excluirLead}
          emptyLabel="Nenhum retorno atrasado para o período."
        />
        <ColunaAgenda
          titulo="Para Hoje"
          descricao="Retornos previstos para a data corrente"
          tone="today"
          Icon={AlertTriangle}
          items={grupos.hoje}
          onDelete={excluirLead}
          emptyLabel="Nenhum retorno agendado para hoje."
        />
        <ColunaAgenda
          titulo="Próximos 7 Dias"
          descricao="Janela futura curta — prepare-se"
          tone="future"
          Icon={CalendarDays}
          items={grupos.proximos}
          onDelete={excluirLead}
          emptyLabel="Sem retornos previstos nos próximos 7 dias."
        />
      </div>
    </div>
  );
}

type AgendaItem = {
  id: string;
  empresaNome: string;
  cnpj?: string | null;
  contato?: string | null;
  proximaAcao?: string | null;
  dataIso: string;
  dataFormatada: string;
};

function parseAny(value?: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  // ISO com ou sem hora
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    try { return dfStartOfDay(parseISO(raw)); } catch { return null; }
  }
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (br) {
    const yyyy = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    const d = new Date(yyyy, Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : dfStartOfDay(d);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : dfStartOfDay(d);
}

function classificarAgenda(
  atividades: BhmActivityLog[],
  followUps: FollowUp[],
): {
  atrasados: AgendaItem[];
  hoje: AgendaItem[];
  proximos: AgendaItem[];
} {
  const hoje = parseDateOnly(CENTRO_HOJE_ISO) ?? dfStartOfDay(new Date());
  const limite = addDays(hoje, 7);

  const seen = new Set<string>();
  const atrasados: AgendaItem[] = [];
  const doDia: AgendaItem[] = [];
  const proximos: AgendaItem[] = [];

  const push = (it: AgendaItem, dia: Date) => {
    if (isBefore(dia, hoje)) atrasados.push(it);
    else if (isSameDay(dia, hoje)) doDia.push(it);
    else if (!isAfter(dia, limite)) proximos.push(it);
  };

  // 1) FOLLOW-UPS do Supabase (fonte primária de retornos)
  const abertos = followUps.filter((f) => f.status !== "done");
  for (const f of abertos) {
    const dia = parseAny(f.scheduled_at);
    if (!dia) continue;
    const key = (f.cnpj ?? "").replace(/\D/g, "") || (f.company_name ?? "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    push(
      {
        id: `fu-${f.id}`,
        empresaNome: f.company_name,
        cnpj: f.cnpj,
        contato: f.contact_person,
        proximaAcao: f.notes ?? null,
        dataIso: dia.toISOString().slice(0, 10),
        dataFormatada: dia.toLocaleDateString("pt-BR"),
      },
      dia,
    );
  }

  // 2) ATIVIDADES locais com proximaAcaoData (fonte secundária)
  const sorted = [...atividades].sort(
    (a, b) =>
      new Date(b.createdAtIso ?? b.dateStr).getTime() -
      new Date(a.createdAtIso ?? a.dateStr).getTime(),
  );
  for (const r of sorted) {
    const key = (r.cnpj ?? "").replace(/\D/g, "") || r.empresa.toLowerCase();
    if (seen.has(key)) continue;
    if (r.status && r.status !== "pendente") { seen.add(key); continue; }
    const dia = parseAny(r.proximaAcaoData);
    if (!dia) continue;
    seen.add(key);
    push(
      {
        id: r.id,
        empresaNome: r.empresa,
        cnpj: r.cnpj,
        contato: r.contato,
        proximaAcao: r.proximaAcao,
        dataIso: dia.toISOString().slice(0, 10),
        dataFormatada: dia.toLocaleDateString("pt-BR"),
      },
      dia,
    );
  }

  atrasados.sort((a, b) => a.dataIso.localeCompare(b.dataIso));
  proximos.sort((a, b) => a.dataIso.localeCompare(b.dataIso));
  return { atrasados, hoje: doDia, proximos };
}

function ColunaAgenda({
  titulo,
  descricao,
  tone,
  Icon,
  items,
  onDelete,
  emptyLabel = "Sem registros.",
}: {
  titulo: string;
  descricao: string;
  tone: "danger" | "today" | "future";
  Icon: ComponentType<{ className?: string }>;
  items: AgendaItem[];
  onDelete?: (item: AgendaItem) => void;
  emptyLabel?: string;
}) {
  const styles =
    tone === "danger"
      ? {
          head: "bg-red-50 text-red-800 border-red-200",
          badge: "bg-red-100 text-red-800",
          card: "border-red-200 hover:border-red-400",
        }
      : tone === "today"
        ? {
            head: "bg-gold/10 text-navy-deep border-gold/40",
            badge: "bg-gold/20 text-navy-deep",
            card: "border-gold/40 hover:border-gold",
          }
        : {
            head: "bg-navy-deep/5 text-navy-deep border-navy-deep/20",
            badge: "bg-navy-deep/10 text-navy-deep",
            card: "border-navy-deep/15 hover:border-navy-deep/40",
          };
  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-white">
      <div className={`flex items-center justify-between rounded-t-xl border-b px-3 py-2 ${styles.head}`}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide">{titulo}</div>
            <div className="text-[10px] opacity-80">{descricao}</div>
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles.badge}`}>
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {items.length === 0 && (
          <p className="text-xs italic text-muted-foreground">{emptyLabel}</p>
        )}
        {items.map((it) => (
          <div
            key={it.id}
            className={`group relative flex w-full items-stretch rounded-lg border bg-white transition hover:shadow-sm ${styles.card}`}
          >
            <button
              type="button"
              onClick={() => activateLeadWithGuard(it)}
              className="flex min-w-0 flex-1 flex-col px-3 py-2 pr-9 text-left"
              title={it.cnpj ? `CNPJ ${it.cnpj}` : "Sem CNPJ salvo"}
            >
              <span
                className="truncate text-sm font-semibold text-navy-deep"
                onClick={(e) => e.stopPropagation()}
              >
                <EditableCompanyName
                  value={it.empresaNome}
                  onSave={async (nome) => {
                    updateActivityEmpresa(it.id, nome);
                    renameActivitiesByEmpresa(
                      { cnpj: it.cnpj, empresaAntiga: it.empresaNome },
                      nome,
                    );
                    try {
                      const { listHistoricos } = await import("@/lib/historico-store");
                      const cnpjDigits = (it.cnpj ?? "").replace(/\D/g, "");
                      const antigo = (it.empresaNome ?? "").trim().toLowerCase();
                      const alvo = listHistoricos().find((h) => {
                        const hc = (h.cnpj ?? "").replace(/\D/g, "");
                        if (cnpjDigits && hc && hc === cnpjDigits) return true;
                        return (h.empresaNome ?? "").trim().toLowerCase() === antigo;
                      });
                      if (alvo) updateHistoricoEmpresa(alvo.id, nome);
                    } catch { /* noop */ }
                    toast.success("Nome da empresa atualizado.");
                  }}
                />
              </span>
              <span className="text-[11px] text-muted-foreground">
                <strong>{it.dataFormatada}</strong>
                {it.contato ? <> · {it.contato}</> : null}
              </span>
              {it.proximaAcao && (
                <span className="mt-1 line-clamp-2 text-[11px] text-navy-deep/70">
                  {it.proximaAcao}
                </span>
              )}
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(it);
                }}
                className="absolute right-1.5 top-1.5 rounded-md p-1 text-navy-deep/40 opacity-100 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                title={`Excluir apenas ${it.empresaNome} (permite retestar)`}
                aria-label={`Excluir ${it.empresaNome}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// ==================================================================
// ABA 2 — Exportador de Relatórios Históricos
// ==================================================================
function ExportadorRelatorios() {
  const hoje = CENTRO_HOJE_ISO;
  const [dataInicial, setDataInicial] = useState(hoje);
  const [dataFinal, setDataFinal] = useState(hoje);
  const v = useHistoricoVersion();

  const todasAtividades = useMemo(
    () =>
      loadCentroActivities().sort(
        (a, b) =>
          a.dateStr.localeCompare(b.dateStr) || a.empresa.localeCompare(b.empresa),
      ),
    [v],
  );

  const dados = useMemo(() => {
    return filtrarAtividades(todasAtividades, dataInicial, dataFinal);
  }, [dataInicial, dataFinal, todasAtividades]);

  const totalLigacoes = dados.length;
  const totalDecisores = dados.filter((a) => a.falouDecisor).length;

  function imprimir() {
    if (dados.length === 0) {
      toast.warning("Nenhuma atividade no período selecionado.");
      return;
    }
    // Adia para o próximo tick para garantir render do bloco de impressão.
    setTimeout(() => window.print(), 50);
  }

  function exportarCsv() {
    if (todasAtividades.length === 0) {
      toast.warning("Nenhuma atividade salva para este operador.");
      return;
    }
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      // Padrão CSV RFC-4180: envolve em aspas e duplica aspas internas.
      return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    };
    const header = [
      "Data",
      "Empresa",
      "CNPJ",
      "Contato",
      "Cargo",
      "Tipo de Contato",
      "Histórico da Conversa",
    ];
    const linhas = todasAtividades.map((a) => [
      a.dateStr,
      a.empresa,
      a.cnpj ?? "",
      a.contato ?? "",
      a.cargo ?? "",
      a.falouDecisor ? "Decisor" : "Portaria",
      a.historico ?? "",
    ]);
    const csv = [header, ...linhas].map((l) => l.map(esc).join(",")).join("\r\n");
    // BOM para Excel abrir com acentuação correta.
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio_prospeccao_bhm.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`CSV gerado com ${todasAtividades.length} atividade(s).`);
  }


  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] print:block">
      {/* Painel de controle */}
      <div className="min-w-0 rounded-xl border border-navy-deep/15 bg-white p-4">

        <h3 className="font-display text-base text-navy-deep">Parâmetros</h3>
        <p className="mt-1 text-xs text-navy-deep/70">
          Define o intervalo e gera o PDF via impressão do navegador — custo zero.
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="data-inicial" className="text-xs uppercase tracking-wide text-navy-deep/70">
              Data Inicial
            </Label>
            <Input
              id="data-inicial"
              type="date"
              value={dataInicial}
              max={dataFinal}
              onChange={(e) => setDataInicial(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="data-final" className="text-xs uppercase tracking-wide text-navy-deep/70">
              Data Final
            </Label>
            <Input
              id="data-final"
              type="date"
              value={dataFinal}
              min={dataInicial}
              onChange={(e) => setDataFinal(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-navy-deep/5 p-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-navy-deep/70">Ligações</div>
            <div className="text-lg font-semibold text-navy-deep">{totalLigacoes}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-navy-deep/70">Decisores</div>
            <div className="text-lg font-semibold text-gold">{totalDecisores}</div>
          </div>
        </div>

        <Button
          onClick={imprimir}
          className="mt-4 w-full bg-navy-deep text-white hover:bg-navy-deep/90"
        >
          <Printer className="mr-2 h-4 w-4" />
          Gerar Relatório Executivo (PDF)
        </Button>
        <p className="mt-2 text-[10px] text-navy-deep/60">
          Ao clicar, seu navegador abrirá o diálogo de impressão. Escolha "Salvar como PDF".
        </p>

        <Button
          onClick={exportarCsv}
          variant="outline"
          className="mt-3 w-full border-gold text-navy-deep hover:bg-gold/10"
        >
          <FileDown className="mr-2 h-4 w-4" />
          Baixar CSV (Data, Empresa, CNPJ, Contato, Cargo, Tipo, Histórico)
        </Button>
        <p className="mt-2 text-[10px] text-navy-deep/60">
          Download automático de <code>relatorio_prospeccao_bhm.csv</code> com todas as
          atividades do operador logado neste intervalo.
        </p>

      </div>

      {/* Prévia da tabela */}
      <div className="hidden print:block rounded-xl border border-navy-deep/15 bg-white p-4">
        <h3 className="font-display text-base text-navy-deep">Prévia do Período</h3>
        <p className="mt-1 text-xs text-navy-deep/70">
          {dataInicial === dataFinal
            ? `Empresas contatadas em ${new Date(dataInicial).toLocaleDateString("pt-BR")}`
            : `De ${new Date(dataInicial).toLocaleDateString("pt-BR")} até ${new Date(
                dataFinal,
              ).toLocaleDateString("pt-BR")}`}
        </p>
        <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-navy-deep/10">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="bg-navy-deep/5 text-navy-deep">
              <tr>
                <th className="px-2 py-1.5 text-left">Data</th>
                <th className="px-2 py-1.5 text-left">Empresa</th>
                <th className="px-2 py-1.5 text-left">Contato</th>
                <th className="px-2 py-1.5 text-left">Resultado</th>
                <th className="px-2 py-1.5 text-left">Decisor</th>
              </tr>
            </thead>
            <tbody>
              {dados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center italic text-muted-foreground">
                    Nenhuma atividade nesse intervalo.
                  </td>
                </tr>
              )}
              {dados.map((a) => (
                <tr key={a.id} className="border-t border-navy-deep/10">
                  <td className="px-2 py-1.5">{a.dateStr.split("-").reverse().join("/")}</td>
                  <td className="px-2 py-1.5 font-medium text-navy-deep">{a.empresa || "—"}</td>
                  <td className="px-2 py-1.5">{a.contato || "—"}</td>
                  <td className="px-2 py-1.5">{a.resultado || "—"}</td>
                  <td className="px-2 py-1.5">
                    {a.falouDecisor ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">Sim</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">Não</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Layout dedicado à impressão */}
      <RelatorioImprimivel
        dataInicial={dataInicial}
        dataFinal={dataFinal}
        atividades={dados}
        totalLigacoes={totalLigacoes}
        totalDecisores={totalDecisores}
      />
    </div>
  );
}

const ensureIsoFormat = (dateStr: string): string => {
  if (!dateStr) return "";
  if (dateStr.includes("/")) {
    return dateStr.split("/").reverse().join("-");
  }
  return dateStr;
};

function filtrarAtividades(list: BhmActivityLog[], ini: string, fim: string): BhmActivityLog[] {
  const iniIso = ensureIsoFormat(ini);
  const fimIso = ensureIsoFormat(fim);
  return list
    .map((a) => ({ ...a, dateStr: ensureIsoFormat(a.dateStr) }))
    .filter((a) => a.dateStr >= iniIso && a.dateStr <= fimIso)
    .sort((a, b) => (a.dateStr === b.dateStr ? a.empresa.localeCompare(b.empresa) : a.dateStr.localeCompare(b.dateStr)));
}

// ------------------------------------------------------------------
// Layout de impressão (papel timbrado BHM)
// Só aparece durante window.print(); no restante do tempo fica oculto.
// ------------------------------------------------------------------
function RelatorioImprimivel({
  dataInicial,
  dataFinal,
  atividades,
  totalLigacoes,
  totalDecisores,
}: {
  dataInicial: string;
  dataFinal: string;
  atividades: BhmActivityLog[];
  totalLigacoes: number;
  totalDecisores: number;
}) {
  const fmt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
  const taxa = totalLigacoes > 0 ? Math.round((totalDecisores / totalLigacoes) * 100) : 0;

  // Agrupamento cronológico por dia comercial
  const grupos = useMemo(() => {
    const map = new Map<string, BhmActivityLog[]>();
    for (const a of atividades) {
      if (!map.has(a.dateStr)) map.set(a.dateStr, []);
      map.get(a.dateStr)!.push(a);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [atividades]);

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 15mm 20mm 15mm 20mm;
          }
          body {
            background: #fff;
            color: #000;
          }
          body * { visibility: hidden !important; }
          #bhm-print-area, #bhm-print-area * { visibility: visible !important; }
          #bhm-print-area {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            background: white !important;
            color: #0b1a3a !important;
            font-family: Georgia, "Times New Roman", serif !important;
          }
          #bhm-print-area .bhm-day-group { page-break-inside: avoid; }
          #bhm-print-area table { page-break-inside: auto; }
          #bhm-print-area tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}</style>

      <div id="bhm-print-area" className="hidden print:block">
        <header
          style={{
            borderBottom: "2px solid #b8912b",
            paddingBottom: 12,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: "#b8912b", fontWeight: 700 }}>
              BHM ADVOGADOS
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              Relatório Executivo de Prospecção
            </div>
            <div style={{ fontSize: 11, color: "#455066", marginTop: 4 }}>
              Consultoria Tributária Empresarial · Auditoria Comercial
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#455066" }}>
            <div>Período:</div>
            <div style={{ fontWeight: 700, color: "#0b1a3a" }}>
              {fmt(dataInicial)} — {fmt(dataFinal)}
            </div>
            <div style={{ marginTop: 4 }}>
              Emissão: {new Date().toLocaleDateString("pt-BR")}
            </div>
          </div>
        </header>

        {/* Subtotal de conversão em destaque */}
        <section
          style={{
            border: "1.5px solid #0b1a3a",
            background: "#f7f8fb",
            padding: "10px 14px",
            marginBottom: 18,
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>
            <strong>Ligações Totais do Período:</strong> {totalLigacoes}
          </span>
          <span style={{ color: "#0b1a3a" }}>|</span>
          <span>
            <strong>Contatos Efetivos com Decisor:</strong> {totalDecisores}
          </span>
          <span style={{ color: "#0b1a3a" }}>|</span>
          <span style={{ color: "#b8912b", fontWeight: 700 }}>
            Taxa de Conversão da Janela: {taxa}%
          </span>
        </section>

        <h2 style={{ fontSize: 14, borderBottom: "1px solid #b8912b", paddingBottom: 4, marginBottom: 10 }}>
          Detalhamento Cronológico das Atividades
        </h2>

        {grupos.map(([dateStr, items]) => {
          const decisoresDia = items.filter((a) => a.falouDecisor).length;
          return (
            <div key={dateStr} className="bhm-day-group" style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  color: "#0b1a3a",
                  borderBottom: "1px dashed #b8912b",
                  padding: "4px 0",
                  marginBottom: 6,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>--- {dateStr.split("-").reverse().join("/")} ---</span>
                <span style={{ fontWeight: 400, color: "#455066" }}>
                  {items.length} ligações · {decisoresDia} com decisor
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#0b1a3a", color: "white" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Empresa</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Contato</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Cargo</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Resultado</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Decisor</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a, i) => (
                    <tr
                      key={a.id}
                      style={{ background: i % 2 ? "#f7f8fb" : "white", borderBottom: "1px solid #e4e6ee" }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{a.empresa || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.contato || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.cargo || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.resultado || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{a.falouDecisor ? "Sim" : "Não"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        <footer
          style={{
            marginTop: 24,
            paddingTop: 10,
            borderTop: "1px solid #d8dbe4",
            fontSize: 9,
            color: "#6b7385",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>BHM Advogados · Documento gerado automaticamente pela Central de Prospecção</span>
          <span>Confidencial · Uso Interno</span>
        </footer>
      </div>
    </>
  );
}

