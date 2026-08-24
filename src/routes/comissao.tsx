import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./index";
import {
  COMISSAO_PADRAO,
  LEAD_STATUS_LABEL,
  comissaoConsultor,
  creditoTotal,
  honorariosBHM,
  listLeads,
  LEADS_EVENT,
  type Lead,
} from "@/lib/leads-store";
import { getSessionConsultor, getConsultor } from "@/lib/historico-store";

export const Route = createFileRoute("/comissao")({
  head: () => ({
    meta: [
      { title: "Minha Comissão — BHM Central de Prospecção" },
      {
        name: "description",
        content:
          "Acompanhe honorários da BHM por empresa e sua comissão de 30% sobre cálculos apresentados e contratos assinados.",
      },
      { property: "og:title", content: "Minha Comissão — BHM Central de Prospecção" },
      {
        property: "og:description",
        content: "Projeção de ganhos por empresa conforme cálculos apurados e contratos fechados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComissaoPage,
});

const brl = (n: number) =>
  `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ComissaoPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [consultor, setConsultor] = useState("");

  useEffect(() => {
    const load = () => {
      setLeads(listLeads());
      setConsultor((getSessionConsultor() ?? getConsultor()) || "");
    };
    load();
    window.addEventListener(LEADS_EVENT, load);
    window.addEventListener("bhm:session-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(LEADS_EVENT, load);
      window.removeEventListener("bhm:session-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const linhas = useMemo(
    () =>
      leads
        .filter((l) => creditoTotal(l) > 0 && l.status !== "perdido")
        .map((l) => ({
          lead: l,
          credito: creditoTotal(l),
          honorarios: honorariosBHM(l),
          comissao: comissaoConsultor(l),
          fechado: l.status === "fechado",
        }))
        .sort((a, b) => b.comissao - a.comissao),
    [leads],
  );

  const realizado = linhas.filter((r) => r.fechado);
  const pipeline = linhas.filter((r) => !r.fechado);
  const soma = (arr: typeof linhas, campo: "credito" | "honorarios" | "comissao") =>
    arr.reduce((s, r) => s + r[campo], 0);

  return (
    <AppShell current="comissao">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h1 className="text-lg font-semibold tracking-tight text-navy-deep">
            💰 Minha Comissão {consultor ? `— ${consultor}` : ""}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {COMISSAO_PADRAO}% sobre os honorários da BHM Advogados. Os valores vêm direto das teses
            lançadas na Central de Reuniões (aba Cálculos de cada empresa).
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Card titulo="Crédito em negociação" valor={brl(soma(pipeline, "credito"))} />
            <Card titulo="Honorários BHM (previsto)" valor={brl(soma(pipeline, "honorarios"))} />
            <Card
              titulo="Minha comissão prevista"
              valor={brl(soma(pipeline, "comissao"))}
              tom="amber"
            />
            <Card
              titulo="Minha comissão contratada"
              valor={brl(soma(realizado, "comissao"))}
              tom="emerald"
            />
          </div>
        </div>

        <Tabela titulo="🏆 Contratos assinados" linhas={realizado} />
        <Tabela titulo="📊 Em negociação (cálculos apresentados)" linhas={pipeline} />
      </div>
    </AppShell>
  );
}

function Card({
  titulo,
  valor,
  tom,
}: {
  titulo: string;
  valor: string;
  tom?: "amber" | "emerald";
}) {
  const cls =
    tom === "emerald"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : tom === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-800"
        : "border-border bg-background text-navy-deep";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{titulo}</div>
      <div className="text-base font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

function Tabela({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: {
    lead: Lead;
    credito: number;
    honorarios: number;
    comissao: number;
  }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <h2 className="mb-2 text-sm font-semibold text-navy-deep">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma empresa com cálculos lançados nesta faixa.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-2">Empresa</th>
                <th className="py-1.5 pr-2">Fase</th>
                <th className="py-1.5 pr-2">Teses</th>
                <th className="py-1.5 pr-2 text-right">Crédito</th>
                <th className="py-1.5 pr-2 text-right">Honor. BHM</th>
                <th className="py-1.5 text-right">Minha comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ lead, credito, honorarios, comissao }) => (
                <tr key={lead.id} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-navy-deep">{lead.empresa}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {LEAD_STATUS_LABEL[lead.status]}
                  </td>
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {(lead.oportunidades ?? []).filter((o) => o.situacao !== "descartada").length ||
                      "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{brl(credito)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {brl(honorarios)}{" "}
                    <span className="opacity-60">({lead.percentual_honorarios ?? 25}%)</span>
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-emerald-700">
                    {brl(comissao)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
