import { useState } from "react";
import {
  ChevronDown, Download, FileCheck, FileSpreadsheet, FileText
} from "lucide-react";
import * as XLSX from "xlsx";
import { TODAY, lineTotal } from "../lib/format.jsx";
import { notify } from "../lib/notify.jsx";

/* ══════════════ REPORTS ══════════════ */
/* --------------------------------- REPORTS ------------------------------------ */

// RFC-4180-style CSV export: quotes fields containing commas, quotes, or
// newlines, and doubles embedded quotes. Downloads via a Blob object URL.
export function exportCSV(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  notify(`Exported ${filename}`);
}

// Real .xlsx via SheetJS — an actual spreadsheet file, not a renamed CSV.
export function exportExcel(filename, sheetName, headers, rows) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31)); // Excel's own 31-char sheet name limit
  XLSX.writeFile(workbook, filename);
  notify(`Exported ${filename}`);
}

// Word recognizes HTML wrapped in its own XML namespace when given a
// .doc extension — no docx-generation library exists in this environment
// (mammoth, the one library available, only reads .docx, it doesn't write
// one). This is a real, longstanding browser technique, not a renamed
// text file: opening the result in Word shows genuine formatting, not raw
// markup.
export function exportWord(filename, title, bodyHtml) {
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset="utf-8"><title>${title}</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #111827; }
      h1 { font-size: 18pt; color: #111827; } h2 { font-size: 13pt; color: #16A34A; margin-top: 18pt; }
      table { border-collapse: collapse; width: 100%; margin-top: 8pt; }
      th, td { border: 1px solid #DEE2E6; padding: 6px 10px; font-size: 10pt; text-align: left; }
      th { background: #F5F7FA; font-weight: 600; }
      .right { text-align: right; }
    </style></head>
    <body>${bodyHtml}</body></html>`;
  const blob = new Blob(['\ufeff', html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  notify(`Exported ${filename}`);
}

// Real PDF via the browser's own print-to-PDF, not a bundled PDF library
// (none is available in this environment). Opens a clean, print-formatted
// window and calls window.print() — every modern browser's print dialog
// offers "Save as PDF" natively, so this genuinely produces a PDF without
// pretending to have PDF-generation code this build doesn't have.
export function printAsPDF(title, bodyHtml, opts) {
  const o = opts || {};
  const accent = o.accent || "#16A34A";
  const companyName = o.companyName || "";
  const logo = o.logo || "";
  const headerRight = o.headerRight || ("Generated: " + new Date().toLocaleDateString());
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) { notify("Pop-up blocked — allow pop-ups to export PDF.", "error"); return; }
  win.document.write(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>' +
    '<title>' + title + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'body{font-family:Inter,Arial,sans-serif;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.doc{max-width:820px;margin:0 auto;padding:40px 48px 56px}' +
    '.doc-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:20px;border-bottom:3px solid ' + accent + '}' +
    '.brand{font-size:22px;font-weight:800;color:#111827}.brand-sub{font-size:11px;color:#6B7280;margin-top:3px}' +
    '.doc-title{font-size:28px;font-weight:900;color:' + accent + ';text-align:right;letter-spacing:-0.5px}' +
    '.doc-meta{text-align:right;margin-top:4px;font-size:11px;color:#6B7280;line-height:1.7}' +
    'h2{font-size:10.5px;font-weight:700;color:' + accent + ';text-transform:uppercase;letter-spacing:.1em;margin:28px 0 10px;padding-bottom:5px;border-bottom:1px solid #E5E7EB}' +
    'p{font-size:12.5px;color:#374151;line-height:1.6;margin-bottom:6px}' +
    'table{border-collapse:collapse;width:100%;margin-top:8px;font-size:11.5px}' +
    'thead tr{background:' + accent + ';color:#fff}' +
    'thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em}' +
    'tbody tr{border-bottom:1px solid #F3F4F6}' +
    'tbody tr:nth-child(even){background:#FAFAFA}' +
    'tbody td{padding:9px 12px;color:#374151;font-size:12px}' +
    '.right{text-align:right!important}.center{text-align:center}' +
    '.total-row td{font-weight:700;background:#F0FDF4!important;border-top:2px solid ' + accent + ';font-size:13px}' +
    '.summary{background:' + accent + '0D;border:1px solid ' + accent + '30;border-radius:10px;padding:20px 24px;margin-top:24px}' +
    '.sum-row{display:flex;justify-content:space-between;padding:5px 0;font-size:12.5px;border-bottom:1px solid ' + accent + '18}' +
    '.sum-row:last-child{border:none;font-weight:800;font-size:14.5px;margin-top:6px;padding-top:10px}' +
    '.badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700}' +
    '.b-paid{background:#DCFCE7;color:#15803D}.b-partial{background:#FEF3C7;color:#92400E}.b-unpaid{background:#FEE2E2;color:#991B1B}.b-active{background:#DBEAFE;color:#1E40AF}' +
    '.footer{margin-top:48px;padding-top:14px;border-top:1px solid #E5E7EB;text-align:center;font-size:10px;color:#9CA3AF;line-height:1.6}' +
    '.print-btn{position:fixed;bottom:24px;right:24px;display:flex;gap:8px;z-index:9}' +
    '.print-btn button{padding:10px 20px;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;font-size:13px}' +
    '@media print{@page{margin:16mm 12mm;size:A4}.print-btn{display:none!important}.doc{padding:0}}' +
    '</style></head><body>' +
    '<div class="doc">' +
    '<div class="doc-hdr">' +
    '<div>' + (logo ? '<img src="' + logo + '" style="height:44px;object-fit:contain;margin-bottom:8px;display:block"/>' : '') +
    '<div class="brand">' + (companyName || "SMART MANAGER") + '</div>' +
    '<div class="brand-sub">SMART MANAGER · Enterprise Resource Planning</div></div>' +
    '<div><div class="doc-title">' + title + '</div><div class="doc-meta">' + headerRight + '</div></div>' +
    '</div>' +
    bodyHtml +
    '<div class="footer">Powered by SMART MANAGER · Generated ' + new Date().toLocaleString() + ' · Computer-generated document — no signature required</div>' +
    '</div>' +
    '<div class="print-btn">' +
    '<button onclick="window.print()" style="background:' + accent + ';color:#fff">🖨 Print / PDF</button>' +
    '<button onclick="window.close()" style="background:#F3F4F6;color:#374151">✕ Close</button>' +
    '</div>' +
    '<script>setTimeout(function(){window.print()},600)<\/script>' +
    '</body></html>'
  );
  win.document.close();
  win.focus();
}

export function buildTableHtml(title, headers, rows) {
  const headHtml = "<tr>" + headers.map((h) => "<th>" + h + "</th>").join("") + "</tr>";
  const bodyHtml = rows.map((r) => "<tr>" + r.map((c) => "<td class=\"" + (typeof c === "number" ? "right" : "") + "\">" + c + "</td>").join("") + "</tr>").join("");
  return `<h1>${title}</h1><p style="color:#6C757D;font-size:11px;">Generated ${TODAY.toISOString().slice(0, 10)} from live Smart Manager data</p><table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
}

// One export control for all four real formats. CSV and Excel are genuine
// structured data exports; Word and PDF render the same headers/rows as an
// HTML table first — Word via the .doc-namespace technique, PDF via the
// browser's native print dialog — since no docx or PDF-generation library
// is available in this environment (see the two export functions above).
export function ExportMenu({ title, filename, sheetName, headers, rows }) {
  const [open, setOpen] = useState(false);
  function run(fn) { fn(); setOpen(false); }
  const html = buildTableHtml(title, headers, rows);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[12px] font-medium border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors text-slate-600">
        <Download size={13} /> Export <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-lg border border-slate-200/80 shadow-lg z-40 overflow-hidden">
            <button onClick={() => run(() => exportCSV(`${filename}.csv`, headers, rows))} className="w-full flex items-center gap-2 text-[12.5px] text-slate-600 hover:bg-slate-50 px-3 py-2.5 text-left">
              <FileSpreadsheet size={13} className="text-slate-400" /> CSV
            </button>
            <button onClick={() => run(() => exportExcel(`${filename}.xlsx`, sheetName, headers, rows))} className="w-full flex items-center gap-2 text-[12.5px] text-slate-600 hover:bg-slate-50 px-3 py-2.5 text-left">
              <FileSpreadsheet size={13} className="text-[#16A34A]" /> Excel
            </button>
            <button onClick={() => run(() => exportWord(`${filename}.doc`, title, html))} className="w-full flex items-center gap-2 text-[12.5px] text-slate-600 hover:bg-slate-50 px-3 py-2.5 text-left">
              <FileText size={13} className="text-[#0EA5E9]" /> Word
            </button>
            <button onClick={() => run(() => printAsPDF(title, html))} className="w-full flex items-center gap-2 text-[12.5px] text-slate-600 hover:bg-slate-50 px-3 py-2.5 text-left">
              <FileCheck size={13} className="text-[#EF4444]" /> PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function computeValuationByCategory(inventory) {
  const map = {};
  inventory.rows.forEach((it) => {
    const value = it.qty * it.unitCost;
    const cat = map[it.category] || { category: it.category, items: [], value: 0 };
    cat.items.push({ ...it, value });
    cat.value += value;
    map[it.category] = cat;
  });
  const byCategory = Object.values(map).sort((a, b) => b.value - a.value);
  const grandTotal = byCategory.reduce((s, c) => s + c.value, 0);
  return {
 byCategory, grandTotal };
}

// Bank Reconciliation — match recorded transactions against a bank statement.
// The senior-honest scope: the user pastes statement lines; the system
// matches them against paid invoices and expenses by amount and approximate
// date, showing unmatched lines on both sides. Full CSV import and
// auto-matching by reference number is the named next step.
// Customer Account Statement — printable PDF showing all invoices, payments,
// and outstanding balance for a single customer. Professional format with
// running balance column. Used by AR teams for customer collections.
export function printCustomerStatement(customer, invoices) {
  const fmt = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
  const co = window.__smartManagerCompany || {};
  const custInvoices = invoices.filter((inv) => inv.customer === customer)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = 0;
  const rows = custInvoices.map((inv) => {
    const total = lineTotal(inv.items || []).total;
    const paid  = inv.amountPaid || (inv.status === "Paid" ? total : 0);
    const bal   = total - paid;
    running += bal;
    const statusColor = { Paid:"#16A34A", Unpaid:"#F59E0B", Overdue:"#EF4444", Partial:"#3B82F6" }[inv.status] || "#6B7280";
    return "<tr style=\"border-bottom:1px solid #F3F4F6\">" +
      "<td style=\"padding:8px 10px;font-size:11.5px;font-family:monospace\">" + inv.date + "</td>" +
      "<td style=\"padding:8px 10px;font-size:11.5px;font-weight:600;color:#16A34A\">" + inv.id + "</td>" +
      "<td style=\"padding:8px 10px;font-size:11.5px\">Invoice</td>" +
      "<td style=\"padding:8px 10px;text-align:right;font-family:monospace;font-size:11.5px\">TZS " + fmt(total) + "k</td>" +
      "<td style=\"padding:8px 10px;text-align:right;font-family:monospace;font-size:11.5px;color:#16A34A\">TZS " + fmt(paid) + "k</td>" +
      "<td style=\"padding:8px 10px;text-align:right;font-family:monospace;font-weight:700;font-size:11.5px;color:" + (bal > 0 ? "#EF4444" : "#16A34A") + "\">TZS " + fmt(bal) + "k</td>" +
      "<td style=\"padding:8px 10px;text-align:center\"><span style=\"font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;color:white;background:" + statusColor + "\">" + inv.status + "</span></td>" +
      "</tr>";
  });

  const totalCharged  = custInvoices.reduce((s, inv) => s + lineTotal(inv.items||[]).total, 0);
  const totalPaid     = custInvoices.reduce((s, inv) => { const t=lineTotal(inv.items||[]).total; return s + (inv.amountPaid||(inv.status==="Paid"?t:0)); }, 0);
  const totalOutstand = totalCharged - totalPaid;

  printAsPDF("Statement — " + customer,
    "<div style=\"font-family:Inter,sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#111827\">" +
    "<div style=\"display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #16A34A;padding-bottom:16px;margin-bottom:20px\">" +
      "<div><div style=\"font-size:20px;font-weight:800;\">" + (co.name||"Smart Manager") + "</div>" +
      "<div style=\"font-size:11px;color:#6B7280;margin-top:3px\">" + [co.address,co.city,"Tanzania"].filter(Boolean).join(" · ") + "</div>" +
      (co.tin?"<div style=\"font-size:11px;color:#6B7280\">TIN: " + co.tin + "</div>":"") + "</div>" +
      "<div style=\"text-align:right\">" +
        "<div style=\"font-size:22px;font-weight:900;color:#16A34A\">ACCOUNT STATEMENT</div>" +
        "<div style=\"font-size:11px;color:#6B7280;margin-top:4px\">As at " + new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}) + "</div>" +
      "</div>" +
    "</div>" +
    "<div style=\"padding:14px;background:#F0FDF4;border-radius:10px;margin-bottom:20px\">" +
      "<div style=\"font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px\">Statement For</div>" +
      "<div style=\"font-size:16px;font-weight:700;\">" + customer + "</div>" +
    "</div>" +
    "<table style=\"width:100%;border-collapse:collapse;margin-bottom:20px\">" +
      "<thead><tr style=\"background:#052614\">" +
        "<th style=\"padding:9px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:white\">Date</th>" +
        "<th style=\"padding:9px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:white\">Reference</th>" +
        "<th style=\"padding:9px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:white\">Type</th>" +
        "<th style=\"padding:9px 10px;text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;color:white\">Charged</th>" +
        "<th style=\"padding:9px 10px;text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;color:white\">Paid</th>" +
        "<th style=\"padding:9px 10px;text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;color:white\">Balance</th>" +
        "<th style=\"padding:9px 10px;text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;color:white\">Status</th>" +
      "</tr></thead>" +
      "<tbody>" + (rows.length ? rows.join("") : "<tr><td colspan=\"7\" style=\"padding:20px;text-align:center;color:#9CA3AF\">No invoices found for this customer.</td></tr>") + "</tbody>" +
    "</table>" +
    "<div style=\"display:flex;justify-content:flex-end\">" +
      "<div style=\"width:300px\">" +
        "<div style=\"display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #E5E7EB;font-size:12px\"><span style=\"color:#6B7280\">Total Invoiced</span><span>TZS " + fmt(totalCharged) + "k</span></div>" +
        "<div style=\"display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #E5E7EB;font-size:12px;color:#16A34A\"><span>Total Received</span><span>TZS " + fmt(totalPaid) + "k</span></div>" +
        "<div style=\"display:flex;justify-content:space-between;align-items:center;padding:12px;background:" + (totalOutstand > 0 ? "#052614" : "#F0FDF4") + ";border-radius:8px;margin-top:8px\">" +
          "<span style=\"font-size:13px;font-weight:700;color:" + (totalOutstand > 0 ? "white" : "#16A34A") + "\">Outstanding Balance</span>" +
          "<span style=\"font-size:18px;font-weight:900;color:" + (totalOutstand > 0 ? "#4ADE80" : "#16A34A") + "\">TZS " + fmt(totalOutstand) + "k</span>" +
        "</div>" +
      "</div>" +
    "</div>" +
    "<div style=\"text-align:center;margin-top:24px;font-size:10px;color:#9CA3AF\">Generated by Smart Manager · " + (co.name||"") + " · This is a computer-generated statement.</div>" +
    "</div>"
  );
}
