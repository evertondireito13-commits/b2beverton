import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

// ============================================================
// Click-to-WhatsApp com mensagens rápidas do fluxo BHM.
// Não altera dados: apenas abre o WhatsApp Web já com o texto.
// ============================================================

export type WhatsContext = {
  empresa: string;
  contato?: string | null;
  telefone?: string | null;
  consultor?: string | null;
};

function primeiroNome(v?: string | null): string {
  const n = (v ?? "").trim().split(/\s+/)[0];
  return n || "tudo bem";
}

export function buildWhatsTemplates(ctx: WhatsContext): { id: string; label: string; text: string }[] {
  const nome = primeiroNome(ctx.contato);
  const empresa = ctx.empresa?.trim() || "sua empresa";
  const assino = ctx.consultor?.trim() ? `\n\n${ctx.consultor.trim()} — BHM Advogados` : "\n\nBHM Advogados";
  return [
    {
      id: "ata",
      label: "📄 Envio da Ata da reunião",
      text: `Olá ${nome}, tudo bem? Aqui é da BHM Advogados. Estou enviando a ata executiva com o resumo da nossa reunião e os próximos passos da análise tributária da ${empresa}. Qualquer ponto que queira ajustar, me avise por aqui.${assino}`,
    },
    {
      id: "docs",
      label: "📥 Cobrança e-CAC / arquivos .TXT (EFDs)",
      text: `Olá ${nome}, tudo bem? Para seguirmos com o levantamento dos créditos da ${empresa}, ainda precisamos dos arquivos EFD (.TXT) ou da procuração no e-CAC. Assim que recebermos, iniciamos os cálculos imediatamente. Consegue nos enviar hoje?${assino}`,
    },
    {
      id: "calculos",
      label: "📊 Agendar apresentação dos cálculos",
      text: `Olá ${nome}! Finalizamos a apuração dos créditos tributários da ${empresa}. Podemos agendar 30 minutos para apresentar os números e o formato de recuperação? Tenho disponibilidade nos próximos dias — qual horário fica melhor para você?${assino}`,
    },
    {
      id: "confirmacao",
      label: "📅 Confirmação de reunião",
      text: `Olá ${nome}, tudo bem? Passando para confirmar nossa reunião sobre a recuperação de créditos tributários da ${empresa}. Está mantido no horário combinado?${assino}`,
    },
    {
      id: "retomada",
      label: "🔄 Retomada de contato",
      text: `Olá ${nome}, tudo bem? Retomando nosso contato sobre a análise tributária da ${empresa}. Seguimos à disposição para dar andamento — como está a decisão por aí?${assino}`,
    },
  ];
}

export function waLink(telefone: string, text: string): string {
  const d = telefone.replace(/\D/g, "");
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function WhatsAppQuickButton({
  empresa,
  contato,
  telefone,
  consultor,
  compact,
}: WhatsContext & { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [fone, setFone] = useState(telefone ?? "");
  const templates = buildWhatsTemplates({ empresa, contato, consultor });
  const valido = fone.replace(/\D/g, "").length >= 10;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Abrir WhatsApp com mensagem pronta"
          className={`inline-flex min-h-[40px] items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 font-semibold text-emerald-700 transition hover:bg-emerald-100 sm:min-h-0 ${
            compact ? "min-w-[40px] px-2 py-1.5 text-[11px] sm:min-w-0 sm:px-1.5 sm:py-0.5" : "px-3 py-2 text-xs sm:px-2 sm:py-1"
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {compact ? "" : "WhatsApp"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] space-y-2 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Mensagem rápida · {empresa}
        </p>
        <Input
          value={fone}
          onChange={(e) => setFone(e.target.value)}
          placeholder="Telefone com DDD (ex: 41 99999-9999)"
          className="h-8 text-xs"
        />
        <ul className="space-y-1">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                disabled={!valido}
                onClick={() => {
                  window.open(waLink(fone, t.text), "_blank", "noopener");
                  setOpen(false);
                }}
                className="w-full rounded-md border border-border px-2 py-2 text-left text-xs transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        {!valido && (
          <p className="text-[10px] text-muted-foreground">
            Informe o telefone do decisor para liberar os envios.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
