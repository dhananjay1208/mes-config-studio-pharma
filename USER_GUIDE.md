# ForgeMES Studio — Pharma Edition · Step-by-Step User Guide

*You are an MES implementation consultant. The platform is installed. Your job is to configure it — and prove it on a live production day.*

---

## 1. What this app is

ForgeMES Studio simulates what MES consultants actually do on platforms like DELMIA Apriso, Siemens Opcenter or Sepasoft: **configuration, not coding**. You will build the plant model, load master data, wire the ERP order feed, integrate the customer's APS scheduler, connect the shopfloor machines, and switch on track & trace, OEE and quality — for a fictional tablet manufacturer, **Helvion Pharma**, at **Plant 2 Lakeworth**.

The key idea: **the production day is fixed; only your configuration changes the outcome.** The same schedule arrives from Cadence APS, the same foil splices stop BL3 nine times, the same punch set breaks on PR5 at 11:40, the same NIR probe on the dryer FBD2 freezes. Whether the day ends with a clean 445 cases and a signed acceptance report — or with a wet sub-lot in quarantine marked "releasable", unverified cartons in the market and an OEE nobody can defend — is entirely down to how you configure the platform.

Two things about this customer shape everything:

- **Scheduling is not yours.** Helvion schedules in Cadence APS, an external finite scheduler. Your MES receives the sequenced runs, validates whether the plant can execute them, gates release, and reports actuals back. It never re-orders runs. Your leverage is *feasibility before release* and *honest actuals after*.
- **The shopfloor must be connected.** Nothing in this MES knows anything a mapped tag didn't tell it.

## 2. Getting started

| | |
|---|---|
| Start the app | `npm run dev` → open **http://localhost:5183** (or the hosted URL your instructor shares) |
| Login | username `mes` · password `dec25` |
| Your name | Settings → Consultant profile → *Your name* (appears on exports and the go-live report) |
| Mode | Guided project (phases unlock in order) or Sandbox (everything open, empty config) |
| Instructor code | `1208` in Settings unlocks all modules, instructor notes and the model answer |
| Start over | **"Start fresh"** on Project Home (under the stars) or Settings → Reset workspace — wipes configuration and progress after a confirmation |

Everything autosaves to your browser. Use **Export / Import** to move your configuration between machines or hand it in.

### The coach (on by default)

In guided mode a **Coach** panel follows you into every module and onto Project Home. It lists the steps of
the current phase in order and **ticks them off live** as your configuration changes — the ticks are computed
by the same engine that grades acceptance, so a green step is genuinely done.

- **Take me there →** opens the exact module *and tab* where a step happens.
- **Show me** applies the reference setting for that step and explains in one line what it set and why.
  Use it whenever you are stuck — the goal is to *experience* MES configuration, not to be tested on it.
- When every step is green, the coach points you to **Project Home → Check acceptance**.
- If an acceptance check fails anyway, the failed line carries a hint naming the cause and an
  **Open →** link to the fix location (e.g. *"RUN-912 slipped through: your changeover model says a
  potent-product clean takes 0 min — Cadence's printout says 360"*).

Prefer the original figure-it-out-yourself challenge? **Settings → Step-by-step coach → Coach OFF.**

## 3. The plant you are configuring

```
GRANULATION SUITE (batch — connected, walked as the IBC feed)
  DSP1 dispensary → GRN1 granulator → FBD2 fluid-bed dryer (NIR probe!) → SIZ1 mill → BLD1 blender   (+ CK1 coating kitchen)
                                                  │
BLEND SUPPLY (IBC fleet — the constraint feed)     ▼
  IBC-0012 BLND-1834 Cardexil 10 mg ──┐
  IBC-0032 BLND-1841 Femodyl 2.5 mg  ─┴──▶ Line 3
  IBC-0033 BLND-1838 Cardexil 20 mg  ────▶ Line 3 or Line 5
  IBC-0034 BLND-1839 Zentrix 50 mg   ────▶ Line 5 ONLY (potent, dedicated tote)

LINES (what the run engine walks)
  Line 3:  PR3 press ──▶ CO1 coater + coated-bulk hold (120 min) ──▶ BL3 blister ──▶ CR3 cartoner / serialization ─┐
  Line 5:  PR5 press ──▶ CO5 coater + coated-bulk hold (120 min) ──▶ BL5 blister ──▶ CR5 cartoner / serialization ─┤  (potent, segregated)
                                                                                                                   ▼
                                                        FINISHING: CP1 case packer ──▶ PZ1 palletizer ──▶ quarantine until QP release
```

Arithmetic that keeps everything legible: **10 tablets per blister · 2 blisters per carton · 10 cartons per bundle · 20 bundles per case = 200 cartons = 4,000 tablets per case.** Press 4,000 tab/min, blister 400/min and cartoner 200/min are therefore all exactly one case per minute; a 400 kg batch of 250 mg tablets is 1.6 million tablets = 400 cases, so IBC kilograms read like cases.

## 4. The ten phases

### P0 — Kickoff
Read the brief on **Project Home** and accept the engagement. Note what is fixed by contract: Cadence APS owns the sequence, EU FMD owns carton identity, the QP owns release.

### P1 — Model the plant *(Plant Modeler · HP2-REQ-201)*
Use the template buttons: **Line 3**, **Line 5 (potent, segregated)**, **Granulation Suite**, **Finishing**, **the four IBCs**. Then check on the **Blend Supply** tab that each IBC names its blend lot, its released quantity, and the lines it may dock on.

> The coated-bulk hold is not decoration. Coated tablets wait in drums; a blister micro-stop never reaches the press and a press stop never starves the blister — until the hold runs dry. Model it at 0 and the MES couples press and blister like one machine.

### P2 — Products & materials *(HP2-REQ-202)*
Import the SKUs and blends from the customer brief, import the material catalog, generate a BOM per SKU, then request serial-number pools from the L4 serialization provider and **assign** them per market.

> The export trap: Cardexil 10 mg EXPORT needs the Italian carton, the Italian leaflet, the lot-tracked reimbursement vignette **and** an EXP serial pool. Miss any one and Wednesday's rush call-off is either blocked at the gate or produced illegally.

### P3 — Orders & ERP interface *(HP2-REQ-203)*
Map the SAP IDoc fields (WERKS and VKORG map to nothing — real interfaces carry distractors), enable all four inbound checks, work the inbox, and set a release rule covering the week.

> One poisoned IDoc sends its quantity in tablets (`MEINS = ST`, SAP "pieces"). 1.6 million "cases" is 4,000 shifts of production. That is what the unit-of-measure check is for.

### P4 — APS integration *(HP2-REQ-204)*
Map the Cadence message, enable all five feasibility checks, enter the changeover rules from the Cadence master-data printout (**20 / 120 / 180 / 360** minutes), set the release gate to **block on error**, switch on the validated potent-product clean and the actuals feedback. Then validate the schedule — five runs should go red.

| Poisoned run | Why it is impossible |
|---|---|
| RUN-914 | Zentrix 50 mg pulled onto Line 3 mid-Wednesday — no potent IBC may dock on PR3, line not segregated |
| RUN-909 | Same problem on Thursday |
| RUN-910 | 240 cases of Cardexil 20 mg — the CDX-20 IBC's 200 kg of released blend goes negative |
| RUN-911 | References an order ERP never sent (PO-78899) |
| RUN-912 | Cardexil 20 mg 30 minutes after a Zentrix run; the validated clean needs 360 |

### P5 — Shopfloor connectivity *(HP2-REQ-205)*
Connect every machine — both lines, the finishing area and the six machines of the granulation suite — then map each machine's full signal worksheet against its controller address space. Watch the registers — `TabCount` vs `TabCountK` (1 raw = 1,000 tablets), `WeightMg` vs `WeightTmg` (tenths of a milligram: 2,500 = 250.0 mg). Keep counters and state words around 1-second polling. Turn on flatline detection (15 min) and a stale-data timeout (15 s).

> A stop shorter than roughly two polling periods is invisible — and the foil splices are 6–9 seconds long. And a live process signal always breathes: a value frozen to the decimal for a quarter of an hour is a dead sensor, not a stable process.

### P6 — Track & trace *(HP2-REQ-206)*
Track points at press, coater, blister (batch start) and cartoner (batch complete, carton UI level). UI print at the **cartoner's serialization station** (nowhere else), camera verify on, void-on-fail on. Build the aggregation pyramid — bundle ×10 at the cartoner outfeed, case ×20 bundles at the case packer, pallet SSCC (48 cases) at the palletizer. Capture the IBC blend lot at the press and select the lot-tracked materials. Enable EU Hub upload with buffer-and-retry.

> A UI belongs to a carton. Configuring it at the blister machine is not a preference — it breaks the FMD identity model, and the engine records it as an identity violation. FMD does not mandate aggregation; Helvion builds it for the warehouse and DSCSA-readiness (best practice, flagged as such).

### P7 — OEE & downtime *(HP2-REQ-207)*
Seed the six-state model, map raw state words 1–6 for every machine class, build the reason tree, set the short-stop threshold (~3 min) and seed the two breaks.

> No break calendar means lunch is booked as a 30-minute breakdown. No word map means the Pareto is one grey bar called "Unclassified".

### P8 — Quality & containment *(HP2-REQ-208)*
SPC on both presses' IPC auto-testers (weight **and** hardness), line clearance + first-off after every changeover, checkweigher at the case packer. Containment: severity ≥ 3 holds cases and blocks serial pools; severity ≥ 2 holds cases.

> A plan that reads an unmapped tag inspects nothing. Quality here depends on the work you did in Phase 5.

### P9 — Go-live
Run the day from Project Home, read every result view, sign the acceptance protocol, print the report.

## 5. Reading the results

| View | The question it answers |
|---|---|
| **Run Summary** | What did the plant produce, hold and cost today? |
| **Schedule Adherence** | Did we execute Cadence's plan — and did we tell them the truth about it? |
| **Changeover Report** | What did changeovers actually cost versus what our model believed? |
| **Connectivity Health** | Which signals recorded reality, and which recorded a comfortable fiction? |
| **Integration Log** | What did we send to Cadence APS and to the EU Hub — and what got rejected? |
| **Aggregation & Genealogy** | Could we walk a recall from pallet to IBC blend lot? |
| **OEE Waterfall** | Where did the shift go — and can this OEE number be reported at all? |
| **Quality Results** | What did we catch, what did we hold, and what left quarantine as releasable? |

## 6. The day itself

Six runs are planned: Cardexil 10 mg → Cardexil 10 mg EXPORT → the EXPORT rush call-off → Femodyl 2.5 mg mini-tablets (3-hour tooling change) on Line 3; Cardexil 20 mg → Zentrix 50 mg on Line 5.

- Nine foil-splice micro-stops on BL3 (6–9 seconds each, fault 5203)
- An export vignette shortage at CR3 during the rush call-off (12 minutes)
- A punch overload (3104) and emergency punch-set change on PR5 (18 minutes), during which its controller drops offline for four
- The NIR probe on FBD2 freezing at 2.1 % LOD while the real granulate drifts to 2.7 % — the wet sub-lot docks on PR3 for the export rush batch
- A hardness drift on the Cardexil 10 mg batch, a degrading serialization printhead (2205) on export cartons, two 19-bundle cases
- Line 5 ran Zentrix 50 mg last night — somebody has to own the validated clean

None of this is configurable. What the MES saw, held and reported is.

## 7. What "good" looks like

445 of 445 cases produced · 407 shipped with 38 held (every defect caught) · schedule adherence 100% · line OEE ≈ 53% (L3 43% carries the 3-hour tooling change, L5 63%) · first pass yield 98.2% · UI verify 100% · data fidelity 100% · EU Hub clean · 30/30 stars, grade A+.

Holding 38 cases is not a failure. Releasing them would be.
