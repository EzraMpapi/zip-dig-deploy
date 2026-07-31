import { TODAY } from "../lib/format.jsx";

/* ══════════════ PROJECTS DATA ══════════════ */
/* -------------------------------- PROJECTS DATA -------------------------------- */
export const PROJECT_STATUS_COLOR = { Planning: "#5B6472", Active: "#16A34A", "On Hold": "#F59E0B", Completed: "#16A34A" };

// Continuity with existing customer relationships rather than inventing
// disconnected demo accounts — these are the same real accounts already
// seen across CRM, Sales, and Finance.
export const projectsSeed = [
  { id: "PRJ-01", name: "Cold Chain Rollout", client: "Kilimo Fresh Distributors", status: "Active", startDate: "2026-06-01", endDate: "2026-08-15", budget: 42000, manager: "David Chen" },
  { id: "PRJ-02", name: "Fleet GPS Deployment", client: "Meridian Logistics", status: "Active", startDate: "2026-06-15", endDate: "2026-07-20", budget: 15000, manager: "S. Kileo" },
  { id: "PRJ-03", name: "Kitchen Refurbishment", client: "Baraka Hotels & Resorts", status: "Planning", startDate: "2026-07-10", endDate: "2026-09-30", budget: 28000, manager: "Grace Mmbaga" },
];

export const TASK_STATUSES = ["To Do", "In Progress", "Review", "Done"];

export const TASK_STATUS_COLOR = { "To Do": "#5B6472", "In Progress": "#F59E0B", Review: "#F59E0B", Done: "#16A34A" };

export const PRIORITY_COLOR = { Low: "#5B6472", Medium: "#F59E0B", High: "#EF4444" };

export const projectTasksSeed = [
  { id: "TSK-01", projectId: "PRJ-01", title: "Site survey — cold storage bay", assignee: "Grace Mmbaga", status: "Done", priority: "High", dueDate: "2026-06-10" },
  { id: "TSK-02", projectId: "PRJ-01", title: "Install racking system", assignee: "Elias Rugambwa", status: "In Progress", priority: "High", dueDate: "2026-07-05" },
  { id: "TSK-03", projectId: "PRJ-01", title: "Commission refrigeration units", assignee: "David Chen", status: "To Do", priority: "Medium", dueDate: "2026-07-25" },
  { id: "TSK-04", projectId: "PRJ-02", title: "Install GPS units on fleet", assignee: "S. Kileo", status: "In Progress", priority: "High", dueDate: "2026-07-08" },
  { id: "TSK-05", projectId: "PRJ-02", title: "Configure monitoring dashboard", assignee: "David Chen", status: "Review", priority: "Medium", dueDate: "2026-07-12" },
  { id: "TSK-06", projectId: "PRJ-03", title: "Finalize equipment list", assignee: "Grace Mmbaga", status: "To Do", priority: "Medium", dueDate: "2026-07-18" },
];

// Same live-computed-status convention as contractStatus and expiryStatus
// — Completed is the only stored fact; everything else is derived from
// today's date so a milestone can never silently drift out of sync.
export function milestoneStatus(m) {
  if (m.completed) return "Completed";
  const days = Math.round((new Date(m.dueDate) - TODAY) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Overdue";
  if (days <= 14) return "Due Soon";
  return "Upcoming";
}

export const MILESTONE_STATUS_COLOR = { Completed: "#16A34A", Overdue: "#EF4444", "Due Soon": "#F59E0B", Upcoming: "#5B6472" };

export const projectMilestonesSeed = [
  { id: "MS-01", projectId: "PRJ-01", title: "Phase 1: Installation complete", dueDate: "2026-07-15", completed: false },
  { id: "MS-02", projectId: "PRJ-01", title: "Final handover", dueDate: "2026-08-15", completed: false },
  { id: "MS-03", projectId: "PRJ-02", title: "Fleet-wide GPS live", dueDate: "2026-07-20", completed: false },
  { id: "MS-04", projectId: "PRJ-03", title: "Design sign-off", dueDate: "2026-07-25", completed: false },
];

// Logging a project expense creates a real Finance expense (category
// "Project Costs") — the same convention-based link Maintenance and
// Payroll already use — while this local record keeps the per-project
// budget view scoped without needing a project field on every expense.
export const projectExpensesSeed = [
  { id: "PE-01", projectId: "PRJ-01", description: "Racking materials", amount: 4200, date: "2026-06-20" },
  { id: "PE-02", projectId: "PRJ-02", description: "GPS units bulk purchase", amount: 3150, date: "2026-06-16" },
];
