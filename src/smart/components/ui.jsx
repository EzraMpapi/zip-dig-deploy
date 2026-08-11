import React, { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import {
  CheckCircle2,
  Fingerprint,
  LoaderCircle,
  Lock,
  Package,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { BrandMark } from "../components/BrandMark.jsx";
import { COMPANY_CATEGORIES } from "../data/core.jsx";
import { confirmAction } from "../lib/buses.jsx";
import { b64ToBuf, hashPin } from "../lib/crypto.jsx";

// ─── Safe localStorage helpers ────────────────────────────────────────────
function safeLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStorageItem(key) {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key, value) {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // ignore
  }
}

// ─── FormField ──────────────────────────────────────────────────────────
export const FormField = memo(function FormField({ label, required, children }) {
  return (
    <div>
      <label className="text-[12px] font-medium text-slate-600 mb-1.5 block">
        {label}
        {required && <span className="text-[#EF4444]"> *</span>}
      </label>
      {children}
    </div>
  );
});

// ─── CategoryPicker ──────────────────────────────────────────────────
export const CategoryPicker = memo(function CategoryPicker({ value, onChange }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return COMPANY_CATEGORIES.filter((c) =>
      c.toLowerCase().includes(query.toLowerCase()),
    );
  }, [query]);

  const handleQueryChange = useCallback((e) => setQuery(e.target.value), []);
  const handleSelect = useCallback((cat) => onChange(cat), [onChange]);

  return (
    <div>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={handleQueryChange}
          placeholder="Search category"
          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
        />
      </div>
      <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
        {filtered.map((cat) => {
          const active = value === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleSelect(cat)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
              style={active ? { backgroundColor: "#DCFCE7" } : undefined}
            >
              <span
                className={`text-[13px] ${active ? "font-medium text-[#111827]" : "text-slate-600"}`}
              >
                {cat}
              </span>
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${active ? "border-[#16A34A]" : "border-slate-300"}`}
              >
                {active && <span className="w-2 h-2 rounded-full bg-[#16A34A]" />}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-[12px] text-slate-400 text-center py-4">No matching category.</p>
        )}
      </div>
    </div>
  );
});

export const inputClass =
  "w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] text-[#111827] placeholder-slate-400 outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 focus:shadow-sm transition-all";

// ─── IMPORT_FIELD_MAP ──────────────────────────────────────────────────
export const IMPORT_FIELD_MAP = {
  customers: {
    tableLabel: "Customers",
    icon: Users,
    fields: [
      {
        key: "contact_name",
        label: "Contact Name",
        aliases: ["name", "contact", "contactname", "customer", "customername", "fullname"],
      },
      {
        key: "company_name",
        label: "Company",
        aliases: ["company", "companyname", "business", "businessname"],
      },
      { key: "email", label: "Email", aliases: ["email", "emailaddress"] },
      {
        key: "phone",
        label: "Phone",
        aliases: ["phone", "phonenumber", "mobile", "tel", "telephone"],
      },
    ],
  },
  products: {
    tableLabel: "Products",
    icon: Package,
    fields: [
      {
        key: "name",
        label: "Product Name",
        aliases: ["name", "product", "productname", "item", "itemname", "description"],
      },
      { key: "sku", label: "SKU", aliases: ["sku", "code", "itemcode", "productcode"] },
      { key: "category", label: "Category", aliases: ["category", "type", "group"] },
      {
        key: "qty_on_hand",
        label: "Quantity",
        aliases: ["quantity", "qty", "stock", "qtyonhand", "onhand"],
      },
      { key: "unit_cost", label: "Unit Cost", aliases: ["cost", "unitcost", "price", "unitprice"] },
    ],
  },
};

export function normalizeHeader(h) {
  return String(h || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ─── DataImportPanel ──────────────────────────────────────────────────
export const DataImportPanel = memo(function DataImportPanel({ type, onClose, onImport }) {
  const config = IMPORT_FIELD_MAP[type];
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(0);

  const handleFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (raw.length === 0) {
            setError("This file has no rows to import.");
            return;
          }

          const sourceHeaders = Object.keys(raw[0]);
          const headerMap = {};
          config.fields.forEach((f) => {
            const match = sourceHeaders.find(
              (h) =>
                f.aliases.includes(normalizeHeader(h)) ||
                normalizeHeader(h) === normalizeHeader(f.label),
            );
            if (match) headerMap[f.key] = match;
          });

          const mapped = raw
            .map((r) => {
              const out = {};
              config.fields.forEach((f) => {
                out[f.key] = headerMap[f.key] ? r[headerMap[f.key]] : "";
              });
              return out;
            })
            .filter((r) => Object.values(r).some((v) => String(v).trim() !== ""));

          setRows({
            data: mapped,
            matchedFields: Object.keys(headerMap).length,
            totalFields: config.fields.length,
          });
        } catch (_e) {
          setError("Couldn't read this file — make sure it's a real .xlsx, .xls, or .csv export.");
        }
      };
      reader.onerror = () => setError("Couldn't read this file.");
      reader.readAsArrayBuffer(file);
    },
    [config],
  );

  const confirmImport = useCallback(async () => {
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
  }, [rows, onImport]);

  const resetSelection = useCallback(() => setRows(null), []);

  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative w-full sm:w-[480px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col"
        style={{ animation: "slideIn .15s ease-out" }}
      >
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Data Import</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">
              Import {config.tableLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          {imported > 0 ? (
            <div className="text-center py-10">
              <div
                className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-3"
                style={{ backgroundColor: "#DCFCE7" }}
              >
                <CheckCircle2 size={22} className="text-[#16A34A]" />
              </div>
              <p className="text-[15px] font-semibold text-[#111827] mb-1">
                {imported} {config.tableLabel.toLowerCase()} imported
              </p>
              <p className="text-[12.5px] text-slate-500">
                They're already real records — check {type === "customers" ? "CRM" : "Inventory"} now.
              </p>
            </div>
          ) : !rows ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
              <UploadCloud size={22} className="text-slate-300 mx-auto mb-2" />
              <p className="text-[12.5px] text-slate-500 mb-3">
                Upload a real .xlsx, .xls, or .csv file exported from Excel, Google Sheets, or
                another system — including SokoBook&apos;s own export, if that&apos;s where
                you&apos;re coming from.
              </p>
              <label className="text-[12.5px] font-medium text-white btn-primary rounded-lg px-4 py-2 cursor-pointer inline-block">
                Choose File
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFile}
                />
              </label>
              {error && <p className="text-[11.5px] text-[#EF4444] mt-3">{error}</p>}
            </div>
          ) : (
            <>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[12.5px] font-medium text-[#111827]">{fileName}</p>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  {rows.data.length} rows found · {rows.matchedFields} of {rows.totalFields} fields
                  auto-matched from your file's headers
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-2">
                  Preview (first 5 rows)
                </p>
                <div className="border border-slate-100 rounded-lg overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="bg-slate-50">
                        {config.fields.map((f) => (
                          <th
                            key={f.key}
                            className="px-2.5 py-2 text-left font-medium text-slate-500 whitespace-nowrap"
                          >
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.data.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          {config.fields.map((f) => (
                            <td
                              key={f.key}
                              className="px-2.5 py-2 text-slate-600 whitespace-nowrap max-w-[120px] truncate"
                            >
                              {String(r[f.key] || "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {error && <p className="text-[11.5px] text-[#EF4444]">{error}</p>}
              <button
                onClick={resetSelection}
                className="text-[11.5px] text-slate-400 hover:text-slate-600"
              >
                Choose a different file
              </button>
            </>
          )}
        </div>

        {rows && imported === 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={busy}
              className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {busy ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                `Import ${rows.data.length} Rows`
              )}
            </button>
          </div>
        )}
        {imported > 0 && (
          <div className="px-6 py-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="w-full text-[12px] font-medium btn-primary text-white rounded-lg py-2.5"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

// ─── ConfirmDeleteButton ──────────────────────────────────────────────
export const ConfirmDeleteButton = memo(function ConfirmDeleteButton({
  onConfirm,
  label = "Delete",
  message,
  title,
}) {
  const [armed, setArmed] = useState(false);

  const handleConfirm = useCallback(() => {
    if (message) {
      confirmAction(message, onConfirm, {
        variant: "danger",
        title: title || "Confirm deletion",
        confirmLabel: label,
      });
    } else {
      setArmed(true);
    }
  }, [message, onConfirm, title, label]);

  const handleCancel = useCallback(() => setArmed(false), []);
  const handleDelete = useCallback(() => {
    onConfirm();
    setArmed(false);
  }, [onConfirm]);

  if (message) {
    return (
      <button
        type="button"
        onClick={handleConfirm}
        className="w-full text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2.5 hover:bg-[#EF4444]/5 transition-colors flex items-center justify-center gap-1.5"
      >
        <Trash2 size={12} /> {label}
      </button>
    );
  }

  if (armed) {
    return (
      <div className="flex gap-2 flex-1">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
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
      onClick={handleConfirm}
      className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2.5 px-3.5 hover:bg-[#FEE2E2] transition-colors"
    >
      <Trash2 size={13} /> {label}
    </button>
  );
});

// ─── SkeletonRows ────────────────────────────────────────────────────
export const SkeletonRows = memo(function SkeletonRows({ cols, rows = 5 }) {
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
});

// ─── EmptyState ──────────────────────────────────────────────────────
export const EmptyState = memo(function EmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3.5"
        style={{ backgroundColor: "#DCFCE7" }}
      >
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
});

export function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// ─── GlobalStyles ────────────────────────────────────────────────────
// We'll render this once – it's safe to keep as a plain component
// because it only outputs static style tags.
export function GlobalStyles() {
  return (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

        :root {
          --color-primary: #16A34A;
          --color-primary-light: #22C55E;
          --color-primary-dark: #15803D;
          --color-primary-pale: #DCFCE7;
          --color-secondary: #111827;
          --color-danger-pale: #FEE2E2;
          --color-surface-alt: #F8FAFC;
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

        .skeleton-shimmer {
          background: linear-gradient(90deg, #F1F3F5 25%, #E9ECEF 50%, #F1F3F5 75%);
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

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

        :focus-visible { outline: 2px solid #16A34A; outline-offset: 2px; }
        .dark-shell :focus-visible { outline-color: #4ADE80; }

        @media (hover: hover) {
          .rounded-xl.shadow-sm { transition: box-shadow .2s ease, transform .2s ease; }
          .rounded-xl.shadow-sm:hover { box-shadow: 0 6px 20px rgba(15, 42, 74, 0.09); transform: translateY(-1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rounded-xl.shadow-sm:hover { transform: none; }
        }

        .text-size-large { font-size: 112.5%; }
        .text-size-xl { font-size: 125%; }
        .high-contrast { color: #000; }
        .high-contrast .text-slate-400, .high-contrast .text-slate-500 { color: #334155 !important; }
        .high-contrast .border-slate-200\/80, .high-contrast .border-slate-200\/70 { border-color: #64748B !important; }
        .high-contrast .text-\[\#111827\] { color: #000 !important; }
      `}</style>
  );
}

// ─── AppLock ──────────────────────────────────────────────────────────
export const AppLock = memo(function AppLock({ children }) {
  const [locked, setLocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const bioCred = useMemo(() => {
    if (typeof window === "undefined") return null;
    return getStorageItem("bs_bio_applock");
  }, []);

  useEffect(() => {
    const storedHash = getStorageItem("bs_app_lock_hash");
    if (storedHash) {
      setHasPin(true);
      setLocked(true);
    }
  }, []);

  useEffect(() => {
    if (!hasPin) return;
    const handleVisibility = () => {
      if (document.hidden) setLocked(true);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [hasPin]);

  const unlock = useCallback(
    async (e) => {
      e.preventDefault();
      const storedHash = getStorageItem("bs_app_lock_hash");
      const enteredHash = await hashPin(pin);
      if (enteredHash === storedHash) {
        setLocked(false);
        setPin("");
        setError(false);
      } else {
        setError(true);
        setPin("");
      }
    },
    [pin],
  );

  const unlockBiometric = useCallback(async () => {
    if (!bioCred) return;
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: "public-key", id: b64ToBuf(bioCred) }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (assertion) {
        setLocked(false);
        setPin("");
        setError(false);
      }
    } catch (_e) {
      setError(true);
    }
  }, [bioCred]);

  const handlePinChange = useCallback((e) => {
    const val = e.target.value.replace(/\D/g, "");
    setPin(val);
    setError(false);
  }, []);

  if (!locked) return children;

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#F8FAFC] flex items-center justify-center p-4"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-xs text-center">
        <div className="mb-5 flex justify-center">
          <BrandMark size={56} textSize={22} />
        </div>
        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-slate-200/80 mx-auto flex items-center justify-center mb-4">
          <Lock size={22} className="text-[#16A34A]" />
        </div>
        <h2 className="text-[16px] font-semibold text-[#111827] mb-1">Enter your PIN</h2>
        <p className="text-[12.5px] text-slate-500 mb-5">This device is locked for privacy.</p>
        <form onSubmit={unlock}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={handlePinChange}
            autoFocus
            className="w-full text-center text-[22px] tracking-[0.5em] bg-white border border-slate-200 rounded-xl py-3 outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
            placeholder="••••"
          />
          {error && <p className="text-[12px] text-[#EF4444] mt-2">Incorrect PIN — try again.</p>}
          <button
            type="submit"
            disabled={pin.length < 4}
            className="w-full btn-primary text-white text-[14px] font-semibold rounded-xl py-3 mt-4 disabled:opacity-40"
          >
            Unlock
          </button>
        </form>
        {bioCred && (
          <button
            onClick={unlockBiometric}
            className="w-full mt-3 flex items-center justify-center gap-2 text-[13px] font-medium text-[#16A34A] border border-[#16A34A]/40 rounded-xl py-3 hover:bg-[#16A34A]/5 transition-colors"
          >
            <Fingerprint size={15} /> Unlock with fingerprint / Face ID
          </button>
        )}
      </div>
    </div>
  );
});
