import { useEffect, useState } from "react";
import {
  AlertCircle, Download, Send, X
} from "lucide-react";
import { TOAST_DURATION, TOAST_STYLE } from "../components/ActivityStream.jsx";
import { invoiceCreatedBus } from "../data/sales.jsx";
import { confirmBus, receiptBus, toastBus, waBus } from "../lib/buses.jsx";
import { lineTotal, money } from "../lib/format.jsx";
import { notify } from "../lib/notify.jsx";

export function PostCreateDispatch({ company, crm }) {
  const [inv, setInv]     = useState(null);   // the just-created invoice
  const [sent, setSent]   = useState({});      // which channels were used
  const [visible, setVis] = useState(false);   // animate in/out
  const [closing, setClg] = useState(false);   // closing animation

  useEffect(() => {
    const handler = (invoice) => {
      setInv(invoice);
      setSent({});
      setClg(false);
      setVis(true);
    };
    invoiceCreatedBus.listeners.add(handler);
    return () => invoiceCreatedBus.listeners.delete(handler);
  }, []);

  // Auto-dismiss after 60 seconds if untouched
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => dismiss(), 60000);
    return () => clearTimeout(t);
  }, [visible]);

  function dismiss() {
    setClg(true);
    setTimeout(() => { setVis(false); setClg(false); setInv(null); }, 280);
  }

  if (!inv || !visible) return null;

  const co      = company || window.__smartManagerCompany || {};
  const { subtotal, tax, total } = lineTotal(inv.items || []);
  const fmt     = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));

  // Find customer contact info from CRM
  const lead    = (crm?.rows || []).find(l =>
    (l.company || l.contact || "").toLowerCase() === (inv.customer || "").toLowerCase()
  );
  const phone   = (lead?.phone || inv.customerPhone || "").replace(/[^0-9]/g, "");
  const email   = lead?.email || inv.customerEmail || "";

  // ── WA message body ─────────────────────────────────────────────────
  const waMsg = [
    `*Invoice ${inv.id}* from *${co.name || "SMART MANAGER"}*`,
    ``,
    `Dear ${inv.customer},`,
    ``,
    `Your invoice is ready.`,
    ``,
    `📋 *Invoice:*  ${inv.id}`,
    `📅 *Date:*     ${inv.date}`,
    `📆 *Due:*      ${inv.dueDate || "On receipt"}`,
    `💰 *Amount:*   TZS ${fmt(total)}`,
    ``,
    inv.items?.slice(0, 3).map(it =>
      `  • ${it.name}  ×${it.qty}  @ TZS ${fmt(it.rate)}`
    ).join("\n"),
    inv.items?.length > 3 ? `  • …and ${inv.items.length - 3} more item${inv.items.length - 3 > 1 ? "s" : ""}` : null,
    ``,
    co.bankName   ? `🏦 *Bank:*      ${co.bankName} — ${co.bankAccount || ""}` : null,
    co.mpesa      ? `📱 *M-Pesa:*    ${co.mpesa}` : null,
    ``,
    `Please quote reference *${inv.id}* when making payment.`,
    ``,
    `Thank you for your business!`,
    `_${co.name || "SMART MANAGER"}_`,
  ].filter(l => l !== null).join("\n");

  // ── Email body ───────────────────────────────────────────────────────
  const emailSubject = `Invoice ${inv.id} from ${co.name || "SMART MANAGER"} — TZS ${fmt(total)}`;
  const emailBody    = [
    `Dear ${inv.customer},`,
    ``,
    `Please find your invoice details below.`,
    ``,
    `Invoice No:  ${inv.id}`,
    `Issue Date:  ${inv.date}`,
    `Due Date:    ${inv.dueDate || "On receipt"}`,
    `Amount:      TZS ${fmt(total)} (incl. 18% VAT)`,
    ``,
    `Items:`,
    ...(inv.items || []).map(it => `  ${it.name}  ×${it.qty}  TZS ${fmt((it.qty||1)*(it.rate||0))}`),
    ``,
    `Payment Details:`,
    co.bankName    ? `  Bank:      ${co.bankName}` : null,
    co.bankAccount ? `  Account:   ${co.bankAccount}` : null,
    co.bankBranch  ? `  Branch:    ${co.bankBranch}` : null,
    co.mpesa       ? `  M-Pesa:    ${co.mpesa}` : null,
    ``,
    `Please use reference ${inv.id} when making payment.`,
    ``,
    `Thank you for your business.`,
    ``,
    `Kind regards,`,
    co.owner ? co.owner : null,
    co.name  || "SMART MANAGER",
    co.phone ? `Tel: ${co.phone}` : null,
    co.email ? co.email : null,
  ].filter(l => l !== null).join("\n");

  // ── Actions ──────────────────────────────────────────────────────────
  function sendWhatsApp() {
    if (!phone) {
      // No phone — open WA Center pre-loaded
      waBus.push({ templateId: "invoice", vars: {
        docId: inv.id, amount: fmt(total), dueDate: inv.dueDate || "On receipt", ref: inv.id,
      }});
      notify("Open Collaboration → WhatsApp to send — no phone number found for this customer");
      setSent(s => ({ ...s, whatsapp: true }));
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, "_blank", "noopener");
    setSent(s => ({ ...s, whatsapp: true }));
    notify(`✓ WhatsApp opened for ${inv.customer} — click Send in WhatsApp to deliver`);
    logAudit("Invoice WA sent", "Sales", co.owner || "System", `${inv.id} → ${inv.customer}`);
  }

  function sendEmail() {
    if (!email) {
      emailBus.push({ subject: emailSubject, body: emailBody, tmpl: "invoice" });
      notify("Open Collaboration → Email to send — no email address found for this customer");
      setSent(s => ({ ...s, email: true }));
      return;
    }
    const params = new URLSearchParams();
    params.set("subject", emailSubject);
    params.set("body", emailBody);
    window.location.href = `mailto:${encodeURIComponent(email)}?${params.toString()}`;
    setSent(s => ({ ...s, email: true }));
    notify(`✓ Email client opened for ${inv.customer} — click Send to deliver`);
    logAudit("Invoice email sent", "Sales", co.owner || "System", `${inv.id} → ${inv.customer}`);
  }

  function copyPayLink() {
    const link = `https://pay.${(co.website || "businesssphere.co.tz").replace(/^https?:\/\//,"")}/${inv.id}?amount=${Math.round(total)}&customer=${encodeURIComponent(inv.customer)}`;
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    setSent(s => ({ ...s, link: true }));
    notify(`Payment link copied — Ref: ${inv.id}`);
  }

  function printNow() {
    // Reuse the printInvoice from Sales module (needs the doc format)
    // We rebuild it inline since PostCreateDispatch is outside Sales scope
    const doc = {
      ...inv,
      status: "Unpaid",
      payments: [],
      amountPaid: 0,
      customerEmail: email,
      customerPhone: phone,
    };
    // Trigger the Sales printInvoice via a synthetic event on the invoice
    // The cleanest cross-scope approach: push to a print bus
    printInvoiceBus.push(doc);
    setSent(s => ({ ...s, print: true }));
  }

  // ── Render ────────────────────────────────────────────────────────────
  const ACTIONS = [
    {
      id: "whatsapp",
      label: phone ? "Send via WhatsApp" : "WhatsApp Center",
      sub:    phone ? phone : "No phone — opens WA Center",
      icon:   "📱",
      color:  "#25D366",
      bg:     "#F0FFF4",
      border: "#D1FAE5",
      fn:     sendWhatsApp,
    },
    {
      id: "email",
      label: email ? "Send via Email" : "Email Center",
      sub:   email ? email : "No email — opens Email Center",
      icon:  "✉️",
      color: "#2563EB",
      bg:    "#EFF6FF",
      border:"#BFDBFE",
      fn:    sendEmail,
    },
    {
      id: "print",
      label: "Print / Save PDF",
      sub:   "Professional invoice PDF",
      icon:  "🖨",
      color: "#374151",
      bg:    "#F8FAFB",
      border:"#E5E7EB",
      fn:    printNow,
    },
    {
      id: "link",
      label: "Copy Payment Link",
      sub:   `pay.… / ${inv.id}`,
      icon:  "🔗",
      color: "#7C3AED",
      bg:    "#F5F3FF",
      border:"#DDD6FE",
      fn:    copyPayLink,
    },
  ];

  return (
    <div className={`fixed bottom-6 right-6 z-50 transition-all duration-280 ${closing ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
      style={{animation: closing ? undefined : "slideUp .28s cubic-bezier(.22,1,.36,1)"}}>
      <div className="w-[340px] bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100" style={{background:"#0D2214"}}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-[#16A34A] uppercase tracking-widest">Invoice Created</span>
                <span className="text-[10px] text-[rgba(255,255,255,.3)]">•</span>
                <span className="text-[10px] font-mono text-[rgba(255,255,255,.5)]">{inv.id}</span>
              </div>
              <p className="text-white font-black text-[17px] leading-tight">{inv.customer}</p>
              <p className="text-[#16A34A] font-mono font-bold text-[15px] mt-0.5">TZS {fmt(total)}</p>
            </div>
            <div className="text-right">
              <p className="text-[rgba(255,255,255,.4)] text-[10px] mb-0.5">Due</p>
              <p className="text-white font-semibold text-[12px]">{inv.dueDate || "On receipt"}</p>
              <p className="text-[rgba(255,255,255,.3)] text-[10px] mt-0.5">{inv.items?.length} item{inv.items?.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Items preview pills */}
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {(inv.items || []).slice(0, 3).map((it, i) => (
              <span key={i} className="text-[10.5px] text-[rgba(255,255,255,.6)] bg-[rgba(255,255,255,.08)] px-2 py-0.5 rounded-full">
                {it.name.length > 18 ? it.name.slice(0, 16) + "…" : it.name}
              </span>
            ))}
            {(inv.items?.length || 0) > 3 && (
              <span className="text-[10.5px] text-[rgba(255,255,255,.4)] px-1">+{inv.items.length - 3} more</span>
            )}
          </div>
        </div>

        {/* Subtitle */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[11.5px] font-semibold text-[#111827]">Send this invoice to the customer</p>
          <p className="text-[10.5px] text-slate-400">Choose one or more channels — each can be used independently</p>
        </div>

        {/* Action buttons */}
        <div className="px-3 pb-2 space-y-1.5 mt-1">
          {ACTIONS.map(a => {
            const done = sent[a.id];
            return (
              <button key={a.id} onClick={a.fn}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm active:scale-[.98]"
                style={{
                  background: done ? a.bg : "white",
                  borderColor: done ? a.color + "40" : "#E5E7EB",
                }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[19px] shrink-0"
                  style={{background: a.bg, border: `1.5px solid ${a.border}`}}>
                  {done ? "✓" : a.icon}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[12.5px] font-bold" style={{color: done ? a.color : "#111827"}}>
                    {done ? "Sent — " + a.label : a.label}
                  </p>
                  <p className="text-[10.5px] text-slate-400 truncate">{a.sub}</p>
                </div>
                {done && (
                  <span className="text-[11px] font-black shrink-0" style={{color: a.color}}>✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 flex gap-2">
          <button onClick={dismiss}
            className="flex-1 text-[12px] font-medium text-slate-500 border border-slate-200 rounded-xl py-2 hover:bg-slate-50">
            Dismiss
          </button>
          {Object.keys(sent).length > 0 && (
            <button onClick={dismiss}
              className="flex-1 text-[12px] font-bold text-white rounded-xl py-2 bg-[#16A34A]">
              ✓ Done · Close
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform:translateY(24px) scale(.97); }
          to   { opacity:1; transform:translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}

// Bus for cross-scope PDF printing from PostCreateDispatch
export const printInvoiceBus = {
  listeners: new Set(),
  push(doc) { this.listeners.forEach(fn => fn(doc)); },
};

export function SendReceiptPanel() {
  const [receipt, setReceipt] = useState(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState({});

  useEffect(() => {
    const handler = (r) => {
      setReceipt(r);
      setPhone(r.customerPhone || "");
      setEmail(r.customerEmail || "");
      setSent({});
    };
    receiptBus.listeners.add(handler);
    return () => receiptBus.listeners.delete(handler);
  }, []);

  if (!receipt) return null;

  const total = lineTotal(receipt.items || []).total;
  const refPart = receipt.reference ? " (Ref: " + receipt.reference + ")" : "";
  const msg = encodeURIComponent(
    "✅ Receipt — " + receipt.invoiceId + "\n\nDear " + receipt.customer + ",\n\nPayment of TZS " + money(Math.round(receipt.amount)) + "k received on " + receipt.date + " via " + receipt.method + refPart + ".\n\nThank you for your business!\n\n— SmartManager"
  );
  const subject = encodeURIComponent(`Receipt for ${receipt.invoiceId} — ${receipt.customer}`);

  function sendViaWhatsApp() {
    const num = phone.replace(/[\s\-\(\)]/g, "");
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
    setSent((s) => ({ ...s, whatsapp: true }));
    notify(`WhatsApp opened for ${receipt.customer} — hit Send in WhatsApp to deliver the receipt.`);
  }

  function sendViaEmail() {
    window.location.href = `mailto:${email}?subject=${subject}&body=${msg}`;
    setSent((s) => ({ ...s, email: true }));
    notify(`Email client opened — confirm send to deliver the receipt to ${receipt.customer}.`);
  }

  function sendViaSMS() {
    const num = phone.replace(/[\s\-\(\)]/g, "");
    window.location.href = `sms:${num}?body=${msg}`;
    setSent((s) => ({ ...s, sms: true }));
    notify(`SMS app opened — confirm send to deliver the receipt to ${receipt.customer}.`);
  }

  function printReceipt() {
    const co = window.__smartManagerCompany || {};
    const fmt = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
    const subtotalVal = (receipt.items||[]).reduce((s,it)=>s+(it.qty||1)*(it.rate||0),0);
    const taxVal = subtotalVal * 0.18;
    const itemRows = (receipt.items || []).map((it) =>
      "<tr><td style=\"padding:7px 10px;border-bottom:1px solid #F3F4F6\">" + it.name + "</td>" +
      "<td style=\"padding:7px 10px;border-bottom:1px solid #F3F4F6;text-align:center;font-family:monospace\">" + (it.qty||1) + "</td>" +
      "<td style=\"padding:7px 10px;border-bottom:1px solid #F3F4F6;text-align:right;font-family:monospace\">" + fmt(it.rate||0) + "k</td>" +
      "<td style=\"padding:7px 10px;border-bottom:1px solid #F3F4F6;text-align:right;font-family:monospace;font-weight:600\">" + fmt((it.qty||1)*(it.rate||0)) + "k</td></tr>"
    ).join("");
    const logoHtml = co.logo
      ? "<img src=\"" + co.logo + "\" style=\"height:44px;object-fit:contain;filter:brightness(0) invert(1)\" alt=\"logo\"/>"
      : "<svg width=\"36\" height=\"42\" viewBox=\"0 0 120 140\"><polygon points=\"60,6 114,33 114,107 60,134 6,107 6,33\" fill=\"rgba(255,255,255,.9)\"/><text x=\"60\" y=\"78\" text-anchor=\"middle\" dominant-baseline=\"middle\" fill=\"#16A34A\" font-size=\"52\" font-weight=\"900\" font-family=\"sans-serif\">S</text></svg>";
    const detailStrip = [co.address ? "📍 " + co.address + (co.city ? ", " + co.city : "") : "",
      co.phone ? "📞 " + co.phone : "", co.email ? "✉️ " + co.email : "", co.tin ? "TIN: " + co.tin : ""]
      .filter(Boolean).map((s) => "<span>" + s + "</span>").join(" &nbsp;·&nbsp; ");
    printAsPDF("Receipt " + receipt.invoiceId,
      "<div style=\"font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:white\">" +
      "<div style=\"background:linear-gradient(135deg,#052614,#16A34A);padding:22px 28px;display:flex;align-items:center;justify-content:space-between\">" +
        "<div style=\"display:flex;align-items:center;gap:12px\">" + logoHtml +
          "<div><div style=\"font-size:16px;font-weight:800;color:white\">" + (co.name||"Smart Manager") + "</div>" +
          (co.tagline ? "<div style=\"font-size:10px;color:rgba(255,255,255,.7);font-style:italic\">" + co.tagline + "</div>" : "") + "</div></div>" +
        "<div style=\"text-align:right\"><div style=\"font-size:10px;color:rgba(255,255,255,.6);letter-spacing:.06em;text-transform:uppercase\">Payment Receipt</div>" +
          "<div style=\"font-size:15px;font-weight:900;color:white;margin-top:2px\">" + (receipt.id||docId("RCT")) + "</div></div>" +
      "</div>" +
      (detailStrip ? "<div style=\"background:#F0FDF4;padding:8px 28px;font-size:10.5px;color:#166534\">" + detailStrip + "</div>" : "") +
      "<div style=\"padding:24px 28px\">" +
        "<div style=\"display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #E5E7EB\">" +
          "<div><div style=\"font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#9CA3AF;margin-bottom:4px\">Bill To</div>" +
          "<div style=\"font-size:14px;font-weight:700;color:#111827\">" + receipt.customer + "</div></div>" +
          "<div style=\"text-align:right\"><div style=\"font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#9CA3AF;margin-bottom:4px\">Details</div>" +
          "<div style=\"font-size:11.5px;color:#111827\">Invoice: <strong>" + receipt.invoiceId + "</strong></div>" +
          "<div style=\"font-size:11px;color:#6B7280\">Date: " + receipt.date + "</div>" +
          "<div style=\"font-size:11px;color:#6B7280\">Method: " + receipt.method + "</div>" +
          (receipt.reference ? "<div style=\"font-size:11px;color:#6B7280\">Ref: " + receipt.reference + "</div>" : "") + "</div>" +
        "</div>" +
        "<table style=\"width:100%;border-collapse:collapse;margin-bottom:16px\">" +
          "<thead><tr style=\"background:#F8FAFC;border-bottom:2px solid #E5E7EB\">" +
            "<th style=\"padding:8px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6B7280\">Description</th>" +
            "<th style=\"padding:8px 10px;text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6B7280\">Qty</th>" +
            "<th style=\"padding:8px 10px;text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6B7280\">Rate</th>" +
            "<th style=\"padding:8px 10px;text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6B7280\">Amount</th>" +
          "</tr></thead><tbody>" + itemRows + "</tbody></table>" +
        "<div style=\"border-top:1px solid #E5E7EB;padding-top:12px;margin-bottom:16px\">" +
          "<div style=\"display:flex;justify-content:space-between;font-size:11.5px;color:#6B7280;margin-bottom:4px\"><span>Subtotal</span><span>TZS " + fmt(subtotalVal) + "k</span></div>" +
          "<div style=\"display:flex;justify-content:space-between;font-size:11.5px;color:#6B7280;margin-bottom:10px\"><span>VAT (18%)</span><span>TZS " + fmt(taxVal) + "k</span></div>" +
          "<div style=\"display:flex;justify-content:space-between;padding:12px 16px;background:#052614;border-radius:10px\">" +
            "<span style=\"font-size:14px;font-weight:800;color:white\">TOTAL PAID</span>" +
            "<span style=\"font-size:18px;font-weight:900;color:#4ADE80\">TZS " + fmt(receipt.amount) + "k</span>" +
          "</div>" +
        "</div>" +
        "<div style=\"background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px;text-align:center;margin-bottom:16px\">" +
          "<div style=\"font-size:18px;margin-bottom:4px\">✅</div>" +
          "<div style=\"font-size:13px;font-weight:700;color:#16A34A\">Payment Confirmed</div>" +
          "<div style=\"font-size:11px;color:#166534;margin-top:2px\">This receipt is your official proof of payment.</div>" +
        "</div>" +
        "<div style=\"text-align:center;border-top:1px solid #E5E7EB;padding-top:12px\">" +
          (co.website ? "<div style=\"font-size:11px;color:#16A34A;margin-bottom:4px\">" + co.website + "</div>" : "") +
          "<div style=\"font-size:10px;color:#9CA3AF\">Generated by Smart Manager · " + new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}) + "</div>" +
        "</div>" +
      "</div></div>"
    );
    setSent((s) => ({ ...s, print: true }));
  }

  const CHANNELS = [
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "#22C55E", bg: "#F0FDF4", border: "#86EFAC", fn: sendViaWhatsApp, need: phone, hint: "wa.me link — opens WhatsApp, you tap Send" },
    { id: "email", label: "Email", icon: Mail, color: "#3B82F6", bg: "#EFF6FF", border: "#93C5FD", fn: sendViaEmail, need: email, hint: "mailto: link — opens your email client" },
    { id: "sms", label: "SMS", icon: MessageSquare, color: "#F59E0B", bg: "#FFFBEB", border: "#FCD34D", fn: sendViaSMS, need: phone, hint: "sms: link — opens your SMS app" },
  ];

  return (
    <div className="fixed bottom-24 sm:bottom-6 left-4 z-50 w-[calc(100vw-2rem)] sm:w-[400px]" style={{ animation: "toastIn .25s cubic-bezier(.34,1.4,.64,1)" }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-[#16A34A]/20 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 flex items-center justify-between" style={{ background: "linear-gradient(135deg,#052614,#16A34A)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><CheckCircle2 size={16} className="text-white" /></div>
            <div>
              <p className="text-[13px] font-semibold text-white">Payment received ✓</p>
              <p className="text-[10.5px] text-white/70">{receipt.customer} · TZS {money(Math.round(receipt.amount))}k · {receipt.invoiceId}</p>
            </div>
          </div>
          <button onClick={() => setReceipt(null)} className="text-white/60 hover:text-white"><X size={15} /></button>
        </div>

        <div className="p-4 space-y-3">
          {/* Contact fields */}
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10.5px] text-slate-500 block mb-1">Phone (WhatsApp / SMS)</label>
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255 7XX XXX XXX" /></div>
            <div><label className="text-[10.5px] text-slate-500 block mb-1">Email</label>
              <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" /></div>
          </div>

          {/* Channel buttons */}
          <div className="grid grid-cols-3 gap-2">
            {CHANNELS.map((ch) => {
              const Icon = ch.icon;
              const done = sent[ch.id];
              const disabled = !ch.need;
              return (
                <button key={ch.id} onClick={ch.fn} disabled={disabled}
                  title={disabled ? `Enter ${ch.id === "email" ? "email" : "phone"} first` : ch.hint}
                  className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-[11px] font-medium transition-all disabled:opacity-40"
                  style={{ backgroundColor: done ? ch.bg : "white", borderColor: done ? ch.border : "#E2E8F0", color: done ? ch.color : "#6B7280" }}>
                  <Icon size={16} style={{ color: done ? ch.color : "#94A3B8" }} />
                  {done ? "✓ Opened" : ch.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 text-center">Each button opens your device&apos;s app — confirm send there. Automated sending needs AfricasTalking/SendGrid backend.</p>

          {/* Print PDF */}
          <button onClick={printReceipt} className="w-full flex items-center justify-center gap-2 text-[12.5px] font-medium border border-slate-200 rounded-xl py-2.5 hover:bg-slate-50 transition-colors text-slate-600">
            <Download size={13} className="text-[#16A34A]" /> Download / Print receipt PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// Global Confirmation Dialog — a modal "Are you sure?" that replaces
// the immediate-delete pattern across all 22 modules. Destructive
// actions (variant:"danger") show a red confirm button; neutral ones
// (default) show brand green. Escape key and backdrop click both cancel.
export function ConfirmDialog() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const handler = (d) => setDialog(d);
    confirmBus.listeners.add(handler);
    return () => confirmBus.listeners.delete(handler);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => { if (e.key === "Escape") setDialog(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  if (!dialog) return null;
  const danger = dialog.variant === "danger";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setDialog(null)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200/60" onClick={(e) => e.stopPropagation()}>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${danger ? "bg-red-50" : "bg-[#DCFCE7]"}`}>
          {danger ? <AlertCircle size={22} className="text-[#EF4444]" /> : <AlertCircle size={22} className="text-[#16A34A]" />}
        </div>
        <h3 className="text-[16px] font-bold text-[#111827] text-center mb-2" style={{ fontFamily: "Poppins,Inter,sans-serif" }}>
          {dialog.title || (danger ? "Are you sure?" : "Confirm action")}
        </h3>
        <p className="text-[13px] text-slate-500 text-center mb-6 leading-relaxed">{dialog.message}</p>
        <div className="flex gap-3">
          <button onClick={() => setDialog(null)} className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { dialog.onConfirm(); setDialog(null); }}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all"
            style={{ background: danger ? "linear-gradient(135deg,#EF4444,#DC2626)" : "linear-gradient(135deg,#16A34A,#22C55E)", boxShadow: danger ? "0 4px 12px rgba(239,68,68,0.3)" : "0 4px 12px rgba(22,163,74,0.3)" }}
          >
            {dialog.confirmLabel || (danger ? "Delete" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onToast = (t) => {
      setToasts((prev) => [...prev.slice(-4), { ...t, born: Date.now() }]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), TOAST_DURATION);
    };
    toastBus.listeners.add(onToast);
    return () => toastBus.listeners.delete(onToast);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-6 right-4 z-[60] flex flex-col gap-2.5 w-[calc(100vw-2rem)] sm:w-[360px] pointer-events-none">
      {toasts.map((t) => {
        const s = TOAST_STYLE[t.type] || TOAST_STYLE.info;
        const Icon = s.Icon;
        return (
          <div key={t.id} className="pointer-events-auto overflow-hidden rounded-xl shadow-2xl" style={{ animation: "toastIn .22s cubic-bezier(.34,1.4,.64,1)", backdropFilter: "blur(16px)", background: s.bg, border: `1px solid ${s.accent}28` }}>
            {/* Auto-draining progress bar */}
            <div className="h-[2px] w-full" style={{ background: `${s.accent}30` }}>
              <div className="h-full" style={{ backgroundColor: s.accent, animation: `toastDrain ${TOAST_DURATION}ms linear forwards` }} />
            </div>
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${s.accent}22` }}>
                <Icon size={14} style={{ color: s.accent }} />
              </div>
              <p className="flex-1 text-[12.5px] leading-snug font-medium" style={{ color: s.label }}>{t.message}</p>
              <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5" aria-label="Dismiss">
                <X size={13} className="text-white" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
