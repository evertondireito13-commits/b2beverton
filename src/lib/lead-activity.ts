// Sinal de estagnação (SLA de atenção) de um lead da Central de Reuniões.
// Considera o último "sinal de vida": marco na timeline, follow-up criado/
// concluído, envio de ata, recebimento de docs ou a própria entrada na fase.

import type { Lead } from "@/lib/leads-store";

export type EstagnacaoNivel = "ok" | "atencao" | "critico";

const H24 = 24 * 3_600_000;
const H48 = 48 * 3_600_000;

/** ISO do contato/registro mais recente do lead. */
export function lastActivityAt(lead: Lead): string {
  const candidatos: (string | undefined)[] = [
    lead.stage_since,
    lead.ata_enviada_em,
    lead.docs_recebidos_em,
    ...(lead.timeline ?? []).map((t) => t.at),
    ...(lead.follow_ups ?? []).flatMap((f) => [f.created_at, f.done_at]),
  ];
  const times = candidatos
    .filter((v): v is string => !!v)
    .map((v) => +new Date(v))
    .filter((n) => Number.isFinite(n));
  const max = times.length > 0 ? Math.max(...times) : +new Date(lead.updated_at);
  return new Date(max).toISOString();
}

export function horasSemContato(lead: Lead): number {
  return Math.max(0, (Date.now() - +new Date(lastActivityAt(lead))) / 3_600_000);
}

/** ok < 24h · atenção 24-48h · crítico > 48h (leads fechados nunca alertam). */
export function estagnacao(lead: Lead): EstagnacaoNivel {
  if (lead.status === "fechado" || lead.status === "perdido" || lead.status === "nao_qualificado")
    return "ok";
  const ms = Date.now() - +new Date(lastActivityAt(lead));
  if (ms > H48) return "critico";
  if (ms > H24) return "atencao";
  return "ok";
}

export const ESTAGNACAO_TONE: Record<EstagnacaoNivel, string> = {
  ok: "",
  atencao: "bg-amber-100 text-amber-800",
  critico: "bg-rose-100 text-rose-700",
};

export const ESTAGNACAO_RING: Record<EstagnacaoNivel, string> = {
  ok: "",
  atencao: "border-amber-300 ring-1 ring-amber-100",
  critico: "border-rose-300 ring-1 ring-rose-100",
};

export function estagnacaoLabel(lead: Lead): string {
  const h = Math.floor(horasSemContato(lead));
  if (h >= 48) return `🛑 Parado ${Math.floor(h / 24)}d`;
  return `⚠️ Parado ${h}h`;
}
