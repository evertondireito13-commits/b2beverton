import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBhmGate } from "@/lib/bhm-gate";

export type UserPromptRow = {
  id: string;
  consultor: string;
  nome: string;
  conteudo: string;
  tipo: "abordagem" | "historico";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const tipoEnum = z.enum(["abordagem", "historico"]);

/** Lista todos os prompts do consultor (isolamento por operador). */
export const listUserPrompts = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z.object({ consultor: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("user_prompts")
      .select("*")
      .eq("consultor", data.consultor)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as UserPromptRow[];
  });

/** Cria ou atualiza um prompt (id gerado no cliente para casar com o cache local). */
export const upsertUserPrompt = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        consultor: z.string().trim().min(1).max(120),
        nome: z.string().trim().min(1).max(200),
        conteudo: z.string().max(200000),
        tipo: tipoEnum,
        isActive: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin.from("user_prompts").upsert(
      {
        id: data.id,
        consultor: data.consultor,
        nome: data.nome,
        conteudo: data.conteudo,
        tipo: data.tipo,
        is_active: data.isActive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    if (data.isActive) {
      await admin
        .from("user_prompts")
        .update({ is_active: false })
        .eq("consultor", data.consultor)
        .eq("tipo", data.tipo)
        .neq("id", data.id);
    }
    return { ok: true };
  });

/** Marca um prompt como ativo (único por tipo/consultor). */
export const setActiveUserPrompt = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        consultor: z.string().trim().min(1).max(120),
        tipo: tipoEnum,
        id: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    await admin
      .from("user_prompts")
      .update({ is_active: false })
      .eq("consultor", data.consultor)
      .eq("tipo", data.tipo);
    if (data.id) {
      const { error } = await admin
        .from("user_prompts")
        .update({ is_active: true })
        .eq("id", data.id)
        .eq("consultor", data.consultor);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Remove um prompt do consultor. */
export const deleteUserPrompt = createServerFn({ method: "POST" })
  .middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        consultor: z.string().trim().min(1).max(120),
        id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("user_prompts")
      .delete()
      .eq("id", data.id)
      .eq("consultor", data.consultor);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
