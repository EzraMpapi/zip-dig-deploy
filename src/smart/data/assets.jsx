import { TODAY } from "../lib/format.jsx";

/* ══════════════ FIXED ASSETS ══════════════ */
/* --------------------------------- FIXED ASSETS --------------------------------- */
export const ASSET_CATEGORIES = ["Vehicles", "Equipment", "Furniture & Fixtures", "Buildings", "Computers & IT"];

// Straight-line depreciation — cost spread evenly over the useful life,
// computed from real elapsed time (acquisition date to today), not a
// stored number that could drift out of sync with the calendar.
export function depreciate(asset) {
  const acquired = new Date(asset.acquisitionDate);
  const monthsElapsed = Math.max(0, (TODAY.getFullYear() - acquired.getFullYear()) * 12 + (TODAY.getMonth() - acquired.getMonth()));
  const usefulMonths = asset.usefulLifeYears * 12;
  const monthlyDep = asset.cost / usefulMonths;
  const accumulated = Math.min(asset.cost, monthlyDep * monthsElapsed);
  const bookValue = Math.max(0, asset.cost - accumulated);
  const fullyDepreciated = monthsElapsed >= usefulMonths;
  return { accumulated: Math.round(accumulated), bookValue: Math.round(bookValue), fullyDepreciated, monthlyDep: Math.round(monthlyDep) };
}

export const financeAssetsSeed = [
  { id: "AST-01", name: "Toyota Hilux — Delivery Truck", category: "Vehicles", acquisitionDate: "2023-03-15", cost: 68000, usefulLifeYears: 8 },
  { id: "AST-02", name: "Warehouse Forklift", category: "Equipment", acquisitionDate: "2022-11-01", cost: 24500, usefulLifeYears: 10 },
  { id: "AST-03", name: "Office Furniture Set — HQ", category: "Furniture & Fixtures", acquisitionDate: "2024-01-10", cost: 8200, usefulLifeYears: 7 },
  { id: "AST-04", name: "Server & Networking Rack", category: "Computers & IT", acquisitionDate: "2023-08-20", cost: 12800, usefulLifeYears: 5 },
  { id: "AST-05", name: "Dar es Salaam Warehouse Building", category: "Buildings", acquisitionDate: "2019-06-01", cost: 340000, usefulLifeYears: 25 },
];

export const quotationsSeed = [
  {
    id: "QT-1042", customer: "Baraka Hotels & Resorts", date: "2026-06-24", validUntil: "2026-07-08",
    status: "Sent", owner: "J. Batenga",
    items: [
      { name: "Industrial water heaters (50L)", qty: 12, rate: 480 },
      { name: "Installation & commissioning", qty: 1, rate: 2100 },
      { name: "1-year service contract", qty: 1, rate: 1800 },
    ],
  },
  {
    id: "QT-1041", customer: "Coastal Construction Ltd", date: "2026-06-20", validUntil: "2026-07-04",
    status: "Draft", owner: "M. Fundi",
    items: [
      { name: "Steel reinforcement bars (12mm, ton)", qty: 8, rate: 1650 },
      { name: "Cement (50kg bag)", qty: 400, rate: 17.5 },
    ],
  },
  {
    id: "QT-1040", customer: "Meridian Logistics", date: "2026-06-15", validUntil: "2026-06-29",
    status: "Accepted", owner: "S. Kileo",
    items: [
      { name: "Fleet GPS tracking units", qty: 24, rate: 145 },
      { name: "Annual monitoring subscription", qty: 24, rate: 60 },
    ],
  },
  {
    id: "QT-1039", customer: "Nyota Pharmacy Group", date: "2026-06-02", validUntil: "2026-06-16",
    status: "Expired", owner: "M. Fundi",
    items: [{ name: "Cold-chain refrigeration units", qty: 3, rate: 2250 }],
  },
];

export const ordersSeed = [
  {
    id: "SO-2117", customer: "Meridian Logistics", date: "2026-06-29", quotationRef: "QT-1040",
    status: "Confirmed", owner: "S. Kileo", returns: [],
    items: [
      { name: "Fleet GPS tracking units", qty: 24, rate: 145 },
      { name: "Annual monitoring subscription", qty: 24, rate: 60 },
    ],
  },
  {
    id: "SO-2116", customer: "Uzuri Beauty Chain", date: "2026-06-27", quotationRef: "—",
    status: "Fulfilled", owner: "J. Batenga", returns: [],
    items: [
      { name: "Salon styling chairs", qty: 10, rate: 210 },
      { name: "Backwash basins", qty: 4, rate: 340 },
    ],
  },
  {
    id: "SO-2115", customer: "Salim Wholesale Traders", date: "2026-06-25", quotationRef: "—",
    status: "Pending", owner: "S. Kileo", returns: [],
    items: [{ name: "Warehouse shelving units", qty: 30, rate: 95 }],
  },
  {
    id: "SO-2114", customer: "Rugambwa Auto Workshop", date: "2026-06-18", quotationRef: "—",
    status: "Cancelled", owner: "S. Kileo", returns: [],
    items: [{ name: "Hydraulic vehicle lifts", qty: 2, rate: 1850 }],
  },
];

export const invoicesSeed = [
  {
    id: "INV-8801", customer: "Uzuri Beauty Chain", date: "2026-06-27", dueDate: "2026-07-11",
    orderRef: "SO-2116", status: "Paid", amountPaid: null, payments: [],
    items: [
      { name: "Salon styling chairs", qty: 10, rate: 210 },
      { name: "Backwash basins", qty: 4, rate: 340 },
    ],
  },
  {
    id: "INV-8800", customer: "Baraka Hotels & Resorts", date: "2026-06-20", dueDate: "2026-07-04",
    orderRef: "—", status: "Partial", amountPaid: 40000, payments: [],
    items: [{ name: "Kitchen refrigeration overhaul", qty: 1, rate: 96500 }],
  },
  {
    id: "INV-8799", customer: "Kilimo Fresh Distributors", date: "2026-06-10", dueDate: "2026-06-24",
    orderRef: "—", status: "Overdue", amountPaid: 0, payments: [],
    items: [{ name: "Cold storage racking system", qty: 6, rate: 3067 }],
  },
  {
    id: "INV-8798", customer: "Nyota Pharmacy Group", date: "2026-06-30", dueDate: "2026-07-14",
    orderRef: "—", status: "Unpaid", amountPaid: 0, payments: [],
    items: [{ name: "Pharmacy display units", qty: 8, rate: 780 }],
  },
];
