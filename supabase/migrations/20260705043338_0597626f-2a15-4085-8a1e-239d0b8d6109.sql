
-- 1) Remove políticas permissivas em daily_reports
DROP POLICY IF EXISTS "Public can read daily reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Public can insert daily reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Public can update daily reports" ON public.daily_reports;

-- 2) Revoga acesso de anon e authenticated em TODAS as tabelas do app.
--    Sem grants + com RLS habilitada = deny by default para qualquer chamada
--    via Data API (anon key ou bearer de usuário).
REVOKE ALL ON public.daily_reports FROM anon, authenticated;
REVOKE ALL ON public.call_logs      FROM anon, authenticated;
REVOKE ALL ON public.follow_ups     FROM anon, authenticated;

-- 3) Garante que service_role continua com acesso total (é quem o backend usa).
GRANT ALL ON public.daily_reports TO service_role;
GRANT ALL ON public.call_logs      TO service_role;
GRANT ALL ON public.follow_ups     TO service_role;

-- 4) Reforça RLS habilitada nas três tabelas.
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups     ENABLE ROW LEVEL SECURITY;
