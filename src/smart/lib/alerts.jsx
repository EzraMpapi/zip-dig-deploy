import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Ban, Bell, Building2, CheckCircle2, ClipboardList, Clock, Factory, Landmark,
  LogOut, Package, ReceiptText, Repeat, Search, Wallet, Zap
} from "lucide-react";
import { TODAY, lineTotal, money } from "../lib/format.jsx";

/* ══════════════ AI ASSISTANT ══════════════ */
/* ------------------------------- AI ASSISTANT ---------------------------------- */

// Compact snapshot of live business state, rebuilt every turn so the model
// always reasons over current data — not whatever was true when the chat began.
// Scope-aware: each persona only receives the slice of live data relevant
// to it, not the whole business every time. Smaller, more focused context
// per question — the same reasoning behind Analytics' Operations dashboard
// only claiming the domains it actually covers, applied to prompt design.
// Detecting Unusual Expenses — a real, transparent rule, not a black-box
// anomaly score: an expense is flagged when it's more than double its own
// category's average, computed from every OTHER expense in that category
// (so a category with one expense never flags itself against nothing).
// Same "every flag traces to a visible reason" rule as the Business Health
// Score on the Dashboard, applied to a new domain.
export function detectUnusualExpenses(expenseRows) {
  const byCategory = {};
  expenseRows.forEach((e) => { (byCategory[e.category] = byCategory[e.category] || []).push(e); });

  const flagged = [];
  expenseRows.forEach((e) => {
    const peers = byCategory[e.category].filter((p) => p.id !== e.id);
    if (peers.length < 2) return; // not enough data in this category to call anything "unusual"
    const avg = peers.reduce((s, p) => s + p.amount, 0) / peers.length;
    if (avg > 0 && e.amount > avg * 2) {
      flagged.push({ id: e.id, vendor: e.vendor, category: e.category, amount_tzs_k: e.amount, category_average_tzs_k: Math.round(avg), date: e.date, multiple: Math.round((e.amount / avg) * 10) / 10 });
    }
  });
  return flagged.sort((a, b) => b.multiple - a.multiple);
}

/* ══════════════ BUSINESS ALERTS (SHARED UTILITY) ══════════════ */
/* ----------------------------- BUSINESS ALERTS (SHARED UTILITY) ----------------------------- */

// Every alert here is computed from the same shared tables every module
// reads — nothing is a stored "notification" that can go stale. Clicking
// one navigates straight to the module where it can be acted on.
export function useBusinessAlerts({ inventory, invoices, expenses, leaveRequests, workOrders, subscriptions }) {
  return useMemo(() => {
    const alerts = [];
    const todayStr = TODAY.toISOString().slice(0, 10);

    const outOfStock = inventory.rows.filter((it) => it.qty <= 0);
    if (outOfStock.length) {
      alerts.push({
        id: "out-of-stock", icon: Ban, color: "#EF4444", target: "inventory",
        title: `${outOfStock.length} item${outOfStock.length > 1 ? "s" : ""} out of stock`,
        subtitle: outOfStock.slice(0, 2).map((i) => i.name).join(", ") + (outOfStock.length > 2 ? "…" : ""),
      });
    }

    const lowStock = inventory.rows.filter((it) => it.qty > 0 && it.qty <= it.reorder);
    if (lowStock.length) {
      alerts.push({
        id: "low-stock", icon: AlertCircle, color: "#F59E0B", target: "inventory",
        title: `${lowStock.length} item${lowStock.length > 1 ? "s" : ""} low on stock`,
        subtitle: lowStock.slice(0, 2).map((i) => i.name).join(", ") + (lowStock.length > 2 ? "…" : ""),
      });
    }

    const overdue = invoices.rows.filter((inv) => inv.status !== "Paid" && inv.dueDate && inv.dueDate < todayStr);
    if (overdue.length) {
      const total = overdue.reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0);
      alerts.push({
        id: "overdue-invoices", icon: Landmark, color: "#EF4444", target: "finance",
        title: `${overdue.length} invoice${overdue.length > 1 ? "s" : ""} overdue`,
        subtitle: `TZS ${money(Math.round(total))}k outstanding past due date`,
      });
    }

    const pendingExpenses = expenses.rows.filter((e) => e.status === "Pending");
    if (pendingExpenses.length) {
      alerts.push({
        id: "pending-expenses", icon: Wallet, color: "#F59E0B", target: "finance",
        title: `${pendingExpenses.length} expense${pendingExpenses.length > 1 ? "s" : ""} awaiting payment`,
        subtitle: pendingExpenses.slice(0, 2).map((e) => e.vendor).join(", ") + (pendingExpenses.length > 2 ? "…" : ""),
      });
    }

    const unusualExpenses = detectUnusualExpenses(expenses.rows);
    if (unusualExpenses.length) {
      alerts.push({
        id: "unusual-expenses", icon: AlertCircle, color: "#EF4444", target: "finance",
        title: `${unusualExpenses.length} unusual expense${unusualExpenses.length > 1 ? "s" : ""} detected`,
        subtitle: unusualExpenses.slice(0, 2).map((e) => `${e.vendor} (${e.multiple}× ${e.category} average)`).join(", "),
      });
    }

    const pendingLeave = leaveRequests.rows.filter((l) => l.status === "Pending");
    if (pendingLeave.length) {
      alerts.push({
        id: "pending-leave", icon: Clock, color: "#F59E0B", target: "hr",
        title: `${pendingLeave.length} leave request${pendingLeave.length > 1 ? "s" : ""} awaiting approval`,
        subtitle: pendingLeave.slice(0, 2).map((l) => l.employee).join(", ") + (pendingLeave.length > 2 ? "…" : ""),
      });
    }

    const overdueOrders = workOrders.rows.filter((w) => w.status !== "Completed" && w.status !== "Cancelled" && w.dueDate && w.dueDate < todayStr);
    if (overdueOrders.length) {
      alerts.push({
        id: "overdue-work-orders", icon: Factory, color: "#F59E0B", target: "manufacturing",
        title: `${overdueOrders.length} work order${overdueOrders.length > 1 ? "s" : ""} behind schedule`,
        subtitle: overdueOrders.slice(0, 2).map((w) => w.product).join(", ") + (overdueOrders.length > 2 ? "…" : ""),
      });
    }

    const dueSubscriptions = subscriptions.rows.filter((s) => s.status === "Active" && s.nextBillingDate < todayStr);
    if (dueSubscriptions.length) {
      alerts.push({
        id: "subscriptions-due", icon: Repeat, color: "#F59E0B", target: "sales",
        title: `${dueSubscriptions.length} subscription${dueSubscriptions.length > 1 ? "s" : ""} due for billing`,
        subtitle: dueSubscriptions.slice(0, 2).map((s) => s.customer).join(", ") + (dueSubscriptions.length > 2 ? "…" : ""),
      });
    }

    return alerts;
  }, [inventory.rows, invoices.rows, expenses.rows, leaveRequests.rows, workOrders.rows, subscriptions.rows]);
}

export function NotificationCenter({ inventory, invoices, expenses, leaveRequests, workOrders, subscriptions, onNavigate }) {
  const [open, setOpen] = useState(false);
  const alerts = useBusinessAlerts({ inventory, invoices, expenses, leaveRequests, workOrders, subscriptions });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative text-slate-400 hover:text-slate-600"
        aria-label={"Notifications" + (alerts.length ? " (" + alerts.length + " alerts)" : "")}
      >
        <Bell size={17} strokeWidth={1.75} />
        {alerts.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-[#EF4444] rounded-full ring-1 ring-white flex items-center justify-center text-[9px] font-bold text-white leading-none">{alerts.length > 9 ? "9+" : alerts.length}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 w-[320px] bg-white rounded-xl border border-slate-200/80 shadow-lg z-40 overflow-hidden"
            style={{ animation: "toastIn .15s ease-out" }}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#111827]">Notifications</h3>
              {alerts.length > 0 && <span className="text-[11px] text-slate-400 font-mono">{alerts.length}</span>}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CheckCircle2 size={20} className="text-[#16A34A] mx-auto mb-2" />
                  <p className="text-[12.5px] text-slate-500">All clear — nothing needs attention right now.</p>
                </div>
              ) : (
                alerts.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      onClick={() => { onNavigate(a.target); setOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50/70 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${a.color}14` }}>
                        <Icon size={15} style={{ color: a.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-[#111827]">{a.title}</p>
                        <p className="text-[11.5px] text-slate-400 truncate">{a.subtitle}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {/* Daily Briefing quick-open */}
            <div className="px-3 py-2.5 border-t border-slate-100">
              <button
                onClick={() => { setOpen(false); if(window.__openDailyBrief) window.__openDailyBrief(); }}
                className="w-full flex items-center justify-center gap-1.5 text-[12px] font-bold text-white py-2 rounded-xl bg-[#0D2214] hover:bg-[#1a3a2a] transition-colors">
                📊 View Today&apos;s Daily Brief
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// A real command palette — the Cmd+K pattern every serious productivity
// tool uses (Linear, Notion, Superhuman, VS Code), deliberately chosen
// because it's not a pattern SME-focused competitors typically bother
// with at all. Genuinely useful for the exact person this system claims
// to serve at the "large business" end: someone doing the same handful
// of actions dozens of times a day, for whom reaching for a mouse and
// hunting through a sidebar is real, measurable friction. Only ever
// shows modules already in `modules` — the same RBAC- and entitlement-
// filtered list the sidebar itself uses, so this can never let someone
// jump to something they don't actually have access to.
export const PALETTE_ACTIONS = [
  { id: "new-invoice", label: "Create Invoice", module: "sales", intent: { tab: "invoices", openForm: true } },
  { id: "new-lead", label: "New Lead", module: "crm", intent: { tab: "leads" } },
  { id: "approve-leave", label: "Approve Leave", module: "hr", intent: { tab: "leave" } },
  { id: "record-payment", label: "Record Payment", module: "finance", intent: { tab: "receivables" } },
  { id: "record-expense", label: "Record Expense", module: "finance", intent: { tab: "expenses" } },
  { id: "settings", label: "Open Settings", module: "settings", intent: null },
];

export function CommandPalette({ modules, crm, invoices, inventory, expenses, onNavigate, onNavigateWithIntent, onClose }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const moduleResults = modules
    .filter((m) => m.label.toLowerCase().includes(query.toLowerCase()))
    .map((m) => ({ id: `mod-${m.id}`, label: m.label, icon: m.icon, kind: "Go to", action: () => onNavigate(m.id) }));

  const actionResults = PALETTE_ACTIONS
    .filter((a) => modules.some((m) => m.id === a.module)) // only real actions for modules this user can actually reach
    .filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    .map((a) => ({ id: a.id, label: a.label, icon: Zap, kind: "Quick action", action: () => (a.intent ? onNavigateWithIntent(a.module, a.intent) : onNavigate(a.module)) }));

  // Real global data search — actual customers, invoices, and products,
  // searchable from anywhere. RBAC is preserved by construction, not by a
  // separate check that could drift: each category only searches at all
  // if its parent module is already in the RBAC- and entitlement-filtered
  // `modules` list this palette receives — the identical source of truth
  // the sidebar renders from — so a role without CRM access never sees a
  // customer name surface here. Requires 2+ characters (a single letter
  // matches half of everything) and caps each category at 4 results so
  // the list stays scannable. Selecting a record lands on the right
  // module and tab — the real capability the intent system has — not a
  // deep-link to the exact record's detail panel, which the intent system
  // doesn't support and this doesn't pretend to.
  const q = query.trim().toLowerCase();
  const canSee = (moduleId) => modules.some((m) => m.id === moduleId);
  // Month understanding for queries like "Expenses July" — a real month
  // token (3+ letters, English) becomes a real YYYY-MM filter against the
  // current year; generic intent words ("expenses", "gharama") are
  // stripped rather than matched literally against vendor names.
  const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  let monthKey = null; const textTerms = [];
  for (const t of q.split(/\s+/).filter(Boolean)) {
    const mi = t.length >= 3 ? MONTH_NAMES.findIndex((m) => m.startsWith(t)) : -1;
    if (mi >= 0 && monthKey === null) monthKey = `${TODAY.getFullYear()}-${String(mi + 1).padStart(2, "0")}`;
    else if (!["expense", "expenses", "gharama"].includes(t)) textTerms.push(t);
  }
  const expText = textTerms.join(" ");
  const recordResults = q.length < 2 ? [] : [
    ...(canSee("crm") ? (crm?.rows || [])
      .filter((l) => l.company.toLowerCase().includes(q) || (l.name || "").toLowerCase().includes(q))
      .slice(0, 4)
      .map((l) => ({ id: `rec-lead-${l.id}`, label: l.company, sub: l.name, icon: Building2, kind: "Customer / Lead", action: () => onNavigateWithIntent("crm", { tab: "leads" }) })) : []),
    ...(canSee("sales") ? (invoices?.rows || [])
      .filter((inv) => inv.id.toLowerCase().includes(q) || inv.customer.toLowerCase().includes(q))
      .slice(0, 4)
      .map((inv) => ({ id: `rec-inv-${inv.id}`, label: inv.id, sub: `${inv.customer} · ${inv.status}`, icon: ReceiptText, kind: "Invoice", action: () => onNavigateWithIntent("sales", { tab: "invoices" }) })) : []),
    ...(canSee("inventory") ? (inventory?.rows || [])
      .filter((it) => it.name.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q))
      .slice(0, 4)
      .map((it) => ({ id: `rec-item-${it.sku}`, label: it.name, sub: `${it.sku} · ${it.qty} in stock`, icon: Package, kind: "Product", action: () => onNavigateWithIntent("inventory", { tab: "stock" }) })) : []),
    ...(canSee("finance") ? (expenses?.rows || [])
      .filter((e) => {
        const matchText = !expText || e.vendor.toLowerCase().includes(expText) || (e.category || "").toLowerCase().includes(expText);
        const matchMonth = !monthKey || (e.date || "").startsWith(monthKey);
        return (expText || monthKey) && matchText && matchMonth;
      })
      .slice(0, 4)
      .map((e) => ({ id: `rec-exp-${e.id}`, label: e.vendor, sub: `${e.category} · ${e.date} · TZS ${money(Math.round(e.amount))}k`, icon: ClipboardList, kind: "Expense", action: () => onNavigateWithIntent("finance", { tab: "expenses" }) })) : []),
  ];

  const results = [...recordResults, ...actionResults, ...moduleResults];

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[selectedIndex]) { results[selectedIndex].action(); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-[#111827]/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ animation: "fadeInUp .15s ease-out" }}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }} onKeyDown={handleKeyDown}
            placeholder="Search customers, invoices, products — or jump anywhere..."
            className="flex-1 outline-none text-[14px] placeholder:text-slate-400"
          />
          <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 && <p className="text-[12.5px] text-slate-400 text-center py-8">No matches.</p>}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <button
                key={r.id} onClick={() => { r.action(); onClose(); }} onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selectedIndex ? "bg-[#16A34A]/5" : ""}`}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: i === selectedIndex ? "#DCFCE7" : "#F3F4F6" }}>
                  <Icon size={14} style={{ color: i === selectedIndex ? "#16A34A" : "#94A3B8" }} />
                </div>
                <span className={`text-[13px] flex-1 min-w-0 ${i === selectedIndex ? "font-medium text-[#111827]" : "text-slate-600"}`}>
                  <span className="block truncate">{r.label}</span>
                  {r.sub && <span className="block text-[10.5px] text-slate-400 truncate font-normal">{r.sub}</span>}
                </span>
                <span className="text-[10.5px] text-slate-400 shrink-0">{r.kind}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ProfileMenu({ currentUser, session, onSignOut }) {
  const [open, setOpen] = useState(false);
  const initials = currentUser.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-medium"
        style={{ background: "linear-gradient(135deg, #22C55E, #15803D)", boxShadow: "0 3px 10px rgba(34,197,94,.4)" }}
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-slate-200/80 shadow-lg z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-[13px] font-medium text-[#111827] truncate">{currentUser.name}</p>
              <p className="text-[11.5px] text-slate-400">{currentUser.role}</p>
              {session && !session.demo && <p className="text-[10.5px] text-slate-400 truncate mt-0.5">{session.email}</p>}
            </div>
            {(!session || session.demo) && (
              <p className="px-4 py-2.5 text-[11px] text-slate-400 border-b border-slate-100">Demo session — not a real signed-in account.</p>
            )}
            <button onClick={onSignOut} className="w-full flex items-center gap-2 text-[12.5px] text-[#EF4444] hover:bg-[#FEE2E2] px-4 py-2.5 text-left transition-colors">
              <LogOut size={13} /> {session && !session.demo ? "Sign out" : "Exit demo"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
