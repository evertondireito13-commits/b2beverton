import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FUNNEL_STAGES,
  LEAD_STATUS_LABEL,
  Lead,
  LeadStatus,
  addBusinessDays,
  archiveLead,
  hardDeleteLead,
  findLead,
  listLeads,
  updateLead,
  upsertLead,
} from "@/lib/leads-store";
import {
  Consultor,
  deleteHistoricosByEmpresa,
  getConsultor,
  getSessionConsultor,
  saveHistorico,
} from "@/lib/historico-store";
import {
  createFollowUp,
  deleteFollowUp,
  listFollowUps,
} from "@/lib/follow-ups.functions";

/** Marca textual presente em TODO registro criado pelo simulador. */
export const TEST_MARK = "[TESTE E2E]";
/** Prefixo de CNPJ reservado para dados de teste (nunca usado em produção). */
const TEST_CNPJ_PREFIX = "99999999";

const LEAD_TESTE = {
  cnpj: "99.999.999/0001-99",
  empresa: "METALÚRGICA PARANÁ LTDA",
  contato: "Carlos Andrade",
  cargo: "Diretor Financeiro",
  telefone: "(41) 99999-0000",
  email: "carlos.andrade@metalurgicaparana.com.br",
};

const FOLLOWUPS_TESTE = [
  { empresa: "TESTE ATRASADO — USINAGEM SUL", cnpj: "99.999.999/0002-99", dias: -3 },
  { empresa: "TESTE HOJE — PLÁSTICOS CENTRO", cnpj: "99.999.999/0003-99", dias: 0 },
  { empresa: "TESTE LONGO PRAZO — TÊXTIL NORTE", cnpj: "99.999.999/0004-99", dias: 12 },
];

/** Cenários financeiros reais para validar honorários BHM + comissão 30%. */
const CALCULOS_TESTE: {
  empresa: string;
  cnpj: string;
  contato: string;
  status: LeadStatus;
  credito: number;
  fee: number;
}[] = [
  {
    empresa: "VISION ENGENHARIA E CONSULTORIA (TESTE)",
    cnpj: "99.999.999/0005-99",
    contato: "Rodrigo Madeira Marques",
    status: "apresentacao_calculos",
    credito: 1_431_340.03,
    fee: 20,
  },
  {
    empresa: "ARGEPASI ALIMENTOS INDÚSTRIA E COMÉRCIO LTDA (TESTE)",
    cnpj: "99.999.999/0006-99",
    contato: "Leandro",
    status: "fechado",
    credito: 7_014_239.33,
    fee: 25,
  },
];


function isTestLead(l: Lead): boolean {
  return (
    l.cnpj.replace(/\D/g, "").startsWith(TEST_CNPJ_PREFIX) ||
    (l.ultima_observacao ?? "").includes(TEST_MARK)
  );
}

function consultorAtual(): Consultor {
  return (getSessionConsultor() ?? getConsultor()) as Consultor;
}

function iso(d: Date) {
  return d.toISOString();
}

export function E2ESimulator() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const runCreateFollowUp = useServerFn(createFollowUp);
  const runListFollowUps = useServerFn(listFollowUps);
  const runDeleteFollowUp = useServerFn(deleteFollowUp);

  const testLead = findLead(LEAD_TESTE.empresa, LEAD_TESTE.cnpj);

  async function act(id: string, fn: () => void | Promise<void>) {
    try {
      setBusy(id);
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na simulação");
    } finally {
      setBusy(null);
    }
  }

  /** A) Jornada completa — injeta dossiê, pós-ligação e lead na Central. */
  function simularJornada() {
    const agora = new Date();
    const reuniao = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    reuniao.setHours(14, 30, 0, 0);

    const texto = [
      `${TEST_MARK} Histórico simulado de ligação`,
      `Empresa: ${LEAD_TESTE.empresa}`,
      `Decisor: ${LEAD_TESTE.contato} (${LEAD_TESTE.cargo})`,
      "Resultado: Falou com decisor · Interesse alto em recuperação de créditos de PIS/COFINS.",
      `Próxima ação: reunião de diagnóstico em ${reuniao.toLocaleString("pt-BR")}.`,
    ].join("\n");

    saveHistorico({
      id: crypto.randomUUID(),
      dataIso: iso(agora),
      dataFormatada: agora.toLocaleDateString("pt-BR"),
      empresaNome: LEAD_TESTE.empresa,
      cnpj: LEAD_TESTE.cnpj,
      contato: LEAD_TESTE.contato,
      cargo: LEAD_TESTE.cargo,
      resultado: "Falou com decisor",
      interesse: "Alto",
      proximaAcao: "Reunião de diagnóstico agendada",
      proximaAcaoData: iso(reuniao),
      textoHistoricoCompleto: texto,
      consultor: consultorAtual(),
      status: "concluido",
    });

    upsertLead({
      ...LEAD_TESTE,
      status: "reuniao_agendada",
      em_followup_frio: false,
      data_reuniao: iso(reuniao),
      ultima_observacao: `${TEST_MARK} Reunião de diagnóstico confirmada com o decisor.`,
    });

    toast.success("Jornada injetada: histórico + lead na Central de Reuniões");
  }

  /** Avança o lead de teste para uma etapa qualquer, com dados coerentes. */
  function irParaEtapa(status: LeadStatus) {
    const lead = findLead(LEAD_TESTE.empresa, LEAD_TESTE.cnpj);
    if (!lead) {
      toast.error("Rode a jornada completa primeiro para injetar o lead.");
      return;
    }
    const patch: Partial<Lead> = { status };
    if (status === "pos_reuniao") {
      patch.ata_executiva = `${TEST_MARK} Ata executiva simulada — diagnóstico de créditos apresentado à diretoria.`;
      patch.ata_enviada_em = iso(new Date());
      patch.data_reuniao = iso(addBusinessDays(new Date(), 2));
      patch.ultima_observacao = `${TEST_MARK} Ata enviada — retorno em +2 dias úteis.`;
    }
    if (status === "levantamento_docs") {
      patch.modalidade_coleta = "arquivos_txt";
      patch.docs_recebidos_em = iso(new Date());
      patch.data_reuniao = iso(addBusinessDays(new Date(), 7));
      patch.ultima_observacao = `${TEST_MARK} EFDs .TXT recebidas — SLA de 7 dias úteis para cálculos.`;
    }
    if (status === "apresentacao_calculos") {
      patch.valor_credito = 1250000;
      patch.percentual_honorarios = 25;
      patch.ultima_observacao = `${TEST_MARK} Crédito apurado: R$ 1.250.000,00.`;
    }
    if (status === "fechado") {
      patch.ultima_observacao = `${TEST_MARK} Minuta assinada — iniciar PER/DCOMPs.`;
    }
    if (status === "reuniao_agendada" || status === "resgate_reuniao") {
      patch.data_reuniao = iso(addBusinessDays(new Date(), 1));
      patch.ultima_observacao = `${TEST_MARK} Remarcação solicitada — voltou para ${LEAD_STATUS_LABEL[status]}.`;
    }
    updateLead(lead.id, patch);
    toast.success(`${LEAD_TESTE.empresa} → ${LEAD_STATUS_LABEL[status]}`);
  }

  /** Injeta leads com cálculos reais para validar honorários e comissão de 30%. */
  function simularCalculos() {
    for (const c of CALCULOS_TESTE) {
      upsertLead({
        empresa: c.empresa,
        cnpj: c.cnpj,
        contato: c.contato,
        cargo: "Diretor",
        status: c.status,
        data_reuniao: iso(addBusinessDays(new Date(), 3)),
        valor_credito: c.credito,
        percentual_honorarios: c.fee,
        comissao_percentual: 30,
        contrato_assinado_em: c.status === "fechado" ? iso(new Date()) : undefined,
        ultima_observacao: `${TEST_MARK} Cálculos apurados: R$ ${c.credito.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · fee BHM ${c.fee}%.`,
      });
    }
    toast.success("Vision e Argepasi injetadas com cálculos — confira a aba Minha Comissão");
  }



  /** B) Recusa + Reativação futura (histórico preservado). */
  function simularRecusa() {
    const lead = findLead(LEAD_TESTE.empresa, LEAD_TESTE.cnpj);
    if (!lead) {
      toast.error("Rode a jornada completa primeiro para injetar o lead.");
      return;
    }
    archiveLead(
      lead.id,
      "Diretoria recusou a proposta",
      `${TEST_MARK} Recusa simulada — arquivado para reativação futura com histórico preservado.`,
    );
    toast.success("Lead arquivado na aba Reativação futura");
  }

  /** C) Follow-ups com datas variadas (atrasado / hoje / longo prazo). */
  async function simularFollowUps() {
    const consultor = consultorAtual();
    for (const f of FOLLOWUPS_TESTE) {
      const when = new Date();
      when.setDate(when.getDate() + f.dias);
      when.setHours(10, 0, 0, 0);
      await runCreateFollowUp({
        data: {
          companyName: f.empresa,
          cnpj: f.cnpj,
          contactPerson: "Contato de teste",
          actionType: "call",
          scheduledAt: iso(when),
          notes: `${TEST_MARK} Follow-up simulado para validar as pílulas de filtro.`,
          consultor,
        },
      });
    }
    toast.success("3 follow-ups de teste criados (atrasado, hoje, longo prazo)");
  }

  /** D) Limpeza — remove apenas o que o simulador criou. */
  async function limparTestes() {
    const consultor = consultorAtual();

    listLeads()
      .filter(isTestLead)
      .forEach((l) => hardDeleteLead(l.id));

    deleteHistoricosByEmpresa({ cnpj: LEAD_TESTE.cnpj, empresaNome: LEAD_TESTE.empresa });
    FOLLOWUPS_TESTE.forEach((f) =>
      deleteHistoricosByEmpresa({ cnpj: f.cnpj, empresaNome: f.empresa }),
    );

    const from = new Date();
    from.setDate(from.getDate() - 120);
    const to = new Date();
    to.setDate(to.getDate() + 365);
    const rows = await runListFollowUps({
      data: { from: iso(from), to: iso(to), limit: 500, consultor },
    });
    const alvos = rows.filter(
      (r) =>
        (r.cnpj ?? "").replace(/\D/g, "").startsWith(TEST_CNPJ_PREFIX) ||
        (r.notes ?? "").includes(TEST_MARK),
    );
    for (const r of alvos) {
      await runDeleteFollowUp({ data: { id: r.id, consultor } });
    }
    window.dispatchEvent(new Event("bhm:followups-updated"));
    toast.success(`Dados de teste removidos (${alvos.length} follow-ups)`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        >
          🧪 Simulador E2E
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🧪 Simulador de Jornada (E2E)</DialogTitle>
          <DialogDescription>
            Injeta dados fictícios para validar a comunicação entre Pré-ligação, Histórico,
            Follow-up e Central de Reuniões — sem tocar na base oficial.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <h3 className="text-sm font-semibold text-navy-deep">
            A) ⚡ Jornada completa de fechamento — {LEAD_TESTE.empresa}
          </h3>
          <p className="text-xs text-muted-foreground">
            Cria o dossiê, grava a pós-ligação no Histórico/Diário/Relatório e transfere o lead
            para a Central de Reuniões.
          </p>
          <Button
            size="sm"
            disabled={busy === "jornada"}
            onClick={() => act("jornada", simularJornada)}
          >
            ⚡ Simular jornada completa
          </Button>

          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Movimentação livre entre etapas (avanço e recuo)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FUNNEL_STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => irParaEtapa(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:bg-accent ${
                    testLead?.status === s
                      ? "border-navy-deep bg-navy-deep/10 text-navy-deep"
                      : "border-border bg-card text-navy-deep"
                  }`}
                >
                  {LEAD_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Etapa atual do lead de teste:{" "}
              <strong>{testLead ? LEAD_STATUS_LABEL[testLead.status] : "não injetado"}</strong>
            </p>
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <h3 className="text-sm font-semibold text-navy-deep">B) ⚡ Recusa e Reativação futura</h3>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "recusa"}
            onClick={() => act("recusa", simularRecusa)}
          >
            📦 Simular recusa com motivo
          </Button>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <h3 className="text-sm font-semibold text-navy-deep">C) ⚡ Filtros de Follow-up</h3>
          <p className="text-xs text-muted-foreground">
            Injeta 3 follow-ups (–3 dias, hoje e +12 dias) para validar Atrasados / Hoje / Longo
            prazo.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "follow"}
            onClick={() => act("follow", simularFollowUps)}
          >
            📅 Simular filtros de follow-up
          </Button>
        </section>

        <section className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/60 p-3">
          <h3 className="text-sm font-semibold text-purple-900">
            D) 💰 Cálculos, honorários e comissão
          </h3>
          <p className="text-xs text-muted-foreground">
            Injeta Vision (R$ 1.431.340,03 · fee 20% · comissão R$ 85.880,40) e Argepasi
            (R$ 7.014.239,33 · fee 25% · comissão R$ 526.067,95) para validar a aba Minha Comissão.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy === "calculos"}
            onClick={() => act("calculos", simularCalculos)}
          >
            🧮 Injetar cálculos de teste
          </Button>
        </section>

        <section className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">

          <h3 className="text-sm font-semibold text-rose-800">D) 🧹 Limpar dados de teste</h3>
          <p className="text-xs text-rose-900/80">
            Remove somente registros marcados como teste (CNPJ 99.999.999/… ou nota {TEST_MARK}).
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-100"
            disabled={busy === "limpar"}
            onClick={() => act("limpar", limparTestes)}
          >
            🧹 Limpar dados de teste
          </Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}

