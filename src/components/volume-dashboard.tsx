// Dashboard visual de Volume (ligações x reuniões x follow-ups) com zoom Diário/Mensal/Semestral/Anual.
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { PhoneCall, PhoneOff, CalendarCheck, Bell, Building2, Gauge, CalendarRange, CalendarDays } from "lucide-react";
import {
  calcularRelatorioDiario,
  listHistoricos,
  metricasNoIntervalo,
  registroNaoAtendida,
  type HistoricoEmpresa,
} from "@/lib/historico-store";
import { listLeads } from "@/lib/leads-store";
import { getMirroredFollowUps } from "@/lib/followup-bridge";
import { CARD, TEXT } from "@/lib/status-tokens";

type Zoom = "diario" | "mensal" | "semestral" | "anual";

const ZOOMS: { id: Zoom; label: string }[] = [
  { id: "diario", label: "Diário" },
  { id: "mensal", label: "Mensal" },
  { id: "semestral", label: "Semestral" },
  { id: "anual", label: "Anual" },
];

const COR_LIGACOES = "hsl(var(--primary))";
const COR_REUNIOES = "#d4a437";
const COR_FOLLOWUPS = "#2563eb";

type Ponto = { label: string; ligacoes: number; reunioes: number; followups: number };

function buckets(zoom: Zoom, now: Date): { label: string; from: Date; to: Date }[] {
  const out: { label: string; from: Date; to: Date }[] = [];
  if (zoom === "diario") {
    for (let i = 13; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
      out.push({ label: `${String(from.getDate()).padStart(2, "0")}/${String(from.getMonth() + 1).padStart(2, "0")}`, from, to });
    }
  } else if (zoom === "mensal") {
    for (let i = 11; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      out.push({
        label: from.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        from,
        to,
      });
    }
  } else if (zoom === "semestral") {
    const semAtual = now.getMonth() < 6 ? 0 : 1;
    for (let i = 3; i >= 0; i--) {
      const idx = semAtual - i;
      const ano = now.getFullYear() + Math.floor(idx / 2);
      const s = ((idx % 2) + 2) % 2;
      const from = new Date(ano, s === 0 ? 0 : 6, 1);
      const to = new Date(ano, s === 0 ? 6 : 12, 1);
      out.push({ label: `${s === 0 ? "1º sem" : "2º sem"} ${ano}`, from, to });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const ano = now.getFullYear() - i;
      out.push({ label: String(ano), from: new Date(ano, 0, 1), to: new Date(ano + 1, 0, 1) });
    }
  }
  return out;
}

function contarNoIntervalo(datas: number[], from: Date, to: Date) {
  const a = from.getTime();
  const b = to.getTime();
  return datas.filter((t) => t >= a && t < b).length;
}

export function VolumeDashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("diario");

  useEffect(() => {
    setHydrated(true);
    const bump = () => setTick((n) => n + 1);
    const evts = [
      "bhm:historico-updated",
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
    const now = new Date();
    const historicos: HistoricoEmpresa[] = listHistoricos();
    const rel = calcularRelatorioDiario(now);
    const inicioHoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fimHoje = new Date(inicioHoje.getFullYear(), inicioHoje.getMonth(), inicioHoje.getDate() + 1);
    const naoAtendidasHoje = rel.empresasHoje.filter(registroNaoAtendida).length;

    // Fonte real de reuniões: leads da Central com data_reuniao.
    const leads = listLeads();
    const reuniaoDatas = leads
      .map((l) => new Date(l.data_reuniao).getTime())
      .filter((t) => Number.isFinite(t));

    const followUps = getMirroredFollowUps();
    const followUpDatas = followUps
      .map((f) => (f.created_at ? new Date(f.created_at).getTime() : NaN))
      .filter((t) => Number.isFinite(t));

    const reunioesHoje = contarNoIntervalo(reuniaoDatas, inicioHoje, fimHoje);
    const followUpsHoje = contarNoIntervalo(followUpDatas, inicioHoje, fimHoje);

    const empresasComReuniaoHoje = new Set(
      rel.empresasHoje.map((r) => (r.cnpj || r.empresaNome || "").toLowerCase()),
    ).size;
    const mediaReuniaoPorEmpresa =
      empresasComReuniaoHoje > 0 ? reunioesHoje / empresasComReuniaoHoje : 0;

    // Semana / mês com a mesma fonte real de reuniões.
    const inicioSemana = new Date(inicioHoje);
    inicioSemana.setDate(inicioSemana.getDate() - ((inicioSemana.getDay() + 6) % 7));
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const proxMes = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(fimSemana.getDate() + 7);

    const serie: Ponto[] = buckets(zoom, now).map((b) => {
      const m = metricasNoIntervalo(b.from, b.to, historicos);
      return {
        label: b.label,
        ligacoes: m.ligacoes,
        reunioes: contarNoIntervalo(reuniaoDatas, b.from, b.to),
        followups: contarNoIntervalo(followUpDatas, b.from, b.to),
      };
    });

    return {
      rel,
      naoAtendidasHoje,
      reunioesHoje,
      followUpsHoje,
      empresasHoje: empresasComReuniaoHoje,
      mediaReuniaoPorEmpresa,
      semana: {
        ligacoes: rel.semana.ligacoes,
        reunioes: contarNoIntervalo(reuniaoDatas, inicioSemana, fimSemana),
      },
      mes: {
        ligacoes: rel.mes.ligacoes,
        reunioes: contarNoIntervalo(reuniaoDatas, inicioMes, proxMes),
      },
      serie,
      temDados:
        serie.some((p) => p.ligacoes > 0 || p.reunioes > 0 || p.followups > 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tick, zoom]);

  if (!dados) return null;

  return (
    <div className="space-y-4">
      <section className={CARD}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={TEXT.section}>📊 Resumo de hoje</h2>
          <Badge variant="outline">{new Date().toLocaleDateString("pt-BR")}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Quick icon={PhoneCall} label="Ligações" valor={String(dados.rel.hoje.ligacoes)} />
          <Quick icon={PhoneOff} label="Não atendidas" valor={String(dados.naoAtendidasHoje)} />
          <Quick icon={CalendarCheck} label="Reuniões agendadas" valor={String(dados.reunioesHoje)} />
          <Quick icon={Bell} label="Follow-ups criados" valor={String(dados.followUpsHoje)} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Quick small icon={Building2} label="Empresas trabalhadas" valor={String(dados.empresasHoje)} />
          <Quick
            small
            icon={Gauge}
            label="Média reunião/empresa"
            valor={dados.mediaReuniaoPorEmpresa.toFixed(2)}
          />
          <Quick
            small
            icon={CalendarRange}
            label="Semana"
            valor={`${dados.semana.ligacoes} lig · ${dados.semana.reunioes} reun`}
          />
          <Quick
            small
            icon={CalendarDays}
            label="Mês"
            valor={`${dados.mes.ligacoes} lig · ${dados.mes.reunioes} reun`}
          />
        </div>
      </section>

      <section className={CARD}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={TEXT.section}>📈 Linha do tempo — ligações x reuniões x follow-ups</h2>
          <div className="flex flex-wrap gap-1">
            {ZOOMS.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setZoom(z.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  zoom === z.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        {!dados.temDados ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Ainda não há dados suficientes para esta visão.
          </p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dados.serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    fontSize: 12,
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="ligacoes"
                  name="Ligações"
                  fill={COR_LIGACOES}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="reunioes"
                  name="Reuniões agendadas"
                  stroke={COR_REUNIOES}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="followups"
                  name="Follow-ups criados"
                  stroke={COR_FOLLOWUPS}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

function Quick({
  label,
  valor,
  icon: Icon,
  small,
}: {
  label: string;
  valor: string;
  icon?: React.ComponentType<{ className?: string }>;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 px-3 py-2">
      <p className={`flex items-center gap-1.5 ${TEXT.label}`}>
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </p>
      <p className={`${small ? "text-sm" : "text-xl"} font-bold text-navy-deep`}>{valor}</p>
    </div>
  );
}
