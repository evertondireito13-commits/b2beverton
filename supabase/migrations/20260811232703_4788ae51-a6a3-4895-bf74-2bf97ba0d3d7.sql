CREATE TABLE public.analises_conversa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  historico_id uuid REFERENCES public.historico_empresas(id) ON DELETE CASCADE,
  proporcao_fala_vendedor numeric,
  termos_chave_cliente jsonb NOT NULL DEFAULT '[]'::jsonb,
  sinais_de_fechamento jsonb NOT NULL DEFAULT '[]'::jsonb,
  vendedor_falou_demais boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.analises_conversa TO anon, authenticated;
GRANT ALL ON public.analises_conversa TO service_role;

ALTER TABLE public.analises_conversa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read analises_conversa" ON public.analises_conversa FOR SELECT USING (true);
CREATE POLICY "Public insert analises_conversa" ON public.analises_conversa FOR INSERT WITH CHECK (true);

CREATE INDEX idx_analises_conversa_historico ON public.analises_conversa (historico_id);