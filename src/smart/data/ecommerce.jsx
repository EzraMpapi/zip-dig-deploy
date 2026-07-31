import { inventorySeed } from "../data/inventory.jsx";

/* ══════════════ E-COMMERCE DATA ══════════════ */
/* ------------------------------- E-COMMERCE DATA -------------------------------- */

// Storefront products are built from real Inventory items with a retail
// markup — the storefront and the warehouse describe the same physical
// stock, priced for two different audiences (B2B cost vs. retail price).
export const CATEGORY_GRADIENT = {
  "Hardware & Fixtures": "linear-gradient(135deg, #16A34A 0%, #22C55E 100%)",
  "Construction Materials": "linear-gradient(135deg, #111827 0%, #1F2937 100%)",
  "Electronics": "linear-gradient(135deg, #15803D 0%, #16A34A 100%)",
  "Furniture": "linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)",
  "Storage Equipment": "linear-gradient(135deg, #5B6472 0%, #8593A6 100%)",
  "Workshop Equipment": "linear-gradient(135deg, #111827 0%, #F59E0B 100%)",
};

export const MARKUP = 1.35;

export const storefrontSeed = inventorySeed.map((it, i) => ({
  sku: it.sku,
  name: it.name,
  category: it.category,
  price: Math.round(it.unitCost * MARKUP),
  published: i % 5 !== 4,
  featured: [0, 2, 5].includes(i),
}));


export const ECOM_ORDER_STATUS_COLOR = {
  "Payment Pending": "#F59E0B",
  Processing: "#F59E0B",
  Shipped: "#16A34A",
  Delivered: "#16A34A",
  Cancelled: "#9CA3AF",
};

export const onlineOrdersSeed = [
  { id: "WEB-5521", customer: "Rehema Chuma", email: "rehema.c@gmail.com", items: [{ name: "Salon styling chair", qty: 2, price: 284 }], total: 568, status: "Processing", method: "Mobile Money", date: "2026-07-02" },
  { id: "WEB-5520", customer: "Baraka Mnyika", email: "b.mnyika@outlook.com", items: [{ name: "Warehouse shelving unit", qty: 4, price: 105 }], total: 420, status: "Shipped", method: "Card", date: "2026-07-01" },
  { id: "WEB-5519", customer: "Zainab Ally", email: "zainab.ally@yahoo.com", items: [{ name: "Pharmacy display unit", qty: 1, price: 864 }], total: 864, status: "Delivered", method: "Card", date: "2026-06-29" },
  { id: "WEB-5518", customer: "Omary Kassim", email: "o.kassim@gmail.com", items: [{ name: "Fleet GPS tracking unit", qty: 3, price: 159 }], total: 477, status: "Payment Pending", method: "Mobile Money", date: "2026-06-28" },
  { id: "WEB-5517", customer: "Neema Godwin", email: "neema.godwin@gmail.com", items: [{ name: "Cold storage racking system", qty: 1, price: 3483 }], total: 3483, status: "Delivered", method: "Bank Transfer", date: "2026-06-24" },
  { id: "WEB-5516", customer: "Hassan Iddi", email: "hassan.iddi@gmail.com", items: [{ name: "Backwash basin", qty: 2, price: 378 }], total: 756, status: "Cancelled", method: "Card", date: "2026-06-22" },
];

export const STOREFRONT_TREND = [
  { d: "Mon", orders: 4 }, { d: "Tue", orders: 7 }, { d: "Wed", orders: 5 },
  { d: "Thu", orders: 9 }, { d: "Fri", orders: 11 }, { d: "Sat", orders: 14 }, { d: "Sun", orders: 8 },
];
