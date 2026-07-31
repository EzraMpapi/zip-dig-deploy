import { useEffect, useState } from "react";
import {
  AlertCircle, Archive, ArrowDownRight, ArrowUpRight, BarChart3, Download, HandCoins,
  History, Landmark, LayoutDashboard, PiggyBank, Plus, Repeat, Search, TrendingUp, Users, X
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
  ACCOUNT_TYPES,
  BANK_ACCOUNTS_SEED,
  BANK_FIXED_DEPOSITS_SEED,
  BANK_LOANS_SEED,
  BANK_LOAN_TYPES,
  BANK_STANDING_ORDERS_SEED,
  BANK_TRANSACTIONS_SEED,
  BRANCHES,
} from "../modules/Fleet.jsx";
import { downloadCSV } from "../modules/Reports.jsx";

export function BankingMFIModule({ currentUser, company, onLoansLoad }) {
  const [tab, setTab]   = useState("dashboard");
  const [tellerTab, setTellerTab] = useState("deposit");
  const [loanTab,   setLoanTab]   = useState("list");

  const accounts  = useCompanyTable("bank_accounts",    BANK_ACCOUNTS_SEED,    { mapRow: r => r });
  const txns      = useCompanyTable("bank_transactions", BANK_TRANSACTIONS_SEED, { mapRow: r => r });
  const loans     = useCompanyTable("bank_loans",        BANK_LOANS_SEED,        { mapRow: r => r });
  useEffect(() => { if (onLoansLoad) onLoansLoad(loans.rows); }, [loans.rows, onLoansLoad]);
  const fds       = useCompanyTable("bank_fixed_deposits",BANK_FIXED_DEPOSITS_SEED,{ mapRow: r => r });
  const sos       = useCompanyTable("bank_standing_orders",BANK_STANDING_ORDERS_SEED,{ mapRow: r => r });

  // Forms
  const [accForm,    setAccForm]    = useState({ name:"", type:"Savings", branch:BRANCHES[0], phone:"", email:"", idNo:"", openingBalance:"" });
  const [tellerForm, setTellerForm] = useState({ accountNo:"", amount:"", narration:"", toAccountNo:"" });
  const [loanForm,   setLoanForm]   = useState({ clientAccountNo:"", type:"Personal", principal:"", rate:18, months:12, collateral:"None", purpose:"" });
  const [showAccForm,  setShowAccForm]  = useState(false);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [searchAcc,    setSearchAcc]    = useState("");
  const [selectedAcc,  setSelectedAcc]  = useState(null);

  const BANK_BLUE  = "#1E3A5F";
  const BANK_GOLD  = "#B8860B";

  const TABS = [
    { id:"dashboard",  label:"Dashboard",      icon: LayoutDashboard },
    { id:"accounts",   label:"Accounts",       icon: Users },
    { id:"teller",     label:"Teller",         icon: HandCoins },
    { id:"loans",      label:"Loans & Credit", icon: Landmark },
    { id:"deposits",   label:"Fixed Deposits", icon: PiggyBank },
    { id:"standing",   label:"Standing Orders",icon: Repeat },
    { id:"reports",    label:"Reports",        icon: BarChart3 },
  ];

  // KPIs
  const totalDeposits = accounts.rows.reduce((s,a)=>s+a.balance,0);
  const loanPortfolio = loans.rows.filter(l=>l.status==="Active"||l.status==="Overdue").reduce((s,l)=>s+l.balance,0);
  const npls          = loans.rows.filter(l=>l.status==="Overdue"||l.status==="Defaulted");
  const nplAmount     = npls.reduce((s,l)=>s+l.balance,0);
  const nplRatio      = loanPortfolio>0 ? (nplAmount/loanPortfolio*100).toFixed(2) : 0;
  const interestIncome = loans.rows.reduce((s,l)=>s+(l.principal*(l.rate/100)/12),0);
  const fdTotal       = fds.rows.filter(f=>f.status==="Active").reduce((s,f)=>s+f.amount,0);
  const todayTxns     = txns.rows.filter(t=>t.date?.startsWith(TODAY.toISOString().slice(0,10)));

  const nextAccNo = () => String(1000000000 + accounts.rows.length + 1);

  const accTypeColor = {
    "Savings":"#059669","Current":"#1E3A5F","Business":"#7C3AED",
    "Fixed Deposit":"#D97706","Corporate":"#0369A1","Dormant":"#9CA3AF",
  };
  const txnTypeColor  = { "Deposit":"#16A34A","Withdrawal":"#EF4444","Transfer Out":"#EF4444","Transfer In":"#16A34A","Interest":"#2563EB","Charge":"#F59E0B" };
  const loanStatusColor = { Active:["#DBEAFE","#1E40AF"],Overdue:["#FEF3C7","#D97706"],Defaulted:["#FEE2E2","#EF4444"],Closed:["#F3F4F6","#6B7280"] };

  const Chip = ({s, map}) => { const [bg,col]=(map?.[s]||["#F3F4F6","#6B7280"]); return <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:bg,color:col}}>{s}</span>; };
  const StatusBadge = ({s}) => {
    const c={Active:["#DCFCE7","#16A34A"],Dormant:["#F3F4F6","#6B7280"],Closed:["#FEE2E2","#EF4444"],Frozen:["#FEF3C7","#D97706"],Matured:["#DBEAFE","#1E40AF"]}[s]||["#F3F4F6","#6B7280"];
    return <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:c[0],color:c[1]}}>{s}</span>;
  };

  // Teller operations
  async function doTellerOp(opType) {
    const { accountNo, amount, narration, toAccountNo } = tellerForm;
    if (!accountNo || !amount) { notify("Enter account number and amount","error"); return; }
    const acc = accounts.rows.find(a => a.accountNo === accountNo);
    if (!acc) { notify("Account not found","error"); return; }
    const amt = Number(amount);
    if ((opType==="Withdrawal"||opType==="Transfer Out") && acc.balance < amt) { notify("Insufficient balance","error"); return; }

    const newBal = opType==="Deposit"||opType==="Transfer In" ? acc.balance + amt : acc.balance - amt;
    accounts.setRows(p => p.map(a => a.accountNo===accountNo ? {...a, balance: newBal} : a));

    if (opType==="Transfer Out" && toAccountNo) {
      const toAcc = accounts.rows.find(a => a.accountNo === toAccountNo);
      if (toAcc) {
        accounts.setRows(p => p.map(a => a.accountNo===toAccountNo ? {...a, balance: a.balance + amt} : a));
        const inTxn = { id:docId("TXN"), accountNo:toAccountNo, account:toAcc.name, type:"Transfer In", amount:amt, balance:toAcc.balance+amt, date:new Date().toISOString().slice(0,16).replace("T"," "), channel:"Teller", reference:"TRF-"+Date.now(), narration:"Transfer from "+acc.name, teller:currentUser?.name||"Teller", status:"Completed" };
        txns.setRows(p=>[inTxn,...p]);
      }
    }

    const txn = { id:docId("TXN"), accountNo, account:acc.name, type:opType==="Transfer"?"Transfer Out":opType, amount:amt, balance:newBal, date:new Date().toISOString().slice(0,16).replace("T"," "), channel:"Teller", reference:(opType==="Deposit"?"DEP":"WDR")+"-"+Date.now(), narration:narration||opType, teller:currentUser?.name||"Teller", status:"Completed" };
    txns.setRows(p => [txn, ...p]);
    logAudit(`Teller: ${opType} TZS ${money(amt)}k`, "Banking", currentUser?.name||"System", acc.name);
    notify(`${opType} TZS ${money(amt)}k — ${acc.name} | Balance: TZS ${money(newBal)}k`);
    setTellerForm({ accountNo:"", amount:"", narration:"", toAccountNo:"" });
    if (IS_CONFIGURED) { try { await sb("bank_transactions").insert(txn).run(); } catch(_e){} }
  }

  async function openAccount() {
    if (!accForm.name.trim()) return;
    const row = { ...accForm, id:docId("ACC"), accountNo:nextAccNo(), balance:Number(accForm.openingBalance)||0, openDate:TODAY.toISOString().slice(0,10), status:"Active", currency:"TZS" };
    accounts.setRows(p=>[row,...p]);
    setAccForm({ name:"", type:"Savings", branch:BRANCHES[0], phone:"", email:"", idNo:"", openingBalance:"" });
    setShowAccForm(false);
    notify("Account "+row.accountNo+" opened for "+row.name);
    if (IS_CONFIGURED) { try { await sb("bank_accounts").insert(row).run(); } catch(_e){} }
  }

  async function disburseLoan() {
    if (!loanForm.clientAccountNo||!loanForm.principal) return;
    const acc = accounts.rows.find(a=>a.accountNo===loanForm.clientAccountNo);
    if (!acc) { notify("Client account not found","error"); return; }
    const P = Number(loanForm.principal), r = loanForm.rate/100/12, n = Number(loanForm.months);
    const installment = r>0 ? P*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1) : P/n;
    const row = { id:docId("LN"), loanNo:"LN"+Date.now().toString().slice(-8), clientId:acc.id, client:acc.name, type:loanForm.type, principal:P, rate:Number(loanForm.rate), months:n, disbursed:TODAY.toISOString().slice(0,10), installment:Math.round(installment*100)/100, balance:P, arrears:0, nextDue:new Date(Date.now()+30*24*60*60*1000).toISOString().slice(0,10), status:"Active", collateral:loanForm.collateral, purpose:loanForm.purpose };
    loans.setRows(p=>[row,...p]);
    // Credit loan amount to client account
    accounts.setRows(p=>p.map(a=>a.accountNo===loanForm.clientAccountNo?{...a,balance:a.balance+P}:a));
    const txn = { id:docId("TXN"), accountNo:loanForm.clientAccountNo, account:acc.name, type:"Loan Disbursement", amount:P, balance:acc.balance+P, date:TODAY.toISOString().slice(0,10)+" 00:00", channel:"System", reference:row.loanNo, narration:"Loan disbursement — "+loanForm.type, teller:"Credit", status:"Completed" };
    txns.setRows(p=>[txn,...p]);
    setLoanForm({ clientAccountNo:"", type:"Personal", principal:"", rate:18, months:12, collateral:"None", purpose:"" });
    setShowLoanForm(false);
    notify("Loan "+row.loanNo+" of TZS "+money(P)+"k disbursed to "+acc.name);
    logAudit("Loan disbursed: "+row.loanNo, "Banking", currentUser?.name||"System", acc.name+" TZS "+money(P)+"k");
  }

  const filteredAccounts = accounts.rows.filter(a => !searchAcc || a.name.toLowerCase().includes(searchAcc.toLowerCase()) || a.accountNo.includes(searchAcc) || a.type.toLowerCase().includes(searchAcc.toLowerCase()));

  // Account mini-statement modal
  const AccStatement = ({acc}) => {
    const accTxns = txns.rows.filter(t => t.accountNo === acc.accountNo);
    return (
      <div className="fixed inset-0 z-50 flex justify-end" onClick={()=>setSelectedAcc(null)}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm"/>
        <div className="relative w-full sm:w-[520px] bg-white h-full shadow-2xl overflow-y-auto" onClick={e=>e.stopPropagation()}>
          <div className="px-6 py-5 border-b border-slate-100" style={{background:BANK_BLUE}}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-white/50 mb-1">Account Statement</p>
                <p className="text-[20px] font-bold text-white">{acc.name}</p>
                <p className="text-[13px] font-mono text-white/70">{acc.accountNo}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/15 text-white">{acc.type}</span>
                  <StatusBadge s={acc.status}/>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-white/50">Current Balance</p>
                <p className="text-[28px] font-black text-white">TZS {money(acc.balance)}k</p>
                <p className="text-[11px] text-white/50 mt-1">{acc.branch} · {acc.interest}% p.a.</p>
              </div>
            </div>
            <button onClick={()=>setSelectedAcc(null)} className="absolute top-4 right-4 text-white/60 hover:text-white"><X size={18}/></button>
          </div>
          <div className="p-4">
            <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Transaction History ({accTxns.length})</p>
            {accTxns.length === 0 ? <p className="text-slate-400 text-center py-8">No transactions yet</p> :
              <div className="space-y-2">
                {accTxns.map(t => {
                  const isCredit = t.type==="Deposit"||t.type==="Transfer In"||t.type==="Interest"||t.type==="Loan Disbursement";
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0`} style={{background:isCredit?"#DCFCE7":"#FEE2E2"}}>
                        {isCredit ? <ArrowDownRight size={16} className="text-green-600"/> : <ArrowUpRight size={16} className="text-red-500"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-[#111827] truncate">{t.narration}</p>
                        <p className="text-[10.5px] text-slate-400">{t.date} · {t.channel} · {t.reference}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[14px] font-bold" style={{color:isCredit?"#16A34A":"#EF4444"}}>{isCredit?"+":"-"}TZS {money(t.amount)}k</p>
                        <p className="text-[10.5px] text-slate-400">Bal: {money(t.balance)}k</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">

      {/* ── HEADER ── */}
      <div className="rounded-2xl px-6 py-5 relative overflow-hidden" style={{background:`linear-gradient(135deg,${BANK_BLUE} 0%,#2D5F8A 50%,#1B4F72 100%)`}}>
        <div className="absolute inset-0" style={{backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,.025) 40px,rgba(255,255,255,.025) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,.025) 40px,rgba(255,255,255,.025) 41px)"}}/>
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Landmark size={22} className="text-white"/>
              <h1 className="text-[20px] font-bold text-white">{company?.name||"Banking"} & Financial Institution</h1>
            </div>
            <p className="text-[12px]" style={{color:"rgba(255,255,255,.55)"}}>Accounts · Teller · Loans · Fixed Deposits · Standing Orders · NPL Management</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="rounded-xl px-4 py-2.5 text-center" style={{background:"rgba(255,255,255,.1)"}}>
              <p className="text-[20px] font-black text-white">{accounts.rows.filter(a=>a.status==="Active").length}</p>
              <p className="text-[10px] text-white/55">Active Accounts</p>
            </div>
            <div className="rounded-xl px-4 py-2.5 text-center" style={{background:"rgba(255,255,255,.1)"}}>
              <p className="text-[20px] font-black text-white">TZS {money(totalDeposits)}k</p>
              <p className="text-[10px] text-white/55">Total Deposits</p>
            </div>
            <div className="rounded-xl px-4 py-2.5 text-center" style={{background:nplRatio>5?"rgba(239,68,68,.2)":"rgba(255,255,255,.1)"}}>
              <p className="text-[20px] font-black" style={{color:nplRatio>5?"#FCA5A5":"#fff"}}>{nplRatio}%</p>
              <p className="text-[10px] text-white/55">NPL Ratio</p>
            </div>
            <button onClick={()=>setShowAccForm(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-white" style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)"}}>
              <Plus size={13}/>Open Account
            </button>
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex gap-0.5 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {TABS.map(t=>{const I=t.icon;return(
          <button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1 px-3 py-2 rounded-lg text-[11.5px] font-medium transition-all whitespace-nowrap "+(tab===t.id?"text-white shadow-sm":"text-slate-500 hover:bg-slate-50")} style={{background:tab===t.id?BANK_BLUE:"transparent"}}>
            <I size={12}/>{t.label}
            {t.id==="loans" && npls.length>0 && <span className="ml-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{npls.length}</span>}
          </button>
        );})}
      </div>

      {/* ── DASHBOARD ── */}
      {tab==="dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {l:"Total Deposits",   v:"TZS "+money(totalDeposits)+"k",   sub:accounts.rows.filter(a=>a.status==="Active").length+" active accounts", c:BANK_BLUE,  I:PiggyBank },
              {l:"Loan Portfolio",   v:"TZS "+money(loanPortfolio)+"k",   sub:loans.rows.filter(l=>l.status==="Active").length+" active loans",       c:"#059669",  I:Landmark },
              {l:"Fixed Deposits",   v:"TZS "+money(fdTotal)+"k",         sub:fds.rows.filter(f=>f.status==="Active").length+" accounts",             c:BANK_GOLD,  I:Archive },
              {l:"Est. Monthly Income",v:"TZS "+money(interestIncome)+"k",sub:"From loan interest",                                                   c:"#7C3AED",  I:TrendingUp},
            ].map(k=>(
              <div key={k.l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.l}</p><p className="text-[20px] font-bold mt-1 text-[#111827]">{k.v}</p><p className="text-[11.5px] mt-0.5" style={{color:k.c}}>{k.sub}</p></div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background:k.c+"18"}}><k.I size={18} style={{color:k.c}}/></div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Deposits by Account Type</p>
              {ACCOUNT_TYPES.slice(0,5).map(type=>{
                const typeTotal=accounts.rows.filter(a=>a.type===type).reduce((s,a)=>s+a.balance,0);
                const pct=totalDeposits>0?typeTotal/totalDeposits*100:0;
                if(!typeTotal)return null;
                const col=accTypeColor[type]||"#6B7280";
                return(
                  <div key={type} className="flex items-center gap-2 mb-2.5">
                    <span className="text-[11.5px] text-slate-600 w-24 shrink-0">{type}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:pct+"%",background:col}}/></div>
                    <span className="text-[11.5px] font-mono font-bold text-slate-700 w-20 text-right">TZS {money(typeTotal)}k</span>
                  </div>
                );
              }).filter(Boolean)}
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Loan Portfolio Quality</p>
              {[["Performing","Active","#16A34A"],["Overdue","Overdue","#F59E0B"],["Defaulted","Defaulted","#EF4444"],["Closed","Closed","#6B7280"]].map(([l,s,col])=>{
                const n=loans.rows.filter(x=>x.status===s).length;
                const amt=loans.rows.filter(x=>x.status===s).reduce((sum,x)=>sum+x.balance,0);
                return(
                  <div key={l} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{background:col}}/><span className="text-[12.5px] text-slate-600">{l}</span></div>
                    <div className="text-right"><span className="text-[13px] font-bold" style={{color:col}}>{n}</span><span className="text-[10.5px] text-slate-400 ml-1.5">TZS {money(amt)}k</span></div>
                  </div>
                );
              })}
              <div className="mt-3 pt-2 border-t border-slate-100">
                <p className="text-[11.5px] text-slate-500">NPL Ratio: <strong className="text-[#EF4444]">{nplRatio}%</strong> <span className="text-slate-400">(Target: &lt;5%)</span></p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Today&apos;s Activity</p>
              <div className="space-y-2">
                {todayTxns.length === 0 ? <p className="text-slate-400 text-[12.5px] text-center py-4">No transactions today yet</p>
                  : todayTxns.slice(0,5).map(t=>{
                    const isCredit=t.type==="Deposit"||t.type==="Transfer In"||t.type==="Interest";
                    return(
                      <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{background:isCredit?"#DCFCE7":"#FEE2E2"}}>
                          {isCredit?<ArrowDownRight size={13} className="text-green-600"/>:<ArrowUpRight size={13} className="text-red-500"/>}
                        </div>
                        <div className="flex-1 min-w-0"><p className="text-[12px] font-medium text-[#111827] truncate">{t.account}</p><p className="text-[10.5px] text-slate-400">{t.type}</p></div>
                        <p className="text-[12.5px] font-bold shrink-0" style={{color:isCredit?"#16A34A":"#EF4444"}}>{isCredit?"+":"-"}TZS {money(t.amount)}k</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ACCOUNTS ── */}
      {tab==="accounts" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={inputClass+" pl-9"} placeholder="Search by name, account number or type..." value={searchAcc} onChange={e=>setSearchAcc(e.target.value)}/></div>
            <button onClick={()=>downloadCSV("accounts",accounts.rows,[{key:"accountNo",label:"Account No"},{key:"name",label:"Name"},{key:"type",label:"Type"},{key:"balance",label:"Balance"},{key:"status",label:"Status"},{key:"branch",label:"Branch"}])} className="flex items-center gap-1 text-[12px] font-medium text-slate-500 border border-slate-200 px-3 py-2.5 rounded-xl hover:border-[#16A34A] hover:text-[#16A34A] transition-colors"><Download size={13}/>Export</button>
            <button onClick={()=>setShowAccForm(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:BANK_BLUE}}><Plus size={13}/>Open Account</button>
          </div>

          {showAccForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <p className="text-[14px] font-semibold text-[#111827]">Open New Account</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Customer Name *"><input className={inputClass} value={accForm.name} onChange={e=>setAccForm({...accForm,name:e.target.value})} placeholder="Full name"/></FormField>
                <FormField label="Account Type"><select className={inputClass} value={accForm.type} onChange={e=>setAccForm({...accForm,type:e.target.value})}>{ACCOUNT_TYPES.map(t=><option key={t}>{t}</option>)}</select></FormField>
                <FormField label="Branch"><select className={inputClass} value={accForm.branch} onChange={e=>setAccForm({...accForm,branch:e.target.value})}>{BRANCHES.map(b=><option key={b}>{b}</option>)}</select></FormField>
                <FormField label="Opening Balance"><input type="number" className={inputClass} value={accForm.openingBalance} onChange={e=>setAccForm({...accForm,openingBalance:e.target.value})} placeholder="TZS thousands"/></FormField>
                <FormField label="Phone"><input className={inputClass} value={accForm.phone} onChange={e=>setAccForm({...accForm,phone:e.target.value})} placeholder="0712 XXX XXX"/></FormField>
                <FormField label="Email"><input className={inputClass} value={accForm.email} onChange={e=>setAccForm({...accForm,email:e.target.value})}/></FormField>
                <FormField label="ID / Passport No"><input className={inputClass} value={accForm.idNo} onChange={e=>setAccForm({...accForm,idNo:e.target.value})}/></FormField>
              </div>
              <div className="flex gap-2"><button onClick={openAccount} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl" style={{background:BANK_BLUE}}>Open Account</button><button onClick={()=>setShowAccForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Account No","Customer","Type","Branch","Balance","Interest","Status","Actions"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>
                {filteredAccounts.map(a=>(
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={()=>setSelectedAcc(a)}>
                    <td className="px-4 py-3 font-mono text-[11.5px] font-semibold" style={{color:BANK_BLUE}}>{a.accountNo}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{background:accTypeColor[a.type]||"#6B7280"}}>{a.name.charAt(0)}</div><span className="font-medium text-[#111827]">{a.name}</span></div>
                    </td>
                    <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:(accTypeColor[a.type]||"#6B7280")+"18",color:accTypeColor[a.type]||"#6B7280"}}>{a.type}</span></td>
                    <td className="px-4 py-3 text-slate-500">{a.branch}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#111827]">TZS {money(a.balance)}k</td>
                    <td className="px-4 py-3 font-semibold" style={{color:BANK_GOLD}}>{a.interest}%</td>
                    <td className="px-4 py-3"><StatusBadge s={a.status}/></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={e=>{e.stopPropagation();setTellerForm(f=>({...f,accountNo:a.accountNo}));setTab("teller");setTellerTab("deposit");}} className="text-[10.5px] font-semibold text-white px-2 py-1 rounded-lg" style={{background:"#16A34A"}}>Deposit</button>
                        <button onClick={e=>{e.stopPropagation();setTellerForm(f=>({...f,accountNo:a.accountNo}));setTab("teller");setTellerTab("withdraw");}} className="text-[10.5px] font-semibold text-white px-2 py-1 rounded-lg bg-red-500">Withdraw</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-[11.5px] text-slate-400">{filteredAccounts.length} of {accounts.rows.length} accounts · Total: TZS {money(totalDeposits)}k</div>
          </div>
        </div>
      )}

      {/* ── TELLER ── */}
      {tab==="teller" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100">
              {[["deposit","Deposit","#16A34A"],["withdraw","Withdrawal","#EF4444"],["transfer","Transfer","#2563EB"],["balance","Balance Enquiry","#7C3AED"]].map(([id,label,col])=>(
                <button key={id} onClick={()=>setTellerTab(id)} className="flex-1 py-3.5 text-[12.5px] font-semibold transition-all" style={{background:tellerTab===id?col:"transparent",color:tellerTab===id?"#fff":col,borderBottom:tellerTab===id?"none":"1px solid transparent"}}>{label}</button>
              ))}
            </div>
            <div className="p-6">
              <div className="max-w-lg mx-auto space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Account Number">
                    <input className={inputClass} value={tellerForm.accountNo} onChange={e=>setTellerForm({...tellerForm,accountNo:e.target.value})} placeholder="Enter account number"/>
                  </FormField>
                  {tellerTab!=="balance" && (
                    <FormField label="Amount (TZS thousands)">
                      <input type="number" className={inputClass} value={tellerForm.amount} onChange={e=>setTellerForm({...tellerForm,amount:e.target.value})} placeholder="0.00"/>
                    </FormField>
                  )}
                  {tellerTab==="transfer" && (
                    <FormField label="To Account Number">
                      <input className={inputClass} value={tellerForm.toAccountNo} onChange={e=>setTellerForm({...tellerForm,toAccountNo:e.target.value})} placeholder="Beneficiary account"/>
                    </FormField>
                  )}
                  {tellerTab!=="balance" && (
                    <FormField label="Narration" cls="col-span-2">
                      <input className={inputClass} value={tellerForm.narration} onChange={e=>setTellerForm({...tellerForm,narration:e.target.value})} placeholder="Transaction description..."/>
                    </FormField>
                  )}
                </div>

                {/* Account lookup */}
                {tellerForm.accountNo && (() => {
                  const acc = accounts.rows.find(a=>a.accountNo===tellerForm.accountNo);
                  if (!acc) return <div className="p-3 rounded-xl bg-red-50 border border-red-100"><p className="text-[12.5px] text-red-600 font-medium">⚠ Account not found</p></div>;
                  return (
                    <div className="p-4 rounded-xl border-2 border-blue-100 bg-blue-50">
                      <div className="flex items-center justify-between">
                        <div><p className="text-[13.5px] font-bold text-[#111827]">{acc.name}</p><p className="text-[11.5px] text-slate-500">{acc.type} · {acc.branch}</p></div>
                        <div className="text-right"><p className="text-[11px] text-slate-400">Available Balance</p><p className="text-[20px] font-black" style={{color:BANK_BLUE}}>TZS {money(acc.balance)}k</p></div>
                      </div>
                      <StatusBadge s={acc.status}/>
                    </div>
                  );
                })()}

                {tellerTab !== "balance" && (
                  <button onClick={()=>{
                    const op = tellerTab==="deposit"?"Deposit":tellerTab==="withdraw"?"Withdrawal":"Transfer Out";
                    doTellerOp(op);
                  }} className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white transition-all" style={{background:tellerTab==="deposit"?"#16A34A":tellerTab==="withdraw"?"#EF4444":"#2563EB"}}>
                    {tellerTab==="deposit"?"✓ Confirm Deposit":tellerTab==="withdraw"?"✓ Confirm Withdrawal":"✓ Confirm Transfer"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><p className="text-[13.5px] font-semibold text-[#111827]">Today&apos;s Teller Journal ({txns.rows.length} transactions)</p></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Reference","Account","Customer","Type","Amount","Balance","Channel","Time","Status"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>
                {txns.rows.slice(0,15).map(t=>{
                  const isCredit=t.type==="Deposit"||t.type==="Transfer In"||t.type==="Interest"||t.type==="Loan Disbursement";
                  return(
                    <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{t.reference}</td>
                      <td className="px-3 py-2.5 font-mono text-[11.5px] font-semibold" style={{color:BANK_BLUE}}>{t.accountNo}</td>
                      <td className="px-3 py-2.5 font-medium text-[#111827]">{t.account}</td>
                      <td className="px-3 py-2.5"><span className="text-[10.5px] font-semibold" style={{color:isCredit?"#16A34A":"#EF4444"}}>{t.type}</span></td>
                      <td className="px-3 py-2.5 font-mono font-bold" style={{color:isCredit?"#16A34A":"#EF4444"}}>{isCredit?"+":"-"}TZS {money(t.amount)}k</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500">TZS {money(t.balance)}k</td>
                      <td className="px-3 py-2.5 text-slate-400">{t.channel}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">{t.date?.slice(11)}</td>
                      <td className="px-3 py-2.5"><span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">{t.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LOANS ── */}
      {tab==="loans" && (
        <div className="space-y-3">
          {npls.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5"/>
              <div><p className="text-[13px] font-semibold text-red-700">{npls.length} Non-Performing Loan{npls.length>1?"s":""} — Total: TZS {money(nplAmount)}k | NPL Ratio: {nplRatio}%</p><p className="text-[11.5px] text-red-500 mt-0.5">{npls.map(l=>l.client).join(", ")}</p></div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[["Active Loans",loans.rows.filter(l=>l.status==="Active").length,"#2563EB"],["Portfolio","TZS "+money(loanPortfolio)+"k","#059669"],["NPLs",npls.length,"#EF4444"],["Collected Est.","TZS "+money(loans.rows.filter(l=>l.status==="Active").reduce((s,l)=>s+l.installment,0))+"k","#7C3AED"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[20px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          {!showLoanForm && <div className="flex justify-end"><button onClick={()=>setShowLoanForm(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:BANK_BLUE}}><Plus size={13}/>New Loan</button></div>}
          {showLoanForm && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <p className="text-[14px] font-semibold text-[#111827]">Disburse New Loan</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Client Account No *"><input className={inputClass} value={loanForm.clientAccountNo} onChange={e=>setLoanForm({...loanForm,clientAccountNo:e.target.value})} placeholder="Account number"/></FormField>
                {loanForm.clientAccountNo && (() => { const a=accounts.rows.find(x=>x.accountNo===loanForm.clientAccountNo); return a?<div className="col-span-2 py-2 px-3 rounded-lg bg-blue-50 text-[12.5px] font-semibold text-blue-800">{a.name} · {a.type}</div>:null; })()}
                <FormField label="Loan Type"><select className={inputClass} value={loanForm.type} onChange={e=>setLoanForm({...loanForm,type:e.target.value})}>{BANK_LOAN_TYPES.map(t=><option key={t}>{t}</option>)}</select></FormField>
                <FormField label="Principal (TZS k)"><input type="number" className={inputClass} value={loanForm.principal} onChange={e=>setLoanForm({...loanForm,principal:e.target.value})}/></FormField>
                <FormField label="Interest Rate (% p.a.)"><input type="number" className={inputClass} value={loanForm.rate} onChange={e=>setLoanForm({...loanForm,rate:Number(e.target.value)})}/></FormField>
                <FormField label="Term (months)"><input type="number" className={inputClass} value={loanForm.months} onChange={e=>setLoanForm({...loanForm,months:Number(e.target.value)})}/></FormField>
                <FormField label="Collateral"><input className={inputClass} value={loanForm.collateral} onChange={e=>setLoanForm({...loanForm,collateral:e.target.value})} placeholder="Property, Guarantor, None"/></FormField>
                <FormField label="Purpose"><input className={inputClass} value={loanForm.purpose} onChange={e=>setLoanForm({...loanForm,purpose:e.target.value})}/></FormField>
              </div>
              {loanForm.principal && (() => {
                const P=Number(loanForm.principal), r=loanForm.rate/100/12, n=loanForm.months;
                const inst=r>0?P*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1):P/n;
                const total=inst*n;
                return(
                  <div className="grid grid-cols-3 gap-3">
                    {[["Monthly Installment","TZS "+money(inst)+"k",BANK_BLUE],["Total Repayable","TZS "+money(total)+"k","#111827"],["Interest Income","TZS "+money(total-P)+"k","#16A34A"]].map(([l,v,col])=>(
                      <div key={l} className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-[10.5px] text-slate-400">{l}</p><p className="text-[15px] font-bold mt-0.5" style={{color:col}}>{v}</p></div>
                    ))}
                  </div>
                );
              })()}
              <div className="flex gap-2"><button onClick={disburseLoan} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl" style={{background:BANK_BLUE}}>Disburse Loan</button><button onClick={()=>setShowLoanForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Loan No","Client","Type","Principal","Rate","Installment","Balance","Arrears","Next Due","Status"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{loans.rows.map(l=>{
                const [bg,col]=loanStatusColor[l.status]||["#F3F4F6","#6B7280"];
                return(
                  <tr key={l.id} className={"border-b border-slate-50 last:border-0 hover:bg-slate-50/50 "+(l.status==="Overdue"||l.status==="Defaulted"?"bg-red-50/20":"")}>
                    <td className="px-3 py-3 font-mono text-[11px] font-semibold" style={{color:BANK_BLUE}}>{l.loanNo}</td>
                    <td className="px-3 py-3 font-medium text-[#111827]">{l.client}</td>
                    <td className="px-3 py-3"><span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{l.type}</span></td>
                    <td className="px-3 py-3 font-mono">TZS {money(l.principal)}k</td>
                    <td className="px-3 py-3 font-semibold text-slate-600">{l.rate}%</td>
                    <td className="px-3 py-3 font-mono font-semibold" style={{color:BANK_BLUE}}>TZS {money(l.installment)}k</td>
                    <td className="px-3 py-3 font-mono font-bold" style={{color:l.balance>0?"#111827":"#16A34A"}}>TZS {money(l.balance)}k</td>
                    <td className="px-3 py-3 font-mono font-bold" style={{color:l.arrears>0?"#EF4444":"#16A34A"}}>{l.arrears>0?"TZS "+money(l.arrears)+"k":"None"}</td>
                    <td className="px-3 py-3 font-mono text-[11.5px] text-slate-400">{l.nextDue}</td>
                    <td className="px-3 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:bg,color:col}}>{l.status}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FIXED DEPOSITS ── */}
      {tab==="deposits" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[["Total FD Value","TZS "+money(fdTotal)+"k",BANK_GOLD],["Active FDs",fds.rows.filter(f=>f.status==="Active").length,"#2563EB"],["Total Interest Earned","TZS "+money(fds.rows.reduce((s,f)=>s+f.interestEarned,0))+"k","#16A34A"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[20px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-[13.5px] font-semibold text-[#111827]">Fixed Deposit Accounts</p><button onClick={()=>notify("Create FD — form coming")} className="flex items-center gap-1 text-[12px] font-semibold text-white px-3 py-2 rounded-xl" style={{background:BANK_BLUE}}><Plus size={12}/>New FD</button></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Account No","Client","Amount","Rate","Months","Maturity Date","Interest Earned","Auto-Renew","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{fds.rows.map(f=>(
                <tr key={f.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-[11.5px] font-semibold" style={{color:BANK_BLUE}}>{f.accountNo}</td>
                  <td className="px-4 py-3 font-medium text-[#111827]">{f.client}</td>
                  <td className="px-4 py-3 font-mono font-bold">TZS {money(f.amount)}k</td>
                  <td className="px-4 py-3 font-semibold" style={{color:BANK_GOLD}}>{f.rate}%</td>
                  <td className="px-4 py-3">{f.months}m</td>
                  <td className="px-4 py-3 font-mono text-[11.5px]">{f.maturity}</td>
                  <td className="px-4 py-3 font-mono font-bold text-green-600">TZS {money(f.interestEarned)}k</td>
                  <td className="px-4 py-3"><span className={"text-[10.5px] font-semibold px-2 py-0.5 rounded-full "+(f.autoRenew?"bg-blue-50 text-blue-600":"bg-slate-100 text-slate-500")}>{f.autoRenew?"Yes":"No"}</span></td>
                  <td className="px-4 py-3"><StatusBadge s={f.status}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STANDING ORDERS ── */}
      {tab==="standing" && (
        <div className="space-y-3">
          <div className="flex justify-end"><button onClick={()=>notify("Set up standing order — form")} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:BANK_BLUE}}><Plus size={13}/>New Standing Order</button></div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Account No","Debtor","Beneficiary","Amount","Frequency","Next Run","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{sos.rows.map(so=>(
                <tr key={so.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-[11.5px] font-semibold" style={{color:BANK_BLUE}}>{so.accountNo}</td>
                  <td className="px-4 py-3 font-medium text-[#111827]">{so.debtor}</td>
                  <td className="px-4 py-3 text-slate-500">{so.beneficiary}</td>
                  <td className="px-4 py-3 font-mono font-bold">TZS {money(so.amount)}k</td>
                  <td className="px-4 py-3 text-slate-500">{so.frequency}</td>
                  <td className="px-4 py-3 font-mono text-[11.5px]">{so.nextRun}</td>
                  <td className="px-4 py-3"><StatusBadge s={so.status}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── REPORTS ── */}
      {tab==="reports" && (
        <div className="space-y-4">

          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Total Deposits",`TZS ${money(Math.round(totalDeposits/1000))}k`,"#2563EB"],
              ["Loan Portfolio",`TZS ${money(Math.round(loanPortfolio/1000))}k`,"#16A34A"],
              ["Interest Income (Mo.)",`TZS ${money(Math.round(interestIncome))}k`,"#D97706"],
              ["Active Accounts",String(accounts.rows.filter(a=>a.status==="Active").length),"#7C3AED"],
            ].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
              </div>
            ))}
          </div>

          {/* Loan Status PieChart + Account Type BarChart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Loan Portfolio by Status</h3>
              {(() => {
                const statusData = ["Active","Overdue","Closed","Written Off"].map((s,i)=>({
                  name:s, value:loans.rows.filter(l=>l.status===s).length,
                  fill:["#16A34A","#EF4444","#94A3B8","#374151"][i],
                })).filter(d=>d.value>0);
                return statusData.length === 0 ? <p className="text-slate-400 text-center py-6">No loans</p> : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={150}>
                      <PieChart><Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                        {statusData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" loans",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {statusData.map(d=>(
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

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Deposit by Account Type (TZS k)</h3>
              {(() => {
                const typeData = ACCOUNT_TYPES.slice(0,6).map((type,i)=>({
                  name:type.replace(" ",""), 
                  value:Math.round(accounts.rows.filter(a=>a.type===type).reduce((s,a)=>s+(a.balance||0),0)/1000),
                  fill:["#2563EB","#16A34A","#D97706","#7C3AED","#EF4444","#0891B2"][i],
                })).filter(d=>d.value>0);
                return typeData.length === 0 ? <p className="text-slate-400 text-center py-6">No accounts</p> : (
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={typeData} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis type="number" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" tick={{fontSize:10}} axisLine={false} tickLine={false} width={70}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Balance"]}/>
                      <Bar dataKey="value" radius={[0,4,4,0]} maxBarSize={16}>
                        {typeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <h3 className="text-[15px] font-semibold text-[#111827] mb-4">Balance Sheet Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-[13px] font-semibold text-slate-700">ASSETS</span></div>
                <div className="flex justify-between"><span className="text-[12.5px] text-slate-500">Loans Receivable</span><span className="text-[12.5px] font-semibold text-[#111827]">TZS {money(loanPortfolio)}k</span></div>
                <div className="flex justify-between"><span className="text-[12.5px] text-slate-500">Fixed Deposits Invested</span><span className="text-[12.5px] font-semibold text-[#111827]">TZS {money(fdTotal)}k</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-2"><span className="text-[13px] font-semibold text-slate-700">LIABILITIES</span></div>
                <div className="flex justify-between"><span className="text-[12.5px] text-slate-500">Customer Deposits</span><span className="text-[12.5px] font-semibold text-[#111827]">TZS {money(totalDeposits)}k</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                  <span className="text-[13px] font-bold text-[#111827]">Net Position</span>
                  <span className="text-[13px] font-bold" style={{color:loanPortfolio-totalDeposits>=0?"#16A34A":"#EF4444"}}>TZS {money(Math.abs(loanPortfolio-totalDeposits))}k</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <h3 className="text-[15px] font-semibold text-[#111827] mb-4">Income Statement (Estimated)</h3>
              <div className="space-y-2">
                {[["Interest on Loans (Monthly)",money(interestIncome)+"k","#16A34A"],["FD Interest Expense",money(fds.rows.reduce((s,f)=>s+(f.amount*f.rate/100/12),0))+"k","#EF4444"],["Net Interest Margin",money(interestIncome-fds.rows.reduce((s,f)=>s+(f.amount*f.rate/100/12),0))+"k","#2563EB"]].map(([l,v,col])=>(
                  <div key={l} className="flex justify-between items-center p-3 rounded-lg bg-slate-50">
                    <span className="text-[12.5px] text-slate-600">{l}</span>
                    <span className="text-[13.5px] font-bold font-mono" style={{color:col}}>TZS {v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAcc && <AccStatement acc={selectedAcc}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESTAURANT MANAGEMENT SYSTEM
// Tables · Menu · Orders · Kitchen Display · Reservations · POS · Reports
// ═══════════════════════════════════════════════════════════════════════════
export const RST_TABLES_SEED = [
  { id:"T01", number:"T01", seats:2,  zone:"Indoor",  status:"Available", waiter:"",           currentOrder:null },
  { id:"T02", number:"T02", seats:4,  zone:"Indoor",  status:"Occupied",  waiter:"Ali Hassan",  currentOrder:"ORD-001" },
  { id:"T03", number:"T03", seats:4,  zone:"Indoor",  status:"Reserved",  waiter:"",            currentOrder:null },
  { id:"T04", number:"T04", seats:6,  zone:"Indoor",  status:"Available", waiter:"",            currentOrder:null },
  { id:"T05", number:"T05", seats:2,  zone:"Terrace", status:"Occupied",  waiter:"Sara Mwenda", currentOrder:"ORD-002" },
  { id:"T06", number:"T06", seats:4,  zone:"Terrace", status:"Available", waiter:"",            currentOrder:null },
  { id:"T07", number:"T07", seats:8,  zone:"VIP",     status:"Reserved",  waiter:"",            currentOrder:null },
  { id:"T08", number:"T08", seats:2,  zone:"Bar",     status:"Available", waiter:"",            currentOrder:null },
  { id:"T09", number:"T09", seats:4,  zone:"Outdoor", status:"Occupied",  waiter:"John Kamau",  currentOrder:"ORD-003" },
  { id:"T10", number:"T10", seats:6,  zone:"Outdoor", status:"Available", waiter:"",            currentOrder:null },
];

export const RST_MENU_SEED = [
  // Starters
  { id:"M001", name:"Samosa (4 pcs)",          category:"Starters",    price:4500,  cost:1800, prepTime:8,  available:true, description:"Crispy pastry with spiced beef filling",       image:"🥟", popular:true  },
  { id:"M002", name:"Soup of the Day",          category:"Starters",    price:6000,  cost:2000, prepTime:5,  available:true, description:"Chef&apos;s daily soup with bread",                  image:"🍲", popular:false },
  { id:"M003", name:"Prawn Cocktail",           category:"Starters",    price:12000, cost:5000, prepTime:10, available:true, description:"Tiger prawns with Marie Rose sauce",          image:"🍤", popular:true  },
  // Mains
  { id:"M004", name:"Nyama Choma (500g)",       category:"Main Course", price:18000, cost:8000, prepTime:25, available:true, description:"Grilled beef with ugali and kachumbari",      image:"🥩", popular:true  },
  { id:"M005", name:"Grilled Tilapia",          category:"Main Course", price:16000, cost:6500, prepTime:20, available:true, description:"Whole tilapia with coconut rice and salad",   image:"🐟", popular:true  },
  { id:"M006", name:"Zanzibar Biryani",         category:"Main Course", price:14000, cost:5500, prepTime:30, available:true, description:"Fragrant spiced rice with chicken",           image:"🍛", popular:true  },
  { id:"M007", name:"Steak (200g)",             category:"Main Course", price:32000, cost:14000,prepTime:20, available:true, description:"Beef sirloin with fries and pepper sauce",    image:"🥩", popular:false },
  { id:"M008", name:"Pasta Arrabiata",          category:"Main Course", price:12000, cost:4000, prepTime:15, available:true, description:"Penne pasta with spicy tomato sauce",         image:"🍝", popular:false },
  // Grills
  { id:"M009", name:"Mixed Grill Platter",      category:"Grills",      price:38000, cost:16000,prepTime:30, available:true, description:"Chicken, beef & sausage with chips and salad",image:"🍖", popular:true  },
  // Desserts
  { id:"M010", name:"Kaimati (10 pcs)",         category:"Desserts",    price:5000,  cost:1500, prepTime:10, available:true, description:"Sweet fried dumplings with honey",            image:"🍡", popular:true  },
  { id:"M011", name:"Ice Cream (3 scoops)",     category:"Desserts",    price:6000,  cost:2000, prepTime:3,  available:true, description:"Choice of chocolate, vanilla or strawberry", image:"🍨", popular:false },
  // Drinks
  { id:"M012", name:"Fresh Juice",              category:"Drinks",      price:4500,  cost:1200, prepTime:5,  available:true, description:"Mango, passion, orange or watermelon",       image:"🧃", popular:true  },
  { id:"M013", name:"Softdrinks",               category:"Drinks",      price:2500,  cost:800,  prepTime:1,  available:true, description:"Coca-Cola, Sprite, Fanta, Water",             image:"🥤", popular:false },
  { id:"M014", name:"Tusker Lager (500ml)",     category:"Drinks",      price:5500,  cost:2500, prepTime:1,  available:true, description:"Cold Kenyan beer",                            image:"🍺", popular:true  },
  { id:"M015", name:"House Wine (Glass)",       category:"Drinks",      price:9000,  cost:3500, prepTime:2,  available:true, description:"Red or white, Cape Town",                    image:"🍷", popular:false },
];

export const RST_ORDERS_SEED = [
  { id:"ORD-001", table:"T02", waiter:"Ali Hassan",  items:[{id:"M004",name:"Nyama Choma (500g)",qty:2,price:18000},{id:"M012",name:"Fresh Juice",qty:2,price:4500}], subtotal:45000, tax:4500, total:49500, paid:0, status:"Preparing", timeIn:"14:32", note:"", kitchen:"In Progress" },
  { id:"ORD-002", table:"T05", waiter:"Sara Mwenda", items:[{id:"M006",name:"Zanzibar Biryani",qty:1,price:14000},{id:"M003",name:"Prawn Cocktail",qty:1,price:12000},{id:"M013",name:"Softdrinks",qty:2,price:2500}], subtotal:31000, tax:3100, total:34100, paid:0, status:"Ready",    timeIn:"14:15", note:"No onions on biryani", kitchen:"Ready" },
  { id:"ORD-003", table:"T09", waiter:"John Kamau",  items:[{id:"M005",name:"Grilled Tilapia",qty:2,price:16000},{id:"M014",name:"Tusker Lager (500ml)",qty:3,price:5500}], subtotal:48500, tax:4850, total:53350, paid:53350, status:"Paid",     timeIn:"13:55", note:"", kitchen:"Served" },
];

export const RST_RESERVATIONS_SEED = [
  { id:"RES-001", name:"Mr. Ahmed Hassan",     phone:"0712-001-001", date:"2026-07-21", time:"19:00", covers:4, table:"T07", status:"Confirmed", note:"Anniversary — arrange flowers" },
  { id:"RES-002", name:"Baraka Enterprises",   phone:"0756-002-002", date:"2026-07-21", time:"13:00", covers:8, table:"T07", status:"Confirmed", note:"Business lunch" },
  { id:"RES-003", name:"Ms. Grace Waweru",     phone:"0722-003-003", date:"2026-07-22", time:"20:00", covers:2, table:"T03", status:"Pending",   note:"Birthday cake needed" },
];

export const RST_WAITERS = ["Ali Hassan","Sara Mwenda","John Kamau","Amina Juma","Peter Otieno"];

export const MENU_CATEGORIES = ["Starters","Main Course","Grills","Desserts","Drinks","Specials"];

export const TABLE_ZONES = ["Indoor","Terrace","VIP","Bar","Outdoor"];

export const TZS_FMT = (n) => "TZS " + Number(n).toLocaleString();
