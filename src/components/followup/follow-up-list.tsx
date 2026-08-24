// Lista/card compartilhado da fila de Follow-up.
// Usado em /followup (fila completa) e na Agenda (compromissos do dia).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Phone,
  Mail,
  MessageSquare,
  CalendarClock,
  Copy,
  History,
  PhoneCall,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { LeadCard, type LeadCardStatus } from "@/components/lead-card";
import {
  listHistoricos,
  historicoMatchesEmpresa,
  type HistoricoEmpresa,
} from "@/lib/historico-store";
import type { FollowUp } from "@/lib/follow-ups.functions";

type ActionType = FollowUp["action_type"];

export const ACTION_LABEL: Record<ActionType, string> = {
  call: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  meeting: "Reunião",
  negociacao: "Negociação",
  other: "Outro",
};

export function FollowUpList({
  rows,
  now,
  onDone,
  onRemove,
  onEdit,
  onRename,
  onToggleEmail,
  onReschedule,
  onViewHistory,
  onGoToPos,
  emptyLabel,
  bare = false,
}: {
  rows: FollowUp[];
  now: Date;
  onDone: (r: FollowUp) => void;
  onRemove: (r: FollowUp) => void;
  onEdit: (r: FollowUp) => void;
  onRename: (r: FollowUp, novoNome: string) => void | Promise<void>;
  onToggleEmail: (r: FollowUp) => void | Promise<void>;
  onReschedule: (r: FollowUp) => void;
  onViewHistory: (r: FollowUp) => void;
  onGoToPos: (r: FollowUp) => void;
  emptyLabel: string;
  /** Sem o wrapper <Card> (para embutir dentro de outra seção, ex.: Agenda). */
  bare?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);

  const body =
    rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    ) : (
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const enriched = enrichFromHistorico(r);
          const at = new Date(r.scheduled_at).getTime();
          const atrasado = r.status !== "done" && at < startToday.getTime();
          const hoje = r.status !== "done" && !atrasado && at <= endToday.getTime();
          const status: LeadCardStatus =
            r.status === "done"
              ? "done"
              : atrasado
                ? "overdue"
                : enriched.status === "decisor"
                  ? "decisor"
                  : enriched.status === "portaria"
                    ? "portaria"
                    : "pending";
          const acao = ACTION_LABEL[r.action_type];
          const descricao = buildAcaoDescricao(acao, r.contact_person, enriched.cargo);
          const dataStr = fmtDateTime(r.scheduled_at);
          const emailSentAtStr =
            r.email_sent && r.email_sent_at ? fmtDateTime(r.email_sent_at) : null;
          const isExpanded = expandedId === r.id;
          const toggle = () => setExpandedId((cur) => (cur === r.id ? null : r.id));
          const statusLabel =
            r.status === "done"
              ? "Concluído"
              : atrasado
                ? "Atrasado"
                : hoje
                  ? "Hoje"
                  : STATUS_LABELS[status];
          return (
            <div
              key={r.id}
              className={`flex min-w-0 max-w-full flex-col gap-1 rounded-xl ${
                atrasado
                  ? "border-l-4 border-red-500 bg-red-50/40 pl-1 dark:bg-red-950/20"
                  : hoje
                    ? "border-l-4 border-primary pl-1"
                    : ""
              }`}
            >
              <LeadCard
                empresa={r.company_name}
                contato={r.contact_person}
                cargo={enriched.cargo}
                status={status}
                statusLabel={statusLabel}
                interesse={descricao || acao}
                onClick={toggle}
                metaLine={
                  <>
                    <span
                      className={`font-medium ${atrasado ? "text-red-700 dark:text-red-400" : "text-foreground/80"}`}
                    >
                      📅 {dataStr}
                    </span>
                    {r.notes ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle();
                        }}
                        className={`mt-0.5 block w-full max-w-full cursor-pointer rounded text-left text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary ${
                          isExpanded ? "whitespace-pre-wrap break-words" : "truncate"
                        }`}

                        title={isExpanded ? "Recolher detalhes" : "Ver mensagem e histórico completos"}
                      >
                        {isExpanded ? r.notes : r.notes.replace(/\s+/g, " ").trim()}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoToPos(r);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      title="Carrega esta empresa no formulário de Pós-ligação e alterna para a aba"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Iniciar Ligação / Pós-Ligação
                    </button>
                  </>
                }
                extra={
                  r.email_sent ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleEmail(r);
                      }}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 sm:w-auto"
                      title={`${enriched.whatsappContext ? "Mensagem enviada" : "E-mail enviado"}${emailSentAtStr ? ` em ${emailSentAtStr}` : ""} — clique para desmarcar`}
                    >
                      {enriched.whatsappContext ? (
                        <MessageSquare className="h-3.5 w-3.5" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                      {`${enriched.whatsappContext ? "Mensagem enviada" : "E-mail enviado"}${emailSentAtStr ? ` · ${emailSentAtStr}` : ""}`}
                    </button>
                  ) : enriched.whatsappContext ? (
                    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                      {enriched.phone ? (
                        <>
                          <a
                            href={toWhatsAppLink(enriched.phone, extractMensagemSugerida(r.notes))}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                            title={
                              extractMensagemSugerida(r.notes)
                                ? `Abrir WhatsApp com a mensagem sugerida — ${formatPhone(enriched.phone)}`
                                : `Abrir WhatsApp — ${formatPhone(enriched.phone)}`
                            }
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            WhatsApp · {formatPhone(enriched.phone)}
                          </a>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(formatPhone(enriched.phone!)).then(
                                () => toast.success("Número copiado"),
                                () => toast.error("Falha ao copiar"),
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                            title="Copiar número"
                            aria-label="Copiar número"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </>
                      ) : null}
                      {extractMensagemSugerida(r.notes) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(extractMensagemSugerida(r.notes)!).then(
                              () => toast.success("Mensagem copiada"),
                              () => toast.error("Falha ao copiar"),
                            );
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                          title="Copiar a mensagem sugerida do follow-up"
                        >
                          <Copy className="h-3 w-3" />
                          Copiar mensagem
                        </button>
                      ) : null}
                    </div>
                  ) : enriched.emailContext ? (
                    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                      <a
                        href={mailtoLink(r.company_name, r.notes)}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                        title="Abrir o e-mail já com assunto e mensagem preenchidos"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Abrir e-mail
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleEmail(r);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                        title="Você combinou de enviar e-mail — marque quando enviar"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        E-mail enviado?
                      </button>
                    </div>
                  ) : null
                }
                actions={
                  <>
                    {enriched.phone ? (
                      <>
                        <a
                          href={`tel:+55${enriched.phone.replace(/\D/g, "")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted-foreground/70 transition hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-8"
                          title={`Discar ${formatPhone(enriched.phone)} (softphone/Skype/MicroSIP)`}
                          aria-label="Discar número"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href={toWhatsAppLink(enriched.phone, extractMensagemSugerida(r.notes))}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted-foreground/70 transition hover:bg-emerald-50 hover:text-emerald-700 sm:h-8 sm:w-8"
                          title={`Abrir WhatsApp — ${formatPhone(enriched.phone)}`}
                          aria-label="Abrir WhatsApp"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </a>
                      </>
                    ) : null}
                    {!r.email_sent && !enriched.emailContext && !enriched.whatsappContext ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleEmail(r);
                        }}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted-foreground/50 transition hover:bg-blue-50 hover:text-blue-700 sm:h-8 sm:w-8"
                        title="Marcar que enviei um e-mail para esta empresa"
                        aria-label="Marcar e-mail enviado"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReschedule(r);
                      }}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted-foreground/60 transition hover:bg-blue-50 hover:text-blue-700 sm:h-8 sm:w-8"
                      title="Reagendar este follow-up"
                      aria-label="Reagendar este follow-up"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewHistory(r);
                      }}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded text-muted-foreground/60 transition hover:bg-primary/10 hover:text-primary sm:h-8 sm:w-8"
                      title="Ver todo o histórico desta empresa"
                      aria-label="Ver histórico da empresa"
                    >
                      <History className="h-3.5 w-3.5" />
                    </button>
                  </>
                }
                dimmed={r.status === "done"}
                onRename={(nome) => onRename(r, nome)}
                onEdit={() => onEdit(r)}
                onDelete={() => onRemove(r)}
                iconLeft={
                  <button
                    onClick={() => onDone(r)}
                    title={r.status === "done" ? "Reabrir" : "Marcar como feito"}
                    className={`rounded-full p-1 transition-colors ${
                      r.status === "done"
                        ? "text-primary"
                        : "text-muted-foreground/40 hover:text-primary"
                    }`}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                }
              />
              {isExpanded ? (
                <InlineCompanyHistory
                  empresa={r.company_name}
                  cnpj={r.cnpj}
                  notes={r.notes}
                  onOpenFull={() => onViewHistory(r)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );

  if (bare) return body;
  return (
    <Card>
      <CardContent className="pt-6">{body}</CardContent>
    </Card>
  );
}

function InlineCompanyHistory({
  empresa,
  cnpj,
  notes,
  onOpenFull,
}: {
  empresa: string;
  cnpj?: string | null;
  notes?: string | null;
  onOpenFull: () => void;
}) {
  const items = useMemo(() => {
    try {
      return listHistoricos()
        .filter((h) => historicoMatchesEmpresa(h, { cnpj, empresaNome: empresa }))
        .sort((a, b) => +new Date(b.dataIso) - +new Date(a.dataIso))
        .slice(0, 5);
    } catch {
      return [] as HistoricoEmpresa[];
    }
  }, [empresa, cnpj]);

  return (
    <div className="ml-6 rounded-md border border-amber-200 bg-amber-50/50 p-3 text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
        <span className="inline-flex items-center gap-1.5">
          <History className="h-3 w-3" />
          Últimos {items.length || 0} contato{items.length === 1 ? "" : "s"} — {empresa}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFull();
          }}
          className="text-[10px] font-medium text-primary hover:underline"
        >
          Ver histórico completo →
        </button>
      </div>
      {items.length === 0 ? (
        notes?.trim() ? (
          <div className="rounded bg-white/70 px-2 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800">
              Anotação da tarefa
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-foreground">{notes}</p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Sem histórico registrado para esta empresa ainda.
          </p>
        )
      ) : (
        <ol className="space-y-1.5">
          {items.map((h) => (
            <li key={h.id} className="rounded bg-white/70 px-2 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="font-medium text-navy-deep">{h.dataFormatada}</span>
                {h.contato ? (
                  <span>
                    {h.contato}
                    {h.cargo ? ` · ${h.cargo}` : ""}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 text-[11px] text-foreground">
                {h.resultado || "—"}
                {h.proximaAcao ? (
                  <span className="ml-1 text-muted-foreground">· próx.: {h.proximaAcao}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<LeadCardStatus, string> = {
  decisor: "Decisor",
  portaria: "Portaria",
  pending: "Pendente",
  done: "Concluído",
  overdue: "Atrasado",
  neutral: "—",
};

function buildAcaoDescricao(acao: string, contato?: string | null, cargo?: string | null) {
  const c = contato?.trim();
  if (!c) return acao;
  const cg = cargo?.trim();
  return cg ? `${acao} com ${c}, ${cg}` : `${acao} com ${c}`;
}

/** Enriquecimento leve: puxa cargo/status do histórico local por CNPJ/nome. */
export function enrichFromHistorico(r: FollowUp): {
  cargo?: string | null;
  status?: "decisor" | "portaria" | null;
  emailContext?: boolean;
  whatsappContext?: boolean;
  phone?: string | null;
} {
  try {
    const list = listHistoricos();
    const alvo = list
      .filter((h) => historicoMatchesEmpresa(h, { cnpj: r.cnpj, empresaNome: r.company_name }))
      .sort((a, b) => new Date(b.dataIso).getTime() - new Date(a.dataIso).getTime())[0];
    const notesTxt = (r.notes ?? "").toLowerCase();
    const histTxt = alvo
      ? `${(alvo as { resumo?: string }).resumo ?? ""} ${alvo.resultado ?? ""}`.toLowerCase()
      : "";
    const blob = `${notesTxt} ${histTxt}`;

    const whatsappRe = /whats?app|whats|\bwpp\b|\bzap\b/;
    const whatsappContext = whatsappRe.test(blob) || r.action_type === "whatsapp";

    const emailRe = /e-?mail|apresenta[cç][aã]o|proposta|material/;
    const emailMention = emailRe.test(blob) || r.action_type === "email";
    const emailContext = emailMention && !whatsappContext;

    const phone = extractPhone(
      `${r.notes ?? ""} ${alvo ? ((alvo as { resumo?: string }).resumo ?? "") : ""}`,
    );

    if (!alvo) return { emailContext, whatsappContext, phone };
    const isDec = alvo.resultado?.toLowerCase().includes("decisor");
    return {
      cargo: alvo.cargo,
      status: isDec ? "decisor" : "portaria",
      emailContext,
      whatsappContext,
      phone,
    };
  } catch {
    return {};
  }
}

function extractPhone(text: string): string | null {
  if (!text) return null;
  const m = text.match(/\(?\s*(\d{2})\s*\)?[\s.-]*(\d{4,5})[\s.-]?(\d{4})/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

export function toWhatsAppLink(digits: string, text?: string | null): string {
  const clean = digits.replace(/\D/g, "");
  const withCountry = clean.startsWith("55") ? clean : `55${clean}`;
  const msg = (text ?? "").trim();
  return msg
    ? `https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/${withCountry}`;
}

/** Extrai o texto sugerido entre aspas dentro da observação do follow-up. */
export function extractMensagemSugerida(notes?: string | null): string | null {
  const txt = (notes ?? "").trim();
  if (!txt) return null;
  const matches = txt.match(/["“”'']([^"“”]{15,})["“”'']/g) ?? [];
  let melhor: string | null = null;
  for (const raw of matches) {
    const inner = raw.replace(/^["“”'']/, "").replace(/["“”'']$/, "").trim();
    if (!melhor || inner.length > melhor.length) melhor = inner;
  }
  return melhor && melhor.length >= 15 ? melhor : null;
}

export function mailtoLink(empresa: string, notes?: string | null): string {
  const corpo = extractMensagemSugerida(notes) ?? (notes ?? "").trim();
  const assunto = `Retorno — ${empresa}`;
  return `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function combineDateTime(date: string, time: string): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  const [hh, mm] = (time || "09:00").split(":").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, hh || 9, mm || 0, 0, 0);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function EditFollowUpDialog({
  row,
  onClose,
  onSave,
}: {
  row: FollowUp | null;
  onClose: () => void;
  onSave: (patch: {
    id: string;
    companyName: string;
    contactPerson: string;
    cnpj: string;
    notes: string;
  }) => void | Promise<void>;
}) {
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCompanyName(row?.company_name ?? "");
    setContactPerson(row?.contact_person ?? "");
    setCnpj(row?.cnpj ?? "");
    setNotes(row?.notes ?? "");
  }, [row]);

  const open = row !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar follow-up</DialogTitle>
          <DialogDescription>
            Corrija erros de nome da empresa, contato, CNPJ ou observação.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-company">Empresa</Label>
            <Input id="edit-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-contact">Contato</Label>
            <Input id="edit-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-cnpj">CNPJ</Label>
            <Input id="edit-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-notes">Observações</Label>
            <Textarea id="edit-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || !companyName.trim() || !row}
            onClick={async () => {
              if (!row) return;
              setSaving(true);
              try {
                await onSave({ id: row.id, companyName, contactPerson, cnpj, notes });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RescheduleDialog({
  row,
  onClose,
  onSave,
}: {
  row: FollowUp | null;
  onClose: () => void;
  onSave: (patch: {
    id: string;
    scheduledAt: string;
    motivo: string;
    row: FollowUp;
  }) => void | Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    const atual = new Date(row.scheduled_at);
    const proposta = new Date(atual);
    proposta.setDate(proposta.getDate() + 1);
    setDate(toDateInput(proposta));
    setTime(toTimeInput(atual));
    setMotivo("");
  }, [row]);

  const open = row !== null;
  const atualStr = row ? fmtDateTime(row.scheduled_at) : "";

  function quickShift(days: number) {
    if (!row) return;
    const base = new Date(row.scheduled_at);
    base.setDate(base.getDate() + days);
    setDate(toDateInput(base));
    setTime(toTimeInput(base));
  }

  async function submit() {
    if (!row) return;
    const dt = combineDateTime(date, time);
    if (!dt) {
      toast.error("Informe uma data válida.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ id: row.id, scheduledAt: dt.toISOString(), motivo, row });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reagendar follow-up</DialogTitle>
          <DialogDescription>
            {row ? `${row.company_name} — hoje agendado para ${atualStr}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(1)}>+1 dia</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(2)}>+2 dias</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(3)}>+3 dias</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => quickShift(7)}>+1 semana</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="resched-date">Nova data</Label>
              <Input id="resched-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="resched-time">Hora</Label>
              <Input id="resched-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="resched-motivo">Motivo (opcional)</Label>
            <Textarea
              id="resched-motivo"
              rows={2}
              placeholder='Ex.: "Contato em reunião, pediu para ligar quinta-feira"'
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !date}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-1 h-4 w-4" />}
            Reagendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
