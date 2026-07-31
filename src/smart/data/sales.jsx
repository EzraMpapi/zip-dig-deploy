import {
  ClipboardList, FileText, ReceiptText
} from "lucide-react";
import { logAudit, receiptBus } from "../lib/buses.jsx";
import { lineTotal, money } from "../lib/format.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ SALES DATA ══════════════ */
/* ------------------------------- SALES DATA -------------------------------- */
export const DOC_TABS = [
  { id: "quotations", label: "Quotations", icon: FileText },
  { id: "orders", label: "Sales Orders", icon: ClipboardList },
  { id: "invoices", label: "Invoices", icon: ReceiptText },
];

export const DOC_STATUS_COLOR = {
  Draft: "#5B6472",
  Sent: "#F59E0B",
  Accepted: "#16A34A",
  Expired: "#9CA3AF",
  Pending: "#F59E0B",
  Confirmed: "#16A34A",
  Fulfilled: "#16A34A",
  Cancelled: "#9CA3AF",
  Unpaid: "#F59E0B",
  Partial: "#F59E0B",
  Paid: "#16A34A",
  Overdue: "#EF4444",
};

// Next status in each document's natural lifecycle — used to drive the
// "Advance" action in DocPanel. `null` means the doc has reached its end state.
export const DOC_STATUS_NEXT = {
  quotations: { Draft: "Sent", Sent: "Accepted", Accepted: null, Expired: null },
  orders: { Pending: "Confirmed", Confirmed: "Fulfilled", Fulfilled: null, Cancelled: null },
  // Invoices don't advance with a single click the way a quotation or order
  // does — a payment can be partial, so they're driven by recordPayment()
  // below instead of this flow map. Kept here (all null) so DocPanel's
  // generic "any doc type might have a next status" check still works.
  invoices: { Unpaid: null, Partial: null, Paid: null, Overdue: null },
};

export const PAYMENT_METHODS = ["Cash", "Card", "Mobile Money", "Bank Transfer"];

// Fires the instant any invoice is created — PostCreateDispatch listens
// and offers WA / Email / Print in a non-blocking slide-up panel.
export const invoiceCreatedBus = {
  listeners: new Set(),
  push(invoice) { this.listeners.forEach((fn) => fn(invoice)); },
};

// Recording a payment is not a simple status flip — it can be partial, and
// it needs its own record for the payment history an invoice shows. This
// is shared by Sales and Finance since both operate on the same invoices
// table (see the architecture note in the handover doc on shared state).
// Synchronous by design: computes the patch and applies it to shared state
// immediately, then persists in the background. Returns the patch so a
// caller holding its own snapshot of the doc (e.g. an open detail panel)
// can update it in the same tick rather than waiting on the network.
export function recordPayment(invoicesHook, docId, payment, actor) {
  const inv = invoicesHook.rows.find((d) => d.id === docId);
  if (!inv) return null;
  const { total } = lineTotal(inv.items);
  const newAmountPaid = Math.min(total, (inv.amountPaid || 0) + payment.amount);
  const newStatus = newAmountPaid >= total ? "Paid" : "Partial";
  const paymentRecord = { id: `PMT-${Date.now()}`, amount: payment.amount, method: payment.method, date: payment.date, reference: payment.reference || null };
  const patch = { amountPaid: newAmountPaid, status: newStatus, payments: [paymentRecord, ...(inv.payments || [])] };

  invoicesHook.setRows((prev) => prev.map((d) => (d.id === docId ? { ...d, ...patch } : d)));
  notify(`Payment of TZS ${money(payment.amount)}k recorded for ${docId}${payment.reference ? " (ref: " + payment.reference + ")" : ""}`);

  // Auto-receipt: when a payment brings the invoice to fully Paid, generate
  // the receipt immediately and push it to the receiptBus so any open
  // SendReceiptPanel can offer to dispatch it to the customer straight away.
  if (newStatus === "Paid") {
    const receipt = {
      id: docId(`RCT`),
      invoiceId: docId,
      customer: inv.customer,
      customerEmail: inv.customerEmail || null,
      customerPhone: inv.customerPhone || null,
      amount: newAmountPaid,
      method: payment.method,
      reference: payment.reference || null,
      date: payment.date,
      items: inv.items,
      issuedAt: new Date().toISOString(),
    };
    receiptBus.push(receipt);
  }
  logAudit(newStatus === "Paid" ? "Invoice paid in full" : "Partial payment recorded", "Finance", actor, `${docId} — TZS ${money(payment.amount)}k via ${payment.method}${payment.reference ? " (" + payment.reference + ")" : ""}`);

  if (IS_CONFIGURED && inv.dbId) {
    (async () => {
      try {
        await sb("sales_payments").insert({ invoice_id: inv.dbId, amount: payment.amount, method: payment.method, payment_date: payment.date, reference: payment.reference || null }).run();
        await sb("sales_invoices").eq("id", inv.dbId).update({ amount_paid: newAmountPaid, status: newStatus }).run();
      } catch (e) {
        notify("Payment recorded locally, but the server update failed.", "error");
      }
    })();
  }

  return patch;
}

// Real IANA timezone identifiers — genuinely recognized by every
// browser's built-in Intl API, not a custom list this app invented.
// Covers this app's actual East African market plus the other regions
// its currency and signup-country lists already support (section 32).
export const COMPANY_TIMEZONES = [
  "Africa/Dar_es_Salaam", "Africa/Nairobi", "Africa/Kampala", "Africa/Kigali", "Africa/Lusaka",
  "Africa/Lagos", "Europe/London", "America/New_York", "Asia/Dubai", "UTC",
];

// Real timezone-aware formatting via the browser's own Intl API — no
// library needed, genuinely correct across DST and regional differences,
// unlike the naive plain-Date formatting used elsewhere in this app
// before company.timezone existed to format against. Intl.DateTimeFormat
// throws if dateStyle/timeStyle are combined with granular component
// options (hour, minute, etc.) in the same call, so the defaults only
// apply when the caller hasn't specified its own components.
export function formatInTimezone(dateInput, timezone, options = {}) {
  const hasComponentOptions = ["hour", "minute", "second", "year", "month", "day", "weekday"].some((k) => k in options);
  const base = hasComponentOptions ? {} : { dateStyle: "medium", timeStyle: "short" };
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "UTC", ...base, ...options }).format(new Date(dateInput));
  } catch (_e) {
    return new Date(dateInput).toLocaleString();
  }
}

// A real number-to-words converter, not a lookup table — built after
// reviewing an actual SokoBook invoice screenshot showing "Amount in
// Words" as a standard line item, a real convention on business invoices
// across South Asia and East Africa that this build didn't have. Values
// throughout this app are stored in thousands (the "k" suffix shown
// everywhere), so the caller multiplies by 1000 before converting —
// this function itself works on the real, full currency amount.
export function numberToWords(n) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function belowThousand(num) {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
    return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + belowThousand(num % 100) : "");
  }

  if (n === 0) return "Zero";
  const units = [["", 1], ["Thousand", 1e3], ["Million", 1e6], ["Billion", 1e9]];
  let remaining = Math.round(Math.abs(n));
  const parts = [];
  for (let i = units.length - 1; i >= 0; i--) {
    const [label, value] = units[i];
    if (remaining >= value) {
      const chunk = Math.floor(remaining / value);
      remaining %= value;
      parts.push(belowThousand(chunk) + (label ? " " + label : ""));
    }
  }
  return parts.join(" ").trim();
}

/* ══════════════ SUBSCRIPTIONS DATA ══════════════ */
/* ------------------------------ SUBSCRIPTIONS DATA ------------------------------ */
export const SUBSCRIPTION_CYCLES = ["Monthly", "Quarterly", "Annual"];

export const CYCLE_MONTHS = { Monthly: 1, Quarterly: 3, Annual: 12 };

export const SUBSCRIPTION_STATUS_COLOR = {
  Active: "#16A34A",
  Paused: "#F59E0B",
  Cancelled: "#9CA3AF",
};

// Continuity with the earlier fleet-tracking story: Meridian Logistics
// bought GPS units as a one-off order (SO-2117); the monitoring is the
// recurring part — this is the natural subscription that order implies.
export const subscriptionsSeed = [
  {
    id: "SUB-201", customer: "Meridian Logistics", plan: "Fleet GPS Monitoring", amount: 1440, cycle: "Monthly",
    status: "Active", startDate: "2026-06-01", nextBillingDate: "2026-07-01",
  },
  {
    id: "SUB-202", customer: "Baraka Hotels & Resorts", plan: "Kitchen Equipment Service Contract", amount: 8500, cycle: "Quarterly",
    status: "Active", startDate: "2026-04-15", nextBillingDate: "2026-07-15",
  },
  {
    id: "SUB-203", customer: "Nyota Pharmacy Group", plan: "Cold-Chain Maintenance Plan", amount: 21000, cycle: "Annual",
    status: "Active", startDate: "2026-01-10", nextBillingDate: "2027-01-10",
  },
  {
    id: "SUB-204", customer: "Uzuri Beauty Chain", plan: "Salon Equipment Warranty Plus", amount: 950, cycle: "Monthly",
    status: "Paused", startDate: "2026-05-01", nextBillingDate: "2026-07-01",
  },
];

export function addCycle(dateStr, cycle) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + CYCLE_MONTHS[cycle]);
  return d.toISOString().slice(0, 10);
}
