/* ══════════════════════════════════════════════════════════════════════════
   WORKSPACE REGISTRY — maps physical tables to the logical modules users
   see in their local workspace ("Company", "Sales", "Inventory", ...).

   One place owns this mapping so every consumer — the storage layer, the
   workspace browser, export/backup, and the sync report — groups data the
   same way. Tables that don't match a prefix land in "Other", which is a
   real, visible folder rather than a silent hole.
   ══════════════════════════════════════════════════════════════════════════ */

export const WORKSPACE_MODULES = [
  {
    id: "company",
    label: "Company",
    prefixes: ["companies", "company_", "profiles", "branches", "audit_log"],
  },
  {
    id: "customers",
    label: "Customers",
    prefixes: ["crm_", "customers", "contacts", "leads", "support_", "tickets"],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    prefixes: ["suppliers", "vendor", "scm_", "procurement_suppliers"],
  },
  { id: "inventory", label: "Inventory", prefixes: ["inventory_", "stock", "warehouse"] },
  {
    id: "products",
    label: "Products",
    prefixes: ["products", "product_", "catalog", "ecommerce_products", "price"],
  },
  {
    id: "sales",
    label: "Sales",
    prefixes: ["sales_", "pos_", "quotes", "invoices", "orders", "ecommerce_"],
  },
  { id: "purchases", label: "Purchases", prefixes: ["procurement_", "purchase", "rfq", "goods_"] },
  {
    id: "accounting",
    label: "Accounting",
    prefixes: [
      "finance_",
      "accounting",
      "ledger",
      "journal",
      "tax",
      "banking_",
      "payments",
      "budget",
    ],
  },
  {
    id: "employees",
    label: "Employees",
    prefixes: [
      "hr_employees",
      "hr_attendance",
      "hr_leave",
      "hr_recruit",
      "hr_candidates",
      "employees",
      "hr_",
    ],
  },
  { id: "payroll", label: "Payroll", prefixes: ["payroll", "hr_payroll", "salaries"] },
  { id: "assets", label: "Assets", prefixes: ["assets", "fleet_", "maintenance", "equipment"] },
  { id: "reports", label: "Reports", prefixes: ["reports", "analytics_", "dashboards", "kpi"] },
  {
    id: "settings",
    label: "Settings",
    prefixes: [
      "settings",
      "integrations",
      "workflows",
      "notifications",
      "notification_",
      "roles",
      "permissions",
    ],
  },
  {
    id: "attachments",
    label: "Attachments",
    prefixes: ["documents", "document_", "files", "attachments", "scans"],
  },
  { id: "other", label: "Other", prefixes: [] },
];

const MODULE_CACHE = new Map();

export function moduleForTable(table) {
  if (!table) return "other";
  const cached = MODULE_CACHE.get(table);
  if (cached) return cached;
  let best = { id: "other", score: 0 };
  for (const mod of WORKSPACE_MODULES) {
    for (const prefix of mod.prefixes) {
      if (table === prefix || table.startsWith(prefix)) {
        // Longest matching prefix wins, so `hr_payroll` resolves to Payroll
        // rather than to the broader Employees `hr_` prefix.
        if (prefix.length > best.score) best = { id: mod.id, score: prefix.length };
      }
    }
  }
  MODULE_CACHE.set(table, best.id);
  return best.id;
}

export function moduleLabel(id) {
  return WORKSPACE_MODULES.find((m) => m.id === id)?.label || "Other";
}

/* Fields whose values are encrypted at rest in the local database. Matching
   is by exact name or suffix, so `api_key`, `stripe_secret`, `id_number` and
   `net_salary` are all covered without enumerating every table's columns. */
const SENSITIVE_EXACT = new Set([
  "password",
  "pin",
  "pin_hash",
  "token",
  "secret",
  "salary",
  "net_salary",
  "gross_salary",
  "tin",
  "nida",
  "id_number",
  "account_number",
  "iban",
  "card_number",
  "cvv",
  "ssn",
]);
const SENSITIVE_SUFFIX = [
  "_password",
  "_pin",
  "_token",
  "_secret",
  "_key",
  "_salary",
  "_tin",
  "_iban",
  "_account_number",
  "_card_number",
  "_id_number",
];

export function isSensitiveField(name) {
  if (typeof name !== "string") return false;
  const key = name.toLowerCase();
  if (SENSITIVE_EXACT.has(key)) return true;
  return SENSITIVE_SUFFIX.some((suffix) => key.endsWith(suffix));
}
