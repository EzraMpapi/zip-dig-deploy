import {
  Briefcase, CreditCard, Globe, Hash, MessageCircle, ShoppingBag, Store, Video, Wallet
} from "lucide-react";

/* ══════════════ ENTERPRISE INTEGRATIONS ══════════════ */
/* --------------------------- ENTERPRISE INTEGRATIONS --------------------------- */

// The same honesty split as the Notification System (see NOTIFICATION_CHANNELS):
// some of these are genuinely achievable from a static frontend, most aren't.
// Microsoft 365 and Google Workspace both require a real OAuth app
// registration with a hosted redirect URI and, for anything beyond basic
// sign-in, a server to hold a refresh token — infrastructure this build
// doesn't have. Stripe and PayPal can't process real payments without a
// server holding a secret key, but both let a business share a hosted
// payment link with no backend at all, which is what "functional" means
// for these two entries — opening a real link the business owner
// configures, not processing a transaction in-app.
export const INTEGRATION_CONNECTIONS = [
  {
    id: "microsoft365", name: "Microsoft 365", icon: Briefcase, functional: false,
    fields: [{ key: "tenantId", label: "Azure AD Tenant ID", placeholder: "contoso.onmicrosoft.com" }, { key: "clientId", label: "App (client) ID", placeholder: "00000000-0000-0000-0000-000000000000" }],
    requirement: "Real sign-in and Outlook/Calendar/OneDrive access need an Azure AD app registration with a hosted redirect URI and a server-side token exchange — not achievable from a static page alone.",
  },
  {
    id: "google-workspace", name: "Google Workspace", icon: Globe, functional: false,
    fields: [{ key: "clientId", label: "OAuth Client ID", placeholder: "xxxxx.apps.googleusercontent.com" }],
    requirement: "Gmail/Calendar/Drive access needs a Google Cloud OAuth client and a registered redirect URI — the identical backend requirement as Microsoft 365.",
  },
  {
    id: "slack", name: "Slack", icon: Hash, functional: true,
    fields: [{ key: "webhookUrl", label: "Slack Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/..." }],
    requirement: "Genuinely real — this is the exact same webhook already dispatching real alerts from Notifications and every Workflow Studio automation (sections 22, 35). Configuring it here or in Notifications is the same connection either way; shown here too so it's discoverable from the integration list a person would actually look for it in first.",
  },
  {
    id: "zoom", name: "Zoom", icon: Video, functional: false,
    fields: [{ key: "apiKey", label: "Server-to-Server OAuth Account ID", placeholder: "xxxxxxxxxxxxxxxxxx" }],
    requirement: "Creating meetings programmatically needs a Zoom Server-to-Server OAuth app and a backend to hold its credentials — the same category of requirement as Microsoft 365. What's genuinely real without one: the Collaboration Hub's Shared Calendar (section 37) has a real meeting-link field — paste in a Zoom link generated the normal way, and the calendar shows a working Join button.",
  },
  {
    id: "whatsapp-business", name: "WhatsApp Business", icon: MessageCircle, functional: true,
    fields: [{ key: "businessNumber", label: "WhatsApp Business number (with country code)", placeholder: "+255700000000" }],
    requirement: "Opens a real wa.me click-to-chat link with your number pre-filled — genuinely functional, no account setup needed beyond having WhatsApp. Automated messaging, message templates, and programmatic sending need Meta's paid WhatsApp Business Platform and a verified business account with server-side API access — a materially different, heavier product than click-to-chat.",
  },
  {
    id: "stripe", name: "Stripe", icon: CreditCard, functional: true,
    fields: [{ key: "paymentLink", label: "Stripe Payment Link URL", placeholder: "https://buy.stripe.com/..." }],
    requirement: "Opens your real Stripe-hosted payment page in a new tab. Processing a card charge inside this app (not just linking out) needs a server holding your Stripe secret key.",
  },
  {
    id: "paypal", name: "PayPal", icon: Wallet, functional: true,
    fields: [{ key: "paypalMeLink", label: "PayPal.me link", placeholder: "https://paypal.me/yourbusiness" }],
    requirement: "Opens your real PayPal.me page in a new tab. A fully embedded checkout needs PayPal's SDK and, for anything beyond the simplest flow, server-side order verification.",
  },
  {
    id: "ecommerce-platforms", name: "E-Commerce Platforms", icon: Store, functional: false,
    fields: [{ key: "storeUrl", label: "Store URL (e.g. Shopify, WooCommerce)", placeholder: "your-store.myshopify.com" }],
    requirement: "Syncing orders and inventory with an external platform needs that platform's own OAuth app and a server to hold its access token — a separate integration per platform, none achievable from a static page. This app's own built-in E-Commerce module (Storefront and Online Orders) is real and already usable without connecting anything external.",
  },
  {
    id: "pos-systems", name: "POS Systems", icon: ShoppingBag, functional: false,
    fields: [{ key: "terminalId", label: "Terminal / Merchant ID", placeholder: "e.g. Square, Clover terminal ID" }],
    requirement: "Connecting external POS hardware (Square, Clover, and similar) needs that vendor's own device SDK and a paired terminal — not something a web page can do without their hardware present. This app's own built-in Point of Sale module is real, working checkout software already, not a connector to someone else's till.",
  },
];

export const MOBILE_MONEY_PROVIDERS = ["M-Pesa", "Airtel Money", "Tigo Pesa", "HaloPesa"];

export const TAX_AUTHORITY_NOTE = "No tax authority in East Africa exposes a generic public API a third-party app can integrate with — filing systems like TRA's require certified, business-specific credentials issued directly to the taxpayer. The real, honest capability here is preparation: the VAT Summary already built in Finance computes exactly the number a filing needs.";

export const signaturesSeed = [];
