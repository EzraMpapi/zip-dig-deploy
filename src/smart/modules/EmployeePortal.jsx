import { useEffect, useMemo, useState } from "react";
import {
  AtSign, Banknote, Bell, CalendarCheck, ClipboardList, Clock, Fingerprint, GraduationCap,
  History, LayoutDashboard, LogIn, LogOut, MessageCircle, PhoneCall, Plus, Printer, Receipt,
  Search, Send, UserCircle, Users
} from "lucide-react";
import { inputClass } from "../components/ui.jsx";
import { attendanceSeed, trainingSeed } from "../data/hr.jsx";
import { logAudit } from "../lib/buses.jsx";
import { b64ToBuf, bufToB64 } from "../lib/crypto.jsx";
import { TODAY, docId, money } from "../lib/format.jsx";
import { mapAttendanceRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { Attendance, dutiesSeed, mapDutyRow } from "../modules/HR.jsx";
import { ANNOUNCEMENTS_SEED, ANN_CAT_COLORS } from "../modules/Restaurant.jsx";

export function PortalNoticeboard({ company }) {
  const co = company || {};
  const [filter, setFilter] = useState("All");
  const categories = ["All","HR","General","Benefits","Events","Safety"];
  const filtered = filter==="All" ? ANNOUNCEMENTS_SEED : ANNOUNCEMENTS_SEED.filter(a=>a.category===filter);
  const pinned   = filtered.filter(a=>a.pinned);
  const regular  = filtered.filter(a=>!a.pinned);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-[#111827]">📌 Company Noticeboard</h2>
          <p className="text-[12px] text-slate-500">{co.name||"SMART MANAGER"} · Official Announcements</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 overflow-x-auto">
          {categories.map(cat=>(
            <button key={cat} onClick={()=>setFilter(cat)}
              className={`px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap ${filter===cat?"bg-white text-[#111827] shadow-sm":"text-slate-500"}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Pinned announcements */}
      {pinned.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">📌 Pinned</p>
          {pinned.map(ann => {
            const [bg,col,border] = ANN_CAT_COLORS[ann.category]||["#F8FAFB","#374151","#E5E7EB"];
            return (
              <div key={ann.id} className="rounded-xl border-l-4 p-4 shadow-sm" style={{background:bg,borderLeftColor:col,border:`1px solid ${border}`,borderLeftWidth:4}}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{background:col+"22",color:col}}>{ann.category}</span>
                      <span className="text-[10.5px] font-bold text-[#EF4444] bg-[#FEF2F2] px-2 py-0.5 rounded-full">{ann.priority}</span>
                    </div>
                    <h3 className="text-[14px] font-bold text-[#111827] mb-1">{ann.title}</h3>
                    <p className="text-[12.5px] text-slate-600 leading-relaxed">{ann.body}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-400">
                  <span>By {ann.author}</span>
                  <span>·</span>
                  <span>{ann.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Regular announcements */}
      <div className="space-y-2">
        {regular.length===0&&pinned.length===0&&(
          <div className="bg-white rounded-xl border p-10 text-center text-slate-400">
            <Bell size={32} className="mx-auto mb-2 text-slate-200"/>
            <p>No announcements in this category</p>
          </div>
        )}
        {regular.map(ann=>{
          const [bg,col,border] = ANN_CAT_COLORS[ann.category]||["#F8FAFB","#374151","#E5E7EB"];
          return (
            <div key={ann.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[16px]" style={{background:bg}}>
                  {ann.category==="HR"?"👥":ann.category==="Benefits"?"🎁":ann.category==="Events"?"🗓":ann.category==="Safety"?"⚠️":"📢"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{background:col+"22",color:col}}>{ann.category}</span>
                    <span className="text-[11px] text-slate-400">{ann.date}</span>
                  </div>
                  <h3 className="text-[13px] font-bold text-[#111827]">{ann.title}</h3>
                  <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{ann.body}</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">By {ann.author}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Team Directory ────────────────────────────────────────────────────────
export function PortalTeam({ employees, self, empName }) {
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");

  const depts = ["All", ...new Set(employees.filter(e=>e.status==="Active").map(e=>e.department).filter(Boolean))].sort();
  const filtered = employees.filter(e=>
    e.status==="Active" &&
    (deptFilter==="All" || e.department===deptFilter) &&
    (!query.trim() || e.name.toLowerCase().includes(query.toLowerCase()) || e.role?.toLowerCase().includes(query.toLowerCase()))
  );

  const DEPT_COLORS = ["#2563EB","#16A34A","#D97706","#7C3AED","#EF4444","#0891B2","#059669","#DC2626"];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-[#111827]">👥 Our Team</h2>
          <p className="text-[12px] text-slate-500">{filtered.length} colleagues · {depts.length-1} departments</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={query} onChange={e=>setQuery(e.target.value)}
              className="border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[12.5px] outline-none bg-white w-48"
              placeholder="Search name or role…"/>
          </div>
        </div>
      </div>

      {/* Department filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {depts.map((d,i)=>(
          <button key={d} onClick={()=>setDeptFilter(d)}
            className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-all ${
              deptFilter===d
                ? "text-white border-transparent"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
            style={deptFilter===d?{background:i===0?"#0D2214":DEPT_COLORS[(i-1)%DEPT_COLORS.length]}:{}}>
            {d}
          </button>
        ))}
      </div>

      {/* Team grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((emp,idx)=>{
          const deptIdx = depts.indexOf(emp.department);
          const avatarBg = DEPT_COLORS[(deptIdx-1+DEPT_COLORS.length)%DEPT_COLORS.length] || "#0D2214";
          const isSelf = emp.id === self?.id || emp.name === empName;
          return (
            <div key={emp.id} className={`bg-white rounded-xl border shadow-sm p-4 transition-all hover:shadow-md ${isSelf?"border-[#16A34A]/40 ring-1 ring-[#16A34A]/20":""}`}>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[18px] font-black shrink-0"
                  style={{background:avatarBg}}>
                  {emp.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[13.5px] font-bold text-[#111827] truncate">{emp.name}</p>
                    {isSelf&&<span className="text-[9.5px] font-black text-[#16A34A] bg-[#F0FDF4] px-1.5 py-0.5 rounded-full border border-[#BBF7D0]">YOU</span>}
                  </div>
                  <p className="text-[11.5px] text-slate-500 truncate">{emp.role}</p>
                  <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1"
                    style={{background:avatarBg+"18",color:avatarBg}}>
                    {emp.department}
                  </span>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                {emp.email&&(
                  <a href={`mailto:${emp.email}`} className="flex items-center gap-2 text-[11.5px] text-slate-500 hover:text-[#2563EB] transition-colors">
                    <AtSign size={12} className="shrink-0"/><span className="truncate">{emp.email}</span>
                  </a>
                )}
                {emp.phone&&(
                  <a href={`tel:${emp.phone}`} className="flex items-center gap-2 text-[11.5px] text-slate-500 hover:text-[#16A34A] transition-colors">
                    <PhoneCall size={12} className="shrink-0"/><span>{emp.phone}</span>
                  </a>
                )}
                {emp.phone&&(
                  <a href={`https://wa.me/${emp.phone.replace(/[^0-9]/g,"")}?text=Hi ${emp.name.split(" ")[0]},`}
                    target="_blank" rel="noopener"
                    className="flex items-center gap-2 text-[11.5px] font-semibold rounded-lg px-2 py-1 mt-1"
                    style={{color:"#16A34A",background:"#F0FDF4"}}>
                    <MessageCircle size={12}/> WhatsApp
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length===0&&(
        <div className="bg-white rounded-xl border p-10 text-center text-slate-400">
          <Users size={32} className="mx-auto mb-2 text-slate-200"/>
          <p>No team members found</p>
        </div>
      )}
    </div>
  );
}

// ── Employee Expenses ─────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES_PERSONAL = ["Travel","Meals & Entertainment","Office Supplies","Communication","Training","Medical","Transport","Other"];

export function PortalExpenses({ empName, employees }) {
  const [form, setForm] = useState({ category:"Travel", description:"", amount:"", date:TODAY.toISOString().slice(0,10), receipt:"" });
  const [claims, setClaims] = useState([
    { id:"CLM-001", category:"Travel",  description:"Taxi to client site — Uzuri Beauty",  amount:45,  date:"2026-07-18", status:"Approved",  approvedBy:"HR Manager" },
    { id:"CLM-002", category:"Meals",   description:"Team lunch — July strategy meeting",  amount:120, date:"2026-07-15", status:"Pending",   approvedBy:null },
    { id:"CLM-003", category:"Transport",description:"Fuel reimbursement — delivery run",  amount:85,  date:"2026-07-10", status:"Rejected",  approvedBy:"Finance Manager" },
  ]);
  const [showForm, setShowForm] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  function submitClaim() {
    if (!form.description.trim()||!form.amount) { notify("Description and amount are required","error"); return; }
    const claim = {
      id:docId("CLM"), category:form.category, description:form.description,
      amount:Number(form.amount), date:form.date, status:"Pending", approvedBy:null,
    };
    setClaims(p=>[claim,...p]);
    setForm({category:"Travel",description:"",amount:"",date:TODAY.toISOString().slice(0,10),receipt:""});
    setShowForm(false);
    notify("Expense claim submitted — awaiting finance approval");
    logAudit("Expense claim","Employee Portal",empName,`${claim.category} TZS ${claim.amount}k`);
  }

  const totalApproved = claims.filter(c=>c.status==="Approved").reduce((s,c)=>s+c.amount,0);
  const totalPending  = claims.filter(c=>c.status==="Pending").reduce((s,c)=>s+c.amount,0);

  const STATUS_CFG = {
    Approved:{ col:"#16A34A", bg:"#F0FDF4", icon:"✅" },
    Pending: { col:"#F59E0B", bg:"#FFFBEB", icon:"⏳" },
    Rejected:{ col:"#EF4444", bg:"#FEF2F2", icon:"❌" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[16px] font-bold text-[#111827]">🧾 My Expense Claims</h2>
          <p className="text-[12px] text-slate-500">Submit and track reimbursement requests</p>
        </div>
        <button onClick={()=>setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-[12.5px] font-bold text-white px-3.5 py-2 rounded-xl bg-[#16A34A]">
          <Plus size={13}/> New Claim
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Total Claims",   String(claims.length),              "#111827"],
          ["Approved",       `TZS ${money(totalApproved)}k`,    "#16A34A"],
          ["Pending Review", `TZS ${money(totalPending)}k`,     "#F59E0B"],
        ].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[18px] font-black" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      {/* Expense form */}
      {showForm&&(
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h3 className="text-[14px] font-bold text-[#111827] mb-4">New Expense Claim</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Category</label>
              <select className={inputClass} value={form.category} onChange={e=>set("category",e.target.value)}>
                {EXPENSE_CATEGORIES_PERSONAL.map(cat=><option key={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Amount (TZS k) *</label>
              <input type="number" className={inputClass} value={form.amount} onChange={e=>set("amount",e.target.value)} placeholder="e.g. 45"/>
            </div>
            <div>
              <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Date</label>
              <input type="date" className={inputClass} value={form.date} onChange={e=>set("date",e.target.value)} max={TODAY.toISOString().slice(0,10)}/>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Description *</label>
              <input className={inputClass} value={form.description} onChange={e=>set("description",e.target.value)} placeholder="What was this expense for?"/>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Receipt Reference / Note (optional)</label>
              <input className={inputClass} value={form.receipt} onChange={e=>set("receipt",e.target.value)} placeholder="Receipt no., vendor name, etc."/>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={()=>setShowForm(false)} className="flex-1 text-[12.5px] font-medium border border-slate-200 rounded-xl py-2.5 text-slate-500">Cancel</button>
            <button onClick={submitClaim} className="flex-1 text-[12.5px] font-bold text-white rounded-xl py-2.5 bg-[#16A34A]">Submit Claim</button>
          </div>
        </div>
      )}

      {/* Claims list */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[13.5px] font-bold text-[#111827]">Claims History ({claims.length})</p>
        </div>
        {claims.length===0?(
          <div className="py-10 text-center text-slate-400">
            <Receipt size={32} className="mx-auto mb-2 text-slate-200"/>
            <p>No expense claims yet. Submit your first claim above.</p>
          </div>
        ):(
          <div className="divide-y divide-slate-50">
            {claims.map(claim=>{
              const sc = STATUS_CFG[claim.status]||STATUS_CFG.Pending;
              return (
                <div key={claim.id} className="px-4 py-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] shrink-0" style={{background:sc.bg}}>
                    {sc.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-bold text-[#111827]">{claim.description}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{background:sc.bg,color:sc.col}}>{claim.category}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{claim.date}</span>
                          {claim.approvedBy&&<span className="text-[10.5px] text-slate-400">· {claim.approvedBy}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[14px] font-black font-mono" style={{color:sc.col}}>TZS {money(claim.amount)}k</p>
                        <span className="text-[10.5px] font-bold" style={{color:sc.col}}>{sc.icon} {claim.status}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Training Tracker ──────────────────────────────────────────────────────
export function PortalTraining({ empName }) {
  const training = useCompanyTable("hr_training", trainingSeed, {
    order:{ col:"course", ascending:true }, mapRow:r=>r,
  });
  const myTraining = training.rows.filter(t=>
    t.employee?.toLowerCase().includes(empName.split(" ")[0].toLowerCase())||
    t.employee===empName
  );

  async function markDone(id) {
    const today = TODAY.toISOString().slice(0,10);
    training.setRows(p=>p.map(t=>t.id===id?{...t,status:"Completed",completionDate:today}:t));
    notify("Training marked as completed");
    logAudit("Training completed","Employee Portal",empName,id);
    if (IS_CONFIGURED) {
      try { await sb("hr_training").eq("id",id).update({status:"Completed",completion_date:today}).run(); } catch(_e){}
    }
  }

  const done       = myTraining.filter(t=>t.status==="Completed").length;
  const inProgress = myTraining.filter(t=>t.status==="In Progress").length;
  const pending    = myTraining.filter(t=>t.status==="Not Started").length;
  const pct        = myTraining.length > 0 ? Math.round(done/myTraining.length*100) : 0;

  const STATUS_CFG_T = {
    "Completed":  {col:"#16A34A",bg:"#F0FDF4",icon:"✅",label:"Completed"},
    "In Progress":{col:"#F59E0B",bg:"#FFFBEB",icon:"▶️",label:"In Progress"},
    "Not Started":{col:"#94A3B8",bg:"#F1F5F9",icon:"📚",label:"Not Started"},
  };

  // All available training (company-wide + mine)
  const allTraining = training.rows.slice(0,10);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-[#111827]">📚 My Training</h2>
        <p className="text-[12px] text-slate-500">Assigned courses, progress, and completions</p>
      </div>

      {/* Progress summary */}
      <div className="bg-[#0D2214] rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-semibold text-[rgba(255,255,255,.7)]">Overall Progress</p>
          <p className="text-[28px] font-black text-[#16A34A]">{pct}%</p>
        </div>
        <div className="w-full h-2.5 bg-[rgba(255,255,255,.1)] rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full bg-[#16A34A] transition-all" style={{width:pct+"%"}}/>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[["Completed",done,"#16A34A"],["In Progress",inProgress,"#F59E0B"],["Not Started",pending,"#94A3B8"]].map(([l,v,col])=>(
            <div key={l} className="text-center">
              <p className="text-[22px] font-black" style={{color:col}}>{v}</p>
              <p className="text-[10px] text-[rgba(255,255,255,.5)] uppercase tracking-wide">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* My assigned courses */}
      {myTraining.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[13.5px] font-bold text-[#111827]">My Courses ({myTraining.length})</p>
          </div>
          <div className="divide-y divide-slate-50">
            {myTraining.map(t=>{
              const sc = STATUS_CFG_T[t.status]||STATUS_CFG_T["Not Started"];
              return (
                <div key={t.id} className="px-4 py-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] shrink-0" style={{background:sc.bg}}>
                    {sc.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-bold text-[#111827]">{t.course}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{background:sc.bg,color:sc.col}}>{sc.label}</span>
                          {t.completionDate&&<span className="text-[11px] text-slate-400 font-mono">{t.completionDate}</span>}
                        </div>
                      </div>
                      {t.status!=="Completed"&&(
                        <button onClick={()=>markDone(t.id)}
                          className="text-[11px] font-bold text-white bg-[#16A34A] px-3 py-1.5 rounded-lg shrink-0">
                          ✓ Mark Done
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {myTraining.length===0&&(
        <div className="bg-white rounded-xl border p-8 text-center text-slate-400">
          <GraduationCap size={32} className="mx-auto mb-2 text-slate-200"/>
          <p className="text-[13px]">No training assigned to you yet.</p>
          <p className="text-[12px] mt-1">HR will assign courses — check back soon.</p>
        </div>
      )}

      {/* Available training (company-wide) */}
      {allTraining.filter(t=>t.employee!==empName&&!myTraining.find(m=>m.course===t.course)).length>0&&(
        <div>
          <p className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wide mb-2">📖 Company Training Library</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allTraining.filter(t=>t.employee!==empName&&!myTraining.find(m=>m.course===t.course)).slice(0,4).map(t=>{
              const sc = STATUS_CFG_T[t.status]||STATUS_CFG_T["Not Started"];
              return (
                <div key={t.id} className="bg-white rounded-xl border border-slate-200/80 p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:sc.bg}}>
                      {sc.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-bold text-[#111827] truncate">{t.course}</p>
                      <p className="text-[11px] text-slate-400">{t.employee} · {sc.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function EmployeePortal({ currentUser, company, employees, leaveRequests, canManage }) {
  const co = company || {};
  const TODAY_STR = TODAY.toISOString().slice(0,10);

  // ── Identity ──────────────────────────────────────────────────────────
  // In a real auth system this comes from session; here we resolve from
  // employees list by currentUser.name, or use invite code onboarding.
  const [portalView, setPortalView] = useState("identify"); // identify | portal
  const [inviteInput, setInviteInput] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [selfName, setSelfName] = useState("");
  const [selfPhone, setSelfPhone] = useState("");
  const [selfEmail, setSelfEmail] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  // Find self in employees list
  const self = useMemo(()=>
    employees.find(e=>e.name.toLowerCase()===currentUser.name.toLowerCase()) ||
    employees.find(e=>e.name.toLowerCase().includes(currentUser.name.split(" ")[0].toLowerCase()))
  , [employees, currentUser.name]);

  // Auto-identify if we're an employee
  useEffect(()=>{
    if (self || canManage) setPortalView("portal");
  }, [self, canManage]);

  // ── Attendance / Clock In/Out ─────────────────────────────────────────
  const attendance = useCompanyTable("hr_attendance", attendanceSeed, {
    order:{ col:"attendance_date", ascending:false }, mapRow:mapAttendanceRow,
  });
  const myAttendance = useMemo(()=>
    attendance.rows.filter(a=>(self?.name||currentUser.name).toLowerCase().includes(a.employee?.toLowerCase()||"")||
      a.employee?.toLowerCase().includes((self?.name||currentUser.name).split(" ")[0].toLowerCase()))
  , [attendance.rows, self, currentUser.name]);

  const todayAtt = myAttendance.find(a=>a.date===TODAY_STR);
  const [clockedIn, setClockedIn] = useState(()=>todayAtt?.clockIn&&!todayAtt?.clockOut);

  const [clockInLocation,  setClockInLocation]  = useState(null);
  const [bioEnrolled,      setBioEnrolled]      = useState(false);
  const [bioAvailable,     setBioAvailable]     = useState(null);  // null=checking, true/false
  const [bioVerifying,     setBioVerifying]     = useState(false);
  const [bioSetupOpen,     setBioSetupOpen]     = useState(false);

  const BIO_KEY = `bs_ep_bio_${(self?.id||currentUser.name).replace(/\s+/g,"_")}`;

  // Check biometric availability + enrollment status
  useEffect(() => {
    if (!window.PublicKeyCredential) { setBioAvailable(false); return; }
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(available => {
        setBioAvailable(available);
        if (available) setBioEnrolled(!!localStorage.getItem(BIO_KEY));
      })
      .catch(() => setBioAvailable(false));
  }, [BIO_KEY]);

  // Enroll biometrics for this employee on this device
  async function enrollBiometric() {
    setBioVerifying(true);
    try {
      const name = self?.name || currentUser.name;
      const userId = self?.id || currentUser.name;
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: "SMART MANAGER Employee Portal" },
          user: { id: new TextEncoder().encode(userId), name, displayName: name },
          pubKeyCredParams: [{ type:"public-key", alg:-7 }, { type:"public-key", alg:-257 }],
          authenticatorSelection: { authenticatorAttachment:"platform", userVerification:"required" },
          timeout: 60000,
        },
      });
      const b64 = bufToB64(cred.rawId);
      localStorage.setItem(BIO_KEY, b64);
      setBioEnrolled(true);
      setBioSetupOpen(false);
      notify(`🔒 Biometric registered for ${name} on this device — clock-ins are now biometrically verified`);
      logAudit("Biometric enrollment","Employee Portal",name,"Device biometric registered");
    } catch(_e) {
      notify("Biometric enrollment cancelled or not supported on this device.","error");
    } finally { setBioVerifying(false); }
  }

  // Verify biometric before clock-in/out/duty actions
  async function verifyBiometric() {
    const stored = localStorage.getItem(BIO_KEY);
    if (!stored) return { method:"none", verified:false };
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type:"public-key", id:b64ToBuf(stored) }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      return assertion ? { method:"biometric", verified:true } : { method:"none", verified:false };
    } catch(_e) { return null; } // null = cancelled
  }

  async function clockIn() {
    setBioVerifying(true);
    const now    = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    const isLate = (() => { const [h,m]=now.split(":").map(Number); return h>9||(h===9&&m>15); })();
    const status = isLate ? "Late" : "Present";

    // Biometric gate — require if enrolled, offer fallback if not
    let sigResult = { method:"none", verified:false };
    if (bioEnrolled && bioAvailable) {
      const result = await verifyBiometric();
      if (result === null) { // user cancelled
        setBioVerifying(false);
        notify("Biometric verification cancelled — clock-in not recorded.","error");
        return;
      }
      sigResult = result;
    } else if (bioAvailable && !bioEnrolled) {
      // Prompt to enroll
      setBioVerifying(false);
      setBioSetupOpen(true);
      notify("Please register your biometric first — tap 'Set Up Biometrics' below","error");
      return;
    }

    // GPS location
    let location = null;
    try {
      if (navigator.geolocation) {
        location = await new Promise(res=>navigator.geolocation.getCurrentPosition(
          pos=>res({lat:pos.coords.latitude.toFixed(4),lng:pos.coords.longitude.toFixed(4),acc:Math.round(pos.coords.accuracy)}),
          ()=>res(null), {timeout:3000}
        ));
      }
    } catch(_e){ location=null; }
    setClockInLocation(location);

    const draft = {
      id:docId("ATT"), employee:self?.name||currentUser.name,
      date:TODAY_STR, status, clockIn:now, clockOut:null,
      verified:  sigResult.verified,
      sigMethod: sigResult.method,
      location:  location ? `${location.lat},${location.lng}` : null,
      deviceId:  navigator.userAgent.slice(0,40),
    };
    attendance.setRows(p=>[draft,...p.filter(a=>!(a.date===TODAY_STR&&a.employee===draft.employee))]);
    setClockedIn(true);

    const sigBadge = sigResult.verified ? "🔒 Biometrically verified" : "📝 Manual entry";
    notify(`✓ Clocked in at ${now}${isLate?" (Late)":""} · ${sigBadge}${location?" · 📍 "+location.lat+","+location.lng:""}`);
    logAudit("Clock In","Employee Portal",currentUser.name,`${draft.employee} at ${now} (${status}) · ${sigResult.method}`);

    if (IS_CONFIGURED) {
      try {
        await sb("hr_attendance").insert({
          employee:draft.employee, attendance_date:TODAY_STR,
          status, clock_in:now,
          verified:sigResult.verified, sig_method:sigResult.method,
          location: location ? `${location.lat},${location.lng}` : null,
        }).run();
      } catch(_e){}
    }
    setBioVerifying(false);
  }

  async function clockOut() {
    setBioVerifying(true);
    const now = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});

    // Biometric gate on clock-out too
    let sigResult = { method:"none", verified:false };
    if (bioEnrolled && bioAvailable) {
      const result = await verifyBiometric();
      if (result === null) {
        setBioVerifying(false);
        notify("Biometric verification cancelled — clock-out not recorded.","error");
        return;
      }
      sigResult = result;
    }

    attendance.setRows(p=>p.map(a=>
      a.date===TODAY_STR&&a.employee===(self?.name||currentUser.name)
        ? {...a, clockOut:now, sigMethod:sigResult.method, verified:sigResult.verified} : a
    ));
    setClockedIn(false);
    const sigBadge = sigResult.verified ? "🔒 Biometrically signed" : "📝 Manual";
    notify(`✓ Clocked out at ${now} · ${sigBadge}`);
    logAudit("Clock Out","Employee Portal",currentUser.name,`clocked out at ${now} · ${sigResult.method}`);
    if (IS_CONFIGURED) {
      try {
        await sb("hr_attendance").eq("attendance_date",TODAY_STR)
          .eq("employee",self?.name||currentUser.name)
          .update({clock_out:now, sig_method:sigResult.method, verified:sigResult.verified}).run();
      } catch(_e){}
    }
    setBioVerifying(false);
  }

  // ── Duties ────────────────────────────────────────────────────────────
  const duties = useCompanyTable("hr_duties", dutiesSeed, {
    order:{ col:"date", ascending:true }, mapRow:mapDutyRow,
  });
  const myDuties = useMemo(()=>
    duties.rows.filter(d=>
      d.assignee===(self?.name||currentUser.name)||d.assignee==="ALL"
    ).filter(d=>d.date>=TODAY_STR||["In Progress","Completed"].includes(d.status))
  , [duties.rows, self, currentUser.name, TODAY_STR]);

  const todayDuties  = myDuties.filter(d=>d.date===TODAY_STR);
  const upcoming     = myDuties.filter(d=>d.date>TODAY_STR).slice(0,5);
  const doneDuties   = myDuties.filter(d=>["Completed","Approved"].includes(d.status));

  async function startDuty(duty) {
    // Biometric gate on duty start
    if (bioEnrolled && bioAvailable) {
      setBioVerifying(true);
      const result = await verifyBiometric();
      setBioVerifying(false);
      if (result === null) { notify("Biometric cancelled — duty not started.","error"); return; }
    }
    const now = new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    duties.setRows(p=>p.map(d=>d.id===duty.id?{...d,status:"In Progress",startedAt:now}:d));
    notify(`▶ "${duty.title}" started at ${now}${bioEnrolled?" · 🔒 Biometrically confirmed":""}`);
    logAudit("Duty started","Employee Portal",currentUser.name,`${duty.title} at ${now}`);
    if (IS_CONFIGURED&&duty.dbId) {
      try { await sb("hr_duties").eq("id",duty.dbId).update({status:"In Progress",started_at:now}).run(); } catch(_e){}
    }
  }

  async function completeDuty(duty) {
    // Require biometric to confirm duty completion — this is the record HR will see
    let sigResult = { method:"none", verified:false };
    if (bioEnrolled && bioAvailable) {
      setBioVerifying(true);
      const result = await verifyBiometric();
      setBioVerifying(false);
      if (result === null) { notify("Biometric cancelled — duty not marked complete.","error"); return; }
      sigResult = result;
    }
    const now = new Date().toISOString().slice(0,16).replace("T"," ");
    duties.setRows(p=>p.map(d=>d.id===duty.id?{
      ...d, status:"Completed", completedAt:now,
      completionVerified:sigResult.verified, completionMethod:sigResult.method,
    }:d));
    const badge = sigResult.verified ? "🔒 Biometrically signed" : "📝 Manual";
    notify(`✓ "${duty.title}" marked complete · ${badge} — awaiting manager approval`);
    logAudit("Duty completed","Employee Portal",currentUser.name,`${duty.title} · ${sigResult.method}`);
    if (IS_CONFIGURED&&duty.dbId) {
      try {
        await sb("hr_duties").eq("id",duty.dbId).update({
          status:"Completed", completed_at:now,
          completion_verified:sigResult.verified, completion_method:sigResult.method,
        }).run();
      } catch(_e){}
    }
  }

  // ── Leave Requests ────────────────────────────────────────────────────
  const [leaveForm, setLeaveForm] = useState({ type:"Annual Leave", startDate:TODAY_STR, endDate:"", reason:"" });
  const { rows: leaveRows, setRows: setLeaveRows } = leaveRequests;
  const myLeave = leaveRows.filter(l=>
    (l.employeeName||l.employee||"").toLowerCase().includes((self?.name||currentUser.name).split(" ")[0].toLowerCase())
  );

  async function submitLeave() {
    if (!leaveForm.startDate||!leaveForm.endDate) { notify("Please fill in dates","error"); return; }
    const draft = {
      id:docId("LV"), employeeName:self?.name||currentUser.name,
      employeeId:self?.id||"", type:leaveForm.type,
      startDate:leaveForm.startDate, endDate:leaveForm.endDate,
      reason:leaveForm.reason, status:"Pending",
    };
    setLeaveRows(p=>[draft,...p]);
    setLeaveForm({type:"Annual Leave",startDate:TODAY_STR,endDate:"",reason:""});
    notify("Leave request submitted — awaiting manager approval");
    logAudit("Leave request submitted","Employee Portal",currentUser.name,`${leaveForm.type} ${leaveForm.startDate}–${leaveForm.endDate}`);
  }

  // ── Payslip ───────────────────────────────────────────────────────────
  function printMyPayslip() {
    if (!self) { notify("Payslip requires your employee profile in the system","error"); return; }
    const co2 = window.__smartManagerCompany||company||{};
    const gross = self.salary||0;
    const PAYE  = (s)=>s<=270?0:s<=520?(s-270)*0.08:s<=760?20+(s-520)*0.20:s<=1000?68+(s-760)*0.25:128+(s-1000)*0.30;
    const paye  = Math.round(PAYE(gross)*100)/100;
    const sdl   = Math.round(gross*0.035*100)/100;
    const nhif  = Math.round(Math.min(gross*0.015,10)*100)/100;
    const net   = gross-paye-sdl-nhif;
    const fmt   = n=>new Intl.NumberFormat("en-US").format(Math.round(n));
    const ACCENT="#16A34A"; const DARK="#0D2214";
    const period= TODAY_STR.slice(0,7);
    const win=window.open("","_blank","width=900,height=1000");
    if (!win) { notify("Pop-up blocked","error"); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Payslip ${period}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,Arial,sans-serif;background:#F3F4F6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      @media print{body{background:white}.toolbar{display:none!important}}
      .page{max-width:680px;margin:24px auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.1)}
      .hdr{background:${DARK};padding:26px 32px;display:flex;justify-content:space-between;align-items:flex-start}
      .two-col{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#E5E7EB}
      .section{background:white;padding:18px 22px}
      .sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px}
      table.lines{width:100%;border-collapse:collapse}
      table.lines td{padding:6px 0;font-size:12.5px}
      .amt{text-align:right;font-family:monospace;font-weight:600}
      .green{color:#16A34A}.red{color:#EF4444}
      .total-row td{border-top:2px solid #E5E7EB;padding-top:8px;font-weight:700;font-size:13px}
      .net-banner{background:${DARK};padding:20px 32px;display:flex;justify-content:space-between;align-items:center}
      .ftr{background:#F8FAFB;border-top:1px solid #E5E7EB;padding:12px 32px;display:flex;justify-content:space-between;font-size:10.5px;color:#9CA3AF}
      .btn{padding:10px 20px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:Inter}
      .toolbar{position:fixed;bottom:24px;right:24px;display:flex;gap:8px}</style></head><body>
      <div class="page">
        <div class="hdr">
          <div><div style="font-size:18px;font-weight:800;color:white">${co2.name||"SMART MANAGER"}</div><div style="font-size:10.5px;color:rgba(255,255,255,.5);margin-top:3px">${[co2.address,co2.city,"Tanzania"].filter(Boolean).join(" · ")}</div></div>
          <div style="text-align:right"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.5)">Payslip</div><div style="font-size:20px;font-weight:900;color:${ACCENT};margin-top:2px">${period}</div></div>
        </div>
        <div style="background:#F8FAFB;border-bottom:1px solid #E5E7EB;padding:16px 32px;display:flex;justify-content:space-between;align-items:center">
          <div><div style="font-size:18px;font-weight:800;color:#111827">${self.name}</div><div style="font-size:12px;color:#6B7280;margin-top:2px">${self.role} · ${self.department}${self.id?" · "+self.id:""}</div></div>
          <div style="text-align:right"><div style="font-size:10px;color:#9CA3AF">Employee Since</div><div style="font-size:12.5px;font-weight:600;color:#374151">${self.hireDate||"—"}</div></div>
        </div>
        <div class="two-col">
          <div class="section"><div class="sec-title" style="color:${ACCENT}">EARNINGS</div>
            <table class="lines"><tr><td>Basic Salary</td><td class="amt green">TZS ${fmt(gross)}k</td></tr>
            <tr class="total-row"><td>GROSS PAY</td><td class="amt green" style="font-size:14px">TZS ${fmt(gross)}k</td></tr></table>
          </div>
          <div class="section"><div class="sec-title" style="color:#EF4444">DEDUCTIONS</div>
            <table class="lines"><tr><td>PAYE (TRA)</td><td class="amt red">− TZS ${fmt(paye)}k</td></tr>
            <tr><td>SDL (3.5%)</td><td class="amt red">− TZS ${fmt(sdl)}k</td></tr>
            <tr><td>NHIF (1.5%)</td><td class="amt red">− TZS ${fmt(nhif)}k</td></tr>
            <tr class="total-row"><td>TOTAL DEDUCTIONS</td><td class="amt red">− TZS ${fmt(paye+sdl+nhif)}k</td></tr></table>
          </div>
        </div>
        <div class="net-banner"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.5)">NET PAY</div>
          <div style="font-size:28px;font-weight:900;color:white">TZS ${fmt(net)}k</div>
        </div>
        <div class="ftr"><span>Confidential · Employee copy</span><span>SMART MANAGER · ${new Date().toLocaleDateString()}</span></div>
      </div>
      <div class="toolbar"><button class="btn" style="background:white;border:1.5px solid #E5E7EB" onclick="window.close()">Close</button><button class="btn" style="background:#16A34A;color:white" onclick="window.print()">Print / PDF</button></div>
    </body></html>`);
    win.document.close();
    setTimeout(()=>win.focus(),200);
    notify("Payslip PDF ready");
  }

  // ── Invite code join flow ─────────────────────────────────────────────
  function joinViaCode() {
    if (!inviteInput.trim()) { setInviteError("Please enter the invite code"); return; }
    if (!selfName.trim()) { setInviteError("Please enter your full name"); return; }
    const code = inviteInput.trim().toUpperCase();
    try {
      const codes = JSON.parse(localStorage.getItem("hr_invite_codes")||"[]");
      const inv = codes.find(c=>c.code===code&&!c.used&&new Date(c.expires)>=new Date());
      if (!inv) {
        setInviteError("Invalid or expired code. Ask HR for a new one.");
        return;
      }
      // Mark code as used
      const updated = codes.map(c=>c.code===code?{...c,used:true,usedBy:selfName}:c);
      localStorage.setItem("hr_invite_codes", JSON.stringify(updated));
      // Store joined employee locally
      const portalEmp = {
        code, name:selfName.trim(), phone:selfPhone, email:selfEmail,
        dept:inv.dept, role:inv.role, joinedAt:new Date().toISOString(),
      };
      localStorage.setItem("ep_self_"+code, JSON.stringify(portalEmp));
      notify(`Welcome, ${selfName.split(" ")[0]}! You have joined ${co.name||"the company"}.`);
      setPortalView("portal");
    } catch(_e){
      setInviteError("Something went wrong. Please try again.");
    }
  }

  // Weekly attendance stats
  const weekStart = new Date(TODAY); weekStart.setDate(weekStart.getDate()-weekStart.getDay()+1);
  const weekDays  = Array.from({length:7},(_,i)=>{
    const d=new Date(weekStart); d.setDate(d.getDate()+i);
    return d.toISOString().slice(0,10);
  });
  const weekAtt = weekDays.map(date=>{
    const att = myAttendance.find(a=>a.date===date);
    return { date, status:att?.status||"—", clockIn:att?.clockIn||"", clockOut:att?.clockOut||"" };
  });

  const STATUS_COLOR = {"Present":"#16A34A","Late":"#F59E0B","Absent":"#EF4444","On Leave":"#2563EB","—":"#E5E7EB"};
  const DUTY_STATUS_COLOR = {"Pending":"#94A3B8","In Progress":"#F59E0B","Completed":"#2563EB","Approved":"#16A34A","Rejected":"#EF4444"};

  // ── Notification badges ─────────────────────────────────────────────
  const pendingDutiesCount  = todayDuties.filter(d=>d.status==="Completed").length; // awaiting approval
  const pendingLeaveCount   = myLeave.filter(l=>l.status==="Pending").length;
  const newAnnouncementCount= 0; // placeholder — future: unread announcements

  const PORTAL_TABS = [
    {id:"dashboard",    label:"Dashboard",       icon:LayoutDashboard,  badge:0},
    {id:"attendance",   label:"Attendance",       icon:CalendarCheck,    badge:0},
    {id:"duties",       label:"Duties",           icon:ClipboardList,    badge:pendingDutiesCount},
    {id:"leave",        label:"Leave",            icon:Clock,            badge:pendingLeaveCount},
    {id:"expenses",     label:"Expenses",         icon:Receipt,          badge:0},
    {id:"training",     label:"Training",         icon:GraduationCap,    badge:0},
    {id:"team",         label:"Team",             icon:Users,            badge:0},
    {id:"noticeboard",  label:"Noticeboard",      icon:Bell,             badge:newAnnouncementCount},
    {id:"payslip",      label:"Payslip",          icon:Banknote,         badge:0},
    {id:"profile",      label:"Profile",          icon:UserCircle,       badge:0},
  ];

  // ── Render: Invite Code Screen ────────────────────────────────────────
  if (portalView === "identify") return (
    <div className="min-h-[600px] flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-[#0D2214] flex items-center justify-center mx-auto mb-4">
            <LogIn size={28} className="text-[#16A34A]"/>
          </div>
          <h2 className="text-[22px] font-black text-[#111827]">Employee Portal</h2>
          <p className="text-[13px] text-slate-500 mt-1">{co.name||"SMART MANAGER"}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11.5px] font-bold text-slate-600 block mb-1.5">Invite Code from HR *</label>
            <input
              className={inputClass+" text-center font-mono text-[18px] font-black tracking-widest uppercase"}
              value={inviteInput}
              onChange={e=>{ setInviteInput(e.target.value.toUpperCase()); setInviteError(""); }}
              placeholder="e.g. ABC12345"
              maxLength={10}
            />
            <p className="text-[10.5px] text-slate-400 mt-1 text-center">Get this code from your HR manager</p>
          </div>
          <div>
            <label className="text-[11.5px] font-bold text-slate-600 block mb-1.5">Your Full Name *</label>
            <input className={inputClass} value={selfName} onChange={e=>{setSelfName(e.target.value);setInviteError("");}} placeholder="e.g. Amina Hassan"/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11.5px] font-bold text-slate-600 block mb-1.5">Phone Number</label>
              <input type="tel" className={inputClass} value={selfPhone} onChange={e=>setSelfPhone(e.target.value)} placeholder="+255..."/>
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-slate-600 block mb-1.5">Email</label>
              <input type="email" className={inputClass} value={selfEmail} onChange={e=>setSelfEmail(e.target.value)} placeholder="you@company.tz"/>
            </div>
          </div>
          {inviteError&&<p className="text-[12px] text-[#EF4444] font-semibold text-center">{inviteError}</p>}
          <button onClick={joinViaCode}
            className="w-full flex items-center justify-center gap-2 text-[13.5px] font-black text-white py-3.5 rounded-xl bg-[#16A34A] mt-2">
            <LogIn size={16}/> Join Company Portal
          </button>
          {canManage&&(
            <button onClick={()=>setPortalView("portal")}
              className="w-full text-[12px] font-semibold text-slate-400 py-2 hover:text-slate-600">
              Manager access (skip code) →
            </button>
          )}
        </div>

        <div className="mt-5 p-3 bg-slate-50 rounded-xl text-center">
          <p className="text-[11.5px] text-slate-500">Don't have a code? Ask your HR department to generate one from</p>
          <p className="text-[11.5px] font-bold text-[#16A34A]">HR → Employees → Invite Code</p>
        </div>
      </div>
    </div>
  );

  // ── Render: Employee Portal ───────────────────────────────────────────
  const empName = self?.name||currentUser.name;
  const greeting = new Date().getHours()<12?"Good morning":new Date().getHours()<17?"Good afternoon":"Good evening";

  return (
    <div className="space-y-5">
      {/* Portal header */}
      <div className="rounded-2xl overflow-hidden relative" style={{background:"linear-gradient(135deg,#0D2214 0%,#1a3a2a 60%,#16A34A 120%)"}}>
        <div className="absolute inset-0 opacity-5" style={{backgroundImage:"repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)",backgroundSize:"20px 20px"}}/>
        <div className="relative px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[rgba(255,255,255,.6)] text-[12px] mb-0.5">Employee Portal · {co.name||"SMART MANAGER"}</p>
            <h1 className="text-white text-[22px] font-black">{greeting}, {empName.split(" ")[0]} 👋</h1>
            {self&&<p className="text-[rgba(255,255,255,.6)] text-[12px] mt-1">{self.role} · {self.department}</p>}
          </div>
          <div className="flex items-center gap-3">
            {/* BIG Clock In / Out Button — biometric-gated */}
            {bioVerifying?(
              <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[rgba(255,255,255,.1)]">
                <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
                <span className="text-white font-bold text-[13px]">Verifying…</span>
              </div>
            ):!clockedIn&&!todayAtt?.clockIn?(
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={clockIn}
                  className="flex items-center gap-2 text-[13.5px] font-black text-[#0D2214] bg-[#16A34A] px-5 py-3 rounded-2xl shadow-lg hover:bg-[#15803D] transition-all">
                  {bioEnrolled ? <Fingerprint size={18}/> : <LogIn size={18}/>}
                  {bioEnrolled ? "🔒 Biometric Clock In" : "Clock In"}
                </button>
                {bioAvailable&&!bioEnrolled&&(
                  <button onClick={()=>setBioSetupOpen(true)}
                    className="text-[11px] text-[#16A34A] font-bold bg-[rgba(22,163,74,0.15)] px-3 py-1 rounded-full hover:bg-[rgba(22,163,74,0.25)]">
                    Set Up Biometrics →
                  </button>
                )}
                {bioAvailable===false&&(
                  <p className="text-[10.5px] text-[rgba(255,255,255,.4)]">📝 Manual sign-in (no sensor found)</p>
                )}
              </div>
            ):clockedIn?(
              <button onClick={clockOut}
                className="flex items-center gap-2 text-[13.5px] font-black text-white bg-[#EF4444] px-5 py-3 rounded-2xl shadow-lg hover:bg-[#DC2626] transition-all">
                {bioEnrolled ? <Fingerprint size={18}/> : <LogOut size={18}/>}
                {bioEnrolled ? "🔒 Biometric Clock Out" : "Clock Out"}
              </button>
            ):(
              <div className="text-center">
                <p className="text-[#16A34A] font-bold text-[12px] flex items-center gap-1">
                  {todayAtt?.verified?"🔒":"📝"} ✓ Done for today
                </p>
                <p className="text-[rgba(255,255,255,.5)] text-[11px]">{todayAtt?.clockIn} → {todayAtt?.clockOut}</p>
                <p className="text-[10px] text-[rgba(255,255,255,.35)]">
                  {todayAtt?.verified?"Biometrically verified":"Manual entry"}
                </p>
              </div>
            )}
            {todayAtt?.clockIn&&!todayAtt?.clockOut&&(
              <div className="text-right">
                <p className="text-[rgba(255,255,255,.6)] text-[11px]">Clocked in at</p>
                <p className="text-white font-black text-[18px]">{todayAtt.clockIn}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {PORTAL_TABS.map(t=>{
          const I=t.icon; const isActive=activeTab===t.id;
          return (
            <button key={t.id} onClick={()=>setActiveTab(t.id)}
              className={`relative flex items-center gap-1.5 justify-center px-3 py-2 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-all ${isActive?"bg-[#0D2214] text-white":"text-slate-500 hover:text-[#111827]"}`}>
              <I size={13}/>{t.label}
              {t.badge>0&&(
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-black text-white bg-[#EF4444] rounded-full">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── DASHBOARD ── */}
      {activeTab==="dashboard"&&(
        <div className="space-y-4">
          {/* KPI tiles */}
          {(() => {
            const weekPresent = weekAtt.filter(w=>w.status==="Present"||w.status==="Late").length;
            const weekDone    = weekDays.filter(d=>d<=TODAY_STR&&d>=weekDays[0]).length;
            const attRate     = weekDone > 0 ? Math.round(weekPresent/weekDone*100) : 0;
            const approvedLeave = myLeave.filter(l=>l.status==="Approved"&&l.endDate>=TODAY_STR);
            const totalAnnual   = 21; // TZS standard
            const usedLeave     = leaveRows.filter(l=>
              (l.employeeName||l.employee||"").toLowerCase().includes(empName.split(" ")[0].toLowerCase())&&
              l.status==="Approved"&&l.startDate?.startsWith(String(TODAY.getFullYear()))
            ).reduce((s,l)=>s+Math.max(0,Math.ceil((new Date(l.endDate)-new Date(l.startDate))/86400000)+1),0);
            const hoursToday = todayAtt?.clockIn&&todayAtt?.clockOut ? (()=>{
              const [ih,im]=(todayAtt.clockIn||"00:00").split(":").map(Number);
              const [oh,om]=(todayAtt.clockOut||"00:00").split(":").map(Number);
              return Math.max(0,((oh*60+om)-(ih*60+im))/60).toFixed(1);
            })() : todayAtt?.clockIn ? "Active" : "0";
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Today's Status",  todayAtt?.status||"Not In",  todayAtt?.status==="Present"?"#16A34A":todayAtt?.status==="Late"?"#F59E0B":"#94A3B8"],
                  ["Hours Today",     hoursToday+"h",               "#2563EB"],
                  ["Week Attendance", attRate+"%",                  attRate>=80?"#16A34A":attRate>=60?"#F59E0B":"#EF4444"],
                  ["Leave Balance",   (totalAnnual-usedLeave)+" days","#7C3AED"],
                ].map(([l,v,col])=>(
                  <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">{l}</p>
                    <p className="text-[20px] font-black" style={{color:col}}>{v}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Quick Stats Row */}
          {myDuties.filter(d=>d.status==="Completed"&&!d.approvedBy).length>0&&(
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3.5 flex items-center gap-2.5">
              <Bell size={15} className="text-[#2563EB] shrink-0"/>
              <div>
                <p className="text-[13px] font-bold text-[#1D4ED8]">
                  {myDuties.filter(d=>d.status==="Completed"&&!d.approvedBy).length} dut{myDuties.filter(d=>d.status==="Completed"&&!d.approvedBy).length===1?"y":"ies"} awaiting manager approval
                </p>
                <p className="text-[11.5px] text-[#2563EB]">Your manager will approve completed duties in HR → Timetable</p>
              </div>
            </div>
          )}

          {/* Today's duties quick view */}
          {todayDuties.length>0&&(
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[14px] font-bold text-[#111827] mb-3">Today's Duties</h3>
              <div className="space-y-2">
                {todayDuties.map(duty=>{
                  const col=DUTY_STATUS_COLOR[duty.status]||"#94A3B8";
                  const canStart=duty.status==="Pending";
                  const canComplete=duty.status==="In Progress";
                  return(
                    <div key={duty.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:col}}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#111827] truncate">{duty.title}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{duty.startTime}–{duty.endTime} · {duty.type}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{background:col+"20",color:col}}>{duty.status}</span>
                        {canStart&&<button onClick={()=>startDuty(duty)} className="text-[11px] font-bold text-white bg-[#F59E0B] px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                              {bioVerifying?"⏳…":bioEnrolled?"🔒 Start":"▶ Start"}
                            </button>
                          }
                        {canComplete&&<button onClick={()=>completeDuty(duty)} disabled={bioVerifying}
                            className="text-[11px] font-bold text-white bg-[#2563EB] px-2.5 py-1.5 rounded-lg disabled:opacity-50">
                          {bioVerifying?"⏳…":bioEnrolled?"🔒 Done":"✓ Done"}
                        </button>}
                        {duty.status==="Approved"&&<span className="text-[#16A34A] font-bold text-[13px]">✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weekly attendance summary */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold text-[#111827]">This Week's Attendance</h3>
              <span className="text-[11px] font-bold text-[#16A34A]">
                {weekAtt.filter(w=>w.status==="Present"||w.status==="Late").length}/{weekAtt.filter((_,i)=>weekDays[i]<=TODAY_STR).length} days present
              </span>
            </div>
            <div className="flex gap-2 justify-between">
              {weekAtt.map((wa,i)=>{
                const isToday=wa.date===TODAY_STR;
                const dow=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i];
                const col=STATUS_COLOR[wa.status]||"#E5E7EB";
                return(
                  <div key={wa.date} className={`flex-1 flex flex-col items-center gap-1 px-1 py-2 rounded-xl ${isToday?"bg-[#F0FDF4] border border-[#16A34A]/20":""}`}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{background:col+"20",border:`2px solid ${col}`}}>
                      <span className="text-[9px] font-black" style={{color:col}}>{wa.clockIn?wa.clockIn:"—"}</span>
                    </div>
                    <span className={`text-[10.5px] font-bold ${isToday?"text-[#16A34A]":"text-slate-500"}`}>{dow}</span>
                    <span className="text-[9.5px] text-slate-400">{wa.status==="—"?"":wa.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ATTENDANCE ── */}
      {activeTab==="attendance"&&(
        <div className="space-y-4">
          {/* Big clock in/out card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 text-center">
            <p className="text-[13px] text-slate-500 mb-2">{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
            <p className="text-[48px] font-black text-[#111827] font-mono leading-none mb-4">
              {new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}
            </p>
            {/* Biometric status indicator */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold mb-3 ${
              bioEnrolled?"bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]":
              bioAvailable===false?"bg-slate-100 text-slate-400 border border-slate-200":
              "bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]"
            }`}>
              <Fingerprint size={13}/>
              {bioEnrolled?"🔒 Biometric Active — clock-in will be cryptographically signed":
               bioAvailable===false?"No biometric sensor detected on this device":
               "⚠ Biometric not set up — clock-in will be manual"}
            </div>

            {!clockedIn&&!todayAtt?.clockIn?(
              <div className="space-y-2">
                <button onClick={clockIn} disabled={bioVerifying}
                  className="inline-flex items-center gap-2 text-[14px] font-black text-white px-8 py-3.5 rounded-2xl shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
                  style={{background:bioEnrolled?"#16A34A":"#2563EB"}}>
                  {bioVerifying?<div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"/>:
                    bioEnrolled?<Fingerprint size={20}/>:<LogIn size={20}/>}
                  {bioVerifying?"Verifying…":bioEnrolled?"🔒 Biometric Clock In":"Clock In (Manual)"}
                </button>
                {bioAvailable&&!bioEnrolled&&(
                  <button onClick={()=>setBioSetupOpen(true)}
                    className="block mx-auto text-[12px] font-bold text-[#16A34A] underline">
                    Set up biometrics for secure sign-in
                  </button>
                )}
              </div>
            ):clockedIn?(
              <div className="space-y-3">
                <div className="flex items-center gap-2 justify-center">
                  <p className="text-[13px] font-semibold text-[#16A34A]">✓ Clocked in at <strong>{todayAtt?.clockIn}</strong></p>
                  {todayAtt?.verified&&<span className="text-[10.5px] font-bold text-[#16A34A] bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-full flex items-center gap-1"><Fingerprint size={10}/>Verified</span>}
                </div>
                <button onClick={clockOut} disabled={bioVerifying}
                  className="inline-flex items-center gap-2 text-[14px] font-black text-white bg-[#EF4444] px-8 py-3.5 rounded-2xl shadow-lg hover:bg-[#DC2626] transition-all disabled:opacity-50">
                  {bioVerifying?<div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"/>:
                    bioEnrolled?<Fingerprint size={20}/>:<LogOut size={20}/>}
                  {bioVerifying?"Verifying…":bioEnrolled?"🔒 Biometric Clock Out":"Clock Out"}
                </button>
              </div>
            ):(
              <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-4">
                <p className="text-[#16A34A] font-black text-[15px] flex items-center justify-center gap-2">
                  {todayAtt?.verified?<Fingerprint size={16}/>:null}
                  ✓ Attendance recorded for today
                </p>
                <p className="text-slate-500 text-[12.5px] mt-1">{todayAtt?.clockIn} → {todayAtt?.clockOut}</p>
                <p className="text-[11.5px] font-semibold mt-1" style={{color:todayAtt?.verified?"#16A34A":"#94A3B8"}}>
                  {todayAtt?.verified?"🔒 Biometrically verified — HR has tamper-proof record":"📝 Manual entry — not biometrically signed"}
                </p>
              </div>
            )}
          </div>

          {/* Monthly summary */}
          {myAttendance.length > 0 && (() => {
            const thisMonth = TODAY_STR.slice(0,7);
            const monthAtt  = myAttendance.filter(a=>a.date?.startsWith(thisMonth));
            const present   = monthAtt.filter(a=>a.status==="Present").length;
            const late      = monthAtt.filter(a=>a.status==="Late").length;
            const absent    = monthAtt.filter(a=>a.status==="Absent").length;
            const totalHrs  = monthAtt.reduce((s,a)=>{
              if (!a.clockIn||!a.clockOut) return s;
              const [ih,im]=a.clockIn.split(":").map(Number);
              const [oh,om]=a.clockOut.split(":").map(Number);
              return s+Math.max(0,((oh*60+om)-(ih*60+im))/60);
            },0);
            return (
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <p className="text-[13.5px] font-bold text-[#111827] mb-3">
                  This Month — {new Date(thisMonth+"-01").toLocaleDateString("en",{month:"long",year:"numeric"})}
                </p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ["Present",  String(present), "#16A34A"],
                    ["Late",     String(late),    "#F59E0B"],
                    ["Absent",   String(absent),  "#EF4444"],
                    ["Hours",    totalHrs.toFixed(1)+"h","#2563EB"],
                  ].map(([l,v,col])=>(
                    <div key={l} className="text-center p-3 bg-slate-50 rounded-xl">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                      <p className="text-[18px] font-black" style={{color:col}}>{v}</p>
                    </div>
                  ))}
                </div>
                {/* Attendance rate bar */}
                {(present+late+absent)>0&&(
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Attendance Rate</span>
                      <span className="font-bold" style={{color:(present+late)/(present+late+absent)>=0.9?"#16A34A":"#F59E0B"}}>
                        {Math.round((present+late)/(present+late+absent)*100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#16A34A]"
                        style={{width:Math.round((present+late)/(present+late+absent)*100)+"%"}}/>
                    </div>
                  </div>
                )}
                {clockInLocation&&(
                  <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                    📍 Last clock-in: {clockInLocation.lat}, {clockInLocation.lng} (±{clockInLocation.acc}m)
                  </p>
                )}
              </div>
            );
          })()}

          {/* Attendance history */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-[13.5px] font-bold text-[#111827]">My Attendance History ({myAttendance.length} records)</p>
            </div>
            {myAttendance.length===0?(
              <div className="py-10 text-center text-slate-400">
                <CalendarCheck size={32} className="mx-auto mb-2 text-slate-200"/>
                <p>No attendance records yet. Clock in to start tracking.</p>
              </div>
            ):(
              <table className="w-full text-[12.5px]">
                <thead><tr className="bg-slate-50 border-b border-slate-100">
                  {["Date","Day","Status","Clock In","Clock Out","Hours"].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {myAttendance.slice(0,20).map((att,i)=>{
                    const col=STATUS_COLOR[att.status]||"#94A3B8";
                    const hours = att.clockIn&&att.clockOut ? (()=>{
                      const [ih,im]=att.clockIn.split(":").map(Number);
                      const [oh,om]=att.clockOut.split(":").map(Number);
                      const diff=((oh*60+om)-(ih*60+im))/60;
                      return diff>0?diff.toFixed(1)+"h":"—";
                    })() : "—";
                    return(
                      <tr key={att.id} className={`border-b border-slate-50 last:border-0 ${att.date===TODAY_STR?"bg-[#F0FDF4]/50":""}`}>
                        <td className="px-4 py-3 font-mono text-[11.5px]">{att.date}</td>
                        <td className="px-4 py-3 text-slate-500">{new Date(att.date).toLocaleDateString("en",{weekday:"short"})}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{background:col+"18",color:col}}>{att.status}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{att.clockIn||"—"}</td>
                        <td className="px-4 py-3 font-mono text-slate-600">{att.clockOut||"—"}</td>
                        <td className="px-4 py-3 font-bold text-[#16A34A] font-mono">{hours}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── DUTIES ── */}
      {activeTab==="duties"&&(
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Today",   String(todayDuties.length),           "#2563EB"],
              ["Upcoming",String(upcoming.length),              "#F59E0B"],
              ["Completed",String(doneDuties.length),           "#16A34A"],
            ].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                <p className="text-[22px] font-black" style={{color:col}}>{v}</p>
              </div>
            ))}
          </div>

          {todayDuties.length===0&&upcoming.length===0?(
            <div className="bg-white rounded-xl border border-slate-200/80 p-10 text-center">
              <ClipboardList size={36} className="text-slate-200 mx-auto mb-3"/>
              <p className="text-[14px] font-semibold text-slate-400">No duties assigned</p>
              <p className="text-[12.5px] text-slate-400 mt-1">Your manager will assign duties here. Check back later.</p>
            </div>
          ):(
            <div className="space-y-3">
              {[["Today",todayDuties],["Upcoming",upcoming],["Completed",doneDuties.slice(0,5)]].map(([section,dts])=>
                dts.length>0&&(
                  <div key={section} className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                      <p className="text-[12.5px] font-bold text-[#111827]">{section} ({dts.length})</p>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {dts.map(duty=>{
                        const col=DUTY_STATUS_COLOR[duty.status]||"#94A3B8";
                        const canStart=duty.status==="Pending"&&duty.date===TODAY_STR;
                        const canComplete=duty.status==="In Progress";
                        return(
                          <div key={duty.id} className="px-4 py-3.5 flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] shrink-0" style={{background:col+"18"}}>
                              {duty.status==="Approved"?"✅":duty.status==="Completed"?"☑️":duty.status==="In Progress"?"▶️":"📋"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[13px] font-bold text-[#111827] ${duty.status==="Approved"?"line-through opacity-60":""}`}>{duty.title}</p>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <span className="text-[11px] font-mono text-slate-400">{duty.date} · {duty.startTime}–{duty.endTime}</span>
                                <span className="text-[10.5px] font-semibold text-slate-500">{duty.type}</span>
                                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full" style={{background:col+"18",color:col}}>{duty.status}</span>
                              </div>
                              {duty.status==="Approved"&&duty.approvedBy&&(
                                <p className="text-[10.5px] text-[#16A34A] mt-0.5">✓ Approved by {duty.approvedBy.split("(")[0].trim()}</p>
                              )}
                              {duty.notes&&<p className="text-[11px] text-slate-500 mt-0.5">📝 {duty.notes}</p>}
                            </div>
                            <div className="flex gap-1.5 shrink-0 mt-0.5">
                              {canStart&&(
                                <button onClick={()=>startDuty(duty)} className="text-[11.5px] font-bold text-white bg-[#F59E0B] px-3 py-1.5 rounded-lg disabled:opacity-50">
                                  {bioVerifying?"⏳…":bioEnrolled?"🔒 Start":"▶ Start"}
                                </button>
                              )}
                              {canComplete&&(
                                <button onClick={()=>completeDuty(duty)} className="text-[11.5px] font-bold text-white bg-[#2563EB] px-3 py-1.5 rounded-lg disabled:opacity-50">
                                  {bioVerifying?"⏳…":bioEnrolled?"🔒 Mark Done":"✓ Mark Done"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* ── LEAVE ── */}
      {activeTab==="leave"&&(
        <div className="space-y-4">
          {/* Submit leave form */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
            <h3 className="text-[14px] font-bold text-[#111827] mb-4">Request Leave</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Leave Type</label>
                <select className={inputClass} value={leaveForm.type} onChange={e=>setLeaveForm(f=>({...f,type:e.target.value}))}>
                  {["Annual Leave","Sick Leave","Maternity Leave","Paternity Leave","Emergency Leave","Unpaid Leave","Study Leave"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Start Date</label>
                <input type="date" className={inputClass} value={leaveForm.startDate} onChange={e=>setLeaveForm(f=>({...f,startDate:e.target.value}))}/>
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">End Date</label>
                <input type="date" className={inputClass} value={leaveForm.endDate} onChange={e=>setLeaveForm(f=>({...f,endDate:e.target.value}))} min={leaveForm.startDate}/>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11.5px] font-semibold text-slate-600 block mb-1">Reason</label>
                <input className={inputClass} value={leaveForm.reason} onChange={e=>setLeaveForm(f=>({...f,reason:e.target.value}))} placeholder="Brief reason (optional)"/>
              </div>
            </div>
            <button onClick={submitLeave} className="mt-4 flex items-center gap-2 text-[13px] font-bold text-white px-5 py-2.5 rounded-xl bg-[#16A34A]">
              <Send size={14}/> Submit Leave Request
            </button>
          </div>

          {/* Leave history */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-[13.5px] font-bold text-[#111827]">My Leave History ({myLeave.length})</p>
            </div>
            {myLeave.length===0?(
              <div className="py-10 text-center text-slate-400">
                <Clock size={32} className="mx-auto mb-2 text-slate-200"/>
                <p>No leave requests yet</p>
              </div>
            ):(
              <div className="divide-y divide-slate-50">
                {myLeave.map(lv=>{
                  const sc={Pending:"#F59E0B",Approved:"#16A34A",Rejected:"#EF4444"}[lv.status]||"#94A3B8";
                  const days=lv.startDate&&lv.endDate?Math.ceil((new Date(lv.endDate)-new Date(lv.startDate))/86400000)+1:0;
                  return(
                    <div key={lv.id} className="px-4 py-3.5 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[15px]" style={{background:sc+"18"}}>
                        {lv.status==="Approved"?"✅":lv.status==="Rejected"?"❌":"⏳"}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-bold text-[#111827]">{lv.type}</p>
                          <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full" style={{background:sc+"18",color:sc}}>{lv.status}</span>
                        </div>
                        <p className="text-[11.5px] text-slate-500 mt-0.5">{lv.startDate} → {lv.endDate} · {days} day{days!==1?"s":""}</p>
                        {lv.reason&&<p className="text-[11px] text-slate-400 mt-0.5">{lv.reason}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAYSLIP ── */}
      {activeTab==="payslip"&&(
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
              <Banknote size={28} className="text-[#16A34A]"/>
            </div>
            <h3 className="text-[16px] font-bold text-[#111827] mb-1">Monthly Payslip</h3>
            {self?(
              <>
                <div className="grid grid-cols-3 gap-3 my-4">
                  {[
                    ["Gross Pay","TZS "+money(self.salary)+"k","#16A34A"],
                    ["PAYE","-TZS "+money(Math.round(self.salary<=270?0:self.salary<=520?(self.salary-270)*0.08:self.salary<=760?20+(self.salary-520)*0.20:68+(self.salary-760)*0.25))+"k","#EF4444"],
                    ["Net Pay","TZS "+money(Math.round(self.salary-(self.salary<=270?0:self.salary<=520?(self.salary-270)*0.08:self.salary<=760?20+(self.salary-520)*0.20:68+(self.salary-760)*0.25)-self.salary*0.035-Math.min(self.salary*0.015,10)))+"k","#2563EB"],
                  ].map(([l,v,col])=>(
                    <div key={l} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                      <p className="text-[15px] font-black" style={{color:col}}>{v}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-slate-500 mb-4">{self.role} · {self.department} · Pay Period: {TODAY_STR.slice(0,7)}</p>
                <button onClick={printMyPayslip}
                  className="inline-flex items-center gap-2 text-[13px] font-bold text-white px-6 py-3 rounded-xl bg-[#16A34A]">
                  <Printer size={14}/> Download Payslip PDF
                </button>
              </>
            ):(
              <div className="py-4">
                <p className="text-slate-500 text-[13px]">Your employee profile has not been set up yet.</p>
                <p className="text-slate-400 text-[12px] mt-1">Ask HR to add you to the employee list.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROFILE ── */}
      {activeTab==="profile"&&(
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-5 flex items-center gap-4 border-b border-slate-100" style={{background:"linear-gradient(135deg,#0D2214,#1a3a2a)"}}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-[28px] font-black bg-[#16A34A]">
                {empName.charAt(0)}
              </div>
              <div>
                <p className="text-white text-[18px] font-black">{empName}</p>
                <p className="text-[rgba(255,255,255,.6)] text-[12.5px] mt-0.5">{self?.role||"Employee"} · {self?.department||"—"}</p>
              </div>
            </div>
            <div className="p-5">
              {self?(
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    ["Employee ID",      self.id||"—"],
                    ["Department",       self.department||"—"],
                    ["Role",             self.role||"—"],
                    ["Contract Type",    self.contractType||"Permanent"],
                    ["Hire Date",        self.hireDate||"—"],
                    ["Email",            self.email||"—"],
                    ["Phone",            self.phone||"—"],
                    ["Status",           self.status||"Active"],
                  ].map(([l,v])=>(
                    <div key={l} className="border-b border-slate-100 pb-3">
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{l}</p>
                      <p className="text-[13.5px] font-semibold text-[#111827]">{v}</p>
                    </div>
                  ))}
                </div>
              ):(
                <div className="py-6 text-center text-slate-400">
                  <UserCircle size={36} className="mx-auto mb-2 text-slate-200"/>
                  <p>Profile not yet set up. Ask HR to add your details.</p>
                </div>
              )}
            </div>
          </div>

          {/* Biometric setup card */}
          <div className={`rounded-xl border p-4 ${bioEnrolled?"bg-[#F0FDF4] border-[#BBF7D0]":"bg-[#F8FAFB] border-slate-200"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[20px] ${bioEnrolled?"bg-[#16A34A]/10":"bg-slate-100"}`}>
                  {bioEnrolled?"🔒":"👆"}
                </div>
                <div>
                  <p className={`text-[13px] font-bold ${bioEnrolled?"text-[#15803D]":"text-[#111827]"}`}>
                    {bioEnrolled?"Biometrics Active":"Biometric Sign-In"}
                  </p>
                  <p className="text-[11.5px] text-slate-500">
                    {bioAvailable===false
                      ? "Not supported on this device"
                      : bioEnrolled
                        ? "Your fingerprint / Face ID is registered on this device"
                        : "Register your fingerprint or Face ID for secure clock-in"}
                  </p>
                </div>
              </div>
              {bioAvailable&&(
                <button
                  onClick={bioEnrolled ? () => { localStorage.removeItem(BIO_KEY); setBioEnrolled(false); notify("Biometrics removed from this device"); } : enrollBiometric}
                  disabled={bioVerifying}
                  className={`shrink-0 text-[12px] font-bold px-3.5 py-2 rounded-xl border transition-all ${
                    bioEnrolled
                      ? "text-[#EF4444] border-[#EF4444]/30 bg-white hover:bg-[#FEF2F2]"
                      : "text-white border-transparent bg-[#16A34A] hover:bg-[#15803D]"
                  }`}>
                  {bioVerifying ? "…" : bioEnrolled ? "Remove" : "Set Up"}
                </button>
              )}
            </div>
          </div>

          {/* Biometric setup modal */}
          {bioSetupOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#111827]/50 backdrop-blur-sm" onClick={()=>setBioSetupOpen(false)}/>
              <div className="relative bg-white rounded-2xl shadow-2xl p-7 w-full max-w-sm mx-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center text-[40px] mx-auto mb-4">
                  🔒
                </div>
                <h3 className="text-[18px] font-black text-[#111827] mb-2">Set Up Biometric Sign-In</h3>
                <p className="text-[12.5px] text-slate-500 mb-4 leading-relaxed">
                  Register your <strong>fingerprint or Face ID</strong> on this device. Every clock-in, clock-out, and duty completion will then be biometrically signed — giving HR tamper-proof verified records.
                </p>
                <div className="bg-slate-50 rounded-xl p-3 mb-4 text-left space-y-2">
                  {[
                    ["🔒","Your biometric never leaves your device"],
                    ["📡","Records sync to HR with 'Biometric Verified' badge"],
                    ["🕐","Works for Clock In, Clock Out, and Duty confirmations"],
                  ].map(([icon,text])=>(
                    <div key={text} className="flex items-start gap-2.5 text-[12px] text-slate-600">
                      <span className="text-[14px] shrink-0">{icon}</span>{text}
                    </div>
                  ))}
                </div>
                <button onClick={enrollBiometric} disabled={bioVerifying}
                  className="w-full flex items-center justify-center gap-2 text-[14px] font-black text-white py-3.5 rounded-xl bg-[#16A34A] disabled:opacity-50 mb-2">
                  <Fingerprint size={18}/> {bioVerifying?"Registering…":"Register Now"}
                </button>
                <button onClick={()=>setBioSetupOpen(false)}
                  className="w-full text-[12.5px] text-slate-400 py-2 hover:text-slate-600">
                  Skip for now (use manual sign-in)
                </button>
              </div>
            </div>
          )}

          {/* Change portal */}
          <button onClick={()=>{ setPortalView("identify"); setInviteInput(""); setInviteError(""); }}
            className="flex items-center gap-2 text-[12.5px] font-semibold text-[#EF4444] border border-[#EF4444]/20 bg-white px-4 py-2.5 rounded-xl hover:bg-[#FEF2F2]">
            <LogOut size={14}/> Switch Employee / Sign Out of Portal
          </button>
        </div>
      )}

      {/* ── EXPENSES TAB ── */}
      {activeTab==="expenses"&&<PortalExpenses empName={empName} employees={employees}/>}

      {/* ── TRAINING TAB ── */}
      {activeTab==="training"&&<PortalTraining empName={empName}/>}

      {/* ── TEAM TAB ── */}
      {activeTab==="team"&&<PortalTeam employees={employees} self={self} empName={empName}/>}

      {/* ── NOTICEBOARD TAB ── */}
      {activeTab==="noticeboard"&&<PortalNoticeboard company={company}/>}

    </div>
  );
}
