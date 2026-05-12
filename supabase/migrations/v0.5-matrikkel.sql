-- Hageplan v0.5 — Matrikkel-integrasjon
-- Kjør hele filen i Supabase SQL Editor (Dashboard > SQL > New query).
-- Sikker å kjøre flere ganger (idempotent).

-- ============================================================
-- 1. Nye kolonner på projects
-- ============================================================
-- property_boundary: GeoJSON Polygon (eiendomsgrense) i EPSG:4326.
-- buildings:         GeoJSON FeatureCollection av bygningspolygoner.
-- kommunenummer:     4-sifret kode fra Kartverket (lagres som tekst pga.
--                    ledende nuller, f.eks. "0301").
-- matrikkel_fetched_at: når dataene sist ble hentet fra Kartverket.
alter table public.projects
  add column if not exists property_boundary jsonb;

alter table public.projects
  add column if not exists buildings jsonb;

alter table public.projects
  add column if not exists kommunenummer text;

alter table public.projects
  add column if not exists matrikkel_fetched_at timestamptz;
