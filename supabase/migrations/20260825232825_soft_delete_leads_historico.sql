-- Soft-delete de empresas: em vez de apagar o lead e o histórico de
-- ligações de verdade, marcamos com excluido_em/excluido_motivo. O registro
-- continua no banco (com toda a timeline/histórico) e pode ser restaurado
-- pelo app a qualquer momento, sem perder nada.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_motivo text;

ALTER TABLE public.historico_empresas
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_motivo text;

CREATE INDEX IF NOT EXISTS idx_leads_excluido_em ON public.leads (excluido_em);
CREATE INDEX IF NOT EXISTS idx_historico_excluido_em ON public.historico_empresas (excluido_em);
