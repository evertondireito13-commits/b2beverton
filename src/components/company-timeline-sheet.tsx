// Drawer lateral com a visão 360° de uma empresa — timeline unificada,
// contatos e ações rápidas. Consome a mesma lógica de /empresas.
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyTimelineRow } from "@/components/company-timeline";
import { PRIORIDADE_LABEL, PRIORIDADE_TONE } from "@/lib/lead-score";
import { LEAD_STATUS_LABEL, type Lead } from "@/lib/leads-store";
import { fichaDaEmpresa, timelineDaFicha, type Ficha, type TimelineItem } from "@/lib/company-ficha";
import { startTimer } from "@/lib/productivity-store";
import { TEXT, TONE, isRecent } from "@/lib/status-tokens";
import { useFollowUpMirror } from "@/lib/use-followup-mirror";
import { Phone, MessageSquare, CalendarClock, Pencil, PhoneCall, Archive } from "lucide-react";
import { toast } from "sonner";
import { arquivarEmpresaHistorico } from "@/lib/historico-store";
import { useNavigate } from "@tanstack/react-router";
import { iniciarLigacaoParaEmpresa } from "@/lib/pre-ligacao-handoff";

export type CompanyTarget = { empresa: string; cnpj?: string | null } | null;

export function CompanySheet({
  target,
  onClose,
  onScheduleFollowUp,
  onEditLead,
}: {
  target: CompanyTarget;
  onClose: () => void;
  onScheduleFollowUp?: (ficha: Ficha) => void;
  onEditLead?: (lead: Lead) => void;
}) {
  const [tick, setTick] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const navigate = useNavigate();
  const mirrorVersion = useFollowUpMirror(!!target);

  useEffect(() => {
    setHydrated(true);
    const bump = () => setTick((n) => n + 1);
    const evts = ["bhm:historico-updated", "bhm:leads-updated", "bhm:followups-updated", "storage"];
    evts.forEach((e) => window.addEventListener(e, bump));
    return () => evts.forEach((e) => window.removeEventListener(e, bump));
  }, []);

  const ficha = useMemo(() => {
    if (!target || !hydrated) return null;
    void tick;
    void mirrorVersion;
    try {
      return fichaDaEmpresa(target.empresa, target.cnpj);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.empresa, target?.cnpj, hydrated, tick, mirrorVersion]);

  const timeline = useMemo(() => (ficha ? timelineDaFicha(ficha) : []), [ficha]);

  const telefonePrincipal = (
    ficha?.lead?.telefone ||
    ficha?.telefones.split(/[,\s]+/)[0] ||
    ""
  ).trim();
  const digitos = telefonePrincipal.replace(/\D/g, "");

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl"
      >
        {!ficha ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-2/3 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-2 border-b border-border bg-muted/30 p-5 text-left">
              <SheetTitle className="text-base font-semibold text-navy-deep">
                {ficha.empresa}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Histórico completo, contatos e ações rápidas da empresa.
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={PRIORIDADE_TONE[ficha.prioridade]}>
                  {PRIORIDADE_LABEL[ficha.prioridade]}
                </Badge>
                <Badge variant="outline" className={TONE.primary}>
                  score {ficha.score}
                </Badge>
                {ficha.lead && (
                  <Badge variant="outline" className={TONE.info}>
                    {LEAD_STATUS_LABEL[ficha.lead.status]}
                  </Badge>
                )}
                {ficha.cnpj && <span className={TEXT.meta}>CNPJ {ficha.cnpj}</span>}
              </div>
              <p className={TEXT.meta}>{ficha.sugestao}</p>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-5">
              <dl className="grid gap-2 sm:grid-cols-2">
                <Campo label="Decisor" valor={[ficha.contato, ficha.cargo].filter(Boolean).join(" · ") || "—"} />
                <Campo label="Telefones" valor={ficha.telefones || ficha.lead?.telefone || "—"} />
                <Campo label="E-mails" valor={ficha.emails || ficha.lead?.email || "—"} />
                <Campo
                  label="Próximo passo"
                  valor={
                    ficha.proximaAcao
                      ? `${ficha.proximaAcao}${
                          ficha.proximaAcaoData
                            ? ` (${new Date(ficha.proximaAcaoData).toLocaleDateString("pt-BR")})`
                            : ""
                        }`
                      : "—"
                  }
                />
              </dl>

              <h3 className={`mb-3 mt-5 ${TEXT.section}`}>
                🧭 Linha do tempo{" "}
                <span className="font-normal text-muted-foreground">({timeline.length})</span>
              </h3>

              {timeline.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
                  <p className={TEXT.body}>Nenhuma interação registrada para esta empresa ainda.</p>
                  <p className={`mt-1 ${TEXT.meta}`}>
                    Registre uma ligação na Pós-ligação para começar o histórico.
                  </p>
                </div>
              ) : (
                <ol className="relative space-y-3 border-l-2 border-border/70 pl-4">
                  {timeline.map((item) => (
                    <TimelineRow key={item.id} item={item} />
                  ))}
                </ol>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border bg-muted/30 p-4">
              <Button
                size="sm"
                onClick={() => {
                  iniciarLigacaoParaEmpresa({
                    empresa: ficha.empresa,
                    cnpj: ficha.cnpj,
                    contato: ficha.contato,
                    cargo: ficha.cargo,
                    telefone: telefonePrincipal,
                    email: (ficha.emails || ficha.lead?.email || "").split(/[,\s]+/)[0] ?? "",
                  });
                  startTimer(ficha.empresa, ficha.cnpj ?? null);
                  navigate({ to: "/", search: { tab: "pre" } });
                }}
              >
                <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
                Registrar nova ligação
              </Button>
              {onScheduleFollowUp && (
                <Button size="sm" variant="outline" onClick={() => onScheduleFollowUp(ficha)}>
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                  Agendar follow-up
                </Button>
              )}
              {ficha.lead && onEditLead && (
                <Button size="sm" variant="outline" onClick={() => onEditLead(ficha.lead!)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar lead
                </Button>
              )}
              {!ficha.lead && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!confirm(`Arquivar "${ficha.empresa}"? Ela sai do ranking, mas o histórico continua acessível.`)) return;
                    const ok = arquivarEmpresaHistorico(ficha.empresa, ficha.cnpj);
                    if (ok) {
                      toast.success("Empresa arquivada");
                      onClose();
                    } else {
                      toast.error("Nenhum histórico encontrado para arquivar");
                    }
                  }}
                >
                  <Archive className="mr-1.5 h-3.5 w-3.5" />
                  Arquivar empresa
                </Button>
              )}
              {digitos.length >= 10 && (
                <>
                  <Button asChild size="sm" variant="outline">
                    <a href={`tel:+55${digitos}`}>
                      <Phone className="mr-1.5 h-3.5 w-3.5" /> Discar
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`https://wa.me/55${digitos}`} target="_blank" rel="noreferrer">
                      <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  return <CompanyTimelineRow item={item} />;
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border/70 px-2.5 py-1.5">
      <dt className={TEXT.label}>{label}</dt>
      <dd className="break-words text-[11px] font-medium text-navy-deep">{valor}</dd>
    </div>
  );
}
