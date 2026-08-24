// Painel lateral sob demanda com a linha do tempo completa da empresa.
// Usa exatamente o mesmo componente de timeline do drawer 360° (padrão único
// de histórico em todo o app).
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyTimelineList } from "@/components/company-timeline";
import { fichaDaEmpresa, timelineDaFicha, type Ficha, type TimelineItem } from "@/lib/company-ficha";
import { PRIORIDADE_LABEL, PRIORIDADE_TONE } from "@/lib/lead-score";
import { LEAD_STATUS_LABEL } from "@/lib/leads-store";
import { TEXT, TONE } from "@/lib/status-tokens";

export function HistoricoEmpresaSheet({
  empresa,
  cnpj,
  variant = "sheet",
}: {
  empresa: string | null;
  cnpj: string | null;
  variant?: "sheet" | "dialog";
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [open, setOpen] = useState(false);

  const recarregar = useCallback(() => {
    try {
      const f = fichaDaEmpresa(empresa ?? "", cnpj);
      setFicha(f);
      setItems(f ? timelineDaFicha(f) : []);
    } catch {
      setFicha(null);
      setItems([]);
    }
  }, [empresa, cnpj]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  useEffect(() => {
    const evts = ["bhm:historico-updated", "bhm:leads-updated", "bhm:followups-updated"];
    evts.forEach((e) => window.addEventListener(e, recarregar));
    return () => evts.forEach((e) => window.removeEventListener(e, recarregar));
  }, [recarregar]);

  if (!ficha || items.length === 0) return null;

  const telefones = ficha.telefones || ficha.lead?.telefone || "—";
  const emails = ficha.emails || ficha.lead?.email || "—";

  const cabecalho = (
    <div className="space-y-2">
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
      {ficha.sugestao && <p className={TEXT.meta}>{ficha.sugestao}</p>}
    </div>
  );

  const corpo = (
    <>
      <dl className="grid gap-2 sm:grid-cols-2">
        <Campo
          label="Decisor"
          valor={[ficha.contato, ficha.cargo].filter(Boolean).join(" · ") || "—"}
        />
        <Campo label="Telefones" valor={telefones} />
        <Campo label="E-mails" valor={emails} />
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
        <span className="font-normal text-muted-foreground">({items.length})</span>
      </h3>
      <CompanyTimelineList items={items} />
    </>
  );

  const descricao = "Histórico completo, contatos e próximos passos da empresa.";

  const botao = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      className="w-full border-border text-xs"
    >
      🧭 Ver histórico completo ({items.length})
    </Button>
  );

  if (variant === "dialog") {
    return (
      <>
        {botao}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex max-h-[85vh] w-[92vw] flex-col gap-0 p-0 sm:max-w-2xl">
            <DialogHeader className="border-b border-border bg-muted/30 p-5 text-left">
              <DialogTitle className="text-base font-semibold text-navy-deep">
                {ficha.empresa}
              </DialogTitle>
              <DialogDescription className="text-[11px]">{descricao}</DialogDescription>
              {cabecalho}
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-5">{corpo}</div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {botao}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl">
          <SheetHeader className="space-y-2 border-b border-border bg-muted/30 p-5 text-left">
            <SheetTitle className="text-base font-semibold text-navy-deep">
              {ficha.empresa}
            </SheetTitle>
            <SheetDescription className="text-[11px]">{descricao}</SheetDescription>
            {cabecalho}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">{corpo}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border/70 px-2.5 py-1.5">
      <dt className={TEXT.label}>{label}</dt>
      <dd className="break-words text-[11px] font-medium text-navy-deep">{valor}</dd>
    </div>
  );
}
