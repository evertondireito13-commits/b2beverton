CREATE TABLE public.app_data_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'automatic',
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT app_data_backups_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT app_data_backups_item_count_nonnegative CHECK (item_count >= 0)
);

GRANT ALL ON public.app_data_backups TO service_role;

ALTER TABLE public.app_data_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny anon app_data_backups"
ON public.app_data_backups AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

CREATE POLICY "Deny authenticated app_data_backups"
ON public.app_data_backups AS RESTRICTIVE FOR ALL TO authenticated
USING (false) WITH CHECK (false);

CREATE INDEX idx_app_data_backups_consultor_created
ON public.app_data_backups (consultor, created_at DESC);

CREATE UNIQUE INDEX idx_app_data_backups_consultor_hash
ON public.app_data_backups (consultor, content_hash);