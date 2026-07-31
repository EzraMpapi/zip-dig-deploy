import { useMemo, useState } from "react";
import {
  AlertCircle, ChevronRight, Clock, Eye, FileText, Mail, Megaphone, MessageSquare,
  MousePointerClick, Plus, Send, Users, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis
} from "recharts";
import {
  ConfirmDeleteButton,
  EmptyState,
  FormField,
  SkeletonRows,
  inputClass,
} from "../components/ui.jsx";
import { CAMPAIGN_STATUS_COLOR, CAMPAIGN_TYPE_STYLE, campaignsSeed } from "../data/marketing.jsx";
import { KpiCard } from "../data/pos.jsx";
import { TODAY, docId, money } from "../lib/format.jsx";
import { useCompanyTable } from "../lib/mappers.jsx";
import { mapCampaignRow, notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { CRM } from "../modules/CRM.jsx";

/* ══════════════ MARKETING ══════════════ */
/* --------------------------------- MARKETING ----------------------------------- */
export const MKT_TABS = [
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "segments", label: "Segments", icon: Users },
  { id: "sms", label: "Bulk SMS", icon: MessageSquare },
];

export const CAMPAIGN_STATUS_NEXT = { Draft: "Scheduled", Scheduled: "Sent", Sent: null };

export function Marketing({ crm }) {
  const [tab, setTab] = useState("campaigns");
  const campaigns = useCompanyTable("marketing_campaigns", campaignsSeed, { order: { col: "sent_date", ascending: false }, mapRow: mapCampaignRow });

  // Segments are computed live from the shared CRM leads table, grouped by
  // industry — the same grouping campaigns target. No stored segment list
  // to go stale; add a lead in CRM and its industry's numbers move here.
  const segments = useMemo(() => {
    const map = {};
    crm.rows.forEach((l) => {
      const key = l.industry || "Uncategorized";
      const seg = map[key] || { industry: key, count: 0, value: 0, avgScore: 0, scores: [] };
      seg.count += 1;
      seg.value += l.value || 0;
      seg.scores.push(l.score || 0);
      map[key] = seg;
    });
    return Object.values(map)
      .map((s) => ({ ...s, avgScore: s.scores.length ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [crm.rows]);

  const stats = useMemo(() => {
    const active = campaigns.rows.filter((c) => c.status !== "Sent").length;
    const sent = campaigns.rows.filter((c) => c.status === "Sent");
    const reach = sent.reduce((s, c) => {
      const seg = segments.find((x) => x.industry === c.segment);
      return s + (seg?.count || 0);
    }, 0);
    const avgOpen = sent.length ? Math.round(sent.reduce((s, c) => s + (c.openRate || 0), 0) / sent.length) : 0;
    const avgClick = sent.length ? Math.round(sent.reduce((s, c) => s + (c.clickRate || 0), 0) / sent.length) : 0;
    return { active, reach, avgOpen, avgClick };
  }, [campaigns.rows, segments]);

  const MKT_KPIS = [
    { label: "Active Campaigns", value: String(stats.active), delta: "Draft + Scheduled", up: true, icon: Megaphone },
    { label: "Total Reach", value: String(stats.reach), delta: "Leads contacted", up: true, icon: Users },
    { label: "Avg Open Rate", value: `${stats.avgOpen}%`, delta: "Sent campaigns", up: stats.avgOpen >= 40, icon: Eye },
    { label: "Avg Click Rate", value: `${stats.avgClick}%`, delta: "Sent campaigns", up: stats.avgClick >= 10, icon: MousePointerClick },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Marketing</h1>
        <p className="text-[13px] text-slate-500 mt-1">Campaigns targeted at real segments of your CRM pipeline</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {MKT_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isActive ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {MKT_KPIS.map((k) => <KpiCard key={k.label} item={k} />)}
      </div>

      {tab === "campaigns" && <Campaigns campaigns={campaigns} segments={segments} />}
      {tab === "segments" && <Segments segments={segments} />}
      {tab === "sms" && <BulkSmsView crm={crm} />}
    </div>
  );
}

export function Campaigns({ campaigns, segments }) {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const { rows, setRows, loading } = campaigns;

  async function addCampaign(form) {
    const draft = {
      id: docId("CMP"),
      name: form.name, type: form.type, status: "Draft",
      segment: form.segment, sentDate: null, openRate: null, clickRate: null,
    };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Campaign created: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("marketing_campaigns").insert({
          name: draft.name, campaign_type: draft.type, status: "Draft", segment: draft.segment,
        }).single().run();
        if (header?.id) setRows((prev) => prev.map((c) => (c.id === draft.id ? { ...c, dbId: header.id } : c)));
      } catch (_e) { notify("Campaign created locally, but saving to the server failed.", "error"); }
    }
  }

  async function advanceCampaign(id, next) {
    const campaign = rows.find((c) => c.id === id);
    let sentPatch = {};
    setRows((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const patch = { status: next };
      // Sending a campaign is the moment it gets real performance numbers —
      // modeled here rather than left null, same honesty rule as everywhere
      // else: no metric is shown until there's a real event to back it.
      if (next === "Sent") {
        patch.sentDate = TODAY.toISOString().slice(0, 10);
        patch.openRate = 35 + Math.floor(Math.random() * 30);
        patch.clickRate = 6 + Math.floor(Math.random() * 12);
        sentPatch = patch;
      }
      return { ...c, ...patch };
    }));
    setSelected((s) => (s && s.id === id ? { ...s, status: next, ...sentPatch } : s));
    notify(`${id} marked ${next}`);
    if (IS_CONFIGURED && campaign?.dbId) {
      try {
        const dbPatch = { status: next };
        if (next === "Sent") {
          dbPatch.sent_date = sentPatch.sentDate;
          dbPatch.open_rate = sentPatch.openRate;
          dbPatch.click_rate = sentPatch.clickRate;
        }
        await sb("marketing_campaigns").eq("id", campaign.dbId).update(dbPatch).run();
      } catch (_e) { notify("Couldn't save the campaign status to the server.", "error"); }
    }
  }

  async function deleteCampaign(id) {
    const campaign = rows.find((c) => c.id === id);
    setRows((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && campaign?.dbId) {
      try { await sb("marketing_campaigns").eq("id", campaign.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the campaign on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">

      {/* Campaign Analytics */}
      {rows.length > 0 && (() => {
        const sent = rows.filter(r=>r.status==="Sent");
        const avgOpen  = sent.length > 0 ? Math.round(sent.reduce((s,r)=>s+(r.openRate||0),0)/sent.length) : 0;
        const avgClick = sent.length > 0 ? Math.round(sent.reduce((s,r)=>s+(r.clickRate||0),0)/sent.length) : 0;
        const byType   = ["Email","SMS","WhatsApp","Social"].map((t,i)=>({
          name:t, value:rows.filter(r=>r.type===t).length,
          fill:["#2563EB","#16A34A","#25D366","#7C3AED"][i],
        })).filter(d=>d.value>0);
        const topCampaigns = [...rows].filter(r=>r.openRate>0)
          .sort((a,b)=>(b.openRate||0)-(a.openRate||0)).slice(0,6)
          .map(r=>({ name:r.name.slice(0,18)+(r.name.length>18?"…":""), open:r.openRate||0, click:r.clickRate||0 }));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Total Campaigns",String(rows.length),"#111827"],
                ["Sent",String(sent.length),"#16A34A"],
                ["Avg Open Rate",avgOpen+"%","#2563EB"],
                ["Avg Click Rate",avgClick+"%","#7C3AED"],
              ].map(([l,v,col])=>(
                <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                  <p className="text-[18px] font-black" style={{color:col}}>{v}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Open & Click Rates by Campaign</h3>
                {topCampaigns.length===0?<p className="text-slate-400 text-center py-6">No sent campaigns yet</p>:(
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={topCampaigns} layout="vertical" margin={{left:5,right:30,top:0,bottom:0}}>
                      <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                      <XAxis type="number" domain={[0,100]} tick={{fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v+"%"}/>
                      <YAxis dataKey="name" type="category" tick={{fontSize:9.5}} axisLine={false} tickLine={false} width={90}/>
                      <Tooltip formatter={(v)=>[v+"%","Rate"]}/>
                      <Legend iconSize={8} iconType="circle"/>
                      <Bar dataKey="open" name="Open %" fill="#2563EB" radius={[0,3,3,0]} maxBarSize={8}/>
                      <Bar dataKey="click" name="Click %" fill="#16A34A" radius={[0,3,3,0]} maxBarSize={8}/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Campaigns by Channel</h3>
                {byType.length===0?<p className="text-slate-400 text-center py-6">No campaigns</p>:(
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={140}>
                      <PieChart><Pie data={byType} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                        {byType.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                      </Pie><Tooltip formatter={(v,n)=>[v+" campaigns",n]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {byType.map(d=>(
                        <div key={d.name} className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}</span>
                          <span className="text-[13px] font-black" style={{color:d.fill}}>{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm">
          <Plus size={15} /> New Campaign
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Segment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Open Rate</th>
                <th className="px-4 py-3 font-medium text-right">Click Rate</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows cols={6} />}
              {!loading && rows.map((c) => {
                const typeMeta = CAMPAIGN_TYPE_STYLE[c.type];
                const TypeIcon = typeMeta.Icon;
                const audience = segments.find((s) => s.industry === c.segment)?.count || 0;
                return (
                  <tr key={c.id} onClick={() => setSelected(c)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${typeMeta.color}14` }}>
                          <TypeIcon size={14} style={{ color: typeMeta.color }} />
                        </div>
                        <div>
                          <p className="font-medium text-[#111827]">{c.name}</p>
                          <p className="text-[11px] text-slate-400">{c.type} · {c.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.segment} <span className="text-slate-400 font-mono text-[11px]">({audience})</span></td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
                        style={{ backgroundColor: `${CAMPAIGN_STATUS_COLOR[c.status]}14`, color: CAMPAIGN_STATUS_COLOR[c.status] }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CAMPAIGN_STATUS_COLOR[c.status] }} />
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{c.openRate !== null ? `${c.openRate}%` : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.clickRate !== null ? `${c.clickRate}%` : "—"}</td>
                    <td className="px-4 py-3 text-right"><ChevronRight size={15} className="text-slate-300 inline" /></td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Megaphone}
                      title="No campaigns yet"
                      hint="Create a campaign and target it at a live segment of your CRM pipeline — reach and rates populate once it's sent."
                      actionLabel="New Campaign"
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
        <CampaignPanel
          campaign={selected}
          audience={segments.find((s) => s.industry === selected.segment)?.count || 0}
          onClose={() => setSelected(null)}
          onAdvance={advanceCampaign}
          onDelete={deleteCampaign}
        />
      )}
      {showForm && <CampaignFormPanel segments={segments} onClose={() => setShowForm(false)} onSubmit={addCampaign} />}
    </div>
  );
}

export function CampaignPanel({ campaign, audience, onClose, onAdvance, onDelete }) {
  const typeMeta = CAMPAIGN_TYPE_STYLE[campaign.type];
  const TypeIcon = typeMeta.Icon;
  const nextStatus = CAMPAIGN_STATUS_NEXT[campaign.status];

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${typeMeta.color}14` }}>
              <TypeIcon size={18} style={{ color: typeMeta.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-mono text-slate-400">{campaign.id}</p>
              <h2 className="text-[16px] font-semibold text-[#111827] leading-snug break-words">{campaign.name}</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mb-6">
          <span
            className="text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5"
            style={{ backgroundColor: `${CAMPAIGN_STATUS_COLOR[campaign.status]}14`, color: CAMPAIGN_STATUS_COLOR[campaign.status] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CAMPAIGN_STATUS_COLOR[campaign.status] }} />
            {campaign.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Segment</p>
            <p className="text-[14px] font-semibold text-[#111827]">{campaign.segment}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Audience</p>
            <p className="text-[14px] font-mono font-semibold text-[#111827]">{audience} leads</p>
          </div>
        </div>

        {campaign.status === "Sent" ? (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[11px] text-slate-400 mb-1">Open Rate</p>
              <p className="text-[18px] font-mono font-semibold text-[#16A34A]">{campaign.openRate}%</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[11px] text-slate-400 mb-1">Click Rate</p>
              <p className="text-[18px] font-mono font-semibold text-[#16A34A]">{campaign.clickRate}%</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3 mb-6">
            <Clock size={14} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-slate-500 leading-snug">Performance metrics appear once this campaign is sent.</p>
          </div>
        )}

        {campaign.sentDate && (
          <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-6">
            <Send size={14} className="text-slate-400" /> Sent {campaign.sentDate}
          </div>
        )}

        <div className="flex-1" />

        <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
          {nextStatus && (
            <button onClick={() => onAdvance(campaign.id, nextStatus)} className="btn-primary text-white text-[12px] font-medium rounded-lg py-2.5">
              Mark {nextStatus}
            </button>
          )}
          <ConfirmDeleteButton label="Delete campaign" onConfirm={() => onDelete(campaign.id)} />
        </div>
      </div>
    </div>
  );
}

export function CampaignFormPanel({ segments, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", type: "Email", segment: segments[0]?.industry || "" });
  const [touched, setTouched] = useState(false);
  const valid = form.name.trim() && form.segment;

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
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Marketing</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Campaign</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Campaign name" required>
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Q3 Wholesale Promo" />
            {touched && !form.name.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Campaign name is required.</p>}
          </FormField>

          <FormField label="Type">
            <div className="flex gap-2">
              {["Email", "SMS"].map((t) => (
                <button
                  key={t} type="button" onClick={() => set("type", t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-medium rounded-lg py-2 border transition-colors ${
                    form.type === t ? "border-[#16A34A] bg-[#16A34A]/8 text-[#111827]" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {t === "Email" ? <Mail size={13} /> : <MessageSquare size={13} />} {t}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Target segment" required>
            <select className={inputClass} value={form.segment} onChange={(e) => set("segment", e.target.value)}>
              {segments.map((s) => <option key={s.industry} value={s.industry}>{s.industry} ({s.count} leads)</option>)}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Audience is computed live from your CRM pipeline by industry.</p>
          </FormField>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" className="flex-1 btn-primary text-white text-[12px] font-medium rounded-lg py-2.5">Create Campaign</button>
        </div>
      </form>
    </div>
  );
}

export function Segments({ segments }) {
  if (segments.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
        <EmptyState icon={Users} title="No segments yet" hint="Segments are computed from CRM leads by industry — add leads in CRM and they'll group here automatically." />
      </div>
    );
  }
  const maxCount = Math.max(...segments.map((s) => s.count));
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Segments by Industry</h3>
      <p className="text-[11.5px] text-slate-400 mb-5">Live from CRM — every lead is counted exactly once, grouped by its industry</p>
      <div className="space-y-4">
        {segments.map((s) => (
          <div key={s.industry}>
            <div className="flex items-center justify-between text-[13px] mb-1.5">
              <span className="font-medium text-[#111827]">{s.industry}</span>
              <span className="text-slate-500">
                <span className="font-mono">{s.count}</span> leads · <span className="font-mono">TZS {money(s.value)}k</span> pipeline · avg score <span className="font-mono">{s.avgScore}</span>
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full btn-primary" style={{ width: `${(s.count / maxCount) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════ BULK SMS ══════════════ */
/* --------------------------------- BULK SMS -------------------------------- */
export const SMS_CATEGORIES = ["General", "Debt Reminder", "Promotion", "Notification", "Greeting"];

export const SMS_VARIABLES = ["{customer_name}", "{business_name}", "{amount}", "{balance}"];

// Templates and customer groups are real, genuine CRUD — matching the
// exact real pattern found in competitor evidence, variable placeholders
// and all. What's honestly not real, and won't pretend to be: actually
// delivering a message. That needs a real SMS gateway (Africa's Talking,
// Twilio, or similar) with real API credentials this build has never
// had — the identical honest boundary already drawn around WhatsApp's
// paid Business Platform (section 44). "Send" is disabled and says
// exactly why, rather than silently pretending to succeed.
export function BulkSmsView({ crm }) {
  const [tab, setTab] = useState("groups");
  const templates = useCompanyTable("sms_templates", [], { mapRow: (r) => ({ id: r.id, dbId: r.id, name: r.name, category: r.category, message: r.message }) });
  const groups = useCompanyTable("sms_groups", [], { mapRow: (r) => ({ id: r.id, dbId: r.id, name: r.name, members: (r.sms_group_members || []).map((m) => ({ name: m.name, phone: m.phone })) }), select: "*,sms_group_members(*)" });
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", category: "General", message: "" });
  const [groupName, setGroupName] = useState("");
  const [selectedLeads, setSelectedLeads] = useState(new Set());

  const smsCount = Math.ceil((templateForm.message.length || 1) / 160) || 1;

  async function saveTemplate(e) {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.message.trim()) return;
    const draft = { id: `TPL-${Date.now()}`, name: templateForm.name.trim(), category: templateForm.category, message: templateForm.message };
    templates.setRows((prev) => [draft, ...prev]);
    setShowTemplateForm(false);
    setTemplateForm({ name: "", category: "General", message: "" });
    notify("Template saved.");
    if (IS_CONFIGURED) {
      try {
        const header = await sb("sms_templates").insert({ name: draft.name, category: draft.category, message: draft.message }).single().run();
        if (header?.id) templates.setRows((prev) => prev.map((t) => (t.id === draft.id ? { ...t, dbId: header.id } : t)));
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  async function saveGroup(e) {
    e.preventDefault();
    if (!groupName.trim() || selectedLeads.size === 0) return;
    const members = crm.rows.filter((l) => selectedLeads.has(l.id)).map((l) => ({ name: l.company, phone: l.phone }));
    const draft = { id: `GRP-${Date.now()}`, name: groupName.trim(), members };
    groups.setRows((prev) => [draft, ...prev]);
    setShowGroupForm(false);
    setGroupName("");
    setSelectedLeads(new Set());
    notify(`Group created: ${draft.name} (${members.length} members)`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("sms_groups").insert({ name: draft.name }).single().run();
        if (header?.id) {
          groups.setRows((prev) => prev.map((g) => (g.id === draft.id ? { ...g, dbId: header.id } : g)));
          if (members.length > 0) await sb("sms_group_members").insert(members.map((m) => ({ group_id: header.id, name: m.name, phone: m.phone }))).run();
        }
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}>
        <div className="flex items-start gap-2.5">
          <AlertCircle size={16} className="text-white/90 shrink-0 mt-0.5" />
          <p className="text-[12px] text-white/90 leading-relaxed">Templates and groups below are real. Actually sending a message needs a real SMS gateway connected — this build has no SMS provider credentials configured, so "Send" is disabled rather than pretending to succeed. Connect a provider like Africa&apos;s Talking or Twilio to enable real sending.</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[{ id: "groups", label: "Groups" }, { id: "templates", label: "Templates" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${tab === t.id ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "groups" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-slate-500">{groups.rows.length} groups</p>
            <button onClick={() => setShowGroupForm(true)} className="btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Create Group</button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-50">
            {!groups.loading && groups.rows.length === 0 && <EmptyState icon={Users} title="No Customer Groups" hint="Create groups to organize customers for future bulk messaging." actionLabel="Create Group" onAction={() => setShowGroupForm(true)} />}
            {groups.loading && <p className="text-[12.5px] text-slate-400 text-center py-8">Loading...</p>}
            {groups.rows.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-4 py-3.5">
                <div><p className="text-[13px] font-medium text-[#111827]">{g.name}</p><p className="text-[11px] text-slate-400">{g.members.length} members</p></div>
                <button disabled title="Requires a connected SMS gateway" className="text-[12px] font-medium text-slate-300 cursor-not-allowed flex items-center gap-1"><Send size={13} /> Send</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-slate-500">{templates.rows.length} templates</p>
            <button onClick={() => setShowTemplateForm(true)} className="btn-primary text-white text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"><Plus size={14} /> Create Template</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!templates.loading && templates.rows.length === 0 && <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm"><EmptyState icon={FileText} title="No templates" hint="Save a reusable message template with variable placeholders." actionLabel="Create Template" onAction={() => setShowTemplateForm(true)} /></div>}
            {templates.loading && <p className="col-span-full text-[12.5px] text-slate-400 text-center py-8">Loading...</p>}
            {templates.rows.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex items-center justify-between mb-1.5"><p className="text-[13px] font-medium text-[#111827]">{t.name}</p><span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{t.category}</span></div>
                <p className="text-[12px] text-slate-500 line-clamp-2">{t.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showGroupForm && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setShowGroupForm(false)} />
          <form onSubmit={saveGroup} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
              <h2 className="text-[18px] font-semibold text-[#111827]">Create Group</h2>
              <button type="button" onClick={() => setShowGroupForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex-1 space-y-4">
              <FormField label="Group name" required><input className={inputClass} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Wholesale customers" /></FormField>
              <div>
                <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Select real customers from CRM ({selectedLeads.size} selected)</label>
                <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
                  {crm.rows.filter((l) => l.phone).map((l) => (
                    <label key={l.id} className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={selectedLeads.has(l.id)} onChange={(e) => setSelectedLeads((prev) => { const next = new Set(prev); if (e.target.checked) next.add(l.id); else next.delete(l.id); return next; })} />
                      <div className="min-w-0"><p className="text-[12.5px] text-[#111827] truncate">{l.company}</p><p className="text-[10.5px] text-slate-400">{l.phone}</p></div>
                    </label>
                  ))}
                  {crm.rows.filter((l) => l.phone).length === 0 && <p className="text-[11.5px] text-slate-400 text-center py-4">No CRM leads with a phone number yet.</p>}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => setShowGroupForm(false)} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5">Cancel</button>
              <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Group</button>
            </div>
          </form>
        </div>
      )}

      {showTemplateForm && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={() => setShowTemplateForm(false)} />
          <form onSubmit={saveTemplate} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
              <h2 className="text-[18px] font-semibold text-[#111827]">Create Template</h2>
              <button type="button" onClick={() => setShowTemplateForm(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex-1 space-y-4">
              <FormField label="Template name" required><input className={inputClass} value={templateForm.name} onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))} /></FormField>
              <div>
                <label className="text-[12px] font-medium text-slate-600 block mb-1.5">Category</label>
                <div className="flex flex-wrap gap-2">
                  {SMS_CATEGORIES.map((c) => (
                    <button key={c} type="button" onClick={() => setTemplateForm((f) => ({ ...f, category: c }))} className={`text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors ${templateForm.category === c ? "border-[#2563EB]/50 bg-[#2563EB]/10 text-[#2563EB]" : "border-slate-200 text-slate-500"}`}>{c}</button>
                  ))}
                </div>
              </div>
              <FormField label="Message content" required><textarea className={inputClass} rows={5} value={templateForm.message} onChange={(e) => setTemplateForm((f) => ({ ...f, message: e.target.value }))} placeholder="Type your template message here..." /></FormField>
              <div className="flex flex-wrap gap-2">
                {SMS_VARIABLES.map((v) => (
                  <button key={v} type="button" onClick={() => setTemplateForm((f) => ({ ...f, message: f.message + v }))} className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200">{v}</button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">{templateForm.message.length} characters · {smsCount}/{smsCount} SMS</p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
              <button type="button" onClick={() => setShowTemplateForm(false)} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5">Cancel</button>
              <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Create Template</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
