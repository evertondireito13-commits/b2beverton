// Ficha completa de uma empresa (dados + timeline). Reaproveitada pelo Painel Executivo.
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRIORIDADE_LABEL, PRIORIDADE_TONE } from "@/lib/lead-score";
import type { Ficha } from "@/lib/company-ficha";
import { LEAD_STATUS_LABEL } from "@/lib/leads-store";
import { setActiveLead } from "@/lib/daily-activities";
import { addEmpresaToPreparacaoNoturna } from "@/components/preparacao-noturna";
import { iniciarLigacaoParaEmpresa } from "@/lib/pre-ligacao-handoff";

export function FichaEmpresa({ ficha }: { ficha: Ficha }) {
  const telefonePrincipal = (
    ficha.lead?.telefone ||
    ficha.telefones.split(/[,\s]+/)[0] ||
    ""
  ).trim();
  const digitos = telefonePrincipal.replace(/\D/g, "");
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-navy-deep">{ficha.empresa}</h2>
          <Badge variant="outline" className={PRIORIDADE_TONE[ficha.prioridade]}>
            {PRIORIDADE_LABEL[ficha.prioridade]}
          </Badge>
          <span className="text-sm font-bold text-primary">score {ficha.score}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{ficha.sugestao}</p>
      </header>

      <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
        <Campo label="CNPJ" valor={ficha.cnpj || "—"} />
        <Campo
          label="Decisor"
          valor={[ficha.contato, ficha.cargo].filter(Boolean).join(" · ") || "—"}
        />
        <Campo label="Telefones" valor={ficha.telefones || ficha.lead?.telefone || "—"} />
        <Campo label="E-mails" valor={ficha.emails || ficha.lead?.email || "—"} />
        {ficha.pessoas?.trim() && <Campo label="Pessoas para procurar" valor={ficha.pessoas} />}

        <Campo
          label="Etapa na Central"
          valor={ficha.lead ? LEAD_STATUS_LABEL[ficha.lead.status] : "Fora da Central"}
        />
        <Campo
          label="Próximo passo"
          valor={
            ficha.proximaAcao
              ? `${ficha.proximaAcao}${ficha.proximaAcaoData ? ` (${new Date(ficha.proximaAcaoData).toLocaleDateString("pt-BR")})` : ""}`
              : "—"
          }
        />
      </dl>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          onClick={() => {
            iniciarLigacaoParaEmpresa({
              empresa: ficha.empresa,
              cnpj: ficha.cnpj,
              contato: ficha.contato,
              cargo: ficha.cargo,
              telefone: ficha.lead?.telefone ?? telefonePrincipal ?? "",
              email: ficha.lead?.email ?? "",
            });
            addEmpresaToPreparacaoNoturna({
              razaoSocial: ficha.empresa,
              cnpj: ficha.cnpj,
              contato: ficha.contato,
              cargo: ficha.cargo,
              telefone: ficha.lead?.telefone ?? (telefonePrincipal || null),
              email: ficha.lead?.email ?? null,
            });
            window.location.href = "/?tab=pre";
          }}
        >
          📞 Chamar na Pré-ligação
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setActiveLead({ razaoSocial: ficha.empresa, cnpj: ficha.cnpj ?? undefined });
            window.location.href = "/?tab=pos";
          }}
        >
          📝 Registrar pós-ligação
        </Button>
        {digitos.length >= 10 && (
          <>
            <Button asChild size="sm" variant="outline">
              <a href={`tel:+55${digitos}`}>☎️ Discar</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`https://wa.me/55${digitos}`} target="_blank" rel="noreferrer">
                💬 WhatsApp
              </a>
            </Button>
          </>
        )}
      </div>

      <TimelineFicha ficha={ficha} />
    </section>
  );
}

function TimelineFicha({ ficha }: { ficha: Ficha }) {
  const [expandido, setExpandido] = useState(false);
  const eventos = (ficha.lead?.timeline ?? []).slice().reverse();
  const total = eventos.length + ficha.historicos.length;
  const LIMITE = 5;
  const eventosVisiveis = expandido ? eventos : eventos.slice(0, LIMITE);
  const restanteHist = expandido
    ? ficha.historicos.length
    : Math.max(0, LIMITE - eventosVisiveis.length);
  const historicosVisiveis = expandido ? ficha.historicos : ficha.historicos.slice(0, restanteHist);
  const ocultos = total - (eventosVisiveis.length + historicosVisiveis.length);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-navy-deep">🧭 Timeline completa ({total})</h3>
      <ol className="space-y-2 border-l-2 border-border/70 pl-3">
        {eventosVisiveis.map((ev) => (
          <li key={ev.id} className="relative">
            <span className="absolute -left-[19px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <p className="text-[11px] font-semibold text-navy-deep">{ev.titulo}</p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(ev.at).toLocaleString("pt-BR")}
              {ev.detalhe ? ` · ${ev.detalhe}` : ""}
            </p>
          </li>
        ))}
        {historicosVisiveis.map((h) => (
          <li key={h.id} className="relative">
            <span className="absolute -left-[19px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
            <p className="text-[11px] font-semibold text-navy-deep">
              {h.resultado || "Ligação registrada"}
              {h.interesse ? ` · interesse ${h.interesse}` : ""}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(h.dataIso).toLocaleString("pt-BR")}
              {h.contato ? ` · ${h.contato}` : ""}
            </p>
            {h.proximaAcao && <p className="text-[10px] text-foreground/70">➡️ {h.proximaAcao}</p>}
            {h.objecao && <p className="text-[10px] text-amber-700">⚠️ {h.objecao}</p>}
          </li>
        ))}
        {total === 0 && (
          <li className="text-[11px] text-muted-foreground">Nenhuma interação registrada.</li>
        )}
      </ol>
      {total > LIMITE && (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="mt-2 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        >
          {expandido ? "Mostrar menos" : `Ver mais ${ocultos} contato(s) antigo(s)`}
        </button>
      )}
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border/70 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-[11px] font-medium text-navy-deep">{valor}</dd>
    </div>
  );
}
