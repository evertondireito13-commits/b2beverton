import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Loader2, CheckCircle2, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buscarEmpresasPorTexto,
  TIPOS_SUGERIDOS,
  type EmpresaDescoberta,
} from "@/lib/descoberta-empresas.functions";
import { addEmpresaToPreparacaoNoturna } from "@/components/preparacao-noturna";

export const Route = createFileRoute("/descobrir")({
  head: () => ({
    meta: [
      { title: "Descobrir Empresas — BHM" },
      {
        name: "description",
        content: "Busque empresas por cidade e tipo de negócio usando OpenStreetMap.",
      },
    ],
  }),
  component: DescobrirPage,
});

const UFS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

function DescobrirPage() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<EmpresaDescoberta[] | null>(null);
  const [buscaFeita, setBuscaFeita] = useState<{ tipo: string; cidade: string } | null>(null);
  const [mensagemVazia, setMensagemVazia] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [adicionando, setAdicionando] = useState(false);
  const runBuscar = useServerFn(buscarEmpresasPorTexto);

  function voltar() {
    // Volta para a tela de onde normalmente se chega aqui. Se não houver
    // histórico (ex.: acesso direto pelo link), cai na Preparação Noturna.
    if (window.history.length > 1) window.history.back();
    else navigate({ to: "/preparacao" });
  }

  async function buscar() {
    const tipoLimpo = tipo.trim();
    const cidadeLimpa = cidade.trim();
    if (tipoLimpo.length < 2) {
      toast.error("Digite o tipo de negócio (ex.: metalúrgicas).");
      return;
    }
    if (cidadeLimpa.length < 2) {
      toast.error("Digite a cidade.");
      return;
    }
    setBuscando(true);
    setResultados(null);
    setMensagemVazia(null);
    setSelecionados(new Set());
    try {
      const r = await runBuscar({
        data: { tipo: tipoLimpo, cidade: cidadeLimpa, uf: uf || undefined, limite: 30 },
      });
      setBuscaFeita({ tipo: tipoLimpo, cidade: cidadeLimpa });
      if (!r.ok) {
        setMensagemVazia(r.erro);
        return;
      }
      if (r.resultados.length === 0) {
        setMensagemVazia(
          `Não achei "${r.tipo}" em ${r.cidade} no OpenStreetMap. Tente um termo mais genérico (ex.: "metal" em vez de "metalúrgica de precisão") ou confirme a UF.`,
        );
        return;
      }
      setResultados(r.resultados);
    } catch (err) {
      setMensagemVazia(err instanceof Error ? err.message : "Falha inesperada na busca.");
    } finally {
      setBuscando(false);
    }
  }

  function toggle(i: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function adicionarSelecionadas() {
    if (!resultados || selecionados.size === 0) {
      toast.error("Selecione ao menos uma empresa.");
      return;
    }
    setAdicionando(true);
    try {
      let n = 0;
      for (const i of selecionados) {
        const e = resultados[i];
        if (!e) continue;
        addEmpresaToPreparacaoNoturna({
          razaoSocial: e.nome,
          nome: e.nome,
          telefone: e.telefone,
        });
        n++;
      }
      toast.success(`${n} empresa(s) adicionada(s) à lista de hoje da Preparação Noturna.`);
      setSelecionados(new Set());
    } finally {
      setAdicionando(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-3xl flex-col rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={voltar}
          className="shrink-0"
          title="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-sm font-semibold">Descobrir Empresas</h1>
          <p className="text-[11px] text-muted-foreground">
            Busca por cidade e tipo de negócio via OpenStreetMap — gratuito, sem IA.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3.5">
        <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
          <div className="space-y-1">
            <Label htmlFor="tipo" className="text-[11px]">Tipo de negócio</Label>
            <Input
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void buscar()}
              placeholder='Ex.: "metalúrgicas"'
              disabled={buscando}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cidade" className="text-[11px]">Cidade</Label>
            <Input
              id="cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void buscar()}
              placeholder="Ex.: Curitiba"
              disabled={buscando}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="uf" className="text-[11px]">UF</Label>
            <select
              id="uf"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              disabled={buscando}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">—</option>
              {UFS_BR.map((sigla) => (
                <option key={sigla} value={sigla}>{sigla}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sugestões:
          </span>
          {TIPOS_SUGERIDOS.map((s) => (
            <button
              key={s.consulta}
              type="button"
              onClick={() => setTipo(s.consulta)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
        </div>

        <Button onClick={() => void buscar()} disabled={buscando} className="w-full gap-2">
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {buscando ? "Buscando…" : "Buscar empresas"}
        </Button>
      </div>

      {/* Resultados */}
      <div className="mt-3 flex-1 overflow-y-auto pr-1">
        {mensagemVazia && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-[13px] text-muted-foreground">
            {mensagemVazia}
          </div>
        )}

        {resultados && resultados.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">
                {resultados.length} resultado(s) para <strong>{buscaFeita?.tipo}</strong> em{" "}
                <strong>{buscaFeita?.cidade}</strong>
              </p>
              <button
                type="button"
                onClick={() =>
                  setSelecionados(
                    selecionados.size === resultados.length
                      ? new Set()
                      : new Set(resultados.map((_, i) => i)),
                  )
                }
                className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
              >
                {selecionados.size === resultados.length ? "Desmarcar todas" : "Selecionar todas"}
              </button>
            </div>
            <ul className="space-y-1.5">
              {resultados.map((e, idx) => (
                <li key={idx}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background px-2.5 py-2 hover:border-primary/40">
                    <input
                      type="checkbox"
                      checked={selecionados.has(idx)}
                      onChange={() => toggle(idx)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {e.nome}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[e.endereco, e.telefone].filter(Boolean).join(" · ") || "Sem detalhes adicionais"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              disabled={adicionando || selecionados.size === 0}
              onClick={adicionarSelecionadas}
              className="mt-1 w-full gap-1.5"
            >
              {adicionando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Adicionar {selecionados.size > 0 ? `(${selecionados.size}) ` : ""}à lista de hoje
            </Button>
          </div>
        )}

        {!resultados && !mensagemVazia && !buscando && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-[13px] text-muted-foreground">
            Escolha o tipo de negócio e a cidade acima, ou clique numa sugestão, e depois em "Buscar empresas".
          </div>
        )}
      </div>
    </div>
  );
}
