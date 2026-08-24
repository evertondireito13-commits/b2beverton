CREATE TABLE public.historico_empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor text NOT NULL,
  data_iso timestamptz NOT NULL DEFAULT now(),
  empresa_nome text NOT NULL,
  cnpj text,
  contato text,
  cargo text,
  resultado text,
  interesse text,
  proxima_acao text,
  proxima_acao_data timestamptz,
  objecao text,
  texto_historico_completo text NOT NULL,
  descricao_original text,
  status text NOT NULL DEFAULT 'pendente',
  arquivado_manual boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_consultor ON public.historico_empresas (consultor, data_iso DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico_empresas TO anon, authenticated;
GRANT ALL ON public.historico_empresas TO service_role;

ALTER TABLE public.historico_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read historico_empresas" ON public.historico_empresas FOR SELECT USING (true);
CREATE POLICY "Public insert historico_empresas" ON public.historico_empresas FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update historico_empresas" ON public.historico_empresas FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete historico_empresas" ON public.historico_empresas FOR DELETE USING (true);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor text NOT NULL,
  cnpj text NOT NULL,
  empresa text NOT NULL,
  contato text,
  cargo text,
  telefone text,
  email text,
  proximo_passo text,
  rd_deal_id text,
  status text NOT NULL,
  em_followup_frio boolean NOT NULL DEFAULT false,
  data_reuniao timestamptz,
  ultima_observacao text,
  motivo_perda text,
  stage_since timestamptz,
  reagendamentos integer DEFAULT 0,
  timeline jsonb DEFAULT '[]'::jsonb,
  follow_ups jsonb DEFAULT '[]'::jsonb,
  ata_executiva text,
  ata_enviada_em timestamptz,
  modalidade_coleta text,
  docs_recebidos_em timestamptz,
  valor_credito numeric,
  percentual_honorarios numeric,
  oportunidades jsonb DEFAULT '[]'::jsonb,
  anexos jsonb DEFAULT '[]'::jsonb,
  comissao_percentual numeric,
  contrato_assinado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_consultor ON public.leads (consultor, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read leads" ON public.leads FOR SELECT USING (true);
CREATE POLICY "Public insert leads" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update leads" ON public.leads FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete leads" ON public.leads FOR DELETE USING (true);

CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();