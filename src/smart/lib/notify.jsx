import { toastBus } from "../lib/buses.jsx";
import { mapOnlineOrderItems } from "../lib/mappers.jsx";

export function mapOnlineOrderRow(r) {
  return {
    id: r.doc_number, dbId: r.id,
    customer: r.customer_name, email: r.customer_email || "",
    items: mapOnlineOrderItems(r.ecommerce_order_items),
    total: Number(r.total) || 0, status: r.status, method: r.payment_method || "", date: r.order_date,
  };
}

export function mapFileRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, type: r.file_type, folder: r.folder, size: r.size_label || "—",
    uploadedBy: r.profiles?.full_name || "Unknown", date: r.created_at?.slice(0, 10),
    linkedRecord: r.linked_record || null, content: r.content || "", versions: r.versions || [],
  };
}

export function mapCampaignRow(r) {
  return {
    id: r.id, dbId: r.id,
    name: r.name, type: r.campaign_type, status: r.status, segment: r.segment,
    sentDate: r.sent_date, openRate: r.open_rate === null ? null : Number(r.open_rate),
    clickRate: r.click_rate === null ? null : Number(r.click_rate),
  };
}

export let toastSeq = 0;

export function notify(message, type = "success") {
  toastBus.push({ id: ++toastSeq, message, type });
}
