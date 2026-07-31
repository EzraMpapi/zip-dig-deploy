import {
  Bell, Hash, Mail, MessageCircle, MessageSquare, Video
} from "lucide-react";

/* ══════════════ NOTIFICATION SYSTEM ══════════════ */
/* ------------------------------- NOTIFICATION SYSTEM ---------------------------- */

// Two genuinely different categories of channel, and the UI says so
// honestly rather than presenting all six as equally real:
//
// Slack and Microsoft Teams both support "incoming webhooks" — a plain
// URL that accepts a POST request with a JSON payload. That's something a
// browser can do directly with fetch(), no server required, so these two
// are wired for real.
//
// Email, SMS, WhatsApp, and Push all require a trusted server holding a
// secret (an SMTP/API key, a Twilio Account SID + Auth Token, Meta's
// WhatsApp Business API credentials, an FCM/APNs server key). None of
// those can ever be safely embedded in client-side code — the same
// principle already documented for the AI Assistant's API key. Building a
// button that pretends to send an email with no backend would be actively
// dishonest, not just incomplete, so these four are shown as real
// configuration screens with a functional=false flag and an explanation,
// not a fake "Sent!" toast.
export const NOTIFICATION_CHANNELS = [
  {
    id: "slack", name: "Slack", icon: Hash, functional: true,
    fields: [{ key: "webhookUrl", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/..." }],
  },
  {
    id: "teams", name: "Microsoft Teams", icon: Video, functional: true,
    fields: [{ key: "webhookUrl", label: "Incoming Webhook URL", placeholder: "https://yourorg.webhook.office.com/webhookb2/..." }],
  },
  {
    id: "email", name: "Email", icon: Mail, functional: false,
    fields: [{ key: "fromAddress", label: "From address", placeholder: "notifications@yourcompany.tz" }],
    requirement: "Requires a backend email service (SendGrid, Amazon SES, Postmark) — a browser cannot send email directly.",
  },
  {
    id: "sms", name: "SMS", icon: MessageSquare, functional: false,
    fields: [{ key: "fromNumber", label: "Sender number", placeholder: "+255 XXX XXX XXX" }],
    requirement: "Requires an SMS gateway (Twilio, Africa's Talking) with server-held credentials — never safe to embed client-side.",
  },
  {
    id: "whatsapp", name: "WhatsApp", icon: MessageCircle, functional: false,
    fields: [{ key: "businessNumber", label: "WhatsApp Business number", placeholder: "+255 XXX XXX XXX" }],
    requirement: "Requires the WhatsApp Business API via Meta or a provider like Twilio, plus Meta approval — not directly callable from a browser.",
  },
  {
    id: "push", name: "Push Notifications", icon: Bell, functional: false,
    fields: [{ key: "serverKey", label: "Push server key", placeholder: "FCM / APNs server key" }],
    requirement: "Requires a push server holding device tokens and a server key that can never be exposed in frontend code.",
  },
];

// Maps each real alert type already computed by useBusinessAlerts (see the
// Notification Center) to which channels should receive it — reusing the
// exact alert taxonomy already live in the app rather than inventing a
// second one.
export const ALERT_ROUTING_TYPES = [
  { id: "out-of-stock", label: "Out of stock" },
  { id: "low-stock", label: "Low stock" },
  { id: "overdue-invoices", label: "Overdue invoices" },
  { id: "pending-expenses", label: "Expenses awaiting payment" },
  { id: "unusual-expenses", label: "Unusual expenses detected" },
  { id: "pending-leave", label: "Leave requests awaiting approval" },
  { id: "overdue-work-orders", label: "Work orders behind schedule" },
  { id: "subscriptions-due", label: "Subscriptions due for billing" },
];

export const notificationChannelsSeed = NOTIFICATION_CHANNELS.map((c) => ({ id: c.id, enabled: false, webhookUrl: "", fromAddress: "", fromNumber: "", businessNumber: "", serverKey: "" }));

export const notificationRulesSeed = ALERT_ROUTING_TYPES.map((t) => ({ id: t.id, channels: [] }));

export const notificationLogSeed = [];
