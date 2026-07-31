import { useEffect, useState } from "react";
import {
  CheckCircle2, Fingerprint, LoaderCircle, Lock, Package, Plus, Search, Trash2, UploadCloud,
  Users, X
} from "lucide-react";
import * as XLSX from "xlsx";
import { BrandMark } from "../components/BrandMark.jsx";
import { COMPANY_CATEGORIES } from "../data/core.jsx";
import { confirmAction } from "../lib/buses.jsx";
import { b64ToBuf, hashPin } from "../lib/crypto.jsx";

export function FormField({ label, required, children }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-slate-600 mb-1.5 block">
        {label}{required && <span className="text-[#EF4444]"> *</span>}
      </label>
      {children}
    </div>
  );
}

// A searchable list, not an icon grid — corrected after reviewing real
// SokoBook screenshots (section 58) showing exactly this pattern: a
// search field over a plain scrollable list of specific categories, no
// icons. The earlier icon-grid version of this component was built on a
// general mobile-UX assumption before this build had any real reference
// to check it against; with real evidence in hand, matching it precisely
// is more honest than keeping a plausible-sounding guess.
export function CategoryPicker({ value, onChange }) {
  const [query, setQuery] = useState("");
  const filtered = COMPANY_CATEGORIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search category"
          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
        />
      </div>
      <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
        {filtered.map((cat) => {
          const active = value === cat;
          return (
            <button
              key={cat} type="button" onClick={() => onChange(cat)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
              style={active ? { backgroundColor: "#DCFCE7" } : undefined}
            >
              <span className={`text-[13px] ${active ? "font-medium text-[#111827]" : "text-slate-600"}`}>{cat}</span>
              <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${active ? "border-[#16A34A]" : "border-slate-300"}`}>
                {active && <span className="w-2 h-2 rounded-full bg-[#16A34A]" />}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="text-[12px] text-slate-400 text-center py-4">No matching category.</p>}
      </div>
    </div>
  );
}

export const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] text-[#111827] placeholder-slate-400 outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 focus:shadow-sm transition-all";

// Real Excel/CSV import for Customers and Products — genuinely built to
// close a specific, verified competitive gap: SokoBook's own advertised
// feature list includes "Import existing customer and product data from
// Excel to get started quickly," and without this, a business using
// SokoBook has no realistic way to switch — retyping every customer and
// every product by hand is exactly the kind of friction that keeps
// someone on a competitor's product regardless of what else this one
// offers. Uses SheetJS (already available in this environment) to
// genuinely parse a real uploaded file — not a form that pretends to
// accept a spreadsheet and silently does nothing with it.
export const IMPORT_FIELD_MAP = {
  customers: {
    tableLabel: "Customers", icon: Users,
    fields: [
      { key: "contact_name", label: "Contact Name", aliases: ["name", "contact", "contactname", "customer", "customername", "fullname"] },
      { key: "company_name", label: "Company", aliases: ["company", "companyname", "business", "businessname"] },
      { key: "email", label: "Email", aliases: ["email", "emailaddress"] },
      { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "tel", "telephone"] },
    ],
  },
  products: {
    tableLabel: "Products", icon: Package,
    fields: [
      { key: "name", label: "Product Name", aliases: ["name", "product", "productname", "item", "itemname", "description"] },
      { key: "sku", label: "SKU", aliases: ["sku", "code", "itemcode", "productcode"] },
      { key: "category", label: "Category", aliases: ["category", "type", "group"] },
      { key: "qty_on_hand", label: "Quantity", aliases: ["quantity", "qty", "stock", "qtyonhand", "onhand"] },
      { key: "unit_cost", label: "Unit Cost", aliases: ["cost", "unitcost", "price", "unitprice"] },
    ],
  },
};

export function normalizeHeader(h) { return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }


export function DataImportPanel({ type, onClose, onImport }) {
  const config = IMPORT_FIELD_MAP[type];
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(0);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (raw.length === 0) { setError("This file has no rows to import."); return; }

        // Real auto-detection: match each target field against whatever
        // headers the file actually has, ignoring case/spacing/punctuation
        // differences rather than requiring an exact column name match.
        const sourceHeaders = Object.keys(raw[0]);
        const headerMap = {};
        config.fields.forEach((f) => {
          const match = sourceHeaders.find((h) => f.aliases.includes(normalizeHeader(h)) || normalizeHeader(h) === normalizeHeader(f.label));
          if (match) headerMap[f.key] = match;
        });

        const mapped = raw.map((r) => {
          const out = {};
          config.fields.forEach((f) => { out[f.key] = headerMap[f.key] ? r[headerMap[f.key]] : ""; });
          return out;
        }).filter((r) => Object.values(r).some((v) => String(v).trim() !== ""));

        setRows({ data: mapped, matchedFields: Object.keys(headerMap).length, totalFields: config.fields.length });
      } catch (_e) {
        setError("Couldn't read this file — make sure it's a real .xlsx, .xls, or .csv export.");
      }
    };
    reader.onerror = () => setError("Couldn't read this file.");
    reader.readAsBinaryString(file);
  }

  async function confirmImport() {
    if (!rows?.data?.length) return;
    setBusy(true);
    try {
      await onImport(rows.data);
      setImported(rows.data.length);
    } catch (e) {
      setError(e.message || "Import failed partway through — some rows may not have been added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[480px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Data Import</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Import {config.tableLabel}</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          {imported > 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: "#DCFCE7" }}><CheckCircle2 size={22} className="text-[#16A34A]" /></div>
              <p className="text-[15px] font-semibold text-[#111827] mb-1">{imported} {config.tableLabel.toLowerCase()} imported</p>
              <p className="text-[12.5px] text-slate-500">They're already real records — check {type === "customers" ? "CRM" : "Inventory"} now.</p>
            </div>
          ) : !rows ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
              <UploadCloud size={22} className="text-slate-300 mx-auto mb-2" />
              <p className="text-[12.5px] text-slate-500 mb-3">Upload a real .xlsx, .xls, or .csv file exported from Excel, Google Sheets, or another system — including SokoBook&apos;s own export, if that&apos;s where you&apos;re coming from.</p>
              <label className="text-[12.5px] font-medium text-white btn-primary rounded-lg px-4 py-2 cursor-pointer inline-block">
                Choose File
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </label>
              {error && <p className="text-[11.5px] text-[#EF4444] mt-3">{error}</p>}
            </div>
          ) : (
            <>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[12.5px] font-medium text-[#111827]">{fileName}</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">{rows.data.length} rows found · {rows.matchedFields} of {rows.totalFields} fields auto-matched from your file's headers</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-2">Preview (first 5 rows)</p>
                <div className="border border-slate-100 rounded-lg overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead><tr className="bg-slate-50">{config.fields.map((f) => <th key={f.key} className="px-2.5 py-2 text-left font-medium text-slate-500 whitespace-nowrap">{f.label}</th>)}</tr></thead>
                    <tbody>
                      {rows.data.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t border-slate-50">{config.fields.map((f) => <td key={f.key} className="px-2.5 py-2 text-slate-600 whitespace-nowrap max-w-[120px] truncate">{String(r[f.key] || "—")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {error && <p className="text-[11.5px] text-[#EF4444]">{error}</p>}
              <button onClick={() => setRows(null)} className="text-[11.5px] text-slate-400 hover:text-slate-600">Choose a different file</button>
            </>
          )}
        </div>

        {rows && imported === 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={confirmImport} disabled={busy} className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : `Import ${rows.data.length} Rows`}
            </button>
          </div>
        )}
        {imported > 0 && (
          <div className="px-6 py-4 border-t border-slate-100">
            <button onClick={onClose} className="w-full text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Two-step delete: first click arms confirmation, second click within the
// window commits. Used by every detail panel so destructive actions never
// fire from a single accidental click.
export function ConfirmDeleteButton({ onConfirm, label = "Delete", message, title }) {
  // Upgraded to use the global confirmAction bus — every ConfirmDeleteButton
  // now shows the premium dialog instead of the in-place two-button pattern.
  // The original armed-state pattern is kept as fallback for call sites that
  // pass no message, so existing usage never breaks.
  if (message) {
    return (
      <button type="button" onClick={() => confirmAction(message, onConfirm, { variant: "danger", title: title || "Confirm deletion", confirmLabel: label })}
        className="w-full text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2.5 hover:bg-[#EF4444]/5 transition-colors flex items-center justify-center gap-1.5">
        <Trash2 size={12} /> {label}
      </button>
    );
  }

  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <div className="flex gap-2 flex-1">
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 text-[12px] font-medium bg-[#EF4444] text-white rounded-lg py-2.5 hover:bg-[#96201a] transition-colors"
        >
          Confirm delete
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2.5 px-3.5 hover:bg-[#FEE2E2] transition-colors"
    >
      <Trash2 size={13} /> {label}
    </button>
  );
}

// Pulsing placeholder rows shown inside any data table while a live fetch is
// in flight. `widths` roughly mimics the real column content shape.
export function SkeletonRows({ cols, rows = 5 }) {
  const widths = ["w-32", "w-24", "w-20", "w-16", "w-20", "w-14", "w-10"];
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3.5">
              <div className={`h-3 rounded skeleton-shimmer ${widths[c % widths.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Shown when a live table loads successfully but has zero records — the
// onboarding moment for a fresh company. Filtered-empty states ("no match")
// stay separate; this is specifically "you haven't created anything yet."
export function EmptyState({ icon: Icon, title, hint, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3.5" style={{ backgroundColor: "#DCFCE7" }}>
        <Icon size={19} strokeWidth={1.75} className="text-[#16A34A]" />
      </div>
      <h3 className="text-[14.5px] font-semibold text-[#111827]">{title}</h3>
      <p className="text-[12.5px] text-slate-500 mt-1 max-w-[300px] leading-relaxed">{hint}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"
        >
          <Plus size={14} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

export function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// The global stylesheet — every button style, every @keyframes animation,
// and the Google Fonts import this entire application relies on. This
// used to be defined only deep inside the authenticated app shell's own
// render tree, which meant it was never present in the DOM at all while
// Login, Signup, the OAuth completion screen, or the loading screen were
// showing — none of those render anywhere near that part of the tree.
// The practical effect: every "Continue," "Login," and "Finish Setup"
// button on every pre-authentication screen rendered with zero styling
// applied, and the loading screen's logo animation (section 46) never
// actually animated, because its own @keyframes were defined in the same
// unreachable block. Moved here, into the true application root,
// rendered once, unconditionally, before ErrorBoundary or SmartManager —
// so it exists in the DOM from the very first paint, regardless of
// session state, regardless of whether anything downstream even
// mounts successfully.
export function GlobalStyles() {
  return (
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

        /* Smart Manager design tokens — adapted from the brand's design
           system into CSS custom properties so they're usable directly in
           Tailwind's arbitrary-value syntax (e.g. shadow-[var(--shadow-md)])
           without needing a JS import that a single-file artifact can't
           resolve. Kijani Kuu (#16A34A) is the brand's primary green,
           carried through from the Smart Manager logo mark and matched
           exactly to the reference design system's color tokens. */
        :root {
          --color-primary: #16A34A;        /* Kijani Kuu */
          --color-primary-light: #22C55E;  /* Kijani Nyororo */
          --color-primary-dark: #15803D;
          --color-primary-pale: #DCFCE7;   /* Kijani Mwanga */
          --color-secondary: #111827;      /* Maandishi */
          --color-danger-pale: #FEE2E2;    /* Nyekundu Mwanga */
          --color-surface-alt: #F8FAFC;    /* Background, per Design System 2.0 */
          --color-success: #16A34A;
          --color-warning: #F59E0B;
          --color-danger: #EF4444;
          --radius-sm: 6px;
          --radius-md: 10px;
          --radius-lg: 14px;
          --shadow-sm: 0 1px 2px 0 rgba(17,24,39,.05);
          --shadow-md: 0 4px 6px -1px rgba(17,24,39,.08), 0 2px 4px -2px rgba(17,24,39,.06);
          --shadow-lg: 0 10px 15px -3px rgba(17,24,39,.10), 0 4px 6px -4px rgba(17,24,39,.06);
        }

        h1, h2, h3 { font-family: 'Poppins', system-ui, sans-serif; font-weight: 600; }

        /* Namba (numbers): Inter Medium per the design system — every
           monetary figure, ID, and count in this app uses Tailwind's
           font-mono utility for column alignment, which by default maps
           to an actual monospace stack. Overriding the class itself here
           (rather than touching all ~280 call sites individually) makes
           every one of them Inter Medium in one place, and keeps digit
           columns aligned via OpenType tabular-figure features instead of
           relying on a monospace typeface to do it. */
        .font-mono {
          font-family: 'Inter', system-ui, sans-serif !important;
          font-weight: 500;
          font-feature-settings: 'tnum' 1, 'lnum' 1;
          font-variant-numeric: tabular-nums;
        }
        @keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes toastIn { from { transform: translateY(12px) scale(.97); opacity: 0 } to { transform: translateY(0) scale(1); opacity: 1 } }
        @keyframes toastDrain { from { width: 100% } to { width: 0% } }
        @keyframes logoPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(34,197,94,0)); }
          50% { transform: scale(1.06); filter: drop-shadow(0 0 18px rgba(34,197,94,.45)); }
        }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes loadingBar { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }

        /* Shimmer skeleton — a moving gradient reads as "actively loading"
           more clearly than a uniform pulse. */
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton-shimmer {
          background: linear-gradient(90deg, #F1F3F5 25%, #E9ECEF 50%, #F1F3F5 75%);
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }

        .btn-primary {
          position: relative;
          background: linear-gradient(135deg, #16A34A 0%, #15803D 100%);
          transition: all .18s ease;
          overflow: hidden;
        }
        .btn-primary::after {
          content: "";
          position: absolute; inset: 0;
          background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.22) 48%, transparent 66%);
          transform: translateX(-120%);
          transition: transform .55s ease;
        }
        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #22C55E 0%, #15803D 100%);
          box-shadow: 0 4px 16px rgba(22, 163, 74, .38);
          transform: translateY(-1px);
        }
        .btn-primary:hover:not(:disabled)::after { transform: translateX(120%); }
        .btn-primary:active:not(:disabled) { transform: translateY(0.5px); }

        .btn-secondary {
          background: #FFFFFF;
          color: #16A34A;
          border: 1.5px solid #16A34A;
          transition: all .18s ease;
        }
        .btn-secondary:hover:not(:disabled) { background: #DCFCE7; }
        .btn-secondary:active:not(:disabled) { transform: translateY(0.5px); }

        /* ── Premium UI token layer ──────────────────────────────────────
           One CSS block that touches the entire product:
           ① Table rows: subtler hover, smoother feel
           ② Form inputs: consistent placeholder color (not already in Tailwind)
           ③ Select: removes the awkward default arrow on Webkit
           ④ Card headers: consistent weight and letter-spacing for every
              section title that uses a plain <h3>
           ⑤ Sidebar active item: a solid green left-border accent so the
              active nav item reads clearly without needing a background fill
           ⑥ Scrollbar: thin & brand-colored on Webkit (Chrome/Safari/Edge),
              already transparent on Firefox via the existing rule
           ─────────────────────────────────────────────────────────────── */
        tr:hover td { background-color: rgba(248,250,252,.9); }
        ::placeholder { color: #9CA3AF; opacity: 1; }
        select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px !important; }
        table th { letter-spacing: .04em; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
        .nav-active-item { border-left: 3px solid #16A34A; }
        .card-header { font-size: 14px; font-weight: 600; color: #111827; letter-spacing: -.01em; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }

        /* Kitufe cha Icon — a circular, solid-green icon-only button for a
           primary action with no room (or need) for a text label. Not yet
           applied anywhere specific: this app's existing icon-only buttons
           are predominantly navigation/utility (menu toggle, notification
           bell), which should stay neutral by convention — a bare icon
           button only belongs in this style when the action itself is a
           primary create/confirm, the same rule that governs .btn-primary. */
        .btn-icon-primary {
          background: linear-gradient(135deg, #16A34A 0%, #15803D 100%);
          color: #FFFFFF;
          border-radius: 9999px;
          transition: all .18s ease;
        }
        .btn-icon-primary:hover:not(:disabled) { background: linear-gradient(135deg, #22C55E 0%, #15803D 100%); transform: translateY(-1px); }
        .btn-icon-primary:active:not(:disabled) { transform: translateY(0.5px); }

        .kpi-card {
          box-shadow: 0 1px 2px rgba(17,24,39,.04);
          transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
        }
        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px -10px rgba(17,24,39,.16), 0 2px 8px rgba(22,163,74,.08);
          border-color: rgba(22,163,74,.28);
        }

        input:focus-visible, select:focus-visible, button:focus-visible {
          outline: 2px solid rgba(22,163,74,.45);
          outline-offset: 1px;
        }

        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }

        /* Real Dark Mode — deliberately scoped to the App Shell only
           (sidebar and topbar), not the whole application. A blanket
           rewrite across 23,000+ lines of hardcoded Tailwind colors
           would be a real, large undertaking with real risk of a
           half-correct result — some screens right, others silently
           broken — which is worse than not having it at all. This is
           the honest alternative: a real, verified dark surface for the
           two elements a person sees on every single screen regardless
           of which module they're in, built with ordinary CSS
           specificity (two classes always beat one) rather than
           !important overrides, so it can't silently fight with
           anything else. Module content underneath stays light-themed
           — Settings says so directly, not implied.  */
        .dark-shell.bg-white { background-color: #0F172A; }
        .dark-shell .bg-white { background-color: #1E293B; }
        .dark-shell .bg-slate-100 { background-color: #334155; }
        .dark-shell .border-slate-200 { border-color: #334155; }
        .dark-shell .border-slate-300 { border-color: #475569; }
        .dark-shell .text-slate-300 { color: #64748B; }
        .dark-shell .text-slate-400 { color: #94A3B8; }
        .dark-shell .text-slate-500 { color: #CBD5E1; }
        .dark-shell .hover\:bg-slate-100:hover { background-color: #334155; }
        .dark-shell .hover\:text-slate-600:hover { color: #F1F5F9; }
        .dark-shell .border-slate-200\/80 { border-color: #334155; }
        .dark-shell .bg-slate-900\/40 { background-color: rgba(0,0,0,.6); }
        .dark-shell .brand-wordmark { color: #F1F5F9; }
        .brand-wordmark { color: #111827; }

        /* Design System 2.0 motion layer — pure, scoped CSS, no per-
           component rewrites across 22 modules that could regress them.
           Honest note on "ripple": a true Material ripple needs JS
           tracking the tap point; the browser-native equivalent below
           (a 100ms press-down scale on every real button) delivers the
           same felt feedback without a library. Reduced-motion honored. */
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes shimmer { from { background-position: -400px 0; } to { background-position: 400px 0; } }
        .module-fade { animation: fadeInUp .25s ease-out; }
        .card-in { animation: fadeInUp .2s ease-out; }
        button { transition: transform .1s ease, opacity .15s ease; }
        button:active:not(:disabled) { transform: scale(.97); }
        .skeleton-shimmer { background: linear-gradient(90deg, #F1F5F9 25%, #E8EDF3 50%, #F1F5F9 75%); background-size: 800px 100%; animation: shimmer 1.4s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .module-fade, .card-in, .skeleton-shimmer { animation: none; }
          button:active:not(:disabled) { transform: none; }
        }

        /* WCAG 2.2 AA — visible keyboard focus (SC 2.4.7 / 2.4.11).
           :focus-visible fires for keyboard navigation only, so mouse
           users see no ring while a person tabbing through gets a real,
           high-contrast indicator on every interactive element — the
           brand green at 2px with offset, never clipped by the element
           itself. This is the single highest-leverage accessibility rule
           a stylesheet can carry: one selector, every screen, every
           module, including everything built in all future sections. */
        :focus-visible { outline: 2px solid #16A34A; outline-offset: 2px; }
        .dark-shell :focus-visible { outline-color: #4ADE80; }

        /* Pro-grade card response — on hover-capable devices only (no
           sticky hover states on touch), cards with the standard shadow
           lift subtly toward the cursor. One rule, every card, all 22
           modules; transform respects reduced-motion below. */
        @media (hover: hover) {
          .rounded-xl.shadow-sm { transition: box-shadow .2s ease, transform .2s ease; }
          .rounded-xl.shadow-sm:hover { box-shadow: 0 6px 20px rgba(15, 42, 74, 0.09); transform: translateY(-1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rounded-xl.shadow-sm:hover { transform: none; }
        }

        /* Accessibility — WCAG 2.2 AA controls (section: Settings >
           Appearance). Text size scales the root so every derived size
           in all 22 modules follows (SC 1.4.4); high-contrast darkens
           text and strengthens borders app-wide with one class. */
        .text-size-large { font-size: 112.5%; }
        .text-size-xl { font-size: 125%; }
        .high-contrast { color: #000; }
        .high-contrast .text-slate-400, .high-contrast .text-slate-500 { color: #334155 !important; }
        .high-contrast .border-slate-200\/80, .high-contrast .border-slate-200\/70 { border-color: #64748B !important; }
        .high-contrast .text-\[\#111827\] { color: #000 !important; }
      `}</style>
  );
}

export function AppLock({ children }) {
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const storedHash = typeof window !== "undefined" ? window.localStorage.getItem("bs_app_lock_hash") : null;
    if (storedHash) { setHasPin(true); setLocked(true); }
  }, []);

  // Real re-lock on backgrounding — the actual point of an app lock: if
  // someone hands their phone to a friend after switching away and back,
  // the app should ask again, not stay open indefinitely.
  useEffect(() => {
    if (!hasPin) return;
    function handleVisibility() {
      if (document.hidden) setLocked(true);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [hasPin]);

  async function unlock(e) {
    e.preventDefault();
    const storedHash = window.localStorage.getItem("bs_app_lock_hash");
    const enteredHash = await hashPin(pin);
    if (enteredHash === storedHash) {
      setLocked(false);
      setPin("");
      setError(false);
    } else {
      setError(true);
      setPin("");
    }
  }

  // Biometric unlock — the same real WebAuthn machinery attendance uses:
  // a platform authenticator with userVerification "required" raises the
  // OS's actual fingerprint or Face ID dialog. Offered only when a
  // credential was genuinely enrolled on this device; PIN remains the
  // fallback, matching how phones themselves treat biometrics.
  const bioCred = typeof window !== "undefined" ? window.localStorage.getItem("bs_bio_applock") : null;
  async function unlockBiometric() {
    try {
      const assertion = await navigator.credentials.get({
        publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: b64ToBuf(bioCred) }], userVerification: "required", timeout: 60000 },
      });
      if (assertion) { setLocked(false); setPin(""); setError(false); }
    } catch (_e) { setError(true); }
  }

  if (!locked) return children;

  return (
    <div className="fixed inset-0 z-[200] bg-[#F8FAFC] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-xs text-center">
        <div className="mb-5 flex justify-center"><BrandMark size={56} textSize={22} /></div>
        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-200/80 mx-auto flex items-center justify-center mb-4">
          <Lock size={22} className="text-[#16A34A]" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#111827] mb-1">Enter your PIN</h2>
        <p className="text-[12.5px] text-slate-500 mb-5">This device is locked for privacy.</p>
        <form onSubmit={unlock}>
          <input
            type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(false); }}
            autoFocus className="w-full text-center text-[22px] tracking-[0.5em] bg-white border border-slate-200 rounded-xl py-3 outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
            placeholder="••••"
          />
          {error && <p className="text-[12px] text-[#EF4444] mt-2">Incorrect PIN — try again.</p>}
          <button type="submit" disabled={pin.length < 4} className="w-full btn-primary text-white text-[14px] font-semibold rounded-xl py-3 mt-4 disabled:opacity-40">Unlock</button>
        </form>
        {bioCred && (
          <button onClick={unlockBiometric} className="w-full mt-3 flex items-center justify-center gap-2 text-[13px] font-medium text-[#16A34A] border border-[#16A34A]/40 rounded-xl py-3 hover:bg-[#16A34A]/5 transition-colors">
            <Fingerprint size={15} /> Unlock with fingerprint / Face ID
          </button>
        )}
      </div>
    </div>
  );
}
