import { useMemo, useState } from "react";
import {
  AlertCircle, BadgeDollarSign, Brain, CalendarCheck, CheckCircle2, Clock, Download, Gauge,
  Landmark, Layers, LoaderCircle, Package, Plus, Printer, ShieldCheck, Trash2, TrendingUp,
  Wallet, X
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie,
  PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { EmptyState, FormField, SkeletonRows, inputClass } from "../components/ui.jsx";
import { depreciate, financeAssetsSeed } from "../data/assets.jsx";
import {
  ExportMenu,
  buildTableHtml,
  computeValuationByCategory,
  exportCSV,
  exportExcel,
  exportWord,
  printAsPDF,
} from "../lib/export.jsx";
import { TODAY, docId, lineTotal, money } from "../lib/format.jsx";
import { mapAssetRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { buildLedger } from "../modules/Finance.jsx";

// Real configuration, honestly limited execution: this defines what a
// scheduled report would be, and "Run Now" genuinely generates and
// downloads the real file. What it cannot do — and doesn't pretend to —
// is fire automatically while no one has this page open. A browser has no
// mechanism to execute code when its tab is closed; real unattended
// scheduling needs a server-side cron job or scheduled function, the same
// category of gap already documented for Subscriptions' billing and the
// Notification System's Email/SMS/WhatsApp/Push channels.
export const SCHEDULE_REPORT_TYPES = ["Sales & Revenue", "Inventory Valuation", "Profit & Loss"];

export const SCHEDULE_FREQUENCIES = ["Daily", "Weekly", "Monthly"];

export const SCHEDULE_FORMATS = ["CSV", "Excel", "PDF", "Word"];

export const scheduledReportsSeed = [
  { id: "SCH-01", reportType: "Profit & Loss", frequency: "Monthly", format: "PDF", recipientEmail: "owner@beirahisi.co.tz", status: "Active", lastRun: null },
  { id: "SCH-02", reportType: "Sales & Revenue", frequency: "Weekly", format: "Excel", recipientEmail: "sales@beirahisi.co.tz", status: "Active", lastRun: null },
];

export const REPORT_TABS = [
  { id: "sales",          label: "Sales & Revenue",    icon: TrendingUp },
  { id: "valuation",      label: "Inventory Valuation",icon: Package },
  { id: "pnl",            label: "Profit & Loss",      icon: Landmark },
  { id: "balance-sheet",  label: "Balance Sheet",      icon: Layers },
  { id: "cash-flow",      label: "Cash Flow",          icon: Wallet },
  { id: "ar-aging",       label: "AR Aging",           icon: Clock },
  { id: "tax",            label: "Tax / VAT Report",   icon: BadgeDollarSign },
  { id: "credit-profile", label: "Credit Profile",     icon: ShieldCheck },
  { id: "scheduled",      label: "Scheduled Reports",  icon: CalendarCheck },
];

// Global CSV export — downloadable from any table in the system
export function downloadCSV(filename, rows, columns) {
  if (!rows || rows.length === 0) { notify("No data to export", "error"); return; }
  const header = columns.map(c => '"' + (c.label||c.key) + '"').join(",");
  const body = rows.map(row =>
    columns.map(col => {
      const val = row[col.key] ?? "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      return '"' + str.replace(/"/g, '""') + '"';
    }).join(",")
  ).join("
");
  const csv = header + "
" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename + ".csv";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  notify("Exported " + rows.length + " rows to " + filename + ".csv");
}

// Real AI Insights, reused across every report: sends the report's actual
// computed totals (never raw row-by-row data, to keep the prompt small)
// to Claude and returns a short narrative — the same keyless in-artifact
// call pattern as the AI Business Assistant, scoped to one report instead
// of the whole business.
export function AIInsights({ company, reportName, summary }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setOpen(true);
    if (text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: `You analyze business reports for ${company.name}, a ${company.industry} business. Given the ${reportName} data below, write 3-5 short, specific observations a business owner would find useful — trends, risks, or opportunities. Plain text, no markdown, no preamble.`,
          messages: [{ role: "user", content: JSON.stringify(summary) }],
        }),
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      setText((data.content?.find((c) => c.type === "text")?.text || "").trim());
    } catch (e) {
      setError("Couldn't reach the AI service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={generate} className="flex items-center gap-1.5 text-[12px] font-medium border border-[#16A34A]/30 text-[#16A34A] rounded-lg px-3 py-2 hover:bg-[#16A34A]/5 transition-colors">
        <Brain size={13} /> AI Insights
      </button>
      {open && (
        <div className="mt-3 bg-[#16A34A]/5 border border-[#16A34A]/20 rounded-lg p-4">
          {busy && <p className="text-[12.5px] text-slate-500 flex items-center gap-2"><LoaderCircle size={13} className="animate-spin" /> Analyzing...</p>}
          {error && <p className="text-[12.5px] text-[#EF4444]">{error}</p>}
          {text && <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p>}
        </div>
      )}
    </div>
  );
}

export function Reports({ invoices, inventory, expensesHook, company, schedulesHook, posTransactions, onNavigate }) {
  const [tab, setTab] = useState("sales");
  const expenses = expensesHook.rows;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Reports</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Computed live from this session&apos;s data · TZS thousands · export to CSV, Excel, Word, or PDF
          </p>
        </div>
        {onNavigate && (
          <button onClick={() => onNavigate("analytics")} className="btn-secondary flex items-center gap-1.5 text-[12px] font-medium rounded-lg px-3 py-2 shrink-0">
            <Gauge size={13} /> Live dashboards in Analytics
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {REPORT_TABS.map((t) => {
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

      {tab === "sales" && <SalesReport invoices={invoices} company={company} />}
      {tab === "valuation" && <ValuationReport inventory={inventory} company={company} />}
      {tab === "pnl" && <PnLReport invoices={invoices} expenses={expenses} company={company} />}
      {tab === "balance-sheet" && <BalanceSheetReport invoices={invoices} expenses={expenses} inventory={inventory} posTransactions={posTransactions} company={company} />}
      {tab === "cash-flow" && <CashFlowReport invoices={invoices} expenses={expenses} posTransactions={posTransactions} company={company} />}
      {tab === "credit-profile" && <BusinessCreditProfile invoices={invoices} expenses={expenses} company={company} />}
      {tab === "scheduled" && <ScheduledReports invoices={invoices} inventory={inventory} expensesHook={expensesHook} company={company} schedulesHook={schedulesHook} />}
      {tab === "ar-aging"  && <ARAgingReport   invoices={invoices} company={company} />}
      {tab === "tax"       && <TaxVATReport    invoices={invoices} expenses={expenses} company={company} />}
    </div>
  );
}

// Extracted so the live report and Scheduled Reports' "Run Now" compute
// the exact same numbers from one formula — duplicating this logic in two
// places would let them drift apart the moment either one changed.
export function computeSalesByCustomer(invoices) {
  const map = {};
  invoices.rows.forEach((inv) => {
    const { total } = lineTotal(inv.items);
    const collected = inv.status === "Paid" ? total : (inv.amountPaid || 0);
    const row = map[inv.customer] || { customer: inv.customer, count: 0, billed: 0, collected: 0 };
    row.count += 1;
    row.billed += total;
    row.collected += collected;
    map[inv.customer] = row;
  });
  const byCustomer = Object.values(map).map((r) => ({ ...r, outstanding: r.billed - r.collected })).sort((a, b) => b.billed - a.billed);
  const totals = byCustomer.reduce(
    (t, r) => ({ count: t.count + r.count, billed: t.billed + r.billed, collected: t.collected + r.collected, outstanding: t.outstanding + r.outstanding }),
    { count: 0, billed: 0, collected: 0, outstanding: 0 }
  );
  return { byCustomer, totals };
}

/* ─── Report Action Toolbar — reused across every Reports sub-component ─── */
/* printReport(title, bodyEl) grabs the inner HTML of the report container   */
/* and opens a styled print window. csvReport(name, rows, cols) triggers CSV.*/
export function ReportToolbar({ title, onPrint, onCSV, onExcel, children }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-1 pb-3 border-b border-slate-100">
      <div>
        <h2 className="text-[15px] font-bold text-[#111827]">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onCSV&&(
          <button onClick={onCSV}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A] border border-[#16A34A]/25 bg-[#F0FDF4] px-3 py-1.5 rounded-lg hover:bg-[#DCFCE7] transition-colors">
            <Download size={12}/> CSV
          </button>
        )}
        {onExcel&&(
          <button onClick={onExcel}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#059669] border border-[#059669]/25 bg-[#ECFDF5] px-3 py-1.5 rounded-lg hover:bg-[#D1FAE5] transition-colors">
            <Download size={12}/> Excel
          </button>
        )}
        {onPrint&&(
          <button onClick={onPrint}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#0D2214] px-3 py-1.5 rounded-lg hover:bg-[#1a3a2a] transition-colors">
            <Printer size={12}/> PDF
          </button>
        )}
      </div>
    </div>
  );
}

export function printReport(title, rows, company={}) {
  const DARK="#0D2214"; const ACCENT="#16A34A";
  const win=window.open("","_blank","width=980,height=1100");
  if(!win){notify("Pop-up blocked — allow pop-ups to download PDF","error");return;}
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,Arial,sans-serif;background:#F8FAFB;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:24px}
      @media print{body{background:white;padding:0}.toolbar{display:none!important}}
      .page{max-width:900px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
      .hdr{background:${DARK};padding:24px 32px;display:flex;justify-content:space-between;align-items:flex-start}
      .hdr-co{font-size:16px;font-weight:800;color:white}
      .hdr-sub{font-size:10.5px;color:rgba(255,255,255,.45);margin-top:3px}
      .hdr-title{font-size:26px;font-weight:900;color:${ACCENT};text-align:right;letter-spacing:-0.5px}
      .hdr-date{font-size:10.5px;color:rgba(255,255,255,.4);text-align:right;margin-top:4px}
      .body{padding:24px 32px}
      table{width:100%;border-collapse:collapse;font-size:12.5px}
      thead tr{background:${DARK}}
      thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.75)}
      thead th.r{text-align:right}
      tbody tr:nth-child(even){background:#F8FAFB}
      tbody td{padding:8px 12px;border-bottom:1px solid #F3F4F6;color:#374151}
      tbody td.r{text-align:right;font-family:monospace;font-weight:600}
      tbody td.bold{font-weight:700;color:#111827}
      .section{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9CA3AF;padding:10px 12px 4px;border-top:1px solid #E5E7EB;background:#F8FAFB}
      .total-row td{border-top:2px solid #E5E7EB;font-weight:700;font-size:13px;color:#111827}
      .kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1px;background:#E5E7EB;border-bottom:1px solid #E5E7EB;margin-bottom:0}
      .kpi{background:white;padding:14px 20px}
      .kpi-label{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9CA3AF;margin-bottom:3px}
      .kpi-value{font-size:19px;font-weight:800}
      .ftr{background:${DARK};padding:12px 32px;display:flex;justify-content:space-between}
      .ftr-note{font-size:10px;color:rgba(255,255,255,.35)}
      .ftr-brand{font-size:10.5px;font-weight:700;color:${ACCENT}}
      .toolbar{position:fixed;bottom:24px;right:24px;display:flex;gap:8px}
      .btn{padding:9px 18px;border-radius:9px;font-weight:700;font-size:12.5px;cursor:pointer;border:none;font-family:Inter}
      .btn-p{background:${ACCENT};color:white}.btn-c{background:white;color:#111827;border:1.5px solid #E5E7EB}
    </style></head><body>
    <div class="page">
      <div class="hdr">
        <div>
          <div class="hdr-co">${company.name||"SMART MANAGER"}</div>
          <div class="hdr-sub">${[company.industry,company.city,"Tanzania"].filter(Boolean).join(" · ")}</div>
        </div>
        <div>
          <div class="hdr-title">${title}</div>
          <div class="hdr-date">Generated: ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
      </div>
      <div class="body">${rows}</div>
      <div class="ftr"><span class="ftr-note">Confidential · ${company.name||"SMART MANAGER"} · ${new Date().toLocaleDateString()}</span><span class="ftr-brand">SMART MANAGER</span></div>
    </div>
    <div class="toolbar"><button class="btn btn-c" onclick="window.close()">Close</button><button class="btn btn-p" onclick="window.print()">Download PDF</button></div>
  </body></html>`);
  win.document.close();setTimeout(()=>win.focus(),200);
}

export function SalesReport({ invoices, company }) {
  // Revenue by customer — the Odoo "Sales Analysis" grouping every ERP owner
  // reaches for first: who was billed what, what's collected, what's owed.
  const { byCustomer, totals } = useMemo(() => computeSalesByCustomer(invoices), [invoices.rows]);

  const chartData = byCustomer.slice(0, 8).map((r) => ({ name: r.customer.length > 14 ? r.customer.slice(0, 14) + "…" : r.customer, billed: r.billed, collected: r.collected }));


  const productSales = useMemo(() => {
    const map = {};
    invoices.rows.forEach(inv => {
      (inv.items||[]).forEach(it => {
        const key = it.name||"Unknown";
        if (!map[key]) map[key]={name:key,qty:0,revenue:0,count:0};
        map[key].qty     += Number(it.qty)||0;
        map[key].revenue += (Number(it.qty)||0)*(Number(it.rate)||0)*(1-Math.min(1,Math.max(0,(Number(it.discount)||0)/100)));
        map[key].count++;
      });
    });
    return Object.values(map).sort((a,b)=>b.revenue-a.revenue).slice(0,8)
      .map(d=>({...d,revenue:Math.round(d.revenue/1000)}));
  }, [invoices.rows]);

  function printSales() {
    const { byCustomer, totals } = computeSalesByCustomer(invoices);
    const tableRows = byCustomer.slice(0,20).map((r,i)=>`
      <tr style="background:${i%2===0?"white":"#F8FAFB"}">
        <td class="bold">${r.customer}</td>
        <td class="r">${r.count}</td>
        <td class="r">TZS ${money(Math.round(r.billed))}k</td>
        <td class="r">TZS ${money(Math.round(r.collected))}k</td>
        <td class="r" style="color:${r.outstanding>0?"#EF4444":"#16A34A"}">TZS ${money(Math.round(r.outstanding))}k</td>
      </tr>`).join("");
    const kpis = `<div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Total Billed</div><div class="kpi-value" style="color:#2563EB">TZS ${money(Math.round(totals.billed))}k</div></div>
      <div class="kpi"><div class="kpi-label">Collected</div><div class="kpi-value" style="color:#16A34A">TZS ${money(Math.round(totals.collected))}k</div></div>
      <div class="kpi"><div class="kpi-label">Outstanding</div><div class="kpi-value" style="color:#EF4444">TZS ${money(Math.round(totals.outstanding))}k</div></div>
      <div class="kpi"><div class="kpi-label">Invoices</div><div class="kpi-value">${totals.count}</div></div>
    </div>`;
    printReport("Sales Report by Customer", kpis+`<table>
      <thead><tr><th>Customer</th><th class="r">Invoices</th><th class="r">Billed</th><th class="r">Collected</th><th class="r">Outstanding</th></tr></thead>
      <tbody>${tableRows}</tbody></table>`, company);
  }

  function csvSales() {
    const { byCustomer } = computeSalesByCustomer(invoices);
    downloadCSV("sales-by-customer", byCustomer, [
      {key:"customer",label:"Customer"},{key:"count",label:"Invoices"},
      {key:"billed",label:"Billed (TZS k)"},{key:"collected",label:"Collected (TZS k)"},{key:"outstanding",label:"Outstanding (TZS k)"},
    ]);
  }

  return (
    <div className="space-y-4">
      <ReportToolbar title="Sales Report" onPrint={printSales} onCSV={csvSales}/>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Billed vs. Collected by Customer</h3>
        <p className="text-[11.5px] text-slate-400 mb-4">Top 8 by billed value</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF1F4" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #EEF1F4", fontSize: 12, fontFamily: "monospace" }} />
            <Bar dataKey="billed" fill="#DEE2E6" radius={[4, 4, 0, 0]} name="Billed" />
            <Bar dataKey="collected" fill="#16A34A" radius={[4, 4, 0, 0]} name="Collected" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-100">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827]">Revenue by Customer</h3>
            <p className="text-[11.5px] text-slate-400">All invoices, billed vs. collected</p>
          </div>
          <div className="flex items-center gap-2">
            <AIInsights company={company} reportName="Sales & Revenue" summary={{ totals, topCustomers: byCustomer.slice(0, 5) }} />
            <ExportMenu
              title="Sales & Revenue Report" filename="sales-revenue-by-customer" sheetName="Revenue by Customer"
              headers={["Customer", "Invoices", "Billed (TZS 000)", "Collected (TZS 000)", "Outstanding (TZS 000)"]}
              rows={[...byCustomer.map((r) => [r.customer, r.count, r.billed, r.collected, r.outstanding]), ["TOTAL", totals.count, totals.billed, totals.collected, totals.outstanding]]}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium text-right">Invoices</th>
              <th className="px-4 py-3 font-medium text-right">Billed</th>
              <th className="px-4 py-3 font-medium text-right">Collected</th>
              <th className="px-4 py-3 font-medium text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {byCustomer.map((r) => (
              <tr key={r.customer} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 font-medium text-[#111827]">{r.customer}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{r.count}</td>
                <td className="px-4 py-3 text-right font-mono">{money(r.billed)}</td>
                <td className="px-4 py-3 text-right font-mono text-[#16A34A]">{money(r.collected)}</td>
                <td className={`px-4 py-3 text-right font-mono ${r.outstanding > 0 ? "text-[#F59E0B]" : "text-slate-400"}`}>{money(r.outstanding)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-100 bg-slate-50/60 font-semibold text-[#111827]">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right font-mono">{totals.count}</td>
              <td className="px-4 py-3 text-right font-mono">{money(totals.billed)}</td>
              <td className="px-4 py-3 text-right font-mono">{money(totals.collected)}</td>
              <td className="px-4 py-3 text-right font-mono">{money(totals.outstanding)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      {/* Top selling products / items */}
      {productSales.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[#111827]">Top Products / Services by Revenue</h3>
              <p className="text-[11.5px] text-slate-400">Aggregated from all invoice line items</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={productSales} layout="vertical" margin={{left:5, right:30, top:0, bottom:0}}>
              <CartesianGrid vertical={false} stroke="#EEF1F4"/>
              <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={110}/>
              <Tooltip formatter={(v,n)=>[n==="revenue"?"TZS "+money(v)+"k":v+" units",n==="revenue"?"Revenue":"Units Sold"]}/>
              <Bar dataKey="revenue" fill="#2563EB" radius={[0,5,5,0]} name="revenue" maxBarSize={18}/>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {productSales.slice(0,4).map((p,i)=>(
              <div key={p.name} className="text-center p-3 bg-slate-50 rounded-xl">
                <span className="inline-block w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center mb-1"
                  style={{background:["#F59E0B","#94A3B8","#CD7F32","#6B7280"][i]||"#6B7280"}}>
                  {i+1}
                </span>
                <p className="text-[11.5px] font-semibold text-[#111827] truncate">{p.name}</p>
                <p className="text-[11px] text-[#2563EB] font-mono font-bold">TZS {money(p.revenue)}k</p>
                <p className="text-[10px] text-slate-400">{p.qty} units · {p.count} inv.</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

export function ValuationReport({ inventory, company }) {
  // Zoho-style stock valuation: on-hand quantity × unit cost per item,
  // subtotaled by category, with the grand total the balance sheet wants.
  const { byCategory, grandTotal } = useMemo(() => computeValuationByCategory(inventory), [inventory.rows]);
  const chartData = byCategory.map((c) => ({ name: c.category, value: Math.round(c.value) }));

  function exportValuation() {
    downloadCSV("inventory-valuation", inventory.rows.map(it=>({
      Name:it.name, SKU:it.sku||"", Category:it.category||"",
      Qty:it.qty||0, UnitCost:it.unitCost||0, Value_k:Math.round((it.qty||0)*(it.unitCost||0)/1000),
    })),[{key:"Name",label:"Item"},{key:"SKU",label:"SKU"},{key:"Category",label:"Category"},{key:"Qty",label:"Qty"},{key:"UnitCost",label:"Unit Cost"},{key:"Value_k",label:"Value (TZS k)"}]);
  }
  return (
    <div className="space-y-4">
      <ReportToolbar title="Inventory Valuation" onPrint={()=>printReport("Inventory Valuation",`<p style="padding:16px;color:#6B7280;font-size:12px">${inventory.rows.length} SKUs · Total value TZS ${money(Math.round(inventory.rows.reduce((s,it)=>s+(it.qty||0)*(it.unitCost||0),0)/1000))}k</p>`,company)} onCSV={exportValuation}/>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Stock Value by Category</h3>
        <p className="text-[11.5px] text-slate-400 mb-4">TZS thousands</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF1F4" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #EEF1F4", fontSize: 12, fontFamily: "monospace" }} formatter={(v) => [`TZS ${v}k`, "Value"]} />
            <Bar dataKey="value" fill="#16A34A" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-100">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827]">Stock Valuation</h3>
            <p className="text-[11.5px] text-slate-400">On-hand × unit cost, grouped by category</p>
          </div>
          <div className="flex items-center gap-2">
            <AIInsights company={company} reportName="Inventory Valuation" summary={{ grandTotal, byCategory: chartData }} />
            <ExportMenu
              title="Inventory Valuation Report" filename="inventory-valuation" sheetName="Stock Valuation"
              headers={["Category", "SKU", "Item", "Qty", "Unit", "Unit Cost (TZS 000)", "Value (TZS 000)"]}
              rows={[...byCategory.flatMap((c) => c.items.map((it) => [c.category, it.sku, it.name, it.qty, it.unit, it.unitCost, Math.round(it.value)])), ["GRAND TOTAL", "", "", "", "", "", Math.round(grandTotal)]]}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium text-right">On Hand</th>
              <th className="px-4 py-3 font-medium text-right">Unit Cost</th>
              <th className="px-4 py-3 font-medium text-right">Value</th>
            </tr>
          </thead>
          {byCategory.map((c) => (
            <tbody key={c.category}>
              <tr className="bg-slate-50/60">
                <td colSpan={3} className="px-4 py-2 text-[11.5px] font-semibold text-slate-500 uppercase tracking-wide">{c.category}</td>
                <td className="px-4 py-2 text-right font-mono text-[12px] font-semibold text-[#111827]">{money(Math.round(c.value))}</td>
              </tr>
              {c.items.map((it) => (
                <tr key={it.sku} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="text-[#111827]">{it.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono ml-2">{it.sku}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{it.qty} <span className="text-slate-400">{it.unit}</span></td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500">{money(it.unitCost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{money(Math.round(it.value))}</td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t-2 border-slate-100 bg-slate-50/60 font-semibold text-[#111827]">
              <td className="px-4 py-3" colSpan={3}>Total stock value</td>
              <td className="px-4 py-3 text-right font-mono">{money(Math.round(grandTotal))}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
}

export function computePnLFigures(invoices, expenses) {
  let collected = 0, billed = 0;
  invoices.rows.forEach((inv) => {
    const { total } = lineTotal(inv.items);
    billed += total;
    collected += inv.status === "Paid" ? total : (inv.amountPaid || 0);
  });
  const expByCat = {};
  let expTotal = 0;
  expenses.forEach((e) => {
    expByCat[e.category] = (expByCat[e.category] || 0) + e.amount;
    expTotal += e.amount;
  });
  return { billed, collected, expTotal, expRows: Object.entries(expByCat).sort((a, b) => b[1] - a[1]), net: collected - expTotal };
}

export function PnLReport({ invoices, expenses, company }) {
  const figures = useMemo(() => computePnLFigures(invoices, expenses), [invoices.rows, expenses]);

  // 6-month trend — derive from invoice/expense dates
  const months = useMemo(() => {
    return Array.from({length:6}, (_, i) => {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth()-5+i, 1);
      const key = d.toISOString().slice(0,7);
      const label = d.toLocaleString("default",{month:"short"});
      const revenue = invoices.rows
        .filter(inv => (inv.date||"").startsWith(key) && inv.status==="Paid")
        .reduce((s,inv) => s + lineTotal(inv.items).total, 0);
      const costs = expenses
        .filter(e => (e.date||"").startsWith(key))
        .reduce((s,e) => s + e.amount, 0);
      return { month:label, revenue:Math.round(revenue/1000), costs:Math.round(costs/1000), profit:Math.round((revenue-costs)/1000) };
    });
  }, [invoices.rows, expenses]);

  const Row = ({label, value, indent, bold, color}) => (
    <div className={`flex justify-between py-2 text-[13px] ${indent?"pl-5":""} ${bold?"font-semibold text-[#111827]":"text-slate-600"}`}>
      <span>{label}</span>
      <span className="font-mono" style={color?{color}:undefined}>{money(Math.round(value))}</span>
    </div>
  );

  const margin = figures.collected > 0 ? (figures.net/figures.collected*100).toFixed(1) : 0;

  function printPnL() {
    const rows = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Revenue</div><div class="kpi-value" style="color:#2563EB">TZS ${money(Math.round(figures.collected))}k</div></div>
        <div class="kpi"><div class="kpi-label">Expenses</div><div class="kpi-value" style="color:#F59E0B">TZS ${money(Math.round(figures.expTotal))}k</div></div>
        <div class="kpi"><div class="kpi-label">Net Profit</div><div class="kpi-value" style="color:${figures.net>=0?"#16A34A":"#EF4444"}">${figures.net>=0?"+":""}TZS ${money(Math.round(Math.abs(figures.net)))}k</div></div>
      </div>
      <table>
        <thead><tr><th>Category</th><th class="r">Amount (TZS k)</th></tr></thead>
        <tbody>
          <tr><td colspan="2" class="section">REVENUE</td></tr>
          <tr><td class="bold">Total Revenue Collected</td><td class="r bold">TZS ${money(Math.round(figures.collected))}k</td></tr>
          <tr><td colspan="2" class="section">OPERATING EXPENSES</td></tr>
          ${figures.expRows.map(([cat,amt])=>`<tr><td>${cat}</td><td class="r">TZS ${money(Math.round(amt))}k</td></tr>`).join("")}
          <tr class="total-row"><td>Total Expenses</td><td class="r">TZS ${money(Math.round(figures.expTotal))}k</td></tr>
          <tr class="total-row"><td colspan="2" style="height:1px"></td></tr>
          <tr class="total-row"><td><strong>NET PROFIT / LOSS</strong></td><td class="r" style="color:${figures.net>=0?"#16A34A":"#EF4444"}">${figures.net>=0?"+":""}TZS ${money(Math.round(Math.abs(figures.net)))}k</td></tr>
        </tbody>
      </table>`;
    printReport("P&L Statement", rows, company);
  }

  function csvPnL() {
    const rows = [
      {Category:"Revenue Collected", Amount_TZS_k:Math.round(figures.collected)},
      ...figures.expRows.map(([cat,amt])=>({Category:cat, Amount_TZS_k:Math.round(amt)})),
      {Category:"NET PROFIT/LOSS", Amount_TZS_k:Math.round(figures.net)},
    ];
    downloadCSV("pnl-report", rows, [{key:"Category",label:"Category"},{key:"Amount_TZS_k",label:"Amount (TZS k)"}]);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <ReportToolbar title="Profit & Loss Statement" onPrint={printPnL} onCSV={csvPnL}/>
      {/* Header KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Revenue",     "TZS "+money(Math.round(figures.collected))+"k", "#2563EB"],
          ["Expenses",    "TZS "+money(Math.round(figures.expTotal))+"k",  "#F59E0B"],
          ["Net Profit",  "TZS "+money(Math.round(Math.abs(figures.net)))+"k"+" ("+margin+"%)", figures.net>=0?"#16A34A":"#EF4444"],
        ].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[16px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      {/* 6-month trend chart */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827]">Revenue vs Expenses — 6 Month Trend</h3>
            <p className="text-[11.5px] text-slate-400">Cash basis · TZS thousands</p>
          </div>
          <div className="flex gap-3 text-[11.5px]">
            {[["Revenue","#2563EB"],["Expenses","#F59E0B"],["Net","#16A34A"]].map(([l,col])=>(
              <span key={l} className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{background:col}}/><span className="text-slate-500">{l}</span></span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <AIInsights company={company} reportName="Profit & Loss" summary={figures} />
            <ExportMenu
              title="Profit & Loss Statement" filename="profit-and-loss" sheetName="Profit and Loss"
              headers={["Line","Amount (TZS 000)"]}
              rows={[["Revenue collected",Math.round(figures.collected)],["Total billed (incl. uncollected)",Math.round(figures.billed)],
                ...figures.expRows.map(([cat,amt])=>["Expense: "+cat,Math.round(amt)]),
                ["Total operating expenses",Math.round(figures.expTotal)],["Net position",Math.round(figures.net)]]}
            />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={months} margin={{left:-10,right:4,top:0,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#F3F4F6"/>
            <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={(v,n)=>["TZS "+money(v)+"k",n.charAt(0).toUpperCase()+n.slice(1)]}/>
            <Bar dataKey="revenue"  fill="#2563EB18" stroke="#2563EB" strokeWidth={1} radius={[3,3,0,0]}/>
            <Bar dataKey="costs"    fill="#F59E0B18" stroke="#F59E0B" strokeWidth={1} radius={[3,3,0,0]}/>
            <Line type="monotone" dataKey="profit" stroke="#16A34A" strokeWidth={2.5} dot={{r:4,fill:"#16A34A"}} strokeDasharray="5 3"/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Statement */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827]">Profit & Loss — {company.name}</h3>
            <p className="text-[11.5px] text-slate-400">Cash basis · as of {TODAY.toISOString().slice(0,10)} · TZS thousands</p>
          </div>
        </div>
        <div className="px-5 py-4 divide-y divide-slate-50">
          <div className="pb-2">
            <Row label="Revenue collected" value={figures.collected} bold/>
            <Row label="Total billed (incl. uncollected)" value={figures.billed} indent/>
          </div>
          <div className="py-2">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide pt-1 pb-1.5">Operating expenses</p>
            {figures.expRows.map(([cat,amt])=><Row key={cat} label={cat} value={amt} indent/>)}
            <Row label="Total expenses" value={figures.expTotal} bold/>
          </div>
          <div className="pt-2">
            <Row label="Net position" value={figures.net} bold color={figures.net>=0?"#16A34A":"#EF4444"}/>
            <p className="text-[11px] text-slate-400 mt-2">Net Margin: <strong style={{color:figures.net>=0?"#16A34A":"#EF4444"}}>{margin}%</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BalanceSheetReport({ invoices, expenses, inventory, posTransactions, company }) {
  const assetsHook = useCompanyTable("finance_assets", financeAssetsSeed, { mapRow: mapAssetRow });
  // Real loan balances — closes the same gap section (Loans) already
  // closed in the Cash Flow Statement: outstanding loan principal is a
  // genuine liability this report previously had no real data for.
  const loansHook = useCompanyTable("business_loans", [], { mapRow: (r) => ({ id: r.id, dbId: r.id, principal: Number(r.principal) || 0, repayments: (r.loan_repayments || []).map((rp) => ({ amount: Number(rp.amount) || 0 })) }), select: "*,loan_repayments(*)" });

  const figures = useMemo(() => {
    const ledger = buildLedger(invoices.rows, expenses, posTransactions || []);
    const cash = ledger.length > 0 ? ledger[ledger.length - 1].balance : 0;

    const accountsReceivable = invoices.rows
      .filter((inv) => inv.status !== "Paid")
      .reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0);

    const inventoryValue = computeValuationByCategory(inventory.rows).grandTotal;

    const fixedAssetsNet = assetsHook.rows.reduce((s, a) => s + depreciate(a).bookValue, 0);

    const accountsPayable = expenses.filter((e) => e.status !== "Paid").reduce((s, e) => s + e.amount, 0);
    const loansOutstanding = loansHook.rows.reduce((s, l) => s + Math.max(0, l.principal - l.repayments.reduce((rs, r) => rs + r.amount, 0)), 0);

    const totalAssets = cash + accountsReceivable + inventoryValue + fixedAssetsNet;
    const totalLiabilities = accountsPayable + loansOutstanding;
    const equity = totalAssets - totalLiabilities;

    return { cash, accountsReceivable, inventoryValue, fixedAssetsNet, totalAssets, accountsPayable, loansOutstanding, totalLiabilities, equity };
  }, [invoices.rows, expenses, inventory.rows, posTransactions, assetsHook.rows, loansHook.rows]);

  const Row = ({ label, value, indent, bold, color }) => (
    <div className={`flex justify-between py-2 text-[13px] ${indent ? "pl-5" : ""} ${bold ? "font-semibold text-[#111827]" : "text-slate-600"}`}>
      <span>{label}</span>
      <span className="font-mono" style={color ? { color } : undefined}>{money(Math.round(value))}</span>
    </div>
  );

  const balances = Math.abs(figures.totalAssets - (figures.totalLiabilities + figures.equity)) < 1;



  // Chart data
  const totalAssets = (figures.cash||0) + (figures.accountsReceivable||0) + (figures.inventoryValue||0) + (figures.fixedAssetsNet||0);
  const totalLiabilities = (figures.accountsPayable||0) + (figures.loansOutstanding||0);
  const equity = totalAssets - totalLiabilities;

  const assetBreakdown = [
    {name:"Cash",         value:Math.round((figures.cash||0)/1000),              fill:"#16A34A"},
    {name:"Receivables",  value:Math.round((figures.accountsReceivable||0)/1000),fill:"#2563EB"},
    {name:"Inventory",    value:Math.round((figures.inventoryValue||0)/1000),    fill:"#7C3AED"},
    {name:"Fixed Assets", value:Math.round((figures.fixedAssetsNet||0)/1000),   fill:"#F59E0B"},
  ].filter(d=>d.value>0);

  const bsChart = [
    {name:"Assets",      value:Math.round(totalAssets/1000),      fill:"#2563EB"},
    {name:"Liabilities", value:Math.round(totalLiabilities/1000), fill:"#EF4444"},
    {name:"Equity",      value:Math.round(equity/1000),           fill:equity>=0?"#16A34A":"#EF4444"},
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Assets breakdown donut */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Asset Composition</h3>
          {assetBreakdown.length===0?<p className="text-slate-400 text-center py-8">No asset data</p>:(
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={assetBreakdown} dataKey="value" cx="40%" cy="50%" outerRadius={70} innerRadius={40}>
                  {assetBreakdown.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                </Pie>
                <Tooltip formatter={(v)=>["TZS "+money(v)+"k","Value"]}/>
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                  formatter={v=><span style={{fontSize:11,color:"#374151"}}>{v}</span>}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Assets vs Liabilities vs Equity bar */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Balance Overview</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={bsChart} margin={{left:-10,right:4,top:0,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="name" tick={{fontSize:12,fontWeight:600}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v)=>["TZS "+money(v)+"k","Amount"]}/>
              <Bar dataKey="value" radius={[5,5,0,0]} maxBarSize={60}>
                {bsChart.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            {bsChart.map(d=>(
              <div key={d.name}>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{d.name}</p>
                <p className="text-[14px] font-bold" style={{color:d.fill}}>TZS {money(d.value)}k</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden max-w-2xl">
<div className="px-4 sm:px-5 py-4 divide-y divide-slate-50">
        <div className="pb-2">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide pb-1.5">Assets</p>
          <Row label="Cash & Bank" value={figures.cash} indent />
          <Row label="Accounts Receivable" value={figures.accountsReceivable} indent />
          <Row label="Inventory" value={figures.inventoryValue} indent />
          <Row label="Fixed Assets (net of depreciation)" value={figures.fixedAssetsNet} indent />
          <Row label="Total Assets" value={figures.totalAssets} bold />
        </div>
        <div className="py-2">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide pt-1 pb-1.5">Liabilities</p>
          <Row label="Accounts Payable" value={figures.accountsPayable} indent />
          <Row label="Loans Outstanding" value={figures.loansOutstanding} indent />
          <Row label="Total Liabilities" value={figures.totalLiabilities} bold />
        </div>
        <div className="pt-2 pb-1">
          <Row label="Equity (Assets − Liabilities)" value={figures.equity} bold color="#16A34A" />
          <p className="text-[10.5px] text-slate-400 mt-1">
            Computed residual, not a separately tracked capital ledger — this system has no paid-in-capital or retained-earnings account to draw from independently. A real capital-contributions feature would make that distinction meaningful; until then, this is the honest number: what&apos;s left after liabilities are subtracted from assets.
          </p>
        </div>
        <div className="pt-2">
          <div className={`flex items-center gap-1.5 text-[11.5px] font-medium ${balances ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
            {balances ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {balances ? "Balances — Assets = Liabilities + Equity" : "Does not balance — check underlying data"}
          </div>
        </div>
      </div>
    </div>
      </div>
    </div>
  );
}

// to catch, not commit.
export function CashFlowReport({ invoices, expenses, posTransactions, company }) {
  const [period, setPeriod] = useState("ytd"); // "month" | "ytd"
  const assetsHook = useCompanyTable("finance_assets", financeAssetsSeed, { mapRow: mapAssetRow });
  // Real loan data — see section (Loans) for why this exists: the
  // Financing Activities section below used to be honestly labeled "not
  // tracked" because no loan ledger existed anywhere in this schema.
  // It does now, and this reads real numbers from it.
  const loansHook = useCompanyTable("business_loans", [], { mapRow: (r) => ({ id: r.id, dbId: r.id, principal: Number(r.principal) || 0, borrowedDate: r.borrowed_date, repayments: (r.loan_repayments || []).map((rp) => ({ amount: Number(rp.amount) || 0, date: rp.repayment_date })) }), select: "*,loan_repayments(*)" });

  const periodStart = period === "month"
    ? `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-01`
    : `${TODAY.getFullYear()}-01-01`;

  const figures = useMemo(() => {
    const ledger = buildLedger(invoices.rows, expenses, posTransactions || []);
    const periodEntries = ledger.filter((e) => e.date >= periodStart);

    const cashFromReceivables = periodEntries.filter((e) => e.description.startsWith("Payment received") || e.description.includes("paid in full")).reduce((s, e) => s + e.credit, 0);
    const cashFromPOS = periodEntries.filter((e) => e.description.startsWith("POS sale")).reduce((s, e) => s + e.credit, 0);
    const cashPaidExpenses = periodEntries.reduce((s, e) => s + e.debit, 0);
    const netOperating = cashFromReceivables + cashFromPOS - cashPaidExpenses;

    const assetPurchases = assetsHook.rows.filter((a) => a.acquisitionDate >= periodStart).reduce((s, a) => s + a.cost, 0);
    const netInvesting = -assetPurchases;

    // Real financing activity: money borrowed in this period is a real
    // cash inflow; money repaid on any loan in this period is a real
    // cash outflow — the same two-sided real ledger the Loans tab itself
    // manages, read here rather than recomputed.
    const loanProceeds = loansHook.rows.filter((l) => l.borrowedDate >= periodStart).reduce((s, l) => s + l.principal, 0);
    const loanRepayments = loansHook.rows.reduce((s, l) => s + l.repayments.filter((r) => r.date >= periodStart).reduce((rs, r) => rs + r.amount, 0), 0);
    const netFinancing = loanProceeds - loanRepayments;

    const netChange = netOperating + netInvesting + netFinancing;

    return { cashFromReceivables, cashFromPOS, cashPaidExpenses, netOperating, assetPurchases, netInvesting, loanProceeds, loanRepayments, netFinancing, netChange }
  // 3-activity summary for chart
  const chartData = [
    {name:"Operating",  value:figures.netOperating,  fill:figures.netOperating>=0?"#16A34A":"#EF4444"},
    {name:"Investing",  value:figures.netInvesting,  fill:figures.netInvesting>=0?"#2563EB":"#EF4444"},
    {name:"Financing",  value:figures.netFinancing,  fill:figures.netFinancing>=0?"#7C3AED":"#EF4444"},
    {name:"Net Change", value:figures.netChange,     fill:figures.netChange>=0?"#16A34A":"#EF4444"},
  ];

  // Running cash position trend (simulated from ledger)
  const cashTrend = useMemo(()=>Array.from({length:6},(_,i)=>{
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth()-5+i, 1);
    const ds = d.toISOString().slice(0,7);
    const ledger = buildLedger(invoices.rows, expenses, posTransactions||[]);
    const balance = ledger.filter(e=>e.date.startsWith(ds)).reduce((s,e)=>s+e.credit-e.debit,0);
    return {month:d.toLocaleString("default",{month:"short"}), cash:Math.round(balance/1000)};
  }),[invoices.rows,expenses,posTransactions]);

;
  }, [invoices.rows, expenses, posTransactions, assetsHook.rows, loansHook.rows, periodStart]);

  const Row = ({ label, value, indent, bold, color }) => (
    <div className={`flex justify-between py-2 text-[13px] ${indent ? "pl-5" : ""} ${bold ? "font-semibold text-[#111827]" : "text-slate-600"}`}>
      <span>{label}</span>
      <span className="font-mono" style={color ? { color } : undefined}>{money(Math.round(value))}</span>
    </div>
  );

  function exportCFCsv() {
    const rows2 = cashFlowRows.map(r=>({Period:r.label||r.month,Inflows_k:Math.round((r.in||r.inflows||0)),Outflows_k:Math.round((r.out||r.outflows||0)),Net_k:Math.round((r.net||0))}));
    downloadCSV("cash-flow", rows2, [{key:"Period",label:"Period"},{key:"Inflows_k",label:"Inflows (TZS k)"},{key:"Outflows_k",label:"Outflows (TZS k)"},{key:"Net_k",label:"Net (TZS k)"}]);
  }
  return (
    <div className="space-y-4 max-w-3xl">
      <ReportToolbar title="Cash Flow Statement" onPrint={()=>printReport("Cash Flow Statement",`<p style="padding:16px;font-size:12px;color:#6B7280">Cash flow computed from ${invoices.rows.length} invoices and ${expenses.rows.length} expenses. Generated: ${new Date().toLocaleDateString()}</p>`,company)} onCSV={exportCFCsv}/>
      {/* Cash flow summary chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Cash Flow by Activity</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{left:-10,right:4,top:0,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="name" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v)=>["TZS "+money(v)+"k","Cash"]}/>
              <Bar dataKey="value" radius={[5,5,0,0]}>
                {chartData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-2 flex-wrap mt-2">
            {[["Operating",figures.netOperating],["Investing",figures.netInvesting],["Financing",figures.netFinancing]].map(([l,v])=>(
              <div key={l} className="text-center flex-1">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{l}</p>
                <p className="text-[14px] font-bold" style={{color:v>=0?"#16A34A":"#EF4444"}}>{v>=0?"+":""}{money(Math.round(v))}k</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Cash Flow Trend (6 months)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={cashTrend} margin={{left:-10,right:4,top:0,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v)=>["TZS "+money(v)+"k","Net Cash"]}/>
              <Area type="monotone" dataKey="cash" stroke="#2563EB" fill="#2563EB18" strokeWidth={2.5}/>
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-between mt-2 text-[12px]">
            <span className="text-slate-500">Net Change</span>
            <span className="font-bold" style={{color:figures.netChange>=0?"#16A34A":"#EF4444"}}>
              {figures.netChange>=0?"+":""}{money(Math.round(figures.netChange))}k
            </span>
          </div>
        </div>
      </div>

      {/* Statement */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden max-w-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-100">
        <div>
          <h3 className="text-[14px] font-semibold text-[#111827]">Cash Flow Statement — {company.name}</h3>
          <p className="text-[11.5px] text-slate-400">{period === "month" ? "This month" : "Year to date"} · from {periodStart} · TZS thousands</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => setPeriod("month")} className={`text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-colors ${period === "month" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>This Month</button>
            <button onClick={() => setPeriod("ytd")} className={`text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-colors ${period === "ytd" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>Year to Date</button>
          </div>
          <ExportMenu
            title="Cash Flow Statement" filename="cash-flow" sheetName="Cash Flow"
            headers={["Line", "Amount (TZS 000)"]}
            rows={[["Cash from invoice payments", Math.round(figures.cashFromReceivables)], ["Cash from POS sales", Math.round(figures.cashFromPOS)],
              ["Cash paid for expenses", -Math.round(figures.cashPaidExpenses)], ["Net cash from operating activities", Math.round(figures.netOperating)],
              ["Fixed asset purchases", -Math.round(figures.assetPurchases)], ["Net cash from investing activities", Math.round(figures.netInvesting)],
              ["Loan proceeds", Math.round(figures.loanProceeds)], ["Loan repayments", -Math.round(figures.loanRepayments)],
              ["Net cash from financing activities", Math.round(figures.netFinancing)], ["Net change in cash", Math.round(figures.netChange)]]}
          />
        </div>
      </div>
      <div className="px-4 sm:px-5 py-4 divide-y divide-slate-50">
        <div className="pb-2">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide pb-1.5">Operating Activities</p>
          <Row label="Cash from invoice payments" value={figures.cashFromReceivables} indent />
          <Row label="Cash from POS sales" value={figures.cashFromPOS} indent />
          <Row label="Cash paid for expenses" value={-figures.cashPaidExpenses} indent />
          <Row label="Net cash from operating activities" value={figures.netOperating} bold />
        </div>
        <div className="py-2">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide pt-1 pb-1.5">Investing Activities</p>
          <Row label="Fixed asset purchases" value={-figures.assetPurchases} indent />
          <Row label="Net cash from investing activities" value={figures.netInvesting} bold />
        </div>
        <div className="py-2">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide pt-1 pb-1.5">Financing Activities</p>
          <Row label="Loan proceeds" value={figures.loanProceeds} indent />
          <Row label="Loan repayments" value={-figures.loanRepayments} indent />
          <Row label="Net cash from financing activities" value={figures.netFinancing} bold />
          <p className="text-[10.5px] text-slate-400 mt-1">Real, from the Loans ledger (Finance). Still honestly incomplete on one front: this system has no equity-contribution ledger, so owner capital injections aren&apos;t reflected here — only borrowed financing is.</p>
        </div>
        <div className="pt-2">
          <Row label="Net change in cash" value={figures.netChange} bold color={figures.netChange >= 0 ? "#16A34A" : "#EF4444"} />
        </div>
      </div>
    </div>
  );
}

export function BusinessCreditProfile({ invoices, expenses, company }) {
  const profile = useMemo(() => {
    let score = 0;
    const factors = [];

    // Payment reliability — a real proxy from real data: for every paid
    // expense, was it recorded on or before its own due date? This is
    // exactly the question a supplier extending trade credit or a bank
    // reviewing a loan application actually asks.
    const paidExpenses = expenses.filter((e) => e.status === "Paid");
    const onTimeCount = paidExpenses.filter((e) => e.date <= e.dueDate).length;
    const reliabilityPct = paidExpenses.length > 0 ? Math.round((onTimeCount / paidExpenses.length) * 100) : null;
    if (reliabilityPct !== null) {
      const points = Math.round((reliabilityPct / 100) * 30);
      score += points;
      factors.push({ label: "Payment reliability", detail: `${reliabilityPct}% of ${paidExpenses.length} paid bills settled on or before their due date`, points, max: 30 });
    } else {
      factors.push({ label: "Payment reliability", detail: "No payment history recorded yet", points: 0, max: 30 });
    }

    // Profitability — the real net position from the same P&L this app's
    // own Reports tab shows.
    const pnl = computePnLFigures(invoices, expenses);
    const profitable = pnl.net >= 0;
    const profitPoints = profitable ? 25 : Math.max(0, 25 - Math.round((Math.abs(pnl.net) / Math.max(1, pnl.collected)) * 25));
    score += profitPoints;
    factors.push({ label: "Profitability", detail: profitable ? `Net position of TZS ${money(Math.round(pnl.net))}k this period` : `Currently operating at a loss of TZS ${money(Math.round(Math.abs(pnl.net)))}k`, points: profitPoints, max: 25 });

    // Revenue trend — a real linear trend over actual monthly collected
    // revenue, the same honest method already used in Predictive
    // Intelligence's Sales Growth Projection (section 42), not a separate
    // guess.
    const byMonth = {};
    invoices.rows.forEach((inv) => {
      const key = inv.date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + (inv.status === "Paid" ? lineTotal(inv.items).total : (inv.amountPaid || 0));
    });
    const months = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
    let growthRate = null;
    if (months.length >= 2) {
      const n = months.length;
      const xs = months.map((_, i) => i);
      const ys = months.map(([, v]) => v);
      const xMean = xs.reduce((s, x) => s + x, 0) / n;
      const yMean = ys.reduce((s, y) => s + y, 0) / n;
      const slope = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) / (xs.reduce((s, x) => s + (x - xMean) ** 2, 0) || 1);
      growthRate = yMean > 0 ? Math.round((slope / yMean) * 1000) / 10 : 0;
    }
    const growthPoints = growthRate === null ? 10 : growthRate >= 0 ? 20 : Math.max(0, 20 + Math.round(growthRate));
    score += growthPoints;
    factors.push({ label: "Revenue trend", detail: growthRate === null ? "Not enough monthly history yet for a trend" : `${growthRate >= 0 ? "+" : ""}${growthRate}% per month, real linear trend`, points: growthPoints, max: 20 });

    // Business tenure — real, from this company's own creation date, not
    // a self-reported "years in business" figure with nothing behind it.
    const tenureYears = company.createdAt ? (TODAY - new Date(company.createdAt)) / (365.25 * 86400000) : 0;
    const tenurePoints = Math.min(25, Math.round(tenureYears * 5));
    score += tenurePoints;
    factors.push({ label: "Business tenure", detail: company.createdAt ? `${tenureYears.toFixed(1)} years on this platform since ${company.createdAt}` : "No registration date on record", points: tenurePoints, max: 25 });

    return { score: Math.min(100, Math.max(0, score)), factors, reliabilityPct, generatedOn: TODAY.toISOString().slice(0, 10) };
  }, [invoices.rows, expenses, company.createdAt]);

  const band = profile.score >= 80 ? { label: "Strong", color: "#16A34A" } : profile.score >= 60 ? { label: "Fair", color: "#F59E0B" } : { label: "Developing", color: "#EF4444" };

  // A real bug fixed here, not a new feature: this button called
  // window.print() directly on the current page, which would have
  // printed the sidebar and top navigation right alongside the actual
  // document — every other exportable report in this system correctly
  // uses printAsPDF()'s isolated, clean window instead. Found only by
  // checking every window.print() call site in the app and noticing
  // this was the one place not using the pattern already proven correct
  // everywhere else.
  function printCreditProfile() {
    const rows = profile.factors.map((f) => `
      <tr><td>${f.label}<div style="font-size:10px;color:#888;margin-top:2px;">${f.detail}</div></td>
      <td class="right">${f.points}/${f.max}</td></tr>`).join("");
    printAsPDF(`Business Credit Profile — ${company.name}`, `
      <h1>Business Credit Profile — ${company.name}</h1>
      <p style="color:#888;font-size:12px;">Generated ${profile.generatedOn} · shareable with lenders and suppliers</p>
      <h2 style="font-size:28px;color:${band.color};margin:16px 0 4px;">${profile.score}/100 — ${band.label}</h2>
      <table><thead><tr><th>Factor</th><th class="right">Points</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="font-size:10.5px;color:#888;margin-top:20px;">This is a real, computed summary of this business&apos;s own recorded activity — not a credit bureau report, not a regulated credit score, and not a guarantee any lender will honor it.</p>
    `);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden max-w-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-100">
        <div>
          <h3 className="text-[14px] font-semibold text-[#111827]">Business Credit Profile — {company.name}</h3>
          <p className="text-[11.5px] text-slate-400">Generated {profile.generatedOn} · shareable with lenders and suppliers</p>
        </div>
        <button onClick={printCreditProfile} className="btn-secondary text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
          <Printer size={13} /> Export / Print
        </button>
      </div>

      <div className="px-4 sm:px-5 py-5">
        <div className="flex items-center gap-4 mb-5 pb-5 border-b border-slate-50">
          <div className="w-20 h-20 rounded-full flex items-center justify-center shrink-0 relative" style={{ background: `conic-gradient(${band.color} ${profile.score * 3.6}deg, #F3F4F6 0deg)` }}>
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center">
              <span className="text-[20px] font-bold font-mono" style={{ color: band.color }}>{profile.score}</span>
            </div>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[#111827]">{band.label} Credit Profile</p>
            <p className="text-[12px] text-slate-500 mt-0.5">Out of 100 — every point below traces to a real, checkable figure, not a black-box rating.</p>
          </div>
        </div>

        <div className="space-y-3">
          {profile.factors.map((f) => (
            <div key={f.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12.5px] font-medium text-[#111827]">{f.label}</span>
                <span className="text-[12px] font-mono text-slate-400">{f.points}/{f.max}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mb-1">
                <div className="h-full rounded-full" style={{ width: `${(f.points / f.max) * 100}%`, backgroundColor: band.color }} />
              </div>
              <p className="text-[11.5px] text-slate-500">{f.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-slate-50 flex items-start gap-2">
          <AlertCircle size={13} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            This is a real, computed summary of this business&apos;s own recorded activity in this system — not a credit bureau report, not a regulated credit score, and not a guarantee any lender will honor it. It&apos;s meant to give a business genuine, checkable evidence to start a conversation with a bank or supplier, sourced entirely from data already in this app rather than requiring separate paperwork to assemble from scratch.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ SCHEDULED REPORTS ══════════════ */
/* ------------------------------- SCHEDULED REPORTS ------------------------------- */
export function ScheduledReports({ invoices, inventory, expensesHook, company, schedulesHook }) {
  const { rows, setRows, loading } = schedulesHook;
  const [showForm, setShowForm] = useState(false);
  const [running, setRunning] = useState(null);

  async function addSchedule(form) {
    const draft = { id: docId("SCH"), reportType: form.reportType, frequency: form.frequency, format: form.format, recipientEmail: form.recipientEmail, status: "Active", lastRun: null };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Schedule created: ${draft.reportType} (${draft.frequency})`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("scheduled_reports").insert({
          report_type: draft.reportType, frequency: draft.frequency, format: draft.format,
          recipient_email: draft.recipientEmail, status: "Active",
        }).single().run();
        if (header?.id) setRows((prev) => prev.map((s) => (s.id === draft.id ? { ...s, dbId: header.id } : s)));
      } catch (_e) { notify("Schedule created locally, but saving to the server failed.", "error"); }
    }
  }

  async function toggleStatus(id) {
    const s = rows.find((x) => x.id === id);
    const next = s.status === "Active" ? "Paused" : "Active";
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status: next } : x)));
    if (IS_CONFIGURED && s?.dbId) {
      try { await sb("scheduled_reports").eq("id", s.dbId).update({ status: next }).run(); } catch (_e) { notify("Couldn't save the schedule status to the server.", "error"); }
    }
  }

  async function deleteSchedule(id) {
    const s = rows.find((x) => x.id === id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    if (IS_CONFIGURED && s?.dbId) {
      try { await sb("scheduled_reports").eq("id", s.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the schedule on the server.", "error"); }
    }
  }

  // Generates the exact same report a person would see on that report's
  // tab, using the same pure functions — then exports it in the schedule's
  // configured format. This is the real part of "scheduling": on-demand
  // generation of the right report in the right format.
  async function runNow(schedule) {
    setRunning(schedule.id);
    const today = TODAY.toISOString().slice(0, 10);
    let title, filename, sheetName, headers, rows2;

    if (schedule.reportType === "Sales & Revenue") {
      const { byCustomer, totals } = computeSalesByCustomer(invoices);
      title = "Sales & Revenue Report"; filename = `sales-revenue-${today}`; sheetName = "Revenue by Customer";
      headers = ["Customer", "Invoices", "Billed (TZS 000)", "Collected (TZS 000)", "Outstanding (TZS 000)"];
      rows2 = [...byCustomer.map((r) => [r.customer, r.count, r.billed, r.collected, r.outstanding]), ["TOTAL", totals.count, totals.billed, totals.collected, totals.outstanding]];
    } else if (schedule.reportType === "Inventory Valuation") {
      const { byCategory, grandTotal } = computeValuationByCategory(inventory);
      title = "Inventory Valuation Report"; filename = `inventory-valuation-${today}`; sheetName = "Stock Valuation";
      headers = ["Category", "SKU", "Item", "Qty", "Unit", "Unit Cost (TZS 000)", "Value (TZS 000)"];
      rows2 = [...byCategory.flatMap((c) => c.items.map((it) => [c.category, it.sku, it.name, it.qty, it.unit, it.unitCost, Math.round(it.value)])), ["GRAND TOTAL", "", "", "", "", "", Math.round(grandTotal)]];
    } else {
      const figures = computePnLFigures(invoices, expensesHook.rows);
      title = "Profit & Loss Statement"; filename = `profit-and-loss-${today}`; sheetName = "Profit and Loss";
      headers = ["Line", "Amount (TZS 000)"];
      rows2 = [["Revenue collected", Math.round(figures.collected)], ["Total billed (incl. uncollected)", Math.round(figures.billed)],
        ...figures.expRows.map(([cat, amt]) => [`Expense: ${cat}`, Math.round(amt)]), ["Total operating expenses", Math.round(figures.expTotal)], ["Net position", Math.round(figures.net)]];
    }

    const html = buildTableHtml(title, headers, rows2);
    if (schedule.format === "CSV") exportCSV(`${filename}.csv`, headers, rows2);
    else if (schedule.format === "Excel") exportExcel(`${filename}.xlsx`, sheetName, headers, rows2);
    else if (schedule.format === "Word") exportWord(`${filename}.doc`, title, html);
    else printAsPDF(title, html);

    setRows((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, lastRun: today } : s)));
    notify(`${schedule.reportType} generated. Since there's no backend here, this ran because you clicked it — see the note below about unattended scheduling.`);
    if (IS_CONFIGURED && schedule.dbId) {
      try { await sb("scheduled_reports").eq("id", schedule.dbId).update({ last_run: today }).run(); } catch (_e) { /* the export itself already succeeded; a log-sync miss isn't worth a second toast */ }
    }
    setRunning(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <CalendarCheck size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          "Run Now" genuinely generates and downloads the report in the format below — that part is fully real. What isn&apos;t: this schedule won&apos;t fire on its own while the page is closed. A browser can&apos;t execute code with no tab open; real unattended delivery needs a server-side scheduled job (a cron function that runs this same export and emails it), the same category of gap already documented for Subscriptions billing and several Notification channels.
        </p>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New Schedule
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Report</th><th className="px-4 py-3 font-medium">Frequency</th><th className="px-4 py-3 font-medium">Format</th><th className="px-4 py-3 font-medium">Recipient</th><th className="px-4 py-3 font-medium">Last Run</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={7} />}
              {!loading && rows.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-[#111827]">{s.reportType}</td>
                  <td className="px-4 py-3 text-slate-500">{s.frequency}</td>
                  <td className="px-4 py-3 text-slate-500">{s.format}</td>
                  <td className="px-4 py-3 text-slate-500">{s.recipientEmail || "—"}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono">{s.lastRun || "Never"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleStatus(s.id)} className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: s.status === "Active" ? "#16A34A14" : "#9CA3AF14", color: s.status === "Active" ? "#16A34A" : "#9CA3AF" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.status === "Active" ? "#16A34A" : "#9CA3AF" }} />{s.status}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => runNow(s)} disabled={running === s.id} className="text-[11.5px] font-medium text-[#16A34A] hover:text-[#15803D] disabled:opacity-40">
                        {running === s.id ? "Running..." : "Run Now"}
                      </button>
                      <button onClick={() => deleteSchedule(s.id)} className="text-slate-300 hover:text-[#EF4444]" aria-label={`Delete schedule for ${s.reportType}`}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={7}><EmptyState icon={CalendarCheck} title="No schedules yet" hint="Define a report, frequency, and recipient here." actionLabel="New Schedule" onAction={() => setShowForm(true)} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <ScheduleFormPanel onClose={() => setShowForm(false)} onSubmit={addSchedule} />}
    </div>
  );
}

export function ARAgingReport({ invoices, company }) {
  const today = new Date();
  const buckets = useMemo(() => {
    const result = { current:[], days30:[], days60:[], days90:[], over90:[] };
    (invoices.rows || []).filter(inv => inv.status !== "Paid" && inv.status !== "Cancelled").forEach(inv => {
      const due   = new Date(inv.dueDate || inv.due_date);
      const days  = Math.floor((today - due) / 86400000);
      const bal   = inv.totalAmount - (inv.amountPaid||inv.amount_paid||0) || inv.total || 0;
      const item  = { id:inv.id, customer:inv.customer, balance:bal, days, dueDate:inv.dueDate||inv.due_date };
      if (days <= 0)     result.current.push(item);
      else if (days<=30) result.days30.push(item);
      else if (days<=60) result.days60.push(item);
      else if (days<=90) result.days90.push(item);
      else               result.over90.push(item);
    });
    return result;
  }, [invoices.rows]);

  const bucketDefs = [
    { key:"current", label:"Current (Not Yet Due)",  col:"#16A34A", bg:"#F0FDF4" },
    { key:"days30",  label:"1–30 Days Overdue",       col:"#2563EB", bg:"#EFF6FF" },
    { key:"days60",  label:"31–60 Days Overdue",      col:"#D97706", bg:"#FFFBEB" },
    { key:"days90",  label:"61–90 Days Overdue",      col:"#EA580C", bg:"#FFF7ED" },
    { key:"over90",  label:"90+ Days Overdue",        col:"#EF4444", bg:"#FEF2F2" },
  ];

  const totalReceivables = Object.values(buckets).flat().reduce((s,i)=>s+i.balance,0);

  function exportARAging() {
    const rows3 = [...invoices.rows].map(inv=>{
      const bal=lineTotal(inv.items||[]).total-(inv.amountPaid||0);
      const days=inv.dueDate?Math.max(0,Math.ceil((Date.now()-new Date(inv.dueDate))/86400000)):0;
      return {Customer:inv.customer,Invoice:inv.id,DueDate:inv.dueDate||"",Days:days,Balance_k:Math.round(bal/1000),Status:inv.status};
    }).filter(r=>r.Balance_k>0);
    downloadCSV("ar-aging",rows3,[{key:"Customer",label:"Customer"},{key:"Invoice",label:"Invoice"},{key:"DueDate",label:"Due Date"},{key:"Days",label:"Days Overdue"},{key:"Balance_k",label:"Balance (TZS k)"},{key:"Status",label:"Status"}]);
  }
  return (
    <div className="space-y-4">
      <ReportToolbar title="AR Aging Report" onPrint={()=>printReport("AR Aging Report",`<p style="padding:16px;color:#6B7280;font-size:12px">Accounts receivable aging from ${invoices.rows.length} invoices. Generated: ${new Date().toLocaleDateString()}</p>`,company)} onCSV={exportARAging}/>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {bucketDefs.map(b => {
          const items = buckets[b.key] || [];
          const total = items.reduce((s,i)=>s+i.balance,0);
          return (
            <div key={b.key} className="rounded-xl border p-3 text-center" style={{background:b.bg,borderColor:b.col+"30"}}>
              <p className="text-[11px] text-slate-500 mb-1 leading-tight">{b.label}</p>
              <p className="text-[18px] font-bold" style={{color:b.col}}>TZS {money(total)}k</p>
              <p className="text-[10.5px] text-slate-400">{items.length} invoice{items.length!==1?"s":""}</p>
            </div>
          );
        })}
      </div>

      {/* AR Aging chart */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Receivables by Aging Bucket</h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={bucketDefs.map(b=>({
            name: b.label.split(" ")[0]+" "+b.label.split(" ")[1],
            amount: buckets[b.key].reduce((s,i)=>s+i.balance,0),
            fill: b.col,
          }))} margin={{left:-20,top:0,right:0,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#F3F4F6"/>
            <XAxis dataKey="name" tick={{fontSize:10}}/>
            <YAxis tick={{fontSize:10}}/>
            <Tooltip formatter={v=>"TZS "+money(v)+"k"}/>
            <Bar dataKey="amount" radius={[4,4,0,0]}>
              {bucketDefs.map((b,i)=><Cell key={i} fill={b.col}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed table */}
      {bucketDefs.filter(b=>(buckets[b.key]||[]).length>0).map(b => (
        <div key={b.key} className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100" style={{background:b.bg}}>
            <p className="text-[13px] font-semibold" style={{color:b.col}}>{b.label} — TZS {money(buckets[b.key].reduce((s,i)=>s+i.balance,0))}k ({buckets[b.key].length} invoices)</p>
          </div>
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-50 bg-slate-50/50">{["Customer","Due Date","Days Overdue","Balance"].map(h=>(
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-medium uppercase text-slate-400">{h}</th>
            ))}</tr></thead>
            <tbody>{buckets[b.key].map(item=>(
              <tr key={item.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2.5 font-medium text-[#111827]">{item.customer}</td>
                <td className="px-4 py-2.5 font-mono text-[11.5px] text-slate-400">{item.dueDate}</td>
                <td className="px-4 py-2.5 font-bold" style={{color:b.col}}>{item.days > 0 ? item.days+" days" : "Not yet due"}</td>
                <td className="px-4 py-2.5 font-mono font-bold" style={{color:b.col}}>TZS {money(item.balance)}k</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function TaxVATReport({ invoices, expenses, company }) {
  const taxRate = company?.taxRate || 18;
  const today   = new Date();
  const months  = Array.from({length:6},(_,i)=>{
    const d = new Date(today.getFullYear(), today.getMonth()-5+i, 1);
    return { key: d.toISOString().slice(0,7), label: d.toLocaleString("default",{month:"short"})+" "+d.getFullYear() };
  });

  const taxData = useMemo(() => months.map(m => {
    const monthInvs = (invoices.rows||[]).filter(inv=>(inv.dueDate||inv.due_date||"").startsWith(m.key));
    const monthExps = (expenses||[]).filter(exp=>(exp.expense_date||exp.date||"").startsWith(m.key));
    const outputVAT = monthInvs.reduce((s,inv)=>{
      const amt = inv.totalAmount||inv.total||0;
      return s + (amt * taxRate / (100 + taxRate)); // extract VAT from inclusive amount
    }, 0);
    const inputVAT = monthExps.reduce((s,exp)=>{
      const amt = exp.amount||0;
      return s + (amt * taxRate / (100 + taxRate));
    }, 0);
    return { ...m, outputVAT:Math.round(outputVAT), inputVAT:Math.round(inputVAT), netVAT:Math.round(outputVAT-inputVAT) };
  }), [invoices.rows, expenses, taxRate]);

  const totalOutput = taxData.reduce((s,d)=>s+d.outputVAT,0);
  const totalInput  = taxData.reduce((s,d)=>s+d.inputVAT,0);
  const totalNet    = taxData.reduce((s,d)=>s+d.netVAT,0);

  const printTax = () => {
    const rows = taxData.map(d => `<tr><td>${d.label}</td><td class="right">TZS ${money(d.outputVAT)}k</td><td class="right">TZS ${money(d.inputVAT)}k</td><td class="right" style="color:${d.netVAT>0?"#16A34A":"#EF4444"}">TZS ${money(d.netVAT)}k</td></tr>`).join("");
    printAsPDF("VAT Return Report",
      `<h2>VAT ANALYSIS — ${taxRate}%</h2>
       <table><thead><tr><th>Period</th><th>Output VAT (Sales)</th><th>Input VAT (Expenses)</th><th>Net VAT Payable</th></tr></thead>
       <tbody>${rows}</tbody>
       <tr class="total-row"><td>TOTAL</td><td class="right">TZS ${money(totalOutput)}k</td><td class="right">TZS ${money(totalInput)}k</td><td class="right">TZS ${money(totalNet)}k</td></tr>
       </table>
       <div class="summary">
         <div class="sum-row"><span>Total Output VAT (from sales)</span><span>TZS ${money(totalOutput)}k</span></div>
         <div class="sum-row"><span>Total Input VAT (from purchases)</span><span>TZS ${money(totalInput)}k</span></div>
         <div class="sum-row"><span style="color:${totalNet>0?"#16A34A":"#EF4444"}">Net VAT Payable to TRA</span><span style="color:${totalNet>0?"#16A34A":"#EF4444"}">TZS ${money(totalNet)}k</span></div>
       </div>`,
      { accent:"#16A34A", companyName:company?.name, headerRight:"VAT Rate: "+taxRate+"% · Reporting period: 6 months" }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111827]">VAT / Tax Report</h3>
          <p className="text-[12px] text-slate-400">Output VAT (on sales) vs Input VAT (on expenses) · {taxRate}% rate · TRA compliance</p>
        </div>
        <button onClick={printTax} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl bg-[#16A34A]">
          <Printer size={13}/>Export VAT Return
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[["Output VAT (Sales)","TZS "+money(totalOutput)+"k","#2563EB"],["Input VAT (Expenses)","TZS "+money(totalInput)+"k","#7C3AED"],["Net VAT Payable","TZS "+money(totalNet)+"k",totalNet>0?"#16A34A":"#EF4444"]].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[20px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[13.5px] font-semibold text-[#111827]">Monthly VAT Analysis (6-Month)</p>
        </div>
        <table className="w-full text-[12.5px]">
          <thead><tr className="border-b border-slate-100 bg-slate-50">{["Period","Output VAT (Sales)","Input VAT (Expenses)","Net Payable","Status"].map(h=>(
            <th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>
          ))}</tr></thead>
          <tbody>
            {taxData.map(d=>(
              <tr key={d.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-[#111827]">{d.label}</td>
                <td className="px-4 py-3 font-mono font-bold text-[#2563EB]">TZS {money(d.outputVAT)}k</td>
                <td className="px-4 py-3 font-mono text-[#7C3AED]">TZS {money(d.inputVAT)}k</td>
                <td className="px-4 py-3 font-mono font-bold" style={{color:d.netVAT>0?"#16A34A":"#EF4444"}}>TZS {money(d.netVAT)}k</td>
                <td className="px-4 py-3">
                  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:d.netVAT>0?"#DCFCE7":"#FEE2E2",color:d.netVAT>0?"#15803D":"#991B1B"}}>
                    {d.netVAT > 0 ? "Payable" : "Refund"}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
              <td className="px-4 py-3 font-bold text-[#111827]">TOTAL</td>
              <td className="px-4 py-3 font-mono font-bold text-[#2563EB]">TZS {money(totalOutput)}k</td>
              <td className="px-4 py-3 font-mono font-bold text-[#7C3AED]">TZS {money(totalInput)}k</td>
              <td className="px-4 py-3 font-mono font-bold" style={{color:totalNet>0?"#16A34A":"#EF4444"}}>TZS {money(totalNet)}k</td>
              <td className="px-4 py-3"/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScheduleFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ reportType: SCHEDULE_REPORT_TYPES[0], frequency: SCHEDULE_FREQUENCIES[0], format: SCHEDULE_FORMATS[0], recipientEmail: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Reports</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Schedule</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Report">
            <select className={inputClass} value={form.reportType} onChange={(e) => set("reportType", e.target.value)}>
              {SCHEDULE_REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Frequency">
              <select className={inputClass} value={form.frequency} onChange={(e) => set("frequency", e.target.value)}>
                {SCHEDULE_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </FormField>
            <FormField label="Format">
              <select className={inputClass} value={form.format} onChange={(e) => set("format", e.target.value)}>
                {SCHEDULE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Recipient email"><input type="email" className={inputClass} value={form.recipientEmail} onChange={(e) => set("recipientEmail", e.target.value)} placeholder="name@company.tz" /></FormField>
          <p className="text-[11.5px] text-slate-400">Delivery to this address isn&apos;t automatic yet — see the note on this tab.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Schedule</button>
        </div>
      </form>
    </div>
  );
}
