import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/relatorio-diario")({
  beforeLoad: () => {
    throw redirect({ to: "/relatorios", search: { tab: "diario" } });
  },
});
