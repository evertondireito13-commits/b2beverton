import { createServerFn } from "@tanstack/react-start";
import { requireBhmGate } from "@/lib/bhm-gate";
import { z } from "zod";

export type CallLog = {
  id: string;
  company_name: string;
  cnpj: string | null;
  called_at: string;
  meeting_scheduled: boolean;
  meeting_at: string | null;
  meeting_email: string | null;
  notes: string | null;
  created_at: string;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const logCall = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        companyName: z.string().trim().min(1, "Informe a empresa").max(300),
        cnpj: z.string().trim().max(20).optional().nullable(),
        meetingScheduled: z.boolean().default(false),
        meetingAt: z.string().datetime().optional().nullable(),
        meetingEmail: z.string().trim().max(200).optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
        calledAt: z.string().datetime().optional(),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("call_logs")
      .insert({
        company_name: data.companyName,
        cnpj: data.cnpj || null,
        meeting_scheduled: data.meetingScheduled,
        meeting_at: data.meetingAt || null,
        meeting_email: data.meetingEmail || null,
        notes: data.notes || null,
        consultor: data.consultor,
        ...(data.calledAt ? { called_at: data.calledAt } : {}),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as CallLog;
  });

export const listCalls = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(500).default(200),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    let q = admin
      .from("call_logs")
      .select("*")
      .eq("consultor", data.consultor)
      .order("called_at", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("called_at", data.from);
    if (data.to) q = q.lte("called_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as CallLog[];
  });

export const updateCall = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        companyName: z.string().trim().min(1).max(300).optional(),
        cnpj: z.string().trim().max(20).nullable().optional(),
        meetingScheduled: z.boolean().optional(),
        meetingAt: z.string().datetime().nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional(),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const patch: {
      company_name?: string;
      cnpj?: string | null;
      meeting_scheduled?: boolean;
      meeting_at?: string | null;
      notes?: string | null;
    } = {};
    if (data.companyName !== undefined) patch.company_name = data.companyName;
    if (data.cnpj !== undefined) patch.cnpj = data.cnpj;
    if (data.meetingScheduled !== undefined) patch.meeting_scheduled = data.meetingScheduled;
    if (data.meetingAt !== undefined) patch.meeting_at = data.meetingAt;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await admin
      .from("call_logs")
      .update(patch)
      .eq("id", data.id)
      .eq("consultor", data.consultor)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as CallLog;
  });

export const deleteCall = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid(), consultor: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("call_logs")
      .delete()
      .eq("id", data.id)
      .eq("consultor", data.consultor);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
