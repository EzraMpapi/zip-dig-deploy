import { useState } from "react";
import {
  BarChart3, BookOpen, CalendarDays, ChefHat, Layers, Plus, Printer, QrCode, UtensilsCrossed,
  X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis,
  YAxis
} from "recharts";
import { FormField, inputClass } from "../components/ui.jsx";
import { DEPARTMENTS } from "../data/hr.jsx";
import { logAudit } from "../lib/buses.jsx";
import { docId, money } from "../lib/format.jsx";
import { useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import {
  MENU_CATEGORIES,
  RST_MENU_SEED,
  RST_ORDERS_SEED,
  RST_RESERVATIONS_SEED,
  RST_TABLES_SEED,
  RST_WAITERS,
  TABLE_ZONES,
  TZS_FMT,
} from "../modules/Banking.jsx";

export function RestaurantModule({ currentUser, company }) {
  const [tab, setTab]       = useState("floor");
  const [kitchenTab, setKitchenTab] = useState("active");
  const [menuCat, setMenuCat]   = useState("All");
  const [activeTable, setActiveTable] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [cart, setCart]         = useState([]);
  const [orderNote, setOrderNote] = useState("");
  const [selectedWaiter, setSelectedWaiter] = useState(RST_WAITERS[0]);
  const [showResvForm, setShowResvForm] = useState(false);
  const [resvForm, setResvForm] = useState({ name:"", phone:"", date:"", time:"", covers:"", table:"", note:"" });

  const tables       = useCompanyTable("rst_tables",       RST_TABLES_SEED,       { mapRow: r => r });
  const menuItems    = useCompanyTable("rst_menu",         RST_MENU_SEED,         { mapRow: r => r });
  const orders       = useCompanyTable("rst_orders",       RST_ORDERS_SEED,       { mapRow: r => r });
  const reservations = useCompanyTable("rst_reservations", RST_RESERVATIONS_SEED, { mapRow: r => r });

  const RST_RED    = "#B91C1C";
  const RST_ORANGE = "#C2410C";
  const RST_GREEN  = "#16A34A";

  const TABS = [
    { id:"floor",    label:"Table Floor",    icon: Layers },
    { id:"order",    label:"Take Order",     icon: UtensilsCrossed },
    { id:"kitchen",  label:"Kitchen Display",icon: ChefHat },
    { id:"menu",     label:"Menu Manager",   icon: BookOpen },
    { id:"reservations",label:"Reservations",icon: CalendarDays },
    { id:"reports",  label:"Reports",        icon: BarChart3 },
  ];

  // Analytics
  const todayOrders  = orders.rows.filter(o=>o.status!=="Cancelled");
  const todayRevenue = todayOrders.filter(o=>o.status==="Paid").reduce((s,o)=>s+o.total,0);
  const pendingOrders= orders.rows.filter(o=>o.status==="Preparing"||o.status==="Ready");
  const occupiedTbls = tables.rows.filter(t=>t.status==="Occupied").length;
  const occupancy    = tables.rows.length>0?(occupiedTbls/tables.rows.length*100).toFixed(0):0;

  const tableStatusStyle = {
    Available:{ bg:"#F0FDF4", border:"#86EFAC",  dot:"#16A34A", text:"#15803D" },
    Occupied: { bg:"#FEF2F2", border:"#FCA5A5",  dot:"#EF4444", text:"#B91C1C" },
    Reserved: { bg:"#EFF6FF", border:"#93C5FD",  dot:"#3B82F6", text:"#1D4ED8" },
    Cleaning: { bg:"#FFFBEB", border:"#FCD34D",  dot:"#F59E0B", text:"#B45309" },
  };

  function addToCart(item) {
    setCart(prev => {
      const ex = prev.find(c=>c.id===item.id);
      if (ex) return prev.map(c=>c.id===item.id?{...c,qty:c.qty+1}:c);
      return [...prev, {...item, qty:1}];
    });
  }
  function removeFromCart(id) { setCart(p=>p.filter(c=>c.id!==id)); }
  function updateQty(id, delta) {
    setCart(p=>p.map(c=>c.id===id?{...c,qty:Math.max(1,c.qty+delta)}:c).filter(c=>c.qty>0));
  }

  const cartSubtotal = cart.reduce((s,c)=>s+c.price*c.qty,0);
  const cartTax      = Math.round(cartSubtotal * 0.1);
  const cartTotal    = cartSubtotal + cartTax;

  async function placeOrder() {
    if (!activeTable || cart.length===0) { notify("Select a table and add items","error"); return; }
    const tbl = tables.rows.find(t=>t.id===activeTable);
    const row = {
      id: docId("ORD"), table: tbl?.number||activeTable,
      waiter: selectedWaiter,
      items: cart.map(c=>({id:c.id,name:c.name,qty:c.qty,price:c.price})),
      subtotal: cartSubtotal, tax: cartTax, total: cartTotal,
      paid: 0, status:"Preparing", timeIn: new Date().toTimeString().slice(0,5), note: orderNote, kitchen:"In Progress"
    };
    orders.setRows(p=>[row,...p]);
    tables.setRows(p=>p.map(t=>t.id===activeTable?{...t,status:"Occupied",waiter:selectedWaiter,currentOrder:row.id}:t));
    setCart([]); setOrderNote(""); setActiveTable(null);
    notify("Order "+row.id+" placed for "+tbl?.number+" — "+cart.length+" items");
    logAudit("Order: "+row.id, "Restaurant", currentUser?.name||"Waiter", "Table "+tbl?.number+", TZS "+money(cartTotal)+"k");
  }

  async function updateOrderStatus(orderId, status) {
    orders.setRows(p=>p.map(o=>o.id===orderId?{...o,status,kitchen:status==="Ready"?"Ready":status==="Paid"?"Served":"In Progress"}:o));
    if (status==="Paid") {
      const ord = orders.rows.find(o=>o.id===orderId);
      if (ord) {
        orders.setRows(p=>p.map(o=>o.id===orderId?{...o,paid:o.total}:o));
        tables.setRows(p=>p.map(t=>t.number===ord.table?{...t,status:"Cleaning",waiter:"",currentOrder:null}:t));
      }
    }
    notify("Order "+orderId+" → "+status);
  }

  async function addReservation() {
    if (!resvForm.name||!resvForm.date||!resvForm.time) return;
    const row = {...resvForm, id:docId("RES"), covers:Number(resvForm.covers)||2, status:"Pending"};
    reservations.setRows(p=>[row,...p]);
    if (resvForm.table) {
      const tblId = tables.rows.find(t=>t.number===resvForm.table)?.id;
      if (tblId) tables.setRows(p=>p.map(t=>t.id===tblId?{...t,status:"Reserved"}:t));
    }
    setResvForm({name:"",phone:"",date:"",time:"",covers:"",table:"",note:""});
    setShowResvForm(false);
    notify("Reservation for "+resvForm.name+" on "+resvForm.date);
  }

  const filteredMenu = menuCat==="All" ? menuItems.rows : menuItems.rows.filter(m=>m.category===menuCat);

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <div className="rounded-2xl px-6 py-5 relative overflow-hidden" style={{background:"linear-gradient(135deg,#7F1D1D 0%,#B91C1C 40%,#C2410C 100%)"}}>
        <div className="absolute right-6 top-3 opacity-10 text-[80px]">🍽️</div>
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><UtensilsCrossed size={22} className="text-white"/><h1 className="text-[20px] font-bold text-white">{company?.name||"Restaurant"} Management</h1></div>
            <p className="text-[12px]" style={{color:"rgba(255,255,255,.6)"}}>Tables · Orders · Kitchen · Menu · Reservations · Billing</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[["Tables",tables.rows.length],["Occupied",occupiedTbls+" ("+occupancy+"%)"],["Active Orders",pendingOrders.length],["Revenue",TZS_FMT(todayRevenue)]].map(([l,v])=>(
              <div key={l} className="text-center rounded-xl px-4 py-2" style={{background:"rgba(255,255,255,.12)"}}>
                <p className="text-[16px] font-black text-white">{v}</p>
                <p className="text-[10px] text-white/55">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-0.5 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {TABS.map(t=>{const I=t.icon;return(
          <button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1 px-3 py-2 rounded-lg text-[11.5px] font-medium transition-all whitespace-nowrap "+(tab===t.id?"text-white shadow-sm":"text-slate-500 hover:bg-slate-50")} style={{background:tab===t.id?RST_RED:"transparent"}}>
            <I size={12}/>{t.label}
            {t.id==="kitchen"&&pendingOrders.length>0&&<span className="ml-0.5 bg-yellow-400 text-yellow-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{pendingOrders.length}</span>}
          </button>
        );})}
      </div>

      {/* TABLE FLOOR */}
      {tab==="floor" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries({Available:"#16A34A",Occupied:"#EF4444",Reserved:"#3B82F6",Cleaning:"#F59E0B"}).map(([s,col])=>{
              const n=tables.rows.filter(t=>t.status===s).length;
              return <div key={s} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[22px] font-bold" style={{color:col}}>{n}</p><p className="text-[11.5px] text-slate-400 mt-0.5">{s}</p></div>;
            })}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <p className="text-[13.5px] font-semibold text-[#111827] mb-4">Restaurant Floor Plan</p>
            {TABLE_ZONES.map(zone=>{
              const zoneTables = tables.rows.filter(t=>t.zone===zone);
              if (!zoneTables.length) return null;
              return (
                <div key={zone} className="mb-5 last:mb-0">
                  <p className="text-[11.5px] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">{zone}</p>
                  <div className="flex flex-wrap gap-3">
                    {zoneTables.map(t=>{
                      const s = tableStatusStyle[t.status] || tableStatusStyle.Available;
                      const ord = t.currentOrder ? orders.rows.find(o=>o.id===t.currentOrder) : null;
                      return (
                        <div key={t.id} onClick={()=>{setActiveTable(t.id);setTab("order");}} className="w-36 rounded-2xl p-3 cursor-pointer hover:shadow-lg transition-all border-2" style={{background:s.bg,borderColor:s.border}}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{background:s.dot}}/><span className="text-[14px] font-black" style={{color:s.text}}>{t.number}</span></div>
                            <span className="text-[10px] font-medium text-slate-400">{t.seats} seats</span>
                          </div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{color:s.text}}>{t.status}</p>
                          {t.waiter&&<p className="text-[10px] text-slate-500 truncate mt-0.5">{t.waiter}</p>}
                          {ord&&<p className="text-[11px] font-bold mt-1.5" style={{color:s.text}}>TZS {money(ord.total)}k</p>}
                          {t.status==="Cleaning"&&<button onClick={e=>{e.stopPropagation();tables.setRows(p=>p.map(x=>x.id===t.id?{...x,status:"Available"}:x));notify("Table "+t.number+" ready");}} className="mt-2 w-full text-[10px] font-bold py-1 rounded-lg bg-white border" style={{color:s.text,borderColor:s.border}}>Mark Ready</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAKE ORDER */}
      {tab==="order" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Menu */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 overflow-x-auto">
                {["All",...MENU_CATEGORIES].map(cat=>(
                  <button key={cat} onClick={()=>setMenuCat(cat)} className={"px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all "+(menuCat===cat?"text-white":"text-slate-500 bg-white border border-slate-200 hover:border-red-300")} style={{background:menuCat===cat?RST_RED:"white"}}>{cat}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredMenu.map(item=>(
                <div key={item.id} onClick={()=>item.available&&addToCart(item)} className={"bg-white rounded-xl border shadow-sm p-3 cursor-pointer transition-all "+(item.available?"hover:border-red-300 hover:shadow-md":"opacity-50 cursor-not-allowed")} style={{borderColor:cart.find(c=>c.id===item.id)?"#EF4444":"#E5E7EB"}}>
                  <div className="text-[28px] mb-2 text-center">{item.image}</div>
                  <p className="text-[12.5px] font-semibold text-[#111827] leading-tight">{item.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{item.description}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[13px] font-bold" style={{color:RST_RED}}>{TZS_FMT(item.price)}</p>
                    {item.popular&&<span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700">★ Popular</span>}
                  </div>
                  {!item.available&&<p className="text-[10px] text-red-400 font-semibold mt-1">Unavailable</p>}
                  {cart.find(c=>c.id===item.id)&&<div className="mt-1.5 bg-red-600 text-white text-[10px] font-bold text-center py-0.5 rounded-lg">In Order ({cart.find(c=>c.id===item.id).qty})</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Order Ticket */}
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100" style={{background:RST_RED}}>
                <p className="text-[14px] font-bold text-white">Order Ticket</p>
                <div className="flex gap-2 mt-2">
                  <select className="flex-1 bg-white/20 text-white border border-white/30 rounded-lg px-2 py-1.5 text-[11.5px]" value={activeTable||""} onChange={e=>setActiveTable(e.target.value)}>
                    <option value="">Select Table</option>
                    {tables.rows.filter(t=>t.status==="Available"||t.status===activeTable).map(t=><option key={t.id} value={t.id}>{t.number} — {t.seats} seats ({t.zone})</option>)}
                  </select>
                  <select className="flex-1 bg-white/20 text-white border border-white/30 rounded-lg px-2 py-1.5 text-[11.5px]" value={selectedWaiter} onChange={e=>setSelectedWaiter(e.target.value)}>
                    {RST_WAITERS.map(w=><option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>
              <div className="p-3 min-h-[200px]">
                {cart.length===0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-300">
                    <UtensilsCrossed size={32}/>
                    <p className="text-[12px] mt-2">Tap menu items to add</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map(item=>(
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="text-[11.5px]">{item.image}</span>
                        <div className="flex-1 min-w-0"><p className="text-[12px] font-medium text-[#111827] truncate">{item.name}</p><p className="text-[11px] text-slate-400">{TZS_FMT(item.price)}</p></div>
                        <div className="flex items-center gap-1">
                          <button onClick={()=>updateQty(item.id,-1)} className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[14px] font-bold hover:bg-red-100 hover:text-red-600">−</button>
                          <span className="text-[12.5px] font-bold w-5 text-center">{item.qty}</span>
                          <button onClick={()=>updateQty(item.id,1)} className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[14px] font-bold hover:bg-green-100 hover:text-green-600">+</button>
                        </div>
                        <span className="text-[12px] font-bold text-[#111827] w-16 text-right">{TZS_FMT(item.price*item.qty)}</span>
                        <button onClick={()=>removeFromCart(item.id)} className="text-slate-300 hover:text-red-500"><X size={13}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {cart.length>0&&(
                <div className="border-t border-slate-100 p-3 space-y-2">
                  <input className={inputClass+" text-[12px]"} value={orderNote} onChange={e=>setOrderNote(e.target.value)} placeholder="Special instructions (optional)..."/>
                  <div className="space-y-1 text-[12.5px]">
                    <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{TZS_FMT(cartSubtotal)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Tax (10%)</span><span>{TZS_FMT(cartTax)}</span></div>
                    <div className="flex justify-between font-bold text-[14px] border-t border-slate-100 pt-1.5"><span>Total</span><span style={{color:RST_RED}}>{TZS_FMT(cartTotal)}</span></div>
                  </div>
                  <button onClick={placeOrder} className="w-full py-3 rounded-xl text-[13.5px] font-bold text-white" style={{background:RST_RED}}>
                    🍽️ Send to Kitchen
                  </button>
                  <button onClick={()=>setCart([])} className="w-full py-2 rounded-xl text-[12px] text-slate-500 border border-slate-200">Clear Order</button>
                </div>
              )}
            </div>

            {/* Active orders summary */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13px] font-semibold text-[#111827] mb-3">Active Orders</p>
              <div className="space-y-2">
                {pendingOrders.length===0?<p className="text-slate-400 text-[12px] text-center py-2">No active orders</p>:pendingOrders.map(o=>(
                  <div key={o.id} className="p-2.5 rounded-lg border border-slate-100">
                    <div className="flex justify-between items-center">
                      <div><p className="text-[12.5px] font-bold text-[#111827]">Table {o.table}</p><p className="text-[11px] text-slate-400">{o.items.length} items · {o.timeIn}</p></div>
                      <div className="flex gap-1">
                        {o.status==="Preparing"&&<button onClick={()=>updateOrderStatus(o.id,"Ready")} className="text-[10.5px] font-bold text-white px-2 py-1 rounded-lg bg-yellow-500">Ready</button>}
                        {o.status==="Ready"&&<button onClick={()=>updateOrderStatus(o.id,"Paid")} className="text-[10.5px] font-bold text-white px-2 py-1 rounded-lg bg-green-600">Bill & Pay</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KITCHEN DISPLAY */}
      {tab==="kitchen" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {[["active","Active Orders","#B91C1C"],["ready","Ready to Serve","#16A34A"],["all","All Today","#2563EB"]].map(([id,label,col])=>(
              <button key={id} onClick={()=>setKitchenTab(id)} className="px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-all" style={{background:kitchenTab===id?col:"white",color:kitchenTab===id?"white":col,border:`1.5px solid ${col}`}}>{label}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {orders.rows.filter(o=>{
              if(kitchenTab==="active") return o.status==="Preparing";
              if(kitchenTab==="ready") return o.status==="Ready";
              return o.status!=="Cancelled";
            }).map(o=>{
              const isReady=o.status==="Ready", isPreparing=o.status==="Preparing";
              return(
                <div key={o.id} className="bg-white rounded-2xl border-2 shadow-md overflow-hidden" style={{borderColor:isReady?"#16A34A":isPreparing?"#F59E0B":"#E5E7EB"}}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{background:isReady?"#16A34A":isPreparing?"#F59E0B":"#F3F4F6"}}>
                    <div className="flex items-center gap-2">
                      <span className="text-[22px] font-black text-white">{o.table}</span>
                      <div><p className="text-[11px] text-white/80">{o.waiter}</p><p className="text-[11px] text-white/70">{o.timeIn}</p></div>
                    </div>
                    <div className="text-right"><p className="text-[12px] font-bold text-white">{isReady?"✓ READY":isPreparing?"⏳ COOKING":"✅ DONE"}</p><p className="text-[10px] text-white/70">{o.id}</p></div>
                  </div>
                  <div className="p-4">
                    <div className="space-y-2.5 mb-4">
                      {o.items.map((item,i)=>(
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[22px]">{menuItems.rows.find(m=>m.id===item.id)?.image||"🍽️"}</span>
                          <div className="flex-1"><p className="text-[13.5px] font-semibold text-[#111827]">{item.name}</p>{o.note&&i===0&&<p className="text-[11px] text-orange-500 font-medium">📝 {o.note}</p>}</div>
                          <span className="text-[20px] font-black" style={{color:isPreparing?"#F59E0B":"#16A34A"}}>×{item.qty}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {isPreparing&&<button onClick={()=>updateOrderStatus(o.id,"Ready")} className="flex-1 py-2.5 rounded-xl text-[12.5px] font-bold text-white bg-green-600">✓ Mark Ready</button>}
                      {isReady&&<button onClick={()=>updateOrderStatus(o.id,"Paid")} className="flex-1 py-2.5 rounded-xl text-[12.5px] font-bold text-white" style={{background:RST_RED}}>Bill & Pay</button>}
                    </div>
                  </div>
                </div>
              );
            })}
            {orders.rows.filter(o=>kitchenTab==="active"?o.status==="Preparing":kitchenTab==="ready"?o.status==="Ready":o.status!=="Cancelled").length===0&&(
              <div className="col-span-full text-center py-16 text-slate-300"><ChefHat size={40} className="mx-auto mb-3"/><p className="text-[15px]">No {kitchenTab==="active"?"active orders":kitchenTab==="ready"?"orders ready":"orders"}</p></div>
            )}
          </div>
        </div>
      )}

      {/* MENU MANAGER */}
      {tab==="menu" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[["Menu Items",menuItems.rows.length,"#B91C1C"],["Available",menuItems.rows.filter(m=>m.available).length,"#16A34A"],["Popular",menuItems.rows.filter(m=>m.popular).length,"#F59E0B"],["Categories",MENU_CATEGORIES.length,"#7C3AED"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[22px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-[13.5px] font-semibold text-[#111827]">Menu Items</p><button onClick={()=>notify("Add menu item")} className="flex items-center gap-1 text-[12px] font-semibold text-white px-3 py-2 rounded-xl" style={{background:RST_RED}}><Plus size={12}/>Add Item</button></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["","Item","Category","Price","Cost","Margin","Prep","Popular","Available"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{menuItems.rows.map(item=>{
                const margin=item.price>0?((item.price-item.cost)/item.price*100).toFixed(0):0;
                return(
                  <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-3 py-3 text-[20px]">{item.image}</td>
                    <td className="px-3 py-3"><p className="font-medium text-[#111827]">{item.name}</p><p className="text-[11px] text-slate-400 max-w-[160px] truncate">{item.description}</p></td>
                    <td className="px-3 py-3"><span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full" style={{background:RST_RED+"15",color:RST_RED}}>{item.category}</span></td>
                    <td className="px-3 py-3 font-bold" style={{color:RST_RED}}>{TZS_FMT(item.price)}</td>
                    <td className="px-3 py-3 text-slate-400">{TZS_FMT(item.cost)}</td>
                    <td className="px-3 py-3 font-bold" style={{color:margin>50?"#16A34A":margin>30?"#F59E0B":"#EF4444"}}>{margin}%</td>
                    <td className="px-3 py-3 text-slate-500">{item.prepTime}min</td>
                    <td className="px-3 py-3">{item.popular?<span className="text-[10px] font-bold text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">★ Yes</span>:<span className="text-slate-300 text-[11px]">—</span>}</td>
                    <td className="px-3 py-3">
                      <button onClick={()=>menuItems.setRows(p=>p.map(m=>m.id===item.id?{...m,available:!m.available}:m))} className={"text-[10.5px] font-bold px-2 py-0.5 rounded-full "+(item.available?"bg-green-50 text-green-600":"bg-red-50 text-red-500")}>{item.available?"Available":"Unavail."}</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* RESERVATIONS */}
      {tab==="reservations" && (
        <div className="space-y-3">
          {!showResvForm&&<div className="flex justify-end"><button onClick={()=>setShowResvForm(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:RST_RED}}><Plus size={13}/>New Reservation</button></div>}
          {showResvForm&&(
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <p className="text-[14px] font-semibold text-[#111827]">New Reservation</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Guest Name *"><input className={inputClass} value={resvForm.name} onChange={e=>setResvForm({...resvForm,name:e.target.value})}/></FormField>
                <FormField label="Phone"><input className={inputClass} value={resvForm.phone} onChange={e=>setResvForm({...resvForm,phone:e.target.value})}/></FormField>
                <FormField label="Date *"><input type="date" className={inputClass} value={resvForm.date} onChange={e=>setResvForm({...resvForm,date:e.target.value})}/></FormField>
                <FormField label="Time *"><input type="time" className={inputClass} value={resvForm.time} onChange={e=>setResvForm({...resvForm,time:e.target.value})}/></FormField>
                <FormField label="Covers (guests)"><input type="number" min="1" className={inputClass} value={resvForm.covers} onChange={e=>setResvForm({...resvForm,covers:e.target.value})}/></FormField>
                <FormField label="Table"><select className={inputClass} value={resvForm.table} onChange={e=>setResvForm({...resvForm,table:e.target.value})}><option value="">Select table...</option>{tables.rows.filter(t=>t.status==="Available").map(t=><option key={t.id} value={t.number}>{t.number} — {t.seats} seats ({t.zone})</option>)}</select></FormField>
                <FormField label="Special Note" cls="col-span-2"><input className={inputClass} value={resvForm.note} onChange={e=>setResvForm({...resvForm,note:e.target.value})} placeholder="Birthday, Anniversary, Dietary requirements..."/></FormField>
              </div>
              <div className="flex gap-2"><button onClick={addReservation} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl" style={{background:RST_RED}}>Confirm Reservation</button><button onClick={()=>setShowResvForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button></div>
            </div>
          )}
          <div className="space-y-3">
            {reservations.rows.map(r=>{
              const sty={Confirmed:["#DCFCE7","#16A34A"],Pending:["#FEF3C7","#D97706"],Cancelled:["#FEE2E2","#EF4444"]}[r.status]||["#F3F4F6","#6B7280"];
              return(
                <div key={r.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-4 flex-wrap">
                  <div className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0" style={{background:RST_RED+"15"}}>
                    <p className="text-[10.5px] font-bold text-red-700">{r.date?.slice(5,7)}/{r.date?.slice(8,10)}</p>
                    <p className="text-[14px] font-black text-red-700">{r.time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#111827]">{r.name}</p>
                    <p className="text-[12px] text-slate-400">{r.covers} covers · Table {r.table||"TBA"} · {r.phone}</p>
                    {r.note&&<p className="text-[12px] text-orange-500 font-medium mt-0.5">📝 {r.note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:sty[0],color:sty[1]}}>{r.status}</span>
                    {r.status==="Pending"&&<button onClick={()=>reservations.setRows(p=>p.map(x=>x.id===r.id?{...x,status:"Confirmed"}:x))} className="text-[11px] font-bold text-white px-2.5 py-1 rounded-lg" style={{background:RST_RED}}>Confirm</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* REPORTS */}
      {tab==="reports" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[["Total Orders",todayOrders.length,"#B91C1C"],["Revenue",TZS_FMT(todayRevenue),"#16A34A"],["Avg Order Value",TZS_FMT(todayOrders.length>0?todayRevenue/Math.max(todayOrders.filter(o=>o.status==="Paid").length,1):0),"#2563EB"],["Tables Served",new Set(todayOrders.map(o=>o.table)).size,"#7C3AED"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[18px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Best Selling Items</p>
            {menuItems.rows.map(m=>{
              const sold=orders.rows.flatMap(o=>o.items).filter(i=>i.id===m.id).reduce((s,i)=>s+i.qty,0);
              const rev=orders.rows.flatMap(o=>o.items).filter(i=>i.id===m.id).reduce((s,i)=>s+i.price*i.qty,0);
              if(!sold)return null;
              const maxSold=Math.max(...menuItems.rows.map(mi=>orders.rows.flatMap(o=>o.items).filter(i=>i.id===mi.id).reduce((s,i)=>s+i.qty,0)));
              return(
                <div key={m.id} className="flex items-center gap-3 mb-2.5">
                  <span className="text-[18px] shrink-0">{m.image}</span>
                  <span className="text-[12.5px] text-slate-700 w-40 shrink-0 truncate">{m.name}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:(sold/maxSold*100)+"%",background:RST_RED}}/></div>
                  <span className="text-[12px] font-bold text-slate-700 w-8 text-right">{sold}×</span>
                  <span className="text-[12px] font-mono font-bold w-20 text-right" style={{color:RST_RED}}>{TZS_FMT(rev)}</span>
                </div>
              );
            }).filter(Boolean)}
          </div>

          {/* Revenue Chart — Category Breakdown */}
          {(() => {
            const catRev = menuItems.rows.reduce((m,item)=>{
              const earned = orders.rows.flatMap(o=>o.items).filter(i=>i.id===item.id).reduce((s,i)=>s+i.price*i.qty,0);
              if (!earned) return m;
              m[item.category] = (m[item.category]||0) + earned;
              return m;
            },{});
            const catData = Object.entries(catRev).sort((a,b)=>b[1]-a[1]).map(([name,value],i)=>({
              name, value:Math.round(value/1000),
              fill:["#B91C1C","#C2410C","#16A34A","#2563EB","#7C3AED"][i%5],
            }));
            if (!catData.length) return null;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                  <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Revenue by Category (TZS k)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={catData} margin={{left:0,right:10,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Revenue"]}/>
                      <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={40}>
                        {catData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                  <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Category Mix</h3>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="60%" height={160}>
                      <PieChart>
                        <Pie data={catData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                          {catData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                        </Pie>
                        <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Revenue"]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {catData.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px]">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:d.fill}}/>
                            {d.name}
                          </span>
                          <span className="text-[12px] font-bold text-slate-700">TZS {money(d.value)}k</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Print bill button */}
          {activeTable && (() => {
            const tblOrder = orders.rows.find(o=>o.tableId===activeTable&&o.status!=="Paid"&&o.status!=="Cancelled");
            if (!tblOrder) return null;
            return (
              <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-bold text-[#B91C1C]">Active order on Table {tables.rows.find(t=>t.id===activeTable)?.number}</p>
                  <p className="text-[11.5px] text-[#991B1B]">TZS {TZS_FMT(tblOrder.total)} · {tblOrder.items?.length} items</p>
                </div>
                <button
                  onClick={()=>{
                    const co=window.__smartManagerCompany||{};
                    const tbl=tables.rows.find(t=>t.id===activeTable);
                    const win=window.open("","_blank","width=420,height=640");
                    if (!win) return;
                    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Bill</title><style>
                      *{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace;font-size:13px;padding:16px;max-width:300px;margin:0 auto}
                      h2{font-size:16px;font-weight:bold;text-align:center;margin-bottom:4px}.center{text-align:center}.divider{border-top:1px dashed #999;margin:8px 0}
                      .row{display:flex;justify-content:space-between;margin:3px 0}.total{font-weight:bold;font-size:15px}.btn{display:block;width:100%;padding:10px;background:#B91C1C;color:white;border:none;font-family:monospace;font-size:13px;cursor:pointer;margin-top:12px;border-radius:8px}
                      @media print{.btn{display:none!important}}
                    </style></head><body>
                      <h2>${co.name||"Restaurant"}</h2>
                      <div class="center" style="font-size:11px;color:#666">${co.address||""} · ${co.phone||""}</div>
                      <div class="divider"></div>
                      <div class="row"><span>Table:</span><span>${tbl?.number||""}</span></div>
                      <div class="row"><span>Waiter:</span><span>${tblOrder.waiter||""}</span></div>
                      <div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()}</span></div>
                      <div class="divider"></div>
                      ${(tblOrder.items||[]).map(it=>`<div class="row"><span>${it.name} ×${it.qty}</span><span>${TZS_FMT??"TZS "+(it.price*it.qty/1000).toFixed(0)+"k"}</span></div>`).join("")}
                      <div class="divider"></div>
                      <div class="row"><span>Subtotal</span><span>TZS ${((tblOrder.total||0)/1000/1.1).toFixed(0)}k</span></div>
                      <div class="row"><span>Tax (10%)</span><span>TZS ${((tblOrder.total||0)/1000*0.1/1.1).toFixed(0)}k</span></div>
                      <div class="divider"></div>
                      <div class="row total"><span>TOTAL</span><span>TZS ${((tblOrder.total||0)/1000).toFixed(0)}k</span></div>
                      <div class="divider"></div>
                      <div class="center" style="font-size:11px;margin-top:8px">Thank you for dining with us!</div>
                      <button class="btn" onclick="window.print()">Print Bill</button>
                    </body></html>`);
                    win.document.close();
                  }}
                  className="flex items-center gap-1.5 text-[12.5px] font-bold text-white px-4 py-2 rounded-xl" style={{background:"#B91C1C"}}>
                  <Printer size={13}/> Print Bill
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── INVITE CODE FORM (inline in HR) ───────────────────── */
export function InviteCodeForm({ onGenerate }) {
  const [dept, setDept] = useState(DEPARTMENTS[0]);
  const [role, setRole] = useState("");
  return (
    <>
      <div>
        <label className="text-[11px] font-bold text-[#5B21B6] uppercase tracking-wide block mb-1">Department</label>
        <select className={inputClass} value={dept} onChange={e=>setDept(e.target.value)}>
          {DEPARTMENTS.map(d=><option key={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] font-bold text-[#5B21B6] uppercase tracking-wide block mb-1">Role / Job Title</label>
        <input className={inputClass} value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Sales Executive"/>
      </div>
      <div className="col-span-2">
        <button onClick={()=>onGenerate(dept, role||"Employee")}
          className="w-full flex items-center justify-center gap-2 text-[13px] font-bold text-white py-2.5 rounded-xl bg-[#7C3AED]">
          <QrCode size={14}/> Generate Invite Code
        </button>
      </div>
    </>
  );
}

/* ─────────────────── EMPLOYEE PORTAL SUB-COMPONENTS ─────────────────── */

// ── Announcements seed ───────────────────────────────────────────────────
export const ANNOUNCEMENTS_SEED = [
  { id:"ANN-001", title:"Q3 Performance Reviews — Reminder", body:"All employees should complete their self-assessment by July 31. Log into the Employee Portal under Profile to access your review form.", category:"HR", priority:"High",   date:"2026-07-20", author:"HR Department", pinned:true },
  { id:"ANN-002", title:"Office Closure — 7th August", body:"The office will be closed on 7th August 2026 for the public holiday. All employees should ensure pending tasks are completed by 6th August.", category:"General", priority:"Medium", date:"2026-07-18", author:"Administration", pinned:false },
  { id:"ANN-003", title:"New Health Insurance Benefits", body:"We are pleased to announce upgraded health insurance coverage for all permanent employees, effective 1st August 2026. Dental and optical cover are now included. Details will be shared by HR shortly.", category:"Benefits", priority:"High",   date:"2026-07-15", author:"HR Department", pinned:true },
  { id:"ANN-004", title:"Monthly Town Hall — Friday 3pm", body:"Join us this Friday at 3pm in the Main Conference Room (or via Zoom link shared by email) for our monthly company update. Attendance is strongly encouraged.", category:"Events",  priority:"Medium", date:"2026-07-12", author:"Management",   pinned:false },
  { id:"ANN-005", title:"Safety Drill — Next Tuesday 10am", body:"A scheduled fire safety drill will take place next Tuesday 10am. Please cooperate with the safety officer's instructions. Estimated duration: 20 minutes.", category:"Safety",  priority:"Medium", date:"2026-07-10", author:"Safety Officer",pinned:false },
];

export const ANN_CAT_COLORS = {
  HR:      ["#EFF6FF","#2563EB","#BFDBFE"],
  General: ["#F8FAFB","#374151","#E5E7EB"],
  Benefits:["#F0FDF4","#16A34A","#BBF7D0"],
  Events:  ["#F5F3FF","#7C3AED","#DDD6FE"],
  Safety:  ["#FFFBEB","#D97706","#FDE68A"],
};
