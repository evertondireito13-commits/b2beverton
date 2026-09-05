import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateWithAI, extractContactNameWithAI, lookupCnpj, transcribeAudio, searchCompanyByName, enrichPhones, interpretarStatusConversa } from "@/lib/prospeccao.functions";
import { logCall } from "@/lib/call-logs.functions";
import { cancelPendingFollowUpsForCompany, createFollowUp, extractFollowUpFromCall, listFollowUps, type FollowUp } from "@/lib/follow-ups.functions";
import { upsertLead as upsertLeadCentral, isLeadIsolated, findLead, addLeadFollowUp } from "@/lib/leads-store";
import {
  getActivePromptText,
  loadLibrary,
  createPrompt,
  updatePrompt,
  deletePrompt,
  setActivePrompt,
  PROMPT_LIBRARY_EVENT,
  syncLibraryFromCloud,
  type PromptItem,
  type PromptTipo,
  type PromptLibrary,
} from "@/lib/prompts-store";

import {
  buildRegistroFromHistorico,
  saveHistorico,
  updateHistoricoStatus,
  updateHistoricoEmpresa,
  updateHistoricoContatoCargo,
  loadRascunho,
  updateRascunho,
  clearRascunho,
  extractTelefones,
  extractEmailsPessoas,
  textoIndicaNegativaComercial,
  getConsultor,
  getSessionConsultor,
  loginConsultor,
  logoutConsultor,
  listHistoricos,
  type HistoricoEmpresa,
} from "@/lib/historico-store";
import {
  addActivity,
  renameActivitiesByEmpresa,
  updateActivityContatoCargo,
  getActiveLead,
  getTodayActivities,
  setActiveLead,
  todaySaoPauloISO,
  ACTIVE_LEAD_EVENT,
  type ActiveLeadLike,
  type BhmActivityLog as _BhmActivityLog,
} from "@/lib/daily-activities";


// Re-exposta no escopo global do arquivo, conforme especificação.
export type BhmActivityLog = _BhmActivityLog;

import {
  ConsultarHistoricoCard,
  emitHistoricoUpdated,
} from "@/components/historico-panel";
import { CallRecorderButton } from "@/components/call-recorder-button";
import {
  GO_POS_EVENT,
  PENDING_AUDIO_EVENT,
  clearPendingAudio,
  formatSecs,
  getPendingAudio,
  isRecording,
  stopCallRecording,
} from "@/lib/call-recorder";
import { stopTimer } from "@/lib/productivity-store";

import { CommandPalette } from "@/components/command-palette";
// NotificationsCenter e CallTimerWidget removidos da sidebar por ora (componentes preservados).

import { AppNav } from "@/components/app-nav";


import { EditableCompanyName } from "@/components/editable-company-name";
import { LOAD_PRE_LIGACAO_EVENT, PREPARACAO_REALIZADA_EVENT, ACTIVE_PREPARATION_ID_KEY, PENDING_PRE_LIGACAO_KEY, markPreparacaoRealizadaByCompany } from "@/components/preparacao-noturna";



import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  Copy,
  Download,
  Search,
  Sparkles,
  Settings2,
  RotateCcw,
  Loader2,
  Send,
  Upload,
  Mic,
  Square,
  Check,
  Trash2,
  Link2,
  History as HistoryIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ------- Sessão ativa v2 (persistência do lead atual) --------
export type SessaoAtivaV2 = {
  cnpj?: string;
  dados?: string;
  empresaResumo?: string | null;
  telefones?: unknown;
  script?: string;
};
const SESSAO_ATIVA_BASE = "bhm-sessao-ativa-v2";
const TOKEN_SAVINGS_BASE = "bhm-token-savings";


export function activeConsultorKey(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}
function sessaoAtivaKey(): string {
  return `${SESSAO_ATIVA_BASE}::${activeConsultorKey()}`;
}
function tokenSavingsKey(): string {
  return `${TOKEN_SAVINGS_BASE}::${activeConsultorKey()}`;
}

export function loadSessaoAtiva(): SessaoAtivaV2 {
  if (typeof window === "undefined") return {};
  try {
    const raw =
      window.localStorage.getItem(sessaoAtivaKey()) ??
      window.localStorage.getItem(SESSAO_ATIVA_BASE); // migração
    return raw ? (JSON.parse(raw) as SessaoAtivaV2) : {};
  } catch {
    return {};
  }
}
export function updateSessaoAtiva(patch: SessaoAtivaV2) {
  if (typeof window === "undefined") return;
  const cur = loadSessaoAtiva();
  const next = { ...cur, ...patch };
  try {
    window.localStorage.setItem(sessaoAtivaKey(), JSON.stringify(next));
    window.dispatchEvent(new Event("bhm:sessao-ativa-updated"));
  } catch {
    /* quota */
  }
}
export function clearSessaoAtiva() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessaoAtivaKey());
  clearRascunho();
  window.dispatchEvent(new Event("bhm:sessao-ativa-updated"));
  window.dispatchEvent(new Event("bhm:historico-updated"));
}


// Botão de cópia com feedback visual (check verde por ~1.4s)
export function CopyButton({
  text,
  label = "Copiar",
  variant = "ghost",
  size = "sm",
  className = "",
  compact = false,
  toastMsg,
}: {
  text: string | (() => string | Promise<string>);
  label?: string;
  variant?: "ghost" | "outline" | "secondary" | "default";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  compact?: boolean;
  toastMsg?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={async () => {
        try {
          const t = typeof text === "function" ? await text() : text;
          if (!t) return;
          await navigator.clipboard.writeText(t);
          setCopied(true);
          toast.success(toastMsg ?? "Copiado");
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          toast.error("Não foi possível copiar");
        }
      }}
    >
      {copied ? (
        <Check className={`${compact ? "h-3 w-3" : "mr-1 h-3 w-3"} text-emerald-600`} />
      ) : (
        <Copy className={compact ? "h-3 w-3" : "mr-1 h-3 w-3"} />
      )}
      {!compact && (copied ? "Copiado!" : label)}
    </Button>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => {
    const t = search.tab;
    const valid = t === "pos" || t === "historico" ? t : "pre";
    return { tab: valid as "pre" | "pos" | "historico" };
  },
  head: () => ({
    meta: [
      { title: "Central de Prospecção B2B" },
      {
        name: "description",
        content:
          "Gere script de abordagem e histórico pós-ligação para prospecção B2B em advocacia tributária.",
      },
    ],
  }),
  component: CentralProspeccao,
});

function CentralProspeccao() {
  const { tab: initialTab } = Route.useSearch();
  const [tab, setTab] = useState<"pre" | "pos" | "historico">(initialTab);
  const [session, setSession] = useState<ReturnType<typeof getSessionConsultor>>(null);
  const [hydrated, setHydrated] = useState(false);
  // Contador que força releitura do prompt ativo quando a biblioteca muda
  // (criação/edição/exclusão/troca do prompt ativo por qualquer aba).
  const [libTick, setLibTick] = useState(0);

  useEffect(() => {
    setSession(getSessionConsultor());
    setHydrated(true);
  }, []);

  async function selectHomeTab(next: "pre" | "pos" | "historico") {
    if (next === "pos" && isRecording()) {
      const lead = getActiveLead();
      const empresa = lead?.razaoSocial || lead?.nomeFantasia || null;
      await stopCallRecording(empresa);
      stopTimer();
      toast.success("Ligação encerrada. Áudio enviado para transcrição no Pós-ligação.");
    }
    setTab(next);
  }

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Encerrar gravação na Pré-ligação leva o operador direto ao Pós-ligação.
  useEffect(() => {
    const h = () => setTab("pos");
    window.addEventListener(GO_POS_EVENT, h);
    return () => window.removeEventListener(GO_POS_EVENT, h);
  }, []);

  useEffect(() => {
    const h = () => {
      setSession(getSessionConsultor());
      setLibTick((t) => t + 1);
      window.dispatchEvent(new Event("bhm:activities-updated"));
      window.dispatchEvent(new Event("bhm:historico-updated"));
    };
    window.addEventListener("bhm:session-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("bhm:session-changed", h);
      window.removeEventListener("storage", h);
    };
  }, []);

  useEffect(() => {
    const h = () => setLibTick((t) => t + 1);
    window.addEventListener(PROMPT_LIBRARY_EVENT, h);
    // Puxa a biblioteca salva no banco para este consultor.
    void syncLibraryFromCloud().then(h);
    return () => window.removeEventListener(PROMPT_LIBRARY_EVENT, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);


  const scriptPromptText = useMemo(
    () => getActivePromptText("abordagem"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libTick, session],
  );
  const historyPromptText = useMemo(
    () => getActivePromptText("historico"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libTick, session],
  );

  if (!hydrated || !session) {
    return (
      <div className="relative min-h-screen bg-background text-foreground">
        <Toaster richColors position="top-right" />
        {hydrated ? <LoginScreen onLogged={(c) => setSession(c)} /> : null}
      </div>
    );
  }

  return (
    <AppShell current={tab} onSelect={(v) => void selectHomeTab(v)}>
      {tab === "pre" && <PreLigacao promptText={scriptPromptText} />}
      {tab === "pos" && <PosLigacao promptText={historyPromptText} />}
      {tab === "historico" && <ConsultarHistoricoCard />}
    </AppShell>
  );

}


/**
 * Shell global compartilhado por TODAS as abas.
 * - Header sticky no topo.
 * - Coluna lateral fixa (lg:sticky) com as métricas globais (Volume, Decisor,
 *   Retenção, Pipeline) — visíveis em qualquer aba, EXCETO na Preparação
 *   Noturna, onde a barra lateral fica escondida para dar mais espaço à fila
 *   de empresas.
 * - Coluna principal com a barra de abas + conteúdo da rota.
 * - Footer padrão.
 */
export function AppShell({
  current,
  onSelect,
  children,
}: {
  current:
    | "pre"
    | "pos"
    | "historico"
    | "followup"
    | "diario"
    | "relatorio"
    | "estrategia"
    | "reunioes"
    | "preparacao"
    | "painel"
    | "agenda"
    | "comissao"
    | "empresas";


  onSelect?: (v: "pre" | "pos" | "historico") => void;
  children: React.ReactNode;
}) {
  const headerCurrent: "pre-or-pos" | "relatorio" =
    current === "relatorio" || current === "diario" || current === "estrategia"
      ? "relatorio"
      : "pre-or-pos";
  const showSidebar = current !== "preparacao";
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-right" />
      <AppHeader current={headerCurrent} />
      <CommandPalette />
      <main className="mx-auto w-full max-w-7xl px-3 pt-4 pb-16 sm:px-4 md:px-6 md:pt-6 2xl:max-w-[1680px]">
        <div
          className={
            showSidebar
              ? "grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]"
              : "grid grid-cols-1 gap-4 md:gap-5"
          }
        >
          {showSidebar && (
            <>
              <MobileSidebarToggle />
              <aside
                data-app-sidebar
                className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1"
              >
                <AppNav current={current} onSelect={onSelect} />
              </aside>
            </>
          )}
          <section className="min-w-0 space-y-4 md:space-y-5">
            <div className="min-w-0">{children}</div>
          </section>

        </div>
      </main>
      <AppFooter />
    </div>
  );
}

/** Botão que abre/fecha a coluna de indicadores e atalhos em telas pequenas. */
function MobileSidebarToggle() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-app-sidebar]");
    if (!el) return;
    el.classList.toggle("hidden", !open);
    el.classList.toggle("block", open);
  }, [open]);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-card lg:hidden"
      aria-expanded={open}
    >
      <span>📌 Menu e indicadores</span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {open ? "Fechar" : "Abrir"}
      </span>
    </button>
  );
}





export function StatCardsStrip() {
  const [tick, setTick] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [followUpCounts, setFollowUpCounts] = useState({ overdue: 0, today: 0, upcoming: 0 });
  const runList = useServerFn(listFollowUps);

  useEffect(() => {
    setHydrated(true);
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("bhm:activities-updated", bump);
    window.addEventListener("bhm:session-changed", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("bhm:activities-updated", bump);
      window.removeEventListener("bhm:session-changed", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const loadFollowUpsRef = useRef<() => void>(() => {});
  loadFollowUpsRef.current = async () => {
    if (typeof window === "undefined") return;
    try {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setDate(to.getDate() + 365);
      to.setHours(23, 59, 59, 999);
      const list = await runList({
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          limit: 500,
          consultor: activeConsultorKey(),
        },
      });
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
      let overdue = 0, today = 0, upcoming = 0;
      for (const r of list as FollowUp[]) {
        if (r.status !== "pending") continue;
        if (r.action_type === "meeting" || r.action_type === "negociacao") continue;
        // ISOLAMENTO: leads da Central de Reuniões não contam na fila fria.
        if (isLeadIsolated(r.company_name, r.cnpj)) continue;
        const t = new Date(r.scheduled_at).getTime();
        if (t < startToday.getTime()) overdue++;
        else if (t <= endToday.getTime()) today++;
        else upcoming++;
      }
      setFollowUpCounts({ overdue, today, upcoming });
    } catch {
      /* silencioso */
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    loadFollowUpsRef.current();
    const bump = () => loadFollowUpsRef.current();
    window.addEventListener("bhm:activities-updated", bump);
    window.addEventListener("bhm:session-changed", bump);
    window.addEventListener("bhm:historico-updated", bump);
    window.addEventListener("bhm:followups-updated", bump);
    const iv = window.setInterval(bump, 60_000);
    return () => {
      window.removeEventListener("bhm:activities-updated", bump);
      window.removeEventListener("bhm:session-changed", bump);
      window.removeEventListener("bhm:historico-updated", bump);
      window.removeEventListener("bhm:followups-updated", bump);
      window.clearInterval(iv);
    };
  }, [hydrated]);

  const { empresasUnicasHoje, reunioesHoje } = useMemo(() => {
    void tick;
    if (!hydrated || typeof window === "undefined") {
      return { totalHoje: 0, empresasUnicasHoje: 0, reunioesHoje: 0 };
    }
    const acts = getTodayActivities();
    const reunioes = acts.filter((a) => /reuni/i.test(a.proximaAcao ?? "") || /reuni/i.test(a.resultado ?? "")).length;
    const seen = new Set<string>();
    for (const a of acts) {
      const cnpj = (a.cnpj ?? "").replace(/\D/g, "");
      const nome = (a.empresa ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const key = cnpj || nome;
      if (key) seen.add(key);
    }
    return { totalHoje: acts.length, empresasUnicasHoje: seen.size, reunioesHoje: reunioes };
  }, [tick, hydrated]);






  const mediaTexto =
    reunioesHoje > 0
      ? `Média: 1 reunião a cada ${Math.max(1, Math.round(empresasUnicasHoje / reunioesHoje))} empresas`
      : "Nenhuma reunião registrada ainda";

  const hojeDDMM = (() => {
    const d = new Date();
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${dd}/${mm}`;
  })();

  const totalFollowUps = followUpCounts.overdue + followUpCounts.today + followUpCounts.upcoming;
  const followTone =
    followUpCounts.overdue > 0
      ? "border-red-500/70 bg-red-500/10 hover:border-red-500"
      : followUpCounts.today > 0
        ? "border-primary/60 bg-primary/5 hover:border-primary"
        : "border-navy-deep/15 bg-card hover:border-primary/50";
  const followValueColor =
    followUpCounts.overdue > 0
      ? "text-red-700"
      : followUpCounts.today > 0
        ? "text-primary"
        : "text-navy-deep";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
      {/* Card 1 — Follow-ups (clique para abrir a aba completa) */}

      <Link
        to="/followup"
        search={{ tab: "followups" }}
        className={`block rounded-xl border px-4 py-3 shadow-card transition-colors ${followTone}`}
      >
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            📞 Follow-ups
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Abrir</span>
        </div>
        <div className={`mt-1 text-lg font-semibold tracking-tight ${followValueColor}`}>
          {totalFollowUps} {totalFollowUps === 1 ? "Retorno" : "Retornos"}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-medium">
          <span className={`rounded-full px-2 py-0.5 ${followUpCounts.overdue > 0 ? "bg-red-500/15 text-red-700" : "bg-muted text-muted-foreground"}`}>
            Atrasados {followUpCounts.overdue}
          </span>
          <span className={`rounded-full px-2 py-0.5 ${followUpCounts.today > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
            Hoje {followUpCounts.today}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            Futuros {followUpCounts.upcoming}
          </span>
        </div>
      </Link>

      {/* Card 3 — Volume de Reuniões */}
      <div className="rounded-xl border border-navy-deep/15 bg-card px-4 py-3 shadow-card transition-colors hover:border-gold/50">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Volume de Reuniões ({hojeDDMM})
        </div>
        <div className="mt-1 text-lg font-semibold tracking-tight text-navy-deep">
          {reunioesHoje} Agendamento{reunioesHoje === 1 ? "" : "s"}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{mediaTexto}</div>
      </div>

    </div>
  );
}



function LoginScreen({ onLogged }: { onLogged: (c: "Everton Pereira" | "Eloane Manfroni") => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = loginConsultor(user, pass);
    if (!c) {
      setErro("Usuário ou senha inválidos.");
      return;
    }
    setErro(null);
    toast.success(`Bem-vindo(a), ${c}!`);
    onLogged(c);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Central de Prospecção BHM</CardTitle>
          <p className="text-sm text-muted-foreground">Entre com suas credenciais de consultor.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-user">Usuário</Label>
              <Input
                id="login-user"
                autoComplete="username"
                autoCapitalize="none"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="everton ou eloane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-pass">Senha</Label>
              <Input
                id="login-pass"
                type="password"
                autoComplete="current-password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••"
              />
            </div>
            {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
            <Button type="submit" className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}



export function AppHeader({ current: _current }: { current: "pre-or-pos" | "relatorio" }) {
  const [consultor, setConsultor] = useState<string | null>(null);
  useEffect(() => {
    setConsultor(getSessionConsultor());
    const onChange = () => setConsultor(getSessionConsultor());
    window.addEventListener("bhm:session-changed", onChange);
    return () => window.removeEventListener("bhm:session-changed", onChange);
  }, []);
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:px-4 md:gap-6 md:px-6 md:py-3 2xl:max-w-[1680px]">
        <Link
          to="/"
          search={{ tab: "pre" }}
          className="flex min-w-0 items-center gap-2 rounded-xl -mx-1 px-1 py-0.5 transition-colors hover:bg-muted/60 sm:gap-3"
          aria-label="Ir para a Pré-ligação"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-elegant">
            <BhmDiamond className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-[14px] tracking-tight text-foreground sm:text-[15px]">
              BHM&nbsp;
            </div>
            <div className="hidden text-[10px] font-medium tracking-[0.24em] text-muted-foreground uppercase sm:block">
              PROSPECÇÃO B2B
            </div>

          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5 text-right sm:gap-2 md:gap-3">
          <ThemeToggle />
          <div className="hidden leading-tight lg:block">
            <div className="max-w-[160px] truncate text-sm font-medium text-foreground">
              {consultor ?? "\u00A0"}
            </div>
            <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              ADVOGADO
            </div>
          </div>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
            {consultor ? consultor.split(" ").map((s) => s[0]).slice(0, 2).join("") : ""}
          </div>
          {consultor ? (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gold/40 px-2 text-navy-deep hover:bg-gold/10 sm:px-3"
                    title="Encerra a sessão do lead atual (CNPJ, telefones e script). Históricos e relatórios permanecem."
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Encerrar sessão do lead</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar sessão do lead atual?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação apaga o CNPJ carregado, dados cadastrais, telefones, script
                      e também o áudio gravado/pendente da chamada. Os históricos salvos e relatórios permanecem intactos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        clearSessaoAtiva();
                        clearPendingAudio();
                        toast.success("Sessão limpa. Pronto para uma nova prospecção.");
                        if (typeof window !== "undefined") window.location.reload();
                      }}
                    >
                      Encerrar sessão
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="outline"
                size="sm"
                className="px-2 sm:px-3"
                onClick={() => {
                  logoutConsultor();
                  toast.success("Sessão encerrada.");
                }}
              >
                Sair
              </Button>
            </>
          ) : null}
        </div>


      </div>
    </header>
  );
}




export function AppFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 break-words px-3 py-4 text-[10px] font-medium tracking-[0.15em] text-muted-foreground uppercase sm:px-4 md:gap-3 md:px-6 md:tracking-[0.2em] 2xl:max-w-[1680px]">
        <span className="min-w-0 break-all">Curitiba/PR · brunomorais@brunohenriquemorais.adv.br</span>
        <span className="hidden min-w-0 normal-case tracking-normal opacity-70 md:inline">
          Módulos: Pré · Pós · Relatório · Fontes: BrasilAPI · CNPJá · CNPJ.biz · site · IA: Lovable AI
        </span>

      </div>
    </footer>
  );
}

function BhmDiamond({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect
        x="50"
        y="6"
        width="62.2"
        height="62.2"
        transform="rotate(45 50 6)"
        rx="2"
      />
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontFamily="'Cormorant Garamond', serif"
        fontSize="46"
        fontWeight="500"
        fill="currentColor"
        stroke="none"
      >
        B
      </text>
    </svg>
  );
}

import { PreLigacao } from "@/components/prospeccao/pre-ligacao";
import { PosLigacao } from "@/components/prospeccao/pos-ligacao";
export { PromptLibraryPanel, inferirSegmentoPorCnae, compileScriptLocally, parseLeadFromDados } from "@/components/prospeccao/shared";
export type { ActiveLeadData } from "@/components/prospeccao/shared";
