ALTER TABLE public.follow_ups DROP CONSTRAINT IF EXISTS follow_ups_action_type_chk;
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_action_type_chk CHECK (action_type = ANY (ARRAY[
  'call','email','meeting','whatsapp','other','negociacao',
  'reuniao_agendada','pos_reuniao','pos_reuniao_ata','coleta_docs','coleta_ecac_txt','levantamento_docs',
  'apresentacao_calculos','fechamento','fechamento_contrato','ganho','perdido',
  'follow_up_reuniao','reuniao_realizada'
]));