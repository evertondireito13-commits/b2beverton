// Bloco de Cálculos & Honorários dentro da Central de Reuniões.
// Local exato para registrar as teses apuradas (crédito + SELIC), anexar o
// diagnóstico/planilha da empresa e acompanhar honorários BHM + comissão.

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ANEXO_TIPO_LABEL,
  COMISSAO_PADRAO,
  OPORTUNIDADE_SITUACAO_LABEL,
  addAnexo,
  addOportunidade,
  comissaoConsultor,
  creditoTotal,
  honorariosBHM,
  oportunidadeTotal,
  removeAnexo,
  removeOportunidade,
  updateLead,
  updateOportunidade,
  type Lead,
  type LeadAnexo,
  type LeadOportunidade,
} from "@/lib/leads-store";

const brl = (n: number) =>
  `R$ ${(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TESES_SUGERIDAS = [
  "Exclusão do PIS/COFINS da base do PIS/COFINS",
  "Exclusão do ICMS da base do PIS/COFINS",
  "Créditos de insumos PIS/COFINS (Tema 779)",
  "Crédito de ICMS sobre energia/ativo",
  "Exclusão do ICMS-ST da base do PIS/COFINS",
  "IRPJ/CSLL sobre SELIC (Tema 962)",
  "Revisão de INSS / verbas indenizatórias",
];

export function OportunidadesBlock({ lead }: { lead: Lead }) {
  const [tese, setTese] = useState("");
  const [credito, setCredito] = useState("");
  const [selic, setSelic] = useState("");
  const [percTese, setPercTese] = useState("");
  const [anexoTitulo, setAnexoTitulo] = useState("");
  const [anexoUrl, setAnexoUrl] = useState("");
  const [anexoTipo, setAnexoTipo] = useState<LeadAnexo["tipo"]>("diagnostico");

  const oportunidades = lead.oportunidades ?? [];
  const anexos = lead.anexos ?? [];
  const total = creditoTotal(lead);
  const honorarios = honorariosBHM(lead);
  const comissao = comissaoConsultor(lead);

  function salvarTese() {
    if (!tese.trim()) {
      toast.error("Informe o nome da tese");
      return;
    }
    addOportunidade(lead.id, {
      tese: tese.trim(),
      credito: Number(credito) || 0,
      selic: Number(selic) || 0,
      percentual_honorarios: percTese ? Number(percTese) : undefined,
    });
    setTese("");
    setCredito("");
    setSelic("");
    setPercTese("");
    toast.success("Tese registrada nos cálculos");
  }

  function salvarAnexo() {
    if (!anexoTitulo.trim() || !anexoUrl.trim()) {
      toast.error("Informe título e link do material");
      return;
    }
    addAnexo(lead.id, { titulo: anexoTitulo.trim(), url: anexoUrl.trim(), tipo: anexoTipo });
    setAnexoTitulo("");
    setAnexoUrl("");
    toast.success("Material anexado ao lead");
  }

  return (
    <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Resumo titulo="Crédito apurado" valor={brl(total)} />
        <Resumo
          titulo={`Honorários BHM (${lead.percentual_honorarios ?? 25}%)`}
          valor={brl(honorarios)}
        />
        <Resumo
          titulo={`Minha comissão (${lead.comissao_percentual ?? COMISSAO_PADRAO}%)`}
          valor={brl(comissao)}
          destaque
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Honor. %</Label>
            <Select
              value={String(lead.percentual_honorarios ?? 25)}
              onValueChange={(v) => updateLead(lead.id, { percentual_honorarios: Number(v) })}
            >
              <SelectTrigger className="h-8 bg-card text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20%</SelectItem>
                <SelectItem value="25">25%</SelectItem>
                <SelectItem value="30">30%</SelectItem>
                <SelectItem value="35">35%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Comissão %</Label>
            <Input
              type="number"
              className="h-8 bg-card text-xs"
              defaultValue={lead.comissao_percentual ?? COMISSAO_PADRAO}
              onBlur={(e) =>
                updateLead(lead.id, {
                  comissao_percentual: Number(e.target.value) || COMISSAO_PADRAO,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Crédito total direto — usado quando não há teses detalhadas */}
      <div className="rounded-lg border border-purple-200 bg-card p-2">
        <Label className="text-[10px]">💰 Crédito tributário apurado (R$) — valor único</Label>
        <div className="flex items-center gap-2">
          <Input
            key={lead.valor_credito ?? 0}
            type="number"
            step="0.01"
            className="h-8 text-xs"
            placeholder="Ex.: 1431340.03"
            defaultValue={lead.valor_credito ?? ""}
            onBlur={(e) =>
              updateLead(lead.id, { valor_credito: Number(e.target.value) || undefined })
            }
          />
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
            {oportunidades.length > 0 ? "(as teses abaixo têm prioridade)" : "sem teses lançadas"}
          </span>
        </div>
      </div>


      {/* Teses apuradas */}
      <div className="rounded-lg border border-purple-200 bg-card p-2">
        <div className="mb-2 text-xs font-semibold text-purple-900">
          🧮 Teses / oportunidades apuradas
        </div>
        {oportunidades.length === 0 && (
          <p className="mb-2 text-xs text-muted-foreground">
            Nenhuma tese registrada. Lance abaixo cada oportunidade do diagnóstico (crédito + SELIC).
          </p>
        )}
        <div className="space-y-1.5">
          {oportunidades.map((o) => (
            <TeseRow key={o.id} lead={lead} o={o} />
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
          <div>
            <Label className="text-[10px]">Tese</Label>
            <Input
              list="teses-sugeridas"
              className="h-8 text-xs"
              value={tese}
              onChange={(e) => setTese(e.target.value)}
              placeholder="Ex.: Exclusão do PIS/COFINS da base"
            />
            <datalist id="teses-sugeridas">
              {TESES_SUGERIDAS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div>
            <Label className="text-[10px]">Crédito (R$)</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={credito}
              onChange={(e) => setCredito(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px]">SELIC (R$)</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={selic}
              onChange={(e) => setSelic(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[10px]">Honor. % (opc.)</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={percTese}
              onChange={(e) => setPercTese(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" className="h-8" onClick={salvarTese}>
              ➕ Add
            </Button>
          </div>
        </div>
      </div>

      {/* Materiais */}
      <div className="rounded-lg border border-purple-200 bg-card p-2">
        <div className="mb-2 text-xs font-semibold text-purple-900">
          📎 Diagnóstico, planilhas e proposta
        </div>
        <div className="space-y-1">
          {anexos.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-xs"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium text-primary hover:underline"
              >
                {ANEXO_TIPO_LABEL[a.tipo]} · {a.titulo}
              </a>
              <button
                className="text-[11px] text-rose-600 hover:underline"
                onClick={() => removeAnexo(lead.id, a.id)}
              >
                remover
              </button>
            </div>
          ))}
          {anexos.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Cole aqui o link do diagnóstico (HTML), da planilha de oportunidades ou da proposta.
            </p>
          )}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto]">
          <Input
            className="h-8 text-xs"
            placeholder="Título (ex.: Diagnóstico ARGEPASI)"
            value={anexoTitulo}
            onChange={(e) => setAnexoTitulo(e.target.value)}
          />
          <Input
            className="h-8 text-xs"
            placeholder="https://…"
            value={anexoUrl}
            onChange={(e) => setAnexoUrl(e.target.value)}
          />
          <Select value={anexoTipo} onValueChange={(v) => setAnexoTipo(v as LeadAnexo["tipo"])}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ANEXO_TIPO_LABEL) as LeadAnexo["tipo"][]).map((t) => (
                <SelectItem key={t} value={t}>
                  {ANEXO_TIPO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8" onClick={salvarAnexo}>
            Anexar
          </Button>
        </div>
      </div>
    </div>
  );
}

function TeseRow({ lead, o }: { lead: Lead; o: LeadOportunidade }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate font-medium text-navy-deep">{o.tese}</span>
      <span className="tabular-nums text-muted-foreground">
        {brl(o.credito)} + SELIC {brl(o.selic)}
      </span>
      <span className="tabular-nums font-semibold text-purple-900">{brl(oportunidadeTotal(o))}</span>
      <Select
        value={o.situacao}
        onValueChange={(v) =>
          updateOportunidade(lead.id, o.id, { situacao: v as LeadOportunidade["situacao"] })
        }
      >
        <SelectTrigger className="h-7 w-[150px] text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(OPORTUNIDADE_SITUACAO_LABEL) as LeadOportunidade["situacao"][]).map((s) => (
            <SelectItem key={s} value={s}>
              {OPORTUNIDADE_SITUACAO_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        className="text-[11px] text-rose-600 hover:underline"
        onClick={() => removeOportunidade(lead.id, o.id)}
      >
        excluir
      </button>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  destaque,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-2 " +
        (destaque ? "border-emerald-300 bg-emerald-50" : "border-border bg-card")
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div
        className={
          "text-sm font-semibold tabular-nums " +
          (destaque ? "text-emerald-700" : "text-navy-deep")
        }
      >
        {valor}
      </div>
    </div>
  );
}
