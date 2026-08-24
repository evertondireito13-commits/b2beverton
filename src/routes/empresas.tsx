// Rota legada: a Visão 360° foi incorporada ao Painel Executivo (/painel).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/empresas")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search['q'] === "string" ? (search['q'] as string) : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/painel", search: { q: search.q }, replace: true });
  },
});
