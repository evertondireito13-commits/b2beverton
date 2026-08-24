ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS consultor text;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS consultor text;
CREATE INDEX IF NOT EXISTS follow_ups_consultor_idx ON public.follow_ups (consultor);
CREATE INDEX IF NOT EXISTS call_logs_consultor_idx ON public.call_logs (consultor);