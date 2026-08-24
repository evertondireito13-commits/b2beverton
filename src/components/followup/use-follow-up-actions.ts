// Ações compartilhadas da fila de Follow-up (usadas na tela /followup e na Agenda).
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { updateFollowUp, deleteFollowUp, type FollowUp } from "@/lib/follow-ups.functions";
import {
  propagateFollowUpDone,
  propagateFollowUpRemoved,
  propagateFollowUpReschedule,
} from "@/lib/followup-bridge";
import { iniciarLigacaoParaEmpresa } from "@/lib/pre-ligacao-handoff";
import { getSessionConsultor, getConsultor } from "@/lib/historico-store";

export function activeConsultor(): string {
  try {
    return (getSessionConsultor() ?? getConsultor()) || "shared";
  } catch {
    return "shared";
  }
}

export function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

export function useFollowUpActions({
  applyPatch,
  applyRemove,
}: {
  applyPatch: (id: string, patch: Partial<FollowUp>) => void;
  applyRemove: (id: string) => void;
}) {
  const runUpdate = useServerFn(updateFollowUp);
  const runDelete = useServerFn(deleteFollowUp);
  const navigate = useNavigate();
  const [editingRow, setEditingRow] = useState<FollowUp | null>(null);
  const [reschedulingRow, setReschedulingRow] = useState<FollowUp | null>(null);

  async function markDone(row: FollowUp) {
    try {
      await runUpdate({
        data: {
          id: row.id,
          status: row.status === "done" ? "pending" : "done",
          consultor: activeConsultor(),
        },
      });
      const concluido = row.status !== "done";
      applyPatch(row.id, { status: concluido ? "done" : "pending" });
      if (concluido) propagateFollowUpDone(row);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
    }
  }

  async function remove(row: FollowUp) {
    if (!confirm(`Remover follow-up de "${row.company_name}"?`)) return;
    try {
      await runDelete({ data: { id: row.id, consultor: activeConsultor() } });
      applyRemove(row.id);
      propagateFollowUpRemoved(row);
      toast.success("Removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    }
  }

  async function toggleEmailSent(row: FollowUp) {
    const next = !row.email_sent;
    try {
      // Regra: ao MARCAR e-mail como enviado, empurra o follow-up para +2 dias úteis 10:00
      // (a menos que já esteja agendado para daqui a >= 2 dias).
      let novaData: string | undefined;
      let novaNota: string | null | undefined;
      if (next) {
        const alvo = addBusinessDays(new Date(), 2);
        alvo.setHours(10, 0, 0, 0);
        const atual = new Date(row.scheduled_at).getTime();
        if (atual < alvo.getTime()) {
          novaData = alvo.toISOString();
          const notasAntigas = (row.notes ?? "").trim();
          const carimbo = `[E-mail enviado em ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — retorno automático em +2 dias úteis]`;
          novaNota = notasAntigas ? `${notasAntigas}\n${carimbo}` : carimbo;
        }
      }
      const updated = await runUpdate({
        data: {
          id: row.id,
          emailSent: next,
          consultor: activeConsultor(),
          ...(novaData ? { scheduledAt: novaData, status: "pending" as const } : {}),
          ...(novaNota !== undefined ? { notes: novaNota } : {}),
        },
      });
      applyPatch(row.id, updated as Partial<FollowUp>);
      if (novaData) propagateFollowUpReschedule(row, novaData);
      if (next && novaData) {
        const quando = new Date(novaData).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        toast.success(`E-mail enviado · follow-up reagendado para ${quando}`);
      } else {
        toast.success(next ? "Marcado: e-mail enviado" : "E-mail desmarcado");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar");
    }
  }

  async function saveReschedule(patch: {
    id: string;
    scheduledAt: string;
    motivo: string;
    row: FollowUp;
  }) {
    try {
      const notasAntigas = (patch.row.notes ?? "").trim();
      const carimbo = `[Reagendado em ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}]`;
      const motivo = patch.motivo.trim();
      const novaNota = motivo
        ? notasAntigas
          ? `${notasAntigas}\n${carimbo} ${motivo}`
          : `${carimbo} ${motivo}`
        : notasAntigas || null;
      const updated = await runUpdate({
        data: {
          id: patch.id,
          scheduledAt: patch.scheduledAt,
          notes: novaNota,
          status: "pending",
          consultor: activeConsultor(),
        },
      });
      applyPatch(patch.id, updated as Partial<FollowUp>);
      propagateFollowUpReschedule(patch.row, patch.scheduledAt);
      const quando = new Date(patch.scheduledAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      toast.success(`Reagendado para ${quando}`);
      setReschedulingRow(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reagendar");
    }
  }

  async function saveEdit(patch: {
    id: string;
    companyName: string;
    contactPerson: string;
    cnpj: string;
    notes: string;
  }) {
    try {
      const updated = await runUpdate({
        data: {
          id: patch.id,
          companyName: patch.companyName.trim(),
          contactPerson: patch.contactPerson.trim() || null,
          cnpj: patch.cnpj.trim() || null,
          notes: patch.notes.trim() || null,
          consultor: activeConsultor(),
        },
      });
      applyPatch(patch.id, updated as Partial<FollowUp>);
      toast.success("Follow-up atualizado");
      setEditingRow(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    }
  }

  async function renameRow(row: FollowUp, novoNome: string) {
    const nome = novoNome.trim();
    if (!nome || nome === row.company_name) return;
    try {
      const updated = await runUpdate({
        data: { id: row.id, companyName: nome, consultor: activeConsultor() },
      });
      applyPatch(row.id, updated as Partial<FollowUp>);
      toast.success("Nome da empresa atualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao renomear");
    }
  }

  function goToPosLigacao(row: FollowUp) {
    try {
      iniciarLigacaoParaEmpresa({
        empresa: row.company_name,
        cnpj: row.cnpj,
        contato: row.contact_person,
        observacoes: row.notes ?? undefined,
        followUpId: row.id,
      });
      toast.success(`Abrindo Pré-ligação para ${row.company_name}`);
      navigate({ to: "/", search: { tab: "pre" } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao abrir Pré-ligação");
    }
  }

  return {
    markDone,
    remove,
    toggleEmailSent,
    saveReschedule,
    saveEdit,
    renameRow,
    goToPosLigacao,
    editingRow,
    setEditingRow,
    reschedulingRow,
    setReschedulingRow,
  };
}
