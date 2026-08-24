import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  upsertDailyReport,
  getDailyReport,
  type DailyReport,
} from "@/lib/daily-reports.functions";
import {
  getTodayActivities,
  loadActivities,
  type BhmActivityLog,
} from "@/lib/daily-activities";
import { getSessionConsultor, getConsultor, type Consultor } from "@/lib/historico-store";
import { deleteActivity, updateActivityEmpresa } from "@/lib/daily-activities";
import { updateHistoricoEmpresa } from "@/lib/historico-store";
import { EditableCompanyName } from "@/components/editable-company-name";
import { LeadCard } from "@/components/lead-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  CheckCircle2,
  RefreshCcw,
  Zap,
  Building2,
  X,
} from "lucide-react";


function todayISO() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function todayLongPt(): string {
  const now = new Date();
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
}

type PartnerOption = "Everton" | "Eloane";

function partnerFromConsultor(c: Consultor | null): PartnerOption {
  return c === "Eloane Manfroni" ? "Eloane" : "Everton";
}

function currentPartner(): PartnerOption {
  return partnerFromConsultor(getSessionConsultor() ?? getConsultor());
}

function formatEmpresasList(atividades: BhmActivityLog[]): string {
  return atividades
    .map(
      (a) =>
        `${a.empresa || "Empresa"} — Cargo: ${a.cargo || "não informado"} — Resultado: ${
          a.resultado || "sem classificação"
        }`,
    )
    .join("\n");
}

export function DailyReportBoard() {
  const upsert = useServerFn(upsertDailyReport);
  const getReport = useServerFn(getDailyReport);

  const [partnerName, setPartnerName] = useState<PartnerOption>(() => currentPartner());
  const [reportDate] = useState<string>(todayISO());
  const [contactsMade, setContactsMade] = useState<string>("");
  const [decisionMakerCalls, setDecisionMakerCalls] = useState<string>("");
  const [meetingsHeld, setMeetingsHeld] = useState<string>("");
  const [documentsReceived, setDocumentsReceived] = useState<string>("");
  const [hadClosing, setHadClosing] = useState<boolean>(false);
  const [closingDetails, setClosingDetails] = useState<string>("");
  const [companiesApproached, setCompaniesApproached] = useState<string>("");
  const [biggestObstacle, setBiggestObstacle] = useState<string>("");
  const [nextStep, setNextStep] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  // Atividades do dia (localStorage), reativas ao evento bhm:activities-updated
  const [todayActs, setTodayActs] = useState<BhmActivityLog[]>([]);
  const [openActivity, setOpenActivity] = useState<BhmActivityLog | null>(null);

  useEffect(() => {
    const refresh = () => setTodayActs(getTodayActivities());
    refresh();
    const h = () => refresh();
    window.addEventListener("bhm:activities-updated", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("bhm:activities-updated", h);
      window.removeEventListener("storage", h);
    };
  }, []);

  // Deriva o parceiro da conta logada — nunca há seletor manual.
  useEffect(() => {
    const sync = () => setPartnerName(currentPartner());
    sync();
    window.addEventListener("bhm:session-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bhm:session-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);


  // Sempre que trocar parceiro/data, tenta carregar rascunho existente
  useEffect(() => {
    if (!partnerName || !reportDate) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = (await getReport({
          data: { partnerName, reportDate },
        })) as DailyReport | null;
        if (cancelled) return;
        if (row) {
          setExistingId(row.id);
          setContactsMade(String(row.contacts_made));
          setDecisionMakerCalls(String(row.decision_maker_calls));
          setMeetingsHeld(String(row.meetings_held));
          setDocumentsReceived(String(row.documents_received));
          setHadClosing(row.had_closing);
          setClosingDetails(row.closing_details ?? "");
          setCompaniesApproached(row.companies_approached);
          setBiggestObstacle(row.biggest_obstacle);
          setNextStep(row.next_step);
        } else {
          setExistingId(null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerName, reportDate, getReport]);

  const canSave = useMemo(() => {
    return (
      !!partnerName &&
      reportDate.length === 10 &&
      contactsMade !== "" &&
      decisionMakerCalls !== "" &&
      meetingsHeld !== "" &&
      documentsReceived !== "" &&
      companiesApproached.trim().length > 0 &&
      biggestObstacle.trim().length > 0 &&
      nextStep.trim().length > 0
    );
  }, [
    partnerName,
    reportDate,
    contactsMade,
    decisionMakerCalls,
    meetingsHeld,
    documentsReceived,
    companiesApproached,
    biggestObstacle,
    nextStep,
  ]);

  async function handleCopyGoogleFormsPayload() {
    if (!partnerName) {
      toast.error("Selecione o parceiro antes de copiar o payload.");
      return;
    }
    const empresasLista = companiesApproached.trim() || "(nenhuma empresa registrada)";
    const fechamentoTxt = hadClosing
      ? `Sim${closingDetails.trim() ? ` — ${closingDetails.trim()}` : ""}`
      : "Não";
    const payload = [
      `1. Nome do Parceiro:\n${partnerName}`,
      `2. Data:\n${todayLongPt()}`,
      `3. Quantos contatos realizados você fez hoje?:\n${contactsMade || "0"}`,
      `4. Em quantas ligações falou com o decisor?:\n${decisionMakerCalls || "0"}`,
      `5. Quantas reuniões/apresentações realizou hoje?:\n${meetingsHeld || "0"}`,
      `6. Quantas empresas mandaram documentos hoje?:\n${documentsReceived || "0"}`,
      `7. Houve algum fechamento hoje?:\n${fechamentoTxt}`,
      `8. Empresas abordadas hoje — informe: nome da empresa, cargo do contato e resultado da ligação:\n${empresasLista}`,
      `9. Qual foi o maior obstáculo do dia?:\n${biggestObstacle.trim() || "(não informado)"}`,
      `10. Próximo passo mais importante para amanhã:\n${nextStep.trim() || "(não informado)"}`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Sequência de respostas copiada — cole no Google Forms na ordem.");
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente o texto.");
    }
  }

  function handleSuggest() {
    // Recarrega direto do localStorage — garante frescor mesmo se o listener
    // não tiver disparado (ex.: aba recém-aberta).
    const acts = loadActivities().filter((a) => a.dateStr === reportDate);
    setTodayActs(acts);

    const totalContatos = acts.length;
    const totalDecisor = acts.filter((a) => a.falouDecisor).length;

    setContactsMade(String(totalContatos));
    setDecisionMakerCalls(String(totalDecisor));
    // Defaults conservadores — usuário ajusta se houver exceção
    if (!meetingsHeld) setMeetingsHeld("0");
    if (!documentsReceived) setDocumentsReceived("0");
    // Fechamento continua "Não" até o usuário mudar
    if (!hadClosing) setHadClosing(false);

    if (totalContatos > 0) {
      setCompaniesApproached(formatEmpresasList(acts));
    }

    toast.success(
      `Sugestão preenchida: ${totalContatos} contato(s) · ${totalDecisor} com decisor.`,
    );
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSave || !partnerName) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const row = await upsert({
        data: {
          partnerName,
          reportDate,
          contactsMade: Number(contactsMade) || 0,
          decisionMakerCalls: Number(decisionMakerCalls) || 0,
          meetingsHeld: Number(meetingsHeld) || 0,
          documentsReceived: Number(documentsReceived) || 0,
          hadClosing,
          closingDetails: hadClosing ? closingDetails.trim() : null,
          companiesApproached: companiesApproached.trim(),
          biggestObstacle: biggestObstacle.trim(),
          nextStep: nextStep.trim(),
        },
      });
      setExistingId(row.id);
      toast.success(existingId ? "Relatório atualizado." : "Relatório salvo.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-6">

          <Card className="relative overflow-hidden border-border bg-card p-0 shadow-sm">
            <CardHeader className="flex flex-col gap-2 rounded-none border-b border-navy-deep bg-navy-deep px-6 py-5 text-white">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="font-display text-xl tracking-wide text-white">
                  Relatório Diário Comercial — Bruno Morais &amp; Advogados
                </CardTitle>
                {existingId ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90">
                    <CheckCircle2 className="h-3.5 w-3.5 text-gold" />
                    Rascunho salvo
                  </span>
                ) : null}
              </div>
              <p className="text-[12px] font-medium tracking-wide text-gold">
                Preencha obrigatoriamente até as 17h30. O relatório deve ser
                revisado e enviado antes das 17h15.
              </p>
            </CardHeader>

            <CardContent className="space-y-6 p-6">
              {/* Payload de Preenchimento Rápido (Google Forms) */}
              <section className="rounded-xl border-2 border-gold/60 bg-gradient-to-br from-navy-deep to-navy-deep/90 p-4 text-white shadow-elegant">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base tracking-wide">
                      Payload de Preenchimento Rápido — Google Forms
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/80">
                      Copia todas as respostas do relatório na ordem exata das
                      perguntas do formulário do Dr. Bruno. Cole em cada campo
                      seguindo a numeração — <strong className="text-gold">envie antes das 17h15</strong>.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCopyGoogleFormsPayload}
                    className="bg-gold text-navy-deep hover:bg-gold/90"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Copiar Sequência de Respostas
                  </Button>
                </div>
              </section>

              <form onSubmit={handleSave} className="grid gap-5">

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="partner">Nome do parceiro</Label>
                    <Input
                      id="partner"
                      value={partnerName}
                      readOnly
                      className="cursor-default bg-muted/40 font-medium"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Definido automaticamente pela conta logada — cada consultor
                      vê apenas os próprios dados.
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="date">Data</Label>
                    <Input
                      id="date"
                      value={todayLongPt()}
                      readOnly
                      className="cursor-default bg-muted/40 capitalize"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Data de hoje (fuso Brasília) — preenchida automaticamente.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSuggest}
                    className="bg-gold text-navy-deep hover:bg-gold/90"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    Sugerir a partir do app
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Lê as ligações registradas hoje e preenche contatos, decisor
                    e a lista de empresas abordadas.
                  </span>
                  {loading ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Carregando rascunho…
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <NumberField
                    id="contacts"
                    label="Contatos realizados hoje *"
                    value={contactsMade}
                    onChange={setContactsMade}
                  />
                  <NumberField
                    id="decision"
                    label="Falou com o decisor *"
                    value={decisionMakerCalls}
                    onChange={setDecisionMakerCalls}
                  />
                  <NumberField
                    id="meetings"
                    label="Reuniões / apresentações *"
                    value={meetingsHeld}
                    onChange={setMeetingsHeld}
                  />
                  <NumberField
                    id="docs"
                    label="Empresas que mandaram documentos *"
                    value={documentsReceived}
                    onChange={setDocumentsReceived}
                  />
                </div>

                <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
                  <Label className="text-sm">Houve algum fechamento hoje? *</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={hadClosing ? "default" : "outline"}
                      onClick={() => setHadClosing(true)}
                    >
                      Sim
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!hadClosing ? "default" : "outline"}
                      onClick={() => {
                        setHadClosing(false);
                        setClosingDetails("");
                      }}
                    >
                      Não
                    </Button>
                  </div>
                  {hadClosing ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="closing" className="text-sm">
                        Empresa e valor aproximado do contrato
                      </Label>
                      <Input
                        id="closing"
                        value={closingDetails}
                        onChange={(e) => setClosingDetails(e.target.value)}
                        placeholder="Ex.: Empresa X — R$ 12.000/mês"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="companies">Empresas abordadas hoje *</Label>
                  <p className="text-xs text-muted-foreground">
                    Gerado automaticamente ao clicar em <strong>Sugerir a
                    partir do app</strong>. Você pode ajustar livremente.
                  </p>
                  <Textarea
                    id="companies"
                    value={companiesApproached}
                    onChange={(e) => setCompaniesApproached(e.target.value)}
                    placeholder={
                      "Ex.:\nACME LTDA — Cargo: Diretor Financeiro — Resultado: Falou com decisor\nBeta S/A — Cargo: Sócio — Resultado: Falou com portaria"
                    }
                    rows={6}
                    required
                  />

                  {todayActs.length > 0 ? (
                    <div className="mt-2">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Ligações registradas hoje ({todayActs.length})
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Clique em um card para ver a transcrição.
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {todayActs.map((a) => (
                          <LeadCard
                            key={a.id}
                            empresa={a.empresa}
                            contato={a.contato}
                            cargo={a.cargo}
                            status={a.falouDecisor ? "decisor" : "portaria"}
                            interesse={a.resultado}
                            onClick={() => setOpenActivity(a)}
                            onRename={async (nome) => {
                              updateActivityEmpresa(a.id, nome);
                              try {
                                const { listHistoricos } = await import("@/lib/historico-store");
                                const list = listHistoricos();
                                const alvo = list.find((h) => {
                                  const hc = (h.cnpj ?? "").replace(/\D/g, "");
                                  const ac = (a.cnpj ?? "").replace(/\D/g, "");
                                  if (hc && ac && hc === ac) return true;
                                  return (h.empresaNome ?? "").trim().toLowerCase() === (a.empresa ?? "").trim().toLowerCase();
                                });
                                if (alvo) updateHistoricoEmpresa(alvo.id, nome);
                              } catch { /* noop */ }
                              toast.success("Nome da empresa atualizado.");
                            }}
                            onDelete={() => {
                              const ok = window.confirm(
                                `Remover "${a.empresa}" da lista de ligações de hoje?\n\nApenas este registro será excluído — o restante das atividades permanece intacto.`,
                              );
                              if (!ok) return;
                              const removed = deleteActivity(a.id);
                              if (removed) toast.success("Ligação removida.");
                              else toast.error("Registro não encontrado.");
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="obstacle">Maior obstáculo do dia *</Label>
                    <Textarea
                      id="obstacle"
                      value={biggestObstacle}
                      onChange={(e) => setBiggestObstacle(e.target.value)}
                      rows={4}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="next">
                      Próximo passo mais importante para amanhã *
                    </Label>
                    <Textarea
                      id="next"
                      value={nextStep}
                      onChange={(e) => setNextStep(e.target.value)}
                      rows={4}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setContactsMade("");
                      setDecisionMakerCalls("");
                      setMeetingsHeld("");
                      setDocumentsReceived("");
                      setHadClosing(false);
                      setClosingDetails("");
                      setCompaniesApproached("");
                      setBiggestObstacle("");
                      setNextStep("");
                      setExistingId(null);
                    }}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Limpar
                  </Button>
                  <Button type="submit" disabled={!canSave || saving}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {existingId ? "Atualizar relatório" : "Salvar relatório"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
      </div>
      <Toaster />


      <Dialog
        open={!!openActivity}
        onOpenChange={(o) => (o ? null : setOpenActivity(null))}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-navy-deep">
              {openActivity?.empresa ?? "Empresa"}
            </DialogTitle>
            <DialogDescription>
              {openActivity?.contato || "Contato não informado"}
              {openActivity?.cargo ? ` · ${openActivity.cargo}` : ""} ·{" "}
              <span className={openActivity?.falouDecisor ? "text-emerald-600 font-medium" : ""}>
                {openActivity?.falouDecisor ? "Decisor" : "Portaria/Outro"}
              </span>
              {openActivity?.resultado ? ` — ${openActivity.resultado}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-lg border bg-muted/30 p-3">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {openActivity?.historico?.trim() ||
                "Nenhuma transcrição/histórico foi salvo para esta ligação."}
            </pre>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!openActivity?.historico) return;
                await navigator.clipboard.writeText(openActivity.historico);
                toast.success("Transcrição copiada.");
              }}
              disabled={!openActivity?.historico}
            >
              Copiar transcrição
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setOpenActivity(null)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="0"
        required
      />
    </div>
  );
}
