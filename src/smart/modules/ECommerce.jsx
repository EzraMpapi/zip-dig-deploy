import { useMemo, useState } from "react";
import {
  ChevronRight, CircleDollarSign, CreditCard, Globe, Grid3x3, List, Package, Percent, Search,
  ShoppingCart, Star, Store, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { EmptyState, SkeletonRows } from "../components/ui.jsx";
import {
  CATEGORY_GRADIENT,
  ECOM_ORDER_STATUS_COLOR,
  STOREFRONT_TREND,
  onlineOrdersSeed,
  storefrontSeed,
} from "../data/ecommerce.jsx";
import { STOCK_STATUS_COLOR } from "../data/inventory.jsx";
import { KpiCard } from "../data/pos.jsx";
import { money } from "../lib/format.jsx";
import { mapProductRow, useCompanyTable } from "../lib/mappers.jsx";
import { mapOnlineOrderRow, notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ E-COMMERCE ══════════════ */
/* --------------------------------- E-COMMERCE ----------------------------------- */
export const ECOM_TABS = [
  { id: "storefront", label: "Storefront", icon: Store },
  { id: "orders", label: "Orders", icon: ShoppingCart },
];

export function ECommerce({ inventory }) {
  const [tab, setTab] = useState("storefront");
  const products = useCompanyTable("ecommerce_products", storefrontSeed, {
    select: "*,inventory_items(name,category)", order: { col: "sku", ascending: true }, mapRow: mapProductRow,
  });
  const orders = useCompanyTable("ecommerce_orders", onlineOrdersSeed, {
    select: "*,ecommerce_order_items(*)", order: { col: "order_date", ascending: false }, mapRow: mapOnlineOrderRow,
  });

  const stats = useMemo(() => {
    const live = orders.rows.filter((o) => o.status !== "Cancelled");
    const revenue = live.reduce((s, o) => s + o.total, 0);
    const published = products.rows.filter((p) => p.published).length;
    return {
      revenue, count: live.length,
      avg: live.length ? Math.round(revenue / live.length) : 0,
      published, total: products.rows.length,
    };
  }, [orders.rows, products.rows]);

  const ECOM_KPIS = [
    { label: "Online Revenue", value: `TZS ${money(stats.revenue)}k`, delta: "Last 7 days", up: true, icon: CircleDollarSign },
    { label: "Orders", value: String(stats.count), delta: "Excl. cancelled", up: true, icon: ShoppingCart },
    { label: "Avg Order Value", value: `TZS ${money(stats.avg)}k`, delta: "Per order", up: true, icon: Percent },
    { label: "Published Products", value: `${stats.published}/${stats.total}`, delta: "Live on storefront", up: true, icon: Globe },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">E-Commerce</h1>
        <p className="text-[13px] text-slate-500 mt-1">Your online storefront, priced from live Inventory stock</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {ECOM_TABS.map((t) => {
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
        {ECOM_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {tab === "storefront" && <Storefront products={products} inventory={inventory} />}
      {tab === "orders" && <OnlineOrders orders={orders} />}
    </div>
  );
}

export function Storefront({ products, inventory }) {
  const [view, setView] = useState("grid");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const { rows, setRows, loading } = products;

  const categories = useMemo(() => [...new Set(rows.map((p) => p.category))], [rows]);

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      const matchesCat = category === "all" || p.category === category;
      const matchesQ = !query.trim() || p.name.toLowerCase().includes(query.toLowerCase());
      return matchesCat && matchesQ;
    });
  }, [rows, category, query]);

  async function togglePublished(sku) {
    setRows((prev) => prev.map((p) => (p.sku === sku ? { ...p, published: !p.published } : p)));
    if (IS_CONFIGURED) {
      try {
        const p = rows.find((x) => x.sku === sku);
        await sb("ecommerce_products").eq("sku", sku).update({ published: !p.published }).run();
      } catch (_e) { notify("Couldn't save the publish state to the server.", "error"); }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
          <button
            onClick={() => setCategory("all")}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${category === "all" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}
          >
            All categories
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${category === c ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
            />
          </div>
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 shrink-0">
            <button onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} className={`p-1.5 rounded-md ${view === "grid" ? "bg-white shadow-sm text-[#111827]" : "text-slate-400"}`}>
              <Grid3x3 size={15} />
            </button>
            <button onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} className={`p-1.5 rounded-md ${view === "list" ? "bg-white shadow-sm text-[#111827]" : "text-slate-400"}`}>
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200/80 overflow-hidden">
              <div className="h-28 skeleton-shimmer" />
              <div className="p-3 space-y-2">
                <div className="h-3 rounded skeleton-shimmer w-3/4" />
                <div className="h-3 rounded skeleton-shimmer w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
          <EmptyState icon={Store} title="No products found" hint="Try a different search or category filter." />
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const stockItem = inventory.rows.find((it) => it.sku === p.sku);
            const status = stockItem ? stockStatus(stockItem.qty, stockItem.reorder) : null;
            return (
              <div
                key={p.sku}
                className="rounded-xl border border-slate-200/80 shadow-sm overflow-hidden bg-white hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                <div
                  className="h-28 relative flex items-center justify-center"
                  style={{ background: CATEGORY_GRADIENT[p.category] || "linear-gradient(135deg, #111827, #16A34A)" }}
                >
                  <Package size={30} strokeWidth={1.5} className="text-white/85" />
                  {p.featured && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-semibold text-[#111827] bg-white/95 rounded-full px-2 py-0.5">
                      <Star size={9} fill="#F59E0B" className="text-[#F59E0B]" /> Featured
                    </span>
                  )}
                  <span
                    className={`absolute top-2 right-2 text-[10px] font-semibold rounded-full px-2 py-0.5 ${p.published ? "bg-white/95 text-[#16A34A]" : "bg-black/40 text-white"}`}
                  >
                    {p.published ? "Live" : "Draft"}
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="text-[10.5px] text-slate-400 uppercase tracking-wide">{p.category}</p>
                  <p className="text-[13px] font-medium text-[#111827] leading-snug mt-0.5 mb-2 line-clamp-2 min-h-[32px]">{p.name}</p>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[14px] font-mono font-semibold text-[#111827]">TZS {money(p.price)}k</span>
                    {status && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${STOCK_STATUS_COLOR[status]}14`, color: STOCK_STATUS_COLOR[status] }}
                      >
                        {status}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => togglePublished(p.sku)}
                    className={`w-full text-[11.5px] font-medium rounded-lg py-1.5 transition-colors ${
                      p.published ? "border border-slate-200 text-slate-500 hover:bg-slate-50" : "btn-primary text-white"
                    }`}
                  >
                    {p.published ? "Unpublish" : "Publish"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.sku} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ background: CATEGORY_GRADIENT[p.category] }}>
                          <Package size={14} className="text-white/85" />
                        </div>
                        <div>
                          <p className="font-medium text-[#111827]">{p.name}</p>
                          {p.featured && <p className="text-[10.5px] text-[#F59E0B] flex items-center gap-1"><Star size={9} fill="#F59E0B" /> Featured</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.category}</td>
                    <td className="px-4 py-3 text-right font-mono">{money(p.price)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${p.published ? "bg-[#16A34A]/10 text-[#16A34A]" : "bg-slate-100 text-slate-500"}`}>
                        {p.published ? "Live" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => togglePublished(p.sku)} className="text-[11.5px] font-medium text-[#16A34A] hover:text-[#15803D]">
                        {p.published ? "Unpublish" : "Publish"}
                      </button>
                    </td>
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

export function OnlineOrders({ orders }) {
  const [selected, setSelected] = useState(null);
  const { rows, setRows, loading } = orders;

  async function advanceOrder(id, next) {
    const order = rows.find((o) => o.id === id);
    setRows((prev) => prev.map((o) => (o.id === id ? { ...o, status: next } : o)));
    setSelected((s) => (s && s.id === id ? { ...s, status: next } : s));
    notify(`${id} marked ${next}`);
    if (IS_CONFIGURED && order?.dbId) {
      try { await sb("ecommerce_orders").eq("id", order.dbId).update({ status: next }).run(); } catch (_e) { notify("Couldn't save the order status to the server.", "error"); }
    }
  }

  const nextStatus = { "Payment Pending": "Processing", Processing: "Shipped", Shipped: "Delivered", Delivered: null, Cancelled: null };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={5} />}
              {!loading && rows.map((o) => (
                <tr key={o.id} onClick={() => setSelected(o)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-[#111827]">{o.id}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">{o.customer}</p>
                    <p className="text-[11px] text-slate-400">{o.email}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{money(o.total)}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{ backgroundColor: `${ECOM_ORDER_STATUS_COLOR[o.status]}14`, color: ECOM_ORDER_STATUS_COLOR[o.status] }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ECOM_ORDER_STATUS_COLOR[o.status] }} />
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-slate-300 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Orders This Week</h3>
        <p className="text-[11.5px] text-slate-400 mb-3">Daily order volume</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={STOREFRONT_TREND} margin={{ top: 5, right: 0, left: -24, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF1F4" />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #EEF1F4", fontSize: 12, fontFamily: "monospace" }} />
            <Bar dataKey="orders" radius={[5, 5, 0, 0]} fill="#16A34A" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {selected && (
        <OnlineOrderPanel order={selected} onClose={() => setSelected(null)} onAdvance={advanceOrder} nextStatus={nextStatus[selected.status]} />
      )}
    </div>
  );
}

export function OnlineOrderPanel({ order, onClose, onAdvance, nextStatus }) {
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-mono text-slate-400">{order.id}</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">{order.customer}</h2>
            <p className="text-[13px] text-slate-500">{order.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mb-6">
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{ backgroundColor: `${ECOM_ORDER_STATUS_COLOR[order.status]}14`, color: ECOM_ORDER_STATUS_COLOR[order.status] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ECOM_ORDER_STATUS_COLOR[order.status] }} />
            {order.status}
          </span>
        </div>

        <div className="border border-slate-100 rounded-lg overflow-hidden mb-5">
          {order.items.map((it, i) => (
            <div key={i} className={`flex items-center justify-between px-3 py-2.5 text-[13px] ${i !== order.items.length - 1 ? "border-b border-slate-50" : ""}`}>
              <div>
                <p className="text-slate-700">{it.name}</p>
                <p className="text-[11px] text-slate-400 font-mono">{it.qty} × TZS {money(it.price)}k</p>
              </div>
              <span className="font-mono text-[#111827]">{money(it.qty * it.price)}k</span>
            </div>
          ))}
        </div>

        <div className="flex justify-between text-[14px] font-semibold text-[#111827] mb-6">
          <span>Total</span>
          <span className="font-mono">TZS {money(order.total)}k</span>
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-6">
          <CreditCard size={14} className="text-slate-400" /> Paid via {order.method}
        </div>

        <div className="flex-1" />

        {nextStatus && (
          <button onClick={() => onAdvance(order.id, nextStatus)} className="btn-primary text-white text-[12px] font-medium rounded-lg py-2.5">
            Mark {nextStatus}
          </button>
        )}
      </div>
    </div>
  );
}
