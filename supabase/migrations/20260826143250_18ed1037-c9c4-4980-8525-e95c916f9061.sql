-- ============ Biblioteca "Como abordar" ============
CREATE TABLE public.biblioteca_conteudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor text NOT NULL,
  tipo text NOT NULL DEFAULT 'script',
  titulo text NOT NULL,
  segmento text,
  cargo text,
  etapa text,
  ncm text,
  corpo text NOT NULL DEFAULT '',
  resposta_recomendada text,
  pergunta_avanco text,
  quando_nao_usar text,
  impacto_prospeccao text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  versao integer NOT NULL DEFAULT 1,
  vigencia_em timestamptz,
  aprovado_por text,
  arquivado boolean NOT NULL DEFAULT false,
  usos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.biblioteca_conteudos TO service_role;
ALTER TABLE public.biblioteca_conteudos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon biblioteca_conteudos" ON public.biblioteca_conteudos AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny authenticated biblioteca_conteudos" ON public.biblioteca_conteudos AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER biblioteca_conteudos_set_updated_at BEFORE UPDATE ON public.biblioteca_conteudos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_biblioteca_consultor ON public.biblioteca_conteudos (consultor, arquivado);

CREATE TABLE public.biblioteca_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteudo_id uuid NOT NULL REFERENCES public.biblioteca_conteudos(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  snapshot jsonb NOT NULL,
  autor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.biblioteca_versoes TO service_role;
ALTER TABLE public.biblioteca_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon biblioteca_versoes" ON public.biblioteca_versoes AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny authenticated biblioteca_versoes" ON public.biblioteca_versoes AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.biblioteca_buscas_vazias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor text NOT NULL,
  termo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.biblioteca_buscas_vazias TO service_role;
ALTER TABLE public.biblioteca_buscas_vazias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon biblioteca_buscas_vazias" ON public.biblioteca_buscas_vazias AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny authenticated biblioteca_buscas_vazias" ON public.biblioteca_buscas_vazias AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);

-- ============ Mural de Atualizações ============
CREATE TABLE public.atualizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor text NOT NULL,
  prioridade text NOT NULL DEFAULT 'P2',
  categoria text NOT NULL DEFAULT 'execucao',
  titulo text NOT NULL,
  o_que_mudou text NOT NULL DEFAULT '',
  quem_age text,
  acao_esperada text,
  prazo timestamptz,
  impacto text,
  fonte text,
  versao text NOT NULL DEFAULT 'v1.0',
  pontuacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  arquivado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.atualizacoes TO service_role;
ALTER TABLE public.atualizacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon atualizacoes" ON public.atualizacoes AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny authenticated atualizacoes" ON public.atualizacoes AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER atualizacoes_set_updated_at BEFORE UPDATE ON public.atualizacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_atualizacoes_consultor ON public.atualizacoes (consultor, prioridade, created_at DESC);

CREATE TABLE public.atualizacoes_leituras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atualizacao_id uuid NOT NULL REFERENCES public.atualizacoes(id) ON DELETE CASCADE,
  consultor text NOT NULL,
  status text NOT NULL DEFAULT 'lido',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atualizacao_id, consultor)
);
GRANT ALL ON public.atualizacoes_leituras TO service_role;
ALTER TABLE public.atualizacoes_leituras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon atualizacoes_leituras" ON public.atualizacoes_leituras AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny authenticated atualizacoes_leituras" ON public.atualizacoes_leituras AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER atualizacoes_leituras_set_updated_at BEFORE UPDATE ON public.atualizacoes_leituras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Passagem de bastão ============
CREATE TABLE public.passagens_bastao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor text NOT NULL,
  empresa text NOT NULL,
  cnpj text,
  segmento text,
  contato text,
  cargo text,
  canal text,
  resumo text NOT NULL DEFAULT '',
  dor text,
  objecao text,
  nivel_interesse text,
  contexto_fiscal text,
  proxima_acao text NOT NULL DEFAULT '',
  responsavel text NOT NULL DEFAULT '',
  prazo timestamptz,
  pendencias text,
  status text NOT NULL DEFAULT 'pendente',
  motivo_devolucao text,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.passagens_bastao TO service_role;
ALTER TABLE public.passagens_bastao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny anon passagens_bastao" ON public.passagens_bastao AS RESTRICTIVE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny authenticated passagens_bastao" ON public.passagens_bastao AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);
CREATE TRIGGER passagens_bastao_set_updated_at BEFORE UPDATE ON public.passagens_bastao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_bastao_consultor ON public.passagens_bastao (consultor, status, created_at DESC);