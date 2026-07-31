import { TODAY } from "../lib/format.jsx";

/* ══════════════ FINANCE DATA ══════════════ */
export function daysBetween(a, b) {
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export function agingBucket(dueDateStr) {
  if (!dueDateStr) return "No due date";
  const days = Math.floor((TODAY - new Date(dueDateStr)) / 86400000);
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

export function agingDays(dueDateStr) {
  if (!dueDateStr) return 0;
  return Math.floor((TODAY - new Date(dueDateStr)) / 86400000);
}

export const AGING_COLOR = {
  "Current": "#16A34A",
  "1–30 days": "#F59E0B",
  "31–60 days": "#F59E0B",
  "60+ days": "#EF4444",
};

export const EXPENSE_STATUS_COLOR = {
  Paid: "#16A34A",
  Pending: "#F59E0B",
  Scheduled: "#16A34A",
};

export const EXPENSE_CATEGORIES_LIST = ["Rent & Utilities", "Salaries", "Logistics", "Marketing", "Supplies", "Professional Fees"];

export const expensesSeed = [
  { id: "EX-4501", vendor: "Kilimanjaro Property Holdings", category: "Rent & Utilities", date: "2026-06-28", dueDate: "2026-07-28", amount: 8200, status: "Paid", method: "Bank Transfer" },
  { id: "EX-4500", vendor: "Payroll — June", category: "Salaries", date: "2026-06-27", dueDate: "2026-06-27", amount: 41500, status: "Paid", method: "Bank Transfer" },
  { id: "EX-4499", vendor: "Coastal Freight Movers", category: "Logistics", date: "2026-06-25", dueDate: "2026-07-25", amount: 6340, status: "Paid", method: "Mobile Money" },
  { id: "EX-4498", vendor: "Nexus Digital Marketing", category: "Marketing", date: "2026-06-22", dueDate: "2026-07-07", amount: 3100, status: "Pending", method: "Bank Transfer" },
  { id: "EX-4497", vendor: "OfficeMart Supplies Ltd", category: "Supplies", date: "2026-06-20", dueDate: "2026-07-20", amount: 980, status: "Paid", method: "Cash" },
  { id: "EX-4496", vendor: "Bahati & Partners Audit", category: "Professional Fees", date: "2026-06-18", dueDate: "2026-06-25", amount: 4500, status: "Scheduled", method: "Bank Transfer" },
  { id: "EX-4495", vendor: "TANESCO", category: "Rent & Utilities", date: "2026-06-15", dueDate: "2026-07-15", amount: 1620, status: "Paid", method: "Mobile Money" },
  { id: "EX-4494", vendor: "Zuridata Cloud Hosting", category: "Supplies", date: "2026-06-12", dueDate: "2026-07-12", amount: 740, status: "Paid", method: "Card" },
];

export const CASHFLOW_TREND = [
  { m: "Jan", inflow: 52, outflow: 38 }, { m: "Feb", inflow: 58, outflow: 41 },
  { m: "Mar", inflow: 49, outflow: 39 }, { m: "Apr", inflow: 67, outflow: 44 },
  { m: "May", inflow: 63, outflow: 47 }, { m: "Jun", inflow: 79, outflow: 52 },
  { m: "Jul", inflow: 61, outflow: 33 },
];
