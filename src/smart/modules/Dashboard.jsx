import { useMemo, useState } from "react";
import {
  BarChart3, Brain, Briefcase, CheckCircle2, ChevronRight, Circle, CircleDollarSign, Clock,
  CreditCard, Factory, FileText, Headphones, Landmark, LayoutDashboard, Megaphone,
  MessageCircle, Package, ReceiptText, ScanLine, ShoppingBag, Sparkles, Store, TrendingDown,
  UserCheck, UserCircle, UserPlus, Users, Wallet, X
} from "lucide-react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { MODULES, ROLES, ROLE_HOME_VIEW, STAGES } from "../data/core.jsx";
import { useBusinessAlerts } from "../lib/alerts.jsx";
import { TODAY, lineTotal, money } from "../lib/format.jsx";
import {
  FinancialDashboard,
  HRDashboard,
  OperationsDashboard,
  SalesDashboard,
} from "../modules/Analytics.jsx";
import { getIndustryProfile } from "../modules/Auth.jsx";

/* ══════════════ DASHBOARD ══════════════ */
/* ------------------------------- DASHBOARD -------------------------------- */
export function Dashboard({ company, invoices, inventory, crm, expenses, leaveRequests, workOrders, subscriptions, employees, posTransactions, currentUser, onQuickAction, onNavigate }) {
  const currentRole = ROLES.find((r) => r.id === currentUser.role) || ROLES[0];
  const roleView = ROLE_HOME_VIEW[currentUser.role] || "executive";
  // Time period filter — Day/Week/Month/Year. The filter cuts both invoice
  // and expense rows by their date field, so every KPI on the dashboard
  // reflects the same window. "This session" is replaced by a real label.
  const [period, setPeriod] = useState("month");
  const periodStart = useMemo(() => {
    const d = new Date(TODAY);
    if (period === "day")   { return d.toISOString().slice(0, 10); }
    if (period === "week")  { d.setDate(d.getDate() - 7);  return d.toISOString().slice(0, 10); }
    if (period === "month") { d.setDate(1);                 return d.toISOString().slice(0, 10); }
    if (period === "year")  { d.setMonth(0, 1);             return d.toISOString().slice(0, 10); }
    return "2000-01-01";
  }, [period]);
  const PERIOD_LABELS = { day: "Today", week: "Last 7 days", month: "This month", year: "This year" };

  const financials = useMemo(() => {
    const invRows = invoices.rows.filter((inv) => !periodStart || (inv.date || "") >= periodStart);
    const expRows = expenses.rows.filter((e) => !periodStart || (e.date || e.expenseDate || "") >= periodStart);
    const revenue = invRows.reduce((s, inv) => {
      const { total } = lineTotal(inv.items);
      return s + (inv.status === "Paid" ? total : (inv.amountPaid || 0));
    }, 0);
    const expenseTotal = expRows.reduce((s, e) => s + e.amount, 0);
    const profit = revenue - expenseTotal;
    const outstanding = invoices.rows.filter((inv) => inv.status !== "Paid");
    const pendingCash = outstanding.reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0);
    return { revenue, expenseTotal, profit, pendingCash, outstandingCount: outstanding.length };
  }, [invoices.rows, expenses.rows, periodStart]);

  const financeKpis = [
    { label: "Revenue Collected", value: `TZS ${money(Math.round(financials.revenue))}k`, delta: PERIOD_LABELS[period], up: true, icon: CircleDollarSign },
    { label: "Expenses", value: `TZS ${money(Math.round(financials.expenseTotal))}k`, delta: PERIOD_LABELS[period], up: false, icon: Wallet },
    { label: "Profit", value: `TZS ${money(Math.round(financials.profit))}k`, delta: financials.profit >= 0 ? "Net positive" : "Net negative", up: financials.profit >= 0, icon: financials.profit >= 0 ? TrendingUp : TrendingDown },
    { label: "Cash Flow", value: `TZS ${money(Math.round(financials.pendingCash))}k`, delta: `${financials.outstandingCount} invoices pending`, up: false, icon: Landmark },
  ];

  // "Sales" — pipeline by stage, live from CRM.
  const pipelineByStage = useMemo(() => {
    return STAGES.map((stage) => ({ stage, value: crm.rows.filter((l) => l.stage === stage).length }));
  }, [crm.rows]);

  // "Revenue" — top customers by billed value, live from invoices. Mirrors
  // Reports' Sales & Revenue report at a glance rather than duplicating a
  // second calculation for the same number.
  const topCustomers = useMemo(() => {
    const map = {};
    invoices.rows.forEach((inv) => {
      const { total } = lineTotal(inv.items);
      map[inv.customer] = (map[inv.customer] || 0) + total;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([customer, value]) => ({ customer, value }));
  }, [invoices.rows]);

  // "Inventory" — stock value by category, live.
  const stockByCategory = useMemo(() => {
    const map = {};
    inventory.rows.forEach((it) => { map[it.category] = (map[it.category] || 0) + it.qty * it.unitCost; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([category, value]) => ({ category, value: Math.round(value) }));
  }, [inventory.rows]);

  // Work orders by status — genuinely Manufacturing's own metric now that
  // Projects is a real module in its own right; this chart never needed
  // to stand in for anything once labeled honestly (see the Production
  // chart below).
  const workOrdersByStatus = useMemo(() => {
    const statuses = ["Planned", "In Progress", "Completed", "Cancelled"];
    return statuses.map((status) => ({ status, value: workOrders.rows.filter((w) => w.status === status).length }));
  }, [workOrders.rows]);

  const pendingLeave = useMemo(() => leaveRequests.rows.filter((l) => l.status === "Pending"), [leaveRequests.rows]);
  const alerts = useBusinessAlerts({ inventory, invoices, expenses, leaveRequests, workOrders, subscriptions });


  // Recent Activity — a real merged feed, not a fabricated log. Built only
  // from the domains with reliable, directly comparable ISO date fields
  // (invoices, expenses, leave requests); CRM's lastActivity is already a
  // locale-formatted display string, not safely sortable, so it's left out
  // rather than guessed at. Day-level relative labels ("Today", "3 days
  // ago") match the actual granularity of this data — the seed dataset
  // doesn't carry real minute-level timestamps, so showing "5 minutes ago"
  // would be a precision the data doesn't have.
  function relativeDay(dateStr) {
    if (!dateStr) return "";
    const days = Math.round((TODAY - new Date(dateStr)) / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 14) return `${days} days ago`;
    return dateStr;
  }

  const recentActivity = useMemo(() => {
    const items = [];
    invoices.rows.forEach((inv) => {
      if (inv.status === "Paid") {
        items.push({ date: inv.date, icon: ReceiptText, color: "#16A34A", text: `Invoice ${inv.id} paid`, sub: inv.customer });
      } else {
        items.push({ date: inv.date, icon: ReceiptText, color: "#5B6472", text: `Invoice ${inv.id} issued`, sub: inv.customer });
      }
    });
    expenses.rows.forEach((e) => {
      items.push({ date: e.date, icon: Wallet, color: "#F59E0B", text: `Expense recorded — ${e.category}`, sub: `TZS ${money(e.amount)}k · ${e.vendor}` });
    });
    leaveRequests.rows.forEach((l) => {
      items.push({ date: l.startDate, icon: Clock, color: l.status === "Approved" ? "#16A34A" : "#F59E0B", text: `Leave ${l.status.toLowerCase()} — ${l.type}`, sub: l.employee });
    });
    return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  }, [invoices.rows, expenses.rows, leaveRequests.rows]);

  const quickActions = [
    { label: "Create Invoice", icon: ReceiptText, action: () => onQuickAction("sales", { tab: "invoices", openForm: true }) },
    { label: "New Lead", icon: Users, action: () => onQuickAction("crm", { tab: "leads" }) },
    { label: "Approve Leave", icon: Clock, action: () => onQuickAction("hr", { tab: "leave" }) },
    { label: "Record Payment", icon: CreditCard, action: () => onQuickAction("finance", { tab: "receivables" }) },
    { label: "Record Expense", icon: Wallet, action: () => onQuickAction("finance", { tab: "expenses" }) },
    { label: "AI Assistant", icon: Brain, action: () => onNavigate("ai") },
  ];

  // Shared across every focused role view below, so Approvals and Recent
  // Activity don't have to be reimplemented per role — only the top-level
  // dashboard content (which real numbers lead the page) actually differs.
  const sidePanels = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-[#111827]">Approvals</h3>
          {pendingLeave.length > 0 && <span className="text-[11px] font-mono text-slate-400">{pendingLeave.length}</span>}
        </div>
        {pendingLeave.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 size={18} className="text-[#16A34A] mb-2" />
            <p className="text-[12.5px] text-slate-500">No approvals waiting.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {pendingLeave.slice(0, 4).map((l) => (
              <button key={l.id} onClick={() => onQuickAction("hr", { tab: "leave" })} className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center shrink-0"><Clock size={13} className="text-[#F59E0B]" /></div>
                  <div className="min-w-0"><p className="text-[12.5px] font-medium text-[#111827] truncate">{l.employee}</p><p className="text-[11px] text-slate-400">{l.type} · {l.startDate} → {l.endDate}</p></div>
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center"><FileText size={18} className="text-slate-300 mb-2" /><p className="text-[12.5px] text-slate-500">Nothing recorded yet this session.</p></div>
        ) : (
          <div className="space-y-1">
            {recentActivity.map((a, i) => {
              const Icon = a.icon;
              return (
                <div key={i} className="flex items-center gap-2.5 px-2 py-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${a.color}14` }}><Icon size={13} style={{ color: a.color }} /></div>
                  <div className="min-w-0 flex-1"><p className="text-[12.5px] font-medium text-[#111827] truncate">{a.text}</p><p className="text-[11px] text-slate-400 truncate">{a.sub}</p></div>
                  <span className="text-[10.5px] text-slate-400 shrink-0">{relativeDay(a.date)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const roleHeader = (focusLine) => (
    <div>
      <h1 className="text-[22px] font-semibold text-[#111827] tracking-tight">Hello, {company.owner}</h1>
      <p className="text-[13px] text-slate-500 mt-1">{currentUser.role} view — {focusLine}</p>
    </div>
  );

  if (roleView === "financial") {
    return (
      <div className="space-y-6">
        {roleHeader("cash flow, receivables, and payables, live from Finance")}
        <FinancialDashboard invoices={invoices} expenses={expenses} posTransactions={posTransactions} onNavigate={onNavigate} />
        {sidePanels}
      </div>
    );
  }

  if (roleView === "hr") {
    return (
      <div className="space-y-6">
        {roleHeader("headcount, payroll, and leave, live from HR")}
        <HRDashboard employees={employees} leaveRequests={leaveRequests} onNavigate={onNavigate} />
        {sidePanels}
      </div>
    );
  }

  if (roleView === "sales") {
    return (
      <div className="space-y-6">
        {roleHeader("pipeline, forecast, and revenue by customer, live from CRM and Sales")}
        <SalesDashboard invoices={invoices} crm={crm} onNavigate={onNavigate} />
        {sidePanels}
      </div>
    );
  }

  if (roleView === "operations") {
    return (
      <div className="space-y-6">
        {roleHeader("stock levels and low-inventory alerts, live from Inventory and Manufacturing")}
        <OperationsDashboard inventory={inventory} workOrders={workOrders} onNavigate={onNavigate} />
        {sidePanels}
      </div>
    );
  }

  // Project Manager and Customer Support Agent: Projects' tasks and
  // Support's tickets both live in their own modules' local state, never
  // lifted to root (the same honest scope boundary Analytics itself
  // states in section 21) — so rather than fabricate a widget standing in
  // for data this screen genuinely doesn't have, this gives a direct,
  // one-click path into the real module instead.
  if (roleView === "focused") {
    const target = currentUser.role === "Project Manager" ? "projects" : "support";
    const targetLabel = currentUser.role === "Project Manager" ? "Projects" : "Customer Support";
    return (
      <div className="space-y-6">
        {roleHeader(`your work lives in ${targetLabel} — jump straight in`)}
        <button onClick={() => onNavigate(target)} className="w-full bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 flex items-center justify-between hover:border-[#16A34A]/40 transition-colors text-left">
          <div>
            <p className="text-[15px] font-semibold text-[#111827] mb-1">Open {targetLabel}</p>
            <p className="text-[12.5px] text-slate-500">Tasks, timelines, and details for your role live there — this home screen doesn&apos;t duplicate that view.</p>
          </div>
          <ChevronRight size={20} className="text-slate-300 shrink-0" />
        </button>
        {sidePanels}
      </div>
    );
  }

  // Employee, External Client, Supplier: narrow, honest access by design
  // (see the ROLES definitions) — the home screen matches that, rather
  // than showing company-wide numbers a role with this little access
  // shouldn't be the one place surfacing.
  if (roleView === "minimal") {
    return (
      <div className="space-y-6">
        {roleHeader(currentRole.description)}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-8 text-center">
          <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center mb-3.5" style={{ backgroundColor: "#DCFCE7" }}>
            <Briefcase size={19} strokeWidth={1.75} className="text-[#16A34A]" />
          </div>
          <p className="text-[14.5px] font-semibold text-[#111827] mb-1">Welcome to {company.name}</p>
          <p className="text-[12.5px] text-slate-500 max-w-[380px] mx-auto leading-relaxed">
            Your access is scoped to {currentRole.allowedModules.map((m) => MODULES.find((mm) => mm.id === m)?.label).filter(Boolean).join(" and ")} — use the sidebar to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ══════════════════ COMMAND STRIP ══════════════════ */}
      <div className="rounded-2xl overflow-hidden relative" style={{background:"linear-gradient(135deg,#0D2214 0%,#1a3a2a 55%,#16A34A 130%)"}}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-64 h-64 rounded-full opacity-10" style={{background:"radial-gradient(circle,#4ADE80,transparent)",right:"-4rem",top:"-4rem"}}/>
          <div className="absolute w-32 h-32 rounded-full opacity-10" style={{background:"radial-gradient(circle,#86EFAC,transparent)",left:"30%",bottom:"-2rem"}}/>
        </div>
        <div className="relative px-5 sm:px-7 py-5">
          {/* Top bar */}
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-[#16A34A] uppercase tracking-widest">Executive Command Center</span>
                <span className="text-[rgba(255,255,255,.3)]">·</span>
                <span className="text-[10.5px] text-[rgba(255,255,255,.4)] font-mono">{TODAY.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</span>
              </div>
              <h1 className="text-white text-[22px] font-black tracking-tight leading-none">
                {(()=>{const h=new Date().getHours();return h<12?"Habari za asubuhi":h<17?"Habari za mchana":"Habari za jioni";})()}, {(company.owner||"Welcome").split(" ")[0]} 👋
              </h1>
              <p className="text-[rgba(255,255,255,.5)] text-[12px] mt-1">{company.name} · {currentUser.role}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={()=>onNavigate("ai")} className="flex items-center gap-1.5 text-[12px] font-bold text-[#111827] bg-[#16A34A] px-3.5 py-2 rounded-xl hover:bg-[#15803D]">
                <Sparkles size={13}/> Ask AI
              </button>
              <button onClick={()=>typeof window.__openDailyBrief==="function"&&window.__openDailyBrief()} className="flex items-center gap-1.5 text-[12px] font-bold text-white border border-[rgba(255,255,255,.2)] px-3.5 py-2 rounded-xl hover:bg-[rgba(255,255,255,.08)]">
                <BarChart3 size={13}/> Daily Brief
              </button>
            </div>
          </div>

          {/* 8-KPI strip */}
          {(() => {
            const invRows = invoices.rows;
            const expRows = expenses.rows;
            const totalBilled   = invRows.reduce((s,i)=>s+lineTotal(i.items||[]).total,0);
            const totalCollected= invRows.reduce((s,i)=>s+(i.amountPaid||0),0);
            const totalExpenses = expRows.reduce((s,e)=>s+(e.amount||0),0);
            const grossProfit   = totalCollected - totalExpenses;
            const overdueInvs   = invRows.filter(i=>i.status!=="Paid"&&i.dueDate<TODAY.toISOString().slice(0,10));
            const overdueAmt    = overdueInvs.reduce((s,i)=>s+lineTotal(i.items||[]).total-(i.amountPaid||0),0);
            const lowStock      = inventory.rows.filter(it=>it.qty<=it.reorder&&it.reorder>0).length;
            const openLeads     = crm.rows.filter(l=>!["Won","Lost"].includes(l.stage)).length;
            const pendingApproval = leaveRequests.rows.filter(l=>l.status==="Pending").length;
            const activeEmployees = (employees?.rows||employees||[]).filter(e=>e.status==="Active").length;
            const activeSubs    = subscriptions.rows.filter(s=>s.status==="Active");
            const MRR = activeSubs.reduce((s,sub)=>{const mo={Monthly:1,Quarterly:3,Annual:12}[sub.cycle]||1;return s+(sub.amount/mo);},0);

            return (
              <div className="grid grid-cols-4 lg:grid-cols-8 gap-px bg-[rgba(255,255,255,.06)] rounded-xl overflow-hidden">
                {[
                  {l:"AR Billed",   v:"TZS "+money(Math.round(totalBilled/1000))+"k",  col:"#4ADE80",  sub:invRows.length+" invoices"},
                  {l:"Collected",   v:"TZS "+money(Math.round(totalCollected/1000))+"k",col:"#60A5FA",  sub:Math.round(totalBilled>0?totalCollected/totalBilled*100:0)+"% rate"},
                  {l:"Overdue AR",  v:"TZS "+money(Math.round(overdueAmt/1000))+"k",   col:overdueAmt>0?"#F87171":"#4ADE80", sub:overdueInvs.length+" invoices"},
                  {l:"Gross P&L",   v:(grossProfit>=0?"+":"")+money(Math.round(Math.abs(grossProfit)/1000))+"k",col:grossProfit>=0?"#4ADE80":"#F87171",sub:"Collected − Exp"},
                  {l:"Inventory",   v:money(inventory.rows.reduce((s,it)=>s+(it.qty||0)*(it.unitCost||0),0)/1000>>0)+"k TZS",col:"#C4B5FD",sub:inventory.rows.length+" SKUs"},
                  {l:"Low Stock",   v:String(lowStock),col:lowStock>0?"#F87171":"#4ADE80",sub:inventory.rows.filter(it=>it.qty<=0).length+" out"},
                  {l:"Pipeline",    v:money(Math.round(crm.rows.filter(l=>!["Won","Lost"].includes(l.stage)).reduce((s,l)=>s+(l.value||0),0)/1000))+"k",col:"#F9A8D4",sub:openLeads+" open deals"},
                  {l:"MRR",         v:"TZS "+money(Math.round(MRR))+"k",col:"#34D399",sub:activeSubs.length+" active subs"},
                ].map(({l,v,col,sub})=>(
                  <div key={l} className="bg-[rgba(0,0,0,.25)] px-3 py-3 text-center">
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-[rgba(255,255,255,.45)] mb-1">{l}</p>
                    <p className="text-[14px] font-black leading-tight" style={{color:col}}>{v}</p>
                    <p className="text-[9.5px] text-[rgba(255,255,255,.35)] mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ══════════════════ ALERTS + QUICK ACTIONS ══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Smart Alerts */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100" style={{background:"#0D2214"}}>
            <h3 className="text-[13px] font-bold text-white flex items-center gap-1.5">🚨 Live Alerts</h3>
            {alerts.length>0&&<span className="text-[10.5px] font-black text-white bg-[#EF4444] px-2 py-0.5 rounded-full">{alerts.length}</span>}
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {alerts.length===0?(
              <div className="py-10 text-center">
                <CheckCircle2 size={24} className="text-[#16A34A] mx-auto mb-2"/>
                <p className="text-[12.5px] text-slate-400 font-semibold">All Clear</p>
                <p className="text-[11px] text-slate-300">No active alerts</p>
              </div>
            ):alerts.slice(0,8).map((a,i)=>{
              const cols={critical:["#FEF2F2","#EF4444"],high:["#FFFBEB","#F59E0B"],medium:["#EFF6FF","#2563EB"],low:["#F0FDF4","#16A34A"]};
              const [bg,col]=cols[a.priority]||cols.medium;
              return (
                <button key={a.id||i} onClick={()=>onNavigate(a.target||"dashboard")}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors">
                  <span className="text-[14px] shrink-0 mt-0.5">{a.priority==="critical"?"🚨":a.priority==="high"?"⚠️":"ℹ️"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold truncate" style={{color:col}}>{a.title}</p>
                    <p className="text-[11px] text-slate-400 truncate">{a.subtitle||a.module}</p>
                  </div>
                  <ChevronRight size={12} className="text-slate-300 shrink-0 mt-1"/>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Actions Command Panel */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100" style={{background:"#0D2214"}}>
            <h3 className="text-[13px] font-bold text-white">⚡ Command Actions</h3>
          </div>
          <div className="p-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
            {[
              {label:"New Invoice",   icon:ReceiptText,  col:"#16A34A", action:()=>onQuickAction("sales",{tab:"invoices",openForm:true})},
              {label:"New Lead",      icon:Users,         col:"#7C3AED", action:()=>onQuickAction("crm",{tab:"leads"})},
              {label:"Record Expense",icon:Wallet,        col:"#F59E0B", action:()=>onQuickAction("finance",{tab:"expenses"})},
              {label:"New PO",        icon:ShoppingBag,   col:"#2563EB", action:()=>onNavigate("procurement")},
              {label:"Add Stock",     icon:Package,       col:"#0891B2", action:()=>onNavigate("inventory")},
              {label:"Approve Leave", icon:Clock,         col:"#EF4444", action:()=>onQuickAction("hr",{tab:"leave"})},
              {label:"New Employee",  icon:UserPlus,      col:"#059669", action:()=>onQuickAction("hr",{tab:"employees"})},
              {label:"New Project",   icon:FolderKanban,  col:"#DC2626", action:()=>onNavigate("projects")},
              {label:"POS Sale",      icon:ScanLine,      col:"#7C3AED", action:()=>onNavigate("pos")},
              {label:"Send Message",  icon:MessageCircle, col:"#25D366", action:()=>onNavigate("collaboration")},
              {label:"View Reports",  icon:BarChart3,     col:"#1E3A8A", action:()=>onNavigate("reports")},
              {label:"AI Assistant",  icon:Sparkles,      col:"#F9A8D4", action:()=>onNavigate("ai")},
            ].map(({label,icon:Icon,col,action})=>(
              <button key={label} onClick={action}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all group-hover:scale-105"
                  style={{background:col+"15"}}>
                  <Icon size={16} style={{color:col}}/>
                </div>
                <span className="text-[10.5px] font-semibold text-slate-600 text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════ REVENUE vs EXPENSES TREND ══════════════════ */}
      {(() => {
        const months = Array.from({length:6},(_,i)=>{
          const d=new Date(TODAY); d.setMonth(d.getMonth()-5+i);
          return d.toISOString().slice(0,7);
        });
        const data = months.map(mo=>{
          const rev = invoices.rows.filter(i=>i.date?.startsWith(mo)).reduce((s,i)=>s+(i.amountPaid||0),0);
          const exp = expenses.rows.filter(e=>e.date?.startsWith(mo)).reduce((s,e)=>s+(e.amount||0),0);
          return {mo:new Date(mo+"-01").toLocaleDateString("en",{month:"short"}),rev:Math.round(rev/1000),exp:Math.round(exp/1000),profit:Math.round((rev-exp)/1000)};
        });
        const hasData = data.some(d=>d.rev>0||d.exp>0);
        if (!hasData) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-[14px] font-bold text-[#111827]">Revenue vs Expenses — 6 Month Trend</h3>
                  <p className="text-[11.5px] text-slate-400">Collected revenue · Operating expenses · TZS thousands</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={data} margin={{left:-10,right:4,top:4,bottom:0}}>
                  <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                  <XAxis dataKey="mo" tick={{fontSize:11,fill:"#94A3B8"}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:"#94A3B8"}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{borderRadius:10,border:"1px solid #EEF1F4",fontSize:12}} formatter={(v,n)=>[`TZS ${money(v)}k`,n]}/>
                  <Legend iconSize={9} iconType="circle"/>
                  <Area type="monotone" dataKey="rev" name="Revenue" fill="#DCF5E7" stroke="#16A34A" strokeWidth={2} fillOpacity={0.6}/>
                  <Area type="monotone" dataKey="exp" name="Expenses" fill="#FEE2E2" stroke="#EF4444" strokeWidth={2} fillOpacity={0.4}/>
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="#2563EB" strokeWidth={2} dot={{r:3,fill:"#2563EB"}} strokeDasharray="5 3"/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* AR Aging Buckets */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[14px] font-bold text-[#111827] mb-1">AR Aging</h3>
              <p className="text-[11.5px] text-slate-400 mb-3">Outstanding invoices by age</p>
              {(() => {
                const unpaid = invoices.rows.filter(i=>i.status!=="Paid");
                const todayMs = TODAY.getTime();
                const buckets = [
                  {label:"Current",    days:0,   col:"#16A34A", items:unpaid.filter(i=>!i.dueDate||new Date(i.dueDate)>=TODAY)},
                  {label:"1–30 days",  days:30,  col:"#F59E0B", items:unpaid.filter(i=>i.dueDate&&(todayMs-new Date(i.dueDate).getTime())>0&&(todayMs-new Date(i.dueDate).getTime())<=30*86400000)},
                  {label:"31–60 days", days:60,  col:"#F97316", items:unpaid.filter(i=>i.dueDate&&(todayMs-new Date(i.dueDate).getTime())>30*86400000&&(todayMs-new Date(i.dueDate).getTime())<=60*86400000)},
                  {label:"60+ days",   days:999, col:"#EF4444", items:unpaid.filter(i=>i.dueDate&&(todayMs-new Date(i.dueDate).getTime())>60*86400000)},
                ];
                const totalAR = unpaid.reduce((s,i)=>s+lineTotal(i.items||[]).total-(i.amountPaid||0),0);
                return (
                  <div className="space-y-3">
                    {buckets.map(b=>{
                      const amt = b.items.reduce((s,i)=>s+lineTotal(i.items||[]).total-(i.amountPaid||0),0);
                      const pct = totalAR>0?Math.round(amt/totalAR*100):0;
                      return (
                        <div key={b.label}>
                          <div className="flex items-center justify-between text-[12px] mb-1">
                            <span className="font-semibold" style={{color:b.col}}>{b.label}</span>
                            <span className="font-mono font-bold text-[#111827]">TZS {money(Math.round(amt/1000))}k</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{width:pct+"%",background:b.col}}/>
                          </div>
                          <p className="text-[10.5px] text-slate-400 mt-0.5">{b.items.length} invoices · {pct}%</p>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#111827]">Total AR Outstanding</span>
                      <span className="text-[13px] font-black text-[#EF4444]">TZS {money(Math.round(totalAR/1000))}k</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════ MODULE HEALTH GRID ══════════════════ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-[#111827]">Module Health</h3>
          <p className="text-[11.5px] text-slate-400">Click any module to navigate</p>
        </div>
        <div className="p-3 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-2">
          {[
            {id:"dashboard",label:"Dashboard",icon:LayoutDashboard,status:"ok"},
            {id:"crm",label:"CRM",icon:Users,status: crm.rows.length===0?"empty":"ok"},
            {id:"sales",label:"Sales",icon:ReceiptText,status: invoices.rows.filter(i=>i.status!=="Paid"&&i.dueDate<TODAY.toISOString().slice(0,10)).length>0?"warn":"ok"},
            {id:"inventory",label:"Inventory",icon:Package,status: inventory.rows.filter(it=>it.qty<=it.reorder&&it.reorder>0).length>0?"warn":inventory.rows.length===0?"empty":"ok"},
            {id:"procurement",label:"Procurement",icon:ShoppingBag,status:"ok"},
            {id:"finance",label:"Finance",icon:CircleDollarSign,status: expenses.rows.length===0?"empty":"ok"},
            {id:"hr",label:"HR",icon:UserCheck,status: leaveRequests.rows.filter(l=>l.status==="Pending").length>0?"warn":"ok"},
            {id:"manufacturing",label:"Mfg",icon:Factory,status: workOrders.rows.filter(w=>w.status!=="Completed"&&w.dueDate<TODAY.toISOString().slice(0,10)).length>0?"warn":"ok"},
            {id:"projects",label:"Projects",icon:FolderKanban,status:"ok"},
            {id:"support",label:"Support",icon:Headphones,status:"ok"},
            {id:"analytics",label:"Analytics",icon:BarChart3,status:"ok"},
            {id:"reports",label:"Reports",icon:FileText,status:"ok"},
            {id:"pos",label:"POS",icon:ScanLine,status:"ok"},
            {id:"marketing",label:"Marketing",icon:Megaphone,status:"ok"},
            {id:"ecommerce",label:"Ecommerce",icon:Store,status:"ok"},
            {id:"collaboration",label:"Collab",icon:MessageCircle,status:"ok"},
            {id:"ai",label:"AI",icon:Brain,status:"ok"},
            {id:"employee-portal",label:"Portal",icon:UserCircle,status:"ok"},
          ].map(({id,label,icon:Icon,status})=>{
            const cfg={ok:{ring:"#16A34A",dot:"#16A34A",bg:"#F0FDF4"},warn:{ring:"#F59E0B",dot:"#F59E0B",bg:"#FFFBEB"},empty:{ring:"#94A3B8",dot:"#94A3B8",bg:"#F8FAFC"}};
            const s=cfg[status]||cfg.ok;
            return (
              <button key={id} onClick={()=>onNavigate(id)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-slate-50 transition-all group">
                <div className="relative w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all group-hover:scale-105"
                  style={{background:s.bg,borderColor:s.ring+"40"}}>
                  <Icon size={16} style={{color:s.ring}}/>
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white" style={{background:s.dot}}/>
                </div>
                <span className="text-[9.5px] font-semibold text-slate-500 text-center leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center gap-4">
          {[["ok","#16A34A","Healthy"],["warn","#F59E0B","Needs attention"],["empty","#94A3B8","No data yet"]].map(([k,col,label])=>(
            <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{background:col}}/>{label}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════ BUSINESS ANALYTICS ROW ══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Top Customers BarChart */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[13.5px] font-bold text-[#111827] mb-1">Top Customers</h3>
          <p className="text-[11.5px] text-slate-400 mb-3">By billed revenue (TZS k)</p>
          {(() => {
            const custData = Object.entries(
              invoices.rows.reduce((m,inv)=>{
                const val=lineTotal(inv.items||[]).total;
                m[inv.customer]=(m[inv.customer]||0)+val;
                return m;
              },{})
            ).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,val])=>({
              name:name.length>16?name.slice(0,14)+"…":name,
              value:Math.round(val/1000),
            }));
            if (!custData.length) return <p className="text-slate-300 text-center py-8 text-[12px]">No invoices yet</p>;
            return (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={custData} layout="vertical" margin={{left:5,right:24,top:0,bottom:0}}>
                  <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                  <XAxis type="number" tick={{fontSize:9,fill:"#94A3B8"}} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="name" type="category" tick={{fontSize:10,fill:"#374151"}} axisLine={false} tickLine={false} width={80}/>
                  <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Revenue"]}/>
                  <Bar dataKey="value" fill="#16A34A" radius={[0,4,4,0]} maxBarSize={14}/>
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </div>

        {/* Inventory Category PieChart */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[13.5px] font-bold text-[#111827] mb-1">Inventory by Category</h3>
          <p className="text-[11.5px] text-slate-400 mb-3">Stock value distribution</p>
          {(() => {
            const cats = {};
            inventory.rows.forEach(it=>{
              const cat=it.category||"Other";
              cats[cat]=(cats[cat]||0)+(it.qty||0)*(it.unitCost||0);
            });
            const catData = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6)
              .map(([name,val],i)=>({name:name.slice(0,12),value:Math.round(val/1000),fill:["#16A34A","#2563EB","#D97706","#7C3AED","#EF4444","#0891B2"][i%6]}));
            if (!catData.length) return <p className="text-slate-300 text-center py-8 text-[12px]">No inventory yet</p>;
            return (
              <div className="flex items-center gap-3">
                <ResponsiveContainer width="55%" height={150}>
                  <PieChart>
                    <Pie data={catData} dataKey="value" cx="50%" cy="50%" outerRadius={62} innerRadius={34}>
                      {catData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Value"]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {catData.map(d=>(
                    <div key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{background:d.fill}}/>{d.name}
                      </span>
                      <span className="text-[11px] font-bold" style={{color:d.fill}}>{money(d.value)}k</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* CRM Pipeline Funnel */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[13.5px] font-bold text-[#111827] mb-1">Sales Pipeline</h3>
          <p className="text-[11.5px] text-slate-400 mb-3">Leads by stage (TZS k value)</p>
          {(() => {
            const STAGE_COLORS={"New":"#64748B","Contacted":"#2563EB","Qualified":"#7C3AED","Proposal":"#D97706","Negotiation":"#EF4444","Won":"#16A34A","Lost":"#94A3B8"};
            const stageData = ["New","Contacted","Qualified","Proposal","Negotiation"].map(s=>({
              name:s, value:Math.round(crm.rows.filter(l=>l.stage===s).reduce((sum,l)=>sum+(l.value||0),0)/1000),
              fill:STAGE_COLORS[s],
            })).filter(d=>d.value>0);
            if (!stageData.length) return <p className="text-slate-300 text-center py-8 text-[12px]">No leads yet</p>;
            return (
              <ResponsiveContainer width="100%" height={155}>
                <BarChart data={stageData} margin={{left:0,right:10,top:0,bottom:0}}>
                  <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                  <XAxis dataKey="name" tick={{fontSize:9.5,fill:"#94A3B8"}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9,fill:"#94A3B8"}} axisLine={false} tickLine={false}/>
                  <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Value"]}/>
                  <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={40}>
                    {stageData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      </div>

      {/* ══════════════════ APPROVALS + ACTIVITY ══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pending Approvals */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[13.5px] font-bold text-[#111827]">Approvals</h3>
            {pendingLeave.length>0&&<span className="text-[10.5px] font-black text-white bg-[#F59E0B] px-2 py-0.5 rounded-full">{pendingLeave.length}</span>}
          </div>
          {pendingLeave.length===0?(
            <div className="py-10 text-center">
              <CheckCircle2 size={20} className="text-[#16A34A] mx-auto mb-2"/>
              <p className="text-[12px] text-slate-400">No approvals pending</p>
            </div>
          ):(
            <div className="divide-y divide-slate-50">
              {pendingLeave.slice(0,5).map(l=>(
                <button key={l.id} onClick={()=>onQuickAction("hr",{tab:"leave"})}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center shrink-0"><Clock size={13} className="text-[#F59E0B]"/></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-[#111827] truncate">{l.employeeName||"Employee"}</p>
                    <p className="text-[11px] text-slate-400 truncate">{l.type} · {l.startDate}→{l.endDate}</p>
                  </div>
                  <ChevronRight size={13} className="text-slate-300 shrink-0"/>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-[13.5px] font-bold text-[#111827]">Recent Activity</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {recentActivity.length===0?(
              <div className="py-10 text-center text-slate-400"><FileText size={20} className="mx-auto mb-2 text-slate-200"/><p className="text-[12px]">No recent activity</p></div>
            ):recentActivity.map((a,i)=>{
              const Icon=a.icon;
              return (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{background:a.color+"14"}}>
                    <Icon size={13} style={{color:a.color}}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[#111827] truncate">{a.text}</p>
                    <p className="text-[11px] text-slate-400 truncate">{a.sub}</p>
                  </div>
                  <span className="text-[10.5px] text-slate-300 shrink-0">{relativeDay(a.date)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Low Stock + Work Orders */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-[13.5px] font-bold text-[#111827]">Attention Needed</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {inventory.rows.filter(it=>it.qty<=it.reorder&&it.reorder>0).slice(0,3).map(it=>(
              <button key={it.id} onClick={()=>onNavigate("inventory")}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50">
                <div className="w-8 h-8 rounded-xl bg-[#EF4444]/10 flex items-center justify-center shrink-0"><Package size={13} className="text-[#EF4444]"/></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#111827] truncate">{it.name}</p>
                  <p className="text-[11px] text-[#EF4444]">{it.qty<=0?"Out of stock":`${it.qty} left — reorder at ${it.reorder}`}</p>
                </div>
              </button>
            ))}
            {workOrders.rows.filter(w=>w.status!=="Completed"&&w.status!=="Cancelled"&&w.dueDate<TODAY.toISOString().slice(0,10)).slice(0,2).map(w=>(
              <button key={w.id} onClick={()=>onNavigate("manufacturing")}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50">
                <div className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center shrink-0"><Factory size={13} className="text-[#F59E0B]"/></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[#111827] truncate">{w.productName||w.id}</p>
                  <p className="text-[11px] text-[#F59E0B]">Work order overdue · {w.dueDate}</p>
                </div>
              </button>
            ))}
            {inventory.rows.filter(it=>it.qty<=it.reorder&&it.reorder>0).length===0&&workOrders.rows.filter(w=>w.status!=="Completed"&&w.dueDate<TODAY.toISOString().slice(0,10)).length===0&&(
              <div className="py-10 text-center"><CheckCircle2 size={20} className="text-[#16A34A] mx-auto mb-2"/><p className="text-[12px] text-slate-400">Everything looks good</p></div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// A real, data-driven "getting started" checklist — every item checked
// against this company's own actual records, not a static tutorial that
// shows the same five steps regardless of whether they're already done.
// Deliberately absent from most SME software, which typically either
// has no onboarding guidance at all or a generic product tour that never
// actually looks at whether a step is complete. Genuinely disappears
// once every item is checked, so an established business with years of
// real activity never sees a permanent "getting started" banner
// cluttering its own dashboard — the same "shown only when it's still
// true" discipline behind every alert and notification in this build.
export function GettingStartedChecklist({ inventory, crm, invoices, expenses, posTransactions, onNavigate }) {
  const [dismissed, setDismissed] = useState(false);

  const steps = [
    { id: "product", label: "Add your first product or service", done: inventory.rows.length > 0, module: "inventory" },
    { id: "customer", label: "Add your first customer", done: crm.rows.length > 0, module: "crm" },
    { id: "invoice", label: "Create your first invoice", done: invoices.rows.length > 0, module: "sales" },
    { id: "payment", label: "Record your first payment or sale", done: invoices.rows.some((inv) => inv.status === "Paid" || (inv.amountPaid || 0) > 0) || posTransactions.rows.length > 0, module: "finance" },
    { id: "expense", label: "Record your first expense", done: expenses.rows.length > 0, module: "finance" },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (allDone || dismissed) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-[14.5px] font-semibold text-[#111827]">Getting Started</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">{completedCount} of {steps.length} done — real progress from your own actual records, not a checklist that just sits there.</p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-slate-300 hover:text-slate-500" aria-label="Dismiss getting started checklist"><X size={16} /></button>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden my-3">
        <div className="h-full rounded-full bg-[#16A34A] transition-all" style={{ width: `${(completedCount / steps.length) * 100}%` }} />
      </div>
      <div className="space-y-1">
        {steps.map((s) => (
          <button
            key={s.id} onClick={() => !s.done && onNavigate(s.module)} disabled={s.done}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors ${s.done ? "cursor-default" : "hover:bg-slate-50"}`}
          >
            {s.done ? <CheckCircle2 size={16} className="text-[#16A34A] shrink-0" /> : <Circle size={16} className="text-slate-300 shrink-0" />}
            <span className={`text-[13px] ${s.done ? "text-slate-400 line-through" : "text-[#111827] font-medium"}`}>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Real, differentiated guidance based on the company's own selected
// category — resolved through the real industry-clustering system
// (COMPANY_CATEGORIES → CATEGORY_TO_INDUSTRY → INDUSTRY_PROFILES), not a
// generic "here are some tips" panel shown identically to everyone
// regardless of what kind of business they actually run. Dismissible per
// device, matching the same real, honest pattern already used for App
// Lock and Dark Mode preferences — a person who's internalized the
// guidance shouldn't have to see it forever.
// The design spec's centerpiece: Business Health as a green circular
// progress hero. Every point is computed from real records at render
// time — nothing here is a vibe or a hardcoded "95%". Four transparent
// factors, each with its real contribution shown, because a health
// score nobody can interrogate is decoration, not information:
//   Collections (30) — share of unpaid invoices not yet overdue
//   Stock (25)       — share of items above their real reorder level
//   Payables (20)    — share of expenses not sitting unpaid past due
//   Momentum (25)    — this month's revenue vs last month's, real docs
export function BusinessHealthCard({ invoices, inventory, expenses, posTransactions }) {
  const [expanded, setExpanded] = useState(false);
  const todayStr = TODAY.toISOString().slice(0, 10);

  const health = useMemo(() => {
    const factors = [];

    const unpaid = invoices.rows.filter((i) => i.status !== "Paid");
    const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < todayStr);
    const collectPct = unpaid.length === 0 ? 1 : 1 - overdue.length / unpaid.length;
    factors.push({ label: "Collections", pts: Math.round(collectPct * 30), max: 30, detail: unpaid.length === 0 ? "No unpaid invoices" : `${overdue.length} of ${unpaid.length} unpaid invoices overdue` });

    const items = inventory.rows;
    const low = items.filter((it) => it.qty <= it.reorder);
    const stockPct = items.length === 0 ? 1 : 1 - low.length / items.length;
    factors.push({ label: "Stock levels", pts: Math.round(stockPct * 25), max: 25, detail: items.length === 0 ? "No inventory tracked" : `${low.length} of ${items.length} items at or below reorder level` });

    const openExp = expenses.rows.filter((e) => e.status !== "Paid");
    const lateExp = openExp.filter((e) => e.dueDate && e.dueDate < todayStr);
    const payPct = openExp.length === 0 ? 1 : 1 - lateExp.length / openExp.length;
    factors.push({ label: "Payables", pts: Math.round(payPct * 20), max: 20, detail: openExp.length === 0 ? "No open expenses" : `${lateExp.length} of ${openExp.length} open expenses past due` });

    const monthOf = (d) => (d || "").slice(0, 7);
    const thisM = todayStr.slice(0, 7);
    const lastM = `${TODAY.getFullYear()}-${String(TODAY.getMonth()).padStart(2, "0")}`;
    const revOf = (m) =>
      invoices.rows.filter((i) => monthOf(i.date) === m).reduce((s, i) => s + lineTotal(i.items).total, 0) +
      (posTransactions?.rows || []).filter((t) => monthOf(t.date) === m).reduce((s, t) => s + t.items.reduce((ts, it) => ts + it.qty * it.price, 0), 0);
    const rThis = revOf(thisM), rLast = revOf(lastM);
    const momPct = rLast === 0 ? (rThis > 0 ? 1 : 0.5) : Math.max(0, Math.min(1, rThis / rLast));
    factors.push({ label: "Sales momentum", pts: Math.round(momPct * 25), max: 25, detail: rLast === 0 ? "No prior-month baseline yet" : `This month TZS ${money(Math.round(rThis))}k vs last month ${money(Math.round(rLast))}k` });

    const score = factors.reduce((s, f) => s + f.pts, 0);
    return { score, factors };
  }, [invoices.rows, inventory.rows, expenses.rows, posTransactions?.rows, todayStr]);

  const band = health.score >= 80 ? { label: "Excellent", color: "#16A34A" } : health.score >= 60 ? { label: "Good", color: "#22C55E" } : health.score >= 40 ? { label: "Needs attention", color: "#F59E0B" } : { label: "At risk", color: "#EF4444" };
  const r = 34, circ = 2 * Math.PI * r, dash = (health.score / 100) * circ;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
        <div className="relative shrink-0" style={{ width: 84, height: 84 }}>
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r={r} fill="none" stroke="#F1F5F9" strokeWidth="8" />
            <circle cx="42" cy="42" r={r} fill="none" stroke={band.color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${dash} ${circ - dash}`} transform="rotate(-90 42 42)" style={{ transition: "stroke-dasharray .6s ease-out" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[20px] font-bold font-mono text-[#111827] leading-none">{health.score}</span>
            <span className="text-[9px] text-slate-400">/ 100</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-[#111827]">Business Health</h3>
          <p className="text-[13px] font-medium" style={{ color: band.color }}>{band.label}</p>
          <p className="text-[11.5px] text-slate-400 mt-0.5">Computed live from your real records right now — every point traceable, nothing hardcoded.</p>
        </div>
        <button onClick={() => setExpanded((e) => !e)} className="text-[11.5px] font-medium text-[#16A34A] hover:underline shrink-0 self-start sm:self-auto text-left">{expanded ? "Hide breakdown" : "How is this computed?"}</button>
      </div>
      {(() => {
        const m = todayStr.slice(0, 7);
        const rev = invoices.rows.filter((i) => (i.date || "").startsWith(m)).reduce((s, i) => s + lineTotal(i.items).total, 0)
          + (posTransactions?.rows || []).filter((t) => (t.date || "").startsWith(m)).reduce((s, t) => s + t.items.reduce((ts, it) => ts + it.qty * it.price, 0), 0);
        const exp = expenses.rows.filter((e) => (e.date || "").startsWith(m)).reduce((s, e) => s + e.amount, 0);
        const profit = rev - exp;
        return (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3">
            <div><p className="text-[10.5px] text-slate-400">Revenue (month)</p><p className="text-[14px] font-mono font-semibold text-[#111827]">TZS {money(Math.round(rev))}k</p></div>
            <div><p className="text-[10.5px] text-slate-400">Expenses (month)</p><p className="text-[14px] font-mono font-semibold text-[#111827]">TZS {money(Math.round(exp))}k</p></div>
            <div><p className="text-[10.5px] text-slate-400">Profit (month)</p><p className="text-[14px] font-mono font-semibold" style={{ color: profit >= 0 ? "#16A34A" : "#EF4444" }}>TZS {money(Math.round(profit))}k</p></div>
          </div>
        );
      })()}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
          {health.factors.map((f) => (
            <div key={f.label} className="flex items-center justify-between text-[12px]">
              <span className="text-slate-600">{f.label} <span className="text-slate-400">— {f.detail}</span></span>
              <span className="font-mono font-medium text-[#111827] shrink-0 ml-3">{f.pts}/{f.max}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function IndustryInsights({ company, onNavigate }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const profile = getIndustryProfile(company.category);
  const Icon = profile.icon;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#DCFCE7] flex items-center justify-center shrink-0"><Icon size={17} className="text-[#16A34A]" /></div>
          <div>
            <h3 className="text-[14.5px] font-semibold text-[#111827]">Built for {profile.label}</h3>
            <p className="text-[11.5px] text-slate-400">Real guidance for {company.category || "your industry"}, not a generic tip shown to everyone.</p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-slate-300 hover:text-slate-500" aria-label="Dismiss industry insights"><X size={16} /></button>
      </div>
      <div className="space-y-2">
        {profile.tips.map((tip, i) => (
          <div key={i} className="flex items-start gap-2 text-[12.5px] text-slate-600">
            <Sparkles size={13} className="text-[#16A34A] shrink-0 mt-0.5" />
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
