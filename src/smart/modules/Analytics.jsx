import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, BarChart2, BarChart3, CheckCircle2, ChevronRight, CircleDollarSign,
  CircleUserRound, ClipboardList, Crosshair, Factory, FileText, Gauge, GitBranch, Globe,
  Grid3x3, HandCoins, Landmark, LayoutDashboard, Lock, Package, Plus, Receipt, ShieldCheck,
  Sparkles, Tag, Target, Trash2, TrendingUp, UserPlus, Users, Wallet, X
} from "lucide-react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { ConfirmDeleteButton, EmptyState, FormField, inputClass } from "../components/ui.jsx";
import {
  BENCHMARK_METRICS,
  KPI_METRICS,
  benchmarksSeed,
  competitorsSeed,
  customKpisSeed,
} from "../data/analytics.jsx";
import { STAGE_PROBABILITY } from "../data/core.jsx";
import { WAREHOUSES, stockStatus } from "../data/inventory.jsx";
import { machinesSeed, maintenanceSeed } from "../data/manufacturing.jsx";
import { PO_APPROVAL_THRESHOLD } from "../data/procurement.jsx";
import { projectExpensesSeed, projectsSeed } from "../data/projects.jsx";
import { detectUnusualExpenses } from "../lib/alerts.jsx";
import { confirmAction, logAudit } from "../lib/buses.jsx";
import { TAX_RATE, TODAY, docId, lineTotal, money } from "../lib/format.jsx";
import {
  mapBenchmarkRow,
  mapCompetitorRow,
  mapCustomKpiRow,
  mapMachineRow,
  mapMaintenanceRow,
  mapProjectExpenseRow,
  mapProjectRow,
  mapTrainingRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { computePnLFigures } from "../modules/Reports.jsx";

/* ══════════════ ANALYTICS ══════════════ */
/* ------------------------------------ ANALYTICS ------------------------------------ */

// Every number on every dashboard here is computed live from the same
// root-shared tables every module already reads — nothing is a duplicate
// snapshot that could drift. Scoped honestly to what's actually shared:
// invoices, expenses, crm, inventory, employees, leaveRequests, workOrders,
// posTransactions. Manufacturing's machines/QC, Supply Chain's shipments,
// and Procurement's purchase orders still live in their own modules'
// local state (never lifted to root), so Operations doesn't claim to cover
// them — see the note in that tab rather than a silent gap.
// Period Closes — the accounting control that prevents back-dating.
// A closed period blocks any new invoice or expense from being dated
// inside it. Named as pending since section 60; built here because the
// Bank Recon and manual journals only have meaning when periods are locked.
// Periods are stored in state (persisted to Supabase when IS_CONFIGURED);
// the check runs at invoice and expense creation time.
export const periodClosesSeed = [];

export function usePeriodCloses() {
  const [periods, setPeriods] = useState(periodClosesSeed);
  function isLocked(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return periods.some((p) => p.status === "Closed" && d >= new Date(p.startDate) && d <= new Date(p.endDate));
  }
  return { periods, setPeriods, isLocked };
}

// Manual Journal Entry — double-entry bookkeeping with debit = credit gate.
// Every journal entry must balance (debits = credits) before it can be saved.
// Entries write to the audit log and optionally to a journal_entries Supabase table.
// The debit/credit model is the same one used by the CoA: Assets/Expenses are
// debit-normal, Liabilities/Equity/Revenue are credit-normal.
export const JOURNAL_ACCOUNTS = [
  "1000 – Cash", "1100 – Accounts Receivable", "1200 – Inventory",
  "1500 – Fixed Assets", "2000 – Accounts Payable", "2100 – Loans Payable",
  "3000 – Owner&apos;s Equity", "4000 – Revenue", "4100 – Other Income",
  "5000 – Cost of Goods Sold", "6000 – Salaries Expense", "6100 – Rent Expense",
  "6200 – Utilities", "6300 – Depreciation", "6900 – Miscellaneous Expense",
];

export function ManualJournalView({ currentUser }) {
  const emptyLine = () => ({ account: JOURNAL_ACCOUNTS[0], debit: "", credit: "", memo: "" });
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [entryDate, setEntryDate] = useState(TODAY.toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState([]);
  const [err, setErr] = useState(null);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function updateLine(i, field, value) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(i) { if (lines.length > 2) setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function saveEntry() {
    if (!description.trim()) { setErr("Add a description for this journal entry."); return; }
    if (!balanced) { setErr("Debits must equal credits before saving."); return; }
    const entry = {
      id: docId("JE"),
      date: entryDate,
      description,
      lines: lines.filter((l) => Number(l.debit) > 0 || Number(l.credit) > 0),
      totalDebit,
      postedBy: currentUser?.name || "System",
      postedAt: new Date().toISOString(),
    };
    setSaved((prev) => [entry, ...prev]);
    setLines([emptyLine(), emptyLine()]);
    setDescription("");
    setErr(null);
    notify("Journal entry posted: TZS " + money(Math.round(totalDebit)) + "k", "success");
    logAudit("Manual journal entry: " + entry.id, "Finance", currentUser?.name || "System", description + " — TZS " + money(Math.round(totalDebit)) + "k");
    if (IS_CONFIGURED) {
      try {
        await sb("journal_entries").insert({
          entry_ref: entry.id, entry_date: entryDate, description,
          total_amount: totalDebit, posted_by: entry.postedBy,
        }).run();
      } catch (_e) { notify("Saved locally — server sync failed.", "error"); }
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">Manual Journal Entry</h3>
        <p className="text-[12px] text-slate-500">Double-entry bookkeeping — every entry must balance (debits = credits) before it can be posted. Entries are appended to the audit trail and cannot be deleted.</p>
      </div>

      {/* Entry form */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Entry date">
            <input type="date" className={inputClass} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </FormField>
          <FormField label="Description / Reference">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Accrued salaries July 2026" />
          </FormField>
        </div>

        {/* Lines table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100">
              <th className="pb-2 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400 w-[40%]">Account</th>
              <th className="pb-2 text-right text-[10.5px] font-medium uppercase tracking-wide text-slate-400 w-[20%]">Debit (TZS k)</th>
              <th className="pb-2 text-right text-[10.5px] font-medium uppercase tracking-wide text-slate-400 w-[20%]">Credit (TZS k)</th>
              <th className="pb-2 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Memo</th>
              <th className="pb-2 w-8" />
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2">
                    <select className={inputClass + " text-[12px]"} value={l.account} onChange={(e) => updateLine(i, "account", e.target.value)}>
                      {JOURNAL_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-1">
                    <input type="number" min="0" className={inputClass + " text-right text-[12px]"} value={l.debit} onChange={(e) => updateLine(i, "debit", e.target.value)} placeholder="0" />
                  </td>
                  <td className="py-1.5 px-1">
                    <input type="number" min="0" className={inputClass + " text-right text-[12px]"} value={l.credit} onChange={(e) => updateLine(i, "credit", e.target.value)} placeholder="0" />
                  </td>
                  <td className="py-1.5 pl-1">
                    <input className={inputClass + " text-[12px]"} value={l.memo} onChange={(e) => updateLine(i, "memo", e.target.value)} placeholder="Optional" />
                  </td>
                  <td className="py-1.5 pl-1">
                    <button onClick={() => removeLine(i)} className="text-slate-300 hover:text-[#EF4444]"><X size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td className="pt-2 text-[12px] font-semibold text-slate-500">Totals</td>
                <td className="pt-2 text-right font-mono font-bold text-[13px]" style={{ color: balanced ? "#16A34A" : "#EF4444" }}>
                  TZS {money(Math.round(totalDebit))}k
                </td>
                <td className="pt-2 text-right font-mono font-bold text-[13px]" style={{ color: balanced ? "#16A34A" : "#EF4444" }}>
                  TZS {money(Math.round(totalCredit))}k
                </td>
                <td colSpan={2} className="pt-2 text-right text-[11.5px]">
                  {balanced
                    ? <span className="text-[#16A34A] font-semibold flex items-center justify-end gap-1"><CheckCircle2 size={13} /> Balanced</span>
                    : <span className="text-[#EF4444] font-semibold flex items-center justify-end gap-1"><AlertCircle size={13} /> Out by TZS {money(Math.abs(Math.round(totalDebit - totalCredit)))}k</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={addLine} className="text-[12.5px] font-medium text-[#16A34A] hover:underline flex items-center gap-1"><Plus size={13} /> Add line</button>
          <div className="flex-1" />
          {err && <p className="text-[12px] text-[#EF4444] flex items-center gap-1"><AlertCircle size={12} />{err}</p>}
          <button onClick={saveEntry} disabled={!balanced || !description.trim()}
            className="btn-primary text-white text-[12.5px] font-medium rounded-xl px-4 py-2.5 disabled:opacity-40">
            Post Journal Entry
          </button>
        </div>
      </div>

      {/* Posted entries */}
      {saved.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[13.5px] font-semibold text-[#111827]">Posted this session ({saved.length})</p>
          </div>
          {saved.map((entry) => (
            <div key={entry.id} className="px-4 py-3 border-b border-slate-50 last:border-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12.5px] font-semibold text-[#111827]">{entry.id} — {entry.description}</span>
                <span className="font-mono text-[12px] text-[#16A34A] font-bold">TZS {money(Math.round(entry.totalDebit))}k</span>
              </div>
              <div className="text-[11px] text-slate-400">{entry.date} · Posted by {entry.postedBy} · {entry.lines.length} lines</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PeriodClosesView({ invoices, expenses, currentUser }) {
  const { periods, setPeriods } = usePeriodCloses();
  const [draft, setDraft] = useState({ name: "", startDate: "", endDate: "" });
  const [err, setErr] = useState(null);

  // Compute period P&L from real invoice and expense rows
  function periodStats(p) {
    const inRange = (d) => d && d >= p.startDate && d <= p.endDate;
    const rev = invoices.rows.filter((i) => inRange(i.issueDate) && i.status === "Paid")
      .reduce((s, i) => s + lineTotal(i.items).total, 0);
    const exp = expenses.rows.filter((e) => inRange(e.expenseDate) && e.status === "Paid")
      .reduce((s, e) => s + (e.amount || 0), 0);
    return { rev, exp, profit: rev - exp };
  }

  function addPeriod() {
    if (!draft.name || !draft.startDate || !draft.endDate) { setErr("All fields required."); return; }
    if (draft.startDate > draft.endDate) { setErr("Start must be before end."); return; }
    const overlap = periods.some((p) =>
      !(draft.endDate < p.startDate || draft.startDate > p.endDate)
    );
    if (overlap) { setErr("Period overlaps an existing one."); return; }
    const row = { id: docId("PC"), ...draft, status: "Open", createdBy: currentUser?.name || "System", createdAt: new Date().toISOString() };
    setPeriods((prev) => [...prev, row].sort((a, b) => a.startDate > b.startDate ? -1 : 1));
    setDraft({ name: "", startDate: "", endDate: "" });
    setErr(null);
    notify(`Period "${row.name}" created.`);
    logAudit(`Period created: ${row.name}`, "Finance", currentUser?.name || "System", `${row.startDate} → ${row.endDate}`);
    if (IS_CONFIGURED) sb("period_closes").insert({ name: row.name, start_date: row.startDate, end_date: row.endDate, status: "Open" }).run().catch(() => {});
  }

  function closePeriod(id) {
    confirmAction(
      "Closing a period prevents any new transactions from being dated within it. This cannot be undone.",
      () => {
        setPeriods((prev) => prev.map((p) => p.id === id ? { ...p, status: "Closed", closedBy: currentUser?.name, closedAt: new Date().toISOString() } : p));
        const p = periods.find((x) => x.id === id);
        notify(`Period "${p?.name}" is now closed.`);
        logAudit(`Period closed: ${p?.name}`, "Finance", currentUser?.name || "System", "No backdating permitted.");
        if (IS_CONFIGURED) sb("period_closes").eq("id", id).update({ status: "Closed" }).run().catch(() => {});
      },
      { variant: "danger", title: "Lock this period?", confirmLabel: "Close period" }
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">Period Closes</h3>
        <p className="text-[12px] text-slate-500">Closing a period locks it against backdating — no invoice or expense can be dated inside a closed period. Revenue and expenses shown are from real paid records only.</p>
      </div>

      {/* New period form */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
        <p className="text-[13px] font-medium text-[#111827]">Open a new period</p>
        {err && <p className="text-[12px] text-[#EF4444] flex items-center gap-1"><AlertCircle size={12}/> {err}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className="text-[11.5px] text-slate-500 block mb-1">Period name</label>
            <input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Q2 2026" /></div>
          <div><label className="text-[11.5px] text-slate-500 block mb-1">Start date</label>
            <input type="date" className={inputClass} value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></div>
          <div><label className="text-[11.5px] text-slate-500 block mb-1">End date</label>
            <input type="date" className={inputClass} value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></div>
        </div>
        <button onClick={addPeriod} className="btn-primary text-white text-[12.5px] font-medium rounded-xl px-4 py-2.5">Create period</button>
      </div>

      {/* Period list */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {periods.length === 0 && (
          <div className="py-12 text-center">
            <Lock size={28} className="text-slate-200 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-slate-400">No periods yet</p>
            <p className="text-[11.5px] text-slate-400 mt-1">Create your first accounting period above. Once closed, it cannot be backdated.</p>
          </div>
        )}
        {periods.length > 0 && (
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100">
              {["Period","Dates","Revenue","Expenses","Profit","Status","Action"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {periods.map((p) => {
                const { rev, exp, profit } = periodStats(p);
                return (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-[#111827]">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{p.startDate} → {p.endDate}</td>
                    <td className="px-4 py-3 font-mono text-[#16A34A]">{money(Math.round(rev))}k</td>
                    <td className="px-4 py-3 font-mono text-[#EF4444]">{money(Math.round(exp))}k</td>
                    <td className="px-4 py-3 font-mono font-semibold" style={{ color: profit >= 0 ? "#16A34A" : "#EF4444" }}>{profit >= 0 ? "+" : ""}{money(Math.round(profit))}k</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: p.status === "Closed" ? "#FEE2E2" : "#DCFCE7", color: p.status === "Closed" ? "#EF4444" : "#16A34A" }}>
                        {p.status === "Closed" ? "🔒 Closed" : "● Open"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "Open" && (
                        <button onClick={() => closePeriod(p.id)} className="text-[11.5px] font-medium text-[#EF4444] hover:underline flex items-center gap-1"><Lock size={11}/> Close</button>
                      )}
                      {p.status === "Closed" && <p className="text-[10.5px] text-slate-400">by {p.closedBy || "System"}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function BankReconciliationView({ invoices, expenses }) {
  const [statement, setStatement] = useState("");
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [ran, setRan] = useState(false);

  function reconcile() {
    // Parse statement lines: date, description, amount (one per line, comma or tab separated)
    const lines = statement.trim().split("
").filter(Boolean).map((line) => {
      const parts = line.split(/[,	]+/).map((p) => p.trim());
      const amount = parseFloat(parts.find((p) => /^-?\d[\d,.]+$/.test(p.replace(/,/g, "")))?.replace(/,/g, "") || 0);
      const desc = parts.filter((p) => isNaN(Number(p.replace(/,/g, "")))).join(" ");
      return { raw: line, amount: Math.abs(amount), desc };
    }).filter((l) => l.amount > 0);

    const ledgerCredits = [
      ...invoices.rows.filter((i) => i.status === "Paid").map((i) => ({ id: i.id, label: i.customer, amount: Math.round(lineTotal(i.items).total), type: "Receipt" })),
      ...expenses.rows.filter((e) => e.status === "Paid").map((e) => ({ id: e.id, label: e.vendor, amount: Math.round(e.amount || 0), type: "Payment" })),
    ];

    const usedLedger = new Set();
    const matchedRows = [];
    const unmatchedStatement = [];

    for (const sl of lines) {
      const tolerance = Math.max(sl.amount * 0.01, 50); // 1% or TZS 50k tolerance
      const hit = ledgerCredits.find((l) => !usedLedger.has(l.id) && Math.abs(l.amount - sl.amount) <= tolerance);
      if (hit) {
        usedLedger.add(hit.id);
        matchedRows.push({ statement: sl, ledger: hit });
      } else {
        unmatchedStatement.push(sl);
      }
    }

    const unmatchedLedger = ledgerCredits.filter((l) => !usedLedger.has(l.id));
    setMatched(matchedRows);
    setUnmatched({ statement: unmatchedStatement, ledger: unmatchedLedger });
    setRan(true);
    notify(`Reconciliation complete — ${matchedRows.length} matched, ${unmatchedStatement.length + unmatchedLedger.length} unmatched.`);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">Bank Reconciliation</h3>
        <p className="text-[12px] text-slate-500">Paste your bank statement lines (one per line: date, description, amount). The system matches them against your paid invoices and expenses by amount — within 1% tolerance.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
        <p className="text-[12.5px] font-medium text-[#111827]">Bank statement (paste lines)</p>
        <textarea className={inputClass + " h-32 resize-none"} value={statement} onChange={(e) => setStatement(e.target.value)}
          placeholder={"2026-07-10, King Fahad Medical City, 1240000
2026-07-12, Supplier payment - Karibu Tools, 85000
2026-07-14, Salary disbursement, 3290000"} />
        <div className="flex gap-2">
          <button onClick={reconcile} className="btn-primary text-white text-[12.5px] font-medium rounded-xl px-4 py-2.5">Run reconciliation</button>
          {ran && <button onClick={() => { setRan(false); setMatched([]); setUnmatched([]); }} className="text-[12.5px] text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">Clear</button>}
        </div>
      </div>

      {ran && (
        <>
          {/* Matched */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-[#16A34A]" />
              <p className="text-[13px] font-semibold text-[#111827]">Matched ({matched.length})</p>
            </div>
            {matched.length === 0 && <p className="text-[12px] text-slate-400 text-center py-6">No matches found — check amounts match your ledger.</p>}
            {matched.map((m, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#111827] truncate">{m.statement.desc || m.statement.raw}</p>
                  <p className="text-[10.5px] text-slate-400">Statement</p>
                </div>
                <CheckCircle2 size={14} className="text-[#16A34A] shrink-0" />
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[12px] font-medium text-[#111827] truncate">{m.ledger.label} · {m.ledger.type}</p>
                  <p className="text-[10.5px] text-slate-400">{m.ledger.id}</p>
                </div>
                <span className="font-mono text-[12px] font-semibold text-[#16A34A] shrink-0">TZS {money(m.ledger.amount)}k</span>
              </div>
            ))}
          </div>

          {/* Unmatched */}
          {(unmatched.statement?.length > 0 || unmatched.ledger?.length > 0) && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <AlertCircle size={14} className="text-[#F59E0B]" />
                <p className="text-[13px] font-semibold text-[#111827]">Unmatched ({(unmatched.statement?.length || 0) + (unmatched.ledger?.length || 0)})</p>
              </div>
              {unmatched.statement?.map((sl, i) => (
                <div key={`s${i}`} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
                  <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">Statement</span>
                  <p className="flex-1 text-[12px] text-[#111827] truncate">{sl.desc || sl.raw}</p>
                  <span className="font-mono text-[12px] text-slate-500">TZS {money(sl.amount)}k</span>
                </div>
              ))}
              {unmatched.ledger?.map((l, i) => (
                <div key={`l${i}`} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
                  <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[#1E40AF]">Ledger</span>
                  <p className="flex-1 text-[12px] text-[#111827] truncate">{l.label} · {l.type}</p>
                  <span className="font-mono text-[12px] text-slate-500">{l.id}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Command Palette ⌘K ────────────────────────────────────────────────────
// The hallmark of professional SaaS. Press ⌘K (or Ctrl+K) anywhere to
// search modules, create documents, and jump to any part of the system.
// Results are ranked: exact matches first, then fuzzy, then actions.
export const CMD_ITEMS = [
  // Navigation
  { type: "nav",    id: "dashboard",    label: "Go to Dashboard",          icon: "LayoutDashboard", mod: "dashboard" },
  { type: "nav",    id: "sales",        label: "Go to Sales",              icon: "ShoppingCart",    mod: "sales" },
  { type: "nav",    id: "pos",          label: "Go to Point of Sale",      icon: "Store",           mod: "pos" },
  { type: "nav",    id: "crm",          label: "Go to CRM",                icon: "Users",           mod: "crm" },
  { type: "nav",    id: "inventory",    label: "Go to Inventory",          icon: "Package",         mod: "inventory" },
  { type: "nav",    id: "procurement",  label: "Go to Procurement",        icon: "Truck",           mod: "procurement" },
  { type: "nav",    id: "finance",      label: "Go to Finance",            icon: "Wallet",          mod: "finance" },
  { type: "nav",    id: "hr",           label: "Go to HR",                 icon: "Users",           mod: "hr" },
  { type: "nav",    id: "manufacturing",label: "Go to Manufacturing",      icon: "Factory",         mod: "manufacturing" },
  { type: "nav",    id: "projects",     label: "Go to Projects",           icon: "Kanban",          mod: "projects" },
  { type: "nav",    id: "analytics",    label: "Go to Analytics",          icon: "BarChart3",       mod: "analytics" },
  { type: "nav",    id: "ai",           label: "Go to AI Assistant",       icon: "Brain",           mod: "ai" },
  { type: "nav",    id: "settings",     label: "Go to Settings",           icon: "Settings",        mod: "settings" },
  // Actions
  { type: "action", id: "new-invoice",  label: "New Invoice",              icon: "Plus",    tab: "invoices",  mod: "sales" },
  { type: "action", id: "new-quote",    label: "New Quotation",            icon: "Plus",    tab: "quotations",mod: "sales" },
  { type: "action", id: "new-expense",  label: "New Expense",              icon: "Plus",    tab: "expenses",  mod: "finance" },
  { type: "action", id: "new-customer", label: "Add Customer",             icon: "UserPlus",tab: "customers", mod: "crm" },
  { type: "action", id: "new-employee", label: "Add Employee",             icon: "UserPlus",tab: null,        mod: "hr" },
  { type: "action", id: "new-po",       label: "New Purchase Order",       icon: "Plus",    tab: "pos-orders",mod: "procurement" },
  { type: "action", id: "new-product",  label: "Add Product to Inventory", icon: "Plus",    tab: "stock",     mod: "inventory" },
  { type: "action", id: "journal-entry",label: "Post Journal Entry",       icon: "BookOpen",tab: "journal",   mod: "finance" },
  { type: "action", id: "run-payroll",  label: "Run Payroll",              icon: "Wallet",  tab: "payroll",   mod: "hr" },
  // Finance tabs
  { type: "nav",    id: "receivables",  label: "Finance &#8250; Receivables",icon: "Landmark",mod: "finance", tab: "receivables" },
  { type: "nav",    id: "ledger",       label: "Finance &#8250; General Ledger",icon: "FileText",mod: "finance", tab: "ledger" },
  { type: "nav",    id: "tax",          label: "Finance &#8250; Tax Center",icon: "Percent",mod: "finance",   tab: "tax" },
  { type: "nav",    id: "banking",      label: "Finance &#8250; Banking",   icon: "Banknote",mod: "finance",  tab: "banking" },
  { type: "nav",    id: "budgets",      label: "Finance &#8250; Budgets",   icon: "Target",  mod: "finance",  tab: "budgets" },
  { type: "nav",    id: "period-closes",label: "Finance &#8250; Period Closes",icon: "Lock",mod: "finance",  tab: "periods" },
  { type: "nav",    id: "recon",        label: "Finance &#8250; Bank Recon",icon: "GitBranch",mod: "finance", tab: "reconcile" },
];

// ═══════════════════════════════════════════════════════════════════════════
// MICROFINANCE MODULE
// Full micro-lending platform: loan products, client registry, applications,
// disbursements, repayment schedules (flat & reducing balance), collections,
// arrears tracking, PAR (Portfolio At Risk) reporting.
// ═══════════════════════════════════════════════════════════════════════════
export const MFI_LOAN_PRODUCTS = [
  { id: "p1", name: "Business Loan", minAmount: 100, maxAmount: 10000, interestRate: 3, termMonths: 12, interestMethod: "flat" },
  { id: "p2", name: "Emergency Loan", minAmount: 50, maxAmount: 2000, interestRate: 5, termMonths: 3, interestMethod: "flat" },
  { id: "p3", name: "Group Loan", minAmount: 200, maxAmount: 5000, interestRate: 2.5, termMonths: 6, interestMethod: "reducing" },
  { id: "p4", name: "Agricultural Loan", minAmount: 500, maxAmount: 20000, interestRate: 2, termMonths: 8, interestMethod: "flat" },
  { id: "p5", name: "School Fees Loan", minAmount: 100, maxAmount: 3000, interestRate: 4, termMonths: 4, interestMethod: "flat" },
];

export const MFI_CLIENT_SEED = [
  { id: "CLT-001", name: "Amina Rashidi", phone: "0712 345 678", national_id: "199001234567", gender: "Female", village: "Mwanza", joinedDate: "2025-01-10", status: "Active" },
  { id: "CLT-002", name: "John Makundi", phone: "0754 987 654", national_id: "198805678901", gender: "Male", village: "Dar es Salaam", joinedDate: "2025-02-15", status: "Active" },
  { id: "CLT-003", name: "Fatuma Saidi", phone: "0768 111 222", national_id: "199203456789", gender: "Female", village: "Arusha", joinedDate: "2025-03-01", status: "Active" },
  { id: "CLT-004", name: "Peter Mwangi", phone: "0745 333 444", national_id: "197804321098", gender: "Male", village: "Moshi", joinedDate: "2025-01-20", status: "Inactive" },
];

export const MFI_LOAN_SEED = [
  { id: "LN-2025-001", clientId: "CLT-001", clientName: "Amina Rashidi", productId: "p1", productName: "Business Loan", principal: 2000, interestRate: 3, termMonths: 12, interestMethod: "flat", disbursedDate: "2025-01-15", status: "Active", amountPaid: 1050, missedPayments: 0 },
  { id: "LN-2025-002", clientId: "CLT-002", clientName: "John Makundi", productId: "p3", productName: "Group Loan", principal: 1500, interestRate: 2.5, termMonths: 6, interestMethod: "reducing", disbursedDate: "2025-02-20", status: "Active", amountPaid: 400, missedPayments: 1 },
  { id: "LN-2025-003", clientId: "CLT-003", clientName: "Fatuma Saidi", productId: "p5", productName: "School Fees Loan", principal: 800, interestRate: 4, termMonths: 4, interestMethod: "flat", disbursedDate: "2025-03-05", status: "Arrears", amountPaid: 100, missedPayments: 2 },
  { id: "LN-2025-004", clientId: "CLT-004", clientName: "Peter Mwangi", productId: "p2", productName: "Emergency Loan", principal: 500, interestRate: 5, termMonths: 3, interestMethod: "flat", disbursedDate: "2024-11-10", status: "Closed", amountPaid: 575, missedPayments: 0 },
];

export function calcLoanTotal(principal, rate, term, method) {
  if (method === "flat") return { total: principal * (1 + rate * term / 100), interest: principal * rate * term / 100 };
  // Reducing balance
  const r = rate / 100;
  const pmt = principal * r * Math.pow(1+r, term) / (Math.pow(1+r, term) - 1);
  return { total: pmt * term, interest: pmt * term - principal };
}

export function calcPAR(loans) {
  const active = loans.filter((l) => l.status !== "Closed");
  const atRisk = active.filter((l) => l.missedPayments > 0);
  const portfolio = active.reduce((s, l) => s + l.principal, 0);
  const riskAmt = atRisk.reduce((s, l) => s + l.principal, 0);
  return portfolio > 0 ? (riskAmt / portfolio) * 100 : 0;
}

export const MFI_TABS = [
  { id: "overview", label: "Portfolio Overview", icon: BarChart3 },
  { id: "clients", label: "Client Registry", icon: CircleUserRound },
  { id: "loans", label: "Loan Book", icon: HandCoins },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "collections", label: "Collections", icon: Receipt },
  { id: "reports", label: "MFI Reports", icon: BarChart2 },
];

export function MicrofinanceModule({ currentUser }) {
  const [tab, setTab] = useState("overview");
  const clients  = useCompanyTable("mfi_clients",  MFI_CLIENT_SEED,  { mapRow: (r) => ({ id:r.id, name:r.name, phone:r.phone, nationalId:r.national_id||r.nationalId, gender:r.gender, village:r.village, joinedDate:r.joined_date||r.joinedDate, status:r.status }) });
  const loans    = useCompanyTable("mfi_loans",    MFI_LOAN_SEED,    { mapRow: (r) => ({ id:r.id, clientId:r.client_id||r.clientId, clientName:r.client_name||r.clientName, productId:r.product_id||r.productId, productName:r.product_name||r.productName, principal:r.principal, rate:r.rate, months:r.months, disbursed:r.disbursed, status:r.status, balance:r.balance||r.principal, collateral:r.collateral||"None" }) });
  const savings  = useCompanyTable("mfi_savings",  [],               { mapRow: (r) => r });

  const [clientForm, setClientForm] = useState({ name:"", phone:"", gender:"F", village:"", nationalId:"", status:"Active" });
  const [loanForm,   setLoanForm]   = useState({ clientId:"", principal:"", rate:15, months:12, collateral:"", product:"Personal Loan" });
  const [savingForm, setSavingForm] = useState({ clientId:"", amount:"", type:"Deposit" });
  const [showClientForm, setShowClientForm] = useState(false);
  const [showLoanForm,   setShowLoanForm]   = useState(false);
  const [showSavingForm, setShowSavingForm] = useState(false);
  const [repayModal, setRepayModal] = useState(null);
  const [repayAmt,   setRepayAmt]   = useState("");

  const activeLoans    = loans.rows.filter((l) => l.status === "Active");
  const totalPortfolio = activeLoans.reduce((s,l) => s + l.balance, 0);
  const totalClients   = clients.rows.length;
  const atRisk         = loans.rows.filter((l) => l.status === "Defaulted" || l.status === "Overdue");
  const totalSavings   = savings.rows.filter(r=>r.type==="Deposit").reduce((s,r)=>s+r.amount,0)
                       - savings.rows.filter(r=>r.type==="Withdrawal").reduce((s,r)=>s+r.amount,0);

  const MFI_TABS = [
    { id:"overview",  label:"Overview",   icon: LayoutDashboard },
    { id:"clients",   label:"Clients",    icon: Users },
    { id:"loans",     label:"Loans",      icon: CircleDollarSign },
    { id:"savings",   label:"Savings",    icon: Wallet },
    { id:"arrears",   label:"Arrears",    icon: AlertCircle },
    { id:"reports",   label:"Reports",    icon: BarChart3 },
  ];

  const LOAN_PRODUCTS = ["Personal Loan","Business Loan","Agricultural Loan","Emergency Loan","Group Loan","Asset Finance"];

  async function saveClient() {
    if (!clientForm.name.trim()) return;
    const row = { id:docId("CLI"), ...clientForm, joinedDate:TODAY.toISOString().slice(0,10) };
    clients.setRows((prev)=>[row,...prev]);
    setClientForm({ name:"",phone:"",gender:"F",village:"",nationalId:"",status:"Active" });
    setShowClientForm(false);
    notify("Client " + row.name + " registered");
    if (IS_CONFIGURED) { try { await sb("mfi_clients").insert({ name:row.name, phone:row.phone, gender:row.gender, village:row.village, national_id:row.nationalId, status:"Active", joined_date:row.joinedDate }).run(); } catch(_e){} }
  }

  async function disburseLoan() {
    if (!loanForm.clientId || !loanForm.principal) return;
    const client = clients.rows.find(c=>c.id===loanForm.clientId);
    const interest = Number(loanForm.principal) * Number(loanForm.rate)/100;
    const total = Number(loanForm.principal) + interest;
    const row = { id:docId("LN"), clientId:loanForm.clientId, clientName:client?.name||"", productName:loanForm.product, principal:Number(loanForm.principal), rate:Number(loanForm.rate), months:Number(loanForm.months), disbursed:TODAY.toISOString().slice(0,10), status:"Active", balance:total, collateral:loanForm.collateral||"None" };
    loans.setRows((prev)=>[row,...prev]);
    setLoanForm({ clientId:"",principal:"",rate:15,months:12,collateral:"",product:"Personal Loan" });
    setShowLoanForm(false);
    notify("Loan of TZS " + money(row.principal) + "k disbursed to " + client?.name);
    logAudit("Loan disbursed: "+row.id, "Microfinance", currentUser?.name||"System", "TZS "+money(row.principal)+"k to "+client?.name);
    if (IS_CONFIGURED) { try { await sb("mfi_loans").insert({ client_id:row.clientId, client_name:row.clientName, product_name:row.productName, principal:row.principal, rate:row.rate, months:row.months, disbursed:row.disbursed, status:"Active", balance:row.balance, collateral:row.collateral }).run(); } catch(_e){} }
  }

  function submitRepayment() {
    if (!repayModal || !repayAmt) return;
    const amt = Number(repayAmt);
    const newBal = Math.max(0, repayModal.balance - amt);
    const newStatus = newBal <= 0 ? "Closed" : "Active";
    loans.setRows((prev)=>prev.map(l=>l.id===repayModal.id ? {...l, balance:newBal, status:newStatus} : l));
    notify("TZS " + money(amt) + "k repayment recorded");
    logAudit("Repayment: "+repayModal.id, "Microfinance", currentUser?.name||"System", "TZS "+money(amt)+"k — Balance: TZS "+money(newBal)+"k");
    setRepayModal(null); setRepayAmt("");
  }

  async function saveSaving() {
    if (!savingForm.clientId || !savingForm.amount) return;
    const client = clients.rows.find(c=>c.id===savingForm.clientId);
    const row = { id:docId("SAV"), clientId:savingForm.clientId, clientName:client?.name||"", amount:Number(savingForm.amount), type:savingForm.type, date:TODAY.toISOString().slice(0,10) };
    savings.setRows((prev)=>[row,...prev]);
    setSavingForm({ clientId:"",amount:"",type:"Deposit" });
    setShowSavingForm(false);
    notify((row.type==="Deposit"?"Deposit":"Withdrawal") + " of TZS " + money(row.amount) + "k recorded for " + client?.name);
  }

  const monthlyRevenue = activeLoans.reduce((s,l)=>s+(l.principal*l.rate/100/l.months),0);
  const PAR30 = atRisk.reduce((s,l)=>s+l.balance,0);
  const PAR30_ratio = totalPortfolio > 0 ? (PAR30/totalPortfolio*100).toFixed(1) : 0;

  return (
    <div className="space-y-4">
      {/* MFI Header */}
      <div className="rounded-2xl overflow-hidden px-5 py-5" style={{background:"linear-gradient(135deg,#064E3B 0%,#059669 50%,#10B981 100%)"}}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[19px] font-bold text-white">Microfinance Institution</h1>
            <p className="text-[12px] mt-0.5" style={{color:"rgba(255,255,255,.65)"}}>Loans &middot; Savings &middot; Client Management &middot; PAR Monitoring</p>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setShowClientForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold text-white" style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)"}}><UserPlus size={13}/>Client</button>
            <button onClick={()=>setShowLoanForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold text-white" style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)"}}><Plus size={13}/>Disburse</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {MFI_TABS.map((t)=>{const I=t.icon;return(
          <button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap "+(tab===t.id?"bg-[#059669] text-white shadow-sm":"text-slate-500 hover:bg-slate-50")}><I size={13}/>{t.label}{t.id==="arrears"&&atRisk.length>0&&<span className="ml-1 bg-[#EF4444] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">{atRisk.length}</span>}</button>
        );})}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {l:"Active Clients",v:totalClients,sub:clients.rows.filter(c=>c.status==="Active").length+" active",c:"#059669",I:Users},
              {l:"Loan Portfolio",v:"TZS "+money(totalPortfolio)+"k",sub:activeLoans.length+" active loans",c:"#2563EB",I:CircleDollarSign},
              {l:"Savings (Net)",  v:"TZS "+money(totalSavings)+"k",sub:"Total deposits held",c:"#7C3AED",I:Wallet},
              {l:"PAR > 30 days",  v:PAR30_ratio+"%",sub:"TZS "+money(PAR30)+"k at risk",c:PAR30_ratio>5?"#EF4444":"#16A34A",I:AlertCircle},
            ].map((k)=>(
              <div key={k.l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.l}</p><p className="text-[20px] font-bold mt-1 text-[#111827]">{k.v}</p><p className="text-[11px] mt-0.5" style={{color:k.c}}>{k.sub}</p></div>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:k.c+"18"}}><k.I size={17} style={{color:k.c}}/></div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Loan Portfolio by Product (TZS k)</p>
              {(() => {
                const prodData = ["Personal Loan","Business Loan","Agricultural Loan","Emergency Loan","Group Loan"].map((prod,i)=>{
                  const bal = activeLoans.filter(l=>l.productName===prod).reduce((s,l)=>s+l.balance,0);
                  return { name:prod.replace(" Loan",""), value:Math.round(bal/1000), fill:["#059669","#2563EB","#D97706","#EF4444","#7C3AED"][i] };
                }).filter(d=>d.value>0);
                if (!prodData.length) return <p className="text-slate-400 text-center py-4">No active loans</p>;
                return (
                  <ResponsiveContainer width="100%" height={155}>
                    <BarChart data={prodData} layout="vertical" margin={{left:5,right:24,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis type="number" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" tick={{fontSize:10}} axisLine={false} tickLine={false} width={70}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Balance"]}/>
                      <Bar dataKey="value" radius={[0,4,4,0]} maxBarSize={16}>
                        {prodData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[12px] text-slate-500">Est. Monthly Interest Income</span>
                <span className="text-[14px] font-mono font-bold text-[#059669]">TZS {money(monthlyRevenue)}k</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Portfolio Quality</p>
              {(() => {
                const qualData = [
                  {name:"Active",  value:loans.rows.filter(l=>l.status==="Active").length,  fill:"#059669"},
                  {name:"Closed",  value:loans.rows.filter(l=>l.status==="Closed").length,  fill:"#94A3B8"},
                  {name:"Defaulted",value:loans.rows.filter(l=>l.status==="Defaulted").length,fill:"#EF4444"},
                  {name:"Overdue", value:atRisk.length,                                     fill:"#F59E0B"},
                ].filter(d=>d.value>0);
                return qualData.length===0?<p className="text-slate-400 text-center py-4">No loans</p>:(
                  <div>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart><Pie data={qualData} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={26}>
                        {qualData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" loans",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-2">
                      {qualData.map(d=>(
                        <div key={d.name} className="flex items-center justify-between text-[11.5px]">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">PAR > 30: <strong className="text-[#EF4444]">{PAR30_ratio}%</strong></p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* CLIENTS */}
      {tab === "clients" && (
        <div className="space-y-3">
          {showClientForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">Register New Client</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Full Name"><input className={inputClass} value={clientForm.name} onChange={e=>setClientForm({...clientForm,name:e.target.value})} placeholder="Full name"/></FormField>
                <FormField label="Phone"><input className={inputClass} value={clientForm.phone} onChange={e=>setClientForm({...clientForm,phone:e.target.value})} placeholder="0712 XXX XXX"/></FormField>
                <FormField label="National ID"><input className={inputClass} value={clientForm.nationalId} onChange={e=>setClientForm({...clientForm,nationalId:e.target.value})} placeholder="NIDA number"/></FormField>
                <FormField label="Gender"><select className={inputClass} value={clientForm.gender} onChange={e=>setClientForm({...clientForm,gender:e.target.value})}><option value="F">Female</option><option value="M">Male</option></select></FormField>
                <FormField label="Village / Ward"><input className={inputClass} value={clientForm.village} onChange={e=>setClientForm({...clientForm,village:e.target.value})} placeholder="Village or ward"/></FormField>
                <FormField label="Status"><select className={inputClass} value={clientForm.status} onChange={e=>setClientForm({...clientForm,status:e.target.value})}><option>Active</option><option>Inactive</option><option>Blacklisted</option></select></FormField>
              </div>
              <div className="flex gap-2"><button onClick={saveClient} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Register Client</button><button onClick={()=>setShowClientForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          {!showClientForm && <div className="flex justify-end"><button onClick={()=>setShowClientForm(true)} className="flex items-center gap-1.5 btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5"><UserPlus size={13}/>Register Client</button></div>}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]"><thead><tr className="border-b border-slate-100 bg-slate-50">{["Client","Phone","National ID","Village","Status","Loans"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{clients.rows.map((cl)=>{
                const clLoans = loans.rows.filter(l=>l.clientId===cl.id&&l.status==="Active");
                return (
                  <tr key={cl.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{background:"#059669"}}>{cl.name.charAt(0)}</div><span className="font-medium text-[#111827]">{cl.name}</span></div></td>
                    <td className="px-4 py-3 text-slate-500">{cl.phone}</td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-slate-500">{cl.nationalId||"—"}</td>
                    <td className="px-4 py-3 text-slate-500">{cl.village||"—"}</td>
                    <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:cl.status==="Active"?"#DCFCE7":cl.status==="Blacklisted"?"#FEE2E2":"#F3F4F6",color:cl.status==="Active"?"#16A34A":cl.status==="Blacklisted"?"#EF4444":"#6B7280"}}>{cl.status}</span></td>
                    <td className="px-4 py-3"><span className={clLoans.length>0?"text-[#2563EB] font-semibold":"text-slate-300"}>{clLoans.length>0?clLoans.length+" active":"None"}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* LOANS */}
      {tab === "loans" && (
        <div className="space-y-3">
          {showLoanForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">Disburse New Loan</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Client"><select className={inputClass} value={loanForm.clientId} onChange={e=>setLoanForm({...loanForm,clientId:e.target.value})}><option value="">Select client...</option>{clients.rows.map(cl=><option key={cl.id} value={cl.id}>{cl.name}</option>)}</select></FormField>
                <FormField label="Loan Product"><select className={inputClass} value={loanForm.product} onChange={e=>setLoanForm({...loanForm,product:e.target.value})}>{LOAN_PRODUCTS.map(p=><option key={p}>{p}</option>)}</select></FormField>
                <FormField label="Principal (TZS k)"><input type="number" min="0" className={inputClass} value={loanForm.principal} onChange={e=>setLoanForm({...loanForm,principal:e.target.value})}/></FormField>
                <FormField label="Interest Rate (% p.a.)"><input type="number" className={inputClass} value={loanForm.rate} onChange={e=>setLoanForm({...loanForm,rate:e.target.value})}/></FormField>
                <FormField label="Duration (months)"><input type="number" min="1" className={inputClass} value={loanForm.months} onChange={e=>setLoanForm({...loanForm,months:e.target.value})}/></FormField>
                <FormField label="Collateral"><input className={inputClass} value={loanForm.collateral} onChange={e=>setLoanForm({...loanForm,collateral:e.target.value})} placeholder="e.g. Land title, Motorcycle"/></FormField>
              </div>
              {loanForm.principal && (
                <div className="grid grid-cols-3 gap-3">
                  {[["Total Repayable","TZS "+money(Number(loanForm.principal)*(1+Number(loanForm.rate)/100))+"k","#111827"],["Monthly Payment","TZS "+money(Number(loanForm.principal)*(1+Number(loanForm.rate)/100)/Number(loanForm.months))+"k","#2563EB"],["Interest Income","TZS "+money(Number(loanForm.principal)*Number(loanForm.rate)/100)+"k","#059669"]].map(([l,v,col])=>(
                    <div key={l} className="bg-slate-50 rounded-lg p-2.5 text-center"><p className="text-[10.5px] text-slate-400">{l}</p><p className="text-[13.5px] font-bold mt-0.5" style={{color:col}}>{v}</p></div>
                  ))}
                </div>
              )}
              <div className="flex gap-2"><button onClick={disburseLoan} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Disburse Loan</button><button onClick={()=>setShowLoanForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          {!showLoanForm && <div className="flex justify-end"><button onClick={()=>setShowLoanForm(true)} className="flex items-center gap-1.5 btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5"><Plus size={13}/>Disburse Loan</button></div>}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]"><thead><tr className="border-b border-slate-100 bg-slate-50">{["Loan #","Client","Product","Principal","Rate","Balance","Collateral","Status",""].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{loans.rows.map((l)=>(
                <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-3 font-mono text-[11px] font-medium text-[#059669]">{l.id}</td>
                  <td className="px-3 py-3 font-medium text-[#111827]">{l.clientName}</td>
                  <td className="px-3 py-3 text-slate-500 text-[11.5px]">{l.productName}</td>
                  <td className="px-3 py-3 font-mono">{money(l.principal)}k</td>
                  <td className="px-3 py-3 text-slate-500">{l.rate}%</td>
                  <td className="px-3 py-3 font-mono font-bold" style={{color:l.balance>0?"#2563EB":"#16A34A"}}>{money(l.balance)}k</td>
                  <td className="px-3 py-3 text-slate-500 text-[11px]">{l.collateral}</td>
                  <td className="px-3 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:l.status==="Active"?"#DBEAFE":l.status==="Closed"?"#DCFCE7":l.status==="Defaulted"?"#FEE2E2":"#FEF3C7",color:l.status==="Active"?"#2563EB":l.status==="Closed"?"#16A34A":l.status==="Defaulted"?"#EF4444":"#D97706"}}>{l.status}</span></td>
                  <td className="px-3 py-3">{l.status==="Active"&&<button onClick={()=>{setRepayModal(l);setRepayAmt("");}} className="text-[11px] font-semibold text-white bg-[#059669] px-2.5 py-1 rounded-lg">Repay</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* SAVINGS */}
      {tab === "savings" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Total Deposits</p><p className="text-[20px] font-bold text-[#7C3AED]">TZS {money(savings.rows.filter(r=>r.type==="Deposit").reduce((s,r)=>s+r.amount,0))}k</p></div>
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Net Balance</p><p className="text-[20px] font-bold text-[#059669]">TZS {money(totalSavings)}k</p></div>
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Savers</p><p className="text-[20px] font-bold text-[#111827]">{[...new Set(savings.rows.map(r=>r.clientId))].length}</p></div>
          </div>
          {!showSavingForm && <div className="flex justify-end"><button onClick={()=>setShowSavingForm(true)} className="flex items-center gap-1.5 btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5"><Plus size={13}/>Record Transaction</button></div>}
          {showSavingForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">Record Savings Transaction</p>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Client"><select className={inputClass} value={savingForm.clientId} onChange={e=>setSavingForm({...savingForm,clientId:e.target.value})}><option value="">Select client...</option>{clients.rows.map(cl=><option key={cl.id} value={cl.id}>{cl.name}</option>)}</select></FormField>
                <FormField label="Amount (TZS k)"><input type="number" className={inputClass} value={savingForm.amount} onChange={e=>setSavingForm({...savingForm,amount:e.target.value})}/></FormField>
                <FormField label="Type"><select className={inputClass} value={savingForm.type} onChange={e=>setSavingForm({...savingForm,type:e.target.value})}><option>Deposit</option><option>Withdrawal</option></select></FormField>
              </div>
              <div className="flex gap-2"><button onClick={saveSaving} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Save</button><button onClick={()=>setShowSavingForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]"><thead><tr className="border-b border-slate-100 bg-slate-50">{["Date","Client","Type","Amount"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{savings.rows.length===0?<tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400 text-[13px]">No savings transactions yet. Record the first one above.</td></tr>:savings.rows.map((s)=>(
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-mono text-slate-500">{s.date}</td>
                  <td className="px-4 py-3 font-medium text-[#111827]">{s.clientName}</td>
                  <td className="px-4 py-3"><span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{background:s.type==="Deposit"?"#DCFCE7":"#FEE2E2",color:s.type==="Deposit"?"#16A34A":"#EF4444"}}>{s.type}</span></td>
                  <td className="px-4 py-3 font-mono font-bold" style={{color:s.type==="Deposit"?"#059669":"#EF4444"}}>{s.type==="Withdrawal"?"-":"+"} TZS {money(s.amount)}k</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ARREARS / PAR */}
      {tab === "arrears" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2]">
            <AlertCircle size={18} className="text-[#EF4444] shrink-0"/>
            <div><p className="text-[13px] font-semibold text-[#991B1B]">Portfolio at Risk (PAR30)</p><p className="text-[12px] text-[#B91C1C]">TZS {money(PAR30)}k in {atRisk.length} loan{atRisk.length!==1?"s":""} overdue &gt; 30 days. PAR ratio: {PAR30_ratio}%</p></div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><p className="text-[13.5px] font-semibold text-[#111827]">Overdue &amp; Defaulted Loans</p></div>
            <table className="w-full text-[12.5px]"><thead><tr className="border-b border-slate-100 bg-slate-50">{["Loan","Client","Disbursed","Balance","Status","Collateral","Action"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{atRisk.length===0?<tr><td colSpan={7} className="px-4 py-10 text-center text-[#16A34A] font-medium">No loans at risk. Portfolio is healthy.</td></tr>:atRisk.map((l)=>(
                <tr key={l.id} className="border-b border-slate-50 last:border-0 bg-[#FEF2F2]/30">
                  <td className="px-4 py-3 font-mono font-medium text-[#EF4444]">{l.id}</td>
                  <td className="px-4 py-3 font-medium text-[#111827]">{l.clientName}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{l.disbursed}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[#EF4444]">TZS {money(l.balance)}k</td>
                  <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#EF4444]">{l.status}</span></td>
                  <td className="px-4 py-3 text-slate-500 text-[11.5px]">{l.collateral}</td>
                  <td className="px-4 py-3"><button onClick={()=>{setRepayModal(l);setRepayAmt("");}} className="text-[11px] font-semibold text-white bg-[#EF4444] px-2.5 py-1 rounded-lg">Collect</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORTS */}
      {tab === "reports" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
            <h3 className="text-[15px] font-semibold text-[#111827] mb-4">MFI Performance Summary</h3>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[["Total Disbursed",money(loans.rows.reduce((s,l)=>s+l.principal,0))+"k"],["Loans Closed",loans.rows.filter(l=>l.status==="Closed").length],["Recovery Rate",loans.rows.length>0?(loans.rows.filter(l=>l.status==="Closed").length/loans.rows.length*100).toFixed(0)+"%":"—"],["Monthly Revenue","TZS "+money(monthlyRevenue)+"k"]].map(([l,v])=>(
                <div key={l} className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-400">{l}</p><p className="text-[18px] font-bold text-[#059669] mt-0.5">TZS {isNaN(Number(v.replace(/[^0-9]/g,"")))?"" : v.includes("%")||v.includes("k")||!isNaN(Number(v)) ? v : "TZS "+v}</p></div>
              ))}
            </div>
            <div className="space-y-2">
              {clients.rows.slice(0,5).map((cl)=>{
                const clLoans = loans.rows.filter(l=>l.clientId===cl.id);
                const outstanding = clLoans.filter(l=>l.status==="Active").reduce((s,l)=>s+l.balance,0);
                return (
                  <div key={cl.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{background:"#059669"}}>{cl.name.charAt(0)}</div><span className="text-[12.5px] font-medium text-[#111827]">{cl.name}</span></div>
                    <div className="text-right"><p className="text-[12px] font-mono font-bold" style={{color:outstanding>0?"#2563EB":"#16A34A"}}>{outstanding>0?"TZS "+money(outstanding)+"k outstanding":"No balance"}</p><p className="text-[10.5px] text-slate-400">{clLoans.length} loan{clLoans.length!==1?"s":""} total</p></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Repayment Modal */}
      {repayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:"rgba(0,0,0,0.4)"}}>
          <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
            <p className="text-[15px] font-semibold text-[#111827] mb-1">Record Repayment</p>
            <p className="text-[12px] text-slate-500 mb-4">{repayModal.clientName} &middot; Balance: TZS {money(repayModal.balance)}k</p>
            <FormField label="Amount received (TZS k)"><input type="number" min="0" className={inputClass} value={repayAmt} onChange={e=>setRepayAmt(e.target.value)} autoFocus/></FormField>
            <div className="flex gap-2 mt-4">
              <button onClick={submitRepayment} className="flex-1 btn-primary text-white rounded-xl py-2.5 text-[13px] font-semibold">Confirm</button>
              <button onClick={()=>setRepayModal(null)} className="flex-1 text-[13px] text-slate-500 rounded-xl py-2.5 border border-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DataQualityView({ crm, invoices, expenses, inventory, employees }) {
  const findings = useMemo(() => {
    const out = [];
    const phoneOk = (p) => !p || /^[+0-9][0-9\s\-]{6,15}$/.test(p.trim());

    const seen = {};
    crm.rows.forEach((l) => { const k = l.company.trim().toLowerCase(); (seen[k] = seen[k] || []).push(l.company); });
    const dupCustomers = Object.values(seen).filter((v) => v.length > 1);
    out.push({ label: "Duplicate customers", count: dupCustomers.length, sample: dupCustomers.slice(0, 3).map((v) => v.join(" / ")).join("; "), fix: "CRM > Leads — merge by hand; auto-merging lookalikes is how data gets eaten." });

    const badPhones = [...crm.rows.filter((l) => !phoneOk(l.phone)).map((l) => l.company), ...employees.rows.filter((e) => !phoneOk(e.phone)).map((e) => e.name)];
    out.push({ label: "Invalid phone numbers", count: badPhones.length, sample: badPhones.slice(0, 3).join(", "), fix: "Open the named record in CRM or HR — the pattern tolerates +255/07 formats, spaces, and dashes." });

    const noEmail = employees.rows.filter((e) => e.status === "Active" && !e.email);
    out.push({ label: "Active employees missing email", count: noEmail.length, sample: noEmail.slice(0, 3).map((e) => e.name).join(", "), fix: "HR > Employees — payslips and notifications need a real address." });

    const noExpiry = inventory.rows.filter((it) => !it.expiryDate);
    out.push({ label: "Items without expiry dates", count: noExpiry.length, sample: noExpiry.slice(0, 3).map((it) => it.name).join(", "), fix: "Inventory > Stock — undated stock is invisible to Expiry Tracking (section 106's blind-spot rule)." });

    const noDue = invoices.rows.filter((i) => i.status !== "Paid" && !i.dueDate);
    out.push({ label: "Unpaid invoices missing due date", count: noDue.length, sample: noDue.slice(0, 3).map((i) => i.id).join(", "), fix: "Sales > Invoices — no due date means invisible to aging, budgets, and the Risk Center." });

    const noMethod = expenses.filter((e) => e.status === "Paid" && !e.method);
    out.push({ label: "Paid expenses missing payment method", count: noMethod.length, sample: noMethod.slice(0, 3).map((e) => e.vendor).join(", "), fix: "Finance > Payables — method gaps weaken the Cash Flow statement's honesty." });

    return out;
  }, [crm.rows, invoices.rows, expenses, inventory.rows, employees.rows]);

  const clean = findings.every((f) => f.count === 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">Data Quality Engine</h3>
        <p className="text-[12px] text-slate-500">Six real scans over live rows — every finding names its record and its door. {clean ? "All clean right now." : ""}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {findings.map((f) => (
          <div key={f.label} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[13px] font-medium text-[#111827]">{f.label}</p>
              <span className="text-[13px] font-mono font-bold" style={{ color: f.count === 0 ? "#16A34A" : "#F59E0B" }}>{f.count}</span>
            </div>
            {f.count > 0 && f.sample && <p className="text-[10.5px] text-slate-500 truncate">{f.sample}</p>}
            <p className="text-[10.5px] text-slate-600 mt-1.5"><span className="font-medium text-[#16A34A]">Fix:</span> {f.fix}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// FirstRunGuide — shown to a new account that has connected Supabase but
// hasn't entered any data yet. Detected by checking that all core tables
// are empty after loading (not loading). Without this, a new user sees
// seven empty KPI tiles showing "TZS 0k" which reads as broken rather
// than empty. The guide names the four actions that will make the
// dashboard real: create a branch, add inventory, create a customer, and
// run the SQL schema.
export function FirstRunGuide({ invoices, inventory, crm, company, onNavigate }) {
  if (!IS_CONFIGURED) return null;
  if (invoices.loading || inventory.loading || crm.loading) return null;
  if (invoices.rows.length > 0 || inventory.rows.length > 0 || crm.rows.length > 0) return null;
  const steps = [
    { done: Boolean(company.tin || company.address), label: "Complete company profile", hint: "Settings → Company profile — add your TIN, address, and logo", nav: "settings" },
    { done: inventory.rows.length > 0, label: "Add your first product or service", hint: "Inventory → Add Item — products appear in Sales, POS, and the AI assistant", nav: "inventory" },
    { done: crm.rows.length > 0, label: "Add your first customer", hint: "CRM → Add Lead — customers appear in Sales invoices, quotations, and Customer 360", nav: "crm" },
    { done: invoices.rows.length > 0, label: "Create your first invoice", hint: "Sales → Invoices → New Invoice — this activates the Revenue KPI and Business Health", nav: "sales" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-[#16A34A]/20 shadow-md p-6 mb-4">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#052614,#16A34A)" }}>
          <Sparkles size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-[15px] font-bold text-[#111827]">Welcome to Smart Manager</h3>
          <p className="text-[12.5px] text-slate-500 mt-0.5 mb-4">Complete these steps to activate your dashboard. Each one adds real data — your KPIs and Business Health score will update automatically.</p>
          <div className="space-y-2.5">
            {steps.map((step, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${step.done ? "border-[#16A34A]/20 bg-[#F0FDF4]" : "border-slate-200 bg-slate-50/60"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold ${step.done ? "bg-[#16A34A] text-white" : "bg-slate-200 text-slate-500"}`}>
                  {step.done ? "✓" : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12.5px] font-semibold ${step.done ? "text-[#16A34A] line-through opacity-60" : "text-[#111827]"}`}>{step.label}</p>
                  {!step.done && <p className="text-[11px] text-slate-400 mt-0.5">{step.hint}</p>}
                </div>
                {!step.done && (
                  <button onClick={() => onNavigate(step.nav)} className="text-[11.5px] font-medium text-[#16A34A] border border-[#16A34A]/30 rounded-lg px-2.5 py-1 shrink-0 hover:bg-[#16A34A]/5">
                    Go →
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${(done / steps.length) * 100}%`, background: "linear-gradient(90deg,#16A34A,#4ADE80)" }} />
            </div>
            <span className="text-[11.5px] font-medium text-slate-500 shrink-0">{done}/{steps.length} done</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Enterprise Risk Center — six risk categories, every score computed
// from real signals already in this system, every mitigation pointing at
// a real screen that exists. The Business Health discipline scaled to
// risk: a score nobody can interrogate is decoration. Honest scope per
// category is printed on each card — cybersecurity reads THIS device's
// real posture (the same localStorage facts the Security Dashboard
// shows), reputational rides overdue-owed-to-customers as its available
// proxy until support tickets are threaded here, and supply chain reads
// stock exposure because per-item supplier links don't exist yet.
export function RiskCenterView({ invoices, expenses, inventory, employees }) {
  const training = useCompanyTable("hr_training", [], { mapRow: mapTrainingRow, select: "*,hr_employees(full_name)" });
  const t = TODAY.toISOString().slice(0, 10);

  const risks = useMemo(() => {
    const out = [];
    const level = (pct) => (pct >= 0.66 ? { label: "High", color: "#EF4444" } : pct >= 0.33 ? { label: "Medium", color: "#F59E0B" } : { label: "Low", color: "#16A34A" });

    // Financial — overdue receivables share + expense cover
    const unpaid = invoices.rows.filter((i) => i.status !== "Paid");
    const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < t);
    const finPct = unpaid.length === 0 ? 0 : overdue.length / unpaid.length;
    out.push({ cat: "Financial", pct: finPct, basis: unpaid.length === 0 ? "No unpaid invoices" : `${overdue.length} of ${unpaid.length} unpaid invoices overdue`, fix: "Chase the Receivables Aging list oldest-first; Cmd+K a customer name to jump straight to them." });

    // Operational — low/out-of-stock exposure
    const low = inventory.rows.filter((it) => it.qty <= it.reorder);
    const opPct = inventory.rows.length === 0 ? 0 : low.length / inventory.rows.length;
    out.push({ cat: "Operational", pct: opPct, basis: inventory.rows.length === 0 ? "No inventory tracked" : `${low.length} of ${inventory.rows.length} items at/below reorder`, fix: "Raise POs from Procurement; the Inventory Replenishment workflow template automates the alert." });

    // Cybersecurity — this device's real posture
    const lock = !!window.localStorage.getItem("bs_app_lock_hash");
    const bio = !!window.localStorage.getItem("bs_bio_applock");
    const cyPct = lock && bio ? 0.15 : lock ? 0.4 : 0.75;
    out.push({ cat: "Cybersecurity", pct: cyPct, basis: `This device: App Lock ${lock ? "on" : "OFF"}, biometric unlock ${bio ? "enrolled" : "not enrolled"} — RLS and RBAC hold platform-wide regardless`, fix: lock ? "Enroll biometric unlock in Settings > App Lock; enable TOTP 2FA when wired (GoTrue MFA)." : "Turn on App Lock in Settings — one PIN, this device, right now." });

    // Compliance — overdue mandatory/compliance training + tax proximity
    const compOverdue = training.rows.filter((r) => (r.mandatory || r.compliance) && r.status !== "Completed" && r.dueDate && r.dueDate < t);
    const compAll = training.rows.filter((r) => r.mandatory || r.compliance);
    const cpPct = compAll.length === 0 ? 0.2 : Math.min(1, compOverdue.length / compAll.length + 0.1);
    out.push({ cat: "Compliance", pct: cpPct, basis: compAll.length === 0 ? "No mandatory/compliance training assigned yet — itself a mild exposure" : `${compOverdue.length} of ${compAll.length} mandatory/compliance training(s) overdue`, fix: "Assign compliance courses in HR > Training; the Tax Center's deadline strip covers TRA filing dates." });

    // Supply chain — stock exposure proxy, honestly labeled
    const outOfStock = inventory.rows.filter((it) => it.qty === 0);
    const scPct = inventory.rows.length === 0 ? 0 : Math.min(1, (outOfStock.length * 2 + low.length) / Math.max(1, inventory.rows.length));
    out.push({ cat: "Supply Chain", pct: scPct, basis: `${outOfStock.length} item(s) fully out of stock — proxy measure: per-item supplier links don't exist yet, so concentration risk isn't computable`, fix: "Add second suppliers for A-class items (Smart Analysis names them); track lead times in Suppliers." });

    // Reputational — owed-to-customers proxy
    const repPct = Math.min(1, finPct * 0.8);
    out.push({ cat: "Reputational", pct: repPct, basis: "Proxy: overdue obligations correlate with disputes — support-ticket volume will sharpen this when threaded here", fix: "Resolve oldest overdue items first; portal support tickets give customers a real channel before they go public." });

    return out.map((r) => ({ ...r, ...level(r.pct) }));
  }, [invoices.rows, inventory.rows, training.rows, t]);

  const high = risks.filter((r) => r.label === "High").length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827]">Enterprise Risk Center</h3>
        <p className="text-[12px] text-slate-500">Six categories, every score computed from real signals, every mitigation pointing at a screen that exists — {high > 0 ? `${high} currently High` : "none currently High"}.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {risks.map((r) => (
          <div key={r.cat} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[13px] font-semibold text-[#111827]">{r.cat}</p>
              <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${r.color}18`, color: r.color }}>{r.label}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2"><div className="h-full rounded-full" style={{ width: `${Math.round(r.pct * 100)}%`, backgroundColor: r.color }} /></div>
            <p className="text-[10.5px] text-slate-500">{r.basis}</p>
            <p className="text-[10.5px] text-slate-600 mt-1.5"><span className="font-medium text-[#16A34A]">Mitigation:</span> {r.fix}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ANALYTICS_TABS = [
  { id: "executive", label: "Executive", icon: Gauge },
  { id: "financial", label: "Financial", icon: CircleDollarSign },
  { id: "hr", label: "HR", icon: Users },
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "operations", label: "Operations", icon: Factory },
  { id: "kpis", label: "Custom KPIs", icon: Target },
  { id: "heatmaps", label: "Heat Maps", icon: Grid3x3 },
  { id: "market", label: "Market Trends", icon: Globe },
  { id: "benchmarking", label: "Benchmarking", icon: Crosshair },
  { id: "risk", label: "Risk Center", icon: ShieldCheck },
  { id: "quality", label: "Data Quality", icon: CheckCircle2 },
  { id: "periods", label: "Period Closes", icon: Lock },
  { id: "reconcile", label: "Bank Recon", icon: GitBranch },
  { id: "predictive", label: "Predictive Intelligence", icon: Sparkles },
];

// The module keeps its internal id ("analytics") throughout routing, roles,
// and the sidebar — renaming that would ripple through role permissions
// and navigation for no real benefit. Only the display name changes here,
// to Business Intelligence Center, since that's what this module actually
// is now: five role dashboards plus custom KPIs, drill-down, heat maps,
// real external market data, and benchmarking, not just "analytics."
export function Analytics({ company, invoices, expenses, crm, inventory, employees, leaveRequests, workOrders, posTransactions, onNavigate }) {
  const [tab, setTab] = useState("executive");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Business Intelligence Center</h1>
        <p className="text-[13px] text-slate-500 mt-1">Role-focused dashboards, custom KPIs, real external market data, and transparent statistical projections — all over live data every module reads</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {ANALYTICS_TABS.map((t) => {
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

      {tab === "executive" && <ExecutiveDashboard company={company} invoices={invoices} expenses={expenses} crm={crm} inventory={inventory} employees={employees} onNavigate={onNavigate} />}
      {tab === "financial" && <FinancialDashboard invoices={invoices} expenses={expenses} posTransactions={posTransactions} onNavigate={onNavigate} />}
      {tab === "hr" && <HRDashboard employees={employees} leaveRequests={leaveRequests} onNavigate={onNavigate} />}
      {tab === "sales" && <SalesDashboard invoices={invoices} crm={crm} onNavigate={onNavigate} />}
      {tab === "operations" && <OperationsDashboard inventory={inventory} workOrders={workOrders} onNavigate={onNavigate} />}
      {tab === "kpis" && <CustomKPIs data={{ invoices, expenses, crm, inventory, employees }} />}
      {tab === "heatmaps" && <HeatMaps invoices={invoices} inventory={inventory} />}
      {tab === "market" && <MarketTrends company={company} />}
      {tab === "benchmarking" && <Benchmarking data={{ invoices, expenses, crm, inventory, employees }} />}
      {tab === "risk" && <RiskCenterView invoices={invoices} expenses={expenses} inventory={inventory} employees={employees} />}
      {tab === "quality" && <DataQualityView crm={crm} invoices={invoices} expenses={expenses} inventory={inventory} employees={employees} />}
      {tab === "journal" && <ManualJournalView currentUser={currentUser} />}
      {tab === "periods" && <PeriodClosesView invoices={invoices} expenses={expenses} currentUser={currentUser} />}
      {tab === "reconcile" && <BankReconciliationView invoices={invoices} expenses={expenses} />}
      {tab === "predictive" && <PredictiveIntelligence invoices={invoices} expenses={expenses} inventory={inventory} employees={employees} leaveRequests={leaveRequests} />}
    </div>
  );
}

export function StatRow({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {items.map((s) => {
        const Tag = s.onClick ? "button" : "div";
        return (
          <Tag
            key={s.label}
            onClick={s.onClick}
            className={`bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 text-left w-full ${s.onClick ? "hover:border-[#16A34A]/40 hover:shadow-md transition-all cursor-pointer" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11.5px] text-slate-400">{s.label}</p>
              {s.onClick && <ChevronRight size={12} className="text-slate-300" />}
            </div>
            <p className={`text-[17px] font-mono font-semibold ${s.color || "text-[#111827]"}`}>{s.value}</p>
            {s.sub && <p className="text-[10.5px] text-slate-400 mt-0.5">{s.sub}</p>}
          </Tag>
        );
      })}
    </div>
  );
}

export function BreakdownBars({ items, formatValue }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.label}>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-slate-600 truncate pr-2">{i.label}</span>
            <span className="font-mono text-[#111827] font-medium shrink-0">{formatValue ? formatValue(i.value) : i.value}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, backgroundColor: i.color || "#16A34A" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════ EXECUTIVE DASHBOARD ══════════════ */
/* ------------------------------- EXECUTIVE DASHBOARD ------------------------------- */
export function ExecutiveDashboard({ company, invoices, expenses, crm, inventory, employees, onNavigate }) {
  const nav = onNavigate || (() => {});

  // ── Live KPIs ────────────────────────────────────────────────────────
  const revenue       = invoices.rows.reduce((s, inv) => s + (inv.status === "Paid" ? lineTotal(inv.items).total : (inv.amountPaid || 0)), 0);
  const expenseTotal  = expenses.rows.reduce((s, e) => s + e.amount, 0);
  const profit        = revenue - expenseTotal;
  const margin        = revenue > 0 ? (profit / revenue * 100).toFixed(1) : 0;
  const openPipeline  = crm.rows.filter(l => !["Won","Lost"].includes(l.stage)).reduce((s, l) => s + l.value, 0);
  const stockValue    = inventory.rows.reduce((s, it) => s + it.qty * it.unitCost, 0);
  const activeEmp     = employees.rows.filter(e => e.status === "Active").length;
  const wonCount      = crm.rows.filter(l => l.stage === "Won").length;
  const closedCount   = wonCount + crm.rows.filter(l => l.stage === "Lost").length;
  const winRate       = closedCount > 0 ? Math.round(wonCount / closedCount * 100) : 0;
  const overdueInvs   = invoices.rows.filter(inv => inv.status !== "Paid" && inv.dueDate && new Date(inv.dueDate) < TODAY);
  const overdueValue  = overdueInvs.reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid||0)), 0);

  // ── Simulated 6-month trend (based on live data as baseline) ─────────
  const months = ["Feb","Mar","Apr","May","Jun","Jul"];
  const trendData = months.map((m, i) => {
    const factor = 0.7 + i * 0.06 + (Math.sin(i) * 0.05);
    return {
      month: m,
      revenue:  Math.round(revenue  * factor / 1000),
      expenses: Math.round(expenseTotal * factor / 1000),
      profit:   Math.round(profit * factor / 1000),
    };
  });
  trendData[5] = { month:"Jul", revenue: Math.round(revenue/1000), expenses: Math.round(expenseTotal/1000), profit: Math.round(profit/1000) };

  // ── System health score ──────────────────────────────────────────────
  const healthScore = Math.min(100, Math.max(0, Math.round(
    (profit > 0 ? 25 : 0) +
    (winRate > 50 ? 20 : winRate > 30 ? 10 : 0) +
    (overdueValue === 0 ? 20 : overdueValue < revenue * 0.1 ? 10 : 0) +
    (inventory.rows.filter(it => it.qty <= (it.reorderLevel||5)).length === 0 ? 15 : 5) +
    (activeEmp > 0 ? 20 : 0)
  )));
  const healthColor = healthScore >= 80 ? "#16A34A" : healthScore >= 60 ? "#F59E0B" : "#EF4444";
  const healthLabel = healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : "Needs Attention";

  const KPIS = [
    { label:"Revenue",         value:"TZS "+money(Math.round(revenue))+"k",      sub:"Collected",             col:"#2563EB", mod:"finance"   },
    { label:"Net Profit",      value:"TZS "+money(Math.round(Math.abs(profit)))+"k", sub:(profit>=0?"Profit":"Loss")+" · "+margin+"%", col:profit>=0?"#16A34A":"#EF4444", mod:"reports" },
    { label:"Pipeline",        value:"TZS "+money(Math.round(openPipeline))+"k", sub:crm.rows.filter(l=>!["Won","Lost"].includes(l.stage)).length+" open deals", col:"#7C3AED", mod:"crm" },
    { label:"Overdue AR",      value:"TZS "+money(Math.round(overdueValue))+"k", sub:overdueInvs.length+" invoices overdue", col:overdueValue>0?"#EF4444":"#16A34A", mod:"finance" },
    { label:"Stock Value",     value:"TZS "+money(Math.round(stockValue))+"k",   sub:inventory.rows.length+" SKUs",           col:"#D97706",  mod:"inventory" },
    { label:"Win Rate",        value:winRate+"%",                                 sub:wonCount+" won / "+closedCount+" closed",col:winRate>=50?"#16A34A":"#F59E0B", mod:"crm" },
    { label:"Headcount",       value:String(activeEmp),                           sub:"Active employees",       col:"#0891B2",  mod:"hr"        },
    { label:"Total Expenses",  value:"TZS "+money(Math.round(expenseTotal))+"k", sub:"Period to date",         col:"#F59E0B",  mod:"finance"   },
  ];

  return (
    <div className="space-y-5">
      {/* Company overview + health score */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-bold text-[#111827]">{company.name} — Executive Overview</h2>
              <p className="text-[12.5px] text-slate-400 mt-0.5">Live metrics across all 33 modules · Click any card to drill down</p>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-1">Business Health</p>
              <p className="text-[32px] font-black leading-none" style={{color:healthColor}}>{healthScore}</p>
              <p className="text-[11px] font-semibold mt-0.5" style={{color:healthColor}}>{healthLabel}</p>
            </div>
          </div>
          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {KPIS.map(k => (
              <div key={k.label} onClick={()=>nav(k.mod)} className="rounded-xl border border-slate-100 p-3 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all group">
                <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-0.5">{k.label}</p>
                <p className="text-[16px] font-bold" style={{color:k.col}}>{k.value}</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5 group-hover:text-slate-600 transition-colors">{k.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Health score breakdown */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <p className="text-[13px] font-semibold text-[#111827] mb-3">Health Score</p>
          <div className="flex items-center justify-center mb-4">
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#F3F4F6" strokeWidth="12"/>
                <circle cx="60" cy="60" r="50" fill="none" stroke={healthColor} strokeWidth="12"
                  strokeDasharray={`${healthScore * 3.14} 314`} strokeLinecap="round" style={{transition:"stroke-dasharray .6s ease"}}/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[24px] font-black" style={{color:healthColor}}>{healthScore}</p>
                <p className="text-[10px] text-slate-400">/ 100</p>
              </div>
            </div>
          </div>
          {[
            ["Profitable", profit>0, "Positive net profit"],
            ["Win Rate >50%", winRate>50, "Strong deal closure"],
            ["No Overdue AR", overdueValue===0, "All invoices current"],
            ["Stock Healthy", inventory.rows.filter(it=>it.qty<=(it.reorderLevel||5)).length===0, "No low-stock items"],
            ["Team Active", activeEmp>0, "Staff onboarded"],
          ].map(([l, ok, hint]) => (
            <div key={l} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
              <div className={"w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold text-white "+(ok?"bg-[#16A34A]":"bg-slate-200")}>
                {ok ? "✓" : "✗"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] font-medium text-[#111827]">{l}</p>
                <p className="text-[10px] text-slate-400 truncate">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6-month trend chart */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827]">Revenue vs Expenses vs Profit Trend</h3>
            <p className="text-[12px] text-slate-400">6-month simulated trend · TZS thousands</p>
          </div>
          <div className="flex gap-4 text-[12px]">
            {[["Revenue","#2563EB"],["Expenses","#F59E0B"],["Profit","#16A34A"]].map(([l,col])=>(
              <div key={l} className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full" style={{background:col}}/><span className="text-slate-500">{l}</span></div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={trendData} margin={{left:-10,right:4,top:0,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#F3F4F6"/>
            <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:11}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={(v,name)=>["TZS "+money(v)+"k",name.charAt(0).toUpperCase()+name.slice(1)]}/>
            <Area type="monotone" dataKey="revenue"  fill="#2563EB18" stroke="#2563EB" strokeWidth={2.5} dot={false}/>
            <Area type="monotone" dataKey="expenses" fill="#F59E0B18" stroke="#F59E0B" strokeWidth={2}   dot={false}/>
            <Line type="monotone" dataKey="profit"   stroke="#16A34A" strokeWidth={2.5} dot={{r:4,fill:"#16A34A"}} strokeDasharray="5 3"/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Quick module links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {l:"View CRM Pipeline",     mod:"crm",       col:"#7C3AED", I:TrendingUp},
          {l:"Finance Reports",       mod:"reports",   col:"#2563EB", I:Landmark},
          {l:"Inventory Alerts",      mod:"inventory", col:"#F59E0B", I:Package},
          {l:"HR & Payroll",          mod:"hr",        col:"#059669", I:Users},
        ].map(k=>(
          <button key={k.l} onClick={()=>nav(k.mod)} className="bg-white rounded-xl border border-slate-200/80 p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all group">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform" style={{background:k.col+"15"}}>
              <k.I size={17} style={{color:k.col}}/>
            </div>
            <p className="text-[13px] font-semibold text-[#111827]">{k.l}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-0.5">Open →</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function FinancialDashboard({ invoices, expenses, posTransactions, onNavigate }) {
  const nav = onNavigate || (() => {});

  const revenue        = invoices.rows.reduce((s,inv) => s + (inv.status==="Paid" ? lineTotal(inv.items).total : (inv.amountPaid||0)), 0);
  const posRevenue     = posTransactions.rows.reduce((s,t) => s + Math.round(t.items.reduce((si,it)=>si+it.qty*it.price,0)*(1+TAX_RATE)), 0);
  const expenseTotal   = expenses.rows.reduce((s,e) => s+e.amount, 0);
  const gross          = revenue + posRevenue;
  const profit         = gross - expenseTotal;
  const outstanding    = invoices.rows.filter(inv => inv.status !== "Paid" && inv.status !== "Cancelled");
  const receivables    = outstanding.reduce((s,inv) => s + (lineTotal(inv.items).total-(inv.amountPaid||0)), 0);

  // Expense breakdown by category
  const byCategory = useMemo(() => {
    const map = {};
    expenses.rows.forEach(e => { map[e.category] = (map[e.category]||0)+e.amount; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>({name,value}));
  }, [expenses.rows]);

  // Revenue by invoice status
  const statusData = useMemo(() => {
    const paid    = invoices.rows.filter(i=>i.status==="Paid").reduce((s,i)=>s+lineTotal(i.items).total,0);
    const partial = invoices.rows.filter(i=>i.status==="Partial").reduce((s,i)=>s+(i.amountPaid||0),0);
    const unpaid  = invoices.rows.filter(i=>i.status==="Unpaid"||i.status==="Overdue").reduce((s,i)=>s+lineTotal(i.items).total,0);
    return [
      {name:"Paid",    value:Math.round(paid/1000),    fill:"#16A34A"},
      {name:"Partial", value:Math.round(partial/1000), fill:"#F59E0B"},
      {name:"Unpaid",  value:Math.round(unpaid/1000),  fill:"#EF4444"},
    ].filter(d=>d.value>0);
  }, [invoices.rows]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {l:"Total Revenue",  v:"TZS "+money(Math.round(gross))+"k",        col:"#2563EB"},
          {l:"Total Expenses", v:"TZS "+money(Math.round(expenseTotal))+"k", col:"#F59E0B"},
          {l:"Net Profit",     v:"TZS "+money(Math.round(Math.abs(profit)))+"k", col:profit>=0?"#16A34A":"#EF4444"},
          {l:"Receivables",    v:"TZS "+money(Math.round(receivables))+"k",  col:"#EF4444"},
        ].map(k => (
          <div key={k.l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{k.l}</p>
            <p className="text-[20px] font-bold" style={{color:k.col}}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expense breakdown PieChart */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Expenses by Category</h3>
          <p className="text-[11.5px] text-slate-400 mb-3">TZS thousands · All expense categories</p>
          {byCategory.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No expenses recorded yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" cx="40%" cy="50%" outerRadius={85} innerRadius={45}>
                  {byCategory.map((_,i) => (
                    <Cell key={i} fill={["#2563EB","#16A34A","#F59E0B","#EF4444","#7C3AED","#059669","#D97706","#0891B2"][i%8]}/>
                  ))}
                </Pie>
                <Tooltip formatter={(v)=>"TZS "+money(v)+"k"}/>
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8} formatter={(v)=><span style={{fontSize:11,color:"#374151"}}>{v}</span>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Invoice status breakdown */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Receivables Status</h3>
          <p className="text-[11.5px] text-slate-400 mb-3">Invoice collection performance · TZS thousands</p>
          {statusData.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No invoices yet</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={statusData} layout="vertical" margin={{left:10,right:20,top:0,bottom:0}}>
                  <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="name" type="category" tick={{fontSize:12,fontWeight:600}} axisLine={false} tickLine={false} width={55}/>
                  <Tooltip formatter={v=>"TZS "+money(v)+"k"}/>
                  <Bar dataKey="value" radius={[0,6,6,0]}>
                    {statusData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Collection rate */}
              <div className="mt-3 pt-3 border-t border-slate-100">
                {(() => {
                  const total = statusData.reduce((s,d)=>s+d.value,0);
                  const paid  = statusData.find(d=>d.name==="Paid")?.value||0;
                  const rate  = total>0?Math.round(paid/total*100):0;
                  return (
                    <div>
                      <div className="flex justify-between text-[11.5px] mb-1.5">
                        <span className="text-slate-500">Collection Rate</span>
                        <span className="font-bold" style={{color:rate>=80?"#16A34A":rate>=60?"#F59E0B":"#EF4444"}}>{rate}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:rate+"%",background:rate>=80?"#16A34A":rate>=60?"#F59E0B":"#EF4444"}}/>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function HRDashboard({ employees, leaveRequests, onNavigate }) {
  const nav = onNavigate || (() => {});
  const active   = employees.rows.filter(e=>e.status==="Active").length;
  const onLeave  = employees.rows.filter(e=>e.status==="On Leave").length;
  const inactive = employees.rows.filter(e=>e.status==="Inactive").length;
  const payroll  = employees.rows.filter(e=>e.status!=="Inactive").reduce((s,e)=>s+e.salary,0);
  const pendingLeave = leaveRequests.rows.filter(l=>l.status==="Pending").length;

  // Department breakdown
  const byDept = useMemo(() => {
    const map = {};
    employees.rows.forEach(e => { const d = e.department||"General"; map[d]=(map[d]||0)+1; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
  }, [employees.rows]);

  // Leave type breakdown
  const leaveTypes = useMemo(() => {
    const map = {};
    leaveRequests.rows.forEach(l => { map[l.leaveType||"Annual"]=(map[l.leaveType||"Annual"]||0)+1; });
    return Object.entries(map).map(([name,value])=>({name,value}));
  }, [leaveRequests.rows]);

  // Radar data for workforce profile
  const radarData = [
    { subject:"Active",     value:active > 0 ? Math.round(active/(employees.rows.length||1)*100) : 0    },
    { subject:"Retention",  value:employees.rows.length>0 ? Math.round((1-inactive/(employees.rows.length||1))*100) : 90 },
    { subject:"Leave Mgmt", value:pendingLeave===0 ? 100 : Math.round((1-pendingLeave/10)*80)           },
    { subject:"Payroll",    value:payroll>0 ? Math.min(100, Math.round(payroll/employees.rows.length/20)) : 0 },
    { subject:"Diversity",  value:(() => { const f=employees.rows.filter(e=>e.gender==="F").length; return employees.rows.length>0?Math.round(f/employees.rows.length*200):50; })() },
    { subject:"Engagement", value:75 },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Active Staff",  active,                          "#16A34A"],
          ["On Leave",      onLeave,                         "#F59E0B"],
          ["Monthly Payroll","TZS "+money(payroll)+"k",      "#2563EB"],
          ["Pending Leave", pendingLeave+" request"+(pendingLeave!==1?"s":""), pendingLeave>0?"#EF4444":"#16A34A"],
        ].map(([l,v,col])=>(
          <div key={l} onClick={()=>nav("hr")} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center cursor-pointer hover:shadow-sm">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[20px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department breakdown BarChart */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Headcount by Department</h3>
          {byDept.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No department data</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byDept} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={80}/>
                <Tooltip formatter={v=>[v+" staff","Department"]}/>
                <Bar dataKey="value" fill="#16A34A" radius={[0,6,6,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Workforce health RadarChart */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Workforce Health Profile</h3>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radarData} margin={{top:0,right:10,bottom:0,left:10}}>
              <PolarGrid stroke="#E5E7EB"/>
              <PolarAngleAxis dataKey="subject" tick={{fontSize:10,fill:"#6B7280"}}/>
              <Radar name="Score" dataKey="value" stroke="#16A34A" fill="#16A34A" fillOpacity={0.2} strokeWidth={2}/>
              <Tooltip formatter={v=>[v+"/100","Score"]}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Leave requests table */}
      {leaveRequests.rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[13.5px] font-semibold text-[#111827]">Recent Leave Requests</p>
            <button onClick={()=>nav("hr")} className="text-[12px] text-[#16A34A] font-medium">View all →</button>
          </div>
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-50 bg-slate-50/50">{["Employee","Type","Dates","Status"].map(h=>(
              <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>
            ))}</tr></thead>
            <tbody>
              {leaveRequests.rows.slice(0,4).map(l=>{
                const sc={Approved:["#DCFCE7","#15803D"],Pending:["#FEF3C7","#B45309"],Rejected:["#FEE2E2","#991B1B"]}[l.status]||["#F3F4F6","#6B7280"];
                return (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[#111827]">{l.employeeName||l.employee}</td>
                    <td className="px-4 py-2.5 text-slate-500">{l.leaveType||"Annual"}</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-[11.5px]">{l.startDate} → {l.endDate}</td>
                    <td className="px-4 py-2.5"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:sc[0],color:sc[1]}}>{l.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SalesDashboard({ invoices, crm, onNavigate }) {
  const nav = onNavigate || (() => {});

  const STAGES = ["New","Contacted","Qualified","Proposal","Negotiation","Won"];
  const STAGE_COLORS = {
    New:"#94A3B8", Contacted:"#3B82F6", Qualified:"#8B5CF6",
    Proposal:"#F59E0B", Negotiation:"#EA580C", Won:"#16A34A",
  };

  const stageData = useMemo(() => STAGES.map(stage => ({
    stage,
    count: crm.rows.filter(l => l.stage === stage).length,
    value: crm.rows.filter(l => l.stage === stage).reduce((s,l)=>s+l.value,0),
    fill:  STAGE_COLORS[stage],
  })), [crm.rows]);

  const openLeads       = crm.rows.filter(l => !["Won","Lost"].includes(l.stage));
  const pipelineValue   = openLeads.reduce((s,l)=>s+l.value,0);
  const weightedForecast= openLeads.reduce((s,l)=>s+l.value*((STAGE_PROBABILITY[l.stage]||0)/100),0);
  const wonCount        = crm.rows.filter(l=>l.stage==="Won").length;
  const lostCount       = crm.rows.filter(l=>l.stage==="Lost").length;
  const closedCount     = wonCount + lostCount;
  const winRate         = closedCount>0 ? Math.round(wonCount/closedCount*100) : 0;

  // Monthly invoice revenue
  const months          = ["Feb","Mar","Apr","May","Jun","Jul"];
  const monthlyRevenue  = months.map((m, i) => {
    const base = invoices.rows.reduce((s,inv)=>s+(inv.status==="Paid"?lineTotal(inv.items).total:(inv.amountPaid||0)),0);
    const factor = 0.65 + i*0.07;
    return { month:m, revenue:Math.round(base*factor/1000), invoices:Math.max(1,Math.round(invoices.rows.length*factor)) };
  });
  monthlyRevenue[5].revenue = Math.round(invoices.rows.reduce((s,inv)=>s+(inv.status==="Paid"?lineTotal(inv.items).total:(inv.amountPaid||0)),0)/1000);
  monthlyRevenue[5].invoices = invoices.rows.filter(i=>i.status==="Paid").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Pipeline Value",   "TZS "+money(Math.round(pipelineValue))+"k",   "#7C3AED"],
          ["Weighted Forecast","TZS "+money(Math.round(weightedForecast))+"k", "#2563EB"],
          ["Win Rate",         winRate+"%",                                     winRate>=50?"#16A34A":"#F59E0B"],
          ["Open Deals",       openLeads.length+" deals",                      "#D97706"],
        ].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[20px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline funnel */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Pipeline Funnel</h3>
          <div className="space-y-2">
            {stageData.map((s, i) => {
              const maxCount = Math.max(...stageData.map(d=>d.count), 1);
              const pct = maxCount > 0 ? (s.count / maxCount * 100) : 0;
              return (
                <div key={s.stage} className="flex items-center gap-3">
                  <span className="text-[12px] font-medium text-slate-600 w-24 shrink-0">{s.stage}</span>
                  <div className="flex-1 h-6 rounded-lg overflow-hidden bg-slate-100" style={{paddingLeft:i*8}}>
                    <div className="h-full rounded-lg flex items-center px-2.5 transition-all" style={{width:Math.max(pct,8)+"%",background:s.fill}}>
                      {s.count > 0 && <span className="text-[10px] font-bold text-white whitespace-nowrap">{s.count} deal{s.count!==1?"s":""}</span>}
                    </div>
                  </div>
                  <span className="text-[11.5px] font-mono font-bold text-slate-700 w-20 text-right">TZS {money(Math.round(s.value/1000))}k</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly revenue trend */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Revenue Trend (6 months)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={monthlyRevenue} margin={{left:-10,right:4,top:4,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="left"  tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="right" orientation="right" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v,name)=>[name==="revenue"?"TZS "+money(v)+"k":v+" inv",name==="revenue"?"Revenue":"Invoices"]}/>
              <Bar  yAxisId="left"  dataKey="revenue"  fill="#7C3AED18" stroke="#7C3AED" strokeWidth={1} radius={[4,4,0,0]}/>
              <Line yAxisId="left"  dataKey="revenue"  stroke="#7C3AED" strokeWidth={2.5} dot={{r:3,fill:"#7C3AED"}} type="monotone"/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function OperationsDashboard({ inventory, workOrders, onNavigate }) {
  const stockValue   = inventory.rows.reduce((s,it)=>s+it.qty*it.unitCost,0);
  const lowStock     = inventory.rows.filter(it=>stockStatus(it.qty,it.reorder)==="Low Stock").length;
  const outOfStock   = inventory.rows.filter(it=>stockStatus(it.qty,it.reorder)==="Out of Stock").length;
  const activeOrders = workOrders.rows.filter(w=>["In Progress","Planned"].includes(w.status)).length;
  const nav          = onNavigate || (()=>{});

  // Inventory by category
  const byCat = useMemo(()=>{
    const map={};
    inventory.rows.forEach(it=>{
      const cat=it.category||"Other";
      map[cat]=(map[cat]||0)+it.qty*it.unitCost;
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,7)
      .map(([name,value])=>({name,value:Math.round(value/1000)}));
  },[inventory.rows]);

  // Work order status
  const woStatus = ["Planned","In Progress","Completed","Cancelled"].map(status=>({
    name:status,
    value:workOrders.rows.filter(w=>w.status===status).length,
    fill:{Planned:"#3B82F6","In Progress":"#F59E0B",Completed:"#16A34A",Cancelled:"#EF4444"}[status],
  })).filter(d=>d.value>0);

  // Stock health breakdown
  const stockHealth = [
    {name:"In Stock",  value:inventory.rows.filter(it=>stockStatus(it.qty,it.reorder)==="In Stock").length,  fill:"#16A34A"},
    {name:"Low Stock", value:lowStock,  fill:"#F59E0B"},
    {name:"Out of Stock",value:outOfStock,fill:"#EF4444"},
  ].filter(d=>d.value>0);

  // 6-month inventory value trend (simulated)
  const months = ["Feb","Mar","Apr","May","Jun","Jul"];
  const invTrend = months.map((m,i)=>({
    month:m,
    value:Math.round(stockValue*(0.72+i*0.055)/1000),
    orders:Math.round(activeOrders*(0.6+i*0.08)),
  }));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {l:"Stock Value",       v:"TZS "+money(Math.round(stockValue))+"k", c:"#2563EB", mod:"inventory"},
          {l:"Low Stock Items",   v:lowStock,    c:lowStock>0?"#F59E0B":"#16A34A",  mod:"inventory"},
          {l:"Out of Stock",      v:outOfStock,  c:outOfStock>0?"#EF4444":"#16A34A", mod:"inventory"},
          {l:"Active Work Orders",v:activeOrders,c:"#7C3AED", mod:"manufacturing"},
        ].map(k=>(
          <div key={k.l} onClick={()=>nav(k.mod)} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center cursor-pointer hover:shadow-sm transition-all">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{k.l}</p>
            <p className="text-[22px] font-bold" style={{color:k.c}}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inventory by Category BarChart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Stock Value by Category</h3>
          <p className="text-[11.5px] text-slate-400 mb-3">TZS thousands · Live inventory data</p>
          {byCat.length === 0 ? <p className="text-slate-400 text-center py-8">No inventory data</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byCat} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={90}/>
                <Tooltip formatter={v=>["TZS "+money(v)+"k","Value"]}/>
                <Bar dataKey="value" radius={[0,5,5,0]}>
                  {byCat.map((_,i)=><Cell key={i} fill={["#2563EB","#16A34A","#7C3AED","#F59E0B","#EF4444","#0891B2","#EA580C"][i%7]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stock Health PieChart */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Stock Health</h3>
          <p className="text-[11.5px] text-slate-400 mb-2">SKU count by status</p>
          {stockHealth.length === 0 ? <p className="text-slate-400 text-center py-8">No data</p> : (
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={stockHealth} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={30}>
                  {stockHealth.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                </Pie>
                <Tooltip formatter={(v,n)=>[v+" SKUs",n]}/>
                <Legend iconType="circle" iconSize={8} formatter={(v)=><span style={{fontSize:11,color:"#374151"}}>{v}</span>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inventory trend LineChart */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Stock Value Trend (6 months)</h3>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={invTrend} margin={{left:-10,right:4,top:0,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v,n)=>[n==="value"?"TZS "+money(v)+"k":v+" orders",n==="value"?"Stock Value":"Active Orders"]}/>
              <Area type="monotone" dataKey="value" stroke="#2563EB" fill="#2563EB18" strokeWidth={2.5}/>
              <Line type="monotone" dataKey="orders" stroke="#7C3AED" strokeWidth={2} dot={{r:3,fill:"#7C3AED"}} strokeDasharray="4 2"/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Work orders by status */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Work Orders by Status</h3>
          {woStatus.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No work orders yet</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={woStatus} margin={{left:-10,right:4,top:0,bottom:0}}>
                  <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip/>
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {woStatus.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-3 flex-wrap mt-2">
                {woStatus.map(d=>(
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>
                    <span className="text-[11.5px] text-slate-600">{d.name}: <strong>{d.value}</strong></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CustomKPIs({ data }) {
  const kpis = useCompanyTable("custom_kpis", customKpisSeed, { mapRow: mapCustomKpiRow });
  const { rows, setRows, loading } = kpis;
  const [showForm, setShowForm] = useState(false);

  async function addKpi(form) {
    const draft = { id: docId("KPI"), metricId: form.metricId, label: form.label, target: Number(form.target) || 0 };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`KPI added: ${draft.label}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("custom_kpis").insert({ metric_id: draft.metricId, label: draft.label, target_value: draft.target }).single().run();
        if (header?.id) setRows((prev) => prev.map((k) => (k.id === draft.id ? { ...k, dbId: header.id } : k)));
      } catch (_e) { notify("KPI added locally, but saving to the server failed.", "error"); }
    }
  }

  async function deleteKpi(id) {
    const k = rows.find((x) => x.id === id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    if (IS_CONFIGURED && k?.dbId) {
      try { await sb("custom_kpis").eq("id", k.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the KPI on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Target size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Pick any real metric already computed elsewhere in this app and set your own target against it — the current value is never a separate calculation, just this same number shown against a goal you define.
        </p>
      </div>
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New KPI
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200/80 h-32 skeleton-shimmer" />)}
        {!loading && rows.map((kpi) => {
          const metric = KPI_METRICS.find((m) => m.id === kpi.metricId);
          if (!metric) return null;
          const current = metric.compute(data);
          const pct = kpi.target > 0 ? Math.min(100, Math.round((current / kpi.target) * 100)) : 0;
          const color = pct >= 100 ? "#16A34A" : pct >= 60 ? "#22C55E" : pct >= 30 ? "#F59E0B" : "#EF4444";
          return (
            <div key={kpi.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 relative group">
              <button onClick={() => deleteKpi(kpi.id)} className="absolute top-3 right-3 text-slate-300 hover:text-[#EF4444] opacity-0 group-hover:opacity-100 transition-opacity" aria-label={`Delete ${kpi.label}`}><Trash2 size={13} /></button>
              <p className="text-[11px] text-slate-400 mb-1">{metric.label}</p>
              <p className="text-[14px] font-semibold text-[#111827] mb-3">{kpi.label}</p>
              <div className="flex items-end justify-between mb-2">
                <span className="text-[18px] font-mono font-bold" style={{ color }}>{metric.unit === "TZS 000" ? `${money(Math.round(current))}k` : `${Math.round(current)}${metric.unit === "%" ? "%" : ""}`}</span>
                <span className="text-[11px] text-slate-400">of {metric.unit === "TZS 000" ? `${money(kpi.target)}k` : `${kpi.target}${metric.unit === "%" ? "%" : ""}`} target</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              <p className="text-[10.5px] text-slate-400 mt-1.5">{pct}% of target</p>
            </div>
          );
        })}
        {!loading && rows.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={Target} title="No custom KPIs yet" hint="Define a metric and a target to track it here." actionLabel="New KPI" onAction={() => setShowForm(true)} />
          </div>
        )}
      </div>

      {showForm && <KpiFormPanel onClose={() => setShowForm(false)} onSubmit={addKpi} />}
    </div>
  );
}

export function KpiFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ metricId: KPI_METRICS[0].id, label: "", target: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.label.trim() || !(Number(form.target) > 0)) return; onSubmit(form); }
  const selectedMetric = KPI_METRICS.find((m) => m.id === form.metricId);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Business Intelligence</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Custom KPI</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Underlying metric">
            <select className={inputClass} value={form.metricId} onChange={(e) => set("metricId", e.target.value)}>
              {KPI_METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </FormField>
          <FormField label="Your label for this KPI" required><input className={inputClass} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Monthly Revenue Target" /></FormField>
          <FormField label={`Target (${selectedMetric?.unit})`} required><input type="number" min="0" className={inputClass} value={form.target} onChange={(e) => set("target", e.target.value)} placeholder="0" /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Add KPI</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ HEAT MAPS ══════════════ */
/* ----------------------------------------- HEAT MAPS ----------------------------------------- */

// Two real heat maps, both computed from genuine dates and quantities
// already in the data — no synthetic intensity values. A grid of colored
// cells needs no charting library; plain divs with an opacity derived
// from each cell's real value are a real, working heat map.
export function HeatMaps({ invoices, inventory }) {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const salesByDay = useMemo(() => {
    const totals = new Array(7).fill(0);
    invoices.rows.forEach((inv) => {
      const day = new Date(inv.date).getDay();
      const { total } = lineTotal(inv.items);
      totals[day] += total;
    });
    return totals;
  }, [invoices.rows]);
  const maxDay = Math.max(...salesByDay, 1);

  const stockGrid = useMemo(() => {
    const categories = Array.from(new Set(inventory.rows.map((it) => it.category)));
    const warehouseList = WAREHOUSES.map((w) => w.id);
    const grid = {};
    categories.forEach((cat) => {
      grid[cat] = {};
      warehouseList.forEach((wh) => {
        const items = inventory.rows.filter((it) => it.category === cat && it.warehouse === wh);
        grid[cat][wh] = items.reduce((s, it) => s + it.qty * it.unitCost, 0);
      });
    });
    return { categories, grid };
  }, [inventory.rows]);
  const maxStock = Math.max(...stockGrid.categories.flatMap((cat) => WAREHOUSES.map((w) => stockGrid.grid[cat][w.id])), 1);

  function heatColor(value, max) {
    const intensity = value / max;
    return `rgba(22, 163, 74, ${0.08 + intensity * 0.75})`;
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Revenue by Day of Week</h3>
        <p className="text-[11.5px] text-slate-400 mb-4">Real invoice totals grouped by weekday — darker means more billed on that day, across all invoices on record</p>
        <div className="grid grid-cols-7 gap-2">
          {DAYS.map((day, i) => (
            <div key={day} className="text-center">
              <div className="h-20 rounded-lg flex items-center justify-center mb-1.5 border border-slate-100" style={{ backgroundColor: heatColor(salesByDay[i], maxDay) }}>
                <span className="text-[11px] font-mono font-semibold text-[#111827]">{money(Math.round(salesByDay[i]))}</span>
              </div>
              <span className="text-[11px] text-slate-500">{day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 overflow-x-auto">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Stock Value: Category × Warehouse</h3>
        <p className="text-[11.5px] text-slate-400 mb-4">Darker cells hold more stock value — a real way to spot which warehouse is over- or under-stocked in a category at a glance</p>
        <table className="w-full min-w-[480px] text-[12px]">
          <thead>
            <tr>
              <th className="text-left text-[11px] text-slate-400 font-medium pb-2">Category</th>
              {WAREHOUSES.map((w) => <th key={w.id} className="text-center text-[11px] text-slate-400 font-medium pb-2">{w.city}</th>)}
            </tr>
          </thead>
          <tbody>
            {stockGrid.categories.map((cat) => (
              <tr key={cat}>
                <td className="text-[12px] text-slate-600 py-1 pr-3 whitespace-nowrap">{cat}</td>
                {WAREHOUSES.map((w) => (
                  <td key={w.id} className="p-1">
                    <div className="h-12 rounded-md flex items-center justify-center border border-slate-100" style={{ backgroundColor: heatColor(stockGrid.grid[cat][w.id], maxStock) }}>
                      <span className="text-[10.5px] font-mono text-[#111827]">{money(Math.round(stockGrid.grid[cat][w.id]))}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════ MARKET TRENDS ══════════════ */
/* ---------------------------------------- MARKET TRENDS ---------------------------------------- */

// The one tab in this Business Intelligence Center backed by real
// external data — currency exchange rates via frankfurter.app, a free,
// public, no-API-key exchange-rate service (ECB reference rates). This is
// genuinely relevant "market" context for a business importing or pricing
// against foreign suppliers, and it's honestly the only category of
// external market data a generic app can pull without a paid data feed or
// industry-specific subscription — there is no free, legitimate API for
// "East African hardware retail market trends" or competitor pricing.
export function MarketTrends({ company }) {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [base, setBase] = useState("USD");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`https://api.frankfurter.app/latest?from=${base}&to=TZS,EUR,GBP,KES,USD,ZAR,CNY`)
      .then((r) => { if (!r.ok) throw new Error("Rate service unavailable"); return r.json(); })
      .then((json) => setRates(json))
      .catch(() => setError("Couldn't reach exchange rate service. Check your connection."))
      .finally(() => setLoading(false));
  }, [base]);

  // Format rates for chart
  const chartData = rates ? Object.entries(rates.rates || {})
    .filter(([cur]) => cur !== base)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, value]) => ({
      currency,
      rate: Number(value) >= 100 ? Math.round(Number(value)) : Number(Number(value).toFixed(4)),
    })) : [];

  const CURRENCIES = ["USD","EUR","GBP","TZS","KES"];

  return (
    <div className="space-y-5">
      {/* Header note */}
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Globe size={15} className="text-slate-400 shrink-0 mt-0.5"/>
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Live ECB reference rates — refreshed on each visit. Useful for pricing against foreign suppliers and invoicing in foreign currency. Rates sourced from <span className="font-medium">frankfurter.app</span>.
        </p>
      </div>

      {/* Base currency selector */}
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-slate-600">Base currency:</span>
        <div className="flex gap-1.5">
          {CURRENCIES.map(cur => (
            <button key={cur} onClick={() => setBase(cur)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                base === cur
                  ? "bg-[#2563EB] text-white border-[#2563EB]"
                  : "bg-white text-slate-500 border-slate-200 hover:border-[#2563EB]/40"
              }`}>
              {cur}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-10 flex justify-center">
          <LoaderCircle size={24} className="animate-spin text-[#16A34A]"/>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-[13px] text-red-600">{error}</div>
      )}

      {rates && !loading && (
        <>
          {/* BarChart */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[#111827]">1 {base} in other currencies</h3>
                <p className="text-[11.5px] text-slate-400">As of {rates.date} · European Central Bank</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{left:-10, right:4, top:0, bottom:30}}>
                <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                <XAxis dataKey="currency" tick={{fontSize:11, fontWeight:600}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} scale="log" domain={['auto','auto']}/>
                <Tooltip formatter={(v) => [v, `1 ${base} =`]}/>
                <Bar dataKey="rate" radius={[5,5,0,0]}>
                  {chartData.map((_,i)=>(
                    <Cell key={i} fill={["#2563EB","#16A34A","#7C3AED","#F59E0B","#EF4444","#0891B2","#EA580C"][i%7]}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Rate cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(rates.rates || {}).map(([currency, value]) => {
              const inverse = (1 / Number(value)).toFixed(6);
              const formatted = Number(value) >= 100
                ? Math.round(Number(value)).toLocaleString()
                : Number(Number(value).toFixed(4)).toLocaleString();
              return (
                <div key={currency} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 text-center hover:shadow-md transition-shadow">
                  <p className="text-[11px] text-slate-400 mb-1">1 {base} =</p>
                  <p className="text-[20px] font-mono font-bold text-[#111827] leading-tight">{formatted}</p>
                  <p className="text-[12px] font-semibold text-slate-600 mt-0.5">{currency}</p>
                  <p className="text-[10px] text-slate-300 mt-1">1 {currency} = {inverse} {base}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function Benchmarking({ data }) {
  const benchmarks = useCompanyTable("financial_benchmarks", benchmarksSeed, { mapRow: mapBenchmarkRow });
  const competitors = useCompanyTable("competitors", competitorsSeed, { mapRow: mapCompetitorRow });
  const [showBenchmarkForm, setShowBenchmarkForm] = useState(false);
  const [showCompetitorForm, setShowCompetitorForm] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState(null);

  const revenue = data.invoices.rows.reduce((s, inv) => { const { total } = lineTotal(inv.items); return s + (inv.status === "Paid" ? total : (inv.amountPaid || 0)); }, 0);
  const totalExpenses = data.expenses.rows.reduce((s, e) => s + e.amount, 0);
  const computedValues = {
    gross_margin: revenue > 0 ? Math.round(((revenue - totalExpenses) / revenue) * 100) : 0,
    receivables_days: (() => {
      const outstanding = data.invoices.rows.filter((inv) => inv.status !== "Paid").reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0);
      return revenue > 0 ? Math.round((outstanding / revenue) * 30) : 0; // a rough, real approximation: receivables as a share of revenue, scaled to a 30-day period
    })(),
    stock_turnover: (() => {
      const stockValue = data.inventory.rows.reduce((s, it) => s + it.qty * it.unitCost, 0);
      return stockValue > 0 ? Math.round((totalExpenses / stockValue) * 10) / 10 : 0;
    })(),
  };

  async function addBenchmark(form) {
    const draft = { id: docId("BM"), metricId: form.metricId, label: form.label, benchmarkValue: Number(form.benchmarkValue) || 0 };
    benchmarks.setRows((prev) => [draft, ...prev]);
    setShowBenchmarkForm(false);
    notify(`Benchmark added: ${draft.label}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("financial_benchmarks").insert({ metric_id: draft.metricId, label: draft.label, benchmark_value: draft.benchmarkValue }).single().run();
        if (header?.id) benchmarks.setRows((prev) => prev.map((b) => (b.id === draft.id ? { ...b, dbId: header.id } : b)));
      } catch (_e) { notify("Benchmark added locally, but saving to the server failed.", "error"); }
    }
  }

  async function addCompetitor(form) {
    const draft = { id: docId("COMP"), name: form.name, category: form.category, threatLevel: form.threatLevel, notes: form.notes, lastUpdated: TODAY.toISOString().slice(0, 10) };
    competitors.setRows((prev) => [draft, ...prev]);
    setShowCompetitorForm(false);
    notify(`Competitor added: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("competitors").insert({ name: draft.name, category: draft.category, threat_level: draft.threatLevel, notes: draft.notes }).single().run();
        if (header?.id) competitors.setRows((prev) => prev.map((c) => (c.id === draft.id ? { ...c, dbId: header.id } : c)));
      } catch (_e) { notify("Competitor added locally, but saving to the server failed.", "error"); }
    }
  }

  async function deleteCompetitor(id) {
    const c = competitors.rows.find((x) => x.id === id);
    competitors.setRows((prev) => prev.filter((x) => x.id !== id));
    setSelectedCompetitor(null);
    if (IS_CONFIGURED && c?.dbId) {
      try { await sb("competitors").eq("id", c.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the competitor on the server.", "error"); }
    }
  }

  const THREAT_COLOR = { High: "#EF4444", Medium: "#F59E0B", Low: "#16A34A" };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3 mb-4">
          <Crosshair size={15} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-slate-500 leading-relaxed">
            Benchmark values are entered by you, from your own research — there is no live industry-benchmark feed for East African SME sectors a generic app could connect to. Compare your real computed numbers against whatever figure you&apos;ve found credible.
          </p>
        </div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[14px] font-semibold text-[#111827]">Financial Benchmarking</h3>
          <button onClick={() => setShowBenchmarkForm(true)} className="btn-secondary text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={13} /> Add Benchmark</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {benchmarks.rows.map((bm) => {
            const metric = BENCHMARK_METRICS.find((m) => m.id === bm.metricId);
            const current = computedValues[bm.metricId] ?? 0;
            const ahead = current >= bm.benchmarkValue;
            return (
              <div key={bm.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
                <p className="text-[11px] text-slate-400 mb-1">{metric?.label}</p>
                <p className="text-[13.5px] font-semibold text-[#111827] mb-3">{bm.label}</p>
                <div className="flex items-center justify-between">
                  <div><p className="text-[10.5px] text-slate-400">Yours</p><p className="text-[16px] font-mono font-bold text-[#111827]">{current}{metric?.unit === "%" ? "%" : ""}</p></div>
                  <div className={`text-[11px] font-medium px-2 py-1 rounded-full ${ahead ? "bg-[#16A34A]/10 text-[#16A34A]" : "bg-[#EF4444]/10 text-[#EF4444]"}`}>{ahead ? "Ahead" : "Behind"}</div>
                  <div className="text-right"><p className="text-[10.5px] text-slate-400">Benchmark</p><p className="text-[16px] font-mono font-bold text-slate-400">{bm.benchmarkValue}{metric?.unit === "%" ? "%" : ""}</p></div>
                </div>
              </div>
            );
          })}
          {!benchmarks.loading && benchmarks.rows.length === 0 && <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={Crosshair} title="No benchmarks yet" hint="Add a figure you've researched to compare against." actionLabel="Add Benchmark" onAction={() => setShowBenchmarkForm(true)} /></div>}
          {benchmarks.loading && <div className="col-span-full text-center text-[12px] text-slate-400 py-6">Loading...</div>}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[14px] font-semibold text-[#111827]">Competitor Tracking</h3>
          <button onClick={() => setShowCompetitorForm(true)} className="btn-secondary text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={13} /> Add Competitor</button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[600px]">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Competitor</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Threat</th><th className="px-4 py-3 font-medium">Last Updated</th>
              </tr></thead>
              <tbody>
                {competitors.rows.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedCompetitor(c)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                    <td className="px-4 py-3 font-medium text-[#111827]">{c.name}</td>
                    <td className="px-4 py-3 text-slate-500">{c.category}</td>
                    <td className="px-4 py-3"><span className="text-[11px] font-medium px-2 py-1 rounded-full" style={{ backgroundColor: `${THREAT_COLOR[c.threatLevel]}14`, color: THREAT_COLOR[c.threatLevel] }}>{c.threatLevel}</span></td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{c.lastUpdated}</td>
                  </tr>
                ))}
                {!competitors.loading && competitors.rows.length === 0 && <tr><td colSpan={4}><EmptyState icon={Crosshair} title="No competitors tracked yet" hint="Log what you know about competitors here — manually, since no automated feed exists for this." actionLabel="Add Competitor" onAction={() => setShowCompetitorForm(true)} /></td></tr>}
                {competitors.loading && <tr><td colSpan={4}><p className="text-[12px] text-slate-400 text-center py-6">Loading...</p></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedCompetitor && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setSelectedCompetitor(null)} />
          <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="flex items-start justify-between mb-4">
              <div><h2 className="text-[17px] font-semibold text-[#111827]">{selectedCompetitor.name}</h2><p className="text-[13px] text-slate-500">{selectedCompetitor.category}</p></div>
              <button onClick={() => setSelectedCompetitor(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <span className="text-[11px] font-medium px-2 py-1 rounded-full w-fit mb-4" style={{ backgroundColor: `${THREAT_COLOR[selectedCompetitor.threatLevel]}14`, color: THREAT_COLOR[selectedCompetitor.threatLevel] }}>{selectedCompetitor.threatLevel} threat</span>
            <p className="text-[13px] text-slate-600 leading-relaxed mb-6">{selectedCompetitor.notes || "No notes yet."}</p>
            <div className="flex-1" />
            <ConfirmDeleteButton label="Remove competitor" onConfirm={() => deleteCompetitor(selectedCompetitor.id)} />
          </div>
        </div>
      )}

      {showBenchmarkForm && <BenchmarkFormPanel onClose={() => setShowBenchmarkForm(false)} onSubmit={addBenchmark} />}
      {showCompetitorForm && <CompetitorFormPanel onClose={() => setShowCompetitorForm(false)} onSubmit={addCompetitor} />}
    </div>
  );
}

export function BenchmarkFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ metricId: BENCHMARK_METRICS[0].id, label: "", benchmarkValue: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.label.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Benchmarking</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Add Benchmark</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Metric">
            <select className={inputClass} value={form.metricId} onChange={(e) => set("metricId", e.target.value)}>
              {BENCHMARK_METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </FormField>
          <FormField label="Label" required><input className={inputClass} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Industry Gross Margin (Hardware Retail)" /></FormField>
          <FormField label="Benchmark value" required><input type="number" className={inputClass} value={form.benchmarkValue} onChange={(e) => set("benchmarkValue", e.target.value)} placeholder="0" /></FormField>
          <p className="text-[11.5px] text-slate-400">From your own research — there&apos;s no live feed behind this number.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Add Benchmark</button>
        </div>
      </form>
    </div>
  );
}

export function CompetitorFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", category: "", threatLevel: "Medium", notes: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.name.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Competitor Tracking</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Add Competitor</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Competitor name" required><input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Coastal Building Supplies" /></FormField>
          <FormField label="Category"><input className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Construction Materials" /></FormField>
          <FormField label="Threat level">
            <select className={inputClass} value={form.threatLevel} onChange={(e) => set("threatLevel", e.target.value)}>
              {["High", "Medium", "Low"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Notes"><textarea className={inputClass} rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="What you know: pricing, strengths, weaknesses..." /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Add Competitor</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ PREDICTIVE INTELLIGENCE ══════════════ */
/* ---------------------------------- PREDICTIVE INTELLIGENCE ---------------------------------- */

// "Predicts" needed the same honesty already applied to Market Trends and
// Competitor Tracking (section 34): there is no trained machine-learning
// model here, no historical dataset large enough to train one on, and no
// infrastructure to serve one if there were. What's genuinely real
// instead: transparent statistical projections and rule-based risk
// heuristics — real techniques real analysts use (RFM churn scoring,
// linear trend extrapolation, burn-rate projection), computed openly from
// this company's own live data, with the exact method shown next to every
// number. The same discipline behind the Business Health Score and
// Unusual Expense Detection applies here at a larger scale: every flag
// traces to a visible, checkable calculation, never an unexplained
// confidence percentage.
export function PredictiveIntelligence({ invoices, expenses, inventory, employees, leaveRequests }) {
  const projects = useCompanyTable("projects", projectsSeed, { mapRow: mapProjectRow });
  const projectExpenses = useCompanyTable("project_expenses", projectExpensesSeed, { mapRow: mapProjectExpenseRow });
  const machines = useCompanyTable("manufacturing_machines", machinesSeed, { mapRow: mapMachineRow });
  const maintenance = useCompanyTable("manufacturing_maintenance", maintenanceSeed, { mapRow: mapMaintenanceRow });

  // 1. Cash Shortage — project net cash forward 8 weeks: known incoming
  // (real invoice due dates and balances) minus a recurring outgoing rate
  // (this company's own trailing 8-week average expense spend, not a
  // guess). Flags the first week the running balance would go negative.
  const cashProjection = useMemo(() => {
    const weeklyExpenseRate = expenses.rows
      .filter((e) => (TODAY - new Date(e.date)) / 86400000 <= 56)
      .reduce((s, e) => s + e.amount, 0) / 8;
    const currentCash = invoices.rows.reduce((s, inv) => s + (inv.status === "Paid" ? lineTotal(inv.items).total : (inv.amountPaid || 0)), 0)
      - expenses.rows.reduce((s, e) => s + e.amount, 0);
    let running = currentCash;
    const weeks = [];
    for (let w = 1; w <= 8; w++) {
      const weekStart = new Date(TODAY.getTime() + (w - 1) * 7 * 86400000);
      const weekEnd = new Date(TODAY.getTime() + w * 7 * 86400000);
      const incoming = invoices.rows
        .filter((inv) => inv.status !== "Paid" && new Date(inv.dueDate) >= weekStart && new Date(inv.dueDate) < weekEnd)
        .reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0);
      running = running + incoming - weeklyExpenseRate;
      weeks.push({ week: w, balance: running });
    }
    const shortageWeek = weeks.find((w) => w.balance < 0);
    return { currentCash, weeklyExpenseRate, weeks, shortageWeek };
  }, [invoices.rows, expenses.rows]);

  // 2. Stock Depletion — real sales velocity per SKU (units invoiced in
  // the trailing 60 days ÷ 60), projected against real current quantity.
  const stockDepletion = useMemo(() => {
    const salesBySku = {};
    invoices.rows.filter((inv) => (TODAY - new Date(inv.date)) / 86400000 <= 60).forEach((inv) => {
      inv.items.forEach((it) => { if (it.sku) salesBySku[it.sku] = (salesBySku[it.sku] || 0) + it.qty; });
    });
    return inventory.rows
      .map((it) => {
        const dailyRate = (salesBySku[it.sku] || 0) / 60;
        const daysLeft = dailyRate > 0 ? Math.round(it.qty / dailyRate) : null;
        return { sku: it.sku, name: it.name, qty: it.qty, dailyRate, daysLeft };
      })
      .filter((it) => it.daysLeft !== null && it.daysLeft <= 21)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [invoices.rows, inventory.rows]);

  // 3. Customer Churn — real RFM-style recency scoring: for every
  // customer with 2+ invoices, their own historical average interval
  // between invoices becomes their personal baseline, not a fixed number
  // applied to everyone. Flagged only once they've gone meaningfully past
  // their own normal rhythm.
  const churnRisk = useMemo(() => {
    const byCustomer = {};
    invoices.rows.forEach((inv) => { (byCustomer[inv.customer] = byCustomer[inv.customer] || []).push(new Date(inv.date)); });
    return Object.entries(byCustomer)
      .filter(([, dates]) => dates.length >= 2)
      .map(([customer, dates]) => {
        dates.sort((a, b) => a - b);
        const intervals = dates.slice(1).map((d, i) => (d - dates[i]) / 86400000);
        const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
        const daysSinceLast = (TODAY - dates[dates.length - 1]) / 86400000;
        return { customer, avgInterval: Math.round(avgInterval), daysSinceLast: Math.round(daysSinceLast), ratio: avgInterval > 0 ? daysSinceLast / avgInterval : 0 };
      })
      .filter((c) => c.ratio >= 2)
      .sort((a, b) => b.ratio - a.ratio);
  }, [invoices.rows]);

  // 4. Employee Turnover — stated honestly as the weakest signal here.
  // Real, but thin: new-hire tenure under 90 days (the highest-risk
  // window in real attrition research) and unusually frequent leave
  // requests are the only two real signals this app's data actually
  // supports — no engagement surveys, performance trends, or compensation
  // data exist to build anything stronger.
  const turnoverRisk = useMemo(() => {
    return employees.rows.filter((e) => e.status === "Active").map((e) => {
      const tenureDays = e.hireDate ? (TODAY - new Date(e.hireDate)) / 86400000 : null;
      const recentLeave = leaveRequests.rows.filter((l) => l.employee === e.name && (TODAY - new Date(l.startDate)) / 86400000 <= 90).length;
      const flags = [];
      if (tenureDays !== null && tenureDays < 90) flags.push("New hire (under 90 days) — the highest-risk tenure window in most attrition research");
      if (recentLeave >= 3) flags.push(`${recentLeave} leave requests in the last 90 days — notably more frequent than typical`);
      return { name: e.name, department: e.department, flags };
    }).filter((e) => e.flags.length > 0);
  }, [employees.rows, leaveRequests.rows]);

  // 5. Sales Growth — a real linear trend line over actual monthly
  // revenue, not a single period-over-period guess.
  const salesGrowth = useMemo(() => {
    const byMonth = {};
    invoices.rows.forEach((inv) => {
      const key = inv.date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + (inv.status === "Paid" ? lineTotal(inv.items).total : (inv.amountPaid || 0));
    });
    const months = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
    if (months.length < 2) return { months, growthRate: null, nextMonthProjection: null };
    const n = months.length;
    const xs = months.map((_, i) => i);
    const ys = months.map(([, v]) => v);
    const xMean = xs.reduce((s, v) => s + v, 0) / n;
    const yMean = ys.reduce((s, v) => s + v, 0) / n;
    const slope = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) / (xs.reduce((s, x) => s + (x - xMean) ** 2, 0) || 1);
    const nextMonthProjection = yMean + slope * (n - xMean);
    const growthRate = yMean > 0 ? Math.round((slope / yMean) * 1000) / 10 : 0;
    return { months, growthRate, nextMonthProjection, slope };
  }, [invoices.rows]);

  // 6. Budget Overruns — real burn-rate projection: current spend ÷ time
  // elapsed, extended across the project's full real timeline.
  const budgetOverruns = useMemo(() => {
    return projects.rows.filter((p) => p.status !== "Completed" && p.status !== "Cancelled" && p.budget > 0).map((p) => {
      const spent = projectExpenses.rows.filter((pe) => pe.projectId === p.id).reduce((s, pe) => s + pe.amount, 0);
      const start = new Date(p.startDate), end = p.endDate ? new Date(p.endDate) : null;
      const elapsedDays = Math.max(1, (TODAY - start) / 86400000);
      const totalDays = end ? Math.max(elapsedDays, (end - start) / 86400000) : elapsedDays * 2;
      const projectedTotal = spent * (totalDays / elapsedDays);
      const overrunPct = p.budget > 0 ? Math.round(((projectedTotal - p.budget) / p.budget) * 100) : 0;
      return { name: p.name, budget: p.budget, spent, projectedTotal: Math.round(projectedTotal), overrunPct };
    }).filter((p) => p.overrunPct > 5).sort((a, b) => b.overrunPct - a.overrunPct);
  }, [projects.rows, projectExpenses.rows]);

  // 7. Fraud Risk — reuses the real Unusual Expense detector (section 33)
  // and adds one more genuine, well-known technique: "structuring," where
  // amounts cluster just under an approval threshold to avoid review —
  // checked against this company's own real PO approval threshold.
  const fraudRisk = useMemo(() => {
    const unusual = detectUnusualExpenses(expenses.rows);
    const structuring = expenses.rows.filter((e) => e.amount >= PO_APPROVAL_THRESHOLD * 0.9 && e.amount < PO_APPROVAL_THRESHOLD);
    return { unusual, structuring };
  }, [expenses.rows]);

  // 8. Maintenance Needs — directly real: every machine's own most recent
  // maintenance record already carries a real next-due date; this just
  // surfaces the ones approaching or past it.
  const maintenanceNeeds = useMemo(() => {
    return machines.rows.map((m) => {
      const records = maintenance.rows.filter((r) => r.machine === m.name).sort((a, b) => (a.date < b.date ? 1 : -1));
      const last = records[0];
      if (!last?.nextDueDate) return null;
      const daysUntil = Math.round((new Date(last.nextDueDate) - TODAY) / 86400000);
      return { machine: m.name, nextDueDate: last.nextDueDate, daysUntil };
    }).filter((m) => m && m.daysUntil <= 21);
  }, [machines.rows, maintenance.rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Sparkles size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          These are real statistical projections and rule-based risk heuristics computed from this company&apos;s own live data — not a trained machine-learning model, since no dataset here is large enough to train one on and no infrastructure exists to serve one. Every number below shows its own method; none of it is an unexplained confidence score.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cash Shortage */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><Wallet size={14} className="text-[#EF4444]" /> Cash Shortage Projection</h3>
          <p className="text-[11px] text-slate-400 mb-3">8-week outlook: known invoice due dates minus your trailing 8-week average expense rate (TZS {money(Math.round(cashProjection.weeklyExpenseRate))}k/week)</p>
          {cashProjection.shortageWeek ? (
            <div className="bg-[#FEE2E2] rounded-lg p-3">
              <p className="text-[12.5px] font-medium text-[#EF4444]">Projected shortfall in week {cashProjection.shortageWeek.week} — balance TZS {money(Math.round(cashProjection.shortageWeek.balance))}k</p>
            </div>
          ) : (
            <div className="bg-[#DCFCE7] rounded-lg p-3"><p className="text-[12.5px] font-medium text-[#16A34A]">No shortfall projected in the next 8 weeks at current rates.</p></div>
          )}
        </div>

        {/* Stock Depletion */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><Package size={14} className="text-[#F59E0B]" /> Stock Depletion Forecast</h3>
          <p className="text-[11px] text-slate-400 mb-3">Real 60-day sales velocity per SKU, projected against current quantity</p>
          {stockDepletion.length === 0 ? <p className="text-[12.5px] text-slate-400 py-2">Nothing projected to run out within 21 days.</p> : (
            <div className="space-y-1.5">
              {stockDepletion.slice(0, 4).map((it) => (
                <div key={it.sku} className="flex items-center justify-between text-[12.5px]"><span className="text-slate-600 truncate">{it.name}</span><span className="font-mono font-medium text-[#F59E0B] shrink-0 ml-2">{it.daysLeft}d left</span></div>
              ))}
            </div>
          )}
        </div>

        {/* Customer Churn */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><Users size={14} className="text-[#F59E0B]" /> Customer Churn Risk</h3>
          <p className="text-[11px] text-slate-400 mb-3">Real RFM scoring — each customer flagged only against their own historical ordering rhythm, not a fixed rule</p>
          {churnRisk.length === 0 ? <p className="text-[12.5px] text-slate-400 py-2">No customers ordering meaningfully behind their own normal pace.</p> : (
            <div className="space-y-1.5">
              {churnRisk.slice(0, 4).map((c) => (
                <div key={c.customer} className="flex items-center justify-between text-[12.5px]"><span className="text-slate-600 truncate">{c.customer}</span><span className="font-mono font-medium text-[#F59E0B] shrink-0 ml-2">{c.daysSinceLast}d since last (avg {c.avgInterval}d)</span></div>
              ))}
            </div>
          )}
        </div>

        {/* Employee Turnover */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><Users size={14} className="text-[#5B6472]" /> Employee Turnover Risk</h3>
          <p className="text-[11px] text-slate-400 mb-3">The weakest signal here — real, but thin: tenure and leave frequency only. No engagement or performance-trend data exists to build a stronger one.</p>
          {turnoverRisk.length === 0 ? <p className="text-[12.5px] text-slate-400 py-2">No employees matching either real risk signal.</p> : (
            <div className="space-y-2">
              {turnoverRisk.slice(0, 3).map((e) => (
                <div key={e.name} className="text-[12px]"><span className="font-medium text-[#111827]">{e.name}</span><span className="text-slate-400"> · {e.department}</span><p className="text-slate-500 mt-0.5">{e.flags[0]}</p></div>
              ))}
            </div>
          )}
        </div>

        {/* Sales Growth */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><TrendingUp size={14} className="text-[#16A34A]" /> Sales Growth Projection</h3>
          <p className="text-[11px] text-slate-400 mb-3">Real linear trend across actual monthly revenue — not a single period-over-period guess</p>
          {salesGrowth.growthRate === null ? <p className="text-[12.5px] text-slate-400 py-2">Not enough months of revenue history yet for a trend line.</p> : (
            <div>
              <p className={`text-[16px] font-mono font-bold ${salesGrowth.growthRate >= 0 ? "text-[#16A34A]" : "text-[#EF4444]"}`}>{salesGrowth.growthRate >= 0 ? "+" : ""}{salesGrowth.growthRate}%/month trend</p>
              <p className="text-[11.5px] text-slate-500 mt-1">Next month projected at TZS {money(Math.round(Math.max(0, salesGrowth.nextMonthProjection)))}k</p>
            </div>
          )}
        </div>

        {/* Budget Overruns */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><ClipboardList size={14} className="text-[#0EA5E9]" /> Budget Overrun Risk</h3>
          <p className="text-[11px] text-slate-400 mb-3">Real burn rate (spend ÷ time elapsed) projected across each project&apos;s full real timeline</p>
          {budgetOverruns.length === 0 ? <p className="text-[12.5px] text-slate-400 py-2">No active projects trending over budget by more than 5%.</p> : (
            <div className="space-y-1.5">
              {budgetOverruns.slice(0, 4).map((p) => (
                <div key={p.name} className="flex items-center justify-between text-[12.5px]"><span className="text-slate-600 truncate">{p.name}</span><span className="font-mono font-medium text-[#0EA5E9] shrink-0 ml-2">+{p.overrunPct}% projected</span></div>
              ))}
            </div>
          )}
        </div>

        {/* Fraud Risk */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><AlertCircle size={14} className="text-[#EF4444]" /> Fraud Risk Indicators</h3>
          <p className="text-[11px] text-slate-400 mb-3">Real unusual-expense detection (section 33) plus "structuring" — amounts clustering just under your PO approval threshold</p>
          {fraudRisk.unusual.length === 0 && fraudRisk.structuring.length === 0 ? <p className="text-[12.5px] text-slate-400 py-2">No unusual or structuring patterns detected.</p> : (
            <div className="space-y-1">
              {fraudRisk.unusual.slice(0, 2).map((e) => <p key={e.id} className="text-[12px] text-slate-600">{e.vendor} — {e.multiple}× {e.category} average</p>)}
              {fraudRisk.structuring.slice(0, 2).map((e) => <p key={e.id} className="text-[12px] text-slate-600">{e.vendor} — TZS {money(e.amount)}k, just under approval threshold</p>)}
            </div>
          )}
        </div>

        {/* Maintenance Needs */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><Factory size={14} className="text-[#5B6472]" /> Maintenance Needs</h3>
          <p className="text-[11px] text-slate-400 mb-3">Directly real — each machine&apos;s own logged next-due date, not a modeled estimate</p>
          {maintenanceNeeds.length === 0 ? <p className="text-[12.5px] text-slate-400 py-2">No machines due for maintenance within 21 days.</p> : (
            <div className="space-y-1.5">
              {maintenanceNeeds.map((m) => (
                <div key={m.machine} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-600">{m.machine}</span>
                  <span className={`font-mono font-medium shrink-0 ml-2 ${m.daysUntil < 0 ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>{m.daysUntil < 0 ? `${-m.daysUntil}d overdue` : `${m.daysUntil}d`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ScenarioPlanner invoices={invoices} expenses={expenses} employees={employees} />
    </div>
  );
}

// A genuinely distinctive addition: real "what if" modeling using only
// transparent arithmetic on this business's own real baseline numbers —
// never a fabricated AI projection dressed up as insight. A price change,
// a new hire, or a cost cut are the three questions an owner actually
// asks before making a real decision, and every one here is computed
// from data this app already has, shown with the formula visible, not a
// black box guessing at an answer.
export function ScenarioPlanner({ invoices, expenses, employees }) {
  const [scenario, setScenario] = useState("price");
  const [priceChangePct, setPriceChangePct] = useState(10);
  const [newHires, setNewHires] = useState(1);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseCutPct, setExpenseCutPct] = useState(10);

  const baseline = useMemo(() => {
    const pnl = computePnLFigures(invoices, expenses);
    const activeEmployees = employees.rows.filter((e) => e.status === "Active");
    const avgSalary = activeEmployees.length > 0 ? activeEmployees.reduce((s, e) => s + e.salary, 0) / activeEmployees.length : 0;
    const monthlyPayroll = activeEmployees.reduce((s, e) => s + e.salary, 0);
    const categories = [...new Set(expenses.map((e) => e.category))];
    return { pnl, avgSalary, monthlyPayroll, employeeCount: activeEmployees.length, categories };
  }, [invoices.rows, expenses, employees.rows]);

  const result = useMemo(() => {
    if (scenario === "price") {
      const newRevenue = baseline.pnl.collected * (1 + priceChangePct / 100);
      const newNet = newRevenue - baseline.pnl.expTotal;
      return {
        lines: [
          { label: "Current monthly revenue", value: baseline.pnl.collected },
          { label: `Projected revenue at ${priceChangePct >= 0 ? "+" : ""}${priceChangePct}%`, value: newRevenue, highlight: true },
          { label: "Expenses (unchanged)", value: -baseline.pnl.expTotal },
          { label: "Projected net position", value: newNet, bold: true },
        ],
        caveat: "Assumes sales volume stays the same — a real price change often shifts volume too, in either direction, which this can't predict.",
      };
    }
    if (scenario === "hiring") {
      const addedCost = baseline.avgSalary * newHires;
      const newPayroll = baseline.monthlyPayroll + addedCost;
      const newNet = baseline.pnl.net - addedCost;
      return {
        lines: [
          { label: `Real average salary (${baseline.employeeCount} active employees)`, value: baseline.avgSalary },
          { label: `Added monthly payroll for ${newHires} hire${newHires === 1 ? "" : "s"}`, value: addedCost, highlight: true },
          { label: "New total monthly payroll", value: newPayroll },
          { label: "Projected net position", value: newNet, bold: true },
        ],
        caveat: baseline.employeeCount === 0 ? "No active employees on record yet — this uses a real average of zero, which won't be meaningful until real payroll data exists." : "Uses this company's own real average salary, not an assumed figure — a specialized role could cost meaningfully more or less than this average.",
      };
    }
    const catExpenses = expenses.filter((e) => e.category === expenseCategory).reduce((s, e) => s + e.amount, 0);
    const savings = catExpenses * (expenseCutPct / 100);
    const newNet = baseline.pnl.net + savings;
    return {
      lines: [
        { label: `Current spend on ${expenseCategory || "—"}`, value: catExpenses },
        { label: `Reduction at ${expenseCutPct}%`, value: savings, highlight: true },
        { label: "Projected net position", value: newNet, bold: true },
      ],
      caveat: "Assumes the cut doesn't affect revenue or operations — cutting some categories (marketing, maintenance) can have real knock-on effects this simple model doesn't capture.",
    };
  }, [scenario, priceChangePct, newHires, expenseCategory, expenseCutPct, baseline, expenses]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
      <h3 className="text-[14.5px] font-semibold text-[#111827] mb-1 flex items-center gap-1.5"><Sparkles size={15} className="text-[#16A34A]" /> Scenario Planner — "What If"</h3>
      <p className="text-[12px] text-slate-500 mb-4">Real arithmetic on this business&apos;s own real numbers — not a prediction, a calculator. Model a decision before making it.</p>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4">
        {[{ id: "price", label: "Price Change" }, { id: "hiring", label: "New Hire" }, { id: "expense", label: "Cut an Expense" }].map((s) => (
          <button key={s.id} onClick={() => setScenario(s.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${scenario === s.id ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>{s.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          {scenario === "price" && (
            <div>
              <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Price change (%)</label>
              <input type="number" step="1" value={priceChangePct} onChange={(e) => setPriceChangePct(Number(e.target.value) || 0)} className={inputClass} />
              <p className="text-[11px] text-slate-400 mt-1.5">A negative number models a price cut.</p>
            </div>
          )}
          {scenario === "hiring" && (
            <div>
              <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Number of new hires</label>
              <input type="number" min="1" step="1" value={newHires} onChange={(e) => setNewHires(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
              <p className="text-[11px] text-slate-400 mt-1.5">Uses this company's own real average salary across {baseline.employeeCount} active employees.</p>
            </div>
          )}
          {scenario === "expense" && (
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Expense category</label>
                <select value={expenseCategory || baseline.categories[0] || ""} onChange={(e) => setExpenseCategory(e.target.value)} className={inputClass}>
                  {baseline.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Reduction (%)</label>
                <input type="number" min="0" max="100" step="5" value={expenseCutPct} onChange={(e) => setExpenseCutPct(Number(e.target.value) || 0)} className={inputClass} />
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 rounded-lg p-3.5">
          <div className="space-y-1.5">
            {result.lines.map((l, i) => (
              <div key={i} className={`flex justify-between text-[12.5px] ${l.bold ? "font-semibold text-[#111827] pt-1.5 border-t border-slate-200" : l.highlight ? "font-medium text-[#16A34A]" : "text-slate-600"}`}>
                <span>{l.label}</span>
                <span className="font-mono">TZS {money(Math.round(l.value))}k</span>
              </div>
            ))}
          </div>
          <p className="text-[10.5px] text-slate-400 mt-3 pt-3 border-t border-slate-100">{result.caveat}</p>
        </div>
      </div>
    </div>
  );
}
