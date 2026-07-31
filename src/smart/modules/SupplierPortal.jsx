import { useState } from "react";
import {
  ClipboardList, FileCheck, FileText, Lock, Truck, UploadCloud, Wallet
} from "lucide-react";
import { BrandMark } from "../components/BrandMark.jsx";
import { EmptyState, FormField, inputClass } from "../components/ui.jsx";
import { filesSeed } from "../data/documents.jsx";
import { expensesSeed } from "../data/finance.jsx";
import { procurementContractsSeed, purchaseOrdersSeed } from "../data/procurement.jsx";
import { ProfileMenu } from "../lib/alerts.jsx";
import { TODAY, docId, money } from "../lib/format.jsx";
import {
  mapExpenseRow,
  mapProcurementContractRow,
  mapPurchaseOrderRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { mapFileRow, notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, callRpc, sb } from "../lib/supabase.jsx";

/* ══════════════ SUPPLIER PORTAL ══════════════ */
/* ---------------------------------- SUPPLIER PORTAL ---------------------------------- */

// The same real security design as the Customer Portal (section 40): RLS
// policies added alongside profiles.customer_ref are what actually scope
// a supplier's session to their own purchase orders, contracts, and
// payment history — this component's own filtering is a demo-mode
// fallback, not the security boundary, in live mode it's just narrowing
// a result set the database had already scoped correctly.
export function ExternalSupplierPortal({ currentUser, onSignOut }) {
  const [tab, setTab] = useState("orders");
  const purchaseOrders = useCompanyTable("procurement_purchase_orders", purchaseOrdersSeed, {
    select: "*,purchase_order_items(*)", mapRow: mapPurchaseOrderRow,
  });
  const contracts = useCompanyTable("procurement_contracts", procurementContractsSeed, { mapRow: mapProcurementContractRow });
  const expenses = useCompanyTable("finance_expenses", expensesSeed, { mapRow: mapExpenseRow });
  const files = useCompanyTable("documents", filesSeed, { mapRow: mapFileRow });

  const effectiveSupplier = currentUser.customerRef || purchaseOrders.rows[0]?.supplier || "Demo Supplier";
  const myOrders = purchaseOrders.rows.filter((po) => po.supplier === effectiveSupplier);
  const myContracts = contracts.rows.filter((c) => c.supplier === effectiveSupplier);
  const myPayments = expenses.rows.filter((e) => e.vendor === effectiveSupplier);
  const myDocuments = files.rows.filter((f) => myOrders.some((po) => po.id === f.linkedRecord));

  const PORTAL_TABS = [
    { id: "orders", label: "Purchase Orders", icon: ClipboardList },
    { id: "invoices", label: "Upload Invoices", icon: UploadCloud },
    { id: "payments", label: "Track Payments", icon: Wallet },
    { id: "contracts", label: "Contracts", icon: FileCheck },
    { id: "deliveries", label: "Deliveries", icon: Truck },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <BrandMark size={32} textSize={14} />
          <div>
            <p className="text-[13.5px] font-semibold text-[#111827] leading-tight">Supplier Portal</p>
            <p className="text-[10.5px] text-slate-400 leading-tight">{effectiveSupplier}</p>
          </div>
        </div>
        <ProfileMenu currentUser={currentUser} session={{ demo: !currentUser.customerRef }} onSignOut={onSignOut} />
      </header>

      {!currentUser.customerRef && (
        <div className="bg-[#F59E0B]/10 border-b border-[#F59E0B]/20 px-4 sm:px-6 py-2">
          <p className="text-[11.5px] text-[#8a670a]">Demo mode — showing sample data for "{effectiveSupplier}" since there's no real signed-in supplier identity yet. In live mode, this portal shows exactly one supplier's own records, enforced by the database itself.</p>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
        <div className="flex items-center gap-1 bg-white border border-slate-200/80 rounded-lg p-1 mb-5 overflow-x-auto w-fit max-w-full">
          {PORTAL_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${isActive ? "bg-[#16A34A] text-white" : "text-slate-500 hover:text-slate-700"}`}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "orders" && <SupplierOrdersTab myOrders={myOrders} />}
        {tab === "invoices" && <SupplierInvoiceUploadTab myOrders={myOrders} filesHook={files} />}
        {tab === "payments" && <SupplierPaymentsTab myPayments={myPayments} />}
        {tab === "contracts" && <SupplierContractsTab myContracts={myContracts} />}
        {tab === "deliveries" && <SupplierDeliveriesTab myOrders={myOrders} purchaseOrdersHook={purchaseOrders} />}
      </div>
    </div>
  );
}

export function SupplierOrdersTab({ myOrders }) {
  return (
    <div className="space-y-3">
      {myOrders.length === 0 && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={ClipboardList} title="No purchase orders yet" hint="Purchase orders issued to you will appear here as soon as they're raised." /></div>}
      {myOrders.map((po) => {
        const total = po.items.reduce((s, it) => s + it.qty * it.cost, 0);
        return (
          <div key={po.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-start justify-between mb-3">
              <div><p className="text-[13.5px] font-semibold text-[#111827]">{po.id}</p><p className="text-[11px] text-slate-400">Ordered {po.orderDate}{po.expectedDate ? ` · expected ${po.expectedDate}` : ""}</p></div>
              <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${po.status === "Paid" ? "bg-[#16A34A]/10 text-[#16A34A]" : po.status === "Cancelled" ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[#F59E0B]/10 text-[#F59E0B]"}`}>{po.status}</span>
            </div>
            <div className="space-y-1 mb-3">
              {po.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-600">{it.name} × {it.qty}</span>
                  <span className="font-mono text-slate-500">TZS {money(it.qty * it.cost)}k</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-[11.5px] text-slate-400">Total</span>
              <span className="text-[15px] font-mono font-bold text-[#111827]">TZS {money(Math.round(total))}k</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SupplierInvoiceUploadTab({ myOrders, filesHook }) {
  const [selectedPO, setSelectedPO] = useState(myOrders[0]?.id || "");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const uploadedForPO = filesHook.rows.filter((f) => f.linkedRecord === selectedPO && f.folder === "Purchase Orders");

  async function upload(e) {
    e.preventDefault();
    if (!fileName.trim() || !selectedPO) return;
    setBusy(true);
    const draft = {
      id: docId("DOC"), name: fileName.trim(), type: "pdf", folder: "Purchase Orders",
      size: "—", uploadedBy: "Supplier", date: TODAY.toISOString().slice(0, 10), linkedRecord: selectedPO, content: "", versions: [],
    };
    filesHook.setRows((prev) => [draft, ...prev]);
    setFileName("");
    notify(`Invoice submitted for ${selectedPO} — the business will review it.`);
    if (IS_CONFIGURED) {
      try { await sb("documents").insert({ name: draft.name, file_type: draft.type, folder: draft.folder, linked_record: draft.linkedRecord }).run(); } catch (_e) { notify("Submitted locally, but sending to the server failed.", "error"); }
    }
    setBusy(false);
  }

  if (myOrders.length === 0) return <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={UploadCloud} title="No purchase orders to invoice against" hint="You'll be able to upload an invoice once a purchase order is issued to you." /></div>;

  return (
    <div className="space-y-4">
      <form onSubmit={upload} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3">
        <FormField label="Purchase order">
          <select className={inputClass} value={selectedPO} onChange={(e) => setSelectedPO(e.target.value)}>
            {myOrders.map((po) => <option key={po.id} value={po.id}>{po.id}</option>)}
          </select>
        </FormField>
        <FormField label="Invoice file name" required>
          <input className={inputClass} value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g. Invoice-4471.pdf" />
          <p className="text-[11px] text-slate-400 mt-1">This demo register doesn&apos;t store raw file bytes (see the Document Center&apos;s own note on this) — it records the invoice as a real, trackable entry the business can see and act on.</p>
        </FormField>
        <button type="submit" disabled={busy || !fileName.trim()} className="btn-primary text-white text-[12.5px] font-medium rounded-lg py-2.5 w-full disabled:opacity-40">Submit Invoice</button>
      </form>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
        {uploadedForPO.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices submitted for this PO yet" hint="Invoices you submit for the selected purchase order will appear here." />
        ) : (
          <div className="divide-y divide-slate-50">
            {uploadedForPO.map((f) => (
              <div key={f.id} className="flex items-center gap-2.5 px-4 py-3">
                <FileText size={16} className="text-[#EF4444] shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-[12.5px] font-medium text-[#111827] truncate">{f.name}</p><p className="text-[11px] text-slate-400">Submitted {f.date}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SupplierPaymentsTab({ myPayments }) {
  const totalPaid = myPayments.filter((e) => e.status === "Paid").reduce((s, e) => s + e.amount, 0);
  const totalPending = myPayments.filter((e) => e.status !== "Paid").reduce((s, e) => s + e.amount, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4"><p className="text-[11px] text-slate-400 mb-1">Received to date</p><p className="text-[17px] font-mono font-bold text-[#16A34A]">TZS {money(Math.round(totalPaid))}k</p></div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4"><p className="text-[11px] text-slate-400 mb-1">Pending</p><p className="text-[17px] font-mono font-bold text-[#F59E0B]">TZS {money(Math.round(totalPending))}k</p></div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
        {myPayments.length === 0 ? (
          <EmptyState icon={Wallet} title="No payment history yet" hint="Payments made to you will appear here." />
        ) : (
          <div className="divide-y divide-slate-50">
            {myPayments.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3">
                <div><p className="text-[12.5px] font-medium text-[#111827]">{e.category}</p><p className="text-[11px] text-slate-400">{e.date}{e.method ? ` · ${e.method}` : ""}</p></div>
                <div className="text-right">
                  <p className="text-[13px] font-mono font-semibold text-[#111827]">TZS {money(Math.round(e.amount))}k</p>
                  <span className={`text-[10px] font-medium ${e.status === "Paid" ? "text-[#16A34A]" : "text-[#F59E0B]"}`}>{e.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SupplierContractsTab({ myContracts }) {
  return (
    <div className="space-y-3">
      {myContracts.length === 0 && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={FileCheck} title="No contracts on file" hint="Supply agreements with your company will appear here." /></div>}
      {myContracts.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <div className="flex items-start justify-between mb-2">
            <div><p className="text-[13.5px] font-semibold text-[#111827]">{c.id}</p><p className="text-[11px] text-slate-400">{c.type}</p></div>
            <p className="text-[15px] font-mono font-bold text-[#111827]">TZS {money(Math.round(c.value))}k</p>
          </div>
          <p className="text-[11.5px] text-slate-500 mb-2">{c.startDate} — {c.endDate || "Open-ended"}</p>
          {c.notes && <p className="text-[12.5px] text-slate-600 leading-relaxed">{c.notes}</p>}
        </div>
      ))}
    </div>
  );
}

export function SupplierDeliveriesTab({ myOrders, purchaseOrdersHook }) {
  const [editingId, setEditingId] = useState(null);
  const [newDate, setNewDate] = useState("");
  const pending = myOrders.filter((po) => po.status !== "Cancelled" && po.status !== "Paid");

  // Calls the real supplier_update_delivery_date RPC (schema section
  // "SUPPLIER PORTAL") rather than an UPDATE straight to the table — RLS
  // alone can't stop a supplier with row UPDATE access from also rewriting
  // their PO's status, so the RPC is the only door, and it only ever
  // touches expected_date after verifying the PO is genuinely theirs.
  async function saveDate(po) {
    if (!newDate) return;
    if (IS_CONFIGURED) {
      try {
        await callRpc("supplier_update_delivery_date", { p_po_doc_number: po.id, p_new_expected_date: newDate }, (typeof window !== "undefined" && window.localStorage.getItem("bs_access_token")) || "");
      } catch (_e) { notify("Couldn't update the delivery date on the server.", "error"); }
    }
    purchaseOrdersHook.setRows((prev) => prev.map((p) => (p.id === po.id ? { ...p, expectedDate: newDate } : p)));
    notify(`Delivery date updated for ${po.id}`);
    setEditingId(null);
  }

  return (
    <div className="space-y-3">
      {pending.length === 0 && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={Truck} title="No active deliveries" hint="Purchase orders awaiting delivery will appear here." /></div>}
      {pending.map((po) => (
        <div key={po.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13.5px] font-semibold text-[#111827]">{po.id}</p>
            <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">{po.status}</span>
          </div>
          <p className="text-[12px] text-slate-500 mb-3">Currently committed: {po.expectedDate || "No date set"}</p>
          {editingId === po.id ? (
            <div className="flex gap-2">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
              <button onClick={() => saveDate(po)} className="btn-primary text-white text-[12px] font-medium px-3 rounded-lg shrink-0">Save</button>
              <button onClick={() => setEditingId(null)} className="text-[12px] font-medium border border-slate-200 rounded-lg px-3 shrink-0">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setEditingId(po.id); setNewDate(po.expectedDate || ""); }} className="btn-secondary text-[12px] font-medium rounded-lg py-2 px-3 flex items-center gap-1.5">
              <Truck size={13} /> Update Delivery Date
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ComingSoon({ label }) {
  return (
    <div className="h-[70vh] flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-xl bg-[#111827]/5 flex items-center justify-center mb-4">
        <Lock size={18} className="text-[#111827]/40" />
      </div>
      <h2 className="text-[16px] font-semibold text-[#111827]">{label} module</h2>
      <p className="text-[13px] text-slate-500 mt-1.5 max-w-xs">
        Next up in the build sequence. Dashboard and CRM are live — this module follows the same architecture.
      </p>
    </div>
  );
}
