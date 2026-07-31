import { TODAY } from "../lib/format.jsx";

/* ══════════════ PROCUREMENT DATA ══════════════ */
/* -------------------------------- PROCUREMENT DATA ------------------------------ */

// Small purchases don't need sign-off — a real procurement policy, not an
// arbitrary number. Above this, a PO can't move to Approved without going
// through the Approvals tab, which is gated to Owner/Admin the same way
// Settings already is.
export const PO_APPROVAL_THRESHOLD = 5000; // TZS 000


export const PO_STATUS_COLOR = {
  Draft: "#5B6472",
  "Pending Approval": "#F59E0B",
  Approved: "#16A34A",
  Received: "#16A34A",
  Paid: "#111827",
  Cancelled: "#9CA3AF",
};

export const purchaseOrdersSeed = [
  {
    id: "PO-3401", supplier: "Tanzania Portland Cement Co.", status: "Approved",
    orderDate: "2026-06-28", expectedDate: "2026-07-05", requestedBy: "Grace Mmbaga",
    items: [{ sku: "HDW-2203", name: "Cement 50kg bag", qty: 500, cost: 14.8 }],
  },
  {
    id: "PO-3400", supplier: "Coastal Steel & Hardware Ltd", status: "Pending Approval",
    orderDate: "2026-07-01", expectedDate: "2026-07-15", requestedBy: "David Chen",
    items: [{ sku: "HDW-2202", name: "Steel reinforcement bar 12mm (ton)", qty: 8, cost: 1450 }],
  },
  {
    id: "PO-3399", supplier: "Zanzibar Electronics Imports", status: "Received",
    orderDate: "2026-06-15", expectedDate: "2026-06-29", requestedBy: "S. Kileo",
    items: [{ sku: "HDW-2204", name: "Fleet GPS tracking unit", qty: 30, cost: 105 }],
  },
  {
    id: "PO-3398", supplier: "Furniture Craft Tanzania", status: "Paid",
    orderDate: "2026-06-01", expectedDate: "2026-06-14", requestedBy: "J. Batenga",
    items: [{ sku: "HDW-2205", name: "Salon styling chair", qty: 20, cost: 150 }],
  },
  {
    id: "PO-3397", supplier: "Coastal Steel & Hardware Ltd", status: "Draft",
    orderDate: "2026-07-02", expectedDate: null, requestedBy: "Grace Mmbaga",
    items: [{ sku: "HDW-2207", name: "Warehouse shelving unit", qty: 40, cost: 72 }],
  },
];

export function poTotal(items) {
  return items.reduce((s, it) => s + it.qty * it.cost, 0);
}

export const CONTRACT_TYPES = ["Framework Agreement", "Fixed-term Supply", "One-time"];

export const CONTRACT_WARNING_DAYS = 45;

export function contractStatus(endDate) {
  if (!endDate) return "Active"; // framework agreements can be open-ended
  const days = Math.round((new Date(endDate) - TODAY) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expired";
  if (days <= CONTRACT_WARNING_DAYS) return "Expiring Soon";
  return "Active";
}

export const CONTRACT_STATUS_COLOR = { Active: "#16A34A", "Expiring Soon": "#F59E0B", Expired: "#EF4444" };

export const procurementContractsSeed = [
  { id: "PC-01", supplier: "Tanzania Portland Cement Co.", type: "Framework Agreement", startDate: "2025-01-01", endDate: null, value: 180000, notes: "Standing supply agreement, no fixed end date" },
  { id: "PC-02", supplier: "Coastal Steel & Hardware Ltd", type: "Fixed-term Supply", startDate: "2026-01-01", endDate: "2026-07-31", value: 42000, notes: "Annual steel supply contract, up for renewal" },
  { id: "PC-03", supplier: "Zanzibar Electronics Imports", type: "One-time", startDate: "2026-06-01", endDate: "2026-06-30", value: 3150, notes: "GPS unit bulk order" },
];
