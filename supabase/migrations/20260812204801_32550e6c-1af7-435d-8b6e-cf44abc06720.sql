ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pausado_ate timestamp with time zone,
  ADD COLUMN IF NOT EXISTS fase_antes_pausa text;