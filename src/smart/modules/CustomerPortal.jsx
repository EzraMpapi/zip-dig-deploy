import { useState } from "react";
import {
  Brain, CheckCircle2, CreditCard, Download, FileText, Headphones, LoaderCircle, Package,
  Plus, ReceiptText, Send
} from "lucide-react";
import { BrandMark } from "../components/BrandMark.jsx";
import { EmptyState, FormField, inputClass } from "../components/ui.jsx";
import { ordersSeed } from "../data/assets.jsx";
import { FILE_TYPE_STYLE } from "../data/documents.jsx";
import { INTEGRATION_CONNECTIONS } from "../data/integrations.jsx";
import { supportTicketsSeed } from "../data/support.jsx";
import { ProfileMenu } from "../lib/alerts.jsx";
import { printAsPDF } from "../lib/export.jsx";
import { TODAY, docId, lineTotal, money } from "../lib/format.jsx";
import {
  mapIntegrationConnectionRow,
  mapOrderRow,
  mapTicketRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ CUSTOMER PORTAL ══════════════ */
/* ---------------------------------- CUSTOMER PORTAL ---------------------------------- */

// The real security boundary here is the schema, not this component. In
// live mode, the RLS policies added alongside profiles.customer_ref
// (invoices_customer_read, orders_customer_read, etc.) mean a signed-in
// External Client's session can only ever receive their own rows from the
// database — sb() runs the identical query an internal user's session
// would, and Postgres decides what comes back based on who's asking. This
// component's own "match by customer name" filtering below is a second,
// redundant safety net for demo mode (where there is no real RLS to rely
// on) — in live mode it's filtering a result set that was already scoped
// correctly before it ever reached the browser.
export function CustomerPortal({ currentUser, invoices, filesHook, onSignOut }) {
  const [tab, setTab] = useState("invoices");
  const orders = useCompanyTable("sales_orders", ordersSeed, { mapRow: mapOrderRow });
  const tickets = useCompanyTable("support_tickets", supportTicketsSeed, { mapRow: mapTicketRow });
  const connections = useCompanyTable("integration_connections", INTEGRATION_CONNECTIONS.map((c) => ({ id: c.id, enabled: false, tenantId: "", clientId: "", paymentLink: "", paypalMeLink: "", webhookUrl: "", apiKey: "", businessNumber: "", storeUrl: "", terminalId: "" })), { mapRow: mapIntegrationConnectionRow });

  // Demo mode has no real customer_ref to filter by — this picks the
  // first customer name appearing in the seed data purely so the portal
  // has something real to show, and says so plainly rather than quietly
  // showing every customer's invoices as if that were normal.
  const effectiveCustomer = currentUser.customerRef || invoices.rows[0]?.customer || "Demo Customer";
  const myInvoices = invoices.rows.filter((inv) => inv.customer === effectiveCustomer);
  const myOrders = orders.rows.filter((o) => o.customer === effectiveCustomer);
  const myTickets = tickets.rows.filter((t) => t.customer === effectiveCustomer);
  const myDocuments = filesHook.rows.filter((f) => myInvoices.some((i) => i.id === f.linkedRecord) || myOrders.some((o) => o.id === f.linkedRecord));

  const stripe = connections.rows.find((c) => c.id === "stripe");
  const paypal = connections.rows.find((c) => c.id === "paypal");

  const PORTAL_TABS = [
    { id: "invoices", label: "Invoices", icon: ReceiptText },
    { id: "orders", label: "Orders", icon: Package },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "support", label: "Support", icon: Headphones },
    { id: "chat", label: "Chat with AI", icon: Brain },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <BrandMark size={32} textSize={14} />
          <div>
            <p className="text-[13.5px] font-semibold text-[#111827] leading-tight">Customer Portal</p>
            <p className="text-[10.5px] text-slate-400 leading-tight">{effectiveCustomer}</p>
          </div>
        </div>
        <ProfileMenu currentUser={currentUser} session={{ demo: !currentUser.customerRef }} onSignOut={onSignOut} />
      </header>

      {!currentUser.customerRef && (
        <div className="bg-[#F59E0B]/10 border-b border-[#F59E0B]/20 px-4 sm:px-6 py-2">
          <p className="text-[11.5px] text-[#8a670a]">Demo mode — showing sample data for "{effectiveCustomer}" since there's no real signed-in customer identity yet. In live mode, this portal shows exactly one customer's own records, enforced by the database itself, not by this screen.</p>
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

        <PortalFeedbackWidget currentUser={currentUser} />
        {tab === "invoices" && <CustomerInvoicesTab myInvoices={myInvoices} stripe={stripe} paypal={paypal} />}
        {tab === "orders" && <CustomerOrdersTab myOrders={myOrders} />}
        {tab === "documents" && <CustomerDocumentsTab myDocuments={myDocuments} />}
        {tab === "support" && <CustomerSupportTab myTickets={myTickets} tickets={tickets} customerName={effectiveCustomer} />}
        {tab === "chat" && <CustomerAIChat customerName={effectiveCustomer} myInvoices={myInvoices} myOrders={myOrders} />}
      </div>
    </div>
  );
}

// Voice of the customer, collected where the customer actually is: the
// portal. One-tap 0–10 NPS with an optional comment, written to the real
// customer_feedback table. Dismisses after submitting; a portal that
// nags for ratings on every visit trains people to ignore it.
export function PortalFeedbackWidget({ currentUser }) {
  const [score, setScore] = useState(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  if (done) return null;
  async function submit() {
    if (score === null) return;
    setDone(true);
    notify("Thank you — your feedback landed with the team.");
    if (IS_CONFIGURED) {
      try { await sb("customer_feedback").insert({ customer_name: currentUser.customerRef || currentUser.name, nps_score: score, comment: comment.trim() || null }).run(); } catch (_e) {}
    }
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 mb-4">
      <p className="text-[12.5px] font-medium text-[#111827]">How likely are you to recommend us? <span className="text-slate-400 font-normal">(0 = not at all, 10 = extremely)</span></p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {Array.from({ length: 11 }, (_, i) => (
          <button key={i} onClick={() => setScore(i)} className={`w-8 h-8 rounded-lg text-[12px] font-mono font-medium border ${score === i ? "bg-[#16A34A] text-white border-[#16A34A]" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>{i}</button>
        ))}
      </div>
      {score !== null && (
        <div className="flex gap-2 mt-2.5">
          <input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything we should know? (optional)" />
          <button onClick={submit} className="btn-primary text-white text-[12px] font-medium rounded-lg px-3.5 shrink-0">Send</button>
        </div>
      )}
    </div>
  );
}

export function CustomerInvoicesTab({ myInvoices, stripe, paypal }) {
  const [payingId, setPayingId] = useState(null);

  // Self-serve receipt — the same proven printAsPDF isolation every
  // internal report uses (browser print-to-PDF, clean window, no app
  // chrome), now in the customer's own hands: real invoice data, real
  // payment history, no email round-trip to the business.
  function downloadReceipt(inv) {
    const t = lineTotal(inv.items);
    const items = inv.items.map((it) => `<tr><td>${it.name}</td><td class="right">${it.qty}</td><td class="right">${money(it.rate)}k</td><td class="right">${money(Math.round(it.qty * it.rate))}k</td></tr>`).join("");
    const pays = (inv.payments || []).map((p) => `<tr><td>${p.date}</td><td>${p.method || "—"}</td><td class="right">${money(Math.round(p.amount))}k</td></tr>`).join("");
    printAsPDF(`Receipt ${inv.id}`, `
      <h1>Receipt — ${inv.id}</h1>
      <p style="color:#888;font-size:12px;">${inv.customer} · issued ${inv.date} · status: ${inv.status}</p>
      <table><thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead><tbody>${items}</tbody></table>
      <p style="text-align:right;font-weight:bold;margin-top:10px;">Total: TZS ${money(Math.round(t.total))}k · Paid: TZS ${money(Math.round(inv.amountPaid || 0))}k</p>
      ${pays ? "<h2 style=\"font-size:13px;margin-top:16px;\">Payments</h2><table><thead><tr><th>Date</th><th>Method</th><th class=\"right\">Amount</th></tr></thead><tbody>" + pays + "</tbody></table>" : ""}
      <p style="font-size:10.5px;color:#888;margin-top:18px;">Generated from live records by the customer portal.</p>
    `);
  }
  const canPayOnline = stripe?.enabled && stripe?.paymentLink || paypal?.enabled && paypal?.paypalMeLink;

  function payOnline(invoiceId) {
    const url = stripe?.enabled && stripe?.paymentLink ? stripe.paymentLink : paypal.paypalMeLink;
    // Neither Stripe Payment Links nor a plain PayPal.me link support a
    // dynamic amount from a URL param without more setup on the business's
    // side — the honest move is opening the real page and telling the
    // customer to reference their invoice number, not silently pretending
    // the amount carried over.
    notify(`Opening the payment page — reference invoice ${invoiceId} so ${stripe?.enabled ? "the business" : "PayPal"} can match your payment.`);
    window.open(url, "_blank");
    setPayingId(invoiceId);
  }

  return (
    <div className="space-y-3">
      {!canPayOnline && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-3.5">
          <p className="text-[11.5px] text-slate-400">Online payment isn&apos;t configured yet — the business needs to connect Stripe or PayPal in their own Integrations settings first.</p>
        </div>
      )}
      {myInvoices.length === 0 && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={ReceiptText} title="No invoices yet" hint="Invoices billed to you will appear here." /></div>}
      {myInvoices.map((inv) => {
        const { total } = lineTotal(inv.items);
        const balance = total - (inv.amountPaid || 0);
        return (
          <div key={inv.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-start justify-between mb-2">
              <div><p className="text-[13.5px] font-semibold text-[#111827]">{inv.id}</p><p className="text-[11px] text-slate-400">Due {inv.dueDate}</p></div>
              <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${inv.status === "Paid" ? "bg-[#16A34A]/10 text-[#16A34A]" : "bg-[#EF4444]/10 text-[#EF4444]"}`}>{inv.status}</span>
              <button onClick={() => downloadReceipt(inv)} className="text-[11px] font-medium text-[#16A34A] hover:underline flex items-center gap-1 ml-2"><Download size={11} /> Receipt</button>
            </div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[20px] font-mono font-bold text-[#111827]">TZS {money(Math.round(total))}k</p>
              {balance > 0 && <p className="text-[11.5px] text-[#EF4444]">TZS {money(Math.round(balance))}k due</p>}
            </div>
            {balance > 0 && canPayOnline && (
              <button onClick={() => payOnline(inv.id)} className="btn-primary text-white text-[12.5px] font-medium rounded-lg py-2.5 w-full flex items-center justify-center gap-2">
                <CreditCard size={14} /> Pay Online
              </button>
            )}
            {payingId === inv.id && <p className="text-[11px] text-slate-400 mt-2 text-center">Paid already? It can take a moment to reflect here — check back shortly.</p>}
          </div>
        );
      })}
    </div>
  );
}

export function CustomerOrdersTab({ myOrders }) {
  const ORDER_STEPS = ["Pending", "Confirmed", "Fulfilled"];
  return (
    <div className="space-y-3">
      {myOrders.length === 0 && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={Package} title="No orders yet" hint="Your orders will appear here once placed." /></div>}
      {myOrders.map((o) => {
        const stepIndex = o.status === "Cancelled" ? -1 : ORDER_STEPS.indexOf(o.status);
        return (
          <div key={o.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13.5px] font-semibold text-[#111827]">{o.id}</p>
              <span className="text-[11px] text-slate-400">{o.date}</span>
            </div>
            {o.status === "Cancelled" ? (
              <p className="text-[12.5px] text-[#EF4444]">This order was cancelled.</p>
            ) : (
              <div className="flex items-center">
                {ORDER_STEPS.map((step, i) => (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i <= stepIndex ? "bg-[#16A34A] text-white" : "bg-slate-100 text-slate-400"}`}>{i <= stepIndex ? <CheckCircle2 size={13} /> : i + 1}</div>
                      <span className={`text-[10px] mt-1 ${i <= stepIndex ? "text-[#111827] font-medium" : "text-slate-400"}`}>{step}</span>
                    </div>
                    {i < ORDER_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < stepIndex ? "bg-[#16A34A]" : "bg-slate-100"}`} />}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CustomerDocumentsTab({ myDocuments }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
      {myDocuments.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" hint="Contracts and paperwork tied to your invoices or orders will appear here." />
      ) : (
        <div className="divide-y divide-slate-50">
          {myDocuments.map((f) => {
            const meta = FILE_TYPE_STYLE[f.type] || FILE_TYPE_STYLE.pdf;
            const Icon = meta.Icon;
            return (
              <div key={f.id} className="flex items-center gap-2.5 px-4 py-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}14` }}><Icon size={14} style={{ color: meta.color }} /></div>
                <div className="min-w-0 flex-1"><p className="text-[12.5px] font-medium text-[#111827] truncate">{f.name}</p><p className="text-[11px] text-slate-400">{f.size} · {f.date}</p></div>
                <span className="text-[11px] text-slate-300">No file storage in this demo</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CustomerSupportTab({ myTickets, tickets, customerName }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "General", description: "" });

  async function submitTicket(e) {
    e.preventDefault();
    if (!form.subject.trim()) return;
    const draft = { id: docId("TK"), subject: form.subject, customer: customerName, category: form.category, priority: "Medium", status: "Open", assignee: null, createdDate: TODAY.toISOString().slice(0, 10) };
    tickets.setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    setForm({ subject: "", category: "General", description: "" });
    notify(`Ticket ${draft.id} submitted — the support team will follow up.`);
    if (IS_CONFIGURED) {
      try { await sb("support_tickets").insert({ doc_number: draft.id, subject: draft.subject, customer: draft.customer, category: draft.category }).run(); } catch (_e) { notify("Ticket saved locally, but sending to the server failed.", "error"); }
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-white text-[12.5px] font-medium rounded-lg py-2.5 px-4 flex items-center gap-2 w-full sm:w-auto">
        <Plus size={14} /> Open a Support Ticket
      </button>
      {showForm && (
        <form onSubmit={submitTicket} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-3">
          <FormField label="Subject" required><input className={inputClass} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="What's this about?" /></FormField>
          <FormField label="Category">
            <select className={inputClass} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {["Billing", "Technical", "Product", "General"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Details"><textarea className={inputClass} rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Tell us more..." /></FormField>
          <button type="submit" className="btn-primary text-white text-[12.5px] font-medium rounded-lg py-2.5 w-full">Submit Ticket</button>
        </form>
      )}
      <div className="space-y-2">
        {myTickets.length === 0 && <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={Headphones} title="No tickets yet" hint="Tickets you open will show up here." /></div>}
        {myTickets.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex items-center justify-between">
            <div className="min-w-0"><p className="text-[12.5px] font-medium text-[#111827] truncate">{t.subject}</p><p className="text-[11px] text-slate-400">{t.id} · {t.category} · {t.createdDate}</p></div>
            <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${t.status === "Resolved" || t.status === "Closed" ? "bg-[#16A34A]/10 text-[#16A34A]" : "bg-[#F59E0B]/10 text-[#F59E0B]"}`}>{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A deliberately narrow AI persona — it only ever sees THIS customer's own
// invoices and orders, never the full business snapshot every internal
// persona in section 23 reads from. A customer-facing AI leaking another
// customer's balance, or the business's internal costs and margins, would
// be a real privacy failure, not a hypothetical one; the safest fix is
// structural — this component is never given access to anything broader
// than what's already been filtered to this one customer above.
export function CustomerAIChat({ customerName, myInvoices, myOrders }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!input.trim() || busy) return;
    const userMsg = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    try {
      const snapshot = {
        customer: customerName,
        invoices: myInvoices.map((i) => ({ id: i.id, status: i.status, due_date: i.dueDate, total_tzs_k: Math.round(lineTotal(i.items).total), balance_tzs_k: Math.round(lineTotal(i.items).total - (i.amountPaid || 0)) })),
        orders: myOrders.map((o) => ({ id: o.id, status: o.status, order_date: o.date })),
      };
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: `You are a customer support assistant for ${customerName}. You can only discuss ${customerName}'s own invoices and orders, provided below as JSON — never invent information not present here, and never discuss any other customer or internal business figures, because you have no access to them. If asked about something outside this data, say you don't have that information and suggest opening a support ticket.\n\nYour data:\n${JSON.stringify(snapshot, null, 2)}`,
          messages: [...messages, userMsg],
        }),
      });
      const data = await response.json();
      const text = data.content?.find((c) => c.type === "text")?.text || "Sorry, I couldn't process that.";
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
    } catch (_e) {
      setMessages((prev) => [...prev, { role: "assistant", content: "I couldn't reach the AI service — please try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col h-[480px]">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[12.5px] font-medium text-[#111827]">Chat with AI</p>
        <p className="text-[11px] text-slate-400">Scoped to your own invoices and orders only — nothing else about this business.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && <p className="text-[12.5px] text-slate-400 text-center py-8">Ask about your invoices or order status.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-[13px] ${m.role === "user" ? "btn-primary text-white" : "bg-slate-50 text-slate-700"}`}>{m.content}</div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><LoaderCircle size={16} className="animate-spin text-[#16A34A]" /></div>}
      </div>
      <div className="p-3 border-t border-slate-100 flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask about your invoices or orders..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#16A34A]" />
        <button onClick={send} disabled={busy || !input.trim()} className="btn-primary text-white rounded-lg px-3 disabled:opacity-40" aria-label="Send"><Send size={15} /></button>
      </div>
    </div>
  );
}
