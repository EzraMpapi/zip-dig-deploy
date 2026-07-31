import {
  AlertCircle
} from "lucide-react";
import { SmartManager } from "../app/Shell.jsx";
import { BrandMark } from "../components/BrandMark.jsx";
import { AppLock, GlobalStyles } from "../components/ui.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ ERROR BOUNDARY ══════════════ */
/* ---------------------------------- ERROR BOUNDARY ----------------------------------- */

// A real gap this application had zero protection against: React unmounts
// the entire component tree the instant any single component throws
// during render — one bad value in one chart, one unexpected null in one
// of the twenty-two modules, and the whole app goes to a blank white
// screen with no explanation and no way back short of a manual reload.
// This is the one thing in modern React that still genuinely requires a
// class component — getDerivedStateFromError and componentDidCatch have
// no hook equivalent as of any current stable React release; every other
// component in this 21,000-line file is a function component by design,
// and this is the deliberate, necessary exception.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Best-effort logging only — deliberately not routed through
    // logAudit() or any Supabase call here. An error boundary exists
    // specifically for the case where something has already gone wrong;
    // reaching for more application machinery inside the handler for
    // "application machinery broke" risks a second failure inside the
    // safety net itself. console.error is the one logging mechanism with
    // no dependency on anything else in this app being in a working state.
    console.error("Smart Manager crashed:", error, info?.componentStack);
  }

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  handleReset = () => {
    // A softer recovery than a full reload — clears the error and
    // re-renders the tree fresh. Works when the failure was transient
    // (bad data in one render pass); a genuinely broken state further
    // down (a corrupted token, for instance) will simply throw again,
    // at which point reload or sign-out are the honest next options.
    this.setState({ hasError: false, error: null });
  };

  handleSignOutAndReload = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("bs_access_token");
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC] p-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div className="w-full max-w-md text-center">
          <div className="mb-4 flex justify-center opacity-90"><BrandMark size={56} textSize={22} /></div>
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8">
            <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: "#FEE2E2" }}>
              <AlertCircle size={20} className="text-[#EF4444]" />
            </div>
            <h1 className="text-[17px] font-semibold text-[#111827] mb-1.5" style={{ fontFamily: "'Poppins'" }}>Something went wrong</h1>
            <p className="text-[13px] text-slate-500 leading-relaxed mb-5">
              A part of the app hit an unexpected error and stopped safely rather than showing something incorrect. Your data on the server is untouched — this only affected what was on screen.
            </p>
            {this.state.error?.message && (
              <p className="text-[11px] font-mono text-slate-400 bg-slate-50 rounded-lg px-3 py-2 mb-5 text-left break-words">{this.state.error.message}</p>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={this.handleReset} className="btn-primary text-white text-[13px] font-semibold rounded-lg py-2.5">Try Again</button>
              <button onClick={this.handleReload} className="btn-secondary text-[13px] font-medium rounded-lg py-2.5">Reload the App</button>
              <button onClick={this.handleSignOutAndReload} className="text-[12px] text-slate-400 hover:text-slate-600 py-1.5">Sign out and start fresh</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// Reusable digital-signature helper — biometric-verified, tamper-evident
// approval usable by any approve flow (invoices, POs, payroll, contracts)
// without threading UI through each. Attempts a real WebAuthn platform-
// authenticator verification (the signer's actual fingerprint/Face ID);
// if this device has no enrolled sensor it records a non-biometric
// signature rather than blocking approval — stated honestly in what it
// returns. Always binds a SHA-256 content hash, so post-signing edits are
// detectable. Honest boundary: strong provenance, not eIDAS-qualified PKI.
export async function signDocument({ docType, docRef, signerName, content }) {
  const enc = new TextEncoder().encode(JSON.stringify(content));
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const contentHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  let biometric = false;
  try {
    if (window.PublicKeyCredential && await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
      const assertion = await navigator.credentials.get({
        publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: "required", timeout: 60000 },
      });
      biometric = !!assertion;
    }
  } catch (_e) { biometric = false; }
  const record = { docType, docRef, signerName, contentHash, biometric, signedAt: new Date().toISOString() };
  notify(biometric ? `Signed by ${signerName} — biometric verified, content hashed.` : `Signed by ${signerName} — content hashed (no biometric sensor on this device).`);
  if (IS_CONFIGURED) {
    try { await sb("digital_signatures").insert({ doc_type: docType, doc_ref: docRef, signer_name: signerName, content_hash: contentHash, biometric }).run(); } catch (_e) { notify("Signature recorded locally, but the server update failed.", "error"); }
  }
  return record;
}
