import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookMarked, ChevronDown, ChevronRight, Lightbulb, Rocket, GraduationCap,
  FileJson, CircleHelp, Compass,
} from 'lucide-react';
import { useStudio } from '../engine/StudioContext.jsx';

function Section({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-violet-400" />}
        <span className="flex-1 text-sm font-bold text-white">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
      </button>
      {open && <div className="border-t border-slate-800 px-5 py-4">{children}</div>}
    </div>
  );
}

function Phase({ id, title, req, goal, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-700/70 bg-plant-900/60">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className="mono w-7 shrink-0 text-xs text-slate-600">P{id}</span>
        <span className="flex-1 text-sm font-semibold text-slate-200">{title}</span>
        {req && <span className="chip bg-plant-800 text-slate-500">{req}</span>}
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-600" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
      </button>
      {open && (
        <div className="border-t border-slate-800 px-4 py-3">
          {goal && <p className="mb-3 text-xs italic text-slate-400">Goal: {goal}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

const Steps = ({ items }) => (
  <ol className="space-y-2">
    {items.map((s, i) => (
      <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-slate-300">
        <span className="mono mt-0.5 h-4 w-4 shrink-0 rounded-full bg-violet-600/20 text-center text-[10px] font-bold leading-4 text-violet-300">{i + 1}</span>
        <span>{s}</span>
      </li>
    ))}
  </ol>
);

const Hint = ({ children }) => (
  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2">
    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
    <p className="text-[11px] leading-relaxed text-amber-200/80">{children}</p>
  </div>
);

const B = ({ children }) => <span className="font-semibold text-slate-100">{children}</span>;
const M = ({ children }) => <span className="mono text-violet-300">{children}</span>;

export default function Guide() {
  const state = useStudio();
  const instructor = state.ui.instructorMode;

  return (
    <div className="max-w-3xl space-y-3">
      <div className="panel flex items-center gap-4 p-5">
        <BookMarked className="h-6 w-6 shrink-0 text-violet-400" />
        <div>
          <h1 className="text-lg font-bold text-white">Consultant's guide</h1>
          <p className="text-xs text-slate-500">
            How to deploy ForgeMES at Plant 2 Lakeworth — phase by phase, with the traps marked.
          </p>
        </div>
      </div>

      <Section icon={Compass} title="How this studio works" defaultOpen>
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <p>
            <B>Reality is fixed. Configuration decides what you see.</B> One scripted Wednesday
            (06:00–14:00) will run at Plant 2 Lakeworth — the same day for everyone: the same
            foil-splice micro-stops on BL3, the same punch change on PR5, the same frozen NIR probe on
            the dryer FBD2, the same vignette shortage at CR3. Your configuration decides what gets
            released, what the MES records, what gets held in quarantine, and what the customer reads
            in the morning meeting.
          </p>
          <p>
            <B>Two layers, never confused:</B> what physically happened (truth) and what your MES
            captured (recorded). A reject counter you didn't map doesn't stop rejects — it stops you
            from seeing them. That gap has its own KPI here: <M>data fidelity</M>.
          </p>
          <p>
            <B>One law of this engagement:</B> scheduling lives in Cadence APS, the customer's finite
            scheduler. ForgeMES receives the sequenced schedule, validates feasibility, executes, and
            reports actuals back. It never re-orders runs. If a run is impossible, the MES's job is to say
            so <i>before</i> 06:00, not to improvise at 09:00.
          </p>
          <p>
            <B>Legible math:</B> 10 tablets per blister · 2 blisters per carton · 10 cartons per bundle ·
            20 bundles per case = 200 cartons = 4,000 tablets per case. Press 4,000 tab/min, blister
            400/min, cartoner 200/min — every machine is exactly one case per minute. A 400 kg batch
            of 250 mg tablets is 1.6 million tablets = 400 cases, so IBC kilograms read like cases.
          </p>
          <p>
            Work the phases on the <Link to="/project" className="text-violet-400">Project</Link> page in order.
            Each phase quotes the customer requirement (HP2-REQ-2xx), and its acceptance uses the same
            validators and the same run engine as <Link to="/run" className="text-violet-400">Deploy &amp; Run</Link> — there
            is no separate examiner.
          </p>
        </div>
      </Section>

      <Section icon={Rocket} title="The ten phases — steps & hints">
        <div className="space-y-2">
          <Phase id={0} title="Kickoff" req="ENGAGEMENT" goal="Understand the engagement, accept it.">
            <Steps items={[
              'Read the brief on the Project page. Note what is FIXED: Cadence APS owns sequencing; EU FMD owns carton identity; the QP owns release.',
              'Accept the engagement to unlock the Plant Modeler.',
            ]} />
          </Phase>

          <Phase id={1} title="Model the plant" req="HP2-REQ-201" goal="An ISA-95 model the schedule can land on.">
            <Steps items={[
              'In Plant Modeler, use the template buttons: Line 3, Line 5 (potent, segregated), Granulation Suite, Finishing, and the four IBCs.',
              'Check every machine carries a rated speed and every coater\'s coated-bulk hold has its minutes of decoupling (≥ 60).',
              'On the Blend Supply tab, confirm the docking rules: IBC-0012/0032 → L3, IBC-0033 → L3 or L5, the Zentrix IBC-0034 → L5 only.',
            ]} />
            <Hint>
              The coated-bulk hold is not decoration. Coated tablets wait in drums, so a blister
              micro-stop never reaches the press — model the hold with 0 minutes and the MES believes
              every splice stops the whole line, and the OEE waterfall lies in the direction that
              makes the press look broken.
            </Hint>
          </Phase>

          <Phase id={2} title="Products & materials" req="HP2-REQ-202" goal="Five SKUs, full BOMs, serial pools per market.">
            <Steps items={[
              'Import the SKUs and final blends from the customer brief, then the material catalog.',
              'Generate a standard BOM per SKU and check the consuming machines (blend at the press, suspension at the coater, film/foil at the blister, cartons/leaflets/seals at the cartoner…).',
              'Request the serial-number pools from the L4 provider and ASSIGN them: domestic SKUs to the DOM pool, the export SKU to the EXP pool.',
            ]} />
            <Hint>
              The export trap lives here. Cardexil 10 mg EXPORT needs the Italian carton (AIC field),
              the Italian leaflet, the lot-tracked reimbursement vignette AND an EXP serial pool. Miss
              any of them and Wednesday's rush call-off (RUN-390) is either blocked — or produced illegally.
            </Hint>
          </Phase>

          <Phase id={3} title="Orders & ERP interface" req="HP2-REQ-203" goal="A clean order bank from a dirty feed.">
            <Steps items={[
              'Map the SAP IDoc fields to the seven MES fields. WERKS (always 2000) and VKORG map to nothing — distractors exist in real interfaces too.',
              'Enable all four inbound checks, then work the inbox: accept the clean, reject the poisoned.',
              'Set a release rule that covers the week (horizon ≥ 11 orders).',
            ]} />
            <Hint>
              One poisoned IDoc carries its quantity in TABLETS (MEINS = ST, SAP "pieces"). 1.6 million
              "cases" is 4,000 shifts of production — that is what the UoM check is for.
            </Hint>
          </Phase>

          <Phase id={4} title="APS integration" req="HP2-REQ-204" goal="Receive the schedule, catch the five impossible runs, feed actuals back.">
            <Steps items={[
              'Map the Cadence fields (SCEN_ID, PLANNER, HORIZON_ID are distractors).',
              'Enable all five feasibility checks and set the changeover rules from the Cadence master data: 20 / 120 / 180 / 360 minutes.',
              'Set the release gate to "block on error" — findings that are ignored are just decoration.',
              'Enable the validated potent-product clean (it runs in the night window with swab + QA release) and actuals feedback to Cadence.',
              'Validate the schedule: five runs should go red. Read WHY for each.',
            ]} />
            <Hint>
              RUN-914 looks harmless — 60 cases of Zentrix 50 mg, Wednesday 10:30. But it's a potent
              product on Line 3: no potent IBC may dock on PR3 and the line isn't segregated. Accept it
              and it starves to zero AND wrecks the whole afternoon behind it — the 3-hour tooling change
              to Femodyl never gets its slot.
            </Hint>
          </Phase>

          <Phase id={5} title="Shopfloor connectivity" req="HP2-REQ-205" goal="Every machine connected, every signal mapped, honestly scaled, sampled fast enough.">
            <Steps items={[
              'Connect every machine — both lines, the finishing area and the six machines of the granulation suite (the endpoints come from the plant device catalog).',
              'Map each machine\'s full signal worksheet. Watch the registers: TabCount vs TabCountK (×1,000), WeightMg vs WeightTmg (tenths of a mg — read as mg it is ×10).',
              'Keep counters and state words at ~1 s polling. A stop shorter than 2× the poll period is invisible — the foil splices are 6–9 s long.',
              'Turn on flatline detection (~15 min window) and a stale-data timeout (~15 s).',
            ]} />
            <Hint>
              The NIR moisture probe on FBD2 freezes at 2.1 % LOD early in the shift while the real
              granulate drifts to 2.7 % (window 1.5–2.5). Only the flatline rule catches it — the lab's
              LOD-oven result arrives hours later, after the wet sub-lot has docked on PR3. "A live
              process signal always breathes."
            </Hint>
          </Phase>

          <Phase id={6} title="Track & trace" req="HP2-REQ-206" goal="Every carton a legal object: UI at the serialization station, full pyramid, clean EU Hub upload.">
            <Steps items={[
              'Track points: batch start at each press, coater and blister; batch complete (carton UI level) at each cartoner.',
              'Serialization: UI print at the CARTONER\'s serialization station, camera verify ON, void-on-fail ON.',
              'Aggregation: bundle (×10) at the cartoner outfeed, case (×20 bundles) at the case packer, pallet SSCC (48 cases) at the palletizer.',
              'Genealogy: capture the IBC blend lot at the press; select the lot-tracked materials for capture.',
              'Enable EU Hub upload through the L4 EPCIS gateway with buffer-and-retry.',
            ]} />
            <Hint>
              A UI belongs to a CARTON. Configure printing at the blister machine and you haven't moved a
              setting — you've broken the FMD identity model. The engine treats it as an identity
              violation, not a preference. And remember the honest note: FMD does not mandate
              aggregation — Helvion builds it for the warehouse and DSCSA-readiness.
            </Hint>
          </Phase>

          <Phase id={7} title="OEE & downtime" req="HP2-REQ-207" goal="Every minute classified from the machines' own state words.">
            <Steps items={[
              'Seed the 6-state model, then map raw words 1–6 for every machine class (copy to all classes).',
              'Build the reason tree (equipment / material / minor / organizational).',
              'Set the short-stop threshold (~3 min) and seed the two breaks (08:30 tea, 11:00 lunch).',
            ]} />
            <Hint>
              No calendar? Lunch becomes 30 unexplained minutes. No word map? The Pareto is one grey
              bar called "Unclassified" — and the packaging OEE journey from 45.0 to 63.5 has no
              number to start from.
            </Hint>
          </Phase>

          <Phase id={8} title="Quality & containment" req="HP2-REQ-208" goal="Catch what the machines can't, hold what matters.">
            <Steps items={[
              'SPC plans on both presses\' IPC auto-testers — tablet weight AND hardness.',
              'Line clearance + first-off inspection after every changeover on both presses.',
              'Checkweigher plan at the case packer.',
              'Containment: severity ≥ 3 holds cases and blocks serial pools; severity ≥ 2 holds cases.',
            ]} />
            <Hint>
              The hardness drift on the Cardexil 10 mg batch stays INSIDE the press's force auto-reject
              band — only SPC on the mapped IPC hardness signal sees it. And a plan reading an unmapped
              tag inspects nothing: quality here depends on Phase 5.
            </Hint>
          </Phase>

          <Phase id={9} title="Go-live" req="CUT-OVER" goal="Run the day, present, sign.">
            <Steps items={[
              'Run the go-live day from the Project page.',
              'Read every result view — the customer will ask about the held cases and the EU Hub log.',
              'Sign the acceptance protocol (Annex 11 / Part 11 e-signature) and print the report.',
            ]} />
          </Phase>
        </div>
      </Section>

      <Section icon={CircleHelp} title="The day itself — what actually happens (no spoilers removed)">
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <p>Six runs are planned: Cardexil 10 mg → Cardexil 10 mg EXPORT → the EXPORT rush call-off → Femodyl 2.5 mg mini-tablets (a 3-hour tooling change) on Line 3; Cardexil 20 mg → Zentrix 50 mg (potent) on Line 5.</p>
          <ul className="list-inside list-disc space-y-1 text-slate-400">
            <li>Nine foil-splice micro-stops on BL3 (6–9 seconds each, fault 5203) — invisible at 30-second polling.</li>
            <li>An export vignette (bollino) shortage at CR3 during the rush call-off (12 min).</li>
            <li>A punch overload (3104) and emergency punch-set change on PR5 (18 min) — during which its controller drops offline for 4 minutes.</li>
            <li>The frozen NIR probe on FBD2 early in the shift — the wet sub-lot reaches PR3 for the export rush batch.</li>
            <li>A hardness drift on the Cardexil 10 mg batch, a printhead (2205) degrading on export cartons, two 19-bundle cases.</li>
            <li>Line 5 ran Zentrix 50 mg last night — somebody has to own the validated clean.</li>
          </ul>
          <p>None of this is configurable. What the MES saw, held and reported — that's yours.</p>
        </div>
      </Section>

      <Section icon={FileJson} title="Saving, exporting, resetting">
        <div className="space-y-2 text-xs leading-relaxed text-slate-300">
          <p>Everything autosaves to this browser. Use <Link to="/exchange" className="text-violet-400">Export / Import</Link> to move a configuration between machines or hand it to the instructor.</p>
          <p>Settings lets you switch guided ↔ sandbox mode (sandbox unlocks all modules, empty config) and reset the workspace.</p>
        </div>
      </Section>

      {instructor && (
        <Section icon={GraduationCap} title="Instructor notes">
          <div className="space-y-2 text-xs leading-relaxed text-slate-300">
            <p><B>Model answer:</B> Settings → "Load the model-answer configuration". It scores 30/30 stars, grade A+: 445/445 cases produced, 407 shipped + 38 held (30 wet-sub-lot cases, 6 hardness, 2 short cases — all caught), adherence 100%, line OEE ≈ 53% (L3 43% carries the 3-hour tooling change, L5 63%), FPY ≈ 98.2%, UI verify 100%, data fidelity 100%, EU Hub clean, € loss 22,800 (the held cases).</p>
            <p><B>Debrief moves:</B> load the model answer, deploy, then break ONE thing and re-deploy: disable flatline detection (the 30 wet export cases go to quarantine as releasable), set a 30 s poll on BL3's state word (the nine splices vanish into "unaccounted speed loss"), unmap BL3's reject counters (FPY lies by omission), map PR3's weight to WeightTmg with scale 1 (the IPC reads 2,500 mg), disable the potent clean (8 cross-contaminated Cardexil 20 mg cases — the €1.28 M Monday), switch the gate to auto-accept (RUN-914 lands on Line 3, starves to zero and the Femodyl tooling change never gets its slot).</p>
            <p><B>The APS boundary:</B> when participants ask "why can't I just re-sequence?" — that IS the lesson. The MES's leverage is feasibility-before-release and honest actuals, not improvising the plan.</p>
            <p><B>The batch/discrete boundary:</B> the granulation suite is connected (FBD2's probe is the villain) but the run engine walks the lines; the coated-bulk hold is where ISA-88 hands over to line-speed OEE. Use the Aggregation &amp; Genealogy view to walk a recall from carton UI back to the IBC blend lot.</p>
          </div>
        </Section>
      )}
    </div>
  );
}
