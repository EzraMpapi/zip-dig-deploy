import { useMemo, useState } from "react";
import {
  CheckCircle2, ChevronRight, ClipboardList, Clock, Plus, Search, Truck, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis,
  YAxis
} from "recharts";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormField,
  SkeletonRows,
  inputClass,
} from "../components/ui.jsx";
import { KpiCard } from "../data/pos.jsx";
import {
  SHIPMENT_STATUS_COLOR,
  SHIPMENT_STATUS_NEXT,
  VEHICLE_STATUS_COLOR,
  shipmentsSeed,
  vehiclesSeed,
} from "../data/scm.jsx";
import { TODAY, docId } from "../lib/format.jsx";
import { mapShipmentRow, mapVehicleRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ SUPPLY CHAIN ══════════════ */
/* ------------------------------- SUPPLY CHAIN ---------------------------------- */
export const SCM_TABS = [
  { id: "shipments", label: "Shipments", icon: Truck },
  { id: "fleet", label: "Fleet", icon: ClipboardList },
];

export function SupplyChain() {
  const [tab, setTab] = useState("shipments");
  const shipments = useCompanyTable("scm_shipments", shipmentsSeed, { order: { col: "dispatch_date", ascending: false }, mapRow: mapShipmentRow });
  const vehicles = useCompanyTable("scm_vehicles", vehiclesSeed, { order: { col: "reg", ascending: true }, mapRow: mapVehicleRow });

  const stats = useMemo(() => {
    const active = shipments.rows.filter((s) => s.status !== "Delivered").length;
    const inTransit = shipments.rows.filter((s) => s.status === "In Transit").length;
    const delivered = shipments.rows.filter((s) => s.status === "Delivered").length;
    const availableVehicles = vehicles.rows.filter((v) => v.status === "Available").length;
    return { active, inTransit, delivered, availableVehicles, fleetSize: vehicles.rows.length };
  }, [shipments.rows, vehicles.rows]);

  const SCM_KPIS = [
    { label: "Active Shipments", value: String(stats.active), delta: "Not yet delivered", up: true, icon: Truck },
    { label: "In Transit", value: String(stats.inTransit), delta: "On the road", up: true, icon: Clock },
    { label: "Delivered", value: String(stats.delivered), delta: "All time", up: true, icon: CheckCircle2 },
    { label: "Fleet Available", value: `${stats.availableVehicles}/${stats.fleetSize}`, delta: "Vehicles ready", up: stats.availableVehicles > 0, icon: ClipboardList },
  ];

  // The cross-entity consequence: dispatching a shipment puts its assigned
  // vehicle On Route; delivering it frees the vehicle again.
  async function setVehicleStatus(reg, status) {
    if (!reg) return;
    vehicles.setRows((prev) => prev.map((v) => (v.reg === reg ? { ...v, status } : v)));
    if (IS_CONFIGURED) {
      try { await sb("scm_vehicles").eq("reg", reg).update({ status }).run(); } catch (_e) { notify("Vehicle status saved locally, but the server update failed.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      {IS_CONFIGURED && (shipments.error || vehicles.error) && (
        <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 text-[#EF4444] text-[12.5px] rounded-lg px-3.5 py-2.5">
          Couldn't reach Supabase ({shipments.error || vehicles.error}) — showing last known data.
        </div>
      )}
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Supply Chain</h1>
        <p className="text-[13px] text-slate-500 mt-1">Deliveries and the fleet that carries them</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {SCM_TABS.map((t) => {
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {SCM_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {/* Delivery analytics */}
      {shipments.rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Delivery status PieChart */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Shipment Status</h3>
            {(() => {
              const STATUS_CFG = {Delivered:"#16A34A","In Transit":"#F59E0B",Dispatched:"#3B82F6",Pending:"#94A3B8"};
              const sdata = Object.entries(
                shipments.rows.reduce((m,s)=>({...m,[s.status]:(m[s.status]||0)+1}),{})
              ).map(([name,value])=>({name,value,fill:STATUS_CFG[name]||"#6B7280"}));
              const onTime   = shipments.rows.filter(s=>s.status==="Delivered").length;
              const onTimeRate = shipments.rows.length > 0 ? Math.round(onTime/shipments.rows.length*100) : 0;
              return (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={130}>
                    <PieChart>
                      <Pie data={sdata} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={32}>
                        {sdata.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie>
                      <Tooltip formatter={(v,n)=>[v+" shipments",n]}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {sdata.map(d=>(
                      <div key={d.name} className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>
                          {d.name}
                        </span>
                        <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[11.5px] text-slate-500">Delivery rate: <strong style={{color:"#16A34A"}}>{onTimeRate}%</strong></p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Weekly shipment BarChart */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Shipments — Last 6 Months</h3>
            {(() => {
              const months = Array.from({length:6},(_,i)=>{
                const d = new Date(TODAY.getFullYear(),TODAY.getMonth()-5+i,1);
                const key = d.toISOString().slice(0,7);
                const ms = shipments.rows.filter(s=>(s.dispatchDate||"").startsWith(key));
                return {
                  month:d.toLocaleString("default",{month:"short"}),
                  delivered:ms.filter(s=>s.status==="Delivered").length,
                  inTransit:ms.filter(s=>s.status!=="Delivered").length,
                };
              });
              return (
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={months} margin={{left:-10,right:4,top:0,bottom:0}}>
                    <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                    <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip/>
                    <Bar dataKey="delivered"  stackId="a" fill="#16A34A" radius={[0,0,0,0]} name="Delivered"/>
                    <Bar dataKey="inTransit"  stackId="a" fill="#F59E0B" radius={[3,3,0,0]} name="In Transit"/>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>
      )}

      {tab === "shipments" && <Shipments shipments={shipments} vehicles={vehicles} onVehicleStatus={setVehicleStatus} />}
      {tab === "fleet" && <Fleet vehicles={vehicles} />}
    </div>
  );
}

export function Shipments({ shipments, vehicles, onVehicleStatus }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const { rows, setRows, loading } = shipments;

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((s) => s.customer.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.destination.toLowerCase().includes(q));
  }, [rows, query]);

  async function addShipment(form) {
    const draft = {
      id: docId("DL"),
      orderRef: form.orderRef || "—",
      customer: form.customer,
      destination: form.destination,
      vehicle: form.vehicle || null,
      dispatchDate: form.dispatchDate,
      expectedDate: form.expectedDate,
      status: "Preparing",
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Shipment ${draft.id} created for ${draft.customer}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("scm_shipments").insert({
          order_ref: draft.orderRef, customer: draft.customer, destination: draft.destination,
          vehicle_reg: draft.vehicle, dispatch_date: draft.dispatchDate, expected_date: draft.expectedDate, status: "Preparing",
        }).single().run();
        if (header?.id) setRows((prev) => prev.map((s) => (s.id === draft.id ? { ...s, dbId: header.id } : s)));
      } catch (_e) { notify("Shipment created locally, but saving to the server failed.", "error"); }
    }
  }

  async function advanceShipment(id, next) {
    const shp = rows.find((s) => s.id === id);
    setRows((prev) => prev.map((s) => (s.id === id ? { ...s, status: next } : s)));
    setSelected((s) => (s && s.id === id ? { ...s, status: next } : s));

    if (shp?.vehicle) {
      if (next === "Dispatched") onVehicleStatus(shp.vehicle, "On Route");
      if (next === "Delivered") onVehicleStatus(shp.vehicle, "Available");
    }
    if (next === "Delivered") notify(id + " delivered" + (shp?.vehicle ? " — " + shp.vehicle + " is available again" : ""));

    if (IS_CONFIGURED && shp?.dbId) {
      try { await sb("scm_shipments").eq("id", shp.dbId).update({ status: next }).run(); } catch (_e) { notify("Couldn't save the shipment status to the server.", "error"); }
    }
  }

  async function deleteShipment(id) {
    const shp = rows.find((s) => s.id === id);
    setRows((prev) => prev.filter((s) => s.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && shp?.dbId) {
      try { await sb("scm_shipments").eq("id", shp.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the shipment on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shipments, customers, destinations..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
          />
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm shrink-0"
        >
          <Plus size={15} /> New Shipment
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Shipment</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Destination</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Expected</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={7} />}
              {!loading && filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-mono font-medium text-[#111827]">{s.id}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{s.orderRef}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.customer}</td>
                  <td className="px-4 py-3 text-slate-500">{s.destination}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{s.vehicle || "—"}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{s.expectedDate}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{ backgroundColor: `${SHIPMENT_STATUS_COLOR[s.status]}14`, color: SHIPMENT_STATUS_COLOR[s.status] }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SHIPMENT_STATUS_COLOR[s.status] }} />
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-slate-300 inline" /></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && rows.length > 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-[13px]">No shipments match "{query}"</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Truck}
                      title="No shipments yet"
                      hint="Create a delivery for a fulfilled order. Dispatching it will put the assigned vehicle On Route automatically."
                      actionLabel="New Shipment"
                      onAction={() => setShowForm(true)}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <ShipmentPanel shipment={selected} onClose={() => setSelected(null)} onAdvance={advanceShipment} onDelete={deleteShipment} />
      )}
      {showForm && <ShipmentFormPanel vehicles={vehicles.rows} onClose={() => setShowForm(false)} onSubmit={addShipment} />}
    </div>
  );
}

export function ShipmentPanel({ shipment, onClose, onAdvance, onDelete }) {
  const nextStatus = SHIPMENT_STATUS_NEXT[shipment.status];
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-mono text-slate-400">{shipment.id} · {shipment.orderRef}</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">{shipment.customer}</h2>
            <p className="text-[13px] text-slate-500">{shipment.destination}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mb-6">
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{ backgroundColor: `${SHIPMENT_STATUS_COLOR[shipment.status]}14`, color: SHIPMENT_STATUS_COLOR[shipment.status] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SHIPMENT_STATUS_COLOR[shipment.status] }} />
            {shipment.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Dispatch</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">{shipment.dispatchDate}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Expected</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">{shipment.expectedDate}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-6">
          <Truck size={14} className="text-slate-400" /> {shipment.vehicle ? `Assigned to ${shipment.vehicle}` : "No vehicle assigned yet"}
        </div>

        <div className="flex-1" />

        <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
          {nextStatus && (
            <button
              onClick={() => onAdvance(shipment.id, nextStatus)}
              className="btn-primary text-white text-[12px] font-medium rounded-lg py-2.5"
            >
              Mark {nextStatus}
            </button>
          )}
          <ConfirmDeleteButton label="Delete shipment" onConfirm={() => onDelete(shipment.id)} />
        </div>
      </div>
    </div>
  );
}

export function ShipmentFormPanel({ vehicles, onClose, onSubmit }) {
  const [form, setForm] = useState({
    customer: "", orderRef: "", destination: "", vehicle: "",
    dispatchDate: TODAY.toISOString().slice(0, 10), expectedDate: "",
  });
  const [touched, setTouched] = useState(false);
  const valid = form.customer.trim() && form.destination.trim() && form.expectedDate;
  const available = vehicles.filter((v) => v.status === "Available");

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[420px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Supply Chain</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Shipment</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Customer" required>
            <input className={inputClass} value={form.customer} onChange={(e) => set("customer", e.target.value)} placeholder="e.g. Meridian Logistics" />
            {touched && !form.customer.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Customer is required.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Order reference">
              <input className={inputClass} value={form.orderRef} onChange={(e) => set("orderRef", e.target.value)} placeholder="e.g. SO-2117" />
            </FormField>
            <FormField label="Vehicle">
              <select className={inputClass} value={form.vehicle} onChange={(e) => set("vehicle", e.target.value)}>
                <option value="">Assign later</option>
                {available.map((v) => <option key={v.reg} value={v.reg}>{v.reg} — {v.type}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Destination" required>
            <input className={inputClass} value={form.destination} onChange={(e) => set("destination", e.target.value)} placeholder="e.g. Dar es Salaam — Kurasini" />
            {touched && !form.destination.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Destination is required.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Dispatch date">
              <input type="date" className={inputClass} value={form.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)} />
            </FormField>
            <FormField label="Expected delivery" required>
              <input type="date" className={inputClass} value={form.expectedDate} onChange={(e) => set("expectedDate", e.target.value)} />
              {touched && !form.expectedDate && <p className="text-[11px] text-[#EF4444] mt-1">Expected date is required.</p>}
            </FormField>
          </div>

          <p className="text-[11.5px] text-slate-400">
            Only vehicles currently marked <span className="font-medium text-slate-500">Available</span> can be assigned. Dispatching moves the vehicle On Route.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" className="flex-1 btn-primary text-white text-[12px] font-medium rounded-lg py-2.5">Create Shipment</button>
        </div>
      </form>
    </div>
  );
}

export function Fleet({ vehicles }) {
  const { rows, setRows, loading } = vehicles;

  async function setStatus(reg, status) {
    setRows((prev) => prev.map((v) => (v.reg === reg ? { ...v, status } : v)));
    if (IS_CONFIGURED) {
      try { await sb("scm_vehicles").eq("reg", reg).update({ status }).run(); } catch (_e) { notify("Vehicle status saved locally, but the server update failed.", "error"); }
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[680px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Vehicle</th>
              <th className="px-4 py-3 font-medium">Driver</th>
              <th className="px-4 py-3 font-medium">Capacity</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows cols={5} />}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState icon={Truck} title="No vehicles registered" hint="Your delivery fleet will appear here once vehicles are added." />
                </td>
              </tr>
            )}
            {!loading && rows.map((v) => (
              <tr key={v.reg} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-mono font-medium text-[#111827]">{v.reg}</p>
                  <p className="text-[11px] text-slate-400">{v.type}</p>
                </td>
                <td className="px-4 py-3 text-slate-500">{v.driver}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{v.capacity}</td>
                <td className="px-4 py-3">
                  <span
                    className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                    style={{ backgroundColor: `${VEHICLE_STATUS_COLOR[v.status]}14`, color: VEHICLE_STATUS_COLOR[v.status] }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: VEHICLE_STATUS_COLOR[v.status] }} />
                    {v.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1.5 justify-end">
                    {v.status !== "Available" && (
                      <button onClick={() => setStatus(v.reg, "Available")} className="text-[11.5px] font-medium border border-slate-200 rounded-md px-2.5 py-1 hover:bg-slate-50 text-slate-600">
                        Set Available
                      </button>
                    )}
                    {v.status !== "Maintenance" && (
                      <button onClick={() => setStatus(v.reg, "Maintenance")} className="text-[11.5px] font-medium border border-[#F59E0B]/30 text-[#8a670a] rounded-md px-2.5 py-1 hover:bg-[#F59E0B]/5">
                        Maintenance
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
