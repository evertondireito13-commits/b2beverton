// Timer de ligação flutuante — cronometra a chamada em curso e registra a sessão.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  cancelTimer,
  formatDuration,
  getRunningTimer,
  startTimer,
  stopTimer,
  TIMER_EVENT,
  type RunningTimer,
} from "@/lib/productivity-store";
import { getActiveLead, ACTIVE_LEAD_EVENT } from "@/lib/daily-activities";

export function CallTimerWidget() {
  const [running, setRunning] = useState<RunningTimer | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [empresaAtiva, setEmpresaAtiva] = useState<string>("");
  const [cnpjAtivo, setCnpjAtivo] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setRunning(getRunningTimer());
      const lead = getActiveLead();
      setEmpresaAtiva(lead?.razaoSocial ?? "");
      setCnpjAtivo(lead?.cnpj ?? null);
    };
    sync();
    const evts = [TIMER_EVENT, ACTIVE_LEAD_EVENT, "bhm:session-changed", "storage"];
    evts.forEach((e) => window.addEventListener(e, sync));
    return () => evts.forEach((e) => window.removeEventListener(e, sync));
  }, []);

  useEffect(() => {
    if (!running) {
      setSegundos(0);
      return;
    }
    const tick = () =>
      setSegundos(
        Math.max(0, Math.round((Date.now() - new Date(running.started_at).getTime()) / 1000)),
      );
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [running]);

  if (!running) {
    // Vínculo automático: usa sempre a empresa ativa na tela, sem seletor.
    return (
      <Button
        variant="outline"
        disabled={!empresaAtiva}
        className="w-full justify-between border-navy-deep/15 bg-card text-navy-deep hover:border-primary/50"
        title={empresaAtiva ? `Cronometrar ligação — ${empresaAtiva}` : "Abra uma empresa para iniciar"}
        onClick={() => {
          if (!empresaAtiva) return;
          startTimer(empresaAtiva, cnpjAtivo);
          setRunning(getRunningTimer());
        }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          ⏱ {empresaAtiva ? "Cronometrar ligação" : "Timer de ligação"}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">
          {empresaAtiva ? "Iniciar" : "Sem empresa"}
        </span>
      </Button>
    );
  }


  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Em ligação
        </span>
        <span className="font-mono text-lg font-bold text-navy-deep">
          {formatDuration(segundos)}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{running.empresa}</p>
      <div className="mt-2 flex gap-1.5">
        <Button
          size="sm"
          className="h-7 flex-1 text-[11px]"
          onClick={() => {
            const s = stopTimer();
            setRunning(null);
            if (s) toast.success(`Ligação registrada — ${formatDuration(s.duracao_seg)}`);
          }}
        >
          Encerrar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() => {
            cancelTimer();
            setRunning(null);
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
