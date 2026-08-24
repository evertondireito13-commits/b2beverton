DROP POLICY IF EXISTS "Allow all access to call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Allow all access to follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Allow all access to daily_reports" ON public.daily_reports;

-- Leitura permitida (padrão aceito pelo linter para SELECT true).
CREATE POLICY "Public read call_logs" ON public.call_logs
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read follow_ups" ON public.follow_ups
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read daily_reports" ON public.daily_reports
  FOR SELECT TO anon, authenticated USING (true);

-- Escrita bloqueada via Data API; o app usa service_role e ignora RLS.
CREATE POLICY "Block writes call_logs" ON public.call_logs
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block updates call_logs" ON public.call_logs
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block deletes call_logs" ON public.call_logs
  FOR DELETE TO anon, authenticated USING (false);

CREATE POLICY "Block writes follow_ups" ON public.follow_ups
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block updates follow_ups" ON public.follow_ups
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block deletes follow_ups" ON public.follow_ups
  FOR DELETE TO anon, authenticated USING (false);

CREATE POLICY "Block writes daily_reports" ON public.daily_reports
  FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block updates daily_reports" ON public.daily_reports
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block deletes daily_reports" ON public.daily_reports
  FOR DELETE TO anon, authenticated USING (false);