// Lista de "não contatar" — empresas que nunca mais devem entrar em fila de ligação.
//
// Guarda a IDENTIDADE da empresa (CNPJ e/ou nome normalizados), nunca um id de
// registro: a mesma empresa pode ser recriada por sincronização e ganhar id novo.

import { getConsultor, getSessionConsultor } from "@/lib/historico-store";

const KEY_PREFIX = "bhm-nao-contatar";

export type BloqueioContato = {
  /** chave de identidade (cnpj:... ou nome:...) usada como id da entrada */
  key: string;
  empresa: string;
  cnpj: string | null;
  motivo: string;
  at: string;
};

function normalizeCnpj(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

function normalizeNome(v?: string | null): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,\-/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function storageKey(): string {
  const c = (getSessionConsultor() ?? getConsultor()) || "shared";
  return `${KEY_PREFIX}::${c}`;
}

/** Chaves de identidade de uma empresa (cnpj e/ou nome). */
export function chavesIdentidade(empresa?: string | null, cnpj?: string | null): string[] {
  const keys: string[] = [];
  const digits = normalizeCnpj(cnpj);
  if (digits.length >= 8) keys.push(`cnpj:${digits}`);
  const nome = normalizeNome(empresa);
  if (nome) keys.push(`nome:${nome}`);
  return keys;
}

export function listarNaoContatar(): BloqueioContato[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey()) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is BloqueioContato =>
        !!e && typeof e === "object" && typeof (e as BloqueioContato).key === "string",
    );
  } catch {
    return [];
  }
}

function salvar(lista: BloqueioContato[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(lista));
    window.dispatchEvent(new Event("bhm:nao-contatar-updated"));
  } catch {
    /* quota */
  }
}

/** True se a empresa está na lista de não contatar. */
export function isNaoContatar(empresa?: string | null, cnpj?: string | null): boolean {
  const alvo = new Set(chavesIdentidade(empresa, cnpj));
  if (alvo.size === 0) return false;
  return listarNaoContatar().some((e) => alvo.has(e.key));
}

/** Motivo do bloqueio, se houver. */
export function motivoNaoContatar(empresa?: string | null, cnpj?: string | null): string | null {
  const alvo = new Set(chavesIdentidade(empresa, cnpj));
  const achado = listarNaoContatar().find((e) => alvo.has(e.key));
  return achado ? achado.motivo : null;
}

/** Marca a empresa como "não contatar" (todas as identidades conhecidas). */
export function marcarNaoContatar(
  empresa: string,
  cnpj?: string | null,
  motivo = "",
): BloqueioContato[] {
  const keys = chavesIdentidade(empresa, cnpj);
  if (keys.length === 0) return listarNaoContatar();
  const atual = listarNaoContatar().filter((e) => !keys.includes(e.key));
  const at = new Date().toISOString();
  const novos = keys.map<BloqueioContato>((key) => ({
    key,
    empresa,
    cnpj: cnpj ?? null,
    motivo: motivo.trim(),
    at,
  }));
  const proximo = [...atual, ...novos];
  salvar(proximo);
  return proximo;
}

/** Libera a empresa — volta a aparecer nas listas. */
export function liberarNaoContatar(empresa?: string | null, cnpj?: string | null): BloqueioContato[] {
  const keys = new Set(chavesIdentidade(empresa, cnpj));
  const proximo = listarNaoContatar().filter((e) => !keys.has(e.key));
  salvar(proximo);
  return proximo;
}

/** Lista sem duplicar a mesma empresa (cnpj + nome geram 2 entradas). */
export function listarNaoContatarUnicos(): BloqueioContato[] {
  const vistos = new Set<string>();
  const out: BloqueioContato[] = [];
  for (const e of listarNaoContatar()) {
    const id = `${normalizeCnpj(e.cnpj)}|${normalizeNome(e.empresa)}`;
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push(e);
  }
  return out;
}
