/* ══════════════ SUPPLY CHAIN DATA ══════════════ */
/* ------------------------------ SUPPLY CHAIN DATA ------------------------------ */
export const SHIPMENT_STATUS_COLOR = {
  Preparing: "#5B6472",
  Dispatched: "#F59E0B",
  "In Transit": "#F59E0B",
  Delivered: "#16A34A",
};

export const SHIPMENT_STATUS_NEXT = { Preparing: "Dispatched", Dispatched: "In Transit", "In Transit": "Delivered", Delivered: null };

export const VEHICLE_STATUS_COLOR = {
  Available: "#16A34A",
  "On Route": "#F59E0B",
  Maintenance: "#F59E0B",
};

export const vehiclesSeed = [
  { reg: "T 442 DKL", type: "Box truck (3.5t)", driver: "Elias Rugambwa", status: "On Route", capacity: "3,500 kg" },
  { reg: "T 118 BFQ", type: "Flatbed (7t)", driver: "Joseph Mkude", status: "Available", capacity: "7,000 kg" },
  { reg: "T 903 CPR", type: "Panel van (1.2t)", driver: "Amina Hassan", status: "Available", capacity: "1,200 kg" },
  { reg: "T 771 AGX", type: "Box truck (3.5t)", driver: "Frank Temba", status: "Maintenance", capacity: "3,500 kg" },
];

export const shipmentsSeed = [
  { id: "DL-812", orderRef: "SO-2117", customer: "Meridian Logistics", destination: "Dar es Salaam — Kurasini", vehicle: "T 442 DKL", dispatchDate: "2026-07-01", expectedDate: "2026-07-03", status: "In Transit" },
  { id: "DL-811", orderRef: "SO-2116", customer: "Uzuri Beauty Chain", destination: "Mwanza — Nyamagana", vehicle: "T 118 BFQ", dispatchDate: "2026-06-28", expectedDate: "2026-07-01", status: "Delivered" },
  { id: "DL-810", orderRef: "—", customer: "Nyota Pharmacy Group", destination: "Arusha — Kaloleni", vehicle: null, dispatchDate: "2026-07-04", expectedDate: "2026-07-06", status: "Preparing" },
  { id: "DL-809", orderRef: "—", customer: "Coastal Construction Ltd", destination: "Dar es Salaam — Kigamboni", vehicle: "T 903 CPR", dispatchDate: "2026-06-20", expectedDate: "2026-06-21", status: "Delivered" },
];
