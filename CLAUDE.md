# ForgeMES Studio — Pharma Edition (project context for AI sessions & contributors)

MES **platform-configuration simulator** for oral-solid-dose (tablet) manufacturing, for
DK's MES Practitioner programme — pharma pack deliverable **#7**. Ported 2026-09-26 from
the tobacco golden master `..\..\..\MES Practitioner Training\Apps\mes-config-studio-tobacco`
(read-only donor) by the `mes-training-pack` skill's PORT_RECIPES #7.

- **Canon (the only source of facts):** `..\PHARMA-MES-CONTEXT.md` — Helvion Pharma,
  Plant 2 Lakeworth. Every machine code, nodeId, state word, fault code, changeover minute
  and id here comes from it (plus the "Canon additions" block the orchestrator reconciled).
- **Repo / live:** not yet published (reserved names `mes-config-studio-pharma` /
  Netlify `forgemes-pharma`). Dev port **5183**.
- Sibling apps: `..\mes-functions-pharma` (what the 11 functions ARE), `..\mes-plc-pharma`
  (the L2 contract — **canon-locked** with this app's `customer.js`), `..\mes-label-pharma`
  (owns printing/verifying marks; this app owns aggregation practice).

## Product concept (do not drift from this)

- Fictional product: **ForgeMES Studio R2026.2 — Pharma Edition** by "Helvion Industrial
  Software". Login `mes` / `dec25` (change code `1208`), instructor password `1208`.
  localStorage `mes.configStudioPharma.v1.state` / `.v1.auth`, session `mes.configStudioPharma.session`.
- Guided mode: trainee = consultant at "Helvion Digital Consulting" deploying ForgeMES for
  **Helvion Pharma, Plant 2 Lakeworth** — Line 3 `PR3→CO1→BL3→CR3`, Line 5 `PR5→CO5→BL5→CR5`
  (potent, segregated, own coater), granulation suite `DSP1 GRN1 FBD2 SIZ1 BLD1 CK1`, IBC
  fleet `IBC-0012..0034`, shared `CP1 PZ1`. SKUs `CDX-10`, `CDX-20`, `CDX-10-EXP` (Italy,
  vignette), `ZTX-50` (potent), `FEM-2.5` (T4 mini-tablet tooling). Currency €.
- 8 configuration modules + **Deploy & Run**: one scripted Wednesday (06:00–14:00).
- **Core principle: reality is fixed, configuration determines visibility and performance.**
  `src/data/realityTape.js` scripts the same day for everyone.
- Guided project: 10 phases (P0 kickoff … P9 go-live), requirement ids **HP2-REQ-201..208**,
  acceptance = the SAME validators + run engine as Deploy & Run; 0–3 stars per phase;
  printable e-signed Go-Live Acceptance Report.

## Domain rules from DK (owner) — MUST respect

- **The APS boundary is the engagement law.** The customer schedules in an external APS
  (**Cadence APS, Northline Planning Systems**). The MES *receives*, *validates
  feasibility*, *executes*, *feeds actuals back*. **It never re-sequences.**
- **Identity law (pharma):** ORDER → BATCH → **carton UI (FMD DataMatrix) printed & verified
  ONLY at the cartoner's serialization station** (engine class `cartoner`, constant
  `PHYSICS.uiPrintMachineClass`) → bundle (×10) → case (×20 bundles = 200 cartons) →
  pallet SSCC (48 cases); no batch is sellable without QP certification. Enforced in
  `engine/execution.js` (`deriveTraceability` → `identityFindings`) and `engine/validate.js`;
  asserted in tests. Honest FMD note: aggregation is NOT mandated — taught as Helvion's
  best practice.
- **Canon-lock with `mes-plc-pharma/src/data/world.ts`:** machine codes, endpoints
  `opc.tcp://<code>-plc.hp2.local:4840`, nodeIds `ns=2;s=PR3.Prod.TabCount` grammar, state
  words 1=Running 2=Starved 3=Blocked 4=Fault 5=Changeover 6=Idle, fault codes 3104 / 5203 /
  2205 / 4408, traps `TabCountK` (unitScale 1000) and `WeightTmg` (unitScale 0.1). Run
  `python ..\_shared\canon_lock.py` after any change to `customer.js`.
- Terminology stays consistent with the pack (`src/data/glossary.js` is this app's
  single source: IBC, final blend, LOD, IPC, coated-bulk hold, line clearance, validated
  potent clean, FMD UI, vignette/bollino, EU Hub, QP release, eBR, Annex 11).

## Stack & commands

React 18 + Vite (SWC) + Tailwind 3, plain JSX (no TS), HashRouter, lucide-react, dnd-kit,
hand-rolled SVG/CSS charts, vitest.

```bash
npm run dev     # port 5183
npm test        # vitest — 86 tests (donor's 81 + 5 pharma: WeightTmg trap, 1 case/min, FBD2 catch, stale catch, family ladder)
npm run build   # static build → dist/
node scripts/engine-smoke.mjs    # headless engine dump (KPIs, schedule bank, naive baseline)
node scripts/phases-smoke.mjs    # headless guided-project check (model answer = 30/30)
node scripts/debrief-smoke.mjs   # the instructor's break-one-thing table
```

**This machine's quirk:** plain `npm install` hangs (IPv6). `node_modules` was robocopied
from the tobacco donor (identical dependency set); otherwise `npm install --local-address=<Wi-Fi IPv4>`.

**Theme seam:** `tailwind.config.js` remaps `violet` → `colors.teal` (MES = teal in the pack
palette) and the `plant{}` dark ramp is an indigo-black family. Every component keeps the
donor's `violet-*` classes. Do not "fix" this by rewriting classes.

## Architecture

```
src/engine/   pure logic — the only place rules live (donor engine; see "Engine edits" below)
  StudioContext.jsx / reducer.js / actions.js / defaults.js / plantOps.js / selectors.js
  validate.js        per-module validators (consequence sentences re-authored for pharma;
                     MAX_FAST_POLL_MS = 3000 — a 6–9 s splice needs two samples)
  orderBank.js       ERP feed + interfaceMap + decisions → released orders
  scheduleCheck.js   APS feed + 5 feasibility checks + release gate → schedule bank
  execution.js       the line walk, coated-bulk hold absorption, IBC ledger (per-SKU kg),
                     changeover physics, serialization & aggregation, the CONNECTIVITY
                     RECORDING LAYER, quality detection/containment, OEE, integration log, KPIs
  persistence.js     mes.configStudioPharma.v1.state
src/data/     customer.js (brief, LINE_TEMPLATES incl. `upstream`, SILO_TEMPLATES = IBCs,
              SIGNAL_DICTIONARY incl. 6 upstream classes, DEVICE_CATALOG, FAULT_CODES,
              STATE_WORD_VALUES, materials, partners, UI_RANGE_SPEC = serial pools),
              erpFeed.js (11 orders + 3 poisoned IDocs + CORRECT_ERP_MAP),
              apsFeed.js (14 schedule msgs, 5 poisoned runs, CORRECT_APS_MAP),
              realityTape.js (incidents/breaks/SIGNAL_FAULTS/defects/PHYSICS + caseKg()),
              presets.js (buildModelAnswerConfig + standardBomLines — THE reference solution),
              glossary.js
src/project/  phases.js (10 phases, HP2-REQ-2xx briefs, acceptance fns), scoring.js,
              coach.js (per-phase step scripts, done() predicates, "Show me" fixes, p4MissedRunsHelp)
src/modules/  registry.js + 8 module folders (labels re-authored; TABS ids unchanged)
src/run/      DeployRun.jsx + results/ (8 views; text re-authored)
src/screens/  ProjectHome, StudioModule, ValidationCenter, Guide (pharma), Glossary, ExportImport, Settings
```

RULE: modules import only from engine/, components/, data/, project/, own folder.

### Engine machine classes ↔ pharma machines (keys are internal, labels are pharma)

| engine class | pharma | notes |
|---|---|---|
| `maker` | tablet press PR3/PR5 | rated `ratedTabletsMin` 4000; IPC signals `tabletWeightMg`, `hardnessN`; rejects `rejForce/rejMetal/rejCapping` |
| `reservoir` (buffer) | pan coater + coated-bulk hold CO1/CO5 | `bufferMin` 120 — coated tablets wait in drums; press and blister are decoupled |
| `packer` | blister machine BL3/BL5 | rated `ratedBlistersMin` 400 (divisor `PHYSICS.blistersPerCase`); `rejFill/rejSeal`; the micro-stop machine (5203) |
| `cartoner` | cartoner + serialization station CR3/CR5 | rated `ratedCartonsMin` 200; **UI print site**; bundle scan (aggregation level key `carton` = bundle ×10) |
| `casePacker` / `palletizer` | CP1 / PZ1 | case ×20 bundles, pallet 48 cases |
| `dispensary/granulator/dryer/mill/blender/kitchen` | DSP1 GRN1 FBD2 SIZ1 BLD1 CK1 (area class `upstream`) | connectable, own signal dictionaries; **FBD2 carries the frozen NIR probe** |
| `silo` node | IBC | `blendCode`, `startLevelKg`, `feedsLineCodes` = docking rules |

Engine variable names `packs*` mean **cartons** (the UI unit, 200/case); `potent*` keys
replace the donor's menthol keys; `purgeEnforcement` is the validated potent clean.

### Engine edits made in the port (each one place; everything else is the donor engine)

1. `execution.js` `caseRateOf`: packer divisor `PHYSICS.blistersPerCase` (400) — blisters ≠ cartons.
2. `execution.js` + `scheduleCheck.js`: IBC kg per case = `caseKg(sku)` = 4,000 × tablet
   weight (FEM-2.5 at 80 mg = 0.32 kg/case) instead of one global `kgPerCase`.
3. `scheduleCheck.js` `believed/actualChangeoverMin`: rung 1 vs 2 keyed on `sku.family`
   (API) with `blendCode` fallback — a strength change (CDX-10 → CDX-20) is the 20-min line
   clearance, a family change is the 120-min product change.
4. `execution.js` frozen probe: resolved by `SIGNAL_FAULTS[].machineCode` (FBD2) with
   `affectsWindow` (when the wet sub-lot is pressed on Line 3), `traceWindow/baseline/breathe`
   for the sparkline; falls back to the line's press when absent.
5. `execution.js` identity law constant `PHYSICS.uiPrintMachineClass = 'cartoner'` (also in `validate.js`).
6. `execution.js` cartoner incidents attributed on the packer timeline (reason + incidentId)
   so the vignette shortage at CR3 classifies correctly; the press shows "hold absorbing".
7. `execution.js` genealogy machine lookup includes `reservoir` (coating suspension lot at the coater).
8. `execution.js` constants: `tabletsPerCarton` (20), `casesPerPallet` (48), € economics from
   `PHYSICS.euro`, integration system id `EU-HUB` (message types SERIAL-UPLOAD / AGGREGATION / SHIPPING),
   GS1 mod-10 `sscc18()` for the exemplar SSCC, exemplar blend lot from the feeding IBC's name.
9. `validate.js`: poll threshold `MAX_FAST_POLL_MS = 3000`; `type: 'blend'/'carton'/'vignette'`
   material checks; `upstream` area check replaces the filter-making check.

## The coach layer (guidance is never a separate truth)

Unchanged mechanics from the donor: `src/project/coach.js` step scripts (ids `p1-silos` …
`p8-crosscheck`, tabs frozen by `coach.test.js`), done() reuses validators/banks (never
executeRun), fix() returns `{explain, ops}` through CONFIG_SET, `p4MissedRunsHelp`
diagnoses the missed poisoned run (potentCleanMin = 0 → RUN-912 / printout 360; END_TS
unmapped; gate auto-accept). P4 acceptance labels are frozen byte-for-byte by
`coach.test.js` — re-author labels and expectations TOGETHER. `ui.coachEnabled` /
`ui.coachShowMe` read with `!== false`; never bump SCHEMA_VERSION for this.

## The two-layer rule (do not blur it)

Truth first, then recorded through `config.connectivity`: unmapped → "—"; wrong-but-real
nodeId → the other register's truth; wrong scale → truth × (scale / unitScale)
(TabCountK ×1,000, WeightTmg ×10); pollMs too slow → a stop is seen only if duration ≥ 2 × poll
(6–9 s splices vanish at ≥ 5 s); flatline off → FBD2's frozen probe missed → 30 wet cases
go to quarantine as releasable; staleTimeoutSec 0 → PR5's dropout recorded as "running".
Trainee KPIs read RECORDED; shipping/holds/compliance read TRUTH; `kpis.oeeTrusted` flags
an OEE that cannot be reported.

## Physics & calibration (tuned 2026-09-26 — change with care)

- Unit hierarchy: 10 tablets/blister · 2 blisters/carton · 10 cartons/bundle · 20 bundles/case
  = 200 cartons = 4,000 tablets/case; press 4,000 tab/min = blister 400/min = cartoner
  200/min = **1 case/min** (asserted by a test). Batch 400 kg = 1.6 M tablets = 400 cases.
- Shift 06:00–14:00 (480 min), breaks 08:30 ×15 and 11:00 ×30. Changeover physics
  **20 / 120 / 180 / 360** (line clearance / product change / tooling change / validated
  potent clean). Coated-bulk hold 120 min (acceptance ≥ 60).
- Wednesday: L3 CDX-10 90 → CDX-10-EXP 40 → EXP rush 30 → FEM-2.5 40 (3-h tooling change,
  planned 13:05, slips 12–13 min, within the 20-min tolerance); L5 CDX-20 150 → ZTX-50 95.
  Planned = produced = **445**.
- Model answer: 445/445 produced, **407 shipped + 38 held** (LOD 30, hardness 6, short cases 2),
  adherence 100%, line OEE ≈ **53%** (L3 42.5 / L5 63.4), FPY 98.2%, UI verify 100%, data
  fidelity 100%, classification 100%, EU Hub 18 events / 0 failed, € loss **22,800**,
  **30/30 stars, A+**.
- Naive/factory defaults: 405 of 505 planned (RUN-914 starves to zero, FEM never starts),
  adherence 0.57, 46 defective cases shipped, data fidelity 0, 555 unclassified minutes.
- Thresholds in `phases.js` assume these numbers (`PLANNED_DAY_CASES` 445, OEE ≥ 50%,
  detected stops ≥ 8). Tune QUANTITIES (erpFeed/apsFeed/tape windows), not PHYSICS, and
  re-run the smoke scripts + vitest after any reality-tape edit.

## Verification workflow (after non-trivial changes)

1. `npx vitest run` — 86 tests (schema/plantOps, validators, schedule-check incl. the
   family ladder, execution differentials incl. FBD2/stale/WeightTmg, project acceptance,
   coach structure/round-trip/label-freeze).
2. `node scripts/engine-smoke.mjs` → `node scripts/phases-smoke.mjs` (30/30) → `npm run build`.
3. `python ..\_shared\canon_lock.py` (banned tobacco vocabulary + required canon tokens).
4. Browser smoke (orchestrator): instructor → load model answer → Deploy & Run → 8 views;
   then `node scripts/debrief-smoke.mjs` moves in the UI.

## Known state / notes (as of 2026-09-26)

- Headless gates all green; **browser smoke not yet done** (DK's orchestrator runs it).
- The granulation suite is connected (16 machines total) but the run engine walks only the
  two lines — upstream machines contribute signal rows (fidelity) and the FBD2 villain.
- PR5's 18-min punch change is fully absorbed by the 120-min hold (no line-OEE effect by
  design — coated tablets are in drums); its lesson is the 4-min controller dropout /
  stale-data rule.
- Splice micro-stops are 0.10–0.15 min: OEE `shortStop` ≈ 1.1 min/day — the sampling
  lesson (invisible at 30 s) matters more than the minutes.
- `allMachinesInFlow` includes IBC nodes, so track-point / inspection-plan pickers list
  IBCs too (deliberate, as in the donor).
- Model answer adds decorative `CONN-SER-CR3/CR5` camera connections (read-only chips).
- Proposed canon additions made here: serial pools `SNP-DOM-01` / `SNP-EXP-01` (first serials
  `4T7K9DQ2CX000001` / `7HQ2ZM4KIT000001`), GTIN-14s `00359123000306` (CDX-10-EXP),
  `00359123000405` (ZTX-50), `00359123000504` (FEM-2.5) (mod-10 computed), tooling codes
  `T11` / `T4`, blend families `BLND-CDX10/CDX20/ZTX50/FEM25`, orders `PO-77231..77241` +
  poisoned `PO-77291..93` / `PO-78899`, runs `RUN-301..305/390/501/502/909..914`, partner ids
  `APS-CADENCE` / `EU-HUB` / `SER-L4`, upstream nodeIds (`FBD2.NIR.LodPct`, `DSP1.Scale.NetKg`,
  `GRN1.Impeller.Kw`, `SIZ1.Mill.Rpm`, `BLD1.Rev.Count`, `CK1.PotLife.Min`), `CO1.Hold.Pct`,
  `CR3.Rej.UiVerify` / `CR3.Rej.Leaflet` / `*.Fault.Code`, case checkweigher
  `modbus.tcp://cw-cp1.hp2.local:502/40001`, € economics 600 / 4,000 / 2 / 1,000.
