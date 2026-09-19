-- =============================================================================
-- Migração: abas por tema (tese) na Biblioteca de Prompts
-- Rodar isso no SQL Editor do Supabase ANTES de colar os arquivos de código.
-- =============================================================================

-- Tabela de temas (abas), isolada por consultor — mesmo padrão de isolamento
-- já usado em user_prompts, leads, historico_empresas etc.
create table if not exists user_prompt_temas (
  id uuid primary key default gen_random_uuid(),
  consultor text not null,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_prompt_temas_consultor on user_prompt_temas(consultor);

alter table user_prompt_temas enable row level security;

create policy "service_role_full_user_prompt_temas" on user_prompt_temas
  for all to service_role using (true) with check (true);

create policy "deny_anon_user_prompt_temas" on user_prompt_temas
  as restrictive for all to anon using (false);

-- user_prompts ganha vínculo com o tema. NULLABLE de propósito: linhas que já
-- existem hoje continuam válidas sem quebrar nada; a migração automática no
-- app (prompts-store.ts) é quem preenche esse campo na primeira sincronização,
-- criando um tema "ICMS Intermediário" e vinculando os pitches órfãos a ele.
alter table user_prompts add column if not exists tema_id uuid references user_prompt_temas(id) on delete restrict;
create index if not exists idx_user_prompts_tema_id on user_prompts(tema_id);
