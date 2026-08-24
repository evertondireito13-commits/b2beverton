import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "./index";
import { CentroEstrategiaAuditoria } from "@/components/centro-estrategia";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/estrategia")({
  head: () => ({
    meta: [
      { title: "Centro de Estratégia e Auditoria Comercial · BHM Advogados" },
      {
        name: "description",
        content:
          "Agenda de retornos e exportação executiva de relatórios históricos de prospecção.",
      },
      { property: "og:title", content: "Centro de Estratégia e Auditoria Comercial" },
      {
        property: "og:description",
        content:
          "Agenda de retornos e exportação executiva de relatórios históricos de prospecção.",
      },
    ],
  }),
  component: EstrategiaPage,
});

function EstrategiaPage() {
  return (
    <AppShell current="estrategia">
      <Toaster />
      <CentroEstrategiaAuditoria />
    </AppShell>
  );
}
