import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Loader2, Plus, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buscarEmpresasPorTexto,
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

type Mensagem =
  | { tipo: "usuario"; texto: string }
  | { tipo: "assistente"; texto: string; resultados?: EmpresaDescoberta[] };

function DescobrirPage() {
  const [input, setInput] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      tipo: "assistente",
      texto:
        'Digite o que você procura, no formato "TIPO em CIDADE". Exemplo: "metalúrgicas em Curitiba" ou "transportadoras em Londrina". Os resultados vêm do OpenStreetMap (gratuito) — não usa crédito de IA.',
    },
  ]);
  const [buscando, setBuscando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [adicionando, setAdicionando] = useState(false);
  const runBuscar = useServerFn(buscarEmpresasPorTexto);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || buscando) return;
    setMensagens((m) => [...m, { tipo: "usuario", texto }]);
    setInput("");
    setBuscando(true);
    setSelecionados(new Set());
    try {
      const r = await runBuscar({ data: { consulta: texto, limite: 25 } });
      if (!r.ok) {
        setMensagens((m) => [...m, { tipo: "assistente", texto: r.erro }]);
        return;
      }
      if (r.resultados.length === 0) {
        setMensagens((m) => [
          ...m,
          {
            tipo: "assistente",
            texto: `Não achei "${r.tipo}" em ${r.cidade} no OpenStreetMap. Tente um termo mais genérico (ex.: "metal" em vez de "metalúrgica de precisão").`,
          },
        ]);
        return;
      }
      setMensagens((m) => [
        ...m,
        {
          tipo: "assistente",
          texto: `Achei ${r.resultados.length} resultado(s) para "${r.tipo}" em ${r.cidade}. Marque as que quiser e clique em "Adicionar à lista de hoje".`,
          resultados: r.resultados,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha inesperada na busca.";
      setMensagens((m) => [...m, { tipo: "assistente", texto: msg }]);
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

  function adicionarSelecionadas(resultados: EmpresaDescoberta[]) {
    if (selecionados.size === 0) {
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
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-sm font-semibold">Descobrir Empresas</h1>
          <p className="text-[11px] text-muted-foreground">
            Busca por cidade e tipo de negócio via OpenStreetMap — gratuito, sem IA.
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {mensagens.map((m, i) => (
          <div key={i} className={m.tipo === "usuario" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed " +
                (m.tipo === "usuario"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted/40 text-foreground")
              }
            >
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {m.tipo === "assistente" && m.resultados && (
                <div className="mt-3 space-y-1.5">
                  <ul className="space-y-1.5">
                    {m.resultados.map((e, idx) => (
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
                    onClick={() => adicionarSelecionadas(m.resultados!)}
                    className="mt-1 gap-1.5"
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
            </div>
          </div>
        ))}
        {buscando && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3.5 py-2.5 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Buscando no OpenStreetMap…
            </div>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder='Ex.: "metalúrgicas em Curitiba"'
          disabled={buscando}
          className="flex-1"
        />
        <Button onClick={() => void enviar()} disabled={buscando || !input.trim()} size="icon">
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
