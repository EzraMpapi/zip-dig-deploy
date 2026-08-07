import { useEffect, useState } from "react";
import { Activity, AlertCircle, Bell, CheckCircle2 } from "lucide-react";
import { auditBus } from "../lib/buses.jsx";
import { mapPosItems, useCompanyTable } from "../lib/mappers.jsx";

export function mapReturnRow(rr) {
  return {
    id: rr.id,
    refundTotal: Number(rr.refund_total) || 0,
    reason: rr.reason,
    date: rr.created_at?.slice(0, 10),
    items: mapPosItems(rr.pos_return_items),
  };
}

export function mapPosTransactionRow(r) {
  return {
    id: r.doc_number,
    dbId: r.id,
    cashier: r.profiles?.full_name || "Unknown",
    method: r.payment_method,
    date: r.created_at?.slice(0, 10),
    createdAt: r.created_at || null,
    items: mapPosItems(r.pos_transaction_items),
    returns: (r.pos_returns || []).map(mapReturnRow),
  };
}

export const TOAST_STYLE = {
  success: { bg: "rgba(5,46,22,0.97)", accent: "#22C55E", label: "#BBF7D0", Icon: CheckCircle2 },
  error: { bg: "rgba(60,10,8,0.97)", accent: "#EF4444", label: "#FECACA", Icon: AlertCircle },
  info: { bg: "rgba(12,15,28,0.97)", accent: "#38BDF8", label: "#BAE6FD", Icon: Bell },
};

export const TOAST_DURATION = 3800;

// Premium toast — glassmorphism card, auto-progress bar that drains in real
// time, stacked dismiss. The progress bar uses a CSS animation tied to the
// same duration constant so the two can never drift apart.
// Activity Stream — live feed from auditBus + historical audit_log rows.
// Same bus pattern as toasts. Updates in real time as any action anywhere
// in the system emits via logAudit(). The reference app showed this;
// the implementation here uses the bus that already exists.
export const ACTIVITY_MODULE_COLORS = {
  Finance: "#16A34A",
  Sales: "#3B82F6",
  Procurement: "#8B5CF6",
  HR: "#F59E0B",
  Inventory: "#06B6D4",
  "Workflow Studio": "#EC4899",
  "Point of Sale": "#10B981",
  Security: "#EF4444",
  CRM: "#F97316",
};

export function ActivityStream({ currentUser }) {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("All");
  const dbAudit = useCompanyTable("audit_log", [], {
    order: { col: "created_at", ascending: false },
    mapRow: (r) => ({
      id: r.id,
      action: r.action,
      module: r.module,
      actor: r.actor,
      details: r.details,
      timestamp: r.created_at,
    }),
  });

  useEffect(() => {
    if (!dbAudit.loading) {
      setEntries((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const fresh = dbAudit.rows.filter((r) => !existing.has(r.id));
        return [...prev, ...fresh]
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
          .slice(0, 100);
      });
    }
  }, [dbAudit.loading, dbAudit.rows.length]);

  useEffect(() => {
    const handler = (entry) => setEntries((prev) => [entry, ...prev].slice(0, 100));
    auditBus.listeners.add(handler);
    return () => auditBus.listeners.delete(handler);
  }, []);

  const modules = ["All", ...new Set(entries.map((e) => e.module).filter(Boolean))];
  const visible = filter === "All" ? entries : entries.filter((e) => e.module === filter);

  const ago = (ts) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(ts)) / 60000));
    return mins < 1
      ? "just now"
      : mins < 60
        ? `${mins}m ago`
        : mins < 1440
          ? `${Math.floor(mins / 60)}h ago`
          : new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111827]">Activity Stream</h3>
          <p className="text-[12px] text-slate-500">
            Live feed of significant actions across every module — updates in real time as work
            happens, no refresh needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {modules.slice(0, 7).map((m) => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={`text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors ${filter === m ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {dbAudit.loading && (
          <p className="text-[12px] text-slate-400 text-center py-8">Loading activity history...</p>
        )}
        {!dbAudit.loading && visible.length === 0 && (
          <div className="py-14 text-center">
            <Activity size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-[13px] font-medium text-slate-400">No activity yet</p>
            <p className="text-[11.5px] text-slate-400 mt-1">
              Actions across Sales, Finance, HR, and Workflows appear here as they happen.
            </p>
          </div>
        )}
        {visible.slice(0, 50).map((e) => {
          const color = ACTIVITY_MODULE_COLORS[e.module] || "#94A3B8";
          return (
            <div
              key={e.id}
              className="flex items-start gap-3 px-4 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
            >
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-[#111827]">{e.action}</p>
                <p className="text-[10.5px] text-slate-400 mt-0.5">
                  {e.module}
                  {e.details ? ` · ${e.details}` : ""}
                  {e.actor ? ` · ${e.actor}` : ""}
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-400 shrink-0 mt-0.5">
                {ago(e.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
