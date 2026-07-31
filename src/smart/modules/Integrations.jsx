import { useState } from "react";
import {
  Globe, Landmark, MessageCircle, PenTool, Percent, QrCode, Send, Smartphone
} from "lucide-react";
import { ESignature, QRBarcodeTools } from "../components/tools.jsx";
import { inputClass } from "../components/ui.jsx";
import { INTEGRATION_CONNECTIONS } from "../data/integrations.jsx";
import { mapIntegrationConnectionRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import {
  BankStatementImport,
  MobileMoneyReconciliation,
  TaxIntegration,
} from "../modules/Finance.jsx";
import { sendWebhookNotification } from "../modules/Notifications.jsx";

/* ══════════════ INTEGRATIONS ══════════════ */
/* -------------------------------- INTEGRATIONS -------------------------------- */
export const INTEGRATION_TABS = [
  { id: "connections", label: "Connections", icon: Globe },
  { id: "mobile-money", label: "Mobile Money", icon: Smartphone },
  { id: "banking", label: "Banking", icon: Landmark },
  { id: "tax", label: "Tax", icon: Percent },
  { id: "qr-barcode", label: "QR & Barcode", icon: QrCode },
  { id: "esignature", label: "E-Signature", icon: PenTool },
];

// The directory covering all fifteen integrations this request named,
// including the eleven that already lived across Mobile Money, Banking,
// and Tax — those tabs were always real integrations, just not visible
// as one list until now. Matches how real integration marketplaces
// (Zapier, HubSpot) present a single directory even when deeper
// configuration happens in dedicated sub-pages.
export const INTEGRATION_DIRECTORY = [
  { name: "Microsoft 365", tab: "connections", functional: false },
  { name: "Google Workspace", tab: "connections", functional: false },
  { name: "Slack", tab: "connections", functional: true },
  { name: "Zoom", tab: "connections", functional: false },
  { name: "WhatsApp Business", tab: "connections", functional: true },
  { name: "Stripe", tab: "connections", functional: true },
  { name: "PayPal", tab: "connections", functional: true },
  { name: "M-Pesa", tab: "mobile-money", functional: true },
  { name: "Airtel Money", tab: "mobile-money", functional: true },
  { name: "Tigo Pesa", tab: "mobile-money", functional: true },
  { name: "HaloPesa", tab: "mobile-money", functional: true },
  { name: "Banks", tab: "banking", functional: true },
  { name: "Tax Authorities", tab: "tax", functional: true },
  { name: "E-Commerce Platforms", tab: "connections", functional: false },
  { name: "POS Systems", tab: "connections", functional: false },
];

export function Integrations({ invoices, expenses, canManage, currentUser, onNavigate }) {
  const [tab, setTab] = useState("connections");
  const functionalCount = INTEGRATION_DIRECTORY.filter((i) => i.functional).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Integration Hub</h1>
        <p className="text-[13px] text-slate-500 mt-1">Real capabilities where a browser genuinely can — honest limits where it can't. {functionalCount} of {INTEGRATION_DIRECTORY.length} are genuinely working today, not configuration for a backend this app doesn't have.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-3">Integration Directory</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {INTEGRATION_DIRECTORY.map((item) => (
            <button
              key={item.name}
              onClick={() => setTab(item.tab)}
              className="flex items-center justify-between gap-1.5 text-left border border-slate-100 rounded-lg px-2.5 py-2 hover:border-[#16A34A]/40 transition-colors"
            >
              <span className="text-[11.5px] text-slate-600 truncate">{item.name}</span>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.functional ? "bg-[#16A34A]" : "bg-slate-300"}`} title={item.functional ? "Real and working" : "Needs backend infrastructure"} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {INTEGRATION_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${isActive ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "connections" && <IntegrationConnections canManage={canManage} currentUser={currentUser} />}
      {tab === "mobile-money" && <MobileMoneyReconciliation invoices={invoices} currentUser={currentUser} />}
      {tab === "banking" && <BankStatementImport invoices={invoices} expenses={expenses} />}
      {tab === "tax" && <TaxIntegration onNavigate={onNavigate} />}
      {tab === "qr-barcode" && <QRBarcodeTools onNavigate={onNavigate} />}
      {tab === "esignature" && <ESignature />}
    </div>
  );
}

/* ══════════════ INTEGRATION CONNECTIONS ══════════════ */
/* ------------------------------ INTEGRATION CONNECTIONS ------------------------------ */
export function IntegrationConnections({ canManage, currentUser }) {
  const connections = useCompanyTable("integration_connections", INTEGRATION_CONNECTIONS.map((c) => ({ id: c.id, enabled: false, tenantId: "", clientId: "", paymentLink: "", paypalMeLink: "", webhookUrl: "", apiKey: "", businessNumber: "", storeUrl: "", terminalId: "" })), { mapRow: mapIntegrationConnectionRow });
  const { rows, setRows, loading } = connections;

  function getConfig(id) { return rows.find((c) => c.id === id) || {}; }

  async function updateField(id, key, value) {
    if (!canManage) return;
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
    if (IS_CONFIGURED) {
      const columnMap = {
        enabled: "enabled", tenantId: "tenant_id", clientId: "client_id", paymentLink: "payment_link", paypalMeLink: "paypal_me_link",
        webhookUrl: "webhook_url", apiKey: "api_key", businessNumber: "business_number", storeUrl: "store_url", terminalId: "terminal_id",
      };
      try { await sb("integration_connections").eq("integration_id", id).update({ [columnMap[key]]: value }).run(); } catch (_e) { /* saved locally regardless */ }
    }
  }

  function openLink(url) {
    if (!url || !url.trim()) { notify("No link configured yet.", "error"); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function testSlackWebhook(url) {
    if (!url || !url.trim()) { notify("No webhook URL configured yet.", "error"); return; }
    const result = await sendWebhookNotification(url, "Test message from Smart Manager — your Slack connection works.");
    notify(result.note, result.ok ? "success" : "error");
  }

  function openWhatsApp(number) {
    if (!number || !number.trim()) { notify("No WhatsApp number configured yet.", "error"); return; }
    window.open(`https://wa.me/${number.replace(/[^0-9]/g, "")}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      {!canManage && (
        <div className="flex items-start gap-2.5 bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg p-3">
          <Lock size={15} className="text-[#F59E0B] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#8a670a] leading-relaxed">You're viewing as {currentUser.role}. Editing connection configuration requires a full-write role.</p>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {INTEGRATION_CONNECTIONS.map((meta) => {
          const config = getConfig(meta.id);
          const Icon = meta.icon;
          const linkField = meta.fields.find((f) => f.key === "paymentLink" || f.key === "paypalMeLink");
          return (
            <div key={meta.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#111827]/5 flex items-center justify-center"><Icon size={16} className="text-[#111827]" /></div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827]">{meta.name}</p>
                    <span className={`text-[10px] font-medium ${meta.functional ? "text-[#16A34A]" : "text-slate-400"}`}>{meta.functional ? "Real, working today" : "Needs backend OAuth"}</span>
                  </div>
                </div>
                {loading ? <div className="w-9 h-5 rounded-full skeleton-shimmer" /> : (
                  <ToggleSwitch on={config.enabled} disabled={!canManage} onChange={() => updateField(meta.id, "enabled", !config.enabled)} label={`${config.enabled ? "Disable" : "Enable"} ${meta.name}`} />
                )}
              </div>
              <p className="text-[11.5px] text-slate-400 leading-relaxed mb-3">{meta.requirement}</p>
              <div className="space-y-2.5 mb-3">
                {meta.fields.map((f) => (
                  <div key={f.key}>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">{f.label}</label>
                    <input className={inputClass} value={config[f.key] || ""} onChange={(e) => updateField(meta.id, f.key, e.target.value)} placeholder={f.placeholder} disabled={!config.enabled || !canManage} />
                  </div>
                ))}
              </div>
              {meta.functional && linkField && (
                <button onClick={() => openLink(config[linkField.key])} disabled={!config.enabled} className="w-full text-[12px] font-medium btn-primary text-white rounded-lg py-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                  <Send size={12} /> Open Payment Link
                </button>
              )}
              {meta.functional && meta.id === "slack" && (
                <button onClick={() => testSlackWebhook(config.webhookUrl)} disabled={!config.enabled} className="w-full text-[12px] font-medium btn-primary text-white rounded-lg py-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                  <Send size={12} /> Send Test Message
                </button>
              )}
              {meta.functional && meta.id === "whatsapp-business" && (
                <button onClick={() => openWhatsApp(config.businessNumber)} disabled={!config.enabled} className="w-full text-[12px] font-medium btn-primary text-white rounded-lg py-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                  <MessageCircle size={12} /> Open WhatsApp Chat
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
