import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyTimelineList } from "@/components/company-timeline";
import { fichaDaEmpresa, timelineDaFicha } from "@/lib/company-ficha";
import { FichaEmpresa } from "@/components/empresa-ficha";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ATTEMPT_LABEL,
  AttemptKind,
  FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
  Lead,
  LeadStatus,
  MARCO_LABEL,
  MarcoId,
  ModalidadeColeta,
  STAGE_HINT,
  addBusinessDays,
  archiveLead,
  deleteLead,
  restoreLead,
  addMarco,
  logAttempt,
  scheduleLeadReturn,


  marcoDoStatus,
  reactivateLead,
  pauseLead,
  resumeLead,
  updateLead,
  LeadFollowUp,
  LEAD_FOLLOWUP_CANAL_LABEL,
  addLeadFollowUp,
  completeLeadFollowUp,
  listLeadFollowUps,
  removeLeadFollowUp,
  creditoTotal,
  listComunicacoes,
  registrarComunicacao,

} from "@/lib/leads-store";
import { updateFollowUp } from "@/lib/follow-ups.functions";
import {
  activeConsultor,
  propagateLeadFollowUpClosed,
  remoteFollowUpIdForLead,
} from "@/lib/followup-bridge";
import { OportunidadesBlock } from "@/components/central/oportunidades-block";
import { ResultadoReuniaoDialog } from "@/components/central/resultado-reuniao-dialog";
import { softDeleteHistoricosByEmpresa, restoreHistoricosByEmpresa } from "@/lib/historico-store";
import { generateMeetingMinutes } from "@/lib/prospeccao.functions";

import { Link } from "@tanstack/react-router";

/**
 * Rascunho persistente: nada digitado se perde ao trocar de aba, fechar o
 * diálogo ou navegar. Fica no localStorage por lead + campo.
 */
function useDraft(leadId: string, campo: string) {
  const chave = `bhm-central-draft::${leadId}::${campo}`;
  const [valor, setValor] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    setValor(window.localStorage.getItem(chave) ?? "");
  }, [chave]);
  const update = (v: string) => {
    setValor(v);
    if (typeof window !== "undefined") {
      if (v.trim()) window.localStorage.setItem(chave, v);
      else window.localStorage.removeItem(chave);
    }
  };
  const clear = () => update("");
  return [valor, update, clear] as const;
}

export const MOTIVOS_ARQUIVAMENTO = [

  "Sem fit tributário",
  "Diretoria recusou a proposta",
  "Preço / condição comercial",
  "Já trabalha com outro escritório",
  "Sem interesse no momento",
  "Sem retorno / esfriou",
  "Decisão adiada internamente",
  "Outro",
];

export function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==============================================================
// Google Calendar — mesmo padrão do Relatório (Dr. Bruno sempre convidado)
// ==============================================================
const DR_BRUNO_EMAIL = "brunomorais@brunohenriquemorais.adv.br";

function toGCalUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

export function buildLeadCalendarUrl(lead: Lead): string | null {
  const start = new Date(lead.data_reuniao);
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const details = [
    lead.cnpj ? `CNPJ: ${lead.cnpj}` : null,
    lead.contato ? `Decisor: ${lead.contato}${lead.cargo ? ` (${lead.cargo})` : ""}` : null,
    lead.telefone ? `Telefone: ${lead.telefone}` : null,
    lead.email ? `E-mail: ${lead.email}` : null,
    lead.proximo_passo ? `\nPróximo passo: ${lead.proximo_passo}` : null,
    lead.ultima_observacao ? `\nObservações:\n${lead.ultima_observacao}` : null,
    `\nEnviado pela Central de Reuniões — BHM Advogados.`,
  ]
    .filter(Boolean)
    .join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `REUNIÃO | BHM ADVOGADOS - ${lead.empresa.toUpperCase()}`,
    dates: `${toGCalUtc(start)}/${toGCalUtc(end)}`,
    details,
  });
  [DR_BRUNO_EMAIL, lead.email].filter(Boolean).forEach((g) => params.append("add", g as string));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Dados atualizados da empresa (mesma ficha do Painel Executivo). */
function FichaDoLead({ lead }: { lead: Lead }) {
  const ficha = useMemo(
    () => fichaDaEmpresa(lead.empresa, lead.cnpj),
    [lead.empresa, lead.cnpj, lead.updated_at],
  );
  if (!ficha) return null;
  return <FichaEmpresa ficha={ficha} />;
}

function CalendarButton({ lead }: { lead: Lead }) {
  const url = buildLeadCalendarUrl(lead);
  if (!url) return null;
  const enviado = lead.convite_calendario_em;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={() => updateLead(lead.id, { convite_calendario_em: new Date().toISOString() })}
        title="Abrir Google Calendar já preenchido — revise e envie o convite"
        className={
          enviado
            ? "inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            : "inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
        }
      >
        📅 {enviado ? "Reenviar convite" : "Enviar ao Google Calendar"}
        <span className="font-normal opacity-80">· {fmtDateTime(lead.data_reuniao)}</span>
      </a>
      {enviado && (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
          ✅ Convite enviado em {fmtDateTime(enviado)}
          <button
            type="button"
            className="font-normal text-emerald-700/70 underline"
            onClick={() => updateLead(lead.id, { convite_calendario_em: null })}
          >
            desfazer
          </button>
        </span>
      )}
    </div>
  );
}


const MINUTA_TEMPLATE = `**INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS — BHM ADVOGADOS**


CONTRATANTE: {{empresa}} — CNPJ {{cnpj}}
CONTRATADO: BHM ADVOGADOS ASSOCIADOS

OBJETO: Prestação de serviços jurídico-tributários para recuperação de créditos e revisão fiscal (ICMS/IPI Insumos Intermediários, PIS/COFINS, IRPJ/CSLL).

HONORÁRIOS (SUCCESS FEE): {{percentual}}% sobre o valor efetivamente compensado/restituído. Pagamento em até 5 (cinco) dias úteis contados da compensação/homologação de cada crédito.

VALOR ESTIMADO DO CRÉDITO APURADO: R$ {{valor}}

VIGÊNCIA: 24 meses, renovável automaticamente.
FORO: Comarca da sede do Contratante.`;

type Props = {
  lead: Lead | null;
  onClose: () => void;
  /** Notifica a Central para replicar a mudança no RD Station / recarregar. */
  onStageChange?: (lead: Lead, next: LeadStatus, obs: string) => void;
};

export function LeadDetailDialog({ lead, onClose, onStageChange }: Props) {
  if (!lead) return null;
  const mostraCalendario =
    lead.status === "reuniao_agendada" || lead.status === "pos_reuniao" || lead.status === "pausado";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-navy-deep">{lead.empresa}</DialogTitle>
          <DialogDescription>
            {LEAD_STATUS_LABEL[lead.status]} · {STAGE_HINT[lead.status]}
            {(lead.no_show_count ?? 0) > 0 && lead.status === "reuniao_agendada" ? (
              <span className="ml-2 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                🚑 Resgate · {lead.no_show_count} não comparecimento(s)
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {lead.excluido_em && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <span>
              🗑️ Excluída em {fmtDateTime(lead.excluido_em)}
              {lead.excluido_motivo ? ` — motivo: ${lead.excluido_motivo}` : " — sem motivo informado"}.
              Continua salva com todo o histórico.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
              onClick={() => {
                restoreLead(lead.id);
                restoreHistoricosByEmpresa({ cnpj: lead.cnpj, empresaNome: lead.empresa });
                toast.success("Empresa restaurada — histórico preservado");
                onClose();
              }}
            >
              ↩️ Restaurar
            </Button>
          </div>
        )}

        <Tabs defaultValue="etapa">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="etapa" className="flex-1">
              1. Etapa atual
            </TabsTrigger>
            <TabsTrigger value="dados" className="flex-1">
              2. Dados do lead
            </TabsTrigger>
            <TabsTrigger value="comunicacoes" className="flex-1">
              3. Comunicações
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1">
              4. Evolução
            </TabsTrigger>
          </TabsList>

          {/* ETAPA ATUAL — dados atualizados da empresa primeiro, fluxo depois. */}
          <TabsContent value="etapa" className="mt-4 space-y-4">
            <FichaDoLead lead={lead} />
            {mostraCalendario && <CalendarButton lead={lead} />}
            <StageDetails lead={lead} onStageChange={onStageChange} onClose={onClose} />


            {lead.status === "reuniao_agendada" ? (
              <ResultadoReuniaoDialog lead={lead} onStageChange={onStageChange} onClose={onClose} />
            ) : (
              <StageMover lead={lead} onStageChange={onStageChange} onClose={onClose} />
            )}

            <Collapsible titulo="🗓️ Follow-up interno desta negociação">
              <LeadFollowUpTab lead={lead} />
            </Collapsible>

            <Collapsible titulo="📝 Registrar tentativa de contato (opcional)">
              <p className="mb-2 text-[11px] text-muted-foreground">
                Opcional — serve para deixar rastro. O que você escrever aqui vai direto para a aba
                <strong> Evolução</strong>. Só a anotação do resultado da reunião é obrigatória.
              </p>
              <QuickLog lead={lead} />
            </Collapsible>
          </TabsContent>

          <TabsContent value="dados" className="mt-4">
            <LeadForm lead={lead} />
          </TabsContent>

          <TabsContent value="comunicacoes" className="mt-4">
            <ComunicacoesTab lead={lead} />
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <LeadTimeline lead={lead} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Bloco recolhido por padrão — só a etapa atual fica aberta. */
function Collapsible({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border border-border bg-muted/20 p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// ==============================================================
// Aba Comunicações — tudo que já foi enviado ao cliente.
// Reaproveita a timeline (categoria "comunicacao"), sem estrutura paralela.
// ==============================================================
function ComunicacoesTab({ lead }: { lead: Lead }) {
  const [, force] = useState(0);
  const [canal, setCanal] = useState<"email" | "whatsapp" | "outro">("email");
  const [resumo, setResumo] = useState("");
  const eventos = listComunicacoes(lead);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Registrar comunicação enviada
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Select value={canal} onValueChange={(v) => setCanal(v as typeof canal)}>
            <SelectTrigger className="h-9 w-40 bg-card text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">✉️ E-mail</SelectItem>
              <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
              <SelectItem value="outro">📤 Outro</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="min-w-52 flex-1 bg-card"
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            placeholder="O que foi enviado? Ex.: proposta com honorários de 25%"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!resumo.trim()) {
                toast.error("Descreva o que foi enviado");
                return;
              }
              registrarComunicacao(lead.id, canal, resumo.trim());
              setResumo("");
              force((n) => n + 1);
              toast.success("Comunicação registrada");
            }}
          >
            Registrar
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Enviado ao cliente ({eventos.length})
        </p>
        {lead.ata_enviada_em && (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-xs text-emerald-900">
            📨 Ata da reunião enviada em {fmtDateTime(lead.ata_enviada_em)}
          </p>
        )}
        {eventos.length === 0 ? (
          <p className="mt-2 rounded border border-dashed p-3 text-xs text-muted-foreground">
            Nada registrado ainda — ata, e-mails e mensagens enviadas aparecem aqui.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {eventos.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-muted/20 p-2.5 text-sm">
                <div className="font-medium text-foreground">{e.titulo}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {fmtDateTime(e.at)}
                </div>
                {e.detalhe && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                    {e.detalhe}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


// ==============================================================
// Edição direta dos dados do lead
// ==============================================================
function LeadForm({ lead }: { lead: Lead }) {
  const [form, setForm] = useState({
    empresa: lead.empresa,
    cnpj: lead.cnpj,
    contato: lead.contato ?? "",
    cargo: lead.cargo ?? "",
    telefone: lead.telefone ?? "",
    email: lead.email ?? "",
    rd_deal_id: lead.rd_deal_id ?? "",
    proximo_passo: lead.proximo_passo ?? "",
    data_reuniao: toDatetimeLocal(new Date(lead.data_reuniao)),
    ultima_observacao: lead.ultima_observacao ?? "",
  });

  useEffect(() => {
    setForm({
      empresa: lead.empresa,
      cnpj: lead.cnpj,
      contato: lead.contato ?? "",
      cargo: lead.cargo ?? "",
      telefone: lead.telefone ?? "",
      email: lead.email ?? "",
      rd_deal_id: lead.rd_deal_id ?? "",
      proximo_passo: lead.proximo_passo ?? "",
      data_reuniao: toDatetimeLocal(new Date(lead.data_reuniao)),
      ultima_observacao: lead.ultima_observacao ?? "",
    });
  }, [lead]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Empresa">
          <Input value={form.empresa} onChange={set("empresa")} />
        </Field>
        <Field label="CNPJ">
          <Input value={form.cnpj} onChange={set("cnpj")} />
        </Field>
        <Field label="Decisor / contato">
          <Input value={form.contato} onChange={set("contato")} />
        </Field>
        <Field label="Cargo">
          <Input value={form.cargo} onChange={set("cargo")} />
        </Field>
        <Field label="Telefone">
          <Input value={form.telefone} onChange={set("telefone")} placeholder="(41) 99999-0000" />
        </Field>
        <Field label="E-mail">
          <Input value={form.email} onChange={set("email")} />
        </Field>
        <Field label="ID do negócio (RD Station)">
          <Input value={form.rd_deal_id} onChange={set("rd_deal_id")} />
        </Field>
        <Field label="Próximo compromisso">
          <Input type="datetime-local" value={form.data_reuniao} onChange={set("data_reuniao")} />
        </Field>
      </div>
      <Field label="Próximo passo combinado">
        <Input
          value={form.proximo_passo}
          onChange={set("proximo_passo")}
          placeholder="Ex.: retornar após análise do fiscal"
        />
      </Field>
      <Field label="Última observação">
        <Textarea rows={3} value={form.ultima_observacao} onChange={set("ultima_observacao")} />
      </Field>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          onClick={() => {
            if (!form.empresa.trim()) {
              toast.error("Informe o nome da empresa");
              return;
            }
            updateLead(lead.id, {
              ...form,
              data_reuniao: new Date(form.data_reuniao).toISOString(),
            });
            toast.success("Dados atualizados");
          }}
        >
          Salvar alterações
        </Button>
        {form.telefone && (
          <>
            <Button variant="outline" asChild>
              <a href={`tel:${form.telefone.replace(/\D/g, "")}`}>☎️ Ligar</a>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`https://wa.me/55${form.telefone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                💬 WhatsApp
              </a>
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          className="ml-auto text-rose-600 hover:text-rose-700"
          onClick={() => {
            const motivo = window.prompt(
              `Excluir "${lead.empresa}"? A empresa some da esteira, mas fica salva com todo o histórico e pode ser restaurada depois.\n\nMotivo da exclusão (opcional):`,
            );
            if (motivo === null) return; // cancelou
            deleteLead(lead.id, motivo);
            softDeleteHistoricosByEmpresa({ cnpj: lead.cnpj, empresaNome: lead.empresa }, motivo);
            toast.success("Lead excluído — pode ser restaurado na aba \"Excluídas\"");
          }}
        >
          Excluir
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ==============================================================
// Registro rápido de tentativas / contatos
// ==============================================================
const QUICK_KINDS: AttemptKind[] = [
  "nao_atendeu",
  "em_analise",
  "ata_enviada",
  "retorno_positivo",
  "reagendar",
  "outro",
];

function QuickLog({ lead }: { lead: Lead }) {
  const [detalhe, setDetalhe, limparDetalhe] = useDraft(lead.id, "tentativa");
  const sugestaoFollowUp = useMemo(
    () => toDatetimeLocal(addBusinessDays(new Date(), 2)),
    [],
  );
  const [proxima, setProxima] = useState(sugestaoFollowUp);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Registrar tentativa / contato
      </p>
      <Textarea
        rows={2}
        className="mt-2 bg-card"
        value={detalhe}
        onChange={(e) => setDetalhe(e.target.value)}
        placeholder="O que aconteceu nesta tentativa? (rascunho salvo automaticamente)"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!detalhe.trim()) {
              toast.error("Escreva o que aconteceu antes de salvar");
              return;
            }
            logAttempt(lead.id, "outro", detalhe.trim());
            limparDetalhe();
            toast.success("Registro salvo na Evolução");
          }}
        >
          💾 Salvar registro
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {detalhe.trim() ? "Rascunho guardado — nada se perde ao sair" : "Nada pendente"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              logAttempt(lead.id, k, detalhe.trim() || undefined);
              if (k === "ata_enviada" || k === "reagendar") {
                scheduleLeadReturn(lead.id, new Date(proxima).toISOString());
                toast.success(`${ATTEMPT_LABEL[k]} — próximo retorno em ${fmtDateTime(proxima)}`);
              } else {
                toast.success(`${ATTEMPT_LABEL[k]} — registrado na linha do tempo`);
              }
              limparDetalhe();
            }}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-navy-deep transition hover:bg-accent"
          >
            {ATTEMPT_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1">
          <Label className="text-xs text-muted-foreground">
            Próximo retorno (sugerido: +2 dias úteis)
          </Label>
          <Input
            type="datetime-local"
            className="bg-card"
            value={proxima}
            onChange={(e) => setProxima(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            scheduleLeadReturn(lead.id, new Date(proxima).toISOString(), detalhe.trim() || undefined);
            limparDetalhe();
            toast.success(`Próximo retorno agendado para ${fmtDateTime(proxima)}`);
          }}
        >
          Agendar retorno
        </Button>
      </div>

    </div>
  );
}

// ==============================================================
// Movimentação de fase e arquivamento
// ==============================================================
function StageMover({
  lead,
  onStageChange,
  onClose,
}: {
  lead: Lead;
  onStageChange?: (lead: Lead, next: LeadStatus, obs: string) => void;
  onClose: () => void;
}) {
  const idx = FUNNEL_STAGES.indexOf(lead.status);
  const [obs, setObs, limparObs] = useDraft(lead.id, "mudanca-fase");
  const [motivo, setMotivo] = useState("");
  const arquivado = lead.status === "perdido";

  function move(next: LeadStatus) {
    updateLead(lead.id, {
      status: next,
      ultima_observacao: obs.trim() || lead.ultima_observacao,
    });
    onStageChange?.(lead, next, obs.trim());
    toast.success(`${lead.empresa} → ${LEAD_STATUS_LABEL[next]}`);
    limparObs();
  }


  if (arquivado) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
          Lead arquivado — Reativação futura
        </p>
        <p className="mt-1 text-sm text-emerald-900/80">
          Motivo registrado: {lead.motivo_perda || "não informado"}
        </p>
        <Button
          className="mt-3"
          onClick={() => {
            reactivateLead(lead.id, "reuniao_agendada", obs.trim() || undefined);
            toast.success("Lead reativado na esteira");
            onClose();
          }}
        >
          ♻️ Reativar para nova abordagem
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Mover de fase
      </p>
      <Textarea
        rows={2}
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observação que acompanha a mudança de fase (rascunho salvo automaticamente)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!obs.trim()) {
              toast.error("Escreva a observação antes de salvar");
              return;
            }
            addMarco(lead.id, { titulo: "📝 Observação registrada", detalhe: obs.trim() });
            updateLead(lead.id, { ultima_observacao: obs.trim() });
            limparObs();
            toast.success("Observação salva na Evolução");
          }}
        >
          💾 Salvar observação
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Ao mover de fase, esta observação é gravada junto — indo e voltando, tudo fica na timeline.
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {FUNNEL_STAGES.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => move(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:bg-accent ${
              i === idx
                ? "border-navy-deep bg-navy-deep/10 text-navy-deep"
                : "border-border bg-card text-navy-deep"
            }`}
          >
            {i < idx ? "← " : i > idx ? "→ " : "• "}
            {LEAD_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">

        <Select value={lead.status} onValueChange={(v) => move(v as LeadStatus)}>
          <SelectTrigger className="h-9 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FUNNEL_STAGES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {LEAD_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
          Cliente recusou? Arquive para Reativação Futura (o histórico é preservado)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger className="h-9 w-64 text-xs">
              <SelectValue placeholder="Motivo do arquivamento…" />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS_ARQUIVAMENTO.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={() => {
              if (!motivo) {
                toast.error("Selecione o motivo do arquivamento");
                return;
              }
              archiveLead(lead.id, motivo, obs.trim() || undefined);
              toast.success("Lead movido para Reativação futura");
              onClose();
            }}
          >
            📦 Arquivar para reativação
          </Button>
        </div>
      </div>

      <PauseBlock lead={lead} obs={obs} onDone={onClose} />

      <DeleteBlock lead={lead} onDone={onClose} />
    </div>
  );
}

/** Pausa a negociação sem perdê-la — cliente só adiou a decisão. */
function PauseBlock({ lead, obs, onDone }: { lead: Lead; obs: string; onDone: () => void }) {
  const [data, setData] = useState("");
  if (lead.status === "pausado") {
    return (
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          ⏸️ Pausado até{" "}
          {lead.pausado_ate ? new Date(lead.pausado_ate).toLocaleDateString("pt-BR") : "—"} · estava
          em {LEAD_STATUS_LABEL[lead.fase_antes_pausa ?? "reuniao_agendada"]}
        </p>
        <Button
          size="sm"
          onClick={() => {
            resumeLead(lead.id, obs.trim() || undefined);
            toast.success("Negociação retomada");
            onDone();
          }}
        >
          ▶️ Retomar de onde parou
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        Decisão adiada? Pause e defina quando retomar (não é perda)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="h-9 w-44 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!data) {
              toast.error("Informe a data de retomada");
              return;
            }
            pauseLead(lead.id, new Date(`${data}T09:00:00`).toISOString(), obs.trim() || undefined);
            toast.success("Negociação pausada");
            onDone();
          }}
        >
          ⏸️ Pausar até a data
        </Button>
      </div>
    </div>
  );
}

/** Exclusão — some da esteira, mas fica salva (com histórico) para restaurar depois. */
function DeleteBlock({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <div className="space-y-2 border-t border-dashed border-rose-200 pt-3">
      <p className="text-[11px] text-muted-foreground">
        A empresa sai da esteira ativa, mas continua salva com todo o histórico de ligações — se
        precisar, dá pra restaurar depois na aba "Excluídas".
      </p>
      {confirmando ? (
        <div className="space-y-2">
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo da exclusão (opcional) — ex.: empresa duplicada, dado de teste, contato errado…"
            className="min-h-16 text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                deleteLead(lead.id, motivo);
                softDeleteHistoricosByEmpresa({ cnpj: lead.cnpj, empresaNome: lead.empresa }, motivo);
                toast.success('Lead excluído — pode ser restaurado na aba "Excluídas"');
                onDone();
              }}
            >
              Confirmar exclusão
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="border-rose-300 text-rose-700 hover:bg-rose-50"
          onClick={() => setConfirmando(true)}
        >
          🗑️ Excluir
        </Button>
      )}
    </div>
  );
}

// ==============================================================
// Blocos específicos por etapa (Ata, Coleta, Cálculos, Minuta)
// ==============================================================
function StageDetails({
  lead,
  onStageChange,
  onClose,
}: {
  lead: Lead;
  onStageChange?: (lead: Lead, next: LeadStatus, obs: string) => void;
  onClose?: () => void;
}) {
  const [gerando, setGerando] = useState(false);
  const runAta = useServerFn(generateMeetingMinutes);


  async function gerarAta() {
    try {
      setGerando(true);
      const { ata } = await runAta({
        data: {
          empresa: lead.empresa,
          contato: lead.contato,
          cargo: lead.cargo,
          cnpj: lead.cnpj,
          observacoes: lead.ultima_observacao,
          dataReuniao: lead.data_reuniao,
        },
      });
      updateLead(lead.id, { ata_executiva: ata });
      toast.success("Ata executiva gerada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar ata");
    } finally {
      setGerando(false);
    }
  }

  function setModalidade(m: ModalidadeColeta) {
    updateLead(lead.id, { modalidade_coleta: m, status: "levantamento_docs" });
    toast.success(m === "procuracao_ecac" ? "Via Procuração e-CAC definida" : "Via Arquivos TXT definida");
  }

  if (lead.status === "reuniao_agendada" || lead.status === "resgate_reuniao") {
    return (
      <div className="space-y-3">
        {(lead.no_show_count ?? 0) > 0 && (
          <p className="rounded-xl border border-orange-200 bg-orange-50/60 p-2 text-xs font-medium text-orange-800">
            🚑 Resgate de reunião — {lead.no_show_count} não comparecimento(s) registrado(s).
          </p>
        )}
        <AtaBlock lead={lead} gerando={gerando} onGerar={gerarAta} />
      </div>
    );
  }

  if (lead.status === "pos_reuniao") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <span className="text-xs text-muted-foreground">Modalidade de coleta:</span>
          <Button size="sm" variant="outline" onClick={() => setModalidade("procuracao_ecac")}>
            📄 Procuração e-CAC
          </Button>
          <Button size="sm" variant="outline" onClick={() => setModalidade("arquivos_txt")}>
            📁 Arquivos TXT (SPED 5 anos)
          </Button>
        </div>
        <AtaBlock lead={lead} gerando={gerando} onGerar={gerarAta} />
      </div>
    );
  }

  if (lead.status === "levantamento_docs") {
    return <DocsBlock lead={lead} onModalidade={setModalidade} />;
  }

  if (lead.status === "apresentacao_calculos") {
    return (
      <div className="space-y-3">
        <OportunidadesBlock lead={lead} />
        <DecisaoBlock lead={lead} onStageChange={onStageChange} onClose={onClose} />
      </div>
    );
  }


  if (lead.status === "fechado") {
    const minuta = MINUTA_TEMPLATE.replaceAll("{{empresa}}", lead.empresa)
      .replaceAll("{{cnpj}}", lead.cnpj || "—")
      .replaceAll("{{percentual}}", String(lead.percentual_honorarios ?? 25))
      .replaceAll(
        "{{valor}}",
        creditoTotal(lead).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      );
    return (
      <div className="space-y-3">
        <OportunidadesBlock lead={lead} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-emerald-900">🏆 Minuta de contrato</div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px]">Contrato assinado em</Label>
              <Input
                type="date"
                className="h-8 w-40 bg-card text-xs"
                defaultValue={lead.contrato_assinado_em?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  updateLead(lead.id, {
                    contrato_assinado_em: e.target.value
                      ? new Date(`${e.target.value}T12:00:00`).toISOString()
                      : undefined,
                  })
                }
              />
            </div>
          </div>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-card p-2 leading-relaxed">
            {minuta}
          </pre>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              navigator.clipboard.writeText(minuta);
              toast.success("Minuta copiada");
            }}
          >
            Copiar minuta
          </Button>
        </div>
      </div>
    );
  }


  return (
    <p className="text-sm text-muted-foreground">
      {STAGE_HINT[lead.status]}
    </p>
  );
}

/**
 * Ata da reunião — bloco de notas: cada "Salvar" cria uma nova entrada
 * (texto e/ou arquivo anexado), sem apagar as anteriores.
 */
function AtaBlock({
  lead,
  gerando,
  onGerar,
}: {
  lead: Lead;
  gerando: boolean;
  onGerar: () => void;
}) {
  const [texto, setTexto] = useState(lead.ata_executiva ?? "");
  useEffect(() => setTexto(lead.ata_executiva ?? ""), [lead.id, lead.ata_executiva]);
  const [anexo, setAnexo] = useState<{ nome: string; tipo: string; dados: string } | null>(null);
  const entradas = (lead.ata_entradas ?? [])
    .slice()
    .sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));

  function lerArquivo(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Arquivo muito grande — use até 4 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setAnexo({
        nome: file.name,
        tipo: file.type || "application/octet-stream",
        dados: String(reader.result),
      });
    reader.onerror = () => toast.error("Falha ao ler o arquivo");
    reader.readAsDataURL(file);
  }

  function salvar(): boolean {
    if (!texto.trim() && !anexo) {
      toast.error("Escreva a ata ou anexe um arquivo antes de salvar");
      return false;
    }
    const nova = {
      id: `ata_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      criadoEm: new Date().toISOString(),
      texto: texto.trim() || undefined,
      pdfBase64: anexo?.dados,
      pdfNome: anexo?.nome,
      pdfTipo: anexo?.tipo,
    };
    updateLead(lead.id, {
      ata_entradas: [...(lead.ata_entradas ?? []), nova],
      ata_executiva: texto.trim() || lead.ata_executiva,
    });
    setAnexo(null);
    return true;
  }

  function baixar(nome: string | undefined, dados: string | undefined) {
    if (!dados) return;
    const a = document.createElement("a");
    a.href = dados;
    a.download = nome || "ata";
    a.click();
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
          📄 Ata da reunião — bloco de notas ({entradas.length})
        </p>
        <Button size="sm" variant="outline" onClick={onGerar} disabled={gerando}>
          {gerando ? "Gerando…" : "✨ Gerar rascunho com IA"}
        </Button>
      </div>
      <Textarea
        rows={6}
        className="bg-card text-xs leading-relaxed"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva a nova anotação da ata (ou gere o rascunho com IA). Pode deixar em branco se for só anexar o arquivo."
      />

      <div className="rounded-lg border border-amber-200 bg-card p-2">
        {anexo ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-amber-900">📎 {anexo.nome}</span>
            <span className="text-muted-foreground">pronto para salvar nesta entrada</span>
            <Button size="sm" variant="ghost" onClick={() => setAnexo(null)}>
              Remover
            </Button>
          </div>
        ) : (
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="cursor-pointer rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-900">
              📎 Anexar arquivo (PDF, DOC…)
            </span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,application/pdf"
              onChange={(e) => lerArquivo(e.target.files?.[0])}
            />
            Opcional — vai junto da entrada que você salvar.
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (salvar()) toast.success("Nova entrada de ata salva");
          }}
        >
          💾 Salvar entrada
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const temEntrada = entradas.length > 0;
            if (texto.trim() || anexo) {
              if (!salvar()) return;
            } else if (!temEntrada) {
              toast.error("Escreva a ata ou anexe o arquivo antes de marcar como enviada");
              return;
            }
            logAttempt(lead.id, "ata_enviada");
            toast.success("Ata marcada como enviada — registrada em Comunicações");
          }}
        >
          📨 Ata enviada
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!texto.trim()}
          onClick={() => {
            navigator.clipboard.writeText(texto);
            toast.success("Ata copiada");
          }}
        >
          Copiar texto
        </Button>
        <span className="text-[11px] text-amber-900/80">
          Enviada em: {fmtDateTime(lead.ata_enviada_em)}
        </span>
      </div>

      {entradas.length > 0 && (
        <ul className="space-y-2">
          {entradas.map((e) => (
            <li key={e.id} className="rounded-lg border border-amber-200 bg-card p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                  🗒️ {fmtDateTime(e.criadoEm)}
                </span>
                <div className="flex items-center gap-1">
                  {e.pdfBase64 && (
                    <Button size="sm" variant="outline" onClick={() => baixar(e.pdfNome, e.pdfBase64)}>
                      ⬇️ {e.pdfNome ?? "Baixar"}
                    </Button>
                  )}
                  {e.texto && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(e.texto ?? "");
                        toast.success("Entrada copiada");
                      }}
                    >
                      Copiar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      updateLead(lead.id, {
                        ata_entradas: (lead.ata_entradas ?? []).filter((x) => x.id !== e.id),
                      });
                      toast.success("Entrada removida");
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </div>
              {e.texto && (
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
                  {e.texto}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


/** Levantamento de docs — modalidade de coleta + prazo de 5 a 7 dias úteis. */
function DocsBlock({
  lead,
  onModalidade,
}: {
  lead: Lead;
  onModalidade: (m: ModalidadeColeta) => void;
}) {
  const modalidadeLabel =
    lead.modalidade_coleta === "arquivos_txt"
      ? "📁 Arquivos TXT — SPED Fiscal e Contribuições dos últimos 5 anos"
      : lead.modalidade_coleta === "procuracao_ecac"
        ? "📄 Procuração e-CAC — liberação de acesso (G2 Consulting, CNPJ 62.633.741/0001-67)"
        : "⚠ Modalidade ainda não definida";

  const recebidos = lead.docs_recebidos_em ? new Date(lead.docs_recebidos_em) : null;
  const inicio = recebidos ? addBusinessDays(recebidos, 5) : null;
  const limite = recebidos ? addBusinessDays(recebidos, 7) : null;
  const diasRestantes = limite
    ? Math.ceil((limite.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const tom =
    diasRestantes == null
      ? "border-indigo-200 bg-indigo-50/60"
      : diasRestantes < 0
        ? "border-rose-300 bg-rose-50"
        : diasRestantes <= 2
          ? "border-amber-300 bg-amber-50"
          : "border-emerald-200 bg-emerald-50/60";

  return (
    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm">
      <div className="font-semibold text-indigo-900">Modalidade de coleta</div>
      <div className="text-indigo-900/90">{modalidadeLabel}</div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => onModalidade("procuracao_ecac")}>
          📄 e-CAC
        </Button>
        <Button size="sm" variant="outline" onClick={() => onModalidade("arquivos_txt")}>
          📁 SPED / TXT
        </Button>
        <Button
          size="sm"
          onClick={() => {
            updateLead(lead.id, { docs_recebidos_em: new Date().toISOString() });
            toast.success("Documentos recebidos — prazo de 5 a 7 dias úteis iniciado");
          }}
        >
          ✅ Confirmar recebimento dos documentos
        </Button>
      </div>

      <div className={`rounded-lg border p-2.5 text-xs ${tom}`}>
        {recebidos && inicio && limite ? (
          <>
            <p className="font-semibold text-navy-deep">
              📊 Cálculo previsto entre {inicio.toLocaleDateString("pt-BR")} e{" "}
              {limite.toLocaleDateString("pt-BR")} (5 a 7 dias úteis)
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Documentos recebidos em {fmtDateTime(lead.docs_recebidos_em)} ·{" "}
              {diasRestantes! < 0
                ? `⚠ prazo vencido há ${Math.abs(diasRestantes!)} dia(s)`
                : diasRestantes === 0
                  ? "⏰ vence hoje"
                  : `faltam ${diasRestantes} dia(s)`}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Aguardando arquivos/procuração para iniciar o prazo interno de 5 a 7 dias úteis.
          </p>
        )}
      </div>

      <Button
        size="sm"
        disabled={!recebidos}
        onClick={() => {
          updateLead(lead.id, {
            status: "apresentacao_calculos",
            ultima_observacao: "Cálculos concluídos — pronto para apresentação ao cliente.",
          });
          toast.success("Avançado para Apresentação de Cálculos");
        }}
      >
        📊 Cálculo pronto — avançar
      </Button>
    </div>
  );
}

/** Decisão do cliente na fase de cálculos: fechar ou perder (com motivo). */
function DecisaoBlock({
  lead,
  onStageChange,
  onClose,
}: {
  lead: Lead;
  onStageChange?: (lead: Lead, next: LeadStatus, obs: string) => void;
  onClose?: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");

  return (
    <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-purple-900">
        Decisão do cliente sobre os cálculos
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            updateLead(lead.id, {
              status: "fechado",
              ultima_observacao: detalhe.trim() || "Cliente aprovou os cálculos — fechado.",
            });
            onStageChange?.(lead, "fechado", detalhe.trim());
            toast.success("Negociação fechada 🏆");
            onClose?.();
          }}
        >
          🏆 Cliente aprovou — Fechar
        </Button>
      </div>
      <div className="space-y-2 border-t border-purple-200 pt-2">
        <p className="text-xs text-purple-900/80">
          Não fechou? Informe o motivo — ele fica registrado no histórico.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger className="h-9 w-64 bg-card text-xs">
              <SelectValue placeholder="Motivo da não contratação…" />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS_ARQUIVAMENTO.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={() => {
              if (!motivo) {
                toast.error("Selecione o motivo antes de marcar como perdido");
                return;
              }
              archiveLead(lead.id, motivo, detalhe.trim() || undefined);
              onStageChange?.(lead, "perdido", detalhe.trim());
              toast.success("Lead movido para Reativação futura");
              onClose?.();
            }}
          >
            ❌ Não fechou — arquivar com motivo
          </Button>
        </div>
        <Textarea
          rows={2}
          className="bg-card"
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
          placeholder="Detalhe da decisão (opcional para fechar, recomendado para perda)"
        />
      </div>
    </div>
  );
}


// ==============================================================
// Timeline cronológica limpa
// ==============================================================
export function LeadTimeline({ lead }: { lead: Lead }) {
  const eventos = [...(lead.timeline ?? [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const marcoAtual = marcoDoStatus(lead.status);

  if (eventos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há marcos registrados para esta negociação.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {([1, 2, 3, 4] as MarcoId[]).map((m) => (
          <span
            key={m}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              m < marcoAtual
                ? "bg-emerald-100 text-emerald-800"
                : m === marcoAtual
                  ? "bg-navy-deep text-white"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {MARCO_LABEL[m]}
          </span>
        ))}
      </div>
      <ol className="space-y-3 border-l-2 border-navy-deep/20 pl-4">
        {eventos.map((e) => (
          <li key={e.id} className="relative text-sm">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-navy-deep" />
            <div className="font-medium text-foreground">{e.titulo}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {fmtDateTime(e.at)} · {MARCO_LABEL[e.marco]}
            </div>
            {e.detalhe && <p className="mt-0.5 text-muted-foreground">{e.detalhe}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ==============================================================
// Aba Follow-up — retornos agendados DENTRO da Central de Reuniões.
// Empresas que já agendaram reunião não voltam para a fila fria: todo o
// histórico e os próximos retornos ficam concentrados aqui.
// ==============================================================
/** Última linha útil da ata — usada para pré-preencher "o que ficou combinado". */
function combinadoDaAta(lead: Lead): string {
  const linhas = (lead.ata_executiva ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
    .filter((l) => l.length > 3);
  const proximo = linhas.find((l) => /pr[oó]xim|combinad|retorn|enviar|aguard/i.test(l));
  return (proximo ?? linhas[linhas.length - 1] ?? lead.proximo_passo ?? "").slice(0, 180);
}

function LeadFollowUpTab({ lead }: { lead: Lead }) {
  const [quando, setQuando] = useState(() => toDatetimeLocal(addBusinessDays(new Date(), 1)));
  const [canal, setCanal] = useState<LeadFollowUp["canal"]>("ligacao");
  const [assunto, setAssunto] = useState(lead.proximo_passo ?? "");
  const [sync, setSync] = useState(true);
  const [, force] = useState(0);
  const runUpdateFollowUp = useServerFn(updateFollowUp);

  // Concluir/remover aqui também dá baixa no card correspondente em /followup.
  async function encerrarNaTabela(f: LeadFollowUp) {
    const remoteId = remoteFollowUpIdForLead(lead, f);
    if (remoteId) {
      try {
        await runUpdateFollowUp({
          data: { id: remoteId, status: "done", consultor: activeConsultor() },
        });
      } catch {
        /* segue com a baixa local */
      }
    }
    propagateLeadFollowUpClosed(lead, remoteId);
  }

  const followUps = listLeadFollowUps(lead);
  const pendentes = followUps.filter((f) => !f.done);
  const concluidos = followUps.filter((f) => f.done).reverse();
  const agora = Date.now();

  function agendar() {
    const data = new Date(quando);
    if (!Number.isFinite(data.getTime())) {
      toast.error("Informe uma data válida");
      return;
    }
    if (!assunto.trim()) {
      toast.error("Descreva o que ficou combinado");
      return;
    }
    addLeadFollowUp(lead.id, {
      scheduled_at: data.toISOString(),
      canal,
      assunto: assunto.trim(),
      sincronizarCompromisso: sync,
    });
    force((n) => n + 1);
    toast.success(`Follow-up registrado para ${fmtDateTime(data.toISOString())}`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Agendar follow-up desta negociação
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Quando">
            <Input
              type="datetime-local"
              className="bg-card"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
          </Field>
          <Field label="Canal">
            <Select value={canal} onValueChange={(v) => setCanal(v as LeadFollowUp["canal"])}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LEAD_FOLLOWUP_CANAL_LABEL) as LeadFollowUp["canal"][]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {LEAD_FOLLOWUP_CANAL_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-3 space-y-3">
          <Field label="O que ficou combinado">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="flex-1 bg-card"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Ex.: retornar após o fiscal separar os TXTs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const combinado = combinadoDaAta(lead);
                  if (!combinado) {
                    toast.error("Sem ata registrada ainda para puxar o combinado");
                    return;
                  }
                  setAssunto(combinado);
                  toast.success("Puxado da ata");
                }}
              >
                📄 Puxar da ata
              </Button>
            </div>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={agendar}>Registrar follow-up</Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />
            Atualizar também o próximo compromisso do lead
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Estes retornos ficam apenas aqui — não entram na fila de prospecção fria.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Follow-ups pendentes ({pendentes.length})
        </p>
        {pendentes.length === 0 ? (
          <p className="mt-2 rounded border border-dashed p-3 text-xs text-muted-foreground">
            Nenhum retorno pendente para esta empresa.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pendentes.map((f) => {
              const atrasado = +new Date(f.scheduled_at) < agora;
              return (
                <li
                  key={f.id}
                  className={`rounded-lg border p-2.5 ${
                    atrasado ? "border-rose-200 bg-rose-50/60" : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-navy-deep">
                      {LEAD_FOLLOWUP_CANAL_LABEL[f.canal]}
                    </span>
                    <span className={atrasado ? "font-semibold text-rose-700" : "text-muted-foreground"}>
                      {fmtDateTime(f.scheduled_at)}
                      {atrasado ? " · atrasado" : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{f.assunto}</p>
                  {f.notas && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                      {f.notas}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        completeLeadFollowUp(lead.id, f.id);
                        void encerrarNaTabela(f);
                        force((n) => n + 1);
                        toast.success("Follow-up concluído");
                      }}
                    >
                      ✅ Concluir
                    </Button>
                    {lead.telefone && (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={
                            f.canal === "whatsapp"
                              ? `https://wa.me/55${lead.telefone.replace(/\D/g, "")}`
                              : `tel:${lead.telefone.replace(/\D/g, "")}`
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          {f.canal === "whatsapp" ? "💬 WhatsApp" : "☎️ Ligar"}
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => {
                        removeLeadFollowUp(lead.id, f.id);
                        void encerrarNaTabela(f);
                        force((n) => n + 1);
                        toast.success("Follow-up removido");
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {concluidos.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
              Ver follow-ups concluídos ({concluidos.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {concluidos.map((f) => (
                <li key={f.id} className="rounded border border-border/70 p-2 text-xs">
                  <span className="text-muted-foreground">
                    {fmtDateTime(f.scheduled_at)} · {LEAD_FOLLOWUP_CANAL_LABEL[f.canal]}
                  </span>
                  <p className="text-foreground">{f.assunto}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <LeadTimelineRica lead={lead} />

      <Link
        to="/empresas"
        search={{ q: lead.empresa }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/10"
      >
        Ver histórico completo de {lead.empresa} na Visão 360° →
      </Link>
    </div>
  );
}


// Mesma linha do tempo rica do Follow-up frio / Painel Executivo (company-ficha
// + company-timeline). timelineDaFicha já inclui os follow-ups internos e os
// marcos da Central, então nada é duplicado aqui.
function LeadTimelineRica({ lead }: { lead: Lead }) {
  const items = useMemo(() => {
    try {
      const ficha = fichaDaEmpresa(lead.empresa, lead.cnpj);
      return ficha ? timelineDaFicha(ficha) : [];
    } catch {
      return [];
    }
  }, [lead]);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        🧭 Linha do tempo da empresa ({items.length})
      </p>
      <CompanyTimelineList items={items} />
    </div>
  );
}

