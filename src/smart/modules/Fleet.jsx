import { useEffect, useState } from "react";
import {
  Bus, Car, Gauge, LayoutDashboard, MapPin, Plus, Wrench
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { TODAY, money } from "../lib/format.jsx";
import { useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";

export function FleetManagementModule({ currentUser, company, onVehiclesLoad }) {
  const [tab, setTab] = useState("overview");
  const vehicles    = useCompanyTable("flt_vehicles",    FLT_VEHICLES_SEED,    { mapRow: r => r });
  useEffect(() => { if (onVehiclesLoad) onVehiclesLoad(vehicles.rows); }, [vehicles.rows, onVehiclesLoad]);
  const trips       = useCompanyTable("flt_trips",       FLT_TRIPS_SEED,       { mapRow: r => r });
  const maintenance = useCompanyTable("flt_maintenance", FLT_MAINTENANCE_SEED, { mapRow: r => r });

  const FLT_BLUE = "#0F172A";
  const FLT_GOLD = "#EAB308";
  const TABS = [
    { id:"overview",  label:"Fleet Overview", icon: LayoutDashboard },
    { id:"vehicles",  label:"Vehicles",       icon: Car },
    { id:"trips",     label:"Trip Log",       icon: MapPin },
    { id:"maintenance",label:"Maintenance",    icon: Wrench },
  ];

  const activeVeh    = vehicles.rows.filter(v=>v.status==="Active").length;
  const totalKm      = trips.rows.reduce((s,t)=>s+t.distance,0);
  const totalFuel    = trips.rows.reduce((s,t)=>s+t.fuelUsed,0);
  const fuelCost     = trips.rows.reduce((s,t)=>s+t.cost,0);
  const maintCost    = maintenance.rows.reduce((s,m)=>s+m.cost,0);
  const dueService   = vehicles.rows.filter(v=>v.mileage >= v.nextService - 2000);
  const expIns       = vehicles.rows.filter(v=>new Date(v.insurance) < new Date(Date.now()+90*24*60*60*1000));

  const VStatusChip = ({s}) => {
    const cfg = {Active:["#DCFCE7","#16A34A"],Available:["#DBEAFE","#1E40AF"],Service:["#FEF3C7","#D97706"],Inactive:["#FEE2E2","#EF4444"],"In Progress":["#DBEAFE","#1E40AF"],Completed:["#DCFCE7","#16A34A"]};
    const [bg,col]=cfg[s]||["#F3F4F6","#6B7280"];
    return <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:bg,color:col}}>{s}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl px-6 py-5" style={{background:"linear-gradient(135deg,#0F172A 0%,#1E293B 50%,#334155 100%)"}}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div><div className="flex items-center gap-2 mb-1"><Bus size={22} className="text-[#EAB308]"/><h1 className="text-[20px] font-bold text-white">Fleet Management</h1></div><p className="text-[12px]" style={{color:"rgba(255,255,255,.55)"}}>Vehicles · Trip Logs · Fuel Tracking · Maintenance · Insurance</p></div>
          <div className="flex gap-2">
            {dueService.length>0&&<div className="bg-yellow-500 text-yellow-900 px-3 py-2 rounded-xl text-[12px] font-bold">{dueService.length} Service Due</div>}
            {expIns.length>0&&<div className="bg-red-500 text-white px-3 py-2 rounded-xl text-[12px] font-bold">{expIns.length} Insurance Expiring</div>}
          </div>
        </div>
      </div>

      <div className="flex gap-0.5 bg-white rounded-xl p-1 border border-slate-200">
        {TABS.map(t=>{const I=t.icon;return(<button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1 px-4 py-2 rounded-lg text-[12px] font-medium transition-all "+(tab===t.id?"text-white shadow-sm":"text-slate-500 hover:bg-slate-50")} style={{background:tab===t.id?FLT_BLUE:"transparent"}}><I size={13}/>{t.label}</button>);})}
      </div>

      {tab==="overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[{l:"Fleet Size",v:vehicles.rows.length,sub:activeVeh+" active",c:"#0F172A",I:Car},{l:"Total KM",v:totalKm.toLocaleString(),sub:"All trips",c:"#2563EB",I:MapPin},{l:"Fuel Cost",v:"TZS "+money(fuelCost)+"k",sub:totalFuel+"L used",c:FLT_GOLD,I:Gauge},{l:"Maintenance",v:"TZS "+money(maintCost)+"k",sub:"YTD spend",c:"#EF4444",I:Wrench}].map(k=>(
              <div key={k.l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4"><div className="flex items-start justify-between"><div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.l}</p><p className="text-[22px] font-bold mt-1 text-[#111827]">{k.v}</p><p className="text-[11.5px] mt-0.5" style={{color:k.c}}>{k.sub}</p></div><div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background:k.c+"18"}}><k.I size={18} style={{color:k.c}}/></div></div></div>
            ))}
          </div>

          {/* ── Fleet Analytics Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly trip distance trend */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Monthly Distance (km)</h3>
              {(() => {
                const months = Array.from({length:6},(_,i)=>{
                  const d = new Date(TODAY.getFullYear(), TODAY.getMonth()-5+i, 1);
                  const key = d.toISOString().slice(0,7);
                  const label = d.toLocaleString("default",{month:"short"});
                  const dist = trips.rows.filter(t=>(t.date||"").startsWith(key)).reduce((s,t)=>s+t.distance,0);
                  const fuel = trips.rows.filter(t=>(t.date||"").startsWith(key)).reduce((s,t)=>s+t.fuelUsed,0);
                  return {month:label, distance:dist, fuel:Math.round(fuel)};
                });
                return (
                  <ResponsiveContainer width="100%" height={150}>
                    <ComposedChart data={months} margin={{left:-10,right:4,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                      <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis yAxisId="left"  tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis yAxisId="right" orientation="right" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v,n)=>[n==="distance"?v+" km":v+"L",n==="distance"?"Distance":"Fuel"]}/>
                      <Area yAxisId="left"  type="monotone" dataKey="distance" stroke="#0F172A" fill="#0F172A18" strokeWidth={2}/>
                      <Line yAxisId="right" type="monotone" dataKey="fuel"     stroke="#EAB308" strokeWidth={2} dot={{r:3,fill:"#EAB308"}} strokeDasharray="4 2"/>
                    </ComposedChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>

            {/* Vehicle status PieChart */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Fleet Status</h3>
              {(() => {
                const STATUS_COLORS = {Active:"#16A34A", "In Transit":"#2563EB", Maintenance:"#F59E0B", Inactive:"#EF4444"};
                const statusData = Object.entries(
                  vehicles.rows.reduce((m,v)=>({...m,[v.status]:(m[v.status]||0)+1}),{})
                ).map(([name,value])=>({name,value,fill:STATUS_COLORS[name]||"#6B7280"}));
                
                return (
                  <div className="flex gap-4 items-center">
                    <ResponsiveContainer width="60%" height={150}>
                      <PieChart>
                        <Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                          {statusData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                        </Pie>
                        <Tooltip formatter={(v,n)=>[v+" vehicles",n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {statusData.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px] text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {dueService.length>0&&<div className="bg-yellow-50er-yellow-200 rounded-xl p-4"><p className="text-[13px] font-semibold text-yellow-800 mb-2">⚠ Service Due Soon</p>{dueService.map(v=><p key={v.id} className="text-[12px] text-yellow-700">• {v.reg} ({v.make} {v.model}) — {v.mileage.toLocaleString()}km / {v.nextService.toLocaleString()}km service</p>)}</div>}
        </div>
      )}

      {tab==="vehicles" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vehicles.rows.map(v => {
              const kmLeft = v.nextService - v.mileage;
              const pct    = Math.min(100, v.mileage / v.nextService * 100);
              const insExp = new Date(v.insurance) < new Date(Date.now()+90*24*60*60*1000);
              return (
                <div key={v.id} className={"bg-white rounded-xl border shadow-sm p-4 "+(v.status==="Service"?"border-yellow-200":"border-slate-200/80")}>
                  <div className="flex items-start justify-between mb-3">
                    <div><p className="text-[16px] font-bold text-[#111827]">{v.reg}</p><p className="text-[12px] text-slate-400">{v.year} {v.make} {v.model}</p></div>
                    <VStatusChip s={v.status}/>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    {[["Driver",v.driver],["Type",v.type],["Fuel",v.fuel],["Mileage",v.mileage.toLocaleString()+"km"],["Insurance",v.insurance+(insExp?" ⚠":"")]].map(([l,val])=>(
                      <div key={l} className="flex justify-between"><span className="text-[11.5px] text-slate-400">{l}</span><span className={"text-[11.5px] font-medium "+(l==="Insurance"&&insExp?"text-red-500":"text-[#111827]")}>{val}</span></div>
                    ))}
                  </div>
                  <div><p className="text-[10.5px] text-slate-400 mb-1">Next service: {v.nextService.toLocaleString()}km ({kmLeft>0?kmLeft.toLocaleString()+"km left":"OVERDUE"})</p><div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:pct+"%",background:pct>95?"#EF4444":pct>80?"#F59E0B":"#16A34A"}}/></div></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab==="trips" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-[13.5px] font-semibold text-[#111827]">Trip Log</p><button onClick={()=>notify("Log new trip")} className="flex items-center gap-1 text-[12px] font-semibold text-white px-3 py-2 rounded-xl" style={{background:FLT_BLUE}}><Plus size={12}/>Log Trip</button></div>
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">{["Vehicle","Driver","Purpose","Start","End","Distance","Fuel Used","Cost","Status"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
            <tbody>{trips.rows.map(t=>(
              <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                <td className="px-3 py-3 font-mono text-[11.5px] font-semibold" style={{color:FLT_BLUE}}>{t.vehicle}</td>
                <td className="px-3 py-3 font-medium text-[#111827]">{t.driver}</td>
                <td className="px-3 py-3 text-slate-500 max-w-[150px] truncate">{t.purpose}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-slate-400">{t.start}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-slate-400">{t.end||"—"}</td>
                <td className="px-3 py-3 font-bold text-[#111827]">{t.distance?t.distance+"km":"—"}</td>
                <td className="px-3 py-3 text-slate-500">{t.fuelUsed?t.fuelUsed+"L":"—"}</td>
                <td className="px-3 py-3 font-mono font-bold" style={{color:FLT_GOLD}}>TZS {money(t.cost)}k</td>
                <td className="px-3 py-3"><VStatusChip s={t.status}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab==="maintenance" && (
        <div className="space-y-3">
          <div className="flex justify-end"><button onClick={()=>notify("Log maintenance record")} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:FLT_BLUE}}><Wrench size={13}/>Log Maintenance</button></div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Vehicle","Type","Workshop","Mileage","Date","Cost","Status"].map(h=><th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{maintenance.rows.map(m=>(
                <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-[11.5px] font-semibold" style={{color:FLT_BLUE}}>{m.vehicle}</td>
                  <td className="px-4 py-3 font-medium text-[#111827]">{m.type}</td>
                  <td className="px-4 py-3 text-slate-500">{m.workshop}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{m.mileageAtService?.toLocaleString()}km</td>
                  <td className="px-4 py-3 font-mono text-[11.5px] text-slate-400">{m.date}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[#EF4444]">TZS {money(m.cost)}k</td>
                  <td className="px-4 py-3"><VStatusChip s={m.status}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 p-4"><p className="text-[13
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {tab === "analytics" && (() => {
        const perVeh = vehicles.rows.map(v=>{
          const vTrips = trips.rows.filter(t=>t.vehicleId===v.id||t.vehicle===v.reg);
          const km     = vTrips.reduce((s,t)=>s+(t.distance||0),0);
          const cost   = vTrips.reduce((s,t)=>s+(t.cost||0),0);
          const fuel   = vTrips.reduce((s,t)=>s+(t.fuelUsed||0),0);
          return {name:v.reg,km:Math.round(km),cost:Math.round(cost),fuel:Math.round(fuel),
            cpk:km>0?+(cost/km).toFixed(1):0};
        }).filter(v=>v.km>0).sort((a,b)=>b.cost-a.cost).slice(0,6);

        const maintByMonth = maintenance.rows.reduce((acc,rec)=>{
          const mo=(rec.date||"").slice(0,7);
          if(mo) acc[mo]=(acc[mo]||0)+(rec.cost||0);
          return acc;
        },{});
        const maintTrend = Object.entries(maintByMonth)
          .sort((a,b)=>a[0].localeCompare(b[0])).slice(-6)
          .map(([mo,cost])=>({mo:mo.slice(5)+"'"+mo.slice(2,4),cost}));

        const totalCost = fuelCost + maintCost;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Total Fleet Cost",`TZS ${money(Math.round(totalCost/1000))}k`,"#0F172A"],
                ["Fuel Cost",       `TZS ${money(Math.round(fuelCost/1000))}k`, "#EF4444"],
                ["Maintenance",     `TZS ${money(Math.round(maintCost/1000))}k`,"#F59E0B"],
                ["Total KM",        `${money(Math.round(totalKm))} km`,          "#16A34A"],
              ].map(([l,v,col])=>(
                <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                  <p className="text-[18px] font-black" style={{color:col}}>{v}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Operating Cost by Vehicle (TZS)</h3>
                {perVeh.length===0?<p className="text-slate-400 text-center py-6">No trip data yet</p>:(
                  <ResponsiveContainer width="100%" height={155}>
                    <BarChart data={perVeh} layout="vertical" margin={{left:5,right:24,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis type="number" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" tick={{fontSize:10}} axisLine={false} tickLine={false} width={60}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}`,"Cost"]}/>
                      <Bar dataKey="cost" fill="#0F172A" radius={[0,4,4,0]} maxBarSize={16}/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Maintenance Cost Trend</h3>
                {maintTrend.length===0?<p className="text-slate-400 text-center py-6">No records yet</p>:(
                  <ResponsiveContainer width="100%" height={155}>
                    <AreaChart data={maintTrend} margin={{left:0,right:10,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis dataKey="mo" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:9}} axisLine={false} tickLine={false}
                        tickFormatter={v=>v>=1000?`${Math.round(v/1000)}k`:v}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}`,"Maintenance"]}/>
                      <Area type="monotone" dataKey="cost" fill="#FEF3C7" stroke="#EAB308" strokeWidth={2}/>
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            {perVeh.length>0&&(
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-[#0F172A]">
                  <p className="text-[12.5px] font-bold text-white">Efficiency — Cost per KM by Vehicle</p>
                </div>
                <table className="w-full text-[12.5px]">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {["Vehicle","KM Driven","Fuel (L)","Trip Cost","Cost/KM"].map(h=>(
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {perVeh.map((v,i)=>(
                      <tr key={v.name} className={i%2===0?"bg-white":"bg-slate-50/60"}>
                        <td className="px-4 py-2.5 font-bold text-[#111827]">{v.name}</td>
                        <td className="px-4 py-2.5 font-mono">{money(v.km)} km</td>
                        <td className="px-4 py-2.5 font-mono">{money(v.fuel)} L</td>
                        <td className="px-4 py-2.5 font-mono font-bold">TZS {money(v.cost)}</td>
                        <td className="px-4 py-2.5 font-bold font-mono" style={{color:v.cpk>50?"#EF4444":v.cpk>30?"#F59E0B":"#16A34A"}}>
                          {v.cpk} TZS/km
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BANKING & MICROFINANCE INSTITUTION MODULE
// Full-featured money institution management:
// Accounts · Teller · Loans · Deposits · Fixed Deposit · Interest · Reports
// Works for: Commercial Banks, MFIs, SACCOs, Credit Unions, Rural Banks
// ═══════════════════════════════════════════════════════════════════════════
export const BANK_ACCOUNTS_SEED = [
  { id:"ACC-0001", accountNo:"1000000001", name:"Amina Hassan",        type:"Savings",        balance:2450.00,  currency:"TZS", openDate:"2024-01-15", status:"Active",  branch:"Main",    interest:3.5, phone:"0712-345-678" },
  { id:"ACC-0002", accountNo:"1000000002", name:"John Mwangi",         type:"Current",        balance:15800.00, currency:"TZS", openDate:"2024-01-20", status:"Active",  branch:"Main",    interest:0,   phone:"0756-789-012" },
  { id:"ACC-0003", accountNo:"2000000001", name:"Baraka Enterprise Ltd",type:"Business",       balance:87500.00, currency:"TZS", openDate:"2023-11-05", status:"Active",  branch:"CBD",     interest:1.5, phone:"0722-001-002" },
  { id:"ACC-0004", accountNo:"3000000001", name:"Grace Mwenda",        type:"Fixed Deposit",  balance:50000.00, currency:"TZS", openDate:"2024-03-01", status:"Active",  branch:"Main",    interest:9.5, phone:"0769-333-444" },
  { id:"ACC-0005", accountNo:"1000000003", name:"Peter Kamau",         type:"Savings",        balance:320.00,   currency:"TZS", openDate:"2024-05-10", status:"Dormant", branch:"CBD",     interest:3.5, phone:"0622-111-222" },
  { id:"ACC-0006", accountNo:"4000000001", name:"Uzuri Beauty Chain",  type:"Corporate",      balance:234000.00,currency:"TZS", openDate:"2023-08-15", status:"Active",  branch:"Main",    interest:1.0, phone:"0767-331-220" },
];

export const BANK_TRANSACTIONS_SEED = [
  { id:"TXN-0001", accountNo:"1000000001", account:"Amina Hassan",        type:"Deposit",       amount:500.00,  balance:2450.00, date:"2026-07-16 09:14", channel:"Teller",   reference:"DEP-20260716-001", narration:"Cash deposit",           teller:"Alice Njoroge",  status:"Completed" },
  { id:"TXN-0002", accountNo:"1000000002", account:"John Mwangi",         type:"Withdrawal",    amount:2000.00, balance:15800.00,date:"2026-07-16 10:02", channel:"Teller",   reference:"WDR-20260716-001", narration:"Cash withdrawal",         teller:"Bob Ochieng",    status:"Completed" },
  { id:"TXN-0003", accountNo:"2000000001", account:"Baraka Enterprise Ltd",type:"Transfer Out",  amount:5000.00, balance:87500.00,date:"2026-07-16 11:30", channel:"Online",   reference:"TRF-20260716-001", narration:"Payment to supplier",     teller:"System",         status:"Completed" },
  { id:"TXN-0004", accountNo:"3000000001", account:"Grace Mwenda",        type:"Interest",      amount:395.83,  balance:50000.00,date:"2026-07-01 00:00", channel:"System",   reference:"INT-202607-001",   narration:"Monthly interest credit",  teller:"System",         status:"Completed" },
  { id:"TXN-0005", accountNo:"1000000001", account:"Amina Hassan",        type:"Transfer In",   amount:1200.00, balance:1950.00, date:"2026-07-14 15:45", channel:"Mobile",   reference:"TRF-20260714-002", narration:"Received from sister",    teller:"System",         status:"Completed" },
];

export const BANK_LOANS_SEED = [
  { id:"LN-0001", loanNo:"LN20240001", clientId:"ACC-0001", client:"Amina Hassan",         type:"Personal",    principal:5000,  rate:18, months:24, disbursed:"2024-06-01", installment:258.14, balance:3850.00, arrears:0,    nextDue:"2026-08-01", status:"Active",    collateral:"None",         purpose:"Home improvement" },
  { id:"LN-0002", loanNo:"LN20240002", clientId:"ACC-0003", client:"Baraka Enterprise Ltd",type:"Business",    principal:50000, rate:15, months:36, disbursed:"2024-03-15", installment:1733.51,balance:38200.00,arrears:0,    nextDue:"2026-08-15", status:"Active",    collateral:"Land Title",   purpose:"Expand business" },
  { id:"LN-0003", loanNo:"LN20240003", clientId:"ACC-0002", client:"John Mwangi",          type:"Personal",    principal:3000,  rate:20, months:12, disbursed:"2025-01-10", installment:277.68, balance:1200.00, arrears:555.36,nextDue:"2026-06-10", status:"Overdue",   collateral:"Guarantor",    purpose:"Medical expenses" },
  { id:"LN-0004", loanNo:"LN20230001", clientId:"ACC-0006", client:"Uzuri Beauty Chain",   type:"Business",    principal:100000,rate:14, months:60, disbursed:"2023-09-01", installment:2327.43,balance:0,       arrears:0,    nextDue:"N/A",        status:"Closed",    collateral:"Property",     purpose:"Shop renovation" },
  { id:"LN-0005", loanNo:"LN20250001", clientId:"ACC-0005", client:"Peter Kamau",          type:"Emergency",   principal:800,   rate:24, months:6,  disbursed:"2025-10-01", installment:144.87, balance:720.00,  arrears:289.74,nextDue:"2026-05-01", status:"Defaulted", collateral:"None",         purpose:"Emergency" },
];

export const BANK_FIXED_DEPOSITS_SEED = [
  { id:"FD-001", accountNo:"3000000001", client:"Grace Mwenda",        amount:50000, rate:9.5,  months:12, maturity:"2025-03-01", interestEarned:4750, status:"Matured",  autoRenew:true  },
  { id:"FD-002", accountNo:"4000000002", client:"Mohammed Al Qahtani", amount:30000, rate:10.5, months:24, maturity:"2027-01-15", interestEarned:3150, status:"Active",   autoRenew:false },
  { id:"FD-003", accountNo:"4000000003", client:"Fatuma Juma",         amount:15000, rate:8.5,  months:6,  maturity:"2026-09-01", interestEarned:638,  status:"Active",   autoRenew:true  },
];

export const BANK_STANDING_ORDERS_SEED = [
  { id:"SO-001", accountNo:"1000000002", debtor:"John Mwangi",    amount:500,   frequency:"Monthly", nextRun:"2026-08-01", beneficiary:"LUKU Prepaid",  status:"Active" },
  { id:"SO-002", accountNo:"2000000001", debtor:"Baraka Enterprise",amount:2000, frequency:"Monthly", nextRun:"2026-08-05", beneficiary:"NHIF Premium",  status:"Active" },
];

export const ACCOUNT_TYPES = ["Savings","Current","Business","Corporate","Fixed Deposit","Call Deposit","Student","Senior Citizen"];

export const BANK_LOAN_TYPES = ["Personal","Business","Mortgage","Agriculture","Emergency","Education","Asset Finance","Invoice Discounting"];

export const BRANCHES      = ["Main Branch","CBD Branch","Kariakoo Branch","Kinondoni Branch","Online"];
