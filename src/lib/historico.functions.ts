import { createServerFn } from "@tanstack/react-start";
import { requireBhmGate } from "@/lib/bhm-gate";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type HistoricoRowDb = Database["public"]["Tables"]["historico_empresas"]["Row"];

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const RowsSchema = z.object({
  consultor: z.string().trim().min(1).max(120),
  rows: z.array(z.record(z.string(), z.unknown())).max(500),
});

export const upsertHistoricos = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) => RowsSchema.parse(data))
  .handler(async ({ data }) => {
    if (!data.rows.length) return { ok: true as const };
    const admin = await getAdmin();
    const rows = data.rows.map((r) => ({ ...r, consultor: data.consultor }));
    const { error } = await admin
      .from("historico_empresas")
      .upsert(rows as never, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteHistoricos = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        consultor: z.string().trim().min(1).max(120),
        ids: z.array(z.string().uuid()).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if (!data.ids.length) return { ok: true as const };
    const admin = await getAdmin();
    const { error } = await admin
      .from("historico_empresas")
      .delete()
      .eq("consultor", data.consultor)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listarHistoricos = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z.object({ consultor: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("historico_empresas")
      .select("*")
      .eq("consultor", data.consultor)
      .order("data_iso", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (rows ?? []) as HistoricoRowDb[];
  });
