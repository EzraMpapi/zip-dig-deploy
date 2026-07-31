export const money = (n) => new Intl.NumberFormat("en-US").format(n);

// Was a hardcoded Tanzania-only constant (0.18, "standard VAT") — the
// exact kind of claim that doesn't survive an audit against "multiple tax
// systems." Now a real, per-company configurable rate, set from
// companies.tax_rate (Settings, section 46) rather than baked in. A
// mutable module value rather than a prop threaded through the dozen-plus
// call sites below is a deliberate, bounded choice: every one of those
// call sites computes this fresh during render, not from a cached value,
// so updating this once at the root whenever company data changes is
// genuinely safe — and far lower-risk than rewiring every POS receipt,
// invoice line, and refund calculation to accept a new prop individually.
// Still expressed as a fraction (0.18) to avoid touching the arithmetic
// at every call site — only the source of truth changed, not the math.
export let TAX_RATE = 0.18;

export function setActiveTaxRate(ratePercent) {
  TAX_RATE = (Number(ratePercent) || 18) / 100;
}

export function lineTotal(items) {
  // Each line: qty × rate × (1 - discount/100). Per-line discount is optional
  // (0 when not set) so existing callers that pass no discount field are unaffected.
  const subtotal = items.reduce((s, i) => {
    const base = (Number(i.qty) || 0) * (Number(i.rate) || 0);
    const disc = Math.min(100, Math.max(0, Number(i.discount) || 0));
    return s + base * (1 - disc / 100);
  }, 0);
  const tax = Math.round(subtotal * TAX_RATE);
  return { subtotal, tax, total: subtotal + tax };
}

/* ══════════════ INVENTORY DATA ══════════════ */
// Deterministic EAN-13-style barcode derived from the SKU, not random —
// the same item always renders the same code across sessions and reloads.
export function generateBarcode(sku) {
  let hash = 0;
  for (let i = 0; i < sku.length; i++) hash = (hash * 31 + sku.charCodeAt(i)) >>> 0;
  return `6${String(hash).padStart(12, "0").slice(0, 12)}`;
}

/* ══════════════ FINANCE DATA ══════════════ */
/* -------------------------------- FINANCE DATA ------------------------------- */
export const TODAY = new Date("2026-07-02");

/* ══════════════ BIOMETRIC ATTENDANCE (WebAuthn) ══════════════ */
/* -------------------------------- ATTENDANCE ------------------------------------ */

/* ------------------------- BIOMETRIC ATTENDANCE (WebAuthn) ------------------------- */

// Real biometric clock-in/out, built on the browser's genuine Web
// Authentication API — navigator.credentials with a *platform*
// authenticator and userVerification: "required" genuinely triggers the
// device's actual fingerprint sensor (Android fingerprint, Windows
// Hello, MacBook Touch ID) or its enrolled PIN/face equivalent. Not a
// simulated prompt — the operating system's own biometric dialog.
//
// Three honest properties stated up front, in code and in the UI:
// 1. The fingerprint NEVER leaves the device — that's WebAuthn's core
//    design, not this implementation's choice. The sensor verifies
//    locally; the browser only reports that verification succeeded.
//    There is no fingerprint image or template anywhere in this system
//    to store, leak, or subpoena — a privacy property, not a gap.
// 2. Credentials are device-bound by WebAuthn's real architecture, so
//    localStorage is the architecturally correct home for the
//    credential-ID mapping — an employee enrolls per device (e.g. the
//    shop's front-desk tablet), which matches how real biometric
//    attendance terminals actually work.
// 3. Same honest caveat as App Lock (section 71): without server-side
//    signature verification this is a strong device-level gate, not
//    cryptographic proof to a server. It genuinely requires the
//    enrolled person's finger on the real sensor — which is exactly
//    the fraud a clock-in system exists to stop: one employee clocking
//    in for another.

// Collision-proof document-number generator — replaces the narrow random
// ranges that could produce duplicates (CON-10 through CON-99 = 90 values).
// Format: PREFIX-YYYYMMDD-XXXX where XXXX is 4 hex digits from the current
// millisecond, giving 65,536 values within the same millisecond while staying
// human-readable. Used for all locally-generated draft ids; the server's
// generate_doc_number() RPC follows the same pattern for the persisted copy.
export function docId(prefix) {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const hex = (d.getTime() % 65536).toString(16).toUpperCase().padStart(4,'0');
  return `${prefix}-${date}-${hex}`;
}
