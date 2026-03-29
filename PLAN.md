# Hageplan v1 — Implementation Plan

## Context

Personal garden planning web app. Users load their property on a live satellite map and draw georeferenced zone shapes. Built with React + Vite + TypeScript + shadcn/ui + Mapbox GL JS.

Deployed to GitHub Pages via GitHub Actions. Settings stored in localStorage (Mapbox token, coordinates, gnr/bnr).

## Architecture

- **Dual-map technique**: Satellite base map + Kartverket color topo overlay with `mix-blend-mode: multiply` (white background becomes transparent, colored lines/details darken the satellite)
- **Drawing**: mapbox-gl-draw for Polygon/Rectangle/Circle + custom GeoJSON source for Text labels
- **State**: Tool state and undo/redo managed in App.tsx, passed to MapView and FloatingToolbar

## Phase Status

- [x] Phase 1 — Foundation and layout skeleton
- [x] Phase 2 — Drawing tools and undo/redo
- [x] Phase 3 — Text tool and selection behaviour
- [ ] Phase 4 — Properties panel
- [ ] Phase 5 — Persistence and export
- [ ] Phase 6 — View menu and map controls
- [ ] Phase 7 — Polish and accessibility

## Kartverket Overlay — Planned Enhancements

- **Toggle on/off**: Wire the View menu "Kartverket overlay" checkbox to show/hide the overlay
- **Opacity slider**: Add a slider (in View menu or settings) to adjust overlay translucency (0–100%)
- Target: Phase 6 (View menu wiring)

## Shape Editing — Planned Enhancements

- **Rotation**: Add rotation handles when a shape is selected (rotate around centroid)
- **Scaling**: Add scale handles (corner/edge drag to resize) when a shape is selected
- **Circle edit handles**: Show only 4 cardinal handles (N/S/E/W) instead of all 64 polygon vertices
- Target: Phase 7 (Polish) or post-v1

## Pen/Line Tool — Planned

- **Pen tool**: Freeform line drawing tool (open paths, not closed shapes)
- Could be used for paths, borders, annotations
- Target: post-v1

---

## Phase 1 — Foundation and Layout Skeleton (COMPLETE)

**Goal:** Running app in browser with correct layout, map rendering, and Kartverket integration. No interactive functionality yet.

**What was built:**
- Vite + React + TypeScript scaffold with shadcn/ui
- TopBar with File/Edit/View/Help menus (items disabled)
- MapView with satellite imagery + Kartverket WMTS overlay (multiply blend)
- User plot highlight from Kartverket WFS (amber outline)
- FloatingToolbar with 5 tool buttons (Select/Polygon/Rectangle/Circle/Text)
- PropertiesPanel placeholder (hidden)
- SettingsDialog for Mapbox token, coordinates, gnr/bnr
- GPS geolocation (only when no custom coords set)
- GitHub Actions deploy workflow

---

## Phase 2 — Drawing Tools and Undo/Redo

**Goal:** Can draw Polygon, Rectangle, Circle. Shapes georeferenced and styled. Undo/redo works.

**Tasks:**
- mapbox-gl-draw initialized with custom styles (per-feature color via `user_fillColor` etc.)
- Polygon tool (P) — click points, double-click to close, Escape cancels
- Rectangle tool (R) — custom draw mode (mapbox-gl-draw-rectangle-mode), Escape cancels
- Circle tool (C) — custom draw mode (stored as 64-point polygon), Escape cancels
- On shape completion: assigned zone defaults (Lawn defaults hardcoded for now)
- Tool switching via toolbar buttons and keyboard shortcuts (V/P/R/C/T)
- Undo/redo system: history array (50 max), push snapshot on draw events, Cmd+Z/Cmd+Shift+Z
- Undo/redo buttons in top bar become active/greyed based on history state
- Edit → Undo/Redo menu items work and reflect state
- Select tool (V): click to select, click empty to deselect, Escape deselects

**Test:**
- Draw all three shape types
- Pan and zoom — shapes stay locked to map
- Undo several steps — shapes disappear in reverse order
- Redo restores them
- Switch tools mid-draw with Escape — no partial shapes
- Undo/redo buttons grey out correctly at boundaries

---

## Phase 3 — Text Tool and Selection Behaviour

**Goal:** Text labels work. Full selection, deletion, duplication, right-click menu.

**Tasks:**
- Text tool (T): click map → DOM input, Enter/blur confirms, stored as GeoJSON Point, rendered as Mapbox symbol layer
- Double-click text label → inline edit reopens
- Select tool: click text label → selected state
- Delete/Backspace deletes selected element(s)
- Shift+click for multi-selection
- Right-click context menu: Delete, Duplicate
- Duplicate: offset 20px diagonally in screen space
- Escape deselects all / cancels draw
- Text add/edit/delete pushes to undo history

---

## Phase 4 — Properties Panel

**Goal:** Full properties panel. Zone colors apply on draw. Live editing of selected elements.

**Tasks:**
- Panel slides in when drawing tool active or element selected
- Zone category dropdown (Lawn, Planting bed, Path/hardscape, Vegetable garden, Water feature, Other)
- react-colorful HexColorPicker for fill/stroke color
- Sliders for fill opacity and stroke width
- Text tool panel: font size, color, alignment
- `currentDefaults` updated on field change
- Shapes on completion receive current defaults
- When element selected → panel shows its values, live-editable
- Multi-select: shared values shown, differing values show placeholder

---

## Phase 5 — Persistence and Export

**Goal:** Work survives page reload. JSON and PNG export work.

**Tasks:**
- Auto-save to localStorage (debounced 500ms)
- Auto-load on map load event
- Export JSON: File → Export JSON triggers download
- Export PNG: File → Export PNG captures map canvas

---

## Phase 6 — View Menu and Map Controls

**Goal:** View menu fully functional. Kartverket overlay toggle and opacity.

**Tasks:**
- Map style switching (Satellite/Street/Terrain)
- Kartverket overlay toggle (on/off)
- Kartverket overlay opacity slider
- Zoom In/Out from menu
- Reset to property view

---

## Phase 7 — Polish and Accessibility

**Goal:** Final polish, keyboard accessibility, edge cases.

**Tasks:**
- Keyboard shortcuts help dialog
- Consistent focus management
- Edge case handling (empty states, error recovery)
- Performance optimization if needed
