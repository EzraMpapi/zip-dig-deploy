import { useState } from "react";
import {
  BarChart3, Bed, CalendarDays, Check, CheckCircle, CircleDollarSign, Download, Hotel,
  LayoutDashboard, Printer, Sparkles, UserCheck, X
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
import { HTL_BOOKINGS_SEED, HTL_ROOMS_SEED } from "../modules/Pharmacy.jsx";
import { downloadCSV } from "../modules/Reports.jsx";

export function HotelManagementModule({ currentUser, company }) {
  const [tab, setTab]         = useState("overview");
  const [checkInForm, setCheckInForm]   = useState({ guestName:"", email:"", phone:"", nationality:"", roomId:"", checkOut:"", adults:1, children:0, purpose:"Leisure", paymentMethod:"Card", specialRequests:"" });
  const [showCheckIn, setShowCheckIn]   = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [hsTab, setHsTab]               = useState("all");

  const rooms        = useCompanyTable("htl_rooms",        HTL_ROOMS_SEED,        { mapRow: r => r });
  const bookings     = useCompanyTable("htl_bookings",     HTL_BOOKINGS_SEED,     { mapRow: r => r });

  const HTL_BLUE = "#1E3A8A";
  const HTL_GOLD = "#B8860B";

  const TABS = [
    { id:"overview",     label:"Overview",      icon: LayoutDashboard },
    { id:"rooms",        label:"Room Status",   icon: Bed },
    { id:"checkin",      label:"Check-In/Out",  icon: UserCheck },
    { id:"bookings",     label:"Bookings",      icon: CalendarDays },
    { id:"housekeeping", label:"Housekeeping",  icon: Sparkles },
    { id:"reports",      label:"Reports",       icon: BarChart3 },
  ];

  const occupied   = rooms.rows.filter(r=>r.status==="Occupied").length;
  const available  = rooms.rows.filter(r=>r.status==="Available").length;
  const cleaning   = rooms.rows.filter(r=>r.status==="Cleaning").length;
  const occupancy  = rooms.rows.length>0?(occupied/rooms.rows.length*100).toFixed(0):0;
  const revenue    = bookings.rows.filter(b=>b.status==="Checked Out"||b.status==="Active").reduce((s,b)=>s+b.paid,0);
  const adr        = occupied>0?(revenue/Math.max(occupied,1)).toFixed(0):0; // Average Daily Rate
  const revPAR     = rooms.rows.length>0?(Number(adr)*occupied/rooms.rows.length).toFixed(0):0; // Revenue Per Available Room

  const statusConfig = {
    Available:  {bg:"#F0FDF4",border:"#86EFAC",dot:"#16A34A",text:"#15803D",label:"Available"},
    Occupied:   {bg:"#EFF6FF",border:"#93C5FD",dot:"#2563EB",text:"#1D4ED8",label:"Occupied"},
    Cleaning:   {bg:"#FFFBEB",border:"#FCD34D",dot:"#F59E0B",text:"#92400E",label:"Cleaning"},
    Maintenance:{bg:"#FEF2F2",border:"#FCA5A5",dot:"#EF4444",text:"#991B1B",label:"Maintenance"},
    Reserved:   {bg:"#F5F3FF",border:"#C4B5FD",dot:"#7C3AED",text:"#5B21B6",label:"Reserved"},
  };
  const bkgStatus = {Active:["#DBEAFE","#1E40AF"],"Checked Out":["#F3F4F6","#6B7280"],Upcoming:["#DCFCE7","#16A34A"],Cancelled:["#FEE2E2","#EF4444"],NoShow:["#FEF3C7","#D97706"]};
  const Chip=({s})=>{const[bg,col]=bkgStatus[s]||["#F3F4F6","#6B7280"];return<span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:bg,color:col}}>{s}</span>;};

  async function doCheckIn() {
    if (!checkInForm.guestName||!checkInForm.roomId||!checkInForm.checkOut) return;
    const room   = rooms.rows.find(r=>r.id===checkInForm.roomId);
    const nights = Math.max(1,Math.round((new Date(checkInForm.checkOut)-new Date())/86400000));
    const total  = (room?.price||0)*nights;
    const row    = { ...checkInForm, id:docId("BKG"), room:room?.number||"", type:room?.type||"", nights, total, paid:0, source:"Front Desk", status:"Active", checkIn:TODAY.toISOString().slice(0,10) };
    bookings.setRows(p=>[row,...p]);
    rooms.setRows(p=>p.map(r=>r.id===checkInForm.roomId?{...r,status:"Occupied",currentGuest:checkInForm.guestName}:r));
    setCheckInForm({guestName:"",email:"",phone:"",nationality:"",roomId:"",checkOut:"",adults:1,children:0,purpose:"Leisure",paymentMethod:"Card",specialRequests:""});
    setShowCheckIn(false);
    notify("✓ Check-in: "+checkInForm.guestName+" → Room "+room?.number);
    logAudit("Hotel check-in: "+room?.number,"Hotel",currentUser?.name||"Front Desk",checkInForm.guestName);
  }

  function doCheckOut(bookingId) {
    const bkg = bookings.rows.find(b=>b.id===bookingId);
    if (!bkg) return;
    bookings.setRows(p=>p.map(b=>b.id===bookingId?{...b,status:"Checked Out",paid:b.total}:b));
    rooms.setRows(p=>p.map(r=>r.number===bkg.room?{...r,status:"Cleaning",currentGuest:""}:r));
    notify("Check-out: "+bkg.guest+" from Room "+bkg.room+" · Total: USD "+bkg.total);
    logAudit("Hotel check-out: "+bkg.room,"Hotel",currentUser?.name||"Front Desk",bkg.guest+" USD "+bkg.total);
  }

  const houseKeepingTasks = rooms.rows.filter(r=>r.status==="Cleaning"||r.status==="Occupied");
  const roomsByType = ["Standard","Deluxe","Suite","Presidential"];

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="rounded-2xl px-6 py-5 relative overflow-hidden" style={{background:`linear-gradient(135deg,#0F172A 0%,${HTL_BLUE} 45%,#1e40af 100%)`}}>
        <div className="absolute inset-0 opacity-5" style={{backgroundImage:"url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><path d=%22M0 30h60M30 0v60%22 stroke=%22white%22 stroke-width=%221%22 fill=%22none%22/></svg>'")}}/> 
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1"><Hotel size={22} className="text-white"/><h1 className="text-[20px] font-bold text-white">{company?.name||"Hotel"} Property Management</h1></div>
            <p className="text-[12px]" style={{color:"rgba(255,255,255,.55)"}}>Front Desk · Rooms · Check-In/Out · Housekeeping · Revenue Analytics</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[["Rooms",rooms.rows.length,""],["Occupancy",occupancy+"%",""],["ADR","USD "+adr,""],["RevPAR","USD "+revPAR,""]].map(([l,v])=>(
              <div key={l} className="text-center rounded-xl px-4 py-2.5" style={{background:"rgba(255,255,255,.1)"}}>
                <p className="text-[18px] font-black text-white">{v}</p>
                <p className="text-[10px] text-white/50">{l}</p>
              </div>
            ))}
            <button onClick={()=>setShowCheckIn(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12.5px] font-semibold text-white" style={{background:"rgba(255,255,255,.18)",border:"1px solid rgba(255,255,255,.25)"}}><UserCheck size={13}/>Check-In Guest</button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-0.5 bg-white rounded-xl p-1 border border-slate-200 overflow-x-auto">
        {TABS.map(t=>{const I=t.icon;return(
          <button key={t.id} onClick={()=>setTab(t.id)} className={"flex items-center gap-1 px-3 py-2 rounded-lg text-[11.5px] font-medium transition-all whitespace-nowrap "+(tab===t.id?"text-white shadow-sm":"text-slate-500 hover:bg-slate-50")} style={{background:tab===t.id?HTL_BLUE:"transparent"}}>
            <I size={12}/>{t.label}
            {t.id==="housekeeping"&&cleaning>0&&<span className="ml-0.5 bg-yellow-400 text-yellow-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{cleaning}</span>}
          </button>
        );})}
      </div>

      {/* OVERVIEW */}
      {tab==="overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {l:"Total Rooms",  v:rooms.rows.length,  c:HTL_BLUE,  I:Bed,          sub:"In property"},
              {l:"Occupied",     v:occupied,           c:"#2563EB",  I:UserCheck,    sub:occupancy+"% occupancy"},
              {l:"Available",    v:available,          c:"#16A34A",  I:CheckCircle,  sub:"Ready to sell"},
              {l:"Cleaning",     v:cleaning,           c:"#F59E0B",  I:Sparkles,     sub:"Being serviced"},
              {l:"Revenue",      v:"USD "+revenue,     c:HTL_GOLD,   I:CircleDollarSign, sub:"Total collected"},
            ].map(k=>(
              <div key={k.l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.l}</p><p className="text-[22px] font-bold mt-1 text-[#111827]">{k.v}</p><p className="text-[11.5px] mt-0.5" style={{color:k.c}}>{k.sub}</p></div>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:k.c+"18"}}><k.I size={16} style={{color:k.c}}/></div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Occupancy by Room Type</p>
              {roomsByType.map(type=>{
                const typeRooms=rooms.rows.filter(r=>r.type===type);
                const typeOccupied=typeRooms.filter(r=>r.status==="Occupied").length;
                const pct=typeRooms.length>0?typeOccupied/typeRooms.length*100:0;
                if(!typeRooms.length)return null;
                return(
                  <div key={type} className="flex items-center gap-2 mb-2.5">
                    <span className="text-[12px] text-slate-600 w-24 shrink-0">{type}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:pct+"%",background:pct>80?"#EF4444":pct>60?"#F59E0B":HTL_BLUE}}/></div>
                    <span className="text-[11.5px] text-slate-500 w-16 text-right">{typeOccupied}/{typeRooms.length} rooms</span>
                  </div>
                );
              }).filter(Boolean)}
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Revenue Performance</p>
              {[["Average Daily Rate (ADR)","USD "+adr,HTL_BLUE],["RevPAR","USD "+revPAR,"#16A34A"],["Total Revenue","USD "+revenue,HTL_GOLD],["Occupancy Rate",occupancy+"%","#7C3AED"]].map(([l,v,col])=>(
                <div key={l} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <span className="text-[12.5px] text-slate-500">{l}</span>
                  <span className="text-[14px] font-bold" style={{color:col}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Active Guests</p>
            {bookings.rows.filter(b=>b.status==="Active").length===0
              ?<p className="text-slate-400 text-center py-4">No guests currently checked in</p>
              :<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bookings.rows.filter(b=>b.status==="Active").map(b=>(
                  <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0" style={{background:HTL_BLUE}}>{b.guest?.charAt(0)||"G"}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#111827] truncate">{b.guest}</p>
                      <p className="text-[11.5px] text-slate-400">Room {b.room} · Check out: {b.checkOut}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12.5px] font-bold" style={{color:HTL_BLUE}}>USD {b.total}</p>
                      <button onClick={()=>doCheckOut(b.id)} className="text-[10px] font-bold text-white px-2 py-0.5 rounded-lg mt-0.5" style={{background:"#EF4444"}}>Check Out</button>
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>
        </div>
      )}

      {/* ROOM STATUS */}
      {tab==="rooms" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {Object.entries(statusConfig).map(([s,cfg])=>{
              const n=rooms.rows.filter(r=>r.status===s).length;
              return(
                <div key={s} className="flex items-center gap-2 px-4 py-2 rounded-xl border" style={{background:cfg.bg,borderColor:cfg.border}}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{background:cfg.dot}}/>
                  <span className="text-[12.5px] font-semibold" style={{color:cfg.text}}>{s}</span>
                  <span className="text-[16px] font-black" style={{color:cfg.text}}>{n}</span>
                </div>
              );
            })}
          </div>
          {["Standard","Deluxe","Suite","Presidential"].map(type=>{
            const typeRooms=rooms.rows.filter(r=>r.type===type);
            if(!typeRooms.length)return null;
            return(
              <div key={type}>
                <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{type} Rooms</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {typeRooms.map(r=>{
                    const sc=statusConfig[r.status]||statusConfig.Available;
                    const bkg=bookings.rows.find(b=>b.room===r.number&&b.status==="Active");
                    return(
                      <div key={r.id} className="rounded-2xl border-2 p-3 cursor-pointer hover:shadow-lg transition-all" style={{background:sc.bg,borderColor:sc.border}} onClick={()=>setSelectedRoom(r)}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[20px] font-black" style={{color:sc.text}}>#{r.number}</span>
                          <div className="w-2.5 h-2.5 rounded-full" style={{background:sc.dot}}/>
                        </div>
                        <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{color:sc.text}}>{r.status}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{r.beds} bed · {r.seats||"—"} guests</p>
                        {bkg&&<p className="text-[11px] font-semibold mt-1.5 truncate" style={{color:sc.text}}>{bkg.guest}</p>}
                        <p className="text-[12px] font-bold mt-1.5" style={{color:HTL_BLUE}}>USD {r.price}<span className="text-[10px] font-normal text-slate-400">/night</span></p>
                        {r.status==="Available"&&<button onClick={e=>{e.stopPropagation();setCheckInForm(f=>({...f,roomId:r.id}));setShowCheckIn(true);}} className="mt-2 w-full text-[10.5px] font-bold py-1.5 rounded-lg text-white" style={{background:HTL_BLUE}}>Check In</button>}
                        {r.status==="Cleaning"&&<button onClick={e=>{e.stopPropagation();rooms.setRows(p=>p.map(x=>x.id===r.id?{...x,status:"Available"}:x));notify("Room "+r.number+" is now available");}} className="mt-2 w-full text-[10.5px] font-bold py-1.5 rounded-lg border" style={{color:sc.text,borderColor:sc.border,background:"white"}}>Mark Ready ✓</button>}
                        {r.status==="Occupied"&&bkg&&<button onClick={e=>{e.stopPropagation();doCheckOut(bkg.id);}} className="mt-2 w-full text-[10.5px] font-bold py-1.5 rounded-lg text-white bg-red-500">Check Out</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CHECK IN/OUT */}
      {tab==="checkin" && (
        <div className="space-y-4">
          {!showCheckIn&&<div className="flex justify-end"><button onClick={()=>setShowCheckIn(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2.5 rounded-xl" style={{background:HTL_BLUE}}><UserCheck size={13}/>Check-In Guest</button></div>}
          {showCheckIn&&(
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between"><h3 className="text-[15px] font-bold text-[#111827]">Guest Check-In</h3><button onClick={()=>setShowCheckIn(false)} className="text-slate-400"><X size={16}/></button></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Guest Full Name *"><input className={inputClass} value={checkInForm.guestName} onChange={e=>setCheckInForm({...checkInForm,guestName:e.target.value})} placeholder="Full name"/></FormField>
                <FormField label="Email"><input className={inputClass} value={checkInForm.email} onChange={e=>setCheckInForm({...checkInForm,email:e.target.value})}/></FormField>
                <FormField label="Phone"><input className={inputClass} value={checkInForm.phone} onChange={e=>setCheckInForm({...checkInForm,phone:e.target.value})}/></FormField>
                <FormField label="Nationality"><input className={inputClass} value={checkInForm.nationality} onChange={e=>setCheckInForm({...checkInForm,nationality:e.target.value})} placeholder="Tanzania, Kenya..."/></FormField>
                <FormField label="Room *"><select className={inputClass} value={checkInForm.roomId} onChange={e=>setCheckInForm({...checkInForm,roomId:e.target.value})}><option value="">Select available room...</option>{rooms.rows.filter(r=>r.status==="Available").map(r=><option key={r.id} value={r.id}>Room {r.number} — {r.type} (USD {r.price}/night)</option>)}</select></FormField>
                <FormField label="Check-Out Date *"><input type="date" className={inputClass} value={checkInForm.checkOut} onChange={e=>setCheckInForm({...checkInForm,checkOut:e.target.value})} min={new Date(Date.now()+86400000).toISOString().slice(0,10)}/></FormField>
                <FormField label="Adults"><input type="number" min="1" className={inputClass} value={checkInForm.adults} onChange={e=>setCheckInForm({...checkInForm,adults:Number(e.target.value)})}/></FormField>
                <FormField label="Children"><input type="number" min="0" className={inputClass} value={checkInForm.children} onChange={e=>setCheckInForm({...checkInForm,children:Number(e.target.value)})}/></FormField>
                <FormField label="Purpose"><select className={inputClass} value={checkInForm.purpose} onChange={e=>setCheckInForm({...checkInForm,purpose:e.target.value})}>{["Leisure","Business","Transit","Event","Other"].map(p=><option key={p}>{p}</option>)}</select></FormField>
                <FormField label="Payment Method"><select className={inputClass} value={checkInForm.paymentMethod} onChange={e=>setCheckInForm({...checkInForm,paymentMethod:e.target.value})}>{["Card","Cash","Mobile Money","Bank Transfer","Corporate Account"].map(m=><option key={m}>{m}</option>)}</select></FormField>
                <FormField label="Special Requests" cls="col-span-2"><input className={inputClass} value={checkInForm.specialRequests} onChange={e=>setCheckInForm({...checkInForm,specialRequests:e.target.value})} placeholder="Late check-out, extra pillow, dietary..."/></FormField>
              </div>
              {checkInForm.roomId&&checkInForm.checkOut&&(()=>{
                const room=rooms.rows.find(r=>r.id===checkInForm.roomId);
                const nights=Math.max(1,Math.round((new Date(checkInForm.checkOut)-new Date())/86400000));
                return(
                  <div className="p-4 rounded-xl border-2 text-center" style={{borderColor:HTL_BLUE+"40",background:HTL_BLUE+"06"}}>
                    <p className="text-[12px] text-slate-500 mb-1">Stay Summary</p>
                    <p className="text-[22px] font-black" style={{color:HTL_BLUE}}>{nights} Night{nights>1?"s":""} — USD {(room?.price||0)*nights}</p>
                    <p className="text-[12px] text-slate-400">{room?.type} Room {room?.number} · USD {room?.price}/night · {checkInForm.paymentMethod}</p>
                  </div>
                );
              })()}
              <div className="flex gap-3"><button onClick={doCheckIn} className="flex-1 py-3 rounded-xl text-[13.5px] font-bold text-white" style={{background:HTL_BLUE}}>✓ Complete Check-In</button><button onClick={()=>setShowCheckIn(false)} className="px-6 py-3 rounded-xl text-[13px] text-slate-500 border border-slate-200">Cancel</button></div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><p className="text-[13.5px] font-semibold text-[#111827]">Currently Checked-In ({bookings.rows.filter(b=>b.status==="Active").length} guests)</p></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Guest","Room","Type","Check-In","Check-Out","Nights","Total","Special Requests","Action"].map(h=><th key={h} className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{bookings.rows.filter(b=>b.status==="Active").map(b=>(
                <tr key={b.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{background:HTL_BLUE}}>{b.guest?.charAt(0)||"G"}</div><span className="font-medium text-[#111827]">{b.guest}</span></div></td>
                  <td className="px-4 py-3 font-bold" style={{color:HTL_BLUE}}>#{b.room}</td>
                  <td className="px-4 py-3 text-slate-500">{b.type}</td>
                  <td className="px-4 py-3 font-mono text-[11.5px] text-slate-400">{b.checkIn}</td>
                  <td className="px-4 py-3 font-mono text-[11.5px] text-slate-400">{b.checkOut}</td>
                  <td className="px-4 py-3 font-bold text-[#111827]">{b.nights}</td>
                  <td className="px-4 py-3 font-mono font-bold" style={{color:HTL_BLUE}}>USD {b.total}</td>
                  <td className="px-4 py-3 text-slate-400 text-[11.5px] max-w-[120px] truncate">{b.specialRequests||"—"}</td>
                  <td className="px-4 py-3"><button onClick={()=>doCheckOut(b.id)} className="text-[11px] font-bold text-white px-3 py-1.5 rounded-lg bg-red-500">Check Out</button></td>
                </tr>
              ))}</tbody>
            </table>
            {bookings.rows.filter(b=>b.status==="Active").length===0&&<p className="text-center text-slate-400 py-8">No guests currently checked in</p>}
          </div>
        </div>
      )}

      {/* BOOKINGS */}
      {tab==="bookings" && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><p className="text-[13.5px] font-semibold text-[#111827]">All Bookings</p><button onClick={()=>downloadCSV("hotel-bookings",bookings.rows,[{key:"guest",label:"Guest"},{key:"room",label:"Room"},{key:"checkIn",label:"Check In"},{key:"checkOut",label:"Check Out"},{key:"nights",label:"Nights"},{key:"total",label:"Total"},{key:"status",label:"Status"}])} className="flex items-center gap-1 text-[12px] text-slate-500 border border-slate-200 px-3 py-2 rounded-xl hover:border-blue-400 hover:text-blue-600"><Download size={13}/>Export</button></div>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{["Guest","Room","Type","Check-In","Check-Out","Nights","Total","Paid","Source","Status"].map(h=><th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wide text-slate-400">{h}</th>)}</tr></thead>
              <tbody>{bookings.rows.map(b=>(
                <tr key={b.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-3 py-3 font-medium text-[#111827]">{b.guest}</td>
                  <td className="px-3 py-3 font-bold" style={{color:HTL_BLUE}}>#{b.room}</td>
                  <td className="px-3 py-3 text-slate-500">{b.type}</td>
                  <td className="px-3 py-3 font-mono text-[11.5px] text-slate-400">{b.checkIn}</td>
                  <td className="px-3 py-3 font-mono text-[11.5px] text-slate-400">{b.checkOut}</td>
                  <td className="px-3 py-3 font-bold text-[#111827]">{b.nights}</td>
                  <td className="px-3 py-3 font-mono font-bold" style={{color:HTL_BLUE}}>USD {b.total}</td>
                  <td className="px-3 py-3 font-mono font-bold text-green-600">USD {b.paid}</td>
                  <td className="px-3 py-3 text-slate-400 text-[11.5px]">{b.source}</td>
                  <td className="px-3 py-3"><Chip s={b.status}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* HOUSEKEEPING */}
      {tab==="housekeeping" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[["Rooms to Clean",cleaning,"#F59E0B"],["Currently Occupied",occupied,"#2563EB"],["Available",available,"#16A34A"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[24px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100"><p className="text-[13.5px] font-semibold text-[#111827]">Housekeeping Tasks</p></div>
            <div className="divide-y divide-slate-50">
              {rooms.rows.filter(r=>r.status==="Cleaning"||r.status==="Occupied").map(r=>{
                const sc=statusConfig[r.status]||statusConfig.Available;
                return(
                  <div key={r.id} className="flex items-center gap-4 px-4 py-3.5">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[14px] font-black shrink-0" style={{background:sc.bg,color:sc.text}}>#{r.number}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5"><p className="text-[13px] font-semibold text-[#111827]">Room {r.number}</p><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:sc.bg,color:sc.text}}>{r.status}</span></div>
                      <p className="text-[11.5px] text-slate-400">{r.type} · Floor {r.floor} · {r.beds} bed{r.beds>1?"s":""}</p>
                      {r.amenities&&<div className="flex gap-1 mt-1">{r.amenities.slice(0,3).map(a=><span key={a} className="text-[9.5px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{a}</span>)}</div>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {r.status==="Cleaning"&&<button onClick={()=>{rooms.setRows(p=>p.map(x=>x.id===r.id?{...x,status:"Available"}:x));notify("Room "+r.number+" ready ✓");}} className="px-3 py-2 rounded-xl text-[12px] font-semibold text-white" style={{background:"#16A34A"}}>✓ Mark Ready</button>}
                      {r.status==="Occupied"&&<button onClick={()=>notify("Housekeeping request sent for Room "+r.number)} className="px-3 py-2 rounded-xl text-[12px] font-semibold border" style={{color:sc.text,borderColor:sc.border}}>Request Service</button>}
                    </div>
                  </div>
                );
              })}
              {rooms.rows.filter(r=>r.status==="Cleaning"||r.status==="Occupied").length===0&&<p className="text-center text-slate-400 py-10">All rooms are clean and available 🌟</p>}
            </div>
          </div>
        </div>
      )}

      {/* REPORTS */}
      {tab==="reports" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[["Occupancy Rate",occupancy+"%",HTL_BLUE],["ADR (Avg Daily Rate)","USD "+adr,HTL_GOLD],["RevPAR","USD "+revPAR,"#7C3AED"],["Total Revenue","USD "+revenue,"#16A34A"]].map(([l,v,col])=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center"><p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p><p className="text-[20px] font-bold" style={{color:col}}>{v}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Revenue by Room Type</p>
              {roomsByType.map(type=>{
                const typeRevenue=bookings.rows.filter(b=>b.type===type).reduce((s,b)=>s+b.paid,0);
                const total=bookings.rows.reduce((s,b)=>s+b.paid,0);
                const pct=total>0?typeRevenue/total*100:0;
                if(!typeRevenue)return null;
                return(
                  <div key={type} className="flex items-center gap-2 mb-2.5">
                    <span className="text-[12px] text-slate-600 w-24 shrink-0">{type}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:pct+"%",background:HTL_BLUE}}/></div>
                    <span className="text-[12px] font-bold text-slate-700 w-16 text-right">USD {typeRevenue}</span>
                  </div>
                );
              }).filter(Boolean)}
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <p className="text-[13.5px] font-semibold text-[#111827] mb-3">Bookings by Source</p>
              {["Direct","Booking.com","Expedia","Airbnb","Phone"].map(src=>{
                const n=bookings.rows.filter(b=>b.source===src).length;
                const total=bookings.rows.length;
                if(!n)return null;
                return(
                  <div key={src} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                    <span className="text-[12.5px] text-slate-600">{src}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:(n/total*100)+"%",background:HTL_BLUE}}/></div>
                      <span className="text-[12px] font-bold" style={{color:HTL_BLUE}}>{n}</span>
                    </div>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </div>
        </div>
      )}

      {/* HOTEL REPORTS TAB */}
      {tab === "reports" && (() => {
        const revByType = ["Single","Double","Suite","Deluxe"].map(type=>{
          const typeRevenue = bookings.rows.filter(b=>b.type===type&&(b.status==="Checked Out"||b.status==="Active"))
            .reduce((s,b)=>s+(b.total||0),0);
          return { name:type, value:Math.round(typeRevenue/1000), fill:{Single:"#1E3A8A",Double:"#2563EB",Suite:"#D97706",Deluxe:"#7C3AED"}[type] };
        }).filter(d=>d.value>0);

        const sourceData = ["Direct","Booking.com","Expedia","Airbnb","Phone"].map((src,i)=>({
          name:src, value:bookings.rows.filter(b=>b.source===src).length,
          fill:["#1E3A8A","#2563EB","#16A34A","#EF4444","#F59E0B"][i],
        })).filter(d=>d.value>0);

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[[`Occupancy`,`${occupancy}%`,"#1E3A8A"],["Total Revenue",`TZS ${money(Math.round(revenue/1000))}k`,"#16A34A"],["ADR (Avg Daily Rate)",`TZS ${money(adr)}`,"#D97706"],["RevPAR",`TZS ${money(revPAR)}`,"#7C3AED"]].map(([l,v,col])=>(
                <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                  <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                  <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Revenue by Room Type */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Revenue by Room Type (TZS k)</h3>
                {revByType.length===0?<p className="text-slate-400 text-center py-6">No checkout data yet</p>:(
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={revByType} margin={{left:0,right:10,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis dataKey="name" tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Revenue"]}/>
                      <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={40}>
                        {revByType.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Booking Source */}
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Booking Sources</h3>
                {sourceData.length===0?<p className="text-slate-400 text-center py-6">No bookings yet</p>:(
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={150}>
                      <PieChart>
                        <Pie data={sourceData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                          {sourceData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                        </Pie>
                        <Tooltip formatter={(v,n)=>[v+" bookings",n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {sourceData.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px]">
                            <span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}
                          </span>
                          <span className="text-[12.5px] font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Guest folio PDF */}
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Recent Bookings — Print Folio</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="bg-[#1E3A8A]">
                    {["ID","Guest","Room","Check-In","Check-Out","Nights","Source","Status","Total"].map(h=>(
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-white">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {bookings.rows.slice(0,8).map((b,i)=>(
                      <tr key={b.id} className={i%2===0?"bg-white":"bg-slate-50/60"}>
                        <td className="px-3 py-2 font-mono text-[11px] font-bold">{b.id}</td>
                        <td className="px-3 py-2 font-semibold">{b.guestName}</td>
                        <td className="px-3 py-2">{b.room}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{b.checkIn}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{b.checkOut}</td>
                        <td className="px-3 py-2 text-center">{b.nights}</td>
                        <td className="px-3 py-2">{b.source}</td>
                        <td className="px-3 py-2">
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{b.status}</span>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-[#1E3A8A]">TZS {money(Math.round((b.total||0)/1000))}k</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={()=>{
                  const co=window.__smartManagerCompany||{};
                  const win=window.open("","_blank","width=950,height=1100");
                  if (!win) return;
                  const rows=bookings.rows.map((b,i)=>`<tr style="background:${i%2===0?"#fff":"#F8FAFB"}">
                    <td style="padding:7px 12px;font-family:monospace;font-size:11.5px;font-weight:700">${b.id}</td>
                    <td style="padding:7px 12px;font-size:12px;font-weight:600">${b.guestName}</td>
                    <td style="padding:7px 12px;font-size:11.5px">${b.room} (${b.type})</td>
                    <td style="padding:7px 12px;font-size:11.5px">${b.checkIn}</td>
                    <td style="padding:7px 12px;font-size:11.5px">${b.checkOut}</td>
                    <td style="padding:7px 12px;text-align:center">${b.nights}</td>
                    <td style="padding:7px 12px;font-size:11.5px">${b.source}</td>
                    <td style="padding:7px 12px;font-weight:700;font-family:monospace">TZS ${money(Math.round((b.total||0)/1000))}k</td>
                  </tr>`).join("");
                  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Hotel Report</title>
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
                    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,sans-serif;background:#F3F4F6;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
                    @media print{body{background:white}.toolbar{display:none!important}}
                    .page{max-width:900px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.1)}
                    .hdr{background:#0F172A;padding:28px 36px;display:flex;justify-content:space-between;align-items:flex-start}
                    table.data{width:100%;border-collapse:collapse}table.data thead tr{background:#1E3A8A}
                    table.data thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.8)}
                    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#E5E7EB;border-bottom:1px solid #E5E7EB}
                    .kpi{background:white;padding:16px 20px;text-align:center}.kpi-label{font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}.kpi-value{font-size:20px;font-weight:800}
                    .ftr{background:#0F172A;padding:14px 36px;display:flex;justify-content:space-between}.ftr-note{font-size:10.5px;color:rgba(255,255,255,.4)}.ftr-brand{font-size:11px;font-weight:700;color:#B8860B}
                    .toolbar{position:fixed;bottom:24px;right:24px;display:flex;gap:8px}.btn{padding:10px 20px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:Inter}
                    .btn-p{background:#1E3A8A;color:white}.btn-c{background:white;color:#111827;border:1.5px solid #E5E7EB}</style></head><body>
                    <div class="page">
                      <div class="hdr">
                        <div><div style="font-size:20px;font-weight:800;color:white">${co.name||"Hotel"}</div><div style="font-size:10.5px;color:rgba(255,255,255,.5);margin-top:3px">${[co.address,co.city,"Tanzania"].filter(Boolean).join(" · ")}</div></div>
                        <div style="text-align:right"><div style="font-size:32px;font-weight:900;color:#B8860B;letter-spacing:-1px">HOTEL REPORT</div><div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:4px">Generated: ${new Date().toLocaleDateString()}</div></div>
                      </div>
                      <div class="kpis">
                        <div class="kpi"><div class="kpi-label">Occupancy</div><div class="kpi-value" style="color:#1E3A8A">${occupancy}%</div></div>
                        <div class="kpi"><div class="kpi-label">Total Revenue</div><div class="kpi-value" style="color:#16A34A">TZS ${money(Math.round(revenue/1000))}k</div></div>
                        <div class="kpi"><div class="kpi-label">Avg Daily Rate</div><div class="kpi-value">TZS ${money(adr)}</div></div>
                        <div class="kpi"><div class="kpi-label">RevPAR</div><div class="kpi-value" style="color:#7C3AED">TZS ${money(revPAR)}</div></div>
                      </div>
                      <div style="padding:24px 36px">
                        <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9CA3AF;margin-bottom:12px">All Bookings</p>
                        <table class="data">
                          <thead><tr><th>ID</th><th>Guest</th><th>Room</th><th>Check-In</th><th>Check-Out</th><th>Nights</th><th>Source</th><th class="r">Total</th></tr></thead>
                          <tbody>${rows}</tbody>
                        </table>
                      </div>
                      <div class="ftr"><div class="ftr-note">Confidential · ${co.name||"Hotel"} · ${new Date().toLocaleDateString()}</div><div class="ftr-brand">SMART MANAGER</div></div>
                    </div>
                    <div class="toolbar"><button class="btn btn-c" onclick="window.close()">Close</button><button class="btn btn-p" onclick="window.print()">Print / PDF</button></div>
                  </body></html>`);
                  win.document.close();
                }}
                className="mt-3 flex items-center gap-1.5 text-[12.5px] font-bold text-white px-4 py-2.5 rounded-xl" style={{background:"#1E3A8A"}}>
                <Printer size={13}/> Download Hotel Report PDF
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
