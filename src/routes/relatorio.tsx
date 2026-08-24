import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/relatorio")({
  beforeLoad: () => {
    throw redirect({ to: "/relatorios", search: { tab: "chamadas" } });
  },
});
