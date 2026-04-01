# Hageplan v2 — Project Brief

> Dette dokumentet er den eneste kilden til sannhet for Hageplan v2.
> Følg det presist. Ikke oppfinn atferd som ikke er beskrevet her.
> Når noe ikke er spesifisert, spør før du antar.

---

## Hva du bygger videre på

Hageplan v2 er en iterasjon på v1-kodebasen. Du arver alle eksisterende
funksjoner og legger til:

1. **Bug-fix: globale stilverdier** — fikses som aller første steg
2. **Hage-modus** — ny primær tegnemodalitet via toolbar-toggle
3. **Solkompass** — ny funksjon med dato/tid-slider

Rå-modus (eksisterende v1 toolbar) beholdes nøyaktig uendret.

---

## localStorage

v2 overskriver v1-data. Bruk samme nøkkel: `hageplan_sketch`.
Ingen bakoverkompatibilitet er nødvendig.

---

## Steg 0 — Rydd og fiks før nye features

### 0a. Bryt opp store filer
Gjennomgå kodebasen og del opp filer som er blitt for store til å
vedlikeholde. Finn en mappestruktur som gir mening basert på hva som
faktisk finnes — du bestemmer strukturen selv.

### 0b. Fix: globale stilverdier
**Problem:** Farge, opacity og stroke endres kun på valgt element,
ikke som global standard for neste tegning.

**Ønsket atferd:**
- Properties panel viser globale standarder når ingenting er valgt
- Endringer der påvirker *neste* tegning, ikke eksisterende elementer
- Endringer på et valgt element påvirker bare *det* elementet
- Disse to skal aldri blandes

---

## Toolbar — ny struktur

Floating toolbar, bunn-senter, alltid synlig.

```
[ Velg  |  🌿▾  💧▾  🏗▾  |  T  📐  |  ···  ||  Hage  Rå  ]
```

Høyre side: **Hage / Rå toggle** med visuell skillelinje.

### Hage-modus (standard ved oppstart)

Tre kategoriknapper med emoji + chevron (▾):

| Knapp | Kategori | Elementer |
|---|---|---|
| 🌿▾ | Planter | Tre, Busk, Hekk, Bed, Gressplen, Grønnsakhage |
| 💧▾ | Vann & Sti | Dam, Sti |
| 🏗▾ | Konstruksjon | Terrasse, Bygning |

**Flyt:**
- Klikk kategoriknapp → Popover åpnes med elementlisten
- Velg element → Popover lukkes, knappen bytter til f.eks. `🌳 Tre`
- Tegn → forblir i samme hage-type til du velger noe annet
- Escape → avbryter pågående tegning, beholder aktiv hage-type
- Velg-verktøy (V) → alltid tilgjengelig i begge modi

### Rå-modus
Identisk med v1 toolbar. Ingen endringer overhodet.

---

## Hage-elementer

Alle elementer er **geografisk korrekte** — størrelser og bredder
skalerer med kartzoom. Alle former lagres som GeoJSON med `hagenType` property.

### Visuelle standarder som gjelder for alle elementer
- Fyll: elementets standardfarge, 40% opacity (60% for Terrasse/Bygning)
- Kant: samme farge som fyll, 85% opacity, solid (aldri stiplet), 2px
- Emoji: HTML overlay, fast visuell størrelse uavhengig av zoom,
  sentrert i formen
- Navn: vises kun på hover via tooltip, hvis satt

### 🌿 Planter

**🌳 Tre**
- Tegning: klikk-dra setter radius live
- Standard: 3m diameter
- Justere etterpå: dra i kanten av sirkelen
- Properties panel: diameter-slider (0.5m–20m) + fargevelger
- Standardfarge: mørkegrønn
- ⚠️ Teknisk risiko: dra-i-kant er ikke innebygd i mapbox-gl-draw.
  Vurder beste løsning og beskriv valget ditt før du implementerer.

**🌿 Busk**
- Identisk interaksjon med Tre
- Standard: 1m diameter
- Properties panel: diameter-slider (0.3m–5m) + fargevelger
- Standardfarge: mellomgrønn

**🌿 Hekk**
- Tegning: klikk for punkter, dobbelklikk avslutter (polyline)
- Rendres som geografisk korrekt bånd med justerbar bredde
- Standard bredde: 60cm
- Properties panel: bredde-slider (20cm–300cm) + fargevelger
- Emoji fordelt langs linjen
- Standardfarge: mørkegrønn

**🌸 Bed**
- Tegning: polygon
- Standardfarge: varm rosa `#f9a8d4`

**🌱 Gressplen**
- Tegning: polygon
- Standardfarge: lys grønn `#86efac`

**🥕 Grønnsakhage**
- Tegning: polygon
- Standardfarge: gul-grønn `#a3e635`

### 💧 Vann & Sti

**💧 Dam**
- Tegning: frihånd eller polygon
- Standardfarge: blå `#38bdf8`

**🪨 Sti**
- Tegning: identisk med Hekk (polyline → bånd)
- Standard bredde: 120cm
- Properties panel: bredde-slider (30cm–800cm) + fargevelger
- Standardfarge: grå/beige `#d6d3d1`

### 🏗️ Konstruksjon

**🪵 Terrasse**
- Tegning: polygon
- Standardfarge: varm grå `#d6d3d1`

**🏠 Bygning**
- Tegning: bruker velger mellom Polygon og Rektangel i properties panel.
  Standard er Rektangel.
- Standardfarge: nøytral grå `#9ca3af`

---

## Emoji-rendering

Emojier rendres som HTML overlays på toppen av kartet.
Finn beste tilnærming basert på Mapbox sin API.

Krav:
- Fast visuell størrelse uavhengig av zoom
- Sentrert i formen
- Følger kartet korrekt ved panorering og zoom
- Hekk/Sti: ett emoji per ca. 5–8m langs linjen

---

## Valgfritt navnefelt etter tegning

Etter at et hage-element er ferdig tegnet:
1. Navnefelt vises øverst i properties panel
2. Bruker skriver navn og trykker Enter
3. Escape hopper over — ingen navn satt
4. Navn lagres på featuren og vises kun på hover

---

## Properties panel i Hage-modus

Oppfører seg som v1 (slides inn fra høyre, ingen scrim).

**Når hage-type er valgt, ingenting tegnet:**
- Aktiv type vises øverst (emoji + navn)
- For Bygning: valg mellom Polygon / Rektangel
- Fargevelger — endrer globale standarder
- For Hekk/Sti: bredde-slider

**Når element er valgt:**
- Navnefelt øverst (redigerbart)
- Fargevelger for dette elementet
- For Tre/Busk: diameter-slider i meter
- For Hekk/Sti: bredde-slider
- Ingen opacity-slider — opacity er fast per type

**Redigering:** Hage-elementer kan velges og redigeres i begge modi.

---

## Solkompass

**Plassering:** Liten widget, bunn-høyre, alltid synlig.

**Standard-tilstand:**
- Roterende sol-ikon som peker mot solens posisjon
- Basert på kartsenter + nåværende klokkeslett
- Oppdateres hvert minutt og når kartet panoreres

**Klikk på widget:**
Åpner Popover med:
- Dato-velger (shadcn Calendar), standard = i dag
- Tid-slider (0–24t), viser klokkeslett som tekst
- Soloppgang og solnedgang for valgt dato og posisjon
- Sol-altitude i grader, eller "Under horisonten"

**Beregning:** Bruk `suncalc`-biblioteket (allerede installert).
Koordinater følger kartsenter og oppdateres ved panorering.

---

## JSON data-modell

Utvid v1-skjemaet minimalt:
- `version: 2`
- `featureType: "garden"` eller `featureType: "raw"` på alle features
- `hagenType` på hage-features (f.eks. `"tre"`, `"hekk"`)
- `gardenProps` objekt for type-spesifikke verdier (diameter, bredde)

Design skjemaet for fremtidig utvidbarhet — lag-panel kommer i v3.

---

---

# Faseinndelt byggeplan

Bygg og test én fase om gangen. Ikke start neste fase
før brukeren bekrefter godkjenning.

---

## Fase 0 — Opprydding og bug-fix ✅
**Mål:** Ren kodebase. Global stilverdi-bug fikset.

- [x] Del opp store filer etter eget skjønn
- [x] Fix global stilverdi-bug

---

## Fase 1 — Toolbar-toggle og tom Hage-modus
**Mål:** Toggle fungerer. Kategoriknapper åpner riktig popover.

- [x] Hage/Rå toggle
- [x] Tre kategoriknapper med popover og elementliste
- [x] Valgt element vises i knappen
- [x] Rå-modus identisk med v1

**Test:**
- Toggle bytter mellom modi
- Alle tre popovers åpner/lukker
- Valgt element vises korrekt i knappen

---

## Fase 2 — Polygon-baserte elementer
**Mål:** Bed, Gressplen, Grønnsakhage, Terrasse, Dam fungerer.

- Polygon-tegning med riktig standardstil per type
- Emoji HTML overlays i sentrum
- Hover viser navn
- Navnefelt i properties panel
- Auto-save med JSON v2-format

**Test:**
- Tegn ett av hvert — riktig emoji og farge?
- Zoom inn/ut — geografisk korrekt størrelse?
- Eksporter JSON — `hagenType` til stede?

---

## Fase 3 — Sirkelelementer (Tre og Busk)
**Mål:** Tre og Busk med klikk-dra og størrelsesjustering.

- Klikk-dra tegner geografisk korrekt sirkel
- Diameter vises live under tegning
- Properties panel: diameter-slider
- Størrelsesjustering etterpå

**⚠️ Teknisk:** Vurder løsning for dra-i-kant og beskriv valget
før du implementerer.

**Test:**
- Er 3m faktisk 3m? (sammenlign med scale ruler)
- Kan størrelse justeres etterpå?

---

## Fase 4 — Linje-elementer (Hekk og Sti)
**Mål:** Geografisk korrekte bånd.

- Polyline-tegning
- Bånd med geografisk korrekt bredde
- Bredde-slider i properties panel
- Emoji langs linjen

**Test:**
- Er 60cm hekk faktisk 60cm på kartet?
- Endre bredde — oppdateres båndet live?

---

## Fase 5 — Bygning
**Mål:** Bygning med valg av tegnemodus.

- Polygon / Rektangel-valg i properties panel

**Test:** Tegn med begge modi. Navnefelt fungerer?

---

## Fase 6 — Solkompass
**Mål:** Fungerende solkompass.

- Widget bunn-høyre
- Roterer basert på kartsenter + klokkeslett
- Popover med dato, tid-slider, soloppgang/solnedgang, altitude

**Test:**
- Viser riktig retning nå?
- Panorer til annen by — oppdateres sol-data?

---

## Fase 7 — Sluttpolering
**Mål:** Ingen løse tråder.

- Alle properties panel-felt fungerer for alle 10 typer
- Undo/redo inkluderer hage-operasjoner
- Høyreklikk-meny fungerer på hage-elementer
- Eksport JSON og PNG inkluderer hage-elementer

**Test:** Full gjennomgang — tegn alle typer, gi navn, endre farge,
undo/redo, eksporter.

---

---

# Selvevalueringsprotokoll — obligatorisk etter hver fase

### Steg 1 — Spec-sjekk
Gå gjennom hvert punkt i fasens oppgaveliste:
- ✅ Gjort
- ❌ Ikke gjort — fiks umiddelbart
- ⚠️ Delvis — beskriv og fiks

Ikke gå videre før alt er ✅.

### Steg 2 — Selvtest
Gå gjennom testkriteriene og resonér gjennom resultatet:
- ✅ Bestått
- ❌ Feilet — fiks og sjekk på nytt
- ⚠️ Kan ikke verifisere uten nettleser — flagg for bruker

### Steg 3 — Overlevering

```
## Fase [N] ferdig — klar for testing

**Hva ble bygget:**
[2–4 setninger]

**Slik tester du:**
[Nummerert liste med konkrete handlinger]

**Kjente begrensninger / pass på:**
[Alt flagget ⚠️]

Svar med:
- ✅ Fase [N] godkjent
- ❌ [beskriv problemet]
```

Ikke start neste fase før brukeren bekrefter.
