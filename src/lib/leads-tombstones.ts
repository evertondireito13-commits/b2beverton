// Registro permanente de empresas excluídas da Central de Reuniões.
//
// SEM ISSO, a empresa "ressuscita" sozinha: a Central sincroniza
// automaticamente com as reuniões sincronizadas toda vez que a tela abre
// (hydrateFromMeetings). Se a reunião antiga ainda existe lá — e ela quase
// sempre existe, foi assim que a empresa entrou aqui — o app acha que é uma
// empresa "nova" e recria o lead, mesmo depois de excluído.
//
// A solução é a mesma já usada para pastas na Preparação Noturna: guardar
// a IDENTIDADE da empresa (CNPJ e/ou nome normalizados) — nunca o id do
// lead, porque um lead recriado ganha um id novo.

import { getConsultor, getSessionConsultor } from "@/lib/historico-store";

const TOMBSTONE_KEY_PREFIX = "bhm-leads::deleted";

function normalizeCnpjLocal(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

function normalizeNomeLocal(v?: string | null): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,\-/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function key(): string {
  const c = (getSessionConsultor() ?? getConsultor()) || "shared";
  return `${TOMBSTONE_KEY_PREFIX}::${c}`;
}

function loadSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key()) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSet(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(), JSON.stringify(Array.from(set)));
  } catch {
    /* quota */
  }
}

/** Chaves de identidade (cnpj normalizado e/ou nome normalizado) de uma empresa. */
function identityKeys(empresa?: string | null, cnpj?: string | null): string[] {
  const keys: string[] = [];
  const digits = normalizeCnpjLocal(cnpj);
  if (digits.length >= 8) keys.push(`cnpj:${digits}`);
  const nome = normalizeNomeLocal(empresa);
  if (nome) keys.push(`nome:${nome}`);
  return keys;
}

/** Marca a empresa como excluída definitivamente — ninguém mais a recria sozinho. */
export function markLeadDeleted(empresa?: string | null, cnpj?: string | null): void {
  const set = loadSet();
  for (const k of identityKeys(empresa, cnpj)) set.add(k);
  saveSet(set);
}

/** Libera a empresa — usado quando o usuário decide incluí-la de novo manualmente. */
export function unmarkLeadDeleted(empresa?: string | null, cnpj?: string | null): void {
  const set = loadSet();
  for (const k of identityKeys(empresa, cnpj)) set.delete(k);
  saveSet(set);
}

/** True se a empresa foi excluída definitivamente pelo usuário. */
export function isLeadDeleted(empresa?: string | null, cnpj?: string | null): boolean {
  const set = loadSet();
  return identityKeys(empresa, cnpj).some((k) => set.has(k));
}
