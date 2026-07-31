import { useState } from "react";
import {
  ArrowUpDown, Bell, ChevronRight, FileText, Lock, Send
} from "lucide-react";
import { EmptyState, SkeletonRows, inputClass } from "../components/ui.jsx";
import { ALERT_PRIORITY } from "../data/core.jsx";
import {
  ALERT_ROUTING_TYPES,
  NOTIFICATION_CHANNELS,
  notificationChannelsSeed,
  notificationLogSeed,
  notificationRulesSeed,
} from "../data/notifications.jsx";
import { useBusinessAlerts } from "../lib/alerts.jsx";
import {
  mapNotificationChannelRow,
  mapNotificationLogRow,
  mapNotificationRuleRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { StatRow } from "../modules/Analytics.jsx";
import { ToggleSwitch } from "../modules/Settings.jsx";

/* ══════════════ NOTIFICATIONS ══════════════ */
/* --------------------------------- NOTIFICATIONS -------------------------------- */
export const NOTIF_TABS = [
  { id: "channels", label: "Channels", icon: Bell },
  { id: "routing", label: "Alert Routing", icon: ArrowUpDown },
  { id: "log", label: "Dispatch Log", icon: FileText },
];

// Real for Slack and Teams: both accept a plain POST to a webhook URL.
// mode: "no-cors" is deliberate and its limitation is surfaced to the
// user rather than hidden — the browser can't read the response status or
// body in this mode, so a call that doesn't throw means "the request left
// the browser," not "Slack confirmed receipt." That distinction matters
// and the UI says so explicitly after every test send.
export async function sendWebhookNotification(url, text) {
  if (!url || !url.trim()) return { ok: false, note: "No webhook URL configured." };
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return { ok: true, note: "Request sent. Browsers can't read the response for no-cors webhook calls — check the channel directly to confirm it arrived." };
  } catch (e) {
    return { ok: false, note: "The request failed to leave the browser — check the URL and your connection." };
  }
}

export function Notifications({ inventory, invoices, expenses, leaveRequests, workOrders, subscriptions, canManage, currentUser, smartAlerts, onNavigate }) {
  const [tab, setTab] = useState("channels");
  const channels = useCompanyTable("notification_channels", notificationChannelsSeed, { mapRow: mapNotificationChannelRow });
  const rules = useCompanyTable("notification_rules", notificationRulesSeed, { mapRow: mapNotificationRuleRow });
  const log = useCompanyTable("notification_log", notificationLogSeed, { order: { col: "created_at", ascending: false }, mapRow: mapNotificationLogRow });
  const alerts = useBusinessAlerts({ inventory, invoices, expenses, leaveRequests, workOrders, subscriptions });

  const enabledCount = channels.rows.filter((c) => c.enabled).length;
  const functionalEnabled = channels.rows.filter((c) => c.enabled && NOTIFICATION_CHANNELS.find((n) => n.id === c.id)?.functional).length;

  async function logDispatch(entry) {
    const draft = { id: `LOG-${Date.now()}`, ...entry, timestamp: new Date().toISOString() };
    log.setRows((prev) => [draft, ...prev].slice(0, 100));
    if (IS_CONFIGURED) {
      try { await sb("notification_log").insert({ channel: entry.channel, event: entry.event, message: entry.message, status: entry.status, note: entry.note }).run(); } catch (_e) { /* logging failures shouldn't block the notification flow itself */ }
    }
  }

  return (
    {/* ── Smart Alerts Panel ── */}
    {smartAlerts && smartAlerts.length > 0 && (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-bold text-[#111827]">⚡ Smart Alerts ({smartAlerts.length})</p>
          <span className="text-[11px] text-slate-400">Auto-detected across all modules</span>
        </div>
        <div className="space-y-2">
          {smartAlerts.map(alert => {
            const ap = ALERT_PRIORITY[alert.priority] || ALERT_PRIORITY.medium;
            return (
              <div key={alert.id} className="flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer hover:shadow-sm transition-all" style={{background:ap.bg,borderColor:ap.border}} onClick={()=>onNavigate&&onNavigate(alert.module)}>
                <span className="text-[20px] shrink-0">{alert.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold" style={{color:ap.text}}>{alert.title}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{background:ap.badge,color:ap.badgeText}}>{alert.priority}</span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{alert.category}</span>
                  </div>
                  <p className="text-[12px] mt-0.5" style={{color:ap.text+"CC"}}>{alert.detail}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">{alert.action}</span>
                  <ChevronRight size={13} className="text-slate-300"/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Notifications</h1>
        <p className="text-[13px] text-slate-500 mt-1">Configure delivery channels and route real business alerts to them</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {NOTIF_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${isActive ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <StatRow items={[
        { label: "Channels Enabled", value: String(enabledCount), sub: `of ${NOTIFICATION_CHANNELS.length}` },
        { label: "Functional Channels On", value: String(functionalEnabled), sub: "Slack / Teams only" },
        { label: "Active Business Alerts", value: String(alerts.length), color: alerts.length > 0 ? "text-[#F59E0B]" : undefined },
        { label: "Dispatches Logged", value: String(log.rows.length) },
      ]} />

      {tab === "channels" && <NotificationChannels channels={channels} onLog={logDispatch} canManage={canManage} currentUser={currentUser} />}
      {tab === "routing" && <AlertRouting rules={rules} channels={channels.rows} alerts={alerts} onLog={logDispatch} />}
      {tab === "log" && <NotificationLog log={log} />}
    </div>
  );
}

/* ══════════════ NOTIFICATION CHANNELS ══════════════ */
/* ------------------------------- NOTIFICATION CHANNELS ------------------------------- */
export function NotificationChannels({ channels, onLog, canManage, currentUser }) {
  const { rows, setRows, loading } = channels;
  const [testing, setTesting] = useState(null);

  function getChannel(id) { return rows.find((c) => c.id === id) || {}; }

  async function updateField(id, key, value) {
    if (!canManage) return;
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
    if (IS_CONFIGURED) {
      const c = rows.find((x) => x.id === id);
      try {
        await sb("notification_channels").eq("channel_id", id).update({ [key === "enabled" ? "enabled" : key]: value }).run();
      } catch (_e) { /* saved locally regardless; a background sync failure isn't worth interrupting typing */ }
    }
  }

  async function sendTest(meta) {
    const config = getChannel(meta.id);
    if (!config.enabled) { notify(`Enable ${meta.name} first.`, "error"); return; }
    setTesting(meta.id);
    if (meta.functional) {
      const result = await sendWebhookNotification(config.webhookUrl, `Test notification from Smart Manager — if you can see this, ${meta.name} is connected correctly.`);
      notify(result.note, result.ok ? undefined : "error");
      onLog({ channel: meta.name, event: "Test notification", message: "Manual test send", status: result.ok ? "Sent" : "Failed", note: result.note });
    } else {
      notify(`${meta.name} needs a backend integration to actually send — see the note below. Nothing was dispatched.`, "error");
      onLog({ channel: meta.name, event: "Test notification", message: "Manual test send", status: "Unavailable", note: meta.requirement });
    }
    setTesting(null);
  }

  return (
    <div className="space-y-4">
      {!canManage && (
        <div className="flex items-start gap-2.5 bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg p-3">
          <Lock size={15} className="text-[#F59E0B] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[#8a670a] leading-relaxed">
            You're viewing as {currentUser.role}. Webhook URLs are credentials — editing channel configuration requires a full-write role. You can still view settings and test enabled channels below.
          </p>
        </div>
      )}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {NOTIFICATION_CHANNELS.map((meta) => {
        const config = getChannel(meta.id);
        const Icon = meta.icon;
        return (
          <div key={meta.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#111827]/5 flex items-center justify-center"><Icon size={16} className="text-[#111827]" /></div>
                <div>
                  <p className="text-[14px] font-semibold text-[#111827]">{meta.name}</p>
                  {meta.functional ? (
                    <span className="text-[10px] font-medium text-[#16A34A]">Real delivery</span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400">Needs a backend</span>
                  )}
                </div>
              </div>
              {loading ? <div className="w-9 h-5 rounded-full skeleton-shimmer" /> : (
                <ToggleSwitch on={config.enabled} disabled={!canManage} onChange={() => updateField(meta.id, "enabled", !config.enabled)} label={`${config.enabled ? "Disable" : "Enable"} ${meta.name}`} />
              )}
            </div>

            {!meta.functional && (
              <p className="text-[11.5px] text-slate-400 leading-relaxed mb-3">{meta.requirement}</p>
            )}

            <div className="space-y-2.5 mb-3">
              {meta.fields.map((f) => (
                <div key={f.key}>
                  <label className="text-[11px] font-medium text-slate-500 block mb-1">{f.label}</label>
                  <input
                    className={inputClass}
                    value={config[f.key] || ""}
                    onChange={(e) => updateField(meta.id, f.key, e.target.value)}
                    placeholder={f.placeholder}
                    disabled={!config.enabled || !canManage}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => sendTest(meta)}
              disabled={!config.enabled || testing === meta.id}
              className={`w-full text-[12px] font-medium rounded-lg py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${meta.functional ? "btn-primary text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            >
              {testing === meta.id ? "Sending..." : meta.functional ? "Send Test Notification" : "Test (unavailable)"}
            </button>
          </div>
        );
      })}
    </div>
    </div>
  );
}

/* ══════════════ ALERT ROUTING ══════════════ */
/* --------------------------------- ALERT ROUTING --------------------------------- */
export function AlertRouting({ rules, channels, alerts, onLog }) {
  const { rows, setRows, loading } = rules;
  const [dispatching, setDispatching] = useState(false);

  function getRule(id) { return rows.find((r) => r.id === id) || { channels: [] }; }

  async function toggleChannel(alertType, channelId) {
    const rule = getRule(alertType);
    const nextChannels = rule.channels.includes(channelId) ? rule.channels.filter((c) => c !== channelId) : [...rule.channels, channelId];
    setRows((prev) => {
      const exists = prev.find((r) => r.id === alertType);
      return exists ? prev.map((r) => (r.id === alertType ? { ...r, channels: nextChannels } : r)) : [...prev, { id: alertType, channels: nextChannels }];
    });
    if (IS_CONFIGURED) {
      try { await sb("notification_rules").eq("alert_type", alertType).update({ channels: nextChannels }).run(); } catch (_e) { /* local state already reflects the change */ }
    }
  }

  async function dispatchNow() {
    if (alerts.length === 0) { notify("No active alerts to dispatch right now."); return; }
    setDispatching(true);
    let sent = 0, skipped = 0;
    for (const alert of alerts) {
      const rule = getRule(alert.id);
      for (const channelId of rule.channels) {
        const channel = channels.find((c) => c.id === channelId);
        const meta = NOTIFICATION_CHANNELS.find((n) => n.id === channelId);
        if (!channel?.enabled) { skipped++; continue; }
        const text = `[Smart Manager] ${alert.title} — ${alert.subtitle}`;
        if (meta.functional) {
          const result = await sendWebhookNotification(channel.webhookUrl, text);
          onLog({ channel: meta.name, event: alert.title, message: text, status: result.ok ? "Sent" : "Failed", note: result.note });
          if (result.ok) sent++; else skipped++;
        } else {
          onLog({ channel: meta.name, event: alert.title, message: text, status: "Unavailable", note: meta.requirement });
          skipped++;
        }
      }
    }
    notify(`Dispatch complete — ${sent} sent, ${skipped} skipped or unavailable.`);
    setDispatching(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <ArrowUpDown size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Routes the same real alerts already shown in the topbar Notification Center — nothing here is a separate alert system. "Dispatch Now" sends the alerts currently active to whichever enabled channels are checked below.
        </p>
      </div>

      <div className="flex justify-end">
        <button onClick={dispatchNow} disabled={dispatching} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-40">
          <Send size={14} /> {dispatching ? "Dispatching..." : `Dispatch Now (${alerts.length} active)`}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Alert Type</th>
                {NOTIFICATION_CHANNELS.map((c) => <th key={c.id} className="px-3 py-3 font-medium text-center">{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={NOTIFICATION_CHANNELS.length + 1} />}
              {!loading && ALERT_ROUTING_TYPES.map((t) => {
                const rule = getRule(t.id);
                const isActive = alerts.some((a) => a.id === t.id);
                return (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#111827]">{t.label}</p>
                      {isActive && <span className="text-[10px] font-medium text-[#F59E0B]">Currently active</span>}
                    </td>
                    {NOTIFICATION_CHANNELS.map((c) => (
                      <td key={c.id} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={rule.channels.includes(c.id)}
                          onChange={() => toggleChannel(t.id, c.id)}
                          className="rounded border-slate-300"
                          aria-label={`Route ${t.label} to ${c.name}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ DISPATCH LOG ══════════════ */
/* --------------------------------- DISPATCH LOG --------------------------------- */
export function NotificationLog({ log }) {
  const { rows, loading } = log;
  const STATUS_COLOR = { Sent: "#16A34A", Failed: "#EF4444", Unavailable: "#9CA3AF" };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[680px]">
          <thead><tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
            <th className="px-4 py-3 font-medium">Channel</th><th className="px-4 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Note</th><th className="px-4 py-3 font-medium">When</th>
          </tr></thead>
          <tbody>
            {loading && <SkeletonRows cols={5} />}
            {!loading && rows.map((l) => (
              <tr key={l.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 font-medium text-[#111827]">{l.channel}</td>
                <td className="px-4 py-3 text-slate-600">{l.event}</td>
                <td className="px-4 py-3">
                  <span className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5" style={{ backgroundColor: `${STATUS_COLOR[l.status]}14`, color: STATUS_COLOR[l.status] }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[l.status] }} />{l.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-[11.5px] max-w-[240px] truncate" title={l.note}>{l.note}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-[11.5px]">{new Date(l.timestamp).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={5}><EmptyState icon={FileText} title="No dispatches yet" hint="Test a channel or dispatch alerts to see the log fill in here." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
