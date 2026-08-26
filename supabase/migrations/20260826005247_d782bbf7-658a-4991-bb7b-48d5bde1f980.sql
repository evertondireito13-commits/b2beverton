-- Remove permissive cross-consultant read access; all app access goes through
-- trusted server functions using the service role.
DROP POLICY IF EXISTS "Authenticated read call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Authenticated read follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Authenticated read user_prompts" ON public.user_prompts;

-- Explicit deny-all for client roles on every sensitive table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['call_logs','follow_ups','user_prompts','leads','historico_empresas','analises_conversa','daily_reports','app_data_backups']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny anon %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny authenticated %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Deny anon %1$s" ON public.%1$I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "Deny authenticated %1$s" ON public.%1$I AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;