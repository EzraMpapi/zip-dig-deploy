/* ══════════════ ENTERPRISE COLLABORATION HUB DATA ══════════════ */
/* ------------------------------ ENTERPRISE COLLABORATION HUB DATA ------------------------------ */

// Voice Calls and Video Meetings are the two items here with no honest
// in-app implementation: real calling needs a WebRTC signaling server,
// STUN/TURN infrastructure for NAT traversal, and for group calls a media
// relay server — none of which exist in a static frontend talking to one
// Postgres database. The honest equivalent, and the same pattern already
// used for Stripe and PayPal in Integrations (section 25): schedule the
// meeting for real, with a real link to wherever the actual call happens
// (Zoom, Google Meet, Teams — whatever the business already uses), rather
// than pretend to host a call this build cannot technically provide.
export const MEETING_TYPES = ["Voice Call", "Video Call", "In-Person", "General"];

export const calendarEventsSeed = [
  { id: "EVT-01", title: "Weekly Sales Sync", type: "Video Call", date: "2026-07-07", startTime: "09:00", endTime: "09:30", meetingLink: "https://meet.google.com/example-link", attendees: "Sales team", description: "Pipeline review and weekly targets." },
  { id: "EVT-02", title: "Supplier Call — Tanzania Portland Cement", type: "Voice Call", date: "2026-07-08", startTime: "14:00", endTime: "14:30", meetingLink: "", attendees: "Procurement", description: "Discuss Q3 pricing." },
  { id: "EVT-03", title: "Warehouse Stock Count", type: "In-Person", date: "2026-07-10", startTime: "08:00", endTime: "12:00", meetingLink: "", attendees: "Warehouse team", description: "Quarterly physical stock count, Dar es Salaam warehouse." },
];

// Channels cover both Team Chat and Department Channels — a department
// channel is simply a channel scoped to a real department name (drawn
// from HR's actual employee.department values, not an invented list).
export const collabChannelsSeed = [
  { id: "CH-01", name: "General", scope: "Company-wide", description: "Company-wide announcements and general discussion." },
  { id: "CH-02", name: "Sales", scope: "Department", description: "Sales team coordination." },
  { id: "CH-03", name: "Operations", scope: "Department", description: "Warehouse and operations coordination." },
];

// Real, polled messages — not true push-based real-time (no WebSocket
// signaling exists here), but genuinely working near-real-time delivery:
// while a channel is open, the frontend polls for new rows every few
// seconds, the same honest technique already validated for this class of
// problem (a static frontend with no server to push events from).
export const collabMessagesSeed = [
  { id: "MSG-01", channelId: "CH-01", sender: "Grace Mmbaga", text: "Morning team — reminder that the cold chain rollout site visit is this Thursday.", timestamp: "2026-07-05T08:15:00Z" },
  { id: "MSG-02", channelId: "CH-02", sender: "S. Kileo", text: "Meridian Logistics confirmed the fleet GPS rollout for next week.", timestamp: "2026-07-05T09:02:00Z" },
];

export const workspacesSeed = [
  { id: "WS-01", name: "Cold Chain Rollout Team", department: "Operations", members: "Grace Mmbaga, David Chen, Elias Rugambwa", channelId: "CH-03", description: "Cross-functional team delivering the Kilimo Fresh cold chain project." },
];
