import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// Chave compartilhada entre cliente e servidor. O servidor lê de
// process.env.BHM_GATE_KEY; o cliente injeta este mesmo valor em cada
// server-fn RPC via functionMiddleware. É um "gate" contra tráfego
// anônimo (bots/scans) — não substitui autenticação real de usuário.
export const BHM_GATE_HEADER = "x-bhm-gate";
export const BHM_GATE_CLIENT_KEY = "bhm_gk_9K3xR7pQvL2mN8sT4wY6zA1cE5dF0hJ2kM4nP6qS8vX0";

/** Injeta o header BHM em toda chamada de server function no browser. */
export const attachBhmGate = createMiddleware({ type: "function" }).client(
  async ({ next }) => next({ headers: { [BHM_GATE_HEADER]: BHM_GATE_CLIENT_KEY } }),
);

/** Valida o header BHM antes de qualquer trabalho no servidor. */
export const requireBhmGate = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const expected = process.env.BHM_GATE_KEY;
    if (!expected) {
      throw new Response("Server misconfigured: BHM_GATE_KEY missing", { status: 500 });
    }
    const provided = getRequestHeader(BHM_GATE_HEADER);
    if (!provided || provided !== expected) {
      throw new Response("Unauthorized", { status: 401 });
    }
    return next();
  },
);
