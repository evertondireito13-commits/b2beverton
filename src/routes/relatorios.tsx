import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "./index";
import { CallLogsReport } from "@/components/relatorios/call-logs-report";
import { DailyReportBoard } from "@/components/relatorios/daily-report";

type Tab = "diario" | "chamadas";

export const Route = createFileRoute("/relatorios")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: search.tab === "chamadas" ? "chamadas" : search.tab === "diario" ? "diario" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Relatórios · Central de Prospecção BHM" },
      {
        name: "description",
        content:
          "Diário de bordo comercial e logs de chamadas em uma única central de relatórios.",
      },
      { property: "og:title", content: "Relatórios · Central de Prospecção BHM" },
      {
        property: "og:description",
        content: "Diário de bordo comercial e logs de chamadas da equipe BHM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/relatorios" });
  const active: Tab = tab ?? "diario";

  const items: { id: Tab; label: string; hint: string }[] = [
    { id: "diario", label: "Diário de Bordo", hint: "Relatório do dia (19h15)" },
    { id: "chamadas", label: "Logs de Chamadas", hint: "Volume, metas e reuniões" },
  ];

  return (
    <AppShell current="relatorio">
      <div className="mb-4 rounded-2xl border border-border bg-card p-1.5 shadow-card">
        <div className="grid grid-cols-2 gap-1">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => navigate({ search: { tab: it.id } })}
              className={`flex flex-col items-center justify-center rounded-xl px-3 py-2.5 text-center transition-all ${
                active === it.id
                  ? "bg-primary text-primary-foreground shadow-elegant"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="text-sm font-semibold">{it.label}</span>
              <span className="mt-0.5 text-[10px] font-medium tracking-wide opacity-80">
                {it.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {active === "diario" ? <DailyReportBoard /> : <CallLogsReport />}
    </AppShell>
  );
}
