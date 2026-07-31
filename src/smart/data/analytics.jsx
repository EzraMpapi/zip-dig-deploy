import { lineTotal } from "../lib/format.jsx";

/* ══════════════ BUSINESS INTELLIGENCE DATA ══════════════ */
/* ------------------------------ BUSINESS INTELLIGENCE DATA ------------------------------ */

// Every metric here is a real computation over data already live elsewhere
// in the app — nothing new to compute, just a way to let someone pick
// which existing number matters most to them and set their own target
// against it, rather than being stuck with whatever KPIs a developer
// hardcoded onto a dashboard.
export const KPI_METRICS = [
  { id: "revenue", label: "Revenue Collected", unit: "TZS 000", compute: (d) => d.invoices.rows.reduce((s, inv) => { const { total } = lineTotal(inv.items); return s + (inv.status === "Paid" ? total : (inv.amountPaid || 0)); }, 0) },
  { id: "profit", label: "Net Profit", unit: "TZS 000", compute: (d) => { const rev = d.invoices.rows.reduce((s, inv) => { const { total } = lineTotal(inv.items); return s + (inv.status === "Paid" ? total : (inv.amountPaid || 0)); }, 0); return rev - d.expenses.rows.reduce((s, e) => s + e.amount, 0); } },
  { id: "receivables", label: "Outstanding Receivables", unit: "TZS 000", compute: (d) => d.invoices.rows.filter((inv) => inv.status !== "Paid").reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0) },
  { id: "stock_value", label: "Stock Value", unit: "TZS 000", compute: (d) => d.inventory.rows.reduce((s, it) => s + it.qty * it.unitCost, 0) },
  { id: "pipeline_value", label: "Open Pipeline Value", unit: "TZS 000", compute: (d) => d.crm.rows.filter((l) => l.stage !== "Won" && l.stage !== "Lost").reduce((s, l) => s + l.value, 0) },
  { id: "headcount", label: "Active Employees", unit: "people", compute: (d) => d.employees.rows.filter((e) => e.status === "Active").length },
  { id: "win_rate", label: "Sales Win Rate", unit: "%", compute: (d) => { const won = d.crm.rows.filter((l) => l.stage === "Won").length; const closed = won + d.crm.rows.filter((l) => l.stage === "Lost").length; return closed > 0 ? Math.round((won / closed) * 100) : 0; } },
];

export const customKpisSeed = [
  { id: "KPI-01", metricId: "revenue", label: "Monthly Revenue Target", target: 10000 },
  { id: "KPI-02", metricId: "win_rate", label: "Sales Win Rate Target", target: 60 },
];

// Manually entered, deliberately — no automated competitor data exists or
// could exist without scraping or a paid market-intelligence feed neither
// of which this build has. This is exactly how real CRMs (Salesforce's own
// Competitor tracking included) actually work: a rep or owner logs what
// they've learned, not a live automated feed.
export const competitorsSeed = [
  { id: "COMP-01", name: "Coastal Building Supplies", category: "Construction Materials", threatLevel: "High", notes: "Undercuts on cement pricing by ~5%; weaker on delivery reliability.", lastUpdated: "2026-06-20" },
  { id: "COMP-02", name: "Arusha Trade Center", category: "Hardware & Fixtures", threatLevel: "Medium", notes: "Strong regional presence in Arusha; limited product range vs. ours.", lastUpdated: "2026-06-10" },
];

// Financial Benchmarking compares a real computed metric against a target
// the business owner enters themselves — from their own research (an
// industry report, an accountant's advice, a number a peer shared) — not
// a live external benchmark feed, since no such feed exists for East
// African SME sector data that a generic app could connect to.
export const BENCHMARK_METRICS = [
  { id: "gross_margin", label: "Gross Margin", unit: "%" },
  { id: "receivables_days", label: "Days Sales Outstanding", unit: "days" },
  { id: "stock_turnover", label: "Stock Turnover", unit: "x / year" },
];

export const benchmarksSeed = [
  { id: "BM-01", metricId: "gross_margin", label: "Industry Gross Margin (Hardware Retail)", benchmarkValue: 25 },
];
