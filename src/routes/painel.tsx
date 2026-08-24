// Painel Executivo — metas, ranking e busca 360° de empresas (unificado).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./index";
import { PainelExecutivo } from "@/components/painel-executivo";
import { CompanySheet, type CompanyTarget } from "@/components/company-timeline-sheet";
import { VolumeDashboard } from "@/components/volume-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { FichaEmpresa } from "@/components/empresa-ficha";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PRIORIDADE_LABEL, PRIORIDADE_TONE } from "@/lib/lead-score";
import { montarFichas } from "@/lib/company-ficha";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Painel Executivo · Central de Prospecção" },
      {
        name: "description",
        content:
          "Metas de ligações, ranking das melhores empresas e busca 360° por CNPJ, telefone, e-mail, cidade ou CNAE.",
      },
      { property: "og:title", content: "Painel Executivo · Central de Prospecção" },
      {
        property: "og:description",
        content: "Metas do dia, semana e mês, ranking de prospecção e ficha completa de cada empresa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search['q'] === "string" ? (search['q'] as string) : undefined,
  }),
  component: PainelPage,
});

function PainelPage() {
  const { q } = Route.useSearch();
  const [companyTarget, setCompanyTarget] = useState<CompanyTarget>(null);
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
  const [busca, setBusca] = useState(q ?? "");
  const [prioridade, setPrioridade] = useState<string>("todas");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  useEffect(() => {
    if (q) setBusca(q);
  }, [q]);

  useEffect(() => {
    setHydrated(true);
    const bump = () => setTick((n) => n + 1);
    const evts = ["bhm:historico-updated", "bhm:leads-updated", "bhm:session-changed", "storage"];
    evts.forEach((e) => window.addEventListener(e, bump));
    return () => evts.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  const buscando = busca.trim().length > 0 || prioridade !== "todas";

  const fichas = useMemo(() => {
    if (!hydrated || !buscando) return [];
    void tick;
    return montarFichas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tick, buscando]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digits = termo.replace(/\D/g, "");
    return fichas.filter((f) => {
      if (prioridade !== "todas" && f.prioridade !== prioridade) return false;
      if (!termo) return true;
      if (f.blobBusca.includes(termo)) return true;
      if (digits.length >= 4 && f.blobBusca.replace(/\D/g, "").includes(digits)) return true;
      return false;
    });
  }, [fichas, busca, prioridade]);

  const atual = filtradas.find((f) => f.key === selecionada) ?? filtradas[0] ?? null;

  return (
    <AppShell current="painel">
      <div className="mt-4 space-y-4">
        <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h1 className="text-lg font-semibold tracking-tight text-navy-deep">Painel Executivo</h1>
          <p className="text-xs text-muted-foreground">
            Metas e ranking do dia. Busque qualquer empresa por nome, CNPJ, telefone, e-mail, cidade,
            CNAE, contato ou observação para ver a ficha completa e a timeline.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar em tudo (CNPJ, telefone, e-mail, cidade, CNAE, observações)…"
              className="h-9 w-full max-w-md"
            />
            <div className="flex flex-wrap gap-1">
              {["todas", "quente", "morno", "frio", "arquivado"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrioridade(p)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    prioridade === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {p === "todas" ? "Todas" : PRIORIDADE_LABEL[p as keyof typeof PRIORIDADE_LABEL]}
                </button>
              ))}
            </div>
            {buscando && (
              <Badge variant="outline" className="ml-auto">
                {filtradas.length} empresa(s)
              </Badge>
            )}
          </div>
        </header>

        {!buscando ? (
          <Tabs defaultValue="geral">
            <TabsList>
              <TabsTrigger value="geral">🎯 Metas & Ranking</TabsTrigger>
              <TabsTrigger value="volume">📊 Volume</TabsTrigger>
            </TabsList>
            <TabsContent value="geral" className="mt-4">
              <PainelExecutivo
                onOpenCompany={(empresa, cnpj) => setCompanyTarget({ empresa, cnpj: cnpj ?? null })}
              />
            </TabsContent>
            <TabsContent value="volume" className="mt-4">
              <VolumeDashboard />
            </TabsContent>
          </Tabs>
        ) : !hydrated ? (

          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ul className="max-h-[70vh] space-y-1.5 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-card">
              {filtradas.length === 0 && (
                <li className="p-6 text-center text-xs text-muted-foreground">
                  Nenhuma empresa encontrada com esses filtros.
                </li>
              )}
              {filtradas.map((f) => (
                <li key={f.key}>
                  <button
                    type="button"
                    onClick={() => setSelecionada(f.key)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      atual?.key === f.key
                        ? "border-primary bg-primary/5"
                        : "border-border/70 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 flex-1 text-xs font-semibold text-navy-deep">
                        {f.empresa}
                      </span>
                      <span className="text-[11px] font-bold text-primary">{f.score}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className={`text-[9px] ${PRIORIDADE_TONE[f.prioridade]}`}>
                        {PRIORIDADE_LABEL[f.prioridade]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {f.historicos.length} interação(ões)
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {atual ? (
              <FichaEmpresa ficha={atual} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
                Selecione uma empresa para ver a ficha completa.
              </div>
            )}
          </div>
        )}
      </div>
      <CompanySheet target={companyTarget} onClose={() => setCompanyTarget(null)} />
    </AppShell>
  );
}
