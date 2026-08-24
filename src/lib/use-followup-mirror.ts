// Mantém o espelho local da tabela follow_ups atualizado nas telas que leem
// os follow-ups de forma síncrona (Agenda e drawer de timeline da empresa).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFollowUps, type FollowUp } from "@/lib/follow-ups.functions";
import { activeConsultor, cacheRemoteFollowUps, FOLLOWUPS_EVENT } from "@/lib/followup-bridge";

export function useFollowUpMirror(enabled = true): number {
  const runList = useServerFn(listFollowUps);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const sync = async () => {
      try {
        const from = new Date();
        from.setDate(from.getDate() - 60);
        const to = new Date();
        to.setDate(to.getDate() + 365);
        const rows = (await runList({
          data: {
            from: from.toISOString(),
            to: to.toISOString(),
            limit: 500,
            consultor: activeConsultor(),
          },
        })) as FollowUp[];
        if (cancelled) return;
        cacheRemoteFollowUps(rows);
        setVersion((n) => n + 1);
      } catch {
        /* offline: usa o espelho existente */
      }
    };

    sync();
    const onChange = () => setVersion((n) => n + 1);
    window.addEventListener(FOLLOWUPS_EVENT, onChange);
    window.addEventListener("bhm:session-changed", sync);
    return () => {
      cancelled = true;
      window.removeEventListener(FOLLOWUPS_EVENT, onChange);
      window.removeEventListener("bhm:session-changed", sync);
    };
  }, [runList, enabled]);

  return version;
}
