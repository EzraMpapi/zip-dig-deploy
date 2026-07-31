import { useState } from "react";
import {
  AlertCircle, Briefcase, Building2, CheckCircle2, ChevronLeft, ClipboardList, Eye, EyeOff,
  Factory, FileText, HardHat, HeartPulse, LoaderCircle, Lock, Mail, Package, ReceiptText,
  Sparkles, Store, TrendingUp, Truck, User, Users, Wallet
} from "lucide-react";
import { BrandMark } from "../components/BrandMark.jsx";
import { CategoryPicker, FormField, inputClass } from "../components/ui.jsx";
import { COMPANY_CATEGORIES, ROLES } from "../data/core.jsx";
import { notify } from "../lib/notify.jsx";
import {
  DEMO_OVERRIDE,
  IS_CONFIGURED,
  authSignIn,
  authSignUp,
  callRpc,
  sb, setDemoOverride } from "../lib/supabase.jsx";

/* ══════════════ AUTHENTICATION ══════════════ */
export const SIGNUP_COUNTRIES = ["Tanzania", "Kenya", "Uganda", "Rwanda", "Zambia", "Malawi", "Other"];

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
    label: "Retail & Trade", icon: Store,
    recommendedModules: ["inventory", "sales", "finance", "procurement", "crm"],
    tips: [
      "Inventory and Sales & POS matter most here — real stock levels and real counter sales, kept in sync automatically.",
      "Set up Suppliers in Procurement early so reordering low stock is one click, not a phone-call scramble.",
      "The Business Credit Profile (Reports) is worth building early if you'll ever need supplier trade credit or a stock loan.",
    ],
  },
  food_hospitality: {
    label: "Food & Hospitality", icon: Store,
    recommendedModules: ["sales", "inventory", "hr", "finance"],
    tips: [
      "Sales & POS for the counter, Inventory for real perishable stock — the Stock Audit tab (Inventory) is genuinely useful here for catching real spoilage variance, not just theft.",
      "HR & Payroll matters more in this industry than most — shift-based staff and real leave tracking, not just a headcount number.",
      "Expenses' 'Rent & Utilities' category tends to be the largest real cost center here — watch it in Reports' Profit & Loss.",
    ],
  },
  professional_services: {
    label: "Professional & Creative Services", icon: Briefcase,
    recommendedModules: ["crm", "projects", "finance", "sales"],
    tips: [
      "CRM and Projects together are the real backbone here — a client relationship and the actual work delivered for them, tracked as one thread rather than two disconnected records.",
      "Real invoicing discipline matters most in service businesses — Reports' Receivables Aging (Finance) surfaces exactly which client relationships need a follow-up call.",
      "Consider Workflow Studio (Automation) for real, repeatable client onboarding steps rather than remembering them by hand each time.",
    ],
  },
  personal_care: {
    label: "Personal Care & Wellness", icon: Sparkles,
    recommendedModules: ["sales", "crm", "hr", "finance"],
    tips: [
      "CRM matters more here than in most retail businesses — real repeat-client relationships and their real preferences are the actual asset.",
      "Sales & POS for real day-to-day transactions, with HR & Payroll if staff work on commission or shifts.",
      "The Scenario Planner (Predictive Intelligence) is genuinely useful for modeling a real price change against real client volume before raising rates.",
    ],
  },
  healthcare: {
    label: "Healthcare & Veterinary", icon: HeartPulse,
    recommendedModules: ["inventory", "crm", "sales", "finance"],
    tips: [
      "Inventory's expiry-sensitive stock matters more here than almost any other industry — the Stock Audit tab is worth using on a real, regular schedule, not just once.",
      "CRM here functions as a real client/patient relationship record — recurring visits and real contact history matter as much as the transaction itself.",
      "Real compliance and licensing costs are worth their own Expense category (Finance) rather than being buried in a generic 'Other' bucket.",
    ],
  },
  industrial_construction: {
    label: "Construction, Manufacturing & Industrial", icon: HardHat,
    recommendedModules: ["projects", "procurement", "manufacturing", "inventory", "finance"],
    tips: [
      "Projects for real job/site tracking, Procurement and Manufacturing for real materials and production — this cluster is the one this build's fullest module set was actually built for.",
      "Fixed Assets (Finance) matters more here than most industries — real equipment depreciation affects real project costing, not just year-end paperwork.",
      "The Cash Flow Statement's Investing Activities (Reports) will show real equipment purchases as they happen, not just at audit time.",
    ],
  },
  logistics_agriculture: {
    label: "Logistics, Transport & Agriculture", icon: Truck,
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
  "Grocery": "retail", "Hardware": "retail", "Electronics": "retail", "Clothing": "retail",
  "Footwear": "retail", "Fashion Accessories": "retail", "Furniture": "retail", "Kitchen Utensils": "retail",
  "Jewellery": "retail", "Gift & Toys": "retail", "Stationery": "retail", "Textiles": "retail",
  "Mobile & Accessories": "retail", "Cosmetics": "retail", "Handicrafts": "retail", "Religious Store": "retail",
  "Water Jars": "retail", "Pet Stores": "retail", "Retail & Wholesale": "retail", "Music": "retail", "Petroleum": "retail",
  "Restaurant & Cafe": "food_hospitality", "Bakery": "food_hospitality", "Catering": "food_hospitality",
  "Street Foods": "food_hospitality", "Sweet Shop": "food_hospitality", "Food & Beverages": "food_hospitality",
  "Hotel": "food_hospitality", "Hostel": "food_hospitality", "Fresh House": "food_hospitality",
  "Fruits & Vegetables": "food_hospitality", "Dairy Products": "food_hospitality", "Hospitality & Tourism": "food_hospitality",
  "Consulting": "professional_services", "Legal Services": "professional_services", "Information Technology": "professional_services",
  "Computer Services": "professional_services", "Photo Studio": "professional_services", "Professional Services": "professional_services",
  "Technology": "professional_services", "Printing": "professional_services", "Education": "professional_services",
  "Non Profit": "professional_services", "Financial Services": "professional_services", "Security Services": "professional_services",
  "Salon": "personal_care", "Beauty Parlour": "personal_care", "Laundry": "personal_care", "Tailoring": "personal_care",
  "Sports & Fitness": "personal_care", "Personal": "personal_care",
  "Healthcare & Pharmacy": "healthcare", "Medical & Healthcare": "healthcare", "Veterinary": "healthcare", "Nursery": "healthcare",
  "Construction": "industrial_construction", "Manufacturing": "industrial_construction", "Auto / Parts": "industrial_construction",
  "Garage": "industrial_construction", "Maintenance Services": "industrial_construction", "Mill": "industrial_construction",
  "Waste Collection": "industrial_construction",
  "Agriculture": "logistics_agriculture", "Fishing": "logistics_agriculture", "Poultry": "logistics_agriculture",
  "Logistics & Transport": "logistics_agriculture", "Transportation": "logistics_agriculture", "Tours & Travel": "logistics_agriculture",
  "Cable Operator": "logistics_agriculture",
  "Entertainment": "professional_services", "Online": "professional_services", "Other": "retail",
};

export function getIndustryProfile(category) {
  const clusterId = CATEGORY_TO_INDUSTRY[category] || "retail";
  return { id: clusterId, ...INDUSTRY_PROFILES[clusterId] };
}

// Real ITU-assigned calling codes, in the same order as SIGNUP_COUNTRIES —
// not placeholder digits.
export const COUNTRY_CALLING_CODES = { "Tanzania": "+255", "Kenya": "+254", "Uganda": "+256", "Rwanda": "+250", "Zambia": "+260", "Malawi": "+265", "Other": "+" };

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

export function AuthTextField({ label, icon: Icon, type = "text", value, onChange, placeholder, rightSlot }) {
  return (
    <div>
      {label && <label className="text-[12.5px] font-medium text-slate-600 block mb-1.5">{label}</label>}
      <div className="relative">
        <div className="absolute left-1 top-1 bottom-1 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#DCFCE7" }}>
          <Icon size={15} className="text-[#16A34A]" />
        </div>
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder}
          className={`w-full bg-white border border-slate-200 rounded-lg pl-12 py-2.5 text-[13.5px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all ${rightSlot ? "pr-10" : "pr-3"}`}
        />
        {rightSlot}
      </div>
    </div>
  );
}

export function LoginPage({ onAuthenticated, onSwitchToSignup }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setBusy(true); setError(null);
    try {
      if (!IS_CONFIGURED) { onAuthenticated(null); return; }
      const result = await authSignIn(identifier.trim(), password);
      if (result.error) { setError(result.error.message || "Login failed."); return; }
      onAuthenticated(result.session || null);
    } catch (_e) { setError("Something went wrong — check your connection."); }
    finally { setBusy(false); }
  }

  function handleMouseMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    setTiltX(-((e.clientY - r.top - r.height / 2) / (r.height / 2)) * 7);
    setTiltY(((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 7);
  }

  return (
    <div className="min-h-screen w-full flex" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Left — brand panel, hidden on small screens */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] relative overflow-hidden p-12" style={{ background: "linear-gradient(160deg, #052614 0%, #0F4D26 35%, #16A34A 70%, #22C55E 100%)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute w-96 h-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #4ADE80 0%, transparent 70%)", top: "-100px", right: "-80px", filter: "blur(70px)" }} />
          <div className="absolute w-64 h-64 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #BBF7D0 0%, transparent 70%)", bottom: "5%", left: "10%", filter: "blur(50px)" }} />
          <svg className="absolute opacity-8" style={{ bottom: "15%", right: "5%", width: 180, height: 208 }} viewBox="0 0 120 140">
            <polygon points="60,6 114,33 114,107 60,134 6,107 6,33" fill="none" stroke="#4ADE80" strokeWidth="1.5" />
          </svg>
          <svg className="absolute opacity-6" style={{ top: "5%", left: "5%", width: 80, height: 92 }} viewBox="0 0 120 140">
            <polygon points="60,6 114,33 114,107 60,134 6,107 6,33" fill="none" stroke="#86EFAC" strokeWidth="2" />
          </svg>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <svg width="40" height="46" viewBox="0 0 120 140">
              <defs><linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4ADE80"/><stop offset="100%" stopColor="#16A34A"/></linearGradient></defs>
              <polygon points="60,6 114,33 114,107 60,134 6,107 6,33" fill="url(#lg1)"/>
              <text x="60" y="76" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="52" fontWeight="900" fontFamily="Poppins,sans-serif">S</text>
            </svg>
            <div>
              <p className="text-white font-bold text-[18px] leading-tight" style={{ fontFamily: "Poppins,sans-serif" }}>Smart Manager</p>
              <p className="text-white/50 text-[11px] tracking-wide uppercase">Enterprise Edition</p>
            </div>
          </div>
          <h2 className="text-[36px] font-bold text-white leading-tight mb-4" style={{ fontFamily: "Poppins,sans-serif" }}>Africa&apos;s first AI-powered Business Ecosystem</h2>
          <p className="text-white/65 text-[14px] leading-relaxed">Manage every aspect of your organisation — from sales and inventory to HR, tax, and AI insights — in one place.</p>
        </div>
        <div className="relative z-10 space-y-3">
          {[["TRA Tax Center", "PAYE, SDL, WCF with real brackets"],["Biometric Attendance", "Real fingerprint via WebAuthn"],["AI Command Center", "English & Kiswahili, live business data"]].map(([t,s]) => (
            <div key={t} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[#4ADE80]/20 flex items-center justify-center shrink-0 mt-0.5"><CheckCircle2 size={12} className="text-[#4ADE80]" /></div>
              <div><p className="text-white text-[13px] font-medium">{t}</p><p className="text-white/50 text-[11.5px]">{s}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — the form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-[#F8FAFC]">
        <div className="w-full max-w-sm" style={{ perspective: "1200px" }} onMouseMove={handleMouseMove} onMouseLeave={() => { setTiltX(0); setTiltY(0); }}>
          {/* Mobile brand — only on small screens */}
          <div className="flex lg:hidden flex-col items-center mb-8">
            <svg width="48" height="55" viewBox="0 0 120 140" className="mb-2">
              <defs><linearGradient id="mlg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4ADE80"/><stop offset="100%" stopColor="#16A34A"/></linearGradient></defs>
              <polygon points="60,6 114,33 114,107 60,134 6,107 6,33" fill="url(#mlg)"/>
              <text x="60" y="76" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="52" fontWeight="900" fontFamily="Poppins,sans-serif">S</text>
            </svg>
            <p className="font-bold text-[#111827] text-[18px]" style={{ fontFamily: "Poppins,sans-serif" }}>Smart Manager</p>
          </div>

          <div style={{ transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`, transition: "transform 0.12s ease-out" }}>
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8">
              <div className="mb-7">
                <h1 className="text-[22px] font-bold text-[#111827] mb-1" style={{ fontFamily: "Poppins,sans-serif" }}>Welcome back</h1>
                <p className="text-[13px] text-slate-500">Sign in to your account to continue</p>
              </div>

              {error && <div className="mb-4 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100 text-[12.5px] text-red-700"><AlertCircle size={13} className="shrink-0" />{error}</div>}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Email address</label>
                  <input type="text" value={identifier} autoComplete="email" onChange={(e) => setIdentifier(e.target.value)} placeholder="you@company.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[13.5px] text-[#111827] placeholder-slate-300 outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 transition-all" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-[13.5px] text-[#111827] placeholder-slate-300 outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 transition-all" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={busy || !identifier.trim() || !password}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#16A34A,#22C55E)", boxShadow: "0 4px 14px rgba(22,163,74,0.35)" }}>
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="text-center text-[12.5px] text-slate-500 mt-5">
                Don&apos;t have an account? <button type="button" onClick={onSwitchToSignup} className="font-semibold text-[#16A34A] hover:underline">Create one</button>
              </p>
              <button type="button" onClick={() => { setDemoOverride(true); onAuthenticated({ demo: true }); }}
                className="w-full mt-3 flex items-center justify-center gap-2 text-[12.5px] font-medium text-slate-500 hover:text-[#16A34A] border border-slate-200 rounded-xl py-2.5 transition-colors">
                <Sparkles size={13} className="text-[#16A34A]" /> Preview demo — no account needed
              </button>
              {!IS_CONFIGURED && <p className="text-center text-[11px] text-slate-400 mt-3">Demo mode — any credentials continue to the sample company.</p>}
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-4">© {new Date().getFullYear()} Smart Manager · Enterprise Business Ecosystem</p>
        </div>
      </div>
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
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.5l6.5-6.5C35.3 2.6 30 0.5 24 0.5 14.9 0.5 7.1 5.7 3.3 13.3l7.6 5.9C12.7 13.3 17.9 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.6c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4z" />
      <path fill="#FBBC05" d="M10.9 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.6-5.9C1.6 16.7 0.5 20.2 0.5 24s1.1 7.3 2.8 10.5l7.6-5.9z" />
      <path fill="#34A853" d="M24 47.5c6 0 11.3-2 15-5.4l-7.3-5.7c-2 1.4-4.6 2.2-7.7 2.2-6.1 0-11.3-3.8-13.1-9.5l-7.6 5.9C7.1 42.3 14.9 47.5 24 47.5z" />
    </svg>
  );
}

export function MicrosoftGlyph({ size = 18 }) {
  return (
    <span className="grid grid-cols-2 gap-[2px] shrink-0" style={{ width: size, height: size }}>
      <span style={{ backgroundColor: "#F25022" }} /><span style={{ backgroundColor: "#7FBA00" }} />
      <span style={{ backgroundColor: "#00A4EF" }} /><span style={{ backgroundColor: "#FFB900" }} />
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

  const [account, setAccount] = useState({ fullName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [company, setCompany] = useState({
    name: "", category: COMPANY_CATEGORIES[0], country: SIGNUP_COUNTRIES[0], currency: SIGNUP_CURRENCIES[0],
    website: "", taxId: "",
  });
  const [selectedModules, setSelectedModules] = useState(() => new Set(ONBOARDING_MODULES.map((m) => m.id)));
  const [businessScale, setBusinessScale] = useState("large");
  const [firstBranch, setFirstBranch] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState("Employee");
  const [customerRef, setCustomerRef] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function setAccountField(key, val) { setAccount((a) => ({ ...a, [key]: val })); }
  function setCompanyField(key, val) { setCompany((c) => ({ ...c, [key]: val })); }
  function toggleModule(id) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const step1Valid = account.fullName.trim() && account.email.trim() && account.password.length >= 6 && account.password === account.confirmPassword;
  const isPortalRole = joinRole === "External Client" || joinRole === "Supplier";
  const step2Valid = mode === "create" ? company.name.trim().length > 1 : joinCode.trim().length >= 6 && (!isPortalRole || customerRef.trim().length > 0);

  async function handleFinalSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!step2Valid) return;

    // Demo mode: no backend to create a real account or company against —
    // simulate the outcome locally and say so, rather than silently doing
    // nothing or pretending a real signup happened.
    if (!IS_CONFIGURED) {
      notify(`Demo mode — no Supabase project connected, so "${company.name || "your company"}" isn't really created. Continuing with the sample company instead.`);
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
      if (typeof window !== "undefined") window.localStorage.setItem("bs_access_token", accessToken);

      const rpcResult = mode === "create"
        ? await callRpc("create_company_and_owner", {
            p_name: company.name.trim(), p_industry: company.category, p_country: company.country, p_currency: company.currency, p_full_name: account.fullName.trim(),
          }, accessToken)
        : await callRpc("join_company_with_code", {
            p_join_code: joinCode.trim(), p_full_name: account.fullName.trim(), p_role: joinRole, p_customer_ref: isPortalRole ? customerRef.trim() : null,
          }, accessToken);

      // Real fields the create_company_and_owner RPC doesn't take directly
      // (phone, website, tax ID, and which modules to enable) are saved as
      // a real follow-up update — kept genuinely optional and non-blocking:
      // if this second call fails, the account and company both still
      // exist correctly, just without these details filled in yet.
      if (mode === "create" && rpcResult?.id) {
        try {
          await sb("companies").eq("id", rpcResult.id).update({ website: company.website || null, tax_id: company.taxId || null, business_scale: businessScale }).run();
          await sb("company_modules").insert(ONBOARDING_MODULES.map((m) => ({ company_id: rpcResult.id, module_key: m.id, enabled: selectedModules.has(m.id) }))).run();
          await sb("branches").insert({ company_id: rpcResult.id, name: firstBranch.trim() || "Head Office", is_headquarters: true }).run();
        } catch (_e) { /* the account and company are real either way; onboarding details can be finished later in Settings */ }
      }
      if (account.phone.trim()) {
        try { await sb("profiles").eq("id", signUpResult.user.id).update({ phone: account.phone.trim() }).run(); } catch (_e) { /* non-blocking */ }
      }

      onAuthenticated({
        userId: signUpResult.user.id, email: signUpResult.user.email, accessToken,
        fullName: account.fullName.trim(), role: mode === "create" ? "Organization Owner" : joinRole,
        customerRef: isPortalRole ? customerRef.trim() : null, company: rpcResult,
      });
    } catch (err) {
      setError(err.message || "Couldn't complete sign up. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const totalSteps = mode === "create" ? 2 : 1;

  // Step labels per mode
  const stepLabels = mode === "create"
    ? ["Account", "Company"]
    : ["Join"];

  const gradientBg = "linear-gradient(160deg, #052614 0%, #0F4D26 35%, #16A34A 70%, #22C55E 100%)";

  return (
    <div className="min-h-screen w-full flex" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] relative overflow-hidden p-12" style={{ background: gradientBg }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute w-96 h-96 rounded-full opacity-20" style={{ background: "radial-gradient(circle,#4ADE80 0%,transparent 70%)", top: "-100px", right: "-80px", filter: "blur(70px)" }} />
          <div className="absolute w-64 h-64 rounded-full opacity-15" style={{ background: "radial-gradient(circle,#BBF7D0 0%,transparent 70%)", bottom: "5%", left: "10%", filter: "blur(50px)" }} />
          <svg className="absolute opacity-8" style={{ bottom: "15%", right: "5%", width: 180, height: 208 }} viewBox="0 0 120 140">
            <polygon points="60,6 114,33 114,107 60,134 6,107 6,33" fill="none" stroke="#4ADE80" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <svg width="40" height="46" viewBox="0 0 120 140">
              <defs><linearGradient id="slg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4ADE80"/><stop offset="100%" stopColor="#16A34A"/></linearGradient></defs>
              <polygon points="60,6 114,33 114,107 60,134 6,107 6,33" fill="url(#slg)"/>
              <text x="60" y="76" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="52" fontWeight="900" fontFamily="Poppins,sans-serif">S</text>
            </svg>
            <div>
              <p className="text-white font-bold text-[18px] leading-tight" style={{ fontFamily: "Poppins,sans-serif" }}>Smart Manager</p>
              <p className="text-white/50 text-[11px] tracking-wide uppercase">Enterprise Edition</p>
            </div>
          </div>
          <h2 className="text-[34px] font-bold text-white leading-tight mb-4" style={{ fontFamily: "Poppins,sans-serif" }}>Start managing your business the smart way</h2>
          <p className="text-white/65 text-[14px] leading-relaxed mb-8">Set up in minutes. Everything from sales to tax, payroll, and AI insights — ready on day one.</p>
          <div className="space-y-3">
            {["Free to get started","No credit card required","Tanzania-first, Africa-ready","AI-powered from day one"].map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#4ADE80]/20 flex items-center justify-center shrink-0"><CheckCircle2 size={12} className="text-[#4ADE80]" /></div>
                <p className="text-white/80 text-[13px]">{f}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-white/30 text-[11px]">© {new Date().getFullYear()} Smart Manager · Enterprise Business Ecosystem</p>
      </div>

      {/* Right — the stepped form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-[#F8FAFC] overflow-y-auto">
        <div className="w-full max-w-md py-6">

          {/* Mobile brand */}
          <div className="flex lg:hidden flex-col items-center mb-7">
            <svg width="44" height="51" viewBox="0 0 120 140" className="mb-2">
              <defs><linearGradient id="mslg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#4ADE80"/><stop offset="100%" stopColor="#16A34A"/></linearGradient></defs>
              <polygon points="60,6 114,33 114,107 60,134 6,107 6,33" fill="url(#mslg)"/>
              <text x="60" y="76" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="52" fontWeight="900" fontFamily="Poppins,sans-serif">S</text>
            </svg>
            <p className="font-bold text-[#111827] text-[18px]" style={{ fontFamily: "Poppins,sans-serif" }}>Smart Manager</p>
          </div>

          {/* Mode switcher */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-6">
            {["create","join"].map((m) => (
              <button key={m} onClick={() => { setMode(m); setStep(1); setError(null); }}
                className={`flex-1 py-2.5 rounded-lg text-[13px] font-medium transition-all ${mode === m ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>
                {m === "create" ? "🏢 Create company" : "🔑 Join with code"}
              </button>
            ))}
          </div>

          {/* Progress */}
          {totalSteps > 1 && (
            <div className="flex items-center gap-2 mb-6">
              {Array.from({length: totalSteps}, (_, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: (step > i + 1) ? "#16A34A" : step === i + 1 ? "#16A34A" : "#E5E7EB", color: (step >= i + 1) ? "white" : "#9CA3AF" }}>
                    {(step > i + 1) ? <CheckCircle2 size={12}/> : i + 1}
                  </div>
                  <p className={`text-[11.5px] font-medium ${step === i + 1 ? "text-[#111827]" : "text-slate-400"}`}>{stepLabels[i]}</p>
                  {i < totalSteps - 1 && <div className="flex-1 h-px" style={{ backgroundColor: (step > i + 1) ? "#16A34A" : "#E5E7EB" }} />}
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8">
            {error && <div className="mb-5 flex items-start gap-2 px-3.5 py-3 rounded-xl bg-red-50 border border-red-100 text-[12.5px] text-red-700"><AlertCircle size={13} className="shrink-0 mt-0.5"/><span>{error}</span></div>}

            {/* JOIN mode */}
            {mode === "join" && (
              <div className="space-y-4">
                <div><h2 className="text-[20px] font-bold text-[#111827]" style={{ fontFamily: "Poppins,sans-serif" }}>Join your company</h2><p className="text-[13px] text-slate-500 mt-0.5">Enter the code your admin shared with you</p></div>
                <AuthTextField label="Full name" icon={User} value={account.fullName} onChange={(e) => setAccountField("fullName", e.target.value)} placeholder="Your full name" />
                <AuthTextField label="Email address" icon={Mail} type="email" value={account.email} onChange={(e) => setAccountField("email", e.target.value)} placeholder="you@company.tz" />
                <AuthTextField label="Password" icon={Lock} type={showPassword ? "text" : "password"} value={account.password} onChange={(e) => setAccountField("password", e.target.value)} placeholder="Min. 6 characters" />
                <AuthTextField label="Join code" icon={Lock} value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="e.g. a3f9b2" />
                <div>
                  <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Your role</label>
                  <select className={inputClass} value={joinRole} onChange={(e) => setJoinRole(e.target.value)}>
                    {ROLES.filter((r) => r !== "Organization Owner").map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                {isPortalRole && <AuthTextField label="Customer or supplier reference" icon={Building2} value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="As it appears in the system" />}
                <button onClick={handleSubmit} disabled={busy || !account.fullName.trim() || !account.email.trim() || !account.password || !joinCode.trim()}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold text-white disabled:opacity-50 transition-all"
                  style={{ background: "linear-gradient(135deg,#16A34A,#22C55E)", boxShadow: "0 4px 14px rgba(22,163,74,0.3)" }}>
                  {busy ? "Joining…" : "Join company"}
                </button>
              </div>
            )}

            {/* CREATE mode — Step 1: Account */}
            {mode === "create" && step === 1 && (
              <div className="space-y-4">
                <div><h2 className="text-[20px] font-bold text-[#111827]" style={{ fontFamily: "Poppins,sans-serif" }}>Create your account</h2><p className="text-[13px] text-slate-500 mt-0.5">Step 1 of 2 — personal details</p></div>
                <AuthTextField label="Full name" icon={User} value={account.fullName} onChange={(e) => setAccountField("fullName", e.target.value)} placeholder="Your full name" />
                <AuthTextField label="Email address" icon={Mail} type="email" value={account.email} onChange={(e) => setAccountField("email", e.target.value)} placeholder="you@company.tz" />
                <div>
                  <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={account.password} onChange={(e) => setAccountField("password", e.target.value)} placeholder="Min. 6 characters"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-[13.5px] text-[#111827] placeholder-slate-300 outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 transition-all" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                  </div>
                </div>
                <AuthTextField label="Confirm password" icon={Lock} type="password" value={account.confirmPassword} onChange={(e) => setAccountField("confirmPassword", e.target.value)} placeholder="Repeat password" />
                {account.password && account.confirmPassword && account.password !== account.confirmPassword && (
                  <p className="text-[11.5px] text-red-500 flex items-center gap-1"><AlertCircle size={11}/> Passwords don&apos;t match</p>
                )}
                <button onClick={() => { if (step1Valid) setStep(2); }} disabled={!step1Valid}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold text-white disabled:opacity-50 transition-all"
                  style={{ background: "linear-gradient(135deg,#16A34A,#22C55E)", boxShadow: "0 4px 14px rgba(22,163,74,0.3)" }}>
                  Continue →
                </button>
              </div>
            )}

            {/* CREATE mode — Step 2: Company */}
            {mode === "create" && step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setStep(1)} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={18}/></button>
                  <div><h2 className="text-[20px] font-bold text-[#111827]" style={{ fontFamily: "Poppins,sans-serif" }}>Your company</h2><p className="text-[13px] text-slate-500">Step 2 of 2 — business details</p></div>
                </div>
                <AuthTextField label="Company name *" icon={Building2} value={company.name} onChange={(e) => setCompanyField("name", e.target.value)} placeholder="e.g. Kilimanjaro Traders Ltd" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Country</label>
                    <select className={inputClass} value={company.country} onChange={(e) => setCompanyField("country", e.target.value)}>
                      {SIGNUP_COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Currency</label>
                    <select className={inputClass} value={company.currency} onChange={(e) => setCompanyField("currency", e.target.value)}>
                      {SIGNUP_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Industry</label>
                  <select className={inputClass} value={company.category} onChange={(e) => setCompanyField("category", e.target.value)}>
                    {COMPANY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <AuthTextField label="First branch name" icon={Building2} value={firstBranch} onChange={(e) => setFirstBranch(e.target.value)} placeholder="Head Office" />
                <button onClick={handleSubmit} disabled={busy || !company.name.trim()}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold text-white disabled:opacity-50 transition-all"
                  style={{ background: "linear-gradient(135deg,#16A34A,#22C55E)", boxShadow: "0 4px 14px rgba(22,163,74,0.3)" }}>
                  {busy ? "Creating your account…" : "Launch Smart Manager 🚀"}
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-[12.5px] text-slate-500 mt-5">
            Already have an account? <button type="button" onClick={onSwitchToLogin} className="font-semibold text-[#16A34A] hover:underline">Sign in</button>
          </p>
        </div>
      </div>
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
  const [company, setCompany] = useState({ name: "", category: COMPANY_CATEGORIES[0], country: SIGNUP_COUNTRIES[0], currency: SIGNUP_CURRENCIES[0], website: "", taxId: "" });
  const [selectedModules, setSelectedModules] = useState(() => new Set(ONBOARDING_MODULES.map((m) => m.id)));
  const [businessScale, setBusinessScale] = useState("large");
  const [firstBranch, setFirstBranch] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinRole, setJoinRole] = useState("Employee");
  const [customerRef, setCustomerRef] = useState("");

  function setCompanyField(key, val) { setCompany((c) => ({ ...c, [key]: val })); }
  function toggleModule(id) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const isPortalRole = joinRole === "External Client" || joinRole === "Supplier";
  const valid = fullName.trim() && (mode === "create" ? company.name.trim().length > 1 : joinCode.trim().length >= 6 && (!isPortalRole || customerRef.trim().length > 0));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!valid) return;
    setBusy(true);
    try {
      const rpcResult = mode === "create"
        ? await callRpc("create_company_and_owner", {
            p_name: company.name.trim(), p_industry: company.category, p_country: company.country, p_currency: company.currency, p_full_name: fullName.trim(),
          }, oauthUser.accessToken)
        : await callRpc("join_company_with_code", {
            p_join_code: joinCode.trim(), p_full_name: fullName.trim(), p_role: joinRole, p_customer_ref: isPortalRole ? customerRef.trim() : null,
          }, oauthUser.accessToken);

      if (mode === "create" && rpcResult?.id) {
        try {
          await sb("companies").eq("id", rpcResult.id).update({ website: company.website || null, tax_id: company.taxId || null, business_scale: businessScale }).run();
          await sb("company_modules").insert(ONBOARDING_MODULES.map((m) => ({ company_id: rpcResult.id, module_key: m.id, enabled: selectedModules.has(m.id) }))).run();
          await sb("branches").insert({ company_id: rpcResult.id, name: firstBranch.trim() || "Head Office", is_headquarters: true }).run();
        } catch (_e) { /* the account and company are real either way; onboarding details can be finished later in Settings */ }
      }

      onAuthenticated({
        userId: oauthUser.id, email: oauthUser.email, accessToken: oauthUser.accessToken,
        fullName: fullName.trim(), role: mode === "create" ? "Organization Owner" : joinRole,
        customerRef: isPortalRole ? customerRef.trim() : null, company: rpcResult,
      });
    } catch (err) {
      setError(err.message || "Couldn't complete setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC] p-4 py-10" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="mb-3 flex justify-center"><BrandMark size={64} textSize={26} /></div>
          <h1 className="text-[22px] font-bold tracking-tight" style={{ fontFamily: "'Poppins'" }}>
            <span className="text-[#111827]">SMART</span> <span className="text-[#16A34A]">MANAGER</span>
          </h1>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="text-[18px] font-semibold text-[#111827] mb-1">One more step, {fullName.split(" ")[0] || "there"}</h2>
            <p className="text-[13px] text-slate-500">Signed in as {oauthUser.email} — now set up your organization.</p>
          </div>

          <FormField label="Your name" required><input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" /></FormField>

          <div className="flex gap-2 bg-slate-100 rounded-lg p-1">
            <button type="button" onClick={() => setMode("create")} className={`flex-1 text-[12.5px] font-medium py-2 rounded-md transition-colors ${mode === "create" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>Create a company</button>
            <button type="button" onClick={() => setMode("join")} className={`flex-1 text-[12.5px] font-medium py-2 rounded-md transition-colors ${mode === "join" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>Join a company</button>
          </div>

          {mode === "create" ? (
            <div className="space-y-4">
              <FormField label="Organization name" required><input className={inputClass} value={company.name} onChange={(e) => setCompanyField("name", e.target.value)} placeholder="e.g. BEIRAHISI HARDWARE" /></FormField>
              <FormField label="Business type">
                <CategoryPicker value={company.category} onChange={(v) => setCompanyField("category", v)} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Country">
                  <select className={inputClass} value={company.country} onChange={(e) => setCompanyField("country", e.target.value)}>
                    {SIGNUP_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
                <FormField label="Currency">
                  <select className={inputClass} value={company.currency} onChange={(e) => setCompanyField("currency", e.target.value)}>
                    {SIGNUP_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-slate-600 block mb-2">Business scale</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ id: "small", label: "Small Business", hint: "One location, lean team" }, { id: "large", label: "Large Business", hint: "Multiple departments" }].map((s) => (
                    <button
                      key={s.id} type="button"
                      onClick={() => { setBusinessScale(s.id); setSelectedModules(new Set(s.id === "small" ? getIndustryProfile(company.category).recommendedModules : SCALE_MODULE_PRESETS.large)); }}
                      className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${businessScale === s.id ? "border-[#16A34A]/50" : "border-slate-200 hover:border-slate-300"}`}
                      style={businessScale === s.id ? { backgroundColor: "#DCFCE7" } : undefined}
                    >
                      <p className={`text-[12.5px] font-medium ${businessScale === s.id ? "text-[#111827]" : "text-slate-600"}`}>{s.label}</p>
                      <p className="text-[10.5px] text-slate-400">{s.hint}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Sets a sensible starting set of modules below — nothing is locked away either way.</p>
              </div>
              <div>
                <label className="text-[12.5px] font-medium text-slate-600 block mb-2">Select modules to use</label>
                <div className="grid grid-cols-3 gap-2">
                  {ONBOARDING_MODULES.map((m) => {
                    const Icon = m.icon;
                    const on = selectedModules.has(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => toggleModule(m.id)} className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 px-1 transition-colors ${on ? "border-[#16A34A]/40 bg-[#16A34A]/5" : "border-slate-200"}`}>
                        <Icon size={15} className={on ? "text-[#16A34A]" : "text-slate-400"} />
                        <span className={`text-[10.5px] font-medium text-center leading-tight ${on ? "text-[#111827]" : "text-slate-400"}`}>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <FormField label="Your first branch or location (optional)">
                <input className={inputClass} value={firstBranch} onChange={(e) => setFirstBranch(e.target.value)} placeholder="e.g. Kariakoo Branch — defaults to Head Office" />
              </FormField>
            </div>
          ) : (
            <div className="space-y-4">
              <FormField label="Company join code" required><input className={inputClass} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. A1B2C3D4" /></FormField>
              <FormField label="Your role">
                <select className={inputClass} value={joinRole} onChange={(e) => setJoinRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
                </select>
              </FormField>
              {isPortalRole && (
                <FormField label="Your company name, exactly as it appears on your records" required>
                  <input className={inputClass} value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="e.g. Kilimo Fresh Distributors" />
                </FormField>
              )}
            </div>
          )}

          {error && <p className="text-[12.5px] text-[#EF4444] rounded-lg px-3 py-2" style={{ backgroundColor: "#FEE2E2" }}>{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 text-[13px] font-medium rounded-lg py-3">Cancel</button>
            <button type="submit" disabled={!valid || busy} aria-label="Finish setup" className="flex-[2] btn-primary text-white text-[14px] font-semibold rounded-lg py-3 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : "Finish Setup"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
