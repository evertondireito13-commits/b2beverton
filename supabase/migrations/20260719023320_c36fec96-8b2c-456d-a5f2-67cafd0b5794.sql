DROP POLICY IF EXISTS "Authenticated read daily_reports" ON public.daily_reports;
REVOKE ALL ON public.daily_reports FROM authenticated;

-- Mantém RLS habilitado sem nenhuma policy → nega tudo para anon/authenticated;
-- service_role continua acessando normalmente (bypass de RLS).