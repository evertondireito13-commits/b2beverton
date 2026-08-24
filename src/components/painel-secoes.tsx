// Seções analíticas reutilizáveis: pipeline inteligente (Central de Reuniões)
// e produtividade pessoal (Relatórios → Logs de Chamadas).
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { pipelineMetrics, formatBRL } from "@/lib/pipeline-metrics";
import { produtividadeStats, formatDuration } from "@/lib/productivity-store";
import { CARD, TEXT, TONE } from "@/lib/status-tokens";

export function PipelineMetricsSection() {
  const [m, setM] = useState<ReturnType<typeof pipelineMetrics> | null>(null);
  useEffect(() => {
    const refresh = () => setM(pipelineMetrics());
    refresh();
    const evts = ["bhm:leads-updated", "bhm:historico-updated", "bhm:session-changed"];
    evts.forEach((e) => window.addEventListener(e, refresh));
    return () => evts.forEach((e) => window.removeEventListener(e, refresh));
  }, []);
  if (!m) return null;
  return (
    <section className={CARD}>
      <h2 className={`mb-3 ${TEXT.section}`}>📈 Pipeline inteligente — tempo por etapa e conversão</h2>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <Mini label="Ativos" valor={String(m.totalAtivos)} />
        <Mini label="Taxa de fechamento" valor={`${m.taxaFechamento}%`} />
        <Mini label="Ciclo médio" valor={m.cicloMedioDias !== null ? `${m.cicloMedioDias}d` : "—"} />
        <Mini label="Honorários estimados" valor={formatBRL(m.honorariosEstimados)} />
      </div>
      <ul className="space-y-1.5">
        {m.etapas.map((e) => (
          <li key={e.status} className="rounded-lg border border-border/70 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-navy-deep">{e.label}</span>
              <Badge variant="outline">{e.total}</Badge>
              {e.atrasados > 0 && (
                <Badge variant="outline" className={TONE.danger}>
                  {e.atrasados} atrasado(s)
                </Badge>
              )}
              <span className={`ml-auto ${TEXT.meta}`}>
                ⏱ {e.diasMedioAtual}d parados
                {e.diasMedioPassagem !== null ? ` · passagem ${e.diasMedioPassagem}d` : ""}
                {e.conversaoParaProxima !== null ? ` · conversão ${e.conversaoParaProxima}%` : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {m.gargalo && (
        <p className="mt-2 text-[11px] font-medium text-amber-700">
          🚧 Gargalo atual: {m.gargalo.label} — média de {m.gargalo.diasMedioAtual} dias parados.
        </p>
      )}
    </section>
  );
}

export function ProdutividadeSection() {
  const [s, setS] = useState<ReturnType<typeof produtividadeStats> | null>(null);
  useEffect(() => {
    const refresh = () => setS(produtividadeStats());
    refresh();
    const evts = ["bhm:call-timer-updated", "bhm:session-changed"];
    evts.forEach((e) => window.addEventListener(e, refresh));
    return () => evts.forEach((e) => window.removeEventListener(e, refresh));
  }, []);
  if (!s) return null;
  const maxHora = Math.max(1, ...s.porHora.map((h) => h.total));
  return (
    <section className={CARD}>
      <h2 className={`mb-3 ${TEXT.section}`}>⏱ Produtividade pessoal (timer de ligações)</h2>
      <div className="grid gap-2 sm:grid-cols-4">
        <Mini label="Ligações hoje" valor={String(s.ligacoesHoje)} />
        <Mini label="Tempo ao telefone hoje" valor={formatDuration(s.tempoTotalHojeSeg)} />
        <Mini label="Duração média" valor={formatDuration(s.tempoMedioSeg)} />
        <Mini label="Sequência de dias" valor={`${s.streakDias}d 🔥`} />
      </div>
      <div className="mt-3 flex items-end gap-0.5 sm:gap-1">
        {s.porHora.map((h) => (
          <div key={h.hora} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-primary/70 transition-all"
              style={{ height: `${Math.max(3, (h.total / maxHora) * 60)}px` }}
              title={`${h.total} ligação(ões) às ${h.hora}h`}
            />
            <span className="text-[9px] text-muted-foreground">{h.hora}</span>
          </div>
        ))}
      </div>
      <p className={`mt-2 ${TEXT.meta}`}>
        Melhor horário: <strong>{s.melhorHora ?? "—"}</strong> · Melhor dia:{" "}
        <strong>{s.melhorDiaSemana ?? "—"}</strong> · Semana: {s.ligacoesSemana} ligações (
        {formatDuration(s.tempoSemanaSeg)}).
      </p>
    </section>
  );
}

function Mini({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border/70 px-3 py-2">
      <p className={TEXT.label}>{label}</p>
      <p className="text-sm font-bold text-navy-deep">{valor}</p>
    </div>
  );
}
