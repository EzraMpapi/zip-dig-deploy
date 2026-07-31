import { useCallback, useEffect, useState } from "react";
import { generateBarcode } from "../lib/format.jsx";
import { DEMO_OVERRIDE, IS_CONFIGURED, sb } from "../lib/supabase.jsx";

export function useCompanyTable(table, seed, { select = "*", order, mapRow } = {}) {
  // Demo mode serves the seed instantly. Live mode starts empty and loading —
  // flashing demo rows and then swapping them for real data reads as a glitch.
  // isLive folds in DEMO_OVERRIDE too — a person previewing the demo despite
  // real credentials being configured should see the same instant, honest
  // seed data as someone with no Supabase project connected at all, not a
  // broken screen quietly trying to fetch real data with no real session.
  const isLive = IS_CONFIGURED && !DEMO_OVERRIDE;
  const [rows, setRows] = useState(isLive ? [] : seed);
  const [loading, setLoading] = useState(isLive);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    setError(null);
    try {
      // Company scoping is enforced entirely by RLS's current_company_id()
      // (reading the real authenticated session — see section 32 of the
      // handover doc), not filtered again here. A hardcoded ACTIVE_COMPANY_ID
      // constant could never correctly scope queries once real multi-user
      // login exists — different signed-in users belong to different
      // companies, so the one thing that must never happen is the client
      // supplying its own company_id filter; RLS is the single source of
      // truth for which rows a given session can see.
      let q = sb(table).select(select);
      if (order) q = q.order(order.col, { ascending: order.ascending });
      const data = await q.run();
      // mapRow translates the database's snake_case/UUID-keyed shape into
      // the UI's camelCase shape (see mapRow functions below). Every mapped
      // row keeps its real UUID on `dbId` so mutation handlers can target
      // the correct database row even though the UI displays a friendlier
      // id. Tables without a mapper pass through unchanged (demo-only tables).
      setRows(mapRow ? data.map(mapRow) : data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [table, select, order, mapRow]);

  useEffect(() => { reload(); }, [reload]);

  return { rows, setRows, loading, error, reload };
}

export function mapLeadRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.contact_name, company: r.company_name, stage: r.stage,
    value: Number(r.value_amount) || 0, currency: r.currency || "TZS000",
    owner: r.owner_id || "Unassigned", email: r.email || "", phone: r.phone || "",
    industry: r.industry || "General", score: r.score ?? 50,
    lastActivity: r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString() : "—",
    expectedCloseDate: r.expected_close_date || null,
  };
}

export function mapContactRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, title: r.title || "", company: r.company, email: r.email || "", phone: r.phone || "", isPrimary: r.is_primary,
  };
}

export function mapInventoryRow(r) {
  return {
    sku: r.sku, dbId: r.id,
    name: r.name, category: r.category || "General", warehouse: r.warehouse_id,
    qty: Number(r.qty_on_hand) || 0, reorder: Number(r.reorder_level) || 0,
    unitCost: Number(r.unit_cost) || 0, unit: r.unit || "unit",
    barcode: r.barcode || generateBarcode(r.sku), expiryDate: r.expiry_date || null,
  };
}

export function mapWarehouseRow(r) {
  return { id: r.id, dbId: r.id, name: r.name, city: r.city || "" };
}

export function mapTransferRow(r) {
  return {
    id: r.id, dbId: r.id,
    sku: r.item_sku, itemName: r.item_name, qty: Number(r.qty) || 0,
    fromWarehouse: r.from_warehouse, toWarehouse: r.to_warehouse,
    status: r.status, date: r.created_at?.slice(0, 10), notes: r.notes || "",
  };
}

export function mapBatchRow(r) {
  return {
    id: r.id, dbId: r.id,
    sku: r.item_sku, itemName: r.item_name, batchNumber: r.batch_number,
    qty: Number(r.qty) || 0, expiryDate: r.expiry_date, warehouse: r.warehouse_id,
    supplier: r.supplier_name || "", receivedDate: r.received_date,
  };
}

export function mapSupplierRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, contactPerson: r.contact_person || "", email: r.email || "", phone: r.phone || "",
    category: r.category || "", leadTimeDays: Number(r.lead_time_days) || 0, status: r.status,
  };
}

export function mapPoItems(items) {
  return (items || []).map((it) => ({ sku: it.item_sku, name: it.item_name, qty: Number(it.qty) || 0, cost: Number(it.cost) || 0 }));
}

export function mapPurchaseOrderRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    supplier: r.supplier, status: r.status, orderDate: r.order_date, expectedDate: r.expected_date,
    requestedBy: r.requested_by || "", items: mapPoItems(r.purchase_order_items),
  };
}

export function mapProcurementContractRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    supplier: r.supplier, type: r.contract_type, startDate: r.start_date, endDate: r.end_date,
    value: Number(r.value) || 0, notes: r.notes || "",
  };
}

export function mapExpenseRow(r) {
  return {
    id: r.id, dbId: r.id,
    vendor: r.vendor, category: r.category, date: r.expense_date, dueDate: r.due_date || r.expense_date,
    amount: Number(r.amount) || 0, status: r.status, method: r.method || "",
  };
}

export function mapAssetRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, category: r.category, acquisitionDate: r.acquisition_date,
    cost: Number(r.cost) || 0, usefulLifeYears: Number(r.useful_life_years) || 5,
  };
}

// Shared by all three sales documents: PostgREST returns the child items
// table as a nested array keyed by its own table name when the select
// string embeds it (e.g. "*,sales_invoice_items(*)").
export function mapDocItems(items) {
  return (items || [])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it) => ({ name: it.item_name, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0, sku: it.item_sku || null }));
}

export function mapQuotationRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    customer: r.customer, date: r.issue_date, validUntil: r.valid_until,
    status: r.status, owner: r.owner_id || "Unassigned",
    items: mapDocItems(r.sales_quotation_items),
  };
}

export function mapOrderReturnRow(rr) {
  return {
    id: rr.id, reason: rr.reason, date: rr.created_at?.slice(0, 10),
    items: (rr.sales_order_return_items || []).map((it) => ({ name: it.item_name, sku: it.item_sku, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0 })),
  };
}

export function mapOrderRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    customer: r.customer, date: r.order_date, quotationRef: r.quotation_id ? "linked" : "—",
    status: r.status, owner: r.owner_id || "Unassigned",
    items: mapDocItems(r.sales_order_items),
    returns: (r.sales_order_returns || []).map(mapOrderReturnRow),
  };
}

export function mapPaymentRow(r) {
  return { id: r.id, amount: Number(r.amount) || 0, method: r.method, date: r.payment_date, reference: r.reference || null };
}

export function mapInvoiceRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    customer: r.customer, date: r.issue_date, dueDate: r.due_date,
    orderRef: r.order_id ? "linked" : "—", status: r.status,
    amountPaid: Number(r.amount_paid) || 0,
    items: mapDocItems(r.sales_invoice_items),
    payments: (r.sales_payments || []).map(mapPaymentRow).sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

export function mapSubscriptionRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    customer: r.customer, plan: r.plan, amount: Number(r.amount) || 0, cycle: r.cycle,
    status: r.status, startDate: r.start_date, nextBillingDate: r.next_billing_date,
  };
}

export function mapEmployeeRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.full_name, role: r.role, department: r.department || "General",
    email: r.email || "", phone: r.phone || "", status: r.status,
    salary: Number(r.salary) || 0, hireDate: r.hire_date,
    contractType: r.contract_type || "Permanent", contractEndDate: r.contract_end_date,
  };
}

// Leave requests store employee_id (a real FK); the embedded select
// "*,hr_employees(full_name)" brings the name along so the UI never has
// to do a second lookup or show a bare UUID.
export function mapLeaveRow(r) {
  return {
    id: r.id, dbId: r.id,
    employee: r.hr_employees?.full_name || "Unknown",
    type: r.leave_type, startDate: r.start_date, endDate: r.end_date, status: r.status,
  };
}

export function mapCandidateRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, role: r.role, department: r.department, stage: r.stage,
    email: r.email || "", appliedDate: r.applied_date,
  };
}

export function mapAttendanceRow(r) {
  return {
    id: r.id, dbId: r.id,
    employee: r.hr_employees?.full_name || r.employee_name || "Unknown",
    date: r.attendance_date, status: r.status,
    clockIn: r.clock_in || null, clockOut: r.clock_out || null,
    verified:  r.verified    || false,   // true = signed via WebAuthn biometric
    sigMethod: r.sig_method  || "none",  // "biometric" | "unsigned" | "none"
    location:  r.location    || null,
    deviceId:  r.device_id   || null,
  };
}

export function mapPerformanceRow(r) {
  return {
    id: r.id, dbId: r.id,
    employee: r.hr_employees?.full_name || r.employee_name || "Unknown",
    period: r.period, rating: r.rating, reviewer: r.reviewer, notes: r.notes || "", date: r.review_date,
  };
}

export function mapTrainingRow(r) {
  return {
    id: r.id, dbId: r.id,
    employee: r.hr_employees?.full_name || r.employee_name || "Unknown",
    course: r.course, status: r.status, completionDate: r.completion_date,
    mandatory: !!r.is_mandatory, compliance: !!r.is_compliance,
    dueDate: r.due_date || null, videoUrl: r.video_url || null,
  };
}

export function mapBenefitRow(r) {
  return {
    id: r.id, dbId: r.id,
    employee: r.hr_employees?.full_name || r.employee_name || "Unknown",
    type: r.benefit_type, monthlyValue: Number(r.monthly_value) || 0, status: r.status, enrollmentDate: r.enrollment_date,
  };
}

export function mapPayrollRunRow(r) {
  return {
    id: r.id, dbId: r.id,
    period: r.period, employeeCount: r.employee_count, totalAmount: Number(r.total_amount) || 0,
    status: r.status, processedDate: r.processed_date,
  };
}

export function mapBomComponents(components) {
  return (components || []).map((c) => ({ sku: c.item_sku, qty: Number(c.qty) || 0 }));
}

export function mapBomRow(r) {
  return {
    id: r.id, dbId: r.id,
    product: r.product_name, outputUnit: r.output_unit, laborCost: Number(r.labor_cost) || 0,
    components: mapBomComponents(r.manufacturing_bom_components),
  };
}

export function mapMachineRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, type: r.machine_type || "", warehouse: r.warehouse_id, status: r.status, purchaseDate: r.purchase_date,
  };
}

export function mapQcInspectionRow(r) {
  return {
    id: r.id, dbId: r.id,
    workOrderId: r.work_order_ref, inspector: r.inspector, result: r.result,
    defectsFound: Number(r.defects_found) || 0, notes: r.notes || "", date: r.inspection_date,
  };
}

export function mapMaintenanceRow(r) {
  return {
    id: r.id, dbId: r.id,
    machine: r.machine_name, type: r.maintenance_type, technician: r.technician || "",
    date: r.maintenance_date, cost: Number(r.cost) || 0, notes: r.notes || "", nextDueDate: r.next_due_date,
  };
}

export function mapProjectRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, client: r.client, status: r.status, startDate: r.start_date, endDate: r.end_date,
    budget: Number(r.budget) || 0, manager: r.manager || "",
  };
}

export function mapProjectTaskRow(r) {
  return {
    id: r.id, dbId: r.id,
    projectId: r.project_ref, title: r.title, assignee: r.assignee || "", status: r.status,
    priority: r.priority, dueDate: r.due_date,
  };
}

export function mapMilestoneRow(r) {
  return {
    id: r.id, dbId: r.id,
    projectId: r.project_ref, title: r.title, dueDate: r.due_date, completed: r.completed,
  };
}

export function mapProjectExpenseRow(r) {
  return {
    id: r.id, dbId: r.id,
    projectId: r.project_ref, description: r.description, amount: Number(r.amount) || 0, date: r.expense_date,
  };
}

export function mapTicketMessages(messages) {
  return (messages || []).map((m) => ({ from: m.sender, text: m.body, date: m.sent_at?.slice(0, 10) }));
}

export function mapTicketRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    subject: r.subject, customer: r.customer, category: r.category, priority: r.priority,
    status: r.status, assignee: r.assignee || "", createdDate: r.created_date,
    messages: mapTicketMessages(r.support_ticket_messages),
  };
}

export function mapChatMessages(messages) {
  return (messages || []).map((m) => ({ from: m.sender, text: m.body, time: m.sent_at }));
}

export function mapChatRow(r) {
  return {
    id: r.id, dbId: r.id,
    customer: r.customer, status: r.status, messages: mapChatMessages(r.support_chat_messages),
  };
}

export function mapKbArticleRow(r) {
  return {
    id: r.id, dbId: r.id,
    title: r.title, category: r.category, content: r.content, views: Number(r.views) || 0,
    published: r.published, updatedDate: r.updated_at?.slice(0, 10),
  };
}

export function mapCallLogRow(r) {
  return {
    id: r.id, dbId: r.id,
    customer: r.customer, agent: r.agent, direction: r.direction, duration: Number(r.duration_minutes) || 0,
    outcome: r.outcome, date: r.call_date, notes: r.notes || "",
  };
}

export function mapNotificationChannelRow(r) {
  return {
    id: r.channel_id, dbId: r.id, enabled: r.enabled,
    webhookUrl: r.webhook_url || "", fromAddress: r.from_address || "", fromNumber: r.from_number || "",
    businessNumber: r.business_number || "", serverKey: r.server_key || "",
  };
}

export function mapNotificationRuleRow(r) {
  return { id: r.alert_type, dbId: r.id, channels: r.channels || [] };
}

export function mapNotificationLogRow(r) {
  return {
    id: r.id, dbId: r.id, channel: r.channel, event: r.event, message: r.message,
    status: r.status, note: r.note || "", timestamp: r.created_at,
  };
}

export function mapAuditLogRow(r) {
  return { id: r.id, action: r.action, module: r.module, actor: r.actor, details: r.details || "", timestamp: r.created_at };
}

export function mapScheduledReportRow(r) {
  return {
    id: r.id, dbId: r.id, reportType: r.report_type, frequency: r.frequency, format: r.format,
    recipientEmail: r.recipient_email || "", status: r.status, lastRun: r.last_run,
  };
}

export function mapIntegrationConnectionRow(r) {
  return {
    id: r.integration_id, dbId: r.id, enabled: r.enabled,
    tenantId: r.tenant_id || "", clientId: r.client_id || "", paymentLink: r.payment_link || "", paypalMeLink: r.paypal_me_link || "",
    webhookUrl: r.webhook_url || "", apiKey: r.api_key || "", businessNumber: r.business_number || "", storeUrl: r.store_url || "", terminalId: r.terminal_id || "",
  };
}

export function mapSignatureRow(r) {
  return {
    id: r.id, dbId: r.id, documentRef: r.document_ref, signerName: r.signer_name,
    imageData: r.image_data, signedAt: r.signed_at,
  };
}

export function mapCustomKpiRow(r) {
  return { id: r.id, dbId: r.id, metricId: r.metric_id, label: r.label, target: Number(r.target_value) || 0 };
}

export function mapCompetitorRow(r) {
  return {
    id: r.id, dbId: r.id, name: r.name, category: r.category || "",
    threatLevel: r.threat_level, notes: r.notes || "", lastUpdated: r.updated_at?.slice(0, 10),
  };
}

export function mapBenchmarkRow(r) {
  return { id: r.id, dbId: r.id, metricId: r.metric_id, label: r.label, benchmarkValue: Number(r.benchmark_value) || 0 };
}

export function mapWorkflowRow(r) {
  return { id: r.id, dbId: r.id, name: r.name, trigger: r.trigger_type, enabled: r.enabled, steps: r.steps || [], condition: r.condition || null, lastRun: r.last_run };
}

export function mapCalendarEventRow(r) {
  return {
    id: r.id, dbId: r.id, title: r.title, type: r.event_type, date: r.event_date,
    startTime: r.start_time, endTime: r.end_time, meetingLink: r.meeting_link || "",
    attendees: r.attendees || "", description: r.description || "",
  };
}

export function mapCollabChannelRow(r) {
  return { id: r.id, dbId: r.id, name: r.name, scope: r.scope, description: r.description || "" };
}

export function mapCollabMessageRow(r) {
  return { id: r.id, dbId: r.id, channelId: r.channel_ref, sender: r.sender, text: r.body, timestamp: r.created_at };
}

export function mapWorkspaceRow(r) {
  return {
    id: r.id, dbId: r.id, name: r.name, department: r.department || "",
    members: r.members || "", channelId: r.channel_ref || "", description: r.description || "",
  };
}

export function mapMarketplaceTemplateRow(r) {
  return {
    id: r.id, dbId: r.id, name: r.name, description: r.description, category: r.category,
    trigger: r.trigger_type, steps: r.steps || [], publisherName: r.published_by_company_name || "Official",
    isOfficial: r.is_official, installCount: r.install_count || 0,
  };
}

// bom_id is a real FK into manufacturing_boms, and BOMs now have a full
// live CRUD (see BOMFormPanel) — closing the gap this comment used to
// describe. bomId carries the real UUID once a real project is connected;
// in demo mode it matches bomsSeed's "BOM-01"-style codes directly.
export function mapWorkOrderRow(r) {
  return {
    id: r.id, dbId: r.id,
    bomId: r.bom_id, product: r.product, qty: Number(r.qty) || 0, status: r.status,
    startDate: r.start_date, dueDate: r.due_date,
    assignedTo: r.profiles?.full_name || "Unassigned",
  };
}

export function mapVehicleRow(r) {
  return {
    reg: r.reg, dbId: r.id,
    type: r.vehicle_type || "", driver: r.driver || "", capacity: r.capacity || "", status: r.status,
  };
}

export function mapShipmentRow(r) {
  return {
    id: r.id, dbId: r.id,
    orderRef: r.order_ref || "—", customer: r.customer, destination: r.destination,
    vehicle: r.vehicle_reg, dispatchDate: r.dispatch_date, expectedDate: r.expected_date, status: r.status,
  };
}

// ecommerce_products only stores price/published/featured — name and
// category are looked up live from Inventory via the embedded select
// "*,inventory_items(name,category)", so a rename in Inventory is
// reflected on the storefront without touching this row at all.
export function mapProductRow(r) {
  return {
    sku: r.sku, dbId: r.id,
    name: r.inventory_items?.name || r.sku,
    category: r.inventory_items?.category || "General",
    price: Number(r.price) || 0, published: r.published, featured: r.featured,
  };
}

export function mapOnlineOrderItems(items) {
  return (items || []).map((it) => ({ name: it.item_name, qty: Number(it.qty) || 0, price: Number(it.price) || 0 }));
}

export function mapPosItems(items) {
  return (items || []).map((it) => ({ sku: it.item_sku, name: it.item_name, qty: Number(it.qty) || 0, price: Number(it.price) || 0 }));
}
