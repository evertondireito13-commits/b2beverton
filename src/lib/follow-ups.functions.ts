import { createServerFn } from "@tanstack/react-start";
import { requireBhmGate } from "@/lib/bhm-gate";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export type FollowUp = {
  id: string;
  company_name: string;
  cnpj: string | null;
  contact_person: string | null;
  action_type: "call" | "email" | "meeting" | "whatsapp" | "negociacao" | "other";
  scheduled_at: string;
  notes: string | null;
  status: "pending" | "done" | "cancelled";
  meeting_held: boolean;
  meeting_outcome: string | null;
  email_sent: boolean;
  email_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const actionEnum = z.enum(["call", "email", "meeting", "whatsapp", "negociacao", "other"]);
const statusEnum = z.enum(["pending", "done", "cancelled"]);

export const createFollowUp = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        companyName: z.string().trim().min(1, "Informe a empresa").max(300),
        cnpj: z.string().trim().max(20).optional().nullable(),
        contactPerson: z.string().trim().max(200).optional().nullable(),
        actionType: actionEnum.default("call"),
        scheduledAt: z.string().datetime(),
        notes: z.string().trim().max(2000).optional().nullable(),
        consultor: z.string().trim().min(1).max(120),
        /** Follow-up de origem (card clicado no Follow-up). Sempre recebe baixa. */
        originFollowUpId: z.string().uuid().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();

    // Dedupe: apenas 1 follow-up PENDENTE por empresa. Casamos por CNPJ
    // (>=8 dígitos), nome compactado ou token significativo. O primeiro
    // casamento vira o card atualizado; TODOS os outros recebem baixa
    // (status "done") para não sobrarem cards antigos em "Atrasados".
    const cnpjDigits = (data.cnpj ?? "").replace(/\D/g, "");
    const targetName = compactCompanyName(data.companyName);
    const targetTokens = companyTokens(data.companyName);

    const { data: candidatos } = await admin
      .from("follow_ups")
      .select("id, company_name, cnpj")
      .eq("consultor", data.consultor)
      .eq("status", "pending")
      .limit(300);

    const matches = (candidatos ?? []).filter((row) => {
      if (data.originFollowUpId && row.id === data.originFollowUpId) return true;
      const rowCnpj = (row.cnpj ?? "").replace(/\D/g, "");
      if (cnpjDigits.length >= 8 && rowCnpj.length >= 8) {
        if (rowCnpj === cnpjDigits) return true;
      }
      const rowName = compactCompanyName(row.company_name ?? "");
      if (targetName.length >= 4 && rowName.length >= 4) {
        if (rowName === targetName || rowName.includes(targetName) || targetName.includes(rowName)) return true;
      }
      const rowTokens = companyTokens(row.company_name ?? "");
      if (targetTokens.length && rowTokens.length) {
        if (targetTokens.some((t) => rowTokens.includes(t))) return true;
      }
      return false;
    });

    // Preferimos atualizar o follow-up de origem, se informado.
    const primary =
      matches.find((row) => row.id === data.originFollowUpId) ?? matches[0] ?? null;

    if (primary) {
      const { data: updated, error: updErr } = await admin
        .from("follow_ups")
        .update({
          company_name: data.companyName,
          cnpj: data.cnpj || null,
          contact_person: data.contactPerson || null,
          action_type: data.actionType,
          scheduled_at: data.scheduledAt,
          notes: data.notes || null,
          status: "pending",
          email_sent: false,
          email_sent_at: null,
        })
        .eq("id", primary.id)
        .eq("consultor", data.consultor)
        .select()
        .single();
      if (updErr) throw new Error(updErr.message);

      const stale = matches.map((m) => m.id).filter((id) => id !== primary.id);
      if (stale.length) {
        await admin
          .from("follow_ups")
          .update({ status: "done" })
          .in("id", stale)
          .eq("consultor", data.consultor);
      }
      return updated as FollowUp;
    }

    const { data: row, error } = await admin
      .from("follow_ups")
      .insert({
        company_name: data.companyName,
        cnpj: data.cnpj || null,
        contact_person: data.contactPerson || null,
        action_type: data.actionType,
        scheduled_at: data.scheduledAt,
        notes: data.notes || null,
        consultor: data.consultor,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as FollowUp;
  });


export const listFollowUps = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        status: statusEnum.optional(),
        limit: z.number().int().min(1).max(500).default(300),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    let q = admin
      .from("follow_ups")
      .select("*")
      .eq("consultor", data.consultor)
      .order("scheduled_at", { ascending: true })
      .limit(data.limit);
    if (data.from) q = q.gte("scheduled_at", data.from);
    if (data.to) q = q.lte("scheduled_at", data.to);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as FollowUp[];
  });

export const updateFollowUp = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: statusEnum.optional(),
        scheduledAt: z.string().datetime().optional(),
        notes: z.string().trim().max(2000).optional().nullable(),
        actionType: actionEnum.optional(),
        contactPerson: z.string().trim().max(200).optional().nullable(),
        companyName: z.string().trim().min(1).max(300).optional(),
        cnpj: z.string().trim().max(20).optional().nullable(),
        emailSent: z.boolean().optional(),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const patch: {
      status?: FollowUp["status"];
      scheduled_at?: string;
      notes?: string | null;
      action_type?: FollowUp["action_type"];
      contact_person?: string | null;
      company_name?: string;
      cnpj?: string | null;
      email_sent?: boolean;
      email_sent_at?: string | null;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.scheduledAt !== undefined) patch.scheduled_at = data.scheduledAt;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.actionType !== undefined) patch.action_type = data.actionType;
    if (data.contactPerson !== undefined) patch.contact_person = data.contactPerson;
    if (data.companyName !== undefined) patch.company_name = data.companyName;
    if (data.cnpj !== undefined) patch.cnpj = data.cnpj;
    if (data.emailSent !== undefined) {
      patch.email_sent = data.emailSent;
      patch.email_sent_at = data.emailSent ? new Date().toISOString() : null;
    }
    const { data: row, error } = await admin
      .from("follow_ups")
      .update(patch)
      .eq("id", data.id)
      .eq("consultor", data.consultor)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as FollowUp;
  });

export const deleteFollowUp = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid(), consultor: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { error } = await admin
      .from("follow_ups")
      .delete()
      .eq("id", data.id)
      .eq("consultor", data.consultor);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactCompanyName(value: string): string {
  return normalizeMatchText(value).replace(/[^a-z0-9]/g, "");
}

function companyTokens(value: string): string[] {
  const ignored = new Set([
    "industria",
    "industrias",
    "comercio",
    "comercial",
    "servicos",
    "servico",
    "ltda",
    "eireli",
    "brasil",
  ]);
  return normalizeMatchText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !ignored.has(token));
}

export const cancelPendingFollowUpsForCompany = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        companyName: z.string().trim().max(300).optional().nullable(),
        cnpj: z.string().trim().max(20).optional().nullable(),
        contactPerson: z.string().trim().max(200).optional().nullable(),
        reason: z.string().trim().max(500).optional().nullable(),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const companyName = data.companyName?.trim() ?? "";
    const cnpj = data.cnpj?.replace(/\D/g, "") ?? "";
    const contact = compactCompanyName(data.contactPerson ?? "");
    if (!companyName && cnpj.length < 8 && contact.length < 5) return { cancelled: 0 };

    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("follow_ups")
      .select("id, company_name, cnpj, contact_person, notes")
      .eq("status", "pending")
      .eq("consultor", data.consultor)
      .limit(500);
    if (error) throw new Error(error.message);

    const targetName = compactCompanyName(companyName);
    const targetTokens = companyTokens(companyName);
    const ids = (rows ?? [])
      .filter((row) => {
        const rowCnpj = (row.cnpj ?? "").replace(/\D/g, "");
        if (cnpj.length >= 8 && rowCnpj && rowCnpj === cnpj) return true;

        const rowName = compactCompanyName(row.company_name ?? "");
        if (targetName.length >= 5 && rowName.length >= 5) {
          if (rowName === targetName || rowName.includes(targetName) || targetName.includes(rowName)) return true;
        }

        const rowBlob = normalizeMatchText([row.company_name, row.contact_person, row.notes].filter(Boolean).join(" "));
        if (targetTokens.length > 0 && targetTokens.some((token) => rowBlob.includes(token))) return true;

        const rowContact = compactCompanyName(row.contact_person ?? "");
        return contact.length >= 5 && rowContact.length >= 5 && rowContact === contact;
      })
      .map((row) => row.id as string);

    if (ids.length === 0) return { cancelled: 0 };

    const reason = data.reason || "Cancelado automaticamente: histórico pós-ligação registrou negativa/sem interesse.";
    const { error: updateError } = await admin
      .from("follow_ups")
      .update({ status: "cancelled", notes: reason })
      .in("id", ids)
      .eq("consultor", data.consultor);
    if (updateError) throw new Error(updateError.message);
    return { cancelled: ids.length };
  });

// -----------------------------------------------------------------------------
// Reuniões (união de call_logs com meeting_at + follow_ups com action_type=meeting)
// -----------------------------------------------------------------------------

export type MeetingItem = {
  id: string;
  source: "call" | "follow_up";
  source_id: string;
  company_name: string;
  cnpj: string | null;
  contact_person: string | null;
  meeting_at: string; // ISO
  meeting_email: string | null;
  notes: string | null;
  status: "pending" | "done" | "cancelled" | null; // só follow_up tem status
  meeting_held: boolean;
  meeting_outcome: string | null;
};

export const listMeetings = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<MeetingItem[]> => {
    const admin = await getAdmin();
    const [callsRes, fupsRes] = await Promise.all([
      admin
        .from("call_logs")
        .select("id, company_name, cnpj, meeting_at, meeting_email, notes, meeting_held, meeting_outcome")
        .eq("meeting_scheduled", true)
        .eq("consultor", data.consultor)
        .not("meeting_at", "is", null)
        .gte("meeting_at", data.from)
        .lte("meeting_at", data.to)
        .order("meeting_at", { ascending: true }),
      admin
        .from("follow_ups")
        .select("id, company_name, cnpj, contact_person, scheduled_at, notes, status, meeting_held, meeting_outcome")
        .eq("action_type", "meeting")
        .eq("consultor", data.consultor)
        .gte("scheduled_at", data.from)
        .lte("scheduled_at", data.to)
        .order("scheduled_at", { ascending: true }),
    ]);
    if (callsRes.error) throw new Error(callsRes.error.message);
    if (fupsRes.error) throw new Error(fupsRes.error.message);

    const fromCalls: MeetingItem[] = (callsRes.data ?? []).map((c) => ({
      id: `call:${c.id}`,
      source: "call",
      source_id: c.id,
      company_name: c.company_name,
      cnpj: c.cnpj,
      contact_person: null,
      meeting_at: c.meeting_at as string,
      meeting_email: c.meeting_email,
      notes: c.notes,
      status: null,
      meeting_held: c.meeting_held ?? false,
      meeting_outcome: c.meeting_outcome ?? null,
    }));
    const fromFups: MeetingItem[] = (fupsRes.data ?? []).map((f) => ({
      id: `fup:${f.id}`,
      source: "follow_up",
      source_id: f.id,
      company_name: f.company_name,
      cnpj: f.cnpj,
      contact_person: f.contact_person,
      meeting_at: f.scheduled_at,
      meeting_email: null,
      notes: f.notes,
      status: f.status as MeetingItem["status"],
      meeting_held: f.meeting_held ?? false,
      meeting_outcome: f.meeting_outcome ?? null,
    }));

    const seen = new Set<string>();
    const merged: MeetingItem[] = [];
    for (const m of [...fromCalls, ...fromFups]) {
      const key = `${m.company_name.trim().toLowerCase()}|${new Date(m.meeting_at).getTime()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
    }
    merged.sort((a, b) => new Date(a.meeting_at).getTime() - new Date(b.meeting_at).getTime());
    return merged;
  });

export const markMeetingHeld = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        source: z.enum(["call", "follow_up"]),
        id: z.string().uuid(),
        held: z.boolean(),
        outcome: z.string().trim().max(2000).optional().nullable(),
        consultor: z.string().trim().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    if (data.source === "call") {
      const { error } = await admin
        .from("call_logs")
        .update({
          meeting_held: data.held,
          meeting_outcome: data.outcome ?? null,
        })
        .eq("id", data.id)
        .eq("consultor", data.consultor);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from("follow_ups")
        .update({
          meeting_held: data.held,
          meeting_outcome: data.outcome ?? null,
          status: data.held ? "done" : "pending",
        })
        .eq("id", data.id)
        .eq("consultor", data.consultor);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });




// -----------------------------------------------------------------------------
// AI extraction: analisa histórico/transcrição da ligação e devolve
// os campos do follow-up já preenchidos (empresa, CNPJ, contato, ação,
// data/hora, observações). Se não houver retorno a agendar, hasFollowUp=false.
// -----------------------------------------------------------------------------

export type ExtractedFollowUp = {
  hasFollowUp: boolean;
  reason?: string;
  refused?: boolean;
  companyName?: string;
  cnpj?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  actionType?: FollowUp["action_type"];
  scheduledAt?: string; // ISO
  notes?: string | null;
};


export const extractFollowUpFromCall = createServerFn({ method: "POST" }).middleware([requireBhmGate])
  .validator((data: unknown) =>
    z
      .object({
        transcricao: z.string().trim().max(20000).optional().default(""),
        historico: z.string().trim().max(20000).optional().default(""),
        empresaFallback: z.string().trim().max(300).optional().nullable(),
        cnpjFallback: z.string().trim().max(20).optional().nullable(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<ExtractedFollowUp> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");
    if (!data.transcricao && !data.historico) {
      return { hasFollowUp: false, reason: "Sem conteúdo para analisar" };
    }

    const now = new Date();
    const tzNow = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(now);
    // Data ISO (YYYY-MM-DD) de HOJE no fuso de São Paulo — usada para ancorar
    // a IA e evitar confusão de virada de mês (ex: "3 de agosto" quando hoje
    // é 24/07 deve virar 2026-08-03, não 2025-08-03 nem 2026-07-03).
    const spTodayISO = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now); // "2026-07-24"
    const [spYear, spMonth] = spTodayISO.split("-");
    const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    const nomeMesAtual = meses[Number(spMonth) - 1];

    const system = `Você é um assistente de prospecção B2B. Sua tarefa: ler a transcrição/histórico de uma ligação e extrair o próximo follow-up combinado (retornar ligação, enviar e-mail, falar com outra pessoa, agendar reunião etc.).

REGRAS:
- Responda APENAS um objeto JSON válido, sem markdown, sem crase, sem comentários.
- IMPORTANTE — RECUSA/SEM INTERESSE: se o contato deixou claro que NÃO quer seguir, NÃO tem interesse, pediu para NÃO ligar mais, disse que já tem fornecedor/advogado e não quer trocar, ou qualquer outra forma explícita de recusa, responda OBRIGATORIAMENTE: {"hasFollowUp": false, "reason": "Empresa sem interesse — não insistir", "refused": true}. NÃO invente follow-up nesses casos.
- SEM RECUSA EXPLÍCITA = SEMPRE CRIA FOLLOW-UP. Se não houve recusa clara, responda OBRIGATORIAMENTE {"hasFollowUp": true, ...} — mesmo que a ligação tenha sido neutra ou sem compromisso combinado (não atendeu, caixa postal, caiu a ligação, recado com recepcionista, conversa sem definição). Nesses casos use a REGRA PADRÃO de +2 dias úteis (abaixo) e escreva em "notes" o motivo real, ex.: "Não atendeu — novo contato agendado automaticamente", "Recado deixado com a recepcionista, sem retorno definido — novo contato agendado automaticamente".
- Só responda {"hasFollowUp": false} nos casos de recusa explícita descritos acima.
- Se houver, responda: {"hasFollowUp": true, "companyName": "...", "cnpj": "..." | null, "contactPerson": "..." | null, "contactEmail": "..." | null, "actionType": "call" | "email" | "whatsapp" | "meeting" | "other", "scheduledAt": "ISO-8601 com timezone -03:00", "notes": "..."}
- "actionType": use "call" para ligar de volta, "email" para enviar e-mail, "whatsapp" para mandar mensagem, "meeting" para reunião marcada, "other" para o resto.
- "contactEmail": se a pessoa citou um e-mail para receber o convite/envio (ex: "manda pro meu email joao@empresa.com"), coloque-o aqui EM MINÚSCULAS. Se não houver e-mail claro, use null. NUNCA invente e-mail.

⚠️ ATENÇÃO — DATAS E VIRADA DE MÊS (CRÍTICO):
- HOJE é ${spTodayISO} (${nomeMesAtual} de ${spYear}, fuso America/Sao_Paulo).
- SEMPRE devolva "scheduledAt" no formato ISO-8601 com timezone -03:00 (Brasília).
- A data agendada JAMAIS pode ser anterior a HOJE. Se o texto citar um mês/dia que já passou neste ano, entenda que se refere ao PRÓXIMO mês/ano correspondente (o contato está falando do futuro, não do passado).
- Se o contato citou uma data EXPLÍCITA — "dia 3 de agosto", "03/08", "primeira semana de agosto", "amanhã 10h", "sexta 15h", "retorno das férias em 05/08" — respeite-a e converta corretamente considerando o mês atual (${nomeMesAtual}/${spYear}). Exemplos com HOJE=${spTodayISO}: "3 de agosto" → ${spYear}-08-03; "dia 15" (sem mês, e 15 ainda não passou neste mês) → ${spYear}-${spMonth}-15; "dia 15" (sem mês, mas 15 já passou) → mês seguinte, dia 15.
- REGRA PADRÃO (só se o contato NÃO deu data específica): agende para +2 DIAS ÚTEIS a partir de AGORA (${tzNow}), mantendo o MESMO HORÁRIO da ligação atual. Sábado/domingo pulam para segunda. Se disse só "semana que vem" sem dia, use segunda-feira no mesmo horário da ligação.
- "notes": resumo curto (máx 2 frases) em português. Inclua o nome de quem atendeu e a pessoa a procurar (fiscal, decisor). Se o contato citou e-mail para envio, mencione-o como PENDENTE ("e-mail a enviar para X"). Se o retorno é longo (férias, viagem, agenda cheia), mencione o motivo.

🚫 ANTI-INVENÇÃO (CRÍTICO — vale para "notes" e todos os campos):
- Descreva SOMENTE o que está literalmente na transcrição/histórico. NUNCA afirme que algo já foi feito se isso não aparece no texto: proibido escrever "e-mail enviado", "material encaminhado", "proposta enviada", "reunião confirmada" quando o texto só mostra que um e-mail foi INFORMADO/pedido.
- Ação ainda não executada deve aparecer como pendência futura ("enviar e-mail para ...", "retornar ligação para falar com ...").
- Não deduza cargos, intenções, interesse ou combinados que não foram ditos. Na dúvida, omita.
- "BHM Advogados" (ou variações como "BHN") é a NOSSA empresa, do consultor. NUNCA descreva o contato, a Daniele, o decisor ou qualquer pessoa da empresa prospectada como sendo da BHM, nem trate a BHM como cliente/prospect.
- "contactPerson": nome LIMPO da pessoa a procurar/que atendeu, sem parênteses/qualificadores tipo "(deduzido)", "(recepcionista)". Se só a recepcionista atendeu e não disse o nome do decisor, use o nome dela mesmo. Formato "Nome" ou "Nome (Cargo curto)" — sem frases longas.
- "companyName" e "cnpj": se o texto não trouxer, use os fallbacks fornecidos.`;



    const userContent = `AGORA: ${tzNow}
HOJE (ISO, fuso SP): ${spTodayISO}
EMPRESA (fallback, se o texto não citar): ${data.empresaFallback ?? "—"}
CNPJ (fallback, se o texto não citar): ${data.cnpjFallback ?? "—"}

--- HISTÓRICO GERADO ---
${data.historico || "(vazio)"}

--- TRANSCRIÇÃO / DESCRIÇÃO ---
${data.transcricao || "(vazio)"}`;

    const gateway = createLovableAiGatewayProvider(key);
    let raw = "";
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system,
        prompt: userContent,
      });
      raw = text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) throw new Error("Limite de requisições atingido. Tente em alguns segundos.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha na IA: ${msg}`);
    }

    // Extrai o primeiro objeto JSON da resposta, tolerando cercas ```json
    const cleaned = raw.replace(/```json|```/gi, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return { hasFollowUp: false, reason: "IA não retornou JSON" };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return { hasFollowUp: false, reason: "JSON inválido da IA" };
    }

    if (!parsed.hasFollowUp) {
      return {
        hasFollowUp: false,
        refused: Boolean(parsed.refused),
        reason: String(parsed.reason ?? "Sem próxima ação clara"),
      };
    }

    const schema = z.object({
      companyName: z.string().trim().min(1).max(300),
      cnpj: z.union([z.string().trim().max(20), z.null()]).optional(),
      contactPerson: z.union([z.string().trim().max(200), z.null()]).optional(),
      contactEmail: z.union([z.string().trim().max(200), z.null()]).optional(),
      actionType: z.enum(["call", "email", "whatsapp", "meeting", "other"]).default("call"),
      scheduledAt: z.string().min(4),
      notes: z.union([z.string().trim().max(2000), z.null()]).optional(),
    });
    const safe = schema.safeParse({
      companyName: parsed.companyName ?? data.empresaFallback ?? "",
      cnpj: parsed.cnpj ?? data.cnpjFallback ?? null,
      contactPerson: parsed.contactPerson ?? null,
      contactEmail: parsed.contactEmail ?? null,
      actionType: parsed.actionType ?? "call",
      scheduledAt: parsed.scheduledAt ?? "",
      notes: parsed.notes ?? null,
    });
    if (!safe.success) {
      return { hasFollowUp: false, reason: "Campos incompletos" };
    }

    // Normaliza scheduledAt para ISO. Se vier sem timezone, assume -03:00.
    let iso = safe.data.scheduledAt.trim();
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) {
      // "2026-07-06T10:00:00" -> "2026-07-06T10:00:00-03:00"
      iso = iso.replace(/\s+/, "T");
      if (!/T\d/.test(iso)) iso += "T10:00:00";
      iso += "-03:00";
    }
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      return { hasFollowUp: false, reason: "Data inválida" };
    }
    // Safety net contra virada de mês/ano: se a IA devolveu uma data no
    // passado (ex: hoje é 24/07/2026 e ela escreveu "2026-07-03" quando o
    // contato disse "3 de agosto"), roda o mês/ano pra frente até cair no
    // futuro, preservando dia e horário.
    const nowMs = Date.now();
    if (d.getTime() < nowMs) {
      const guard = new Date(d);
      let hops = 0;
      while (guard.getTime() < nowMs && hops < 24) {
        guard.setMonth(guard.getMonth() + 1);
        hops++;
      }
      if (guard.getTime() >= nowMs) d.setTime(guard.getTime());
    }

    // Valida e-mail (aceita só formato válido) e força minúsculas
    let email: string | null = null;
    const rawEmail = safe.data.contactEmail?.trim().toLowerCase();
    if (rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      email = rawEmail;
    }

    return {
      hasFollowUp: true,
      companyName: safe.data.companyName,
      cnpj: safe.data.cnpj ?? null,
      contactPerson: safe.data.contactPerson ?? null,
      contactEmail: email,
      actionType: safe.data.actionType,
      scheduledAt: d.toISOString(),
      notes: safe.data.notes ?? null,
    };
  });

