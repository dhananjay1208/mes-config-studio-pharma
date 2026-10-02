// The plantConfig schema made concrete. This object IS the trainee's artifact:
// every configuration module edits a slice of it, validation reads it, the
// schedule-check/execution engines run against it, and export/import round-trips it.
import { SCHEMA_VERSION } from './persistence.js';

// ---------------------------------------------------------------------------
// Empty configuration — what a consultant sees on a freshly-installed platform.
// Guided mode starts here; every value below is either structural scaffolding
// (enterprise/site can't be deleted) or a platform factory default.
// ---------------------------------------------------------------------------
export function emptyConfig() {
  return {
    plantModel: {
      // Flat node list; the tree and the production flow are DERIVED.
      // Types: enterprise | site | area | line | machine | buffer | silo.
      // area.props.areaClass: upstream | primaryFeed | secondary | finishing
      // line.props.potentCapable: bool (Line 5 potent segregation)
      // machine.props.machineClass: maker (tablet press) | packer (blister) |
      //   cartoner (cartoner + serialization) | casePacker | palletizer |
      //   dispensary | granulator | dryer | mill | blender | kitchen (upstream)
      //   + rated speed (maker: ratedTabletsMin, packer: ratedBlistersMin,
      //     cartoner: ratedCartonsMin, casePacker/palletizer: ratedCasesMin)
      // buffer (coater + coated-bulk hold, INSIDE the line): props.bufferMin —
      //   minutes of packaging demand it can absorb before a stop propagates.
      // silo (primaryFeed area) = an IBC: props { blendCode, capacityKg,
      //   startLevelKg, feedsLineCodes: [] } — the blend supply as a constraint feed.
      nodes: [
        { id: 'ENT', type: 'enterprise', parentId: null, name: 'Helvion Pharma', code: 'HP', seq: 0, props: {} },
        { id: 'SITE-HP2', type: 'site', parentId: 'ENT', name: 'Plant 2 Lakeworth', code: '2000', seq: 0, props: {} },
      ],
    },

    materials: {
      skus: [],       // { code, name, family, format: T11|T4, blendCode, potent, market: DOM|EXP,
                      //   gtin, tabletsPerCarton, cartonsPerCase, targetTabletWeightMg, targetHardnessN }
      blends: [],     // { code, name, family, potent } — mirror of what the granulation suite can supply
      items: [],      // { id, code, desc, type: blend|coatingSusp|film|foil|carton|leaflet|tamper|
                      //   vignette|bundleFilm|label|caseBlank, uom, lotTracked, market: null|DOM|EXP }
      boms: [],       // { id, skuCode, lines: [{ materialId, qtyPerCase, consumedAtMachineClass, usageRule }] }
                      //   usageRule: '' | 'market:DOM' | 'market:EXP' | 'potent'
      uiRanges: [],   // { id, market, issuerId, rangeStart, size, assignedSkus: [] } — serial-number pools
                      //   Export SKUs without an assigned EXP pool cannot be legally serialized.
    },

    orders: {
      interfaceMap: [],   // { erpField, mesField } — trainee maps the inbound ERP message
      validationChecks: { skuValid: false, uomIsCases: false, bomExists: false, uiRangeAssigned: false },
      releaseRule: { mode: 'manual', horizonOrders: 8 },
      decisions: {},      // { [msgId]: 'accepted' | 'rejected' } — inbox actions
      manualReleased: [], // orderNos released by hand (manual mode)
    },

    apsIntegration: {
      // The customer schedules in Cadence APS (external). MES receives the
      // sequenced runs, VALIDATES feasibility, gates release, and feeds
      // actuals back. It never re-sequences — that is the engagement law.
      interfaceMap: [],   // { apsField, mesField } → runId, orderNo, lineCode, seq,
                          //   plannedStart, plannedEnd, qtyCases
      feasibilityChecks: {
        orderReleased: false,     // run must reference a released ERP order
        blendAvailable: false,    // released IBC quantity covers the run's blend demand
        siloRouting: false,       // an IBC with the run's blend may dock on the target line (potent segregation)
        changeoverRules: false,   // transition time (incl. the potent clean) fits the plan gaps
        materialReadiness: false, // cartons/vignette/serial pool exist for the SKU + market
      },
      changeoverModel: {          // the trainee's BELIEF, used by feasibility + planned timeline;
                                  // the run itself uses the tape's physics (truth)
        sameBlendSameFormatMin: 0,
        blendChangeMin: 0,
        formatChangeMin: 0,
        potentCleanMin: 0,
      },
      purgeEnforcement: { enabled: false },  // on → MES dispatches the validated potent clean into
                                             // the night window; off → cross-contamination defects
      releaseGate: { mode: 'autoAccept' },   // 'autoAccept' | 'blockOnError'
      decisions: {},              // { [schedMsgId]: 'accepted' | 'rejected' }
      actualsFeedback: {
        enabled: false,
        fields: [],               // subset of ['actualStart','actualEnd','goodCases','adherenceFlag']
        onDelayMin: 0,            // resend shifted completion when slip exceeds this
      },
    },

    connectivity: {
      connections: [],  // { id, machineId, kind: opcua|serial|camera|scanner, endpoint, enabled }
      tagMap: [],       // { id, machineId, signal, nodeId, scale, uom, pollMs }
                        //   signal = canonical key from SIGNAL_DICTIONARY (per machineClass)
                        //   nodeId must exist in the machine's DEVICE_CATALOG address space;
                        //   a wrong-but-real node records the WRONG truth (deterministically).
      signalRules: {
        staleTimeoutSec: 0,                        // 0 = no stale detection
        flatline: { enabled: false, windowMin: 0 }, // frozen-probe detection on analog signals
      },
    },

    traceability: {
      trackPoints: [],  // { id, machineId, event: runStart|runComplete, idLevel: order|run|ui }
      serialization: {
        uiPrintMachineClass: null,  // MUST be 'cartoner' — a UI belongs to a CARTON (engine law)
        cameraVerify: false,        // 100% print & verify (DataMatrix read-back)
        voidOnFail: false,          // failed cartons voided & rejected vs shipped unverified
      },
      aggregation: {
        levels: [],   // { level: carton (= bundle ×10) | case (×20 bundles) | pallet, scanMachineClass, childCount }
      },
      genealogy: {
        blendLotCapture: false,     // capture the IBC blend lot at the press (the batch→discrete handoff)
        materialLotCapture: [],     // materialIds whose reel/lot is scanned at consumption
      },
      repository: { enabled: false, partnerId: null, bufferAndRetry: false }, // EU Hub (FMD) upload
    },

    oee: {
      stateModel: [],   // { id, name, category: production|plannedStop|unplannedStop|shortStop|notScheduled }
      stateWordMap: {},  // { [machineClass]: { [rawWord]: stateModelId } } — raw words come from
                         //   the mapped stateWord tag; an unmapped word lands in 'unclassified'
      reasonTree: [],    // { id, label, category, children: [...] }
      shortStopThresholdMin: 0,
      calendar: {
        shiftStart: '06:00',
        shiftEnd: '14:00',
        breaks: [],      // { id, start, minutes, classifiedAs }  ← classification is the trap
        plannedMaint: [], // { id, start, minutes }
      },
    },

    quality: {
      // Defect catalog ships pre-seeded (platforms come with a starter catalog);
      // trainees extend it. Severity 3 = safety/regulatory.
      defectCatalog: [
        { code: 'WGT-OOS', desc: 'Tablet weight out of spec (250 mg ± 5 %)', area: 'maker', severity: 2 },
        { code: 'CAPPING', desc: 'Capping / lamination', area: 'maker', severity: 1 },
        { code: 'METAL', desc: 'Metal detected (Fe 1.5 mm test piece)', area: 'maker', severity: 3 },
        { code: 'HARD-DEV', desc: 'Hardness out of range (80–140 N)', area: 'maker', severity: 2 },
        { code: 'LOD-OOS', desc: 'Blend LOD outside 1.5–2.5 % window', area: 'maker', severity: 2 },
        { code: 'SEAL-DMG', desc: 'Blister seal / foil-splice damage', area: 'packer', severity: 1 },
        { code: 'UI-FAIL', desc: 'UI print / verify failure (2205)', area: 'cartoner', severity: 3 },
        { code: 'LEAFLET', desc: 'Leaflet missing (4408)', area: 'cartoner', severity: 3 },
        { code: 'XCONT-POT', desc: 'Potent cross-contamination (Zentrix residue)', area: 'maker', severity: 3 },
        { code: 'CASE-SHORT', desc: 'Case incomplete (short weight)', area: 'casePacker', severity: 2 },
      ],
      inspectionPlans: [],  // { id, machineId, source: inlineGauge|camera|checkweigher|patrol|firstOff,
                            //   n, checks: [{ characteristic, spec, reaction: record|andon|hold }] }
                            //   Gauge/camera/checkweigher plans only SEE data if the corresponding
                            //   tag is mapped in Shopfloor Connectivity (the cross-module trap).
      containment: [],      // { id, minSeverity, action: holdCases|blockUiRange|quarantineLot }
    },
  };
}

// ---------------------------------------------------------------------------
// Root workspace state
// ---------------------------------------------------------------------------
export function createInitialState(mode = 'guided') {
  const now = Date.now();
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      configId: `CFG-${now.toString(36).toUpperCase()}`,
      configName: 'Plant 2 Lakeworth Deployment',
      traineeName: '',
      mode, // 'guided' | 'sandbox'
      createdAt: now,
      updatedAt: now,
    },
    config: emptyConfig(),
    project: {
      currentPhase: 0,
      phases: {},   // { [phaseId]: { status: 'pending'|'passed', stars, checkedAt } }
      signoffs: [], // { phaseId, initials, at }
    },
    lastRun: null,  // { runId, seqNo, configUpdatedAt, results } — only the latest is kept
    ui: {
      instructorMode: false,
      // Coach flags default ON. Saved states from before the coach existed lack
      // them, so every read site must use `!== false` (never truthiness).
      coachEnabled: true,
      coachShowMe: true,
    },
  };
}
