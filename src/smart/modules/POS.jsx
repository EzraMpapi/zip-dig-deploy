import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown, CheckCircle2, CircleDollarSign, Minus, Package, Percent, Plus, Printer,
  Receipt, Search, ShoppingBag, Smartphone, X
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { EmptyState, FormField, SkeletonRows, inputClass } from "../components/ui.jsx";
import { CATEGORY_GRADIENT, MARKUP } from "../data/ecommerce.jsx";
import { stockStatus } from "../data/inventory.jsx";
import { KpiCard, POS_PAYMENT_COLOR, POS_PAYMENT_METHODS, RETURN_REASONS } from "../data/pos.jsx";
import { logAudit } from "../lib/buses.jsx";
import { TAX_RATE, TODAY, docId, money } from "../lib/format.jsx";
import { useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ POS ══════════════ */
/* ----------------------------------- POS -------------------------------------- */
export const POS_TABS = [
  { id: "checkout", label: "Checkout", icon: ShoppingBag },
  { id: "history", label: "Register History", icon: Receipt },
];

// POS Shifts & Cash Drawer — the control a till cannot run without, and
// the one real gap a competitive audit exposed. Expected cash is COMPUTED
// (opening float + cash sales + pay-ins - pay-outs); counted cash is what
// a human physically finds in the drawer; the variance between them is
// the entire point. Both directions matter and the UI says so: short can
// be theft or a miskeyed sale, over means a customer was overcharged or a
// sale never rung. One shift open at a time, so attributing sales by
// timestamp is unambiguous rather than a guess.
export function PosShiftPanel({ transactions, currentUser }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const shifts = useCompanyTable("pos_shifts", [], { order: { col: "opened_at", ascending: false }, mapRow: (r) => ({ id: r.id, dbId: r.id, cashier: r.cashier, openingFloat: Number(r.opening_float) || 0, countedCash: r.counted_cash === null || r.counted_cash === undefined ? null : Number(r.counted_cash), status: r.status, openedAt: r.opened_at, closedAt: r.closed_at }) });
  const moves = useCompanyTable("pos_cash_movements", [], { order: { col: "created_at", ascending: false }, mapRow: (r) => ({ id: r.id, dbId: r.id, shiftId: r.shift_id, kind: r.kind, amount: Number(r.amount) || 0, reason: r.reason || "" }) });
  const [floatDraft, setFloatDraft] = useState("");
  const [countDraft, setCountDraft] = useState("");
  const [move, setMove] = useState({ kind: "Pay In", amount: "", reason: "" });

  const open = shifts.rows.find((s) => s.status === "Open");
  const valueOf = (t) => (t.items || []).reduce((s, it) => s + it.qty * it.price, 0);

  const sales = useMemo(() => {
    if (!open) return { count: 0, gross: 0, cash: 0, other: 0 };
    const rows = transactions.rows.filter((t) => t.createdAt && t.createdAt >= open.openedAt);
    const cash = rows.filter((t) => t.method === "Cash").reduce((s, t) => s + valueOf(t), 0);
    const gross = rows.reduce((s, t) => s + valueOf(t), 0);
    return { count: rows.length, gross, cash, other: gross - cash };
  }, [transactions.rows, open]);

  const mine = open ? moves.rows.filter((m) => m.shiftId === (open.dbId || open.id)) : [];
  const payIns = mine.filter((m) => m.kind === "Pay In").reduce((s, m) => s + m.amount, 0);
  const payOuts = mine.filter((m) => m.kind === "Pay Out").reduce((s, m) => s + m.amount, 0);
  const expected = open ? open.openingFloat + sales.cash + payIns - payOuts : 0;
  const counted = Number(countDraft);
  const variance = countDraft.trim() === "" || isNaN(counted) ? null : counted - expected;

  async function openShift() {
    const f = Number(floatDraft);
    if (isNaN(f) || f < 0) { notify("Enter the counted opening float.", "error"); return; }
    if (open) { notify("A shift is already open — close it first. One drawer, one shift.", "error"); return; }
    const row = { id: `SH-${Date.now()}`, cashier: currentUser?.name || "Cashier", openingFloat: f, countedCash: null, status: "Open", openedAt: new Date().toISOString(), closedAt: null };
    shifts.setRows((prev) => [row, ...prev]);
    setFloatDraft("");
    notify(`Shift opened by ${row.cashier} — float TZS ${money(f)}k.`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("pos_shifts").insert({ cashier: row.cashier, opening_float: f, status: "Open", opened_at: row.openedAt }).single().run();
        if (header?.id) shifts.setRows((prev) => prev.map((s) => (s.id === row.id ? { ...s, dbId: header.id } : s)));
      } catch (_e) { notify("Opened locally, but the server update failed.", "error"); }
    }
  }

  async function addMove() {
    const amt = Number(move.amount);
    if (!open || isNaN(amt) || amt <= 0) { notify("Enter an amount above zero.", "error"); return; }
    const row = { id: `CM-${Date.now()}`, shiftId: open.dbId || open.id, kind: move.kind, amount: amt, reason: move.reason.trim() };
    moves.setRows((prev) => [row, ...prev]);
    setMove({ kind: move.kind, amount: "", reason: "" });
    notify(`${row.kind} of TZS ${money(amt)}k recorded — expected cash updated.`);
    if (IS_CONFIGURED && open.dbId) {
      try { await sb("pos_cash_movements").insert({ shift_id: open.dbId, kind: row.kind, amount: amt, reason: row.reason || null }).run(); } catch (_e) { notify("Recorded locally, but the server update failed.", "error"); }
    }
  }

  async function closeShift() {
    if (!open || variance === null) { notify("Count the drawer first — a shift closed without a count proves nothing.", "error"); return; }
    const closedAt = new Date().toISOString();
    const verdict = variance === 0 ? "balanced exactly" : variance < 0 ? `SHORT by TZS ${money(Math.abs(variance))}k` : `OVER by TZS ${money(variance)}k`;
    shifts.setRows((prev) => prev.map((s) => (s.id === open.id ? { ...s, status: "Closed", countedCash: counted, closedAt } : s)));
    notify(`Shift closed — drawer ${verdict}.`, variance === 0 ? "success" : "error");
    logAudit("POS shift closed", "Point of Sale", `${open.cashier}: expected ${money(Math.round(expected))}k, counted ${money(counted)}k — ${verdict}`, currentUser?.name || "Cashier");
    setCountDraft("");
    if (IS_CONFIGURED && open.dbId) {
      try { await sb("pos_shifts").eq("id", open.dbId).update({ status: "Closed", counted_cash: counted, closed_at: closedAt }).run(); } catch (_e) { notify("Closed locally, but the server update failed.", "error"); }
    }
  }

  const Row = ({ label, value, strong }) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t border-slate-200 mt-1 pt-2" : ""}`}>
      <span className={`text-[12px] ${strong ? "font-semibold text-[#111827]" : "text-slate-500"}`}>{label}</span>
      <span className={`text-[12.5px] font-mono ${strong ? "font-bold text-[#111827]" : "text-slate-600"}`}>{value}</span>
    </div>
  );

  if (!open) {
    const last = shifts.rows.find((s) => s.status === "Closed");
    const lastVar = last && last.countedCash !== null ? null : null;
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[13.5px] font-semibold text-[#111827]">No shift open</p>
            <p className="text-[11px] text-slate-400">Count the drawer and open a shift before selling — sales rung with no shift open are recorded, but reconcile to nothing.</p>
          </div>
          <div className="flex gap-2 items-center shrink-0">
            <input type="number" min="0" className={inputClass + " w-36"} value={floatDraft} onChange={(e) => setFloatDraft(e.target.value)} placeholder="Opening float (TZS k)" />
            <button onClick={openShift} className="btn-primary text-white text-[12px] font-medium rounded-lg px-3.5 py-2 shrink-0">Open Shift</button>
          </div>
        </div>
        {last && <p className="text-[10.5px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100">Last shift: {last.cashier} · closed {(last.closedAt || "").slice(0, 16).replace("T", " ")} · counted TZS {money(last.countedCash ?? 0)}k</p>}
      </div>
    );
  }

  const mins = Math.max(0, Math.round((now - new Date(open.openedAt)) / 60000));
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
          <p className="text-[13.5px] font-semibold text-[#111827]">Shift open — {open.cashier}</p>
          <span className="text-[11px] text-slate-400">{Math.floor(mins / 60)}h {mins % 60}m</span>
        </div>
        <button onClick={closeShift} className="text-[12px] font-medium bg-[#F59E0B] text-white rounded-lg px-3.5 py-2 shrink-0">Close Shift &amp; Reconcile</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div><p className="text-[10.5px] text-slate-400">Transactions</p><p className="text-[15px] font-mono font-bold text-[#111827]">{sales.count}</p></div>
        <div><p className="text-[10.5px] text-slate-400">Total Sales</p><p className="text-[15px] font-mono font-bold text-[#111827]">{money(Math.round(sales.gross))}k</p></div>
        <div><p className="text-[10.5px] text-slate-400">Cash Sales</p><p className="text-[15px] font-mono font-bold text-[#16A34A]">{money(Math.round(sales.cash))}k</p></div>
        <div><p className="text-[10.5px] text-slate-400">Non-cash Sales</p><p className="text-[15px] font-mono font-bold text-slate-500">{money(Math.round(sales.other))}k</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
        <div>
          <p className="text-[12px] font-semibold text-[#111827] mb-1">Cash Drawer</p>
          <Row label="Opening float" value={`${money(open.openingFloat)}k`} />
          <Row label="+ Cash sales" value={`${money(Math.round(sales.cash))}k`} />
          <Row label="+ Pay ins" value={`${money(payIns)}k`} />
          <Row label="− Pay outs" value={`${money(payOuts)}k`} />
          <Row label="Expected in drawer" value={`TZS ${money(Math.round(expected))}k`} strong />
          <div className="flex gap-2 items-center mt-2.5">
            <input type="number" className={inputClass} value={countDraft} onChange={(e) => setCountDraft(e.target.value)} placeholder="Counted cash (TZS k)" />
          </div>
          {variance !== null && (
            <div className="mt-2 rounded-lg px-3 py-2" style={{ backgroundColor: variance === 0 ? "#DCFCE7" : variance < 0 ? "#FEE2E2" : "#FEF3C7" }}>
              <p className="text-[12px] font-semibold" style={{ color: variance === 0 ? "#16A34A" : variance < 0 ? "#EF4444" : "#92400E" }}>
                {variance === 0 ? "Balanced exactly." : variance < 0 ? `SHORT by TZS ${money(Math.abs(variance))}k` : `OVER by TZS ${money(variance)}k`}
              </p>
              {variance !== 0 && <p className="text-[10px] mt-0.5" style={{ color: variance < 0 ? "#991B1B" : "#92400E" }}>{variance < 0 ? "Money left the till without a sale — or a sale was miskeyed." : "Over is not good news: a customer was likely overcharged, or a sale never got rung."}</p>}
            </div>
          )}
        </div>

        <div>
          <p className="text-[12px] font-semibold text-[#111827] mb-1">Pay In / Pay Out</p>
          <p className="text-[10.5px] text-slate-400 mb-2">Any money crossing the till that is not a sale — a float top-up, petty cash, or a refund paid out from an earlier shift. Without these, expected cash is a lie the moment anyone opens the drawer.</p>
          <div className="flex flex-wrap gap-2">
            <select className={inputClass + " max-w-[110px]"} value={move.kind} onChange={(e) => setMove({ ...move, kind: e.target.value })}>
              <option>Pay In</option><option>Pay Out</option>
            </select>
            <input type="number" min="0" className={inputClass + " max-w-[110px]"} value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} placeholder="TZS k" />
            <input className={inputClass + " flex-1 min-w-[120px]"} value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} placeholder="Reason" />
            <button onClick={addMove} className="btn-primary text-white text-[12px] font-medium rounded-lg px-3 py-2 shrink-0">Record</button>
          </div>
          {mine.length > 0 && (
            <div className="mt-2.5 space-y-1">
              {mine.slice(0, 4).map((m) => (
                <div key={m.id} className="flex justify-between text-[11.5px]">
                  <span className="text-slate-500 truncate">{m.kind}{m.reason ? ` · ${m.reason}` : ""}</span>
                  <span className={`font-mono shrink-0 ml-2 ${m.kind === "Pay In" ? "text-[#16A34A]" : "text-[#EF4444]"}`}>{m.kind === "Pay In" ? "+" : "−"}{money(m.amount)}k</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function POS({ inventory, transactionsHook, company, currentUser }) {
  const [tab, setTab] = useState("checkout");
  const transactions = transactionsHook;

  const todayStr = TODAY.toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const today = transactions.rows.filter((t) => t.date === todayStr);
    const revenue = today.reduce((s, t) => s + t.items.reduce((si, it) => si + it.qty * it.price, 0) * (1 + TAX_RATE), 0);
    const itemsSold = today.reduce((s, t) => s + t.items.reduce((si, it) => si + it.qty, 0), 0);
    return { count: today.length, revenue, itemsSold, avg: today.length ? revenue / today.length : 0 };
  }, [transactions.rows, todayStr]);

  const POS_KPIS = [
    { label: "Today's Sales", value: `TZS ${money(Math.round(stats.revenue))}k`, delta: "Incl. VAT", up: true, icon: CircleDollarSign },
    { label: "Transactions", value: String(stats.count), delta: "Today", up: true, icon: Receipt },
    { label: "Items Sold", value: String(stats.itemsSold), delta: "Today", up: true, icon: ShoppingBag },
    { label: "Avg Basket", value: `TZS ${money(Math.round(stats.avg))}k`, delta: "Per sale today", up: true, icon: Percent },
  ];

  return (
    <div className="space-y-5">
      <PosShiftPanel transactions={transactions} currentUser={currentUser} />
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Point of Sale</h1>
        <p className="text-[13px] text-slate-500 mt-1">Counter checkout, priced and stocked from live Inventory</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {POS_TABS.map((t) => {
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
        {POS_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {tab === "checkout" && <Checkout inventory={inventory} transactions={transactions} company={company} />}
      {tab === "history" && <RegisterHistory transactions={transactions} inventory={inventory} company={company} />}
    </div>
  );
}

export function Checkout({ inventory, transactions, company }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState([]); // [{ sku, name, price, qty }]
  const [method, setMethod] = useState("Cash");
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);

  // POS sells the same physical stock Inventory tracks, priced with the
  // same retail markup the storefront uses — one product, one price,
  // regardless of which counter it's sold from.
  const products = useMemo(
    () => inventory.rows.map((it) => ({ ...it, price: Math.round(it.unitCost * MARKUP) })),
    [inventory.rows]
  );
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = category === "all" || p.category === category;
      const matchesQ = !query.trim() || p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase());
      return matchesCat && matchesQ;
    });
  }, [products, category, query]);

  function addToCart(item) {
    const stock = inventory.rows.find((it) => it.sku === item.sku)?.qty || 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.sku === item.sku);
      if (existing) {
        if (existing.qty >= stock) {
          notify(`Only ${stock} ${item.unit} of ${item.name} in stock`, "error");
          return prev;
        }
        return prev.map((c) => (c.sku === item.sku ? { ...c, qty: c.qty + 1 } : c));
      }
      if (stock <= 0) {
        notify(`${item.name} is out of stock`, "error");
        return prev;
      }
      return [...prev, { sku: item.sku, name: item.name, price: item.price, qty: 1, unit: item.unit }];
    });
  }

  function changeQty(sku, delta) {
    setCart((prev) => prev
      .map((c) => (c.sku === sku ? { ...c, qty: c.qty + delta } : c))
      .filter((c) => c.qty > 0));
  }

  const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;

  async function completeSale() {
    if (cart.length === 0 || busy) return;

    // Final stock-sufficiency check against live Inventory right before
    // committing — the cart could have gone stale if stock moved elsewhere
    // (a sales order fulfilled, a work order completed) while shopping.
    const shortages = cart.filter((c) => {
      const stock = inventory.rows.find((it) => it.sku === c.sku)?.qty || 0;
      return c.qty > stock;
    });
    if (shortages.length) {
      notify(`Not enough stock for: ${shortages.map((s) => s.name).join(", ")}`, "error");
      return;
    }

    setBusy(true);
    const draft = { id: docId("POS"), cashier: currentUser?.name || "You", method, date: TODAY.toISOString().slice(0, 10), createdAt: new Date().toISOString(), items: cart.map((c) => ({ sku: c.sku, name: c.name, qty: c.qty, price: c.price })), returns: [] };

    // Deduct sold quantities from the shared Inventory table immediately —
    // the same table Inventory, Manufacturing, and Sales all read.
    inventory.setRows((prev) => prev.map((it) => {
      const line = cart.find((c) => c.sku === it.sku);
      return line ? { ...it, qty: Math.max(0, it.qty - line.qty) } : it;
    }));
    transactions.setRows((prev) => [draft, ...prev]);

    if (IS_CONFIGURED) {
      try {
        const header = await sb("pos_transactions").insert({
          doc_number: draft.id, payment_method: method, subtotal, tax, total,
        }).single().run();
        if (header?.id) {
          await sb("pos_transaction_items").insert(
            cart.map((c) => ({ transaction_id: header.id, item_name: c.name, item_sku: c.sku, qty: c.qty, price: c.price }))
          ).run();
          transactions.setRows((prev) => prev.map((t) => (t.id === draft.id ? { ...t, dbId: header.id } : t)));
        }
        for (const c of cart) {
          const item = inventory.rows.find((it) => it.sku === c.sku);
          const newQty = Math.max(0, (item?.qty || 0) - c.qty);
          await sb("inventory_items").eq("sku", c.sku).update({ qty_on_hand: newQty }).run();
          await sb("inventory_stock_movements").insert({ item_id: c.sku, movement: "Out", qty: c.qty, reference: `${draft.id} sale` }).run();
        }
      } catch (e) {
        notify("Sale completed locally, but saving to the server failed.", "error");
      }
    }

    notify(`Sale complete — TZS ${money(total)}k`);
    setReceipt({ ...draft, subtotal, tax, total });
    setCart([]);
    setBusy(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
      {/* Product picker */}
      <div className="space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
            <button
              onClick={() => setCategory("all")}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${category === "all" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}
            >
              All
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
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or scan SKU..."
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((p) => {
            const status = stockStatus(p.qty, p.reorder);
            const outOfStock = status === "Out of Stock";
            return (
              <button
                key={p.sku}
                onClick={() => addToCart(p)}
                disabled={outOfStock}
                className={`text-left bg-white rounded-xl border border-slate-200/80 shadow-sm p-3.5 transition-all ${
                  outOfStock ? "opacity-40 cursor-not-allowed" : "hover:border-[#16A34A]/50 hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                <div
                  className="h-16 rounded-lg mb-2.5 flex items-center justify-center"
                  style={{ background: CATEGORY_GRADIENT[p.category] || "linear-gradient(135deg, #111827, #16A34A)" }}
                >
                  <Package size={20} strokeWidth={1.5} className="text-white/85" />
                </div>
                <p className="text-[12.5px] font-medium text-[#111827] leading-snug line-clamp-2 min-h-[32px]">{p.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[13px] font-mono font-semibold text-[#111827]">{money(p.price)}k</span>
                  <span className="text-[10.5px] text-slate-400 font-mono">{outOfStock ? "0 left" : `${p.qty} left`}</span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
              <EmptyState icon={Search} title="No products found" hint="Try a different search term or category." />
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 lg:sticky lg:top-0 flex flex-col">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3 flex items-center gap-2">
          <ShoppingBag size={15} /> Current Sale
        </h3>

        {cart.length === 0 ? (
          <p className="text-[12.5px] text-slate-400 py-8 text-center">Tap a product to add it to the sale.</p>
        ) : (
          <div className="space-y-2.5 mb-4 max-h-[320px] overflow-y-auto">
            {cart.map((c) => (
              <div key={c.sku} className="flex items-center gap-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[#111827] truncate">{c.name}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{money(c.price)}k each</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => changeQty(c.sku, -1)} aria-label={`Decrease ${c.name} quantity`} className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                    <Minus size={11} />
                  </button>
                  <span className="text-[12.5px] font-mono w-5 text-center">{c.qty}</span>
                  <button onClick={() => changeQty(c.sku, 1)} aria-label={`Increase ${c.name} quantity`} className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                    <Plus size={11} />
                  </button>
                </div>
                <span className="text-[12.5px] font-mono text-[#111827] w-14 text-right shrink-0">{money(c.qty * c.price)}k</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-[12.5px] mb-4">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">TZS {money(subtotal)}k</span></div>
          <div className="flex justify-between text-slate-500"><span>VAT ({Math.round(TAX_RATE * 100)}%)</span><span className="font-mono">TZS {money(tax)}k</span></div>
          <div className="flex justify-between text-[#111827] font-semibold text-[14px] pt-1.5 border-t border-slate-100"><span>Total</span><span className="font-mono">TZS {money(total)}k</span></div>
        </div>

        <div className="mb-4">
          <p className="text-[11px] font-medium text-slate-500 mb-2">Payment method</p>
          <div className="grid grid-cols-3 gap-1.5">
            {POS_PAYMENT_METHODS.map((m) => {
              const Icon = m === "Cash" ? Banknote : m === "Card" ? CreditCard : Smartphone;
              return (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`flex flex-col items-center gap-1 text-[10.5px] font-medium rounded-lg py-2 border transition-colors ${
                    method === m ? "border-[#16A34A] bg-[#16A34A]/8 text-[#111827]" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={15} /> {m}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={completeSale}
          disabled={cart.length === 0 || busy}
          className="btn-primary text-white text-[13px] font-semibold rounded-lg py-3 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Processing..." : `Complete Sale · TZS ${money(total)}k`}
        </button>
      </div>

      {receipt && <ReceiptPanel receipt={receipt} onClose={() => setReceipt(null)} company={company} />}
    </div>
  );
}

export function ReceiptPanel({ receipt, onClose, allowReturn, onOpenReturn, company }) {
  const returns = receipt.returns || [];
  const refunded = returns.reduce((s, r) => s + r.refundTotal, 0);
  const fullyReturned = receipt.items.every((it) => {
    const returnedQty = returns.reduce((s, r) => s + (r.items.find((ri) => ri.sku === it.sku)?.qty || 0), 0);
    return returnedQty >= it.qty;
  });

  // A real bug fixed here, not just a new feature added: this button had
  // no onClick handler at all before this pass — clicking "Print
  // Receipt" did nothing, silently. Fixed with a genuine print function
  // that opens a real, separate print document sized to the company's
  // actual configured receipt width (58mm, 80mm, or A4) rather than
  // printing whatever happens to be on screen, honoring the real
  // header/footer/logo preferences set in Settings.
  function printReceipt() {
    const width = company?.receiptWidth || "80mm";
    const showLogo = company?.receiptShowLogo !== false;
    const footer = company?.receiptFooter || "Thank you for your business!";
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) { notify("Pop-up blocked — allow pop-ups to print receipts.", "error"); return; }
    const itemRows = receipt.items.map((it) => `<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${it.qty}× ${it.name}</span><span>${money(it.qty * it.price)}k</span></div>`).join("");
    win.document.write(`
      <html><head><title>Receipt ${receipt.id}</title>
      <style>
        body { font-family: monospace; padding: 12px; max-width: ${width === "A4" ? "210mm" : width}; margin: 0 auto; font-size: ${width === "58mm" ? "10px" : "12px"}; }
        h2 { text-align: center; margin: 4px 0; }
        hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
        .total { display:flex; justify-content:space-between; font-weight:bold; margin-top: 6px; }
        .footer { text-align:center; margin-top: 14px; font-size: 0.9em; }
      </style></head>
      <body>
        ${showLogo ? "<h2>" + (company?.name || "Receipt") + "</h2>" : ""}
        <p style="text-align:center;margin:0;">${receipt.id} · ${TODAY.toISOString().slice(0, 10)}</p>
        <hr />
        ${itemRows}
        <hr />
        <div class="total"><span>Total</span><span>TZS ${money(receipt.total)}k</span></div>
        <div class="footer">${footer}</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#16A34A14" }}>
              <CheckCircle2 size={18} className="text-[#16A34A]" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-mono">{receipt.id}</p>
              <h2 className="text-[16px] font-semibold text-[#111827]">{allowReturn ? "Receipt" : "Sale Complete"}</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {fullyReturned && (
          <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5 mb-4 w-fit" style={{ backgroundColor: "#EF444414", color: "#EF4444" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" /> Fully returned
          </span>
        )}

        <div className="border border-slate-100 rounded-lg overflow-hidden mb-5">
          {receipt.items.map((it, i) => (
            <div key={i} className={`flex items-center justify-between px-3 py-2.5 text-[13px] ${i !== receipt.items.length - 1 ? "border-b border-slate-50" : ""}`}>
              <div>
                <p className="text-slate-700">{it.name}</p>
                <p className="text-[11px] text-slate-400 font-mono">{it.qty} × TZS {money(it.price)}k</p>
              </div>
              <span className="font-mono text-[#111827]">{money(it.qty * it.price)}k</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 text-[13px] mb-6">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">TZS {money(receipt.subtotal)}k</span></div>
          <div className="flex justify-between text-slate-500"><span>VAT ({Math.round(TAX_RATE * 100)}%)</span><span className="font-mono">TZS {money(receipt.tax)}k</span></div>
          <div className="flex justify-between text-[#111827] font-semibold text-[14px] pt-1.5 border-t border-slate-100"><span>Total Paid</span><span className="font-mono">TZS {money(receipt.total)}k</span></div>
          {refunded > 0 && (
            <div className="flex justify-between text-[#EF4444] font-medium pt-1"><span>Refunded</span><span className="font-mono">−{money(refunded)}k</span></div>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-4">
          <Receipt size={14} className="text-slate-400" /> Paid via {receipt.method}
        </div>

        {returns.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] text-slate-400 mb-2 uppercase tracking-wide">Returns</p>
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              {returns.map((r) => (
                <div key={r.id} className="px-3 py-2.5 text-[13px] border-b border-slate-50 last:border-0">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-700">{r.reason}</p>
                    <span className="font-mono text-[#EF4444]">−{money(r.refundTotal)}k</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">{r.date} · {r.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex flex-col gap-2">
          <button onClick={printReceipt} className="flex items-center justify-center gap-1.5 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
            <Printer size={13} /> Print Receipt
          </button>
          {allowReturn && !fullyReturned && (
            <button
              onClick={onOpenReturn}
              className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2.5 hover:bg-[#EF4444]/5 transition-colors"
            >
              <ArrowUpDown size={13} /> Process Return
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReturnFormPanel({ transaction, onClose, onSubmit }) {
  // How much of each line item has already been returned, across every
  // prior return on this transaction — you can't return more than remains.
  const remaining = transaction.items.map((it) => {
    const alreadyReturned = (transaction.returns || []).reduce(
      (s, r) => s + (r.items.find((ri) => ri.sku === it.sku)?.qty || 0), 0
    );
    return { ...it, maxQty: it.qty - alreadyReturned };
  }).filter((it) => it.maxQty > 0);

  const [qtys, setQtys] = useState(() => Object.fromEntries(remaining.map((it) => [it.sku, 0])));
  const [reason, setReason] = useState(RETURN_REASONS[0]);

  function setQty(sku, val, max) {
    setQtys((q) => ({ ...q, [sku]: Math.max(0, Math.min(max, val)) }));
  }

  const returnItems = remaining.filter((it) => qtys[it.sku] > 0).map((it) => ({ sku: it.sku, name: it.name, qty: qtys[it.sku], price: it.price }));
  const refundSubtotal = returnItems.reduce((s, it) => s + it.qty * it.price, 0);
  const refundTotal = Math.round(refundSubtotal * (1 + TAX_RATE));
  const valid = returnItems.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{transaction.id}</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Process Return</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Select items and quantities to return</p>
            <div className="space-y-2.5">
              {remaining.map((it) => (
                <div key={it.sku} className="flex items-center gap-2.5 border border-slate-100 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-[#111827] truncate">{it.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">Up to {it.maxQty} returnable · {money(it.price)}k each</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => setQty(it.sku, qtys[it.sku] - 1, it.maxQty)} className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" aria-label={`Decrease ${it.name} return quantity`}>
                      <Minus size={11} />
                    </button>
                    <span className="text-[12.5px] font-mono w-5 text-center">{qtys[it.sku]}</span>
                    <button type="button" onClick={() => setQty(it.sku, qtys[it.sku] + 1, it.maxQty)} className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" aria-label={`Increase ${it.name} return quantity`}>
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              ))}
              {remaining.length === 0 && <p className="text-[12.5px] text-slate-400">Every item on this receipt has already been returned.</p>}
            </div>
          </div>

          <FormField label="Reason">
            <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </FormField>

          {valid && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-[12.5px]">
              <div className="flex justify-between text-slate-500"><span>Refund subtotal</span><span className="font-mono">TZS {money(refundSubtotal)}k</span></div>
              <div className="flex justify-between text-slate-500"><span>VAT ({Math.round(TAX_RATE * 100)}%)</span><span className="font-mono">TZS {money(Math.round(refundSubtotal * TAX_RATE))}k</span></div>
              <div className="flex justify-between text-[#EF4444] font-semibold pt-1 border-t border-slate-200 mt-1"><span>Total refund</span><span className="font-mono">TZS {money(refundTotal)}k</span></div>
            </div>
          )}

          <p className="text-[11.5px] text-slate-400">Returned quantities are restocked to Inventory immediately.</p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit({ items: returnItems, reason, refundTotal })}
            className="flex-1 text-[12px] font-medium bg-[#EF4444] text-white rounded-lg py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Refund TZS {money(refundTotal)}k
          </button>
        </div>
      </div>
    </div>
  );
}

export function RegisterHistory({ transactions, inventory, company }) {
  const [selected, setSelected] = useState(null);
  const [returning, setReturning] = useState(null);
  const { rows, setRows, loading } = transactions;

  async function processReturn(transaction, { items, reason, refundTotal }) {
    const returnRecord = { id: `RET-${Date.now()}`, items, reason, refundTotal, date: TODAY.toISOString().slice(0, 10) };

    // Restock returned quantities to the shared Inventory immediately.
    inventory.setRows((prev) => prev.map((it) => {
      const line = items.find((ri) => ri.sku === it.sku);
      return line ? { ...it, qty: it.qty + line.qty } : it;
    }));

    setRows((prev) => prev.map((t) => (t.id === transaction.id ? { ...t, returns: [returnRecord, ...(t.returns || [])] } : t)));
    setSelected((s) => (s && s.id === transaction.id ? { ...s, returns: [returnRecord, ...(s.returns || [])] } : s));
    setReturning(null);
    notify(`Return processed — TZS ${money(refundTotal)}k refunded, stock restocked`);

    if (IS_CONFIGURED && transaction.dbId) {
      try {
        const header = await sb("pos_returns").insert({
          transaction_id: transaction.dbId, reason, refund_total: refundTotal,
        }).single().run();
        if (header?.id) {
          await sb("pos_return_items").insert(
            items.map((it) => ({ return_id: header.id, item_name: it.name, item_sku: it.sku, qty: it.qty, price: it.price }))
          ).run();
        }
        for (const it of items) {
          const item = inventory.rows.find((i) => i.sku === it.sku);
          const newQty = (item?.qty || 0) + it.qty;
          await sb("inventory_items").eq("sku", it.sku).update({ qty_on_hand: newQty }).run();
          await sb("inventory_stock_movements").insert({ item_id: it.sku, movement: "In", qty: it.qty, reference: `${transaction.id} return` }).run();
        }
      } catch (e) {
        notify("Return processed locally, but saving to the server failed.", "error");
      }
    }
  }

  // Daily sales for last 7 days
  const last7 = useMemo(() => {
    return Array.from({length:7}, (_,i) => {
      const d = new Date(TODAY);
      d.setDate(d.getDate()-6+i);
      const ds = d.toISOString().slice(0,10);
      const dayTxns = rows.filter(t => t.date === ds);
      const revenue = dayTxns.reduce((s,t) => s + t.items.reduce((si,it)=>si+it.qty*it.price,0)*(1+TAX_RATE), 0);
      const txns    = dayTxns.length;
      return { day:d.toLocaleDateString("en",{weekday:"short"}), revenue:Math.round(revenue), txns };
    });
  }, [rows]);

  const totalRevenue = rows.reduce((s,t) => s + t.items.reduce((si,it)=>si+it.qty*it.price,0)*(1+TAX_RATE), 0);
  const totalTxns    = rows.length;
  const avgBasket    = totalTxns > 0 ? totalRevenue/totalTxns : 0;

  return (
    <div className="space-y-4">
      {/* 7-day sales chart */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[#111827]">Sales — Last 7 Days</h3>
            <p className="text-[11.5px] text-slate-400">Revenue trend · TZS thousands</p>
          </div>
          <div className="flex gap-4 text-[12px]">
            {[["Total Revenue","TZS "+money(Math.round(totalRevenue))+"k","#16A34A"],["Transactions",totalTxns,"#2563EB"],["Avg Basket","TZS "+money(Math.round(avgBasket))+"k","#7C3AED"]].map(([l,v,col])=>(
              <div key={l} className="text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{l}</p>
                <p className="text-[15px] font-bold" style={{color:col}}>{v}</p>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={last7} margin={{left:-10,right:4,top:0,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#F3F4F6"/>
            <XAxis dataKey="day" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
            <YAxis yAxisId="left"  tick={{fontSize:10}} axisLine={false} tickLine={false}/>
            <YAxis yAxisId="right" orientation="right" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={(v,n)=>[n==="revenue"?"TZS "+money(v)+"k":v+" txns",n==="revenue"?"Revenue":"Transactions"]}/>
            <Bar  yAxisId="left"  dataKey="revenue" fill="#16A34A18" stroke="#16A34A" strokeWidth={1} radius={[4,4,0,0]} name="revenue"/>
            <Line yAxisId="left"  dataKey="revenue" stroke="#16A34A" strokeWidth={2.5} dot={{r:3,fill:"#16A34A"}} type="monotone" name="revenue-line"/>
            <Line yAxisId="right" dataKey="txns"    stroke="#7C3AED" strokeWidth={2}   dot={{r:3,fill:"#7C3AED"}} type="monotone" strokeDasharray="4 2" name="txns"/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[680px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Receipt</th>
              <th className="px-4 py-3 font-medium">Cashier</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium text-right">Items</th>
              <th className="px-4 py-3 font-medium text-right">Total (TZS 000)</th>
            </tr>
          </thead>
          <tbody>
            {loading && <SkeletonRows cols={6} />}
            {!loading && rows.map((t) => {
              const total = Math.round(t.items.reduce((s, it) => s + it.qty * it.price, 0) * (1 + TAX_RATE));
              const hasReturns = (t.returns || []).length > 0;
              return (
                <tr key={t.id} onClick={() => setSelected(t)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-[#111827]">
                    {t.id}
                    {hasReturns && <span className="ml-1.5 text-[10px] font-sans font-medium text-[#EF4444]">· returned</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{t.cashier}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono">{t.date}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{ backgroundColor: `${POS_PAYMENT_COLOR[t.method]}14`, color: POS_PAYMENT_COLOR[t.method] }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: POS_PAYMENT_COLOR[t.method] }} />
                      {t.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">{t.items.reduce((s, it) => s + it.qty, 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(total)}</td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={Receipt} title="No sales recorded yet" hint="Completed sales from the Checkout tab will appear here." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ReceiptPanel
          receipt={{ ...selected, subtotal: Math.round(selected.items.reduce((s, it) => s + it.qty * it.price, 0)), tax: Math.round(selected.items.reduce((s, it) => s + it.qty * it.price, 0) * TAX_RATE), total: Math.round(selected.items.reduce((s, it) => s + it.qty * it.price, 0) * (1 + TAX_RATE)) }}
          onClose={() => setSelected(null)}
          allowReturn
          onOpenReturn={() => setReturning(selected)}
          company={company}
        />
      )}
      {returning && (
        <ReturnFormPanel
          transaction={returning}
          onClose={() => setReturning(null)}
          onSubmit={(payload) => processReturn(returning, payload)}
        />
      )}
    </div>
  );
}
