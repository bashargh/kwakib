# Refactor Plan (LKG Parity-First)

Goal: refactor from `main/` while preserving exact behavior/visuals at each step, with quick visual checks between steps.

Validation rhythm:
- After every step: open Earth Seasons + Analemma pages and confirm checklist items for that step.
- Do not proceed if parity fails; revert or fix before moving on.

## Step 1: Add hook layer without moving logic
Target module: `earthViewer.js` (still monolithic)
- Add hook registries: `onUpdate`, `onResize`, `onPointSet`.
- Call hooks from existing functions: `updateCelestial()`, `onResize()`, `setPoint()`.
- Keep all existing logic in-place; no DOM or JSON changes.

## Step 2: Extract seasons inset rendering only
New module: `seasonsInset.js`
Targets to move out of LKG (`main/earthViewer.js`):
- `updateSeasonsInset(sun)`
- `hideSeasonsInset()`
- Any helper it uses (formatting, canvas sizing) that are purely local.
Integration:
- `earthViewer.js` calls `seasonsInset.update(...)` inside the existing tour flow.
- DOM ids remain unchanged (`#seasonsInsetBox`, `#seasonsInset`).

## Step 3: Extract latitude-band overlay
New module: `seasonsOverlay.js`
Targets:
- `drawTourLatitudeBand(sun)` and its helpers.
Integration:
- Keep same overlay group and geometry rules.
- Ensure no change to draw order or group clearing.

## Step 4: Extract tour state machine (no UI changes)
New module: `earthTours.js`
Targets:
- `tourDefs` data
- Tour state (`tourState`, `tourRotation`)
- `startTour`, `exitTour`, `applyTourStep`, `goToTourStep`, `advanceTourStep`
- UI update functions: `updateTourStepCard`, `setTourAlert`, `updateTourAvailability`
Integration:
- `earthViewer.js` exports hooks and minimal API used by the tour module.
- Keep DOM ids and structure identical (`#tourSection`, `#tourCard`, buttons).

## Step 5: Extract analemma path + tooltip
New module: `earthAnalemmaPath.js`
Targets:
- `buildAnalemmaPath(...)`
- `renderAnalemmaPath(date)`
- Analemma pick points and tooltip handlers.
Integration:
- Keep the same overlay group; avoid clearing it inside core on every update.
- Preserve tooltip behavior and hit-testing from LKG.

## Step 6: Extract analemma charts (exact LKG rendering)
New module: `earthAnalemmaCharts.js`
Targets:
- `renderObliquityMiniCharts(...)`
- `renderObliquityDiagram(...)`
- `updateAnalemmaPanels(...)`
- `updateAnalemmaReadouts(...)`
Integration:
- Preserve sizing logic and chart geometry from LKG.
- Keep all related DOM ids unchanged.

## Step 7: Extract analemma panel controller
New module: `earthAnalemmaUI.js`
Targets:
- `initAnalemmaBreakdown()`
- Card collapse toggles
- Tab switching logic (and inset enable/disable)
Integration:
- Must keep exact show/hide behavior of `#analemmaInsetBox`.
- Ensure combined tab renders inset and charts exactly as LKG.

## Step 8: Split core viewer only after parity
Target module: `earthViewer.js`
- Move non‑page specific Earth rendering into `earthViewerCore.js`.
- Keep a thin wrapper that preserves public API used by tours/analemma.
- No HTML changes yet.

## Step 9: Swap HTML entrypoints
Targets: `earth-seasons*.html`, `earth-analemma*.html`, `index.html`
- Replace script entrypoints to new modules only after parity checks pass.
- Do not rename `#earthCopy` or change JSON keys until this step is stable.

## Step 10: Language string migration (optional, last)
Targets: `earthCopy` -> `pageStrings`
- Only after visuals/behavior match.
- Validate Arabic rendering on all pages.
