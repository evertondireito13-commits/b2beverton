DROP POLICY IF EXISTS "Public read call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Public insert call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Public update call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Public delete call_logs" ON public.call_logs;

REVOKE ALL ON public.call_logs FROM anon;
REVOKE ALL ON public.call_logs FROM authenticated;