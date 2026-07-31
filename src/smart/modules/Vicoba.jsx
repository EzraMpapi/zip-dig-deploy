import { useState } from "react";
import {
  AlertCircle, CalendarCheck, CircleDollarSign, LayoutDashboard, Plus, TrendingUp, UserPlus,
  Users, Wallet
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

/* ══════════════ SHELL ══════════════ */
/* ---------------------------------- SHELL ----------------------------------- */


// ═══════════════════════════════════════════════════════════════════════════
// VICOBA / SACCOS COMMUNITY SAVINGS MODULE
// Handles: member registry, weekly share contributions, loan applications,
// loan approvals, repayments, fines, dividend distribution, meeting minutes.
// Used by: VICOBA groups, SACCOS, investment clubs, table banking groups.
// ═══════════════════════════════════════════════════════════════════════════
export const VICOBA_MEMBER_SEED = [
  { id: "MBR-001", name: "Amina Hassan",   phone: "0712-345-678", shares: 24, contributions: 480, joinedDate: "2024-01-15", status: "Active",  gender: "F" },
  { id: "MBR-002", name: "John Mwangi",    phone: "0756-789-012", shares: 18, contributions: 360, joinedDate: "2024-01-15", status: "Active",  gender: "M" },
  { id: "MBR-003", name: "Fatuma Juma",    phone: "0783-456-123", shares: 30, contributions: 600, joinedDate: "2024-02-01", status: "Active",  gender: "F" },
  { id: "MBR-004", name: "Peter Kamau",    phone: "0622-111-222", shares: 12, contributions: 240, joinedDate: "2024-03-10", status: "Active",  gender: "M" },
  { id: "MBR-005", name: "Grace Mwenda",   phone: "0769-333-444", shares: 20, contributions: 400, joinedDate: "2024-01-15", status: "Active",  gender: "F" },
  { id: "MBR-006", name: "David Odhiambo", phone: "0744-555-666", shares: 8,  contributions: 160, joinedDate: "2024-04-05", status: "Defaulter",gender: "M" },
];

export const VICOBA_LOAN_SEED = [
  { id: "VL-001", memberId: "MBR-001", memberName: "Amina Hassan",   amount: 500,  rate: 10, weeks: 12, disbursed: "2026-01-15", status: "Active",    balance: 280 },
  { id: "VL-002", memberId: "MBR-003", memberName: "Fatuma Juma",    amount: 1000, rate: 10, weeks: 24, disbursed: "2026-02-01", status: "Active",    balance: 650 },
  { id: "VL-003", memberId: "MBR-002", memberName: "John Mwangi",    amount: 300,  rate: 10, weeks: 8,  disbursed: "2025-11-10", status: "Repaid",    balance: 0   },
  { id: "VL-004", memberId: "MBR-006", memberName: "David Odhiambo", amount: 200,  rate: 10, weeks: 8,  disbursed: "2025-12-01", status: "Defaulted", balance: 180 },
];

export const VICOBA_MEETING_SEED = [
  { id: "MTG-001", date: "2026-07-07", venue: "Community Hall", attendees: 5, totalBuyIn: 240, loansGiven: 1, minutes: "Reviewed Q2 performance. Elected new treasurer. Approved 1 loan application." },
  { id: "MTG-002", date: "2026-06-30", venue: "Chairperson&apos;s House", attendees: 6, totalBuyIn: 288, loansGiven: 0, minutes: "Annual dividend discussion. All members present. Fine collected from 1 member." },
];

export function VicobaSaccosModule({ currentUser }) {
  const [tab, setTab] = useState("overview");
  const members  = useCompanyTable("vicoba_members",  VICOBA_MEMBER_SEED,  { mapRow: (r) => ({ ...r, shares: r.shares||0, contributions: r.contributions||0 }) });
  const loans    = useCompanyTable("vicoba_loans",    VICOBA_LOAN_SEED,    { mapRow: (r) => ({ ...r, balance: r.balance||0 }) });
  const meetings = useCompanyTable("vicoba_meetings", VICOBA_MEETING_SEED, { mapRow: (r) => r });
  const [memberForm, setMemberForm] = useState({ name:"", phone:"", gender:"F", shares:1 });
  const [loanForm,   setLoanForm]   = useState({ memberId:"", amount:"", weeks:12, rate:10 });
  const [meetingForm,setMeetingForm]= useState({ date: TODAY.toISOString().slice(0,10), venue:"", attendees:"", totalBuyIn:"", minutes:"" });
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [showLoanForm,   setShowLoanForm]   = useState(false);
  const [showMeetingForm,setShowMeetingForm]= useState(false);

  const totalShares       = members.rows.reduce((s,m) => s + m.shares, 0);
  const totalFund         = members.rows.reduce((s,m) => s + m.contributions, 0);
  const activeLoans       = loans.rows.filter((l) => l.status === "Active");
  const totalLoanPortfolio= activeLoans.reduce((s,l) => s + l.balance, 0);
  const defaulted         = loans.rows.filter((l) => l.status === "Defaulted");
  const SHARE_PRICE       = 20; // TZS 20k per share

  const VICOBA_TABS = [
    { id:"overview",   label:"Overview",   icon: LayoutDashboard },
    { id:"members",    label:"Members",    icon: Users },
    { id:"loans",      label:"Loans",      icon: CircleDollarSign },
    { id:"meetings",   label:"Meetings",   icon: CalendarCheck },
    { id:"dividends",  label:"Dividends",  icon: TrendingUp },
  ];

  async function addMember() {
    if (!memberForm.name.trim()) return;
    const row = { id: docId("MBR"), name: memberForm.name.trim(), phone: memberForm.phone, gender: memberForm.gender,
      shares: Number(memberForm.shares)||1, contributions: (Number(memberForm.shares)||1)*SHARE_PRICE,
      joinedDate: TODAY.toISOString().slice(0,10), status:"Active" };
    members.setRows((prev) => [row, ...prev]);
    setMemberForm({ name:"", phone:"", gender:"F", shares:1 });
    setShowMemberForm(false);
    notify("Member " + row.name + " added");
    if (IS_CONFIGURED) { try { await sb("vicoba_members").insert({ name:row.name, phone:row.phone, gender:row.gender, shares:row.shares, contributions:row.contributions, joined_date:row.joinedDate, status:"Active" }).run(); } catch(_e){} }
  }

  async function disburseLoan() {
    if (!loanForm.memberId || !loanForm.amount) return;
    const member = members.rows.find((m) => m.id === loanForm.memberId);
    const total  = Number(loanForm.amount) * (1 + Number(loanForm.rate)/100);
    const row = { id: docId("VL"), memberId: loanForm.memberId, memberName: member?.name||"",
      amount: Number(loanForm.amount), rate: Number(loanForm.rate), weeks: Number(loanForm.weeks),
      disbursed: TODAY.toISOString().slice(0,10), status:"Active", balance: total };
    loans.setRows((prev) => [row, ...prev]);
    setLoanForm({ memberId:"", amount:"", weeks:12, rate:10 });
    setShowLoanForm(false);
    notify("Loan of TZS " + money(row.amount) + "k disbursed to " + member?.name);
    if (IS_CONFIGURED) { try { await sb("vicoba_loans").insert({ member_id:row.memberId, amount:row.amount, rate:row.rate, weeks:row.weeks, disbursed:row.disbursed, status:"Active", balance:row.balance }).run(); } catch(_e){} }
  }

  async function repayLoan(loan, amount) {
    const newBal = Math.max(0, loan.balance - amount);
    const newStatus = newBal <= 0 ? "Repaid" : "Active";
    loans.setRows((prev) => prev.map((l) => l.id===loan.id ? {...l, balance: newBal, status: newStatus} : l));
    notify("TZS " + money(amount) + "k repayment recorded for " + loan.memberName);
    logAudit("Loan repayment: " + loan.id, "VICOBA", currentUser?.name||"System", "TZS " + money(amount) + "k");
  }

  async function addMeeting() {
    if (!meetingForm.venue.trim()) return;
    const row = { id: docId("MTG"), ...meetingForm, attendees: Number(meetingForm.attendees)||0, totalBuyIn: Number(meetingForm.totalBuyIn)||0, loansGiven: 0 };
    meetings.setRows((prev) => [row, ...prev]);
    setMeetingForm({ date: TODAY.toISOString().slice(0,10), venue:"", attendees:"", totalBuyIn:"", minutes:"" });
    setShowMeetingForm(false);
    notify("Meeting recorded for " + row.date);
  }

  // Dividend calculation — distributes profit proportional to shares held
  const totalInterestEarned = loans.rows.reduce((s,l) => s + (l.amount * l.rate/100), 0);
  const dividendPerShare = totalShares > 0 ? totalInterestEarned / totalShares : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden px-5 py-5 relative" style={{background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 60%,#1D4ED8 100%)"}}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[19px] font-bold text-white">VICOBA / SACCOS Manager</h1>
            <p className="text-[12px] mt-0.5" style={{color:"rgba(255,255,255,.65)"}}>Community savings &amp; credit management &middot; {members.rows.length} members &middot; Cycle 2026</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowMemberForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold text-white" style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)"}}><UserPlus size={13}/>Add Member</button>
            <button onClick={() => setShowLoanForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold text-white" style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)"}}><Plus size={13}/>New Loan</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {VICOBA_TABS.map((t) => {
          const I = t.icon;
          return <button key={t.id} onClick={() => setTab(t.id)} className={"flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap " + (tab===t.id?"bg-[#2563EB] text-white shadow-sm":"text-slate-500 hover:bg-slate-50")}><I size={13}/>{t.label}</button>;
        })}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label:"Total Members", value: members.rows.length, sub: members.rows.filter(m=>m.status==="Active").length+" active", icon: Users, color:"#2563EB" },
              { label:"Group Fund",    value: "TZS "+money(totalFund)+"k", sub:"Total contributions", icon: Wallet, color:"#16A34A" },
              { label:"Loan Portfolio",value: "TZS "+money(totalLoanPortfolio)+"k", sub: activeLoans.length+" active loans", icon: CircleDollarSign, color:"#F59E0B" },
              { label:"Defaulted",     value: "TZS "+money(defaulted.reduce((s,l)=>s+l.balance,0))+"k", sub: defaulted.length+" loans at risk", icon: AlertCircle, color:"#EF4444" },
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.label}</p>
                    <p className="text-[21px] font-bold mt-1 text-[#111827]">{k.value}</p>
                    <p className="text-[11px] mt-0.5" style={{color:k.color}}>{k.sub}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:k.color+"18"}}><k.icon size={17} style={{color:k.color}}/></div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Share Distribution — Top Members</p>
              {(() => {
                const shareData = [...members.rows].sort((a,b)=>b.shares-a.shares).slice(0,6).map((m,i)=>({
                  name: m.name.split(" ")[0],
                  value: m.shares,
                  fill: ["#2563EB","#16A34A","#D97706","#7C3AED","#EF4444","#0891B2"][i%6],
                }));
                return shareData.length===0?<p className="text-slate-400 text-center py-4">No members</p>:(
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={shareData} margin={{left:0,right:10,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v)=>[v+" shares","Shares"]}/>
                      <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={36}>
                        {shareData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Loan Portfolio Status</p>
              {(() => {
                const loanStatusData = [
                  {name:"Active",   value:loans.rows.filter(l=>l.status==="Active").length,   fill:"#2563EB"},
                  {name:"Repaid",   value:loans.rows.filter(l=>l.status==="Repaid").length,   fill:"#16A34A"},
                  {name:"Defaulted",value:loans.rows.filter(l=>l.status==="Defaulted").length,fill:"#EF4444"},
                ].filter(d=>d.value>0);
                return loanStatusData.length===0?<p className="text-slate-400 text-center py-4">No loans yet</p>:(
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={150}>
                      <PieChart><Pie data={loanStatusData} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={30}>
                        {loanStatusData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" loans",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {loanStatusData.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[11.5px] text-slate-500">Interest Earned: <strong className="text-[#16A34A]">TZS {money(Math.round(totalInterestEarned))}k</strong></p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
        </div>
      )}

      {/* Members */}
      {tab === "members" && (
        <div className="space-y-3">
          {showMemberForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">Add New Member</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Full Name"><input className={inputClass} value={memberForm.name} onChange={e=>setMemberForm({...memberForm,name:e.target.value})} placeholder="Full name"/></FormField>
                <FormField label="Phone"><input className={inputClass} value={memberForm.phone} onChange={e=>setMemberForm({...memberForm,phone:e.target.value})} placeholder="07XX XXX XXX"/></FormField>
                <FormField label="Gender"><select className={inputClass} value={memberForm.gender} onChange={e=>setMemberForm({...memberForm,gender:e.target.value})}><option value="F">Female</option><option value="M">Male</option></select></FormField>
                <FormField label="Initial Shares"><input type="number" min="1" className={inputClass} value={memberForm.shares} onChange={e=>setMemberForm({...memberForm,shares:e.target.value})} placeholder="1"/></FormField>
              </div>
              <div className="flex gap-2"><button onClick={addMember} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Save Member</button><button onClick={()=>setShowMemberForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                {["Member","Phone","Gender","Shares","Fund (TZS k)","Status",""].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}
              </tr></thead>
              <tbody>
                {members.rows.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{background:"#2563EB"}}>{m.name.charAt(0)}</div><span className="font-medium text-[#111827]">{m.name}</span></div></td>
                    <td className="px-4 py-3 text-slate-500">{m.phone}</td>
                    <td className="px-4 py-3 text-slate-500">{m.gender==="F"?"Female":"Male"}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-[#111827]">{m.shares}</td>
                    <td className="px-4 py-3 font-mono text-[#16A34A]">{money(m.contributions)}k</td>
                    <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:m.status==="Active"?"#DCFCE7":m.status==="Defaulter"?"#FEE2E2":"#F3F4F6",color:m.status==="Active"?"#16A34A":m.status==="Defaulter"?"#EF4444":"#6B7280"}}>{m.status}</span></td>
                    <td className="px-4 py-3"><button onClick={()=>setLoanForm({...loanForm,memberId:m.id})} className="text-[11px] text-[#2563EB] hover:underline">Loan</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Loans */}
      {tab === "loans" && (
        <div className="space-y-3">
          {showLoanForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">New Loan Application</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Member">
                  <select className={inputClass} value={loanForm.memberId} onChange={e=>setLoanForm({...loanForm,memberId:e.target.value})}>
                    <option value="">Select member...</option>
                    {members.rows.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Amount (TZS k)"><input type="number" min="0" className={inputClass} value={loanForm.amount} onChange={e=>setLoanForm({...loanForm,amount:e.target.value})} placeholder="0"/></FormField>
                <FormField label="Interest Rate (%)"><input type="number" className={inputClass} value={loanForm.rate} onChange={e=>setLoanForm({...loanForm,rate:e.target.value})}/></FormField>
                <FormField label="Repayment Weeks"><input type="number" min="1" className={inputClass} value={loanForm.weeks} onChange={e=>setLoanForm({...loanForm,weeks:e.target.value})}/></FormField>
              </div>
              {loanForm.amount && <p className="text-[12px] text-slate-500">Total repayable: <strong className="text-[#111827]">TZS {money(Number(loanForm.amount)*(1+loanForm.rate/100))}k</strong> &middot; Weekly: <strong>TZS {money(Number(loanForm.amount)*(1+loanForm.rate/100)/loanForm.weeks)}k</strong></p>}
              <div className="flex gap-2"><button onClick={disburseLoan} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Disburse Loan</button><button onClick={()=>setShowLoanForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          {!showLoanForm && <div className="flex justify-end"><button onClick={()=>setShowLoanForm(true)} className="flex items-center gap-1.5 btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5"><Plus size={13}/>New Loan</button></div>}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                {["Loan ID","Member","Principal","Interest","Balance","Status","Action"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}
              </tr></thead>
              <tbody>
                {loans.rows.map((l) => {
                  const interest = l.amount * l.rate / 100;
                  const pct = l.balance / (l.amount + interest) * 100;
                  return (
                    <tr key={l.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 font-mono font-medium text-[#2563EB]">{l.id}</td>
                      <td className="px-4 py-3 font-medium text-[#111827]">{l.memberName}</td>
                      <td className="px-4 py-3 font-mono">{money(l.amount)}k</td>
                      <td className="px-4 py-3 font-mono text-[#F59E0B]">{money(interest)}k</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:Math.max(0,pct)+"%",background:l.status==="Defaulted"?"#EF4444":"#2563EB"}}/></div>
                          <span className="font-mono text-[11.5px] font-bold" style={{color:l.status==="Defaulted"?"#EF4444":"#111827"}}>{money(l.balance)}k</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:l.status==="Active"?"#DBEAFE":l.status==="Repaid"?"#DCFCE7":"#FEE2E2",color:l.status==="Active"?"#2563EB":l.status==="Repaid"?"#16A34A":"#EF4444"}}>{l.status}</span></td>
                      <td className="px-4 py-3">{l.status==="Active"&&<button onClick={()=>{ const amt=prompt("Amount received (TZS k):"); if(amt&&Number(amt)>0) repayLoan(l,Number(amt)); }} className="text-[11.5px] font-semibold text-white bg-[#16A34A] px-2.5 py-1 rounded-lg">Repay</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Meetings */}
      {tab === "meetings" && (
        <div className="space-y-3">
          {!showMeetingForm && <div className="flex justify-end"><button onClick={()=>setShowMeetingForm(true)} className="flex items-center gap-1.5 btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5"><Plus size={13}/>Record Meeting</button></div>}
          {showMeetingForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">Record Meeting</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Date"><input type="date" className={inputClass} value={meetingForm.date} onChange={e=>setMeetingForm({...meetingForm,date:e.target.value})}/></FormField>
                <FormField label="Venue"><input className={inputClass} value={meetingForm.venue} onChange={e=>setMeetingForm({...meetingForm,venue:e.target.value})} placeholder="Meeting location"/></FormField>
                <FormField label="Attendees"><input type="number" className={inputClass} value={meetingForm.attendees} onChange={e=>setMeetingForm({...meetingForm,attendees:e.target.value})}/></FormField>
                <FormField label="Buy-in (TZS k)"><input type="number" className={inputClass} value={meetingForm.totalBuyIn} onChange={e=>setMeetingForm({...meetingForm,totalBuyIn:e.target.value})}/></FormField>
              </div>
              <FormField label="Minutes / Notes">
                <textarea className={inputClass + " min-h-[80px] resize-none"} value={meetingForm.minutes} onChange={e=>setMeetingForm({...meetingForm,minutes:e.target.value})} placeholder="Key decisions, resolutions, actions..."/>
              </FormField>
              <div className="flex gap-2"><button onClick={addMeeting} className="btn-primary text-white text-[12.5px] rounded-xl px-4 py-2.5">Save Meeting</button><button onClick={()=>setShowMeetingForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="space-y-3">
            {meetings.rows.map((m) => (
              <div key={m.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div><p className="text-[14px] font-semibold text-[#111827]">Meeting — {m.date}</p><p className="text-[12px] text-slate-400">{m.venue}</p></div>
                  <div className="flex gap-4 text-right">
                    <div><p className="text-[10.5px] text-slate-400">Attendees</p><p className="text-[14px] font-bold text-[#2563EB]">{m.attendees}</p></div>
                    <div><p className="text-[10.5px] text-slate-400">Buy-in</p><p className="text-[14px] font-bold text-[#16A34A]">TZS {money(m.totalBuyIn)}k</p></div>
                  </div>
                </div>
                {m.minutes && <p className="text-[12px] text-slate-500 leading-relaxed">{m.minutes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dividends */}
      {tab === "dividends" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <h3 className="text-[15px] font-semibold text-[#111827] mb-1">Annual Dividend Projection</h3>
            <p className="text-[12px] text-slate-500 mb-4">Based on current interest earned from all loans. Distributed proportional to shares held.</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[11px] text-slate-400 mb-1">Total Interest</p><p className="text-[18px] font-bold text-[#16A34A]">TZS {money(totalInterestEarned)}k</p></div>
              <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[11px] text-slate-400 mb-1">Total Shares</p><p className="text-[18px] font-bold text-[#2563EB]">{totalShares}</p></div>
              <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[11px] text-slate-400 mb-1">Per Share</p><p className="text-[18px] font-bold text-[#111827]">TZS {money(dividendPerShare)}k</p></div>
            </div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100"><th className="py-2 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Member</th><th className="py-2 text-right text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Shares</th><th className="py-2 text-right text-[10.5px] font-medium uppercase tracking-wide text-slate-400">Dividend</th></tr></thead>
              <tbody>
                {[...members.rows].sort((a,b)=>b.shares-a.shares).map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-[#111827]">{m.name}</td>
                    <td className="py-2.5 text-right font-mono">{m.shares}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-[#16A34A]">TZS {money(m.shares * dividendPerShare)}k</td>
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

// ═══════════════════════════════════════════════════════════════════════════
// COMMUNITY GROUPS MODULE
// Handles: Table Banking, Investment Clubs, Chamas, Welfare Funds, SUCCESS,
// Church Funds, NGO Project Tracking, Cooperative Societies.
// Each group type has its own workflow but shares the same fund management.
// ═══════════════════════════════════════════════════════════════════════════
export const COMMUNITY_GROUP_TYPES = [
  "Table Banking", "Investment Club", "Chama", "Welfare Fund", "SUCCESS Group",
  "Church Fund", "NGO / CBO", "Cooperative", "Youth Group", "Women&apos;s Group"
];

export const COMM_GROUPS_SEED = [
  { id: "GRP-001", name: "Umoja Investment Club", type: "Investment Club", members: 12, fund: 3600, cycle: "Monthly", startDate: "2024-01-01", status: "Active" },
  { id: "GRP-002", name: "Mama Faida Table Banking", type: "Table Banking",  members: 20, fund: 2400, cycle: "Weekly",  startDate: "2024-03-15", status: "Active" },
  { id: "GRP-003", name: "Vijana SUCCESS Group",    type: "SUCCESS Group",   members: 15, fund: 1800, cycle: "Monthly", startDate: "2025-01-01", status: "Active" },
];

export const COMM_CONTRIBUTIONS_SEED = [
  { id: "CTB-001", groupId: "GRP-001", member: "Alice Ng&apos;endo", amount: 100, date: "2026-07-01", type: "Monthly Share",  status: "Paid" },
  { id: "CTB-002", groupId: "GRP-001", member: "Bob Otieno",        amount: 100, date: "2026-07-01", type: "Monthly Share",  status: "Paid" },
  { id: "CTB-003", groupId: "GRP-002", member: "Chama Mwalimu",     amount: 50,  date: "2026-07-07", type: "Weekly Buy-in",  status: "Paid" },
  { id: "CTB-004", groupId: "GRP-001", member: "Diana Waweru",      amount: 100, date: "2026-07-01", type: "Monthly Share",  status: "Pending" },
];
