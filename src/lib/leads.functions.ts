import { createServerFn } from "@tanstack/react-start";
import { requireBhmGate } from "@/lib/bhm-gate";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type LeadRowDb = Database["public"]["Tables"]["leads"]["Row"];

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const upsertLeads = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        consultor: z.string().trim().min(1).max(120),
        rows: z.array(z.record(z.string(), z.unknown())).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    if (!data.rows.length) return { ok: true as const };
    const admin = await getAdmin();
    const rows = data.rows.map((r) => ({ ...r, consultor: data.consultor }));
    const { error } = await admin.from("leads").upsert(rows as never, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteLeads = createServerFn({ method: "POST" })
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
      .from("leads")
      .delete()
      .eq("consultor", data.consultor)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listarLeads = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z.object({ consultor: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("leads")
      .select("*")
      .eq("consultor", data.consultor)
      .limit(2000);
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeadRowDb[];
  });

export const mesclarLeadsDuplicados = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z.object({ consultor: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const norm = (v: string) =>
      (v ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[.,\-/]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("leads")
      .select("*")
      .eq("consultor", data.consultor)
      .limit(2000);
    if (error) throw new Error(error.message);

    const leads = (rows ?? []) as LeadRowDb[];
    const grupos = new Map<string, LeadRowDb[]>();
    for (const l of leads) {
      const k = norm(l.empresa ?? "");
      if (!k) continue;
      const arr = grupos.get(k);
      if (arr) arr.push(l);
      else grupos.set(k, [l]);
    }

    let mesclados = 0;
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      const ativos = grupo.filter((l) => l.status !== "perdido");
      if (ativos.length < 2) continue;

      const ts = (l: LeadRowDb) => new Date(l.updated_at ?? l.created_at ?? 0).getTime();
      const ordenados = [...ativos].sort((a, b) => ts(b) - ts(a));
      const principal = ordenados[0]!;
      const outros = ordenados.slice(1);

      const seen = new Set<string>();
      const timeline = grupo
        .flatMap((l) => ((l.timeline as unknown as Array<Record<string, unknown>>) ?? []))
        .filter((ev) => {
          const k = `${String(ev?.["at"] ?? "")}|${String(ev?.["titulo"] ?? "")}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort(
          (a, b) =>
            new Date(String(a?.["at"] ?? 0)).getTime() - new Date(String(b?.["at"] ?? 0)).getTime(),
        );

      const up1 = await admin
        .from("leads")
        .update({ timeline: timeline as never })
        .eq("id", principal.id);
      if (up1.error) throw new Error(up1.error.message);

      const up2 = await admin
        .from("leads")
        .update({
          status: "perdido",
          motivo_perda: "Duplicata mesclada automaticamente",
          em_followup_frio: false,
        })
        .in("id", outros.map((l) => l.id));
      if (up2.error) throw new Error(up2.error.message);

      mesclados += 1;
    }

    return { ok: true as const, grupos: mesclados };
  });
