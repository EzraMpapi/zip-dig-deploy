import { useEffect, useMemo, useState } from "react";
import {
  Printer, X
} from "lucide-react";
import { TODAY, lineTotal } from "../lib/format.jsx";
import { notify } from "../lib/notify.jsx";

export const BRIEFING_EXEC_ROLES = new Set([
  "Super Administrator","Organization Owner","CEO","COO","CFO","CMO","CTO",
  "Finance Manager","HR Manager","Sales Manager","Project Manager","Warehouse Manager",
]);


export function DailyBriefing({ company, currentUser, canManage, invoices, inventory,
  expenses, crm, employees, leaveRequests, workOrders, subscriptions, smartAlerts, enabledModules }) {

  const co = company || {};
  const TODAY_STR = TODAY.toISOString().slice(0, 10);
  const briKey    = `bs_brief_${TODAY_STR}`;

  // Auto-show once per day for exec roles
  const [open, setOpen] = useState(() => {
    if (!BRIEFING_EXEC_ROLES.has(currentUser?.role)) return false;
    try { return !localStorage.getItem(briKey); } catch { return false; }
  });
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) { try { localStorage.setItem(briKey, "1"); } catch {} }
  }, [open]);

  // Expose open trigger to topbar
  useEffect(() => {
    window.__openDailyBrief = () => setOpen(true);
    return () => { delete window.__openDailyBrief; };
  }, []);

  // ── Compute all section data ─────────────────────────────────────────
  const data = useMemo(() => {
    const fmt    = (n) => new Intl.NumberFormat("en-US").format(Math.round(n || 0));
    const today  = TODAY_STR;
    const invRows = invoices?.rows || [];

    // SALES
    const todayInvs   = invRows.filter(i => i.date === today);
    const totalBilled = invRows.reduce((s, i) => s + lineTotal(i.items || []).total, 0);
    const totalCollected = invRows.reduce((s, i) => s + (i.amountPaid || 0), 0);
    const overdueInvs = invRows.filter(i => i.status !== "Paid" && i.dueDate < today);
    const overdueAmt  = overdueInvs.reduce((s, i) => s + lineTotal(i.items||[]).total - (i.amountPaid||0), 0);
    const unpaidInvs  = invRows.filter(i => i.status === "Unpaid" || i.status === "Partial");

    // INVENTORY
    const invItems  = inventory?.rows || [];
    const lowStock  = invItems.filter(it => it.stock <= it.reorderPoint && it.reorderPoint > 0);
    const outOfStock= invItems.filter(it => it.stock <= 0);
    const stockValue= invItems.reduce((s, it) => s + (it.stock || 0) * (it.cost || 0), 0);

    // FINANCE / EXPENSES
    const expRows  = expenses?.rows || [];
    const todayExp = expRows.filter(e => e.date === today);
    const totalExp = expRows.reduce((s, e) => s + (e.amount || 0), 0);
    const grossPL  = totalCollected - totalExp;

    // CRM
    const leads    = crm?.rows || [];
    const newLeads = leads.filter(l => l.createdAt?.slice(0,10) === today || l.date?.slice(0,10) === today);
    const openOpps = leads.filter(l => !["Won","Lost"].includes(l.stage));
    const pipeVal  = openOpps.reduce((s, l) => s + (l.value || 0), 0);

    // HR
    const emps      = employees || [];
    const activeEmps= emps.filter(e => e.status === "Active");
    const onLeave   = (leaveRequests?.rows || []).filter(l =>
      l.status === "Approved" && l.startDate <= today && l.endDate >= today
    );
    const expContracts = emps.filter(e =>
      e.contractEndDate && e.contractEndDate <= new Date(Date.now()+30*86400000).toISOString().slice(0,10)
    );

    // MANUFACTURING
    const wos       = workOrders?.rows || [];
    const overdueWO = wos.filter(w => w.status !== "Completed" && w.status !== "Cancelled" && w.dueDate < today);

    // SUBSCRIPTIONS
    const subs      = subscriptions?.rows || [];
    const subsDue   = subs.filter(s => s.status === "Active" && s.nextBillingDate && s.nextBillingDate <= new Date(Date.now()+7*86400000).toISOString().slice(0,10));
    const MRR       = subs.filter(s=>s.status==="Active").reduce((sum,s)=>{
      const mo={Monthly:1,Quarterly:3,Annual:12}[s.cycle]||1;
      return sum+(s.amount/mo);
    },0);

    // SMART ALERTS — deduplicated, ranked
    const alerts = (smartAlerts || []).slice(0, 20);

    return {
      fmt, today, todayInvs, totalBilled, totalCollected, overdueInvs, overdueAmt,
      unpaidInvs, lowStock, outOfStock, stockValue, expRows, todayExp, totalExp,
      grossPL, leads, newLeads, openOpps, pipeVal, activeEmps, onLeave,
      expContracts, wos, overdueWO, subs, subsDue, MRR, alerts,
    };
  }, [invoices?.rows, inventory?.rows, expenses?.rows, crm?.rows,
      employees, leaveRequests?.rows, workOrders?.rows, subscriptions?.rows, smartAlerts]);

  if (!open) return null;

  const { fmt, today, todayInvs, totalBilled, totalCollected, overdueInvs, overdueAmt,
    unpaidInvs, lowStock, outOfStock, stockValue, expRows, todayExp, totalExp,
    grossPL, leads, newLeads, openOpps, pipeVal, activeEmps, onLeave,
    expContracts, wos, overdueWO, subs, subsDue, MRR, alerts } = data;

  const ALERT_CFG = {
    critical: { col:"#EF4444", bg:"#FEF2F2", border:"#FECACA", label:"CRITICAL" },
    high:     { col:"#F59E0B", bg:"#FFFBEB", border:"#FDE68A", label:"HIGH" },
    medium:   { col:"#3B82F6", bg:"#EFF6FF", border:"#BFDBFE", label:"MEDIUM" },
    low:      { col:"#16A34A", bg:"#F0FDF4", border:"#BBF7D0", label:"LOW" },
  };

  // ── PDF export ───────────────────────────────────────────────────────
  function printBriefing() {
    const ACCENT = "#16A34A";
    const DARK   = "#0D2214";
    const genTime = new Date().toLocaleString("en-GB",{dateStyle:"full",timeStyle:"short"});

    const alertRows = alerts.map(a => {
      const ac = ALERT_CFG[a.priority]||ALERT_CFG.medium;
      return `<tr>
        <td style="padding:8px 12px">
          <span style="background:${ac.bg};color:${ac.col};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid ${ac.border}">${ac.label}</span>
        </td>
        <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#111827">${a.title||a.message||""}</td>
        <td style="padding:8px 12px;font-size:11.5px;color:#6B7280">${a.module||""}</td>
        <td style="padding:8px 12px;font-size:11.5px;color:#6B7280">${a.detail||a.description||""}</td>
      </tr>`;
    }).join("");

    const lowStockRows = lowStock.slice(0,10).map((it,i)=>`<tr style="background:${i%2===0?"#fff":"#FEF2F2"}">
      <td style="padding:7px 12px;font-size:12px;font-weight:600;color:#111827">${it.name}</td>
      <td style="padding:7px 12px;font-size:11.5px;color:#6B7280">${it.category||"—"}</td>
      <td style="padding:7px 12px;text-align:center;font-size:12px;font-weight:700;color:${it.stock<=0?"#EF4444":"#F59E0B"}">${it.stock} ${it.unit||""}</td>
      <td style="padding:7px 12px;text-align:center;font-size:11.5px;color:#6B7280">${it.reorderPoint}</td>
      <td style="padding:7px 12px;text-align:right;font-size:11.5px;color:#6B7280">${it.supplierName||"—"}</td>
    </tr>`).join("");

    const overdueRows = overdueInvs.slice(0,10).map((inv,i)=>{
      const bal = lineTotal(inv.items||[]).total-(inv.amountPaid||0);
      const days= Math.ceil((new Date(today)-new Date(inv.dueDate))/86400000);
      return `<tr style="background:${i%2===0?"#fff":"#FEF2F2"}">
        <td style="padding:7px 12px;font-size:11.5px;font-family:monospace;font-weight:700">${inv.id}</td>
        <td style="padding:7px 12px;font-size:12px;font-weight:600;color:#111827">${inv.customer}</td>
        <td style="padding:7px 12px;font-size:11.5px;color:#6B7280">${inv.dueDate}</td>
        <td style="padding:7px 12px;text-align:center;font-size:11.5px;color:#EF4444;font-weight:700">${days} days</td>
        <td style="padding:7px 12px;text-align:right;font-size:12px;font-family:monospace;font-weight:700;color:#EF4444">TZS ${fmt(bal)}k</td>
      </tr>`;
    }).join("");

    const win = window.open("","_blank","width=1050,height=1200");
    if (!win) { notify("Pop-up blocked — allow pop-ups to download the briefing.","error"); return; }
    win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
      <title>Daily Briefing — ${co.name||"SMART MANAGER"} · ${today}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Inter,Arial,sans-serif;background:#F3F4F6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        @media print{body{background:white;font-size:11px}.toolbar{display:none!important}.page{box-shadow:none!important;margin:0!important}}
        .page{max-width:960px;margin:24px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,.12)}
        .hdr{background:${DARK};padding:32px 40px;display:flex;justify-content:space-between;align-items:flex-start}
        .co-name{font-family:'Playfair Display',serif;font-size:22px;font-weight:800;color:white}
        .co-meta{font-size:10.5px;color:rgba(255,255,255,.5);margin-top:4px;line-height:1.7}
        .doc-title{font-size:34px;font-weight:900;color:${ACCENT};text-align:right;letter-spacing:-0.5px}
        .doc-sub{font-size:12px;color:rgba(255,255,255,.5);margin-top:6px;text-align:right}
        .alert-band{padding:16px 40px;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid #E5E7EB}
        .a-pill{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid}
        .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#E5E7EB}
        .kpi{background:white;padding:18px 22px}
        .kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9CA3AF;margin-bottom:4px}
        .kpi-value{font-size:22px;font-weight:900;color:#111827}
        .kpi-sub{font-size:10.5px;color:#6B7280;margin-top:3px}
        .section{padding:24px 40px;border-bottom:1px solid #F3F4F6}
        .sec-hdr{display:flex;align-items:center;gap:8px;margin-bottom:14px}
        .sec-icon{font-size:18px}
        .sec-title{font-size:14px;font-weight:800;color:#111827}
        .sec-badge{background:${DARK};color:white;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
        table.data{width:100%;border-collapse:collapse}
        table.data thead tr{background:${DARK}}
        table.data thead th{padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.7)}
        table.data thead th.r{text-align:right}table.data thead th.c{text-align:center}
        .ftr{background:${DARK};padding:16px 40px;display:flex;justify-content:space-between;align-items:center}
        .ftr-note{font-size:10.5px;color:rgba(255,255,255,.4)}
        .ftr-brand{font-size:11px;font-weight:700;color:${ACCENT}}
        .toolbar{position:fixed;bottom:24px;right:24px;display:flex;gap:8px}
        .btn{padding:10px 20px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:Inter}
        .btn-p{background:${ACCENT};color:white}.btn-c{background:white;color:#111827;border:1.5px solid #E5E7EB}
        .no-data{color:#9CA3AF;font-size:12px;text-align:center;padding:16px 0}
      </style></head><body>
      <div class="page">

        <!-- HEADER -->
        <div class="hdr">
          <div>
            <div class="co-name">${co.name||"SMART MANAGER"}</div>
            <div class="co-meta">${[co.industry,co.city,co.country||"Tanzania"].filter(Boolean).join(" · ")}</div>
            <div class="co-meta" style="margin-top:6px">Prepared for: <strong style="color:rgba(255,255,255,.8)">${currentUser?.name||"Executive"}</strong> (${currentUser?.role||""})</div>
          </div>
          <div>
            <div class="doc-title">Daily Briefing</div>
            <div class="doc-sub">${new Date(today).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
            <div class="doc-sub" style="margin-top:3px">Generated: ${genTime}</div>
          </div>
        </div>

        <!-- ALERT BAND -->
        ${alerts.length>0?`<div class="alert-band">${alerts.slice(0,8).map(a=>{
          const ac=ALERT_CFG[a.priority]||ALERT_CFG.medium;
          return `<div class="a-pill" style="background:${ac.bg};border-color:${ac.border};color:${ac.col}">
            ${a.priority==="critical"?"🚨":a.priority==="high"?"⚠":"ℹ"} ${a.title||a.message||""}
          </div>`;
        }).join("")}</div>`:""}

        <!-- KPI SUMMARY -->
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Total AR Billed</div><div class="kpi-value" style="color:${ACCENT}">TZS ${fmt(totalBilled)}k</div><div class="kpi-sub">${(invoices?.rows||[]).length} invoices</div></div>
          <div class="kpi"><div class="kpi-label">Total Collected</div><div class="kpi-value" style="color:#2563EB">TZS ${fmt(totalCollected)}k</div><div class="kpi-sub">${Math.round(totalBilled>0?totalCollected/totalBilled*100:0)}% collection rate</div></div>
          <div class="kpi"><div class="kpi-label">Overdue AR</div><div class="kpi-value" style="color:${overdueAmt>0?"#EF4444":"#16A34A"}">TZS ${fmt(overdueAmt)}k</div><div class="kpi-sub">${overdueInvs.length} invoices overdue</div></div>
          <div class="kpi"><div class="kpi-label">Gross P&L</div><div class="kpi-value" style="color:${grossPL>=0?"#16A34A":"#EF4444"}">${grossPL>=0?"+":""}TZS ${fmt(Math.abs(grossPL))}k</div><div class="kpi-sub">Collected − Expenses</div></div>
          <div class="kpi"><div class="kpi-label">Inventory Value</div><div class="kpi-value">TZS ${fmt(stockValue)}k</div><div class="kpi-sub">${(inventory?.rows||[]).length} SKUs</div></div>
          <div class="kpi"><div class="kpi-label">Low / Out of Stock</div><div class="kpi-value" style="color:${lowStock.length>0?"#EF4444":"#16A34A"}">${lowStock.length}</div><div class="kpi-sub">${outOfStock.length} completely out</div></div>
          <div class="kpi"><div class="kpi-label">Active Staff</div><div class="kpi-value">${activeEmps.length}</div><div class="kpi-sub">${onLeave.length} on leave today</div></div>
          <div class="kpi"><div class="kpi-label">Pipeline Value</div><div class="kpi-value" style="color:#7C3AED">TZS ${fmt(pipeVal)}k</div><div class="kpi-sub">${openOpps.length} open opportunities</div></div>
        </div>

        <!-- ALERTS TABLE -->
        ${alerts.length>0?`<div class="section">
          <div class="sec-hdr"><span class="sec-icon">🚨</span><span class="sec-title">Active Alerts</span><span class="sec-badge">${alerts.length}</span></div>
          <table class="data"><thead><tr>
            <th>Priority</th><th>Alert</th><th>Module</th><th>Detail</th>
          </tr></thead><tbody>${alertRows}</tbody></table>
        </div>`:""}

        <!-- OVERDUE INVOICES -->
        ${overdueInvs.length>0?`<div class="section">
          <div class="sec-hdr"><span class="sec-icon">📄</span><span class="sec-title">Overdue Invoices</span><span class="sec-badge">${overdueInvs.length}</span></div>
          <table class="data"><thead><tr>
            <th>Invoice</th><th>Customer</th><th>Due Date</th><th class="c">Days Overdue</th><th class="r">Balance (TZS)</th>
          </tr></thead><tbody>${overdueRows}</tbody></table>
        </div>`:`<div class="section"><div class="sec-hdr"><span class="sec-icon">✅</span><span class="sec-title" style="color:#16A34A">No Overdue Invoices</span></div></div>`}

        <!-- LOW STOCK -->
        ${lowStock.length>0?`<div class="section">
          <div class="sec-hdr"><span class="sec-icon">📦</span><span class="sec-title">Low Stock / Reorder Needed</span><span class="sec-badge">${lowStock.length}</span></div>
          <table class="data"><thead><tr>
            <th>Item</th><th>Category</th><th class="c">Current Stock</th><th class="c">Reorder Point</th><th>Preferred Supplier</th>
          </tr></thead><tbody>${lowStockRows}</tbody></table>
        </div>`:`<div class="section"><div class="sec-hdr"><span class="sec-icon">✅</span><span class="sec-title" style="color:#16A34A">All Stock Levels Healthy</span></div></div>`}

        <!-- HR SNAPSHOT -->
        <div class="section">
          <div class="sec-hdr"><span class="sec-icon">👥</span><span class="sec-title">HR Snapshot</span></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="background:#F8FAFB;border-radius:10px;padding:14px">
              <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Active Employees</div>
              <div style="font-size:22px;font-weight:800;color:#111827">${activeEmps.length}</div>
            </div>
            <div style="background:${onLeave.length>0?"#FFFBEB":"#F8FAFB"};border-radius:10px;padding:14px">
              <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">On Leave Today</div>
              <div style="font-size:22px;font-weight:800;color:${onLeave.length>0?"#F59E0B":"#111827"}">${onLeave.length}</div>
              ${onLeave.slice(0,2).map(l=>`<div style="font-size:10.5px;color:#92400E;margin-top:3px">${l.employeeName||l.employee||"—"}</div>`).join("")}
            </div>
            <div style="background:${expContracts.length>0?"#FEF2F2":"#F8FAFB"};border-radius:10px;padding:14px">
              <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Expiring Contracts (30d)</div>
              <div style="font-size:22px;font-weight:800;color:${expContracts.length>0?"#EF4444":"#111827"}">${expContracts.length}</div>
            </div>
          </div>
          ${overdueWO.length>0?`<div style="margin-top:12px;background:#FEF2F2;border-radius:10px;padding:12px">
            <div style="font-size:11px;font-weight:700;color:#EF4444;margin-bottom:6px">⚠ ${overdueWO.length} Work Order${overdueWO.length>1?"s":""} Overdue</div>
            ${overdueWO.slice(0,3).map(w=>`<div style="font-size:11.5px;color:#374151;margin-bottom:2px">• ${w.productName||w.title||w.id} — due ${w.dueDate}</div>`).join("")}
          </div>`:""}
        </div>

        <!-- CRM + SUBSCRIPTIONS -->
        <div class="section">
          <div class="sec-hdr"><span class="sec-icon">📊</span><span class="sec-title">CRM & Revenue</span></div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            ${[
              ["New Leads Today",String(newLeads.length),"#2563EB"],
              ["Open Opportunities",String(openOpps.length),"#7C3AED"],
              ["Pipeline Value","TZS "+fmt(pipeVal)+"k","#7C3AED"],
              ["MRR (Active Subs)","TZS "+fmt(MRR)+"k","#16A34A"],
            ].map(([l,v,col])=>`<div style="background:#F8FAFB;border-radius:10px;padding:14px">
              <div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">${l}</div>
              <div style="font-size:18px;font-weight:800;color:${col}">${v}</div>
            </div>`).join("")}
          </div>
          ${subsDue.length>0?`<div style="margin-top:12px;background:#FFFBEB;border-radius:10px;padding:12px">
            <div style="font-size:11px;font-weight:700;color:#F59E0B;margin-bottom:6px">⏰ ${subsDue.length} Subscription${subsDue.length>1?"s":""} Due for Billing (Next 7 Days)</div>
            ${subsDue.slice(0,3).map(s=>`<div style="font-size:11.5px;color:#374151;margin-bottom:2px">• ${s.customer} — ${s.plan} — ${s.nextBillingDate}</div>`).join("")}
          </div>`:""}
        </div>

        <!-- FOOTER -->
        <div class="ftr">
          <div class="ftr-note">Confidential — For executive use only · ${co.name||"SMART MANAGER"} · ${genTime}</div>
          <div class="ftr-brand">SMART MANAGER Daily Brief</div>
        </div>
      </div>

      <div class="toolbar">
        <button class="btn btn-c" onclick="window.close()">Close</button>
        <button class="btn btn-p" onclick="window.print()">Download / Print PDF</button>
      </div>
    </body></html>`);
    win.document.close();
    setTimeout(()=>win.focus(),200);
    notify("Daily Briefing PDF ready — print or save");
  }

  // ── Render: full-page modal overlay ─────────────────────────────────
  const criticals = alerts.filter(a=>a.priority==="critical");
  const highs     = alerts.filter(a=>a.priority==="high");
  const fmtCur    = (n) => "TZS " + new Intl.NumberFormat("en-US").format(Math.round(n||0)) + "k";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:"rgba(13,34,20,0.7)",backdropFilter:"blur(4px)"}}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] mx-4 flex flex-col overflow-hidden"
        style={{animation:"briefingIn .35s cubic-bezier(.22,1,.36,1)"}}>

        {/* ── Header bar ── */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-slate-100" style={{background:"#0D2214"}}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-[#16A34A] uppercase tracking-widest">SMART MANAGER</span>
                <span className="text-[rgba(255,255,255,.3)]">·</span>
                <span className="text-[10.5px] text-[rgba(255,255,255,.4)] font-mono">{new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</span>
              </div>
              <h1 className="text-white text-[24px] font-black tracking-tight leading-none">Good {new Date().getHours()<12?"morning":new Date().getHours()<17?"afternoon":"evening"}, {(currentUser?.name||"").split(" ")[0]} 👋</h1>
              <p className="text-[rgba(255,255,255,.5)] text-[12.5px] mt-1.5">Here is your daily business briefing for {co.name||"your company"}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={printBriefing}
                className="flex items-center gap-1.5 text-[12px] font-bold text-white px-3.5 py-2 rounded-xl border border-[rgba(255,255,255,.15)] hover:bg-[rgba(255,255,255,.08)]">
                <Printer size={13}/> PDF
              </button>
              <button onClick={()=>setOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[rgba(255,255,255,.6)] hover:text-white hover:bg-[rgba(255,255,255,.1)]">
                <X size={16}/>
              </button>
            </div>
          </div>

          {/* Alert summary pills */}
          {(criticals.length>0||highs.length>0) && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {criticals.length>0&&<span className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-[#EF4444] px-3 py-1 rounded-full">🚨 {criticals.length} Critical</span>}
              {highs.length>0&&<span className="flex items-center gap-1.5 text-[11px] font-bold text-[#111827] bg-[#F59E0B] px-3 py-1 rounded-full">⚠ {highs.length} High</span>}
              {lowStock.length>0&&<span className="flex items-center gap-1.5 text-[11px] font-bold text-[#EF4444] bg-[#FEF2F2] border border-[#FECACA] px-3 py-1 rounded-full">📦 {lowStock.length} Low Stock</span>}
              {overdueInvs.length>0&&<span className="flex items-center gap-1.5 text-[11px] font-bold text-[#F59E0B] bg-[#FFFBEB] border border-[#FDE68A] px-3 py-1 rounded-full">⏰ {overdueInvs.length} Overdue Invoices</span>}
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100">
            {[
              {l:"Total AR Billed",   v:fmtCur(data.totalBilled),   col:"#16A34A", sub:(invoices?.rows||[]).length+" invoices"},
              {l:"Collected",         v:fmtCur(data.totalCollected), col:"#2563EB", sub:Math.round(data.totalBilled>0?data.totalCollected/data.totalBilled*100:0)+"% rate"},
              {l:"Overdue AR",        v:fmtCur(data.overdueAmt),    col:data.overdueAmt>0?"#EF4444":"#16A34A", sub:data.overdueInvs.length+" invoices"},
              {l:"Gross P&L",         v:(data.grossPL>=0?"+":"")+fmtCur(Math.abs(data.grossPL)), col:data.grossPL>=0?"#16A34A":"#EF4444", sub:"Collected − Expenses"},
              {l:"Inventory Value",   v:fmtCur(data.stockValue),    col:"#111827", sub:(inventory?.rows||[]).length+" SKUs"},
              {l:"Low/Out of Stock",  v:String(data.lowStock.length),col:data.lowStock.length>0?"#EF4444":"#16A34A", sub:data.outOfStock.length+" completely out"},
              {l:"Active Staff",      v:String(data.activeEmps.length),col:"#111827", sub:data.onLeave.length+" on leave today"},
              {l:"Pipeline Value",    v:fmtCur(data.pipeVal),       col:"#7C3AED", sub:data.openOpps.length+" open opps"},
            ].map(({l,v,col,sub})=>(
              <div key={l} className="bg-white px-4 py-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">{l}</p>
                <p className="text-[19px] font-black" style={{color:col}}>{v}</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* 🚨 ALERTS SECTION */}
          {alerts.length > 0 && (
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-[14px] font-black text-[#111827] mb-3 flex items-center gap-2">
                🚨 Active Alerts <span className="text-[11px] font-bold text-white bg-[#EF4444] px-2 py-0.5 rounded-full">{alerts.length}</span>
              </h2>
              <div className="space-y-2">
                {alerts.map((a, i) => {
                  const ac = ALERT_CFG[a.priority] || ALERT_CFG.medium;
                  return (
                    <div key={i} className="flex items-start gap-3 px-3 py-3 rounded-xl border"
                      style={{background:ac.bg, borderColor:ac.border}}>
                      <span className="text-[16px] shrink-0 mt-0.5">{a.priority==="critical"?"🚨":a.priority==="high"?"⚠️":"ℹ️"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:ac.col,color:"white"}}>{ac.label}</span>
                          <span className="text-[10.5px] font-semibold text-slate-500">{a.module||""}</span>
                        </div>
                        <p className="text-[13px] font-bold" style={{color:ac.col}}>{a.title||a.message||""}</p>
                        {(a.detail||a.description)&&<p className="text-[11.5px] text-slate-500 mt-0.5">{a.detail||a.description}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 📦 INVENTORY ALERTS */}
          {(lowStock.length > 0 || outOfStock.length > 0) && (
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-[14px] font-black text-[#111827] mb-3 flex items-center gap-2">
                📦 Low Stock Items <span className="text-[11px] font-bold text-white bg-[#EF4444] px-2 py-0.5 rounded-full">{lowStock.length}</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="bg-[#0D2214]">
                    {["Item","Category","Stock","Reorder Point","Supplier","Status"].map(h=>(
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[rgba(255,255,255,.7)]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {lowStock.slice(0,8).map((it,i)=>(
                      <tr key={it.id} className={i%2===0?"bg-white":"bg-[#FEF2F2]/50"}>
                        <td className="px-3 py-2.5 font-bold text-[#111827]">{it.name}</td>
                        <td className="px-3 py-2.5 text-slate-500">{it.category||"—"}</td>
                        <td className="px-3 py-2.5 font-mono font-black" style={{color:it.stock<=0?"#EF4444":"#F59E0B"}}>{it.stock} {it.unit||""}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{it.reorderPoint}</td>
                        <td className="px-3 py-2.5 text-slate-500">{it.supplierName||"—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${it.stock<=0?"bg-[#EF4444] text-white":"bg-[#FEF2F2] text-[#EF4444] border border-[#FECACA]"}`}>
                            {it.stock<=0?"🚨 OUT OF STOCK":"⚠ REORDER NOW"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 📄 OVERDUE INVOICES */}
          {overdueInvs.length > 0 && (
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-[14px] font-black text-[#111827] mb-3 flex items-center gap-2">
                📄 Overdue Invoices <span className="text-[11px] font-bold text-white bg-[#F59E0B] px-2 py-0.5 rounded-full">{overdueInvs.length}</span>
                <span className="text-[13px] font-black text-[#EF4444] ml-auto">{fmtCur(data.overdueAmt)} outstanding</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="bg-[#0D2214]">
                    {["Invoice","Customer","Due Date","Days Late","Balance"].map(h=>(
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[rgba(255,255,255,.7)]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {overdueInvs.slice(0,8).map((inv,i)=>{
                      const bal  = lineTotal(inv.items||[]).total-(inv.amountPaid||0);
                      const days = Math.ceil((new Date(TODAY_STR)-new Date(inv.dueDate))/86400000);
                      return (
                        <tr key={inv.id} className={i%2===0?"bg-white":"bg-[#FEF2F2]/50"}>
                          <td className="px-3 py-2.5 font-mono font-bold text-[#111827]">{inv.id}</td>
                          <td className="px-3 py-2.5 font-semibold text-[#111827]">{inv.customer}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-500">{inv.dueDate}</td>
                          <td className="px-3 py-2.5">
                            <span className={`font-bold ${days>30?"text-[#EF4444]":days>14?"text-[#F59E0B]":"text-[#374151]"}`}>{days}d</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-black text-[#EF4444]">{fmtCur(bal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 👥 HR + 📊 CRM snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
            <div className="px-6 py-4">
              <h2 className="text-[14px] font-black text-[#111827] mb-3">👥 HR Snapshot</h2>
              <div className="space-y-2">
                {[
                  ["Active Employees", activeEmps.length, "#111827"],
                  ["On Leave Today",   onLeave.length,    onLeave.length>0?"#F59E0B":"#16A34A"],
                  ["Expiring Contracts (30d)", expContracts.length, expContracts.length>0?"#EF4444":"#16A34A"],
                  ["Overdue Work Orders", data.overdueWO.length, data.overdueWO.length>0?"#EF4444":"#16A34A"],
                ].map(([l,v,col])=>(
                  <div key={l} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-[12.5px] text-slate-600">{l}</span>
                    <span className="text-[14px] font-black" style={{color:col}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4">
              <h2 className="text-[14px] font-black text-[#111827] mb-3">📊 CRM & Revenue</h2>
              <div className="space-y-2">
                {[
                  ["New Leads Today",       newLeads.length,      "#2563EB"],
                  ["Open Opportunities",    openOpps.length,      "#7C3AED"],
                  ["Pipeline Value",        fmtCur(pipeVal),      "#7C3AED"],
                  ["Monthly Recurring Rev", fmtCur(MRR),          "#16A34A"],
                  ["Subs Due (7 days)",     subsDue.length,       subsDue.length>0?"#F59E0B":"#16A34A"],
                ].map(([l,v,col])=>(
                  <div key={l} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-[12.5px] text-slate-600">{l}</span>
                    <span className="text-[14px] font-black" style={{color:col}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Good standing notice */}
          {alerts.length===0&&lowStock.length===0&&overdueInvs.length===0&&(
            <div className="mx-6 my-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-4 text-center">
              <p className="text-[15px] font-black text-[#16A34A]">✅ Business Health: All Clear</p>
              <p className="text-[12.5px] text-[#166534] mt-1">No critical alerts, no low stock, no overdue invoices. Business is running smoothly.</p>
            </div>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="shrink-0 px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Auto-shows once per day · Re-open anytime from the top bar</p>
          <div className="flex gap-2">
            <button onClick={printBriefing}
              className="flex items-center gap-1.5 text-[12.5px] font-bold text-white px-4 py-2 rounded-xl bg-[#16A34A]">
              <Printer size={13}/> Download PDF
            </button>
            <button onClick={()=>setOpen(false)}
              className="text-[12.5px] font-medium text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-white">
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes briefingIn {
          from{opacity:0;transform:scale(.96) translateY(20px)}
          to{opacity:1;transform:scale(1)    translateY(0)}
        }
      `}</style>
    </div>
  );
}
