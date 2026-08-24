// Visão executiva do Follow-up (metas, ranking e agenda de retornos).
// Pipeline inteligente vive na Central de Reuniões; produtividade, em Relatórios.
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Archive } from "lucide-react";
import { toast } from "sonner";
import {
  calcularRelatorioDiario,
  arquivarEmpresaHistorico,
  type PeriodoMetricas,
} from "@/lib/historico-store";
import { rankingProspeccao, PRIORIDADE_LABEL, PRIORIDADE_TONE, type EmpresaScore } from "@/lib/lead-score";
import { iniciarLigacaoParaEmpresa } from "@/lib/pre-ligacao-handoff";
import { useNavigate } from "@tanstack/react-router";
import { CARD, TEXT } from "@/lib/status-tokens";
import { listLeads, isPauseDue, LEAD_STATUS_LABEL } from "@/lib/leads-store";


const META_DIA = 30;
const META_SEMANA = 150;
const META_MES = 600;

export type OpenCompany = (empresa: string, cnpj?: string | null) => void;

// Conta reuniões usando a data real da reunião (Lead.data_reuniao), não uma
// adivinhação por palavra-chave no texto do histórico. Mesma lógica usada
// no dashboard de Volume — mantém os dois consistentes entre si.
function contarReunioesReaisDesde(from: Date): number {
  const a = from.getTime();
  return listLeads().filter((l) => {
    const t = new Date(l.data_reuniao).getTime();
    return Number.isFinite(t) && t >= a;
  }).length;
}

function inicioDoDia(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function inicioDaSemana(d: Date) {
  const x = inicioDoDia(d);
  const diff = (x.getDay() + 6) % 7; // segunda-feira como início
  x.setDate(x.getDate() - diff);
  return x;
}
function inicioDoMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function PainelExecutivo({ onOpenCompany }: { onOpenCompany?: OpenCompany }) {
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setHydrated(true);
    const bump = () => setTick((n) => n + 1);
    const evts = [
      "bhm:historico-updated",
      "bhm:activities-updated",
      "bhm:leads-updated",
      "bhm:followups-updated",
      "bhm:session-changed",
      "storage",
    ];
    evts.forEach((e) => window.addEventListener(e, bump));
    return () => evts.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  const dados = useMemo(() => {
    if (!hydrated) return null;
    void tick;
    const rel = calcularRelatorioDiario();
    const now = new Date();
    return {
      rel,
      ranking: rankingProspeccao(8),
      pausadosVencidos: listLeads().filter(isPauseDue),
      reunioesReais: {
        hoje: contarReunioesReaisDesde(inicioDoDia(now)),
        semana: contarReunioesReaisDesde(inicioDaSemana(now)),
        mes: contarReunioesReaisDesde(inicioDoMes(now)),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tick]);

  if (!dados) return <PainelSkeleton />;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetaCard titulo="Hoje" metricas={dados.rel.hoje} meta={META_DIA} reunioesReais={dados.reunioesReais.hoje} />
        <MetaCard titulo="Semana" metricas={dados.rel.semana} meta={META_SEMANA} reunioesReais={dados.reunioesReais.semana} />
        <MetaCard titulo="Mês" metricas={dados.rel.mes} meta={META_MES} reunioesReais={dados.reunioesReais.mes} />
      </section>

      {dados.pausadosVencidos.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            🔔 Retomar contato — negociações pausadas com data vencida
          </h2>
          <ul className="mt-2 space-y-1">
            {dados.pausadosVencidos.map((l) => (
              <li key={l.id} className="text-xs text-amber-900">
                <strong>{l.empresa}</strong> — estava pausado até{" "}
                {new Date(l.pausado_ate ?? "").toLocaleDateString("pt-BR")}
                {l.fase_antes_pausa ? ` · volta para ${LEAD_STATUS_LABEL[l.fase_antes_pausa]}` : ""}
                {l.pausado_motivo && l.pausado_motivo.length > 0
                  ? ` · avaliação com ${l.pausado_motivo.join(", ")}`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={TEXT.section}>🎯 Ranking — melhores empresas para atacar agora</h2>
          <Badge variant="outline">{dados.ranking.length}</Badge>
        </div>
        {dados.ranking.length === 0 ? (
          <p className={TEXT.body}>
            Nenhuma empresa pontuada ainda. Registre ligações na Pós-ligação para alimentar o score.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {dados.ranking.map((e) => (
              <RankingRow key={e.key} empresa={e} onOpenCompany={onOpenCompany} />
            ))}
          </ul>
        )}
      </section>


    </div>
  );
}

function MetaCard({
  titulo,
  metricas,
  meta,
  reunioesReais,
}: {
  titulo: string;
  metricas: PeriodoMetricas;
  meta: number;
  reunioesReais: number;
}) {
  const pct = Math.min(100, Math.round((metricas.ligacoes / meta) * 100));
  const [aberto, setAberto] = useState(false);
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </span>
        <span className={TEXT.meta}>meta {meta}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-navy-deep">
        {metricas.ligacoes}
        <span className="ml-1 text-sm font-medium text-muted-foreground">ligações</span>
      </p>
      <Progress value={pct} className="mt-2 h-2" />
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="mt-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        {aberto ? "Ocultar detalhes" : "Ver detalhes"}
      </button>
      {aberto && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">Decisor {metricas.decisor}</Badge>
          <Badge variant="outline">Reuniões {reunioesReais}</Badge>
          <Badge variant="outline">Docs {metricas.documentos}</Badge>
        </div>
      )}
    </div>
  );
}


function RankingRow({ empresa, onOpenCompany }: { empresa: EmpresaScore; onOpenCompany?: OpenCompany }) {
  const navigate = useNavigate();

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <button
        type="button"
        className="min-w-0 text-left"
        onClick={() => onOpenCompany?.(empresa.empresa, empresa.cnpj)}
        title="Ver histórico completo da empresa"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`truncate ${TEXT.title} transition-colors hover:text-primary`}>
            {empresa.empresa}
          </span>
          <Badge variant="outline" className={PRIORIDADE_TONE[empresa.prioridade]}>
            {PRIORIDADE_LABEL[empresa.prioridade]}
          </Badge>
          {empresa.tags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
        <p className={`mt-0.5 truncate ${TEXT.meta}`}>{empresa.sugestao}</p>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-bold text-primary">{empresa.score}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            iniciarLigacaoParaEmpresa({
              empresa: empresa.empresa,
              cnpj: empresa.cnpj,
              contato: empresa.contato,
              cargo: empresa.cargo,
            });
            navigate({ to: "/", search: { tab: "pre" } });
          }}
        >
          Ligar
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              aria-label={`Mais ações para ${empresa.empresa}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                if (
                  !confirm(
                    `Arquivar "${empresa.empresa}"? Ela sai do ranking, mas o histórico continua acessível.`,
                  )
                )
                  return;
                const ok = arquivarEmpresaHistorico(empresa.empresa, empresa.cnpj);
                if (ok) toast.success("Empresa arquivada");
                else toast.error("Nenhum histórico encontrado para arquivar");
              }}
            >
              <Archive className="mr-2 h-4 w-4" />
              Arquivar empresa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function PainelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}

