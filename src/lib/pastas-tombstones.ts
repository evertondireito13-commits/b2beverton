// Registro permanente de pastas (carteiras) excluídas na Preparação Noturna.
// Sem isso, o restaurador de backup automático mescla a lista antiga de volta
// e as pastas apagadas "ressuscitam" no próximo carregamento.

const TOMBSTONE_KEY_PREFIX = "bhm-preparacao::pastas-deleted";

function allTombstoneKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(TOMBSTONE_KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

/** Ids de pastas excluídas (considera todos os apelidos de consultor). */
export function loadDeletedPastaIds(): Set<string> {
  const out = new Set<string>();
  if (typeof window === "undefined") return out;
  for (const key of allTombstoneKeys()) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
      if (Array.isArray(parsed)) parsed.forEach((id) => out.add(String(id)));
    } catch {
      /* noop */
    }
  }
  return out;
}

export function markPastaDeleted(id: string, ownerSlug: string): void {
  if (typeof window === "undefined") return;
  const key = `${TOMBSTONE_KEY_PREFIX}::${ownerSlug}`;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    const list = Array.isArray(parsed) ? parsed.map(String) : [];
    if (!list.includes(id)) list.push(id);
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

/** Libera o id (usado se o usuário recriar/renomear uma pasta com o mesmo id). */
export function unmarkPastaDeleted(id: string): void {
  if (typeof window === "undefined") return;
  for (const key of allTombstoneKeys()) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
      if (!Array.isArray(parsed)) continue;
      const next = parsed.map(String).filter((v) => v !== id);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }
}

export function isPastasListKey(key: string): boolean {
  return key.startsWith("bhm-preparacao::pastas") && !key.startsWith(TOMBSTONE_KEY_PREFIX);
}

/** Extrai o id da pasta de uma chave `bhm-preparacao::pasta:<id>[::owner]`. */
export function pastaIdFromBucketKey(key: string): string | null {
  const match = /^bhm-preparacao::pasta:([^:]+)/.exec(key);
  return match ? match[1] : null;
}
