DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='daily_reports' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.daily_reports', p.policyname); END LOOP; END $$;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_reports TO service_role;