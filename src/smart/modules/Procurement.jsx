import { useMemo, useState } from "react";
import {
  AlertCircle, Banknote, Building2, CheckCircle2, ChevronRight, CircleDollarSign,
  ClipboardCheck, Clock, FileText, Lock, Plus, Settings, Users, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis,
  YAxis
} from "recharts";
import { EmptyState, FormField, SkeletonRows, inputClass } from "../components/ui.jsx";
import { SUPPLIER_STATUS_COLOR } from "../data/inventory.jsx";
import { KpiCard } from "../data/pos.jsx";
import {
  CONTRACT_STATUS_COLOR,
  CONTRACT_TYPES,
  PO_APPROVAL_THRESHOLD,
  PO_STATUS_COLOR,
  contractStatus,
  poTotal,
  procurementContractsSeed,
  purchaseOrdersSeed,
} from "../data/procurement.jsx";
import { TODAY, docId, money } from "../lib/format.jsx";
import {
  mapProcurementContractRow,
  mapPurchaseOrderRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { signWithBiometric } from "../modules/HR.jsx";

/* ══════════════ PROCUREMENT ══════════════ */
/* -------------------------------- PROCUREMENT ------------------------------------ */
export const PROC_TABS = [
  { id: "orders", label: "Purchase Orders", icon: ClipboardCheck },
  { id: "approvals", label: "Approvals", icon: CheckCircle2 },
  { id: "contracts", label: "Contracts", icon: FileText },
  { id: "payments", label: "Vendor Payments", icon: Banknote },
  { id: "portal", label: "Supplier Portal", icon: Building2 },
];

export function Procurement({ inventory, suppliersHook, expensesHook, currentUser, canManage }) {
  const [tab, setTab] = useState("orders");
  const orders = useCompanyTable("procurement_purchase_orders", purchaseOrdersSeed, {
    select: "*,purchase_order_items(*)", order: { col: "order_date", ascending: false }, mapRow: mapPurchaseOrderRow,
  });
  const contracts = useCompanyTable("procurement_contracts", procurementContractsSeed, {
    order: { col: "start_date", ascending: false }, mapRow: mapProcurementContractRow,
  });

  const pendingApproval = orders.rows.filter((o) => o.status === "Pending Approval");
  const readyToPay = orders.rows.filter((o) => o.status === "Received");
  const totalCommitted = orders.rows.filter((o) => !["Draft", "Cancelled"].includes(o.status)).reduce((s, o) => s + poTotal(o.items), 0);

  const PROC_KPIS = [
    { label: "Open Purchase Orders", value: String(orders.rows.filter((o) => !["Paid", "Cancelled"].includes(o.status)).length), delta: `${orders.rows.length} total`, up: true, icon: ClipboardCheck },
    { label: "Pending Approval", value: String(pendingApproval.length), delta: "Needs sign-off", up: false, icon: AlertCircle },
    { label: "Committed Spend", value: `TZS ${money(Math.round(totalCommitted))}k`, delta: "Active POs", up: true, icon: CircleDollarSign },
    { label: "Awaiting Payment", value: String(readyToPay.length), delta: "Received, unpaid", up: false, icon: Banknote },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Procurement</h1>
        <p className="text-[13px] text-slate-500 mt-1">Purchase orders, approvals, contracts, and vendor payments</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {PROC_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const badge = t.id === "approvals" && pendingApproval.length > 0 ? pendingApproval.length : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isActive ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={13} /> {t.label}
              {badge && <span className="text-[10px] font-semibold bg-[#F59E0B] text-white rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {PROC_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {tab === "orders" && <PurchaseOrders orders={orders} inventory={inventory} suppliersHook={suppliersHook} />}
      {tab === "approvals" && <Approvals orders={orders} canManage={canManage} currentUser={currentUser} />}
      {tab === "contracts" && <ProcurementContracts contracts={contracts} suppliersHook={suppliersHook} />}
      {tab === "payments" && <VendorPayments orders={orders} expensesHook={expensesHook} />}
      {tab === "portal" && <SupplierPortal suppliersHook={suppliersHook} orders={orders} />}
    </div>
  );
}

/* ══════════════ PURCHASE ORDERS ══════════════ */
/* ------------------------------- PURCHASE ORDERS --------------------------------- */
export function PurchaseOrders({ orders, inventory, suppliersHook }) {
  const { rows, setRows, loading } = orders;
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function addOrder(form) {
    const items = form.items.filter((it) => it.sku && it.qty > 0);
    const total = poTotal(items);
    const status = total >= PO_APPROVAL_THRESHOLD ? "Pending Approval" : "Approved";
    const draft = {
      id: docId("PO"), supplier: form.supplier, status,
      orderDate: TODAY.toISOString().slice(0, 10), expectedDate: form.expectedDate || null,
      requestedBy: form.requestedBy || "You", items,
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(status === "Pending Approval"
      ? `${draft.id} created — TZS ${money(total)}k needs approval before it can proceed`
      : `${draft.id} created and auto-approved (under TZS ${money(PO_APPROVAL_THRESHOLD)}k)`);

    if (IS_CONFIGURED) {
      try {
        const header = await sb("procurement_purchase_orders").insert({
          doc_number: draft.id, supplier: draft.supplier, status, order_date: draft.orderDate,
          expected_date: draft.expectedDate, requested_by: draft.requestedBy,
        }).single().run();
        if (header?.id) {
          await sb("purchase_order_items").insert(
            items.map((it) => ({ purchase_order_id: header.id, item_sku: it.sku, item_name: it.name, qty: it.qty, cost: it.cost }))
          ).run();
          setRows((prev) => prev.map((o) => (o.id === draft.id ? { ...o, dbId: header.id } : o)));
        }
      } catch (_e) { notify("PO created locally, but saving to the server failed.", "error"); }
    }
  }

  async function receiveOrder(order) {
    // Receiving a PO is a real inventory event — the same shared table
    // Sales fulfillment and Manufacturing already write to, just adding
    // stock instead of consuming it.
    inventory.setRows((prev) => prev.map((it) => {
      const line = order.items.find((oi) => oi.sku === it.sku);
      return line ? { ...it, qty: it.qty + line.qty } : it;
    }));
    setRows((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: "Received" } : o)));
    setSelected((s) => (s && s.id === order.id ? { ...s, status: "Received" } : s));
    notify(`${order.id} received — stock updated`);

    if (IS_CONFIGURED) {
      try {
        await sb("procurement_purchase_orders").eq("id", order.dbId ?? order.id).update({ status: "Received" }).run();
        for (const it of order.items) {
          const item = inventory.rows.find((i) => i.sku === it.sku);
          const newQty = (item?.qty || 0) + it.qty;
          await sb("inventory_items").eq("sku", it.sku).update({ qty_on_hand: newQty }).run();
          await sb("inventory_stock_movements").insert({ item_id: it.sku, movement: "In", qty: it.qty, reference: `${order.id} received` }).run();
        }
      } catch (_e) { notify("Received locally, but the server update failed.", "error"); }
    }
  }

  async function cancelOrder(id) {
    const o = rows.find((x) => x.id === id);
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status: "Cancelled" } : x)));
    setSelected(null);
    if (IS_CONFIGURED && o?.dbId) {
      try { await sb("procurement_purchase_orders").eq("id", o.dbId).update({ status: "Cancelled" }).run(); } catch (_e) { notify("Couldn't save the cancellation to the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">

      {/* Procurement Analytics */}
      {rows.length > 0 && (() => {
        const total = rows.reduce((s,o)=>s+(o.items||[]).reduce((si,i)=>si+i.qty*i.cost,0),0);
        const byStatus = ["Pending Approval","Approved","Ordered","Partially Received","Fully Received","Cancelled"].map((s,i)=>({
          name: s.replace(" Approval","").replace("Partially","Part.").replace("Fully",""),
          value: rows.filter(r=>r.status===s).length,
          fill: ["#F59E0B","#2563EB","#7C3AED","#0891B2","#16A34A","#EF4444"][i],
        })).filter(d=>d.value>0);
        const bySupplier = Object.entries(
          rows.reduce((m,o)=>{
            const val=(o.items||[]).reduce((s,i)=>s+i.qty*i.cost,0);
            m[o.supplier]=(m[o.supplier]||0)+val; return m;
          },{})
        ).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>({
          name: name.length > 16 ? name.slice(0,14)+"…" : name,
          value: Math.round(value/1000),
        }));
        return (
          <div className="space-y-4">
            {/* KPI strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Total POs",String(rows.length),"#111827"],
                ["Total Spend",`TZS ${money(Math.round(total/1000))}k`,"#7C3AED"],
                ["Pending Approval",String(rows.filter(r=>r.status==="Pending Approval").length),"#F59E0B"],
                ["Received",String(rows.filter(r=>r.status==="Fully Received").length),"#16A34A"],
              ].map(([l,v,col])=>(
                <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                  <p className="text-[18px] font-black" style={{color:col}}>{v}</p>
                </div>
              ))}
            </div>
            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">PO Status Distribution</h3>
                {byStatus.length===0?<p className="text-slate-400 text-center py-6">No data</p>:(
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={140}>
                      <PieChart><Pie data={byStatus} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                        {byStatus.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" orders",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {byStatus.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[11.5px]"><span className="w-2 h-2 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[12.5px] font-black" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Top Suppliers by Spend (TZS k)</h3>
                {bySupplier.length===0?<p className="text-slate-400 text-center py-6">No orders yet</p>:(
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={bySupplier} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis type="number" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" tick={{fontSize:10}} axisLine={false} tickLine={false} width={80}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Spend"]}/>
                      <Bar dataKey="value" fill="#7C3AED" radius={[0,4,4,0]} maxBarSize={16}/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New Purchase Order
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">PO</th><th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Expected</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Value (TZS 000)</th><th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={6} />}
              {!loading && rows.map((o) => (
                <tr key={o.id} onClick={() => setSelected(o)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-[#111827]">{o.id}</td>
                  <td className="px-4 py-3 text-slate-700">{o.supplier}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono">{o.expectedDate || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${PO_STATUS_COLOR[o.status]}14`, color: PO_STATUS_COLOR[o.status] }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PO_STATUS_COLOR[o.status] }} />{o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{money(Math.round(poTotal(o.items)))}</td>
                  <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-slate-300 inline" /></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={6}><EmptyState icon={ClipboardCheck} title="No purchase orders yet" hint="Create a PO to order stock from a supplier." actionLabel="New Purchase Order" onAction={() => setShowForm(true)} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <PurchaseOrderPanel
          order={selected}
          onClose={() => setSelected(null)}
          onReceive={() => receiveOrder(selected)}
          onCancel={() => cancelOrder(selected.id)}
        />
      )}
      {showForm && <PurchaseOrderFormPanel inventory={inventory} suppliersHook={suppliersHook} onClose={() => setShowForm(false)} onSubmit={addOrder} />}
    </div>
  );
}

export function PurchaseOrderPanel({ order, onClose, onReceive, onCancel }) {
  const total = poTotal(order.items);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[420px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-start justify-between mb-4">
            <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Purchase Order</p><h2 className="text-[19px] font-semibold text-[#111827] font-mono mt-0.5">{order.id}</h2></div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
          </div>
          <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${PO_STATUS_COLOR[order.status]}14`, color: PO_STATUS_COLOR[order.status] }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PO_STATUS_COLOR[order.status] }} />{order.status}
          </span>
        </div>
        <div className="px-6 py-5 flex-1">
          <div className="mb-5"><p className="text-[11px] text-slate-400 mb-1">Supplier</p><p className="text-[14px] font-medium text-[#111827]">{order.supplier}</p></div>
          <div className="mb-5">
            <p className="text-[11px] text-slate-400 mb-2 uppercase tracking-wide">Items</p>
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              {order.items.map((it, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2.5 text-[13px] ${i !== order.items.length - 1 ? "border-b border-slate-50" : ""}`}>
                  <div><p className="text-slate-700">{it.name}</p><p className="text-[11px] text-slate-400 font-mono">{it.qty} × {money(it.cost)}k</p></div>
                  <span className="font-mono text-[#111827]">{money(Math.round(it.qty * it.cost))}k</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between text-[14px] font-semibold text-[#111827] pt-2 border-t border-slate-100">
            <span>Total</span><span className="font-mono">TZS {money(Math.round(total))}k</span>
          </div>
          <div className="mt-5 space-y-2 text-[13px] text-slate-600">
            <div className="flex items-center gap-2.5"><Clock size={14} className="text-slate-400" /> Ordered {order.orderDate}</div>
            <div className="flex items-center gap-2.5"><Users size={14} className="text-slate-400" /> Requested by {order.requestedBy}</div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col gap-2">
          {order.status === "Approved" && (
            <button onClick={onReceive} className="btn-primary text-white text-[13px] font-semibold rounded-lg py-2.5">Mark Received</button>
          )}
          {!["Received", "Paid", "Cancelled"].includes(order.status) && (
            <button onClick={onCancel} className="text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2 hover:bg-[#EF4444]/5">Cancel Order</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PurchaseOrderFormPanel({ inventory, suppliersHook, onClose, onSubmit }) {
  const suppliers = suppliersHook.rows.filter((s) => s.status === "Active");
  const [supplier, setSupplier] = useState(suppliers[0]?.name || "");
  const [expectedDate, setExpectedDate] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [items, setItems] = useState([{ sku: inventory.rows[0]?.sku || "", qty: "", cost: "" }]);

  function updateItem(i, key, val) {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, [key]: val };
      if (key === "sku") {
        const invItem = inventory.rows.find((x) => x.sku === val);
        if (invItem) next.cost = invItem.unitCost;
      }
      return next;
    }));
  }
  function addRow() { setItems((prev) => [...prev, { sku: inventory.rows[0]?.sku || "", qty: "", cost: "" }]); }
  function removeRow(i) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }

  const validItems = items.filter((it) => it.sku && Number(it.qty) > 0);
  const total = validItems.reduce((s, it) => s + Number(it.qty) * Number(it.cost || 0), 0);
  const valid = supplier && validItems.length > 0;

  function handleSubmit(e) {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      supplier, expectedDate, requestedBy,
      items: validItems.map((it) => ({ sku: it.sku, name: inventory.rows.find((x) => x.sku === it.sku)?.name || it.sku, qty: Number(it.qty), cost: Number(it.cost) || 0 })),
    });
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[440px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Procurement</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Purchase Order</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Supplier" required>
            <select className={inputClass} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              {suppliers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </FormField>

          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Items</p>
            <div className="space-y-2.5">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select className={`${inputClass} flex-1`} value={it.sku} onChange={(e) => updateItem(i, "sku", e.target.value)}>
                    {inventory.rows.map((inv) => <option key={inv.sku} value={inv.sku}>{inv.name}</option>)}
                  </select>
                  <input type="number" min="0" className={`${inputClass} w-16`} value={it.qty} onChange={(e) => updateItem(i, "qty", e.target.value)} placeholder="Qty" />
                  <input type="number" min="0" className={`${inputClass} w-20`} value={it.cost} onChange={(e) => updateItem(i, "cost", e.target.value)} placeholder="Cost" />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="text-slate-300 hover:text-[#EF4444] mt-2.5 shrink-0" aria-label={`Remove line item ${i + 1}`}><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addRow} className="text-[12px] font-medium text-[#16A34A] hover:text-[#15803D] mt-2 flex items-center gap-1"><Plus size={12} /> Add item</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Expected delivery"><input type="date" className={inputClass} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></FormField>
            <FormField label="Requested by"><input className={inputClass} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Your name" /></FormField>
          </div>

          {total > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 text-[13px]">
              <div className="flex justify-between font-semibold text-[#111827]"><span>Total</span><span className="font-mono">TZS {money(Math.round(total))}k</span></div>
              {total >= PO_APPROVAL_THRESHOLD && (
                <p className="text-[11px] text-[#F59E0B] mt-1.5">Above TZS {money(PO_APPROVAL_THRESHOLD)}k — this PO will require Owner/Admin approval before it can be received.</p>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!valid} className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 disabled:opacity-40 disabled:cursor-not-allowed">Create PO</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ APPROVALS ══════════════ */
/* ---------------------------------- APPROVALS ------------------------------------- */
export function Approvals({ orders, canManage, currentUser }) {
  const { rows, setRows } = orders;
  const pending = rows.filter((o) => o.status === "Pending Approval");

  async function decide(order, approve) {
    if (!canManage) {
      notify(`Approving purchase orders requires a full-write role — you're viewing as ${currentUser.role} (read-only).`, "error");
      return;
    }
    const next = approve ? "Approved" : "Cancelled";
    // Approvals carry a real digital signature: a WebAuthn assertion —
    // the device's own key cryptographically signing a fresh challenge,
    // unlocked by the approver's real fingerprint or Face ID. Cancelling
    // the prompt is declining to sign, so the approval aborts; a device
    // with no sensor proceeds honestly recorded as "unsigned".
    let method = "unsigned";
    if (approve) {
      method = await signWithBiometric(currentUser.name);
      if (method === null) { notify("Signature cancelled — the order was not approved.", "error"); return; }
    }
    setRows((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    notify(approve ? `${order.id} approved — ${method === "biometric" ? "digitally signed with your fingerprint/Face ID" : "no sensor on this device, recorded as unsigned"}.` : `${order.id} rejected`);
    if (IS_CONFIGURED) {
      try {
        await sb("procurement_purchase_orders").eq("id", order.dbId ?? order.id).update({ status: next }).run();
        if (approve) await sb("approval_signatures").insert({ doc_type: "Purchase Order", doc_ref: order.id, approved_by: currentUser.name, method }).run();
      } catch (_e) { notify("Couldn't save the decision to the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      {!canManage && (
        <div className="flex items-start gap-2.5 bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg p-3">
          <Lock size={15} className="text-[#F59E0B] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#8a670a] leading-relaxed">
            You're viewing as {currentUser.role}. Approving or rejecting purchase orders requires a full-write role — switch roles in Settings to test this.
          </p>
        </div>
      )}

      {pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
          <EmptyState icon={CheckCircle2} title="Nothing waiting on approval" hint={`Purchase orders over TZS ${money(PO_APPROVAL_THRESHOLD)}k land here before they can be received.`} />
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((o) => {
            const total = poTotal(o.items);
            return (
              <div key={o.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-mono font-medium text-[#111827]">{o.id}</p>
                    <p className="text-[13px] text-slate-500">{o.supplier} · requested by {o.requestedBy}</p>
                  </div>
                  <p className="text-[16px] font-mono font-semibold text-[#111827]">TZS {money(Math.round(total))}k</p>
                </div>
                <p className="text-[12px] text-slate-400 mb-3">{o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</p>
                <div className="flex gap-2">
                  <button onClick={() => decide(o, false)} disabled={!canManage} className="flex-1 text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2 hover:bg-[#EF4444]/5 disabled:opacity-40 disabled:cursor-not-allowed">Reject</button>
                  <button onClick={() => decide(o, true)} disabled={!canManage} className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2 disabled:opacity-40 disabled:cursor-not-allowed">Approve</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════ PROCUREMENT CONTRACTS ══════════════ */
/* -------------------------------- PROCUREMENT CONTRACTS --------------------------------- */
export function ProcurementContracts({ contracts, suppliersHook }) {
  const { rows, setRows, loading } = contracts;
  const [showForm, setShowForm] = useState(false);

  async function addContract(form) {
    const draft = { id: docId("PC"), supplier: form.supplier, type: form.type, startDate: form.startDate, endDate: form.endDate || null, value: Number(form.value) || 0, notes: form.notes };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Contract added: ${draft.supplier}`);
    if (IS_CONFIGURED) {
      try {
        await sb("procurement_contracts").insert({
          doc_number: draft.id, supplier: draft.supplier, contract_type: draft.type, start_date: draft.startDate,
          end_date: draft.endDate, value: draft.value, notes: draft.notes,
        }).run();
      } catch (_e) { notify("Contract added locally, but saving to the server failed.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New Contract
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Supplier</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">End Date</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Value (TZS 000)</th>
            </tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={5} />}
              {!loading && rows.map((c) => {
                const status = contractStatus(c.endDate);
                return (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-[#111827]">{c.supplier}</td>
                    <td className="px-4 py-3 text-slate-500">{c.type}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{c.endDate || "Open-ended"}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${CONTRACT_STATUS_COLOR[status]}14`, color: CONTRACT_STATUS_COLOR[status] }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONTRACT_STATUS_COLOR[status] }} />{status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{money(c.value)}</td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={5}><EmptyState icon={FileText} title="No contracts yet" hint="Track supplier agreements and renewal dates here." actionLabel="New Contract" onAction={() => setShowForm(true)} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <ContractFormPanel suppliersHook={suppliersHook} onClose={() => setShowForm(false)} onSubmit={addContract} />}
    </div>
  );
}

export function ContractFormPanel({ suppliersHook, onClose, onSubmit }) {
  const suppliers = suppliersHook.rows;
  const [form, setForm] = useState({ supplier: suppliers[0]?.name || "", type: CONTRACT_TYPES[0], startDate: TODAY.toISOString().slice(0, 10), endDate: "", value: "", notes: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.supplier) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Procurement</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Contract</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Supplier">
            <select className={inputClass} value={form.supplier} onChange={(e) => set("supplier", e.target.value)}>
              {suppliers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </FormField>
          <FormField label="Contract type">
            <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {CONTRACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start date"><input type="date" className={inputClass} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></FormField>
            <FormField label="End date">
              <input type="date" className={inputClass} value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
              <p className="text-[11px] text-slate-400 mt-1">Leave blank for open-ended agreements.</p>
            </FormField>
          </div>
          <FormField label="Contract value (TZS 000)"><input type="number" min="0" className={inputClass} value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="0" /></FormField>
          <FormField label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Contract</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ VENDOR PAYMENTS ══════════════ */
/* --------------------------------- VENDOR PAYMENTS --------------------------------- */
export function VendorPayments({ orders, expensesHook }) {
  const { rows, setRows } = orders;
  const readyToPay = rows.filter((o) => o.status === "Received");
  const paid       = rows.filter((o) => o.status === "Paid");

  async function payOrder(order) {
    const total = poTotal(order.items);
    const expenseDraft = {
      id: docId("EX"), vendor: order.supplier, category: "Inventory Purchases",
      date: TODAY.toISOString().slice(0, 10), dueDate: TODAY.toISOString().slice(0, 10),
      amount: total, status: "Paid", method: "Bank Transfer",
    };
    // The real consequence: paying a vendor creates an actual expense in
    // the shared Finance table — the same one Payroll and Subscriptions
    // already write to — not just a status flip inside Procurement.
    expensesHook.setRows((prev) => [expenseDraft, ...prev]);
    setRows((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: "Paid" } : o)));
    notify(`${order.id} paid — TZS ${money(Math.round(total))}k recorded in Finance`);

    if (IS_CONFIGURED) {
      try {
        const header = await sb("finance_expenses").insert({
          vendor: expenseDraft.vendor, category: "Inventory Purchases", expense_date: expenseDraft.date,
          due_date: expenseDraft.dueDate, amount: expenseDraft.amount, status: "Paid", method: "Bank Transfer",
        }).single().run();
        if (header?.id) expensesHook.setRows((prev) => prev.map((e) => (e.id === expenseDraft.id ? { ...e, dbId: header.id } : e)));
        await sb("procurement_purchase_orders").eq("id", order.dbId ?? order.id).update({ status: "Paid" }).run();
      } catch (_e) { notify("Paid locally, but saving to the server failed.", "error"); }
    }
  }

  // Supplier spend breakdown (paid POs)
  const bySupplier = Object.entries(
    paid.reduce((m, o) => { m[o.supplier] = (m[o.supplier] || 0) + poTotal(o.items); return m; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, value], i) => ({
      name: name.length > 16 ? name.slice(0, 14) + "…" : name,
      value: Math.round(value / 1000),
      fill: ["#2563EB","#16A34A","#7C3AED","#F59E0B","#EF4444","#0891B2","#EA580C","#64748B"][i % 8],
    }));

  const totalPaid    = paid.reduce((s, o) => s + poTotal(o.items), 0);
  const totalPending = readyToPay.reduce((s, o) => s + poTotal(o.items), 0);
  const avgPO        = paid.length ? Math.round(totalPaid / paid.length) : 0;

  return (
    <div className="space-y-5">
      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Pending Payment", readyToPay.length,                          "#F59E0B"],
          ["Pending Value",   "TZS "+money(Math.round(totalPending))+"k", "#EF4444"],
          ["Total Paid",      "TZS "+money(Math.round(totalPaid))+"k",    "#16A34A"],
          ["Avg PO Size",     "TZS "+money(Math.round(avgPO))+"k",        "#2563EB"],
        ].map(([l, v, col]) => (
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      {/* Supplier spend chart */}
      {bySupplier.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Spend by Supplier</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={bySupplier} layout="vertical" margin={{left:5,right:24,top:0,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={100}/>
              <Tooltip formatter={(v) => ["TZS "+money(v)+"k","Paid"]}/>
              <Bar dataKey="value" radius={[0,5,5,0]}>
                {bySupplier.map((d, i) => <Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ready to pay */}
      <div>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3">
          Awaiting Payment <span className="ml-2 text-[12px] font-normal text-slate-400">({readyToPay.length} PO{readyToPay.length !== 1 ? "s" : ""} · TZS {money(Math.round(totalPending))}k)</span>
        </h3>
        {readyToPay.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center text-[13px] text-slate-400">
            No purchase orders awaiting payment right now.
          </div>
        ) : (
          <div className="space-y-2.5">
            {readyToPay.map((o) => {
              const total = poTotal(o.items);
              const urgency = total > 500 ? "#EF4444" : total > 200 ? "#F59E0B" : "#16A34A";
              return (
                <div key={o.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-[12px]" style={{background:urgency}}>
                        {o.supplier?.charAt(0) || "?"}
                      </div>
                      <div>
                        <p className="font-semibold text-[13.5px] text-[#111827]">{o.supplier}</p>
                        <p className="text-[11.5px] text-slate-400 font-mono">{o.id} · {o.items?.length || 0} item{o.items?.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[17px] font-mono font-bold text-[#111827]">TZS {money(Math.round(total))}k</p>
                        <p className="text-[10.5px] text-slate-400">Bank Transfer</p>
                      </div>
                      <button
                        onClick={() => payOrder(o)}
                        className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl shadow-sm"
                        style={{background:"#16A34A"}}
                      >
                        Pay Now
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history */}
      {paid.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Payment History <span className="ml-2 text-[12px] font-normal text-slate-400">({paid.length} POs paid)</span></h3>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead><tr className="border-b border-slate-100 bg-slate-50">
                  {["PO","Supplier","Items","Amount","Status"].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {paid.map((o) => (
                    <tr key={o.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono font-medium text-[#111827]">{o.id}</td>
                      <td className="px-4 py-3 text-slate-600">{o.supplier}</td>
                      <td className="px-4 py-3 text-slate-400 text-center">{o.items?.length || 0}</td>
                      <td className="px-4 py-3 font-mono font-bold text-[#16A34A]">TZS {money(Math.round(poTotal(o.items)))}k</td>
                      <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">Paid</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SupplierPortal({ suppliersHook, orders }) {
  const suppliers = suppliersHook.rows;
  const stats = useMemo(() => {
    return suppliers.map((s) => {
      const supplierOrders = orders.rows.filter((o) => o.supplier === s.name);
      const totalSpend = supplierOrders.filter((o) => o.status !== "Cancelled").reduce((sum, o) => sum + poTotal(o.items), 0);
      const openOrders = supplierOrders.filter((o) => !["Paid", "Cancelled"].includes(o.status)).length;
      return { ...s, orderCount: supplierOrders.length, totalSpend, openOrders };
    });
  }, [suppliers, orders.rows]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Building2 size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          An internal view of each supplier relationship — not a separate external login, since this build has no supplier-facing authentication yet.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[14px] font-semibold text-[#111827]">{s.name}</p>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${SUPPLIER_STATUS_COLOR[s.status]}14`, color: SUPPLIER_STATUS_COLOR[s.status] }}>{s.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-[10.5px] text-slate-400 mb-0.5">Orders</p><p className="text-[14px] font-mono font-semibold text-[#111827]">{s.orderCount}</p></div>
              <div><p className="text-[10.5px] text-slate-400 mb-0.5">Open</p><p className="text-[14px] font-mono font-semibold text-[#111827]">{s.openOrders}</p></div>
              <div><p className="text-[10.5px] text-slate-400 mb-0.5">Spend</p><p className="text-[14px] font-mono font-semibold text-[#111827]">{money(Math.round(s.totalSpend))}k</p></div>
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={Building2} title="No suppliers yet" hint="Add suppliers from Inventory to see their activity here." />
          </div>
        )}
      </div>
    </div>
  );
}
