-- CompoMate project persistence table
create extension if not exists pgcrypto;

create table if not exists public.compomate_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists compomate_projects_updated_at_idx
  on public.compomate_projects (updated_at desc);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists compomate_projects_set_updated_at on public.compomate_projects;
create trigger compomate_projects_set_updated_at
before update on public.compomate_projects
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.compomate_projects enable row level security;

-- Service-role routes bypass RLS; authenticated users can read/write once auth is enabled.
drop policy if exists "authenticated_read_compomate_projects" on public.compomate_projects;
create policy "authenticated_read_compomate_projects"
on public.compomate_projects
for select
to authenticated
using (true);

drop policy if exists "authenticated_insert_compomate_projects" on public.compomate_projects;
create policy "authenticated_insert_compomate_projects"
on public.compomate_projects
for insert
to authenticated
with check (true);
