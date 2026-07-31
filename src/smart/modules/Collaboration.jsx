import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Calendar, Check, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Circle,
  ExternalLink, EyeOff, FileText, Hash, Inbox, Mail, MessageCircle, MessageSquare, Plus,
  Search, Send, Settings, Star, Trash2, Users, Video, X, Zap
} from "lucide-react";
import { EmptyState, FormField, inputClass } from "../components/ui.jsx";
import {
  MEETING_TYPES,
  calendarEventsSeed,
  collabChannelsSeed,
  collabMessagesSeed,
  workspacesSeed,
} from "../data/collaboration.jsx";
import { FILE_TYPE_STYLE } from "../data/documents.jsx";
import { logAudit, waBus } from "../lib/buses.jsx";
import { TODAY, docId, lineTotal, money } from "../lib/format.jsx";
import {
  mapCalendarEventRow,
  mapCollabChannelRow,
  mapCollabMessageRow,
  mapWorkspaceRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ ENTERPRISE COLLABORATION HUB ══════════════ */
/* ---------------------------------- ENTERPRISE COLLABORATION HUB ---------------------------------- */
export const COLLAB_TABS = [
  { id: "channels",   label: "Team Chat",          icon: MessageSquare },
  { id: "whatsapp",   label: "WhatsApp",            icon: MessageCircle },
  { id: "email",      label: "Email",               icon: Mail },
  { id: "calendar",   label: "Enterprise Calendar", icon: Calendar },
  { id: "workspaces", label: "Team Workspaces",     icon: Users },
  { id: "notebook",   label: "Notebook",            icon: BookOpen },
  { id: "files",      label: "File Sharing",        icon: FileText },
];

// Video Meeting — real, not simulated: Jitsi Meet is a genuinely free,
// no-account service where the URL itself is a live joinable room. One
// tap generates an unguessable room, opens it, and copies the link for
// pasting into Team Chat. Honest scope: this launches a real external
// meeting; embedded in-app video would need the Jitsi iframe API — real
// future work, named.
// Enterprise Scheduler — one honest model for six resource kinds. The
// part that makes a scheduler worth trusting is conflict detection:
// booking the Boardroom 10:00–11:30 when it's taken 11:00–12:00 is
// REFUSED with the conflicting booking named — never silently
// double-booked, because a scheduler that double-books is worse than a
// wall calendar. Overlap math: two ranges clash when each starts before
// the other ends; same resource name (case-insensitive), same date.
export function ResourceSchedulerPanel({ currentUser }) {
  const RESOURCE_TYPES = ["Room", "Equipment", "Vehicle", "Field Visit", "Installation", "Maintenance"];
  const bookings = useCompanyTable("resource_bookings", [], { order: { col: "booking_date", ascending: true }, mapRow: (r) => ({ id: r.id, dbId: r.id, type: r.resource_type, resource: r.resource_name, date: r.booking_date, start: r.start_time, end: r.end_time, by: r.booked_by, purpose: r.purpose || "" }) });
  const [draft, setDraft] = useState({ type: "Room", resource: "", date: TODAY.toISOString().slice(0, 10), start: "09:00", end: "10:00", purpose: "" });
  const [open, setOpen] = useState(false);
  const t = TODAY.toISOString().slice(0, 10);

  async function book() {
    if (!draft.resource.trim() || !draft.date || draft.end <= draft.start) { notify("Check the resource name and that the end time is after the start.", "error"); return; }
    const clash = bookings.rows.find((b) => b.resource.toLowerCase() === draft.resource.trim().toLowerCase() && b.date === draft.date && draft.start < b.end && b.start < draft.end);
    if (clash) { notify(`Conflict: ${clash.resource} is already booked ${clash.start}–${clash.end} by ${clash.by}. Pick another slot.`, "error"); return; }
    const row = { id: `BK-${Date.now()}`, type: draft.type, resource: draft.resource.trim(), date: draft.date, start: draft.start, end: draft.end, by: currentUser.name, purpose: draft.purpose.trim() };
    bookings.setRows((prev) => [...prev, row].sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1)));
    setDraft({ ...draft, resource: "", purpose: "" }); setOpen(false);
    notify(`${row.resource} booked ${row.date} ${row.start}–${row.end} — conflict-checked against every existing booking.`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("resource_bookings").insert({ resource_type: row.type, resource_name: row.resource, booking_date: row.date, start_time: row.start, end_time: row.end, booked_by: row.by, purpose: row.purpose || null }).single().run();
        if (header?.id) bookings.setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, dbId: header.id } : x)));
      } catch (_e) { notify("Booked locally, but the server update failed.", "error"); }
    }
  }

  const upcoming = bookings.rows.filter((b) => b.date >= t).slice(0, 6);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13.5px] font-semibold text-[#111827]">Resource Scheduler</p>
          <p className="text-[11px] text-slate-400">Rooms, equipment, vehicles, field visits, installations, maintenance — every booking conflict-checked, never silently double-booked.</p>
        </div>
        <button onClick={() => setOpen((s) => !s)} className="text-[11.5px] font-medium text-[#16A34A] hover:underline shrink-0">{open ? "Cancel" : "New booking"}</button>
      </div>
      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
          <select className={inputClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>{RESOURCE_TYPES.map((x) => <option key={x}>{x}</option>)}</select>
          <input className={inputClass} value={draft.resource} onChange={(e) => setDraft({ ...draft, resource: e.target.value })} placeholder="Resource — e.g. Boardroom, Hilux T123" />
          <input type="date" className={inputClass} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input type="time" className={inputClass} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          <input type="time" className={inputClass} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          <input className={inputClass} value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value })} placeholder="Purpose" />
          <button onClick={book} className="btn-primary text-white text-[12px] font-medium rounded-lg px-3.5 py-2 col-span-2 sm:col-span-1">Book — conflict-checked</button>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
          {upcoming.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-[12px]">
              <span className="text-slate-600 truncate"><span className="font-medium text-[#111827]">{b.resource}</span> · {b.type}{b.purpose ? ` · ${b.purpose}` : ""} · {b.by}</span>
              <span className="font-mono text-slate-400 shrink-0 ml-3">{b.date} {b.start}–{b.end}</span>
            </div>
          ))}
        </div>
      )}
      {!bookings.loading && upcoming.length === 0 && <p className="text-[11.5px] text-slate-400 mt-3">No upcoming bookings.</p>}
    </div>
  );
}

export function VideoMeetingBar({ currentUser }) {
  function startMeeting() {
    const room = `SmartManager-${Math.random().toString(36).slice(2, 10)}`;
    const url = `https://meet.jit.si/${room}`;
    try { navigator.clipboard?.writeText(url); } catch (_e) {}
    window.open(url, "_blank");
    notify(`Video meeting started by ${currentUser.name} — link copied; paste it into Team Chat so others can join.`);
  }
  return (
    <div className="flex justify-end mb-3">
      <button onClick={startMeeting} className="btn-primary text-white text-[12px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5">
        <Zap size={13} /> Start Video Meeting
      </button>
    </div>
  );
}

export const WA_TEMPLATES = [
  {
    id:"invoice",   label:"📄 Invoice Ready",
    subject:"Invoice from {company}",
    body:"Hello {name},\n\nYour invoice *{docId}* for *TZS {amount}* is ready.\nDue date: *{dueDate}*.\n\nPlease quote this reference when paying: *{ref}*\n\nThank you for your business!\n_{company}_",
  },
  {
    id:"reminder",  label:"⏰ Payment Reminder",
    subject:"Payment Reminder — {company}",
    body:"Hello {name},\n\nThis is a friendly reminder that invoice *{docId}* for *TZS {amount}* is now due.\n\nKindly arrange payment at your earliest convenience.\nPayment Reference: *{ref}*\n\nThank you!\n_{company}_",
  },
  {
    id:"receipt",   label:"✅ Payment Received",
    subject:"Payment Receipt — {company}",
    body:"Hello {name},\n\nWe have received your payment of *TZS {amount}*.\nReceipt No: *{ref}*\n\nThank you for your prompt payment!\n_{company}_",
  },
  {
    id:"order",     label:"📦 Order Confirmed",
    subject:"Order Confirmed — {company}",
    body:"Hello {name},\n\nYour order *{docId}* has been confirmed and is being processed.\nEstimated delivery: *{dueDate}*\n\nWe will keep you updated on the progress.\n_{company}_",
  },
  {
    id:"loyalty",   label:"🏆 Loyalty Reward",
    subject:"Your Loyalty Reward — {company}",
    body:"Hello {name},\n\n🎉 *Congratulations!*\n\nYou have been awarded *{tier}* loyalty status and enjoy *{discount}% OFF* all future orders!\n\nThank you for being a valued customer.\n_{company}_",
  },
  {
    id:"support",   label:"🛠 Support Update",
    subject:"Support Update — {company}",
    body:"Hello {name},\n\nYour support request has been received and is being handled by our team.\nTicket Ref: *{ref}*\n\nWe will get back to you shortly.\n_{company}_",
  },
  {
    id:"custom",    label:"✏ Custom Message",
    subject:"",
    body:"",
  },
];

export function useWaMessages(contactId) {
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    if (!contactId) { setMsgs([]); return; }
    if (IS_CONFIGURED) {
      sb("whatsapp_messages").eq("contact_id", contactId)
        .order("sent_at", true).limit(100).run()
        .then(rows => {
          if (rows) setMsgs(rows.map(r=>({
            id:r.id, body:r.body, direction:r.direction, sentAt:r.sent_at,
            status:r.status||"sent", contactId:r.contact_id,
          })));
        }).catch(()=>{});
    }
  }, [contactId]);
  return [msgs, setMsgs];
}

export function WhatsAppCenter({ currentUser, crm, employees, invoices, company }) {
  const co = company || window.__smartManagerCompany || {};

  // Build contact list: CRM won leads + employees
  const contacts = useMemo(() => {
    const wonLeads = (crm?.rows||[]).filter(l=>l.phone||l.email).map(l=>({
      id: "lead-"+l.id, name: l.company||l.contact||"Unknown",
      phone: l.phone||"", email: l.email||"",
      avatar: (l.company||l.contact||"?").charAt(0),
      type: "customer", raw: l,
    }));
    const emps = (employees||[]).filter(e=>e.phone||e.email).map(e=>({
      id: "emp-"+e.id, name: e.name, phone: e.phone||"", email: e.email||"",
      avatar: e.name.charAt(0), type: "employee", role: e.role,
    }));
    return [...wonLeads, ...emps];
  }, [crm?.rows, employees]);

  const [selectedId, setSel]      = useState(null);
  const [query, setQuery]         = useState("");
  const [compose, setCompose]     = useState("");
  const [templateId, setTmplId]   = useState("custom");
  const [vars, setVars]           = useState({});
  const [showApi, setShowApi]     = useState(false);
  const [apiToken, setApiToken]   = useState(() => localStorage.getItem("wa_api_token")||"");
  const [apiPhone, setApiPhone]   = useState(() => localStorage.getItem("wa_api_phone")||"");
  const [localMsgs, setLocalMsgs] = useState({});   // contactId → [{...}]
  const endRef = useRef(null);

  const contact = contacts.find(c=>c.id===selectedId);
  const filteredContacts = contacts.filter(c=>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)
  );

  // Listen for external open-to-contact
  useEffect(()=>{
    const handler = ({contactId, templateId:tid, vars:v}) => {
      setSel(contactId); if(tid) setTmplId(tid); if(v) setVars(v);
    };
    waBus.listeners.add(handler);
    return ()=>waBus.listeners.delete(handler);
  },[]);

  // Auto-scroll
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); }, [localMsgs, selectedId]);

  const msgs = localMsgs[selectedId]||[];

  // Merge template into compose box
  const tmpl = WA_TEMPLATES.find(t=>t.id===templateId)||WA_TEMPLATES[WA_TEMPLATES.length-1];
  function applyTemplate(t) {
    setTmplId(t.id);
    if (t.id==="custom") return;
    // Pull latest relevant vars from context
    const relInvs = (invoices?.rows||[]).filter(inv=>
      inv.customer?.toLowerCase()===(contact?.name||"").toLowerCase()
    );
    const latestInv = relInvs[0];
    const merged = t.body
      .replace(/\{company\}/g, co.name||"SMART MANAGER")
      .replace(/\{name\}/g, contact?.name||"Customer")
      .replace(/\{docId\}/g, latestInv?.id||vars.docId||"{docId}")
      .replace(/\{amount\}/g, latestInv ? money(Math.round(lineTotal(latestInv.items||[]).total)) : (vars.amount||"{amount}"))
      .replace(/\{dueDate\}/g, latestInv?.dueDate||vars.dueDate||"{dueDate}")
      .replace(/\{ref\}/g, vars.ref||docId("REF"))
      .replace(/\{tier\}/g, vars.tier||"Gold")
      .replace(/\{discount\}/g, vars.discount||"10");
    setCompose(merged);
  }

  // Send message — store locally + attempt API, fallback to wa.me
  async function sendMessage() {
    if (!compose.trim() || !contact) return;
    const now = new Date().toISOString();
    const newMsg = {
      id: "MSG-"+Date.now(), body:compose.trim(), direction:"out",
      sentAt:now, status:"sending", contactId:contact.id,
    };
    setLocalMsgs(m=>({...m, [contact.id]:[...(m[contact.id]||[]), newMsg]}));
    const msgBody = compose.trim();
    setCompose("");

    if (apiToken && apiPhone && contact.phone) {
      // WhatsApp Business Cloud API
      try {
        const num = contact.phone.replace(/[^0-9]/g,"");
        const res = await fetch(`https://graph.facebook.com/v18.0/${apiPhone}/messages`, {
          method:"POST",
          headers:{"Authorization":"Bearer "+apiToken,"Content-Type":"application/json"},
          body: JSON.stringify({
            messaging_product:"whatsapp", to:num,
            type:"text", text:{body:msgBody},
          }),
        });
        const data = await res.json();
        const waId = data?.messages?.[0]?.id;
        setLocalMsgs(m=>({...m,[contact.id]:m[contact.id].map(ms=>ms.id===newMsg.id?{...ms,status:waId?"delivered":"failed",waId}:ms)}));
        notify(waId?`✓ Sent via WhatsApp Business API`:`⚠ API error — opening WhatsApp Web`);
        if (!waId) openWaLink(msgBody, contact.phone);
      } catch(e) {
        notify("API unavailable — opening WhatsApp Web");
        openWaLink(msgBody, contact.phone);
        setLocalMsgs(m=>({...m,[contact.id]:m[contact.id].map(ms=>ms.id===newMsg.id?{...ms,status:"via-link"}:ms)}));
      }
    } else {
      openWaLink(msgBody, contact.phone);
      setLocalMsgs(m=>({...m,[contact.id]:m[contact.id].map(ms=>ms.id===newMsg.id?{...ms,status:"via-link"}:ms)}));
    }

    if (IS_CONFIGURED) {
      try {
        await sb("whatsapp_messages").insert({
          contact_id:contact.id, contact_name:contact.name, body:msgBody,
          direction:"out", sent_at:now, status:"sent",
        }).run();
      } catch(_){}
    }
    logAudit("WhatsApp message sent","Communications",currentUser.name,`To: ${contact.name}`);
  }

  function openWaLink(text, phone) {
    const num = (phone||"").replace(/[^0-9]/g,"");
    if (!num) { notify("No phone number for this contact","error"); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`,"_blank","noopener");
    notify("WhatsApp Web opened — message pre-filled, click Send there");
  }

  // Format WhatsApp bold/italic preview
  function formatPreview(text) {
    return text
      .replace(/\*([^*]+)\*/g,"<strong>$1</strong>")
      .replace(/_([^_]+)_/g,"<em>$1</em>")
      .replace(/\n/g,"<br/>");
  }

  return (
    <div className="flex h-[640px] bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">

      {/* ── LEFT PANEL — Contact list ── */}
      <div className="w-72 shrink-0 border-r border-slate-100 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100" style={{background:"#075E54"}}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-bold text-[15px]">WhatsApp</span>
            <div className="flex gap-2">
              <button onClick={()=>setShowApi(!showApi)}
                className="text-white/70 hover:text-white" title="WhatsApp Business API Settings">
                <Settings size={16}/>
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50"/>
            <input value={query} onChange={e=>setQuery(e.target.value)}
              placeholder="Search contacts…"
              className="w-full bg-white/10 text-white placeholder-white/50 rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] outline-none focus:bg-white/20"/>
          </div>
        </div>

        {/* API Config panel */}
        {showApi && (
          <div className="px-3 py-3 bg-[#DCF8C6]/30 border-b border-green-200 space-y-2">
            <p className="text-[10.5px] font-bold text-[#075E54]">WhatsApp Business API</p>
            <input className="w-full text-[11.5px] border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
              placeholder="Access Token (from Meta)" value={apiToken}
              onChange={e=>{setApiToken(e.target.value); localStorage.setItem("wa_api_token",e.target.value);}}/>
            <input className="w-full text-[11.5px] border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
              placeholder="Phone Number ID" value={apiPhone}
              onChange={e=>{setApiPhone(e.target.value); localStorage.setItem("wa_api_phone",e.target.value);}}/>
            <div className={`text-[10.5px] font-semibold px-2 py-1 rounded ${apiToken&&apiPhone?"text-[#16A34A] bg-[#F0FDF4]":"text-[#F59E0B] bg-[#FFFBEB]"}`}>
              {apiToken&&apiPhone?"✓ API configured — messages send directly":"⚠ No API — messages open WhatsApp Web"}
            </div>
            <p className="text-[9.5px] text-slate-400">Get credentials at business.facebook.com/wa/manage</p>
          </div>
        )}

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length===0 && (
            <div className="py-8 text-center text-slate-400 text-[12px]">No contacts found</div>
          )}
          {filteredContacts.map(ct=>{
            const ctMsgs = localMsgs[ct.id]||[];
            const last   = ctMsgs[ctMsgs.length-1];
            const unread = ctMsgs.filter(m=>m.direction==="in"&&m.status!=="read").length;
            return (
              <button key={ct.id} onClick={()=>setSel(ct.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 text-left transition-colors ${selectedId===ct.id?"bg-[#F0FDF4]":""}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-[15px] shrink-0"
                  style={{background:ct.type==="employee"?"#128C7E":"#075E54"}}>
                  {ct.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <p className="text-[13px] font-semibold text-[#111827] truncate">{ct.name}</p>
                    {last&&<span className="text-[10px] text-slate-400 shrink-0 ml-1">{last.sentAt?.slice(11,16)}</span>}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-[11.5px] text-slate-400 truncate">{last?last.body.slice(0,30)+"…":ct.phone||ct.email||ct.role||""}</p>
                    {unread>0&&<span className="w-5 h-5 rounded-full bg-[#25D366] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{unread}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL — Chat ── */}
      {!contact ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{background:"#f0ece4"}}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{background:"#128C7E"}}>
            <MessageCircle size={36} className="text-white"/>
          </div>
          <p className="text-[16px] font-semibold text-[#111827]">SMART MANAGER WhatsApp</p>
          <p className="text-[13px] text-slate-500 text-center max-w-xs">Select a contact to start messaging. Messages open WhatsApp Web pre-filled or send directly via the Business API.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col" style={{background:"#ECE5DD"}}>
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 shadow-sm" style={{background:"#075E54"}}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-[14px]"
              style={{background:contact.type==="employee"?"#128C7E":"#25D366"}}>
              {contact.avatar}
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-[14px]">{contact.name}</p>
              <p className="text-white/60 text-[11px]">{contact.phone||contact.email||contact.role||""}</p>
            </div>
            <div className="flex gap-2">
              {contact.phone&&(
                <button onClick={()=>openWaLink("",contact.phone)} title="Open WhatsApp Web"
                  className="text-white/80 hover:text-white p-1">
                  <ExternalLink size={15}/>
                </button>
              )}
            </div>
          </div>

          {/* Template bar */}
          <div className="px-3 py-2 border-b border-[#d5ccbf] bg-[#e0d8cc] flex gap-1.5 overflow-x-auto">
            {WA_TEMPLATES.map(t=>(
              <button key={t.id} onClick={()=>applyTemplate(t)}
                className={`px-2.5 py-1 rounded-full text-[10.5px] font-semibold whitespace-nowrap border transition-all ${
                  templateId===t.id?"bg-[#075E54] text-white border-[#075E54]":"bg-white text-slate-600 border-slate-200 hover:border-[#075E54]/40"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {msgs.length===0&&(
              <div className="text-center text-[12px] text-slate-400 py-6">No messages yet — send your first message below</div>
            )}
            {msgs.map(msg=>{
              const isOut = msg.direction==="out";
              const statusIcon = msg.status==="delivered"||msg.status==="read"
                ? <CheckCheck size={12} className={msg.status==="read"?"text-[#53bdeb]":"text-white/60"}/>
                : msg.status==="via-link"
                ? <ExternalLink size={11} className="text-white/60"/>
                : <Check size={12} className="text-white/60"/>;
              return (
                <div key={msg.id} className={`flex ${isOut?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-xl shadow-sm relative ${
                    isOut?"rounded-tr-sm text-white":"rounded-tl-sm bg-white text-[#111827]"
                  }`} style={{background:isOut?"#075E54":undefined}}>
                    <div className="text-[12.5px] leading-snug"
                      dangerouslySetInnerHTML={{__html:formatPreview(msg.body)}}/>
                    <div className={`flex items-center justify-end gap-1 mt-1 ${isOut?"text-white/60":"text-slate-400"}`}>
                      <span className="text-[10px]">{msg.sentAt?.slice(11,16)}</span>
                      {isOut&&statusIcon}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef}/>
          </div>

          {/* Compose */}
          <div className="p-3 flex gap-2 items-end" style={{background:"#f0ece4"}}>
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
              <textarea
                rows={Math.min(4, compose.split("\n").length+1)}
                value={compose} onChange={e=>setCompose(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                placeholder="Type a message…"
                className="w-full px-4 py-3 text-[13px] resize-none outline-none text-[#111827]"/>
              {compose&&(
                <div className="px-4 pb-2">
                  <p className="text-[10px] text-slate-400 font-medium">Preview (WhatsApp formatting)</p>
                  <div className="text-[11.5px] text-[#111827] leading-relaxed"
                    dangerouslySetInnerHTML={{__html:formatPreview(compose)}}/>
                </div>
              )}
            </div>
            <button onClick={sendMessage} disabled={!compose.trim()||!contact}
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-sm disabled:opacity-40 transition-all hover:scale-105"
              style={{background:"#25D366"}}>
              <Send size={18} className="text-white" style={{marginLeft:2}}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const EMAIL_TEMPLATES = [
  {
    id:"invoice",    label:"📄 Invoice",
    subject:"Invoice {docId} from {company}",
    body:"Dear {name},\n\nPlease find attached your invoice {docId} for TZS {amount}.\n\nDue Date: {dueDate}\nPayment Reference: {ref}\n\nPayment Methods:\n• Bank Transfer: {bankName} — {bankAccount}\n• Mobile Money: {mpesa}\n\nPlease don't hesitate to contact us with any questions.\n\nKind regards,\n{senderName}\n{company}\n{phone}\n{email}",
  },
  {
    id:"reminder",   label:"⏰ Payment Reminder",
    subject:"Payment Reminder — Invoice {docId}",
    body:"Dear {name},\n\nThis is a friendly reminder that invoice {docId} for TZS {amount} was due on {dueDate} and remains outstanding.\n\nWe would appreciate your prompt attention to this matter. If you have already arranged payment, please disregard this notice and send us proof of payment.\n\nPayment Reference: {ref}\n\nIf you have any questions regarding this invoice, please do not hesitate to contact us.\n\nKind regards,\n{senderName}\n{company}",
  },
  {
    id:"statement",  label:"📊 Account Statement",
    subject:"Account Statement — {company} · {year}",
    body:"Dear {name},\n\nPlease find your account statement for {year} from {company}.\n\nSummary:\n• Total Invoiced: TZS {amount}\n• Loyalty Tier: {tier}\n• Loyalty Discount: {discount}% on future orders\n\nWe value your continued business and look forward to serving you.\n\nKind regards,\n{senderName}\n{company}",
  },
  {
    id:"welcome",    label:"👋 Welcome",
    subject:"Welcome to {company}!",
    body:"Dear {name},\n\nWelcome to {company}! We are thrilled to have you as our customer.\n\nAs a new customer, you have been registered in our system and will receive your first invoice shortly.\n\nShould you have any questions, please reach out to us at any time.\n\nWarm regards,\n{senderName}\n{company}\n{phone}",
  },
  {
    id:"loyalty",    label:"🏆 Loyalty Award",
    subject:"Congratulations — Your {tier} Loyalty Status!",
    body:"Dear {name},\n\nCongratulations!\n\nWe are delighted to inform you that you have been awarded {tier} loyalty status with {company}.\n\nAs a {tier} member, you are entitled to a {discount}% discount on all future orders.\n\nThank you sincerely for your outstanding loyalty and business.\n\nWith appreciation,\n{senderName}\n{company}",
  },
  {
    id:"custom",     label:"✏ Compose",
    subject:"",
    body:"",
  },
];

export const emailBus = { listeners: new Set(), push(payload){ this.listeners.forEach(fn=>fn(payload)); }};

export function EmailCenter({ currentUser, crm, employees, invoices, company }) {
  const co = company || window.__smartManagerCompany || {};

  const contacts = useMemo(()=>{
    const fromCrm = (crm?.rows||[]).filter(l=>l.email).map(l=>({
      id:"lead-"+l.id, name:l.company||l.contact||"", email:l.email||"", type:"customer",
    }));
    const fromEmp = (employees||[]).filter(e=>e.email).map(e=>({
      id:"emp-"+e.id, name:e.name, email:e.email||"", type:"employee", role:e.role,
    }));
    return [...fromCrm, ...fromEmp];
  },[crm?.rows, employees]);

  const [folder, setFolder]   = useState("compose");  // compose | sent | drafts | starred
  const [to, setTo]           = useState("");
  const [cc, setCc]           = useState("");
  const [bcc, setBcc]         = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [showCC, setShowCC]   = useState(false);
  const [tmplId, setTmplId]   = useState("custom");
  const [showContacts, setShowCont] = useState(false);
  const [contactQ, setContQ]  = useState("");
  const [sentEmails, setSent] = useState([]);
  const [drafts, setDrafts]   = useState([]);
  const [starred, setStarred] = useState([]);
  const [selectedEmail, setSel]= useState(null);
  const [busy, setBusy]       = useState(false);
  const [smtpCfg, setSmtp]    = useState(()=>{
    try { return JSON.parse(localStorage.getItem("smtp_cfg")||"{}"); } catch{return {};}
  });
  const [showSmtp, setShowSmtp] = useState(false);

  // Listen for external compose trigger
  useEffect(()=>{
    const h = ({to:t,subject:s,body:b,tmpl})=>{
      setFolder("compose"); if(t) setTo(t); if(s) setSubject(s); if(b) setBody(b);
      if(tmpl) setTmplId(tmpl);
    };
    emailBus.listeners.add(h);
    return ()=>emailBus.listeners.delete(h);
  },[]);

  function mergeTemplate(tmpl) {
    const relInvs = (invoices?.rows||[]).filter(inv=>
      inv.customer?.toLowerCase()===(to.split("@")[0]||"").toLowerCase()
    );
    const lat = relInvs[0];
    return tmpl
      .replace(/\{company\}/g, co.name||"SMART MANAGER")
      .replace(/\{name\}/g, to.split("<")[0].trim()||"Valued Customer")
      .replace(/\{docId\}/g, lat?.id||"{docId}")
      .replace(/\{amount\}/g, lat?money(Math.round(lineTotal(lat.items||[]).total)):"{amount}")
      .replace(/\{dueDate\}/g, lat?.dueDate||"{dueDate}")
      .replace(/\{ref\}/g, lat?.id||docId("REF"))
      .replace(/\{bankName\}/g, co.bankName||"{bankName}")
      .replace(/\{bankAccount\}/g, co.bankAccount||"{bankAccount}")
      .replace(/\{mpesa\}/g, co.mpesa||"{mpesa}")
      .replace(/\{senderName\}/g, co.owner||currentUser.name||"The Team")
      .replace(/\{phone\}/g, co.phone||"")
      .replace(/\{email\}/g, co.email||"")
      .replace(/\{tier\}/g, "{tier}")
      .replace(/\{discount\}/g, "{discount}")
      .replace(/\{year\}/g, String(new Date().getFullYear()));
  }

  function applyTmpl(tmpl) {
    setTmplId(tmpl.id);
    if (tmpl.id==="custom") return;
    setSubject(mergeTemplate(tmpl.subject));
    setBody(mergeTemplate(tmpl.body));
  }

  function saveDraft() {
    const d = {id:"DFT-"+Date.now(), to, cc, bcc, subject, body, savedAt:new Date().toISOString()};
    setDrafts(ds=>[d,...ds]);
    notify("Draft saved");
  }

  async function sendEmail() {
    if (!to.trim()||!subject.trim()) { notify("To and Subject are required","error"); return; }
    setBusy(true);
    const sent = {
      id:"EML-"+Date.now(), to, cc, bcc, subject, body,
      sentAt:new Date().toISOString(), from:co.email||currentUser.name,
      starred:false,
    };

    if (smtpCfg.host && smtpCfg.user) {
      // Real SMTP via user-provided config (show placeholder for now)
      notify("⚠ Server-side SMTP requires a backend proxy — opening email client instead");
      openMailto();
    } else {
      openMailto();
    }

    setSent(s=>[sent,...s]);
    setDrafts(ds=>ds.filter(d=>d.to!==to||d.subject!==subject));
    if (IS_CONFIGURED) {
      try {
        await sb("emails").insert({
          to_address:to, cc_address:cc||null, bcc_address:bcc||null,
          subject, body, direction:"out",
          sent_at:sent.sentAt, sender:co.email||currentUser.name,
        }).run();
      } catch(_){}
    }
    logAudit("Email sent","Communications",currentUser.name,`To: ${to} · ${subject}`);
    clearCompose();
    setFolder("sent");
    notify(`Email opened in your mail client — click Send there to deliver to ${to}`);
    setBusy(false);
  }

  function openMailto() {
    const params = new URLSearchParams();
    if (cc)  params.set("cc",cc);
    if (bcc) params.set("bcc",bcc);
    params.set("subject",subject);
    params.set("body",body);
    window.location.href = `mailto:${encodeURIComponent(to)}?${params.toString()}`;
  }

  function clearCompose() { setTo(""); setCc(""); setBcc(""); setSubject(""); setBody(""); setTmplId("custom"); }

  function toggleStar(email) {
    const star = !email.starred;
    setSent(s=>s.map(e=>e.id===email.id?{...e,starred:star}:e));
    setStarred(s=>star?[...s,{...email,starred:true}]:s.filter(e=>e.id!==email.id));
  }

  const filteredContacts = contacts.filter(c=>!contactQ||c.name.toLowerCase().includes(contactQ.toLowerCase())||c.email.toLowerCase().includes(contactQ.toLowerCase()));

  const folderData = {
    compose:[], sent:sentEmails, drafts, starred,
  };
  const folderItems = folder!=="compose" ? folderData[folder]||[] : [];

  const FOLDERS = [
    {id:"compose",label:"Compose",     icon:Edit3,     count:0},
    {id:"sent",   label:"Sent",        icon:Send,      count:sentEmails.length},
    {id:"drafts", label:"Drafts",      icon:BookOpen,  count:drafts.length},
    {id:"starred",label:"Starred",     icon:Star,      count:starred.length},
  ];

  return (
    <div className="flex h-[640px] bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">

      {/* ── SIDEBAR ── */}
      <div className="w-52 shrink-0 border-r border-slate-100 flex flex-col bg-slate-50">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-bold text-[#111827]">📬 Email</span>
            <button onClick={()=>{setFolder("compose");clearCompose();}}
              className="text-[11px] font-bold text-white bg-[#2563EB] px-2 py-1 rounded-lg">+ New</button>
          </div>
          {co.email&&<p className="text-[10.5px] text-slate-400 mt-1 truncate">{co.email}</p>}
        </div>

        {/* Folders */}
        <div className="py-2">
          {FOLDERS.map(f=>{
            const Icon = f.icon;
            return (
              <button key={f.id} onClick={()=>setFolder(f.id)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-[12.5px] font-medium transition-colors ${
                  folder===f.id?"bg-[#EFF6FF] text-[#2563EB]":"text-slate-600 hover:bg-slate-100"
                }`}>
                <div className="flex items-center gap-2.5">
                  <Icon size={14}/> {f.label}
                </div>
                {f.count>0&&<span className="text-[10px] font-bold bg-[#2563EB] text-white px-1.5 py-0.5 rounded-full">{f.count}</span>}
              </button>
            );
          })}
        </div>

        <div className="px-3 py-2 border-t border-slate-100 mt-auto">
          <button onClick={()=>setShowSmtp(!showSmtp)}
            className="w-full text-[11px] text-slate-500 font-medium flex items-center gap-1.5 py-1.5 hover:text-slate-700">
            <Settings size={12}/> SMTP Settings
          </button>
        </div>

        {showSmtp && (
          <div className="px-3 pb-3 space-y-1.5">
            {[["host","SMTP Host","smtp.gmail.com"],["port","Port","587"],["user","Username",""],["pass","Password",""]].map(([k,l,ph])=>(
              <div key={k}>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase">{l}</label>
                <input type={k==="pass"?"password":"text"}
                  className="w-full text-[11px] border border-slate-200 rounded px-2 py-1 mt-0.5 outline-none"
                  placeholder={ph} value={smtpCfg[k]||""}
                  onChange={e=>{const n={...smtpCfg,[k]:e.target.value};setSmtp(n);localStorage.setItem("smtp_cfg",JSON.stringify(n));}}/>
              </div>
            ))}
            <p className="text-[9.5px] text-slate-400">SMTP sending requires a backend proxy for CORS. Credentials saved locally.</p>
          </div>
        )}
      </div>

      {/* ── MAIN PANEL ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── COMPOSE VIEW ── */}
        {folder==="compose" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Templates */}
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex gap-1.5 overflow-x-auto items-center">
              <span className="text-[10.5px] font-bold text-slate-400 shrink-0">Template:</span>
              {EMAIL_TEMPLATES.map(t=>(
                <button key={t.id} onClick={()=>applyTmpl(t)}
                  className={`px-2.5 py-1 rounded-full text-[10.5px] font-semibold whitespace-nowrap border transition-all ${
                    tmplId===t.id?"bg-[#2563EB] text-white border-[#2563EB]":"bg-white text-slate-600 border-slate-200 hover:border-[#2563EB]/40"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* To/CC/Subject */}
            <div className="border-b border-slate-100 divide-y divide-slate-100">
              {/* To field with contact picker */}
              <div className="flex items-center gap-2 px-4 py-2.5 relative">
                <span className="text-[11.5px] font-bold text-slate-400 w-10 shrink-0">To</span>
                <input value={to} onChange={e=>{setTo(e.target.value);setContQ(e.target.value);setShowCont(true);}}
                  onFocus={()=>setShowCont(true)} onBlur={()=>setTimeout(()=>setShowCont(false),200)}
                  className="flex-1 text-[13px] outline-none text-[#111827]"
                  placeholder="Recipient email address or name…"/>
                <button onClick={()=>setShowCC(!showCC)} className="text-[10.5px] font-bold text-[#2563EB]">
                  {showCC?"Hide CC":"+ CC"}
                </button>
                {/* Contact autocomplete */}
                {showCont && filteredContacts.length>0 && (
                  <div className="absolute top-full left-10 right-0 z-20 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto mt-1">
                    {filteredContacts.slice(0,8).map(ct=>(
                      <button key={ct.id} onMouseDown={()=>{setTo(ct.name+" <"+ct.email+">");setShowCont(false);setContQ("");}}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left">
                        <div className="w-7 h-7 rounded-full bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          {ct.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[12.5px] font-semibold text-[#111827]">{ct.name}</p>
                          <p className="text-[10.5px] text-slate-400">{ct.email} · {ct.type}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {showCC && (
                <>
                  <div className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[11.5px] font-bold text-slate-400 w-10 shrink-0">CC</span>
                    <input value={cc} onChange={e=>setCc(e.target.value)} className="flex-1 text-[13px] outline-none" placeholder="CC recipients…"/>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[11.5px] font-bold text-slate-400 w-10 shrink-0">BCC</span>
                    <input value={bcc} onChange={e=>setBcc(e.target.value)} className="flex-1 text-[13px] outline-none" placeholder="BCC recipients…"/>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2 px-4 py-2.5">
                <span className="text-[11.5px] font-bold text-slate-400 w-10 shrink-0">Sub</span>
                <input value={subject} onChange={e=>setSubject(e.target.value)}
                  className="flex-1 text-[13px] font-semibold outline-none text-[#111827]"
                  placeholder="Email subject…"/>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <textarea value={body} onChange={e=>setBody(e.target.value)}
                className="w-full h-full min-h-[280px] px-6 py-4 text-[13px] leading-relaxed text-[#374151] resize-none outline-none"
                placeholder="Write your email here…&#10;&#10;Tip: Use templates above to auto-fill professional content."/>
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2.5">
              <button onClick={sendEmail} disabled={busy||!to.trim()||!subject.trim()}
                className="flex items-center gap-1.5 text-[13px] font-bold text-white px-5 py-2.5 rounded-xl bg-[#2563EB] disabled:opacity-40">
                <Send size={14}/> {busy?"Sending…":"Send Email"}
              </button>
              <button onClick={saveDraft}
                className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 border border-slate-200 px-3.5 py-2.5 rounded-xl hover:bg-white">
                <BookOpen size={13}/> Save Draft
              </button>
              <button onClick={clearCompose}
                className="text-[12px] text-slate-400 hover:text-slate-600 px-2 py-2.5">
                Discard
              </button>
              <div className="flex-1"/>
              <p className="text-[11px] text-slate-400">
                {smtpCfg.host?"SMTP configured":"Opens your email client"}
              </p>
            </div>
          </div>
        )}

        {/* ── EMAIL LIST VIEW (Sent / Drafts / Starred) ── */}
        {folder!=="compose" && !selectedEmail && (
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[13.5px] font-bold text-[#111827] capitalize">{folder} ({folderItems.length})</p>
              {folder==="drafts"&&<button onClick={()=>{setFolder("compose");clearCompose();}} className="text-[11.5px] text-[#2563EB] font-bold">+ Compose</button>}
            </div>
            {folderItems.length===0?(
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Inbox size={40} className="text-slate-200"/>
                <p className="text-[13px]">No emails in {folder}</p>
              </div>
            ):(
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {folderItems.map(email=>(
                  <div key={email.id} onClick={()=>setSel(email)}
                    className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 cursor-pointer">
                    <div className="w-9 h-9 rounded-full bg-[#2563EB] text-white font-bold text-[13px] flex items-center justify-center shrink-0 mt-0.5">
                      {(email.to||"?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-semibold text-[#111827] truncate">{folder==="sent"?email.to:email.from||email.to}</p>
                        <span className="text-[10.5px] text-slate-400 shrink-0">{email.sentAt?.slice(0,10)}</span>
                      </div>
                      <p className="text-[12px] font-medium text-[#374151] truncate">{email.subject}</p>
                      <p className="text-[11.5px] text-slate-400 truncate">{email.body?.slice(0,80)}…</p>
                    </div>
                    <button onClick={e=>{e.stopPropagation();toggleStar(email);}} className="shrink-0 mt-1">
                      <Star size={14} className={email.starred?"text-[#F59E0B] fill-[#F59E0B]":"text-slate-300 hover:text-[#F59E0B]"}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SINGLE EMAIL VIEW ── */}
        {selectedEmail && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <button onClick={()=>setSel(null)} className="text-slate-400 hover:text-slate-600 mr-1">
                <ChevronLeft size={18}/>
              </button>
              <div className="flex-1">
                <p className="text-[14px] font-bold text-[#111827]">{selectedEmail.subject}</p>
              </div>
              <button onClick={()=>{setTo(selectedEmail.to||"");setSubject("Re: "+selectedEmail.subject);setBody("\n\n---\nOn "+selectedEmail.sentAt?.slice(0,10)+":\n"+selectedEmail.body);setFolder("compose");setSel(null);}}
                className="text-[11.5px] font-bold text-[#2563EB] border border-[#2563EB]/30 px-2.5 py-1.5 rounded-lg">↩ Reply</button>
              <button onClick={()=>toggleStar(selectedEmail)} className="p-1">
                <Star size={15} className={selectedEmail.starred?"text-[#F59E0B] fill-[#F59E0B]":"text-slate-300"}/>
              </button>
            </div>
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#2563EB] text-white font-bold text-[14px] flex items-center justify-center shrink-0">
                  {(selectedEmail.to||"?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[13px] font-bold text-[#111827]">To: {selectedEmail.to}</p>
                  {selectedEmail.cc&&<p className="text-[11.5px] text-slate-400">CC: {selectedEmail.cc}</p>}
                  <p className="text-[11.5px] text-slate-400">From: {selectedEmail.from||co.email||"You"} · {selectedEmail.sentAt?.slice(0,16).replace("T"," ")}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 flex-1">
              <pre className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-wrap font-sans">{selectedEmail.body}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CollaborationHub({ currentUser, filesHook, employees, invoices, crm, workOrders, leaveRequests, onNavigate }) {
  const [tab, setTab] = useState("channels");

  return (
    <div className="space-y-5 h-full flex flex-col">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Collaboration Hub</h1>
        <p className="text-[13px] text-slate-500 mt-1">Team chat, an enterprise calendar pulling from every module, and team workspaces — all real. Voice and video calls coordinate through a real meeting link rather than being hosted in-app; see the note on the Calendar tab.</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full shrink-0">
        {COLLAB_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${isActive ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {tab === "channels"   && <ChannelsView currentUser={currentUser} employees={employees} />}
        {tab === "whatsapp"   && <WhatsAppCenter currentUser={currentUser} crm={crm} employees={employees} invoices={invoices} company={window.__smartManagerCompany||{}} />}
        {tab === "email"      && <EmailCenter currentUser={currentUser} crm={crm} employees={employees} invoices={invoices} company={window.__smartManagerCompany||{}} />}
        {tab === "calendar"   && <SharedCalendar invoices={invoices} crm={crm} workOrders={workOrders} leaveRequests={leaveRequests} />}
        {tab === "workspaces" && <TeamWorkspaces employees={employees} />}
        <VideoMeetingBar currentUser={currentUser} />
        <ResourceSchedulerPanel currentUser={currentUser} />
        {tab === "notebook" && <NotebookView currentUser={currentUser} />}
        {tab === "files" && <CollabFileSharing filesHook={filesHook} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

/* ══════════════ TEAM CHAT / DEPARTMENT CHANNELS ══════════════ */
/* ----------------------------- TEAM CHAT / DEPARTMENT CHANNELS ----------------------------- */

// Real polling, not true push-based real-time — there's no WebSocket
// signaling server in this architecture (see the module-level note above
// MEETING_TYPES for why voice/video can't be hosted in-app for the same
// underlying reason). While a channel is open, this refetches its
// messages every 4 seconds in live mode, so two people with this channel
// open genuinely see each other's messages appear without a manual
// refresh — a real, working technique for this class of problem, honestly
// short of a true WebSocket subscription.
export function ChannelsView({ currentUser, employees }) {
  const channels = useCompanyTable("collab_channels", collabChannelsSeed, { mapRow: mapCollabChannelRow });
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [messages, setMessages] = useState(collabMessagesSeed);
  const [draft, setDraft] = useState("");
  const [showChannelForm, setShowChannelForm] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!activeChannelId && channels.rows.length > 0) setActiveChannelId(channels.rows[0].id);
  }, [channels.rows, activeChannelId]);

  useEffect(() => {
    if (IS_CONFIGURED) {
      sb("collab_messages").select("*").order("created_at", { ascending: true }).run()
        .then((rows) => setMessages((rows || []).map(mapCollabMessageRow)))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!IS_CONFIGURED || !activeChannelId) return;
    const interval = setInterval(async () => {
      try {
        const rows = await sb("collab_messages").select("*").eq("channel_ref", activeChannelId).order("created_at", { ascending: true }).run();
        setMessages((prev) => {
          const others = prev.filter((m) => m.channelId !== activeChannelId);
          return [...others, ...(rows || []).map(mapCollabMessageRow)];
        });
      } catch (_e) { /* a missed poll just tries again in 4s; nothing to surface to the user for one skipped refresh */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeChannelId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeChannelId]);

  const activeChannel = channels.rows.find((c) => c.id === activeChannelId);
  const channelMessages = messages.filter((m) => m.channelId === activeChannelId);

  async function sendMessage() {
    if (!draft.trim() || !activeChannelId) return;
    const entry = { id: `MSG-${Date.now()}`, channelId: activeChannelId, sender: currentUser.name, text: draft.trim(), timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, entry]);
    setDraft("");
    if (IS_CONFIGURED) {
      try { await sb("collab_messages").insert({ channel_ref: activeChannelId, sender: currentUser.name, body: entry.text }).run(); } catch (_e) { notify("Message shown locally, but saving to the server failed.", "error"); }
    }
  }

  async function addChannel(form) {
    const draftChannel = { id: docId("CH"), name: form.name, scope: form.scope, description: form.description };
    channels.setRows((prev) => [...prev, draftChannel]);
    setActiveChannelId(draftChannel.id);
    setShowChannelForm(false);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("collab_channels").insert({ name: draftChannel.name, scope: draftChannel.scope, description: draftChannel.description }).single().run();
        if (header?.id) channels.setRows((prev) => prev.map((c) => (c.id === draftChannel.id ? { ...c, dbId: header.id } : c)));
      } catch (_e) { notify("Channel created locally, but saving to the server failed.", "error"); }
    }
  }

  const departments = Array.from(new Set(employees.rows.map((e) => e.department).filter(Boolean)));

  return (
    <div className="flex h-[560px] bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="w-56 border-r border-slate-100 flex flex-col shrink-0">
        <div className="px-3 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Channels</p>
          <button onClick={() => setShowChannelForm(true)} className="text-[#16A34A] hover:text-[#15803D]" aria-label="New channel"><Plus size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-1.5">
          {channels.rows.map((c) => (
            <button key={c.id} onClick={() => setActiveChannelId(c.id)} className={`w-full text-left px-3 py-2 flex items-center gap-2 text-[12.5px] ${activeChannelId === c.id ? "bg-[#16A34A]/8 text-[#111827] font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
              <Hash size={12} className="shrink-0 text-slate-400" /> <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            <div className="px-4 py-3 border-b border-slate-100 shrink-0">
              <p className="text-[13.5px] font-semibold text-[#111827] flex items-center gap-1.5"><Hash size={13} className="text-slate-400" /> {activeChannel.name}</p>
              <p className="text-[11px] text-slate-400">{activeChannel.scope} · {activeChannel.description}</p>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {channelMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center"><p className="text-[12.5px] text-slate-400">No messages yet — say something to get started.</p></div>
              ) : (
                channelMessages.map((m) => (
                  <div key={m.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-medium text-slate-500 shrink-0">{m.sender.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2"><span className="text-[12.5px] font-medium text-[#111827]">{m.sender}</span><span className="text-[10.5px] text-slate-400">{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                      <p className="text-[13px] text-slate-700 mt-0.5 break-words">{m.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-slate-100 shrink-0 flex gap-2">
              <input
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={`Message #${activeChannel.name}`}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30"
              />
              <button onClick={sendMessage} disabled={!draft.trim()} className="btn-primary text-white rounded-lg px-3 disabled:opacity-40" aria-label="Send"><Send size={15} /></button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center"><p className="text-[13px] text-slate-400">Select or create a channel to start chatting.</p></div>
        )}
      </div>

      {showChannelForm && <ChannelFormPanel departments={departments} onClose={() => setShowChannelForm(false)} onSubmit={addChannel} />}
    </div>
  );
}

export function ChannelFormPanel({ departments, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", scope: "Company-wide", description: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.name.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[360px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Team Chat</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Channel</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Channel name" required><input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Warehouse" /></FormField>
          <FormField label="Scope">
            <select className={inputClass} value={form.scope} onChange={(e) => set("scope", e.target.value)}>
              <option value="Company-wide">Company-wide</option>
              {departments.map((d) => <option key={d} value={d}>{d} Department</option>)}
              <option value="Department">Department (generic)</option>
            </select>
          </FormField>
          <FormField label="Description"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What's this channel for?" /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Channel</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ SHARED CALENDAR ══════════════ */
/* ----------------------------------- SHARED CALENDAR ----------------------------------- */

// Six integrations requested; five are real data this app already
// computes elsewhere (leave, production, sales, payments) or a real,
// well-known filing rule (tax) — none of them are a second data store.
// Nothing here is copied into calendar_events; every non-manual entry is
// computed fresh from the same live hooks CRM, HR, Manufacturing, and
// Finance already use, so this calendar can never drift out of sync with
// the modules it's reading from — there's only one copy of the truth.
export const CALENDAR_CATEGORIES = [
  { id: "meetings", label: "Meetings & Events", color: "#16A34A" },
  { id: "leave", label: "Leave Schedules", color: "#F59E0B" },
  { id: "production", label: "Production Plans", color: "#5B6472" },
  { id: "sales", label: "Sales Activities", color: "#22C55E" },
  { id: "payments", label: "Payment Due Dates", color: "#EF4444" },
  { id: "tax", label: "Tax Deadlines", color: "#0EA5E9" },
];

// Tanzania's VAT return and payment deadline is the 20th of the month
// following the tax period — a real, published TRA rule, not a made-up
// date. Stated honestly below as a general rule to confirm against actual
// TRA guidance, the same caveat already attached to the VAT Summary in
// Finance (section 8) and the Tax Authority integration note (section 25)
// — a filing date can be moved by the authority itself, and this app has
// no way to know that happened.
export function computeTaxDeadlines(monthsAhead = 3) {
  const deadlines = [];
  for (let i = -1; i <= monthsAhead; i++) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + i + 1, 20);
    deadlines.push({ date: d.toISOString().slice(0, 10), label: `VAT return due (period: ${new Date(TODAY.getFullYear(), TODAY.getMonth() + i, 1).toLocaleDateString(undefined, { month: "long" })})` });
  }
  return deadlines;
}

export function SharedCalendar({ invoices, crm, workOrders, leaveRequests }) {
  const events = useCompanyTable("calendar_events", calendarEventsSeed, { mapRow: mapCalendarEventRow });
  const [monthOffset, setMonthOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [visibleCategories, setVisibleCategories] = useState(() => new Set(CALENDAR_CATEGORIES.map((c) => c.id)));

  const viewDate = new Date(TODAY.getFullYear(), TODAY.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const taxDeadlines = useMemo(() => computeTaxDeadlines(), []);

  // One computed entry list, merging six real sources by date — the
  // actual "integration" this feature asked for, not a UI wrapper around
  // a single table.
  const entriesByDate = useMemo(() => {
    const map = {};
    function add(dateStr, entry) { (map[dateStr] = map[dateStr] || []).push(entry); }

    events.rows.forEach((e) => add(e.date, { id: e.id, title: e.title, category: "meetings", color: "#16A34A" }));

    leaveRequests.rows.filter((l) => l.status === "Approved").forEach((l) => {
      let d = new Date(l.startDate);
      const end = new Date(l.endDate);
      while (d <= end) {
        add(d.toISOString().slice(0, 10), { id: `${l.id}-${d.getTime()}`, title: `${l.employee} on leave`, category: "leave", color: "#F59E0B" });
        d.setDate(d.getDate() + 1);
      }
    });

    workOrders.rows.filter((w) => w.status !== "Completed" && w.dueDate).forEach((w) => {
      add(w.dueDate, { id: w.id, title: `${w.product} — production due`, category: "production", color: "#5B6472" });
    });

    crm.rows.filter((l) => l.expectedCloseDate && l.stage !== "Won" && l.stage !== "Lost").forEach((l) => {
      add(l.expectedCloseDate, { id: l.id, title: `${l.company} — expected close`, category: "sales", color: "#22C55E" });
    });

    invoices.rows.filter((inv) => inv.status !== "Paid" && inv.dueDate).forEach((inv) => {
      add(inv.dueDate, { id: inv.id, title: `${inv.customer} — payment due (${inv.id})`, category: "payments", color: "#EF4444" });
    });

    taxDeadlines.forEach((t) => add(t.date, { id: `tax-${t.date}`, title: t.label, category: "tax", color: "#0EA5E9" }));

    return map;
  }, [events.rows, leaveRequests.rows, workOrders.rows, crm.rows, invoices.rows, taxDeadlines]);

  function visibleEntriesFor(dateStr) {
    return (entriesByDate[dateStr] || []).filter((e) => visibleCategories.has(e.category));
  }

  function toggleCategory(id) {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function addEvent(form) {
    const draft = { id: docId("EVT"), ...form };
    events.setRows((prev) => [...prev, draft]);
    setShowForm(false);
    notify(`Scheduled: ${draft.title}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("calendar_events").insert({
          title: draft.title, event_type: draft.type, event_date: draft.date, start_time: draft.startTime,
          end_time: draft.endTime, meeting_link: draft.meetingLink, attendees: draft.attendees, description: draft.description,
        }).single().run();
        if (header?.id) events.setRows((prev) => prev.map((e) => (e.id === draft.id ? { ...e, dbId: header.id } : e)));
      } catch (_e) { notify("Event saved locally, but the server update failed.", "error"); }
    }
  }

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Video size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          There&apos;s no in-app calling here — real voice and video calls need signaling and media infrastructure this build doesn&apos;t run. Scheduling a Voice or Video Call creates a real calendar entry with a real link field for wherever the actual call happens (Zoom, Google Meet, Teams). Tax deadlines below follow Tanzania&apos;s published VAT filing rule (due the 20th of the following month) — confirm against actual TRA guidance, since an authority can move a deadline this app has no way to know about.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CALENDAR_CATEGORIES.map((c) => (
          <button
            key={c.id} onClick={() => toggleCategory(c.id)}
            className={`text-[11px] font-medium px-2.5 py-1.5 rounded-full border flex items-center gap-1.5 transition-opacity ${visibleCategories.has(c.id) ? "" : "opacity-40"}`}
            style={{ borderColor: `${c.color}40`, backgroundColor: `${c.color}10`, color: c.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} /> {c.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setMonthOffset((m) => m - 1)} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Previous month"><ChevronLeft size={16} /></button>
            <p className="text-[14px] font-semibold text-[#111827] w-36 text-center">{monthLabel}</p>
            <button onClick={() => setMonthOffset((m) => m + 1)} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => { setSelectedDate(TODAY.toISOString().slice(0, 10)); setShowForm(true); }} className="btn-primary text-white text-[12px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"><Plus size={13} /> New Event</button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="text-center text-[10.5px] font-medium text-slate-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dayEntries = visibleEntriesFor(dateStr);
            const isToday = dateStr === TODAY.toISOString().slice(0, 10);
            return (
              <button
                key={i}
                onClick={() => { setSelectedDate(dateStr); setShowForm(true); }}
                className={`aspect-square rounded-lg border p-1.5 text-left flex flex-col hover:border-[#16A34A]/40 transition-colors ${isToday ? "border-[#16A34A] bg-[#16A34A]/5" : "border-slate-100"}`}
              >
                <span className={`text-[11px] font-medium ${isToday ? "text-[#16A34A]" : "text-slate-600"}`}>{d}</span>
                <div className="flex-1 flex flex-col gap-0.5 mt-1 overflow-hidden">
                  {dayEntries.slice(0, 2).map((e) => (
                    <span key={e.id} className="text-[9px] font-medium px-1 py-0.5 rounded truncate" style={{ backgroundColor: `${e.color}14`, color: e.color }}>{e.title}</span>
                  ))}
                  {dayEntries.length > 2 && <span className="text-[9px] text-slate-400">+{dayEntries.length - 2} more</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Upcoming — Everything Integrated</h3>
        <div className="space-y-2">
          {Object.entries(entriesByDate)
            .filter(([date]) => date >= TODAY.toISOString().slice(0, 10))
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 8)
            .flatMap(([date, entries]) => entries.filter((e) => visibleCategories.has(e.category)).map((e) => ({ ...e, date })))
            .slice(0, 8)
            .map((e) => {
              const linkedEvent = e.category === "meetings" ? events.rows.find((ev) => ev.id === e.id) : null;
              return (
                <div key={`${e.category}-${e.id}`} className="flex items-center justify-between border border-slate-100 rounded-lg px-3.5 py-2.5">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-[#111827] truncate">{e.title}</p>
                      <p className="text-[11px] text-slate-400">{e.date} · {CALENDAR_CATEGORIES.find((c) => c.id === e.category)?.label}</p>
                    </div>
                  </div>
                  {linkedEvent?.meetingLink && <a href={linkedEvent.meetingLink} target="_blank" rel="noopener noreferrer" className="btn-secondary text-[11px] font-medium px-2.5 py-1.5 rounded-lg shrink-0 ml-2">Join</a>}
                </div>
              );
            })}
          {Object.entries(entriesByDate).filter(([date]) => date >= TODAY.toISOString().slice(0, 10)).length === 0 && <p className="text-[12.5px] text-slate-400 text-center py-4">Nothing scheduled.</p>}
        </div>
      </div>

      {showForm && <EventFormPanel defaultDate={selectedDate} onClose={() => setShowForm(false)} onSubmit={addEvent} />}
    </div>
  );
}

export function EventFormPanel({ defaultDate, onClose, onSubmit }) {
  const [form, setForm] = useState({ title: "", type: MEETING_TYPES[0], date: defaultDate, startTime: "09:00", endTime: "09:30", meetingLink: "", attendees: "", description: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.title.trim()) return; onSubmit(form); }
  const needsLink = form.type === "Voice Call" || form.type === "Video Call";

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Shared Calendar</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Event</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Title" required><input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Weekly Sales Sync" /></FormField>
          <FormField label="Type">
            <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Date" required><input type="date" className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start"><input type="time" className={inputClass} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} /></FormField>
            <FormField label="End"><input type="time" className={inputClass} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} /></FormField>
          </div>
          {needsLink && (
            <FormField label="Meeting link">
              <input className={inputClass} value={form.meetingLink} onChange={(e) => set("meetingLink", e.target.value)} placeholder="Paste your Zoom / Google Meet / Teams link" />
              <p className="text-[11px] text-slate-400 mt-1">Generate this in whichever video platform your business uses — this app coordinates the meeting, not the call itself.</p>
            </FormField>
          )}
          <FormField label="Attendees"><input className={inputClass} value={form.attendees} onChange={(e) => set("attendees", e.target.value)} placeholder="e.g. Sales team, or specific names" /></FormField>
          <FormField label="Description"><textarea className={inputClass} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Agenda or notes" /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Save Event</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ TEAM WORKSPACES ══════════════ */
/* ----------------------------------- TEAM WORKSPACES ----------------------------------- */
export function TeamWorkspaces({ employees }) {
  const workspaces = useCompanyTable("workspaces", workspacesSeed, { mapRow: mapWorkspaceRow });
  const [showForm, setShowForm] = useState(false);
  const departments = Array.from(new Set(employees.rows.map((e) => e.department).filter(Boolean)));

  async function addWorkspace(form) {
    const draft = { id: docId("WS"), ...form };
    workspaces.setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Workspace created: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("workspaces").insert({ name: draft.name, department: draft.department, members: draft.members, description: draft.description }).single().run();
        if (header?.id) workspaces.setRows((prev) => prev.map((w) => (w.id === draft.id ? { ...w, dbId: header.id } : w)));
      } catch (_e) { notify("Workspace created locally, but saving to the server failed.", "error"); }
    }
  }

  async function deleteWorkspace(id) {
    const w = workspaces.rows.find((x) => x.id === id);
    workspaces.setRows((prev) => prev.filter((x) => x.id !== id));
    if (IS_CONFIGURED && w?.dbId) {
      try { await sb("workspaces").eq("id", w.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the workspace on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Plus size={14} /> New Workspace</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.rows.map((w) => (
          <div key={w.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[13.5px] font-semibold text-[#111827]">{w.name}</p>
              <button onClick={() => deleteWorkspace(w.id)} className="text-slate-300 hover:text-[#EF4444]" aria-label={`Delete ${w.name}`}><Trash2 size={13} /></button>
            </div>
            {w.department && <span className="text-[10.5px] font-medium text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full">{w.department}</span>}
            <p className="text-[12px] text-slate-500 mt-2 leading-relaxed">{w.description}</p>
            <div className="flex items-center gap-1.5 mt-3 text-[11.5px] text-slate-400"><Users size={12} /> {w.members || "No members listed"}</div>
          </div>
        ))}
        {!workspaces.loading && workspaces.rows.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={Users} title="No workspaces yet" hint="Group a cross-functional team around a project or initiative." actionLabel="New Workspace" onAction={() => setShowForm(true)} />
          </div>
        )}
        {workspaces.loading && <p className="text-[12px] text-slate-400 text-center py-6">Loading...</p>}
      </div>
      {showForm && <WorkspaceFormPanel departments={departments} onClose={() => setShowForm(false)} onSubmit={addWorkspace} />}
    </div>
  );
}

export function WorkspaceFormPanel({ departments, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", department: departments[0] || "", members: "", description: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.name.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[380px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Team Workspaces</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Workspace</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Workspace name" required><input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Cold Chain Rollout Team" /></FormField>
          <FormField label="Department">
            <select className={inputClass} value={form.department} onChange={(e) => set("department", e.target.value)}>
              <option value="">Cross-departmental</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </FormField>
          <FormField label="Members"><input className={inputClass} value={form.members} onChange={(e) => set("members", e.target.value)} placeholder="Names, comma separated" /></FormField>
          <FormField label="Description"><textarea className={inputClass} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What is this workspace for?" /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Workspace</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ FILE SHARING (CROSS-LINK) ══════════════ */
/* ----------------------------------- FILE SHARING (CROSS-LINK) ----------------------------------- */

// File Sharing doesn't duplicate the Document Center (section 36) — it
// surfaces the same real files, sorted to whatever's most recent, with a
// direct link into the real module rather than a second, competing file
// store that could drift out of sync with the real one.
export function CollabFileSharing({ filesHook, onNavigate }) {
  const recent = [...filesHook.rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-semibold text-[#111827]">Recently Shared</h3>
        <button onClick={() => onNavigate("documents")} className="btn-secondary text-[11.5px] font-medium px-3 py-1.5 rounded-lg">Open Document Center</button>
      </div>
      <p className="text-[11.5px] text-slate-400 mb-4">The same real files as the Document Center — not a separate store. OCR, version history, AI summaries, and e-signatures all live there.</p>
      <div className="space-y-1">
        {recent.map((f) => {
          const meta = FILE_TYPE_STYLE[f.type] || FILE_TYPE_STYLE.pdf;
          const Icon = meta.Icon;
          return (
            <button key={f.id} onClick={() => onNavigate("documents")} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}14` }}><Icon size={14} style={{ color: meta.color }} /></div>
              <div className="min-w-0 flex-1"><p className="text-[12.5px] font-medium text-[#111827] truncate">{f.name}</p><p className="text-[11px] text-slate-400">{f.folder} · {f.date}</p></div>
              <ChevronRight size={14} className="text-slate-300 shrink-0" />
            </button>
          );
        })}
        {recent.length === 0 && <p className="text-[12.5px] text-slate-400 text-center py-6">No files yet — upload one in the Document Center.</p>}
      </div>
    </div>
  );
}

/* ══════════════ NOTEBOOK ══════════════ */
/* --------------------------------- NOTEBOOK -------------------------------- */

// Real notes tied to the business, with a genuine Private/Team
// distinction — Private notes are only ever shown to the person who
// created them, filtered by real name match against the current
// session, not a cosmetic label with no actual enforcement behind it.
export function NotebookView({ currentUser }) {
  const notes = useCompanyTable("notebook_notes", [], { order: { col: "created_at", ascending: false }, mapRow: (r) => ({ id: r.id, dbId: r.id, title: r.title, content: r.content || "", status: r.status, visibility: r.visibility, createdBy: r.created_by || "" }) });
  const [filter, setFilter] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", visibility: "Team" });

  // Real visibility enforcement at the display layer: a Private note only
  // ever shows for the person who created it — everyone else's session
  // filters it out before it ever renders, not just visually de-
  // emphasized while still technically present in the DOM.
  const visible = notes.rows.filter((n) => n.visibility === "Team" || n.createdBy === currentUser.name);
  const active = visible.filter((n) => n.status === "Active");
  const completed = visible.filter((n) => n.status === "Completed");
  const filtered = filter === "active" ? active : filter === "completed" ? completed : visible;

  async function addNote(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const draft = { id: `NOTE-${Date.now()}`, title: form.title.trim(), content: form.content, status: "Active", visibility: form.visibility, createdBy: currentUser.name };
    notes.setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    setForm({ title: "", content: "", visibility: "Team" });
    notify("Note added.");
    if (IS_CONFIGURED) {
      try {
        const header = await sb("notebook_notes").insert({ title: draft.title, content: draft.content, visibility: draft.visibility, created_by: draft.createdBy }).single().run();
        if (header?.id) notes.setRows((prev) => prev.map((n) => (n.id === draft.id ? { ...n, dbId: header.id } : n)));
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  async function toggleStatus(note) {
    const newStatus = note.status === "Active" ? "Completed" : "Active";
    notes.setRows((prev) => prev.map((n) => (n.id === note.id ? { ...n, status: newStatus } : n)));
    if (IS_CONFIGURED && note.dbId) {
      try { await sb("notebook_notes").eq("id", note.dbId).update({ status: newStatus }).run(); } catch (_e) { notify("Couldn't update the server.", "error"); }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-slate-500">{active.length} active · {completed.length} completed</p>
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Plus size={14} /> New Note</button>
      </div>
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[{ id: "active", label: "Active" }, { id: "completed", label: "Completed" }, { id: "all", label: "All" }].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${filter === f.id ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>{f.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!notes.loading && filtered.length === 0 && <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={BookOpen} title="No notes" hint="Create your first note to get started." actionLabel="New Note" onAction={() => setShowForm(true)} /></div>}
        {notes.loading && <p className="col-span-full text-[12.5px] text-slate-400 text-center py-8">Loading...</p>}
        {filtered.map((n) => (
          <div key={n.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <div className="flex items-start justify-between mb-1.5">
              <p className={`text-[13.5px] font-medium ${n.status === "Completed" ? "text-slate-400 line-through" : "text-[#111827]"}`}>{n.title}</p>
              <button onClick={() => toggleStatus(n)} aria-label={n.status === "Active" ? "Mark completed" : "Mark active"}>
                {n.status === "Completed" ? <CheckCircle2 size={16} className="text-[#16A34A]" /> : <Circle size={16} className="text-slate-300" />}
              </button>
            </div>
            {n.content && <p className="text-[12px] text-slate-500 mb-2 line-clamp-2">{n.content}</p>}
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${n.visibility === "Private" ? "bg-[#F59E0B]/10 text-[#F59E0B]" : "bg-slate-100 text-slate-500"}`}>{n.visibility === "Private" ? <><EyeOff size={9} className="inline mr-0.5" />Private</> : "Team"}</span>
              <span className="text-[10px] text-slate-400">{n.createdBy}</span>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setShowForm(false)} />
          <form onSubmit={addNote} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
              <h2 className="text-[18px] font-semibold text-[#111827]">New Note</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex-1 space-y-4">
              <FormField label="Title" required><input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></FormField>
              <FormField label="Content"><textarea className={inputClass} rows={6} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} /></FormField>
              <div>
                <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Visibility</label>
                <div className="flex gap-2">
                  {["Team", "Private"].map((v) => (
                    <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, visibility: v }))} className={`flex-1 text-[12.5px] font-medium py-2 rounded-lg border transition-colors ${form.visibility === v ? "border-[#16A34A]/50 bg-[#16A34A]/5 text-[#111827]" : "border-slate-200 text-slate-500"}`}>{v}</button>
                  ))}
                </div>
                <p className="text-[10.5px] text-slate-400 mt-1.5">Private notes are only ever visible to you — real filtering, not a cosmetic label.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5">Cancel</button>
              <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Save Note</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
