import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "./index";
import { PreparacaoNoturna } from "@/components/preparacao-noturna";

export const Route = createFileRoute("/preparacao")({
  head: () => ({
    meta: [
      { title: "Preparação Noturna — BHM" },
      { name: "description", content: "Planeje as empresas do dia e envie direto ao Pré-ligação." },
      { property: "og:title", content: "Preparação Noturna — BHM" },
      { property: "og:description", content: "Planeje as empresas do dia e envie direto ao Pré-ligação." },
    ],
  }),
  component: PreparacaoPage,
});

function PreparacaoPage() {
  return (
    <AppShell current="preparacao">
      <PreparacaoNoturna variant="full" />
    </AppShell>
  );
}
