import { createServerFn } from "@tanstack/react-start";
import { requireBhmGate } from "@/lib/bhm-gate";
import { z } from "zod";

export type DailyReport = {
  id: string;
  partner_name: string;
  report_date: string; // YYYY-MM-DD
  contacts_made: number;
  decision_maker_calls: number;
  meetings_held: number;
  documents_received: number;
  had_closing: boolean;
  closing_details: string | null;
  companies_approached: string;
  biggest_obstacle: string;
  next_step: string;
  created_at: string;
  updated_at: string;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const baseSchema = z.object({
  partnerName: z.string().trim().min(1, "Informe o nome do parceiro").max(200),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  contactsMade: z.number().int().min(0).max(10000),
  decisionMakerCalls: z.number().int().min(0).max(10000),
  meetingsHeld: z.number().int().min(0).max(10000),
  documentsReceived: z.number().int().min(0).max(10000),
  hadClosing: z.boolean(),
  closingDetails: z.string().trim().max(2000).optional().nullable(),
  companiesApproached: z.string().trim().min(1, "Informe as empresas abordadas").max(5000),
  biggestObstacle: z.string().trim().min(1, "Informe o maior obstáculo").max(2000),
  nextStep: z.string().trim().min(1, "Informe o próximo passo").max(2000),
});

export const upsertDailyReport = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) => baseSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const payload = {
      partner_name: data.partnerName,
      report_date: data.reportDate,
      contacts_made: data.contactsMade,
      decision_maker_calls: data.decisionMakerCalls,
      meetings_held: data.meetingsHeld,
      documents_received: data.documentsReceived,
      had_closing: data.hadClosing,
      closing_details: data.closingDetails || null,
      companies_approached: data.companiesApproached,
      biggest_obstacle: data.biggestObstacle,
      next_step: data.nextStep,
    };
    const { data: row, error } = await admin
      .from("daily_reports")
      .upsert(payload, { onConflict: "partner_name,report_date" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as DailyReport;
  });

export const getDailyReport = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        partnerName: z.string().trim().min(1).max(200),
        reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("daily_reports")
      .select("*")
      .eq("partner_name", data.partnerName)
      .eq("report_date", data.reportDate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as DailyReport | null) ?? null;
  });

export const listDailyReports = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("daily_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as DailyReport[];
  });

// Sugere valores automáticos a partir de call_logs e follow_ups do dia,
// para pré-preencher os campos numéricos do formulário.
export const suggestDailyMetrics = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const start = `${data.reportDate}T00:00:00-03:00`;
    const end = `${data.reportDate}T23:59:59-03:00`;

    const [callsRes, meetingsCallsRes, meetingsFupsRes, followUpsRes] = await Promise.all([
      admin
        .from("call_logs")
        .select("id, meeting_scheduled", { count: "exact" })
        .eq("consultor", data.consultor)
        .gte("called_at", start)
        .lte("called_at", end),
      admin
        .from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("consultor", data.consultor)
        .eq("meeting_held", true)
        .gte("meeting_at", start)
        .lte("meeting_at", end),
      admin
        .from("follow_ups")
        .select("id", { count: "exact", head: true })
        .eq("consultor", data.consultor)
        .eq("action_type", "meeting")
        .eq("meeting_held", true)
        .gte("scheduled_at", start)
        .lte("scheduled_at", end),
      admin
        .from("follow_ups")
        .select("id, status", { count: "exact" })
        .eq("consultor", data.consultor)
        .gte("scheduled_at", start)
        .lte("scheduled_at", end),
    ]);

    const contactsMade = callsRes.count ?? (callsRes.data?.length ?? 0);
    const meetingsHeld = (meetingsCallsRes.count ?? 0) + (meetingsFupsRes.count ?? 0);
    const followupsPending = (followUpsRes.data ?? []).filter((f) => f.status === "pending").length;
    const followupsDone = (followUpsRes.data ?? []).filter((f) => f.status === "done").length;

    return {
      contactsMade,
      meetingsHeld,
      followupsPending,
      followupsDone,
    };
  });
