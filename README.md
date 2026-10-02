# ForgeMES Studio — Pharma Edition

**Local: `npm run dev` → http://localhost:5183** (login `mes` / `dec25`, instructor code `1208`).
Not yet published — repo `mes-config-studio-pharma` / Netlify `forgemes-pharma` are reserved
names (PACK_CONVENTIONS); DK's orchestrator publishes on his go.

An MES **platform-configuration** simulator for oral-solid-dose (tablet) manufacturing.
Participants play the implementation consultant: they configure a fictional MES product
for a fictional pharma plant, then deploy it against one scripted production day and
live with the consequences.

> Sibling apps of the pharma pack: `mes-functions-pharma` teaches *what the MES functions
> are*; `mes-plc-pharma` teaches the L2 contract this app connects to (same machine codes,
> nodeIds, state words and fault codes — canon-locked); `mes-label-pharma` owns printing
> and verifying labels, this app owns aggregation practice. `mes-config-studio-tobacco`
> is the golden master this was ported from.

## The engagement

**Helvion Pharma, Plant 2 Lakeworth** — two compression-coating-packaging lines
(Line 3 `PR3 → CO1 → BL3 → CR3`, Line 5 `PR5 → CO5 → BL5 → CR5` potent-segregated with its
own coater), a granulation suite (`DSP1 GRN1 FBD2 SIZ1 BLD1 CK1`) feeding an IBC fleet,
shared case packing `CP1` and palletizing `PZ1`. Five SKUs across three product families
(Cardexil 10 / 20 / 10 EXPORT, Zentrix 50 potent, Femodyl 2.5 mini-tablet), two markets,
EU FMD serialization, QP release.

Two things are fixed by the customer's reality, and both are the point of the app:

1. **Scheduling lives in an external APS.** Cadence APS (Northline Planning Systems)
   sequences the runs. The MES receives the schedule, validates whether the plant can
   actually execute it, gates release, and feeds actuals back. It never re-sequences.
2. **The shopfloor has to be connected.** Machines, OPC UA registers, scaling, sampling
   rates and signal-quality rules are configured by the trainee — and what they configure
   decides what the MES can *see*.

## The eight configuration modules

| # | Module | What it teaches |
|---|--------|-----------------|
| 1 | Plant Modeler | ISA-95 hierarchy; presses, coaters + coated-bulk holds, blisters, cartoners; the granulation suite; IBC docking rules and potent segregation |
| 2 | Products & Materials | SKUs (family / tooling / blend / potent), BOMs by consuming machine, export carton + leaflet + vignette, serial-number pools |
| 3 | Order Management | ERP (IDoc) interface mapping, inbound validation, release rules |
| 4 | APS Integration | Receive & validate a finite schedule: feasibility checks, the changeover ladder incl. the validated potent clean, release gate, actuals feedback |
| 5 | Shopfloor Connectivity | Connections, tag mapping, engineering units (TabCountK ×1,000 / WeightTmg ×10 traps), sampling, flatline & stale detection |
| 6 | Track & Trace | FMD UI print & verify at the cartoner's serialization station, carton→bundle→case→pallet aggregation, IBC genealogy, EU Hub upload |
| 7 | OEE & Downtime | State model, state-word mapping (1…6 frozen across packs), reason tree, shift calendar, short-stop threshold |
| 8 | Quality Manager | Defect catalog, inspection plans (IPC SPC / line clearance + first-off / checkweigher), containment |

Then **Deploy & Run**: one Wednesday, 06:00–14:00, six planned runs, nine 6–9 s foil-splice
micro-stops on BL3, an export vignette shortage at CR3, a punch-set change on PR5 with a
controller dropout, a frozen NIR probe on the dryer FBD2, a hardness drift on PR3, a
degrading serialization printhead, two short cases, and a validated potent clean owed from
the night shift — and a set of results that reflect the trainee's configuration, not their
intentions.

Eight result views: Run Summary · Schedule Adherence (planned-vs-actual Gantt) ·
Changeover Report · Connectivity Health (machine × signal grid, FBD2 LOD truth-vs-recorded
sparkline) · Integration Log (Cadence APS + EU Hub) · Aggregation & Genealogy ·
OEE Waterfall · Quality Results.

## Core principle

**Reality is fixed; configuration determines visibility and performance.**

The day is identical for every participant. Their configuration decides what the MES
released, what it recorded, what got held in quarantine, and what was reported. A reject
counter you didn't map doesn't stop rejects — it stops you from seeing them. That gap is
measured directly as **data fidelity**.

## Legible math (canon)

10 tablets/blister · 2 blisters/carton (20 tablets) · 10 cartons/bundle · 20 bundles/case =
**200 cartons = 4,000 tablets per case**. Press 4,000 tab/min, blister 400/min, cartoner
200/min ⇒ every machine is exactly **1 case/min**. Batch 400 kg of 250 mg tablets =
1.6 M tablets = 400 cases, so IBC kilograms read like cases. Shift 480 min. Changeover
ladder 20 / 120 / 180 / 360 min (strength-market-batch / product / tooling / potent clean).

## The guided project

Ten phases (P0 kickoff → P9 go-live), each quoting a customer requirement (HP2-REQ-2xx)
with acceptance checks that run the *real* validators and the *real* run engine. 0–3 stars
per phase, 30 total, ending in a printable, e-signed (Annex 11 / Part 11 style) Go-Live
Acceptance Report with a deployment grade.

**Step-by-step coach (on by default):** every phase carries a live checklist that ticks
itself as the trainee configures — with "Take me there" deep links to the exact module tab
and per-step "Show me" buttons that apply the reference setting and explain it. Failed
acceptance checks carry a diagnosis and an "Open →" link (e.g. *which* infeasible run
slipped through and *why*). Settings → "Coach OFF" restores the original challenge.

## Running it

```bash
npm install                     # if it hangs on this machine: npm install --local-address=<Wi-Fi IPv4>
npm run dev                     # http://localhost:5183
npm test                        # 86 vitest tests
npm run build                   # static build → dist/
node scripts/engine-smoke.mjs   # KPI dump: model answer, schedule bank, naive baseline
node scripts/phases-smoke.mjs   # model answer must read 30 / 30 stars
node scripts/debrief-smoke.mjs  # the "break one thing" debrief moves, headless
```

## Workshop flow (suggested, ~3 hours)

1. **Explore (15 min)** — Project Home brief, the User Guide's "How this studio works".
2. **Configure (P1–P8, ~2 h)** — modules unlock phase by phase; each ends with
   "Check acceptance" and stars.
3. **Go live (20 min)** — run the day, read all eight result views, sign the report.
4. **Debrief (25 min)** — instructor loads the model answer, deploys, then breaks ONE
   setting at a time and re-deploys (`node scripts/debrief-smoke.mjs` prints the same table):
   - Signal Quality → flatline off: the 30 export cases pressed from FBD2's wet sub-lot go
     to quarantine as releasable stock; € loss 22,800 → 124,800.
   - Tag Mapping → 30 s poll on BL3's state word: the nine splices vanish into
     "unaccounted speed loss" and the OEE is flagged *untrusted*.
   - Tag Mapping → PR3 weight bound to `WeightTmg` with scale 1: the IPC reads 2,500 mg;
     fidelity drops, the SPC plan watches a lie.
   - Changeover Rules → clean enforcement off: 8 Cardexil 20 mg cases carry Zentrix
     residue (caught by the first-off, held — but only because the first-off exists).
   - APS → release gate auto-accept: RUN-914 (Zentrix on Line 3) starves to zero and takes
     the Femodyl tooling change with it: 405 of 505 cases, adherence collapses.
   - Serialization → camera verify off: 240 unreadable UIs ship, two EU Hub events fail.
   - Ask "why can't I just re-sequence?" — that *is* the lesson.

## Reference results (model answer)

445/445 cases produced · 407 shipped, 38 held (30 LOD, 6 hardness, 2 short cases — every
defect caught) · schedule adherence 100% · line OEE ≈ 53% (L3 43% carries the 3-hour
tooling change; L5 63%) · FPY 98.2% · UI verify 100% · data fidelity 100% · classification
accuracy 100% · EU Hub clean (18 events) · € loss 22,800 · 30/30 stars, grade A+.

Holding 38 cases is not a failure. Releasing them would be.
