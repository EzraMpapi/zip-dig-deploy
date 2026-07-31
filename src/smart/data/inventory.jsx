import { TODAY, generateBarcode } from "../lib/format.jsx";

/* ══════════════ INVENTORY DATA ══════════════ */
/* ------------------------------ INVENTORY DATA ------------------------------ */
export const WAREHOUSES = [
  { id: "WH-DSM", name: "Dar es Salaam — Main", city: "Dar es Salaam" },
  { id: "WH-ARU", name: "Arusha — Regional", city: "Arusha" },
  { id: "WH-MWZ", name: "Mwanza — Regional", city: "Mwanza" },
];

export const STOCK_STATUS_COLOR = {
  "In Stock": "#16A34A",
  "Low Stock": "#F59E0B",
  "Out of Stock": "#EF4444",
};

export function stockStatus(qty, reorder) {
  if (qty <= 0) return "Out of Stock";
  if (qty <= reorder) return "Low Stock";
  return "In Stock";
}

// Only items with a real shelf life get an expiry date — a water heater or
// a GPS unit doesn't expire, so most items honestly have none. Cement is
// the one genuine case in this catalogue (it hardens past its shelf life).
export const EXPIRY_WARNING_DAYS = 30;

export function expiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const days = Math.round((new Date(expiryDate) - TODAY) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expired";
  if (days <= EXPIRY_WARNING_DAYS) return "Expiring Soon";
  return "Fresh";
}

export const EXPIRY_STATUS_COLOR = { Expired: "#EF4444", "Expiring Soon": "#F59E0B", Fresh: "#16A34A" };

export const inventorySeed = [
  { sku: "HDW-2201", name: "Industrial water heater 50L", category: "Hardware & Fixtures", warehouse: "WH-DSM", qty: 34, reorder: 15, unitCost: 312, unit: "unit", expiryDate: null },
  { sku: "HDW-2202", name: "Steel reinforcement bar 12mm (ton)", category: "Construction Materials", warehouse: "WH-DSM", qty: 6, reorder: 10, unitCost: 1490, unit: "ton", expiryDate: null },
  { sku: "HDW-2203", name: "Cement 50kg bag", category: "Construction Materials", warehouse: "WH-ARU", qty: 820, reorder: 200, unitCost: 15.2, unit: "bag", expiryDate: "2026-07-20" },
  { sku: "HDW-2204", name: "Fleet GPS tracking unit", category: "Electronics", warehouse: "WH-DSM", qty: 0, reorder: 20, unitCost: 118, unit: "unit", expiryDate: null },
  { sku: "HDW-2205", name: "Salon styling chair", category: "Furniture", warehouse: "WH-MWZ", qty: 18, reorder: 8, unitCost: 165, unit: "unit", expiryDate: null },
  { sku: "HDW-2206", name: "Backwash basin", category: "Furniture", warehouse: "WH-MWZ", qty: 5, reorder: 6, unitCost: 280, unit: "unit", expiryDate: null },
  { sku: "HDW-2207", name: "Warehouse shelving unit", category: "Storage Equipment", warehouse: "WH-DSM", qty: 62, reorder: 25, unitCost: 78, unit: "unit", expiryDate: null },
  { sku: "HDW-2208", name: "Hydraulic vehicle lift", category: "Workshop Equipment", warehouse: "WH-ARU", qty: 3, reorder: 4, unitCost: 1520, unit: "unit", expiryDate: null },
  { sku: "HDW-2209", name: "Cold storage racking system", category: "Storage Equipment", warehouse: "WH-DSM", qty: 11, reorder: 5, unitCost: 2580, unit: "unit", expiryDate: null },
  { sku: "HDW-2210", name: "Pharmacy display unit", category: "Furniture", warehouse: "WH-MWZ", qty: 27, reorder: 10, unitCost: 640, unit: "unit", expiryDate: null },
].map((it) => ({ ...it, barcode: generateBarcode(it.sku) }));


export const stockMovements = {
  "HDW-2201": [
    { date: "2026-06-24", type: "Out", qty: 12, ref: "QT-1042 reserved", by: "J. Batenga" },
    { date: "2026-06-10", type: "In", qty: 40, ref: "PO-3312 received", by: "Warehouse" },
  ],
  "HDW-2204": [
    { date: "2026-06-29", type: "Out", qty: 24, ref: "SO-2117 fulfilled", by: "S. Kileo" },
    { date: "2026-06-18", type: "In", qty: 24, ref: "PO-3298 received", by: "Warehouse" },
  ],
  "HDW-2202": [
    { date: "2026-06-22", type: "Out", qty: 4, ref: "QT-1041 reserved", by: "M. Fundi" },
    { date: "2026-06-05", type: "In", qty: 10, ref: "PO-3280 received", by: "Warehouse" },
  ],
};

/* ══════════════ INVENTORY: TRANSFERS ══════════════ */
/* ----------------------------- INVENTORY: TRANSFERS ---------------------------- */
export const TRANSFER_STATUS_COLOR = { Pending: "#F59E0B", "In Transit": "#F59E0B", Completed: "#16A34A" };

export const TRANSFER_STATUS_NEXT = { Pending: "In Transit", "In Transit": "Completed", Completed: null };

// A transfer moves a SKU's entire current stock to a new warehouse — this
// build tracks one location per SKU (see the handover doc), so splitting
// stock across two warehouses simultaneously isn't modeled yet. Requiring
// the full quantity keeps this feature honestly correct rather than
// silently misrepresenting a partial split it can't actually track.
export const transfersSeed = [
  { id: "TRF-01", sku: "HDW-2208", itemName: "Hydraulic vehicle lift", qty: 3, fromWarehouse: "WH-ARU", toWarehouse: "WH-DSM", status: "Completed", date: "2026-06-20", notes: "Consolidating workshop equipment at HQ" },
  { id: "TRF-02", sku: "HDW-2206", itemName: "Backwash basin", qty: 5, fromWarehouse: "WH-MWZ", toWarehouse: "WH-DSM", status: "In Transit", date: "2026-07-01", notes: "Reallocating for Baraka Hotels order" },
];

/* ══════════════ INVENTORY: BATCHES ══════════════ */
/* ------------------------------ INVENTORY: BATCHES ------------------------------ */

// A supplementary traceability ledger, not the authoritative stock count —
// the aggregate qty on the item itself (used by POS, Sales, Manufacturing)
// doesn't derive from these rows. This records which batch/lot a delivery
// belonged to and when it expires, for recall and shelf-life purposes,
// layered on top of the existing stock model rather than replacing it.
export const batchesSeed = [
  { id: "BATCH-01", sku: "HDW-2203", itemName: "Cement 50kg bag", batchNumber: "CEM-2026-06-A", qty: 400, expiryDate: "2026-07-20", warehouse: "WH-ARU", supplier: "Tanzania Portland Cement Co.", receivedDate: "2026-06-01" },
  { id: "BATCH-02", sku: "HDW-2203", itemName: "Cement 50kg bag", batchNumber: "CEM-2026-06-B", qty: 420, expiryDate: "2026-08-05", warehouse: "WH-ARU", supplier: "Tanzania Portland Cement Co.", receivedDate: "2026-06-18" },
];

/* ══════════════ INVENTORY: SUPPLIERS ══════════════ */
/* ----------------------------- INVENTORY: SUPPLIERS ----------------------------- */
export const SUPPLIER_STATUS_COLOR = { Active: "#16A34A", Inactive: "#9CA3AF" };

export const suppliersSeed = [
  { id: "SUP-01", name: "Tanzania Portland Cement Co.", contactPerson: "Rashid Mbwana", email: "sales@tpcc.co.tz", phone: "+255 22 286 1000", category: "Construction Materials", leadTimeDays: 5, status: "Active" },
  { id: "SUP-02", name: "Coastal Steel & Hardware Ltd", contactPerson: "Anna Kimaro", email: "orders@coastalsteel.co.tz", phone: "+255 754 990 221", category: "Hardware & Fixtures", leadTimeDays: 10, status: "Active" },
  { id: "SUP-03", name: "Zanzibar Electronics Imports", contactPerson: "Salim Haji", email: "s.haji@znzelectronics.com", phone: "+255 777 402 118", category: "Electronics", leadTimeDays: 21, status: "Active" },
  { id: "SUP-04", name: "Furniture Craft Tanzania", contactPerson: "Neema Shirima", email: "neema@furniturecraft.tz", phone: "+255 712 335 890", category: "Furniture", leadTimeDays: 14, status: "Inactive" },
];
