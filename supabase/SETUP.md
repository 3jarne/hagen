# Supabase-oppsett

Følg stegene én gang for å koble appen til Supabase-prosjektet.

## 1. Kopier API-nøkler til `.env`

1. Åpne Supabase-dashboardet for prosjektet.
2. Gå til **Project Settings > API**.
3. Kopier **Project URL** og **anon public** key.
4. Kopier `.env.example` til `.env` i prosjektroten:

   ```
   cp .env.example .env
   ```

5. Lim inn verdiene:

   ```
   VITE_SUPABASE_URL=https://<ditt-prosjekt>.supabase.co
   VITE_SUPABASE_ANON_KEY=<din-anon-key>
   ```

## 2. Opprett tabeller og RLS-policies

1. Gå til **SQL Editor > New query** i Supabase-dashboardet.
2. Åpne `supabase/schema.sql` i dette repoet.
3. Kopier **hele filen** og lim inn i SQL Editor.
4. Trykk **Run**. Det skal stå "Success. No rows returned".
5. Verifiser: **Table Editor** skal nå vise `projects` og `drawings`.

## 3. Slå på magic link

1. Gå til **Authentication > Providers**.
2. Finn **Email** — den skal være aktivert som standard. Kontroller at
   **Enable Email provider** er på.
3. Under Email > Settings, sjekk at **Enable email confirmations** er
   aktivert (magic link-flyten).

## 4. Legg inn Site URL og Redirect URL

1. Gå til **Authentication > URL Configuration**.
2. Sett **Site URL** til:

   ```
   http://localhost:5173
   ```

3. Under **Redirect URLs**, legg til:

   ```
   http://localhost:5173
   ```

4. Trykk **Save**.

## 5. Restart dev-serveren

```
npm run dev
```

## Senere: når appen får et eget domene

Oppdater **Site URL** og **Redirect URLs** i Supabase-dashboardet til
produksjonsdomenet (og behold `http://localhost:5173` i Redirect URLs
for lokal utvikling).
