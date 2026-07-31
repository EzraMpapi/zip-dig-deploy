import { useEffect, useState } from "react";
import {
  AlertCircle, BarChart3, Download, LayoutDashboard, Package, Plus, Receipt, Search, Syringe,
  Tablets, Truck
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
import { downloadCSV } from "../modules/Reports.jsx";
import {
  DRUG_CATEGORIES,
  PHM_DISPENSE_SEED,
  PHM_DRUGS_SEED,
  PHM_STOCK_SEED,
  PHM_SUPPLIERS_SEED,
} from "../modules/School.jsx";

export function PharmacyManagementModule({ currentUser, company, onStockLoad }) {
  const [tab, setTab] = useState("overview");
  const drugs     = useCompanyTable("phm_drugs",     PHM_DRUGS_SEED,     { mapRow: r => r });
  const stock     = useCompanyTable("phm_stock",     PHM_STOCK_SEED,     { mapRow: r => r });
  useEffect(() => { if (onStockLoad) onStockLoad(stock.rows); }, [stock.rows, onStockLoad]);
  const dispense  = useCompanyTable("phm_dispense",  PHM_DISPENSE_SEED,  { mapRow: r => r });
  const suppliers = useCompanyTable("phm_suppliers", PHM_SUPPLIERS_SEED, { mapRow: r => r });

  const [drugForm,  setDrugForm]  = useState({ name:"", genericName:"", category:"Antibiotic", form:"Tablet", strength:"", manufacturer:"", price:"", unitCost:"", requiresRx:true, controlled:false });
  const [disForm,   setDisForm]   = useState({ patient:"", drugId:"", qty:"", dosage:"", prescriber:"", rxNo:"" });
  const [showDrug,  setShowDrug]  = useState(false);
  const [showDis,   setShowDis]   = useState(false);
  const [searchDrug, setSearchDrug] = useState("");

  const PHM_GREEN = "#059669";
  const PHM_DARK  = "#064E3B";

  const TABS = [
    { id:"overview",      label:"Overview",       icon: LayoutDashboard },
    { id:"catalog",       label:"Drug Catalog",   icon: Tablets },
    { id:"stock",         label:"Stock",          icon: Package },
    { id:"dispensing",    label:"Dispensing",     icon: Syringe },
    { id:"suppliers",     label:"Suppliers",      icon: Truck },
    { id:"expiry",        label:"Expiry Alerts",  icon: AlertCircle },
    { id:"billing",       label:"Billing",        icon: Receipt },
    { id:"analytics",     label:"Analytics",      icon: BarChart3 },
  ];

  // Analytics
  const totalSkus       = drugs.rows.length;
  const lowStock        = stock.rows.filter(s => s.qty <= s.minQty);
  const today           = new Date();
  const in90days        = new Date(today.getTime() + 90*24*60*60*1000);
  const expiringItems   = stock.rows.filter(s => new Date(s.expiry) <= in90days);
  const expiredItems    = stock.rows.filter(s => new Date(s.expiry) < today);
  const stockValue      = stock.rows.reduce((sum, s) => sum + s.qty * s.unitCost, 0);
  const todayRevenue    = dispense.rows.filter(d => d.date === today.toISOString().slice(0,10)).reduce((s,d) => s+d.price, 0);
  const pendingDispense = dispense.rows.filter(d => d.status === "Pending");

  const daysToExpiry = (dateStr) => Math.ceil((new Date(dateStr) - today) / (1000*60*60*24));
  const expiryColor  = (days) => days < 0 ? "#EF4444" : days < 30 ? "#EF4444" : days < 60 ? "#F59E0B" : "#16A34A";

  async function addDrug() {
    if (!drugForm.name.trim()) return;
    const row = { ...drugForm, id: docId("DRG"), price: Number(drugForm.price), unitCost: Number(drugForm.unitCost) };
    drugs.setRows(p => [row, ...p]);
    setDrugForm({ name:"", genericName:"", category:"Antibiotic", form:"Tablet", strength:"", manufacturer:"", price:"", unitCost:"", requiresRx:true, controlled:false });
    setShowDrug(false);
    notify("Drug '" + row.name + "' added to catalog");
    if (IS_CONFIGURED) { try { await sb("phm_drugs").insert(row).run(); } catch(_e){} }
  }

  async function dispenseDrug() {
    if (!disForm.patient || !disForm.drugId || !disForm.qty) return;
    const drug = drugs.rows.find(d => d.id === disForm.drugId);
    const total = drug ? drug.price * Number(disForm.qty) : 0;
    const row = { ...disForm, id: docId("DIS"), drug: drug?.name||"", price: total, date: today.toISOString().slice(0,10), status: "Dispensed", prescriber: disForm.prescriber || currentUser?.name || "Pharmacist" };
    dispense.setRows(p => [row, ...p]);
    // Reduce stock
    stock.setRows(p => p.map(s => s.drugId === disForm.drugId ? { ...s, qty: Math.max(0, s.qty - Number(disForm.qty)) } : s));
    setDisForm({ patient:"", drugId:"", qty:"", dosage:"", prescriber:"", rxNo:"" });
    setShowDis(false);
    notify("Dispensed: " + drug?.name + " × " + disForm.qty + " to " + disForm.patient);
    logAudit("Dispensed: " + drug?.name, "Pharmacy", currentUser?.name||"System", disForm.patient + " × " + disForm.qty);
  }

  const filteredDrugs = drugs.rows.filter(d => !searchDrug || d.name.toLowerCase().includes(searchDrug.toLowerCase()) || d.genericName?.toLowerCase().includes(searchDrug.toLowerCase()) || d.category?.toLowerCase().includes(searchDrug.toLowerCase()));

  const StatusPill = ({ s, mini }) => {
    const cfg = { Active:["#DCFCE7","#16A34A"], Dispensed:["#DCFCE7","#16A34A"], Pending:["#FEF3C7","#D97706"], Expired:["#FEE2E2","#EF4444"], "Low Stock":["#FEF3C7","#D97706"] };
    const [bg, col] = cfg[s] || ["#F3F4F6","#6B7280"];
    return <span className={"font-semibold rounded-full " + (mini?"text-[9.5px] px-1.5 py-0.5":"text-[10.5px] px-2 py-0.5")} style={{ background:bg, color:col }}>{s}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl px-6 py-5 relative overflow-hidden" style={{ background:"linear-gradient(135deg,#064E3B 0%,#059669 55%,#10B981 100%)" }}>
        <div className="absolute right-6 top-4 opacity-10"><Tablets size={80}/></div>
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><Tablets size={22} className="text-white"/><h1 className="text-[20px] font-bold text-white">Pharmacy Management System</h1></div>
            <p className="text-[12px]" style={{color:"rgba(255,255,255,.65)"}}>Drug Catalog · Stock Control · Dispensing · Expiry Alerts · Billing</p>
          </div>
          <div className="flex gap-2">
            {lowStock.length > 0 && <div className="flex items-center gap-1.5 bg-[#FEF3C7] text-[#92400E] px-3 py-2 rounded-xl text-[12px] font-semibold"><AlertCircle size={13}/>{lowStock.length} Low Stock</div>}
            {expiringItems.length > 0 && <div className="flex items-center gap-1.5 bg-[#FEE2E2] text-[#991B1B] px-3 py-2 rounded-xl text-[12px] font-semibold"><AlertCircle size={13}/>{expiringItems.length} Expiring</div>}
            <button onClick={()=>setShowDis(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-white" style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)"}}><Syringe size={13}/>Dispense</button>
            <button onClick={()=>setShowDrug(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-white" style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)"}}><Plus size={13}/>Add Drug</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {TABS.map(t => { const I = t.icon; return (
          <button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1 px-3 py-2 rounded-lg text-[11.5px] font-medium transition-all whitespace-nowrap "+(tab===t.id?"text-white shadow-sm":"text-slate-500 hover:bg-slate-50")} style={{background:tab===t.id?PHM_GREEN:"transparent"}}>
            <I size={12}/>{t.label}
            {t.id==="expiry" && expiringItems.length>0 && <span className="ml-0.5 bg-[#EF4444] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{expiringItems.length}</span>}
          </button>
        ); })}
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { l:"Drug SKUs",       v:totalSkus,               sub:"In catalog",             c:PHM_GREEN,  I:Tablets },
              { l:"Stock Value",     v:"TZS "+money(stockValue)+"k", sub:"Total inventory value", c:"#2563EB", I:Package },
              { l:"Low Stock Items", v:lowStock.length,         sub:lowStock.map(s=>s.drug).join(", ").substring(0,30)+"...", c:"#F59E0B", I:AlertCircle },
              { l:"Expiring Soon",   v:expiringItems.length,    sub:"Within 90 days",         c:"#EF4444",  I:AlertCircle },
            ].map(k => (
              <div key={k.l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.l}</p><p className="text-[22px] font-bold mt-1 text-[#111827]">{k.v}</p><p className="text-[11.5px] mt-0.5 truncate max-w-[140px]" style={{color:k.c}}>{k.sub}</p></div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background:k.c+"18"}}><k.I size={18} style={{color:k.c}}/></div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Stock by Category</p>
              {["Antibiotic","Analgesic","Antidiabetic","Antihypertensive","Insulin"].map(cat => {
                const catDrugs = drugs.rows.filter(d => d.category === cat);
                const catStock = stock.rows.filter(s => catDrugs.some(d => d.id === s.drugId)).reduce((sum,s)=>sum+s.qty,0);
                const total = stock.rows.reduce((sum,s)=>sum+s.qty,0);
                const pct = total > 0 ? catStock/total*100 : 0;
                if (!catStock) return null;
                return (
                  <div key={cat} className="flex items-center gap-2 mb-2.5">
                    <span className="text-[11.5px] text-slate-600 w-32 shrink-0">{cat}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:pct+"%", background:PHM_GREEN}}/></div>
                    <span className="text-[11.5px] font-mono font-bold text-slate-700 w-10 text-right">{catStock}</span>
                  </div>
                );
              }).filter(Boolean)}
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Recent Dispensing</p>
              <div className="space-y-2">
                {dispense.rows.slice(0,5).map(d => (
                  <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                    <div><p className="text-[12.5px] font-medium text-[#111827]">{d.patient}</p><p className="text-[11px] text-slate-400">{d.drug} · {d.date}</p></div>
                    <div className="text-right"><p className="text-[13px] font-bold text-[#059669]">TZS {money(d.price)}k</p><StatusPill s={d.status} mini/></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRUG CATALOG */}
      {tab==="catalog" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className={inputClass+" pl-9"} placeholder="Search drug by name, generic or category..." value={searchDrug} onChange={e=>setSearchDrug(e.target.value)}/></div>
            <button onClick={()=>downloadCSV("pharmacy-drugs",drugs.rows,[{key:"name",label:"Drug"},{key:"genericName",label:"Generic"},{key:"category",label:"Category"},{key:"form",label:"Form"},{key:"strength",label:"Strength"},{key:"manufacturer",label:"Manufacturer"},{key:"price",label:"Price"}])} className="flex items-center gap-1 text-[12px] font-medium text-slate-500 border border-slate-200 px-3 py-2.5 rounded-xl hover:border-green-500 hover:text-green-600 transition-colors"><Download size={13}/>Export</button>
            <button onClick={()=>setShowDrug(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:PHM_GREEN}}><Plus size={13}/>Add Drug</button>
          </div>
          {showDrug && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <p className="text-[14px] font-semibold text-[#111827]">Add New Drug</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Brand Name *"><input className={inputClass} value={drugForm.name} onChange={e=>setDrugForm({...drugForm,name:e.target.value})} placeholder="e.g. Amoxicillin 500mg"/></FormField>
                <FormField label="Generic Name"><input className={inputClass} value={drugForm.genericName} onChange={e=>setDrugForm({...drugForm,genericName:e.target.value})} placeholder="Generic name"/></FormField>
                <FormField label="Category"><select className={inputClass} value={drugForm.category} onChange={e=>setDrugForm({...drugForm,category:e.target.value})}>{DRUG_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></FormField>
                <FormField label="Form"><select className={inputClass} value={drugForm.form} onChange={e=>setDrugForm({...drugForm,form:e.target.value})}>{["Tablet","Capsule","Syrup","Injection","Inhaler","Cream","Drops","Suppository","Patch","IV Solution"].map(f=><option key={f}>{f}</option>)}</select></FormField>
                <FormField label="Strength"><input className={inputClass} value={drugForm.strength} onChange={e=>setDrugForm({...drugForm,strength:e.target.value})} placeholder="e.g. 500mg"/></FormField>
                <FormField label="Manufacturer"><input className={inputClass} value={drugForm.manufacturer} onChange={e=>setDrugForm({...drugForm,manufacturer:e.target.value})}/></FormField>
                <FormField label="Selling Price (TZS)"><input type="number" step="0.01" className={inputClass} value={drugForm.price} onChange={e=>setDrugForm({...drugForm,price:e.target.value})}/></FormField>
                <FormField label="Unit Cost (TZS)"><input type="number" step="0.01" className={inputClass} value={drugForm.unitCost} onChange={e=>setDrugForm({...drugForm,unitCost:e.target.value})}/></FormField>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={drugForm.requiresRx} onChange={e=>setDrugForm({...drugForm,requiresRx:e.target.checked})} className="rounded"/><span className="text-[12.5px] text-slate-600">Requires Prescription (Rx)</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={drugForm.controlled} onChange={e=>setDrugForm({...drugForm,controlled:e.target.checked})} className="rounded"/><span className="text-[12.5px] text-slate-600">Controlled Substance</span></label>
              </div>
              <div className="flex gap-2"><button onClick={addDrug} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl" style={{background:PHM_GREEN}}>Add Drug</button><button onClick={()=>setShowDrug(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Drug Name","Generic","Category","Form","Strength","Manufacturer","Price","Cost","Rx","Controlled"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{filteredDrugs.map(d => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-3 font-medium text-[#111827]">{d.name}</td>
                  <td className="px-3 py-3 text-slate-500 italic">{d.genericName}</td>
                  <td className="px-3 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:PHM_GREEN+"18",color:PHM_GREEN}}>{d.category}</span></td>
                  <td className="px-3 py-3 text-slate-500">{d.form}</td>
                  <td className="px-3 py-3 font-mono font-semibold text-slate-700">{d.strength}</td>
                  <td className="px-3 py-3 text-slate-500 text-[11.5px]">{d.manufacturer}</td>
                  <td className="px-3 py-3 font-mono font-semibold" style={{color:PHM_GREEN}}>TZS {d.price}</td>
                  <td className="px-3 py-3 font-mono text-slate-400">TZS {d.unitCost}</td>
                  <td className="px-3 py-3">{d.requiresRx?<span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Rx</span>:<span className="text-[10px] text-slate-300">—</span>}</td>
                  <td className="px-3 py-3">{d.controlled?<span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">⚠ CD</span>:<span className="text-[10px] text-slate-300">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* STOCK */}
      {tab==="stock" && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[["Total Units", stock.rows.reduce((s,r)=>s+r.qty,0), PHM_GREEN], ["Stock Value","TZS "+money(stockValue)+"k","#2563EB"], ["Low Stock",lowStock.length,"#F59E0B"], ["Expired",expiredItems.length,"#EF4444"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[20px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-[13.5px] font-semibold text-[#111827]">Stock Levels</p><button onClick={()=>notify("Add stock receipt form")} className="flex items-center gap-1 text-[12px] font-semibold text-white px-3 py-2 rounded-xl" style={{background:PHM_GREEN}}><Plus size={12}/>Receive Stock</button></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Drug","Batch","Qty","Min Qty","Expiry","Days Left","Supplier","Value","Status"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{stock.rows.map(s => {
                const days = daysToExpiry(s.expiry);
                const isLow = s.qty <= s.minQty;
                const isExp = days < 0;
                const rowStatus = isExp ? "Expired" : isLow ? "Low Stock" : "Active";
                return (
                  <tr key={s.id} className={"border-b border-slate-50 last:border-0 " + (isLow||isExp?"bg-red-50/30":"hover:bg-slate-50/50")}>
                    <td className="px-3 py-3 font-medium text-[#111827]">{s.drug}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-400">{s.batchNo}</td>
                    <td className="px-3 py-3 font-bold" style={{color:isLow?"#EF4444":"#111827"}}>{s.qty}</td>
                    <td className="px-3 py-3 text-slate-400">{s.minQty}</td>
                    <td className="px-3 py-3 font-mono text-[11.5px]" style={{color:expiryColor(days)}}>{s.expiry}</td>
                    <td className="px-3 py-3 font-bold" style={{color:expiryColor(days)}}>{days < 0 ? "EXPIRED" : days+"d"}</td>
                    <td className="px-3 py-3 text-slate-500 text-[11.5px]">{s.supplier}</td>
                    <td className="px-3 py-3 font-mono font-semibold" style={{color:PHM_GREEN}}>TZS {money(s.qty*s.unitCost)}k</td>
                    <td className="px-3 py-3"><StatusPill s={rowStatus}/></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* DISPENSING */}
      {tab==="dispensing" && (
        <div className="space-y-3">
          {!showDis && <div className="flex justify-end"><button onClick={()=>setShowDis(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:PHM_GREEN}}><Syringe size={13}/>Dispense Drug</button></div>}
          {showDis && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <p className="text-[14px] font-semibold text-[#111827]">Dispense Drug</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Patient Name *"><input className={inputClass} value={disForm.patient} onChange={e=>setDisForm({...disForm,patient:e.target.value})} placeholder="Patient name"/></FormField>
                <FormField label="Drug *"><select className={inputClass} value={disForm.drugId} onChange={e=>setDisForm({...disForm,drugId:e.target.value})}><option value="">Select drug...</option>{drugs.rows.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></FormField>
                <FormField label="Quantity"><input type="number" min="1" className={inputClass} value={disForm.qty} onChange={e=>setDisForm({...disForm,qty:e.target.value})}/></FormField>
                <FormField label="Dosage Instructions"><input className={inputClass} value={disForm.dosage} onChange={e=>setDisForm({...disForm,dosage:e.target.value})} placeholder="e.g. 1 TID × 7 days"/></FormField>
                <FormField label="Prescriber"><input className={inputClass} value={disForm.prescriber} onChange={e=>setDisForm({...disForm,prescriber:e.target.value})} placeholder="Doctor name"/></FormField>
                <FormField label="Prescription #"><input className={inputClass} value={disForm.rxNo} onChange={e=>setDisForm({...disForm,rxNo:e.target.value})} placeholder="RX-001"/></FormField>
              </div>
              {disForm.drugId && disForm.qty && (() => {
                const d = drugs.rows.find(dr => dr.id === disForm.drugId);
                const total = d ? d.price * Number(disForm.qty) : 0;
                return <div className="p-3 rounded-xl bg-green-50 border border-green-100"><p className="text-[13px] font-semibold text-green-800">Total: <strong>TZS {money(total)}k</strong> · {d?.name} × {disForm.qty} units @ TZS {d?.price} each</p></div>;
              })()}
              <div className="flex gap-2"><button onClick={dispenseDrug} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl" style={{background:PHM_GREEN}}>Confirm Dispense</button><button onClick={()=>setShowDis(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["#","Patient","Drug","Qty","Dosage","Prescriber","Date","Amount","Rx No","Status"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{dispense.rows.map((d,i) => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-3 text-slate-400 text-[11px]">{i+1}</td>
                  <td className="px-3 py-3 font-medium text-[#111827]">{d.patient}</td>
                  <td className="px-3 py-3 text-slate-600">{d.drug}</td>
                  <td className="px-3 py-3 font-bold text-[#111827]">{d.qty}</td>
                  <td className="px-3 py-3 text-slate-400 text-[11.5px]">{d.dosage}</td>
                  <td className="px-3 py-3 text-slate-500 text-[11.5px]">{d.prescriber}</td>
                  <td className="px-3 py-3 font-mono text-[11.5px] text-slate-400">{d.date}</td>
                  <td className="px-3 py-3 font-mono font-bold" style={{color:PHM_GREEN}}>TZS {money(d.price)}k</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-slate-400">{d.rxNo}</td>
                  <td className="px-3 py-3"><StatusPill s={d.status}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUPPLIERS */}
      {tab==="suppliers" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.rows.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div><p className="text-[14px] font-semibold text-[#111827]">{s.name}</p><p className="text-[12px] text-slate-400">{s.contact}</p></div>
                  <StatusPill s={s.status}/>
                </div>
                <div className="space-y-1.5">
                  {[["Phone", s.phone], ["Email", s.email], ["Terms", s.terms], ["Last Order", s.lastOrder]].map(([l,v])=>(
                    <div key={l} className="flex justify-between"><span className="text-[11.5px] text-slate-400">{l}</span><span className="text-[11.5px] font-medium text-[#111827] truncate max-w-[160px]">{v}</span></div>
                  ))}
                </div>
                <button onClick={()=>notify("Purchase order for " + s.name)} className="mt-3 w-full text-[11.5px] font-semibold py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-green-500 hover:text-green-600 transition-colors">Create Purchase Order</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EXPIRY ALERTS */}
      {tab==="expiry" && (
        <div className="space-y-4">
          {expiredItems.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><AlertCircle size={16} className="text-red-500"/><p className="text-[13.5px] font-semibold text-red-700">{expiredItems.length} Expired Item{expiredItems.length>1?"s":""}  — Remove Immediately</p></div>
              {expiredItems.map(s => <p key={s.id} className="text-[12px] text-red-600 ml-5">• {s.drug} (Batch: {s.batchNo}) — Expired {s.expiry}</p>)}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {[["Expired",expiredItems.filter(s=>daysToExpiry(s.expiry)<0).length,"#EF4444"],["Expiring < 30 days",stock.rows.filter(s=>{const d=daysToExpiry(s.expiry);return d>=0&&d<30}).length,"#F59E0B"],["Expiring < 90 days",expiringItems.filter(s=>daysToExpiry(s.expiry)>=0).length,"#D97706"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border p-4 text-center" style={{borderColor:col+"40"}}><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[24px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><p className="text-[13.5px] font-semibold text-[#111827]">All Items Expiring Within 90 Days</p></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Drug","Batch","Qty","Expiry Date","Days Left","Action"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>
                {expiringItems.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-10 text-center text-green-600 font-medium">✓ No items expiring within 90 days — stock is healthy!</td></tr>
                  : expiringItems.map(s => {
                    const days = daysToExpiry(s.expiry);
                    return (
                      <tr key={s.id} className="border-b border-slate-50 last:border-0" style={{background:days<0?"#FEF2F2":days<30?"#FFFBEB":"#F0FFF4"}}>
                        <td className="px-4 py-3 font-medium text-[#111827]">{s.drug}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{s.batchNo}</td>
                        <td className="px-4 py-3 font-bold text-[#111827]">{s.qty}</td>
                        <td className="px-4 py-3 font-mono" style={{color:expiryColor(days)}}>{s.expiry}</td>
                        <td className="px-4 py-3 font-bold text-lg" style={{color:expiryColor(days)}}>{days<0?"EXPIRED":days+"d"}</td>
                        <td className="px-4 py-3"><button onClick={()=>notify("Return/quarantine " + s.drug)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg" style={{background:days<0?"#EF4444":"#F59E0B",color:"#fff"}}>{days<0?"Remove":"Prioritise"}</button></td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BILLING */}
      {tab==="billing" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[["Today Revenue","TZS "+money(todayRevenue)+"k","#059669"],["This Month Revenue","TZS "+money(dispense.rows.reduce((s,d)=>s+d.price,0))+"k","#2563EB"],["Avg Sale","TZS "+money(dispense.rows.length>0?dispense.rows.reduce((s,d)=>s+d.price,0)/dispense.rows.length:0)+"k","#7C3AED"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[20px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3"><p className="text-[13.5px] font-semibold text-[#111827]">Revenue by Drug</p></div>
            {drugs.rows.map(d => {
              const drugSales = dispense.rows.filter(dp => dp.drug === d.name).reduce((s,dp)=>s+dp.price,0);
              if (!drugSales) return null;
              const totalRev  = dispense.rows.reduce((s,dp)=>s+dp.price,0);
              const pct = totalRev > 0 ? drugSales/totalRev*100 : 0;
              return (
                <div key={d.id} className="flex items-center gap-3 mb-2.5">
                  <span className="text-[12px] text-slate-600 w-44 shrink-0 truncate">{d.name}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:pct+"%", background:PHM_GREEN}}/></div>
                  <span className="text-[12px] font-mono font-bold text-slate-700 w-20 text-right">TZS {money(drugSales)}k</span>
                </div>
              );
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {/* PHARMACY ANALYTICS TAB */}
      {tab === "analytics" && (() => {
        const catData = PHM_DRUG_CATEGORIES.map((cat,i)=>({
          name: cat.length > 12 ? cat.slice(0,10)+"…" : cat,
          value: stock.rows.filter(s=>drugs.rows.find(d=>d.id===s.drugId)?.category===cat).reduce((s,r)=>s+r.stock,0),
          fill:["#059669","#2563EB","#D97706","#7C3AED","#EF4444","#0891B2","#DC2626","#0F766E"][i%8],
        })).filter(d=>d.value>0);

        const expiringData = stock.rows.filter(s=>{
          if(!s.expiryDate) return false;
          const days = Math.ceil((new Date(s.expiryDate)-new Date())/86400000);
          return days > 0 && days <= 90;
        }).slice(0,6).map(s=>({
          name: (drugs.rows.find(d=>d.id===s.drugId)?.name||s.name||"Drug").slice(0,14),
          days: Math.ceil((new Date(s.expiryDate)-new Date())/86400000),
          stock: s.stock,
        })).sort((a,b)=>a.days-b.days);

        const dispensedData = drugs.rows.slice(0,6).map(d=>({
          name: d.name.slice(0,14),
          value: dispense.rows.filter(r=>r.drugId===d.id).reduce((s,r)=>s+(r.qty||0),0),
          fill:"#059669",
        })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,6);

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Total SKUs",String(drugs.rows.length),"#059669"],
                ["Low Stock",String(stock.rows.filter(s=>s.stock<=s.reorder&&s.reorder>0).length),"#EF4444"],
                ["Expiring (90d)",String(expiringData.length),"#F59E0B"],
                ["Dispensed Today",String(dispense.rows.filter(d=>d.date===TODAY.toISOString().slice(0,10)).reduce((s,r)=>s+(r.qty||0),0)),"#2563EB"],
              ].map(([l,v,col])=>(
                <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                  <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                  <p className="text-[20px] font-bold" style={{color:col}}>{v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Stock by Category */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">📦 Stock by Category</h3>
                {catData.length===0?<p className="text-slate-400 text-center py-6">No stock data</p>:(
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={150}>
                      <PieChart><Pie data={catData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                        {catData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" units",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1">
                      {catData.slice(0,6).map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[11.5px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[12px] font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Top Dispensed */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">💊 Top Dispensed Drugs</h3>
                {dispensedData.length===0?<p className="text-slate-400 text-center py-6">No dispensing records</p>:(
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={dispensedData} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis type="number" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" tick={{fontSize:10}} axisLine={false} tickLine={false} width={80}/>
                      <Tooltip formatter={(v)=>[v+" units","Dispensed"]}/>
                      <Bar dataKey="value" fill="#059669" radius={[0,4,4,0]} maxBarSize={16}/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Expiring drugs alert */}
            {expiringData.length > 0 && (
              <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-4">
                <h3 className="text-[13.5px] font-bold text-[#92400E] mb-3">⚠ Drugs Expiring Within 90 Days</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="bg-[#FCD34D]/30">
                      {["Drug","Expiry Date","Days Left","Stock"].map(h=><th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-[#92400E]">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {expiringData.map((d,i)=>(
                        <tr key={i} className="border-b border-[#FDE68A]/50">
                          <td className="px-3 py-2 font-semibold">{d.name}</td>
                          <td className="px-3 py-2 font-mono text-[11.5px]">{stock.rows.find(s=>drugs.rows.find(dr=>dr.id===s.drugId&&dr.name?.slice(0,14)===d.name)?.id===s.drugId)?.expiryDate||"—"}</td>
                          <td className="px-3 py-2 font-bold" style={{color:d.days<=30?"#EF4444":"#F59E0B"}}>{d.days}d</td>
                          <td className="px-3 py-2 font-mono">{d.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOTEL / HOSPITALITY MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════
export const HTL_ROOMS_SEED = [
  { id:"RM-101", number:"101", type:"Standard",   floor:1, beds:1, price:85,  status:"Available", amenities:["AC","WiFi","TV"] },
  { id:"RM-102", number:"102", type:"Standard",   floor:1, beds:2, price:95,  status:"Occupied",  amenities:["AC","WiFi","TV"] },
  { id:"RM-201", number:"201", type:"Deluxe",     floor:2, beds:1, price:130, status:"Available", amenities:["AC","WiFi","TV","Minibar"] },
  { id:"RM-202", number:"202", type:"Deluxe",     floor:2, beds:2, price:150, status:"Cleaning",  amenities:["AC","WiFi","TV","Minibar"] },
  { id:"RM-301", number:"301", type:"Suite",      floor:3, beds:1, price:220, status:"Occupied",  amenities:["AC","WiFi","TV","Minibar","Balcony","Jacuzzi"] },
  { id:"RM-302", number:"302", type:"Suite",      floor:3, beds:2, price:280, status:"Available", amenities:["AC","WiFi","TV","Minibar","Balcony","Jacuzzi"] },
  { id:"RM-401", number:"401", type:"Presidential",floor:4,beds:2, price:500, status:"Available", amenities:["AC","WiFi","TV","Minibar","Balcony","Jacuzzi","Butler"] },
];

export const HTL_BOOKINGS_SEED = [
  { id:"BKG-001", guest:"Mohammed Al Qahtani", room:"102", type:"Standard",   checkIn:"2026-07-16", checkOut:"2026-07-19", nights:3, total:285, paid:285, status:"Active",    source:"Direct" },
  { id:"BKG-002", guest:"Sarah Johnson",       room:"301", type:"Suite",      checkIn:"2026-07-17", checkOut:"2026-07-22", nights:5, total:1100,paid:550, status:"Active",    source:"Booking.com" },
  { id:"BKG-003", guest:"Amina Hassan",        room:"201", type:"Deluxe",     checkIn:"2026-07-20", checkOut:"2026-07-23", nights:3, total:390, paid:0,   status:"Upcoming",  source:"Direct" },
  { id:"BKG-004", guest:"John Smith",          room:"102", type:"Standard",   checkIn:"2026-07-10", checkOut:"2026-07-14", nights:4, total:380, paid:380, status:"Checked Out",source:"Expedia" },
];
