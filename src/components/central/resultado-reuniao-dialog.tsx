// Registro estruturado do resultado da reunião.
// Substitui o StageMover genérico apenas quando o lead está em "reuniao_agendada".
// O StageMover continua valendo para as demais fases do funil.

import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ChevronDown } from "lucide-react";
import { classificarResultadoReuniao } from "@/lib/resultado-reuniao.functions";
import { OPCOES_RESULTADO, type ResultadoId } from "@/lib/resultado-reuniao-opcoes";
import {
  Lead,
  LeadStatus,
  addMarco,
  addBusinessDays,
  pauseLead,
  updateLead,
} from "@/lib/leads-store";

/**
 * Lembrete exibido no cenário "Aceite imediato".
 * TEXTO PROVISÓRIO — editar aqui quando o texto final chegar.
 */
export const LEMBRETE_ACEITE_IMEDIATO =
  "lembrar de solicitar liberação e-CAC / G2 Consulte";

/** Quem pode ficar responsável por avaliar a proposta durante a pausa. */
export const AVALIADORES = ["Sócios/Diretoria", "Contabilidade Externa", "Jurídico Externo"];

const OPCOES = OPCOES_RESULTADO;

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ResultadoReuniaoDialog({
  lead,
  onStageChange,
  onClose,
}: {
  lead: Lead;
  onStageChange?: (lead: Lead, next: LeadStatus, obs: string) => void;
  onClose: () => void;
}) {
  const [obs, setObs] = useState("");
  const [resultado, setResultado] = useState<ResultadoId | "">("");
  const [avaliadores, setAvaliadores] = useState<string[]>([]);
  const [pausaAte, setPausaAte] = useState("");
  const [novaData, setNovaData] = useState(toDatetimeLocal(addBusinessDays(new Date(), 2)));
  const [listaAberta, setListaAberta] = useState(true);
  const [detectando, setDetectando] = useState(false);
  const [sugestao, setSugestao] = useState<string>("");
  const detectar = useServerFn(classificarResultadoReuniao);

  /** Base da análise: o relato manual ou, se vazio, a ata/rascunho já registrado. */
  const baseAnalise = (obs.trim() || (lead.ata_executiva ?? "").trim()).trim();

  async function detectarAutomaticamente() {
    const texto = baseAnalise;
    if (texto.length < 10) {
      toast.error("Sem ata registrada — escreva um resumo curto para a IA analisar");
      return;
    }
    setDetectando(true);
    setSugestao("");
    try {
      const r = await detectar({ data: { texto, empresa: lead.empresa } });
      if (!r.ok || !r.resultado) {
        toast.error(r.motivo ?? "Não consegui identificar — escolha manualmente");
        setListaAberta(true);
        return;
      }
      setResultado(r.resultado);
      const rotulo = OPCOES.find((o) => o.id === r.resultado)?.rotulo ?? r.resultado;
      setSugestao(
        `${rotulo} · confiança ${r.confianca ?? "media"}${r.justificativa ? ` — ${r.justificativa}` : ""}`,
      );
      toast.success(`Sugestão da IA: ${rotulo} — confirme ou troque`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao detectar");
      setListaAberta(true);
    } finally {
      setDetectando(false);
    }
  }

  function toggleAvaliador(nome: string) {
    setAvaliadores((prev) =>
      prev.includes(nome) ? prev.filter((a) => a !== nome) : [...prev, nome],
    );
  }

  function confirmar() {
    const anotacao = obs.trim() || (lead.ata_executiva ?? "").trim().slice(0, 600);
    if (!anotacao) {
      toast.error("Registre a ata ou escreva um resumo curto do que aconteceu");
      return;
    }
    if (!resultado) {
      toast.error("Escolha o que aconteceu na reunião");
      return;
    }
    if (resultado === "aprovacao_pendente" && avaliadores.length === 0) {
      toast.error("Marque quem vai avaliar a proposta");
      return;
    }

    const move = (next: LeadStatus, patch: Partial<Lead> = {}) => {
      updateLead(lead.id, { status: next, ultima_observacao: anotacao, ...patch });
      onStageChange?.(lead, next, anotacao);
    };

    switch (resultado) {
      case "aceite_imediato":
        move("levantamento_docs");
        addMarco(lead.id, {
          status: "levantamento_docs",
          titulo: "✅ Aceite imediato na reunião",
          detalhe: `${anotacao} · ${LEMBRETE_ACEITE_IMEDIATO}`,
        });
        toast.success(`Aceite registrado — ${LEMBRETE_ACEITE_IMEDIATO}`);
        break;
      case "recusa_imediata":
        move("perdido", { motivo_perda: anotacao });
        addMarco(lead.id, { status: "perdido", titulo: "❌ Recusa na reunião", detalhe: anotacao });
        toast.success("Recusa registrada — lead arquivado");
        break;
      case "aprovacao_pendente":
        pauseLead(lead.id, null, anotacao, avaliadores);
        toast.success(`Pausado — avaliação com ${avaliadores.join(", ")}`);
        break;
      case "timing_inadequado":
        pauseLead(lead.id, pausaAte ? new Date(pausaAte).toISOString() : null, anotacao);
        toast.success(
          pausaAte ? "Pausado com data de retomada" : "Pausado sem data — defina depois",
        );
        break;
      case "reagendamento":
        updateLead(lead.id, {
          data_reuniao: new Date(novaData).toISOString(),
          ultima_observacao: anotacao,
        });
        toast.success("Reunião reagendada");
        break;
      case "no_show":
        updateLead(lead.id, {
          no_show_count: (lead.no_show_count ?? 0) + 1,
          ultima_observacao: anotacao,
        });
        addMarco(lead.id, {
          titulo: `👻 No-show #${(lead.no_show_count ?? 0) + 1} — não compareceu sem avisar`,
          detalhe: anotacao,
        });
        toast.success("No-show registrado");
        break;
      case "sem_poder_decisao":
        addMarco(lead.id, {
          titulo: "🙋 Reunião com intermediador sem poder de decisão",
          detalhe: anotacao,
        });
        updateLead(lead.id, { ultima_observacao: anotacao });
        toast.success("Marcação registrada na timeline");
        break;
      case "desqualificacao":
        move("nao_qualificado");
        addMarco(lead.id, {
          status: "nao_qualificado",
          titulo: "🚫 Desqualificação técnica (não é recusa comercial)",
          detalhe: anotacao,
        });
        toast.success("Lead marcado como não qualificado");
        break;
      case "fechamento_direto":
        move("fechado", { fechamento_direto: true, contrato_assinado_em: new Date().toISOString() });
        addMarco(lead.id, {
          status: "fechado",
          titulo: "🏆 Fechamento direto na reunião",
          detalhe: anotacao,
        });
        toast.success("Fechamento direto registrado");
        break;
      case "parceria_operacional":
        updateLead(lead.id, {
          tipo_negociacao: "parceria_operacional",
          ultima_observacao: anotacao,
        });
        addMarco(lead.id, {
          titulo: "🤝 Pivotou para parceria operacional",
          detalhe: anotacao,
        });
        toast.success("Tipo de negociação: parceria operacional");
        break;
      case "mudanca_escopo":
        updateLead(lead.id, {
          area_negociacao: "reestruturacao_financeira",
          ultima_observacao: anotacao,
        });
        addMarco(lead.id, {
          titulo: "📉 Mudança de escopo — reestruturação financeira",
          detalhe: `${anotacao} · Coleta passa a pedir Balanços/DRE`,
        });
        toast.success("Escopo alterado para reestruturação financeira");
        break;
    }

    setObs("");
    setResultado("");
    onClose();
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Registrar resultado da reunião
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={detectarAutomaticamente}
          disabled={detectando || baseAnalise.length < 10}
          title="Analisa a ata registrada (ou o resumo escrito abaixo) e sugere a categoria"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {detectando ? "Detectando…" : "Detectar automaticamente"}
        </Button>
      </div>

      {sugestao && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 p-2 text-[11px] text-foreground/80">
          🤖 {sugestao}
        </p>
      )}

      <div className="space-y-2 rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setListaAberta((v) => !v)}
          className="flex w-full items-center justify-between gap-2 p-3 text-left"
        >
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              O que aconteceu? *
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-navy-deep">
              {resultado
                ? OPCOES.find((o) => o.id === resultado)?.rotulo
                : "Escolher (11 opções)"}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              listaAberta ? "rotate-180" : ""
            }`}
          />
        </button>
        {listaAberta && (
          <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
            {OPCOES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setResultado(o.id);
                  setListaAberta(false);
                }}
                className={`rounded-lg border p-2 text-left transition hover:bg-accent ${
                  resultado === o.id
                    ? "border-navy-deep bg-navy-deep/10"
                    : "border-border bg-card"
                }`}
              >
                <span className="block text-xs font-semibold text-navy-deep">{o.rotulo}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{o.descricao}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs">Resumo do que aconteceu (opcional)</Label>
        <Textarea
          rows={3}
          className="mt-1"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder={
            lead.ata_executiva
              ? "Deixe em branco para usar a ata já registrada, ou escreva um complemento…"
              : "Sem ata registrada — escreva aqui o que aconteceu na reunião."
          }
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Se ficar em branco, a timeline usa o texto da ata registrada acima.
        </p>
      </div>

      {resultado === "aceite_imediato" && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-xs font-semibold text-emerald-900">
          🔔 {LEMBRETE_ACEITE_IMEDIATO}
        </p>
      )}

      {resultado === "aprovacao_pendente" && (
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
          <Label className="text-xs">Quem vai avaliar? *</Label>
          {AVALIADORES.map((a) => (
            <label key={a} className="flex items-center gap-2 text-xs text-navy-deep">
              <Checkbox
                checked={avaliadores.includes(a)}
                onCheckedChange={() => toggleAvaliador(a)}
              />
              {a}
            </label>
          ))}
        </div>
      )}

      {resultado === "timing_inadequado" && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <Label className="text-xs">Retomar em (opcional — pode preencher depois)</Label>
          <Input
            type="datetime-local"
            className="mt-1 bg-card"
            value={pausaAte}
            onChange={(e) => setPausaAte(e.target.value)}
          />
        </div>
      )}

      {resultado === "reagendamento" && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <Label className="text-xs">Nova data da reunião</Label>
          <Input
            type="datetime-local"
            className="mt-1 bg-card"
            value={novaData}
            onChange={(e) => setNovaData(e.target.value)}
          />
        </div>
      )}

      <Button className="w-full" onClick={confirmar} disabled={!resultado}>
        Confirmar resultado
      </Button>
    </div>
  );
}
