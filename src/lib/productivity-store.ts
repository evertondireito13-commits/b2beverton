// Timer de ligações + estatísticas pessoais de produtividade.
// Sessões de ligação ficam salvas por consultor; o timer sobrevive a
// recarregamentos porque guardamos apenas o instante de início.

import { getConsultor, getSessionConsultor } from "@/lib/historico-store";

export const TIMER_EVENT = "bhm:call-timer-updated";

export type CallSession = {
  id: string;
  empresa: string;
  cnpj?: string | null;
  started_at: string;
  ended_at: string;
  duracao_seg: number;
  resultado?: string | null;
};

export type RunningTimer = {
  empresa: string;
  cnpj?: string | null;
  started_at: string;
};

const SESSIONS_BASE = "bhm-call-sessions";
const RUNNING_BASE = "bhm-call-timer-running";

function isBrowser() {
  return typeof window !== "undefined";
}
function consultor(): string {
  return (getSessionConsultor() ?? getConsultor()) || "shared";
}
function sessionsKey() {
  return `${SESSIONS_BASE}::${consultor()}`;
}
function runningKey() {
  return `${RUNNING_BASE}::${consultor()}`;
}

function readJson<T>(k: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(k: string, v: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(TIMER_EVENT));
}

export function listCallSessions(): CallSession[] {
  return readJson<CallSession[]>(sessionsKey(), []);
}

export function getRunningTimer(): RunningTimer | null {
  return readJson<RunningTimer | null>(runningKey(), null);
}

export function startTimer(empresa: string, cnpj?: string | null): RunningTimer {
  const running: RunningTimer = {
    empresa: empresa || "Empresa sem nome",
    cnpj: cnpj ?? null,
    started_at: new Date().toISOString(),
  };
  writeJson(runningKey(), running);
  return running;
}

export function cancelTimer() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(runningKey());
  window.dispatchEvent(new CustomEvent(TIMER_EVENT));
}

export function stopTimer(resultado?: string | null): CallSession | null {
  const running = getRunningTimer();
  if (!running) return null;
  const ended = new Date();
  const dur = Math.max(
    1,
    Math.round((ended.getTime() - new Date(running.started_at).getTime()) / 1000),
  );
  const session: CallSession = {
    id: crypto.randomUUID(),
    empresa: running.empresa,
    cnpj: running.cnpj ?? null,
    started_at: running.started_at,
    ended_at: ended.toISOString(),
    duracao_seg: dur,
    resultado: resultado ?? null,
  };
  const list = [session, ...listCallSessions()].slice(0, 1000);
  writeJson(sessionsKey(), list);
  if (isBrowser()) window.localStorage.removeItem(runningKey());
  window.dispatchEvent(new CustomEvent(TIMER_EVENT));
  return session;
}

export function formatDuration(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type ProdutividadeStats = {
  ligacoesHoje: number;
  tempoTotalHojeSeg: number;
  tempoMedioSeg: number;
  maiorLigacaoSeg: number;
  ligacoesSemana: number;
  tempoSemanaSeg: number;
  melhorHora: string | null;
  melhorDiaSemana: string | null;
  streakDias: number;
  porHora: { hora: number; total: number }[];
};

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function produtividadeStats(): ProdutividadeStats {
  const sessions = listCallSessions();
  const now = new Date();
  const inicioHoje = new Date(now);
  inicioHoje.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(inicioHoje);
  inicioSemana.setDate(inicioSemana.getDate() - ((now.getDay() + 6) % 7));

  const hoje = sessions.filter((s) => new Date(s.started_at) >= inicioHoje);
  const semana = sessions.filter((s) => new Date(s.started_at) >= inicioSemana);

  const porHoraMap = new Map<number, number>();
  const porDiaMap = new Map<number, number>();
  for (const s of sessions) {
    const d = new Date(s.started_at);
    porHoraMap.set(d.getHours(), (porHoraMap.get(d.getHours()) ?? 0) + 1);
    porDiaMap.set(d.getDay(), (porDiaMap.get(d.getDay()) ?? 0) + 1);
  }
  const melhorHoraEntry = [...porHoraMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const melhorDiaEntry = [...porDiaMap.entries()].sort((a, b) => b[1] - a[1])[0];

  // Streak: dias consecutivos (a partir de hoje/ontem) com ao menos 1 ligação.
  const diasComLigacao = new Set(sessions.map((s) => s.started_at.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(inicioHoje);
  if (!diasComLigacao.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (diasComLigacao.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const tempoTotalHoje = hoje.reduce((s, x) => s + x.duracao_seg, 0);
  const total = sessions.reduce((s, x) => s + x.duracao_seg, 0);

  return {
    ligacoesHoje: hoje.length,
    tempoTotalHojeSeg: tempoTotalHoje,
    tempoMedioSeg: sessions.length ? Math.round(total / sessions.length) : 0,
    maiorLigacaoSeg: sessions.reduce((m, x) => Math.max(m, x.duracao_seg), 0),
    ligacoesSemana: semana.length,
    tempoSemanaSeg: semana.reduce((s, x) => s + x.duracao_seg, 0),
    melhorHora: melhorHoraEntry ? `${String(melhorHoraEntry[0]).padStart(2, "0")}h` : null,
    melhorDiaSemana: melhorDiaEntry ? DIAS[melhorDiaEntry[0]] : null,
    streakDias: streak,
    porHora: [...Array(12).keys()]
      .map((i) => i + 7)
      .map((hora) => ({ hora, total: porHoraMap.get(hora) ?? 0 })),
  };
}
