// Arquivadas — leads marcados como "perdido" (sem interesse ou negociação
// encerrada sem fechamento). Mostra o motivo, o histórico completo daquela
// empresa e permite reativar para uma nova abordagem, que já entra direto na
// Preparação Noturna de hoje.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./index";
import { listLeads, reactivateLead, type Lead } from "@/lib/leads-store";
import { addEmpresaToPreparacaoNoturna } from "@/components/preparacao-noturna";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/arquivadas")({
  head: () => ({
    meta: [
      { title: "Arquivadas · Central de Prospecção" },
      {
        name: "description",
        content:
          "Empresas sem interesse ou negociação encerrada — motivo, histórico completo e reativação para nova abordagem.",
      },
    ],
  }),
  component: ArquivadasPage,
});

function ArquivadasPage() {
  const [tick, setTick] = useState(0);
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("bhm:leads-updated", bump);
    window.addEventListener("bhm:session-changed", bump);
    return () => {
      window.removeEventListener("bhm:leads-updated", bump);
      window.removeEventListener("bhm:session-changed", bump);
    };
  }, []);

  const arquivadas = useMemo(() => {
    void tick;
    return listLeads()
      .filter((l) => l.status === "perdido")
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  }, [tick]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = busca.replace(/\D/g, "");
    if (!q) return arquivadas;
    return arquivadas.filter(
      (l) =>
        l.empresa.toLowerCase().includes(q) ||
        (qDig.length >= 3 && (l.cnpj ?? "").replace(/\D/g, "").includes(qDig)),
    );
  }, [arquivadas, busca]);

  function reativar(lead: Lead) {
    reactivateLead(lead.id, "reuniao_agendada", "Reativado a partir da tela de Arquivadas.");
    addEmpresaToPreparacaoNoturna({
      razaoSocial: lead.empresa,
      cnpj: lead.cnpj || undefined,
      contato: lead.contato || undefined,
      cargo: lead.cargo || undefined,
      telefone: lead.telefone || undefined,
      email: lead.email || undefined,
    });
    toast.success(`${lead.empresa} reativada — adicionada à Preparação Noturna de hoje.`);
  }

  return (
    <AppShell current="arquivadas">
      <div className="mt-4 space-y-4">
        <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h1 className="text-lg font-semibold tracking-tight text-navy-deep">🗄️ Arquivadas</h1>
          <p className="text-xs text-muted-foreground">
            Empresas sem interesse ou com negociação encerrada sem fechamento. O histórico
            completo fica guardado aqui — reative quando quiser tentar de novo.
          </p>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CNPJ…"
            className="mt-3 h-9 max-w-md"
          />
        </header>

        {filtradas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
            {arquivadas.length === 0
              ? "Nenhuma empresa arquivada até agora."
              : "Nenhuma empresa encontrada com esse filtro."}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filtradas.map((lead) => {
              const aberto = expandido === lead.id;
              const timeline = [...(lead.timeline ?? [])].sort(
                (a, b) => +new Date(b.at) - +new Date(a.at),
              );
              return (
                <li
                  key={lead.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-navy-deep">{lead.empresa}</h3>
                        <Badge
                          variant="outline"
                          className="border-rose-200 bg-rose-50 text-rose-700"
                        >
                          ❌ Arquivada
                        </Badge>
                      </div>
                      {lead.cnpj && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          CNPJ {lead.cnpj}
                        </p>
                      )}
                      <p className="mt-1.5 rounded-lg border border-rose-100 bg-rose-50/60 px-2.5 py-1.5 text-[12px] text-rose-800">
                        <strong>Motivo:</strong>{" "}
                        {lead.motivo_perda || lead.ultima_observacao || "Não informado"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Arquivada em {new Date(lead.updated_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Button size="sm" onClick={() => reativar(lead)} className="gap-1">
                        ↩️ Reativar
                      </Button>
                      <button
                        type="button"
                        onClick={() => setExpandido(aberto ? null : lead.id)}
                        className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {aberto ? "Ocultar histórico" : `Ver histórico (${timeline.length})`}
                      </button>
                    </div>
                  </div>

                  {aberto && (
                    <ol className="mt-3 space-y-2 border-l-2 border-border/70 pl-3">
                      {timeline.length === 0 && (
                        <li className="text-[11px] text-muted-foreground">
                          Sem eventos registrados.
                        </li>
                      )}
                      {timeline.map((ev) => (
                        <li key={ev.id} className="relative">
                          <span className="absolute -left-[19px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
                          <p className="text-[11px] font-semibold text-navy-deep">{ev.titulo}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(ev.at).toLocaleString("pt-BR")}
                          </p>
                          {ev.detalhe && (
                            <p className="text-[10px] text-foreground/70">{ev.detalhe}</p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
