-- Remove todas as políticas atuais (públicas e de bloqueio)
DROP POLICY IF EXISTS "Public read call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Block writes call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Block updates call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Block deletes call_logs" ON public.call_logs;

DROP POLICY IF EXISTS "Public read follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Block writes follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Block updates follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Block deletes follow_ups" ON public.follow_ups;

DROP POLICY IF EXISTS "Public read daily_reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Block writes daily_reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Block updates daily_reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Block deletes daily_reports" ON public.daily_reports;

-- Bloqueio explícito para anônimos (defesa em profundidade)
CREATE POLICY "Deny anon call_logs" ON public.call_logs
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny anon follow_ups" ON public.follow_ups
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny anon daily_reports" ON public.daily_reports
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- Acesso liberado somente a usuários autenticados
CREATE POLICY "Authenticated access call_logs" ON public.call_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated access follow_ups" ON public.follow_ups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated access daily_reports" ON public.daily_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Revoga privilégios do anon na Data API (dupla proteção)
REVOKE ALL ON public.call_logs FROM anon;
REVOKE ALL ON public.follow_ups FROM anon;
REVOKE ALL ON public.daily_reports FROM anon;