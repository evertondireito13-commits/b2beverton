// Hidrata o cache local (histórico + leads) a partir do Supabase na abertura
// do app e sempre que o consultor da sessão muda.
import { useEffect } from "react";
import { getConsultor, getSessionConsultor } from "@/lib/historico-store";
import { hydrateFromCloud } from "@/lib/cloud-store";

export function CloudHydrator() {
  useEffect(() => {
    const run = () => {
      const c = getSessionConsultor() ?? getConsultor();
      if (!c) return;
      void hydrateFromCloud(c);
    };
    run();
    window.addEventListener("bhm:session-changed", run);
    return () => {
      window.removeEventListener("bhm:session-changed", run);
    };
  }, []);
  return null;
}
