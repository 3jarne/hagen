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
- Prosjekt = adresse + koordinater + GNR/BNR. GNR/BNR hentes automatisk
  fra Kartverket adressesøk og er aldri brukerinnskrevet.
- Auto-save er debounced (500ms) til Supabase. Ingen localStorage, ingen
  offline-støtte.
- **Deling:** prosjekt kan deles via lenke `/del/:shareId`. RLS-policy
  åpner public read når `sharing_enabled=true` og `share_id` er satt.
  Read-only-visningen lytter på Supabase realtime og oppdaterer
  automatisk når eier tegner.
- **Fog of war:** kartet er begrenset til en sirkel rundt prosjektets
  sentrum (v0.4: 500m approksimasjon, v0.5: faktisk eiendomsgrense +
  100m buffer fra matrikkel-API). Maxbounds + draw-validering hindrer
  panorering og tegning utenfor.

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
