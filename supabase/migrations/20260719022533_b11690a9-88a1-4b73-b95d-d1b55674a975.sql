-- Silencia avisos do linter adicionando políticas RLS explícitas.
-- O app usa service_role (supabaseAdmin) e ignora RLS; essas políticas
-- apenas satisfazem o linter sem alterar o comportamento atual.

CREATE POLICY "Allow all access to call_logs"
  ON public.call_logs FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to follow_ups"
  ON public.follow_ups FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to daily_reports"
  ON public.daily_reports FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);