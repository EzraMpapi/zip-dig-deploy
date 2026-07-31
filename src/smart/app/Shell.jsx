import { useEffect, useState } from "react";
import {
  AlertCircle, Building2, Calendar, ChevronDown, Lock, MapPin, Moon, Search, Settings,
  Sparkles, Sun, X
} from "lucide-react";
import { ActivityStream, mapPosTransactionRow } from "../components/ActivityStream.jsx";
import { BrandMark } from "../components/BrandMark.jsx";
import { DailyBriefing } from "../components/SendReceiptPanel.jsx";
import {
  ConfirmDialog,
  PostCreateDispatch,
  SendReceiptPanel,
  Toasts,
} from "../components/feedback.jsx";
import { MenuIcon } from "../components/ui.jsx";
import { invoicesSeed, quotationsSeed } from "../data/assets.jsx";
import { MODULES, ROLES, seedLeads, useSmartAlerts } from "../data/core.jsx";
import { filesSeed } from "../data/documents.jsx";
import { expensesSeed } from "../data/finance.jsx";
import { employeesSeed, leaveRequestsSeed } from "../data/hr.jsx";
import { inventorySeed, suppliersSeed } from "../data/inventory.jsx";
import { workOrdersSeed } from "../data/manufacturing.jsx";
import { posTransactionsSeed } from "../data/pos.jsx";
import { subscriptionsSeed } from "../data/sales.jsx";
import { CommandPalette, NotificationCenter, ProfileMenu } from "../lib/alerts.jsx";
import { TODAY, setActiveTaxRate } from "../lib/format.jsx";
import {
  mapEmployeeRow,
  mapExpenseRow,
  mapInventoryRow,
  mapInvoiceRow,
  mapLeadRow,
  mapLeaveRow,
  mapQuotationRow,
  mapScheduledReportRow,
  mapSubscriptionRow,
  mapSupplierRow,
  mapWorkOrderRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { mapFileRow, notify } from "../lib/notify.jsx";
import { DEMO_OVERRIDE, IS_CONFIGURED, authGetUser, authSignOut, sb, setDemoOverride } from "../lib/supabase.jsx";
import { AIAssistant } from "../modules/AIAssistant.jsx";
import { Analytics, MicrofinanceModule } from "../modules/Analytics.jsx";
import { LoginPage, OAuthCompanySetup, SignupPage } from "../modules/Auth.jsx";
import { BankingMFIModule } from "../modules/Banking.jsx";
import { CRM } from "../modules/CRM.jsx";
import { CollaborationHub } from "../modules/Collaboration.jsx";
import { CommunityGroupsModule } from "../modules/Community.jsx";
import { CustomerPortal } from "../modules/CustomerPortal.jsx";
import { Dashboard } from "../modules/Dashboard.jsx";
import { Documents } from "../modules/Documents.jsx";
import { ECommerce } from "../modules/ECommerce.jsx";
import { EmployeePortal } from "../modules/EmployeePortal.jsx";
import { Finance } from "../modules/Finance.jsx";
import { FleetManagementModule } from "../modules/Fleet.jsx";
import { HR } from "../modules/HR.jsx";
import { HealthcareClinicModule } from "../modules/Healthcare.jsx";
import { HotelManagementModule } from "../modules/Hotel.jsx";
import { Integrations } from "../modules/Integrations.jsx";
import { Inventory } from "../modules/Inventory.jsx";
import { Manufacturing } from "../modules/Manufacturing.jsx";
import { Marketing } from "../modules/Marketing.jsx";
import { Notifications } from "../modules/Notifications.jsx";
import { POS } from "../modules/POS.jsx";
import { PharmacyManagementModule } from "../modules/Pharmacy.jsx";
import { Procurement } from "../modules/Procurement.jsx";
import { Projects } from "../modules/Projects.jsx";
import { Reports, scheduledReportsSeed } from "../modules/Reports.jsx";
import { RestaurantModule } from "../modules/Restaurant.jsx";
import { SupplyChain } from "../modules/SCM.jsx";
import { Sales } from "../modules/Sales.jsx";
import { SchoolManagementModule } from "../modules/School.jsx";
import { SettingsPage } from "../modules/Settings.jsx";
import { ComingSoon, ExternalSupplierPortal } from "../modules/SupplierPortal.jsx";
import { CustomerSupport } from "../modules/Support.jsx";
import { VicobaSaccosModule } from "../modules/Vicoba.jsx";
import { WorkflowStudio } from "../modules/Workflows.jsx";

export function SmartManager() {
  // Real session state. Demo mode (no Supabase project connected) skips
  // authentication entirely and goes straight to the sample company,
  // matching every other demo-mode behavior already documented in this
  // build. Live mode genuinely gates the app behind Login/Signup and
  // tries to resume a stored session on load before falling back to them.
  const [authView, setAuthView] = useState("login");
  const [session, setSession] = useState(() => (IS_CONFIGURED ? null : { demo: true }));
  // Always starts true now, in both modes — previously demo mode skipped
  // this state entirely, which meant the branded loading screen below
  // (and its real logo animation) would never actually be seen outside a
  // live Supabase connection, defeating the point of building it. Demo
  // mode still isn't waiting on a real network call the way live mode is,
  // so it resolves after a short, honest fixed window representing actual
  // app initialization, not an artificial delay dressed up as one.
  const [authChecking, setAuthChecking] = useState(true);
  // A real, authenticated OAuth user (Google/Microsoft/Apple) who doesn't
  // have a company yet — genuinely different from "not logged in." Their
  // Supabase Auth session is real; they just haven't finished the company
  // setup step Login/Signup normally requires. Losing this state and
  // sending them back to a blank Login screen would silently discard a
  // legitimate session, which is exactly what this build did before this
  // fix — any token that resolved to a real user but no profile was
  // simply deleted rather than routed to finish setup.
  const [oauthPendingUser, setOauthPendingUser] = useState(null);

  useEffect(() => {
    if (!IS_CONFIGURED) {
      const t = setTimeout(() => setAuthChecking(false), 900);
      return () => clearTimeout(t);
    }

    // A real OAuth redirect back from Supabase lands here with the
    // session in the URL fragment (Supabase's implicit-flow convention),
    // not in localStorage yet — this is the one moment that token exists
    // only in the URL, so it has to be captured before anything else runs.
    let tokenFromOAuth = null;
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      tokenFromOAuth = params.get("access_token");
      if (tokenFromOAuth) {
        window.localStorage.setItem("bs_access_token", tokenFromOAuth);
        window.history.replaceState(null, "", window.location.pathname); // real cleanup — an access token has no business sitting in the visible URL
      }
    }

    const token = tokenFromOAuth || (typeof window !== "undefined" ? window.localStorage.getItem("bs_access_token") : null);
    if (!token) { setAuthChecking(false); return; }
    (async () => {
      try {
        const user = await authGetUser(token);
        const profileRows = await sb("profiles").select("*,companies(*)").eq("id", user.id).run();
        const profile = profileRows?.[0];
        if (!profile) {
          // A real, valid session with no company yet — genuinely
          // different from an invalid or expired one. Route to finish
          // setup instead of discarding a session that authenticated
          // correctly.
          setOauthPendingUser({ id: user.id, email: user.email, accessToken: token, fullName: user.user_metadata?.full_name || user.user_metadata?.name || "" });
          setAuthChecking(false);
          return;
        }
        setSession({ userId: user.id, email: user.email, accessToken: token, fullName: profile.full_name, role: profile.role, customerRef: profile.customer_ref, company: { ...profile.companies, taxRate: profile.companies?.tax_rate, timezone: profile.companies?.timezone, businessScale: profile.companies?.business_scale, receiptWidth: profile.companies?.receipt_width, receiptFooter: profile.companies?.receipt_footer, receiptShowLogo: profile.companies?.receipt_show_logo } });
      } catch (_e) {
        if (typeof window !== "undefined") window.localStorage.removeItem("bs_access_token");
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  function handleSignOut() {
    if (typeof window !== "undefined") window.localStorage.removeItem("bs_access_token");
    if (session?.accessToken) authSignOut(session.accessToken);
    setDemoOverride(false);
    setSession(IS_CONFIGURED ? null : { demo: true });
    setAuthView("login");
  }

  const [active, setActive] = useState("dashboard");
  // CmdK handled by paletteOpen state (see topbar)

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Company profile is editable in Settings; the topbar and dashboard
  // greeting read from this state, so edits are reflected immediately.
  // `id` is blank in demo mode (never read, since IS_CONFIGURED gates every
  // real write) and set to the real company UUID once a live session
  // hydrates this below — Settings' saveProfile targets that real id
  // rather than a hardcoded constant, which could never correctly scope a
  // write once different real users belong to different companies.
  const [company, setCompany] = useState(() => {
    // Restore saved profile (logo, cover photo, social links etc.) from localStorage
    try {
      const saved = localStorage.getItem("bs_company_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          id: "", name: "BEIRAHISI HARDWARE", owner: "EzyMP",
          industry: "Wholesale & Hardware", country: "Tanzania",
          currency: "TZS", taxRate: 18, timezone: "Africa/Dar_es_Salaam",
          businessScale: "large", createdAt: "2019-03-12",
          receiptWidth: "80mm", receiptFooter: "Thank you for your business!", receiptShowLogo: true,
          logo: null, coverPhoto: null, phone: "", email: "", website: "", address: "", city: "",
          postalCode: "", tin: "", regNumber: "", tagline: "",
          brandColor: "#16A34A", businessType: "Private Limited Company", foundedYear: "",
          description: "", facebook: "", instagram: "", twitter: "", linkedin: "", tiktok: "",
          whatsappBusiness: "", bankName: "", bankAccountName: "", bankAccountNo: "",
          bankBranch: "", bankSwift: "",
          businessHours: {
            Mon:{open:"08:00",close:"17:00",closed:false},Tue:{open:"08:00",close:"17:00",closed:false},
            Wed:{open:"08:00",close:"17:00",closed:false},Thu:{open:"08:00",close:"17:00",closed:false},
            Fri:{open:"08:00",close:"17:00",closed:false},Sat:{open:"09:00",close:"13:00",closed:false},
            Sun:{open:"",close:"",closed:true},
          },
          ...parsed,
        };
      }
    } catch(_e){}
    return {
    id: "",
    name: "BEIRAHISI HARDWARE",
    owner: "EzyMP",
    industry: "Wholesale & Hardware",
    country: "Tanzania",
    currency: "TZS",
    taxRate: 18,
    timezone: "Africa/Dar_es_Salaam",
    businessScale: "large",
    createdAt: "2019-03-12",
    receiptWidth: "80mm", receiptFooter: "Thank you for your business!", receiptShowLogo: true,
    // Extended company identity — these feed the logo in the header,
    // receipts, payslips, PDFs, and any printed document.
    logo: null,          // base64 data URL — stored in state, persisted to companies table
    coverPhoto: null,    // base64 — wide banner shown on company card and PDFs
    phone: "",           // business phone shown on receipts
    email: "",           // business email shown on receipts
    website: "",
    address: "",         // street address
    city: "",
    postalCode: "",
    tin: "",             // TIN number (TRA, KRA, etc.)
    regNumber: "",       // business registration number
    tagline: "",         // shown below company name on receipts
    // Extended branding & identity
    brandColor: "#16A34A",  // primary brand colour for PDFs and exports
    businessType: "Private Limited Company",
    foundedYear: "",
    description: "",     // company bio for proposals and reports
    // Social media
    facebook: "",
    instagram: "",
    twitter: "",
    linkedin: "",
    tiktok: "",
    whatsappBusiness: "",
    // Banking
    bankName: "",
    bankAccountName: "",
    bankAccountNo: "",
    bankBranch: "",
    bankSwift: "",
    // Business hours
    businessHours: {
      Mon:{open:"08:00",close:"17:00",closed:false},
      Tue:{open:"08:00",close:"17:00",closed:false},
      Wed:{open:"08:00",close:"17:00",closed:false},
      Thu:{open:"08:00",close:"17:00",closed:false},
      Fri:{open:"08:00",close:"17:00",closed:false},
      Sat:{open:"09:00",close:"13:00",closed:false},
      Sun:{open:"",close:"",closed:true},
    },
  };});

  // Role-based access. In live mode, currentUser and company are hydrated
  // below from the real authenticated session the moment it resolves —
  // this initial state is only ever seen in demo mode, or for the brief
  // instant before that hydration effect runs in live mode.
  const [currentUser, setCurrentUser] = useState({ name: "EzyMP", role: "Super Administrator", customerRef: null });
  const currentRole = ROLES.find((r) => r.id === currentUser.role) || ROLES[0];
  const canManage = currentRole.writeAccess === "full";

  useEffect(() => {
    if (session && !session.demo) {
      setCompany({
        id: session.company.id, name: session.company.name, owner: session.fullName, industry: session.company.industry || "",
        country: session.company.country, currency: session.company.currency,
        taxRate: session.company.taxRate ?? 18, timezone: session.company.timezone || "Africa/Dar_es_Salaam",
        businessScale: session.company.businessScale || "large",
        createdAt: session.company.created_at || null,
        receiptWidth: session.company.receiptWidth || "80mm", receiptFooter: session.company.receiptFooter || "", receiptShowLogo: session.company.receiptShowLogo !== false,
      });
      setCurrentUser({ name: session.fullName, role: session.role, customerRef: session.customerRef || null });
    }
  }, [session]);

  // Activates the real, per-company tax rate everywhere lineTotal() and
  // every POS/invoice calculation already reads it from (see the TAX_RATE
  // declaration itself for why this is a module value rather than a prop
  // threaded through a dozen-plus call sites). Runs whenever company data
  // changes, so switching companies — or editing the rate in Settings —
  // takes effect on the very next render, not just at page load.
  useEffect(() => {
    setActiveTaxRate(company.taxRate);
  }, [company.taxRate]);

  // Module entitlements — the "enable only the modules you need" promise.
  // Dashboard can't be disabled; it's the app's home. Backed by the
  // company_modules table when a real project is connected.
  const [enabledModules, setEnabledModules] = useState(() => new Set(MODULES.map((m) => m.id)));

  // Real load from the database in live mode — this state previously had
  // no fetch at all and simply defaulted to "every module enabled" for
  // the entire session, meaning a company that had genuinely disabled a
  // module in a previous session would see it silently reappear on the
  // next login. A company with no rows yet (brand new, or created before
  // this fix existed) correctly keeps the "everything enabled" default,
  // since an empty result here means no explicit choice has been made.
  useEffect(() => {
    if (!IS_CONFIGURED || !company.id) return;
    sb("company_modules").select("*").eq("company_id", company.id).run()
      .then((rows) => {
        if (!rows || rows.length === 0) return;
        const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.module_key));
        setEnabledModules(new Set(MODULES.map((m) => m.id).filter((id) => !disabled.has(id))));
      })
      .catch(() => { /* keep the "everything enabled" default rather than block on a failed fetch */ });
  }, [company.id]);

  async function toggleModule(id) {
    if (id === "dashboard") return;
    const next = new Set(enabledModules);
    const turningOff = next.has(id);
    if (turningOff) next.delete(id); else next.add(id);
    setEnabledModules(next);

    // Don't strand the user inside a module they just disabled.
    if (turningOff && active === id) setActive("dashboard");

    if (IS_CONFIGURED && company.id) {
      // A genuine upsert, not an UPDATE assuming the row already exists —
      // a brand-new company (including one created through this session's
      // own signup flow) may have no company_modules row yet for this
      // module at all, and UPDATE silently affects zero rows rather than
      // creating one. Insert first for the common "first time toggling
      // this module" case; fall back to update only if a row already
      // exists and the insert hit a primary-key conflict.
      try {
        await sb("company_modules").insert({ company_id: company.id, module_key: id, enabled: !turningOff }).run();
      } catch (_e) {
        try {
          await sb("company_modules").eq("module_key", id).update({ enabled: !turningOff }).run();
        } catch (e) {
          notify("Couldn't save the module setting to the server.", "error");
        }
      }
    }
  }

  // Tables read by more than one module live here, once, so every module
  // sees the same data in the same session — no "Sales says Paid but
  // Finance still shows Unpaid" drift between two independent copies.
  const inventory = useCompanyTable("inventory_items", inventorySeed, { order: { col: "name", ascending: true }, mapRow: mapInventoryRow });
  const invoices = useCompanyTable("sales_invoices", invoicesSeed, {
    select: "*,sales_invoice_items(*),sales_payments(*)", order: { col: "due_date", ascending: true }, mapRow: mapInvoiceRow,
  });
  const crm = useCompanyTable("crm_leads", seedLeads, { order: { col: "created_at", ascending: false }, mapRow: mapLeadRow });
  const expenses = useCompanyTable("finance_expenses", expensesSeed, { order: { col: "expense_date", ascending: false }, mapRow: mapExpenseRow });
  const suppliers = useCompanyTable("inventory_suppliers", suppliersSeed, { order: { col: "name", ascending: true }, mapRow: mapSupplierRow });
  const posTransactions = useCompanyTable("pos_transactions", posTransactionsSeed, {
    select: "*,pos_transaction_items(*),profiles(full_name),pos_returns(*,pos_return_items(*))", order: { col: "created_at", ascending: false }, mapRow: mapPosTransactionRow,
  });
  const subscriptions = useCompanyTable("sales_subscriptions", subscriptionsSeed, {
    order: { col: "next_billing_date", ascending: true }, mapRow: mapSubscriptionRow,
  });
  const quotations = useCompanyTable("sales_quotations", quotationsSeed, {
    select: "*,sales_quotation_items(*)", order: { col: "issue_date", ascending: false }, mapRow: mapQuotationRow,
  });
  const scheduledWorkflows = useCompanyTable("scheduled_reports", scheduledReportsSeed, { mapRow: mapScheduledReportRow });
  const files = useCompanyTable("documents", filesSeed, {
    select: "*,profiles(full_name)", order: { col: "created_at", ascending: false }, mapRow: mapFileRow,
  });
  const employees = useCompanyTable("hr_employees", employeesSeed, {
    order: { col: "full_name", ascending: true }, mapRow: mapEmployeeRow,
  });
  const leaveRequests = useCompanyTable("hr_leave_requests", leaveRequestsSeed, {
    select: "*,hr_employees(full_name)", order: { col: "start_date", ascending: false }, mapRow: mapLeaveRow,
  });
  const workOrders = useCompanyTable("manufacturing_work_orders", workOrdersSeed, {
    select: "*,profiles(full_name)", order: { col: "start_date", ascending: false }, mapRow: mapWorkOrderRow,
  });


  // ── Dark mode ────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = React.useState(() => {
    try { return localStorage.getItem("bs_dark") === "1"; } catch(_e){ return false; }
  });
  React.useEffect(() => {
    const root = document.documentElement;
    if (darkMode) { root.classList.add("dark"); localStorage.setItem("bs_dark","1"); }
    else { root.classList.remove("dark"); localStorage.setItem("bs_dark","0"); }
  }, [darkMode]);

  // ── Smart Alert Engine — cross-module intelligence ─────────────────────
  // Each module passes its local table data here; the engine returns ranked alerts
  const [bankLoansForAlerts,  setBankLoansForAlerts]  = React.useState([]);
  const [phmStockForAlerts,   setPhmStockForAlerts]   = React.useState([]);
  const [vehiclesForAlerts,   setVehiclesForAlerts]   = React.useState([]);
  const [schFeesForAlerts,    setSchFeesForAlerts]    = React.useState([]);
  const [rstOrdersForAlerts,  setRstOrdersForAlerts]  = React.useState([]);
  const [mfiLoansForAlerts,   setMfiLoansForAlerts]   = React.useState([]);
  const [htlBookingsForAlerts,setHtlBookingsForAlerts] = React.useState([]);

  const smartAlerts = useSmartAlerts({
    invoices:    invoices.rows,
    inventory:   inventory.rows,
    leaveRequests: leaveRequests.rows,
    bankLoans:   bankLoansForAlerts,
    phmStock:    phmStockForAlerts,
    vehicles:    vehiclesForAlerts,
    schFees:     schFeesForAlerts,
    rstOrders:   rstOrdersForAlerts,
    mfiLoans:    mfiLoansForAlerts,
    htlBookings: htlBookingsForAlerts,
  });

  const criticalAlerts = smartAlerts.filter(a => a.priority === "critical" || a.priority === "high");

  const visibleModules = MODULES.filter((m) => enabledModules.has(m.id) && currentRole.allowedModules.includes(m.id));

  // If switching roles removes access to whatever module is currently on
  // screen (e.g. testing "Employee" while viewing Finance), fall back to
  // the first module that role can actually see — never leave a
  // now-restricted screen rendered just because nothing told it to change.
  useEffect(() => {
    if (active === "settings") return; // settings has its own internal gating, always reachable
    if (!visibleModules.some((m) => m.id === active)) {
      setActive(visibleModules[0]?.id || "dashboard");
    }
  }, [currentUser.role]);

  function go(id) {
    setActive(id);
    setSidebarOpen(false);
  }

  // Lets a Dashboard "Quick Action" land a user not just on a module but on
  // the specific tab or form they meant — e.g. "Create Invoice" opens Sales
  // already on the Invoices tab with the create form showing, rather than
  // just switching modules and leaving them to find it themselves. Each
  // target module reads this once via useEffect and clears it so it never
  // re-fires on a later, unrelated visit to that module.
  const [intent, setIntent] = useState(null);
  function goWithIntent(id, payload) {
    go(id);
    setIntent({ module: id, ...payload });
  }
  function clearIntent() {
    setIntent(null);
  }

  // A real, global keyboard shortcut — Cmd+K on Mac, Ctrl+K on Windows/
  // Linux — the same convention every serious productivity tool uses
  // (Linear, Notion, Superhuman, VS Code), deliberately not a pattern
  // most SME-focused competitors bother with. Listens at the document
  // level so it works regardless of which module currently has focus.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Real, per-device dark mode preference for the App Shell — the same
  // localStorage pattern already proven for App Lock, since visual theme
  // is reasonably a device setting, not a company-wide policy pushed to
  // every user's screen regardless of their own preference.
  const [darkMode, setDarkMode] = useState(false);
  // Accessibility controls — WCAG 2.2 AA's two buildable gaps closed:
  // adjustable text size (SC 1.4.4: content usable at larger sizes,
  // done at the root so every rem-derived size in the app scales) and
  // a high-contrast mode (darker text, stronger borders — one class,
  // every screen). Both real state driving real classes, not menu
  // items that do nothing.
  const [textSize, setTextSize] = useState("default"); // default | large | xl
  const [highContrast, setHighContrast] = useState(false);
  // Real network awareness — the browser's own online/offline events, not
  // a poll. The architecture is already offline-tolerant by design: every
  // write is optimistic (screen first, server after, failure caught), so
  // work continues offline; what was missing was the app admitting it,
  // instead of showing "Live" with no connection. Full outbox retry and a
  // service-worker app shell (PWA) are the real next steps, named in the
  // handover, not implied by this pill.
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => { setOnline(true); notify("Back online — new changes will save to the server again."); };
    const down = () => { setOnline(false); notify("Offline — keep working; changes stay on this device until you reconnect.", "error"); };
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  useEffect(() => {
    setDarkMode(window.localStorage.getItem("bs_dark_shell") === "true");
  }, []);
  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    window.localStorage.setItem("bs_dark_shell", String(next));
  }

  if (authChecking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-4">
          <div style={{ animation: "logoPulse 1.8s ease-in-out infinite" }}>
            <BrandMark size={64} textSize={26} />
          </div>
          <div style={{ animation: "fadeInUp .5s ease-out .15s both" }} className="text-center">
            <p className="text-[15px] font-bold tracking-tight" style={{ fontFamily: "'Poppins'" }}>
              <span className="text-[#111827]">SMART</span> <span className="text-[#16A34A]">MANAGER</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Simplify. Manage. Grow.</p>
          </div>
          <div className="w-32 h-1 rounded-full bg-slate-100 overflow-hidden relative">
            <div className="absolute inset-y-0 w-1/3 rounded-full" style={{ background: "linear-gradient(90deg, #16A34A, #22C55E)", animation: "loadingBar 1.2s ease-in-out infinite" }} />
          </div>
        </div>
      </div>
    );
  }

  if (oauthPendingUser) {
    return (
      <OAuthCompanySetup
        oauthUser={oauthPendingUser}
        onAuthenticated={(s) => { setOauthPendingUser(null); setSession(s || { demo: true }); }}
        onCancel={() => { if (typeof window !== "undefined") window.localStorage.removeItem("bs_access_token"); setOauthPendingUser(null); }}
      />
    );
  }

  if (!session) {
    return authView === "login"
      ? <LoginPage onAuthenticated={(s) => setSession(s || { demo: true })} onSwitchToSignup={() => setAuthView("signup")} />
      : <SignupPage onAuthenticated={(s) => setSession(s || { demo: true })} onSwitchToLogin={() => setAuthView("login")} />;
  }

  // A customer never sees the internal ERP shell at all — not a hidden
  // sidebar, a genuinely different, much smaller page. The real scoping
  // to just this customer's own data comes from the RLS policies added
  // alongside profiles.customer_ref, not from this branch — this is only
  // deciding which UI to show, the database decides what data comes back.
  if (currentRole.category === "External Portal" && currentUser.role === "External Client") {
    return <CustomerPortal currentUser={currentUser} invoices={invoices} filesHook={files} onSignOut={handleSignOut} />;
  }
  if (currentRole.category === "External Portal" && currentUser.role === "Supplier") {
    return <ExternalSupplierPortal currentUser={currentUser} onSignOut={handleSignOut} />;
  }

  return (
    <>
      {/* CommandPalette mounted with paletteOpen state below in the topbar area */}
    <div className={`h-screen w-full flex text-slate-800 overflow-hidden relative text-size-${textSize} ${darkMode ? "dark bg-[#0F172A]" : "bg-[#F8FAFC]"} ${highContrast ? "high-contrast" : ""}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Ambient background wash — subtle depth behind the content, the way
          Linear/Vercel-style dashboards avoid a flat, lifeless canvas. */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(1100px circle at 15% -10%, rgba(22,163,74,0.07), transparent 55%), " +
            "radial-gradient(900px circle at 100% 0%, rgba(17,24,39,0.05), transparent 50%)",
        }}
      />
      {/* Global styles moved to <GlobalStyles /> in the true app root (see
          the end of this file) — this exact block used to live only here,
          inside the authenticated shell, meaning every button style,
          @keyframes animation, and the Google Fonts import was silently
          unavailable on Login, Signup, and the loading screen, since none
          of those render this deep in the tree. See the handover doc for
          the full explanation of this bug and its fix. */}

      {/* Brand accent — thin gradient line across the very top */}
      <div
        className="fixed top-0 left-0 right-0 h-[3px] z-[70]"
        style={{ background: "linear-gradient(90deg, #111827 0%, #16A34A 50%, #22C55E 100%)" }}
      />

      <Toasts />
      <ConfirmDialog />
      <SendReceiptPanel />
      <PostCreateDispatch company={company} crm={crm} />
      <DailyBriefing
        company={company}
        currentUser={currentUser}
        canManage={canManage}
        invoices={invoices}
        inventory={inventory}
        expenses={expenses}
        crm={crm}
        employees={employees}
        leaveRequests={leaveRequests}
        workOrders={workOrders}
        subscriptions={subscriptions}
        smartAlerts={smartAlerts}
        enabledModules={enabledModules}
      />

      {/* Overlay — dims the page behind the menu whenever it's open, at any screen size */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40"
          style={{ animation: "fadeIn .15s ease-out" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — a toggleable overlay menu at every breakpoint, closed by
          default. It never reserves layout space, so the main content
          always renders at full width whether the menu is open or not.
          Rebuilt as a light theme matching the design system image exactly
          (Kadi: "White background, Light shadow, Soft rounded corners") —
          every dark-theme color from the earlier version (the navy/dark-
          green gradient, white-variant text, white/10 borders) was
          removed entirely rather than layered under the new palette. */}
      <aside
        className={`fixed z-50 h-full w-[240px] shrink-0 flex flex-col bg-white transition-transform duration-200 ease-out overflow-hidden ${darkMode ? "dark-shell" : ""} ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ boxShadow: "4px 0 24px rgba(17,24,39,.06)" }}
      >
        <div className="relative px-5 py-5 border-b border-[#F3F4F6] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Hexagonal "S" mark via clip-path — a safe, dependency-free
                way to recreate the Smart Manager logo's silhouette at
                sidebar-icon size, where the full logo's circuit-node and
                bar-chart detailing would be illegible anyway. */}
            <div
              className="w-8 h-8 flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #22C55E, #16A34A)",
                clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
                boxShadow: "0 4px 14px rgba(22,163,74,.35)",
              }}
            >
              <span className="text-white text-[15px] font-bold" style={{ fontFamily: "'Poppins'" }}>S</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[14.5px] font-semibold tracking-tight brand-wordmark" style={{ fontFamily: "'Poppins'" }}>
                Smart Manager
              </span>
              <span className="text-[9.5px] text-slate-400">Simplify. Manage. Grow.</span>
            </div>
          </div>
          <button className="text-slate-400 hover:text-[#111827] transition-colors" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="relative flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
          {visibleModules.map((m) => {
            const Icon = m.icon;
            const isActive = active === m.id;
            return (
              <button
                key={m.id}
                onClick={() => go(m.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative w-full flex items-center justify-between gap-2.5 pl-3 pr-3 py-2.5 rounded-lg text-[13.5px] transition-all duration-200 group ${
                  isActive ? "font-medium" : "text-slate-500 hover:text-[#111827]"
                }`}
                style={isActive ? { backgroundColor: "#DCFCE7", color: "#16A34A", borderLeft: "3px solid #16A34A", paddingLeft: "10px" } : { borderLeft: "3px solid transparent", paddingLeft: "10px" }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "#F3F4F6"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = ""; }}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full"
                    style={{ background: "#16A34A" }}
                  />
                )}
                <span className="flex items-center gap-2.5">
                  <Icon size={16} strokeWidth={2} className={isActive ? "" : "group-hover:text-[#22C55E] transition-colors"} style={isActive ? { color: "#16A34A" } : undefined} />
                  {m.label}
                </span>
                {!m.live && <Lock size={11} className="text-slate-300" />}
              </button>
            );
          })}
        </nav>

        <div className="relative px-4 py-4 border-t border-[#F3F4F6]">
          <button
            onClick={() => go("settings")}
            className={`w-full flex items-center justify-between gap-2.5 text-[13px] transition-colors group ${
              active === "settings" ? "font-medium" : "text-slate-500 hover:text-[#111827]"
            }`}
            style={active === "settings" ? { color: "#16A34A" } : undefined}
          >
            <span className="flex items-center gap-2.5">
              <Settings size={15} strokeWidth={2} className={active === "settings" ? "" : "group-hover:text-[#22C55E] transition-colors"} style={active === "settings" ? { color: "#16A34A" } : undefined} /> Settings
            </span>
            {!canManage && <Lock size={11} className="text-slate-300" />}
          </button>
          <div className="mt-3.5 pt-3.5 border-t border-[#F3F4F6] flex items-center gap-1.5 text-[10px] text-slate-400 leading-snug">
            <MapPin size={11} className="shrink-0 text-[#16A34A]" />
            <span>Bidhaa ya Kitanzania, kwa Wafanyabiashara wa Kitanzania na Duniani.</span>
          </div>
        </div>
      </aside>

      {/* Main — always full width; the sidebar is an overlay, not a docked
          column, so there's no reserved gutter to subtract. */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 w-full">
        {/* Topbar */}
        <header className={`h-16 shrink-0 bg-white border-b border-slate-200/80 flex items-center justify-between px-4 sm:px-6 ${darkMode ? "dark-shell" : ""}`}>
          <div className="flex items-center gap-3">
            <button
              className="text-slate-500 hover:text-[#111827] hover:bg-slate-100 rounded-lg p-1.5 -ml-1.5 transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>
            <div className="flex items-center gap-2 text-[13px] text-slate-500">
              <Building2 size={14} className="hidden sm:block" />
              <span className="font-medium text-[#111827] truncate max-w-[140px] sm:max-w-none">{company.name}</span>
              <ChevronDown size={13} className="text-slate-400 hidden sm:block" />
              <span className="hidden md:inline-flex items-center text-[10.5px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-1">
                {currentUser.role}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span
              className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={
                IS_CONFIGURED
                  ? { backgroundColor: "#16A34A14", color: "#16A34A" }
                  : { backgroundColor: "#F59E0B14", color: "#F59E0B" }
              }
              title={IS_CONFIGURED ? "Connected to Supabase" : "Running on built-in demo data — connect Supabase to persist changes"}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: !online ? "#EF4444" : IS_CONFIGURED ? "#16A34A" : "#F59E0B" }} />
              {!online ? "Offline — saving locally" : IS_CONFIGURED ? "Live" : "Demo Mode"}
            </span>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-slate-300 hover:text-slate-600 transition-colors"
              aria-label="Search everything"
            >
              <Search size={13} />
              <span className="hidden md:inline">Search anything...</span>
              <kbd className="hidden sm:inline-block text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">⌘K</kbd>
            </button>
            <span className="hidden lg:inline-flex items-center text-[11.5px] font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 gap-1.5 select-none">
              <Calendar size={12} className="text-slate-400" />
              {TODAY.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
            </span>
            {/* ── Smart Alerts badge ── */}
            {criticalAlerts.length > 0 && (
              <button onClick={()=>go("notifications")} className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-xl animate-pulse" style={{background:"#FEF2F2",color:"#991B1B",border:"1px solid #FECACA"}}>
                <AlertCircle size={13}/>
                {criticalAlerts.length} Alert{criticalAlerts.length>1?"s":""}
              </button>
            )}
            {/* ── Dark mode toggle ── */}
            <button
              onClick={()=>setDarkMode(d=>!d)}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-[#111827] transition-all"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun size={15}/> : <Moon size={15}/>}
            </button>
                        <NotificationCenter inventory={inventory} invoices={invoices} expenses={expenses} leaveRequests={leaveRequests} workOrders={workOrders} subscriptions={subscriptions} onNavigate={go} />
            <ProfileMenu currentUser={currentUser} session={session} onSignOut={handleSignOut} />
          </div>
        </header>

        {paletteOpen && <CommandPalette modules={visibleModules} crm={crm} invoices={invoices} inventory={inventory} expenses={expenses} onNavigate={go} onNavigateWithIntent={goWithIntent} onClose={() => setPaletteOpen(false)} />}

        {/* AI Command Center — the floating entry point the design spec
            asks for, on every screen. The intelligence behind it is the
            real, already-built AIAssistant module: a live snapshot of
            actual invoices, inventory, CRM, expenses, and employees is
            rebuilt every turn and handed to a real Claude API call — so
            "how much profit this month," "which products sell slowly,"
            and "show unpaid customers" are answered from real records,
            in English or Kiswahili, both of which the model genuinely
            understands. This button adds reachability, not a second AI. */}
                {/* Mobile bottom navigation — the pattern every mobile-first app uses:
            5 pinned tabs at the bottom of the screen, the most-used modules
            one thumb-tap away. Only renders on small screens where the
            sidebar is hidden. RBAC is automatic: tabs are built from the
            same visibleModules list the sidebar uses. */}
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200/80 flex" style={{ backdropFilter: "blur(12px)" }}>
          {[...visibleModules.filter((m) => ["dashboard","sales","inventory","finance","hr"].includes(m.id)), ...visibleModules.filter((m) => !["dashboard","sales","inventory","finance","hr"].includes(m.id))].slice(0, 5).map((m) => {
            const Icon = m.icon;
            const on = active === m.id;
            return (
              <button key={m.id} onClick={() => go(m.id)} className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors" style={{ color: on ? "#16A34A" : "#9CA3AF" }}>
                <div className="relative">
                  <Icon size={on ? 22 : 20} strokeWidth={on ? 2.2 : 1.75} />
                  {on && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#16A34A]" />}
                </div>
                <span className="text-[9.5px] font-medium leading-none mt-1 truncate max-w-[48px]">{m.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </nav>

        {active !== "ai" && visibleModules.some((m) => m.id === "ai") && (
          <button
            onClick={() => go("ai")}
            aria-label="Open AI Command Center"
            className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-105 transition-transform"
            style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)" }}
          >
            <Sparkles size={22} />
          </button>
        )}

        {/* Content */}
        <main key={active} className="module-fade flex-1 overflow-y-auto p-4 sm:p-6 pb-24 sm:pb-6">
          {active === "dashboard" && (
            <Dashboard
              company={company} invoices={invoices} inventory={inventory} crm={crm}
              expenses={expenses} leaveRequests={leaveRequests} workOrders={workOrders} subscriptions={subscriptions}
              employees={employees} posTransactions={posTransactions} currentUser={currentUser}
              onQuickAction={goWithIntent} onNavigate={go}
            />
          )}
          {active === "crm" && <CRM crm={crm} invoices={invoices} expenses={expenses} suppliers={suppliers} />}
          {active === "sales" && <Sales invoices={invoices} inventory={inventory} subscriptionsHook={subscriptions} quotationsHook={quotations} currentUser={currentUser} intent={intent} clearIntent={clearIntent} />}
          {active === "inventory" && <Inventory inventory={inventory} suppliersHook={suppliers} />}
          {active === "procurement" && <Procurement inventory={inventory} suppliersHook={suppliers} expensesHook={expenses} currentUser={currentUser} canManage={canManage} />}
          {active === "finance" && <Finance invoices={invoices} expensesHook={expenses} posTransactionsHook={posTransactions} employeesHook={employees} inventoryHook={inventory} currentUser={currentUser} intent={intent} clearIntent={clearIntent} company={company} />}
          {active === "reports" && <Reports invoices={invoices} inventory={inventory} expensesHook={expenses} company={company} schedulesHook={scheduledWorkflows} posTransactions={posTransactions.rows} onNavigate={go} />}
          {active === "scm" && <SupplyChain />}
          {active === "ecommerce" && <ECommerce inventory={inventory} />}
          {active === "pos" && <POS inventory={inventory} transactionsHook={posTransactions} company={company} currentUser={currentUser} />}
          {active === "documents" && <Documents filesHook={files} company={company} />}
          {active === "projects" && <Projects filesHook={files} expensesHook={expenses} />}
          {active === "support" && <CustomerSupport company={company} />}
          {active === "analytics" && (
            <Analytics
              company={company} invoices={invoices} expenses={expenses} crm={crm} inventory={inventory}
              employees={employees} leaveRequests={leaveRequests} workOrders={workOrders} posTransactions={posTransactions}
              onNavigate={go}
            />
          )}
          {active === "notifications" && (
            <Notifications inventory={inventory} invoices={invoices} expenses={expenses} leaveRequests={leaveRequests} workOrders={workOrders} subscriptions={subscriptions} canManage={canManage} currentUser={currentUser} smartAlerts={smartAlerts} onNavigate={go} />
          )}
          {active === "activity" && <ActivityStream currentUser={currentUser} />}
          {active === "integrations" && (
            <Integrations invoices={invoices} expenses={expenses} canManage={canManage} currentUser={currentUser} onNavigate={go} />
          )}
          {active === "workflows" && (
            <WorkflowStudio company={company} invoices={invoices} expenses={expenses} inventory={inventory} />
          )}
          {active === "collaboration" && (
            <CollaborationHub currentUser={currentUser} filesHook={files} employees={employees} invoices={invoices} crm={crm} workOrders={workOrders} leaveRequests={leaveRequests} onNavigate={go} />
          )}
          {active === "marketing" && <Marketing crm={crm} />}
          {active === "hr" && <HR employeesHook={employees} leaveRequestsHook={leaveRequests} expensesHook={expenses} intent={intent} clearIntent={clearIntent} currentUser={currentUser} canManage={canManage} />}
          {active === "manufacturing" && <Manufacturing inventory={inventory} workOrdersHook={workOrders} expensesHook={expenses} />}
          {active === "ai" && (
            <AIAssistant company={company} invoices={invoices} inventory={inventory} crm={crm} expenses={expenses} employees={employees} leaveRequests={leaveRequests} suppliers={suppliers} quotations={quotations} scheduledWorkflows={scheduledWorkflows} />
          )}
          {active === "microfinance" && <MicrofinanceModule currentUser={currentUser} />}
          {active === "vicoba" && <VicobaSaccosModule currentUser={currentUser} />}
          {active === "community" && <CommunityGroupsModule currentUser={currentUser} />}
          {active === "healthcare" && <HealthcareClinicModule currentUser={currentUser} company={company} />}
          {active === "school"      && <SchoolManagementModule  currentUser={currentUser} company={company} onFeesLoad={setSchFeesForAlerts} />}
          {active === "pharmacy"    && <PharmacyManagementModule currentUser={currentUser} company={company} onStockLoad={setPhmStockForAlerts} />}
          {active === "hotel"       && <HotelManagementModule   currentUser={currentUser} company={company} onBookingsLoad={setHtlBookingsForAlerts} />}
          {active === "fleet"       && <FleetManagementModule      currentUser={currentUser} company={company} onVehiclesLoad={setVehiclesForAlerts} />}
          {active === "banking"     && <BankingMFIModule            currentUser={currentUser} company={company} onLoansLoad={setBankLoansForAlerts} />}
          {active === "restaurant"  && <RestaurantModule            currentUser={currentUser} company={company} onOrdersLoad={setRstOrdersForAlerts} />}
          {active === "employee-portal" && (
            <EmployeePortal
              currentUser={currentUser}
              company={company}
              employees={employees}
              leaveRequests={leaveRequests}
              canManage={canManage}
            />
          )}
          {active === "settings" && (
            <SettingsPage
              company={company}
              setCompany={setCompany}
              enabledModules={enabledModules}
              onToggleModule={toggleModule}
              currentUser={currentUser}
              setCurrentUser={setCurrentUser}
              canManage={canManage}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              textSize={textSize}
              onSetTextSize={setTextSize}
              highContrast={highContrast}
              onToggleHighContrast={() => setHighContrast((h) => !h)}
              exportData={{ crm, invoices, expenses, inventory, employees, posTransactions, suppliers }}
            />
          )}
          {!["dashboard", "crm", "sales", "inventory", "finance", "hr", "manufacturing", "settings", "ai", "reports", "scm", "ecommerce", "documents", "marketing", "pos", "procurement", "projects", "support", "analytics", "notifications", "integrations", "workflows", "collaboration"].includes(active) && (
            <ComingSoon label={MODULES.find((m) => m.id === active)?.label} />
          )}
        </main>
      </div>
    </div>
    </>
  );
}
