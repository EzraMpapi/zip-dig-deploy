import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BarChart3, Bell, Brain, Briefcase, Bus, ClipboardCheck, Factory, FileText, Gauge,
  GitBranch, Globe, HandCoins, Headphones, HeartPulse, Hotel, Kanban, Landmark,
  LayoutDashboard, Megaphone, MessageSquare, Package, School, ShoppingBag, ShoppingCart,
  Store, Tablets, TreePine, Truck, UserCircle, Users, Users2, UtensilsCrossed, Wallet, X
} from "lucide-react";
import { money } from "../lib/format.jsx";

/* ══════════════ DATA ══════════════ */
/* ---------------------------------- DATA ---------------------------------- */

// A real 15-role model, replacing the earlier 4-tier placeholder (that
// comment predicted this exact expansion). Each role is defined along two
// dimensions this app can genuinely enforce: which modules appear in the
// sidebar at all (allowedModules), and whether the role can create/edit/
// delete or only view (writeAccess). This is a real, meaningful two-axis
// permission model — not a full per-action permission matrix. Building
// that would mean gating every individual create/edit/delete control
// across all twenty modules individually, a large, separate undertaking
// documented as a follow-up rather than attempted here at risk of leaving
// half the app's buttons correctly gated and half not. What's below is
// fully real: change your role in Settings and the sidebar genuinely
// changes, and every write-gated screen already in the app (Procurement
// Approvals, Notification Channels, Integration Connections, Settings
// itself) respects it immediately.
export const ALL_MODULE_IDS = [
  "dashboard", "crm", "sales", "inventory", "procurement", "finance", "reports", "hr",
  "manufacturing", "scm", "marketing", "ecommerce", "pos", "documents", "projects",
  "support", "analytics", "notifications", "integrations", "ai", "workflows", "collaboration",
];

export const ROLES = [
  {
    id: "Super Administrator", category: "System",
    description: "Full system control, including company settings, module entitlements, and every integration credential.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ALL_MODULE_IDS, writeAccess: "full",
  },
  {
    id: "Organization Owner", category: "Executive",
    description: "Full business access — the owner's own view of everything the company runs.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ALL_MODULE_IDS, writeAccess: "full",
  },
  {
    id: "CEO", category: "Executive",
    description: "Full visibility and control across every function, with Analytics and Dashboard as primary working views.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ALL_MODULE_IDS, writeAccess: "full",
  },
  {
    id: "CFO", category: "Executive",
    description: "Full financial authority — Finance, Procurement spend, and Reports — plus company-wide visibility for oversight.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ["finance", "procurement", "reports", "analytics"], writeAccess: "full",
  },
  {
    id: "Finance Manager", category: "Department Head",
    description: "Sees every module for company-wide financial oversight; day-to-day work — invoicing, payables, ledger, tax — happens in Finance, Reports, and Procurement spend.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ["finance", "reports", "analytics", "procurement", "notifications"], writeAccess: "full",
  },
  {
    id: "HR Manager", category: "Department Head",
    description: "Sees every module for company-wide oversight; day-to-day work — recruitment, attendance, payroll, leave approvals — happens in HR.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ["hr", "analytics", "documents"], writeAccess: "full",
  },
  {
    id: "Sales Manager", category: "Department Head",
    description: "Sees every module for company-wide oversight; day-to-day work — pipeline, quotations, orders, invoicing, campaigns — happens in CRM, Sales, and Marketing.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ["crm", "sales", "marketing", "ecommerce", "analytics", "support", "workflows"], writeAccess: "full",
  },
  {
    id: "Procurement Officer", category: "Operations",
    description: "Sees every module for company-wide visibility; day-to-day work — purchase orders, supplier relationships, vendor payments — happens in Procurement and Inventory.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ["procurement", "inventory"], writeAccess: "full",
  },
  {
    id: "Warehouse Manager", category: "Operations",
    description: "Sees every module for company-wide visibility; day-to-day work — stock, work orders, shipments, fleet — happens in Inventory, Manufacturing, and Supply Chain.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ["inventory", "manufacturing", "scm", "pos"], writeAccess: "full",
  },
  {
    id: "Project Manager", category: "Operations",
    description: "Sees every module for company-wide visibility; day-to-day work — tasks, timelines, milestones, budgets — happens in Projects.",
    allowedModules: ALL_MODULE_IDS, primaryModules: ["projects", "documents", "reports"], writeAccess: "full",
  },
  {
    id: "Customer Support Agent", category: "Front Line",
    description: "Handles tickets, live chat, the knowledge base, and the call log; views CRM for customer context.",
    allowedModules: ["dashboard", "support", "crm", "collaboration"], primaryModules: ["support", "crm"], writeAccess: "full",
  },
  {
    id: "Employee", category: "General Staff",
    description: "General staff access — company documents, team chat, and the shared calendar. No administrative capability.",
    allowedModules: ["dashboard", "documents", "collaboration"], primaryModules: ["documents"], writeAccess: "none",
  },
  {
    id: "Auditor", category: "Oversight",
    description: "Sees every module for audit purposes; cannot create, edit, or delete anything anywhere in the system.",
    allowedModules: ALL_MODULE_IDS, primaryModules: [], writeAccess: "none",
  },
  {
    id: "External Client", category: "External Portal",
    description: "A customer-facing role, scoped to Customer Support only. Honest limitation: this build has no real customer authentication, so this view isn't filtered to one client's own records — see the handover doc.",
    allowedModules: ["support"], primaryModules: ["support"], writeAccess: "none",
  },
  {
    id: "Supplier", category: "External Portal",
    description: "A vendor-facing role, scoped to Procurement's Supplier Portal. Same honest limitation as External Client: not filtered to one supplier's own purchase orders without real supplier-side authentication.",
    allowedModules: ["procurement"], primaryModules: ["procurement"], writeAccess: "none",
  },
];

// Dynamic Home Screen — every role lands on a genuinely different
// dashboard, not a cosmetic label change. Reuses the exact real Analytics
// dashboard functions (section 21) rather than computing the same numbers
// a second time for the home screen; "financial" here calls the literal
// same FinancialDashboard() function Analytics' own Financial tab calls.
// Two view types have no direct Analytics equivalent because their domain
// isn't lifted to root-shared state (Procurement's POs, Projects' tasks,
// Support's tickets all live in their own modules' local state — see
// section 21's own stated scope boundary): those roles get a focused
// welcome and a direct link into their actual module instead of a
// fabricated widget standing in for data this screen doesn't have.
export const ROLE_HOME_VIEW = {
  "Super Administrator": "executive",
  "Organization Owner": "executive",
  "CEO": "executive",
  "CFO": "financial",
  "Finance Manager": "financial",
  "HR Manager": "hr",
  "Sales Manager": "sales",
  "Procurement Officer": "operations",
  "Warehouse Manager": "operations",
  "Project Manager": "focused",
  "Customer Support Agent": "focused",
  "Employee": "minimal",
  "Auditor": "executive",
  "External Client": "minimal",
  "Supplier": "minimal",
};

export const MODULES = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, live: true },
  { id: "crm", label: "CRM", icon: Users, live: true },
  { id: "sales", label: "Sales", icon: ShoppingCart, live: true },
  { id: "inventory", label: "Inventory", icon: Package, live: true },
  { id: "procurement", label: "Procurement", icon: ClipboardCheck, live: true },
  { id: "finance", label: "Finance", icon: Wallet, live: true },
  { id: "reports", label: "Reports", icon: BarChart3, live: true },
  { id: "hr", label: "HR", icon: Briefcase, live: true },
  { id: "manufacturing", label: "Manufacturing", icon: Factory, live: true },
  { id: "scm", label: "Supply Chain", icon: Truck, live: true },
  { id: "marketing", label: "Marketing", icon: Megaphone, live: true },
  { id: "ecommerce", label: "E-Commerce", icon: Store, live: true },
  { id: "pos", label: "Point of Sale", icon: ShoppingBag, live: true },
  { id: "documents", label: "Documents", icon: FileText, live: true },
  { id: "projects", label: "Projects", icon: Kanban, live: true },
  { id: "support", label: "Customer Support", icon: Headphones, live: true },
  { id: "analytics", label: "Analytics", icon: Gauge, live: true },
  { id: "notifications", label: "Notifications", icon: Bell, live: true },
  { id: "activity", label: "Activity Stream", icon: Activity, live: true },
  { id: "integrations", label: "Integration Hub", icon: Globe, live: true },
  { id: "workflows", label: "Workflow Studio", icon: GitBranch, live: true },
  { id: "collaboration", label: "Collaboration Hub", icon: MessageSquare, live: true },
  { id: "ai", label: "AI Assistant", icon: Brain, live: true },
  { id: "microfinance", label: "Microfinance", icon: HandCoins, live: true },
  { id: "vicoba", label: "VICOBA / SACCOS", icon: Users2, live: true },
  { id: "community", label: "Community Groups", icon: TreePine, live: true },
  { id: "healthcare", label: "Healthcare / Clinic", icon: HeartPulse, live: true },
  { id: "school",     label: "School Management",  icon: School,     live: true },
  { id: "pharmacy",   label: "Pharmacy Management",icon: Tablets,    live: true },
  { id: "hotel",      label: "Hotel & Hospitality",icon: Hotel,      live: true },
  { id: "fleet",      label: "Fleet Management",   icon: Bus,        live: true },
  { id: "banking",    label: "Banking & MFI",      icon: Landmark,   live: true },
  { id: "restaurant",     label: "Restaurant & F&B",   icon: UtensilsCrossed, live: true },
  { id: "employee-portal",label: "Employee Portal",     icon: UserCircle,      live: true },
];

export const STAGES = ["New", "Qualified", "Proposal", "Negotiation", "Won"];

export const STAGE_COLOR = {
  New: "#5B6472",
  Qualified: "#16A34A",
  Proposal: "#F59E0B",
  Negotiation: "#111827",
  Won: "#16A34A",
};

// A real gap the single-contact-per-lead model can't cover: an account
// usually has more than one person worth knowing — a decision maker and a
// day-to-day operational contact are rarely the same person. Contacts is
// a separate directory, loosely linked to a company name rather than a
// strict lead ID, since a contact can outlive any individual deal.
export const contactsSeed = [
  { id: "CON-01", name: "Amara Mwakisisile", title: "Procurement Manager", company: "Kilimo Fresh Distributors", email: "amara@kilimofresh.co.tz", phone: "+255 754 221 908", isPrimary: true },
  { id: "CON-02", name: "Joseph Mwakisisile", title: "Finance Director", company: "Kilimo Fresh Distributors", email: "j.mwakisisile@kilimofresh.co.tz", phone: "+255 754 221 910", isPrimary: false },
  { id: "CON-03", name: "David Chen", title: "Operations Director", company: "Meridian Logistics", email: "d.chen@meridianlog.com", phone: "+255 712 004 552", isPrimary: true },
  { id: "CON-04", name: "Halima Juma", title: "General Manager", company: "Baraka Hotels & Resorts", email: "halima@barakahotels.co.tz", phone: "+255 754 662 187", isPrimary: true },
  { id: "CON-05", name: "Grace Mmbaga", title: "Owner", company: "Uzuri Beauty Chain", email: "grace@uzuribeauty.tz", phone: "+255 767 331 220", isPrimary: true },
];

export const seedLeads = [
  { id: "L-0231", name: "Amara Mwakisisile", company: "Kilimo Fresh Distributors", stage: "Proposal", value: 18400, currency: "TZS000", owner: "J. Batenga", email: "amara@kilimofresh.co.tz", phone: "+255 754 221 908", industry: "Agriculture", lastActivity: "2h ago", score: 82, expectedCloseDate: "2026-07-20" },
  { id: "L-0230", name: "David Chen", company: "Meridian Logistics", stage: "Negotiation", value: 64200, currency: "TZS000", owner: "S. Kileo", email: "d.chen@meridianlog.com", phone: "+255 712 004 552", industry: "Logistics", lastActivity: "5h ago", score: 91, expectedCloseDate: "2026-07-12" },
  { id: "L-0229", name: "Grace Mmbaga", company: "Uzuri Beauty Chain", stage: "Won", value: 9800, currency: "TZS000", owner: "J. Batenga", email: "grace@uzuribeauty.tz", phone: "+255 767 331 220", industry: "Retail", lastActivity: "1d ago", score: 76, expectedCloseDate: null },
  { id: "L-0228", name: "Peter Okoth", company: "Coastal Construction Ltd", stage: "Qualified", value: 128000, currency: "TZS000", owner: "M. Fundi", email: "p.okoth@coastalcon.co.tz", phone: "+255 786 442 019", industry: "Construction", lastActivity: "1d ago", score: 68, expectedCloseDate: "2026-08-15" },
  { id: "L-0227", name: "Fatuma Salim", company: "Salim Wholesale Traders", stage: "New", value: 5200, currency: "TZS000", owner: "S. Kileo", email: "fatuma@salimwholesale.tz", phone: "+255 715 990 341", industry: "Wholesale", lastActivity: "2d ago", score: 54, expectedCloseDate: null },
  { id: "L-0226", name: "James Mutungi", company: "Nyota Pharmacy Group", stage: "Proposal", value: 22750, currency: "TZS000", owner: "M. Fundi", email: "james@nyotapharm.tz", phone: "+255 700 118 774", industry: "Pharmacy", lastActivity: "3d ago", score: 71, expectedCloseDate: "2026-07-25" },
  { id: "L-0225", name: "Halima Juma", company: "Baraka Hotels & Resorts", stage: "Negotiation", value: 96500, currency: "TZS000", owner: "J. Batenga", email: "halima@barakahotels.co.tz", phone: "+255 754 662 187", industry: "Hospitality", lastActivity: "4d ago", score: 88, expectedCloseDate: "2026-07-10" },
  { id: "L-0224", name: "Elias Rugambwa", company: "Rugambwa Auto Workshop", stage: "New", value: 3600, currency: "TZS000", owner: "S. Kileo", email: "elias@rugambwaauto.tz", phone: "+255 762 883 456", industry: "Automotive", lastActivity: "6d ago", score: 47, expectedCloseDate: null },
];

// ═══════════════════════════════════════════════════════════════════════════
// SMART ALERT ENGINE
// Cross-module automated intelligence. Scans all data sources and returns
// categorised, prioritised alerts. Senior-dev pattern: single source of
// truth for all warnings — no alert logic scattered across 33 modules.
// ═══════════════════════════════════════════════════════════════════════════
export function useSmartAlerts(data) {
  return useMemo(() => {
    const alerts = [];
    const today  = new Date();
    const in30   = new Date(today.getTime() + 30 * 86400000);
    const in7    = new Date(today.getTime() +  7 * 86400000);

    // ── Finance: Overdue invoices ─────────────────────────────────────────
    if (data.invoices) {
      const overdue = data.invoices.filter(inv =>
        inv.status !== "Paid" && inv.status !== "Cancelled" &&
        inv.dueDate && new Date(inv.dueDate) < today
      );
      if (overdue.length > 0) {
        const total = overdue.reduce((s, inv) => s + (inv.totalAmount || inv.total || 0), 0);
        alerts.push({
          id: "inv-overdue", module: "sales", priority: "high",
          category: "Finance",
          icon: "💸",
          title: overdue.length + " Overdue Invoice" + (overdue.length > 1 ? "s" : ""),
          detail: "TZS " + money(total) + "k unpaid · Oldest: " +
            (overdue.sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate))[0]?.customer || "Unknown"),
          action: "View Sales → Invoices",
        });
      }
    }

    // ── Inventory: Low / out of stock ─────────────────────────────────────
    if (data.inventory) {
      const low = data.inventory.filter(i => i.qtyOnHand <= (i.reorderLevel || 5));
      if (low.length > 0) {
        alerts.push({
          id: "inv-low", module: "inventory", priority: low.some(i => i.qtyOnHand === 0) ? "high" : "medium",
          category: "Inventory",
          icon: "📦",
          title: low.length + " Low-Stock Item" + (low.length > 1 ? "s" : ""),
          detail: low.slice(0, 3).map(i => i.name).join(", ") + (low.length > 3 ? " +" + (low.length-3) + " more" : ""),
          action: "View Inventory → Reorder Alerts",
        });
      }
    }

    // ── HR: Leave requests pending ────────────────────────────────────────
    if (data.leaveRequests) {
      const pending = data.leaveRequests.filter(l => l.status === "Pending");
      if (pending.length > 0) {
        alerts.push({
          id: "hr-leave", module: "hr", priority: "medium",
          category: "HR",
          icon: "🏖️",
          title: pending.length + " Pending Leave Request" + (pending.length > 1 ? "s" : ""),
          detail: pending.slice(0, 3).map(l => l.employeeName || l.employee || "Staff").join(", "),
          action: "View HR → Leave Management",
        });
      }
      // Upcoming leave starting this week
      const upcoming = data.leaveRequests.filter(l =>
        l.status === "Approved" &&
        l.startDate && new Date(l.startDate) >= today && new Date(l.startDate) <= in7
      );
      if (upcoming.length > 0) {
        alerts.push({
          id: "hr-upcoming-leave", module: "hr", priority: "low",
          category: "HR",
          icon: "📅",
          title: upcoming.length + " Staff on Leave This Week",
          detail: upcoming.map(l => l.employeeName || "Staff").join(", "),
          action: "View HR → Leave Calendar",
        });
      }
    }

    // ── Banking: NPL / overdue loans ──────────────────────────────────────
    if (data.bankLoans) {
      const npls = data.bankLoans.filter(l => l.status === "Overdue" || l.status === "Defaulted");
      if (npls.length > 0) {
        const nplAmt = npls.reduce((s, l) => s + (l.balance || 0), 0);
        alerts.push({
          id: "bank-npl", module: "banking", priority: "high",
          category: "Banking",
          icon: "🏦",
          title: npls.length + " Non-Performing Loan" + (npls.length > 1 ? "s" : ""),
          detail: "TZS " + money(nplAmt) + "k at risk · " + npls.map(l => l.client).slice(0,2).join(", "),
          action: "View Banking → Loans & Credit",
        });
      }
    }

    // ── Pharmacy: Drug expiry ──────────────────────────────────────────────
    if (data.phmStock) {
      const expiring = data.phmStock.filter(s => s.expiry && new Date(s.expiry) <= in30);
      const expired  = data.phmStock.filter(s => s.expiry && new Date(s.expiry) < today);
      if (expired.length > 0) {
        alerts.push({
          id: "phm-expired", module: "pharmacy", priority: "critical",
          category: "Pharmacy",
          icon: "💊",
          title: expired.length + " EXPIRED Drug" + (expired.length > 1 ? "s" : "") + " — Remove Immediately",
          detail: expired.map(s => s.drug).slice(0, 3).join(", "),
          action: "View Pharmacy → Expiry Alerts",
        });
      }
      if (expiring.length > expired.length) {
        const soon = expiring.filter(s => new Date(s.expiry) >= today);
        alerts.push({
          id: "phm-expiring", module: "pharmacy", priority: "high",
          category: "Pharmacy",
          icon: "⏳",
          title: soon.length + " Drug" + (soon.length > 1 ? "s" : "") + " Expiring Within 30 Days",
          detail: soon.map(s => s.drug).slice(0, 3).join(", "),
          action: "View Pharmacy → Expiry Alerts",
        });
      }
    }

    // ── Fleet: Insurance expiring ──────────────────────────────────────────
    if (data.vehicles) {
      const insExp = data.vehicles.filter(v => v.insurance && new Date(v.insurance) <= in30);
      if (insExp.length > 0) {
        alerts.push({
          id: "fleet-ins", module: "fleet", priority: "high",
          category: "Fleet",
          icon: "🚌",
          title: insExp.length + " Vehicle Insurance Expiring",
          detail: insExp.map(v => v.reg).join(", ") + " · Within 30 days",
          action: "View Fleet → Vehicles",
        });
      }
      const svcDue = data.vehicles.filter(v => v.mileage >= v.nextService - 2000);
      if (svcDue.length > 0) {
        alerts.push({
          id: "fleet-svc", module: "fleet", priority: "medium",
          category: "Fleet",
          icon: "🔧",
          title: svcDue.length + " Vehicle" + (svcDue.length > 1 ? "s" : "") + " Service Due",
          detail: svcDue.map(v => v.reg + " (" + v.mileage.toLocaleString() + "km)").join(", "),
          action: "View Fleet → Vehicles",
        });
      }
    }

    // ── School: Unpaid fees ───────────────────────────────────────────────
    if (data.schFees) {
      const unpaid = data.schFees.filter(f => f.status === "Unpaid" || f.status === "Partial");
      if (unpaid.length > 0) {
        const outstanding = unpaid.reduce((s, f) => s + (f.balance || 0), 0);
        alerts.push({
          id: "sch-fees", module: "school", priority: "medium",
          category: "School",
          icon: "🎓",
          title: unpaid.length + " Student" + (unpaid.length > 1 ? "s" : "") + " with Outstanding Fees",
          detail: "TZS " + money(outstanding) + "k unpaid this term",
          action: "View School → Fee Collection",
        });
      }
    }

    // ── Restaurant: Active orders in kitchen ──────────────────────────────
    if (data.rstOrders) {
      const active = data.rstOrders.filter(o => o.status === "Preparing");
      if (active.length > 0) {
        alerts.push({
          id: "rst-orders", module: "restaurant", priority: "low",
          category: "Restaurant",
          icon: "🍽️",
          title: active.length + " Order" + (active.length > 1 ? "s" : "") + " Being Prepared in Kitchen",
          detail: "Tables: " + active.map(o => o.table).join(", "),
          action: "View Restaurant → Kitchen Display",
        });
      }
    }

    // ── MFI: Overdue loans ────────────────────────────────────────────────
    if (data.mfiLoans) {
      const overdue = data.mfiLoans.filter(l => l.status === "Overdue" || l.status === "Defaulted");
      if (overdue.length > 0) {
        const amt = overdue.reduce((s, l) => s + (l.balance || 0), 0);
        alerts.push({
          id: "mfi-overdue", module: "microfinance", priority: "high",
          category: "Microfinance",
          icon: "🏧",
          title: overdue.length + " MFI Loan" + (overdue.length > 1 ? "s" : "") + " Overdue",
          detail: "TZS " + money(amt) + "k at risk",
          action: "View Microfinance → Loans",
        });
      }
    }

    // ── Hotel: Check-outs due today ───────────────────────────────────────
    if (data.htlBookings) {
      const checkOutToday = data.htlBookings.filter(b =>
        b.status === "Active" && b.checkOut === today.toISOString().slice(0, 10)
      );
      if (checkOutToday.length > 0) {
        alerts.push({
          id: "htl-checkout", module: "hotel", priority: "medium",
          category: "Hotel",
          icon: "🏨",
          title: checkOutToday.length + " Guest" + (checkOutToday.length > 1 ? "s" : "") + " Checking Out Today",
          detail: checkOutToday.map(b => b.guest + " (Room " + b.room + ")").join(", "),
          action: "View Hotel → Check-In/Out",
        });
      }
    }

    // Sort: critical → high → medium → low
    const priority = { critical: 0, high: 1, medium: 2, low: 3 };
    return alerts.sort((a, b) => (priority[a.priority] || 3) - (priority[b.priority] || 3));
  }, [
    data.invoices, data.inventory, data.leaveRequests,
    data.bankLoans, data.phmStock, data.vehicles,
    data.schFees, data.rstOrders, data.mfiLoans, data.htlBookings,
  ]);
}

// Alert priority colour maps
export const ALERT_PRIORITY = {

// ── useBulkSelect — table multi-select with actions ─────────────────────────
// Usage: const {selected,toggle,toggleAll,clearAll,isSelected,isAllSelected,count} = useBulkSelect(rows)

// ── useBulkSelect — table multi-select with actions ─────────────────────────
// Usage: const {selected,toggle,toggleAll,clearAll,isSelected,isAllSelected,count} = useBulkSelect(rows)
export function useBulkSelect(rows) {
  const [selected, setSelected] = useState(new Set());
  const ids = useMemo(() => rows.map(r => r.id), [rows]);

  const toggle    = useCallback(id => setSelected(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; }), []);
  const toggleAll = useCallback(() => setSelected(s => s.size === ids.length ? new Set() : new Set(ids)), [ids]);
  const clearAll  = useCallback(() => setSelected(new Set()), []);
  const isSelected     = useCallback(id => selected.has(id), [selected]);
  const isAllSelected  = selected.size > 0 && selected.size === ids.length;
  const isPartialSelected = selected.size > 0 && selected.size < ids.length;
  const selectedRows = rows.filter(r => selected.has(r.id));

  return { selected, selectedRows, toggle, toggleAll, clearAll, isSelected, isAllSelected, isPartialSelected, count: selected.size };
}

// ── BulkActionBar — shown when rows are selected ──────────────────────────────
export function BulkActionBar({ count, onClear, actions, accent }) {
  if (count === 0) return null;
  const col = accent || "#16A34A";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[12.5px] font-medium" style={{background:col+"0D",borderColor:col+"30"}}>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold" style={{background:col}}>{count}</div>
        <span style={{color:col}}>{count} item{count!==1?"s":""} selected</span>
      </div>
      <div className="flex gap-2 flex-1">
        {actions.map(a => (
          <button key={a.label} onClick={a.onClick} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-[11.5px]" style={{background:a.danger?"#EF4444":col}}>
            {a.icon && <a.icon size={12}/>}{a.label}
          </button>
        ))}
      </div>
      <button onClick={onClear} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={14}/></button>
    </div>
  );
}

// ── useAutoSave — debounce + supabase sync ────────────────────────────────────
// Runs the save fn 1.5s after changes stop.
export function useAutoSave(value, saveFn, delay) {
  const d = delay || 1500;
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;
  useEffect(() => {
    const t = setTimeout(() => saveRef.current(value), d);
    return () => clearTimeout(t);
  }, [value, d]);
}

// ── Stat comparison badge ─────────────────────────────────────────────────────
export function DeltaBadge({ current, previous, format, goodWhenPositive }) {
  if (!previous || previous === 0) return null;
  const delta = ((current - previous) / Math.abs(previous) * 100).toFixed(1);
  const isGood = goodWhenPositive !== false ? Number(delta) > 0 : Number(delta) < 0;
  const col = isGood ? "#16A34A" : "#EF4444";
  return (
    <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{background:col+"15",color:col}}>
      {Number(delta) > 0 ? "▲" : "▼"} {Math.abs(Number(delta))}%
    </span>
  );
}

// Standard sales-forecasting convention: probability of closing derived
// from pipeline stage, not a number typed in per-lead — keeps weighted
// pipeline value real and consistent rather than a guess with a decimal.
export const STAGE_PROBABILITY = { New: 10, Qualified: 35, Proposal: 60, Negotiation: 80, Won: 100, Lost: 0 };

/* ══════════════ AUTHENTICATION ══════════════ */
/* ---------------------------------- AUTHENTICATION ----------------------------------- */

// Expanded from 12 broad categories to real SME-specific granularity —
// verified against actual SokoBook screenshots (not a general assumption
// about what categories "should" exist), which showed roughly sixty
// specific categories in a searchable list. This replaces the earlier
// broad list built before this build had any real reference to check
// against.
export const COMPANY_CATEGORIES = [
  "Agriculture", "Auto / Parts", "Bakery", "Beauty Parlour", "Cable Operator", "Catering", "Clothing",
  "Computer Services", "Construction", "Consulting", "Cosmetics", "Dairy Products", "Education",
  "Electronics", "Entertainment", "Fashion Accessories", "Financial Services", "Fishing",
  "Food & Beverages", "Footwear", "Fresh House", "Fruits & Vegetables", "Furniture", "Garage",
  "Gift & Toys", "Grocery", "Handicrafts", "Hardware", "Healthcare & Pharmacy", "Hospitality & Tourism",
  "Hostel", "Hotel", "Information Technology", "Jewellery", "Kitchen Utensils", "Laundry",
  "Legal Services", "Logistics & Transport", "Maintenance Services", "Manufacturing",
  "Medical & Healthcare", "Mill", "Mobile & Accessories", "Music", "Non Profit", "Nursery", "Online",
  "Personal", "Petroleum", "Pet Stores", "Photo Studio", "Poultry", "Printing",
  "Professional Services", "Religious Store", "Restaurant & Cafe", "Retail & Wholesale", "Salon",
  "Security Services", "Sports & Fitness", "Stationery", "Street Foods", "Sweet Shop", "Tailoring",
  "Technology", "Textiles", "Tours & Travel", "Transportation", "Veterinary", "Waste Collection",
  "Water Jars", "Other",
];
