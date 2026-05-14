# Hageplan

Nettbasert verktøy for å tegne hageplaner på satellittkart av norske
eiendommer. Bruker logger inn med magic link, lagrer prosjekter i Supabase.

## Stack

- React 19 + Vite + TypeScript
- Mapbox GL (kart) + mapbox-gl-draw (tegning)
- shadcn/ui (Radix + Tailwind) — all UI
- Lucide-ikoner — ingen emojis
- Supabase (Auth + Postgres)

## Kommandoer

- `npm run dev` — dev-server
- `npm run build` — typesjekk + bygg
- `npm run lint` — ESLint

## Arkitektur

- To tegnemodus: **Hage** (høy-nivå hage-elementer) og **Rå** (grunnformer).
- Tegninger lagres som GeoJSON (`draw_features`, `text_features`,
  `line_features`) i `drawings`-tabellen, én rad per prosjekt.
- Prosjekt = adresse + koordinater + GNR/BNR + eiendomsgrense.
  GNR/BNR hentes fra Kartverkets adressesøk; eiendomsgrensa (polygon)
  hentes fra matrikkel-SOAP via Supabase Edge Function (se under) og
  lagres som GeoJSON i `projects.property_boundary`.
- Auto-save er debounced (500ms) til Supabase. Ingen localStorage, ingen
  offline-støtte.
- **Deling:** prosjekt kan deles via lenke `/del/:shareId`. RLS-policy
  åpner public read når `sharing_enabled=true` og `share_id` er satt.
  Read-only-visningen lytter på Supabase realtime og oppdaterer
  automatisk når eier tegner.
- **Eiendomsgrense:** matrikkel-SOAP-integrasjon i Edge Function
  `matrikkel-lookup` henter Teig + Teiggrenser + Teiggrensepunkt fra
  Kartverket (5 SOAP-kall, stitcher segmenter til lukket polygon, leser
  per-punkt koordinatsystemKodeId og projiserer UTM32/UTM33/UTM35 →
  EPSG:4326). Resultatet lagres i `property_boundary` ved prosjekt-
  opprettelse. Vises som stiplet amber linje på kartet via
  `addPropertyBoundaryLayer`.
- **Fog of war:** geometrisk buffer rundt eiendomsgrensa (100m) via
  `@turf/buffer`. Buffer-polygonet brukes som maxBounds, draw-validering
  og hull i fog-masken. Fallback til 400m-sirkel for gamle prosjekter
  som mangler `property_boundary` (opprettet før v0.5).
- **Bygninger:** matrikkel-SOAP gir kun representasjonspunkt per bygg,
  ikke fotavtrykk. Fotavtrykk vil komme fra Geonorge FKB-Bygning WFS i
  en senere fase.

## Regler

- All UI bruker shadcn/ui. Ikke egendesignede sider.
- Ingen emojis i UI (knapper, menyer, tekst, labels). Bruk Lucide-ikoner.
- Mapbox-token leses kun fra `VITE_MAPBOX_TOKEN`. Ingen UI for å sette den.
- Supabase-nøkler leses fra `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY`.
- Brukeren skriver aldri GNR/BNR, koordinater eller API-nøkler manuelt.
- Row Level Security er påslått på alle tabeller — bruker ser kun egne rader.
- Appen antar norsk IP. Kartverket-API-et (ws.geonorge.no) blokkerer
  utenlandsk trafikk — TCP-tilkoblinger timer ut fra utlandet. Dette er
  et akseptert basiskrav: målgruppen er norske huseiere.
- Push rett til `main` etter at build passerer. Eier er designer og
  gjør ikke kode-review — PR-er er unødvendig friksjon. GitHub Pages
  deployer automatisk fra main.
