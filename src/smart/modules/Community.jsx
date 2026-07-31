import { useState } from "react";
import {
  BarChart3, CircleDollarSign, Heart, Plus, Users
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis,
  YAxis
} from "recharts";
import { FormField, inputClass } from "../components/ui.jsx";
import { logAudit } from "../lib/buses.jsx";
import { TODAY, docId, money } from "../lib/format.jsx";
import { useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import {
  COMMUNITY_GROUP_TYPES,
  COMM_CONTRIBUTIONS_SEED,
  COMM_GROUPS_SEED,
} from "../modules/Vicoba.jsx";

export function CommunityGroupsModule({ currentUser }) {
  const [tab, setTab]         = useState("groups");
  const [selGroup, setSelGroup] = useState(null);
  const groups        = useCompanyTable("community_groups",        COMM_GROUPS_SEED,        { mapRow: (r) => ({ ...r, fund: r.fund||0 }) });
  const contributions = useCompanyTable("community_contributions", COMM_CONTRIBUTIONS_SEED, { mapRow: (r) => r });
  const [groupForm,   setGroupForm]   = useState({ name:"", type: COMMUNITY_GROUP_TYPES[0], cycle:"Monthly", startDate: TODAY.toISOString().slice(0,10) });
  const [ctbForm,     setCtbForm]     = useState({ groupId:"", member:"", amount:"", type:"Contribution", date: TODAY.toISOString().slice(0,10) });
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showCtbForm,   setShowCtbForm]   = useState(false);

  const TABS = [
    { id:"groups",        label:"Groups",        icon: Users },
    { id:"contributions", label:"Contributions", icon: CircleDollarSign },
    { id:"welfare",       label:"Welfare Fund",  icon: Heart },
    { id:"reports",       label:"Reports",       icon: BarChart3 },
  ];

  const totalFunds      = groups.rows.reduce((s,g)=>s+g.fund,0);
  const totalMembers    = groups.rows.reduce((s,g)=>s+g.members,0);
  const pendingCtbs     = contributions.rows.filter((c)=>c.status==="Pending");
  const thisMonthCtbs   = contributions.rows.filter((c)=>c.date >= TODAY.toISOString().slice(0,8)+"01");

  async function addGroup() {
    if (!groupForm.name.trim()) return;
    const row = { id: docId("GRP"), ...groupForm, members: 0, fund: 0, status:"Active" };
    groups.setRows((prev) => [row, ...prev]);
    setGroupForm({ name:"", type: COMMUNITY_GROUP_TYPES[0], cycle:"Monthly", startDate: TODAY.toISOString().slice(0,10) });
    setShowGroupForm(false);
    notify("Group '" + row.name + "' created");
    if (IS_CONFIGURED) { try { await sb("community_groups").insert({ name:row.name, type:row.type, cycle:row.cycle, start_date:row.startDate, status:"Active", members:0, fund:0 }).run(); } catch(_e){} }
  }

  async function addContribution() {
    if (!ctbForm.groupId || !ctbForm.member.trim() || !ctbForm.amount) return;
    const row = { id: docId("CTB"), ...ctbForm, amount: Number(ctbForm.amount), status:"Paid" };
    contributions.setRows((prev) => [row, ...prev]);
    groups.setRows((prev) => prev.map((g) => g.id===ctbForm.groupId ? {...g, fund: g.fund + Number(ctbForm.amount)} : g));
    setCtbForm({ ...ctbForm, member:"", amount:"" });
    setShowCtbForm(false);
    notify("TZS " + money(row.amount) + "k contribution recorded for " + row.member);
    logAudit("Contribution: " + row.member, "Community", currentUser?.name||"System", "TZS " + money(row.amount) + "k");
  }

  const WELFARE_EVENTS = [
    { event:"Medical Emergency", member:"Alice Ng&apos;endo", amount:200, date:"2026-06-15", status:"Paid" },
    { event:"Funeral Support",   member:"Bob Otieno",        amount:150, date:"2026-05-20", status:"Paid" },
    { event:"Hospital Visit",    member:"Pending Review",    amount:100, date:"2026-07-10", status:"Pending" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden px-5 py-5" style={{background:"linear-gradient(135deg,#7C3AED 0%,#6D28D9 50%,#4C1D95 100%)"}}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[19px] font-bold text-white">Community Groups Manager</h1>
            <p className="text-[12px] mt-0.5" style={{color:"rgba(255,255,255,.65)"}}>Table Banking &middot; Investment Clubs &middot; VICOBA &middot; Welfare &middot; SUCCESS &middot; Chamas</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center"><p className="text-[10px] text-purple-300">Total Funds</p><p className="text-[16px] font-bold text-white">TZS {money(totalFunds)}k</p></div>
            <div className="text-center"><p className="text-[10px] text-purple-300">Members</p><p className="text-[16px] font-bold text-white">{totalMembers}</p></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {TABS.map((t) => { const I=t.icon; return (
          <button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap "+(tab===t.id?"bg-[#7C3AED] text-white shadow-sm":"text-slate-500 hover:bg-slate-50")}><I size={13}/>{t.label}</button>
        ); })}
      </div>

      {/* GROUPS TAB */}
      {tab === "groups" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="grid grid-cols-3 gap-3 flex-1 mr-4">
              {[["Groups",groups.rows.length,"#7C3AED"],["Total Members",totalMembers,"#2563EB"],["Total Funds","TZS "+money(totalFunds)+"k","#16A34A"]].map(([l,v,col])=>(
                <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-3"><p className="text-[11px] text-slate-400">{l}</p><p className="text-[18px] font-bold mt-0.5" style={{color:col}}>{v}</p></div>
              ))}
            </div>
            <button onClick={()=>setShowGroupForm(true)} className="flex items-center gap-1.5 btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5 shrink-0"><Plus size={13}/>New Group</button>
          </div>
          {showGroupForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">Create New Community Group</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Group Name"><input className={inputClass} value={groupForm.name} onChange={e=>setGroupForm({...groupForm,name:e.target.value})} placeholder="e.g. Umoja Chama"/></FormField>
                <FormField label="Type"><select className={inputClass} value={groupForm.type} onChange={e=>setGroupForm({...groupForm,type:e.target.value})}>{COMMUNITY_GROUP_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></FormField>
                <FormField label="Contribution Cycle"><select className={inputClass} value={groupForm.cycle} onChange={e=>setGroupForm({...groupForm,cycle:e.target.value})}>{["Weekly","Bi-weekly","Monthly","Quarterly"].map(c=><option key={c}>{c}</option>)}</select></FormField>
                <FormField label="Start Date"><input type="date" className={inputClass} value={groupForm.startDate} onChange={e=>setGroupForm({...groupForm,startDate:e.target.value})}/></FormField>
              </div>
              <div className="flex gap-2"><button onClick={addGroup} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Create Group</button><button onClick={()=>setShowGroupForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.rows.map((g) => {
              const typeColor = {"Table Banking":"#16A34A","Investment Club":"#2563EB","Chama":"#7C3AED","Welfare Fund":"#EF4444","SUCCESS Group":"#F59E0B","Church Fund":"#EC4899","NGO / CBO":"#0891B2","Cooperative":"#D97706"}[g.type]||"#6B7280";
              return (
                <div key={g.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 cursor-pointer hover:border-[#7C3AED] transition-colors" onClick={()=>{setSelGroup(g);setTab("contributions");}}>
                  <div className="flex items-start justify-between mb-3">
                    <div><p className="text-[14px] font-semibold text-[#111827]">{g.name}</p><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:typeColor+"18",color:typeColor}}>{g.type}</span></div>
                    <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">{g.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-lg p-2 text-center"><p className="text-[10px] text-slate-400">Members</p><p className="text-[15px] font-bold text-[#111827]">{g.members}</p></div>
                    <div className="rounded-lg p-2 text-center" style={{background:typeColor+"10"}}><p className="text-[10px] text-slate-400">Fund</p><p className="text-[15px] font-bold" style={{color:typeColor}}>TZS {money(g.fund)}k</p></div>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-2">{g.cycle} contributions &middot; Since {g.startDate}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CONTRIBUTIONS TAB */}
      {tab === "contributions" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13.5px] font-semibold text-[#111827]">Contributions {selGroup ? "— " + selGroup.name : "(All Groups)"}</p>
              <p className="text-[12px] text-slate-400">{pendingCtbs.length} pending &middot; TZS {money(thisMonthCtbs.reduce((s,c)=>s+c.amount,0))}k collected this month</p>
            </div>
            <button onClick={()=>setShowCtbForm(true)} className="flex items-center gap-1.5 btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5"><Plus size={13}/>Record</button>
          </div>
          {showCtbForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">Record Contribution</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <FormField label="Group"><select className={inputClass} value={ctbForm.groupId} onChange={e=>setCtbForm({...ctbForm,groupId:e.target.value})}><option value="">Select...</option>{groups.rows.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></FormField>
                <FormField label="Member Name"><input className={inputClass} value={ctbForm.member} onChange={e=>setCtbForm({...ctbForm,member:e.target.value})} placeholder="Member name"/></FormField>
                <FormField label="Amount (TZS k)"><input type="number" className={inputClass} value={ctbForm.amount} onChange={e=>setCtbForm({...ctbForm,amount:e.target.value})}/></FormField>
                <FormField label="Type"><select className={inputClass} value={ctbForm.type} onChange={e=>setCtbForm({...ctbForm,type:e.target.value})}>{["Contribution","Share Purchase","Fine","Registration","Special Levy"].map(t=><option key={t}>{t}</option>)}</select></FormField>
                <FormField label="Date"><input type="date" className={inputClass} value={ctbForm.date} onChange={e=>setCtbForm({...ctbForm,date:e.target.value})}/></FormField>
              </div>
              <div className="flex gap-2"><button onClick={addContribution} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Save</button><button onClick={()=>setShowCtbForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Date","Member","Group","Type","Amount","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>
                {(selGroup ? contributions.rows.filter(c=>c.groupId===selGroup.id) : contributions.rows).map((ct)=>{
                  const grp = groups.rows.find(g=>g.id===ct.groupId);
                  return (
                    <tr key={ct.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-mono text-slate-500">{ct.date}</td>
                      <td className="px-4 py-2.5 font-medium text-[#111827]">{ct.member}</td>
                      <td className="px-4 py-2.5 text-slate-500">{grp?.name||ct.groupId}</td>
                      <td className="px-4 py-2.5 text-slate-500">{ct.type}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-[#7C3AED]">TZS {money(ct.amount)}k</td>
                      <td className="px-4 py-2.5"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:ct.status==="Paid"?"#DCFCE7":"#FEF3C7",color:ct.status==="Paid"?"#16A34A":"#92400E"}}>{ct.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WELFARE FUND TAB */}
      {tab === "welfare" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-slate-200/80 p-4"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Welfare Reserve</p><p className="text-[22px] font-bold text-[#7C3AED]">TZS {money(1200)}k</p></div>
            <div className="bg-white rounded-xl border border-slate-200/80 p-4"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Disbursed YTD</p><p className="text-[22px] font-bold text-[#EF4444]">TZS 350k</p></div>
            <div className="bg-white rounded-xl border border-slate-200/80 p-4"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Claims Pending</p><p className="text-[22px] font-bold text-[#F59E0B]">1</p></div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><p className="text-[13.5px] font-semibold text-[#111827]">Welfare Claims</p></div>
            <table className="w-full text-[12.5px]"><thead><tr className="border-b border-slate-100 bg-slate-50">{["Event","Member","Amount","Date","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{WELFARE_EVENTS.map((w,i)=>(
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-[#111827]">{w.event}</td>
                  <td className="px-4 py-3 text-slate-600">{w.member}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-[#EF4444]">TZS {money(w.amount)}k</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{w.date}</td>
                  <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:w.status==="Paid"?"#DCFCE7":"#FEF3C7",color:w.status==="Paid"?"#16A34A":"#92400E"}}>{w.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORTS TAB */}
      {tab === "reports" && (
        <div className="space-y-4">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Total Groups",    String(groups.rows.length),                       "#7C3AED"],
              ["Total Members",   String(totalMembers),                             "#2563EB"],
              ["Funds Collected", `TZS ${money(contributions.rows.filter(c=>c.status==="Paid").reduce((s,c)=>s+c.amount,0))}k`, "#16A34A"],
              ["Pending",         `TZS ${money(contributions.rows.filter(c=>c.status==="Pending").reduce((s,c)=>s+c.amount,0))}k`, "#F59E0B"],
            ].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Funds by Group BarChart */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Funds Collected by Group</h3>
              {(() => {
                const grpData = groups.rows.map((g,i)=>({
                  name: g.name.length>14?g.name.slice(0,12)+"…":g.name,
                  value: contributions.rows.filter(c=>c.groupId===g.id&&c.status==="Paid").reduce((s,c)=>s+c.amount,0),
                  fill: ["#7C3AED","#2563EB","#16A34A","#D97706","#EF4444"][i%5],
                })).filter(d=>d.value>0);
                return grpData.length===0?<p className="text-slate-400 text-center py-6">No contributions</p>:(
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={grpData} margin={{left:0,right:10,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Collected"]}/>
                      <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={40}>
                        {grpData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
            {/* Contribution status PieChart */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Contribution Status</h3>
              {(() => {
                const ctbStatus = [
                  {name:"Paid",    value:contributions.rows.filter(c=>c.status==="Paid").length,    fill:"#16A34A"},
                  {name:"Pending", value:contributions.rows.filter(c=>c.status==="Pending").length, fill:"#F59E0B"},
                  {name:"Waived",  value:contributions.rows.filter(c=>c.status==="Waived").length,  fill:"#94A3B8"},
                ].filter(d=>d.value>0);
                return ctbStatus.length===0?<p className="text-slate-400 text-center py-6">No records</p>:(
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={150}>
                      <PieChart><Pie data={ctbStatus} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={30}>
                        {ctbStatus.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" records",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {ctbStatus.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTHCARE / CLINIC MANAGEMENT MODULE
// Based on the Al Shifa Clinic design — full clinical workflow:
// Patients · Doctors · Appointments · Visits · Doctor Review
// Medical Reports (with digital signature) · Prescriptions
// Laboratory · Radiology · Pharmacy · Invoices · Notifications
// ═══════════════════════════════════════════════════════════════════════════
export const HC_PATIENTS_SEED = [
  { id:"PT-001", mrn:"MRN-001-000001", firstName:"Mohammed", lastName:"Al Qahtani", gender:"Male", dob:"1990-03-14", age:36, bloodType:"O+", marital:"Married", status:"Stable", phone:"0501234567", email:"m.qahtani@email.com", nationalId:"1234567890", nationality:"Saudi", occupation:"Engineer", allergies:"Penicillin", chronicDiseases:"Hypertension", notes:"" },
  { id:"PT-002", mrn:"MRN-001-000002", firstName:"Noura", lastName:"Al Dossari", gender:"Female", dob:"1993-07-22", age:33, bloodType:"A+", marital:"Single", status:"Stable", phone:"0507654321", email:"n.dossari@email.com", nationalId:"2345678901", nationality:"Saudi", occupation:"Teacher", allergies:"None", chronicDiseases:"None", notes:"" },
  { id:"PT-003", mrn:"MRN-001-000003", firstName:"Yousef", lastName:"Al Mutairi", gender:"Male", dob:"1985-11-05", age:40, bloodType:"B-", marital:"Married", status:"Urgent", phone:"0551112233", email:"y.mutairi@email.com", nationalId:"3456789012", nationality:"Saudi", occupation:"Business Owner", allergies:"Sulfa drugs", chronicDiseases:"Diabetes Type 2", notes:"Monitor blood sugar weekly" },
  { id:"PT-004", mrn:"MRN-001-000004", firstName:"Leonardo", lastName:"Bacha", gender:"Male", dob:"1988-09-30", age:37, bloodType:"A+", marital:"Single", status:"Stable", phone:"5522336699", email:"admin@studies.com", nationalId:"121545", nationality:"Philipian", occupation:"", allergies:"None", chronicDiseases:"None", notes:"" },
];

export const HC_DOCTORS_SEED = [
  { id:"DR-001", firstName:"Ahmed", lastName:"Al Ghamdi", gender:"Male", specialty:"Cardiology", dept:"Cardiology", license:"LIC-1001", qualifications:"MD, FACC", fee:300, experience:12, phone:"0509876543", email:"a.ghamdi@clinic.com", status:"Active", bio:"Senior cardiologist with 12 years experience." },
  { id:"DR-002", firstName:"Layla", lastName:"Al Zahrani", gender:"Female", specialty:"General Medicine", dept:"General Medicine", license:"LIC-1002", qualifications:"MBBS, DFM", fee:250, experience:8, phone:"0558887766", email:"l.zahrani@clinic.com", status:"Active", bio:"Family medicine specialist." },
];

export const HC_APPTS_SEED = [
  { id:"APT-001", patientId:"PT-001", patient:"Mohammed Al Qahtani", doctorId:"DR-001", doctor:"Dr. Ahmed Al Ghamdi", type:"Consultation", start:"2026-07-16T09:00", end:"2026-07-16T09:30", fee:300, reason:"Chest pain follow-up", status:"Confirmed", notes:"" },
  { id:"APT-002", patientId:"PT-002", patient:"Noura Al Dossari", doctorId:"DR-002", doctor:"Dr. Layla Al Zahrani", type:"Check-up", start:"2026-07-17T10:00", end:"2026-07-17T10:30", fee:250, reason:"Annual check-up", status:"Scheduled", notes:"" },
];

export const HC_VISITS_SEED = [
  { id:"V-0001", patientId:"PT-001", patient:"Mohammed Al Qahtani", doctorId:"DR-001", doctor:"Dr. Ahmed Al Ghamdi", date:"2026-07-03T14:32", status:"Closed", diagnosis:"Hypertension management", notes:"BP controlled. Continue medication." },
];

export const HC_PRESCRIPTIONS_SEED = [
  { id:"RX-001", patientId:"PT-002", patient:"Noura Al Dossari", doctorId:"DR-002", doctor:"Dr. Layla Al Zahrani", date:"2026-07-03", drugs:[{ name:"Amlodipine 5mg", dosage:"5mg", frequency:"2x/day", days:6, qty:1, instructions:"After meals" }], notes:"", status:"Active" },
];

export const HC_REPORTS_SEED = [
  { id:"RPT-001", visitId:"V-0001", patientId:"PT-001", patient:"Mohammed Al Qahtani", doctorId:"DR-001", doctor:"Dr. Ahmed Al Ghamdi", title:"Consultation Summary", description:"Patient presents with controlled hypertension. BP reading 130/85. Continue current medications and dietary modifications. Follow-up in 3 months.", date:"2026-07-03", status:"Signed" },
];

export const HC_LAB_CATEGORIES = [
  { id:"LC-01", name:"Biochemistry", nameAr:"الكيمياء الحيوية" },
  { id:"LC-02", name:"Diabetes", nameAr:"السكري" },
  { id:"LC-03", name:"Hematology (Blood)", nameAr:"أمراض الدم" },
  { id:"LC-04", name:"Lipid Profile", nameAr:"الدهون" },
  { id:"LC-05", name:"Liver Function", nameAr:"وظائف الكبد" },
  { id:"LC-06", name:"Kidney Function", nameAr:"وظائف الكلى" },
  { id:"LC-07", name:"Thyroid", nameAr:"الغدة الدرقية" },
  { id:"LC-08", name:"Electrolytes", nameAr:"الأملاح" },
  { id:"LC-09", name:"Vitamins", nameAr:"الفيتامينات" },
  { id:"LC-10", name:"Inflammation", nameAr:"الالتهابات" },
  { id:"LC-11", name:"Cardiac", nameAr:"القلب" },
  { id:"LC-12", name:"Urine", nameAr:"البول" },
];

export const HC_LAB_TESTS = [
  "Albumin","ALT (SGPT)","Calcium","CK-MB","C-Reactive Protein (CRP)","eGFR","Fasting Blood Glucose","Fasting Insulin",
  "Alkaline Phosphatase","AST (SGOT)","Chloride","Complete Blood Count (CBC)","Creatinine","ESR","HbA1c","LDL Cholesterol",
  "HDL Cholesterol","Total Cholesterol","Triglycerides","TSH","T3","T4","Vitamin D","Vitamin B12","Uric Acid","Urine Analysis",
  "PSA","Iron","Ferritin","Sodium","Potassium","Magnesium","Phosphorus","Troponin I","BNP","D-Dimer","PT/INR",
];

export const HC_MEDICATIONS = [
  "Amlodipine 5mg","Metformin 500mg","Paracetamol 500mg","Ibuprofen 400mg","Amoxicillin 500mg","Omeprazole 20mg",
  "Atorvastatin 10mg","Losartan 50mg","Metoprolol 25mg","Aspirin 81mg","Vitamin D3 1000IU","Vitamin B12 500mcg",
  "Azithromycin 500mg","Ciprofloxacin 500mg","Prednisolone 5mg","Salbutamol Inhaler","Insulin Glargine","Glibenclamide 5mg",
];

export const BLOOD_TYPES = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

export const APPT_TYPES = ["Consultation","Check-up","Follow-up","Emergency","Procedure","Vaccination"];

export const APPT_STATUSES = ["Scheduled","Confirmed","In Progress","Completed","Cancelled","No Show"];

// ─── VITALS / TRIAGE ────────────────────────────────────────────────────────
export const VITAL_SEED = [
  { id:"V001", patientId:"PT-001", patient:"Mohammed Al Qahtani", date:"2026-07-16", bp:"130/85", pulse:72, temp:36.8, weight:82, height:175, spo2:98, respiratoryRate:16, pain:2, nurse:"Nurse Hana", notes:"Stable vitals" },
  { id:"V002", patientId:"PT-003", patient:"Yousef Al Mutairi",   date:"2026-07-16", bp:"145/95", pulse:88, temp:37.2, weight:95, height:178, spo2:96, respiratoryRate:18, pain:5, nurse:"Nurse Hana", notes:"Elevated BP, referred to doctor" },
];
