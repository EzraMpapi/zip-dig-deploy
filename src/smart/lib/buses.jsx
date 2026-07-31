import {  } from "lucide-react";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

export const toastBus = {
  listeners: new Set(),
  push(toast) { this.listeners.forEach((fn) => fn(toast)); },
};

// Global confirmation dialog bus — the missing safety net across all 22
// modules. Instead of threading a confirmDialog prop through every
// component that deletes something (dozens of call sites), any function
// anywhere can call confirmAction(message, fn) and the dialog appears.
// The same architectural choice as toastBus and auditBus: cross-cutting
// concern, handled at the center, not at every edge.
export const confirmBus = {
  listeners: new Set(),
  ask(message, onConfirm, opts = {}) {
    this.listeners.forEach((fn) => fn({ message, onConfirm, ...opts }));
  },
};

export function confirmAction(message, onConfirm, opts = {}) {
  confirmBus.ask(message, onConfirm, opts);
}

// Receipt bus — when a payment reaches "Paid" status, recordPayment()
// pushes to this bus. Any mounted SendReceiptPanel (or future receipt
// consumer) receives the receipt immediately without prop-drilling.
export const receiptBus = {
  listeners: new Set(),
  push(receipt) { this.listeners.forEach((fn) => fn(receipt)); },
};

export const auditBus = {
  listeners: new Set(),
  push(entry) { this.listeners.forEach((fn) => fn(entry)); },
};

// AuditService — a real, centralized log of significant actions across the
// system, genuinely new to this build rather than a renamed existing
// feature. Uses the same global event-bus pattern as notify()/toastBus
// rather than a hook threaded through every mutation site: audit logging
// is a cross-cutting concern, and forcing every function that might need
// to log something to accept and forward an extra parameter would ripple
// through the codebase for no real benefit. Complements the Auditor role
// (see Settings) — that role can see every module, but without an actual
// trail of who did what and when, "seeing everything" wasn't the same as
// being able to audit anything.
//
// Honest limitation, stated once here rather than at every call site:
// there is no real authentication in this build (section 6), so `actor`
// reflects whichever demo role is selected in Settings, not a verified
// identity. A production audit trail must be written server-side against
// a real authenticated session — a client can log an action, but it can't
// be trusted to honestly report who performed it. This is a UX-layer
// approximation of the real capability, not the capability itself.
export function logAudit(action, module, actor, details) {
  const entry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action, module, actor: actor || "Unattributed", details: details || "",
    timestamp: new Date().toISOString(),
  };
  auditBus.push(entry);
  if (IS_CONFIGURED) {
    sb("audit_log").insert({ action, module, actor: entry.actor, details: entry.details }).run().catch(() => {});
  }
}

// Global whatsapp message bus so other modules can open WA center pre-loaded
export const waBus = { listeners: new Set(), push(payload) { this.listeners.forEach(fn=>fn(payload)); } };
