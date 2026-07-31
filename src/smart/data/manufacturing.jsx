/* ══════════════ MANUFACTURING DATA ══════════════ */
/* ------------------------------- MANUFACTURING DATA -------------------------------- */

// BOM component costs are looked up live against inventorySeed's unit costs,
// keeping "material cost per unit" honest to what Inventory shows.
// Takes live inventory rows, not the frozen seed snapshot — a BOM's cost
// must move when a component's unit cost changes in Inventory, not stay
// pinned to whatever the price was when the app first loaded.
export function bomComponentCost(sku, inventoryRows) {
  return inventoryRows.find((it) => it.sku === sku)?.unitCost || 0;
}

export const bomsSeed = [
  {
    id: "BOM-01", product: "Cold Chain Storage Unit", outputUnit: "unit",
    components: [
      { sku: "HDW-2209", qty: 1 },
      { sku: "HDW-2207", qty: 2 },
    ],
    laborCost: 340,
  },
  {
    id: "BOM-02", product: "Salon Suite Bundle", outputUnit: "bundle",
    components: [
      { sku: "HDW-2205", qty: 1 },
      { sku: "HDW-2206", qty: 1 },
    ],
    laborCost: 95,
  },
  {
    id: "BOM-03", product: "Fleet Tracking Install Kit", outputUnit: "kit",
    components: [
      { sku: "HDW-2204", qty: 1 },
    ],
    laborCost: 40,
  },
];

export const WO_STATUS_COLOR = {
  Planned: "#5B6472",
  "In Progress": "#F59E0B",
  Completed: "#16A34A",
  Cancelled: "#9CA3AF",
};

export const WO_STATUS_NEXT = { Planned: "In Progress", "In Progress": "Completed", Completed: null, Cancelled: null };

export const workOrdersSeed = [
  { id: "WO-301", bomId: "BOM-01", product: "Cold Chain Storage Unit", qty: 4, status: "In Progress", startDate: "2026-06-26", dueDate: "2026-07-06", assignedTo: "Grace Mmbaga" },
  { id: "WO-300", bomId: "BOM-02", product: "Salon Suite Bundle", qty: 6, status: "Planned", startDate: "2026-07-03", dueDate: "2026-07-10", assignedTo: "Elias Rugambwa" },
  { id: "WO-299", bomId: "BOM-03", product: "Fleet Tracking Install Kit", qty: 24, status: "Completed", startDate: "2026-06-14", dueDate: "2026-06-20", assignedTo: "David Chen" },
  { id: "WO-298", bomId: "BOM-01", product: "Cold Chain Storage Unit", qty: 2, status: "Completed", startDate: "2026-06-01", dueDate: "2026-06-08", assignedTo: "Grace Mmbaga" },
];

/* ══════════════ MANUFACTURING: MACHINES ══════════════ */
/* ------------------------------ MANUFACTURING: MACHINES ------------------------------ */
export const MACHINE_STATUS_COLOR = { Running: "#16A34A", Idle: "#5B6472", "Under Maintenance": "#F59E0B", Down: "#EF4444" };

export const machinesSeed = [
  { id: "MC-01", name: "CNC Panel Cutter #1", type: "Cutting", warehouse: "WH-DSM", status: "Running", purchaseDate: "2022-03-10" },
  { id: "MC-02", name: "Welding Station A", type: "Welding", warehouse: "WH-DSM", status: "Running", purchaseDate: "2021-08-01" },
  { id: "MC-03", name: "Powder Coat Booth", type: "Finishing", warehouse: "WH-ARU", status: "Under Maintenance", purchaseDate: "2023-01-15" },
  { id: "MC-04", name: "Assembly Line Conveyor", type: "Assembly", warehouse: "WH-DSM", status: "Idle", purchaseDate: "2020-11-20" },
];

/* ══════════════ MANUFACTURING: QUALITY CONTROL ══════════════ */
/* --------------------------- MANUFACTURING: QUALITY CONTROL --------------------------- */
export const QC_RESULT_COLOR = { Pass: "#16A34A", Rework: "#F59E0B", Fail: "#EF4444" };

export const qcInspectionsSeed = [
  { id: "QC-01", workOrderId: "WO-299", inspector: "David Chen", result: "Pass", defectsFound: 0, notes: "All units within spec.", date: "2026-06-20" },
  { id: "QC-02", workOrderId: "WO-298", inspector: "Grace Mmbaga", result: "Rework", defectsFound: 1, notes: "One unit had a loose seal — reworked before release.", date: "2026-06-08" },
];

/* ══════════════ MANUFACTURING: MAINTENANCE ══════════════ */
/* --------------------------- MANUFACTURING: MAINTENANCE --------------------------- */
export const MAINTENANCE_TYPES = ["Preventive", "Corrective"];

export const maintenanceSeed = [
  { id: "MT-01", machine: "Powder Coat Booth", type: "Corrective", technician: "S. Kileo", date: "2026-06-30", cost: 420, notes: "Replaced heating element", nextDueDate: "2026-09-30" },
  { id: "MT-02", machine: "CNC Panel Cutter #1", type: "Preventive", technician: "Grace Mmbaga", date: "2026-05-15", cost: 85, notes: "Routine blade replacement and calibration", nextDueDate: "2026-08-15" },
  { id: "MT-03", machine: "Welding Station A", type: "Preventive", technician: "S. Kileo", date: "2026-04-01", cost: 60, notes: "Gas line inspection", nextDueDate: "2026-07-01" },
];
