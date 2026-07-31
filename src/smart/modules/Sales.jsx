import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronRight, Clock, Download, FileText, Minus, Plus, Printer, ReceiptText,
  Repeat, Search, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis,
  YAxis
} from "recharts";
import { printInvoiceBus } from "../components/feedback.jsx";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormField,
  SkeletonRows,
  inputClass,
} from "../components/ui.jsx";
import { ordersSeed } from "../data/assets.jsx";
import {
  DocStatusPill,
  RETURN_REASONS,
  SortableHeader,
  sortRows,
  toggleSort,
} from "../data/pos.jsx";
import {
  DOC_STATUS_NEXT,
  DOC_TABS,
  PAYMENT_METHODS,
  SUBSCRIPTION_CYCLES,
  SUBSCRIPTION_STATUS_COLOR,
  addCycle,
  invoiceCreatedBus,
  numberToWords,
  recordPayment,
} from "../data/sales.jsx";
import { TAX_RATE, TODAY, docId, lineTotal, money } from "../lib/format.jsx";
import { mapOrderRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { downloadCSV } from "../modules/Reports.jsx";

/* ══════════════ SALES ══════════════ */
/* --------------------------------- SALES ------------------------------------ */
export function Sales({ invoices, inventory, subscriptionsHook, quotationsHook, currentUser, intent, clearIntent }) {
  const [tab, setTab] = useState("quotations");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [sort, setSort] = useState({ field: null, direction: "asc" });

  // A Dashboard Quick Action ("Create Invoice") can deep-link here already
  // on the right tab with the create form open, instead of just switching
  // modules and leaving the user to find it. Consumed once, then cleared.
  useEffect(() => {
    if (intent?.module !== "sales") return;
    if (intent.tab) setTab(intent.tab);
    if (intent.openForm) setShowForm(true);
    clearIntent();
  }, [intent]);

  // PostCreateDispatch → printInvoiceBus: when the slide-up panel triggers
  // a print, Sales' own printInvoice function handles it (same PDF engine).
  useEffect(() => {
    const handler = (doc) => printInvoice(doc);
    printInvoiceBus.listeners.add(handler);
    return () => printInvoiceBus.listeners.delete(handler);
  }, []);

  // Orders are local to Sales; invoices and quotations are shared roots
  // (see SmartManager) — quotations because the AI Assistant's
  // create_quotation tool needs to write to the same table Sales displays,
  // the identical reasoning behind every other shared-state lift in this
  // build.
  const quotations = quotationsHook;
  const orders = useCompanyTable("sales_orders", ordersSeed, {
    select: "*,sales_order_items(*),sales_order_returns(*,sales_order_return_items(*))", order: { col: "order_date", ascending: false }, mapRow: mapOrderRow,
  });

  const subscriptions = subscriptionsHook;
  const hooksByTab = { quotations, orders, invoices };
  const dataByTab = { quotations: quotations.rows, orders: orders.rows, invoices: invoices.rows };
  const errorByTab = { quotations: quotations.error, orders: orders.error, invoices: invoices.error };
  const loadingByTab = { quotations: quotations.loading, orders: orders.loading, invoices: invoices.loading };
  // Subscriptions isn't a document tab — it's handled by its own
  // self-contained component below — so this falls back to [] rather than
  // undefined for the tab-derived values (filtered/summary/etc.) that
  // still run every render regardless of which tab is active.
  const rows = dataByTab[tab] || [];

  const filtered = useMemo(() => {
    let result = rows;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((r) => r.customer.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    return sortRows(result, sort);
  }, [rows, query, sort]);

  const summary = useMemo(() => {
    const totals = rows.map((r) => lineTotal(r.items).total);
    const sum = totals.reduce((a, b) => a + b, 0);
    return { count: rows.length, sum };
  }, [rows]);

  const columnLabel = {
    quotations: ["Quotation", "Valid Until"],
    orders: ["Sales Order", "Reference"],
    invoices: ["Invoice", "Due Date"],
  }[tab] || ["Document", ""];

  const idPrefix = { quotations: "QT", orders: "SO", invoices: "INV" }[tab];

  function printInvoice(doc) {
    const co      = window.__smartManagerCompany || {};
    const fmt     = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
    const fmtDec  = (n) => new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
    const { subtotal, tax, total } = lineTotal(doc.items || []);
    const balance  = total - (doc.amountPaid || 0);
    const statusColor = { Paid:"#16A34A", Unpaid:"#F59E0B", Overdue:"#EF4444", Partial:"#3B82F6" }[doc.status] || "#6B7280";
    const ACCENT   = co.accentColor || "#16A34A";
    const DARK     = "#0D2214";

    // Discount savings
    const savingsRows = (doc.items||[]).filter(it=>Number(it.discount)>0);
    const totalDiscount = (doc.items||[]).reduce((s,it)=>{
      const base=(Number(it.qty)||0)*(Number(it.rate)||0);
      return s + base*(Math.min(100,Math.max(0,Number(it.discount)||0))/100);
    },0);

    // Line rows — include discount column when any line has one
    const hasDisc = savingsRows.length > 0;
    const lineRows = (doc.items||[]).filter(it=>it.name?.trim()).map((it,idx)=>{
      const base=(Number(it.qty)||0)*(Number(it.rate)||0);
      const disc=Math.min(100,Math.max(0,Number(it.discount)||0));
      const lineAmt=base*(1-disc/100);
      return "<tr style=\"background:" + (idx%2===0?"#fff":"#FAFBFC") + "\">" +
        "<td style=\"padding:10px 12px;font-size:12.5px;color:#111827\">" + (idx+1) + ". " + it.name + (it.sku?"<br><span style='font-size:10px;color:#9CA3AF;font-family:monospace'>SKU: "+it.sku+"</span>":"") + "</td>" +
        "<td style=\"padding:10px 12px;text-align:center;font-size:12.5px;color:#374151;font-family:monospace\">" + (it.qty||1) + "</td>" +
        "<td style=\"padding:10px 12px;text-align:right;font-size:12.5px;color:#374151;font-family:monospace\">" + fmt(it.rate||0) + "</td>" +
        (hasDisc?"<td style=\"padding:10px 12px;text-align:center;font-size:12px;color:#F59E0B;font-family:monospace\">" + (disc>0?disc+"%":"—") + "</td>":"") +
        "<td style=\"padding:10px 12px;text-align:right;font-size:12.5px;font-weight:600;color:#111827;font-family:monospace\">" + fmt(lineAmt) + "</td>" +
      "</tr>";
    }).join("");

    // Payment history rows
    const payRows = (doc.payments||[]).map(p=>
      "<tr><td style=\"padding:7px 12px;font-size:11.5px;color:#374151\">" + p.date + "</td>" +
      "<td style=\"padding:7px 12px;font-size:11.5px;color:#374151\">" + p.method + "</td>" +
      "<td style=\"padding:7px 12px;font-size:11px;color:#6B7280;font-family:monospace\">" + (p.reference||"—") + "</td>" +
      "<td style=\"padding:7px 12px;text-align:right;font-size:12px;font-weight:600;color:#16A34A;font-family:monospace\">" + fmt(p.amount) + "</td>" +
      "</tr>"
    ).join("");

    const logoHtml = co.logo
      ? "<img src=\"" + co.logo + "\" style=\"height:52px;object-fit:contain\" alt=\"logo\"/>"
      : "<div style=\"width:52px;height:52px;border-radius:12px;background:" + ACCENT + ";display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#fff\">" + (co.name||"B").charAt(0) + "</div>";

    // QR-style pattern (visual only — decorative)
    const qrSvg = "<svg width='60' height='60' viewBox='0 0 60 60' style='opacity:0.15'>" +
      "<rect x='0' y='0' width='26' height='26' rx='3' fill='#111827'/>" +
      "<rect x='4' y='4' width='18' height='18' rx='2' fill='white'/>" +
      "<rect x='7' y='7' width='12' height='12' rx='1' fill='#111827'/>" +
      "<rect x='34' y='0' width='26' height='26' rx='3' fill='#111827'/>" +
      "<rect x='38' y='4' width='18' height='18' rx='2' fill='white'/>" +
      "<rect x='41' y='7' width='12' height='12' rx='1' fill='#111827'/>" +
      "<rect x='0' y='34' width='26' height='26' rx='3' fill='#111827'/>" +
      "<rect x='4' y='38' width='18' height='18' rx='2' fill='white'/>" +
      "<rect x='7' y='41' width='12' height='12' rx='1' fill='#111827'/>" +
      "<rect x='34' y='34' width='6' height='6' fill='#111827'/>" +
      "<rect x='42' y='34' width='6' height='6' fill='#111827'/>" +
      "<rect x='50' y='34' width='6' height='6' fill='#111827'/>" +
      "<rect x='34' y='42' width='6' height='6' fill='#111827'/>" +
      "<rect x='50' y='42' width='6' height='6' fill='#111827'/>" +
      "<rect x='42' y='50' width='6' height='6' fill='#111827'/>" +
      "</svg>";

    const win = window.open("","_blank","width=900,height=1200");
    if (!win) { notify("Pop-up blocked — allow pop-ups to print.", "error"); return; }

    win.document.write(
      "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'/>" +
      "<title>Invoice " + doc.id + "</title>" +
      "<link href='https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap' rel='stylesheet'/>" +
      "<style>" +
        "*{box-sizing:border-box;margin:0;padding:0}" +
        "body{font-family:Inter,Arial,sans-serif;background:#F3F4F6;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
        "@media print{body{background:white}.no-print{display:none!important}.page{box-shadow:none!important;margin:0!important}}" +
        ".page{max-width:780px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,.12)}" +
        ".header{background:" + DARK + ";padding:36px 40px;display:flex;justify-content:space-between;align-items:flex-start}" +
        ".company-block{display:flex;align-items:center;gap:16px}" +
        ".company-name{font-size:20px;font-weight:800;color:white;letter-spacing:-0.3px}" +
        ".company-meta{font-size:11px;color:rgba(255,255,255,0.55);margin-top:3px;line-height:1.6}" +
        ".invoice-title{font-size:40px;font-weight:900;color:" + ACCENT + ";letter-spacing:-1px;text-align:right}" +
        ".invoice-badge{display:inline-flex;align-items:center;gap:6px;background:" + statusColor + "20;border:1px solid " + statusColor + "50;color:" + statusColor + ";padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-top:6px}" +
        ".meta-strip{background:#F8FAFB;border-bottom:1px solid #E5E7EB;padding:20px 40px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px}" +
        ".meta-block{}" +
        ".meta-label{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#9CA3AF;margin-bottom:4px}" +
        ".meta-value{font-size:14px;font-weight:600;color:#111827}" +
        ".meta-sub{font-size:11px;color:#6B7280;margin-top:2px}" +
        ".invoice-id{font-family:monospace;font-size:22px;font-weight:800;color:#111827;letter-spacing:1px}" +
        ".body{padding:32px 40px}" +
        "table.items{width:100%;border-collapse:collapse;margin-bottom:4px}" +
        "table.items thead tr{background:" + ACCENT + "}" +
        "table.items thead th{padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:white}" +
        "table.items thead th.right{text-align:right}" +
        "table.items thead th.center{text-align:center}" +
        "table.items tbody tr:last-child td{border-bottom:none}" +
        ".totals{display:flex;justify-content:flex-end;margin:16px 0 0}" +
        ".totals-box{width:280px}" +
        ".tot-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #F3F4F6;font-size:12.5px;color:#374151}" +
        ".tot-row.disc{color:#16A34A}" +
        ".tot-row.total{font-size:14px;font-weight:800;color:white;background:" + ACCENT + ";padding:12px 16px;border-radius:8px;margin-top:8px;border:none}" +
        ".tot-row.balance{font-size:13px;font-weight:700;color:#EF4444;background:#FEF2F2;padding:10px 16px;border-radius:8px;border:none}" +
        ".paid-stamp{position:absolute;top:120px;right:40px;opacity:0.1;transform:rotate(-15deg);font-size:72px;font-weight:900;color:#16A34A;letter-spacing:-2px;pointer-events:none}" +
        ".notes-bar{background:#F8FAFB;border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;padding:16px 40px;display:flex;gap:32px}" +
        ".bank-section{padding:24px 40px;background:#F0FDF4;border-top:2px solid " + ACCENT + "20}" +
        ".bank-title{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:" + ACCENT + ";margin-bottom:10px}" +
        ".bank-row{display:flex;gap:32px;flex-wrap:wrap}" +
        ".bank-field{}" +
        ".bank-label{font-size:10px;color:#9CA3AF;margin-bottom:2px}" +
        ".bank-value{font-size:12.5px;font-weight:600;color:#111827}" +
        ".footer{background:" + DARK + ";padding:18px 40px;display:flex;justify-content:space-between;align-items:center}" +
        ".footer-note{font-size:11px;color:rgba(255,255,255,0.5)}" +
        ".footer-brand{font-size:11px;font-weight:700;color:" + ACCENT + "}" +
        "table.payments{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}" +
        "table.payments td{padding:6px 10px;border-bottom:1px solid #F3F4F6}" +
        ".toolbar{position:fixed;bottom:24px;right:24px;display:flex;gap:8px;z-index:99}" +
        ".btn{padding:10px 20px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:Inter,sans-serif}" +
        ".btn-print{background:" + ACCENT + ";color:white}" +
        ".btn-close{background:white;color:#111827;border:1.5px solid #E5E7EB}" +
      "</style></head><body>" +

      "<div class='page' style='position:relative'>" +

        // PAID watermark
        (doc.status === "Paid" ? "<div class='paid-stamp'>PAID</div>" : "") +

        // Header — dark bar with logo + INVOICE title
        "<div class='header'>" +
          "<div class='company-block'>" +
            logoHtml +
            "<div>" +
              "<div class='company-name'>" + (co.name||"SMART MANAGER") + "</div>" +
              "<div class='company-meta'>" +
                [co.address,co.city,co.country||"Tanzania"].filter(Boolean).join(" · ") +
                (co.phone?"<br>Tel: " + co.phone:"") +
                (co.email?"<br>Email: " + co.email:"") +
                (co.tin?"<br>TIN: " + co.tin:"") +
                (co.vrn?"&nbsp;&nbsp;VRN: " + co.vrn:"") +
              "</div>" +
            "</div>" +
          "</div>" +
          "<div style='text-align:right'>" +
            "<div class='invoice-title'>INVOICE</div>" +
            "<div style='font-family:monospace;font-size:15px;font-weight:700;color:rgba(255,255,255,0.85);margin-top:6px'>" + doc.id + "</div>" +
            "<div style='margin-top:8px'><span class='invoice-badge'>● " + (doc.status||"Unpaid") + "</span></div>" +
          "</div>" +
        "</div>" +

        // Meta strip — Bill To + dates + ref
        "<div class='meta-strip'>" +
          "<div class='meta-block'>" +
            "<div class='meta-label'>Bill To</div>" +
            "<div class='meta-value'>" + (doc.customer||"—") + "</div>" +
            (doc.customerEmail?"<div class='meta-sub'>" + doc.customerEmail + "</div>":"") +
            (doc.customerPhone?"<div class='meta-sub'>" + doc.customerPhone + "</div>":"") +
          "</div>" +
          "<div class='meta-block'>" +
            "<div class='meta-label'>Invoice Number</div>" +
            "<div class='invoice-id'>" + doc.id + "</div>" +
          "</div>" +
          "<div class='meta-block' style='text-align:right'>" +
            "<div style='margin-bottom:10px'>" +
              "<div class='meta-label'>Issue Date</div>" +
              "<div class='meta-value'>" + (doc.date||"—") + "</div>" +
            "</div>" +
            "<div>" +
              "<div class='meta-label'>Due Date</div>" +
              "<div class='meta-value' style='color:" + (doc.status==="Overdue"?"#EF4444":doc.status==="Paid"?"#16A34A":"#111827") + "'>" + (doc.dueDate||"On receipt") + "</div>" +
            "</div>" +
          "</div>" +
        "</div>" +

        // Line items
        "<div class='body'>" +
          "<table class='items'>" +
            "<thead><tr>" +
              "<th>Description</th>" +
              "<th class='center' style='width:60px'>Qty</th>" +
              "<th class='right' style='width:110px'>Unit Price (TZS)</th>" +
              (hasDisc?"<th class='center' style='width:70px'>Disc.</th>":"") +
              "<th class='right' style='width:120px'>Amount (TZS)</th>" +
            "</tr></thead>" +
            "<tbody>" + lineRows + "</tbody>" +
          "</table>" +

          // Totals
          "<div class='totals'><div class='totals-box'>" +
            "<div class='tot-row'><span>Subtotal</span><span style='font-family:monospace'>" + fmt(subtotal) + "</span></div>" +
            (totalDiscount>0?"<div class='tot-row disc'><span>Discount Savings</span><span style='font-family:monospace'>− " + fmt(totalDiscount) + "</span></div>":"") +
            "<div class='tot-row'><span>VAT (" + Math.round(18) + "%)</span><span style='font-family:monospace'>" + fmt(tax) + "</span></div>" +
            "<div class='tot-row total'><span>TOTAL DUE</span><span style='font-family:monospace'>TZS " + fmt(total) + "</span></div>" +
            (doc.amountPaid>0?"<div class='tot-row' style='padding:7px 0;font-size:12.5px;color:#16A34A'><span>Amount Paid</span><span style='font-family:monospace'>− " + fmt(doc.amountPaid) + "</span></div>":"") +
            (balance>0&&doc.amountPaid>0?"<div class='tot-row balance'><span>BALANCE DUE</span><span style='font-family:monospace'>TZS " + fmt(balance) + "</span></div>":"") +
          "</div></div>" +

        "</div>" +

        // Payment history (if partial/paid)
        ((doc.payments||[]).length>0?
          "<div style='padding:0 40px 24px'>" +
          "<div style='font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9CA3AF;margin-bottom:8px'>Payment History</div>" +
          "<table class='payments' style='background:#F8FAFB;border-radius:8px;overflow:hidden'>" +
            "<thead><tr style='background:#E5E7EB'>" +
              "<th style='padding:7px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6B7280'>Date</th>" +
              "<th style='padding:7px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6B7280'>Method</th>" +
              "<th style='padding:7px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6B7280'>Reference</th>" +
              "<th style='padding:7px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6B7280'>Amount (TZS)</th>" +
            "</tr>" + payRows +
          "</table></div>"
        :"") +

        // Bank details / payment instructions
        (co.bankName?
          "<div class='bank-section'>" +
          "<div class='bank-title'>Payment Details</div>" +
          "<div class='bank-row'>" +
            (co.bankName?"<div class='bank-field'><div class='bank-label'>Bank</div><div class='bank-value'>" + co.bankName + "</div></div>":"") +
            (co.bankAccount?"<div class='bank-field'><div class='bank-label'>Account Number</div><div class='bank-value' style='font-family:monospace'>" + co.bankAccount + "</div></div>":"") +
            (co.bankBranch?"<div class='bank-field'><div class='bank-label'>Branch</div><div class='bank-value'>" + co.bankBranch + "</div></div>":"") +
            (co.mpesa?"<div class='bank-field'><div class='bank-label'>M-Pesa / Mobile Money</div><div class='bank-value' style='font-family:monospace'>" + co.mpesa + "</div></div>":"") +
          "</div></div>"
        : "<div style='padding:16px 40px 20px;border-top:1px solid #F3F4F6'>" +
            "<div style='font-size:11.5px;color:#9CA3AF;text-align:center;font-style:italic'>" +
              "Please transfer payment to the account details provided by " + (co.name||"SMART MANAGER") + " · Quote invoice number " + doc.id + " as your reference." +
            "</div></div>") +

        // Notes
        (doc.notes?"<div class='notes-bar'><div><div style='font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9CA3AF;margin-bottom:4px'>Notes</div><div style='font-size:12.5px;color:#374151'>" + doc.notes + "</div></div></div>":"") +

        // Footer
        "<div class='footer'>" +
          "<div class='footer-note'>Thank you for your business · " + (co.name||"SMART MANAGER") + "</div>" +
          "<div style='display:flex;align-items:center;gap:12px'>" +
            qrSvg +
            "<div class='footer-brand'>SMART MANAGER</div>" +
          "</div>" +
        "</div>" +

      "</div>" +

      "<div class='toolbar no-print'>" +
        "<button class='btn btn-close' onclick='window.close()'>Close</button>" +
        "<button class='btn btn-print' onclick='window.print()'>Print / Save PDF</button>" +
      "</div>" +

      "</body></html>"
    );
    win.document.close();
    setTimeout(() => win.focus(), 200);
  }

  async function addDocument(form) {
    // ── Credit limit gate (invoices only) ─────────────────────────────────
    if (tab === "invoices" && crm?.rows) {
      const lead = crm.rows.find((l) => l.company?.toLowerCase() === form.customer.trim().toLowerCase());
      if (lead?.creditLimit > 0) {
        const outstanding = hooksByTab.invoices.rows
          .filter((i) => i.customer?.toLowerCase() === form.customer.trim().toLowerCase() && i.status !== "Paid")
          .reduce((s, i) => s + (lineTotal(i.items).total - (i.amountPaid || 0)), 0);
        const newTotal = lineTotal(form.items.filter((it) => it.name.trim())).total;
        if (outstanding + newTotal > lead.creditLimit) {
          notify(`Credit limit exceeded — ${form.customer}: outstanding TZS ${money(Math.round(outstanding))}k + new TZS ${money(Math.round(newTotal))}k exceeds limit TZS ${money(lead.creditLimit)}k.`, "error");
          return;
        }
      }
    }
    const draft = {
      id: `${idPrefix}-${Math.floor(1000 + Math.random() * 9000)}`,
      customer: form.customer,
      date: form.date,
      items: form.items.filter((it) => it.name.trim()),
      owner: form.owner || "Unassigned",
      ...(tab === "quotations" && { validUntil: form.secondaryDate, status: "Draft" }),
      ...(tab === "orders" && { quotationRef: form.reference || "—", status: "Pending", returns: [] }),
      ...(tab === "invoices" && { dueDate: form.secondaryDate, status: "Unpaid", amountPaid: 0, payments: [], orderRef: form.reference || "—" }),
    };

    hooksByTab[tab].setRows((prev) => [draft, ...prev]);
    notify(`${draft.id} created for ${draft.customer}`);
    setShowForm(false);
    // Fire the post-create dispatch for invoices so WA/Email panel slides up
    if (tab === "invoices") invoiceCreatedBus.push(draft);

    if (IS_CONFIGURED) {
      const table = { quotations: "sales_quotations", orders: "sales_orders", invoices: "sales_invoices" }[tab];
      const itemsTable = { quotations: "sales_quotation_items", orders: "sales_order_items", invoices: "sales_invoice_items" }[tab];
      const fk = { quotations: "quotation_id", orders: "order_id", invoices: "invoice_id" }[tab];
      try {
        const header = await sb(table).insert({
          doc_number: draft.id,
          customer: form.customer,
          issue_date: form.date,
          ...(tab === "quotations" && { valid_until: form.secondaryDate }),
          ...(tab === "orders" && { order_date: form.date }),
          ...(tab === "invoices" && { due_date: form.secondaryDate }),
        }).single().run();
        if (header?.id && draft.items.length) {
          await sb(itemsTable).insert(
            draft.items.map((it, i) => ({ [fk]: header.id, item_name: it.name, item_sku: it.sku || null, qty: it.qty, rate: it.rate, sort_order: i }))
          ).run();
        }
        // The optimistic row was created before the server assigned a UUID;
        // stitch it in now so later advance/delete calls target the right row.
        if (header?.id) {
          hooksByTab[tab].setRows((prev) => prev.map((d) => (d.id === draft.id ? { ...d, dbId: header.id } : d)));
        }
      } catch (e) {
        notify(`Document created locally, but saving to the server failed.`, "error");
      }
    }
  }

  // Mirrors POS returns exactly: the return is its own record, not a
  // mutation of the original order line, and it restocks the shared
  // inventory table immediately. Only items on a Fulfilled order — the
  // ones that actually shipped — are eligible.
  async function processOrderReturn(order, { items, reason }) {
    const returnRecord = { id: `RET-${Date.now()}`, reason, date: TODAY.toISOString().slice(0, 10), items };

    inventory.setRows((prev) => prev.map((it) => {
      const line = items.find((ri) => (ri.sku ? ri.sku === it.sku : ri.name.toLowerCase() === it.name.toLowerCase()));
      return line ? { ...it, qty: it.qty + line.qty } : it;
    }));

    hooksByTab.orders.setRows((prev) => prev.map((o) => (o.id === order.id ? { ...o, returns: [returnRecord, ...(o.returns || [])] } : o)));
    setSelected((s) => (s && s.id === order.id ? { ...s, returns: [returnRecord, ...(s.returns || [])] } : s));
    const refundValue = items.reduce((s, it) => s + it.qty * it.rate, 0);
    notify(`Return processed for ${order.id} — TZS ${money(Math.round(refundValue))}k, stock restocked`);

    if (IS_CONFIGURED && order.dbId) {
      try {
        const header = await sb("sales_order_returns").insert({ order_id: order.dbId, reason }).single().run();
        if (header?.id) {
          await sb("sales_order_return_items").insert(
            items.map((it) => ({ return_id: header.id, item_name: it.name, item_sku: it.sku || null, qty: it.qty, rate: it.rate }))
          ).run();
        }
        for (const it of items) {
          const invItem = inventory.rows.find((i) => (it.sku ? i.sku === it.sku : i.name.toLowerCase() === it.name.toLowerCase()));
          if (invItem) {
            await sb("inventory_items").eq("sku", invItem.sku).update({ qty_on_hand: invItem.qty + it.qty }).run();
            await sb("inventory_stock_movements").insert({ item_id: invItem.sku, movement: "In", qty: it.qty, reference: `${order.id} return` }).run();
          }
        }
      } catch (e) {
        notify("Return processed locally, but saving to the server failed.", "error");
      }
    }
  }

  const DOC_TABLE = { quotations: "sales_quotations", orders: "sales_orders", invoices: "sales_invoices" };

  async function advanceDocument(kind, id, nextStatus) {
    const doc = hooksByTab[kind].rows.find((d) => d.id === id);

    hooksByTab[kind].setRows((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      const patch = { status: nextStatus };
      if (kind === "invoices" && nextStatus === "Paid") patch.amountPaid = lineTotal(d.items).total;
      return { ...d, ...patch };
    }));
    setSelected((s) => {
      if (!s || s.id !== id) return s;
      const patch = { status: nextStatus };
      if (kind === "invoices" && nextStatus === "Paid") patch.amountPaid = lineTotal(s.items).total;
      return { ...s, ...patch };
    });

    // Fulfilling a sales order ships goods: deduct matching stock items from
    // the shared Inventory. Line items are matched by name — unmatched lines
    // (services, labor, install fees) are correctly left alone.
    if (kind === "orders" && nextStatus === "Fulfilled" && doc) {
      const deductions = [];
      inventory.setRows((prev) => prev.map((it) => {
        // SKU reference is authoritative; name match remains as the fallback
        // for legacy/free-text lines created before SKU linking existed.
        const line = doc.items.find((li) => (li.sku ? li.sku === it.sku : li.name.toLowerCase() === it.name.toLowerCase()));
        if (!line) return it;
        deductions.push({ sku: it.sku, qty: line.qty, prevQty: it.qty });
        return { ...it, qty: Math.max(0, it.qty - line.qty) };
      }));
      notify(deductions.length
        ? `${doc.id} fulfilled — ${deductions.length} stock item${deductions.length > 1 ? "s" : ""} deducted`
        : `${doc.id} fulfilled`);

      if (IS_CONFIGURED) {
        try {
          for (const d of deductions) {
            // SKU is a real unique column, so this eq is correct as-is.
            await sb("inventory_items").eq("sku", d.sku).update({ qty_on_hand: Math.max(0, d.prevQty - d.qty) }).run();
            await sb("inventory_stock_movements").insert({
              item_id: d.sku, movement: "Out", qty: d.qty, reference: `${doc.id} fulfilled`,
            }).run();
          }
        } catch (e) {
          notify("Stock deducted locally, but the server update failed.", "error");
        }
      }
    }

    if (IS_CONFIGURED && doc?.dbId) {
      try {
        const patch = { status: nextStatus };
        if (kind === "invoices" && nextStatus === "Paid" && doc) {
          patch.amount_paid = lineTotal(doc.items).total;
        }
        await sb(DOC_TABLE[kind]).eq("id", doc.dbId).update(patch).run();
      } catch (e) {
        notify("Couldn't save the status change to the server.", "error");
      }
    }
  }

  async function deleteDocument(kind, id) {
    const doc = hooksByTab[kind].rows.find((d) => d.id === id);
    hooksByTab[kind].setRows((prev) => prev.filter((d) => d.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && doc?.dbId) {
      try {
        await sb(DOC_TABLE[kind]).eq("id", doc.dbId).delete().run();
      } catch (e) {
        notify("Couldn't delete the document on the server.", "error");
      }
    }
  }

  return (
    <div className="space-y-5">
      {IS_CONFIGURED && errorByTab[tab] && (
        <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 text-[#EF4444] text-[12.5px] rounded-lg px-3.5 py-2.5">
          Couldn't reach Supabase ({errorByTab[tab]}) — showing last known data.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Sales</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            {tab === "subscriptions"
              ? `${subscriptions.rows.length} subscriptions · TZS ${money(subscriptions.rows.filter((s) => s.status === "Active").reduce((sum, s) => sum + s.amount, 0))}k active recurring value`
              : `${summary.count} ${tab} · TZS ${money(summary.sum)}k combined value`}
          </p>
        </div>
        {tab !== "subscriptions" && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0"
          >
            <Plus size={15} /> New {tab === "quotations" ? "Quotation" : tab === "orders" ? "Order" : "Invoice"}
          </button>
          <button onClick={() => downloadCSV("sales-" + tab, filtered, [{key:"id",label:"ID"},{key:"customer",label:"Customer"},{key:"date",label:"Date"},{key:"status",label:"Status"}])} className="flex items-center gap-1 text-[12.5px] font-medium text-slate-500 border border-slate-200 px-3 py-2 rounded-lg hover:border-[#16A34A] hover:text-[#16A34A] transition-colors"><Download size={13}/>CSV</button>
        )}
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {[...DOC_TABS, { id: "subscriptions", label: "Subscriptions", icon: Repeat }].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setQuery(""); }}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isActive ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "subscriptions" ? (
        <Subscriptions subscriptions={subscriptions} invoices={invoices} />
      ) : (
        <>
          {/* ── Quick analytics strip — visible on every Sales sub-tab ─── */}
          {tab === "invoices" && (() => {
            const invRows = invoices.rows;
            const statusData = [
              {name:"Paid",    value:invRows.filter(i=>i.status==="Paid").length,    fill:"#16A34A"},
              {name:"Partial", value:invRows.filter(i=>i.status==="Partial").length, fill:"#3B82F6"},
              {name:"Unpaid",  value:invRows.filter(i=>i.status==="Unpaid").length,  fill:"#F59E0B"},
              {name:"Overdue", value:invRows.filter(i=>i.status==="Overdue").length, fill:"#EF4444"},
            ].filter(d=>d.value>0);
            const topCust = Object.entries(
              invRows.reduce((m,inv)=>{m[inv.customer]=(m[inv.customer]||0)+lineTotal(inv.items||[]).total;return m;},{})
            ).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,val])=>({name:name.split(" ")[0],value:Math.round(val/1000)}));
            if (!statusData.length) return null;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                  <p className="text-[13px] font-semibold text-[#111827] mb-3">Invoice Status Breakdown</p>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={140}>
                      <PieChart><Pie data={statusData} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={30}>
                        {statusData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" invoices",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {statusData.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                  <p className="text-[13px] font-semibold text-[#111827] mb-3">Top 5 Customers by Revenue (TZS k)</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={topCust} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis type="number" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis dataKey="name" type="category" tick={{fontSize:10}} axisLine={false} tickLine={false} width={60}/>
                      <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Revenue"]}/>
                      <Bar dataKey="value" fill="#16A34A" radius={[0,4,4,0]} maxBarSize={16}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div />
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab}...`}
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium">{columnLabel[0]}</th>
              <SortableHeader label="Customer" field="customer" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} />
              <SortableHeader label="Date" field="date" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} />
              <th className="px-4 py-3 font-medium">{columnLabel[1]}</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Total (TZS 000)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loadingByTab[tab] ? (
              <SkeletonRows cols={7} />
            ) : (
              <>
                {filtered.map((doc) => {
                  const totals = lineTotal(doc.items);
                  const secondCol = tab === "quotations" ? doc.validUntil : tab === "orders" ? doc.quotationRef : doc.dueDate;
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setSelected({ ...doc, kind: tab })}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[#111827] font-medium">{doc.id}</td>
                      <td className="px-4 py-3 text-slate-700">{doc.customer}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono">{doc.date}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono">{secondCol}</td>
                      <td className="px-4 py-3"><DocStatusPill status={doc.status} /></td>
                      <td className="px-4 py-3 text-right font-mono">{money(totals.total)}</td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={15} className="text-slate-300 inline" />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && rows.length > 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-[13px]">
                      No {tab} match "{query}"
                    </td>
                  </tr>
                )}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={DOC_TABS.find((t) => t.id === tab)?.icon || FileText}
                        title={`No ${tab} yet`}
                        hint={`Create your first ${tab === "quotations" ? "quotation" : tab === "orders" ? "sales order" : "invoice"} and it will appear here with its full lifecycle tracked.`}
                        actionLabel={`New ${tab === "quotations" ? "Quotation" : tab === "orders" ? "Order" : "Invoice"}`}
                        onAction={() => setShowForm(true)}
                      />
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {selected && (
        <DocPanel
          doc={selected}
          onClose={() => setSelected(null)}
          onAdvance={(id, next) => advanceDocument(selected.kind, id, next)}
          onDelete={(id) => deleteDocument(selected.kind, id)}
          onRecordPayment={(id, payment) => {
            const patch = recordPayment(invoices, id, payment, `${currentUser.name} (${currentUser.role})`);
            if (patch) setSelected((s) => (s && s.id === id ? { ...s, ...patch } : s));
          }}
          onProcessReturn={(payload) => processOrderReturn(selected, payload)}
        />
      )}
      {showForm && (
        <DocFormPanel kind={tab} onClose={() => setShowForm(false)} onSubmit={addDocument} inventory={inventory} />
      )}
        </>
      )}
    </div>
  );
}

export function DocPanel({ doc, onClose, onAdvance, onDelete, onRecordPayment, onProcessReturn }) {
  // Escape key closes the panel — WCAG 2.1 SC 2.1.2 (keyboard trap) and
  // basic quality-of-life for keyboard users. Added here because DocPanel
  // is the highest-traffic slide-over in the system (Sales, Finance, Procurement).
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const { subtotal, tax, total } = lineTotal(doc.items);
  const kindLabel = { quotations: "Quotation", orders: "Sales Order", invoices: "Invoice" }[doc.kind];
  const isInvoice = doc.kind === "invoices";
  const isFulfilledOrder = doc.kind === "orders" && doc.status === "Fulfilled";
  const balance = isInvoice ? total - (doc.amountPaid || 0) : null;
  const nextStatus = DOC_STATUS_NEXT[doc.kind]?.[doc.status];
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [payRef, setPayRef] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [showPayLink, setShowPayLink] = useState(false);

  // Generate a payment reference number (M-Pesa / mobile money style)
  function genRef(method) {
    const prefix = {
      "Mobile Money":"MM","M-Pesa":"MP","Bank Transfer":"BT","Card":"CRD","Cheque":"CHQ"
    }[method] || "REF";
    const ts = Date.now().toString(36).toUpperCase().slice(-6);
    const rnd = Math.floor(Math.random()*10000).toString().padStart(4,"0");
    return prefix + ts + rnd;
  }
  function generatePaymentLink() {
    const ref = genRef(payMethod);
    setPayRef(ref);
    const link = "https://pay.businesssphere.co.tz/" + doc.id + "?ref=" + ref + "&amt=" + Math.round(balance) + "&method=" + encodeURIComponent(payMethod);
    if (navigator.clipboard) navigator.clipboard.writeText(link);
    setShowPayLink(true);
    notify("Payment link copied to clipboard · Ref: " + ref);
  }

  // No busy guard needed here, unlike POS checkout — this function has no
  // await inside it, so JavaScript's single-threaded execution already
  // guarantees it runs to completion, including closing the panel, before
  // the browser can process a second click at all. POS checkout's guard
  // is meaningful because completeSale() genuinely awaits a server call
  // mid-function, creating a real gap a second click could land in; this
  // function has no such gap to protect.
  function submitPayment() {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    const ref = payRef.trim() || genRef(payMethod);
    onRecordPayment(doc.id, { amount: Math.min(amt, balance), method: payMethod, date: TODAY.toISOString().slice(0, 10), reference: ref });
    setPayOpen(false);
    setPayAmount("");
    setPayRef("");
    setShowPayLink(false);
    notify("Payment recorded · Ref: " + ref);
  });
    setPayOpen(false);
    setPayAmount("");
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[460px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">{kindLabel}</p>
              <h2 className="text-[19px] font-semibold text-[#111827] font-mono mt-0.5">{doc.id}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {isInvoice && (
                <button onClick={() => printInvoice(doc)} title="Print invoice"
                  className="flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-[#16A34A] hover:border-[#16A34A] transition-colors">
                  <Printer size={13} /> Print
                </button>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-1" aria-label="Close">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <DocStatusPill status={doc.status} />
            <span className="text-[12px] text-slate-400 font-mono">{doc.date}</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex-1">
          <div className="mb-5">
            <p className="text-[11px] text-slate-400 mb-1">Billed to</p>
            <p className="text-[14px] font-medium text-[#111827]">{doc.customer}</p>
          </div>

          <div className="mb-5">
            <p className="text-[11px] text-slate-400 mb-2 uppercase tracking-wide">Line items</p>
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              {doc.items.map((it, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2.5 text-[13px] ${i !== doc.items.length - 1 ? "border-b border-slate-50" : ""}`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-slate-700 truncate">{it.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{it.qty} × {money(it.rate)}k</p>
                  </div>
                  <span className="font-mono text-[#111827] shrink-0">{money(it.qty * it.rate)}k</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono">TZS {money(subtotal)}k</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>VAT ({Math.round(TAX_RATE * 100)}%)</span>
              <span className="font-mono">TZS {money(tax)}k</span>
            </div>
            <div className="flex justify-between text-[#111827] font-semibold text-[14px] pt-1.5 border-t border-slate-100 mt-1.5">
              <span>Total</span>
              <span className="font-mono">TZS {money(total)}k</span>
            </div>
            <p className="text-[11px] text-slate-400 italic pt-0.5">{numberToWords(total * 1000)} shillings only</p>
            {isInvoice && (
              <>
                <div className="flex justify-between text-slate-500 pt-1">
                  <span>Amount paid</span>
                  <span className="font-mono">TZS {money(doc.amountPaid || 0)}k</span>
                </div>
                <div className={`flex justify-between font-semibold text-[13px] ${balance > 0 ? "text-[#EF4444]" : "text-[#16A34A]"}`}>
                  <span>Balance due</span>
                  <span className="font-mono">TZS {money(balance)}k</span>
                </div>
              </>
            )}
          </div>

          {isInvoice && payOpen && balance > 0 && (
            <div className="bg-[#F0FDF4] border border-[#16A34A]/20 rounded-xl p-4 mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-[#111827]">Record Payment</p>
                <span className="text-[12px] font-mono font-bold text-[#16A34A]">Balance: TZS {money(balance)}k</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">Amount (TZS k)</label>
                  <input type="number" min="0" max={balance} autoFocus className={inputClass} value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)} placeholder={"Up to "+money(balance)}/>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">Method</label>
                  <select className={inputClass} value={payMethod} onChange={(e) => { setPayMethod(e.target.value); setPayRef(""); setShowPayLink(false); }}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">
                  Reference No. <span className="text-[9px] font-normal normal-case">(M-Pesa code, bank ref, cheque no.)</span>
                </label>
                <div className="flex gap-2">
                  <input className={inputClass+" flex-1 font-mono tracking-wider"} value={payRef}
                    onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. QK12AB3456 · leave blank to auto-generate"/>
                  <button type="button" onClick={() => setPayRef(genRef(payMethod))}
                    className="px-3 py-2 text-[11px] font-bold border border-[#16A34A]/30 text-[#16A34A] rounded-lg hover:bg-[#16A34A]/5 whitespace-nowrap">
                    Auto ↻
                  </button>
                </div>
              </div>

              <button type="button" onClick={generatePaymentLink}
                className="w-full flex items-center justify-center gap-1.5 text-[12px] font-bold border border-[#2563EB]/30 text-[#2563EB] rounded-xl py-2.5 hover:bg-[#2563EB]/5 bg-white">
                🔗 Generate & Copy Online Payment Link
              </button>

              {showPayLink && payRef && (
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl px-3 py-2.5">
                  <p className="text-[10.5px] font-bold text-[#2563EB] mb-0.5">✓ Link copied — send to customer</p>
                  <p className="text-[10.5px] font-mono text-slate-600 break-all">pay.businesssphere.co.tz/{doc.id}?ref={payRef}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Ask customer to quote reference <strong>{payRef}</strong> when paying. Then confirm here.</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setPayOpen(false); setShowPayLink(false); setPayRef(""); }}
                  className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 text-slate-500 hover:bg-slate-100">Cancel</button>
                <button type="button" onClick={submitPayment} disabled={!Number(payAmount)||Number(payAmount)<=0}
                  className="flex-1 text-[12.5px] font-bold btn-primary text-white rounded-lg py-2.5 disabled:opacity-40">✓ Confirm</button>
              </div>
            </div>
          )}


          {isInvoice && (doc.payments || []).length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">Payment History</p>
              <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50">
                {doc.payments.map((p) => {
                  const icons={"Cash":"💵","Mobile Money":"📱","M-Pesa":"📱","Bank Transfer":"🏦","Cheque":"📝","Card":"💳"};
                  return (
                    <div key={p.id} className="px-3 py-3 hover:bg-slate-50/60">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#F0FDF4] flex items-center justify-center text-[16px] shrink-0">{icons[p.method]||"💰"}</div>
                          <div>
                            <p className="text-[13px] font-semibold text-[#111827]">{p.method}</p>
                            {p.reference && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-mono font-bold text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] px-2 py-0.5 rounded-md mt-0.5">
                                REF: {p.reference}
                              </span>
                            )}
                            <p className="text-[10.5px] text-slate-400 font-mono mt-0.5">{p.date}</p>
                          </div>
                        </div>
                        <span className="text-[14px] font-mono font-bold text-[#16A34A] shrink-0 pt-0.5">+TZS {money(p.amount)}k</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {doc.kind === "orders" && (doc.returns || []).length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] text-slate-400 mb-2 uppercase tracking-wide">Returns</p>
              <div className="border border-slate-100 rounded-lg overflow-hidden">
                {doc.returns.map((r) => {
                  const refund = r.items.reduce((s, it) => s + it.qty * it.rate, 0);
                  return (
                    <div key={r.id} className="px-3 py-2.5 text-[13px] border-b border-slate-50 last:border-0">
                      <div className="flex items-center justify-between">
                        <p className="text-slate-700">{r.reason}</p>
                        <span className="font-mono text-[#EF4444]">−{money(Math.round(refund))}k</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">{r.date} · {r.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col gap-2">
          {/* Quick Send row — WhatsApp + Email */}
          {isInvoice && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const co = window.__smartManagerCompany||{};
                  const total = lineTotal(doc.items||[]).total;
                  const msg = `Hello ${doc.customer},

*Invoice ${doc.id}* for *TZS ${money(Math.round(total))}* is ready.
Due: *${doc.dueDate||"On receipt"}*
Ref: *${doc.id}*

Thank you!
_${co.name||"SMART MANAGER"}_`;
                  const phone = (doc.customerPhone||"").replace(/[^0-9]/g,"");
                  if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank","noopener");
                  else { waBus.push({templateId:"invoice",vars:{docId:doc.id,amount:money(Math.round(total)),dueDate:doc.dueDate||"On receipt",ref:doc.id}}); notify("Open Collaboration → WhatsApp to send"); }
                  notify("WhatsApp pre-filled with invoice details");
                }}
                className="flex-1 flex items-center justify-center gap-1.5 text-[11.5px] font-bold text-white rounded-lg py-2"
                style={{background:"#25D366"}}>
                <MessageCircle size={13}/> WhatsApp
              </button>
              <button
                onClick={() => {
                  const co = window.__smartManagerCompany||{};
                  const total = lineTotal(doc.items||[]).total;
                  const subj  = encodeURIComponent(`Invoice ${doc.id} from ${co.name||"SMART MANAGER"}`);
                  const body  = encodeURIComponent(`Dear ${doc.customer},

Please find your invoice ${doc.id} for TZS ${money(Math.round(total))}.
Due Date: ${doc.dueDate||"On receipt"}

Kind regards,
${co.name||"SMART MANAGER"}`);
                  const email = doc.customerEmail||"";
                  if (email) window.location.href=`mailto:${email}?subject=${subj}&body=${body}`;
                  else { emailBus.push({subject:`Invoice ${doc.id} from ${co.name||""}`,body:decodeURIComponent(body),tmpl:"invoice"}); notify("Open Collaboration → Email to send"); }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 text-[11.5px] font-bold text-white rounded-lg py-2 bg-[#2563EB]">
                <Mail size={13}/> Send Email
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
              <Printer size={13} /> Print
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
              <Download size={13} /> PDF
            </button>
            {isInvoice ? (
              balance > 0 ? (
                <button
                  onClick={() => { setPayAmount(String(balance)); setPayOpen((o) => !o); }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors"
                >
                  <CreditCard size={13} /> Record Payment
                </button>
              ) : (
                <span className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#16A34A] bg-[#16A34A]/8 rounded-lg py-2.5">
                  <CheckCircle2 size={13} /> Paid in full
                </span>
              )
            ) : isFulfilledOrder ? (
              <button
                onClick={() => setReturnOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/25 rounded-lg py-2.5 hover:bg-[#EF4444]/5 transition-colors"
              >
                <ArrowUpDown size={13} /> Process Return
              </button>
            ) : nextStatus && onAdvance ? (
              <button
                onClick={() => onAdvance(doc.id, nextStatus)}
                className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors"
              >
                Mark {nextStatus}
              </button>
            ) : (
              <button className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors">
                <Send size={13} /> Send
              </button>
            )}
          </div>
          {doc.kind === "quotations" && (
            <button onClick={() => { onAdvance(doc.id, "Accepted"); onClose(); }}
              className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-semibold border-2 border-[#16A34A] text-[#16A34A] hover:bg-[#F0FDF4] transition-colors flex items-center justify-center gap-2">
              <CheckCircle2 size={14} /> Convert to Invoice
            </button>
          )}
          {onDelete && <ConfirmDeleteButton label={`Delete ${kindLabel.toLowerCase()}`} onConfirm={() => onDelete(doc.id)} />}
        </div>
      </div>
      {returnOpen && (
        <OrderReturnFormPanel
          order={doc}
          onClose={() => setReturnOpen(false)}
          onSubmit={(payload) => { onProcessReturn(payload); setReturnOpen(false); }}
        />
      )}
    </div>
  );
}

export function OrderReturnFormPanel({ order, onClose, onSubmit }) {
  // How much of each line has already been returned, across every prior
  // return on this order — can't return more than what remains.
  const remaining = order.items.map((it) => {
    const alreadyReturned = (order.returns || []).reduce(
      (s, r) => s + (r.items.find((ri) => (it.sku ? ri.sku === it.sku : ri.name === it.name))?.qty || 0), 0
    );
    return { ...it, maxQty: it.qty - alreadyReturned };
  }).filter((it) => it.maxQty > 0);

  const [qtys, setQtys] = useState(() => Object.fromEntries(remaining.map((it) => [it.name, 0])));
  const [reason, setReason] = useState(RETURN_REASONS[0]);

  function setQty(name, val, max) {
    setQtys((q) => ({ ...q, [name]: Math.max(0, Math.min(max, val)) }));
  }

  const returnItems = remaining.filter((it) => qtys[it.name] > 0).map((it) => ({ sku: it.sku, name: it.name, qty: qtys[it.name], rate: it.rate }));
  const refundValue = returnItems.reduce((s, it) => s + it.qty * it.rate, 0);
  const valid = returnItems.length > 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{order.id}</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Process Return</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Select items and quantities to return</p>
            <div className="space-y-2.5">
              {remaining.map((it) => (
                <div key={it.name} className="flex items-center gap-2.5 border border-slate-100 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-[#111827] truncate">{it.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">Up to {it.maxQty} returnable · {money(it.rate)}k each</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" onClick={() => setQty(it.name, qtys[it.name] - 1, it.maxQty)} className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" aria-label={`Decrease ${it.name} return quantity`}><Minus size={11} /></button>
                    <span className="text-[12.5px] font-mono w-5 text-center">{qtys[it.name]}</span>
                    <button type="button" onClick={() => setQty(it.name, qtys[it.name] + 1, it.maxQty)} className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" aria-label={`Increase ${it.name} return quantity`}><Plus size={11} /></button>
                  </div>
                </div>
              ))}
              {remaining.length === 0 && <p className="text-[12.5px] text-slate-400">Every item on this order has already been returned.</p>}
            </div>
          </div>

          <FormField label="Reason">
            <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
              {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </FormField>

          {valid && (
            <div className="bg-slate-50 rounded-lg p-3 text-[13px]">
              <div className="flex justify-between font-semibold text-[#EF4444]"><span>Refund value</span><span className="font-mono">TZS {money(Math.round(refundValue))}k</span></div>
            </div>
          )}

          <p className="text-[11.5px] text-slate-400">Returned quantities are restocked to Inventory immediately.</p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="button" disabled={!valid} onClick={() => onSubmit({ items: returnItems, reason })} className="flex-1 text-[12px] font-medium bg-[#EF4444] text-white rounded-lg py-2.5 disabled:opacity-40 disabled:cursor-not-allowed">
            Refund TZS {money(Math.round(refundValue))}k
          </button>
        </div>
      </div>
    </div>
  );
}

export function DocFormPanel({ kind, onClose, onSubmit, inventory }) {
  const meta = {
    quotations: { label: "Quotation", secondaryLabel: "Valid until", refLabel: null },
    orders: { label: "Sales Order", secondaryLabel: null, refLabel: "Quotation reference" },
    invoices: { label: "Invoice", secondaryLabel: "Due date", refLabel: "Order reference" },
  }[kind];

  const [form, setForm] = useState({
    customer: "", date: TODAY.toISOString().slice(0, 10), secondaryDate: "", reference: "", owner: "",
    items: [{ name: "", qty: 1, rate: "" }],
  });
  const [touched, setTouched] = useState(false);

  const usableItems = form.items.filter((it) => it.name.trim() && Number(it.rate) > 0);
  const valid = form.customer.trim() && usableItems.length > 0;
  const totals = usableItems.length ? lineTotal(usableItems.map((it) => ({ ...it, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0, discount: Number(it.discount) || 0 }))) : { subtotal: 0, tax: 0, total: 0 };

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }
  function setItem(i, key, val) {
    setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)) }));
  }
  // Typing (or picking from the datalist) an exact inventory item name links
  // the line to that SKU and pre-fills the rate from unit cost. Free-text
  // lines (services, labor) simply stay unlinked — that's valid too.
  function setItemName(i, val) {
    const match = inventory.rows.find((it) => it.name.toLowerCase() === val.toLowerCase());
    setForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => {
        if (idx !== i) return it;
        const next = { ...it, name: val, sku: match?.sku || null };
        if (match && !String(it.rate).trim()) next.rate = match.unitCost;
        return next;
      }),
    }));
  }
  function addItemRow() {
    setForm((f) => ({ ...f, items: [...f.items, { name: "", qty: 1, rate: "", sku: null }] }));
  }
  function removeItemRow(i) {
    setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit({
      ...form,
      items: usableItems.map((it) => ({ name: it.name, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0, sku: it.sku || null })),
    });
  }


  // Discount savings total
  const discountSavings = usableItems.reduce((s, it) => {
    const base = (Number(it.qty)||0) * (Number(it.rate)||0);
    const disc = Math.min(100, Math.max(0, Number(it.discount)||0));
    return s + base * (disc/100);
  }, 0);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:w-[460px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col"
        style={{ animation: "slideIn .15s ease-out" }}
      >
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sales</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New {meta.label}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Customer" required>
            <input className={inputClass} value={form.customer} onChange={(e) => set("customer", e.target.value)} placeholder="e.g. Baraka Hotels & Resorts" />
            {touched && !form.customer.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Customer is required.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={kind === "orders" ? "Order date" : "Issue date"}>
              <input type="date" className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </FormField>
            {meta.secondaryLabel && (
              <FormField label={meta.secondaryLabel} required={kind === "invoices"}>
                <input type="date" className={inputClass} value={form.secondaryDate} onChange={(e) => set("secondaryDate", e.target.value)} />
              </FormField>
            )}
          </div>

          {meta.refLabel && (
            <FormField label={meta.refLabel}>
              <input className={inputClass} value={form.reference} onChange={(e) => set("reference", e.target.value)} placeholder="e.g. QT-1040" />
            </FormField>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-medium text-slate-600">Line items <span className="text-[#EF4444]">*</span></label>
              <button type="button" onClick={addItemRow} className="text-[11.5px] font-medium text-[#16A34A] hover:text-[#15803D] flex items-center gap-1">
                <Plus size={12} /> Add item
              </button>
            </div>
            <datalist id="inventory-item-names">
              {inventory.rows.map((it) => <option key={it.sku} value={it.name} />)}
            </datalist>
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div key={i}>
                  <div className="flex gap-2 items-start">
                    <input
                      className={`${inputClass} flex-1`}
                      value={it.name}
                      onChange={(e) => setItemName(i, e.target.value)}
                      placeholder="Item / service name"
                      list="inventory-item-names"
                    />
                    <input
                      type="number" min="0" className={`${inputClass} w-16`}
                      value={it.qty}
                      onChange={(e) => setItem(i, "qty", e.target.value)}
                      placeholder="Qty"
                    />
                    <input
                      type="number" min="0" className={`${inputClass} w-24`}
                      value={it.rate}
                      onChange={(e) => setItem(i, "rate", e.target.value)}
                      placeholder="Rate (k)"
                    />
                    <div className="relative w-16">
                      <input
                        type="number" min="0" max="100"
                        className={`${inputClass} w-full pr-5`}
                        value={it.discount || ""}
                        onChange={(e) => setItem(i, "discount", e.target.value)}
                        placeholder="0"
                        title="Discount %"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">%</span>
                    </div>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItemRow(i)} className="text-slate-300 hover:text-[#EF4444] mt-2.5 shrink-0" aria-label={`Remove line item ${i + 1}`}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {it.sku && (
                    <p className="text-[10.5px] text-[#16A34A] font-mono mt-1 ml-0.5 flex items-center gap-1">
                      <CheckCircle2 size={10} /> Linked to stock item {it.sku} — fulfillment will deduct inventory
                    </p>
                  )}
                </div>
              ))}
            </div>
            {touched && usableItems.length === 0 && (
              <p className="text-[11px] text-[#EF4444] mt-1.5">Add at least one item with a name and rate.</p>
            )}
          </div>

          {usableItems.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-[12.5px]">
              {discountSavings > 0 && (
                <div className="flex justify-between text-[#16A34A]"><span>Discount saved</span><span className="font-mono">- TZS {money(Math.round(discountSavings))}k</span></div>
              )}
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">TZS {money(totals.subtotal)}k</span></div>
              <div className="flex justify-between text-slate-500"><span>VAT ({Math.round(TAX_RATE * 100)}%)</span><span className="font-mono">TZS {money(totals.tax)}k</span></div>
              <div className="flex justify-between text-[#111827] font-semibold pt-1 border-t border-slate-200 mt-1"><span>Total</span><span className="font-mono">TZS {money(totals.total)}k</span></div>
            </div>
          )}

          <FormField label="Owner">
            <input className={inputClass} value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="e.g. J. Batenga" />
          </FormField>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors">
            Create {meta.label}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ SUBSCRIPTIONS ══════════════ */
/* ------------------------------ SUBSCRIPTIONS -------------------------------- */
export function Subscriptions({ subscriptions, invoices }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const { rows, setRows, loading } = subscriptions;

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((s) => s.customer.toLowerCase().includes(q) || s.plan.toLowerCase().includes(q));
  }, [rows, query]);

  async function addSubscription(form) {
    const draft = {
      id: docId("SUB"),
      customer: form.customer, plan: form.plan, amount: Number(form.amount) || 0, cycle: form.cycle,
      status: "Active", startDate: form.startDate, nextBillingDate: form.startDate,
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Subscription created: ${draft.plan} for ${draft.customer}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("sales_subscriptions").insert({
          doc_number: draft.id, customer: draft.customer, plan: draft.plan, amount: draft.amount,
          cycle: draft.cycle, status: "Active", start_date: draft.startDate, next_billing_date: draft.startDate,
        }).single().run();
        if (header?.id) setRows((prev) => prev.map((s) => (s.id === draft.id ? { ...s, dbId: header.id } : s)));
      } catch (_e) { notify("Subscription created locally, but saving to the server failed.", "error"); }
    }
  }

  async function setStatus(id, status) {
    const sub = rows.find((s) => s.id === id);
    setRows((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    setSelected((s) => (s && s.id === id ? { ...s, status } : s));
    if (IS_CONFIGURED && sub?.dbId) {
      try { await sb("sales_subscriptions").eq("id", sub.dbId).update({ status }).run(); } catch (_e) { notify("Couldn't save the subscription status to the server.", "error"); }
    }
  }

  async function deleteSubscription(id) {
    const sub = rows.find((s) => s.id === id);
    setRows((prev) => prev.filter((s) => s.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && sub?.dbId) {
      try { await sb("sales_subscriptions").eq("id", sub.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the subscription on the server.", "error"); }
    }
  }

  // Generating an invoice from a subscription creates a real row in the
  // shared Sales invoices table — same shape, same lifecycle, same
  // Finance visibility as one created by hand — and advances the
  // subscription's own next billing date by one cycle.
  async function generateInvoice(sub) {
    const draft = {
      id: docId("INV"),
      customer: sub.customer, date: TODAY.toISOString().slice(0, 10),
      dueDate: (() => { const d = new Date(TODAY); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); })(),
      orderRef: "—", status: "Unpaid", amountPaid: 0, payments: [],
      items: [{ name: `${sub.plan} (${sub.cycle})`, qty: 1, rate: Math.round(sub.amount / (1 + TAX_RATE)) }],
    };
    invoices.setRows((prev) => [draft, ...prev]);

    const nextDate = addCycle(sub.nextBillingDate, sub.cycle);
    setRows((prev) => prev.map((s) => (s.id === sub.id ? { ...s, nextBillingDate: nextDate } : s)));
    setSelected((s) => (s && s.id === sub.id ? { ...s, nextBillingDate: nextDate } : s));
    notify(`${draft.id} generated for ${sub.customer} — next billing ${nextDate}`);

    if (IS_CONFIGURED) {
      try {
        const header = await sb("sales_invoices").insert({
          doc_number: draft.id, customer: draft.customer, issue_date: draft.date, due_date: draft.dueDate,
        }).single().run();
        if (header?.id) {
          await sb("sales_invoice_items").insert([{ invoice_id: header.id, item_name: draft.items[0].name, qty: 1, rate: draft.items[0].rate, sort_order: 0 }]).run();
          invoices.setRows((prev) => prev.map((d) => (d.id === draft.id ? { ...d, dbId: header.id } : d)));
        }
        if (sub.dbId) await sb("sales_subscriptions").eq("id", sub.dbId).update({ next_billing_date: nextDate }).run();
      } catch (_e) { notify("Invoice generated locally, but saving to the server failed.", "error"); }
    }
  }


  // ── Subscription Analytics ────────────────────────────────────────────
  const active    = rows.filter(r => r.status === "Active");
  const paused    = rows.filter(r => r.status === "Paused");
  const cancelled = rows.filter(r => r.status === "Cancelled");

  const MRR = active.reduce((s,r) => {
    const mo = {Monthly:1, Quarterly:3, Annual:12}[r.cycle] || 1;
    return s + (r.amount / mo);
  }, 0);
  const ARR  = MRR * 12;
  const avgRev = active.length ? Math.round(MRR / active.length) : 0;

  // Due for billing in next 7 days
  const dueSoon = active.filter(r => {
    if (!r.nextBillingDate) return false;
    const diff = Math.ceil((new Date(r.nextBillingDate) - TODAY) / 86400000);
    return diff >= 0 && diff <= 7;
  });

  // Revenue by plan type
  const byPlan = Object.entries(
    active.reduce((m, r) => {
      const mo = {Monthly:1, Quarterly:3, Annual:12}[r.cycle] || 1;
      m[r.plan] = (m[r.plan] || 0) + r.amount / mo;
      return m;
    }, {})
  ).sort((a,b) => b[1]-a[1]).slice(0,6).map(([name,value],i) => ({
    name: name.length>16 ? name.slice(0,14)+"…" : name,
    value: Math.round(value),
    fill: ["#2563EB","#16A34A","#7C3AED","#F59E0B","#EF4444","#0891B2"][i%6],
  }));

  // Status breakdown
  const statusChart = [
    {name:"Active",    value:active.length,    fill:"#16A34A"},
    {name:"Paused",    value:paused.length,    fill:"#F59E0B"},
    {name:"Cancelled", value:cancelled.length, fill:"#EF4444"},
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subscriptions..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
          />
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0"
        >
          <Plus size={15} /> New Subscription
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Subscription</th>
                <th className="px-4 py-3 font-medium">Cycle</th>
                <th className="px-4 py-3 font-medium">Next Billing</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Amount (TZS 000)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={6} />}
              {!loading && filtered.map((s) => (
                <tr key={s.id} onClick={() => setSelected(s)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#111827]">{s.plan}</p>
                    <p className="text-[11px] text-slate-400">{s.customer} · {s.id}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{s.cycle}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono">{s.nextBillingDate}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                      style={{ backgroundColor: `${SUBSCRIPTION_STATUS_COLOR[s.status]}14`, color: SUBSCRIPTION_STATUS_COLOR[s.status] }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SUBSCRIPTION_STATUS_COLOR[s.status] }} />
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{money(s.amount)}</td>
                  <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-slate-300 inline" /></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && rows.length > 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-[13px]">No subscriptions match "{query}"</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Repeat}
                      title="No subscriptions yet"
                      hint="Recurring service contracts and maintenance plans live here — generate an invoice for the current cycle with one click when it's due."
                      actionLabel="New Subscription"
                      onAction={() => setShowForm(true)}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <SubscriptionPanel
          subscription={selected}
          onClose={() => setSelected(null)}
          onSetStatus={setStatus}
          onDelete={deleteSubscription}
          onGenerateInvoice={generateInvoice}
        />
      )}
      {showForm && <SubscriptionFormPanel onClose={() => setShowForm(false)} onSubmit={addSubscription} />}
    </div>
  );
}

export function SubscriptionPanel({ subscription, onClose, onSetStatus, onDelete, onGenerateInvoice }) {
  const isOverdue = subscription.status === "Active" && subscription.nextBillingDate < TODAY.toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-mono text-slate-400">{subscription.id}</p>
            <h2 className="text-[17px] font-semibold text-[#111827] mt-0.5 leading-snug">{subscription.plan}</h2>
            <p className="text-[13px] text-slate-500">{subscription.customer}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mb-6">
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{ backgroundColor: `${SUBSCRIPTION_STATUS_COLOR[subscription.status]}14`, color: SUBSCRIPTION_STATUS_COLOR[subscription.status] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SUBSCRIPTION_STATUS_COLOR[subscription.status] }} />
            {subscription.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Amount</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">TZS {money(subscription.amount)}k</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Cycle</p>
            <p className="text-[15px] font-semibold text-[#111827]">{subscription.cycle}</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-6">
          <p className="text-[11px] text-slate-400 mb-1">Next billing date</p>
          <p className={`text-[15px] font-mono font-semibold ${isOverdue ? "text-[#F59E0B]" : "text-[#111827]"}`}>
            {subscription.nextBillingDate}{isOverdue && " — due"}
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-6">
          <Clock size={14} className="text-slate-400" /> Started {subscription.startDate}
        </div>

        <div className="flex-1" />

        <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
          {subscription.status === "Active" && (
            <button
              onClick={() => onGenerateInvoice(subscription)}
              className="btn-primary text-white text-[12px] font-medium rounded-lg py-2.5 flex items-center justify-center gap-1.5"
            >
              <ReceiptText size={13} /> Generate Invoice Now
            </button>
          )}
          <div className="flex gap-2">
            {subscription.status !== "Active" && (
              <button onClick={() => onSetStatus(subscription.id, "Active")} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2 hover:bg-slate-50">Resume</button>
            )}
            {subscription.status === "Active" && (
              <button onClick={() => onSetStatus(subscription.id, "Paused")} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2 hover:bg-slate-50">Pause</button>
            )}
            {subscription.status !== "Cancelled" && (
              <button onClick={() => onSetStatus(subscription.id, "Cancelled")} className="flex-1 text-[12px] font-medium border border-[#EF4444]/25 text-[#EF4444] rounded-lg py-2 hover:bg-[#EF4444]/5">Cancel</button>
            )}
          </div>
          <ConfirmDeleteButton label="Delete subscription" onConfirm={() => onDelete(subscription.id)} />
        </div>
      </div>
    </div>
  );
}

export function SubscriptionFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ customer: "", plan: "", amount: "", cycle: "Monthly", startDate: TODAY.toISOString().slice(0, 10) });
  const [touched, setTouched] = useState(false);
  const valid = form.customer.trim() && form.plan.trim() && Number(form.amount) > 0;

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sales</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Subscription</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Customer" required>
            <input className={inputClass} value={form.customer} onChange={(e) => set("customer", e.target.value)} placeholder="e.g. Meridian Logistics" />
            {touched && !form.customer.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Customer is required.</p>}
          </FormField>

          <FormField label="Plan name" required>
            <input className={inputClass} value={form.plan} onChange={(e) => set("plan", e.target.value)} placeholder="e.g. Fleet GPS Monitoring" />
            {touched && !form.plan.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Plan name is required.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Amount (TZS 000)" required>
              <input type="number" min="0" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
              {touched && !(Number(form.amount) > 0) && <p className="text-[11px] text-[#EF4444] mt-1">Enter an amount.</p>}
            </FormField>
            <FormField label="Billing cycle">
              <select className={inputClass} value={form.cycle} onChange={(e) => set("cycle", e.target.value)}>
                {SUBSCRIPTION_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Start date">
            <input type="date" className={inputClass} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </FormField>

          <p className="text-[11.5px] text-slate-400">
            The first invoice isn&apos;t generated automatically — open the subscription and click Generate Invoice when the cycle is due.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" className="flex-1 btn-primary text-white text-[12px] font-medium rounded-lg py-2.5">Create Subscription</button>
        </div>
      </form>
    </div>
  );
}
