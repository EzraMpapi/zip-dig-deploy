/* ══════════════ CUSTOMER SUPPORT DATA ══════════════ */
/* ----------------------------- CUSTOMER SUPPORT DATA ---------------------------- */
export const TICKET_STATUS_COLOR = { Open: "#EF4444", "In Progress": "#F59E0B", Resolved: "#16A34A", Closed: "#9CA3AF" };

export const TICKET_STATUSES = ["Open", "In Progress", "Resolved", "Closed"];

export const TICKET_PRIORITY_COLOR = { Low: "#5B6472", Medium: "#F59E0B", High: "#F59E0B", Urgent: "#EF4444" };

export const TICKET_CATEGORIES = ["Billing", "Technical", "Product", "General"];

export const supportTicketsSeed = [
  {
    id: "TCK-101", subject: "Invoice discrepancy on INV-8799", customer: "Kilimo Fresh Distributors", category: "Billing",
    priority: "High", status: "Open", assignee: "Fatuma Salim", createdDate: "2026-07-01",
    messages: [{ from: "Customer", text: "We were charged for items not on our order. Please review INV-8799.", date: "2026-07-01" }],
  },
  {
    id: "TCK-100", subject: "GPS units not reporting location", customer: "Meridian Logistics", category: "Technical",
    priority: "Urgent", status: "In Progress", assignee: "David Chen", createdDate: "2026-06-29",
    messages: [
      { from: "Customer", text: "Half our fleet's GPS units stopped reporting since yesterday.", date: "2026-06-29" },
      { from: "Agent", text: "Thanks for flagging this — checking with our technical team now.", date: "2026-06-29" },
    ],
  },
  {
    id: "TCK-099", subject: "Request for bulk pricing on cement", customer: "Coastal Construction Ltd", category: "General",
    priority: "Medium", status: "Resolved", assignee: "Juma Batenga", createdDate: "2026-06-20",
    messages: [
      { from: "Customer", text: "Can we get a quote for 1000+ bags of cement?", date: "2026-06-20" },
      { from: "Agent", text: "Sent over a bulk quote — QT-1043. Let us know if you'd like adjustments.", date: "2026-06-21" },
    ],
  },
  {
    id: "TCK-098", subject: "Salon chair delivery delayed", customer: "Uzuri Beauty Chain", category: "General",
    priority: "Low", status: "Closed", assignee: "J. Batenga", createdDate: "2026-06-10",
    messages: [{ from: "Customer", text: "Our delivery was a few days late, just flagging for the record.", date: "2026-06-10" }],
  },
];

// A "conversation" here, not a "ticket" — quick, informal customer chat
// rather than a tracked issue with SLA and priority. The same distinction
// Zendesk Chat vs. Zendesk Support or Intercom's inbox vs. tickets makes.
export const chatConversationsSeed = [
  {
    id: "CHAT-01", customer: "Baraka Hotels & Resorts", status: "Active",
    messages: [
      { from: "Customer", text: "Hi, do you have industrial water heaters in stock?", time: "09:12" },
      { from: "Agent", text: "Yes! We have the 50L model in stock at our Dar warehouse.", time: "09:14" },
    ],
  },
  {
    id: "CHAT-02", customer: "Salim Wholesale Traders", status: "Closed",
    messages: [
      { from: "Customer", text: "What's your return policy on shelving units?", time: "14:02" },
      { from: "Agent", text: "30 days for unused items in original packaging.", time: "14:05" },
      { from: "Customer", text: "Perfect, thank you!", time: "14:06" },
    ],
  },
];

export const KB_CATEGORIES = ["Getting Started", "Billing", "Shipping", "Returns", "Technical"];

export const kbArticlesSeed = [
  { id: "KB-01", title: "How to request a bulk quote", category: "Getting Started", content: "To request a bulk quote, contact your account manager or submit a request through the Sales team with your desired quantities and delivery timeline. Most bulk quotes are turned around within one business day.", views: 142, published: true, updatedDate: "2026-05-10" },
  { id: "KB-02", title: "Understanding your invoice", category: "Billing", content: "Each invoice includes a breakdown of line items, VAT at 18%, and payment terms. Partial payments are recorded against the invoice and reflected in the balance due. Contact billing if any line item looks incorrect.", views: 89, published: true, updatedDate: "2026-06-01" },
  { id: "KB-03", title: "Delivery and shipping timelines", category: "Shipping", content: "Standard delivery within Dar es Salaam takes 2-3 business days; regional deliveries to Arusha and Mwanza typically take 5-7 business days depending on route and cargo size.", views: 210, published: true, updatedDate: "2026-04-22" },
  { id: "KB-04", title: "Return and refund policy", category: "Returns", content: "Items may be returned within 30 days of purchase in original condition. Refunds are processed to the original payment method within 5-10 business days of the return being received and inspected.", views: 56, published: false, updatedDate: "2026-06-25" },
];

export const CALL_DIRECTION_COLOR = { Inbound: "#16A34A", Outbound: "#F59E0B" };

export const CALL_OUTCOME_COLOR = { Resolved: "#16A34A", "Follow-up Needed": "#F59E0B", Escalated: "#EF4444" };

export const callLogSeed = [
  { id: "CALL-01", customer: "Kilimo Fresh Distributors", agent: "Fatuma Salim", direction: "Inbound", duration: 12, outcome: "Follow-up Needed", date: "2026-07-01", notes: "Discussed invoice discrepancy, escalated to billing." },
  { id: "CALL-02", customer: "Meridian Logistics", agent: "David Chen", direction: "Outbound", duration: 8, outcome: "Resolved", date: "2026-06-29", notes: "Walked through GPS troubleshooting steps." },
  { id: "CALL-03", customer: "Nyota Pharmacy Group", agent: "Juma Batenga", direction: "Inbound", duration: 5, outcome: "Resolved", date: "2026-06-27", notes: "Confirmed delivery address ahead of dispatch." },
];
