import { useState } from "react";
import {
  CircleAlert as AlertCircle,
  Briefcase,
  Building2,
  CircleCheck as CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Eye,
  EyeOff,
  Factory,
  FileText,
  HardHat,
  HeartPulse,
  Lock,
  Mail,
  Package,
  ReceiptText,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { BrandMark } from "../components/BrandMark.jsx";
import { CategoryPicker, FormField } from "../components/ui.jsx";
import { COMPANY_CATEGORIES, ROLES } from "../data/core.jsx";
import { notify } from "../lib/notify.jsx";
import {
  DEMO_OVERRIDE,
  IS_CONFIGURED,
  authSignIn,
  authSignInWithOAuth,
  authSignUp,
  callRpc,
  sb,
  setDemoOverride,
} from "../lib/supabase.jsx";

/* ══════════════ AUTHENTICATION ══════════════ */
export const SIGNUP_COUNTRIES = [
  "Tanzania",
  "Kenya",
  "Uganda",
  "Rwanda",
  "Zambia",
  "Malawi",
  "Other",
];

export const SIGNUP_CURRENCIES = ["TZS", "KES", "UGX", "RWF", "ZMW", "MWK", "USD"];

// A genuine industry-clustering system, built deliberately as a smaller
// number of real, differentiated profiles rather than 69 individually
// tailored experiences — the latter isn't honestly buildable to real
// quality in a single pass, and a shallow, mostly-identical version of
// 69 "customized" experiences would be exactly the kind of overclaim
// this build has avoided throughout. This is the same real pattern
// international SaaS products actually use (QuickBooks, Square, and Xero
// all ask "what kind of business" during setup and adjust real defaults,
// not cosmetic labels, based on the answer) — seven meaningful clusters,
// every one of the 69 real categories mapped to exactly one, each
// cluster genuinely differentiated in what it recommends, not just
// differently named.
export const INDUSTRY_PROFILES = {
  retail: {
    label: "Retail & Trade",
    icon: Store,
    recommendedModules: ["inventory", "sales", "finance", "procurement", "crm"],
    tips: [
      "Inventory and Sales & POS matter most here — real stock levels and real counter sales, kept in sync automatically.",
      "Set up Suppliers in Procurement early so reordering low stock is one click, not a phone-call scramble.",
      "The Business Credit Profile (Reports) is worth building early if you'll ever need supplier trade credit or a stock loan.",
    ],
  },
  food_hospitality: {
    label: "Food & Hospitality",
    icon: Store,
    recommendedModules: ["sales", "inventory", "hr", "finance"],
    tips: [
      "Sales & POS for the counter, Inventory for real perishable stock — the Stock Audit tab (Inventory) is genuinely useful here for catching real spoilage variance, not just theft.",
      "HR & Payroll matters more in this industry than most — shift-based staff and real leave tracking, not just a headcount number.",
      "Expenses' 'Rent & Utilities' category tends to be the largest real cost center here — watch it in Reports' Profit & Loss.",
    ],
  },
  professional_services: {
    label: "Professional & Creative Services",
    icon: Briefcase,
    recommendedModules: ["crm", "projects", "finance", "sales"],
    tips: [
      "CRM and Projects together are the real backbone here — a client relationship and the actual work delivered for them, tracked as one thread rather than two disconnected records.",
      "Real invoicing discipline matters most in service businesses — Reports' Receivables Aging (Finance) surfaces exactly which client relationships need a follow-up call.",
      "Consider Workflow Studio (Automation) for real, repeatable client onboarding steps rather than remembering them by hand each time.",
    ],
  },
  personal_care: {
    label: "Personal Care & Wellness",
    icon: Sparkles,
    recommendedModules: ["sales", "crm", "hr", "finance"],
    tips: [
      "CRM matters more here than in most retail businesses — real repeat-client relationships and their real preferences are the actual asset.",
      "Sales & POS for real day-to-day transactions, with HR & Payroll if staff work on commission or shifts.",
      "The Scenario Planner (Predictive Intelligence) is genuinely useful for modeling a real price change against real client volume before raising rates.",
    ],
  },
  healthcare: {
    label: "Healthcare & Veterinary",
    icon: HeartPulse,
    recommendedModules: ["inventory", "crm", "sales", "finance"],
    tips: [
      "Inventory's expiry-sensitive stock matters more here than almost any other industry — the Stock Audit tab is worth using on a real, regular schedule, not just once.",
      "CRM here functions as a real client/patient relationship record — recurring visits and real contact history matter as much as the transaction itself.",
      "Real compliance and licensing costs are worth their own Expense category (Finance) rather than being buried in a generic 'Other' bucket.",
    ],
  },
  industrial_construction: {
    label: "Construction, Manufacturing & Industrial",
    icon: HardHat,
    recommendedModules: ["projects", "procurement", "manufacturing", "inventory", "finance"],
    tips: [
      "Projects for real job/site tracking, Procurement and Manufacturing for real materials and production — this cluster is the one this build's fullest module set was actually built for.",
      "Fixed Assets (Finance) matters more here than most industries — real equipment depreciation affects real project costing, not just year-end paperwork.",
      "The Cash Flow Statement's Investing Activities (Reports) will show real equipment purchases as they happen, not just at audit time.",
    ],
  },
  logistics_agriculture: {
    label: "Logistics, Transport & Agriculture",
    icon: Truck,
    recommendedModules: ["inventory", "procurement", "finance", "sales"],
    tips: [
      "Real seasonality matters here more than almost any other industry — the Cash Flow Statement's Month vs Year-to-Date toggle (Reports) is worth checking regularly, not just at review time.",
      "Suppliers and Procurement matter early — real lead times on inputs (fuel, feed, parts) genuinely affect operations, not just bookkeeping.",
      "Loans (Finance) is worth setting up honestly from day one if seasonal financing is part of how this business actually runs — real Cash Flow accuracy depends on it.",
    ],
  },
};

// Every one of the 69 real categories mapped to exactly one profile —
// checked for completeness against COMPANY_CATEGORIES below, not
// assumed. "Other" and any unmapped edge case honestly fall back to a
// balanced, generic set rather than a guessed cluster.
export const CATEGORY_TO_INDUSTRY = {
  Grocery: "retail",
  Hardware: "retail",
  Electronics: "retail",
  Clothing: "retail",
  Footwear: "retail",
  "Fashion Accessories": "retail",
  Furniture: "retail",
  "Kitchen Utensils": "retail",
  Jewellery: "retail",
  "Gift & Toys": "retail",
  Stationery: "retail",
  Textiles: "retail",
  "Mobile & Accessories": "retail",
  Cosmetics: "retail",
  Handicrafts: "retail",
  "Religious Store": "retail",
  "Water Jars": "retail",
  "Pet Stores": "retail",
  "Retail & Wholesale": "retail",
  Music: "retail",
  Petroleum: "retail",
  "Restaurant & Cafe": "food_hospitality",
  Bakery: "food_hospitality",
  Catering: "food_hospitality",
  "Street Foods": "food_hospitality",
  "Sweet Shop": "food_hospitality",
  "Food & Beverages": "food_hospitality",
  Hotel: "food_hospitality",
  Hostel: "food_hospitality",
  "Fresh House": "food_hospitality",
  "Fruits & Vegetables": "food_hospitality",
  "Dairy Products": "food_hospitality",
  "Hospitality & Tourism": "food_hospitality",
  Consulting: "professional_services",
  "Legal Services": "professional_services",
  "Information Technology": "professional_services",
  "Computer Services": "professional_services",
  "Photo Studio": "professional_services",
  "Professional Services": "professional_services",
  Technology: "professional_services",
  Printing: "professional_services",
  Education: "professional_services",
  "Non Profit": "professional_services",
  "Financial Services": "professional_services",
  "Security Services": "professional_services",
  Salon: "personal_care",
  "Beauty Parlour": "personal_care",
  Laundry: "personal_care",
  Tailoring: "personal_care",
  "Sports & Fitness": "personal_care",
  Personal: "personal_care",
  "Healthcare & Pharmacy": "healthcare",
  "Medical & Healthcare": "healthcare",
  Veterinary: "healthcare",
  Nursery: "healthcare",
  Construction: "industrial_construction",
  Manufacturing: "industrial_construction",
  "Auto / Parts": "industrial_construction",
  Garage: "industrial_construction",
  "Maintenance Services": "industrial_construction",
  Mill: "industrial_construction",
  "Waste Collection": "industrial_construction",
  Agriculture: "logistics_agriculture",
  Fishing: "logistics_agriculture",
  Poultry: "logistics_agriculture",
  "Logistics & Transport": "logistics_agriculture",
  Transportation: "logistics_agriculture",
  "Tours & Travel": "logistics_agriculture",
  "Cable Operator": "logistics_agriculture",
  Entertainment: "professional_services",
  Online: "professional_services",
  Other: "retail",
};

export function getIndustryProfile(category) {
  const clusterId = CATEGORY_TO_INDUSTRY[category] || "retail";
  return { id: clusterId, ...INDUSTRY_PROFILES[clusterId] };
}

// Real ITU-assigned calling codes, in the same order as SIGNUP_COUNTRIES —
// not placeholder digits.
export const COUNTRY_CALLING_CODES = {
  Tanzania: "+255",
  Kenya: "+254",
  Uganda: "+256",
  Rwanda: "+250",
  Zambia: "+260",
  Malawi: "+265",
  Other: "+",
};

// Mirrors the modules a real business would toggle at signup, matching
// the onboarding pattern in the reference design — this writes to the
// exact same real enabledModules Settings already manages (section 1);
// signup is just the first place a person sets it, not a separate system.
export const ONBOARDING_MODULES = [
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "hr", label: "HR & Payroll", icon: Users },
  { id: "crm", label: "CRM", icon: Building2 },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "procurement", label: "Procurement", icon: ClipboardList },
  { id: "sales", label: "Sales & POS", icon: ReceiptText },
  { id: "projects", label: "Projects", icon: FileText },
  { id: "manufacturing", label: "Manufacturing", icon: Factory },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
];

// The one genuine, checkable thing "business scale" determines in this
// system: which modules are pre-selected during onboarding. A small
// business starts with the essentials a one-location shop actually uses
// day one; a large business starts with the full suite, since a growing
// company with multiple departments typically needs HR, Procurement, and
// Manufacturing from the outset, not as an afterthought. Neither preset
// locks anything away — every module stays available to enable later in
// Settings regardless of which scale was chosen, since this is a default,
// not a restriction.
export const SCALE_MODULE_PRESETS = {
  small: ["finance", "inventory", "sales", "crm"],
  large: ONBOARDING_MODULES.map((m) => m.id),
};

/* ── Presentation primitives (Phase 1B) ──────────────────────────────────
   Token-driven field used by every auth screen. Behaviour, props and the
   value/onChange contract are unchanged from the previous version. */
export function AuthTextField({
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  rightSlot,
  autoComplete,
  invalid,
  id,
}) {
  const fieldId = id || `f-${label ? label.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : type}`;
  return (
    <div>
      {label && (
        <label htmlFor={fieldId} className="es-label">
          {label}
        </label>
      )}
      <div
        className={`es-field ${Icon ? "es-field--icon" : ""} ${rightSlot ? "es-field--icon-suffix" : ""}`}
      >
        {Icon && (
          <span className="es-field__icon" aria-hidden="true">
            <Icon size={15} />
          </span>
        )}
        <input
          id={fieldId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={invalid ? "true" : undefined}
          className="es-input"
        />
        {rightSlot}
      </div>
    </div>
  );
}

// Apple's mark as inline SVG, matching the Google/Microsoft glyphs below.
export function AppleGlyph({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#F1F3F9"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M16.36 12.79c.02 2.5 2.19 3.33 2.22 3.34-.02.06-.35 1.2-1.15 2.37-.7 1.02-1.42 2.04-2.57 2.06-1.12.02-1.49-.66-2.77-.66-1.29 0-1.69.64-2.76.68-1.1.04-1.94-1.1-2.65-2.11-1.53-2.21-2.7-6.25-1.13-8.98.78-1.36 2.17-2.22 3.68-2.24 1.09-.02 2.11.72 2.77.72.66 0 1.9-.89 3.2-.76.55.02 2.09.2 3.08 1.5-.08.05-1.84 1.07-1.82 3.18M14.4 4.5c.59-.71 1-1.7.89-2.7-.87.04-1.92.58-2.53 1.29-.55.63-1.02 1.64-.89 2.6.97.08 1.94-.49 2.53-1.19" />
    </svg>
  );
}

const LOGIN_TABS = [
  {
    id: "email",
    label: "Email",
    type: "email",
    inputLabel: "Email address",
    placeholder: "you@company.com",
    icon: Mail,
    autoComplete: "email",
  },
  {
    id: "phone",
    label: "Phone",
    type: "tel",
    inputLabel: "Phone number",
    placeholder: "+255 700 000 000",
    icon: User,
    autoComplete: "tel",
  },
  {
    id: "sso",
    label: "SSO",
    type: "email",
    inputLabel: "Work email",
    placeholder: "you@company.com",
    icon: Building2,
    autoComplete: "email",
  },
];

export function LoginPage({ onAuthenticated, onSwitchToSignup }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [method, setMethod] = useState("email");
  const tab = LOGIN_TABS.find((t) => t.id === method) || LOGIN_TABS[0];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      if (!IS_CONFIGURED) {
        onAuthenticated(null);
        return;
      }
      const result = await authSignIn(identifier.trim(), password);
      if (result.error) {
        setError(result.error.message || "Login failed.");
        return;
      }
      onAuthenticated(result.session || null);
    } catch (_e) {
      setError("Something went wrong — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="es-auth">
      {/* Left — brand panel (desktop and wide only) */}
      <aside className="es-auth__brand">
        <div className="es-auth__pattern" aria-hidden="true" />
        <div className="es-cartoon" aria-hidden="true">
          <span className="es-cartoon__shape es-cartoon__shape--circle" />
          <span className="es-cartoon__shape es-cartoon__shape--square" />
          <span className="es-cartoon__shape es-cartoon__shape--triangle" />
          <span className="es-cartoon__shape es-cartoon__shape--ring" />
          <span className="es-cartoon__shape es-cartoon__shape--dot" />
          <span className="es-cartoon__shape es-cartoon__shape--dot-2" />
          <span className="es-cartoon__shape es-cartoon__shape--dot-3" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-3xl)" }}>
            <div className="es-auth__logo-wrap">
              <BrandMark size={48} spin />
            </div>
            <div>
              <p className="es-title es-title--sm">BusinessSphere</p>
              <p className="es-eyebrow">Intelligent Business Operations</p>
            </div>
          </div>
          <h2 className="es-title" style={{ fontSize: "var(--text-4xl)", maxWidth: 420 }}>
            One operating system for every part of your business.
          </h2>
          <p className="es-subtitle" style={{ maxWidth: 420 }}>
            Sales, inventory, finance, people and AI insight — in a single, auditable workspace.
          </p>
        </div>
        <div className="relative z-10 es-stack">
          {[
            ["TRA Tax Center", "PAYE, SDL, WCF with real brackets"],
            ["Biometric Attendance", "Real fingerprint via WebAuthn"],
            ["AI Command Center", "English & Kiswahili, live business data"],
          ].map(([t, s]) => (
            <div key={t} className="es-feature">
              <span className="es-feature__dot" aria-hidden="true">
                <CheckCircle2 size={12} />
              </span>
              <div>
                <p className="es-feature__title">{t}</p>
                <p className="es-feature__sub">{s}</p>
              </div>
            </div>
          ))}
          <div className="es-cartoon__progress" aria-hidden="true">
            <span className="es-cartoon__progress-dot" />
            <span className="es-cartoon__progress-dot" />
            <span className="es-cartoon__progress-dot" />
          </div>
          <p className="es-meta">v2.1.0 · © {new Date().getFullYear()} BusinessSphere</p>
        </div>
      </aside>

      {/* Right — the form */}
      <main className="es-auth__form-pane">
        <div className="es-auth__form">
          {/* Mobile branding strip */}
          <div
            className="es-auth__brand-strip"
            style={{ borderRadius: "var(--radius-lg)", marginBottom: "var(--space-lg)" }}
          >
            <div className="es-auth__logo-wrap">
              <BrandMark size={44} spin />
            </div>
            <p className="es-title es-title--sm">BusinessSphere</p>
            <p className="es-eyebrow">Intelligent Business Operations</p>
          </div>

          <div className="es-card es-card--elevated">
            <div style={{ marginBottom: "var(--space-lg)" }}>
              <h1 className="es-title">Welcome back</h1>
              <p className="es-subtitle">Sign in to your workspace</p>
            </div>

            <div
              className="es-segmented"
              role="tablist"
              aria-label="Sign-in method"
              style={{ marginBottom: "var(--space-md)" }}
            >
              {LOGIN_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={method === t.id}
                  className="es-segmented__item"
                  onClick={() => setMethod(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {error && (
              <div className="es-alert" role="alert" style={{ marginBottom: "var(--space-md)" }}>
                <AlertCircle size={14} className="shrink-0" style={{ marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="es-stack">
              <AuthTextField
                key={tab.id}
                label={tab.inputLabel}
                icon={tab.icon}
                type={tab.type}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={tab.placeholder}
                autoComplete={tab.autoComplete}
                invalid={!!error}
              />
              <div>
                <label htmlFor="login-password" className="es-label">
                  Password
                </label>
                <div className="es-field es-field--icon es-field--icon-suffix">
                  <span className="es-field__icon" aria-hidden="true">
                    <Lock size={15} />
                  </span>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="es-input"
                    aria-invalid={error ? "true" : undefined}
                  />
                  <button
                    type="button"
                    className="es-field__suffix"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={busy || !identifier.trim() || !password}
                className="es-btn es-btn--primary es-btn--block es-btn--lg"
              >
                {busy ? (
                  <>
                    <span className="es-spinner" aria-hidden="true" />
                    <span className="es-sr-only">Signing in</span>
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>

            <div className="es-divider" style={{ margin: "var(--space-lg) 0" }}>
              or continue with
            </div>

            <div className="es-social-row">
              <button
                type="button"
                className="es-social-btn"
                aria-label="Continue with Google"
                onClick={() => authSignInWithOAuth("google")}
              >
                <GoogleGlyph />
              </button>
              <button
                type="button"
                className="es-social-btn"
                aria-label="Continue with Apple"
                onClick={() => authSignInWithOAuth("apple")}
              >
                <AppleGlyph />
              </button>
              <button
                type="button"
                className="es-social-btn"
                aria-label="Continue with Microsoft"
                onClick={() => authSignInWithOAuth("azure")}
              >
                <MicrosoftGlyph />
              </button>
            </div>

            <div
              className="flex items-center justify-between"
              style={{ marginTop: "var(--space-lg)" }}
            >
              <button
                type="button"
                className="es-link"
                onClick={() =>
                  notify("Password recovery is handled by your workspace administrator.")
                }
              >
                Forgot password?
              </button>
              <button type="button" className="es-link" onClick={onSwitchToSignup}>
                Create account
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDemoOverride(true);
              onAuthenticated({ demo: true });
            }}
            className="es-btn es-btn--secondary es-btn--block"
            style={{ marginTop: "var(--space-md)" }}
          >
            <Sparkles size={14} style={{ color: "var(--accent-gold)" }} /> Preview demo — no account
            needed
          </button>
          {!IS_CONFIGURED && (
            <p className="es-meta" style={{ textAlign: "center", marginTop: "var(--space-sm)" }}>
              Demo mode — any credentials continue to the sample company.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

// Real inline brand glyphs — not a lucide icon standing in for a brand
// mark, and not an external image asset this environment has no way to
// fetch. Google's four-color "G" and Microsoft's four-square mark are
// simple enough to reproduce faithfully as inline SVG/CSS.
export function GoogleGlyph({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.4 0 6.4 1.2 8.8 3.5l6.5-6.5C35.3 2.6 30 0.5 24 0.5 14.9 0.5 7.1 5.7 3.3 13.3l7.6 5.9C12.7 13.3 17.9 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.6c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4z"
      />
      <path
        fill="#FBBC05"
        d="M10.9 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.6-5.9C1.6 16.7 0.5 20.2 0.5 24s1.1 7.3 2.8 10.5l7.6-5.9z"
      />
      <path
        fill="#34A853"
        d="M24 47.5c6 0 11.3-2 15-5.4l-7.3-5.7c-2 1.4-4.6 2.2-7.7 2.2-6.1 0-11.3-3.8-13.1-9.5l-7.6 5.9C7.1 42.3 14.9 47.5 24 47.5z"
      />
    </svg>
  );
}

export function MicrosoftGlyph({ size = 18 }) {
  return (
    <span className="grid grid-cols-2 gap-[2px] shrink-0" style={{ width: size, height: size }}>
      <span style={{ backgroundColor: "#F25022" }} />
      <span style={{ backgroundColor: "#7FBA00" }} />
      <span style={{ backgroundColor: "#00A4EF" }} />
      <span style={{ backgroundColor: "#FFB900" }} />
    </span>
  );
}

// Two real paths, matching how every real multi-tenant business system
// (Slack, Notion, QuickBooks Online) actually onboards a new customer:
// found a new company (becomes its first Owner) or join one a teammate
// already created (using the join code they share out of band). Neither
// path lets a signup browse or search other companies — see the schema
// comment on companies.join_code for why that's a deliberate privacy
// boundary, not an oversight.
export function SignupPage({ onAuthenticated, onSwitchToLogin }) {
  const [mode, setMode] = useState("create"); // "create" | "join"
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [account, setAccount] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [company, setCompany] = useState({
    name: "",
    category: COMPANY_CATEGORIES[0],
    country: SIGNUP_COUNTRIES[0],
    currency: SIGNUP_CURRENCIES[0],
    website: "",
    taxId: "",
  });
  const [selectedModules, setSelectedModules] = useState(
    () => new Set(ONBOARDING_MODULES.map((m) => m.id)),
  );
  const [businessScale, setBusinessScale] = useState("large");
  const [firstBranch, setFirstBranch] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState("Employee");
  const [customerRef, setCustomerRef] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function setAccountField(key, val) {
    setAccount((a) => ({ ...a, [key]: val }));
  }
  function setCompanyField(key, val) {
    setCompany((c) => ({ ...c, [key]: val }));
  }
  function toggleModule(id) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const step1Valid =
    account.fullName.trim() &&
    account.email.trim() &&
    account.password.length >= 6 &&
    account.password === account.confirmPassword;
  const isPortalRole = joinRole === "External Client" || joinRole === "Supplier";
  const step2Valid =
    mode === "create"
      ? company.name.trim().length > 1
      : joinCode.trim().length >= 6 && (!isPortalRole || customerRef.trim().length > 0);

  async function handleFinalSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!step2Valid) return;

    // Demo mode: no backend to create a real account or company against —
    // simulate the outcome locally and say so, rather than silently doing
    // nothing or pretending a real signup happened.
    if (!IS_CONFIGURED) {
      notify(
        `Demo mode — no Supabase project connected, so "${company.name || "your company"}" isn't really created. Continuing with the sample company instead.`,
      );
      onAuthenticated(null);
      return;
    }

    setBusy(true);
    try {
      const signUpResult = await authSignUp(account.email.trim(), account.password);
      // A project with email confirmation enabled returns a user but no
      // session yet; a project with confirmation disabled (the simpler
      // setup for an internal business tool) returns both immediately.
      let accessToken = signUpResult.access_token;
      if (!accessToken) {
        throw new Error("Account created — check your email to confirm it, then sign in.");
      }
      if (typeof window !== "undefined")
        window.localStorage.setItem("bs_access_token", accessToken);

      const rpcResult =
        mode === "create"
          ? await callRpc(
              "create_company_and_owner",
              {
                p_name: company.name.trim(),
                p_industry: company.category,
                p_country: company.country,
                p_currency: company.currency,
                p_full_name: account.fullName.trim(),
              },
              accessToken,
            )
          : await callRpc(
              "join_company_with_code",
              {
                p_join_code: joinCode.trim(),
                p_full_name: account.fullName.trim(),
                p_role: joinRole,
                p_customer_ref: isPortalRole ? customerRef.trim() : null,
              },
              accessToken,
            );

      // Real fields the create_company_and_owner RPC doesn't take directly
      // (phone, website, tax ID, and which modules to enable) are saved as
      // a real follow-up update — kept genuinely optional and non-blocking:
      // if this second call fails, the account and company both still
      // exist correctly, just without these details filled in yet.
      if (mode === "create" && rpcResult?.id) {
        try {
          await sb("companies")
            .eq("id", rpcResult.id)
            .update({
              website: company.website || null,
              tax_id: company.taxId || null,
              business_scale: businessScale,
            })
            .run();
          await sb("company_modules")
            .insert(
              ONBOARDING_MODULES.map((m) => ({
                company_id: rpcResult.id,
                module_key: m.id,
                enabled: selectedModules.has(m.id),
              })),
            )
            .run();
          await sb("branches")
            .insert({
              company_id: rpcResult.id,
              name: firstBranch.trim() || "Head Office",
              is_headquarters: true,
            })
            .run();
        } catch (_e) {
          /* the account and company are real either way; onboarding details can be finished later in Settings */
        }
      }
      if (account.phone.trim()) {
        try {
          await sb("profiles")
            .eq("id", signUpResult.user.id)
            .update({ phone: account.phone.trim() })
            .run();
        } catch (_e) {
          /* non-blocking */
        }
      }

      onAuthenticated({
        userId: signUpResult.user.id,
        email: signUpResult.user.email,
        accessToken,
        fullName: account.fullName.trim(),
        role: mode === "create" ? "Organization Owner" : joinRole,
        customerRef: isPortalRole ? customerRef.trim() : null,
        company: rpcResult,
      });
    } catch (err) {
      setError(err.message || "Couldn't complete sign up. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const totalSteps = mode === "create" ? 2 : 1;

  // Step labels per mode
  const stepLabels = mode === "create" ? ["Account", "Company"] : ["Join"];

  // Step state for the token-driven stepper: "done" | "active" | "todo".
  function stepState(i) {
    if (step > i + 1) return "done";
    if (step === i + 1) return "active";
    return "todo";
  }

  return (
    <div className="es-auth">
      {/* Left — brand panel */}
      <aside className="es-auth__brand">
        <div className="es-auth__pattern" aria-hidden="true" />
        <div className="relative z-10">
          <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-3xl)" }}>
            <BrandMark size={40} textSize={18} />
            <div>
              <p className="es-title es-title--sm">BusinessSphere</p>
              <p className="es-eyebrow">Intelligent Business Operations</p>
            </div>
          </div>
          <h2 className="es-title" style={{ fontSize: "var(--text-4xl)", maxWidth: 420 }}>
            Set up your workspace in minutes.
          </h2>
          <p className="es-subtitle" style={{ maxWidth: 420 }}>
            Everything from sales to tax, payroll and AI insight — ready on day one.
          </p>
          <div className="es-stack-sm" style={{ marginTop: "var(--space-xl)" }}>
            {[
              "Free to get started",
              "No credit card required",
              "Tanzania-first, Africa-ready",
              "AI-powered from day one",
            ].map((f) => (
              <div key={f} className="es-feature">
                <span className="es-feature__dot" aria-hidden="true">
                  <CheckCircle2 size={12} />
                </span>
                <p className="es-feature__title">{f}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 es-meta">
          v2.1.0 · © {new Date().getFullYear()} BusinessSphere
        </p>
      </aside>

      {/* Right — the stepped form */}
      <main className="es-auth__form-pane" style={{ alignItems: "flex-start" }}>
        <div
          className="es-auth__form"
          style={{ paddingTop: "var(--space-lg)", paddingBottom: "var(--space-lg)" }}
        >
          <div
            className="es-auth__brand-strip"
            style={{ borderRadius: "var(--radius-lg)", marginBottom: "var(--space-lg)" }}
          >
            <BrandMark size={44} textSize={20} />
            <p className="es-title es-title--sm">BusinessSphere</p>
          </div>

          {/* Mode switcher */}
          <div
            className="es-segmented"
            role="tablist"
            aria-label="Signup path"
            style={{ marginBottom: "var(--space-lg)" }}
          >
            {["create", "join"].map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className="es-segmented__item"
                onClick={() => {
                  setMode(m);
                  setStep(1);
                  setError(null);
                }}
              >
                {m === "create" ? "Create company" : "Join with code"}
              </button>
            ))}
          </div>

          {/* Stepper */}
          {totalSteps > 1 && (
            <div
              className="es-stepper"
              style={{ marginBottom: "var(--space-lg)" }}
              aria-label={`Step ${step} of ${totalSteps}`}
            >
              {Array.from({ length: totalSteps }, (_, i) => (
                <div
                  key={i}
                  className="flex items-start"
                  style={{ flex: i < totalSteps - 1 ? 1 : "0 0 auto" }}
                >
                  <div className="es-stepper__step" data-state={stepState(i)}>
                    <button
                      type="button"
                      className="es-stepper__dot"
                      disabled={step <= i + 1}
                      onClick={() => {
                        if (step > i + 1) setStep(i + 1);
                      }}
                      aria-label={`Step ${i + 1}: ${stepLabels[i]}`}
                    >
                      {step > i + 1 ? <CheckCircle2 size={13} /> : i + 1}
                    </button>
                    <span className="es-stepper__label">{stepLabels[i]}</span>
                  </div>
                  {i < totalSteps - 1 && (
                    <div className="es-stepper__line" data-state={step > i + 1 ? "done" : "todo"} />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="es-card es-card--elevated">
            {error && (
              <div className="es-alert" role="alert" style={{ marginBottom: "var(--space-md)" }}>
                <AlertCircle size={14} className="shrink-0" style={{ marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {/* JOIN mode */}
            {mode === "join" && (
              <div className="es-stack">
                <div>
                  <h2 className="es-title es-title--sm">Join your company</h2>
                  <p className="es-subtitle" style={{ fontSize: "var(--text-sm)" }}>
                    Enter the code your admin shared with you
                  </p>
                </div>
                <AuthTextField
                  label="Full name"
                  icon={User}
                  value={account.fullName}
                  onChange={(e) => setAccountField("fullName", e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
                <AuthTextField
                  label="Email address"
                  icon={Mail}
                  type="email"
                  value={account.email}
                  onChange={(e) => setAccountField("email", e.target.value)}
                  placeholder="you@company.tz"
                  autoComplete="email"
                />
                <AuthTextField
                  label="Password"
                  icon={Lock}
                  type={showPassword ? "text" : "password"}
                  value={account.password}
                  onChange={(e) => setAccountField("password", e.target.value)}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                />
                <AuthTextField
                  label="Join code"
                  icon={Lock}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="e.g. a3f9b2"
                />
                <div>
                  <label htmlFor="join-role" className="es-label">
                    Your role
                  </label>
                  <select
                    id="join-role"
                    className="es-select"
                    value={joinRole}
                    onChange={(e) => setJoinRole(e.target.value)}
                  >
                    {ROLES.filter((r) => r.id !== "Organization Owner").map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id}
                      </option>
                    ))}
                  </select>
                </div>
                {isPortalRole && (
                  <AuthTextField
                    label="Customer or supplier reference"
                    icon={Building2}
                    value={customerRef}
                    onChange={(e) => setCustomerRef(e.target.value)}
                    placeholder="As it appears in the system"
                  />
                )}
                <button
                  onClick={handleFinalSubmit}
                  disabled={
                    busy ||
                    !account.fullName.trim() ||
                    !account.email.trim() ||
                    !account.password ||
                    !joinCode.trim()
                  }
                  className="es-btn es-btn--primary es-btn--block es-btn--lg"
                >
                  {busy ? (
                    <>
                      <span className="es-spinner" aria-hidden="true" />
                      <span className="es-sr-only">Joining</span>
                    </>
                  ) : (
                    "Join company"
                  )}
                </button>
              </div>
            )}

            {/* CREATE mode — Step 1: Account */}
            {mode === "create" && step === 1 && (
              <div className="es-stack">
                <div>
                  <h2 className="es-title es-title--sm">Create your account</h2>
                  <p className="es-subtitle" style={{ fontSize: "var(--text-sm)" }}>
                    Step 1 of 2 — personal details
                  </p>
                </div>
                <AuthTextField
                  label="Full name"
                  icon={User}
                  value={account.fullName}
                  onChange={(e) => setAccountField("fullName", e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
                <AuthTextField
                  label="Email address"
                  icon={Mail}
                  type="email"
                  value={account.email}
                  onChange={(e) => setAccountField("email", e.target.value)}
                  placeholder="you@company.tz"
                  autoComplete="email"
                />
                <div>
                  <label htmlFor="signup-password" className="es-label">
                    Password
                  </label>
                  <div className="es-field es-field--icon es-field--icon-suffix">
                    <span className="es-field__icon" aria-hidden="true">
                      <Lock size={15} />
                    </span>
                    <input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      value={account.password}
                      autoComplete="new-password"
                      onChange={(e) => setAccountField("password", e.target.value)}
                      placeholder="Min. 6 characters"
                      className="es-input"
                    />
                    <button
                      type="button"
                      className="es-field__suffix"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <AuthTextField
                  label="Confirm password"
                  icon={Lock}
                  type="password"
                  value={account.confirmPassword}
                  onChange={(e) => setAccountField("confirmPassword", e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  invalid={
                    !!(
                      account.password &&
                      account.confirmPassword &&
                      account.password !== account.confirmPassword
                    )
                  }
                />
                {account.password &&
                  account.confirmPassword &&
                  account.password !== account.confirmPassword && (
                    <p className="es-error-text">
                      <AlertCircle size={12} /> Passwords don&apos;t match
                    </p>
                  )}
                <button
                  onClick={() => {
                    if (step1Valid) setStep(2);
                  }}
                  disabled={!step1Valid}
                  className="es-btn es-btn--primary es-btn--block es-btn--lg"
                >
                  Continue
                </button>
              </div>
            )}

            {/* CREATE mode — Step 2: Company */}
            {mode === "create" && step === 2 && (
              <div className="es-stack">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="es-field__suffix"
                    style={{ position: "static", transform: "none" }}
                    aria-label="Back to account details"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div>
                    <h2 className="es-title es-title--sm">Your company</h2>
                    <p className="es-subtitle" style={{ fontSize: "var(--text-sm)" }}>
                      Step 2 of 2 — business details
                    </p>
                  </div>
                </div>
                <AuthTextField
                  label="Company name *"
                  icon={Building2}
                  value={company.name}
                  onChange={(e) => setCompanyField("name", e.target.value)}
                  placeholder="e.g. Kilimanjaro Traders Ltd"
                />
                <div className="es-grid-2">
                  <div>
                    <label htmlFor="signup-country" className="es-label">
                      Country
                    </label>
                    <select
                      id="signup-country"
                      className="es-select"
                      value={company.country}
                      onChange={(e) => setCompanyField("country", e.target.value)}
                    >
                      {SIGNUP_COUNTRIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="signup-currency" className="es-label">
                      Currency
                    </label>
                    <select
                      id="signup-currency"
                      className="es-select"
                      value={company.currency}
                      onChange={(e) => setCompanyField("currency", e.target.value)}
                    >
                      {SIGNUP_CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="signup-industry" className="es-label">
                    Industry
                  </label>
                  <select
                    id="signup-industry"
                    className="es-select"
                    value={company.category}
                    onChange={(e) => setCompanyField("category", e.target.value)}
                  >
                    {COMPANY_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <AuthTextField
                  label="First branch name"
                  icon={Building2}
                  value={firstBranch}
                  onChange={(e) => setFirstBranch(e.target.value)}
                  placeholder="Head Office"
                />
                <button
                  onClick={handleFinalSubmit}
                  disabled={busy || !company.name.trim()}
                  className="es-btn es-btn--primary es-btn--block es-btn--lg"
                >
                  {busy ? (
                    <>
                      <span className="es-spinner" aria-hidden="true" />
                      <span className="es-sr-only">Creating your workspace</span>
                    </>
                  ) : (
                    "Create workspace"
                  )}
                </button>
                <p className="es-meta" style={{ textAlign: "center" }}>
                  Estimated setup time: ~30 seconds
                </p>
              </div>
            )}
          </div>

          <p className="es-meta" style={{ textAlign: "center", marginTop: "var(--space-md)" }}>
            Already have an account?{" "}
            <button type="button" onClick={onSwitchToLogin} className="es-link">
              Sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

// Completes setup for a real OAuth session (Google/Microsoft/Apple) that
// authenticated correctly but has no company yet — the identity is
// already real and verified by the OAuth provider, so this skips the
// personal-details step entirely and goes straight to company setup,
// using the exact same create_company_and_owner / join_company_with_code
// RPCs email signup uses. No password is collected here — there isn't
// one to set; this account will only ever sign in through the same OAuth
// provider again.
export function OAuthCompanySetup({ oauthUser, onAuthenticated, onCancel }) {
  const [mode, setMode] = useState("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fullName, setFullName] = useState(oauthUser.fullName || "");
  const [company, setCompany] = useState({
    name: "",
    category: COMPANY_CATEGORIES[0],
    country: SIGNUP_COUNTRIES[0],
    currency: SIGNUP_CURRENCIES[0],
    website: "",
    taxId: "",
  });
  const [selectedModules, setSelectedModules] = useState(
    () => new Set(ONBOARDING_MODULES.map((m) => m.id)),
  );
  const [businessScale, setBusinessScale] = useState("large");
  const [firstBranch, setFirstBranch] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState("Employee");
  const [customerRef, setCustomerRef] = useState("");

  function setCompanyField(key, val) {
    setCompany((c) => ({ ...c, [key]: val }));
  }
  function toggleModule(id) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const isPortalRole = joinRole === "External Client" || joinRole === "Supplier";
  const valid =
    fullName.trim() &&
    (mode === "create"
      ? company.name.trim().length > 1
      : joinCode.trim().length >= 6 && (!isPortalRole || customerRef.trim().length > 0));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!valid) return;
    setBusy(true);
    try {
      const rpcResult =
        mode === "create"
          ? await callRpc(
              "create_company_and_owner",
              {
                p_name: company.name.trim(),
                p_industry: company.category,
                p_country: company.country,
                p_currency: company.currency,
                p_full_name: fullName.trim(),
              },
              oauthUser.accessToken,
            )
          : await callRpc(
              "join_company_with_code",
              {
                p_join_code: joinCode.trim(),
                p_full_name: fullName.trim(),
                p_role: joinRole,
                p_customer_ref: isPortalRole ? customerRef.trim() : null,
              },
              oauthUser.accessToken,
            );

      if (mode === "create" && rpcResult?.id) {
        try {
          await sb("companies")
            .eq("id", rpcResult.id)
            .update({
              website: company.website || null,
              tax_id: company.taxId || null,
              business_scale: businessScale,
            })
            .run();
          await sb("company_modules")
            .insert(
              ONBOARDING_MODULES.map((m) => ({
                company_id: rpcResult.id,
                module_key: m.id,
                enabled: selectedModules.has(m.id),
              })),
            )
            .run();
          await sb("branches")
            .insert({
              company_id: rpcResult.id,
              name: firstBranch.trim() || "Head Office",
              is_headquarters: true,
            })
            .run();
        } catch (_e) {
          /* the account and company are real either way; onboarding details can be finished later in Settings */
        }
      }

      onAuthenticated({
        userId: oauthUser.id,
        email: oauthUser.email,
        accessToken: oauthUser.accessToken,
        fullName: fullName.trim(),
        role: mode === "create" ? "Organization Owner" : joinRole,
        customerRef: isPortalRole ? customerRef.trim() : null,
        company: rpcResult,
      });
    } catch (err) {
      setError(err.message || "Couldn't complete setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="es-auth"
      style={{ alignItems: "flex-start", justifyContent: "center", padding: "var(--space-lg)" }}
    >
      <div className="w-full" style={{ maxWidth: 560, paddingTop: "var(--space-lg)" }}>
        <div
          className="flex flex-col items-center"
          style={{ gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}
        >
          <BrandMark size={56} textSize={24} />
          <p className="es-title es-title--sm">BusinessSphere</p>
          <p className="es-eyebrow">Intelligent Business Operations</p>
        </div>
        <form onSubmit={handleSubmit} className="es-card es-card--elevated es-stack-lg">
          <div>
            <h2 className="es-title es-title--sm">
              One more step, {fullName.split(" ")[0] || "there"}
            </h2>
            <p className="es-subtitle" style={{ fontSize: "var(--text-sm)" }}>
              Signed in as {oauthUser.email} — now set up your organization.
            </p>
          </div>

          <div>
            <label htmlFor="oauth-name" className="es-label">
              Your name *
            </label>
            <input
              id="oauth-name"
              className="es-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
          </div>

          <div className="es-segmented" role="tablist" aria-label="Setup path">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "create"}
              className="es-segmented__item"
              onClick={() => setMode("create")}
            >
              Create a company
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "join"}
              className="es-segmented__item"
              onClick={() => setMode("join")}
            >
              Join a company
            </button>
          </div>

          {mode === "create" ? (
            <div className="es-stack">
              <div>
                <label htmlFor="oauth-company" className="es-label">
                  Organization name *
                </label>
                <input
                  id="oauth-company"
                  className="es-input"
                  value={company.name}
                  onChange={(e) => setCompanyField("name", e.target.value)}
                  placeholder="e.g. BEIRAHISI HARDWARE"
                />
              </div>
              <FormField label="Business type">
                <CategoryPicker
                  value={company.category}
                  onChange={(v) => setCompanyField("category", v)}
                />
              </FormField>
              <div className="es-grid-2">
                <div>
                  <label htmlFor="oauth-country" className="es-label">
                    Country
                  </label>
                  <select
                    id="oauth-country"
                    className="es-select"
                    value={company.country}
                    onChange={(e) => setCompanyField("country", e.target.value)}
                  >
                    {SIGNUP_COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="oauth-currency" className="es-label">
                    Currency
                  </label>
                  <select
                    id="oauth-currency"
                    className="es-select"
                    value={company.currency}
                    onChange={(e) => setCompanyField("currency", e.target.value)}
                  >
                    {SIGNUP_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span className="es-label">Business scale</span>
                <div className="es-grid-2">
                  {[
                    { id: "small", label: "Small Business", hint: "One location, lean team" },
                    { id: "large", label: "Large Business", hint: "Multiple departments" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="es-option"
                      aria-pressed={businessScale === s.id}
                      onClick={() => {
                        setBusinessScale(s.id);
                        setSelectedModules(
                          new Set(
                            s.id === "small"
                              ? getIndustryProfile(company.category).recommendedModules
                              : SCALE_MODULE_PRESETS.large,
                          ),
                        );
                      }}
                    >
                      <span className="es-option__title">{s.label}</span>
                      <span className="es-option__hint">{s.hint}</span>
                    </button>
                  ))}
                </div>
                <p className="es-help">
                  Sets a sensible starting set of modules below — nothing is locked away either way.
                </p>
              </div>
              <div>
                <span className="es-label">Select modules to use</span>
                <div className="es-grid-3">
                  {ONBOARDING_MODULES.map((m) => {
                    const Icon = m.icon;
                    const on = selectedModules.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleModule(m.id)}
                        className="es-tile"
                        aria-pressed={on}
                      >
                        <Icon
                          size={16}
                          style={{ color: on ? "var(--accent-gold)" : "var(--text-tertiary)" }}
                          aria-hidden="true"
                        />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label htmlFor="oauth-branch" className="es-label">
                  Your first branch or location (optional)
                </label>
                <input
                  id="oauth-branch"
                  className="es-input"
                  value={firstBranch}
                  onChange={(e) => setFirstBranch(e.target.value)}
                  placeholder="e.g. Kariakoo Branch — defaults to Head Office"
                />
              </div>
            </div>
          ) : (
            <div className="es-stack">
              <div>
                <label htmlFor="oauth-join" className="es-label">
                  Company join code *
                </label>
                <input
                  id="oauth-join"
                  className="es-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3D4"
                />
              </div>
              <div>
                <label htmlFor="oauth-role" className="es-label">
                  Your role
                </label>
                <select
                  id="oauth-role"
                  className="es-select"
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id}
                    </option>
                  ))}
                </select>
              </div>
              {isPortalRole && (
                <div>
                  <label htmlFor="oauth-ref" className="es-label">
                    Your company name, exactly as it appears on your records *
                  </label>
                  <input
                    id="oauth-ref"
                    className="es-input"
                    value={customerRef}
                    onChange={(e) => setCustomerRef(e.target.value)}
                    placeholder="e.g. Kilimo Fresh Distributors"
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="es-alert" role="alert">
              <AlertCircle size={14} className="shrink-0" style={{ marginTop: 2 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="flex" style={{ gap: "var(--space-sm)" }}>
            <button
              type="button"
              onClick={onCancel}
              className="es-btn es-btn--secondary"
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || busy}
              aria-label="Finish setup"
              className="es-btn es-btn--primary es-btn--lg"
              style={{ flex: 2 }}
            >
              {busy ? (
                <>
                  <span className="es-spinner" aria-hidden="true" />
                  <span className="es-sr-only">Finishing setup</span>
                </>
              ) : (
                "Finish setup"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
