-- Hageplan v0.4 — Deling + read-only visning
-- Kjør hele filen i Supabase SQL Editor (Dashboard > SQL > New query).
-- Sikker å kjøre flere ganger (idempotent).

-- ============================================================
-- 1. Nye kolonner på projects
-- ============================================================
alter table public.projects
  add column if not exists sharing_enabled boolean not null default false;

alter table public.projects
  add column if not exists share_id text;

-- Unik constraint på share_id (NULL-er teller ikke som duplikater i Postgres).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_share_id_key'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_share_id_key unique (share_id);
  end if;
end$$;

-- Indeks for raske oppslag fra read-only-visningen.
create index if not exists projects_share_id_idx
  on public.projects(share_id)
  where share_id is not null;

-- ============================================================
-- 2. RLS — public read-only tilgang via share_id
-- ============================================================
-- Permissive SELECT-policy på projects: en rad er lesbar uten innlogging
-- så lenge sharing_enabled = true og share_id er satt. Eierens egen
-- SELECT-policy fra v0.3 er fortsatt aktiv (policies er OR-et sammen).
drop policy if exists "projects are publicly readable when shared"
  on public.projects;
create policy "projects are publicly readable when shared"
  on public.projects for select
  to anon, authenticated
  using (sharing_enabled = true and share_id is not null);

-- Tilsvarende SELECT-policy på drawings: lesbar hvis tilhørende prosjekt
-- er delt.
drop policy if exists "drawings are publicly readable when project is shared"
  on public.drawings;
create policy "drawings are publicly readable when project is shared"
  on public.drawings for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = drawings.project_id
        and p.sharing_enabled = true
        and p.share_id is not null
    )
  );

-- ============================================================
-- 3. Realtime — drawings må publiseres for live-oppdatering
-- ============================================================
-- Legg drawings i supabase_realtime-publikasjonen (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'drawings'
  ) then
    alter publication supabase_realtime add table public.drawings;
  end if;
end$$;
