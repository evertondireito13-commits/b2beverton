-- Lock down follow_ups: remove public policies, revoke anon/authenticated grants. Access is via service_role only (server functions).
DROP POLICY IF EXISTS "Public delete follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Public update follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Public insert follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Public read follow_ups" ON public.follow_ups;
REVOKE ALL ON public.follow_ups FROM anon, authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

-- Lock down call_logs similarly. No SELECT policy exists; ensure RLS on and no public access.
REVOKE ALL ON public.call_logs FROM anon, authenticated;
GRANT ALL ON public.call_logs TO service_role;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;