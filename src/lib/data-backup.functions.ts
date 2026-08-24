import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBhmGate } from "@/lib/bhm-gate";
import type { Json } from "@/integrations/supabase/types";

export type AppDataBackup = {
  id: string;
  consultor: string;
  reason: string;
  schema_version: number;
  payload: Json;
  item_count: number;
  content_hash: string;
  created_at: string;
};

export const saveAppDataBackup = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((input: unknown) =>
    z.object({
      consultor: z.string().trim().min(1).max(120),
      reason: z.enum(["automatic", "startup", "daily", "manual"]).default("automatic"),
      payload: z.record(z.any()),
      itemCount: z.number().int().min(0).max(100000),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const canonical = JSON.stringify(
      Object.fromEntries(Object.entries(data.payload).sort(([a], [b]) => a.localeCompare(b))),
    );
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    const contentHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("app_data_backups")
      .select("id, created_at")
      .eq("consultor", data.consultor)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return { saved: false as const, id: existing.id, createdAt: existing.created_at };

    const { data: row, error } = await supabaseAdmin
      .from("app_data_backups")
      .insert({
        consultor: data.consultor,
        reason: data.reason,
        schema_version: 1,
        payload: data.payload as Json,
        item_count: data.itemCount,
        content_hash: contentHash,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { saved: true as const, id: row.id, createdAt: row.created_at };
  });

export const getLatestAppDataBackup = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((input: unknown) =>
    z.object({ consultor: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("app_data_backups")
      .select("id, consultor, reason, schema_version, payload, item_count, content_hash, created_at")
      .eq("consultor", data.consultor)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as AppDataBackup | null;
  });

export const getBestAppDataBackup = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((input: unknown) =>
    z.object({ consultor: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ao contrário do "mais recente", este pega o backup com MAIS itens salvos.
    // Isso evita restaurar um backup vazio que tenha sido salvo por engano
    // depois de uma perda de dados no navegador.
    const { data: row, error } = await supabaseAdmin
      .from("app_data_backups")
      .select("id, consultor, reason, schema_version, payload, item_count, content_hash, created_at")
      .eq("consultor", data.consultor)
      .order("item_count", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as AppDataBackup | null;
  });

export const listAppDataBackups = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((input: unknown) =>
    z.object({
      consultor: z.string().trim().min(1).max(120),
      limit: z.number().int().min(1).max(50).default(15),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("app_data_backups")
      .select("id, consultor, reason, schema_version, item_count, content_hash, created_at")
      .eq("consultor", data.consultor)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
