
CREATE TABLE public.daily_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_name TEXT NOT NULL,
  report_date DATE NOT NULL,
  contacts_made INTEGER NOT NULL DEFAULT 0,
  decision_maker_calls INTEGER NOT NULL DEFAULT 0,
  meetings_held INTEGER NOT NULL DEFAULT 0,
  documents_received INTEGER NOT NULL DEFAULT 0,
  had_closing BOOLEAN NOT NULL DEFAULT false,
  closing_details TEXT,
  companies_approached TEXT NOT NULL,
  biggest_obstacle TEXT NOT NULL,
  next_step TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (partner_name, report_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO anon;
GRANT ALL ON public.daily_reports TO service_role;

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read daily reports"
  ON public.daily_reports FOR SELECT
  USING (true);

CREATE POLICY "Public can insert daily reports"
  ON public.daily_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update daily reports"
  ON public.daily_reports FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
