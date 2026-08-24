CREATE TABLE public.follow_ups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  cnpj text,
  contact_person text,
  action_type text NOT NULL DEFAULT 'call',
  scheduled_at timestamp with time zone NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT follow_ups_action_type_chk CHECK (action_type IN ('call','email','meeting','whatsapp','other')),
  CONSTRAINT follow_ups_status_chk CHECK (status IN ('pending','done','cancelled'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO anon, authenticated;
GRANT ALL ON public.follow_ups TO service_role;

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read follow_ups" ON public.follow_ups FOR SELECT USING (true);
CREATE POLICY "Public insert follow_ups" ON public.follow_ups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update follow_ups" ON public.follow_ups FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete follow_ups" ON public.follow_ups FOR DELETE USING (true);

CREATE INDEX follow_ups_scheduled_at_idx ON public.follow_ups (scheduled_at);
CREATE INDEX follow_ups_status_idx ON public.follow_ups (status);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER follow_ups_set_updated_at
BEFORE UPDATE ON public.follow_ups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();