import {
  FileCheck, FileText, Hash, Mail, Video
} from "lucide-react";
import { TODAY, money } from "../lib/format.jsx";

/* ══════════════ WORKFLOW AUTOMATION STUDIO DATA ══════════════ */
/* ------------------------------ WORKFLOW AUTOMATION STUDIO DATA ------------------------------ */

// Triggers reuse the exact same alert vocabulary useBusinessAlerts already
// computes (section 9) — not a second, parallel event system. "Manual"
// means exactly what it says: no server watches for this while the app is
// closed, so a workflow either runs when someone clicks Run Now, or gets
// surfaced as "ready to run" the moment its matching alert is genuinely
// active in the current session (see WorkflowStudio's own trigger-matching
// logic) — never a silent background action nobody asked for.
export const WORKFLOW_TRIGGERS = [
  { id: "manual", label: "Manual — run on demand" },
  { id: "overdue-invoices", label: "When overdue invoices are detected" },
  { id: "low-stock", label: "When stock runs low" },
  { id: "out-of-stock", label: "When an item goes out of stock" },
  { id: "unusual-expenses", label: "When an unusual expense is detected" },
  { id: "pending-leave", label: "When a leave request needs approval" },
  { id: "subscriptions-due", label: "When a subscription is due for billing" },
];

// The "Condition" gate between When and Actions. Each condition carries
// a real evaluate() run against live rows at execution time — never a
// stored snapshot — returning both the verdict and the real numbers
// behind it, so a skipped run states exactly why in real figures.
export const WORKFLOW_CONDITIONS = [
  { id: "none", label: "No condition — always run", evaluate: () => ({ met: true, detail: "No condition set" }) },
  { id: "overdue-count-gt", label: "Only if overdue invoices exceed…", unit: "invoices", evaluate: (data, v) => { const todayStr = TODAY.toISOString().slice(0, 10); const n = data.invoices.rows.filter((i) => i.status !== "Paid" && i.dueDate && i.dueDate < todayStr).length; return { met: n > Number(v), detail: `${n} overdue invoice(s) vs threshold ${v}` }; } },
  { id: "low-stock-count-gt", label: "Only if low-stock items exceed…", unit: "items", evaluate: (data, v) => { const n = data.inventory.rows.filter((it) => it.qty <= it.reorder).length; return { met: n > Number(v), detail: `${n} item(s) at/below reorder vs threshold ${v}` }; } },
  { id: "unpaid-expenses-gt", label: "Only if unpaid expenses exceed… (TZS 000)", unit: "TZS k", evaluate: (data, v) => { const total = data.expenses.rows.filter((e) => e.status !== "Paid").reduce((s, e) => s + e.amount, 0); return { met: total > Number(v), detail: `TZS ${money(Math.round(total))}k unpaid vs threshold ${money(Number(v))}k` }; } },
];

// Five step types, deliberately not more — each one wraps a function this
// app has already proven works for real (the exact same sendWebhookNotification
// and logAudit already powering the Notification System and Audit Service).
// A step type was only added here if it can genuinely execute when Run Now
// is clicked; nothing on this list is aspirational.
export const WORKFLOW_STEP_TYPES = [
  { id: "notify_slack", label: "Notify via Slack", icon: Hash, color: "#16A34A", fields: [{ key: "message", label: "Message", placeholder: "e.g. Please review this — customer payment received." }] },
  { id: "notify_teams", label: "Notify via Microsoft Teams", icon: Video, color: "#5B6472", fields: [{ key: "message", label: "Message", placeholder: "e.g. Heads up — new payment recorded." }] },
  { id: "log_audit", label: "Log to Audit Trail", icon: FileCheck, color: "#111827", fields: [{ key: "note", label: "Note", placeholder: "What happened, in one line" }] },
  { id: "draft_email", label: "Draft a Thank You / Follow-up Email", icon: Mail, color: "#F59E0B", fields: [{ key: "recipient", label: "Recipient email", placeholder: "customer@company.tz" }, { key: "context", label: "What should it say?", placeholder: "e.g. Thank the customer for their payment" }] },
  { id: "generate_report", label: "Generate a Report", icon: FileText, color: "#0EA5E9", fields: [{ key: "reportType", label: "Report type", options: ["Sales & Revenue", "Inventory Valuation", "Profit & Loss"] }] },
];

export const workflowsSeed = [
  {
    id: "WF-01", name: "Invoice Paid Follow-up", trigger: "manual", enabled: true, lastRun: null,
    steps: [
      { id: "s1", type: "notify_slack", config: { message: "A customer invoice was just paid — cash flow updated." } },
      { id: "s2", type: "log_audit", config: { note: "Payment follow-up workflow executed" } },
      { id: "s3", type: "draft_email", config: { recipient: "", context: "Thank the customer warmly for their prompt payment and mention we look forward to serving them again." } },
    ],
  },
];

// Automation Marketplace — seven "ready-made" automations, all real,
// because every one is composed entirely from the five step types and
// the existing real triggers already proven in Workflow Studio (section
// 35). None of these needed new capability to build — "ready-made" here
// means "already assembled," not "does something this app couldn't
// already do." Two (Payroll, VAT) are honestly scoped as monthly
// reminder checklists a person still runs, not unattended auto-filing —
// the identical limitation already stated for Scheduled Reports.
export const OFFICIAL_MARKETPLACE_TEMPLATES = [
  {
    id: "TPL-invoice-approval", name: "Invoice Approval Alert", category: "Finance", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "Notify a finance manager and log an audit entry whenever a significant invoice needs a second look before it goes out.",
    trigger: "manual",
    steps: [
      { id: "s1", type: "notify_slack", config: { message: "A new invoice needs review before sending — please check Sales > Invoices." } },
      { id: "s2", type: "log_audit", config: { note: "Invoice flagged for approval review" } },
    ],
  },
  {
    id: "TPL-onboarding", name: "Employee Onboarding Kit", category: "HR", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "Welcome a new hire, notify the team, and log the onboarding start — all in one run on their first day.",
    trigger: "manual",
    steps: [
      { id: "s1", type: "log_audit", config: { note: "Employee onboarding started" } },
      { id: "s2", type: "draft_email", config: { recipient: "", context: "Warmly welcome the new team member, outline their first-week schedule, and share who to contact with questions." } },
      { id: "s3", type: "notify_slack", config: { message: "Please welcome our newest team member — details in HR." } },
    ],
  },
  {
    id: "TPL-payroll", name: "Monthly Payroll Reminder", category: "Finance", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "A monthly checklist to run before payday: a Slack reminder plus a real P&L snapshot for reference. Doesn't process payroll itself — HR's own Process Payroll action does that (section 4).",
    trigger: "manual",
    steps: [
      { id: "s1", type: "notify_slack", config: { message: "Reminder: payroll is due — review HR > Payroll before processing." } },
      { id: "s2", type: "generate_report", config: { reportType: "Profit & Loss" } },
    ],
  },
  {
    id: "TPL-vat", name: "VAT Filing Preparation", category: "Finance", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "A monthly reminder plus a real financial snapshot to reference before filing — preparation only. See Finance's own VAT Summary for the actual computed figure and section 25's note on why real TRA filing needs credentials this app doesn't hold.",
    trigger: "manual",
    steps: [
      { id: "s1", type: "notify_slack", config: { message: "VAT return is due soon — check Finance > Tax for this period's summary." } },
      { id: "s2", type: "generate_report", config: { reportType: "Profit & Loss" } },
      { id: "s3", type: "log_audit", config: { note: "VAT filing preparation reminder sent" } },
    ],
  },
  {
    id: "TPL-followup", name: "Customer Follow-up", category: "Sales", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "The moment an overdue invoice is detected, draft a polite reminder and alert the sales team — using the exact same real overdue-invoice detection already powering your Notifications.",
    trigger: "overdue-invoices",
    steps: [
      { id: "s1", type: "draft_email", config: { recipient: "", context: "Politely remind the customer their invoice is now overdue and ask when payment can be expected." } },
      { id: "s2", type: "notify_slack", config: { message: "An overdue invoice needs a follow-up call — see Finance > Receivables." } },
    ],
  },
  {
    id: "TPL-replenishment", name: "Inventory Replenishment Alert", category: "Inventory", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "The moment stock runs low, alert procurement and log it — using the same real low-stock detection already powering your Notifications.",
    trigger: "low-stock",
    steps: [
      { id: "s1", type: "notify_slack", config: { message: "Stock has run low on one or more items — check Inventory for reorder recommendations." } },
      { id: "s2", type: "log_audit", config: { note: "Low-stock replenishment alert sent" } },
    ],
  },
  {
    id: "TPL-subscription", name: "Subscription Billing Reminder", category: "Sales", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "The moment a subscription is due for billing, draft the renewal email and notify the team — using the same real due-date detection already powering your Notifications.",
    trigger: "subscriptions-due",
    steps: [
      { id: "s1", type: "draft_email", config: { recipient: "", context: "Let the customer know their subscription is due for renewal and confirm the billing details." } },
      { id: "s2", type: "notify_slack", config: { message: "A subscription is due for billing — see Sales > Subscriptions." } },
    ],
  },
  {
    id: "TPL-leave-approval", name: "Leave Approval Alert", category: "HR", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "The moment a leave request needs approval, notify the approver and keep an audit record — using the same real pending-leave detection powering your Notifications.",
    trigger: "pending-leave",
    steps: [
      { id: "s1", type: "notify_teams", config: { message: "A leave request is waiting for approval — decide in HR > Leave." } },
      { id: "s2", type: "log_audit", config: { note: "Leave approval reminder dispatched" } },
    ],
  },
  {
    id: "TPL-asset-request", name: "Asset Request Log", category: "Operations", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "Run when someone requests equipment: notify operations and leave a real audit-trail record for the asset register.",
    trigger: "manual",
    steps: [
      { id: "s1", type: "notify_slack", config: { message: "New asset request — review against the Fixed Assets register." } },
      { id: "s2", type: "log_audit", config: { note: "Asset request submitted and recorded" } },
    ],
  },
  {
    id: "TPL-vehicle-booking", name: "Vehicle Booking Notice", category: "Operations", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "Run when a vehicle is requested: notify the fleet contact and record the booking request in the audit trail.",
    trigger: "manual",
    steps: [
      { id: "s1", type: "notify_teams", config: { message: "Vehicle booking requested — confirm availability and assign a driver." } },
      { id: "s2", type: "log_audit", config: { note: "Vehicle booking request recorded" } },
    ],
  },
  {
    id: "TPL-reimbursement", name: "Expense Reimbursement Watch", category: "Finance", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "When an unusual expense is detected, flag it for review before reimbursement — same real detection that powers your expense alerts.",
    trigger: "unusual-expenses",
    steps: [
      { id: "s1", type: "notify_slack", config: { message: "Unusual expense flagged — review in Finance > Payables before reimbursing." } },
      { id: "s2", type: "log_audit", config: { note: "Reimbursement review triggered by unusual-expense detection" } },
    ],
  },
  {
    id: "TPL-customer-onboarding", name: "Customer Onboarding", category: "Sales", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "Run for each new customer: draft the welcome email and record onboarding start — distinct from post-sale follow-up.",
    trigger: "manual",
    steps: [
      { id: "s1", type: "draft_email", config: { recipient: "", context: "Welcome the new customer, introduce their account contact, and explain how invoicing and support work" } },
      { id: "s2", type: "log_audit", config: { note: "Customer onboarding sequence started" } },
    ],
  },
  {
    id: "TPL-contract-approval", name: "Contract Approval Record", category: "Finance", isOfficial: true, installCount: 0, publisherName: "Official",
    description: "Route a contract for decision: notify the approver and record that the decision will carry a biometric signature in Approvals.",
    trigger: "manual",
    steps: [
      { id: "s1", type: "notify_teams", config: { message: "A contract is ready for approval — review and sign in Approvals." } },
      { id: "s2", type: "log_audit", config: { note: "Contract routed for approval — decision to be biometrically signed" } },
    ],
  },
];
