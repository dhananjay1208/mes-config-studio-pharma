// The inbound ERP process-order feed for the week — IDoc-style messages
// from corporate SAP (S/4HANA). Deterministic and hand-tuned for teaching:
//  - 11 legitimate orders (Wednesday is the deploy day; Thu/Fri pad the week),
//  - 3 poisoned messages that order validation should catch,
//  - the Italian-wholesaler rush call-off for Cardexil 10 mg EXPORT arrives
//    LAST in the feed but is due Wednesday.
// ERP field names are deliberately SAP-flavored: the interface-mapping
// exercise in Order Management translates them to MES fields.

// MES canonical fields (what a correct interfaceMap must produce):
//   orderNo, skuCode, qtyCases, uom, dueDate, priority, market
export const ERP_FIELDS = [
  { field: 'AUFNR', desc: 'Process order number' },
  { field: 'MATNR', desc: 'Material (SKU) code' },
  { field: 'MENGE', desc: 'Order quantity' },
  { field: 'MEINS', desc: 'Unit of measure (CS = cases; ST = pieces/tablets)' },
  { field: 'LGDAT', desc: 'Requested date (day code)' },
  { field: 'PRIO_CD', desc: 'Priority code' },
  { field: 'MARKT', desc: 'Market (DOM / EXP)' },
  { field: 'WERKS', desc: 'Plant (constant 2000)' },        // distractor
  { field: 'VKORG', desc: 'Sales organization' },           // distractor
];

export const MES_FIELDS = [
  { field: 'orderNo', desc: 'MES order number' },
  { field: 'skuCode', desc: 'Finished SKU' },
  { field: 'qtyCases', desc: 'Quantity (cases)' },
  { field: 'uom', desc: 'Unit of measure' },
  { field: 'dueDate', desc: 'Due day' },
  { field: 'priority', desc: 'Priority' },
  { field: 'market', desc: 'Destination market' },
];

export const CORRECT_ERP_MAP = [
  { erpField: 'AUFNR', mesField: 'orderNo' },
  { erpField: 'MATNR', mesField: 'skuCode' },
  { erpField: 'MENGE', mesField: 'qtyCases' },
  { erpField: 'MEINS', mesField: 'uom' },
  { erpField: 'LGDAT', mesField: 'dueDate' },
  { erpField: 'PRIO_CD', mesField: 'priority' },
  { erpField: 'MARKT', mesField: 'market' },
];

function rawMessage(i, sku, qty, uom, due, prio, market) {
  return {
    msgId: `IDOC-${9000 + i}`,
    raw: {
      AUFNR: `PO-${77230 + i}`,
      MATNR: sku,
      MENGE: qty,
      MEINS: uom,
      LGDAT: due,
      PRIO_CD: prio,
      MARKT: market,
      WERKS: '2000',
      VKORG: 'HP01',
    },
  };
}

function buildFeed() {
  const msgs = [
    rawMessage(1, 'CDX-10', 90, 'CS', 'WED', 'STD', 'DOM'),
    rawMessage(2, 'CDX-10-EXP', 40, 'CS', 'WED', 'STD', 'EXP'),
    rawMessage(3, 'FEM-2.5', 40, 'CS', 'WED', 'STD', 'DOM'),
    rawMessage(4, 'CDX-20', 150, 'CS', 'WED', 'STD', 'DOM'),
    rawMessage(5, 'ZTX-50', 95, 'CS', 'WED', 'STD', 'DOM'),
    rawMessage(7, 'CDX-10', 160, 'CS', 'THU', 'STD', 'DOM'),
    rawMessage(8, 'CDX-20', 120, 'CS', 'THU', 'STD', 'DOM'),
    rawMessage(9, 'ZTX-50', 100, 'CS', 'THU', 'STD', 'DOM'),
    rawMessage(10, 'CDX-20', 140, 'CS', 'FRI', 'STD', 'DOM'),
    rawMessage(11, 'CDX-10-EXP', 60, 'CS', 'FRI', 'STD', 'EXP'),
  ];

  // Poisoned messages — order validation should reject these.
  // CDX-40 is a strength Helvion never registered — a planner's typo.
  msgs.splice(3, 0, rawMessage(61, 'CDX-40', 80, 'CS', 'WED', 'STD', 'DOM'));
  // Quantity transmitted in TABLETS (MEINS = ST, SAP "pieces") — 1.6 million
  // "cases" would be 4,000 shifts of production. The UoM check exists for a reason.
  msgs.splice(7, 0, rawMessage(62, 'CDX-20', 1600000, 'ST', 'THU', 'STD', 'DOM'));
  // Missing material code entirely.
  msgs.splice(10, 0, rawMessage(63, '', 90, 'CS', 'THU', 'STD', 'DOM'));

  // The Italian wholesaler's rush call-off lands LAST in the feed, due tomorrow morning.
  msgs.push(rawMessage(6, 'CDX-10-EXP', 30, 'CS', 'WED', 'RUSH', 'EXP'));

  return msgs;
}

export const ORDER_FEED = buildFeed();

/** Apply the trainee's interface map to a raw ERP message → MES order object. */
export function parseOrder(msg, interfaceMap) {
  const parsed = {};
  for (const row of interfaceMap) {
    if (!row.erpField || !row.mesField) continue;
    let v = msg.raw[row.erpField];
    if (row.mesField === 'qtyCases') v = Number(v);
    parsed[row.mesField] = v;
  }
  return parsed;
}

/** Run the configured validation checks against a parsed order. Returns list of failure strings. */
export function checkOrder(parsed, config) {
  const failures = [];
  const checks = config.orders.validationChecks;
  const skus = config.materials.skus;

  if (checks.skuValid) {
    if (!parsed.skuCode) {
      failures.push('No SKU code on the order');
    } else if (!skus.some((s) => s.code === parsed.skuCode)) {
      failures.push(`Unknown SKU "${parsed.skuCode}"`);
    }
  }
  if (checks.uomIsCases && parsed.uom !== undefined && parsed.uom !== 'CS') {
    failures.push(`Unit of measure "${parsed.uom}" is not cases — quantity ${parsed.qtyCases ?? '—'} would be nonsense`);
  }
  if (checks.bomExists && parsed.skuCode) {
    const bom = config.materials.boms.find((b) => b.skuCode === parsed.skuCode);
    if (!bom || bom.lines.length === 0) failures.push(`No BOM for SKU ${parsed.skuCode}`);
  }
  if (checks.uiRangeAssigned && parsed.skuCode) {
    const sku = skus.find((s) => s.code === parsed.skuCode);
    if (sku) {
      const range = config.materials.uiRanges.find(
        (r) => r.market === sku.market && (r.assignedSkus || []).includes(sku.code)
      );
      if (!range) failures.push(`No ${sku.market} serial-number pool assigned to ${sku.code} — its cartons cannot be serialized`);
    }
  }
  return failures;
}
