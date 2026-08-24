CREATE TABLE IF NOT EXISTS public.user_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor TEXT NOT NULL,
  nome TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('abordagem','historico')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_prompts_consultor ON public.user_prompts(consultor);
CREATE INDEX IF NOT EXISTS idx_user_prompts_tipo ON public.user_prompts(tipo);

GRANT ALL ON public.user_prompts TO service_role;
GRANT SELECT ON public.user_prompts TO authenticated;

ALTER TABLE public.user_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read user_prompts" ON public.user_prompts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Deny anon user_prompts" ON public.user_prompts AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE TRIGGER user_prompts_set_updated_at BEFORE UPDATE ON public.user_prompts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();