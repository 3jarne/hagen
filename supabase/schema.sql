-- Hageplan v0.3 — Supabase-skjema
-- Kjør hele filen i Supabase SQL Editor (Dashboard > SQL > New query).

-- ============================================================
-- 1. Tabell: projects
-- ============================================================
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  address      text not null,
  center_lng   double precision not null,
  center_lat   double precision not null,
  zoom         double precision not null default 17,
  gnr          integer,
  bnr          integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);

-- ============================================================
-- 2. Tabell: drawings (én rad per prosjekt)
-- ============================================================
create table if not exists public.drawings (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null unique references public.projects(id) on delete cascade,
  draw_features   jsonb not null default '[]'::jsonb,
  text_features   jsonb not null default '[]'::jsonb,
  line_features   jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);

create index if not exists drawings_project_id_idx on public.drawings(project_id);

-- Forward-compatible: add line_features for installs that ran an earlier schema.
alter table public.drawings
  add column if not exists line_features jsonb not null default '[]'::jsonb;

-- ============================================================
-- 3. updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists drawings_set_updated_at on public.drawings;
create trigger drawings_set_updated_at
before update on public.drawings
for each row execute function public.set_updated_at();

-- ============================================================
-- 4. Row Level Security
-- ============================================================
alter table public.projects enable row level security;
alter table public.drawings enable row level security;

-- Bruker ser kun egne prosjekter
drop policy if exists "projects are selectable by owner" on public.projects;
create policy "projects are selectable by owner"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects are insertable by owner" on public.projects;
create policy "projects are insertable by owner"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "projects are updatable by owner" on public.projects;
create policy "projects are updatable by owner"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "projects are deletable by owner" on public.projects;
create policy "projects are deletable by owner"
  on public.projects for delete
  using (auth.uid() = user_id);

-- drawings følger prosjektets eier
drop policy if exists "drawings are selectable by project owner" on public.drawings;
create policy "drawings are selectable by project owner"
  on public.drawings for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = drawings.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "drawings are insertable by project owner" on public.drawings;
create policy "drawings are insertable by project owner"
  on public.drawings for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = drawings.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "drawings are updatable by project owner" on public.drawings;
create policy "drawings are updatable by project owner"
  on public.drawings for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = drawings.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = drawings.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "drawings are deletable by project owner" on public.drawings;
create policy "drawings are deletable by project owner"
  on public.drawings for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = drawings.project_id and p.user_id = auth.uid()
    )
  );
