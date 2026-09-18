import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Cloud, Loader2 } from "lucide-react";
import { getConsultor, getSessionConsultor } from "@/lib/historico-store";
import { getBestAppDataBackup, saveAppDataBackup } from "@/lib/data-backup.functions";
import {
  BACKUP_RESTORED_EVENT,
  collectDurableAppData,
  countBackupItems,
  restoreMissingAppData,
} from "@/lib/data-backup-browser";

const DATA_EVENTS = [
  "bhm:historico-updated",
  "bhm:activities-updated",
  "bhm:leads-updated",
  "bhm:notifications-updated",
  "bhm:call-timer-updated",
  "bhm:preparacao-updated",
  "bhm:preparacao-realizada",
  "bhm:session-changed",
] as const;

export function AutomaticBackup() {
  const saveBackup = useServerFn(saveAppDataBackup);
  const getBest = useServerFn(getBestAppDataBackup);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const runBackup = useCallback(async (reason: "automatic" | "startup" | "daily" = "automatic") => {
    if (runningRef.current || typeof window === "undefined") return;
    const consultor = getSessionConsultor() ?? getConsultor();
    const payload = collectDurableAppData(consultor);
    if (Object.keys(payload).length === 0) return;
    runningRef.current = true;
    setState("saving");
    try {
      const result = await saveBackup({ data: {
        consultor,
        reason,
        payload,
        itemCount: countBackupItems(payload),
      } });
      setLastSavedAt(result.createdAt);
      setState("saved");
    } catch {
      setState("error");
    } finally {
      runningRef.current = false;
    }
  }, [saveBackup]);

  const scheduleBackup = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void runBackup("automatic"), 1200);
  }, [runBackup]);

  useEffect(() => {
    let cancelled = false;
    async function recoverThenProtect() {
      const consultor = getSessionConsultor() ?? getConsultor();
      try {
        const best = await getBest({ data: { consultor } });
        if (!cancelled && best?.payload && typeof best.payload === "object" && !Array.isArray(best.payload)) {
          restoreMissingAppData(best.payload as Record<string, unknown>, consultor);
          setLastSavedAt(best.created_at);
        }
      } catch {
        // O cache local continua funcionando mesmo durante indisponibilidade de rede.
      }
      if (!cancelled) void runBackup("startup");
    }
    void recoverThenProtect();
    return () => { cancelled = true; };
  }, [getBest, runBackup]);

  useEffect(() => {
    for (const eventName of DATA_EVENTS) window.addEventListener(eventName, scheduleBackup);
    window.addEventListener(BACKUP_RESTORED_EVENT, scheduleBackup);
    const interval = window.setInterval(() => void runBackup("automatic"), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void runBackup("automatic");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      for (const eventName of DATA_EVENTS) window.removeEventListener(eventName, scheduleBackup);
      window.removeEventListener(BACKUP_RESTORED_EVENT, scheduleBackup);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [runBackup, scheduleBackup]);

  const lastSavedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const label = state === "saving"
    ? "Salvando…"
    : state === "error"
      ? "Erro ao salvar — clique para tentar novamente"
      : state === "saved" && lastSavedLabel
        ? `Salvo agora · última sincronização às ${lastSavedLabel}`
        : lastSavedLabel
          ? `Última sincronização às ${lastSavedLabel}`
          : "Proteção automática ativa";

  const tooltip = state === "error"
    ? "O último backup falhou. Seus dados continuam salvos neste dispositivo — clique para tentar sincronizar de novo agora."
    : "Empresas, históricos e preparação são copiados automaticamente para o cofre seguro.";

  return (
    <button
      type="button"
      role="status"
      aria-live="polite"
      title={tooltip}
      onClick={state === "error" ? () => void runBackup("automatic") : undefined}
      disabled={state !== "error"}
      className={
        "fixed bottom-3 right-3 z-40 flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium shadow-sm backdrop-blur transition-colors " +
        (state === "error"
          ? "cursor-pointer border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
          : "border-border bg-background/95 text-muted-foreground")
      }
    >
      {state === "saving" ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : state === "error" ? (
        <AlertCircle className="size-3.5" />
      ) : state === "saved" ? (
        <CheckCircle2 className="size-3.5 text-primary" />
      ) : (
        <Cloud className="size-3.5 text-primary" />
      )}
      <span>{label}</span>
    </button>
  );
}
