import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Copy, Search, ClipboardList, History, Trash2 } from "lucide-react";
import {
  calcularRelatorioDiario,
  listHistoricos,
  proximosFollowUps,
  saveHistorico,
  searchHistoricos,
  getConsultor,
  setConsultor,
  deleteHistoricosByEmpresa,
  type Consultor,
  type HistoricoEmpresa,
  type PeriodoMetricas,
  updateHistoricoEmpresa,
} from "@/lib/historico-store";
import { setActiveLead, deleteActivitiesByEmpresa, renameActivitiesByEmpresa } from "@/lib/daily-activities";
import { EditableCompanyName } from "@/components/editable-company-name";




const OBSTACULO_KEY = "bhm.relatorio.obstaculo";
const PROXIMO_KEY = "bhm.relatorio.proximoPasso";
const FOLLOWUP_ALERT_DISMISS_KEY = "bhm.followup-alert-dismissed-v1";

// Um contador simples para forçar re-renderização quando novos históricos são salvos.
function useHistoricoVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const handler = () => setV((x) => x + 1);
    window.addEventListener("bhm:historico-updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("bhm:historico-updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return v;
}

export function emitHistoricoUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("bhm:historico-updated"));
  }
}

// ============================================================
// Alerta de follow-ups (próximos 7 dias)
// ============================================================
export function AlertaFollowUps({ onPick }: { onPick?: () => void } = {}) {
  const v = useHistoricoVersion();
  const items = useMemo(() => proximosFollowUps(7), [v]);
  const [dismissed, setDismissed] = useState(false);
  const signature = useMemo(() => items.map((f) => f.id).join("|"), [items]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(!!signature && window.localStorage.getItem(FOLLOWUP_ALERT_DISMISS_KEY) === signature);
  }, [signature]);

  function handlePick(f: (typeof items)[number]) {
    const digits = (f.cnpj ?? "").replace(/\D/g, "");
    setActiveLead({
      cnpj: digits || undefined,
      razaoSocial: f.empresaNome,
      nomeFantasia: f.empresaNome,
    });
    if (digits) {
      toast.success(`Lead ativado: ${f.empresaNome} — abrindo Pré-ligação`);
    } else {
      toast.message(`Lead ativado: ${f.empresaNome}`, {
        description: "Este registro não possui CNPJ salvo — digite-o na Pré-ligação.",
      });
    }
    onPick?.();
  }

  if (dismissed) return null;
  if (items.length === 0) return null;

  return (
    <Card className="mb-4 border-amber-400/60 bg-amber-50 shadow-sm dark:bg-amber-950/30">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
          <Bell className="h-4 w-4" />
          Prepare-se — {items.length} follow-up{items.length > 1 ? "s" : ""} nos próximos 7 dias
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setDismissed(true);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(FOLLOWUP_ALERT_DISMISS_KEY, signature);
            }
          }}
        >
          Fechar
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-2 text-[11px] text-amber-800/80 dark:text-amber-100/70">
          Clique em um card para carregar o lead automaticamente na Pré-ligação.
        </p>
        <ul className="grid gap-1.5 text-sm text-amber-900 dark:text-amber-100 sm:grid-cols-2">
          {items.slice(0, 12).map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => handlePick(f)}
                className="group flex w-full items-start gap-2 rounded-md border border-amber-300/70 bg-white/60 px-3 py-2 text-left transition hover:border-amber-500 hover:bg-white hover:shadow-sm dark:bg-amber-900/30 dark:hover:bg-amber-900/50"
                title={f.cnpj ? `CNPJ ${f.cnpj} — clique para carregar` : "Clique para carregar (CNPJ não salvo)"}
              >
                <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 group-hover:text-amber-900" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    <EditableCompanyName
                      value={f.empresaNome}
                      onSave={(nome) => {
                        updateHistoricoEmpresa(f.id, nome);
                        renameActivitiesByEmpresa(
                          { cnpj: f.cnpj, empresaAntiga: f.empresaNome },
                          nome,
                        );
                        toast.success("Nome da empresa atualizado.");
                      }}
                    />
                  </span>
                  <span className="block text-[11px] text-amber-800/90 dark:text-amber-100/80">
                    <strong>{f.dataFormatada}</strong>
                    {f.contato ? <> · com <strong>{f.contato}</strong></> : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {items.length > 12 && (
            <li className="col-span-full text-xs text-amber-800/80">
              +{items.length - 12} outros follow-ups na janela.
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}


// ============================================================
// Consulta de Histórico por empresa / CNPJ
// ============================================================
export function ConsultarHistoricoCard() {
  const v = useHistoricoVersion();
  const [term, setTerm] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD
  const all = useMemo(() => listHistoricos(), [v]);
  const total = all.length;
  const results = useMemo(() => {
    let list = term ? searchHistoricos(term) : all;
    if (dateFilter) {
      const [y, m, d] = dateFilter.split("-").map((n) => parseInt(n, 10));
      list = list.filter((r) => {
        const dt = new Date(r.dataIso);
        return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
      });
    }
    return list;
  }, [term, dateFilter, v, all]);

  return (
    <Card className="mt-6 border-border/70 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Histórico de Empresas
          <Badge variant="secondary" className="ml-2">
            {total}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Todos os históricos gerados neste navegador. Use a busca ou filtre por uma data específica.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Buscar por nome da empresa ou CNPJ…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="min-w-[220px] flex-1"
          />
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-[170px]"
            title="Filtrar por data específica"
          />
          {(term || dateFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTerm("");
                setDateFilter("");
              }}
            >
              Limpar
            </Button>
          )}
          <Button variant="secondary" onClick={() => setTerm(term.trim())}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Mostrando {results.length} de {total} registro{total !== 1 ? "s" : ""}
          {dateFilter ? ` · dia ${dateFilter.split("-").reverse().join("/")}` : ""}.
        </p>
        <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {results.map((r) => (
            <li key={r.id} className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  <EditableCompanyName
                    value={r.empresaNome}
                    onSave={(nome) => {
                      updateHistoricoEmpresa(r.id, nome);
                      renameActivitiesByEmpresa(
                        { cnpj: r.cnpj, empresaAntiga: r.empresaNome },
                        nome,
                      );
                      toast.success("Nome da empresa atualizado.");
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    {r.dataFormatada}
                    {r.consultor ? ` · ${r.consultor}` : ""}
                    {r.cnpj ? ` · ${r.cnpj}` : ""}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    title={`Excluir apenas ${r.empresaNome} (permite retestar)`}
                    aria-label={`Excluir ${r.empresaNome}`}
                    onClick={() => {
                      const ok = window.confirm(
                        `Remover apenas os registros de "${r.empresaNome}"? As demais empresas ficam intactas.`,
                      );
                      if (!ok) return;
                      const rh = deleteHistoricosByEmpresa({ cnpj: r.cnpj, empresaNome: r.empresaNome });
                      const ra = deleteActivitiesByEmpresa({ cnpj: r.cnpj, empresaNome: r.empresaNome });
                      window.dispatchEvent(new Event("bhm:activities-updated"));
                      toast.success(`"${r.empresaNome}" removida`, {
                        description: `Históricos: ${rh} · Atividades: ${ra}.`,
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {r.contato ? `${r.contato}${r.cargo ? " (" + r.cargo + ")" : ""}` : "—"}
                {r.resultado ? ` · ${r.resultado}` : ""}
                {r.interesse ? ` · Interesse: ${r.interesse}` : ""}
              </div>
              {r.proximaAcao && (
                <div className="mt-1 text-xs">
                  <strong>Próxima ação:</strong> {r.proximaAcao}
                </div>
              )}
              <HistoricoItemDetail reg={r} />
            </li>
          ))}
          {results.length === 0 && (
            <li className="rounded border border-dashed p-3 text-xs text-muted-foreground">
              {term || dateFilter
                ? "Nenhum registro encontrado para os filtros aplicados."
                : "Nenhum histórico salvo ainda. Gere um no Pós-ligação."}
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function HistoricoItemDetail({ reg }: { reg: HistoricoEmpresa }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-primary hover:underline"
      >
        {open ? "Ocultar histórico completo" : "Ver histórico completo"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(reg.textoHistoricoCompleto);
                toast.success("Histórico copiado");
              }}
            >
              <Copy className="mr-1 h-3 w-3" />
              Copiar
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs leading-relaxed">
            {reg.textoHistoricoCompleto}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Relatório Diário Comercial (Everton Pereira)
// ============================================================
function metricRow(label: string, m: PeriodoMetricas) {
  return `• ${label}: ${m.ligacoes} ligações · ${m.decisor} c/ decisor · ${m.reunioes} reuniões · ${m.documentos} documentos/propostas`;
}

export function RelatorioDiarioCard() {
  const v = useHistoricoVersion();
  const [consultor, setConsultorState] = useState<Consultor>("Everton Pereira");
  useEffect(() => {
    // usa sempre o consultor da sessão logada, sem seletor público
    const c = (typeof window !== "undefined" &&
      (window.localStorage.getItem("bhm.session") as Consultor | null)) || getConsultor();
    setConsultorState(c);
    setConsultor(c);
  }, [v]);
  const rel = useMemo(() => calcularRelatorioDiario(new Date(), consultor), [v, consultor]);
  const [obstaculo, setObstaculo] = useState("");
  const [proximoPasso, setProximoPasso] = useState("");


  useEffect(() => {
    setObstaculo(window.localStorage.getItem(`${OBSTACULO_KEY}.${consultor}`) ?? "");
    setProximoPasso(window.localStorage.getItem(`${PROXIMO_KEY}.${consultor}`) ?? "");
  }, [consultor]);

  useEffect(() => {
    window.localStorage.setItem(`${OBSTACULO_KEY}.${consultor}`, obstaculo);
  }, [obstaculo, consultor]);
  useEffect(() => {
    window.localStorage.setItem(`${PROXIMO_KEY}.${consultor}`, proximoPasso);
  }, [proximoPasso, consultor]);

  const hojeData = new Date().toLocaleDateString("pt-BR");

  function linhaEmpresa(e: HistoricoEmpresa, prefix = "  - ") {
    const partes = [
      e.empresaNome,
      e.contato ?? null,
      e.cargo ?? null,
      e.resultado ?? null,
    ].filter(Boolean);
    return `${prefix}${partes.join(" — ")}`;
  }

  function buildTexto(): string {
    const empresas = rel.empresasHoje.length
      ? rel.empresasHoje.map((e) => linhaEmpresa(e)).join("\n")
      : "  - (nenhuma empresa registrada ainda hoje)";
    return [
      "RELATÓRIO DIÁRIO COMERCIAL — BHM Advogados",
      `Consultor: ${consultor}`,
      `Data: ${hojeData}`,
      "",
      "MÉTRICAS",
      metricRow("Hoje", rel.hoje),
      metricRow("Esta semana", rel.semana),
      metricRow("Este mês", rel.mes),
      "",
      `EMPRESAS ABORDADAS HOJE (${rel.empresasHoje.length})`,
      empresas,
      "",
      "MAIOR OBSTÁCULO DO DIA:",
      obstaculo.trim() || "—",
      "",
      "PRÓXIMO PASSO PARA AMANHÃ:",
      proximoPasso.trim() || "—",
    ].join("\n");
  }

  async function copiar() {
    await navigator.clipboard.writeText(buildTexto());
    toast.success("Relatório diário copiado — cole no WhatsApp ou e-mail");
  }

  function buildWhatsApp(): string {
    const m = (label: string, x: PeriodoMetricas) =>
      `- ${label}: ${x.ligacoes} abordagens - ${x.decisor} decisores - ${x.reunioes} reuniões - ${x.documentos} propostas`;
    const empresas = rel.empresasHoje.length
      ? rel.empresasHoje
          .map((e) => {
            const partes = [e.contato, e.cargo, e.resultado].filter(Boolean).join(" — ");
            return `- ${e.empresaNome}${partes ? " — " + partes : ""}`;
          })
          .join("\n")
      : "- Sem empresas registradas hoje.";
    return [
      "RELATÓRIO DIÁRIO COMERCIAL — BHM Advogados",
      `Consultor: ${consultor}`,
      `Data: ${hojeData}`,
      "",
      "Métricas",
      m("Hoje", rel.hoje),
      m("Semana", rel.semana),
      m("Mês", rel.mes),
      "",
      `Empresas abordadas hoje (${rel.empresasHoje.length})`,
      empresas,
      "",
      "Maior obstáculo do dia:",
      obstaculo.trim() || "—",
      "",
      "Próximos passos para amanhã:",
      proximoPasso.trim() || "—",
    ].join("\n");
  }

  async function copiarWhatsApp() {
    await navigator.clipboard.writeText(buildWhatsApp());
    toast.success("Relatório formatado para WhatsApp copiado");
  }


  return (
    <Card className="mt-6 border-border/70 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" />
              Relatório Diário Comercial — {consultor}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {hojeData} · Enviar até <strong>19h15</strong>. Métricas do consultor selecionado.
            </p>
          </div>

        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <MetricasBloco titulo="Hoje" m={rel.hoje} />
          <MetricasBloco titulo="Esta semana" m={rel.semana} />
          <MetricasBloco titulo="Este mês" m={rel.mes} />
        </div>

        <div>
          <Label className="text-xs">
            Empresas abordadas hoje ({rel.empresasHoje.length})
          </Label>
          {rel.empresasHoje.length === 0 ? (
            <p className="mt-1 rounded border border-dashed p-3 text-xs text-muted-foreground">
              Nenhuma empresa registrada hoje para {consultor}. Gere um histórico no Pós-ligação
              para popular esta lista automaticamente.
            </p>
          ) : (
            <ul className="mt-1 max-h-56 space-y-1 overflow-auto rounded border border-border/70 bg-muted/20 p-2 text-xs">
              {rel.empresasHoje.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <strong>{e.empresaNome}</strong>
                    {e.contato ? ` — ${e.contato}` : ""}
                    {e.cargo ? ` — ${e.cargo}` : ""}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {e.resultado ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rel-obstaculo" className="text-xs">
              Maior obstáculo do dia
            </Label>
            <Textarea
              id="rel-obstaculo"
              rows={3}
              value={obstaculo}
              onChange={(e) => setObstaculo(e.target.value)}
              placeholder="Ex.: Muitos leads em férias coletiva"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rel-proximo" className="text-xs">
              Próximo passo para amanhã
            </Label>
            <Textarea
              id="rel-proximo"
              rows={3}
              value={proximoPasso}
              onChange={(e) => setProximoPasso(e.target.value)}
              placeholder="Ex.: Retomar 4 follow-ups agendados e prospectar rota de Maringá"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={copiar}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar (texto)
          </Button>
          <Button onClick={copiarWhatsApp} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Copy className="mr-2 h-4 w-4" />
            Copiar Relatório para WhatsApp
          </Button>

        </div>
      </CardContent>
    </Card>
  );
}

function MetricasBloco({ titulo, m }: { titulo: string; m: PeriodoMetricas }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <span>Ligações</span>
        <span className="text-right font-semibold">{m.ligacoes}</span>
        <span>C/ decisor</span>
        <span className="text-right font-semibold">{m.decisor}</span>
        <span>Reuniões</span>
        <span className="text-right font-semibold">{m.reunioes}</span>
        <span>Documentos</span>
        <span className="text-right font-semibold">{m.documentos}</span>
      </div>
    </div>
  );
}
