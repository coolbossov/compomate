-- CompoMate — Templates table
-- Stores composition templates per anonymous session (no auth required)

create extension if not exists pgcrypto;

create table if not exists public.compomate_templates (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null,
  name            text not null,
  composition     jsonb not null default '{}',
  export_profile_id text,
  name_style_id   text,
  font_pair_id    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Index for fast session lookups
create index if not exists compomate_templates_session_id_idx
  on public.compomate_templates (session_id);

create index if not exists compomate_templates_session_updated_idx
  on public.compomate_templates (session_id, updated_at desc);

-- Auto-update updated_at on row change
create or replace function compomate_templates_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists compomate_templates_updated_at on public.compomate_templates;
create trigger compomate_templates_updated_at
  before update on public.compomate_templates
  for each row execute procedure compomate_templates_set_updated_at();

alter table public.compomate_templates enable row level security;
