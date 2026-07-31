import { useState } from "react";
import {
  AlertCircle, Bus, CalendarDays, CircleDollarSign, Download, LayoutDashboard, Library,
  NotebookPen, Plus, Printer, School, Search, UserCheck, UserPlus, Users
} from "lucide-react";
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip
} from "recharts";
import { FormField, inputClass } from "../components/ui.jsx";
import { recordPayment } from "../data/sales.jsx";
import { docId, money } from "../lib/format.jsx";
import { useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { Attendance } from "../modules/HR.jsx";
import {
  SCHOOL_LEVELS,
  SCH_BOOKS_SEED,
  SCH_CLASSES_SEED,
  SCH_EXAMS_SEED,
  SCH_FEES_SEED,
  SCH_STUDENTS_SEED,
  SCH_TEACHERS_SEED,
  SCH_TRANSPORT_SEED,
  TERMS,
} from "../modules/Healthcare.jsx";
import { downloadCSV, printReport } from "../modules/Reports.jsx";

export function SchoolManagementModule({ currentUser, company }) {
  const [tab, setTab] = useState("overview");
  const students  = useCompanyTable("sch_students",  SCH_STUDENTS_SEED,  { mapRow: r => r });
  const teachers  = useCompanyTable("sch_teachers",  SCH_TEACHERS_SEED,  { mapRow: r => r });
  const classes   = useCompanyTable("sch_classes",   SCH_CLASSES_SEED,   { mapRow: r => r });
  const exams     = useCompanyTable("sch_exams",     SCH_EXAMS_SEED,     { mapRow: r => r });
  const fees      = useCompanyTable("sch_fees",      SCH_FEES_SEED,      { mapRow: r => r });
  const books     = useCompanyTable("sch_books",     SCH_BOOKS_SEED,     { mapRow: r => r });
  const transport = useCompanyTable("sch_transport", SCH_TRANSPORT_SEED, { mapRow: r => r });

  const [stuForm, setStuForm]   = useState({ name:"", gender:"M", class:"Form 1A", dob:"", parent:"", phone:"" });
  const [feeForm, setFeeForm]   = useState({ studentId:"", term: TERMS[1], amount:"", paid:"" });
  const [showStu, setShowStu]   = useState(false);
  const [showFee, setShowFee]   = useState(false);
  const [searchQ, setSearchQ]   = useState("");

  const SCH_BLUE = "#1E3A8A";
  const SCH_GOLD = "#D97706";

  const TABS = [
    { id:"overview",   label:"Overview",     icon: LayoutDashboard },
    { id:"students",   label:"Students",     icon: Users },
    { id:"teachers",   label:"Teachers",     icon: UserCheck },
    { id:"classes",    label:"Classes",      icon: School },
    { id:"attendance", label:"Attendance",   icon: CalendarDays },
    { id:"exams",      label:"Examinations", icon: NotebookPen },
    { id:"fees",       label:"Fee Collection", icon: CircleDollarSign },
    { id:"library",    label:"Library",      icon: Library },
    { id:"transport",  label:"Transport",    icon: Bus },
  ];

  const totalStudents  = students.rows.length;
  const activeStudents = students.rows.filter(s => s.status === "Active").length;
  const totalFees      = fees.rows.reduce((s, f) => s + f.amount, 0);
  const collectedFees  = fees.rows.reduce((s, f) => s + f.paid, 0);
  const feeCollection  = totalFees > 0 ? (collectedFees / totalFees * 100).toFixed(1) : 0;
  const outstanding    = fees.rows.reduce((s, f) => s + f.balance, 0);

  const nextAdmNo = () => "ADM-" + new Date().getFullYear() + "-" + String(students.rows.length + 1).padStart(3, "0");

  async function addStudent() {
    if (!stuForm.name.trim()) return;
    const row = { ...stuForm, id: docId("STU"), admNo: nextAdmNo(), balance: 0, status: "Active" };
    students.setRows(p => [row, ...p]);
    setStuForm({ name:"", gender:"M", class:"Form 1A", dob:"", parent:"", phone:"" });
    setShowStu(false);
    notify("Student " + row.name + " enrolled — " + row.admNo);
    if (IS_CONFIGURED) { try { await sb("sch_students").insert(row).run(); } catch(_e){} }
  }

  async function recordPayment() {
    if (!feeForm.studentId || !feeForm.amount) return;
    const stu = students.rows.find(s => s.id === feeForm.studentId);
    const paid = Number(feeForm.paid) || 0;
    const amount = Number(feeForm.amount);
    const bal = Math.max(0, amount - paid);
    const status = bal === 0 ? "Paid" : paid === 0 ? "Unpaid" : "Partial";
    const row = { id: docId("FEE"), studentId: feeForm.studentId, student: stu?.name||"", class: stu?.class||"", term: feeForm.term, amount, paid, balance: bal, dueDate: new Date().toISOString().slice(0,10), status };
    fees.setRows(p => [row, ...p]);
    setFeeForm({ studentId:"", term: TERMS[1], amount:"", paid:"" });
    setShowFee(false);
    notify("Fee record created for " + stu?.name);
  }

  const filteredStudents = students.rows.filter(s => !searchQ || s.name.toLowerCase().includes(searchQ.toLowerCase()) || s.admNo.includes(searchQ));

  const StatusChip = ({ s }) => {
    const cfg = { Active:["#DCFCE7","#16A34A"], Inactive:["#FEE2E2","#EF4444"], Paid:["#DCFCE7","#16A34A"], Partial:["#FEF3C7","#D97706"], Unpaid:["#FEE2E2","#EF4444"], Completed:["#DBEAFE","#2563EB"], Scheduled:["#F5F3FF","#7C3AED"] };
    const [bg, col] = cfg[s] || ["#F3F4F6","#6B7280"];
    return <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background:bg, color:col }}>{s}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl px-6 py-5 relative overflow-hidden" style={{ background:"linear-gradient(135deg,#1E3A8A 0%,#1D4ED8 50%,#0369A1 100%)" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage:"repeating-linear-gradient(45deg,transparent,transparent 20px,rgba(255,255,255,.3) 20px,rgba(255,255,255,.3) 21px)" }}/>
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <School size={22} className="text-white"/>
              <h1 className="text-[20px] font-bold text-white">{company?.name||"School"} Management System</h1>
            </div>
            <p className="text-[12px]" style={{color:"rgba(255,255,255,.65)"}}>Students · Teachers · Classes · Exams · Fees · Library · Transport</p>
          </div>
          <div className="flex gap-3">
            {[["Students", activeStudents, "#DBEAFE", "#1E40AF"], ["Teachers", teachers.rows.filter(t=>t.status==="Active").length, "#D1FAE5", "#065F46"], ["Fee Rate", feeCollection+"%", "#FEF3C7", "#92400E"]].map(([l,v,bg,col])=>(
              <div key={l} className="rounded-xl px-4 py-2.5 text-center" style={{background:"rgba(255,255,255,.12)"}}>
                <p className="text-[20px] font-bold text-white">{v}</p>
                <p className="text-[10.5px] text-white/60">{l}</p>
              </div>
            ))}
            <button onClick={()=>setShowStu(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-white" style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)"}}><UserPlus size={14}/>Enroll Student</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {TABS.map(t => { const I = t.icon; return (
          <button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1 px-3 py-2 rounded-lg text-[11.5px] font-medium transition-all whitespace-nowrap "+(tab===t.id?"text-white shadow-sm":"text-slate-500 hover:bg-slate-50")} style={{background:tab===t.id?SCH_BLUE:"transparent"}}>
            <I size={12}/>{t.label}
          </button>
        ); })}
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { l:"Total Students",   v:totalStudents,    sub:activeStudents+" active",      c:"#1E3A8A", I:Users },
              { l:"Total Teachers",   v:teachers.rows.length, sub:"Academic staff",         c:"#059669", I:UserCheck },
              { l:"Fee Collected",    v:"TZS "+money(collectedFees)+"k", sub:feeCollection+"% of total", c:SCH_GOLD, I:CircleDollarSign },
              { l:"Outstanding Fees", v:"TZS "+money(outstanding)+"k",   sub:fees.rows.filter(f=>f.status!=="Paid").length+" students", c:"#EF4444", I:AlertCircle },
            ].map(k => (
              <div key={k.l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.l}</p><p className="text-[22px] font-bold mt-1 text-[#111827]">{k.v}</p><p className="text-[11.5px] mt-0.5" style={{color:k.c}}>{k.sub}</p></div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background:k.c+"18"}}><k.I size={18} style={{color:k.c}}/></div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Enrolment by Level</p>
              {SCHOOL_LEVELS.map(level => {
                const n = students.rows.filter(s => s.class?.startsWith(level)).length;
                const pct = totalStudents > 0 ? n/totalStudents*100 : 0;
                return (
                  <div key={level} className="flex items-center gap-2 mb-2.5">
                    <span className="text-[12px] text-slate-600 w-16 shrink-0">{level}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:pct+"%", background:SCH_BLUE}}/></div>
                    <span className="text-[12px] font-bold text-slate-700 w-6 text-right">{n}</span>
                  </div>
                );
              })}
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Fee Collection Status</p>
              {(() => {
                const feeData = [
                  {name:"Paid",    value:fees.rows.filter(f=>f.status==="Paid").length,    fill:"#16A34A"},
                  {name:"Partial", value:fees.rows.filter(f=>f.status==="Partial").length, fill:"#D97706"},
                  {name:"Unpaid",  value:fees.rows.filter(f=>f.status==="Unpaid").length,  fill:"#EF4444"},
                ].filter(d=>d.value>0);
                if (!feeData.length) return <p className="text-slate-400 text-center py-4">No fee records</p>;
                return (
                  <div className="flex items-center gap-3">
                    <ResponsiveContainer width="55%" height={130}>
                      <PieChart><Pie data={feeData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                        {feeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" records",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {feeData.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                      <p className="text-[11.5px] font-bold text-[#1E3A8A] pt-1">{feeCollection}% collection rate</p>
                    </div>
                  </div>
                );
              })()}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Recent Exams</p>
              <div className="space-y-2">
                {exams.rows.slice(0,4).map(e => (
                  <div key={e.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                    <div><p className="text-[12.5px] font-medium text-[#111827]">{e.subject}</p><p className="text-[10.5px] text-slate-400">{e.class} · {e.date}</p></div>
                    <div className="text-right"><StatusChip s={e.status}/>{e.avgScore>0&&<p className="text-[11px] text-slate-500 mt-0.5">Avg: {e.avgScore}%</p>}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STUDENTS */}
      {tab==="students" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={inputClass+" pl-9"} placeholder="Search by name or admission number..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/></div>
            <button onClick={()=>downloadCSV("students",students.rows,[{key:"admNo",label:"Adm No"},{key:"name",label:"Name"},{key:"gender",label:"Gender"},{key:"class",label:"Class"},{key:"parent",label:"Parent"},{key:"phone",label:"Phone"},{key:"status",label:"Status"}])} className="flex items-center gap-1 text-[12px] font-medium text-slate-500 border border-slate-200 px-3 py-2.5 rounded-xl hover:border-[#16A34A] hover:text-[#16A34A] transition-colors"><Download size={13}/>Export</button>
            <button onClick={()=>setShowStu(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:SCH_BLUE}}><UserPlus size={13}/>Enroll</button>
          </div>
          {showStu && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <p className="text-[14px] font-semibold text-[#111827]">Enroll New Student</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Full Name *"><input className={inputClass} value={stuForm.name} onChange={e=>setStuForm({...stuForm,name:e.target.value})} placeholder="Student full name"/></FormField>
                <FormField label="Gender"><select className={inputClass} value={stuForm.gender} onChange={e=>setStuForm({...stuForm,gender:e.target.value})}><option value="M">Male</option><option value="F">Female</option></select></FormField>
                <FormField label="Class"><select className={inputClass} value={stuForm.class} onChange={e=>setStuForm({...stuForm,class:e.target.value})}>{classes.rows.map(cl=><option key={cl.id} value={cl.name}>{cl.name}</option>)}</select></FormField>
                <FormField label="Date of Birth"><input type="date" className={inputClass} value={stuForm.dob} onChange={e=>setStuForm({...stuForm,dob:e.target.value})}/></FormField>
                <FormField label="Parent/Guardian"><input className={inputClass} value={stuForm.parent} onChange={e=>setStuForm({...stuForm,parent:e.target.value})} placeholder="Parent name"/></FormField>
                <FormField label="Phone Number"><input className={inputClass} value={stuForm.phone} onChange={e=>setStuForm({...stuForm,phone:e.target.value})} placeholder="07XX XXX XXX"/></FormField>
              </div>
              <div className="flex gap-2"><button onClick={addStudent} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl" style={{background:SCH_BLUE}}>Enroll Student</button><button onClick={()=>setShowStu(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Adm No","Student Name","Gender","Class","Parent","Phone","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>
                {filteredStudents.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-[11.5px] font-semibold" style={{color:SCH_BLUE}}>{s.admNo}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{background:s.gender==="F"?"#DB2777":SCH_BLUE}}>{s.name.charAt(0)}</div><span className="font-medium text-[#111827]">{s.name}</span></div></td>
                    <td className="px-4 py-3 text-slate-500">{s.gender==="M"?"Male":"Female"}</td>
                    <td className="px-4 py-3"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{s.class}</span></td>
                    <td className="px-4 py-3 text-slate-500">{s.parent}</td>
                    <td className="px-4 py-3 text-slate-500">{s.phone}</td>
                    <td className="px-4 py-3"><StatusChip s={s.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <p className="text-[11.5px] text-slate-400">Showing {filteredStudents.length} of {students.rows.length} students</p>
              <p className="text-[11.5px] font-medium text-slate-600">{students.rows.filter(s=>s.gender==="F").length} Female · {students.rows.filter(s=>s.gender==="M").length} Male</p>
            </div>
          </div>
        </div>
      )}

      {/* TEACHERS */}
      {tab==="teachers" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["Teaching Staff", teachers.rows.length, SCH_BLUE], ["Active", teachers.rows.filter(t=>t.status==="Active").length, "#059669"], ["Avg Experience", (teachers.rows.reduce((s,t)=>s+t.experience,0)/Math.max(teachers.rows.length,1)).toFixed(1)+" yrs", SCH_GOLD], ["Monthly Payroll", "TZS "+money(teachers.rows.reduce((s,t)=>s+t.salary,0))+"k", "#7C3AED"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[20px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teachers.rows.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-bold text-white shrink-0" style={{background:SCH_BLUE}}>{t.name.split(" ").pop().charAt(0)}</div>
                  <div className="flex-1 min-w-0"><p className="text-[14px] font-semibold text-[#111827] truncate">{t.name}</p><p className="text-[12px] text-slate-400">{t.subject}</p><StatusChip s={t.status}/></div>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                  <div className="text-center"><p className="text-[10px] text-slate-400">Experience</p><p className="text-[13px] font-bold text-[#111827]">{t.experience}y</p></div>
                  <div className="text-center"><p className="text-[10px] text-slate-400">Salary</p><p className="text-[13px] font-bold" style={{color:SCH_GOLD}}>TZS {money(t.salary)}k</p></div>
                  <div className="text-center"><p className="text-[10px] text-slate-400">Qual.</p><p className="text-[10px] text-slate-600 truncate" title={t.qualification}>{t.qualification}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CLASSES */}
      {tab==="classes" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.rows.map(cl => {
              const pct = Math.round(cl.students / cl.capacity * 100);
              return (
                <div key={cl.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div><p className="text-[16px] font-bold text-[#111827]">{cl.name}</p><p className="text-[12px] text-slate-400">{cl.room} · {cl.level}</p></div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{cl.stream}</span>
                  </div>
                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between text-[12px]"><span className="text-slate-500">Class Teacher</span><span className="font-medium text-[#111827] truncate max-w-[140px]">{cl.teacher}</span></div>
                    <div className="flex justify-between text-[12px]"><span className="text-slate-500">Students</span><span className="font-bold text-[#111827]">{cl.students} / {cl.capacity}</span></div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{width:pct+"%", background:pct>90?"#EF4444":pct>75?"#F59E0B":SCH_BLUE}}/>
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-1 text-right">{pct}% capacity</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ATTENDANCE */}
      {tab==="attendance" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-[15px] font-semibold text-[#111827]">Daily Attendance — {new Date().toDateString()}</h3><p className="text-[12px] text-slate-400">Mark attendance for each class</p></div>
              <button onClick={()=>notify("Attendance saved successfully")} className="text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:SCH_BLUE}}>Save Attendance</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {classes.rows.map(cl => {
                const [present, setPresent] = useState(cl.students);
                return (
                  <div key={cl.id} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3"><p className="text-[13.5px] font-semibold text-[#111827]">{cl.name}</p><p className="text-[11.5px] text-slate-400">{cl.students} enrolled</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-green-50 rounded-lg p-2.5 text-center"><p className="text-[10px] text-green-600 mb-0.5">Present</p><input type="number" className="w-full text-center text-[18px] font-bold text-green-700 bg-transparent border-none outline-none" defaultValue={cl.students} min="0" max={cl.students}/></div>
                      <div className="bg-red-50 rounded-lg p-2.5 text-center"><p className="text-[10px] text-red-500 mb-0.5">Absent</p><p className="text-[18px] font-bold text-red-600">0</p></div>
                    </div>
                    <div className="mt-2.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{width:"100%"}}/></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* EXAMS */}
      {tab==="exams" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={()=>notify("Exam form — add via modal")} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:SCH_BLUE}}><Plus size={13}/>Schedule Exam</button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Exam","Class","Subject","Date","Max Marks","Avg Score","Pass Rate","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>
                {exams.rows.map(e => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-[#111827]">{e.name}</td>
                    <td className="px-4 py-3"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{e.class}</span></td>
                    <td className="px-4 py-3 text-slate-500">{e.subject}</td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-slate-400">{e.date}</td>
                    <td className="px-4 py-3 font-mono">{e.maxMarks}</td>
                    <td className="px-4 py-3 font-bold" style={{color:e.avgScore>=70?"#16A34A":e.avgScore>=50?"#D97706":"#EF4444"}}>{e.avgScore>0?e.avgScore+"%":"—"}</td>
                    <td className="px-4 py-3 font-bold" style={{color:e.passRate>=80?"#16A34A":e.passRate>=60?"#D97706":"#EF4444"}}>{e.passRate>0?e.passRate+"%":"—"}</td>
                    <td className="px-4 py-3"><StatusChip s={e.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FEE COLLECTION */}
      {tab==="fees" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[["Term Revenue","TZS "+money(totalFees)+"k",SCH_BLUE],["Collected","TZS "+money(collectedFees)+"k","#16A34A"],["Outstanding","TZS "+money(outstanding)+"k","#EF4444"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[20px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          {!showFee && <div className="flex justify-end gap-2 flex-wrap">
              <button onClick={()=>{
                const co2=window.__smartManagerCompany||{};
                const tableRows=fees.rows.map((f,i)=>`<tr style="background:${i%2===0?"white":"#F8FAFB"}"><td class="bold">${f.student}</td><td>${f.class||"—"}</td><td>${f.term}</td><td class="r">TZS ${money(f.amount)}k</td><td class="r">TZS ${money(f.paid||0)}k</td><td class="r" style="color:${f.balance>0?"#EF4444":"#16A34A"}">TZS ${money(f.balance)}k</td><td><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${f.status==="Paid"?"#DCFCE7":f.status==="Partial"?"#FEF3C7":"#FEE2E2"};color:${f.status==="Paid"?"#16A34A":f.status==="Partial"?"#D97706":"#EF4444"}">${f.status}</span></td></tr>`).join("");
                printReport("Fee Collection Report",`<div class="kpi-grid"><div class="kpi"><div class="kpi-label">Total Billed</div><div class="kpi-value" style="color:#1E3A8A">TZS ${money(totalFees)}k</div></div><div class="kpi"><div class="kpi-label">Collected</div><div class="kpi-value" style="color:#16A34A">TZS ${money(collectedFees)}k</div></div><div class="kpi"><div class="kpi-label">Outstanding</div><div class="kpi-value" style="color:#EF4444">TZS ${money(outstanding)}k</div></div></div><table><thead><tr><th>Student</th><th>Class</th><th>Term</th><th class="r">Billed</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table>`,co2);
              }} className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#0D2214] px-3 py-2 rounded-lg">
                <Printer size={12}/> PDF
              </button>
              <button onClick={()=>downloadCSV("fees",fees.rows.map(f=>({Student:f.student,Class:f.class||"",Term:f.term,Amount_k:f.amount,Paid_k:f.paid||0,Balance_k:f.balance,Status:f.status})),[{key:"Student",label:"Student"},{key:"Class",label:"Class"},{key:"Term",label:"Term"},{key:"Amount_k",label:"Billed"},{key:"Paid_k",label:"Paid"},{key:"Balance_k",label:"Balance"},{key:"Status",label:"Status"}])}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A] border border-[#16A34A]/25 bg-[#F0FDF4] px-3 py-2 rounded-lg">
                <Download size={12}/> CSV
              </button>
              <button onClick={()=>setShowFee(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:SCH_BLUE}}><Plus size={13}/>Record Fee</button></div>}
          {showFee && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <p className="text-[14px] font-semibold text-[#111827]">Record Fee Payment</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Student *"><select className={inputClass} value={feeForm.studentId} onChange={e=>setFeeForm({...feeForm,studentId:e.target.value})}><option value="">Select student...</option>{students.rows.map(s=><option key={s.id} value={s.id}>{s.name} ({s.class})</option>)}</select></FormField>
                <FormField label="Term"><select className={inputClass} value={feeForm.term} onChange={e=>setFeeForm({...feeForm,term:e.target.value})}>{TERMS.map(t=><option key={t}>{t}</option>)}</select></FormField>
                <FormField label="Fee Amount (TZS k)"><input type="number" className={inputClass} value={feeForm.amount} onChange={e=>setFeeForm({...feeForm,amount:e.target.value})}/></FormField>
                <FormField label="Amount Paid (TZS k)"><input type="number" className={inputClass} value={feeForm.paid} onChange={e=>setFeeForm({...feeForm,paid:e.target.value})}/></FormField>
              </div>
              <div className="flex gap-2"><button onClick={recordPayment} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl" style={{background:SCH_BLUE}}>Save Record</button><button onClick={()=>setShowFee(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Student","Class","Term","Fee","Paid","Balance","Due Date","Status","Action"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{fees.rows.map(f => (
                <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-3 font-medium text-[#111827]">{f.student}</td>
                  <td className="px-3 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{f.class}</span></td>
                  <td className="px-3 py-3 text-slate-500 text-[11.5px]">{f.term}</td>
                  <td className="px-3 py-3 font-mono">{money(f.amount)}k</td>
                  <td className="px-3 py-3 font-mono text-green-600 font-semibold">{money(f.paid)}k</td>
                  <td className="px-3 py-3 font-mono font-bold" style={{color:f.balance>0?"#EF4444":"#16A34A"}}>{money(f.balance)}k</td>
                  <td className="px-3 py-3 font-mono text-slate-400">{f.dueDate}</td>
                  <td className="px-3 py-3"><StatusChip s={f.status}/></td>
                  <td className="px-3 py-3">{f.status!=="Paid"&&<button onClick={()=>{fees.setRows(p=>p.map(x=>x.id===f.id?{...x,paid:x.amount,balance:0,status:"Paid"}:x));notify("Full payment recorded for "+f.student)}} className="text-[11px] font-semibold text-white px-2.5 py-1 rounded-lg bg-green-600">Pay Full</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* LIBRARY */}
      {tab==="library" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[["Total Books", books.rows.reduce((s,b)=>s+b.copies,0), SCH_BLUE], ["Available", books.rows.reduce((s,b)=>s+b.available,0), "#16A34A"], ["On Loan", books.rows.reduce((s,b)=>s+(b.copies-b.available),0), SCH_GOLD]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[22px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-[13.5px] font-semibold text-[#111827]">Book Catalog</p><button onClick={()=>notify("Add book modal — coming next")} className="flex items-center gap-1 text-[12px] font-semibold text-white px-3 py-2 rounded-xl" style={{background:SCH_BLUE}}><Plus size={12}/>Add Book</button></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Title","Author","ISBN","Category","Shelf","Copies","Available","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{books.rows.map(b => (
                <tr key={b.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-[#111827]">{b.title}</td>
                  <td className="px-4 py-3 text-slate-500">{b.author}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{b.isbn}</td>
                  <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{b.category}</span></td>
                  <td className="px-4 py-3 font-mono text-slate-500">{b.shelf}</td>
                  <td className="px-4 py-3 font-bold text-[#111827]">{b.copies}</td>
                  <td className="px-4 py-3 font-bold" style={{color:b.available===0?"#EF4444":"#16A34A"}}>{b.available}</td>
                  <td className="px-4 py-3"><StatusChip s={b.available===0?"Unpaid":b.available<3?"Partial":"Active"}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRANSPORT */}
      {tab==="transport" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[["Routes", transport.rows.length, SCH_BLUE], ["Students", transport.rows.reduce((s,r)=>s+r.students,0), "#16A34A"], ["Active Buses", transport.rows.filter(r=>r.status==="Active").length, SCH_GOLD]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[22px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {transport.rows.map(r => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:SCH_BLUE+"18"}}><Bus size={18} style={{color:SCH_BLUE}}/></div><div><p className="text-[13.5px] font-semibold text-[#111827]">{r.route}</p><p className="text-[11.5px] text-slate-400">{r.bus}</p></div></div>
                  <StatusChip s={r.status}/>
                </div>
                <div className="space-y-1.5">
                  {[["Driver", r.driver], ["Students", r.students], ["Departure", r.departure], ["Return", r.return]].map(([l,v])=>(
                    <div key={l} className="flex justify-between"><span className="text-[11.5px] text-slate-400">{l}</span><span className="text-[11.5px] font-medium text-[#111827]">{v}</span></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PHARMACY MANAGEMENT SYSTEM
// Tabs: Overview · Drug Catalog · Stock · Dispensing · Suppliers
//       Expiry Alerts · Prescriptions · Billing
// ═══════════════════════════════════════════════════════════════════════════
export const PHM_DRUGS_SEED = [
  { id:"DRG-001", name:"Amoxicillin 500mg",    genericName:"Amoxicillin",    category:"Antibiotic",    form:"Capsule", strength:"500mg", manufacturer:"Shelys Pharma",   price:0.8,  unitCost:0.4,  controlled:false, requiresRx:true  },
  { id:"DRG-002", name:"Paracetamol 500mg",    genericName:"Paracetamol",    category:"Analgesic",     form:"Tablet",  strength:"500mg", manufacturer:"Beta Healthcare",  price:0.3,  unitCost:0.15, controlled:false, requiresRx:false },
  { id:"DRG-003", name:"Metformin 500mg",      genericName:"Metformin",      category:"Antidiabetic",  form:"Tablet",  strength:"500mg", manufacturer:"Zenufa Labs",     price:0.5,  unitCost:0.2,  controlled:false, requiresRx:true  },
  { id:"DRG-004", name:"Atorvastatin 10mg",    genericName:"Atorvastatin",   category:"Statin",        form:"Tablet",  strength:"10mg",  manufacturer:"Shelys Pharma",   price:1.2,  unitCost:0.6,  controlled:false, requiresRx:true  },
  { id:"DRG-005", name:"Amlodipine 5mg",       genericName:"Amlodipine",     category:"Antihypertensive",form:"Tablet",strength:"5mg",  manufacturer:"CiplaQCIL",       price:0.9,  unitCost:0.45, controlled:false, requiresRx:true  },
  { id:"DRG-006", name:"Insulin Glargine 3ml", genericName:"Insulin Glargine",category:"Insulin",     form:"Injection",strength:"100IU/ml",manufacturer:"Novo Nordisk", price:45.0, unitCost:32.0, controlled:false, requiresRx:true  },
  { id:"DRG-007", name:"Azithromycin 500mg",   genericName:"Azithromycin",   category:"Antibiotic",    form:"Tablet",  strength:"500mg", manufacturer:"Zenufa Labs",     price:2.5,  unitCost:1.2,  controlled:false, requiresRx:true  },
  { id:"DRG-008", name:"Omeprazole 20mg",      genericName:"Omeprazole",     category:"PPI",           form:"Capsule", strength:"20mg",  manufacturer:"Beta Healthcare",  price:0.6,  unitCost:0.25, controlled:false, requiresRx:false },
  { id:"DRG-009", name:"Diazepam 5mg",         genericName:"Diazepam",       category:"Sedative",      form:"Tablet",  strength:"5mg",   manufacturer:"CiplaQCIL",       price:0.4,  unitCost:0.2,  controlled:true,  requiresRx:true  },
  { id:"DRG-010", name:"Salbutamol Inhaler",   genericName:"Salbutamol",     category:"Bronchodilator",form:"Inhaler", strength:"100mcg",manufacturer:"GlaxoSmithKline", price:12.0, unitCost:8.0,  controlled:false, requiresRx:true  },
];

export const PHM_STOCK_SEED = [
  { id:"STK-001", drugId:"DRG-001", drug:"Amoxicillin 500mg",    batchNo:"B2024-001", qty:500,  minQty:50,  expiry:"2026-12-31", received:"2024-06-01", supplier:"Shelys Pharma",   unitCost:0.4  },
  { id:"STK-002", drugId:"DRG-002", drug:"Paracetamol 500mg",    batchNo:"B2024-002", qty:1200, minQty:100, expiry:"2027-03-15", received:"2024-07-01", supplier:"Beta Healthcare", unitCost:0.15 },
  { id:"STK-003", drugId:"DRG-003", drug:"Metformin 500mg",      batchNo:"B2024-003", qty:300,  minQty:50,  expiry:"2026-09-30", received:"2024-05-01", supplier:"Zenufa Labs",     unitCost:0.2  },
  { id:"STK-004", drugId:"DRG-004", drug:"Atorvastatin 10mg",    batchNo:"B2024-004", qty:200,  minQty:30,  expiry:"2026-08-31", received:"2024-04-15", supplier:"Shelys Pharma",   unitCost:0.6  },
  { id:"STK-005", drugId:"DRG-005", drug:"Amlodipine 5mg",       batchNo:"B2024-005", qty:450,  minQty:50,  expiry:"2026-11-30", received:"2024-06-15", supplier:"CiplaQCIL",       unitCost:0.45 },
  { id:"STK-006", drugId:"DRG-006", drug:"Insulin Glargine 3ml", batchNo:"B2024-006", qty:40,   minQty:10,  expiry:"2026-07-31", received:"2024-07-01", supplier:"Novo Nordisk",    unitCost:32.0 },
  { id:"STK-007", drugId:"DRG-007", drug:"Azithromycin 500mg",   batchNo:"B2024-007", qty:180,  minQty:20,  expiry:"2025-10-31", received:"2023-10-01", supplier:"Zenufa Labs",     unitCost:1.2  },
  { id:"STK-008", drugId:"DRG-008", drug:"Omeprazole 20mg",      batchNo:"B2024-008", qty:600,  minQty:60,  expiry:"2027-06-30", received:"2024-06-01", supplier:"Beta Healthcare", unitCost:0.25 },
  { id:"STK-009", drugId:"DRG-009", drug:"Diazepam 5mg",         batchNo:"B2024-009", qty:100,  minQty:20,  expiry:"2026-04-30", received:"2024-01-15", supplier:"CiplaQCIL",       unitCost:0.2  },
  { id:"STK-010", drugId:"DRG-010", drug:"Salbutamol Inhaler",   batchNo:"B2024-010", qty:35,   minQty:10,  expiry:"2027-01-31", received:"2024-07-01", supplier:"GlaxoSmithKline", unitCost:8.0  },
];

export const PHM_DISPENSE_SEED = [
  { id:"DIS-001", patient:"Mohammed Al Qahtani", drug:"Amoxicillin 500mg", qty:21,  dosage:"1 TID × 7 days",  price:16.8, prescriber:"Dr. Ahmed Al Ghamdi", date:"2026-07-16", status:"Dispensed", rxNo:"RX-001" },
  { id:"DIS-002", patient:"Noura Al Dossari",    drug:"Amlodipine 5mg",    qty:30,  dosage:"1 OD × 30 days",  price:27.0, prescriber:"Dr. Layla Al Zahrani", date:"2026-07-17", status:"Dispensed", rxNo:"RX-002" },
  { id:"DIS-003", patient:"Yousef Al Mutairi",   drug:"Metformin 500mg",   qty:60,  dosage:"1 BD × 30 days",  price:30.0, prescriber:"Dr. Layla Al Zahrani", date:"2026-07-18", status:"Pending",   rxNo:"RX-003" },
];

export const PHM_SUPPLIERS_SEED = [
  { id:"SUP-001", name:"Shelys Pharma Ltd",      contact:"Charles Mwenda",  phone:"022-123-4567", email:"orders@shelys.co.tz",      terms:"Net 30", status:"Active", lastOrder:"2024-07-01" },
  { id:"SUP-002", name:"Beta Healthcare",        contact:"Miriam Wanjiku",  phone:"022-234-5678", email:"supply@betahealthcare.co.tz",terms:"Net 21", status:"Active", lastOrder:"2024-07-01" },
  { id:"SUP-003", name:"Zenufa Laboratories",    contact:"Hassan Salim",    phone:"022-345-6789", email:"info@zenufa.co.tz",          terms:"Net 45", status:"Active", lastOrder:"2024-06-15" },
  { id:"SUP-004", name:"CiplaQCIL Tanzania",     contact:"Grace Otieno",    phone:"022-456-7890", email:"tz@ciplaQCIL.com",            terms:"Net 30", status:"Active", lastOrder:"2024-06-01" },
  { id:"SUP-005", name:"Novo Nordisk EA",        contact:"Peter Kamau",     phone:"022-567-8901", email:"orders@novonordisk.co.tz",   terms:"Net 60", status:"Active", lastOrder:"2024-07-01" },
];

export const DRUG_CATEGORIES = ["Antibiotic","Analgesic","Antidiabetic","Antihypertensive","Statin","PPI","Insulin","Sedative","Bronchodilator","Antihistamine","Antifungal","Antimalarial","Vitamin","Supplement","IV Fluid"];
