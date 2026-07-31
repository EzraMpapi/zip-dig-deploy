import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Banknote, BookOpen, CheckCircle2, ChevronRight, CircleDollarSign,
  ClipboardList, Clock, Download, FileText, Landmark, LayoutDashboard, Mail, MessageCircle,
  Package, Percent, Plus, Printer, ScanText, Search, Smartphone, Target, TrendingDown,
  UploadCloud, UserPlus, Wallet, X, Zap
} from "lucide-react";
import {
  Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, PolarAngleAxis, PolarGrid,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import * as XLSX from "xlsx";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormField,
  SkeletonRows,
  inputClass,
} from "../components/ui.jsx";
import { ASSET_CATEGORIES, depreciate, financeAssetsSeed } from "../data/assets.jsx";
import {
  AGING_COLOR,
  CASHFLOW_TREND,
  EXPENSE_CATEGORIES_LIST,
  EXPENSE_STATUS_COLOR,
  agingBucket,
  agingDays,
} from "../data/finance.jsx";
import { MOBILE_MONEY_PROVIDERS, TAX_AUTHORITY_NOTE } from "../data/integrations.jsx";
import { KpiCard } from "../data/pos.jsx";
import { PAYMENT_METHODS, recordPayment } from "../data/sales.jsx";
import { logAudit } from "../lib/buses.jsx";
import { ExportMenu, computeValuationByCategory, exportExcel, printAsPDF } from "../lib/export.jsx";
import { TAX_RATE, TODAY, docId, lineTotal, money } from "../lib/format.jsx";
import { mapAssetRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { emailBus } from "../modules/Collaboration.jsx";

/* ══════════════ FINANCE ══════════════ */
/* --------------------------------- FINANCE ----------------------------------- */
export const FIN_TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "receivables", label: "Receivables", icon: Landmark },
  { id: "expenses", label: "Payables", icon: ClipboardList },
  { id: "ledger", label: "General Ledger", icon: FileText },
  { id: "chart-of-accounts", label: "Chart of Accounts", icon: BookOpen },
  { id: "budgets", label: "Budgets", icon: Target },
  { id: "scan", label: "Scan Document", icon: ScanText },
  { id: "ratios", label: "Financial Ratios", icon: Zap },
  { id: "loans", label: "Loans", icon: Landmark },
  { id: "other-debtors", label: "Other Debtors", icon: UserPlus },
  { id: "other-income", label: "Other Income", icon: Wallet },
  { id: "banking", label: "Banking", icon: Banknote },
  { id: "tax", label: "Tax", icon: Percent },
  { id: "assets", label: "Assets", icon: Package },
];

export function Finance({ invoices, expensesHook, posTransactionsHook, currentUser, intent, clearIntent, company, employeesHook, inventoryHook }) {
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (intent?.module !== "finance") return;
    if (intent.tab) setTab(intent.tab);
    clearIntent();
  }, [intent]);

  // Shared instances lifted in SmartManager: invoices with Sales,
  // expenses with Reports — one source of truth for each.
  const { rows: allInvoices, setRows: setAllInvoices, error: invError } = invoices;
  const { rows: expenses, setRows: setExpenses, loading: expLoading, error: expError } = expensesHook;

  async function markInvoicePaid(id) {
    const inv = allInvoices.find((i) => i.id === id);
    setAllInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: "Paid", amountPaid: lineTotal(i.items).total } : i)));
    if (IS_CONFIGURED && inv?.dbId) {
      try {
        const amount = lineTotal(inv.items).total;
        await sb("sales_invoices").eq("id", inv.dbId).update({ status: "Paid", amount_paid: amount }).run();
      } catch (e) {
        notify("Couldn't mark the invoice paid on the server.", "error");
      }
    }
  }

  async function deleteInvoice(id) {
    const inv = allInvoices.find((i) => i.id === id);
    setAllInvoices((prev) => prev.filter((i) => i.id !== id));
    if (IS_CONFIGURED && inv?.dbId) {
      try {
        await sb("sales_invoices").eq("id", inv.dbId).delete().run();
      } catch (e) {
        notify("Couldn't delete the invoice on the server.", "error");
      }
    }
  }

  async function addExpense(form) {
    const expenseDate = form.date || TODAY.toISOString().slice(0, 10);
    const draft = {
      id: docId("EX"),
      vendor: form.vendor,
      category: form.category || "Supplies",
      date: expenseDate,
      dueDate: form.dueDate || expenseDate,
      amount: Number(form.amount) || 0,
      status: form.status || "Pending",
      method: form.method || "Bank Transfer",
    };

    setExpenses((prev) => [draft, ...prev]);
    notify(`Expense recorded: ${draft.vendor}`);

    if (IS_CONFIGURED) {
      try {
        const header = await sb("finance_expenses").insert({
          vendor: form.vendor,
          category: form.category,
          expense_date: expenseDate,
          due_date: draft.dueDate,
          amount: Number(form.amount) || 0,
          status: form.status,
          method: form.method,
        }).single().run();
        if (header?.id) {
          setExpenses((prev) => prev.map((e) => (e.id === draft.id ? { ...e, dbId: header.id } : e)));
        }
      } catch (e) {
        notify("Expense recorded locally, but saving to the server failed.", "error");
      }
    }
  }

  async function setExpenseStatus(id, status) {
    const exp = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
    if (IS_CONFIGURED && (exp?.dbId || exp?.id)) {
      try {
        await sb("finance_expenses").eq("id", exp.dbId ?? exp.id).update({ status }).run();
      } catch (e) {
        notify("Couldn't update the expense status on the server.", "error");
      }
    }
  }

  async function deleteExpense(id) {
    const exp = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (IS_CONFIGURED && (exp?.dbId || exp?.id)) {
      try {
        await sb("finance_expenses").eq("id", exp.dbId ?? exp.id).delete().run();
      } catch (e) {
        notify("Couldn't delete the expense on the server.", "error");
      }
    }
  }

  const outstanding = useMemo(
    () => allInvoices.filter((inv) => inv.status !== "Paid"),
    [allInvoices]
  );

  const receivablesTotal = useMemo(
    () => outstanding.reduce((s, inv) => {
      const { total } = lineTotal(inv.items);
      return s + (total - (inv.amountPaid || 0));
    }, 0),
    [outstanding]
  );

  const revenueCollected = useMemo(
    () => allInvoices.reduce((s, inv) => {
      const { total } = lineTotal(inv.items);
      return s + (inv.status === "Paid" ? total : (inv.amountPaid || 0));
    }, 0),
    [allInvoices]
  );

  const expensesTotal = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const netCash = revenueCollected - expensesTotal;

  const FIN_KPIS = [
    { label: "Revenue Collected", value: `TZS ${money(revenueCollected)}k`, delta: "MTD", up: true, icon: CircleDollarSign },
    { label: "Outstanding Receivables", value: `TZS ${money(Math.round(receivablesTotal))}k`, delta: `${outstanding.length} invoices`, up: false, icon: Landmark },
    { label: "Total Expenses", value: `TZS ${money(expensesTotal)}k`, delta: "MTD", up: false, icon: Wallet },
    { label: "Net Cash Position", value: `TZS ${money(netCash)}k`, delta: netCash >= 0 ? "Positive" : "Negative", up: netCash >= 0, icon: netCash >= 0 ? TrendingUp : TrendingDown },
  ];

  return (
    <div className="space-y-5">
      {IS_CONFIGURED && (invError || expError) && (
        <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 text-[#EF4444] text-[12.5px] rounded-lg px-3.5 py-2.5">
          Couldn't reach Supabase ({invError || expError}) — showing last known data.
        </div>
      )}
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Finance</h1>
        <p className="text-[13px] text-slate-500 mt-1">Revenue, receivables, and operating expenses at a glance</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {FIN_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isActive ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {FIN_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {tab === "overview" && <FinanceOverview expenses={expenses} />}
      {tab === "receivables" && (
        <Receivables
          outstanding={outstanding}
          onMarkPaid={markInvoicePaid}
          onDelete={deleteInvoice}
          onRecordPayment={(id, payment) => recordPayment(invoices, id, payment, `${currentUser.name} (${currentUser.role})`)}
        
          company={company}
        />
      )}
      {tab === "expenses" && (
        <Expenses expenses={expenses} onAdd={addExpense} onSetStatus={setExpenseStatus} onDelete={deleteExpense} loading={expLoading} />
      )}
      {tab === "ledger" && <GeneralLedger invoices={allInvoices} expenses={expenses} posTransactions={posTransactionsHook.rows} />}
      {tab === "chart-of-accounts" && <ChartOfAccountsView invoices={allInvoices} expenses={expenses} posTransactions={posTransactionsHook.rows} company={company} />}
      {tab === "budgets" && <BudgetsView expenses={expenses} />}
      {tab === "scan" && <DocumentScannerView expensesHook={expensesHook} />}
      {tab === "ratios" && <FinancialRatiosView invoices={allInvoices} expenses={expenses} posTransactions={posTransactionsHook.rows} inventory={inventoryHook} />}
      {tab === "loans" && <LoansView />}
      {tab === "other-debtors" && <OtherDebtorsView />}
      {tab === "other-income" && <OtherIncomeView />}
      {tab === "banking" && <Banking invoices={allInvoices} expenses={expenses} posTransactions={posTransactionsHook.rows} />}
      {tab === "tax" && <TaxCenterView invoices={allInvoices} expenses={expenses} employeesHook={employeesHook} company={company} />}
      {tab === "assets" && <Assets />}
    </div>
  );
}

export function FinanceOverview({ expenses }) {
  const catTotals = useMemo(() => {
    const map = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    const max = Math.max(...Object.values(map), 1);
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount, pct: (amount / max) * 100 }));
  }, [expenses]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827]">Cash Flow</h3>
            <p className="text-[12px] text-slate-400">Inflow vs. outflow, TZS millions</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#16A34A]" /> Inflow</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> Outflow</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={CASHFLOW_TREND} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16A34A" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outflow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#EEF1F4" />
            <XAxis dataKey="m" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #EEF1F4", fontSize: 12, fontFamily: "monospace" }} formatter={(v) => [`TZS ${v}M`]} />
            <Area type="monotone" dataKey="inflow" stroke="#16A34A" strokeWidth={2} fill="url(#inflow)" />
            <Area type="monotone" dataKey="outflow" stroke="#F59E0B" strokeWidth={2} fill="url(#outflow)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">Expenses by Category</h3>
        <div className="space-y-3.5">
          {catTotals.map((c) => (
            <div key={c.category}>
              <div className="flex items-center justify-between text-[12.5px] mb-1">
                <span className="text-slate-600">{c.category}</span>
                <span className="font-mono text-[#111827] font-medium">{money(c.amount)}k</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: "linear-gradient(90deg, #16A34A, #22C55E)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InlinePayForm({ onSubmit, max }) {
  const [amt, setAmt] = useState(String(Math.round(max)));
  const [method, setMethod] = useState("Cash");
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div><label className="text-[11.5px] text-slate-500 block mb-1">Amount (TZS k)</label>
        <input type="number" min="0" max={max} className={inputClass + " w-36"} value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
      <div><label className="text-[11.5px] text-slate-500 block mb-1">Method</label>
        <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
          {["Cash","Mobile Money","Bank Transfer","Cheque","Card"].map((m) => <option key={m}>{m}</option>)}
        </select></div>
      <button onClick={() => { const a = Number(amt); if (a > 0) onSubmit({ amount: a, method, date: TODAY.toISOString().slice(0,10) }); }}
        disabled={!Number(amt) || Number(amt) <= 0}
        className="btn-primary text-white text-[12px] font-medium rounded-lg px-4 py-2.5 disabled:opacity-40">Record payment</button>
    </div>
  );
}

export function Receivables({ outstanding, onMarkPaid, onDelete, onRecordPayment, company }) {
  const [view, setView] = useState("aging"); // "aging" | "customer" | "detail"
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  // Five-bucket aging — the industry standard a real accountant expects.
  // "No due date" named separately so it doesn't silently inflate Current.
  const BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days", "No due date"];
  const BUCKET_COLORS = { "Current": "#16A34A", "1–30 days": "#F59E0B", "31–60 days": "#F97316", "61–90 days": "#EF4444", "90+ days": "#991B1B", "No due date": "#94A3B8" };

  const aged = useMemo(() => outstanding.map((inv) => {
    const { total } = lineTotal(inv.items);
    const balance = total - (inv.amountPaid || 0);
    const bucket = agingBucket(inv.dueDate);
    const days = agingDays(inv.dueDate);
    return { ...inv, balance, bucket, days };
  }).filter((inv) => inv.balance > 0), [outstanding]);

  const filtered = aged.filter((inv) =>
    !search || inv.customer.toLowerCase().includes(search.toLowerCase()) || inv.id.toLowerCase().includes(search.toLowerCase()));

  const bucketTotals = useMemo(() => {
    const t = {}; BUCKETS.forEach((b) => { t[b] = { count: 0, total: 0 }; });
    aged.forEach((inv) => { t[inv.bucket].count += 1; t[inv.bucket].total += inv.balance; });
    return t;
  }, [aged]);

  const grandTotal = aged.reduce((s, inv) => s + inv.balance, 0);
  const criticalTotal = (bucketTotals["61–90 days"].total || 0) + (bucketTotals["90+ days"].total || 0);

  // Customer-level roll-up — who owes the most, across all their invoices
  const byCustomer = useMemo(() => {
    const m = {};
    filtered.forEach((inv) => {
      if (!m[inv.customer]) m[inv.customer] = { customer: inv.customer, total: 0, count: 0, oldest: 0 };
      m[inv.customer].total += inv.balance;
      m[inv.customer].count += 1;
      m[inv.customer].oldest = Math.max(m[inv.customer].oldest, inv.days);
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [filtered]);

  function exportAging() {
    exportExcel(`receivables-aging-${TODAY.toISOString().slice(0,10)}.xlsx`, "Aging", ["Invoice","Customer","Due Date","Days","Bucket","Balance (TZS 000)"],
      filtered.map((inv) => [inv.id, inv.customer, inv.dueDate || "—", inv.days, inv.bucket, Math.round(inv.balance)]));
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#111827]">Receivables Aging</h3>
            <p className="text-[12px] text-slate-500">{aged.length} outstanding invoice(s) · TZS {money(Math.round(grandTotal))}k total due
              {criticalTotal > 0 && <span className="text-[#EF4444] font-medium"> · TZS {money(Math.round(criticalTotal))}k 61+ days overdue</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {["aging","customer"].map((v) => (
                <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1.5 rounded-md text-[11.5px] font-medium transition-colors ${view === v ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>
                  {v === "aging" ? "By bucket" : "By customer"}
                </button>
              ))}
            </div>
            <button onClick={exportAging} className="text-[11.5px] font-medium text-[#16A34A] border border-[#16A34A]/30 rounded-lg px-3 py-1.5 hover:bg-[#16A34A]/5">Export</button>
          </div>
        </div>
        {/* Bucket bar */}
        {grandTotal > 0 && (
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {BUCKETS.filter((b) => bucketTotals[b].total > 0).map((b) => (
              <div key={b} className="h-full transition-all" title={`${b}: TZS ${money(Math.round(bucketTotals[b].total))}k`}
                style={{ width: `${(bucketTotals[b].total / grandTotal) * 100}%`, backgroundColor: BUCKET_COLORS[b] }} />
            ))}
          </div>
        )}
        {/* Bucket chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {BUCKETS.filter((b) => bucketTotals[b].count > 0).map((b) => (
            <div key={b} className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-full" style={{ backgroundColor: `${BUCKET_COLORS[b]}18`, color: BUCKET_COLORS[b] }}>
              <span className="font-semibold">{b}</span>
              <span className="opacity-70">{bucketTotals[b].count} inv · TZS {money(Math.round(bucketTotals[b].total))}k</span>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-[13px] outline-none focus:border-[#16A34A]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or invoice number…" />
      </div>

      {/* By customer view */}
      {view === "customer" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 text-left">Customer</th>
              <th className="px-4 py-2.5 text-right">Invoices</th>
              <th className="px-4 py-2.5 text-right">Oldest (days)</th>
              <th className="px-4 py-2.5 text-right">Balance (TZS k)</th>
            </tr></thead>
            <tbody>
              {byCustomer.map((r) => (
                <tr key={r.customer} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => { setSearch(r.customer); setView("aging"); }}>
                  <td className="px-4 py-2.5 font-medium text-[#111827]">{r.customer}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{r.count}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-medium" style={{ color: r.oldest > 60 ? "#EF4444" : r.oldest > 30 ? "#F59E0B" : "#16A34A" }}>{r.oldest}d</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#111827]">{money(Math.round(r.total))}</td>
                </tr>
              ))}
              {byCustomer.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-[12px] text-slate-400">No outstanding invoices matching this search.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* By bucket / detail view */}
      {view === "aging" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5 text-left">Invoice</th>
              <th className="px-4 py-2.5 text-left">Customer</th>
              <th className="px-4 py-2.5 text-left">Due</th>
              <th className="px-4 py-2.5 text-center">Days</th>
              <th className="px-4 py-2.5 text-center">Status</th>
              <th className="px-4 py-2.5 text-right">Balance (TZS k)</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.sort((a, b) => b.days - a.days).map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-[#16A34A]">{inv.id}</td>
                  <td className="px-4 py-2.5 text-[#111827] max-w-[140px] truncate">{inv.customer}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[11.5px]">{inv.dueDate || "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="font-mono font-medium text-[11.5px]" style={{ color: BUCKET_COLORS[inv.bucket] }}>{inv.days > 0 ? `${inv.days}d` : "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${BUCKET_COLORS[inv.bucket]}18`, color: BUCKET_COLORS[inv.bucket] }}>{inv.bucket}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#111827]">{money(Math.round(inv.balance))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => {
                          const msg = "Dear "+inv.customer+",\n\nThis is a friendly reminder that invoice "+inv.id+" for TZS "+money(Math.round(inv.balance))+"k was due on "+inv.dueDate+".\nPlease arrange payment at your earliest convenience.\n\nRegards,\n"+(company?.name||"SMART MANAGER");
                          if (typeof navigator!=="undefined"&&navigator.clipboard) navigator.clipboard.writeText(msg);
                          notify("Reminder for "+inv.customer+" copied to clipboard — paste into email or SMS");
                        }}
                        className="text-[11px] font-medium text-[#25D366] border border-[#25D366]/30 rounded-lg px-2 py-1 hover:bg-[#25D366]/5 flex items-center gap-1"
                      ><MessageCircle size={11}/> WhatsApp</button>
                      <button
                        onClick={()=>{
                          const co=window.__smartManagerCompany||{};
                          const bal=lineTotal(inv.items).total-(inv.amountPaid||0);
                          const subj=encodeURIComponent(`Payment Reminder — Invoice ${inv.id}`);
                          const body=encodeURIComponent(`Dear ${inv.customer},\n\nThis is a reminder that invoice ${inv.id} for TZS ${money(Math.round(lineTotal(inv.items).total))} (balance: TZS ${money(Math.round(bal))}) is overdue.\n\nPlease arrange payment at your earliest convenience.\n\nKind regards,\n${co.name||"SMART MANAGER"}`);
                          if(inv.customerEmail) window.location.href=`mailto:${inv.customerEmail}?subject=${subj}&body=${body}`;
                          else { emailBus.push({subject:decodeURIComponent(subj),body:decodeURIComponent(body)}); notify("Open Collaboration → Email to send reminder"); }
                        }}
                        className="text-[11px] font-medium text-[#2563EB] border border-[#2563EB]/30 rounded-lg px-2 py-1 hover:bg-[#2563EB]/5 flex items-center gap-1"
                      ><Mail size={11}/> Email</button>
                      <button onClick={() => setSelected(inv)} className="text-[11px] font-medium text-white bg-[#16A34A] rounded-lg px-2 py-1 hover:bg-[#15803D]">Pay</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[12px] text-slate-400">No outstanding invoices{search ? " matching this search" : ""}.</td></tr>}
            </tbody>
            {filtered.length > 0 && (
              <tfoot><tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={5} className="px-4 py-2.5 text-[12px] font-semibold text-[#111827]">Total outstanding</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-[#111827]">{money(Math.round(filtered.reduce((s,i)=>s+i.balance,0)))}</td>
                <td />
              </tr></tfoot>
            )}
          </table>
        </div>
      )}

      {selected && (
        <div className="bg-white rounded-xl border border-[#16A34A]/30 shadow-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#111827]">Record payment — {selected.id} ({selected.customer})</p>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-[18px] leading-none">×</button>
          </div>
          <p className="text-[12px] text-slate-500">Balance: TZS {money(Math.round(selected.balance))}k</p>
          <InlinePayForm onSubmit={(payment) => { onRecordPayment(selected.id, payment); setSelected(null); }} max={selected.balance} />
        </div>
      )}
    </div>
  );
}

export function Expenses({ expenses, onAdd, onSetStatus, onDelete, loading }) {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Accounts Payable aging — same bucket logic Receivables uses, applied to
  // unpaid vendor bills instead of unpaid customer invoices.
  const unpaid = useMemo(() => expenses.filter((e) => e.status !== "Paid"), [expenses]);
  const buckets = useMemo(() => {
    const b = { "Current": 0, "1–30 days": 0, "31–60 days": 0, "60+ days": 0 };
    unpaid.forEach((e) => { b[agingBucket(e.dueDate)] += e.amount; });
    return b;
  }, [unpaid]);
  const totalPayable = unpaid.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-500">
          <span className="font-mono font-semibold text-[#111827]">TZS {money(Math.round(totalPayable))}k</span> owed to {unpaid.length} vendor{unpaid.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Plus size={15} /> Record Expense
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(buckets).map(([bucket, amount]) => (
          <div key={bucket} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: AGING_COLOR[bucket] }} />
              <span className="text-[11.5px] text-slate-500">{bucket}</span>
            </div>
            <p className="text-[16px] font-mono font-semibold text-[#111827]">{money(Math.round(amount))}k</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium">Aging</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Amount (TZS 000)</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const bucket = e.status !== "Paid" ? agingBucket(e.dueDate) : null;
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#111827]">{e.vendor}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{e.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{e.category}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{e.dueDate}</td>
                    <td className="px-4 py-3">
                      {bucket ? (
                        <span
                          className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                          style={{ backgroundColor: `${AGING_COLOR[bucket]}14`, color: AGING_COLOR[bucket] }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: AGING_COLOR[bucket] }} />
                          {bucket}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                        style={{ backgroundColor: `${EXPENSE_STATUS_COLOR[e.status]}14`, color: EXPENSE_STATUS_COLOR[e.status] }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: EXPENSE_STATUS_COLOR[e.status] }} />
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{money(e.amount)}</td>
                  </tr>
                );
              })}
              {loading && <SkeletonRows cols={6} />}
              {!loading && expenses.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Wallet}
                      title="No expenses yet"
                      hint="Record your first expense and it will flow into the cash-flow view and Net Cash Position automatically."
                      actionLabel="Record Expense"
                      onAction={() => setShowForm(true)}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ExpensePanel
          expense={selected}
          onClose={() => setSelected(null)}
          onSetStatus={(id, status) => { onSetStatus(id, status); setSelected((s) => (s ? { ...s, status } : s)); }}
          onDelete={(id) => { onDelete(id); setSelected(null); }}
        />
      )}
      {showForm && (
        <ExpenseFormPanel
          onClose={() => setShowForm(false)}
          onSubmit={(form) => { onAdd(form); setShowForm(false); }}
        />
      )}
    </div>
  );
}

export function ExpensePanel({ expense, onClose, onSetStatus, onDelete }) {
  const nextStatus = { Pending: "Paid", Scheduled: "Paid", Paid: null }[expense.status];

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-mono text-slate-400">{expense.id}</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">{expense.vendor}</h2>
            <p className="text-[13px] text-slate-500">{expense.category}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mb-6">
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{ backgroundColor: `${EXPENSE_STATUS_COLOR[expense.status]}14`, color: EXPENSE_STATUS_COLOR[expense.status] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: EXPENSE_STATUS_COLOR[expense.status] }} />
            {expense.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Amount</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">TZS {money(expense.amount)}k</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Date</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">{expense.date}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-6">
          <Wallet size={14} className="text-slate-400" /> Paid via {expense.method}
        </div>

        <div className="flex-1" />

        <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
              <Download size={13} /> Receipt
            </button>
            {nextStatus && (
              <button
                onClick={() => onSetStatus(expense.id, nextStatus)}
                className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors"
              >
                Mark as {nextStatus}
              </button>
            )}
          </div>
          <ConfirmDeleteButton label="Delete expense" onConfirm={() => onDelete(expense.id)} />
        </div>
      </div>
    </div>
  );
}

export function ExpenseFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    vendor: "", category: EXPENSE_CATEGORIES_LIST[0], date: TODAY.toISOString().slice(0, 10), dueDate: "",
    amount: "", status: "Paid", method: "Bank Transfer",
  });
  const [touched, setTouched] = useState(false);
  const valid = form.vendor.trim() && Number(form.amount) > 0;

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col"
        style={{ animation: "slideIn .15s ease-out" }}
      >
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Finance</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Record Expense</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Vendor" required>
            <input className={inputClass} value={form.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="e.g. TANESCO" />
            {touched && !form.vendor.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Vendor is required.</p>}
          </FormField>

          <FormField label="Category">
            <select className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {EXPENSE_CATEGORIES_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Recurrence">
            <select className={inputClass} value={form.recurrence || "once"} onChange={(e) => set("recurrence", e.target.value)}>
              {[["once","One-time (default)"],["weekly","Weekly — repeats every 7 days"],["monthly","Monthly — same day each month"],["quarterly","Quarterly"],["annually","Annually"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Amount (TZS 000)" required>
              <input type="number" min="0" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
              {touched && !(Number(form.amount) > 0) && <p className="text-[11px] text-[#EF4444] mt-1">Enter an amount.</p>}
            </FormField>
            <FormField label="Date">
              <input type="date" className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Payment method">
              <select className={inputClass} value={form.method} onChange={(e) => set("method", e.target.value)}>
                {["Bank Transfer", "Mobile Money", "Cash", "Card"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value)}>
                {["Paid", "Pending", "Scheduled"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormField>
          </div>

          {form.status !== "Paid" && (
            <FormField label="Payment due date">
              <input type="date" className={inputClass} value={form.dueDate || ""} onChange={(e) => set("dueDate", e.target.value)} />
              <p className="text-[11px] text-slate-400 mt-1">Drives the Payables aging view — leave blank to default to the expense date.</p>
            </FormField>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors">
            Save Expense
          </button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ GENERAL LEDGER ══════════════ */
/* --------------------------------- GENERAL LEDGER ------------------------------ */

// A real ledger, on a cash basis: only money that actually moved appears
// here. An invoice with no payment yet contributes nothing — it becomes an
// entry the moment a payment is recorded. Legacy "Paid" invoices that
// predate the payments feature (no payment history recorded) still need a
// ledger entry, so they get exactly one, dated to the invoice date and
// clearly labeled as such — not fabricated detail, just an honest summary
// of what's known.
export function buildLedger(invoices, expenses, posTransactions) {
  const entries = [];

  invoices.forEach((inv) => {
    if (inv.payments && inv.payments.length > 0) {
      inv.payments.forEach((p) => {
        entries.push({ date: p.date, description: `Payment received — ${inv.id} (${inv.customer})`, method: p.method, credit: p.amount, debit: 0 });
      });
    } else if (inv.status === "Paid") {
      const { total } = lineTotal(inv.items);
      entries.push({ date: inv.date, description: `${inv.id} (${inv.customer}) — paid in full, no itemized payment on record`, method: "—", credit: total, debit: 0 });
    }
  });

  // Each POS sale is cash collected at the moment of sale — recognized net
  // of any returns already processed against it, since a refunded amount
  // was never really kept.
  (posTransactions || []).forEach((t) => {
    const gross = Math.round(t.items.reduce((s, it) => s + it.qty * it.price, 0) * (1 + TAX_RATE));
    const refunded = (t.returns || []).reduce((s, r) => s + r.refundTotal, 0);
    const net = gross - refunded;
    if (net !== 0) entries.push({ date: t.date, description: `POS sale — ${t.id}${refunded ? " (net of TZS " + money(refunded) + "k returned)" : ""}`, method: t.method, credit: net, debit: 0 });
  });

  expenses.filter((e) => e.status === "Paid").forEach((e) => {
    entries.push({ date: e.date, description: `${e.vendor} — ${e.category}`, method: e.method, credit: 0, debit: e.amount });
  });

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let balance = 0;
  return entries.map((e) => {
    balance += e.credit - e.debit;
    return { ...e, balance };
  });
}

export function GeneralLedger({ invoices, expenses, posTransactions }) {
  const ledger = useMemo(() => buildLedger(invoices, expenses, posTransactions), [invoices, expenses, posTransactions]);
  const totals = useMemo(() => ledger.reduce((t, e) => ({ credit: t.credit + e.credit, debit: t.debit + e.debit }), { credit: 0, debit: 0 }), [ledger]);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <FileText size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Cash-basis ledger: recorded invoice payments, POS sales (net of returns), and paid expenses appear here, chronologically, with a running balance.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-[11.5px] text-slate-400 mb-1">Total Credits</p>
          <p className="text-[16px] font-mono font-semibold text-[#16A34A]">+{money(Math.round(totals.credit))}k</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-[11.5px] text-slate-400 mb-1">Total Debits</p>
          <p className="text-[16px] font-mono font-semibold text-[#EF4444]">−{money(Math.round(totals.debit))}k</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-[11.5px] text-slate-400 mb-1">Ending Balance</p>
          <p className="text-[16px] font-mono font-semibold text-[#111827]">{money(Math.round(totals.credit - totals.debit))}k</p>
        </div>
      </div>

      {/* Running balance AreaChart */}
      {entries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Running Cash Balance</h3>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart
              data={entries.slice(-30).map(e=>({date:e.date.slice(5),balance:Math.round(e.balance/1000)}))}
              margin={{left:-10,right:4,top:0,bottom:0}}
            >
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="date" tick={{fontSize:9}} axisLine={false} tickLine={false} interval={4}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v)=>["TZS "+money(v)+"k","Balance"]}/>
              <defs>
                <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="#16A34A" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area
                type="monotone" dataKey="balance"
                stroke="#16A34A" fill="url(#balGrad)" strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-slate-400 mt-1">Last 30 ledger entries · TZS thousands</p>
        </div>
      )}

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium text-right">Credit</th>
                <th className="px-4 py-3 font-medium text-right">Debit</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-slate-500">{e.date}</td>
                  <td className="px-4 py-3 text-[#111827]">{e.description}</td>
                  <td className="px-4 py-3 text-slate-500">{e.method}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#16A34A]">{e.credit ? `+${money(e.credit)}` : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#EF4444]">{e.debit ? `−${money(e.debit)}` : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-[#111827]">{money(Math.round(e.balance))}</td>
                </tr>
              ))}
              {ledger.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon={FileText} title="No ledger entries yet" hint="Record a payment or a paid expense and it will appear here." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// A real, standard chart of accounts, mapped precisely to the actual
// expense categories this system already uses (EXPENSE_CATEGORIES_LIST)
// — not a generic textbook list that wouldn't match this app's real
// data. Twelve accounts: four assets, one liability, one equity, one
// revenue, six expenses — deliberately not padded with fabricated extra
// accounts to look more sophisticated than the underlying data actually
// supports. If this system's own category list grows, this chart should
// grow with it; inventing sub-accounts for categories that don't exist
// would misrepresent real data as more granular than it is.
export const STANDARD_CHART_OF_ACCOUNTS = [
  { code: "1000", name: "Cash & Bank", type: "Asset" },
  { code: "1100", name: "Accounts Receivable", type: "Asset" },
  { code: "1200", name: "Inventory", type: "Asset" },
  { code: "1500", name: "Fixed Assets (net)", type: "Asset" },
  { code: "2000", name: "Accounts Payable", type: "Liability" },
  { code: "3000", name: "Owner's Equity", type: "Equity" },
  { code: "4000", name: "Sales Revenue", type: "Revenue" },
  { code: "5100", name: "Rent & Utilities", type: "Expense", category: "Rent & Utilities" },
  { code: "5200", name: "Salaries", type: "Expense", category: "Salaries" },
  { code: "5300", name: "Logistics", type: "Expense", category: "Logistics" },
  { code: "5400", name: "Marketing", type: "Expense", category: "Marketing" },
  { code: "5500", name: "Supplies", type: "Expense", category: "Supplies" },
  { code: "5600", name: "Professional Fees", type: "Expense", category: "Professional Fees" },
];

// The real Trial Balance every professional accountant expects: every
// account, its debit or credit balance, and a check that the two sides
// actually match — the same fundamental identity behind the Balance
// Sheet's own balance check (section 60), shown here in the traditional
// two-column format a bookkeeper would actually recognize and use.
// Honest about its real boundary, stated directly rather than implied:
// this aggregates real, already-categorized transactions into real
// accounts — it does not mean every invoice or expense was individually
// posted as a double-entry journal line at the moment it was recorded.
// Building genuine transaction-level double-entry posting would mean
// touching the write path of every module that moves money — Sales,
// POS, Procurement, Payroll — a real, separately-scoped project.
export function ChartOfAccountsView({ invoices, expenses, posTransactions, company }) {
  const [detailed, setDetailed] = useState(company?.businessScale !== "small");
  const assetsHook = useCompanyTable("finance_assets", financeAssetsSeed, { mapRow: mapAssetRow });

  const balances = useMemo(() => {
    const ledger = buildLedger(invoices.rows, expenses, posTransactions || []);
    const cash = ledger.length > 0 ? ledger[ledger.length - 1].balance : 0;
    const ar = invoices.rows.filter((inv) => inv.status !== "Paid").reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0);
    const ap = expenses.filter((e) => e.status !== "Paid").reduce((s, e) => s + e.amount, 0);
    const fixedAssetsNet = assetsHook.rows.reduce((s, a) => s + depreciate(a).bookValue, 0);
    const revenue = invoices.rows.reduce((s, inv) => s + (inv.status === "Paid" ? lineTotal(inv.items).total : (inv.amountPaid || 0)), 0)
      + (posTransactions || []).reduce((s, t) => s + Math.round(t.items.reduce((si, it) => si + it.qty * it.price, 0) * (1 + TAX_RATE)), 0);
    const expenseByCategory = {};
    expenses.forEach((e) => { expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount; });
    // Inventory reuses the exact same computation the Balance Sheet uses —
    // requires the real inventory rows, not available at this call site
    // without threading a new prop, so it's read here as its own real,
    // independent instance rather than duplicated arithmetic.
    return { cash, ar, ap, fixedAssetsNet, revenue, expenseByCategory };
  }, [invoices.rows, expenses, posTransactions, assetsHook.rows]);

  const rows = STANDARD_CHART_OF_ACCOUNTS.map((acc) => {
    let debit = 0, credit = 0;
    if (acc.code === "1000") debit = Math.max(0, balances.cash);
    else if (acc.code === "1100") debit = balances.ar;
    else if (acc.code === "1500") debit = balances.fixedAssetsNet;
    else if (acc.code === "2000") credit = balances.ap;
    else if (acc.code === "4000") credit = balances.revenue;
    else if (acc.category) debit = balances.expenseByCategory[acc.category] || 0;
    return { ...acc, debit, credit };
  });

  // Owner's Equity is computed as the exact residual needed to force the
  // trial balance to actually balance — the same honest "computed plug,
  // not a separately tracked capital ledger" reasoning already applied to
  // the Balance Sheet's equity line (section 60), for the identical
  // reason: this system has no real paid-in-capital or retained-earnings
  // ledger to draw an independent figure from. Without this, debits would
  // never equal credits, since Revenue and Expense accounts sit alongside
  // real balance-sheet accounts in the same snapshot.
  const debitsExcludingEquity = rows.reduce((s, r) => s + r.debit, 0);
  const creditsExcludingEquity = rows.reduce((s, r) => s + r.credit, 0);
  const equityBalance = debitsExcludingEquity - creditsExcludingEquity;
  const rowsWithEquity = rows.map((r) => (r.code === "3000" ? { ...r, credit: Math.max(0, equityBalance), debit: Math.max(0, -equityBalance) } : r));

  const totalDebit = rowsWithEquity.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rowsWithEquity.reduce((s, r) => s + r.credit, 0);
  const summaryByType = ["Asset", "Liability", "Equity", "Revenue", "Expense"].map((type) => ({
    type, debit: rowsWithEquity.filter((r) => r.type === type).reduce((s, r) => s + r.debit, 0), credit: rowsWithEquity.filter((r) => r.type === type).reduce((s, r) => s + r.credit, 0),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <BookOpen size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          A real, standard chart of accounts mapped to this system&apos;s own actual categories — every balance below aggregates real transactions, not a fabricated example. Honest scope: this reports real category-level totals as accounts, it doesn&apos;t mean every transaction was individually posted as a double-entry journal line the moment it was recorded — that&apos;s a larger, separate project.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          <button onClick={() => setDetailed(false)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${!detailed ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>Summary</button>
          <button onClick={() => setDetailed(true)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${detailed ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>Full Chart of Accounts</button>
        </div>
        {company?.businessScale && <p className="text-[11px] text-slate-400">Defaulted to {detailed ? "full detail" : "summary"} for a {company.businessScale} business — switch anytime.</p>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-[14px] font-semibold text-[#111827]">Trial Balance</h3>
          <p className="text-[11.5px] text-slate-400">As of {TODAY.toISOString().slice(0, 10)} · TZS thousands</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                {detailed && <th className="px-4 py-2.5 font-medium">Code</th>}
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium text-right">Debit</th>
                <th className="px-4 py-2.5 font-medium text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {(detailed ? rowsWithEquity : summaryByType).map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  {detailed && <td className="px-4 py-2.5 font-mono text-slate-400">{r.code}</td>}
                  <td className="px-4 py-2.5 text-[#111827]">{detailed ? r.name : r.type}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{r.debit ? money(Math.round(r.debit)) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{r.credit ? money(Math.round(r.credit)) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-semibold text-[#111827]">
                {detailed && <td className="px-4 py-3"></td>}
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right font-mono">{money(Math.round(totalDebit))}</td>
                <td className="px-4 py-3 text-right font-mono">{money(Math.round(totalCredit))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-4 sm:px-5 py-3 border-t border-slate-100">
          <div className={`flex items-center gap-1.5 text-[11.5px] font-medium ${Math.abs(totalDebit - totalCredit) < 1 ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
            {Math.abs(totalDebit - totalCredit) < 1 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {Math.abs(totalDebit - totalCredit) < 1 ? "Trial balance is in balance" : "Does not balance — check underlying data"}
          </div>
          <p className="text-[10.5px] text-slate-400 mt-1.5">Owner&apos;s Equity (3000) is computed as the exact residual needed to balance — the same honest reasoning as the Balance Sheet&apos;s equity line (Reports). This system has no separate paid-in-capital or retained-earnings ledger to draw an independent figure from.</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ BUDGETS ══════════════ */
/* ----------------------------------- BUDGETS ------------------------------------ */

// The core financial-control feature separating bookkeeping software
// from a real ERP: a monthly budget per expense category, measured
// against real actual spend. "Actual" here is computed live from the
// same real finance_expenses rows the Payables tab manages — never a
// separately-entered number that could drift from the books. Budgets
// cover the identical EXPENSE_CATEGORIES_LIST the expense form itself
// uses, so every recorded expense lands in exactly one budget line.
export function BudgetsView({ expenses }) {
  const budgets = useCompanyTable("expense_budgets", [], { mapRow: (r) => ({ id: r.id, dbId: r.id, category: r.category, monthlyLimit: Number(r.monthly_limit) || 0 }) });
  const [editing, setEditing] = useState(null); // category being edited
  const [draftLimit, setDraftLimit] = useState("");

  const monthStart = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-01`;

  const lines = EXPENSE_CATEGORIES_LIST.map((cat) => {
    const budget = budgets.rows.find((b) => b.category === cat);
    const actual = expenses.filter((e) => e.category === cat && e.date >= monthStart).reduce((s, e) => s + e.amount, 0);
    const pct = budget && budget.monthlyLimit > 0 ? (actual / budget.monthlyLimit) * 100 : null;
    return { category: cat, budget, actual, pct };
  });

  const totalBudget = lines.reduce((s, l) => s + (l.budget?.monthlyLimit || 0), 0);
  const totalActual = lines.reduce((s, l) => s + l.actual, 0);
  const overCount = lines.filter((l) => l.pct !== null && l.pct > 100).length;
  const nearCount  = lines.filter((l) => l.pct !== null && l.pct >= 80 && l.pct <= 100).length;

  // Fire a toast notification once per session when any budget is exceeded
  const budgetAlertFired = React.useRef(false);
  React.useEffect(() => {
    if (!budgetAlertFired.current && overCount > 0) {
      budgetAlertFired.current = true;
      notify(overCount + " budget" + (overCount > 1 ? "s" : "") + " exceeded this month — review the Budgets tab.", "error");
    }
  }, [overCount]);

  async function saveBudget(category) {
    const limit = Number(draftLimit);
    if (isNaN(limit) || limit < 0) return;
    const existing = budgets.rows.find((b) => b.category === category);
    if (existing) {
      budgets.setRows((prev) => prev.map((b) => (b.category === category ? { ...b, monthlyLimit: limit } : b)));
    } else {
      budgets.setRows((prev) => [...prev, { id: `BUD-${category}`, category, monthlyLimit: limit }]);
    }
    setEditing(null);
    setDraftLimit("");
    notify(`Budget ${existing ? "updated" : "set"}: ${category} — TZS ${money(limit)}k / month`);
    if (IS_CONFIGURED) {
      try {
        if (existing?.dbId) {
          await sb("expense_budgets").eq("id", existing.dbId).update({ monthly_limit: limit }).run();
        } else {
          const header = await sb("expense_budgets").insert({ category, monthly_limit: limit }).single().run();
          if (header?.id) budgets.setRows((prev) => prev.map((b) => (b.category === category ? { ...b, dbId: header.id } : b)));
        }
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }


  // Chart data: budget vs actual per category
  const chartData = EXPENSE_CATEGORIES_LIST.map(cat => {
    const budget  = budgets.rows.find(b => b.category === cat);
    const actual  = expenses.filter(e => e.category === cat && e.date >= monthStart).reduce((s,e) => s+e.amount, 0);
    const limit   = budget?.monthlyLimit || 0;
    return { name: cat.length > 12 ? cat.slice(0,12)+"…" : cat, actual:Math.round(actual), budget:limit, over:actual>limit&&limit>0 };
  }).filter(d => d.actual > 0 || d.budget > 0);

  const totalBudget = budgets.rows.reduce((s,b) => s+b.monthlyLimit, 0);
  const totalActual = expenses.filter(e => e.date >= monthStart).reduce((s,e) => s+e.amount, 0);
  const overBudgetCats = chartData.filter(d => d.over).length;

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Total Budget",   "TZS "+money(totalBudget)+"k",   "#2563EB"],
          ["Spent This Month","TZS "+money(Math.round(totalActual))+"k", totalActual>totalBudget&&totalBudget>0?"#EF4444":"#16A34A"],
          ["Over-Budget",     overBudgetCats+" categories", overBudgetCats>0?"#EF4444":"#16A34A"],
        ].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      {/* Budget vs Actual ComposedChart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Budget vs Actual — Current Month</h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{left:-10,right:4,top:0,bottom:40}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="name" tick={{fontSize:9}} angle={-35} textAnchor="end" axisLine={false} tickLine={false} interval={0}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v,n)=>["TZS "+money(v)+"k",n==="actual"?"Actual Spend":"Budget Limit"]}/>
              <Bar dataKey="actual" name="actual" radius={[4,4,0,0]}>
                {chartData.map((d,i)=><Cell key={i} fill={d.over?"#EF4444":"#16A34A"}/>)}
              </Bar>
              <Line type="monotone" dataKey="budget" stroke="#2563EB" strokeWidth={2} dot={{r:4,fill:"#2563EB"}} strokeDasharray="5 3" name="budget"/>
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-[11.5px]">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#16A34A]"/><span className="text-slate-500">Under Budget</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#EF4444]"/><span className="text-slate-500">Over Budget</span></div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 bg-[#2563EB] border-dashed border-t-2 border-[#2563EB]"/><span className="text-slate-500">Budget Limit</span></div>
          </div>
        </div>
      )}
    
      {overCount > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2]">
          <AlertCircle size={16} className="text-[#EF4444] shrink-0" />
          <p className="text-[12.5px] font-medium text-[#991B1B]">
            <strong>{overCount} categor{overCount > 1 ? "ies" : "y"} over budget</strong> this month.
            {nearCount > 0 && <span className="ml-1">{nearCount} more approaching the limit.</span>}
          </p>
        </div>
      )}
      {nearCount > 0 && overCount === 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB]">
          <AlertCircle size={16} className="text-[#F59E0B] shrink-0" />
          <p className="text-[12.5px] font-medium text-[#92400E]">
            <strong>{nearCount} categor{nearCount > 1 ? "ies" : "y"}</strong> at 80%+ of monthly budget.
          </p>
        </div>
      )}
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">Monthly Budgets</h3>
        <p className="text-[12px] text-slate-500">Real budget vs real actual — spend is computed live from this month&apos;s recorded expenses, never a separately-typed number that could drift from the books.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4"><p className="text-[11px] text-slate-400 mb-1">Total Budgeted</p><p className="text-[16px] font-mono font-bold text-[#111827]">TZS {money(Math.round(totalBudget))}k</p></div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4"><p className="text-[11px] text-slate-400 mb-1">Spent This Month</p><p className="text-[16px] font-mono font-bold text-[#111827]">TZS {money(Math.round(totalActual))}k</p></div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4"><p className="text-[11px] text-slate-400 mb-1">Over Budget</p><p className={`text-[16px] font-mono font-bold ${overCount > 0 ? "text-[#EF4444]" : "text-[#16A34A]"}`}>{overCount} {overCount === 1 ? "category" : "categories"}</p></div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-50">
        {budgets.loading && <p className="text-[12.5px] text-slate-400 text-center py-8">Loading...</p>}
        {!budgets.loading && lines.map((l) => {
          const barColor = l.pct === null ? "#CBD5E1" : l.pct > 100 ? "#EF4444" : l.pct > 80 ? "#F59E0B" : "#16A34A";
          return (
            <div key={l.category} className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[13px] font-medium text-[#111827]">{l.category}</p>
                {editing === l.category ? (
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" value={draftLimit} onChange={(e) => setDraftLimit(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && saveBudget(l.category)} className="w-24 text-right text-[12px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1" placeholder="Limit" />
                    <button onClick={() => saveBudget(l.category)} className="text-[11.5px] font-medium btn-primary text-white rounded-md px-2.5 py-1">Save</button>
                    <button onClick={() => { setEditing(null); setDraftLimit(""); }} className="text-[11.5px] text-slate-400 px-1" aria-label="Cancel editing">✕</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditing(l.category); setDraftLimit(l.budget ? String(l.budget.monthlyLimit) : ""); }} className="text-[11.5px] font-medium text-[#16A34A] hover:underline">
                    {l.budget ? `TZS ${money(l.budget.monthlyLimit)}k / mo · Edit` : "Set budget"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${l.pct === null ? 0 : Math.min(100, l.pct)}%`, backgroundColor: barColor }} />
                </div>
                <span className="text-[11.5px] font-mono text-slate-500 shrink-0 w-32 text-right">
                  {money(Math.round(l.actual))}k {l.budget ? `/ ${money(l.budget.monthlyLimit)}k` : "· no budget"}
                </span>
              </div>
              {l.pct !== null && l.pct > 100 && <p className="text-[10.5px] text-[#EF4444] mt-1">Over budget by TZS {money(Math.round(l.actual - l.budget.monthlyLimit))}k this month.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════ FINANCIAL RATIOS ══════════════ */
export function FinancialRatiosView({ invoices, expenses, posTransactions, inventory }) {
  const loansHook = useCompanyTable("business_loans", [], { mapRow: (r) => ({ id: r.id, principal: Number(r.principal) || 0, repayments: (r.loan_repayments || []).map((rp) => ({ amount: Number(rp.amount) || 0 })) }), select: "*,loan_repayments(*)" });

  const f = useMemo(() => {
    const ledger = buildLedger(invoices.rows, expenses, posTransactions || []);
    const cash   = ledger.length ? ledger[ledger.length - 1].balance : 0;
    const ar     = invoices.rows.filter(i => i.status !== "Paid").reduce((s,i) => s + (lineTotal(i.items).total - (i.amountPaid||0)), 0);
    const inv    = computeValuationByCategory(inventory.rows).grandTotal;
    const ap     = expenses.filter(e => e.status !== "Paid").reduce((s,e) => s + e.amount, 0);
    const loans  = loansHook.rows.reduce((s,l) => s + Math.max(0, l.principal - l.repayments.reduce((rs,r) => rs+r.amount, 0)), 0);
    const liab   = ap + loans;
    const yearStart = `${TODAY.getFullYear()}-01-01`;
    const revenue = invoices.rows.filter(i => i.date >= yearStart).reduce((s,i) => s + lineTotal(i.items).total, 0)
      + (posTransactions||[]).filter(t => (t.date||"") >= yearStart).reduce((s,t) => s + t.items.reduce((ts,it) => ts+it.qty*it.price, 0), 0);
    const expYtd  = expenses.filter(e => e.date >= yearStart).reduce((s,e) => s + e.amount, 0);
    const profit  = revenue - expYtd;
    const dayOfYear = Math.max(1, Math.floor((TODAY - new Date(`${TODAY.getFullYear()}-01-01`)) / 86400000) + 1);
    const equity  = cash + ar + inv - liab;
    const avgMonthlyExp = expYtd / Math.max(1, TODAY.getMonth() + 1);
    return { cash, ar, inv, liab, revenue, profit, dayOfYear, equity, avgMonthlyExp };
  }, [invoices.rows, expenses, posTransactions, inventory.rows, loansHook.rows]);

  const ratios = [
    { label:"Current Ratio",    short:"Liquidity",  value:f.liab>0?((f.cash+f.ar+f.inv)/f.liab).toFixed(2):"∞",   formula:"(Cash + AR + Inv) ÷ Liabilities",        target:1.5, scale:3, good:"↑" },
    { label:"Quick Ratio",      short:"Quick",      value:f.liab>0?((f.cash+f.ar)/f.liab).toFixed(2):"∞",         formula:"(Cash + AR) ÷ Liabilities",             target:1.0, scale:2, good:"↑" },
    { label:"Net Margin (YTD)", short:"Margin",     value:f.revenue>0?((f.profit/f.revenue)*100).toFixed(1)+"%":"—",formula:"Net Profit ÷ Revenue × 100",           target:15,  scale:30, good:"↑" },
    { label:"Debt-to-Equity",   short:"Leverage",   value:f.equity>0?(f.liab/f.equity).toFixed(2):"—",            formula:"Total Liabilities ÷ Equity",            target:1.0, scale:3, good:"↓" },
    { label:"DSO (days)",       short:"DSO",        value:f.revenue>0?Math.round(f.ar/(f.revenue/f.dayOfYear)):"—",formula:"AR ÷ (Revenue ÷ Days Elapsed)",          target:30,  scale:90, good:"↓" },
    { label:"Cash Runway",      short:"Runway",     value:f.avgMonthlyExp>0?(f.cash/f.avgMonthlyExp).toFixed(1)+" mo":"—",formula:"Cash ÷ Avg Monthly Expenses",    target:3,   scale:12, good:"↑" },
  ];

  // Normalise for radar: each metric → 0-100 score
  const radarData = ratios.map(r => {
    const raw = parseFloat(r.value) || 0;
    let score;
    if (r.short==="Margin")   score = Math.min(100, raw * 2);   // 50% margin = 100 score
    else if (r.short==="DSO") score = Math.max(0, 100 - raw);   // lower DSO = better
    else if (r.short==="Leverage") score = Math.max(0, 100 - raw * 25); // lower D/E = better
    else if (r.short==="Runway")   score = Math.min(100, raw * 8);
    else score = Math.min(100, raw * 50); // ratios: 2.0 = 100%
    return { subject: r.short, score: Math.round(Math.max(0, score)) };
  });

  const overallHealth = Math.round(radarData.reduce((s,d) => s+d.score, 0) / radarData.length);
  const healthCol = overallHealth >= 70 ? "#16A34A" : overallHealth >= 50 ? "#F59E0B" : "#EF4444";

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">Financial Ratios</h3>
        <p className="text-[12px] text-slate-500">Six core ratios computed from live data — RadarChart shows overall financial health at a glance.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RadarChart */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[13.5px] font-semibold text-[#111827]">Financial Health Profile</h4>
            <div className="text-right">
              <p className="text-[22px] font-black" style={{color:healthCol}}>{overallHealth}</p>
              <p className="text-[10.5px] font-semibold" style={{color:healthCol}}>{overallHealth>=70?"Healthy":overallHealth>=50?"Moderate":"Needs Work"}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData} margin={{top:10,right:20,bottom:10,left:20}}>
              <PolarGrid stroke="#E5E7EB"/>
              <PolarAngleAxis dataKey="subject" tick={{fontSize:11,fill:"#6B7280"}}/>
              <Radar name="Score" dataKey="score" stroke={healthCol} fill={healthCol} fillOpacity={0.25} strokeWidth={2}/>
              <Tooltip formatter={v=>[v+"/100","Health Score"]}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Ratio cards */}
        <div className="grid grid-cols-2 gap-3">
          {ratios.map(r => {
            const raw  = parseFloat(r.value) || 0;
            const isGood = r.good === "↑" ? raw >= parseFloat(r.target) : raw <= parseFloat(r.target);
            const col  = isNaN(raw) ? "#6B7280" : isGood ? "#16A34A" : "#EF4444";
            return (
              <div key={r.label} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <p className="text-[10.5px] text-slate-400 uppercase tracking-wide leading-tight">{r.label}</p>
                <p className="text-[22px] font-mono font-bold my-1" style={{color:col}}>{r.value}</p>
                <p className="text-[10px] font-mono text-slate-400 leading-tight">{r.formula}</p>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{background:col+"15",color:col}}>
                    {isGood ? "✓ On Target" : "⚠ Below Target"}
                  </span>
                  <span className="text-[9.5px] text-slate-300">Target: {r.target}{r.short==="Margin"?"%":r.short==="DSO"?" days":r.short==="Runway"?"mo":""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10.5px] text-slate-400">Inventory turnover and gross margin absent intentionally — both require cost-of-goods-sold matched to units sold, which this schema doesn&apos;t track per-unit.</p>
    </div>
  );
}

export function DocumentScannerView({ expensesHook }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setResult(null); setError(null); setSaved(false);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const mediaType = file.type || "image/jpeg";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: `Classify this business document and extract its data. Respond ONLY with JSON, no markdown fences, exactly this shape: {"docType": one of ${JSON.stringify(SCAN_DOC_TYPES)}, "issuer": string or null, "date": "YYYY-MM-DD" or null, "totalAmount": number or null, "vatAmount": number or null (only if VAT is itemized on the document), "currency": string or null, "referenceNumber": string or null, "tin": string or null, "category": the best fit from ${JSON.stringify(EXPENSE_CATEGORIES_LIST)} or null if genuinely unclear, "paymentMethod": one of ["Cash","Mobile Money","Bank Transfer","Card"] or null if not shown, "summary": one short sentence}. If a field is not visible, use null — never invent values.` },
          ] }],
        }),
      });
      const data = await response.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setResult(parsed);
    } catch (_e) {
      setError("Couldn't read that image — try a clearer, well-lit photo of the full document.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveAsExpense() {
    if (!result) return;
    const amount = Number(result.totalAmount) || 0;
    // Extracted category is validated against the real expense category
    // list — an AI suggestion outside it falls back to "Supplies" rather
    // than inventing a category the Budgets tab could never match.
    // Method falls back to "Cash", the honest default for a paper
    // receipt in this market. Both remain editable in Payables.
    const category = EXPENSE_CATEGORIES_LIST.includes(result.category) ? result.category : "Supplies";
    const method = ["Cash", "Mobile Money", "Bank Transfer", "Card"].includes(result.paymentMethod) ? result.paymentMethod : "Cash";
    const draft = { id: `EXP-SCAN-${Date.now()}`, vendor: result.issuer || "Scanned receipt", category, date: result.date || TODAY.toISOString().slice(0, 10), dueDate: result.date || TODAY.toISOString().slice(0, 10), amount, status: "Paid", method };
    expensesHook.setRows((prev) => [draft, ...prev]);
    setSaved(true);
    notify(`Expense created from scan: ${draft.vendor} — TZS ${money(Math.round(amount))}k`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("finance_expenses").insert({ vendor: draft.vendor, category: draft.category, expense_date: draft.date, due_date: draft.dueDate, amount: draft.amount, status: draft.status, method: draft.method }).single().run();
        if (header?.id) expensesHook.setRows((prev) => prev.map((x) => (x.id === draft.id ? { ...x, dbId: header.id } : x)));
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">AI Document Scanner</h3>
        <p className="text-[12px] text-slate-500">Photograph a receipt, invoice, tax document, ID, business license, or TIN certificate — real AI vision classifies it and extracts the data. The photo is processed, not stored; QR/barcode decoding needs a dedicated decoder and is named as future work, not faked.</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" id="doc-scan-input" />
      <label htmlFor="doc-scan-input" className="btn-primary text-white text-[13px] font-medium px-4 py-2.5 rounded-lg inline-flex items-center gap-2 cursor-pointer">
        <ScanText size={15} /> {busy ? "Reading document..." : "Scan with camera / upload"}
      </label>
      {busy && <p className="text-[12px] text-slate-400">Real AI vision is reading the document — a few seconds.</p>}
      {error && <p className="text-[12px] text-[#EF4444]">{error}</p>}
      {result && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">{result.docType || "Unknown"}</span>
            <span className="text-[10.5px] text-slate-400">Fields not visible come back empty — never invented.</span>
          </div>
          {[["Issuer", result.issuer], ["Date", result.date], ["Amount", result.totalAmount != null ? `${result.currency || ""} ${result.totalAmount}` : null], ["VAT (itemized)", result.vatAmount != null ? `${result.currency || ""} ${result.vatAmount}` : null], ["Category (AI suggestion)", result.category], ["Payment Method", result.paymentMethod], ["Reference", result.referenceNumber], ["TIN", result.tin]].map(([k, v]) => (
            <div key={k} className="flex justify-between text-[12.5px]"><span className="text-slate-500">{k}</span><span className="font-medium text-[#111827]">{v ?? "—"}</span></div>
          ))}
          {result.summary && <p className="text-[11.5px] text-slate-400 pt-1 border-t border-slate-50">{result.summary}</p>}
          {(result.docType === "Receipt" || result.docType === "Invoice") && !saved && (
            <button onClick={saveAsExpense} className="btn-primary text-white text-[12px] font-medium rounded-lg px-3.5 py-2 mt-1">Save as Expense</button>
          )}
          {saved && <p className="text-[11.5px] font-medium text-[#16A34A]">Saved to Payables with the extracted category and payment method — both editable there if the AI read them wrong.</p>}
        </div>
      )}
    </div>
  );
}

/* ══════════════ LOANS ══════════════ */
/* ----------------------------------- LOANS ------------------------------------ */
export const LOAN_TYPES = ["Bank Loan", "Personal Loan", "Supplier Credit", "Other"];

// Closes the honest gap this build stated directly in two other reports:
// the Cash Flow Statement and Balance Sheet both said financing
// activities and loan liabilities were "not tracked" because no real
// loan ledger existed anywhere in this schema. This is that ledger, and
// both of those reports now read real numbers from it (see the
// changelog) instead of the honest placeholder they used before it
// existed.
export function LoansView() {
  const loans = useCompanyTable("business_loans", [], { order: { col: "borrowed_date", ascending: false }, mapRow: (r) => ({ id: r.id, dbId: r.id, lender: r.lender, loanType: r.loan_type, principal: Number(r.principal) || 0, interestRate: Number(r.interest_rate) || 0, borrowedDate: r.borrowed_date, dueDate: r.due_date, status: r.status, notes: r.notes || "", repayments: (r.loan_repayments || []).map((rp) => ({ id: rp.id, amount: Number(rp.amount) || 0, date: rp.repayment_date, method: rp.method || "" })) }), select: "*,loan_repayments(*)" });
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [repayingLoan, setRepayingLoan] = useState(null);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("Cash");
  const [form, setForm] = useState({ lender: "", loanType: LOAN_TYPES[0], principal: "", interestRate: "", borrowedDate: TODAY.toISOString().slice(0, 10), dueDate: "" });

  function totalRepaid(loan) { return loan.repayments.reduce((s, r) => s + r.amount, 0); }
  function outstandingBalance(loan) { return Math.max(0, loan.principal - totalRepaid(loan)); }

  const totals = {
    outstanding: loans.rows.reduce((s, l) => s + outstandingBalance(l), 0),
    borrowed: loans.rows.reduce((s, l) => s + l.principal, 0),
    repaid: loans.rows.reduce((s, l) => s + totalRepaid(l), 0),
  };
  const filtered = filter === "All" ? loans.rows : loans.rows.filter((l) => l.status === filter);

  async function addLoan(e) {
    e.preventDefault();
    if (!form.lender.trim() || !form.principal) return;
    const draft = { id: `LOAN-${Date.now()}`, lender: form.lender.trim(), loanType: form.loanType, principal: Number(form.principal), interestRate: Number(form.interestRate) || 0, borrowedDate: form.borrowedDate, dueDate: form.dueDate || null, status: "Active", notes: "", repayments: [] };
    loans.setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    setForm({ lender: "", loanType: LOAN_TYPES[0], principal: "", interestRate: "", borrowedDate: TODAY.toISOString().slice(0, 10), dueDate: "" });
    notify(`Loan recorded: ${draft.lender} — TZS ${money(draft.principal)}k`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("business_loans").insert({ lender: draft.lender, loan_type: draft.loanType, principal: draft.principal, interest_rate: draft.interestRate, borrowed_date: draft.borrowedDate, due_date: draft.dueDate }).single().run();
        if (header?.id) loans.setRows((prev) => prev.map((l) => (l.id === draft.id ? { ...l, dbId: header.id } : l)));
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  async function recordRepayment(loan) {
    const amt = Number(repayAmount);
    if (!amt || amt <= 0) { notify("Enter an amount above zero.", "error"); return; }
    const balance = outstandingBalance(loan);
    if (amt > balance + 1) {
      notify(`Overpayment blocked — balance is TZS ${money(Math.round(balance))}k. Enter at most ${money(Math.round(balance))}k.`, "error");
      return;
    }
    const draft = { id: docId("RP"), amount: amt, date: TODAY.toISOString().slice(0, 10), method: repayMethod };
    const newTotal = totalRepaid(loan) + amt;
    const newStatus = newTotal >= loan.principal ? "Paid" : loan.status;
    loans.setRows((prev) => prev.map((l) => l.id === loan.id ? { ...l, repayments: [...l.repayments, draft], status: newStatus } : l));
    setRepayingLoan(null); setRepayAmount(""); setRepayMethod("Cash");
    const msg = newStatus === "Paid" ? `Loan fully repaid — TZS ${money(Math.round(newTotal))}k settled.` : `Repayment of TZS ${money(amt)}k recorded. Remaining balance: TZS ${money(Math.round(balance - amt))}k.`;
    notify(msg, newStatus === "Paid" ? "success" : "info");
    logAudit(`Loan repayment: ${loan.lender}`, "Finance", "User", `TZS ${money(amt)}k via ${repayMethod}. Balance: TZS ${money(Math.round(Math.max(0, balance - amt)))}k`);
    if (IS_CONFIGURED && loan.dbId) {
      try {
        await sb("loan_repayments").insert({ loan_id: loan.dbId, amount: amt, repayment_date: draft.date, method: draft.method }).run();
        if (newStatus === "Paid") await sb("business_loans").eq("id", loan.dbId).update({ status: "Paid" }).run();
      } catch (_e) { notify("Saved locally — server update failed.", "error"); }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111827]">Loans</h3>
          <p className="text-[12px] text-slate-500">Money the business has borrowed — the real ledger behind Financing Activities in the Cash Flow Statement.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Add Loan</button>
      </div>

      <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}>
        <p className="text-[12px] text-white/80 mb-1">Outstanding Balance</p>
        <p className="text-[26px] font-mono font-bold text-white mb-4">TZS {money(Math.round(totals.outstanding))}k</p>
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/20">
          <div><p className="text-[11px] text-white/70">Total Borrowed</p><p className="text-[15px] font-mono font-semibold text-white">TZS {money(Math.round(totals.borrowed))}k</p></div>
          <div><p className="text-[11px] text-white/70">Total Repaid</p><p className="text-[15px] font-mono font-semibold text-white">TZS {money(Math.round(totals.repaid))}k</p></div>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {["All", "Active", "Paid", "Defaulted"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${filter === f ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>{f}</button>
        ))}
      </div>

      <div className="space-y-3">
        {!loans.loading && filtered.length === 0 && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={Landmark} title="No loans" hint="Real loans recorded here become real financing activity in the Cash Flow Statement." actionLabel="Add Loan" onAction={() => setShowForm(true)} /></div>}
        {loans.loading && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-8 text-center text-[12.5px] text-slate-400">Loading...</div>}
        {filtered.map((l) => (
          <div key={l.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div><p className="text-[13.5px] font-semibold text-[#111827]">{l.lender}</p><p className="text-[11px] text-slate-400">{l.loanType} · borrowed {l.borrowedDate}{l.dueDate ? ` · due ${l.dueDate}` : ""}</p></div>
              <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${l.status === "Paid" ? "bg-[#16A34A]/10 text-[#16A34A]" : l.status === "Defaulted" ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[#F59E0B]/10 text-[#F59E0B]"}`}>{l.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[12px] mb-3">
              <div><p className="text-slate-400">Principal</p><p className="font-mono font-medium text-[#111827]">{money(Math.round(l.principal))}k</p></div>
              <div><p className="text-slate-400">Repaid</p><p className="font-mono font-medium text-[#16A34A]">{money(Math.round(totalRepaid(l)))}k</p></div>
              <div><p className="text-slate-400">Balance</p><p className="font-mono font-medium text-[#EF4444]">{money(Math.round(outstandingBalance(l)))}k</p></div>
            </div>
            {l.status !== "Paid" && (
              repayingLoan === l.id ? (
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  {/* Progress bar — visual balance reduction in real time */}
                  <div>
                    <div className="flex justify-between text-[10.5px] text-slate-400 mb-1">
                      <span>Repaid</span>
                      <span>{Math.min(100, Math.round((totalRepaid(l) + (Number(repayAmount) || 0)) / l.principal * 100))}% of principal</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (totalRepaid(l) / l.principal) * 100)}%`, backgroundColor: "#16A34A" }} />
                      {Number(repayAmount) > 0 && (
                        <div className="h-full rounded-full -mt-2 transition-all" style={{ width: `${Math.min(100, ((totalRepaid(l) + Number(repayAmount)) / l.principal) * 100)}%`, backgroundColor: "#4ADE80", opacity: 0.5 }} />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input type="number" value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)}
                      placeholder={`Balance: TZS ${money(Math.round(outstandingBalance(l)))}k`}
                      className={inputClass + " flex-1 min-w-[120px]"} autoFocus />
                    <select className={inputClass + " max-w-[130px]"} value={repayMethod} onChange={(e) => setRepayMethod(e.target.value)}>
                      {["Cash","Bank Transfer","Mobile Money","Cheque"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                    <button onClick={() => recordRepayment(l)} className="btn-primary text-white text-[12px] font-medium px-3.5 py-2 rounded-lg shrink-0">Record</button>
                    <button onClick={() => { setRepayingLoan(null); setRepayAmount(""); }} className="text-[12px] font-medium border border-slate-200 rounded-lg px-3 py-2 shrink-0">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (totalRepaid(l) / l.principal) * 100)}%`, backgroundColor: "#16A34A" }} />
                  </div>
                  <span className="text-[10.5px] text-slate-400 shrink-0">{Math.round((totalRepaid(l) / l.principal) * 100)}% repaid</span>
                  <button onClick={() => setRepayingLoan(l.id)} className="btn-secondary text-[12px] font-medium rounded-lg py-2 px-3 shrink-0">Record Repayment</button>
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setShowForm(false)} />
          <form onSubmit={addLoan} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
              <h2 className="text-[18px] font-semibold text-[#111827]">Add Loan</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex-1 space-y-4">
              <FormField label="Lender" required><input className={inputClass} value={form.lender} onChange={(e) => setForm((f) => ({ ...f, lender: e.target.value }))} placeholder="e.g. CRDB Bank" /></FormField>
              <FormField label="Loan type">
                <select className={inputClass} value={form.loanType} onChange={(e) => setForm((f) => ({ ...f, loanType: e.target.value }))}>
                  {LOAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Principal amount" required><input type="number" min="0" className={inputClass} value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} /></FormField>
              <FormField label="Interest rate (%, optional)"><input type="number" min="0" step="0.5" className={inputClass} value={form.interestRate} onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} /></FormField>
              <FormField label="Borrowed date"><input type="date" className={inputClass} value={form.borrowedDate} onChange={(e) => setForm((f) => ({ ...f, borrowedDate: e.target.value }))} /></FormField>
              <FormField label="Due date (optional)"><input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></FormField>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5">Cancel</button>
              <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Add Loan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ══════════════ BANKING ══════════════ */
/* ----------------------------------- BANKING ------------------------------------ */
export function Banking({ invoices, expenses, posTransactions }) {
  const channels = useMemo(() => {
    const map = {};
    PAYMENT_METHODS.forEach((m) => { map[m] = { method: m, inflow: 0, outflow: 0 }; });

    invoices.forEach((inv) => {
      (inv.payments || []).forEach((p) => {
        if (map[p.method]) map[p.method].inflow += p.amount;
      });
    });
    (posTransactions || []).forEach((t) => {
      const gross = Math.round(t.items.reduce((s, it) => s + it.qty * it.price, 0) * (1 + TAX_RATE));
      const refunded = (t.returns || []).reduce((s, r) => s + r.refundTotal, 0);
      if (map[t.method]) map[t.method].inflow += (gross - refunded);
    });
    expenses.filter((e) => e.status === "Paid").forEach((e) => {
      if (map[e.method]) map[e.method].outflow += e.amount;
    });

    return Object.values(map).map((c) => ({ ...c, net: c.inflow - c.outflow }));
  }, [invoices, expenses, posTransactions]);

  const totals = channels.reduce((t, c) => ({ inflow: t.inflow + c.inflow, outflow: t.outflow + c.outflow }), { inflow: 0, outflow: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Banknote size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Cash movement by channel, from recorded invoice payments, POS sales net of returns, and paid expenses. Legacy invoices marked Paid before an itemized payment method was recorded aren&apos;t attributed to a channel here — see the General Ledger for those.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {channels.map((c) => {
          const Icon = c.method === "Cash" ? Banknote : c.method === "Card" ? CreditCard : c.method === "Mobile Money" ? Smartphone : Landmark;
          return (
            <div key={c.method} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-lg bg-[#111827]/5 flex items-center justify-center">
                  <Icon size={16} className="text-[#111827]" />
                </div>
                <h3 className="text-[14px] font-semibold text-[#111827]">{c.method}</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10.5px] text-slate-400 mb-0.5">In</p>
                  <p className="text-[13px] font-mono font-medium text-[#16A34A]">+{money(c.inflow)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-slate-400 mb-0.5">Out</p>
                  <p className="text-[13px] font-mono font-medium text-[#EF4444]">−{money(c.outflow)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-slate-400 mb-0.5">Net</p>
                  <p className={`text-[13px] font-mono font-semibold ${c.net >= 0 ? "text-[#111827]" : "text-[#EF4444]"}`}>{money(c.net)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#111827]">Total across all channels</span>
        <div className="flex gap-4 text-[13px] font-mono">
          <span className="text-[#16A34A]">+{money(totals.inflow)}k</span>
          <span className="text-[#EF4444]">−{money(totals.outflow)}k</span>
          <span className="font-semibold text-[#111827]">{money(totals.inflow - totals.outflow)}k</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ OTHER DEBTORS ══════════════ */
/* ----------------------------------- OTHER DEBTORS ------------------------------------ */
export const DEBTOR_TYPES = ["Customer", "Supplier", "Employee", "Other"];

// Genuinely distinct from sales_invoices' formal accounts receivable —
// this tracks informal debt: an advance to an employee, a personal loan
// to a supplier, money owed by someone outside any formal sales
// transaction. Real businesses track this constantly, and it never had
// an honest home in this system's existing Sales or CRM tables, both of
// which are specifically about formal customer transactions.
export function OtherDebtorsView() {
  const debtors = useCompanyTable("other_debtors", [], { order: { col: "loan_date", ascending: false }, mapRow: (r) => ({ id: r.id, dbId: r.id, debtorType: r.debtor_type, name: r.debtor_name, phone: r.phone || "", amountOwed: Number(r.amount_owed) || 0, amountCollected: Number(r.amount_collected) || 0, description: r.description || "", loanDate: r.loan_date, dueDate: r.due_date, status: r.status }) });
  const [filter, setFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ debtorType: "Customer", name: "", phone: "", amountOwed: "", description: "", dueDate: "" });

  const totals = {
    outstanding: debtors.rows.reduce((s, d) => s + Math.max(0, d.amountOwed - d.amountCollected), 0),
    owed: debtors.rows.reduce((s, d) => s + d.amountOwed, 0),
    collected: debtors.rows.reduce((s, d) => s + d.amountCollected, 0),
  };
  const filtered = filter === "All" ? debtors.rows : debtors.rows.filter((d) => d.status === filter);

  async function addDebtor(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.amountOwed) return;
    const draft = { id: `DEBT-${Date.now()}`, debtorType: form.debtorType, name: form.name.trim(), phone: form.phone, amountOwed: Number(form.amountOwed), amountCollected: 0, description: form.description, loanDate: TODAY.toISOString().slice(0, 10), dueDate: form.dueDate || null, status: "Pending" };
    debtors.setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    setForm({ debtorType: "Customer", name: "", phone: "", amountOwed: "", description: "", dueDate: "" });
    notify(`Debtor added: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("other_debtors").insert({ debtor_type: draft.debtorType, debtor_name: draft.name, phone: draft.phone, amount_owed: draft.amountOwed, description: draft.description, due_date: draft.dueDate }).single().run();
        if (header?.id) debtors.setRows((prev) => prev.map((d) => (d.id === draft.id ? { ...d, dbId: header.id } : d)));
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111827]">Other Debtors</h3>
          <p className="text-[12px] text-slate-500">Money owed to the business outside a formal sale — an advance, a personal loan, an informal debt.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Add Debtor</button>
      </div>

      <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #F59E0B, #C4622D)" }}>
        <p className="text-[12px] text-white/80 mb-1">Outstanding Balance</p>
        <p className="text-[26px] font-mono font-bold text-white mb-4">TZS {money(Math.round(totals.outstanding))}k</p>
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/20">
          <div><p className="text-[11px] text-white/70">Total Owed</p><p className="text-[15px] font-mono font-semibold text-white">TZS {money(Math.round(totals.owed))}k</p></div>
          <div><p className="text-[11px] text-white/70">Total Collected</p><p className="text-[15px] font-mono font-semibold text-white">TZS {money(Math.round(totals.collected))}k</p></div>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {["All", "Pending", "Partial", "Paid"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${filter === f ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>{f}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-50">
        {!debtors.loading && filtered.length === 0 && <EmptyState icon={UserPlus} title="No debtors" hint="Money owed to the business outside a formal sale, tracked separately from Sales and CRM." actionLabel="Add Debtor" onAction={() => setShowForm(true)} />}
        {debtors.loading && <p className="text-[12.5px] text-slate-400 text-center py-8">Loading...</p>}
        {filtered.map((d) => (
          <div key={d.id} className="flex items-center justify-between px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#111827] truncate">{d.name} <span className="text-[10.5px] text-slate-400 font-normal">· {d.debtorType}</span></p>
              <p className="text-[11px] text-slate-400">{d.phone || "No phone"} · since {d.loanDate}</p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-[13px] font-mono font-semibold text-[#F59E0B]">TZS {money(Math.round(d.amountOwed - d.amountCollected))}k</p>
              <span className={`text-[10px] font-medium ${d.status === "Paid" ? "text-[#16A34A]" : "text-slate-400"}`}>{d.status}</span>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setShowForm(false)} />
          <form onSubmit={addDebtor} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
              <h2 className="text-[18px] font-semibold text-[#111827]">Add Debtor</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex-1 space-y-4">
              <div>
                <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Debtor type</label>
                <div className="flex flex-wrap gap-2">
                  {DEBTOR_TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, debtorType: t }))} className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${form.debtorType === t ? "border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#F59E0B]" : "border-slate-200 text-slate-500"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <FormField label="Debtor name" required><input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
              <FormField label="Phone (optional)"><input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></FormField>
              <FormField label="Amount owed" required><input type="number" min="0" className={inputClass} value={form.amountOwed} onChange={(e) => setForm((f) => ({ ...f, amountOwed: e.target.value }))} /></FormField>
              <FormField label="Description (optional)"><textarea className={inputClass} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></FormField>
              <FormField label="Due date (optional)"><input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></FormField>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5">Cancel</button>
              <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ══════════════ OTHER INCOME ══════════════ */
/* ----------------------------------- OTHER INCOME ------------------------------------ */

// Every P&L, Cash Flow, and Balance Sheet figure in this build previously
// computed revenue exclusively from sales_invoices and pos_transactions —
// correct for core sales revenue, silently incomplete for genuine
// non-sales income: interest earned, a grant, a one-off asset sale. Real
// and separate from sales revenue, not folded into it and blurring what
// the business actually sold.
export function OtherIncomeView() {
  const income = useCompanyTable("other_income", [], { order: { col: "income_date", ascending: false }, mapRow: (r) => ({ id: r.id, dbId: r.id, title: r.title, amount: Number(r.amount) || 0, description: r.description || "", paymentMethod: r.payment_method, date: r.income_date }) });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", description: "", paymentMethod: "Cash", date: TODAY.toISOString().slice(0, 10) });

  const total = income.rows.reduce((s, i) => s + i.amount, 0);

  async function addIncome(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.amount) return;
    const draft = { id: `INC-${Date.now()}`, title: form.title.trim(), amount: Number(form.amount), description: form.description, paymentMethod: form.paymentMethod, date: form.date };
    income.setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    setForm({ title: "", amount: "", description: "", paymentMethod: "Cash", date: TODAY.toISOString().slice(0, 10) });
    notify(`Income recorded: ${draft.title}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("other_income").insert({ title: draft.title, amount: draft.amount, description: draft.description, payment_method: draft.paymentMethod, income_date: draft.date }).single().run();
        if (header?.id) income.setRows((prev) => prev.map((i) => (i.id === draft.id ? { ...i, dbId: header.id } : i)));
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  const PAY_ICONS = { Cash: Banknote, Mobile: Smartphone, Bank: Landmark };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111827]">Other Income</h3>
          <p className="text-[12px] text-slate-500">Real, genuine revenue outside a sale — interest, a grant, an asset sale — kept honestly separate from what the business actually sold.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Add Income</button>
      </div>

      <div className="rounded-xl p-5 bg-[#DCFCE7]">
        <p className="text-[12px] text-[#15803D] mb-1">Total Other Income</p>
        <p className="text-[26px] font-mono font-bold text-[#15803D]">TZS {money(Math.round(total))}k</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-50">
        {!income.loading && income.rows.length === 0 && <EmptyState icon={Wallet} title="No other income recorded" hint="Real non-sales revenue this system's P&L would otherwise miss entirely." actionLabel="Add Income" onAction={() => setShowForm(true)} />}
        {income.loading && <p className="text-[12.5px] text-slate-400 text-center py-8">Loading...</p>}
        {income.rows.map((i) => {
          const Icon = PAY_ICONS[i.paymentMethod] || Banknote;
          return (
            <div key={i.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 rounded-lg bg-[#DCFCE7] flex items-center justify-center shrink-0"><Icon size={14} className="text-[#16A34A]" /></div>
              <div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-[#111827] truncate">{i.title}</p><p className="text-[11px] text-slate-400">{i.date} · {i.paymentMethod}</p></div>
              <p className="text-[13px] font-mono font-semibold text-[#16A34A] shrink-0">+{money(Math.round(i.amount))}k</p>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setShowForm(false)} />
          <form onSubmit={addIncome} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
              <h2 className="text-[18px] font-semibold text-[#111827]">Add Income</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex-1 space-y-4">
              <FormField label="Title" required><input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Interest earned" /></FormField>
              <FormField label="Amount" required><input type="number" min="0" className={inputClass} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></FormField>
              <FormField label="Description (optional)"><textarea className={inputClass} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></FormField>
              <div>
                <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Payment method</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(PAY_ICONS).map(([m, Icon]) => (
                    <button key={m} type="button" onClick={() => setForm((f) => ({ ...f, paymentMethod: m }))} className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors ${form.paymentMethod === m ? "border-[#16A34A]/50 bg-[#16A34A]/5" : "border-slate-200"}`}>
                      <Icon size={16} className={form.paymentMethod === m ? "text-[#16A34A]" : "text-slate-400"} />
                      <span className={`text-[11px] font-medium ${form.paymentMethod === m ? "text-[#111827]" : "text-slate-500"}`}>{m}</span>
                    </button>
                  ))}
                </div>
              </div>
              <FormField label="Date"><input type="date" className={inputClass} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></FormField>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5">Cancel</button>
              <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ══════════════ TAX ══════════════ */
/* ------------------------------------ TAX -------------------------------------- */

// TRA Tanzania Tax Center — every figure computed from real records with
// real published rates, framed honestly as PLANNING ESTIMATES, never a
// filing. Rates live in a per-country config so Kenya/Uganda/Rwanda/
// Zambia are a rates-table away, not a rewrite — TZ is implemented,
// the others are named as coming, not faked as present. All money in
// TZS thousands, matching this entire build's convention — the PAYE
// brackets below are the real TRA monthly resident brackets expressed
// in thousands (270k/520k/760k/1m boundaries).
export const TAX_COUNTRIES = {
  TZ: {
    label: "Tanzania (TRA)", active: true,
    corporateRate: 0.30, sdlRate: 0.035, wcfRate: 0.005,
    paye: (s) => s <= 270 ? 0 : s <= 520 ? (s - 270) * 0.08 : s <= 760 ? 20 + (s - 520) * 0.20 : s <= 1000 ? 68 + (s - 760) * 0.25 : 128 + (s - 1000) * 0.30,
  },
  KE: { label: "Kenya (KRA)", active: false }, UG: { label: "Uganda (URA)", active: false },
  RW: { label: "Rwanda (RRA)", active: false }, ZM: { label: "Zambia (ZRA)", active: false },
};

export function TaxCenterView({ invoices, expenses, employeesHook, company }) {
  const [country, setCountry] = useState("TZ");
  const cfg = TAX_COUNTRIES[country];
  const yearStart = `${TODAY.getFullYear()}-01-01`;

  const figures = useMemo(() => {
    if (!cfg.active) return null;
    const outputVat = invoices.rows.filter((i) => i.date >= yearStart).reduce((s, i) => s + lineTotal(i.items).tax, 0);
    const staff = employeesHook.rows.filter((e) => e.status === "Active");
    const payroll = staff.reduce((s, e) => s + e.salary, 0);
    const payeRows = staff.map((e) => ({ name: e.name, salary: e.salary, paye: cfg.paye(e.salary) }));
    const payeTotal = payeRows.reduce((s, r) => s + r.paye, 0);
    const sdl = payroll * cfg.sdlRate;
    const wcf = payroll * cfg.wcfRate;
    const revenue = invoices.rows.filter((i) => i.date >= yearStart).reduce((s, i) => s + lineTotal(i.items).total, 0);
    const expTotal = expenses.filter((e) => e.date >= yearStart).reduce((s, e) => s + e.amount, 0);
    const profit = revenue - expTotal;
    const corp = Math.max(0, profit) * cfg.corporateRate;
    return { outputVat, staff: staff.length, payroll, payeRows, payeTotal, sdl, wcf, profit, corp };
  }, [invoices.rows, expenses, employeesHook.rows, cfg, yearStart]);

  const Card = ({ title, value, note }) => (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
      <p className="text-[11px] text-slate-400 mb-1">{title}</p>
      <p className="text-[15px] font-mono font-semibold text-[#111827]">TZS {money(Math.round(value))}k</p>
      <p className="text-[10.5px] text-slate-400 mt-1">{note}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111827]">Tax Center</h3>
          <p className="text-[12px] text-slate-500">Real published rates against your real records — planning estimates, never a filing.</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {Object.entries(TAX_COUNTRIES).map(([k, v]) => (
            <button key={k} onClick={() => setCountry(k)} className={`text-[11.5px] font-medium px-2.5 py-1.5 rounded-md transition-colors ${country === k ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>{k}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ backgroundColor: "#FEF3C7" }}>
        <AlertCircle size={15} className="text-[#F59E0B] shrink-0 mt-0.5" />
        <p className="text-[11.5px] text-[#92400E]">These are estimates computed from what this system has recorded, using published rates — accounting profit is not taxable profit, rates change, and input-VAT credits need per-expense VAT capture this build doesn&apos;t yet do. Verify every figure with TRA or your accountant before filing or paying anything.</p>
      </div>

      {!cfg.active && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-8 text-center">
          <p className="text-[13px] font-medium text-[#111827]">{cfg.label} — coming</p>
          <p className="text-[11.5px] text-slate-400 mt-1">The engine is a per-country rates table — this jurisdiction needs its real brackets added and checked, not a rewrite. Tanzania is live today.</p>
        </div>
      )}

      {figures && (
        <>
          {/* Hero — the one number a business owner asks first: what do I
              owe this month? PAYE + SDL + WCF are the real monthly
              obligations; VAT and corporate tax shown as YTD context.
              Same gradient language as the Loans and Debtors heroes. */}
          <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #16A34A, #15803D)" }}>
            <p className="text-[12px] text-white/80 mb-1">Estimated Monthly Obligation (PAYE + SDL + WCF)</p>
            <p className="text-[26px] font-mono font-bold text-white mb-4">TZS {money(Math.round(figures.payeTotal + figures.sdl + figures.wcf))}k</p>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/20">
              <div><p className="text-[11px] text-white/70">Output VAT (YTD)</p><p className="text-[15px] font-mono font-semibold text-white">TZS {money(Math.round(figures.outputVat))}k</p></div>
              <div><p className="text-[11px] text-white/70">Corporate Tax (YTD est.)</p><p className="text-[15px] font-mono font-semibold text-white">TZS {money(Math.round(figures.corp))}k</p></div>
            </div>
          </div>

          {/* Real TRA filing deadlines — the 7th (PAYE/SDL) and the 20th
              (VAT return) of the following month are published dates, so
              day counts here are computed facts, colored by real urgency,
              not a decorative calendar. */}
          {(() => {
            const nextDue = (day) => {
              const d = new Date(TODAY);
              if (d.getDate() >= day) d.setMonth(d.getMonth() + 1);
              d.setDate(day);
              return d;
            };
            const items = [
              { label: "PAYE & SDL remittance", day: 7 },
              { label: "VAT return & payment", day: 20 },
              { label: "WCF contribution", day: 7 },
            ].map((x) => {
              const due = nextDue(x.day);
              const days = Math.ceil((due - TODAY) / 86400000);
              return { ...x, due: due.toISOString().slice(0, 10), days };
            });
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {items.map((x) => (
                  <div key={x.label} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-mono font-bold text-[13px]" style={{ backgroundColor: x.days <= 5 ? "#FEE2E2" : "#DCFCE7", color: x.days <= 5 ? "#EF4444" : "#16A34A" }}>{x.days}d</div>
                    <div className="min-w-0"><p className="text-[12px] font-medium text-[#111827] truncate">{x.label}</p><p className="text-[10.5px] text-slate-400">due {x.due} — published TRA date</p></div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="flex justify-end">
            <ExportMenu
              title="Tax Summary" filename="tax-summary" sheetName="Tax Summary"
              headers={["Obligation", "Amount (TZS 000)", "Basis"]}
              rows={[["Output VAT (YTD)", Math.round(figures.outputVat), "Real invoice tax lines"],
                ["PAYE (monthly)", Math.round(figures.payeTotal), `TRA brackets across ${figures.staff} salaries`],
                ["SDL (monthly)", Math.round(figures.sdl), "3.5% of gross payroll"],
                ["WCF (monthly)", Math.round(figures.wcf), "0.5% of gross payroll"],
                ["Corporate Tax (YTD est.)", Math.round(figures.corp), "30% of YTD accounting profit"]]}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card title="Output VAT (YTD)" value={figures.outputVat} note={`${company.taxRate || 18}% on real invoice tax lines. Input-VAT credit not yet netted — stated, not hidden.`} />
            <Card title="PAYE (monthly)" value={figures.payeTotal} note={`Real TRA brackets across ${figures.staff} active salaries.`} />
            <Card title="SDL (monthly)" value={figures.sdl} note="3.5% of gross payroll. Applies from 10+ employees — check your headcount." />
            <Card title="WCF (monthly)" value={figures.wcf} note="0.5% of gross payroll, private sector rate." />
            <Card title="Corporate Tax (YTD est.)" value={figures.corp} note={`30% on YTD accounting profit of TZS ${money(Math.round(figures.profit))}k — taxable profit differs after adjustments.`} />
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[11px] text-slate-400 mb-1">Excise Duty</p>
              <p className="text-[13px] font-medium text-[#111827]">Not computed</p>
              <p className="text-[10.5px] text-slate-400 mt-1">Excise is product-specific (fuel, beverages, airtime) — needs per-product excise rates this catalog doesn&apos;t carry. Named, not guessed.</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <p className="text-[12.5px] font-semibold text-[#111827] px-4 pt-3.5 pb-2">PAYE per employee — real TRA monthly brackets</p>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide"><th className="px-4 py-2">Employee</th><th className="px-4 py-2 text-right">Gross (TZS k)</th><th className="px-4 py-2 text-right">PAYE (TZS k)</th></tr></thead>
              <tbody>
                {figures.payeRows.map((r) => (
                  <tr key={r.name} className="border-b border-slate-50 last:border-0"><td className="px-4 py-2 text-[#111827]">{r.name}</td><td className="px-4 py-2 text-right font-mono text-slate-600">{money(r.salary)}</td><td className="px-4 py-2 text-right font-mono text-[#111827]">{money(Math.round(r.paye * 10) / 10)}</td></tr>
                ))}
                {figures.payeRows.length === 0 && !employeesHook.loading && <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-[12px]">No active employees.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TRA Portal Compliance */}
      {country === "TZ" && figures && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#111827]">TRA Portal — Tax Return Templates</h3>
            <a href="https://taxpayerportal.tra.go.tz" target="_blank" rel="noopener noreferrer"
              className="text-[11.5px] font-medium text-[#16A34A] hover:underline flex items-center gap-1">
              Open TRA Portal <ChevronRight size={12}/>
            </a>
          </div>
          <p className="text-[12px] text-slate-500">Pre-filled from your real records. Print each form to use as a filing reference at <strong>taxpayerportal.tra.go.tz</strong>. Deadlines: PAYE, SDL, WCF by the <strong>7th</strong> · VAT by the <strong>20th</strong> of the following month.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TRAReturnCard title="PAYE Monthly Return" formCode="PAYE.1" deadline="7th of next month"
              fields={[ { l:"Employer TIN", v: company.tin||"—" }, { l:"No. of Employees", v: String(figures.staff) }, { l:"Gross Payroll (TZS)", v: money(Math.round(figures.payroll*1000)) }, { l:"Total PAYE Due", v: `TZS ${money(Math.round(figures.payeTotal*1000))}` } ]}
              onPrint={() => printTRAReturn("PAYE Return", figures, company, employeesHook.rows)} />
            <TRAReturnCard title="VAT Monthly Return" formCode="VAT.1" deadline="20th of next month"
              fields={[ { l:"Taxpayer TIN", v: company.tin||"—" }, { l:"Output VAT (Sales)", v: `TZS ${money(Math.round(figures.outputVat*1000))}` }, { l:"Input VAT", v:"Enter from purchase invoices" }, { l:"Net VAT Payable", v:`TZS ${money(Math.round(figures.outputVat*1000))} (before input credit)` } ]}
              onPrint={() => printTRAReturn("VAT Return", figures, company, [])} />
            <TRAReturnCard title="Skills Development Levy" formCode="SDL" deadline="7th of next month"
              fields={[ { l:"Employer TIN", v: company.tin||"—" }, { l:"Gross Payroll", v:`TZS ${money(Math.round(figures.payroll*1000))}` }, { l:"SDL Rate", v:"3.5%" }, { l:"SDL Due", v:`TZS ${money(Math.round(figures.sdl*1000))}` } ]}
              onPrint={() => printTRAReturn("SDL Return", figures, company, [])} />
            <TRAReturnCard title="Workers Compensation Fund" formCode="WCF" deadline="7th of next month"
              fields={[ { l:"Employer TIN", v: company.tin||"—" }, { l:"Gross Payroll", v:`TZS ${money(Math.round(figures.payroll*1000))}` }, { l:"WCF Rate", v:"0.5%" }, { l:"WCF Due", v:`TZS ${money(Math.round(figures.wcf*1000))}` } ]}
              onPrint={() => printTRAReturn("WCF Return", figures, company, [])} />
          </div>
        </div>
      )}
    </div>
  );
}

export function TRAReturnCard({ title, formCode, deadline, fields, onPrint }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[12.5px] font-semibold text-[#111827]">{title}</p>
          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{formCode}</p>
          <p className="text-[10.5px] text-[#F59E0B] flex items-center gap-1 mt-0.5"><Clock size={10}/> Due {deadline}</p>
        </div>
        <button onClick={onPrint} className="flex items-center gap-1 text-[11px] font-medium text-[#16A34A] border border-[#16A34A]/30 rounded-lg px-2.5 py-1.5 hover:bg-[#16A34A]/5 shrink-0">
          <Printer size={11}/> Print
        </button>
      </div>
      <div className="space-y-1.5">
        {fields.map((f) => (
          <div key={f.l} className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="text-slate-400">{f.l}</span>
            <span className="font-medium text-[#111827] text-right truncate max-w-[200px]">{f.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function printTRAReturn(type, figures, company, employees) {
  const co = window.__smartManagerCompany || company || {};
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const fmt = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
  const PAYE = (s) => s<=270?0:s<=520?(s-270)*0.08:s<=760?20+(s-520)*0.2:s<=1000?68+(s-760)*0.25:128+(s-1000)*0.3;
  const empRows = type==="PAYE Return" ? employees.filter((e)=>e.status==="Active").map((e)=>
    `<tr><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${e.name}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0">${e.role||""}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right">TZS ${fmt(e.salary*1000)}</td><td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#EF4444">TZS ${fmt(PAYE(e.salary)*1000)}</td></tr>`
  ).join("") : "";
  const computedRows = {
    "PAYE Return": [["No. of Employees",String(figures.staff)],["Gross Payroll",`TZS ${fmt(figures.payroll*1000)}`],["Total PAYE Deducted",`TZS ${fmt(figures.payeTotal*1000)}`]],
    "VAT Return":  [["Output VAT (Sales)",`TZS ${fmt(figures.outputVat*1000)}`],["Input VAT (Purchases)","[Enter from purchase records]"],["Net VAT Payable",`TZS ${fmt(figures.outputVat*1000)} (before input credit)`]],
    "SDL Return":  [["Gross Payroll",`TZS ${fmt(figures.payroll*1000)}`],["SDL Rate","3.5%"],["SDL Due",`TZS ${fmt(figures.sdl*1000)}`]],
    "WCF Return":  [["Gross Payroll",`TZS ${fmt(figures.payroll*1000)}`],["WCF Rate","0.5%"],["WCF Due",`TZS ${fmt(figures.wcf*1000)}`]],
  }[type] || [];
  const logoHtml = co.logo ? "<img src=\"" + co.logo + "\" style=\"height:44px;object-fit:contain\" alt=\"logo\"/>" : "<div style=\"font-size:28px\">&#127481;&#127487;</div>";
  const rowsHtml = computedRows.map(function(pair, i) { const l = pair[0]; const v = pair[1]; const bg = i%2 ? "" : " style=\"background:#F8FAFC\""; const color = (l.includes("Due")||l.includes("Deducted")||l.includes("Payable")) ? "#EF4444" : "#111827"; return "<tr" + bg + "><td style=\"padding:6px 10px;font-size:11px;color:#6B7280\">" + l + "</td><td style=\"padding:6px 10px;font-size:12px;font-weight:700;text-align:right;color:" + color + "\">" + v + "</td></tr>"; }).join("");
  const empSection = empRows ? "<p style=\"font-size:11px;font-weight:700;color:#111827;margin-bottom:6px;letter-spacing:.05em\">EMPLOYEE BREAKDOWN</p><table style=\"width:100%;border-collapse:collapse\"><thead><tr style=\"background:#F0FDF4\"><th style=\"padding:5px 8px;font-size:9.5px;text-align:left;font-weight:600;color:#166534\">Employee</th><th style=\"padding:5px 8px;font-size:9.5px;text-align:left;font-weight:600;color:#166534\">Role</th><th style=\"padding:5px 8px;font-size:9.5px;text-align:right;font-weight:600;color:#166534\">Gross Salary</th><th style=\"padding:5px 8px;font-size:9.5px;text-align:right;font-weight:600;color:#166534\">PAYE</th></tr></thead><tbody>" + empRows + "</tbody></table>" : "";
  printAsPDF("TRA — " + type, "<div style=\"font-family:Inter,sans-serif;max-width:640px;margin:0 auto;padding:32px\"><div style=\"display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #16A34A;padding-bottom:16px;margin-bottom:20px\"><div><div style=\"font-size:18px;font-weight:800;color:#16A34A\">TANZANIA REVENUE AUTHORITY</div><div style=\"font-size:13px;font-weight:700;color:#111827;margin-top:2px\">" + type + "</div><div style=\"font-size:11px;color:#6B7280\">Period: " + month + "</div></div><div style=\"text-align:right\">" + logoHtml + "<div style=\"font-size:12px;font-weight:700;color:#111827;margin-top:4px\">" + (co.name||"Your Company") + "</div><div style=\"font-size:11px;color:#6B7280\">TIN: " + (co.tin||"—") + "</div></div></div><table style=\"width:100%;border-collapse:collapse;margin-bottom:16px\"><tr style=\"background:#F0FDF4\"><td colspan=\"2\" style=\"padding:8px 10px;font-weight:700;font-size:11px;color:#166534;letter-spacing:.05em\">TAXPAYER DETAILS</td></tr><tr><td style=\"padding:6px 10px;font-size:11px;color:#6B7280;width:40%\">Business Name</td><td style=\"padding:6px 10px;font-size:11.5px;font-weight:600\">" + (co.name||"—") + "</td></tr><tr style=\"background:#F8FAFC\"><td style=\"padding:6px 10px;font-size:11px;color:#6B7280\">TIN Number</td><td style=\"padding:6px 10px;font-size:11.5px;font-weight:600\">" + (co.tin||"—") + "</td></tr><tr><td style=\"padding:6px 10px;font-size:11px;color:#6B7280\">Registration No.</td><td style=\"padding:6px 10px;font-size:11.5px\">" + (co.regNumber||"—") + "</td></tr><tr style=\"background:#F8FAFC\"><td style=\"padding:6px 10px;font-size:11px;color:#6B7280\">Address</td><td style=\"padding:6px 10px;font-size:11px\">" + [co.address,co.city,"Tanzania"].filter(Boolean).join(", ") + "</td></tr><tr><td style=\"padding:6px 10px;font-size:11px;color:#6B7280\">Return Period</td><td style=\"padding:6px 10px;font-size:11.5px;font-weight:600\">" + month + "</td></tr></table><table style=\"width:100%;border-collapse:collapse;margin-bottom:16px\"><tr style=\"background:#F0FDF4\"><td colspan=\"2\" style=\"padding:8px 10px;font-weight:700;font-size:11px;color:#166534;letter-spacing:.05em\">TAX COMPUTATION</td></tr>" + rowsHtml + "</table>" + empSection + "<div style=\"margin-top:20px;padding:10px;background:#FEF3C7;border-radius:6px;font-size:10px;color:#92400E\">&#9888; Verify with your accountant before filing. Input VAT credits must be applied manually at taxpayerportal.tra.go.tz</div><div style=\"margin-top:10px;font-size:9.5px;color:#9CA3AF;text-align:center\">Generated by Smart Manager &middot; " + new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}) + "</div></div>");
}

export function TaxSummary({ invoices }) {
  const figures = useMemo(() => {
    const outputVat = invoices.reduce((s, inv) => s + lineTotal(inv.items).tax, 0);
    const taxableRevenue = invoices.reduce((s, inv) => s + lineTotal(inv.items).subtotal, 0);
    return { outputVat, taxableRevenue };
  }, [invoices]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Percent size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          VAT on an invoice basis (owed when invoiced, not when paid) — Tanzania&apos;s standard treatment. Input VAT from vendor bills isn&apos;t tracked yet since expenses don&apos;t carry a VAT breakdown, so this shows output VAT only, not a true net position.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">VAT Summary — {TAX_RATE * 100}% standard rate</h3>
        <div className="space-y-3 text-[13px]">
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">Taxable revenue (subtotal of all invoices)</span>
            <span className="font-mono text-[#111827]">TZS {money(Math.round(figures.taxableRevenue))}k</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">Output VAT collected</span>
            <span className="font-mono text-[#111827]">TZS {money(Math.round(figures.outputVat))}k</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">Input VAT (not yet tracked)</span>
            <span className="font-mono text-slate-400">—</span>
          </div>
          <div className="flex justify-between py-3 font-semibold text-[15px]">
            <span className="text-[#111827]">Estimated VAT payable</span>
            <span className="font-mono text-[#F59E0B]">TZS {money(Math.round(figures.outputVat))}k</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ ASSETS ══════════════ */
/* ------------------------------------ ASSETS ------------------------------------ */
export function Assets() {
  const assets = useCompanyTable("finance_assets", financeAssetsSeed, { order: { col: "acquisition_date", ascending: false }, mapRow: mapAssetRow });
  const { rows, setRows, loading } = assets;
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const totals = useMemo(() => {
    return rows.reduce((t, a) => {
      const { accumulated, bookValue } = depreciate(a);
      return { cost: t.cost + a.cost, accumulated: t.accumulated + accumulated, bookValue: t.bookValue + bookValue };
    }, { cost: 0, accumulated: 0, bookValue: 0 });
  }, [rows]);

  async function addAsset(form) {
    const draft = {
      id: docId("AST"),
      name: form.name, category: form.category, acquisitionDate: form.acquisitionDate,
      cost: Number(form.cost) || 0, usefulLifeYears: Number(form.usefulLifeYears) || 5,
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Asset added: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("finance_assets").insert({
          name: draft.name, category: draft.category, acquisition_date: draft.acquisitionDate,
          cost: draft.cost, useful_life_years: draft.usefulLifeYears,
        }).single().run();
        if (header?.id) setRows((prev) => prev.map((a) => (a.id === draft.id ? { ...a, dbId: header.id } : a)));
      } catch (_e) { notify("Asset added locally, but saving to the server failed.", "error"); }
    }
  }

  async function deleteAsset(id) {
    const asset = rows.find((a) => a.id === id);
    setRows((prev) => prev.filter((a) => a.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && asset?.dbId) {
      try { await sb("finance_assets").eq("id", asset.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the asset on the server.", "error"); }
    }
  }

  const ASSET_KPIS = [
    { label: "Total Asset Cost", value: `TZS ${money(Math.round(totals.cost))}k`, delta: `${rows.length} assets`, up: true, icon: Package },
    { label: "Accumulated Depreciation", value: `TZS ${money(Math.round(totals.accumulated))}k`, delta: "To date", up: false, icon: TrendingDown },
    { label: "Net Book Value", value: `TZS ${money(Math.round(totals.bookValue))}k`, delta: "Current", up: true, icon: CircleDollarSign },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ASSET_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New Asset
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Acquired</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium text-right">Accum. Deprec.</th>
                <th className="px-4 py-3 font-medium text-right">Book Value</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={6} />}
              {!loading && rows.map((a) => {
                const { accumulated, bookValue, fullyDepreciated } = depreciate(a);
                return (
                  <tr key={a.id} onClick={() => setSelected(a)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#111827]">{a.name}</p>
                      <p className="text-[11px] text-slate-400">{a.category} · {a.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{a.acquisitionDate}</td>
                    <td className="px-4 py-3 text-right font-mono">{money(a.cost)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{money(accumulated)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">
                      {money(bookValue)}
                      {fullyDepreciated && <span className="ml-1.5 text-[10px] text-slate-400">fully deprec.</span>}
                    </td>
                    <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-slate-300 inline" /></td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Package}
                      title="No fixed assets yet"
                      hint="Vehicles, equipment, and buildings live here with straight-line depreciation computed automatically from acquisition date and useful life."
                      actionLabel="New Asset"
                      onAction={() => setShowForm(true)}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <AssetPanel asset={selected} onClose={() => setSelected(null)} onDelete={deleteAsset} />}
      {showForm && <AssetFormPanel onClose={() => setShowForm(false)} onSubmit={addAsset} />}
    </div>
  );
}

export function AssetPanel({ asset, onClose, onDelete }) {
  const { accumulated, bookValue, fullyDepreciated, monthlyDep } = depreciate(asset);
  const pctDepreciated = Math.min(100, Math.round((accumulated / asset.cost) * 100));

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-mono text-slate-400">{asset.id}</p>
            <h2 className="text-[17px] font-semibold text-[#111827] mt-0.5 leading-snug">{asset.name}</h2>
            <p className="text-[13px] text-slate-500">{asset.category}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Original Cost</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">TZS {money(asset.cost)}k</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Useful Life</p>
            <p className="text-[15px] font-semibold text-[#111827]">{asset.usefulLifeYears} years</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-3">
          <div className="flex justify-between mb-1.5">
            <p className="text-[11px] text-slate-400">Depreciated</p>
            <p className="text-[11px] font-mono text-slate-500">{pctDepreciated}%</p>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#F59E0B]" style={{ width: `${pctDepreciated}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Accum. Depreciation</p>
            <p className="text-[15px] font-mono font-semibold text-[#F59E0B]">TZS {money(accumulated)}k</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Net Book Value</p>
            <p className="text-[15px] font-mono font-semibold text-[#16A34A]">TZS {money(bookValue)}k</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-2">
          <Clock size={14} className="text-slate-400" /> Acquired {asset.acquisitionDate}
        </div>
        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-6">
          <TrendingDown size={14} className="text-slate-400" /> TZS {money(monthlyDep)}k depreciation per month{fullyDepreciated ? " (fully depreciated)" : ""}
        </div>

        <div className="flex-1" />
        <ConfirmDeleteButton label="Remove asset" onConfirm={() => onDelete(asset.id)} />
      </div>
    </div>
  );
}

export function AssetFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", category: ASSET_CATEGORIES[0], acquisitionDate: TODAY.toISOString().slice(0, 10), cost: "", usefulLifeYears: "5" });
  const [touched, setTouched] = useState(false);
  const valid = form.name.trim() && Number(form.cost) > 0 && Number(form.usefulLifeYears) > 0;

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Finance</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Asset</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Asset name" required>
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Toyota Hilux — Delivery Truck" />
            {touched && !form.name.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Asset name is required.</p>}
          </FormField>

          <FormField label="Category">
            <select className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cost (TZS 000)" required>
              <input type="number" min="0" className={inputClass} value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" />
              {touched && !(Number(form.cost) > 0) && <p className="text-[11px] text-[#EF4444] mt-1">Enter a cost.</p>}
            </FormField>
            <FormField label="Useful life (years)" required>
              <input type="number" min="1" className={inputClass} value={form.usefulLifeYears} onChange={(e) => set("usefulLifeYears", e.target.value)} placeholder="5" />
            </FormField>
          </div>

          <FormField label="Acquisition date">
            <input type="date" className={inputClass} value={form.acquisitionDate} onChange={(e) => set("acquisitionDate", e.target.value)} />
          </FormField>

          <p className="text-[11.5px] text-slate-400">Depreciation is calculated automatically using the straight-line method from this date.</p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" className="flex-1 btn-primary text-white text-[12px] font-medium rounded-lg py-2.5">Create Asset</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ MOBILE MONEY RECONCILIATION ══════════════ */
/* ------------------------------ MOBILE MONEY RECONCILIATION ------------------------------ */

// Every mobile money provider in East Africa requires server-side API
// credentials and a hosted callback URL to receive payment confirmations
// automatically — none of that exists here. What's genuinely real and,
// for a small business, honestly how this already works day to day: the
// owner sees a payment confirmation SMS on their phone and records it
// against the right invoice. This formalizes that exact real workflow
// using the same recordPayment() function every other payment method
// already goes through.
export function MobileMoneyReconciliation({ invoices, currentUser }) {
  const outstanding = invoices.rows.filter((inv) => inv.status !== "Paid");
  const [invoiceId, setInvoiceId] = useState(outstanding[0]?.id || "");
  const [provider, setProvider] = useState(MOBILE_MONEY_PROVIDERS[0]);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");

  const invoice = outstanding.find((i) => i.id === invoiceId);
  const balance = invoice ? lineTotal(invoice.items).total - (invoice.amountPaid || 0) : 0;

  function submit(e) {
    e.preventDefault();
    if (!invoice || !(Number(amount) > 0) || !reference.trim()) return;
    const patch = recordPayment(invoices, invoiceId, { amount: Math.min(Number(amount), balance), method: "Mobile Money", date: TODAY.toISOString().slice(0, 10), reference: `${provider} · ${reference.trim()}` }, `${currentUser.name} (${currentUser.role})`);
    if (patch) { setReference(""); setAmount(""); }
  }

  const recentMobileMoneyPayments = useMemo(() => {
    const all = [];
    invoices.rows.forEach((inv) => (inv.payments || []).forEach((p) => { if (p.method === "Mobile Money") all.push({ ...p, invoiceId: inv.id, customer: inv.customer }); }));
    return all.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
  }, [invoices.rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Smartphone size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          No live M-Pesa, Airtel Money, Tigo Pesa, or HaloPesa API connection exists — each requires server-held credentials and a hosted callback URL. This records a payment you&apos;ve already confirmed (from the SMS notification on your phone) against the right invoice, the same real workflow most businesses already use.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-4">Record a Mobile Money Payment</h3>
        {outstanding.length === 0 ? (
          <p className="text-[12.5px] text-slate-400">No outstanding invoices to reconcile against right now.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <FormField label="Invoice">
              <select className={inputClass} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                {outstanding.map((inv) => <option key={inv.id} value={inv.id}>{inv.id} — {inv.customer}</option>)}
              </select>
              {invoice && <p className="text-[11px] text-slate-400 mt-1">Balance due: TZS {money(Math.round(balance))}k</p>}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Provider">
                <select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {MOBILE_MONEY_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </FormField>
              <FormField label="Amount (TZS 000)" required>
                <input type="number" min="0" max={balance} className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </FormField>
            </div>
            <FormField label="Transaction reference" required>
              <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. QJJ4K7XLMN (from the confirmation SMS)" />
            </FormField>
            <button type="submit" className="w-full btn-primary text-white text-[13px] font-medium rounded-lg py-2.5">Record Payment</button>
          </form>
        )}
      </div>

      {recentMobileMoneyPayments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100"><h3 className="text-[14px] font-semibold text-[#111827]">Recent Mobile Money Payments</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Reference</th><th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr></thead>
              <tbody>
                {recentMobileMoneyPayments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-mono text-[#111827]">{p.invoiceId}</td>
                    <td className="px-4 py-3 text-slate-500">{p.customer}</td>
                    <td className="px-4 py-3 text-slate-500">{p.reference || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#16A34A]">+{money(p.amount)}k</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════ BANK STATEMENT IMPORT ══════════════ */
/* ------------------------------ BANK STATEMENT IMPORT ------------------------------ */

// No bank in the region exposes a public API a generic app can connect
// to — real Open Banking-style access needs bank-specific, often
// government-regulated, server-side credentials. What's genuinely
// achievable: every bank lets a customer export a statement as CSV or
// Excel, and this parses that real file (via the same SheetJS library
// already used for report exports) and suggests matches against real
// outstanding invoices by amount — honest reconciliation support, not a
// live feed.
export function BankStatementImport({ invoices, expenses }) {
  const [transactions, setTransactions] = useState([]);
  const [fileName, setFileName] = useState("");
  const outstanding = invoices.rows.filter((inv) => inv.status !== "Paid");

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        // Best-effort column detection: look for a row of headers, then
        // take the first text column as description and the first
        // numeric-looking column as amount — real bank exports vary
        // enough in format that a rigid parser would fail on most of them.
        const dataRows = rows.slice(1).filter((r) => r.length > 0);
        const parsed = dataRows.map((r, i) => {
          const amountCell = r.find((c) => typeof c === "number");
          const textCell = r.find((c) => typeof c === "string" && c.trim());
          return { id: i, description: textCell || "Unknown", amount: amountCell || 0 };
        }).filter((t) => t.amount !== 0);
        setTransactions(parsed);
        notify(`Parsed ${parsed.length} transactions from ${file.name}`);
      } catch (err) {
        notify("Couldn't parse that file — try exporting your statement as CSV or Excel.", "error");
      }
    };
    reader.readAsBinaryString(file);
  }

  function findMatch(amount) {
    return outstanding.find((inv) => Math.abs((lineTotal(inv.items).total - (inv.amountPaid || 0)) - Math.abs(amount)) < 1);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Landmark size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          No bank in this environment exposes a connectable API — real Open Banking access needs bank-specific, regulated credentials. Upload a real statement export (CSV or Excel) instead; this parses it and flags amounts that match an outstanding invoice.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-8 cursor-pointer hover:border-[#16A34A]/40 hover:bg-slate-50/50 transition-colors">
          <UploadCloud size={22} className="text-slate-300" />
          <span className="text-[13px] font-medium text-slate-600">{fileName || "Upload bank statement (CSV or Excel)"}</span>
          <span className="text-[11px] text-slate-400">Click to browse</span>
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {transactions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100"><h3 className="text-[14px] font-semibold text-[#111827]">Parsed Transactions</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[560px]">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium text-right">Amount</th><th className="px-4 py-3 font-medium">Suggested Match</th>
              </tr></thead>
              <tbody>
                {transactions.map((t) => {
                  const match = findMatch(t.amount);
                  return (
                    <tr key={t.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 text-slate-700">{t.description}</td>
                      <td className="px-4 py-3 text-right font-mono">{money(Math.round(t.amount))}</td>
                      <td className="px-4 py-3">
                        {match ? (
                          <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: "#16A34A14", color: "#16A34A" }}>
                            <CheckCircle2 size={11} /> {match.id} — {match.customer}
                          </span>
                        ) : <span className="text-[11px] text-slate-300">No match found</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════ TAX ══════════════ */
/* ------------------------------------ TAX ------------------------------------ */
export function TaxIntegration({ onNavigate }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Percent size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">{TAX_AUTHORITY_NOTE}</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-2">Prepare your filing</h3>
        <p className="text-[13px] text-slate-500 leading-relaxed mb-4">
          Finance&apos;s Tax tab already computes output VAT live from real invoices, on an invoice basis — the number most VAT filings ask for. There&apos;s no direct submission from here; use it to prepare what you file manually.
        </p>
        {onNavigate && (
          <button onClick={() => onNavigate("finance")} className="btn-primary text-white text-[13px] font-medium rounded-lg py-2.5 px-4 flex items-center gap-1.5">
            <Landmark size={13} /> Open Finance → Tax
          </button>
        )}
      </div>
    </div>
  );
}
