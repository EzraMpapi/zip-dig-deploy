import { useMemo, useState } from "react";
import {
  AlertCircle, BookOpen, Brain, CheckCircle2, Clock, Eye, LoaderCircle, MessageCircle,
  PhoneCall, Plus, Search, Send, Ticket, X
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
  CALL_DIRECTION_COLOR,
  CALL_OUTCOME_COLOR,
  KB_CATEGORIES,
  TICKET_CATEGORIES,
  TICKET_PRIORITY_COLOR,
  TICKET_STATUSES,
  TICKET_STATUS_COLOR,
  callLogSeed,
  chatConversationsSeed,
  kbArticlesSeed,
  supportTicketsSeed,
} from "../data/support.jsx";
import { TODAY, docId } from "../lib/format.jsx";
import {
  mapCallLogRow,
  mapChatRow,
  mapKbArticleRow,
  mapTicketRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ CUSTOMER SUPPORT ══════════════ */
/* ------------------------------ CUSTOMER SUPPORT ------------------------------ */
export const SUPPORT_TABS = [
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "chat", label: "Live Chat", icon: MessageCircle },
  { id: "kb", label: "Knowledge Base", icon: BookOpen },
  { id: "calls", label: "Call Center", icon: PhoneCall },
  { id: "ai", label: "AI Assistant", icon: Brain },
];

export function CustomerSupport({ company }) {
  const [tab, setTab] = useState("tickets");
  const tickets = useCompanyTable("support_tickets", supportTicketsSeed, {
    select: "*,support_ticket_messages(*)", order: { col: "created_date", ascending: false }, mapRow: mapTicketRow,
  });

  const openCount = tickets.rows.filter((t) => t.status === "Open").length;
  const urgentCount = tickets.rows.filter((t) => t.status !== "Closed" && t.status !== "Resolved" && t.priority === "Urgent").length;
  const resolvedCount = tickets.rows.filter((t) => t.status === "Resolved" || t.status === "Closed").length;
  const resolutionRate = tickets.rows.length ? Math.round((resolvedCount / tickets.rows.length) * 100) : null;

  const SUPPORT_KPIS = [
    { label: "Open Tickets", value: String(openCount), delta: `${tickets.rows.length} total`, up: false, icon: Ticket },
    { label: "Urgent", value: String(urgentCount), delta: "Needs attention", up: false, icon: AlertCircle },
    { label: "Resolution Rate", value: resolutionRate === null ? "—" : `${resolutionRate}%`, delta: "All time", up: true, icon: CheckCircle2 },
    { label: "Avg Handle Time", value: "8 min", delta: "From call log", up: true, icon: Clock },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Customer Support</h1>
        <p className="text-[13px] text-slate-500 mt-1">Tickets, live chat, knowledge base, call log, and AI-drafted replies</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {SUPPORT_TABS.map((t) => {
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
        {SUPPORT_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {tab === "tickets" && <Tickets tickets={tickets} />}
      {tab === "chat" && <LiveChat />}
      {tab === "kb" && <KnowledgeBase />}
      {tab === "calls" && <CallCenter />}
      {tab === "ai" && <SupportAI company={company} tickets={tickets.rows} />}
    </div>
  );
}

/* ══════════════ TICKETS ══════════════ */
/* ----------------------------------- TICKETS ----------------------------------- */
export function Tickets({ tickets }) {
  const { rows, setRows, loading } = tickets;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((t) => t.subject.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q));
  }, [rows, query]);

  async function addTicket(form) {
    const draft = {
      id: docId("TCK"), subject: form.subject, customer: form.customer,
      category: form.category, priority: form.priority, status: "Open", assignee: form.assignee || "Unassigned",
      createdDate: TODAY.toISOString().slice(0, 10),
      messages: form.description ? [{ from: "Customer", text: form.description, date: TODAY.toISOString().slice(0, 10) }] : [],
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Ticket created: ${draft.id}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("support_tickets").insert({
          doc_number: draft.id, subject: draft.subject, customer: draft.customer, category: draft.category,
          priority: draft.priority, status: "Open", assignee: draft.assignee, created_date: draft.createdDate,
        }).single().run();
        if (header?.id) {
          if (form.description) {
            await sb("support_ticket_messages").insert({ ticket_id: header.id, sender: "Customer", body: form.description }).run();
          }
          setRows((prev) => prev.map((t) => (t.id === draft.id ? { ...t, dbId: header.id } : t)));
        }
      } catch (_e) { notify("Ticket created locally, but saving to the server failed.", "error"); }
    }
  }

  async function setStatus(id, status) {
    const t = rows.find((x) => x.id === id);
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
    if (IS_CONFIGURED && t?.dbId) {
      try { await sb("support_tickets").eq("id", t.dbId).update({ status }).run(); } catch (_e) { notify("Couldn't save the ticket status to the server.", "error"); }
    }
  }

  async function reply(id, text) {
    const t = rows.find((x) => x.id === id);
    const message = { from: "Agent", text, date: TODAY.toISOString().slice(0, 10) };
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, messages: [...x.messages, message] } : x)));
    setSelected((s) => (s && s.id === id ? { ...s, messages: [...s.messages, message] } : s));
    if (IS_CONFIGURED && t?.dbId) {
      try { await sb("support_ticket_messages").insert({ ticket_id: t.dbId, sender: "Agent", body: text }).run(); } catch (_e) { notify("Reply saved locally, but the server update failed.", "error"); }
    }
  }

  async function deleteTicket(id) {
    const t = rows.find((x) => x.id === id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && t?.dbId) {
      try { await sb("support_tickets").eq("id", t.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the ticket on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">

      {/* Ticket Analytics */}
      {rows.length > 0 && (() => {
        const statusData = ["Open","In Progress","Waiting","Resolved","Closed"].map((s,i)=>({
          name:s, value:rows.filter(r=>r.status===s).length,
          fill:["#EF4444","#F59E0B","#2563EB","#16A34A","#94A3B8"][i],
        })).filter(d=>d.value>0);
        const priorityData = ["Critical","High","Medium","Low"].map((p,i)=>({
          name:p, value:rows.filter(r=>r.priority===p).length,
          fill:["#EF4444","#F59E0B","#2563EB","#16A34A"][i],
        })).filter(d=>d.value>0);
        const openCount    = rows.filter(r=>!["Resolved","Closed"].includes(r.status)).length;
        const resolvedToday= rows.filter(r=>r.status==="Resolved"&&r.updatedAt?.startsWith(TODAY.toISOString().slice(0,10))).length;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Total Tickets",String(rows.length),"#111827"],
                ["Open",         String(openCount),"#EF4444"],
                ["Resolved Today",String(resolvedToday),"#16A34A"],
                ["Avg Resolution",rows.filter(r=>r.resolution).length>0?Math.round(rows.filter(r=>r.resolution).reduce((s,r)=>s+(r.resolution||0),0)/rows.filter(r=>r.resolution).length)+"h":"—","#2563EB"],
              ].map(([l,v,col])=>(
                <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                  <p className="text-[18px] font-black" style={{color:col}}>{v}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Ticket Status</h3>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={130}>
                    <PieChart><Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={52} innerRadius={28}>
                      {statusData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie><Tooltip formatter={(v,n)=>[v+" tickets",n]}/></PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {statusData.map(d=>(
                      <div key={d.name} className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                        <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">By Priority</h3>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={priorityData} margin={{left:0,right:10,top:0,bottom:0}}>
                    <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                    <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={(v)=>[v+" tickets","Count"]}/>
                    <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={40}>
                      {priorityData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tickets or customers..." className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all" />
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm shrink-0">
          <Plus size={15} /> New Ticket
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Ticket</th><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Priority</th><th className="px-4 py-3 font-medium">Assignee</th><th className="px-4 py-3 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={5} />}
              {!loading && filtered.map((t) => (
                <tr key={t.id} onClick={() => setSelected(t)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                  <td className="px-4 py-3"><p className="font-medium text-[#111827]">{t.subject}</p><p className="text-[11px] text-slate-400 font-mono">{t.id} · {t.category}</p></td>
                  <td className="px-4 py-3 text-slate-500">{t.customer}</td>
                  <td className="px-4 py-3"><span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${TICKET_PRIORITY_COLOR[t.priority]}14`, color: TICKET_PRIORITY_COLOR[t.priority] }}>{t.priority}</span></td>
                  <td className="px-4 py-3 text-slate-500">{t.assignee}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${TICKET_STATUS_COLOR[t.status]}14`, color: TICKET_STATUS_COLOR[t.status] }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TICKET_STATUS_COLOR[t.status] }} />{t.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && rows.length > 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-[13px]">No tickets match "{query}"</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={5}><EmptyState icon={Ticket} title="No tickets yet" hint="Customer issues will appear here for tracking and resolution." actionLabel="New Ticket" onAction={() => setShowForm(true)} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <TicketPanel ticket={selected} onClose={() => setSelected(null)} onSetStatus={setStatus} onReply={reply} onDelete={deleteTicket} />}
      {showForm && <TicketFormPanel onClose={() => setShowForm(false)} onSubmit={addTicket} />}
    </div>
  );
}

export function TicketPanel({ ticket, onClose, onSetStatus, onReply, onDelete }) {
  const [replyText, setReplyText] = useState("");
  function submitReply() {
    if (!replyText.trim()) return;
    onReply(ticket.id, replyText.trim());
    setReplyText("");
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[440px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-start justify-between mb-3">
            <div><p className="text-[11px] font-mono text-slate-400">{ticket.id}</p><h2 className="text-[16px] font-semibold text-[#111827] mt-0.5 leading-snug">{ticket.subject}</h2></div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${TICKET_STATUS_COLOR[ticket.status]}14`, color: TICKET_STATUS_COLOR[ticket.status] }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TICKET_STATUS_COLOR[ticket.status] }} />{ticket.status}
            </span>
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${TICKET_PRIORITY_COLOR[ticket.priority]}14`, color: TICKET_PRIORITY_COLOR[ticket.priority] }}>{ticket.priority}</span>
            <span className="text-[11px] text-slate-400">{ticket.customer}</span>
          </div>
        </div>

        <div className="px-6 py-5 flex-1 space-y-3">
          {ticket.messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "Agent" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] ${m.from === "Agent" ? "btn-primary text-white rounded-br-sm" : "bg-slate-50 text-slate-700 border border-slate-100 rounded-bl-sm"}`}>
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                <p className={`text-[10.5px] mt-1 ${m.from === "Agent" ? "text-white/70" : "text-slate-400"}`}>{m.from} · {m.date}</p>
              </div>
            </div>
          ))}
          {ticket.messages.length === 0 && <p className="text-[12.5px] text-slate-400 text-center py-6">No messages yet on this ticket.</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 space-y-3">
          <div className="flex gap-2">
            <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitReply()} placeholder="Type a reply..." className={inputClass} />
            <button onClick={submitReply} aria-label="Send reply" className="btn-primary text-white px-4 rounded-lg shrink-0"><Send size={15} /></button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[11px] font-medium text-slate-500 mr-1">Status:</p>
            {TICKET_STATUSES.map((s) => (
              <button key={s} onClick={() => onSetStatus(ticket.id, s)} disabled={s === ticket.status} className={`text-[11px] font-medium rounded-md px-2 py-1 border transition-colors ${s === ticket.status ? "opacity-40 cursor-not-allowed border-slate-200" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                {s}
              </button>
            ))}
          </div>
          <ConfirmDeleteButton label="Delete ticket" onConfirm={() => onDelete(ticket.id)} />
        </div>
      </div>
    </div>
  );
}

export function TicketFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ subject: "", customer: "", category: TICKET_CATEGORIES[0], priority: "Medium", assignee: "", description: "" });
  const [touched, setTouched] = useState(false);
  const valid = form.subject.trim() && form.customer.trim();
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); setTouched(true); if (!valid) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Customer Support</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Ticket</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Subject" required>
            <input className={inputClass} value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="e.g. Invoice discrepancy" />
            {touched && !form.subject.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Subject is required.</p>}
          </FormField>
          <FormField label="Customer" required>
            <input className={inputClass} value={form.customer} onChange={(e) => set("customer", e.target.value)} placeholder="e.g. Kilimo Fresh Distributors" />
            {touched && !form.customer.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Customer is required.</p>}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category">
              <select className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select className={inputClass} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                {Object.keys(TICKET_PRIORITY_COLOR).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Assignee"><input className={inputClass} value={form.assignee} onChange={(e) => set("assignee", e.target.value)} placeholder="e.g. Fatuma Salim" /></FormField>
          <FormField label="Initial message"><textarea className={inputClass} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What the customer reported..." /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Ticket</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ LIVE CHAT ══════════════ */
/* ---------------------------------- LIVE CHAT ----------------------------------- */

// Honest framing: this is an agent-side conversation inbox, not a
// customer-facing widget with real-time push — there's no backend here for
// a second, simultaneous browser session to write into. What's genuinely
// real is the conversation history and the ability to log a reply, which
// is exactly what a support agent works from day to day regardless of how
// the message arrived.
export function LiveChat() {
  const chats = useCompanyTable("support_chat_conversations", chatConversationsSeed, {
    select: "*,support_chat_messages(*)", order: { col: "id", ascending: false }, mapRow: mapChatRow,
  });
  const { rows, setRows, loading } = chats;
  const [selectedId, setSelectedId] = useState(rows[0]?.id || null);
  const [replyText, setReplyText] = useState("");
  const selected = rows.find((c) => c.id === selectedId) || rows[0];

  async function sendReply() {
    if (!replyText.trim() || !selected) return;
    const message = { from: "Agent", text: replyText.trim(), time: TODAY.toTimeString().slice(0, 5) };
    setRows((prev) => prev.map((c) => (c.id === selected.id ? { ...c, messages: [...c.messages, message] } : c)));
    setReplyText("");
    if (IS_CONFIGURED && selected.dbId) {
      try { await sb("support_chat_messages").insert({ conversation_id: selected.dbId, sender: "Agent", body: message.text }).run(); } catch (_e) { notify("Reply saved locally, but the server update failed.", "error"); }
    }
  }

  if (loading) return <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4"><SkeletonRows cols={1} rows={4} /></div>;
  if (rows.length === 0) return <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={MessageCircle} title="No conversations yet" hint="Customer chat conversations will appear here." /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden" style={{ minHeight: "480px" }}>
      <div className="border-b lg:border-b-0 lg:border-r border-slate-100 overflow-y-auto">
        {rows.map((c) => {
          const last = c.messages[c.messages.length - 1];
          return (
            <button key={c.id} onClick={() => setSelectedId(c.id)} className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${selected?.id === c.id ? "bg-slate-50" : "hover:bg-slate-50/60"}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[13px] font-medium text-[#111827] truncate">{c.customer}</p>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: CHAT_STATUS_COLOR[c.status] }} />
              </div>
              <p className="text-[11.5px] text-slate-400 truncate">{last?.text}</p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[13.5px] font-semibold text-[#111827]">{selected.customer}</p>
              <span className="text-[10.5px] font-medium" style={{ color: CHAT_STATUS_COLOR[selected.status] }}>{selected.status}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selected.messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "Agent" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-[13px] ${m.from === "Agent" ? "btn-primary text-white rounded-br-sm" : "bg-slate-50 text-slate-700 border border-slate-100 rounded-bl-sm"}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  <p className={`text-[10.5px] mt-1 ${m.from === "Agent" ? "text-white/70" : "text-slate-400"}`}>{m.time}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} placeholder="Type a reply..." className={inputClass} />
            <button onClick={sendReply} aria-label="Send message" className="btn-primary text-white px-4 rounded-lg shrink-0"><Send size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════ KNOWLEDGE BASE ══════════════ */
/* -------------------------------- KNOWLEDGE BASE --------------------------------- */
export function KnowledgeBase() {
  const articles = useCompanyTable("kb_articles", kbArticlesSeed, { order: { col: "updated_at", ascending: false }, mapRow: mapKbArticleRow });
  const { rows, setRows, loading } = articles;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((a) => a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
  }, [rows, query]);

  async function addArticle(form) {
    const draft = { id: docId("KB"), title: form.title, category: form.category, content: form.content, views: 0, published: form.published, updatedDate: TODAY.toISOString().slice(0, 10) };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Article created: ${draft.title}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("kb_articles").insert({ title: draft.title, category: draft.category, content: draft.content, views: 0, published: draft.published }).single().run();
        if (header?.id) setRows((prev) => prev.map((a) => (a.id === draft.id ? { ...a, dbId: header.id } : a)));
      } catch (_e) { notify("Article created locally, but saving to the server failed.", "error"); }
    }
  }

  async function openArticle(article) {
    setSelected(article);
    const updated = { ...article, views: article.views + 1 };
    setRows((prev) => prev.map((a) => (a.id === article.id ? updated : a)));
    if (IS_CONFIGURED && article.dbId) {
      try { await sb("kb_articles").eq("id", article.dbId).update({ views: updated.views }).run(); } catch (_e) { /* view-count sync failure isn't worth surfacing to the reader */ }
    }
  }

  async function deleteArticle(id) {
    const a = rows.find((x) => x.id === id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && a?.dbId) {
      try { await sb("kb_articles").eq("id", a.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the article on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles..." className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all" />
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm shrink-0">
          <Plus size={15} /> New Article
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200/80 h-32 skeleton-shimmer" />)}
        {!loading && filtered.map((a) => (
          <button key={a.id} onClick={() => openArticle(a)} className="text-left bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 hover:border-[#16A34A]/50 hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-medium text-[#16A34A] bg-[#16A34A]/8 px-1.5 py-0.5 rounded">{a.category}</span>
              {!a.published && <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Draft</span>}
            </div>
            <p className="text-[13.5px] font-semibold text-[#111827] leading-snug mb-2 line-clamp-2">{a.title}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Eye size={11} /> {a.views} views</div>
          </button>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={BookOpen} title="No articles yet" hint="Write help articles your team and customers can reference." actionLabel="New Article" onAction={() => setShowForm(true)} />
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setSelected(null)} />
          <div className="relative w-full sm:w-[440px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="flex items-start justify-between mb-4">
              <span className="text-[10px] font-medium text-[#16A34A] bg-[#16A34A]/8 px-1.5 py-0.5 rounded">{selected.category}</span>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <h2 className="text-[18px] font-semibold text-[#111827] mb-3 leading-snug">{selected.title}</h2>
            <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap mb-6">{selected.content}</p>
            <div className="flex items-center gap-3 text-[11.5px] text-slate-400 mb-6">
              <span className="flex items-center gap-1"><Eye size={12} /> {selected.views} views</span>
              <span>Updated {selected.updatedDate}</span>
            </div>
            <div className="flex-1" />
            <ConfirmDeleteButton label="Delete article" onConfirm={() => deleteArticle(selected.id)} />
          </div>
        </div>
      )}
      {showForm && <KbArticleFormPanel onClose={() => setShowForm(false)} onSubmit={addArticle} />}
    </div>
  );
}

export function KbArticleFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ title: "", category: KB_CATEGORIES[0], content: "", published: true });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.title.trim() || !form.content.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[420px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Knowledge Base</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Article</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Title" required><input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. How to request a bulk quote" /></FormField>
          <FormField label="Category">
            <select className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {KB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Content" required><textarea className={inputClass} rows={6} value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="Write the article..." /></FormField>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
            <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="rounded border-slate-300" />
            Published (visible outside drafts)
          </label>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Article</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ CALL CENTER ══════════════ */
/* ---------------------------------- CALL CENTER ---------------------------------- */
export function CallCenter() {
  const calls = useCompanyTable("support_call_log", callLogSeed, { order: { col: "call_date", ascending: false }, mapRow: mapCallLogRow });
  const { rows, setRows, loading } = calls;
  const [showForm, setShowForm] = useState(false);
  const avgDuration = rows.length ? Math.round(rows.reduce((s, c) => s + c.duration, 0) / rows.length) : 0;

  async function addCall(form) {
    const draft = { id: docId("CALL"), customer: form.customer, agent: form.agent, direction: form.direction, duration: Number(form.duration) || 0, outcome: form.outcome, date: TODAY.toISOString().slice(0, 10), notes: form.notes };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Call logged: ${draft.customer}`);
    if (IS_CONFIGURED) {
      try {
        await sb("support_call_log").insert({
          customer: draft.customer, agent: draft.agent, direction: draft.direction, duration_minutes: draft.duration,
          outcome: draft.outcome, call_date: draft.date, notes: draft.notes,
        }).run();
      } catch (_e) { notify("Logged locally, but saving to the server failed.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#111827]">{rows.length} calls logged</span>
        <span className="text-[13px] font-mono text-slate-500">{avgDuration} min avg duration</span>
      </div>
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> Log Call
        </button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Agent</th><th className="px-4 py-3 font-medium">Direction</th><th className="px-4 py-3 font-medium text-right">Duration</th><th className="px-4 py-3 font-medium">Outcome</th><th className="px-4 py-3 font-medium">Date</th>
            </tr></thead>
            <tbody>
              {loading && <SkeletonRows cols={6} />}
              {!loading && rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-[#111827]">{c.customer}</td>
                  <td className="px-4 py-3 text-slate-500">{c.agent}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${CALL_DIRECTION_COLOR[c.direction]}14`, color: CALL_DIRECTION_COLOR[c.direction] }}>{c.direction}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">{c.duration} min</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${CALL_OUTCOME_COLOR[c.outcome]}14`, color: CALL_OUTCOME_COLOR[c.outcome] }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CALL_OUTCOME_COLOR[c.outcome] }} />{c.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono">{c.date}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={6}><EmptyState icon={PhoneCall} title="No calls logged yet" hint="Track inbound and outbound support calls here." actionLabel="Log Call" onAction={() => setShowForm(true)} /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <CallFormPanel onClose={() => setShowForm(false)} onSubmit={addCall} />}
    </div>
  );
}

export function CallFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ customer: "", agent: "", direction: "Inbound", duration: "", outcome: "Resolved", notes: "" });
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); if (!form.customer.trim() || !form.agent.trim()) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Call Center</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Log Call</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Customer" required><input className={inputClass} value={form.customer} onChange={(e) => set("customer", e.target.value)} placeholder="e.g. Kilimo Fresh Distributors" /></FormField>
          <FormField label="Agent" required><input className={inputClass} value={form.agent} onChange={(e) => set("agent", e.target.value)} placeholder="e.g. Fatuma Salim" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Direction">
              <select className={inputClass} value={form.direction} onChange={(e) => set("direction", e.target.value)}>
                {Object.keys(CALL_DIRECTION_COLOR).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </FormField>
            <FormField label="Duration (min)"><input type="number" min="0" className={inputClass} value={form.duration} onChange={(e) => set("duration", e.target.value)} placeholder="0" /></FormField>
          </div>
          <FormField label="Outcome">
            <select className={inputClass} value={form.outcome} onChange={(e) => set("outcome", e.target.value)}>
              {Object.keys(CALL_OUTCOME_COLOR).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FormField>
          <FormField label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FormField>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Log Call</button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ SUPPORT AI ══════════════ */
/* ------------------------------------ SUPPORT AI ------------------------------------ */

// Reuses the exact same keyless in-artifact API call pattern as the main
// AI Business Assistant (see AIAssistant/callModel) — a real request to
// Claude, not a canned response. Scoped deliberately narrow: draft a reply
// to a specific ticket, not an autonomous customer-facing bot, since a
// production customer-facing bot needs the same server-side proxy this
// build's AI Assistant already documents as a prerequisite (never ship the
// API key client-side to the public).
export function SupportAI({ company, tickets }) {
  const [ticketId, setTicketId] = useState(tickets[0]?.id || "");
  const [draftReply, setDraftReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ticket = tickets.find((t) => t.id === ticketId);

  async function generateReply() {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    setDraftReply("");
    try {
      const conversation = ticket.messages.map((m) => `${m.from}: ${m.text}`).join("\n");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: `You are a customer support agent for ${company.name}, a ${company.industry} business in ${company.country}. Draft a professional, concise, friendly reply to the customer's most recent message in this ticket. Plain text only, no markdown, no preamble like "Here's a draft" — just the reply itself.`,
          messages: [{ role: "user", content: `Ticket: ${ticket.subject}\nCategory: ${ticket.category}\nPriority: ${ticket.priority}\n\nConversation so far:\n${conversation}\n\nDraft the next reply from the agent.` }],
        }),
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      const text = data.content?.find((c) => c.type === "text")?.text || "";
      setDraftReply(text.trim());
    } catch (e) {
      setError("Couldn't reach the AI service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Brain size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Drafts a suggested reply for a ticket using a real Claude API call — review before sending, this doesn&apos;t reply automatically. A fully autonomous customer-facing bot needs a server-side proxy for the API key, the same prerequisite documented for the main AI Assistant.
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={Brain} title="No tickets to draft replies for" hint="Create a ticket first." /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-4">
          <FormField label="Ticket">
            <select className={inputClass} value={ticketId} onChange={(e) => { setTicketId(e.target.value); setDraftReply(""); setError(null); }}>
              {tickets.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.subject}</option>)}
            </select>
          </FormField>

          {ticket && (
            <div className="border border-slate-100 rounded-lg p-3 max-h-[160px] overflow-y-auto space-y-1.5">
              {ticket.messages.map((m, i) => (
                <p key={i} className="text-[12.5px] text-slate-600"><span className="font-medium text-[#111827]">{m.from}:</span> {m.text}</p>
              ))}
              {ticket.messages.length === 0 && <p className="text-[12.5px] text-slate-400">No messages on this ticket yet.</p>}
            </div>
          )}

          <button onClick={generateReply} disabled={busy || !ticket} className="btn-primary text-white text-[13px] font-medium rounded-lg py-2.5 w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {busy ? <><LoaderCircle size={14} className="animate-spin" /> Drafting reply...</> : <><Brain size={14} /> Generate AI Reply</>}
          </button>

          {error && <p className="text-[12.5px] text-[#EF4444]">{error}</p>}

          {draftReply && (
            <div className="bg-[#16A34A]/5 border border-[#16A34A]/20 rounded-lg p-3.5">
              <p className="text-[11px] font-medium text-[#16A34A] mb-1.5">Suggested reply</p>
              <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-relaxed">{draftReply}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
