import {
  ChevronDown, ChevronUp, TrendingDown, TrendingUp
} from "lucide-react";
import { STAGE_COLOR } from "../data/core.jsx";
import { DOC_STATUS_COLOR } from "../data/sales.jsx";

/* ══════════════ POS DATA ══════════════ */
/* ---------------------------------- POS DATA ---------------------------------- */

// POS prices reuse the same retail markup as the E-Commerce storefront —
// a physical item costs the customer the same whether they buy it at the
// counter or online, since both channels are selling the same stock.
export const POS_PAYMENT_METHODS = ["Cash", "Card", "Mobile Money"];

export const POS_PAYMENT_COLOR = {
  Cash: "#16A34A",
  Card: "#16A34A",
  "Mobile Money": "#F59E0B",
};

export const RETURN_REASONS = ["Customer changed mind", "Wrong item", "Defective / damaged", "Duplicate purchase", "Other"];

export const posTransactionsSeed = [
  {
    id: "POS-3312", cashier: "Halima Juma", method: "Mobile Money", date: "2026-07-02",
    items: [{ sku: "HDW-2205", name: "Salon styling chair", qty: 1, price: 284 }], returns: [],
  },
  {
    id: "POS-3311", cashier: "Halima Juma", method: "Cash", date: "2026-07-02",
    items: [
      { sku: "HDW-2207", name: "Warehouse shelving unit", qty: 2, price: 105 },
      { sku: "HDW-2210", name: "Pharmacy display unit", qty: 1, price: 864 },
    ], returns: [],
  },
  {
    id: "POS-3310", cashier: "Fatuma Salim", method: "Card", date: "2026-07-01",
    items: [{ sku: "HDW-2201", name: "Industrial water heater 50L", qty: 1, price: 421 }], returns: [],
  },
  {
    id: "POS-3309", cashier: "Halima Juma", method: "Cash", date: "2026-06-30",
    items: [{ sku: "HDW-2206", name: "Backwash basin", qty: 3, price: 378 }], returns: [],
  },
];

export function KpiCard({ item }) {
  const Icon = item.icon;
  const accent = item.up ? "#16A34A" : "#F59E0B";
  return (
    <div className="kpi-card relative bg-white rounded-xl border border-slate-200/70 p-5 flex flex-col gap-4 overflow-hidden group">
      <div
        className="absolute inset-x-0 top-0 h-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }}
      />
      <div className="flex items-center justify-between">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
          style={{ background: "linear-gradient(135deg, #111827 0%, #16A34A 130%)" }}
        >
          <Icon size={16} strokeWidth={1.85} className="text-white" />
        </div>
        <span
          className="text-[11px] font-mono font-medium flex items-center gap-1 px-1.5 py-0.5 rounded-md"
          style={{ color: accent, backgroundColor: `${accent}12` }}
        >
          {item.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {item.delta}
        </span>
      </div>
      <div>
        <div className="text-[22px] font-semibold text-[#111827] font-mono tracking-tight leading-none">{item.value}</div>
        <div className="text-[12.5px] text-slate-500 mt-1.5">{item.label}</div>
      </div>
    </div>
  );
}

export function StagePill({ stage }) {
  return (
    <span
      className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
      style={{ backgroundColor: `${STAGE_COLOR[stage]}14`, color: STAGE_COLOR[stage] }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_COLOR[stage] }} />
      {stage}
    </span>
  );
}

export function DocStatusPill({ status }) {
  const color = DOC_STATUS_COLOR[status] || "#5B6472";
  return (
    <span
      className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
      style={{ backgroundColor: `${color}14`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

// Clickable column header that toggles asc/desc sort on a given field.
// Shared by any table that wants sorting — pass the same `sort` state
// object ({ field, direction }) and `onSort` setter from the parent.
export function SortableHeader({ label, field, sort, onSort, align = "left" }) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 font-medium select-none cursor-pointer group ${align === "right" ? "text-right" : "text-left"}`}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-[#111827]" : "group-hover:text-slate-600"}`}>
        {label}
        <span className="flex flex-col -space-y-1">
          <ChevronUp size={10} className={active && sort.direction === "asc" ? "text-[#16A34A]" : "text-slate-300"} />
          <ChevronDown size={10} className={active && sort.direction === "desc" ? "text-[#16A34A]" : "text-slate-300"} />
        </span>
      </span>
    </th>
  );
}

export function sortRows(rows, sort) {
  if (!sort.field) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.field], bv = b[sort.field];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
  });
}

export function toggleSort(sort, setSort, field) {
  setSort((s) => (s.field === field ? { field, direction: s.direction === "asc" ? "desc" : "asc" } : { field, direction: "asc" }));
}
