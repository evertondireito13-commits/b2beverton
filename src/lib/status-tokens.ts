// Tokens visuais centralizados de status/prioridade/urgência.
// Reaproveitados em painel.tsx, followup.tsx, empresas.tsx e no drawer 360°.

export const TONE = {
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border-border bg-muted/50 text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
} as const;

export type Tone = keyof typeof TONE;

/** Tipografia padronizada dos cards (evita a mistura text-[11px]/text-xs). */
export const TEXT = {
  /** Título principal de um card (nome da empresa). */
  title: "text-sm font-semibold leading-tight text-navy-deep",
  /** Título de seção. */
  section: "text-sm font-semibold text-navy-deep",
  /** Texto de apoio. */
  body: "text-xs text-foreground/80",
  /** Metadados discretos. */
  meta: "text-[11px] text-muted-foreground",
  /** Rótulos em caixa alta. */
  label: "text-[10px] uppercase tracking-wide text-muted-foreground",
} as const;

export const CARD = "min-w-0 rounded-2xl border border-border bg-card p-4 shadow-card";

/** Tom da urgência de uma data agendada. */
export function toneForDate(iso: string | null | undefined): Tone {
  if (!iso) return "neutral";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "neutral";
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  if (t < startToday.getTime()) return "danger";
  if (t <= endToday.getTime()) return "warning";
  return "success";
}

/** Histórico/evento criado nas últimas 24h. */
export function isRecent(iso: string | null | undefined, hours = 24): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= hours * 3_600_000;
}
