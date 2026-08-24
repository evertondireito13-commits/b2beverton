import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "./index";
import { CentralReunioes } from "@/components/central-reunioes";
import { LeadsCentralPanel } from "@/components/leads-central-panel";

export const Route = createFileRoute("/reunioes")({
  head: () => ({
    meta: [
      { title: "Central de Reuniões — BHM" },
      { name: "description", content: "Agendamentos, realizações e cancelamentos de reuniões comerciais." },
    ],
  }),
  component: ReunioesPage,
});

function ReunioesPage() {
  return (
    <AppShell current="reunioes">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h1 className="mb-1 text-lg font-semibold tracking-tight text-navy-deep">
            Central de Reuniões — Pipeline de Leads
          </h1>
          <p className="mb-3 text-xs text-muted-foreground">
            Funil visual por fase: clique no card para editar dados do decisor, registrar
            tentativas (não atendeu, ata enviada, em análise), mover de fase ou arquivar para
            Reativação Futura — sempre preservando a timeline da negociação.
          </p>
          <LeadsCentralPanel />
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-navy-deep">
            Agenda & Negociações
          </h2>
          <CentralReunioes />
        </div>
      </div>
    </AppShell>
  );
}
