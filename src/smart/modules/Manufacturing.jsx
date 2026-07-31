import { useMemo, useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardList, Clock, Cog,
  Factory, Plus, ShieldCheck, Star, Wrench, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormField,
  SkeletonRows,
  inputClass,
} from "../components/ui.jsx";
import { WAREHOUSES } from "../data/inventory.jsx";
import {
  MACHINE_STATUS_COLOR,
  MAINTENANCE_TYPES,
  QC_RESULT_COLOR,
  WO_STATUS_COLOR,
  WO_STATUS_NEXT,
  bomComponentCost,
  bomsSeed,
  machinesSeed,
  maintenanceSeed,
  qcInspectionsSeed,
} from "../data/manufacturing.jsx";
import { KpiCard } from "../data/pos.jsx";
import { logAudit } from "../lib/buses.jsx";
import { TODAY, docId, money } from "../lib/format.jsx";
import {
  mapBomRow,
  mapMachineRow,
  mapMaintenanceRow,
  mapQcInspectionRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ MANUFACTURING ══════════════ */
/* ------------------------------- MANUFACTURING --------------------------------- */
export const MFG_TABS = [
  { id: "boms", label: "Bill of Materials", icon: ClipboardList },
  { id: "workorders", label: "Production Planning", icon: Factory },
  { id: "machines", label: "Machines", icon: Cog },
  { id: "quality", label: "Quality Control", icon: ShieldCheck },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
];

export function bomUnitCost(bom, inventoryRows) {
  const materials = bom.components.reduce((s, c) => s + bomComponentCost(c.sku, inventoryRows) * c.qty, 0);
  return materials + bom.laborCost;
}

export function Manufacturing({ inventory, workOrdersHook, expensesHook }) {
  const [tab, setTab] = useState("workorders");
  const { rows: workOrders, setRows: setWorkOrders, loading, error } = workOrdersHook;
  const boms = useCompanyTable("manufacturing_boms", bomsSeed, {
    select: "*,manufacturing_bom_components(*)", order: { col: "product_name", ascending: true }, mapRow: mapBomRow,
  });

  const stats = useMemo(() => {
    const inProgress = workOrders.filter((w) => w.status === "In Progress").length;
    const planned = workOrders.filter((w) => w.status === "Planned").length;
    const completedThisMonth = workOrders.filter((w) => w.status === "Completed").length;
    const wipValue = workOrders
      .filter((w) => w.status !== "Cancelled")
      .reduce((s, w) => {
        const bom = boms.rows.find((b) => b.id === w.bomId);
        return s + (bom ? bomUnitCost(bom, inventory.rows) * w.qty : 0);
      }, 0);
    return { inProgress, planned, completedThisMonth, wipValue };
  }, [workOrders, boms.rows, inventory.rows]);

  const MFG_KPIS = [
    { label: "In Progress", value: String(stats.inProgress), delta: "Work orders", up: true, icon: Factory },
    { label: "Planned", value: String(stats.planned), delta: "Queued", up: false, icon: ClipboardList },
    { label: "Completed", value: String(stats.completedThisMonth), delta: "All time", up: true, icon: CheckCircle2 },
    { label: "WIP Value", value: `TZS ${money(Math.round(stats.wipValue))}k`, delta: "Active orders", up: true, icon: CircleDollarSign },
  ];

  return (
    <div className="space-y-5">
      {IS_CONFIGURED && error && (
        <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 text-[#EF4444] text-[12.5px] rounded-lg px-3.5 py-2.5">
          Couldn't reach Supabase ({error}) — showing last known data.
        </div>
      )}
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Manufacturing</h1>
        <p className="text-[13px] text-slate-500 mt-1">Bills of materials and production work orders</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {MFG_TABS.map((t) => {
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
        {MFG_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {/* Work Order Status Chart */}
      {tab === "workorders" && workOrders.length > 0 && (() => {
        const woStatusData = ["Planned","In Progress","Completed","Cancelled","On Hold"].map((s,i)=>({
          name:s, value:workOrders.filter(w=>w.status===s).length,
          fill:["#F59E0B","#2563EB","#16A34A","#EF4444","#94A3B8"][i],
        })).filter(d=>d.value>0);
        const woByCat = Object.entries(
          workOrders.reduce((m,w)=>{const bom=boms.rows.find(b=>b.id===w.bomId);const cat=bom?.product_name||w.productName||"Unknown";m[cat]=(m[cat]||0)+1;return m;},{})
        ).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value],i)=>({
          name:name.length>14?name.slice(0,12)+"…":name,
          value,
          fill:["#2563EB","#16A34A","#D97706","#7C3AED","#EF4444"][i],
        }));
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Work Order Status</h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={150}>
                  <PieChart><Pie data={woStatusData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                    {woStatusData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                  </Pie><Tooltip formatter={(v,n)=>[v+" orders",n]}/></PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {woStatusData.map(d=>(
                    <div key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                      <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Top Products in Production</h3>
              {woByCat.length===0?<p className="text-slate-400 text-center py-6">No data</p>:(
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={woByCat} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                    <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                    <XAxis type="number" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis dataKey="name" type="category" tick={{fontSize:10}} axisLine={false} tickLine={false} width={80}/>
                    <Tooltip formatter={(v)=>[v+" orders","Work Orders"]}/>
                    <Bar dataKey="value" radius={[0,4,4,0]} maxBarSize={16}>
                      {woByCat.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        );
      })()}

      {tab === "boms" && <BOMs boms={boms} inventory={inventory} />}
      {tab === "workorders" && <WorkOrders workOrders={workOrders} setWorkOrders={setWorkOrders} inventory={inventory} boms={boms} loading={loading} />}
      {tab === "machines" && <Machines />}
      {tab === "quality" && <QualityControl workOrders={workOrders} />}
      {tab === "maintenance" && <Maintenance expensesHook={expensesHook} />}
    </div>
  );
}

export function BOMs({ boms, inventory }) {
  const { rows, setRows, loading } = boms;
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function addBom(form) {
    const draft = {
      id: docId("BOM"),
      product: form.product, outputUnit: form.outputUnit || "unit",
      laborCost: Number(form.laborCost) || 0, components: form.components,
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`BOM created: ${draft.product}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("manufacturing_boms").insert({
          product_name: draft.product, output_unit: draft.outputUnit, labor_cost: draft.laborCost,
        }).single().run();
        if (header?.id) {
          await sb("manufacturing_bom_components").insert(
            draft.components.map((c) => ({ bom_id: header.id, item_sku: c.sku, qty: c.qty }))
          ).run();
          setRows((prev) => prev.map((b) => (b.id === draft.id ? { ...b, dbId: header.id } : b)));
        }
      } catch (_e) { notify("BOM created locally, but saving to the server failed.", "error"); }
    }
  }

  async function deleteBom(id) {
    const b = rows.find((x) => x.id === id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && b?.dbId) {
      try { await sb("manufacturing_boms").eq("id", b.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the BOM on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New BOM
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200/80 h-28 skeleton-shimmer" />)}
        {!loading && rows.map((bom) => (
          <button
            key={bom.id}
            onClick={() => setSelected(bom)}
            className="text-left bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 hover:border-[#16A34A]/50 hover:shadow-md transition-all"
          >
            <p className="text-[11px] font-mono text-slate-400">{bom.id}</p>
            <p className="text-[14px] font-semibold text-[#111827] mt-0.5 mb-3">{bom.product}</p>
            <div className="flex items-center justify-between text-[12px] text-slate-500">
              <span>{bom.components.length} components</span>
              <span className="font-mono font-medium text-[#111827]">TZS {money(bomUnitCost(bom, inventory.rows))}k / {bom.outputUnit}</span>
            </div>
          </button>
        ))}
        {!loading && rows.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={ClipboardList} title="No BOMs yet" hint="Define what goes into a manufactured product so work orders can check material sufficiency and cost it accurately." actionLabel="New BOM" onAction={() => setShowForm(true)} />
          </div>
        )}
      </div>

      {selected && <BOMPanel bom={selected} inventory={inventory} onClose={() => setSelected(null)} onDelete={deleteBom} />}
      {showForm && <BOMFormPanel inventory={inventory} onClose={() => setShowForm(false)} onSubmit={addBom} />}
    </div>
  );
}

export function BOMPanel({ bom, inventory, onClose, onDelete }) {
  const materialsCost = bom.components.reduce((s, c) => s + bomComponentCost(c.sku, inventory.rows) * c.qty, 0);
  const totalCost = materialsCost + bom.laborCost;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[420px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-mono text-slate-400">{bom.id}</p>
              <h2 className="text-[17px] font-semibold text-[#111827] mt-0.5">{bom.product}</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-5 flex-1">
          <p className="text-[11px] text-slate-400 mb-2 uppercase tracking-wide">Components (per {bom.outputUnit})</p>
          <div className="border border-slate-100 rounded-lg overflow-hidden mb-5">
            {bom.components.map((c, i) => {
              const item = inventory.rows.find((it) => it.sku === c.sku);
              return (
                <div key={i} className={`flex items-center justify-between px-3 py-2.5 text-[13px] ${i !== bom.components.length - 1 ? "border-b border-slate-50" : ""}`}>
                  <div className="min-w-0 pr-2">
                    <p className="text-slate-700 truncate">{item?.name || c.sku}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{c.qty} × TZS {money(bomComponentCost(c.sku, inventory.rows))}k</p>
                  </div>
                  <span className="font-mono text-[#111827] shrink-0">{money(c.qty * bomComponentCost(c.sku, inventory.rows))}k</span>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between text-slate-500"><span>Materials</span><span className="font-mono">TZS {money(materialsCost)}k</span></div>
            <div className="flex justify-between text-slate-500"><span>Labor</span><span className="font-mono">TZS {money(bom.laborCost)}k</span></div>
            <div className="flex justify-between text-[#111827] font-semibold text-[14px] pt-1.5 border-t border-slate-100 mt-1.5">
              <span>Cost per {bom.outputUnit}</span><span className="font-mono">TZS {money(totalCost)}k</span>
            </div>
          </div>

          <div className="flex-1" />
        </div>
        <div className="px-6 py-4 border-t border-slate-100">
          <ConfirmDeleteButton label="Delete BOM" onConfirm={() => onDelete(bom.id)} />
        </div>
      </div>
    </div>
  );
}

export function BOMFormPanel({ inventory, onClose, onSubmit }) {
  const [product, setProduct] = useState("");
  const [outputUnit, setOutputUnit] = useState("unit");
  const [laborCost, setLaborCost] = useState("");
  const [components, setComponents] = useState([{ sku: inventory.rows[0]?.sku || "", qty: "" }]);

  function updateComponent(i, key, val) {
    setComponents((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));
  }
  function addComponent() { setComponents((prev) => [...prev, { sku: inventory.rows[0]?.sku || "", qty: "" }]); }
  function removeComponent(i) { setComponents((prev) => prev.filter((_, idx) => idx !== i)); }

  const validComponents = components.filter((c) => c.sku && Number(c.qty) > 0).map((c) => ({ sku: c.sku, qty: Number(c.qty) }));
  const materialsCost = validComponents.reduce((s, c) => s + bomComponentCost(c.sku, inventory.rows) * c.qty, 0);
  const totalCost = materialsCost + (Number(laborCost) || 0);
  const valid = product.trim() && validComponents.length > 0;

  function handleSubmit(e) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ product, outputUnit, laborCost, components: validComponents });
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[440px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Manufacturing</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Bill of Materials</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Product name" required>
            <input className={inputClass} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Cold Chain Storage Unit" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Output unit"><input className={inputClass} value={outputUnit} onChange={(e) => setOutputUnit(e.target.value)} placeholder="unit" /></FormField>
            <FormField label="Labor cost (TZS 000)"><input type="number" min="0" className={inputClass} value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0" /></FormField>
          </div>

          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Components</p>
            <div className="space-y-2.5">
              {components.map((c, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select className={`${inputClass} flex-1`} value={c.sku} onChange={(e) => updateComponent(i, "sku", e.target.value)}>
                    {inventory.rows.map((it) => <option key={it.sku} value={it.sku}>{it.name}</option>)}
                  </select>
                  <input type="number" min="0" className={`${inputClass} w-20`} value={c.qty} onChange={(e) => updateComponent(i, "qty", e.target.value)} placeholder="Qty" />
                  {components.length > 1 && (
                    <button type="button" onClick={() => removeComponent(i)} className="text-slate-300 hover:text-[#EF4444] mt-2.5 shrink-0" aria-label={`Remove component ${i + 1}`}><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addComponent} className="text-[12px] font-medium text-[#16A34A] hover:text-[#15803D] mt-2 flex items-center gap-1"><Plus size={12} /> Add component</button>
          </div>

          {validComponents.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 text-[13px] space-y-1">
              <div className="flex justify-between text-slate-500"><span>Materials</span><span className="font-mono">TZS {money(Math.round(materialsCost))}k</span></div>
              <div className="flex justify-between font-semibold text-[#111827] pt-1 border-t border-slate-200"><span>Cost per {outputUnit || "unit"}</span><span className="font-mono">TZS {money(Math.round(totalCost))}k</span></div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!valid} className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 disabled:opacity-40 disabled:cursor-not-allowed">Create BOM</button>
        </div>
      </form>
    </div>
  );
}

export function WorkOrders({ workOrders, setWorkOrders, inventory, boms, loading }) {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);

  async function addWorkOrder(form) {
    const draft = {
      id: docId("WO"),
      bomId: form.bomId,
      product: boms.rows.find((b) => b.id === form.bomId)?.product || "Custom build",
      qty: Number(form.qty) || 1,
      status: "Planned",
      startDate: form.startDate,
      dueDate: form.dueDate,
      assignedTo: form.assignedTo || "Unassigned",
    };
    setWorkOrders((prev) => [draft, ...prev]);
    notify(`Work order ${draft.id} created`);
    setShowForm(false);

    if (IS_CONFIGURED) {
      try {
        const header = await sb("manufacturing_work_orders").insert({
          bom_id: form.bomId, product: draft.product, qty: draft.qty, status: "Planned",
          start_date: form.startDate, due_date: form.dueDate, assigned_to: form.assignedTo,
        }).single().run();
        if (header?.id) setWorkOrders((prev) => prev.map((w) => (w.id === draft.id ? { ...w, dbId: header.id } : w)));
      } catch (e) {
        notify("Work order created locally, but saving to the server failed.", "error");
      }
    }
  }

  async function advanceOrder(id, next) {
    const order = workOrders.find((w) => w.id === id);
    setWorkOrders((prev) => prev.map((w) => (w.id === id ? { ...w, status: next } : w)));
    setSelected((s) => (s && s.id === id ? { ...s, status: next } : s));

    // Completing a run actually consumes raw materials from Inventory —
    // the same shared table Inventory itself reads, so the deduction is
    // visible there immediately, not just inside Manufacturing.
    if (next === "Completed" && order) {
      const bom = boms.rows.find((b) => b.id === order.bomId);
      if (bom) {
        const shortages = [];
        inventory.setRows((prev) => prev.map((it) => {
          const comp = bom.components.find((c) => c.sku === it.sku);
          if (!comp) return it;
          const consumed = comp.qty * order.qty;
          if (consumed > it.qty) shortages.push(it.name);
          return { ...it, qty: Math.max(0, it.qty - consumed) };
        }));
        if (shortages.length) {
          setNotice(`Completed, but stock went negative-clamped for: ${shortages.join(", ")}. Check Inventory.`);
        } else {
          notify(`${order.id} completed — materials deducted from Inventory`);
        }

        if (IS_CONFIGURED) {
          try {
            for (const c of bom.components) {
              const consumed = c.qty * order.qty;
              const item = inventory.rows.find((it) => it.sku === c.sku);
              const newQty = Math.max(0, (item?.qty || 0) - consumed);
              await sb("inventory_items").eq("sku", c.sku).update({ qty_on_hand: newQty }).run();
              await sb("inventory_stock_movements").insert({
                item_id: c.sku, movement: "Out", qty: consumed, reference: `${order.id} completed`,
              }).run();
            }
          } catch (e) {
            notify("Materials deducted locally, but the server update failed.", "error");
          }
        }
      }
    }

    if (IS_CONFIGURED && order?.dbId) {
      try { await sb("manufacturing_work_orders").eq("id", order.dbId).update({ status: next }).run(); }
      catch (e) { notify("Couldn't save the work order status to the server.", "error"); }
    }
  }

  async function deleteOrder(id) {
    const order = workOrders.find((w) => w.id === id);
    setWorkOrders((prev) => prev.filter((w) => w.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && order?.dbId) {
      try { await sb("manufacturing_work_orders").eq("id", order.dbId).delete().run(); }
      catch (e) { notify("Couldn't delete the work order on the server.", "error"); }
    }
  }


  // ── Production analytics ──────────────────────────────────────────────
  const planned   = workOrders.filter(w => w.status === "Planned").length;
  const inProg    = workOrders.filter(w => w.status === "In Progress").length;
  const completed = workOrders.filter(w => w.status === "Completed").length;
  const cancelled = workOrders.filter(w => w.status === "Cancelled").length;
  const total     = workOrders.length;
  const completionRate = total > 0 ? Math.round(completed / total * 100) : 0;
  const wipValue  = workOrders
    .filter(w => w.status !== "Cancelled")
    .reduce((s,w) => { const b = boms.rows.find(b => b.id === w.bomId); return s + (b ? bomUnitCost(b, inventory.rows) * w.qty : 0); }, 0);

  // Status breakdown for donut chart
  const statusChart = [
    {name:"Planned",     value:planned,   fill:"#3B82F6"},
    {name:"In Progress", value:inProg,    fill:"#F59E0B"},
    {name:"Completed",   value:completed, fill:"#16A34A"},
    {name:"Cancelled",   value:cancelled, fill:"#EF4444"},
  ].filter(d => d.value > 0);

  // Monthly completion trend (last 6 months)
  const woTrend = Array.from({length:6}, (_,i) => {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth()-5+i, 1);
    const key = d.toISOString().slice(0,7);
    const label = d.toLocaleString("default",{month:"short"});
    const monthWOs = workOrders.filter(w => (w.startDate||"").startsWith(key));
    return {
      month: label,
      planned:   monthWOs.filter(w=>w.status==="Planned").length,
      completed: monthWOs.filter(w=>w.status==="Completed").length,
      inProg:    monthWOs.filter(w=>w.status==="In Progress").length,
    };
  });
  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex items-start justify-between gap-3 bg-[#F59E0B]/[0.07] border border-[#F59E0B]/20 text-[#8a670a] text-[12.5px] rounded-lg px-3.5 py-2.5">
          <span className="flex items-start gap-2"><AlertCircle size={14} className="shrink-0 mt-0.5" /> {notice}</span>
          <button onClick={() => setNotice(null)} className="text-[#8a670a]/60 hover:text-[#8a670a] shrink-0" aria-label="Dismiss notice"><X size={14} /></button>
        </div>
      )}
      {/* Production Analytics */}
      {workOrders.length > 0 && (
        <div className="space-y-3">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              ["Total Orders", total,           "#2563EB"],
              ["In Progress",  inProg,          "#F59E0B"],
              ["Completed",    completed,        "#16A34A"],
              ["Completion %", completionRate+"%", completionRate>=80?"#16A34A":completionRate>=50?"#F59E0B":"#EF4444"],
              ["WIP Value",    "TZS "+money(Math.round(wipValue))+"k", "#7C3AED"],
            ].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-3 text-center">
                <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Status PieChart */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-2">Work Order Status</h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={120}>
                  <PieChart>
                    <Pie data={statusChart} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={28}>
                      {statusChart.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v+" orders",n]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {statusChart.map(d=>(
                    <div key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:d.fill}}/>
                        {d.name}
                      </span>
                      <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Monthly trend ComposedChart */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-2">Production Trend (6 months)</h3>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={woTrend} margin={{left:-10,right:4,top:0,bottom:0}}>
                  <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                  <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                  <Tooltip/>
                  <Bar dataKey="planned"   fill="#93C5FD" radius={[2,2,0,0]} maxBarSize={20} name="Planned"/>
                  <Bar dataKey="inProg"    fill="#FCD34D" radius={[2,2,0,0]} maxBarSize={20} name="In Progress"/>
                  <Bar dataKey="completed" fill="#6EE7B7" radius={[2,2,0,0]} maxBarSize={20} name="Completed"/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <Plus size={15} /> New Work Order
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[740px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Work Order</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Assigned</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((w) => (
                <tr
                  key={w.id}
                  onClick={() => setSelected(w)}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[#111827] font-medium">{w.id}</td>
                  <td className="px-4 py-3 text-slate-700">{w.product}</td>
                  <td className="px-4 py-3 text-right font-mono">{w.qty}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono">{w.dueDate}</td>
                  <td className="px-4 py-3 text-slate-500">{w.assignedTo}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{ backgroundColor: `${WO_STATUS_COLOR[w.status]}14`, color: WO_STATUS_COLOR[w.status] }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: WO_STATUS_COLOR[w.status] }} />
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-slate-300 inline" /></td>
                </tr>
              ))}
              {loading && <SkeletonRows cols={7} />}
              {!loading && workOrders.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Factory}
                      title="No work orders yet"
                      hint="Schedule your first production run. Completing it will deduct the BOM's materials from Inventory automatically."
                      actionLabel="New Work Order"
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
        <WorkOrderPanel order={selected} onClose={() => setSelected(null)} onAdvance={advanceOrder} onDelete={deleteOrder} inventory={inventory} boms={boms} />
      )}
      {showForm && <WorkOrderFormPanel boms={boms} inventory={inventory} onClose={() => setShowForm(false)} onSubmit={addWorkOrder} />}
    </div>
  );
}

export function WorkOrderPanel({ order, onClose, onAdvance, onDelete, inventory, boms }) {
  const bom = boms.rows.find((b) => b.id === order.bomId);
  const nextStatus = WO_STATUS_NEXT[order.status];
  const unitCost = bom ? bomUnitCost(bom, inventory.rows) : 0;

  // Live sufficiency check against the shared Inventory table — a component
  // is short if the required qty exceeds what's actually on hand right now.
  const requirements = (bom?.components || []).map((c) => {
    const item = inventory.rows.find((it) => it.sku === c.sku);
    const required = c.qty * order.qty;
    const onHand = item?.qty ?? 0;
    return { sku: c.sku, name: item?.name || c.sku, unit: item?.unit || "", required, onHand, short: required > onHand };
  });
  const hasShortage = requirements.some((r) => r.short);
  const completing = nextStatus === "Completed";

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[420px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] font-mono text-slate-400">{order.id}</p>
              <h2 className="text-[17px] font-semibold text-[#111827] mt-0.5 leading-snug">{order.product}</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close"><X size={18} /></button>
          </div>
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{ backgroundColor: `${WO_STATUS_COLOR[order.status]}14`, color: WO_STATUS_COLOR[order.status] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: WO_STATUS_COLOR[order.status] }} />
            {order.status}
          </span>
        </div>

        <div className="px-6 py-5 flex-1">
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[11px] text-slate-400 mb-1">Quantity</p>
              <p className="text-[15px] font-mono font-semibold text-[#111827]">{order.qty} {bom?.outputUnit || "unit"}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[11px] text-slate-400 mb-1">Est. Cost</p>
              <p className="text-[15px] font-mono font-semibold text-[#111827]">TZS {money(Math.round(unitCost * order.qty))}k</p>
            </div>
          </div>

          <div className="space-y-3 mb-6 text-[13px]">
            <div className="flex items-center gap-2.5 text-slate-600"><ClipboardList size={14} className="text-slate-400" /> {bom?.id} — {bom?.product}</div>
            <div className="flex items-center gap-2.5 text-slate-600"><Star size={14} className="text-slate-400" /> Assigned to {order.assignedTo}</div>
            <div className="flex items-center gap-2.5 text-slate-600"><Clock size={14} className="text-slate-400" /> {order.startDate} → {order.dueDate}</div>
          </div>

          {bom && (
            <div>
              <p className="text-[11px] text-slate-400 mb-2 uppercase tracking-wide">Material requirement (×{order.qty})</p>
              <div className="border border-slate-100 rounded-lg overflow-hidden">
                {requirements.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2.5 text-[13px] ${i !== requirements.length - 1 ? "border-b border-slate-50" : ""}`}>
                    <div className="min-w-0 pr-2">
                      <p className="text-slate-700 truncate">{r.name}</p>
                      <p className={`text-[11px] font-mono ${r.short ? "text-[#EF4444]" : "text-slate-400"}`}>
                        {r.onHand} {r.unit} on hand{r.short ? " — insufficient" : ""}
                      </p>
                    </div>
                    <span className={`font-mono shrink-0 ${r.short ? "text-[#EF4444] font-medium" : "text-[#111827]"}`}>
                      {r.required} {r.unit}
                    </span>
                  </div>
                ))}
              </div>
              {order.status !== "Completed" && hasShortage && (
                <div className="flex items-start gap-2.5 bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-lg p-3 mt-3">
                  <AlertCircle size={15} className="text-[#EF4444] shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-[#EF4444] leading-snug">
                    Inventory can&apos;t fully cover this run. Restock the flagged components or reduce the quantity before completing.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex flex-col gap-2">
          {nextStatus && (
            <button
              onClick={() => onAdvance(order.id, nextStatus)}
              disabled={completing && hasShortage}
              className="text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {completing && hasShortage ? "Insufficient stock to complete" : `Mark ${nextStatus}`}
            </button>
          )}
          <ConfirmDeleteButton label="Delete work order" onConfirm={() => onDelete(order.id)} />
        </div>
      </div>
    </div>
  );
}

export function WorkOrderFormPanel({ boms, inventory, onClose, onSubmit }) {
  const [form, setForm] = useState({ bomId: boms.rows[0]?.id || "", qty: "", startDate: TODAY.toISOString().slice(0, 10), dueDate: "", assignedTo: "" });
  const [touched, setTouched] = useState(false);
  const valid = Number(form.qty) > 0 && form.dueDate;
  const bom = boms.rows.find((b) => b.id === form.bomId);

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
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Manufacturing</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Work Order</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Bill of Materials">
            <select className={inputClass} value={form.bomId} onChange={(e) => set("bomId", e.target.value)}>
              {boms.rows.map((b) => <option key={b.id} value={b.id}>{b.product}</option>)}
            </select>
          </FormField>

          <FormField label={`Quantity (${bom?.outputUnit || "unit"})`} required>
            <input type="number" min="1" className={inputClass} value={form.qty} onChange={(e) => set("qty", e.target.value)} placeholder="0" />
            {touched && !(Number(form.qty) > 0) && <p className="text-[11px] text-[#EF4444] mt-1">Enter a quantity.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start date">
              <input type="date" className={inputClass} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </FormField>
            <FormField label="Due date" required>
              <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
              {touched && !form.dueDate && <p className="text-[11px] text-[#EF4444] mt-1">Due date is required.</p>}
            </FormField>
          </div>

          <FormField label="Assigned to">
            <input className={inputClass} value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} placeholder="e.g. Grace Mmbaga" />
          </FormField>

          {bom && (
            <div className="bg-slate-50 rounded-lg p-3 text-[12.5px] text-slate-500">
              Est. cost: <span className="font-mono text-[#111827] font-medium">TZS {money(Math.round(bomUnitCost(bom, inventory.rows) * (Number(form.qty) || 0)))}k</span> for {form.qty || 0} {bom.outputUnit}(s)
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors">Create Work Order</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ MACHINES ══════════════ */
/* ------------------------------ MACHINES ------------------------------------- */
export function Machines() {
  const machines = useCompanyTable("manufacturing_machines", machinesSeed, { order: { col: "name", ascending: true }, mapRow: mapMachineRow });
  const { rows, setRows, loading } = machines;
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);

  async function addMachine(form) {
    const draft = { id: docId("MC"), name: form.name, type: form.type, warehouse: form.warehouse, status: "Idle", purchaseDate: form.purchaseDate };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Machine added: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("manufacturing_machines").insert({
          name: draft.name, machine_type: draft.type, warehouse_id: draft.warehouse, status: "Idle", purchase_date: draft.purchaseDate,
        }).single().run();
        if (header?.id) setRows((prev) => prev.map((m) => (m.id === draft.id ? { ...m, dbId: header.id } : m)));
      } catch (_e) { notify("Machine added locally, but saving to the server failed.", "error"); }
    }
  }

  async function setStatus(id, status) {
    const m = rows.find((x) => x.id === id);
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
    if (IS_CONFIGURED && m?.dbId) {
      try { await sb("manufacturing_machines").eq("id", m.dbId).update({ status }).run(); } catch (_e) { notify("Couldn't save the machine status to the server.", "error"); }
    }
  }

  async function deleteMachine(id) {
    const m = rows.find((x) => x.id === id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && m?.dbId) {
      try { await sb("manufacturing_machines").eq("id", m.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the machine on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New Machine
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200/80 h-28 skeleton-shimmer" />)}
        {!loading && rows.map((m) => {
          const wh = WAREHOUSES.find((w) => w.id === m.warehouse);
          return (
            <button key={m.id} onClick={() => setSelected(m)} className="text-left bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 hover:border-[#16A34A]/50 hover:shadow-md transition-all">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-lg bg-[#111827]/5 flex items-center justify-center"><Cog size={16} className="text-[#111827]" /></div>
                <div><p className="text-[13.5px] font-semibold text-[#111827]">{m.name}</p><p className="text-[11px] text-slate-400">{m.type} · {wh?.city}</p></div>
              </div>
              <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${MACHINE_STATUS_COLOR[m.status]}14`, color: MACHINE_STATUS_COLOR[m.status] }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MACHINE_STATUS_COLOR[m.status] }} />{m.status}
              </span>
            </button>
          );
        })}
        {!loading && rows.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={Cog} title="No machines registered yet" hint="Track production equipment status and maintenance history here." actionLabel="New Machine" onAction={() => setShowForm(true)} />
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setSelected(null)} />
          <div className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="flex items-start justify-between mb-6">
              <div><h2 className="text-[17px] font-semibold text-[#111827]">{selected.name}</h2><p className="text-[13px] text-slate-500">{selected.type}</p></div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="mb-6">
              <p className="text-[11px] font-medium text-slate-500 mb-2">Status</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.keys(MACHINE_STATUS_COLOR).map((s) => (
                  <button key={s} onClick={() => setStatus(selected.id, s)} className={`text-[11.5px] font-medium rounded-lg py-2 border transition-colors ${selected.status === s ? "border-[#16A34A] bg-[#16A34A]/8 text-[#111827]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-6"><Clock size={14} className="text-slate-400" /> Purchased {selected.purchaseDate}</div>
            <div className="flex-1" />
            <ConfirmDeleteButton label="Remove machine" onConfirm={() => deleteMachine(selected.id)} />
          </div>
        </div>
      )}
      {showForm && <MachineFormPanel onClose={() => setShowForm(false)} onSubmit={addMachine} />}
    </div>
  );
}

export function MachineFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", type: "", warehouse: WAREHOUSES[0].id, purchaseDate: TODAY.toISOString().slice(0, 10) });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.name.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Manufacturing</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Machine</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Machine name" required><input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. CNC Panel Cutter #2" /></FormField>
          <FormField label="Type"><input className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)} placeholder="e.g. Cutting" /></FormField>
          <FormField label="Location">
            <select className={inputClass} value={form.warehouse} onChange={(e) => set("warehouse", e.target.value)}>
              {WAREHOUSES.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </FormField>
          <FormField label="Purchase date"><input type="date" className={inputClass} value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Add Machine</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ QUALITY CONTROL ══════════════ */
/* --------------------------------- QUALITY CONTROL --------------------------------- */
export function QualityControl({ workOrders }) {
  const inspections = useCompanyTable("manufacturing_qc_inspections", qcInspectionsSeed, { order:{ col:"inspection_date", ascending:false }, mapRow:mapQcInspectionRow });
  const { rows, setRows, loading } = inspections;
  const [showForm, setShowForm] = useState(false);

  const passRate   = rows.length ? Math.round(rows.filter(r=>r.result==="Pass").length/rows.length*100) : null;
  const passColor  = passRate===null?"#6B7280":passRate>=90?"#16A34A":passRate>=70?"#F59E0B":"#EF4444";
  const failedWOs  = rows.filter(r=>r.result==="Fail");

  // Trend: last 6 months pass rate
  const trend = useMemo(()=>Array.from({length:6},(_,i)=>{
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth()-5+i, 1);
    const key = d.toISOString().slice(0,7);
    const monthRows = rows.filter(r=>(r.inspection_date||"").startsWith(key));
    const passed = monthRows.filter(r=>r.result==="Pass").length;
    const rate   = monthRows.length>0?Math.round(passed/monthRows.length*100):null;
    return {month:d.toLocaleString("default",{month:"short"}), rate, total:monthRows.length, passed};
  }), [rows]);

  // Defect categories
  const defects = useMemo(()=>{
    const map={};
    rows.filter(r=>r.result==="Fail"&&r.defects).forEach(r=>{
      (r.defects||"").split(",").map(d=>d.trim()).forEach(d=>{ if(d) map[d]=(map[d]||0)+1; });
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value])=>({name,value}));
  }, [rows]);

  async function addInspection(form) {
    const draft = { id:docId("QC"), workOrderId:form.workOrderId, inspector:form.inspector, result:form.result, defects:form.defects||"", notes:form.notes, inspection_date:TODAY.toISOString().slice(0,10) };
    setRows(p=>[draft,...p]);
    setShowForm(false);
    notify("QC "+form.result+" recorded for "+form.workOrderId);
    logAudit("QC Inspection: "+form.result,"Manufacturing","QC",form.workOrderId);
    if (IS_CONFIGURED) { try { await sb("manufacturing_qc_inspections").insert({work_order_id:draft.workOrderId,inspector:draft.inspector,result:draft.result,defects:draft.defects,notes:draft.notes,inspection_date:draft.inspection_date}).run(); } catch(_e){} }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Total Inspections", rows.length,                                "#2563EB"],
          ["Pass Rate",         passRate!==null?passRate+"%":"—",          passColor],
          ["Passed",            rows.filter(r=>r.result==="Pass").length,   "#16A34A"],
          ["Failed",            rows.filter(r=>r.result==="Fail").length,   "#EF4444"],
        ].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[22px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pass rate trend */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Pass Rate Trend (6 months)</h3>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={trend} margin={{left:-10,right:4,top:0,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis domain={[0,100]} tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>v+"%"}/>
              <Tooltip formatter={(v,n)=>[n==="rate"?v+"%":v+" inspections",n==="rate"?"Pass Rate":"Total"]}/>
              <Bar dataKey="total"  fill="#E5E7EB" radius={[3,3,0,0]} name="total" maxBarSize={30}/>
              <Line type="monotone" dataKey="rate" stroke={passColor} strokeWidth={2.5} dot={{r:4,fill:passColor}} connectNulls/>
            </ComposedChart>
          </ResponsiveContainer>
          {passRate!==null && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{width:passRate+"%",background:passColor}}/>
              </div>
              <span className="text-[12px] font-bold shrink-0" style={{color:passColor}}>{passRate}%</span>
              <span className="text-[11px] text-slate-400 shrink-0">{passRate>=90?"Excellent":passRate>=70?"Acceptable":"Needs Attention"}</span>
            </div>
          )}
        </div>

        {/* Defect categories */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Top Defect Categories</h3>
          {defects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[140px] text-slate-300">
              <CheckCircle2 size={32} className="mb-2"/>
              <p className="text-[12.5px]">No defects recorded</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={defects} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={80}/>
                <Tooltip formatter={v=>[v+" occurrences","Defects"]}/>
                <Bar dataKey="value" fill="#EF4444" radius={[0,5,5,0]} maxBarSize={20}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Failed inspections alert */}
      {failedWOs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-red-700 mb-2">⚠ {failedWOs.length} Failed Inspection{failedWOs.length>1?"s":""} — Requires Action</p>
          <div className="flex flex-wrap gap-2">
            {failedWOs.slice(0,5).map(f=>(
              <span key={f.id} className="text-[11.5px] bg-white border border-red-200 text-red-600 px-2.5 py-1 rounded-lg font-medium">
                {f.workOrderId} · {f.inspector}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-end">
        <button onClick={()=>setShowForm(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl bg-[#16A34A]">
          <Plus size={13}/>Log Inspection
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
          <p className="text-[14px] font-semibold text-[#111827]">New QC Inspection</p>
          <QcFormPanel workOrders={workOrders} onClose={()=>setShowForm(false)} onSubmit={addInspection}/>
        </div>
      )}

      {/* Inspections table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[13.5px] font-semibold text-[#111827]">Inspection Log ({rows.length})</p>
        </div>
        {rows.length === 0 ? (
          <p className="text-center text-slate-400 py-10">No inspections recorded yet</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">{["Work Order","Inspector","Date","Result","Defects","Notes"].map(h=>(
              <th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>
            ))}</tr></thead>
            <tbody>{rows.map(r=>{
              const col = r.result==="Pass"?"#16A34A":"#EF4444";
              return (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono font-semibold text-[#111827]">{r.workOrderId}</td>
                  <td className="px-4 py-3 text-slate-500">{r.inspector}</td>
                  <td className="px-4 py-3 font-mono text-[11.5px] text-slate-400">{r.inspection_date}</td>
                  <td className="px-4 py-3"><span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{background:col+"18",color:col}}>{r.result}</span></td>
                  <td className="px-4 py-3 text-slate-400 text-[11.5px] max-w-[140px] truncate">{r.defects||"—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-[11.5px] max-w-[120px] truncate">{r.notes||"—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function QcFormPanel({ workOrders, onClose, onSubmit }) {
  const completedOrders = workOrders.filter((w) => w.status === "Completed");
  const [form, setForm] = useState({ workOrderId: completedOrders[0]?.id || "", inspector: "", result: "Pass", defectsFound: "0", notes: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.workOrderId || !form.inspector.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Quality Control</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Log Inspection</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Work order">
            {completedOrders.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">No completed work orders yet to inspect.</p>
            ) : (
              <select className={inputClass} value={form.workOrderId} onChange={(e) => set("workOrderId", e.target.value)}>
                {completedOrders.map((w) => <option key={w.id} value={w.id}>{w.id} — {w.product}</option>)}
              </select>
            )}
          </FormField>
          <FormField label="Inspector" required><input className={inputClass} value={form.inspector} onChange={(e) => set("inspector", e.target.value)} placeholder="e.g. David Chen" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Result">
              <select className={inputClass} value={form.result} onChange={(e) => set("result", e.target.value)}>
                {Object.keys(QC_RESULT_COLOR).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </FormField>
            <FormField label="Defects found"><input type="number" min="0" className={inputClass} value={form.defectsFound} onChange={(e) => set("defectsFound", e.target.value)} /></FormField>
          </div>
          <FormField label="Notes"><textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Inspection findings..." /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={completedOrders.length === 0} className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 disabled:opacity-40 disabled:cursor-not-allowed">Log Inspection</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ MAINTENANCE ══════════════ */
/* --------------------------------- MAINTENANCE --------------------------------- */
export function Maintenance({ expensesHook }) {
  const records = useCompanyTable("manufacturing_maintenance", maintenanceSeed, { order: { col: "maintenance_date", ascending: false }, mapRow: mapMaintenanceRow });
  const { rows, setRows, loading } = records;
  const [showForm, setShowForm] = useState(false);
  const todayStr = TODAY.toISOString().slice(0, 10);
  const overdue = rows.filter((r) => r.nextDueDate && r.nextDueDate < todayStr);

  async function addRecord(form) {
    const draft = {
      id: docId("MT"), machine: form.machine, type: form.type, technician: form.technician,
      date: TODAY.toISOString().slice(0, 10), cost: Number(form.cost) || 0, notes: form.notes, nextDueDate: form.nextDueDate || null,
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Maintenance logged: ${draft.machine}`);

    // A maintenance record with a real cost is a real expense — the same
    // shared Finance table Payroll and Vendor Payments already write to.
    if (draft.cost > 0) {
      const expenseDraft = {
        id: docId("EX"), vendor: `Maintenance — ${draft.machine}`, category: "Maintenance",
        date: draft.date, dueDate: draft.date, amount: draft.cost, status: "Paid", method: "Cash",
      };
      expensesHook.setRows((prev) => [expenseDraft, ...prev]);
      if (IS_CONFIGURED) {
        try {
          const expHeader = await sb("finance_expenses").insert({
            vendor: expenseDraft.vendor, category: "Maintenance", expense_date: expenseDraft.date,
            due_date: expenseDraft.dueDate, amount: expenseDraft.amount, status: "Paid", method: "Cash",
          }).single().run();
          if (expHeader?.id) expensesHook.setRows((prev) => prev.map((e) => (e.id === expenseDraft.id ? { ...e, dbId: expHeader.id } : e)));
        } catch (_e) { /* the maintenance record itself still saves below; a failed expense sync is reported there */ }
      }
    }

    if (IS_CONFIGURED) {
      try {
        await sb("manufacturing_maintenance").insert({
          machine_name: draft.machine, maintenance_type: draft.type, technician: draft.technician,
          maintenance_date: draft.date, cost: draft.cost, notes: draft.notes, next_due_date: draft.nextDueDate,
        }).run();
      } catch (_e) { notify("Logged locally, but saving to the server failed.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <div className="flex items-start gap-2.5 bg-[#EF4444]/5 border border-[#EF4444]/20 rounded-lg p-3">
          <AlertCircle size={15} className="text-[#EF4444] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#8a1a15] leading-relaxed">
            {overdue.length} machine{overdue.length > 1 ? "s are" : " is"} past due for maintenance: {overdue.map((r) => r.machine).join(", ")}.
          </p>
        </div>
      )}
      {/* Maintenance Analytics */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Monthly cost BarChart */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Monthly Maintenance Cost</h3>
            {(() => {
              const months = Array.from({length:6},(_,i)=>{
                const d = new Date(TODAY.getFullYear(),TODAY.getMonth()-5+i,1);
                const key = d.toISOString().slice(0,7);
                const cost = rows.filter(r=>(r.date||"").startsWith(key)).reduce((s,r)=>s+r.cost,0);
                return {month:d.toLocaleString("default",{month:"short"}), cost:Math.round(cost)};
              });
              const totalCost = rows.reduce((s,r)=>s+r.cost,0);
              return (
                <div>
                  <p className="text-[12px] text-slate-400 mb-2">YTD total: <strong className="text-[#111827]">TZS {money(Math.round(totalCost))}k</strong></p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={months} margin={{left:-10,right:4,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                      <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v)=>["TZS "+money(v)+"k","Cost"]}/>
                      <Bar dataKey="cost" fill="#EF4444" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>

          {/* Upcoming maintenance schedule */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Upcoming Schedule</h3>
            <div className="space-y-2">
              {(() => {
                const upcoming = rows
                  .filter(r => r.nextDueDate)
                  .sort((a,b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))
                  .slice(0,5);
                if (upcoming.length === 0) return <p className="text-slate-400 text-[12.5px] text-center py-4">No upcoming maintenance scheduled</p>;
                return upcoming.map(r => {
                  const due     = new Date(r.nextDueDate);
                  const daysLeft = Math.ceil((due - TODAY) / 86400000);
                  const isOverdue = daysLeft < 0;
                  const isSoon    = daysLeft >= 0 && daysLeft <= 7;
                  const col = isOverdue ? "#EF4444" : isSoon ? "#F59E0B" : "#16A34A";
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl border" style={{borderColor:col+"30",background:col+"05"}}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-[11px] text-center leading-tight" style={{background:col}}>
                        {isOverdue ? "PAST" : daysLeft+"d"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#111827] truncate">{r.machine}</p>
                        <p className="text-[11px] text-slate-400">{r.type} · {r.nextDueDate}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

            <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> Log Maintenance
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Machine</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Technician</th><th className="px-4 py-3 font-medium">Next Due</th><th className="px-4 py-3 font-medium text-right">Cost (TZS 000)</th>
            </tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={5} />}
              {!loading && rows.map((r) => {
                const isOverdue = r.nextDueDate && r.nextDueDate < todayStr;
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-[#111827]">{r.machine}</td>
                    <td className="px-4 py-3 text-slate-500">{r.type}</td>
                    <td className="px-4 py-3 text-slate-500">{r.technician}</td>
                    <td className={`px-4 py-3 font-mono ${isOverdue ? "text-[#EF4444] font-medium" : "text-slate-500"}`}>{r.nextDueDate || "—"}{isOverdue && " (overdue)"}</td>
                    <td className="px-4 py-3 text-right font-mono">{money(r.cost)}</td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={5}><EmptyState icon={Wrench} title="No maintenance logged yet" hint="Track preventive and corrective maintenance per machine here." actionLabel="Log Maintenance" onAction={() => setShowForm(true)} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <MaintenanceFormPanel onClose={() => setShowForm(false)} onSubmit={addRecord} />}
    </div>
  );
}

export function MaintenanceFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ machine: machinesSeed[0]?.name || "", type: MAINTENANCE_TYPES[0], technician: "", cost: "", notes: "", nextDueDate: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.machine.trim() || !form.technician.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Maintenance</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Log Maintenance</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Machine" required><input className={inputClass} value={form.machine} onChange={(e) => set("machine", e.target.value)} placeholder="e.g. Powder Coat Booth" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type">
              <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Technician" required><input className={inputClass} value={form.technician} onChange={(e) => set("technician", e.target.value)} placeholder="e.g. S. Kileo" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Cost (TZS 000)"><input type="number" min="0" className={inputClass} value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" /></FormField>
            <FormField label="Next due date"><input type="date" className={inputClass} value={form.nextDueDate} onChange={(e) => set("nextDueDate", e.target.value)} /></FormField>
          </div>
          <FormField label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FormField>
          <p className="text-[11.5px] text-slate-400">A non-zero cost creates a real "Maintenance" expense in Finance automatically.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Log Maintenance</button>
        </div>
      </form>
    </div>
  );
}
