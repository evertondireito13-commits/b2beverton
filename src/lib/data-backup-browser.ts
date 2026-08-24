import {
  isPastasListKey,
  loadDeletedPastaIds,
  pastaIdFromBucketKey,
} from "@/lib/pastas-tombstones";

export const BACKUP_RESTORED_EVENT = "bhm:data-backup-restored";

const DURABLE_PREFIXES = [
  "bhm_historico_empresas",
  "bhm-preparacao::",
  "bhm-leads-central",
  "bhm-daily-activities",
  "bhm-call-sessions",
  "bhm-notificacoes",
  "bhm.reunioes.outcomes",
  "bhm.obstaculo",
  "bhm.proximoPasso",
] as const;

function consultantAliases(consultor: string): string[] {
  if (consultor === "Everton Pereira") return ["Everton Pereira", "Everton", "everton"];
  return ["Eloane Manfroni", "Heluane Manfroni", "Eluane Manfroni", "Eloane", "Heluane", "Eluane"];
}

function isDurableKey(key: string): boolean {
  return DURABLE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function belongsToConsultant(key: string, consultor: string): boolean {
  const knownNames = [
    "Everton Pereira", "Everton", "everton", "Eloane Manfroni",
    "Heluane Manfroni", "Eluane Manfroni", "Eloane", "Heluane", "Eluane",
  ];
  const explicitOwner = knownNames.find((name) => key.endsWith(`::${name}`) || key.endsWith(`.${name}`));
  return !explicitOwner || consultantAliases(consultor).includes(explicitOwner);
}

export function collectDurableAppData(consultor: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const payload: Record<string, unknown> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !isDurableKey(key) || !belongsToConsultant(key, consultor)) continue;
    const raw = window.localStorage.getItem(key);
    if (raw == null) continue;
    try {
      payload[key] = JSON.parse(raw) as unknown;
    } catch {
      payload[key] = raw;
    }
  }
  return payload;
}

export function countBackupItems(payload: Record<string, unknown>): number {
  return Object.values(payload).reduce<number>((total, value) => {
    if (Array.isArray(value)) return total + value.length;
    if (value && typeof value === "object") return total + Object.keys(value).length;
    return total + 1;
  }, 0);
}

function mergeArray(current: unknown[], backup: unknown[]): unknown[] {
  const combined = [...current];
  const signatures = new Set(current.map((item) => JSON.stringify(item)));
  const ids = new Set(
    current.flatMap((item) =>
      item && typeof item === "object" && "id" in item ? [String((item as { id: unknown }).id)] : [],
    ),
  );
  for (const item of backup) {
    const id = item && typeof item === "object" && "id" in item ? String((item as { id: unknown }).id) : "";
    const signature = JSON.stringify(item);
    if ((id && ids.has(id)) || signatures.has(signature)) continue;
    combined.push(item);
    if (id) ids.add(id);
    signatures.add(signature);
  }
  return combined;
}

export function restoreMissingAppData(payload: Record<string, unknown>, consultor: string): number {
  if (typeof window === "undefined") return 0;
  let recovered = 0;
  const deletedPastas = loadDeletedPastaIds();
  for (const [key, rawBackupValue] of Object.entries(payload)) {
    if (!isDurableKey(key) || !belongsToConsultant(key, consultor)) continue;
    // Pastas excluídas pelo usuário nunca voltam pelo backup.
    const bucketPastaId = pastaIdFromBucketKey(key);
    if (bucketPastaId && deletedPastas.has(bucketPastaId)) continue;
    let backupValue = rawBackupValue;
    if (isPastasListKey(key) && Array.isArray(backupValue)) {
      backupValue = backupValue.filter(
        (p) => !(p && typeof p === "object" && deletedPastas.has(String((p as { id?: unknown }).id))),
      );
    }
    const raw = window.localStorage.getItem(key);
    let nextValue = backupValue;
    if (raw != null) {
      try {
        const currentValue = JSON.parse(raw) as unknown;
        if (Array.isArray(currentValue) && Array.isArray(backupValue)) {
          const merged = mergeArray(currentValue, backupValue);
          nextValue = merged;
          recovered += Math.max(0, merged.length - currentValue.length);
        } else if (
          currentValue && backupValue &&
          typeof currentValue === "object" && typeof backupValue === "object" &&
          !Array.isArray(currentValue) && !Array.isArray(backupValue)
        ) {
          nextValue = { ...backupValue, ...currentValue };
          recovered += Math.max(0, Object.keys(backupValue).length - Object.keys(currentValue).length);
        } else {
          continue;
        }
      } catch {
        continue;
      }
    } else {
      recovered += Array.isArray(backupValue) ? backupValue.length : 1;
    }
    window.localStorage.setItem(key, JSON.stringify(nextValue));
  }
  if (recovered > 0) {
    window.dispatchEvent(new CustomEvent(BACKUP_RESTORED_EVENT, { detail: { recovered } }));
    window.dispatchEvent(new Event("bhm:historico-updated"));
    window.dispatchEvent(new CustomEvent("bhm:activities-updated"));
    window.dispatchEvent(new CustomEvent("bhm:leads-updated"));
  }
  return recovered;
}