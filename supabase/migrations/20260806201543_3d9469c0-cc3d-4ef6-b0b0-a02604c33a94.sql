CREATE INDEX IF NOT EXISTS idx_followups_cnpj ON public.follow_ups(cnpj);
CREATE INDEX IF NOT EXISTS idx_followups_company ON public.follow_ups(company_name);
CREATE INDEX IF NOT EXISTS idx_call_logs_cnpj ON public.call_logs(cnpj);
CREATE INDEX IF NOT EXISTS idx_call_logs_company ON public.call_logs(company_name);
CREATE INDEX IF NOT EXISTS idx_leads_central_razao ON public.leads_central(razao_social);