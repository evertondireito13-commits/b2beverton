-- historico_empresas
DROP POLICY IF EXISTS "Public read historico_empresas" ON public.historico_empresas;
DROP POLICY IF EXISTS "Public insert historico_empresas" ON public.historico_empresas;
DROP POLICY IF EXISTS "Public update historico_empresas" ON public.historico_empresas;
DROP POLICY IF EXISTS "Public delete historico_empresas" ON public.historico_empresas;
REVOKE ALL ON public.historico_empresas FROM anon, authenticated;
GRANT ALL ON public.historico_empresas TO service_role;
ALTER TABLE public.historico_empresas ENABLE ROW LEVEL SECURITY;

-- leads
DROP POLICY IF EXISTS "Public read leads" ON public.leads;
DROP POLICY IF EXISTS "Public insert leads" ON public.leads;
DROP POLICY IF EXISTS "Public update leads" ON public.leads;
DROP POLICY IF EXISTS "Public delete leads" ON public.leads;
REVOKE ALL ON public.leads FROM anon, authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- analises_conversa
DROP POLICY IF EXISTS "Public read analises_conversa" ON public.analises_conversa;
DROP POLICY IF EXISTS "Public insert analises_conversa" ON public.analises_conversa;
REVOKE ALL ON public.analises_conversa FROM anon, authenticated;
GRANT ALL ON public.analises_conversa TO service_role;
ALTER TABLE public.analises_conversa ENABLE ROW LEVEL SECURITY;