DROP POLICY IF EXISTS "Authenticated access call_logs" ON public.call_logs;
DROP POLICY IF EXISTS "Authenticated access follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Authenticated access daily_reports" ON public.daily_reports;

CREATE POLICY "Authenticated read call_logs" ON public.call_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read follow_ups" ON public.follow_ups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read daily_reports" ON public.daily_reports
  FOR SELECT TO authenticated USING (true);