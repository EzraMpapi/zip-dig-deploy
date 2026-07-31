import {
  Mail, MessageSquare
} from "lucide-react";

/* ══════════════ MARKETING DATA ══════════════ */
/* -------------------------------- MARKETING DATA --------------------------------- */
export const CAMPAIGN_TYPE_STYLE = {
  Email: { color: "#16A34A", Icon: Mail },
  SMS: { color: "#F59E0B", Icon: MessageSquare },
};

export const CAMPAIGN_STATUS_COLOR = {
  Draft: "#5B6472",
  Scheduled: "#F59E0B",
  Sent: "#16A34A",
};

// Campaigns target a live CRM segment by industry — "sent to" counts are
// computed against real pipeline data, not stored as a stale snapshot.
export const campaignsSeed = [
  { id: "CMP-118", name: "Cold Chain Solutions — June Promo", type: "Email", status: "Sent", segment: "Agriculture", sentDate: "2026-06-20", openRate: 42, clickRate: 11 },
  { id: "CMP-117", name: "Hardware Restock Reminder", type: "SMS", status: "Sent", segment: "Construction", sentDate: "2026-06-15", openRate: 68, clickRate: 9 },
  { id: "CMP-116", name: "New Hospitality Fixtures Launch", type: "Email", status: "Sent", segment: "Hospitality", sentDate: "2026-06-08", openRate: 51, clickRate: 15 },
  { id: "CMP-115", name: "Mid-Year Wholesale Discount", type: "Email", status: "Scheduled", segment: "Wholesale", sentDate: "2026-07-10", openRate: null, clickRate: null },
  { id: "CMP-114", name: "Salon Equipment Flash Sale", type: "SMS", status: "Scheduled", segment: "Retail", sentDate: "2026-07-08", openRate: null, clickRate: null },
  { id: "CMP-113", name: "Q3 Logistics Partner Outreach", type: "Email", status: "Draft", segment: "Logistics", sentDate: null, openRate: null, clickRate: null },
];
