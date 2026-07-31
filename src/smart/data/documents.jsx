import {
  FileImage, FileSpreadsheet, FileText
} from "lucide-react";

/* ══════════════ DOCUMENTS DATA ══════════════ */
/* -------------------------------- DOCUMENTS DATA --------------------------------- */
export const DOC_FOLDERS = ["Contracts", "Invoices", "Receipts", "Employee Files", "Tax Documents", "Licenses", "Purchase Orders"];

// Real OCR via Tesseract.js — a genuine, production-grade, client-side
// OCR engine (WebAssembly, runs entirely in the browser, no server or paid
// API needed) loaded from a CDN on first use rather than bundled, since
// it's a large library most sessions in this app will never touch. This
// is not guaranteed to succeed in every environment — an iframe'd artifact
// or a network blocking the CDN will fail to load it — so the caller
// always checks the returned { ok } flag and shows the real reason rather
// than assuming OCR always works.
export let tesseractLoadPromise = null;

export function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Tesseract loaded but did not attach to window")));
    script.onerror = () => reject(new Error("Couldn't load the OCR engine from the CDN"));
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

export async function runOCR(imageFile, onProgress) {
  try {
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(imageFile, "eng", {
      logger: (m) => { if (m.status === "recognizing text" && onProgress) onProgress(Math.round((m.progress || 0) * 100)); },
    });
    return { ok: true, text: result.data.text.trim() };
  } catch (e) {
    return { ok: false, error: "Couldn't run OCR — the engine failed to load (this can happen if the CDN is blocked in this environment). You can still type the document's text in manually below." };
  }
}

export const FILE_TYPE_STYLE = {
  pdf: { color: "#EF4444", Icon: FileText, label: "PDF" },
  docx: { color: "#0EA5E9", Icon: FileText, label: "DOCX" },
  xlsx: { color: "#16A34A", Icon: FileSpreadsheet, label: "XLSX" },
  png: { color: "#F59E0B", Icon: FileImage, label: "PNG" },
};

export const filesSeed = [
  { id: "DOC-01", name: "Baraka Hotels — Supply Agreement.pdf", type: "pdf", folder: "Contracts", size: "1.2 MB", uploadedBy: "J. Batenga", date: "2026-06-24", linkedRecord: "QT-1042", content: "Supply agreement between BEIRAHISI HARDWARE and Baraka Hotels & Resorts for construction materials, effective 1 June 2026. Payment terms: net 30 days. Delivery: Dar es Salaam metro area within 5 business days of order confirmation.", versions: [] },
  { id: "DOC-02", name: "Meridian Logistics — Service Contract.pdf", type: "pdf", folder: "Contracts", size: "0.9 MB", uploadedBy: "S. Kileo", date: "2026-06-15", linkedRecord: "SO-2117", content: "Service contract covering GPS tracking unit installation and annual monitoring subscription for Meridian Logistics' fleet, 24 units, renewable annually.", versions: [] },
  { id: "DOC-03", name: "June Payroll Summary.xlsx", type: "xlsx", folder: "Employee Files", size: "340 KB", uploadedBy: "F. Salim", date: "2026-06-27", linkedRecord: null, content: "", versions: [] },
  { id: "DOC-04", name: "Q2 VAT Return.pdf", type: "pdf", folder: "Tax Documents", size: "610 KB", uploadedBy: "F. Salim", date: "2026-06-20", linkedRecord: null, content: "Quarterly VAT return for Q2 2026, output tax computed at 18% on taxable sales, filed with the Tanzania Revenue Authority.", versions: [{ version: 1, date: "2026-06-18", size: "598 KB", note: "Initial draft before final reconciliation" }] },
  { id: "DOC-05", name: "Business License — Renewal 2026.pdf", type: "pdf", folder: "Licenses", size: "1.8 MB", uploadedBy: "EzyMP", date: "2026-05-30", linkedRecord: null, content: "Business operating license renewal, City of Dar es Salaam, valid through 31 May 2027. License category: General wholesale and hardware trading.", versions: [] },
  { id: "DOC-06", name: "Grace Mmbaga — Employment Contract.docx", type: "docx", folder: "Employee Files", size: "88 KB", uploadedBy: "F. Salim", date: "2026-06-01", linkedRecord: "EMP-104", content: "Employment contract for Grace Mmbaga, Operations role, permanent contract effective 1 June 2026, probation period 3 months.", versions: [] },
  { id: "DOC-07", name: "Coastal Construction — Purchase Order.pdf", type: "pdf", folder: "Purchase Orders", size: "0.5 MB", uploadedBy: "M. Fundi", date: "2026-06-22", linkedRecord: "QT-1041", content: "", versions: [] },
  { id: "DOC-08", name: "Warehouse Floor Plan.png", type: "png", folder: "Licenses", size: "2.1 MB", uploadedBy: "D. Chen", date: "2026-05-12", linkedRecord: null, content: "", versions: [] },
  { id: "DOC-09", name: "Annual Financial Statement 2025.xlsx", type: "xlsx", folder: "Tax Documents", size: "780 KB", uploadedBy: "F. Salim", date: "2026-04-18", linkedRecord: null, content: "", versions: [] },
];
