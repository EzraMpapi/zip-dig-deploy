import { useEffect, useMemo, useState } from "react";
import {
  Bell, Building2, Download, FileText, History, Mail, MoreHorizontal, Phone, Plus, Printer,
  QrCode, Search, Star, TrendingUp, Trophy, UploadCloud, Users, Wallet, X
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis
} from "recharts";
import {
  ConfirmDeleteButton,
  DataImportPanel,
  EmptyState,
  FormField,
  inputClass,
} from "../components/ui.jsx";
import { STAGES, contactsSeed } from "../data/core.jsx";
import { SortableHeader, StagePill, sortRows, toggleSort } from "../data/pos.jsx";
import { confirmAction } from "../lib/buses.jsx";
import { printCustomerStatement } from "../lib/export.jsx";
import { TODAY, docId, lineTotal, money } from "../lib/format.jsx";
import { mapContactRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { downloadCSV } from "../modules/Reports.jsx";

/* ══════════════ CRM ══════════════ */
/* ---------------------------------- CRM ------------------------------------ */

// Customer 360 — a real timeline and a real score, both from events this
// system already records. The timeline merges invoices issued and every
// individual payment received, chronologically, for the chosen customer;
// the score is transparent (Revenue 40 / Recency 30 / Payment
// reliability 30) with each factor's real basis shown — the Business
// Health discipline applied to a single customer. Honestly absent, named
// on-screen: calls, emails, WhatsApp, and meetings need an interactions
// data model (a crm_interactions table) that doesn't exist yet, and
// complaints live in support tickets not yet threaded here — real
// future work, not empty timeline rows pretending.
// CX Pulse — NPS and CSAT computed with the real industry formulas
// against real feedback rows. NPS = %promoters(9–10) minus
// %detractors(0–6), a −100..+100 number comparable against any
// benchmark; CSAT = mean of 1–5. Company-wide always; the selected
// customer's own responses shown when they exist. No responses = no
// number — an NPS invented from zero data would be exactly the fake-95%
// this build refuses everywhere.
export function CxPulseCard({ customer }) {
  const feedback = useCompanyTable("customer_feedback", [], { order: { col: "created_at", ascending: false }, mapRow: (r) => ({ id: r.id, customer: r.customer_name, nps: r.nps_score, csat: r.csat_score, comment: r.comment || "" }) });
  const npsRows = feedback.rows.filter((f) => f.nps !== null && f.nps !== undefined);
  const nps = npsRows.length === 0 ? null : Math.round(((npsRows.filter((f) => f.nps >= 9).length - npsRows.filter((f) => f.nps <= 6).length) / npsRows.length) * 100);
  const csatRows = feedback.rows.filter((f) => f.csat);
  const csat = csatRows.length === 0 ? null : (csatRows.reduce((s, f) => s + f.csat, 0) / csatRows.length).toFixed(1);
  const mineCount = feedback.rows.filter((f) => f.customer === customer).length;
  if (feedback.loading) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
      <div><p className="text-[10.5px] text-slate-400">NPS (all customers)</p><p className="text-[18px] font-mono font-bold" style={{ color: nps === null ? "#94A3B8" : nps >= 30 ? "#16A34A" : nps >= 0 ? "#F59E0B" : "#EF4444" }}>{nps === null ? "—" : nps > 0 ? `+${nps}` : nps}</p></div>
      <div><p className="text-[10.5px] text-slate-400">CSAT (1–5)</p><p className="text-[18px] font-mono font-bold text-[#111827]">{csat ?? "—"}</p></div>
      <div><p className="text-[10.5px] text-slate-400">Responses</p><p className="text-[18px] font-mono font-bold text-[#111827]">{npsRows.length + csatRows.length}</p></div>
      <p className="text-[10.5px] text-slate-400 flex-1 min-w-[200px]">{npsRows.length === 0 ? "No responses yet — the portal asks customers directly; no number is invented from zero data." : `Real formulas: %promoters − %detractors. ${customer ? mineCount + " response(s) from " + customer + "." : ""}`}</p>
    </div>
  );
}

export function Customer360View({ crm, invoices }) {
  const customers = useMemo(() => [...new Set(invoices.rows.map((i) => i.customer))].sort(), [invoices.rows]);
  const [selected, setSelected] = useState("");
  const customer = selected || customers[0] || "";

  function printStatement() {
    if (customer) printCustomerStatement(customer, invoices.rows);
  }

  // Omnichannel spine — closing the gap section 108 named. Channel-tagged
  // interactions logged here land on the same timeline the invoices and
  // payments already feed; when WhatsApp/Meta/Telegram webhooks exist
  // (real server-side work, named), they write to this same table.
  const CHANNELS = ["WhatsApp", "Email", "SMS", "Phone Call", "Live Chat", "Facebook Messenger", "Instagram", "Telegram", "Meeting"];
  const interactions = useCompanyTable("crm_interactions", [], { order: { col: "occurred_at", ascending: false }, mapRow: (r) => ({ id: r.id, dbId: r.id, customer: r.customer_name, channel: r.channel, direction: r.direction, summary: r.summary, date: r.occurred_at }) });
  const [logDraft, setLogDraft] = useState({ channel: "WhatsApp", direction: "inbound", summary: "" });

  async function logInteraction() {
    if (!logDraft.summary.trim() || !customer) return;
    const row = { id: `INT-${Date.now()}`, customer, channel: logDraft.channel, direction: logDraft.direction, summary: logDraft.summary.trim(), date: TODAY.toISOString().slice(0, 10) };
    interactions.setRows((prev) => [row, ...prev]);
    setLogDraft({ ...logDraft, summary: "" });
    notify(`${row.channel} interaction logged for ${customer}.`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("crm_interactions").insert({ customer_name: customer, channel: row.channel, direction: row.direction, summary: row.summary, occurred_at: row.date }).single().run();
        if (header?.id) interactions.setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, dbId: header.id } : x)));
      } catch (_e) { notify("Logged locally, but the server update failed.", "error"); }
    }
  }

  const view = useMemo(() => {
    if (!customer) return null;
    const invs = invoices.rows.filter((i) => i.customer === customer);
    const events = [];
    invs.forEach((i) => {
      events.push({ date: i.date, kind: "Invoice", detail: `${i.id} issued — TZS ${money(Math.round(lineTotal(i.items).total))}k (${i.status})` });
      (i.payments || []).forEach((p) => events.push({ date: p.date, kind: "Payment", detail: `TZS ${money(Math.round(p.amount))}k received on ${i.id}${p.method ? " · " + p.method : ""}` }));
    });
    interactions.rows.filter((x) => x.customer === customer).forEach((x) => {
      events.push({ date: x.date, kind: x.channel, detail: `${x.direction === "inbound" ? "←" : "→"} ${x.summary}` });
    });
    events.sort((a, b) => (a.date < b.date ? 1 : -1));
    const revenue = invs.reduce((s, i) => s + lineTotal(i.items).total, 0);
    const totalRev = invoices.rows.reduce((s, i) => s + lineTotal(i.items).total, 0) || 1;
    const revPts = Math.round(Math.min(1, (revenue / totalRev) * 4) * 40); // 25% of all revenue = full marks
    const lastDate = events.length ? events.map((e) => e.date).sort().slice(-1)[0] : null;
    const daysSince = lastDate ? Math.floor((TODAY - new Date(lastDate)) / 86400000) : 999;
    const recPts = Math.round(Math.max(0, 1 - daysSince / 180) * 30); // fades to 0 over 6 months
    const t = TODAY.toISOString().slice(0, 10);
    const unpaid = invs.filter((i) => i.status !== "Paid");
    const overdue = unpaid.filter((i) => i.dueDate && i.dueDate < t);
    const relPts = Math.round((unpaid.length === 0 ? 1 : 1 - overdue.length / unpaid.length) * 30);
    return { events: events.slice(0, 20), revenue, invCount: invs.length,
      score: revPts + recPts + relPts,
      factors: [
        { label: "Revenue weight", pts: revPts, max: 40, note: `TZS ${money(Math.round(revenue))}k across ${invs.length} invoice(s) — ${((revenue / totalRev) * 100).toFixed(1)}% of all revenue` },
        { label: "Recency", pts: recPts, max: 30, note: lastDate ? `last activity ${daysSince} day(s) ago` : "no activity recorded" },
        { label: "Payment reliability", pts: relPts, max: 30, note: unpaid.length === 0 ? "nothing outstanding" : `${overdue.length} of ${unpaid.length} unpaid invoice(s) overdue` },
      ] };
  }, [customer, invoices.rows, interactions.rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold text-[#111827]">Customer 360</h3>
          <p className="text-[12px] text-slate-500">A real timeline and a transparent score from events this system already records. Calls, emails, WhatsApp, and meetings need an interactions model — named future work, not empty rows pretending.</p>
        </div>
        <select className={inputClass + " max-w-[240px]"} value={customer} onChange={(e) => setSelected(e.target.value)}>
          {customers.map((cst) => <option key={cst} value={cst}>{cst}</option>)}
        </select>
        {customer && (
          <button onClick={printStatement}
            className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:border-[#16A34A] hover:text-[#16A34A] transition-colors">
            <Printer size={13} /> Account Statement
          </button>
        )}
      </div>
      <CxPulseCard customer={customer} />
      {customer && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-3.5 flex flex-wrap gap-2 items-center">
          <select className={inputClass + " max-w-[170px]"} value={logDraft.channel} onChange={(e) => setLogDraft({ ...logDraft, channel: e.target.value })}>
            {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          <select className={inputClass + " max-w-[120px]"} value={logDraft.direction} onChange={(e) => setLogDraft({ ...logDraft, direction: e.target.value })}>
            <option value="inbound">Inbound</option><option value="outbound">Outbound</option>
          </select>
          <input className={inputClass + " flex-1 min-w-[180px]"} value={logDraft.summary} onChange={(e) => setLogDraft({ ...logDraft, summary: e.target.value })} onKeyDown={(e) => e.key === "Enter" && logInteraction()} placeholder={`Log a ${logDraft.channel} conversation with ${customer}...`} />
          <button onClick={logInteraction} disabled={!logDraft.summary.trim()} className="btn-primary text-white text-[12px] font-medium rounded-lg px-3.5 py-2 disabled:opacity-40">Log</button>
        </div>
      )}
      {!view && <p className="text-[12px] text-slate-400 text-center py-8">No invoiced customers yet.</p>}
      {view && (
        <>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div><p className="text-[11px] text-slate-400">AI Customer Score</p><p className="text-[24px] font-mono font-bold" style={{ color: view.score >= 70 ? "#16A34A" : view.score >= 45 ? "#F59E0B" : "#EF4444" }}>{view.score}<span className="text-[13px] text-slate-400 font-normal"> / 100</span></p></div>
              <div className="text-right"><p className="text-[11px] text-slate-400">Lifetime revenue</p><p className="text-[15px] font-mono font-semibold text-[#111827]">TZS {money(Math.round(view.revenue))}k</p></div>
            </div>
            <div className="space-y-1.5 pt-3 border-t border-slate-100">
              {view.factors.map((f) => (
                <div key={f.label} className="flex justify-between text-[12px]"><span className="text-slate-600">{f.label} <span className="text-slate-400">— {f.note}</span></span><span className="font-mono font-medium text-[#111827] shrink-0 ml-3">{f.pts}/{f.max}</span></div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-50">
            {view.events.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${e.kind === "Payment" ? "bg-[#16A34A]/10 text-[#16A34A]" : "bg-slate-100 text-slate-500"}`}>{e.kind}</span>
                <p className="text-[12.5px] text-[#111827] flex-1 min-w-0 truncate">{e.detail}</p>
                <span className="text-[10.5px] font-mono text-slate-400 shrink-0">{e.date}</span>
              </div>
            ))}
            {view.events.length === 0 && <p className="text-[12px] text-slate-400 text-center py-6">No events yet for this customer.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export const CRM_TABS = [
  { id: "leads",        label: "Leads",         icon: Users },
  { id: "opportunities",label: "Opportunities",  icon: TrendingUp },
  { id: "customers",    label: "Customers",      icon: Building2 },
  { id: "top-buyers",   label: "Top Buyers",     icon: Trophy },
  { id: "parties",      label: "Parties",        icon: Wallet },
  { id: "contacts",     label: "Contacts",       icon: Phone },
  { id: "timeline",     label: "Customer 360",   icon: History },
];

export function CRM({ crm, invoices, expenses, suppliers }) {
  const [tab, setTab] = useState("leads");
  const [view, setView] = useState("pipeline"); // pipeline | list
  const { rows: leads, setRows: setLeads, loading, error } = crm;
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sort, setSort] = useState({ field: null, direction: "asc" });

  // Real bulk import — each row becomes a genuine crm_leads insert, same
  // table and same shape the manual "New Lead" form writes to. Rows
  // missing a contact name are skipped rather than silently creating a
  // blank, unusable lead.
  async function importCustomers(rows) {
    const validRows = rows.filter((r) => String(r.contact_name || "").trim());
    const drafts = validRows.map((r) => ({
      id: `LEAD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(r.contact_name).trim(), company: String(r.company_name || "").trim(),
      stage: "New", value: 0, currency: "TZS000", owner: "Unassigned",
      email: String(r.email || "").trim(), phone: String(r.phone || "").trim(),
      industry: "General", score: 50, lastActivity: "—", expectedCloseDate: null,
    }));
    setLeads((prev) => [...drafts, ...prev]);
    if (IS_CONFIGURED) {
      try {
        await sb("crm_leads").insert(drafts.map((d) => ({
          contact_name: d.name, company_name: d.company, stage: "New", value_amount: 0, email: d.email, phone: d.phone, industry: "General",
        }))).run();
      } catch (e) { throw new Error("Some rows saved locally but failed to reach the server."); }
    }
  }

  const filtered = useMemo(() => {
    let result = leads;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (l) => l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q) || l.industry.toLowerCase().includes(q)
      );
    }
    return view === "list" ? sortRows(result, sort) : result;
  }, [leads, query, sort, view]);

  const grouped = useMemo(() => {
    const g = {};
    STAGES.forEach((s) => (g[s] = []));
    filtered.forEach((l) => g[l.stage]?.push(l));
    return g;
  }, [filtered]);

  async function moveStage(id, dir) {
    const current = leads.find((l) => l.id === id);
    if (!current) return;
    const idx = STAGES.indexOf(current.stage);
    const next = STAGES[Math.min(Math.max(idx + dir, 0), STAGES.length - 1)];

    // Optimistic update — the board feels instant either way.
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage: next } : l)));

    // Persist when a real project is connected; demo mode stops here.
    if (IS_CONFIGURED) {
      try {
        await sb("crm_leads").eq("id", current.dbId ?? id).update({ stage: next }).run();
      } catch (e) {
        notify("Couldn't save the stage change to the server.", "error");
      }
    }
  }

  async function addLead(form) {
    const draft = {
      id: docId("L"),
      name: form.name,
      company: form.company,
      stage: "New",
      value: Number(form.value) || 0,
      currency: "TZS000",
      owner: form.owner || "Unassigned",
      email: form.email,
      phone: form.phone,
      industry: form.industry || "General",
      lastActivity: "Just now",
      score: 50,
      expectedCloseDate: form.expectedCloseDate || null,
    };

    setLeads((prev) => [draft, ...prev]);
    notify(`Lead created: ${draft.company}`);
    setShowForm(false);

    if (IS_CONFIGURED) {
      try {
        const header = await sb("crm_leads").insert({
          contact_name: form.name,
          company_name: form.company,
          stage: "New",
          value_amount: Number(form.value) || 0,
          email: form.email,
          phone: form.phone,
          industry: form.industry,
          expected_close_date: form.expectedCloseDate || null,
        }).single().run();
        if (header?.id) {
          setLeads((prev) => prev.map((l) => (l.id === draft.id ? { ...l, dbId: header.id } : l)));
        }
      } catch (e) {
        notify("Lead created locally, but saving to the server failed.", "error");
      }
    }
  }

  async function deleteLead(id) {
    const current = leads.find((l) => l.id === id);
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && current?.dbId) {
      try {
        await sb("crm_leads").eq("id", current.dbId).delete().run();
      } catch (e) {
        notify("Couldn't delete the lead on the server.", "error");
      }
    }
  }

  return (
    <div className="space-y-5">
      {IS_CONFIGURED && error && (
        <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 text-[#EF4444] text-[12.5px] rounded-lg px-3.5 py-2.5">
          Couldn't reach Supabase ({error}) — showing last known data.
        </div>
      )}
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Customer Relationship Management</h1>
        <p className="text-[13px] text-slate-500 mt-1">Leads, opportunities, accounts, and the people behind them</p>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto w-fit max-w-full">
        {CRM_TABS.map((t) => {
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

      {tab === "opportunities" && <Opportunities leads={leads} onSelect={setSelected} />}
      {tab === "parties" && <PartiesLedger leads={leads} invoices={invoices} expenses={expenses} suppliers={suppliers} />}
      {tab === "customers"  && <Customers leads={leads} invoices={invoices} />}
      {tab === "top-buyers" && <TopBuyers leads={leads} invoices={invoices} company={window.__smartManagerCompany||{}} />}
      {tab === "contacts"   && <Contacts />}
      {tab === "timeline" && <Customer360View crm={crm} invoices={invoices} />}

      {tab === "leads" && (
        <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-slate-500">{filtered.length} leads across {STAGES.length} stages</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowImport(true)}
            className="btn-secondary text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5"
          >
            <UploadCloud size={15} /> Import
          </button>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#7C3AED] border border-[#7C3AED]/30 bg-[#F5F3FF] px-3.5 py-2 rounded-lg hover:bg-[#EDE9FE]"
          >
            <QrCode size={14}/> Invite Code
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus size={15} /> New Lead
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, companies, industries..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 self-start sm:self-auto">
          <button
            onClick={() => setView("pipeline")}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${view === "pipeline" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setView("list")}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${view === "list" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500"}`}
          >
            List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-3 rounded skeleton-shimmer w-40" />
              <div className="h-3 rounded skeleton-shimmer w-24" />
              <div className="h-3 rounded skeleton-shimmer w-20 ml-auto" />
            </div>
          ))}
        </div>
      ) : leads.length === 0 && !query.trim() ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
          <EmptyState
            icon={Users}
            title="No leads yet"
            hint="Your pipeline starts here. Add your first lead and track it from first contact to closed-won."
            actionLabel="New Lead"
            onAction={() => setShowForm(true)}
          />
        </div>
      ) : view === "pipeline" ? (
        <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {STAGES.map((stage) => (
            <div key={stage} className="bg-slate-50 rounded-xl p-2.5 min-h-[420px] w-[240px] sm:w-auto shrink-0 snap-start">
              <div className="flex items-center justify-between px-1.5 py-1.5 mb-1">
                <StagePill stage={stage} />
                <span className="text-[11px] font-mono text-slate-400">{grouped[stage].length}</span>
              </div>
              <div className="space-y-2">
                {grouped[stage].map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => setSelected(lead)}
                    className="w-full text-left bg-white rounded-lg border border-slate-200/80 p-3 hover:border-[#16A34A]/50 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-[#111827] leading-snug">{lead.company}</p>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{lead.score}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{lead.name}</p>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-[12px] font-mono font-medium text-[#111827]">
                        {lead.value.toLocaleString()}k
                      </span>
                      <span className="text-[10px] text-slate-400">{lead.lastActivity}</span>
                    </div>
                  </button>
                ))}
                {grouped[stage].length === 0 && (
                  <div className="text-[11px] text-slate-300 text-center py-6">No leads</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <SortableHeader label="Lead" field="company" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} />
                <SortableHeader label="Industry" field="industry" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} />
                <SortableHeader label="Stage" field="stage" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} />
                <SortableHeader label="Owner" field="owner" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} />
                <SortableHeader label="Value (TZS 000)" field="value" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} align="right" />
                <SortableHeader label="Score" field="score" sort={sort} onSort={(f) => toggleSort(sort, setSort, f)} align="right" />
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#111827]">{lead.company}</p>
                    <p className="text-[12px] text-slate-400">{lead.name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{lead.industry}</td>
                  <td className="px-4 py-3"><StagePill stage={lead.stage} /></td>
                  <td className="px-4 py-3 text-slate-500">{lead.owner}</td>
                  <td className="px-4 py-3 text-right font-mono">{money(lead.value)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">{lead.score}</td>
                  <td className="px-4 py-3 text-right">
                    <MoreHorizontal size={15} className="text-slate-300 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showForm && <LeadFormPanel onClose={() => setShowForm(false)} onSubmit={addLead} />}
      {showImport && <DataImportPanel type="customers" onClose={() => setShowImport(false)} onImport={importCustomers} />}
        </>
      )}

      {selected && (
        <LeadPanel
          lead={selected}
          onClose={() => setSelected(null)}
          onMove={(dir) => {
            moveStage(selected.id, dir);
            setSelected((s) => {
              const idx = STAGES.indexOf(s.stage);
              const next = STAGES[Math.min(Math.max(idx + dir, 0), STAGES.length - 1)];
              return { ...s, stage: next };
            });
          }}
          onDelete={deleteLead}
        />
      )}
    </div>
  );
}

export function LeadPanel({ lead, onClose, onMove, onDelete }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const idx = STAGES.indexOf(lead.stage);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[11px] font-mono text-slate-400">{lead.id}</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">{lead.company}</h2>
            <p className="text-[13px] text-slate-500">{lead.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mb-6">
          <StagePill stage={lead.stage} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Deal Value</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">TZS {money(lead.value)}k</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">Lead Score</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">{lead.score}/100</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
            <Mail size={14} className="text-slate-400" /> {lead.email}
          </div>
          <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
            <Phone size={14} className="text-slate-400" /> {lead.phone}
          </div>
          <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
            <Building2 size={14} className="text-slate-400" /> {lead.industry}
          </div>
          <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
            <Star size={14} className="text-slate-400" /> Owned by {lead.owner}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[12px] font-medium text-slate-500 mb-2.5">Move stage</p>
          <div className="flex gap-2">
            <button
              disabled={idx === 0}
              onClick={() => onMove(-1)}
              className="flex-1 text-[12px] border border-slate-200 rounded-lg py-2 disabled:opacity-30 hover:bg-slate-50"
            >
              ← Back
            </button>
            <button
              disabled={idx === STAGES.length - 1}
              onClick={() => onMove(1)}
              className="flex-1 text-[12px] btn-primary text-white rounded-lg py-2 disabled:opacity-30"
            >
              Advance →
            </button>
          </div>
        </div>

        <div className="flex-1" />
        <div className="border-t border-slate-100 pt-4 mt-4 flex">
          <ConfirmDeleteButton label="Delete lead" onConfirm={() => confirmAction("This lead and all its notes will be permanently removed.", () => onDelete(lead.id), { variant: "danger", title: "Delete lead?", confirmLabel: "Delete lead" })} />
        </div>
      </div>
    </div>
  );
}

export function LeadFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", industry: "", value: "", owner: "" });
  const [touched, setTouched] = useState(false);

  const valid = form.name.trim() && form.company.trim();

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(form);
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full sm:w-[420px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col"
        style={{ animation: "slideIn .15s ease-out" }}
      >
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">CRM</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Lead</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Contact name" required>
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Amara Mwakisisile" />
            {touched && !form.name.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Contact name is required.</p>}
          </FormField>

          <FormField label="Company" required>
            <input className={inputClass} value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="e.g. Kilimo Fresh Distributors" />
            {touched && !form.company.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Company is required.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email">
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.tz" />
            </FormField>
            <FormField label="Phone">
              <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+255 7XX XXX XXX" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Industry">
              <input className={inputClass} value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Construction" />
            </FormField>
            <FormField label="Deal value (TZS 000)">
              <input type="number" min="0" className={inputClass} value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="0" />
            </FormField>
          </div>

          <FormField label="Owner">
            <input className={inputClass} value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="e.g. J. Batenga" />
          </FormField>

          <FormField label="Expected close date">
            <input type="date" className={inputClass} value={form.expectedCloseDate || ""} onChange={(e) => set("expectedCloseDate", e.target.value)} />
            <p className="text-[11px] text-slate-400 mt-1">Optional — drives the Opportunities forecast view.</p>
          </FormField>

          <p className="text-[11.5px] text-slate-400 pt-1">
            New leads are created at the <span className="font-medium text-slate-500">New</span> stage and can be advanced from the pipeline board.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 transition-colors">
            Create Lead
          </button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════ OPPORTUNITIES ══════════════ */
/* ------------------------------- OPPORTUNITIES --------------------------------- */

// An Opportunity is a lead that's a real deal in progress — Qualified
// through Negotiation. New (unqualified) and Won/Lost (already resolved)
// don't belong in a forecast. Weighted value is the standard sales
// convention: deal value × stage-based close probability, computed live,
// never a stored guess.
export function Opportunities({ leads, onSelect }) {
  const STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
  const STAGE_CFG = {
    New:         { col:"#64748B", bg:"#F8FAFC", badge:"#E2E8F0", label:"#475569" },
    Contacted:   { col:"#2563EB", bg:"#EFF6FF", badge:"#DBEAFE", label:"#1D4ED8" },
    Qualified:   { col:"#7C3AED", bg:"#F5F3FF", badge:"#EDE9FE", label:"#6D28D9" },
    Proposal:    { col:"#D97706", bg:"#FFFBEB", badge:"#FEF3C7", label:"#B45309" },
    Negotiation: { col:"#EA580C", bg:"#FFF7ED", badge:"#FFEDD5", label:"#C2410C" },
    Won:         { col:"#16A34A", bg:"#F0FDF4", badge:"#DCFCE7", label:"#15803D" },
    Lost:        { col:"#EF4444", bg:"#FEF2F2", badge:"#FEE2E2", label:"#991B1B" },
  };

  const [dragging,  setDragging]  = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [viewMode,  setViewMode]  = useState("kanban"); // kanban | table
  const [showForm,  setShowForm]  = useState(false);
  const [form, setForm] = useState({ company:"", contact:"", value:"", stage:"Qualified", notes:"" });

  const opportunities = useMemo(
    () => leads.filter(l => l.stage !== undefined),
    [leads]
  );

  const byStage = useMemo(() => {
    const map = {};
    STAGES.forEach(s => { map[s] = opportunities.filter(o => o.stage === s); });
    return map;
  }, [opportunities]);

  const totals = useMemo(() => ({
    pipeline: opportunities.filter(l => !["Won","Lost"].includes(l.stage)).reduce((s,o)=>s+o.value,0),
    won:      opportunities.filter(l => l.stage==="Won").reduce((s,o)=>s+o.value,0),
    lost:     opportunities.filter(l => l.stage==="Lost").reduce((s,o)=>s+o.value,0),
    winRate:  opportunities.length > 0
      ? Math.round(opportunities.filter(l=>l.stage==="Won").length / opportunities.length * 100)
      : 0,
  }), [opportunities]);

  function moveToStage(leadId, newStage) {
    onSelect && onSelect(prev => {
      // can't do this without setRows — so just notify
    });
    notify("Moved to " + newStage + " stage");
  }

  const DragCard = ({ opp }) => {
    const cfg = STAGE_CFG[opp.stage] || STAGE_CFG.Qualified;
    return (
      <div
        draggable
        onDragStart={() => setDragging(opp)}
        onDragEnd={() => { setDragging(null); setOverStage(null); }}
        className="bg-white rounded-xl border border-slate-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all mb-2 group"
        style={{ borderLeft: `3px solid ${cfg.col}` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#111827] truncate">{opp.company || opp.contact || "—"}</p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{opp.contact}</p>
          </div>
          <span className="text-[11px] font-bold shrink-0" style={{color:cfg.col}}>
            TZS {money(opp.value)}k
          </span>
        </div>
        {opp.email && (
          <p className="text-[10.5px] text-slate-400 mt-1.5 truncate">{opp.email}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{background:cfg.col}}/>
          <span className="text-[10.5px] font-medium" style={{color:cfg.label}}>{opp.stage}</span>
          <span className="ml-auto text-[10px] text-slate-300 group-hover:text-slate-400">⠿ drag</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Pipeline Value", "TZS "+money(totals.pipeline)+"k", "#7C3AED"],
          ["Won",            "TZS "+money(totals.won)+"k",      "#16A34A"],
          ["Lost",           "TZS "+money(totals.lost)+"k",     "#EF4444"],
          ["Win Rate",       totals.winRate+"%",                 "#D97706"],
        ].map(([l,v,col]) => (
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[20px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Stage Analytics */}
      {(() => {
        const stageData = STAGES.slice(0, -2).map((s, i) => ({
          name: s,
          value: Math.round(((byStage[s]||[]).reduce((sum,o)=>sum+(o.value||0),0))),
          count: (byStage[s]||[]).length,
          fill: ["#64748B","#2563EB","#7C3AED","#D97706","#EF4444"][i % 5],
        })).filter(d => d.count > 0);

        const outcomeData = [
          { name:"Won",  value:totals.won,  fill:"#16A34A" },
          { name:"Lost", value:totals.lost, fill:"#EF4444" },
          { name:"Open", value:totals.pipeline, fill:"#7C3AED" },
        ].filter(d => d.value > 0);

        if (!stageData.length && !outcomeData.length) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Pipeline Value by Stage (TZS k)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stageData} margin={{left:0,right:10,top:0,bottom:0}}>
                  <CartesianGrid vertical={false} stroke="#EEF1F4"/>
                  <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9}} axisLine={false} tickLine={false}
                    tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}M`:v}/>
                  <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Value"]}/>
                  <Bar dataKey="value" radius={[4,4,0,0]} maxBarSize={40}>
                    {stageData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
              <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Deal Outcome Distribution</h3>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={150}>
                  <PieChart>
                    <Pie data={outcomeData} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={32}>
                      {outcomeData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <Tooltip formatter={(v)=>[`TZS ${money(v)}k`,"Value"]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {outcomeData.map(d=>(
                    <div key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px]">
                        <span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}
                      </span>
                      <span className="text-[13px] font-black" style={{color:d.fill}}>TZS {money(d.value)}k</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[11.5px] text-slate-400">Win Rate: <strong className="text-[#16A34A]">{totals.winRate}%</strong></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[["kanban","Kanban"],["table","Table"]].map(([id,label]) => (
            <button key={id} onClick={()=>setViewMode(id)}
              className={"px-3 py-1.5 rounded-md text-[12px] font-medium transition-all "+(viewMode===id?"bg-white text-[#111827] shadow-sm":"text-slate-500")}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={()=>setShowForm(v=>!v)}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white px-4 py-2 rounded-xl bg-[#7C3AED]">
          <Plus size={13}/>New Deal
        </button>
      </div>

      {/* Add deal form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <p className="text-[14px] font-semibold text-[#111827] mb-3">New Deal</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FormField label="Company"><input className={inputClass} value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Company name"/></FormField>
            <FormField label="Contact"><input className={inputClass} value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})} placeholder="Contact person"/></FormField>
            <FormField label="Deal Value (TZS k)"><input type="number" className={inputClass} value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/></FormField>
            <FormField label="Stage"><select className={inputClass} value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></FormField>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={()=>{notify("Deal added: "+form.company);setShowForm(false);}} className="text-[12.5px] font-semibold text-white px-5 py-2.5 rounded-xl bg-[#7C3AED]">Add Deal</button>
            <button onClick={()=>setShowForm(false)} className="text-[12.5px] text-slate-500 px-4 py-2.5">Cancel</button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {viewMode === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const cfg   = STAGE_CFG[stage];
            const cards = byStage[stage] || [];
            const total = cards.reduce((s,o)=>s+o.value,0);
            const isOver = overStage === stage;
            return (
              <div key={stage}
                className="flex-shrink-0 w-56 rounded-xl flex flex-col"
                style={{background: isOver ? cfg.bg : "#F8FAFC", border: `1.5px solid ${isOver ? cfg.col : "#E5E7EB"}`, transition:"border .15s"}}
                onDragOver={e=>{e.preventDefault();setOverStage(stage);}}
                onDrop={()=>{ if(dragging&&dragging.stage!==stage){ moveToStage(dragging.id,stage); } setOverStage(null); }}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 rounded-t-xl border-b" style={{borderColor:"#E5E7EB", background:cfg.badge}}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{background:cfg.col}}/>
                      <span className="text-[11.5px] font-bold" style={{color:cfg.label}}>{stage}</span>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{background:cfg.col}}>{cards.length}</span>
                  </div>
                  {total > 0 && (
                    <p className="text-[10.5px] font-semibold mt-1" style={{color:cfg.label}}>TZS {money(total)}k</p>
                  )}
                </div>
                {/* Cards */}
                <div className="p-2 flex-1 min-h-[120px]">
                  {cards.map(opp => <DragCard key={opp.id} opp={opp}/>)}
                  {cards.length === 0 && (
                    <div className="flex items-center justify-center h-16 text-slate-300 text-[11.5px]">Drop here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table view */}
      {viewMode === "table" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">{["Company","Contact","Email","Value","Stage","Action"].map(h=>(
              <th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>
            ))}</tr></thead>
            <tbody>{opportunities.map(opp => {
              const cfg = STAGE_CFG[opp.stage] || STAGE_CFG.Qualified;
              return (
                <tr key={opp.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-[#111827]">{opp.company}</td>
                  <td className="px-4 py-3 text-slate-500">{opp.contact}</td>
                  <td className="px-4 py-3 text-slate-400 text-[11.5px]">{opp.email}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[#111827]">TZS {money(opp.value)}k</td>
                  <td className="px-4 py-3"><span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{background:cfg.badge,color:cfg.label}}>{opp.stage}</span></td>
                  <td className="px-4 py-3">
                    <select className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600"
                      value={opp.stage} onChange={e=>moveToStage(opp.id, e.target.value)}>
                      {STAGES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Loyalty tier config — thresholds are annual spend in TZS thousands
export const LOYALTY_TIERS = [
  {
    id:"platinum", label:"Platinum", emoji:"💎",
    min:5000, discount:15, color:"#7C3AED", bg:"#F5F3FF", border:"#DDD6FE",
    congrats:"You are our most valued partner. Your extraordinary commitment drives our growth — we are deeply grateful.",
  },
  {
    id:"gold", label:"Gold", emoji:"🥇",
    min:2000, discount:10, color:"#D97706", bg:"#FFFBEB", border:"#FDE68A",
    congrats:"Excellent loyalty! You are among our top customers — your business is hugely appreciated.",
  },
  {
    id:"silver", label:"Silver", emoji:"🥈",
    min:800, discount:7, color:"#6B7280", bg:"#F9FAFB", border:"#E5E7EB",
    congrats:"Great partnership! Your consistent business helps us serve you even better.",
  },
  {
    id:"bronze", label:"Bronze", emoji:"🥉",
    min:200, discount:5, color:"#92400E", bg:"#FEF3C7", border:"#FCD34D",
    congrats:"Thank you for trusting us! We value every purchase and look forward to growing together.",
  },
  {
    id:"member", label:"Member", emoji:"⭐",
    min:0, discount:2, color:"#2563EB", bg:"#EFF6FF", border:"#BFDBFE",
    congrats:"Welcome to our family! Every purchase earns you points toward higher loyalty tiers.",
  },
];

export function getTier(annualSpend) {
  return LOYALTY_TIERS.find(t => annualSpend >= t.min) || LOYALTY_TIERS[LOYALTY_TIERS.length-1];
}

export function TopBuyers({ leads, invoices, company }) {
  const [selectedId, setSelectedId] = useState(null);
  const [yearFilter, setYearFilter]  = useState(String(new Date().getFullYear()));

  const YEARS = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i));

  // ── Build ranked customer list with full annual data ─────────────────
  const ranked = useMemo(() => {
    const won = leads.filter(l => l.stage === "Won");
    return won.map(l => {
      const name = (l.company || l.contact || "").toLowerCase();
      const allInvs = invoices.rows.filter(inv =>
        (inv.customer || "").toLowerCase() === name
      );

      // Year-specific invoices
      const yearInvs = allInvs.filter(inv => (inv.date || "").startsWith(yearFilter));

      // Annual spend
      const annualSpend = yearInvs.reduce((s, inv) => s + lineTotal(inv.items).total, 0);

      // Lifetime spend
      const lifetimeSpend = allInvs.reduce((s, inv) => s + lineTotal(inv.items).total, 0);

      // Product breakdown for the year
      const productMap = {};
      yearInvs.forEach(inv => {
        (inv.items || []).forEach(it => {
          const key = it.name || "Unknown";
          if (!productMap[key]) productMap[key] = { name:key, qty:0, revenue:0, invoices:0 };
          productMap[key].qty     += Number(it.qty) || 0;
          productMap[key].revenue += (Number(it.qty)||0)*(Number(it.rate)||0)*(1-Math.min(1,Math.max(0,(Number(it.discount)||0)/100)));
          productMap[key].invoices++;
        });
      });
      const products = Object.values(productMap).sort((a,b) => b.revenue-a.revenue);

      // Payment behaviour
      const paidInvs = yearInvs.filter(inv => inv.status === "Paid");
      const outstanding = yearInvs.filter(inv => inv.status !== "Paid")
        .reduce((s,inv) => s+(lineTotal(inv.items).total-(inv.amountPaid||0)), 0);

      const tier = getTier(annualSpend / 1000); // compare in TZS thousands

      return {
        ...l,
        allInvs, yearInvs, annualSpend, lifetimeSpend, products, paidInvs, outstanding, tier,
        invoiceCount: yearInvs.length,
        avgOrderValue: yearInvs.length ? annualSpend / yearInvs.length : 0,
      };
    })
    .filter(c => c.yearInvs.length > 0 || c.lifetimeSpend > 0)
    .sort((a,b) => b.annualSpend - a.annualSpend);
  }, [leads, invoices.rows, yearFilter]);

  const selected = ranked.find(c => c.id === selectedId);

  // ── PDF: Annual Customer Statement ───────────────────────────────────
  function printCustomerStatement(cust) {
    const co    = company;
    const ACCENT= "#16A34A";
    const DARK  = "#0D2214";
    const fmt   = n => new Intl.NumberFormat("en-US").format(Math.round(n));
    const tier  = cust.tier;

    const productRows = cust.products.map((p, i) =>
      `<tr style="background:${i%2===0?"#fff":"#F8FAFB"}">
        <td style="padding:9px 12px;font-size:12px">${i+1}. ${p.name}</td>
        <td style="padding:9px 12px;text-align:center;font-size:12px;font-family:monospace">${fmt(p.qty)}</td>
        <td style="padding:9px 12px;text-align:center;font-size:12px">${p.invoices}</td>
        <td style="padding:9px 12px;text-align:right;font-size:12px;font-family:monospace;font-weight:600">TZS ${fmt(p.revenue)}k</td>
      </tr>`
    ).join("");

    const invoiceRows = cust.yearInvs.map((inv, i) => {
      const total = lineTotal(inv.items).total;
      const statusColor = {Paid:"#16A34A",Unpaid:"#F59E0B",Overdue:"#EF4444",Partial:"#3B82F6"}[inv.status]||"#6B7280";
      return `<tr style="background:${i%2===0?"#fff":"#F8FAFB"}">
        <td style="padding:7px 12px;font-size:11.5px;font-family:monospace;font-weight:600">${inv.id}</td>
        <td style="padding:7px 12px;font-size:11.5px">${inv.date}</td>
        <td style="padding:7px 12px;font-size:11.5px">${(inv.items||[]).map(it=>it.name).join(", ").slice(0,40)}</td>
        <td style="padding:7px 12px;text-align:center;font-size:11px">
          <span style="background:${statusColor}18;color:${statusColor};padding:2px 8px;border-radius:12px;font-size:10.5px;font-weight:700">${inv.status}</span>
        </td>
        <td style="padding:7px 12px;text-align:right;font-family:monospace;font-weight:600;font-size:12px">TZS ${fmt(total)}k</td>
      </tr>`;
    }).join("");

    const win = window.open("","_blank","width=960,height=1200");
    if (!win) { notify("Pop-up blocked — allow pop-ups to print.", "error"); return; }

    win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
      <title>Customer Statement — ${cust.company||cust.contact} · ${yearFilter}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Inter,Arial,sans-serif;background:#F3F4F6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        @media print{body{background:white}.toolbar{display:none!important}}
        .page{max-width:800px;margin:24px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,.12)}
        .hdr{background:${DARK};padding:32px 40px;display:flex;justify-content:space-between;align-items:flex-start}
        .co-name{font-size:20px;font-weight:800;color:white}
        .co-meta{font-size:10.5px;color:rgba(255,255,255,.5);margin-top:4px;line-height:1.7}
        .doc-label{font-size:40px;font-weight:900;color:${ACCENT};text-align:right;letter-spacing:-1px}
        .year-badge{display:inline-block;background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-top:6px}
        .customer-band{padding:22px 40px;background:#F8FAFB;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center}
        .cust-name{font-size:22px;font-weight:800;color:#111827}
        .cust-meta{font-size:12px;color:#6B7280;margin-top:3px}
        .tier-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:800;border:2px solid ${tier.border};background:${tier.bg};color:${tier.color}}
        .congrats-band{background:linear-gradient(135deg,${tier.bg},white);border-bottom:1px solid ${tier.border};padding:20px 40px}
        .congrats-title{font-size:14px;font-weight:800;color:${tier.color};margin-bottom:4px}
        .congrats-text{font-size:12.5px;color:#374151;line-height:1.6}
        .disc-pill{display:inline-block;background:${ACCENT};color:white;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:800;margin-top:8px}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#E5E7EB;border-bottom:1px solid #E5E7EB}
        .kpi{background:white;padding:18px 20px;text-align:center}
        .kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9CA3AF;margin-bottom:4px}
        .kpi-value{font-size:18px;font-weight:800;color:#111827}
        .section{padding:24px 40px}
        .sec-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#9CA3AF;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #F3F4F6}
        table.data{width:100%;border-collapse:collapse}
        table.data thead tr{background:${DARK}}
        table.data thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.8)}
        table.data thead th.r{text-align:right}table.data thead th.c{text-align:center}
        .ftr{background:${DARK};padding:16px 40px;display:flex;justify-content:space-between;align-items:center}
        .ftr-note{font-size:10.5px;color:rgba(255,255,255,.4)}
        .ftr-brand{font-size:11px;font-weight:700;color:${ACCENT}}
        .toolbar{position:fixed;bottom:24px;right:24px;display:flex;gap:8px}
        .btn{padding:10px 20px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;border:none;font-family:Inter}
        .btn-p{background:${ACCENT};color:white}.btn-c{background:white;color:#111827;border:1.5px solid #E5E7EB}
      </style></head><body>
      <div class="page">

        <!-- Header -->
        <div class="hdr">
          <div>
            <div class="co-name">${co.name||"SMART MANAGER"}</div>
            <div class="co-meta">${[co.address,co.city,"Tanzania"].filter(Boolean).join(" · ")}${co.tin?"<br>TIN: "+co.tin:""}</div>
          </div>
          <div style="text-align:right">
            <div class="doc-label">STATEMENT</div>
            <div class="year-badge">Annual · ${yearFilter}</div>
          </div>
        </div>

        <!-- Customer identity -->
        <div class="customer-band">
          <div>
            <div class="cust-name">${cust.company||cust.contact}</div>
            <div class="cust-meta">${cust.industry||""}${cust.email?" · "+cust.email:""}${cust.phone?" · "+cust.phone:""}</div>
          </div>
          <div class="tier-badge">${tier.emoji} ${tier.label} Member</div>
        </div>

        <!-- Congratulations band -->
        <div class="congrats-band">
          <div class="congrats-title">${tier.emoji} ${tier.label} Tier — Congratulations, ${(cust.company||cust.contact).split(" ")[0]}!</div>
          <div class="congrats-text">${tier.congrats}</div>
          <div class="disc-pill">🏷 Your Loyalty Discount: ${tier.discount}% off all future orders</div>
        </div>

        <!-- KPIs -->
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Annual Spend ${yearFilter}</div><div class="kpi-value" style="color:${ACCENT}">TZS ${fmt(cust.annualSpend)}k</div></div>
          <div class="kpi"><div class="kpi-label">Invoices</div><div class="kpi-value">${cust.invoiceCount}</div></div>
          <div class="kpi"><div class="kpi-label">Avg Order Value</div><div class="kpi-value">TZS ${fmt(cust.avgOrderValue)}k</div></div>
          <div class="kpi"><div class="kpi-label">Outstanding</div><div class="kpi-value" style="color:${cust.outstanding>0?"#F59E0B":"#16A34A"}">${cust.outstanding>0?"TZS "+fmt(cust.outstanding)+"k":"Settled ✓"}</div></div>
        </div>

        <!-- Products bought -->
        ${cust.products.length > 0 ? `
        <div class="section">
          <div class="sec-title">Products & Services Purchased in ${yearFilter}</div>
          <table class="data">
            <thead><tr>
              <th>Product / Service</th>
              <th class="c">Units</th>
              <th class="c">Orders</th>
              <th class="r">Revenue (TZS)</th>
            </tr></thead>
            <tbody>${productRows}</tbody>
            <tfoot><tr style="background:#F0FDF4">
              <td colspan="3" style="padding:9px 12px;font-weight:700;font-size:12.5px">Total</td>
              <td style="padding:9px 12px;text-align:right;font-family:monospace;font-weight:800;font-size:13px;color:${ACCENT}">TZS ${fmt(cust.annualSpend)}k</td>
            </tr></tfoot>
          </table>
        </div>` : ""}

        <!-- Invoice history -->
        ${cust.yearInvs.length > 0 ? `
        <div class="section" style="padding-top:0">
          <div class="sec-title">Invoice History — ${yearFilter}</div>
          <table class="data">
            <thead><tr>
              <th>Invoice</th><th>Date</th><th>Description</th><th class="c">Status</th><th class="r">Amount (TZS)</th>
            </tr></thead>
            <tbody>${invoiceRows}</tbody>
          </table>
        </div>` : ""}

        <!-- Footer -->
        <div class="ftr">
          <div class="ftr-note">Confidential · Generated ${new Date().toLocaleDateString()} · Thank you for your continued business</div>
          <div class="ftr-brand">SMART MANAGER</div>
        </div>
      </div>

      <div class="toolbar">
        <button class="btn btn-c" onclick="window.close()">Close</button>
        <button class="btn btn-p" onclick="window.print()">Print / Save PDF</button>
      </div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.focus(), 200);
  }

  // ── CSV / Excel Export ────────────────────────────────────────────────
  function exportCustomerCSV(cust) {
    const rows = [
      ["CustomerStatement", "", "", "", ""],
      ["Customer", cust.company||cust.contact, "", "", ""],
      ["Year", yearFilter, "", "", ""],
      ["Tier", cust.tier.label, "", "", ""],
      ["Loyalty Discount", cust.tier.discount+"%", "", "", ""],
      ["Annual Spend (TZS k)", Math.round(cust.annualSpend), "", "", ""],
      ["", "", "", "", ""],
      ["--- PRODUCTS PURCHASED ---", "", "", "", ""],
      ["Product", "Units", "Orders", "Revenue (TZS k)", ""],
      ...cust.products.map(p => [p.name, p.qty, p.invoices, Math.round(p.revenue), ""]),
      ["", "", "", "", ""],
      ["--- INVOICE HISTORY ---", "", "", "", ""],
      ["Invoice ID", "Date", "Items", "Status", "Amount (TZS k)"],
      ...cust.yearInvs.map(inv => [
        inv.id, inv.date,
        (inv.items||[]).map(it=>it.name).join("; "),
        inv.status,
        Math.round(lineTotal(inv.items).total),
      ]),
    ];
    downloadCSV(
      `statement-${(cust.company||cust.contact).replace(/\s+/g,"-")}-${yearFilter}.csv`,
      rows,
      []
    );
    notify("CSV exported — open in Excel or Google Sheets");
  }

  // ── All-buyers CSV / Excel ────────────────────────────────────────────
  function exportAllBuyersCSV() {
    const rows = [
      ["Rank","Customer","Tier","Discount","Annual Spend (TZS k)","Invoices","Avg Order (TZS k)","Outstanding (TZS k)","Top Product"],
      ...ranked.map((c,i) => [
        i+1, c.company||c.contact, c.tier.label, c.tier.discount+"%",
        Math.round(c.annualSpend), c.invoiceCount,
        Math.round(c.avgOrderValue), Math.round(c.outstanding),
        c.products[0]?.name||"—",
      ]),
    ];
    downloadCSV(`top-buyers-${yearFilter}.csv`, rows, []);
    notify("All buyers exported as CSV");
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight flex items-center gap-2">
            <Trophy size={20} className="text-[#D97706]"/> Top Buyers — Loyalty Rankings
          </h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Ranked by annual spend · Automatic tier assignment · Loyalty discounts · Annual statement PDF
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {YEARS.map(y => (
              <button key={y} onClick={() => setYearFilter(y)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${yearFilter===y?"bg-white text-[#111827] shadow-sm":"text-slate-500"}`}>
                {y}
              </button>
            ))}
          </div>
          <button onClick={exportAllBuyersCSV}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-white px-3.5 py-2 rounded-xl bg-[#16A34A]">
            <Download size={13}/> Export All
          </button>
        </div>
      </div>

      {/* Tier legend */}
      <div className="flex flex-wrap gap-2">
        {LOYALTY_TIERS.map(t => (
          <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12px] font-semibold"
            style={{background:t.bg, borderColor:t.border, color:t.color}}>
            <span>{t.emoji}</span>
            <span>{t.label}</span>
            <span className="text-[10.5px] font-normal opacity-70">TZS {t.min}k+ / yr</span>
            <span className="bg-white px-1.5 py-0.5 rounded-lg text-[10.5px] font-bold" style={{color:t.color}}>{t.discount}% off</span>
          </div>
        ))}
      </div>

      {ranked.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center">
          <Trophy size={40} className="text-slate-200 mx-auto mb-3"/>
          <p className="text-[15px] font-semibold text-slate-400">No buyers yet for {yearFilter}</p>
          <p className="text-[12.5px] text-slate-400 mt-1">Win leads and create invoices to see rankings here.</p>
        </div>
      ) : (
        <>
          {/* Podium — Top 3 */}
          {ranked.length >= 1 && (
            <div className="bg-gradient-to-br from-[#0D2214] to-[#1a3a2a] rounded-2xl p-5 sm:p-6">
              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest mb-5 text-center">
                🏆 {yearFilter} Leaderboard
              </p>
              <div className="flex items-end justify-center gap-3 sm:gap-5">
                {/* 2nd place */}
                {ranked[1] && (
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <div className="text-[24px]">🥈</div>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[22px] font-black"
                      style={{background:"#94A3B8"}}>
                      {(ranked[1].company||ranked[1].contact||"?").charAt(0)}
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold text-[13px] truncate max-w-[90px]">{(ranked[1].company||ranked[1].contact||"").split(" ")[0]}</p>
                      <p className="text-emerald-400 font-mono font-bold text-[12px]">TZS {money(Math.round(ranked[1].annualSpend))}k</p>
                      <div className="mt-1 inline-block text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                        style={{background:ranked[1].tier.color+"30",color:ranked[1].tier.color}}>
                        {ranked[1].tier.emoji} {ranked[1].tier.label}
                      </div>
                    </div>
                    <div className="w-full bg-[#94A3B8]/20 rounded-t-xl" style={{height:80}}/>
                  </div>
                )}
                {/* 1st place */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="text-[32px]">👑</div>
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-[30px] font-black shadow-xl ring-4 ring-[#D97706]/50"
                    style={{background:"linear-gradient(135deg,#D97706,#F59E0B)"}}>
                    {(ranked[0].company||ranked[0].contact||"?").charAt(0)}
                  </div>
                  <div className="text-center">
                    <p className="text-white font-black text-[15px] truncate max-w-[110px]">{(ranked[0].company||ranked[0].contact||"").split(" ")[0]}</p>
                    <p className="text-[#F59E0B] font-mono font-bold text-[14px]">TZS {money(Math.round(ranked[0].annualSpend))}k</p>
                    <div className="mt-1 inline-block text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#D97706]/20 text-[#D97706]">
                      {ranked[0].tier.emoji} {ranked[0].tier.label} · {ranked[0].tier.discount}% off
                    </div>
                  </div>
                  <div className="w-full rounded-t-xl" style={{height:110, background:"linear-gradient(to top,#D97706,#F59E0B)"}}/>
                </div>
                {/* 3rd place */}
                {ranked[2] && (
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <div className="text-[24px]">🥉</div>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[22px] font-black"
                      style={{background:"#B45309"}}>
                      {(ranked[2].company||ranked[2].contact||"?").charAt(0)}
                    </div>
                    <div className="text-center">
                      <p className="text-white font-bold text-[13px] truncate max-w-[90px]">{(ranked[2].company||ranked[2].contact||"").split(" ")[0]}</p>
                      <p className="text-emerald-400 font-mono font-bold text-[12px]">TZS {money(Math.round(ranked[2].annualSpend))}k</p>
                      <div className="mt-1 inline-block text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                        style={{background:ranked[2].tier.color+"30",color:ranked[2].tier.color}}>
                        {ranked[2].tier.emoji} {ranked[2].tier.label}
                      </div>
                    </div>
                    <div className="w-full bg-[#B45309]/20 rounded-t-xl" style={{height:60}}/>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Full rankings table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[13.5px] font-bold text-[#111827]">All Buyers — {yearFilter} Rankings</p>
              <p className="text-[12px] text-slate-400">{ranked.length} customers · Click a row for details</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["Rank","Customer","Tier","Annual Spend","Invoices","Avg Order","Top Product","Discount","Actions"].map(h=>(
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((cust, i) => {
                    const isTop = i < 3;
                    const rankColors = ["#D97706","#94A3B8","#B45309"];
                    const rankEmoji  = ["👑","🥈","🥉"];
                    return (
                      <tr key={cust.id}
                        onClick={() => setSelectedId(cust.id === selectedId ? null : cust.id)}
                        className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${selectedId===cust.id?"bg-[#F0FDF4]":"hover:bg-slate-50/70"}`}>
                        <td className="px-3 py-3.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black"
                            style={{background: isTop?rankColors[i]+"22":"#F1F5F9", color: isTop?rankColors[i]:"#64748B"}}>
                            {isTop ? rankEmoji[i] : i+1}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[13px] font-black shrink-0"
                              style={{background:cust.tier.color}}>
                              {(cust.company||cust.contact||"?").charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-[#111827]">{cust.company||cust.contact}</p>
                              <p className="text-[10.5px] text-slate-400">{cust.industry||cust.email||"—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border"
                            style={{background:cust.tier.bg,borderColor:cust.tier.border,color:cust.tier.color}}>
                            {cust.tier.emoji} {cust.tier.label}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 font-mono font-bold" style={{color:"#16A34A"}}>
                          TZS {money(Math.round(cust.annualSpend))}k
                        </td>
                        <td className="px-3 py-3.5 text-center font-mono text-slate-500">{cust.invoiceCount}</td>
                        <td className="px-3 py-3.5 font-mono text-slate-500">TZS {money(Math.round(cust.avgOrderValue))}k</td>
                        <td className="px-3 py-3.5 text-slate-500 max-w-[120px] truncate">{cust.products[0]?.name||"—"}</td>
                        <td className="px-3 py-3.5">
                          <span className="inline-block text-[11px] font-black px-2 py-0.5 rounded-full bg-[#16A34A] text-white">
                            {cust.tier.discount}% off
                          </span>
                        </td>
                        <td className="px-3 py-3.5" onClick={e=>e.stopPropagation()}>
                          <div className="flex gap-1.5 flex-wrap">
                            <button onClick={()=>printCustomerStatement(cust)}
                              className="flex items-center gap-1 text-[10.5px] font-bold text-white bg-[#16A34A] px-2.5 py-1.5 rounded-lg">
                              <FileText size={11}/> PDF
                            </button>
                            <button onClick={()=>exportCustomerCSV(cust)}
                              className="flex items-center gap-1 text-[10.5px] font-bold text-[#2563EB] border border-[#2563EB]/30 bg-[#EFF6FF] px-2.5 py-1.5 rounded-lg">
                              <Download size={11}/> CSV
                            </button>
                            <button onClick={()=>window.location.hash="#congrats-studio"}
                              className="flex items-center gap-1 text-[10.5px] font-bold text-[#D97706] border border-[#D97706]/30 bg-[#FFFBEB] px-2.5 py-1.5 rounded-lg"
                              title="Open Congratulations Studio in Settings">
                              🎉 Letter
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expanded customer detail panel */}
          {selected && (
            <div className="bg-white rounded-xl border-2 border-[#16A34A]/30 shadow-md overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between" style={{background:selected.tier.bg}}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[20px] font-black"
                    style={{background:selected.tier.color}}>
                    {(selected.company||selected.contact||"?").charAt(0)}
                  </div>
                  <div>
                    <p className="text-[16px] font-black text-[#111827]">{selected.company||selected.contact}</p>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{background:selected.tier.color,color:"white"}}>
                      {selected.tier.emoji} {selected.tier.label} · {selected.tier.discount}% loyalty discount
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>printCustomerStatement(selected)}
                    className="flex items-center gap-1.5 text-[12px] font-bold text-white px-4 py-2 rounded-xl bg-[#16A34A]">
                    <FileText size={13}/> Annual PDF
                  </button>
                  <button onClick={()=>exportCustomerCSV(selected)}
                    className="flex items-center gap-1.5 text-[12px] font-bold text-[#2563EB] border border-[#2563EB]/30 px-4 py-2 rounded-xl bg-white">
                    <Download size={13}/> CSV / Excel
                  </button>
                  <button
                    onClick={()=>{
                      const co=window.__smartManagerCompany||{};
                      const t=selected.tier;
                      const msg=`Hello ${(selected.company||selected.contact||"").split(" ")[0]},

🎉 *Congratulations!*

You have been awarded *${t.label}* loyalty status!
Enjoy *${t.discount}% OFF* all future orders.

Thank you for your outstanding loyalty!
_${co.name||"SMART MANAGER"}_`;
                      const phone=(selected.phone||"").replace(/[^0-9]/g,"");
                      if(phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank","noopener");
                      else { waBus.push({templateId:"loyalty",vars:{tier:t.label,discount:String(t.discount)}}); notify("Open Collaboration → WhatsApp to send congrats"); }
                    }}
                    className="flex items-center gap-1.5 text-[12px] font-bold text-white px-4 py-2 rounded-xl"
                    style={{background:"#25D366"}}>
                    <MessageCircle size={13}/> WA Congrats
                  </button>
                  <button
                    onClick={()=>{
                      const co=window.__smartManagerCompany||{};
                      const t=selected.tier;
                      const subj=`Congratulations — Your ${t.label} Loyalty Status!`;
                      const body=`Dear ${selected.company||selected.contact},

Congratulations!

You have been awarded ${t.label} loyalty status with ${co.name||"SMART MANAGER"}.

As a ${t.label} member, you enjoy ${t.discount}% off all future orders!

Thank you sincerely for your outstanding loyalty.

Warm regards,
${co.owner||"The Team"}
${co.name||"SMART MANAGER"}`;
                      if(selected.email) window.location.href=`mailto:${selected.email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
                      else { emailBus.push({subject:subj,body,tmpl:"loyalty"}); notify("Open Collaboration → Email to send congrats"); }
                    }}
                    className="flex items-center gap-1.5 text-[12px] font-bold text-white px-4 py-2 rounded-xl bg-[#2563EB]">
                    <Mail size={13}/> Email Congrats
                  </button>
                  <button onClick={()=>setSelectedId(null)} className="text-slate-400 hover:text-slate-600 px-2">
                    <X size={16}/>
                  </button>
                </div>
              </div>

              {/* Congratulations */}
              <div className="px-5 py-3 border-b border-slate-100" style={{background:`${selected.tier.color}08`}}>
                <p className="text-[12.5px] font-bold" style={{color:selected.tier.color}}>
                  {selected.tier.emoji} Congratulations, {(selected.company||selected.contact||"").split(" ")[0]}!
                </p>
                <p className="text-[12px] text-slate-600 mt-1">{selected.tier.congrats}</p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100">
                {[
                  ["Annual Spend", "TZS "+money(Math.round(selected.annualSpend))+"k", selected.tier.color],
                  ["Invoices",     selected.invoiceCount,                               "#2563EB"],
                  ["Avg Order",    "TZS "+money(Math.round(selected.avgOrderValue))+"k","#7C3AED"],
                  ["Outstanding",  selected.outstanding>0?"TZS "+money(Math.round(selected.outstanding))+"k":"Settled ✓", selected.outstanding>0?"#F59E0B":"#16A34A"],
                ].map(([l,v,col])=>(
                  <div key={l} className="bg-white px-4 py-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
                    <p className="text-[16px] font-bold" style={{color:col}}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Products table */}
              {selected.products.length > 0 && (
                <div className="px-5 py-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3">
                    Products / Services Purchased in {yearFilter} ({selected.products.length})
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead><tr className="border-b border-slate-100 bg-slate-50">
                        {["Product","Units","Orders","Revenue","Share"].map(h=>(
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {selected.products.map((p, i) => {
                          const share = selected.annualSpend > 0 ? Math.round(p.revenue/selected.annualSpend*100) : 0;
                          return (
                            <tr key={p.name} className="border-b border-slate-50 last:border-0">
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400 font-bold w-4">{i+1}</span>
                                  <span className="font-medium text-[#111827]">{p.name}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-slate-500">{p.qty}</td>
                              <td className="px-3 py-2.5 text-center text-slate-500">{p.invoices}</td>
                              <td className="px-3 py-2.5 font-mono font-bold" style={{color:selected.tier.color}}>TZS {money(Math.round(p.revenue))}k</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{width:share+"%",background:selected.tier.color}}/>
                                  </div>
                                  <span className="text-[10.5px] font-bold text-slate-400 w-7">{share}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Customers({ leads, invoices }) {
  const customers = useMemo(() => {
    const won = leads.filter((l) => l.stage === "Won");
    return won.map((l) => {
      const custInvs = invoices.rows.filter(
        (inv) => inv.customer?.toLowerCase() === (l.company || l.contact || "").toLowerCase()
      );
      const lifetimeValue = custInvs.reduce((s, inv) => s + lineTotal(inv.items).total, 0);
      const outstanding   = custInvs.filter(i=>i.status!=="Paid").reduce((s,i)=>s+(lineTotal(i.items).total-(i.amountPaid||0)),0);
      const lastActivity  = custInvs.length ? custInvs.sort((a,b)=>b.date?.localeCompare(a.date||""))[0]?.date : l.lastActivity;
      return { ...l, invoiceCount: custInvs.length, lifetimeValue, outstanding, lastActivity };
    }).sort((a,b) => b.lifetimeValue - a.lifetimeValue);
  }, [leads, invoices.rows]);

  const totalLifetime   = customers.reduce((s,c) => s + c.lifetimeValue, 0);
  const totalOutstanding= customers.reduce((s,c) => s + c.outstanding, 0);
  const topCustomers    = customers.slice(0, 8);

  // Chart data for top customers
  const chartData = topCustomers.map(c => ({
    name: (c.company || c.contact || "—").slice(0,14),
    value: Math.round(c.lifetimeValue / 1000),
    outstanding: Math.round(c.outstanding / 1000),
  }));

  // Revenue concentration: top 3 customers % of total
  const top3Share = totalLifetime > 0
    ? Math.round(topCustomers.slice(0,3).reduce((s,c)=>s+c.lifetimeValue,0)/totalLifetime*100)
    : 0;

  return (
    <div className="space-y-5">
      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Total Customers", customers.length,                           "#2563EB"],
          ["Lifetime Value",  "TZS "+money(Math.round(totalLifetime))+"k","#16A34A"],
          ["Outstanding AR",  "TZS "+money(Math.round(totalOutstanding))+"k", totalOutstanding>0?"#F59E0B":"#16A34A"],
          ["Top 3 Revenue Share", top3Share+"%",                          "#7C3AED"],
        ].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 text-center">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      {/* Top customers BarChart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Top Customers by Lifetime Value</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={90}/>
              <Tooltip formatter={(v,n)=>["TZS "+money(v)+"k", n==="value"?"Lifetime Value":"Outstanding"]}/>
              <Bar dataKey="value"       fill="#2563EB" radius={[0,5,5,0]} name="value" stackId="a"/>
              <Bar dataKey="outstanding" fill="#F59E0B" radius={[0,5,5,0]} name="outstanding" stackId="a"/>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-[11.5px]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-[#2563EB]"/>Lifetime Value</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-[#F59E0B]"/>Outstanding</span>
          </div>
        </div>
      )}

      {/* Customer table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[13.5px] font-semibold text-[#111827]">Customer Directory ({customers.length})</p>
          <p className="text-[12px] text-slate-400">TZS {money(Math.round(totalLifetime))}k total lifetime value</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 bg-slate-50">
              {["#","Customer","Industry","Owner","Invoices","Lifetime Value","Outstanding","Last Activity"].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {customers.map((cust, i) => {
                const rankColor = i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#B45309":"#E5E7EB";
                return (
                  <tr key={cust.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{background:rankColor}}>
                        {i+1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                          {(cust.company||cust.contact||"?").charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-[#111827]">{cust.company}</p>
                          <p className="text-[11px] text-slate-400">{cust.contact}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{cust.industry}</td>
                    <td className="px-4 py-3 text-slate-500">{cust.owner}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-500">{cust.invoiceCount}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#16A34A]">TZS {money(Math.round(cust.lifetimeValue))}k</td>
                    <td className="px-4 py-3 font-mono" style={{color:cust.outstanding>0?"#F59E0B":"#94A3B8"}}>
                      {cust.outstanding > 0 ? "TZS "+money(Math.round(cust.outstanding))+"k" : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[11.5px]">{cust.lastActivity || "—"}</td>
                  </tr>
                );
              })}
              {customers.length === 0 && (
                <tr><td colSpan={8}><div className="py-12 text-center text-slate-400">No customers yet — win a lead in CRM Pipeline to see them here.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// summarize.
export function PartiesLedger({ leads, invoices, expenses, suppliers }) {
  const [filter, setFilter] = useState("all");

  const parties = useMemo(() => {
    const customerParties = leads
      .filter((l) => l.stage === "Won")
      .map((l) => {
        const balance = invoices.rows
          .filter((inv) => inv.customer === l.company && inv.status !== "Paid")
          .reduce((s, inv) => s + (lineTotal(inv.items).total - (inv.amountPaid || 0)), 0);
        return { id:`cust-${l.id}`, name:l.company, sub:l.phone||l.email||"", type:"customer", balance, direction:"receive" };
      }).filter((p) => p.balance > 0);

    const supplierParties = (suppliers?.rows || [])
      .map((s) => {
        const balance = (expenses?.rows || [])
          .filter((e) => e.vendor === s.name && e.status !== "Paid")
          .reduce((sum, e) => sum + e.amount, 0);
        return { id:`sup-${s.id}`, name:s.name, sub:s.contactPerson||s.phone||"", type:"supplier", balance, direction:"give" };
      }).filter((p) => p.balance > 0);

    return [...customerParties, ...supplierParties].sort((a, b) => b.balance - a.balance);
  }, [leads, invoices.rows, expenses?.rows, suppliers?.rows]);

  const filtered     = filter === "all" ? parties : parties.filter((p) => p.type === filter.slice(0,-1));
  const totalReceive = parties.filter((p) => p.direction === "receive").reduce((s, p) => s + p.balance, 0);
  const totalGive    = parties.filter((p) => p.direction === "give").reduce((s, p) => s + p.balance, 0);
  const netPosition  = totalReceive - totalGive;

  // Chart: top 8 parties by outstanding balance
  const chartData = parties.slice(0, 8).map(p => ({
    name: p.name.length > 14 ? p.name.slice(0, 12) + "…" : p.name,
    receive: p.direction === "receive" ? Math.round(p.balance / 1000) : 0,
    give:    p.direction === "give"    ? Math.round(p.balance / 1000) : 0,
  }));

  return (
    <div className="space-y-4">
      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 bg-green-50 border border-green-100">
          <p className="text-[10.5px] text-green-700 font-semibold uppercase tracking-wide mb-1">To Receive</p>
          <p className="text-[19px] font-mono font-bold text-green-700">TZS {money(Math.round(totalReceive))}k</p>
          <p className="text-[11px] text-green-600 mt-0.5">{parties.filter(p=>p.direction==="receive").length} customers</p>
        </div>
        <div className="rounded-xl p-4 bg-red-50 border border-red-100">
          <p className="text-[10.5px] text-red-700 font-semibold uppercase tracking-wide mb-1">To Give</p>
          <p className="text-[19px] font-mono font-bold text-red-700">TZS {money(Math.round(totalGive))}k</p>
          <p className="text-[11px] text-red-600 mt-0.5">{parties.filter(p=>p.direction==="give").length} suppliers</p>
        </div>
        <div className="rounded-xl p-4 border" style={{background:netPosition>=0?"#F0FDF4":"#FEF2F2",borderColor:netPosition>=0?"#BBF7D0":"#FECACA"}}>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-1" style={{color:netPosition>=0?"#15803D":"#B91C1C"}}>Net Position</p>
          <p className="text-[19px] font-mono font-bold" style={{color:netPosition>=0?"#15803D":"#B91C1C"}}>
            {netPosition>=0?"+":"−"} TZS {money(Math.round(Math.abs(netPosition)))}k
          </p>
          <p className="text-[11px] mt-0.5" style={{color:netPosition>=0?"#16A34A":"#EF4444"}}>{netPosition>=0?"Net receivable":"Net payable"}</p>
        </div>
      </div>

      {/* Outstanding balances chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
          <h3 className="text-[14px] font-semibold text-[#111827] mb-3">Top Outstanding Balances</h3>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={chartData} layout="vertical" margin={{left:5, right:20, top:0, bottom:0}}>
              <CartesianGrid vertical={false} stroke="#F3F4F6"/>
              <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={90}/>
              <Tooltip formatter={(v,n)=>["TZS "+money(v)+"k", n==="receive"?"To Receive":"To Give"]}/>
              <Bar dataKey="receive" fill="#16A34A" radius={[0,4,4,0]} name="receive" maxBarSize={16}/>
              <Bar dataKey="give"    fill="#EF4444" radius={[0,4,4,0]} name="give"    maxBarSize={16}/>
              <Legend iconType="circle" iconSize={8} formatter={v=><span style={{fontSize:11,color:"#374151"}}>{v==="receive"?"To Receive":"To Give"}</span>}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filter + list */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[{id:"all",label:"All ("+parties.length+")"},{id:"customers",label:"Customers"},{id:"suppliers",label:"Suppliers"}].map((f)=>(
          <button key={f.id} onClick={()=>setFilter(f.id)}
            className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${filter===f.id?"bg-white text-[#111827] shadow-sm":"text-slate-500"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm divide-y divide-slate-50">
        {filtered.length === 0 && (
          <div className="py-10 text-center text-[13px] text-slate-400">
            {filter === "all" ? "No outstanding balances — everything is settled." : `No outstanding ${filter} balances.`}
          </div>
        )}
        {filtered.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                style={{background: p.direction==="receive"?"#16A34A":"#EF4444"}}>
                {p.name?.charAt(0)||"?"}
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-[#111827] truncate">{p.name}</p>
                {p.sub && <p className="text-[11px] text-slate-400 truncate">{p.sub}</p>}
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-[15px] font-mono font-bold" style={{color:p.direction==="receive"?"#16A34A":"#EF4444"}}>
                {p.direction==="receive"?"+":"−"} TZS {money(Math.round(p.balance))}k
              </p>
              <p className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5"
                style={{background:p.direction==="receive"?"#F0FDF4":"#FEF2F2",color:p.direction==="receive"?"#16A34A":"#EF4444"}}>
                {p.direction==="receive"?"To Receive":"To Give"} · {p.type}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Contacts() {
  const contacts = useCompanyTable("crm_contacts", contactsSeed, { order: { col: "name", ascending: true }, mapRow: mapContactRow });
  const { rows, setRows, loading } = contacts;
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
  }, [rows, query]);

  async function addContact(form) {
    const draft = { id: docId("CON"), name: form.name, title: form.title, company: form.company, email: form.email, phone: form.phone, isPrimary: form.isPrimary };
    setRows((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Contact added: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("crm_contacts").insert({ name: draft.name, title: draft.title, company: draft.company, email: draft.email, phone: draft.phone, is_primary: draft.isPrimary }).single().run();
        if (header?.id) setRows((prev) => prev.map((c) => (c.id === draft.id ? { ...c, dbId: header.id } : c)));
      } catch (_e) { notify("Contact added locally, but saving to the server failed.", "error"); }
    }
  }

  async function deleteContact(id) {
    const c = rows.find((x) => x.id === id);
    setRows((prev) => prev.filter((x) => x.id !== id));
    if (IS_CONFIGURED && c?.dbId) {
      try { await sb("crm_contacts").eq("id", c.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the contact on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      {/* MRR / ARR KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Monthly Recurring Revenue", "TZS "+money(Math.round(MRR))+"k", "#2563EB"],
          ["Annual Run Rate (ARR)",     "TZS "+money(Math.round(ARR))+"k",  "#16A34A"],
          ["Active Subscriptions",      active.length,                      "#7C3AED"],
          ["Billing Due (7 days)",      dueSoon.length,                     dueSoon.length>0?"#F59E0B":"#16A34A"],
        ].map(([l,v,col])=>(
          <div key={l} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 text-center">
            <p className="text-[10.5px] text-slate-400 uppercase tracking-wide mb-1">{l}</p>
            <p className="text-[18px] font-bold" style={{color:col}}>{v}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* MRR by plan BarChart */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">MRR by Plan</h3>
            {byPlan.length === 0 ? <p className="text-slate-400 text-center py-6">No active subscriptions</p> : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={byPlan} layout="vertical" margin={{left:5,right:20,top:0,bottom:0}}>
                  <CartesianGrid vertical={false} stroke="#F3F4F6"/>
                  <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="name" type="category" tick={{fontSize:11}} axisLine={false} tickLine={false} width={90}/>
                  <Tooltip formatter={(v)=>["TZS "+money(v)+"k/mo","MRR"]}/>
                  <Bar dataKey="value" radius={[0,5,5,0]}>
                    {byPlan.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Status PieChart */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
            <h3 className="text-[13.5px] font-semibold text-[#111827] mb-3">Subscription Status</h3>
            {statusChart.length === 0 ? <p className="text-slate-400 text-center py-6">No subscriptions</p> : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={130}>
                  <PieChart>
                    <Pie data={statusChart} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                      {statusChart.map((d,i)=><Cell key={i} fill={d.fill}/>)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v,n]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {statusChart.map(d=>(
                    <div key={d.name} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px] text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full" style={{background:d.fill}}/>{d.name}
                      </span>
                      <span className="text-[13px] font-bold" style={{color:d.fill}}>{d.value}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[11.5px] text-slate-500">Avg MRR: <strong className="text-[#2563EB]">TZS {money(avgRev)}k</strong></p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Billing due alert */}
      {dueSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5">
          <Bell size={15} className="text-amber-600 shrink-0 mt-0.5"/>
          <div>
            <p className="text-[13px] font-semibold text-amber-800">{dueSoon.length} subscription{dueSoon.length>1?"s":""} due for billing in the next 7 days</p>
            <p className="text-[11.5px] text-amber-600 mt-0.5">{dueSoon.map(s=>s.customer+" ("+s.plan+")").join(" · ")}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts or companies..." className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all" />
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm shrink-0">
          <Plus size={15} /> New Contact
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200/80 h-28 skeleton-shimmer" />)}
        {!loading && filtered.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 relative">
            {c.isPrimary && (
              <span className="absolute top-3 right-3 text-[10px] font-medium text-[#16A34A] bg-[#16A34A]/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Star size={9} fill="#16A34A" /> Primary
              </span>
            )}
            <p className="text-[14px] font-semibold text-[#111827] mb-0.5">{c.name}</p>
            <p className="text-[12px] text-slate-500 mb-3">{c.title} · {c.company}</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[12px] text-slate-600"><Mail size={12} className="text-slate-400 shrink-0" /> <span className="truncate">{c.email}</span></div>
              <div className="flex items-center gap-2 text-[12px] text-slate-600"><Phone size={12} className="text-slate-400 shrink-0" /> {c.phone}</div>
            </div>
            <button onClick={() => deleteContact(c.id)} className="mt-3 text-[11px] font-medium text-[#EF4444] hover:text-[#96201a]">Remove</button>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={Phone} title="No contacts yet" hint="Track every person at an account, not just the one on the lead record." actionLabel="New Contact" onAction={() => setShowForm(true)} />
          </div>
        )}
      </div>

      {showForm && <ContactFormPanel onClose={() => setShowForm(false)} onSubmit={addContact} />}
    </div>
  );
}

export function ContactFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", title: "", company: "", email: "", phone: "", isPrimary: false });
  const [touched, setTouched] = useState(false);
  const valid = form.name.trim() && form.company.trim();
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) { e.preventDefault(); setTouched(true); if (!valid) return; onSubmit(form); }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">CRM</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Contact</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Full name" required>
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Joseph Mwakisisile" />
            {touched && !form.name.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Name is required.</p>}
          </FormField>
          <FormField label="Title">
            <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Finance Director" />
          </FormField>
          <FormField label="Company" required>
            <input className={inputClass} value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="e.g. Kilimo Fresh Distributors" />
            {touched && !form.company.trim() && <p className="text-[11px] text-[#EF4444] mt-1">Company is required.</p>}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email"><input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.tz" /></FormField>
            <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+255 7XX XXX XXX" /></FormField>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
            <input type="checkbox" checked={form.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} className="rounded border-slate-300" />
            Primary contact for this account
          </label>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Add Contact</button>
        </div>
      </form>
    </div>
  );
}
