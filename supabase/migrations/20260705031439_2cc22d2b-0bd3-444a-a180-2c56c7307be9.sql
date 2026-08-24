CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  cnpj TEXT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meeting_scheduled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX call_logs_called_at_idx ON public.call_logs (called_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read call_logs" ON public.call_logs FOR SELECT USING (true);
CREATE POLICY "Public insert call_logs" ON public.call_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update call_logs" ON public.call_logs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete call_logs" ON public.call_logs FOR DELETE USING (true);