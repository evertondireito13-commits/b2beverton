ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pausado_motivo text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fechamento_direto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_negociacao text NOT NULL DEFAULT 'cliente_direto',
  ADD COLUMN IF NOT EXISTS area_negociacao text NOT NULL DEFAULT 'tributario';