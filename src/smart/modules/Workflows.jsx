import { useRef, useState } from "react";
import {
  AlertCircle, CheckCircle2, GitBranch, Plus, Store, Trash2, X
} from "lucide-react";
import { EmptyState, FormField, inputClass } from "../components/ui.jsx";
import { NOTIFICATION_CHANNELS } from "../data/notifications.jsx";
import {
  OFFICIAL_MARKETPLACE_TEMPLATES,
  WORKFLOW_CONDITIONS,
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TRIGGERS,
  workflowsSeed,
} from "../data/workflows.jsx";
import { useBusinessAlerts } from "../lib/alerts.jsx";
import { logAudit } from "../lib/buses.jsx";
import { computeValuationByCategory, exportCSV } from "../lib/export.jsx";
import { TODAY, docId } from "../lib/format.jsx";
import {
  mapIntegrationConnectionRow,
  mapMarketplaceTemplateRow,
  mapWorkflowRow,
  useCompanyTable,
} from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";
import { sendWebhookNotification } from "../modules/Notifications.jsx";
import { computePnLFigures, computeSalesByCustomer } from "../modules/Reports.jsx";

/* ══════════════ WORKFLOW AUTOMATION STUDIO ══════════════ */
/* ---------------------------------- WORKFLOW AUTOMATION STUDIO ---------------------------------- */

// The execution engine — every step here calls a function already proven
// to work elsewhere in this app (sendWebhookNotification powers the
// Notification System, logAudit powers the Audit Service, the mailto:
// pattern powers Document Generator's email drafting). Nothing here is a
// new capability invented for this module; Workflow Studio is a visual
// way to sequence capabilities that already exist, which is also why
// "Run Now" can be completely honest about succeeding or failing per step
// — it's not simulating anything.
export async function executeWorkflowStep(step, context) {
  const stepType = WORKFLOW_STEP_TYPES.find((t) => t.id === step.type);
  if (!stepType) return { ok: false, note: "Unknown step type." };

  if (step.type === "notify_slack" || step.type === "notify_teams") {
    const channelId = step.type === "notify_slack" ? "slack" : "teams";
    const channel = context.channels.find((c) => c.id === channelId);
    if (!channel?.enabled || !channel?.webhookUrl) return { ok: false, note: `${stepType.label.replace("Notify via ", "")} isn't configured — set it up in Notifications > Channels first.` };
    const result = await sendWebhookNotification(channel.webhookUrl, `[Workflow: ${context.workflowName}] ${step.config.message || ""}`);
    return { ok: result.ok, note: result.note };
  }

  if (step.type === "log_audit") {
    logAudit(step.config.note || "Workflow step", "Workflow Studio", `Workflow: ${context.workflowName}`, "");
    return { ok: true, note: "Logged to the Audit Trail." };
  }

  if (step.type === "draft_email") {
    if (!step.config.recipient?.trim()) return { ok: false, note: "No recipient email configured for this step." };
    const subject = `A note from ${context.company.name}`;
    const body = step.config.context || "";
    window.open(`mailto:${encodeURIComponent(step.config.recipient.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    return { ok: true, note: "Opened in your mail client — review and send it yourself." };
  }

  if (step.type === "generate_report") {
    // Reuses the exact same pure compute functions Reports itself calls
    // (section 24) rather than a second implementation of the same math.
    let rows2, headers, title;
    if (step.config.reportType === "Sales & Revenue") {
      const { byCustomer, totals } = computeSalesByCustomer(context.invoices);
      title = "Sales & Revenue Report"; headers = ["Customer", "Invoices", "Billed (TZS 000)", "Collected (TZS 000)", "Outstanding (TZS 000)"];
      rows2 = [...byCustomer.map((r) => [r.customer, r.count, r.billed, r.collected, r.outstanding]), ["TOTAL", totals.count, totals.billed, totals.collected, totals.outstanding]];
    } else if (step.config.reportType === "Inventory Valuation") {
      const { byCategory, grandTotal } = computeValuationByCategory(context.inventory);
      title = "Inventory Valuation Report"; headers = ["Category", "SKU", "Item", "Qty", "Unit", "Unit Cost (TZS 000)", "Value (TZS 000)"];
      rows2 = [...byCategory.flatMap((c) => c.items.map((it) => [c.category, it.sku, it.name, it.qty, it.unit, it.unitCost, Math.round(it.value)])), ["GRAND TOTAL", "", "", "", "", "", Math.round(grandTotal)]];
    } else {
      const figures = computePnLFigures(context.invoices, context.expenses.rows);
      title = "Profit & Loss Statement"; headers = ["Line", "Amount (TZS 000)"];
      rows2 = [["Revenue collected", Math.round(figures.collected)], ...figures.expRows.map(([cat, amt]) => [`Expense: ${cat}`, Math.round(amt)]), ["Net position", Math.round(figures.net)]];
    }
    exportCSV(`${title.replace(/\s+/g, "-").toLowerCase()}.csv`, headers, rows2);
    return { ok: true, note: `${title} downloaded as CSV.` };
  }

  return { ok: false, note: "Step type not recognized." };
}

export function WorkflowStudio({ company, invoices, expenses, inventory }) {
  const workflows = useCompanyTable("workflows", workflowsSeed, { mapRow: mapWorkflowRow });
  const marketplace = useCompanyTable("workflow_marketplace_templates", OFFICIAL_MARKETPLACE_TEMPLATES, { mapRow: mapMarketplaceTemplateRow });
  // Read-only access to real webhook config — the same table Notifications
  // owns, read a second time here rather than lifted, since this module
  // only ever reads it to dispatch, never writes to it.
  const channels = useCompanyTable("notification_channels", NOTIFICATION_CHANNELS.map((c) => ({ id: c.id, enabled: false, webhookUrl: "", fromAddress: "", fromNumber: "", businessNumber: "", serverKey: "" })), { mapRow: mapIntegrationConnectionRow });
  const alerts = useBusinessAlerts({ inventory, invoices, expenses, leaveRequests: { rows: [] }, workOrders: { rows: [] }, subscriptions: { rows: [] } });

  const [view, setView] = useState("my-workflows"); // "my-workflows" | "marketplace"
  const [builderOpen, setBuilderOpen] = useState(null); // null | "new" | workflow object being edited
  const [runningId, setRunningId] = useState(null);
  const [runTrace, setRunTrace] = useState(null);
  const [publishingWorkflow, setPublishingWorkflow] = useState(null);

  async function saveWorkflow(workflow) {
    const isNew = !workflow.dbId && !workflows.rows.some((w) => w.id === workflow.id);
    if (isNew) {
      workflows.setRows((prev) => [workflow, ...prev]);
      notify(`Workflow saved: ${workflow.name}`);
    } else {
      workflows.setRows((prev) => prev.map((w) => (w.id === workflow.id ? workflow : w)));
      notify(`Workflow updated: ${workflow.name}`);
    }
    setBuilderOpen(null);
    if (IS_CONFIGURED) {
      try {
        if (isNew) {
          const header = await sb("workflows").insert({ name: workflow.name, trigger_type: workflow.trigger, enabled: workflow.enabled, steps: workflow.steps, condition: workflow.condition || null }).single().run();
          if (header?.id) workflows.setRows((prev) => prev.map((w) => (w.id === workflow.id ? { ...w, dbId: header.id } : w)));
        } else {
          await sb("workflows").eq("id", workflow.dbId).update({ name: workflow.name, trigger_type: workflow.trigger, enabled: workflow.enabled, steps: workflow.steps, condition: workflow.condition || null }).run();
        }
      } catch (_e) { notify("Saved locally, but the server update failed.", "error"); }
    }
  }

  async function deleteWorkflow(id) {
    const w = workflows.rows.find((x) => x.id === id);
    workflows.setRows((prev) => prev.filter((x) => x.id !== id));
    if (IS_CONFIGURED && w?.dbId) {
      try { await sb("workflows").eq("id", w.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the workflow on the server.", "error"); }
    }
  }

  // Install — copies a template's real steps into this company's own
  // private workflows table. Nothing about installation is different from
  // building the same workflow by hand in the builder; a template is just
  // a starting point someone else already assembled.
  async function installTemplate(template) {
    const draft = {
      id: docId("WF"), name: template.name, trigger: template.trigger, enabled: true, lastRun: null,
      steps: template.steps.map((s, i) => ({ ...s, id: `s${i}-${Date.now()}` })),
    };
    workflows.setRows((prev) => [draft, ...prev]);
    notify(`Installed: ${template.name} — find it under My Workflows.`);
    setView("my-workflows");
    if (IS_CONFIGURED) {
      try {
        const header = await sb("workflows").insert({ name: draft.name, trigger_type: draft.trigger, enabled: true, steps: draft.steps }).single().run();
        if (header?.id) workflows.setRows((prev) => prev.map((w) => (w.id === draft.id ? { ...w, dbId: header.id } : w)));
        if (template.dbId) await sb("workflow_marketplace_templates").eq("id", template.dbId).update({ install_count: template.installCount + 1 }).run();
      } catch (_e) { notify("Installed locally, but saving to the server failed.", "error"); }
    }
  }

  // Publish — a company's own workflow becomes a public template. Email
  // recipient fields are deliberately stripped before publishing (set to
  // empty), since those are this company's own contact data, not
  // something that belongs in a template another company installs.
  async function publishTemplate({ workflow, category, description }) {
    const sanitizedSteps = workflow.steps.map((s) => (s.type === "draft_email" ? { ...s, config: { ...s.config, recipient: "" } } : s));
    const draft = {
      id: `TPL-${Date.now()}`, name: workflow.name, description, category, trigger: workflow.trigger,
      steps: sanitizedSteps, publisherName: company.name, isOfficial: false, installCount: 0,
    };
    marketplace.setRows((prev) => [draft, ...prev]);
    setPublishingWorkflow(null);
    notify(`Published "${workflow.name}" to the marketplace as ${company.name}.`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("workflow_marketplace_templates").insert({
          name: draft.name, description: draft.description, category: draft.category, trigger_type: draft.trigger,
          steps: draft.steps, published_by_company_id: company.id, published_by_company_name: company.name,
        }).single().run();
        if (header?.id) marketplace.setRows((prev) => prev.map((t) => (t.id === draft.id ? { ...t, dbId: header.id } : t)));
      } catch (_e) { notify("Published locally, but saving to the server failed.", "error"); }
    }
  }

  async function runWorkflow(workflow) {
    setRunningId(workflow.id);
    setRunTrace({ workflowId: workflow.id, results: [] });
    const context = { workflowName: workflow.name, company, invoices, expenses, inventory, channels: channels.rows };
    // The Condition gate — evaluated against live rows right now, never a
    // stored snapshot. A skipped run says exactly why in real figures.
    if (workflow.condition && workflow.condition.type && workflow.condition.type !== "none") {
      const condDef = WORKFLOW_CONDITIONS.find((c) => c.id === workflow.condition.type);
      const verdict = condDef ? condDef.evaluate({ invoices, expenses, inventory }, workflow.condition.value) : { met: true, detail: "Unknown condition — ran anyway" };
      if (!verdict.met) {
        setRunTrace((prev) => ({ ...prev, results: [{ stepId: "condition", ok: false, detail: `Condition not met — skipped. ${verdict.detail}` }] }));
        logAudit("Workflow skipped — condition not met", "Workflow Studio", verdict.detail, workflow.name);
        notify(`${workflow.name} skipped — ${verdict.detail}`);
        setRunningId(null);
        return;
      }
      setRunTrace((prev) => ({ ...prev, results: [{ stepId: "condition", ok: true, detail: `Condition met — ${verdict.detail}` }] }));
    }
    for (const step of workflow.steps) {
      const result = await executeWorkflowStep(step, context);
      setRunTrace((prev) => ({ ...prev, results: [...prev.results, { stepId: step.id, ...result }] }));
    }
    const today = TODAY.toISOString().slice(0, 10);
    workflows.setRows((prev) => prev.map((w) => (w.id === workflow.id ? { ...w, lastRun: today } : w)));
    logAudit("Workflow executed", "Workflow Studio", "Manual run", workflow.name);
    notify(`${workflow.name} finished running.`);
    setRunningId(null);
    if (IS_CONFIGURED && workflow.dbId) {
      try { await sb("workflows").eq("id", workflow.dbId).update({ last_run: today }).run(); } catch (_e) { /* the run itself already completed; a log-sync miss isn't worth a second toast */ }
    }
  }

  const readyToRun = workflows.rows.filter((w) => w.enabled && w.trigger !== "manual" && alerts.some((a) => a.id === w.trigger));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Workflow Automation Studio</h1>
          <p className="text-[13px] text-slate-500 mt-1">Drag steps into a sequence, then run it — every step is a real action, nothing simulated</p>
        </div>
        {view === "my-workflows" && (
          <button onClick={() => setBuilderOpen("new")} className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm shrink-0">
            <Plus size={15} /> New Workflow
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button onClick={() => setView("my-workflows")} className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${view === "my-workflows" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          <GitBranch size={13} /> My Workflows
        </button>
        <button onClick={() => setView("marketplace")} className={`text-[12px] font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${view === "marketplace" ? "bg-white text-[#111827] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          <Store size={13} /> Automation Marketplace
        </button>
      </div>

      {view === "my-workflows" && (
        <>
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <GitBranch size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          There&apos;s no server here to watch for events while this tab is closed, so a workflow either runs when you click Run Now, or — for workflows set to trigger on a real alert — gets surfaced below as ready to run the moment that alert is genuinely active in your current session. Neither is silent background automation; both need a person to see it happen.
        </p>
      </div>

      {readyToRun.length > 0 && (
        <div className="bg-[#16A34A]/5 border border-[#16A34A]/20 rounded-xl p-4">
          <h3 className="text-[13px] font-semibold text-[#111827] mb-2 flex items-center gap-1.5"><AlertCircle size={14} className="text-[#16A34A]" /> Ready to run</h3>
          <div className="space-y-2">
            {readyToRun.map((w) => (
              <div key={w.id} className="flex items-center justify-between bg-white rounded-lg px-3.5 py-2.5 border border-slate-100">
                <div><p className="text-[12.5px] font-medium text-[#111827]">{w.name}</p><p className="text-[11px] text-slate-400">{WORKFLOW_TRIGGERS.find((t) => t.id === w.trigger)?.label}</p></div>
                <button onClick={() => runWorkflow(w)} disabled={runningId === w.id} className="btn-primary text-white text-[11.5px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40">{runningId === w.id ? "Running..." : "Run Now"}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows.loading && Array.from({ length: 2 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200/80 h-40 skeleton-shimmer" />)}
        {!workflows.loading && workflows.rows.map((w) => (
          <div key={w.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[13.5px] font-semibold text-[#111827]">{w.name}</p>
                <p className="text-[11px] text-slate-400">{WORKFLOW_TRIGGERS.find((t) => t.id === w.trigger)?.label}</p>
              </div>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${w.enabled ? "bg-[#16A34A]/10 text-[#16A34A]" : "bg-slate-100 text-slate-400"}`}>{w.enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <div className="flex items-center gap-1 mb-3 flex-wrap">
              {w.steps.map((s, i) => {
                const stepType = WORKFLOW_STEP_TYPES.find((t) => t.id === s.type);
                const Icon = stepType?.icon || Circle;
                const trace = runTrace?.workflowId === w.id ? runTrace.results[i] : null;
                return (
                  <div key={s.id} className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: trace ? (trace.ok ? "#16A34A" : "#EF4444") : `${stepType?.color}14` }} title={stepType?.label}>
                    <Icon size={11} style={{ color: trace ? "#FFFFFF" : stepType?.color }} />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mb-3">{w.lastRun ? `Last ran ${w.lastRun}` : "Never run"}</p>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setBuilderOpen(w)} className="btn-secondary flex-1 text-[12px] font-medium rounded-lg py-2">Edit</button>
              <button onClick={() => runWorkflow(w)} disabled={runningId === w.id} className="btn-primary text-white flex-1 text-[12px] font-medium rounded-lg py-2 disabled:opacity-40">{runningId === w.id ? "Running..." : "Run Now"}</button>
              <button onClick={() => deleteWorkflow(w.id)} className="text-slate-300 hover:text-[#EF4444] px-2" aria-label={`Delete ${w.name}`}><Trash2 size={14} /></button>
            </div>
            <button onClick={() => setPublishingWorkflow(w)} className="w-full text-[11.5px] font-medium text-slate-500 hover:text-[#16A34A] py-1.5 flex items-center justify-center gap-1.5">
              <Store size={12} /> Publish to Marketplace
            </button>
          </div>
        ))}
        {!workflows.loading && workflows.rows.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={GitBranch} title="No workflows yet" hint="Build one by dragging steps into a sequence, or install one from the Automation Marketplace." actionLabel="New Workflow" onAction={() => setBuilderOpen("new")} />
          </div>
        )}
      </div>
        </>
      )}

      {view === "marketplace" && <AutomationMarketplace templates={marketplace.rows} loading={marketplace.loading} onInstall={installTemplate} />}

      {builderOpen && <WorkflowBuilder workflow={builderOpen === "new" ? null : builderOpen} onClose={() => setBuilderOpen(null)} onSave={saveWorkflow} />}
      {publishingWorkflow && <PublishTemplatePanel workflow={publishingWorkflow} onClose={() => setPublishingWorkflow(null)} onPublish={publishTemplate} />}
    </div>
  );
}

/* ══════════════ WORKFLOW BUILDER (DRAG AND DROP) ══════════════ */
/* ------------------------------ WORKFLOW BUILDER (DRAG AND DROP) ------------------------------ */

// Real HTML5 drag-and-drop — no library, the native browser API. This is
// deliberately the first place in this entire build that uses drag-and-
// drop; every Kanban-style board elsewhere (Projects' task board, Sales
// Coach's pipeline) uses click-based move buttons instead, a considered
// choice documented at the time. Here, a builder is exactly the case
// drag-and-drop is the right interaction for — arranging a sequence is
// what dragging is for.
export function WorkflowBuilder({ workflow, onClose, onSave }) {
  const [name, setName] = useState(workflow?.name || "");
  const [trigger, setTrigger] = useState(workflow?.trigger || "manual");
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);
  const [steps, setSteps] = useState(workflow?.steps || []);
  const [condition, setCondition] = useState(workflow?.condition || null);
  const [configuring, setConfiguring] = useState(null);
  const dragState = useRef(null); // { kind: "new", stepTypeId } | { kind: "reorder", index }

  function addStepAt(stepTypeId, index) {
    const newStep = { id: `s${Date.now()}`, type: stepTypeId, config: {} };
    setSteps((prev) => {
      const next = [...prev];
      next.splice(index, 0, newStep);
      return next;
    });
    setConfiguring(newStep.id);
  }

  function moveStep(fromIndex, toIndex) {
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
      return next;
    });
  }

  function removeStep(id) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    if (configuring === id) setConfiguring(null);
  }

  function updateStepConfig(id, key, value) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s)));
  }

  function handleDropAt(index) {
    const drag = dragState.current;
    if (!drag) return;
    if (drag.kind === "new") addStepAt(drag.stepTypeId, index);
    else if (drag.kind === "reorder") moveStep(drag.index, index);
    dragState.current = null;
  }

  const valid = name.trim() && steps.length > 0;

  function handleSave() {
    if (!valid) return;
    onSave({ id: workflow?.id || `WF-${Math.floor(10 + Math.random() * 89)}`, dbId: workflow?.dbId, name: name.trim(), trigger, enabled, steps, condition, lastRun: workflow?.lastRun || null });
  }

  return (
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
      <div className="px-5 sm:px-8 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close builder"><X size={20} /></button>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled Workflow" className="text-[16px] font-semibold text-[#111827] outline-none border-b border-transparent focus:border-[#16A34A] bg-transparent min-w-0" />
        </div>
        <button onClick={handleSave} disabled={!valid} className="btn-primary text-white text-[13px] font-medium px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed shrink-0">Save Workflow</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        <div className="w-64 border-r border-slate-100 p-4 overflow-y-auto shrink-0 hidden sm:block">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-3">Drag a step onto the canvas</p>
          <div className="space-y-2">
            {WORKFLOW_STEP_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => { dragState.current = { kind: "new", stepTypeId: t.id }; }}
                  className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing hover:border-[#16A34A]/40 hover:shadow-sm transition-all"
                >
                  <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}14` }}><Icon size={13} style={{ color: t.color }} /></div>
                  <span className="text-[12px] font-medium text-slate-700">{t.label}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">Or tap a step below to add it on mobile, where dragging isn&apos;t available the same way.</p>
          <div className="sm:hidden space-y-1.5 mt-2">
            {WORKFLOW_STEP_TYPES.map((t) => (
              <button key={t.id} onClick={() => addStepAt(t.id, steps.length)} className="w-full text-left text-[12px] font-medium text-[#16A34A] py-1.5">+ {t.label}</button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex flex-col items-center">
          <div className="w-full max-w-md space-y-4">
            <FormField label="Trigger">
              <select className={inputClass} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                {WORKFLOW_TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </FormField>
            <div className="flex justify-center text-slate-300 text-[14px] leading-none">↓</div>
            <FormField label="Condition — the gate between When and Actions">
              <select className={inputClass} value={condition?.type || "none"} onChange={(e) => setCondition(e.target.value === "none" ? null : { type: e.target.value, value: condition?.value || "0" })}>
                {WORKFLOW_CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {condition && condition.type !== "none" && (
                <input type="number" min="0" className={`${inputClass} mt-2`} value={condition.value} onChange={(e) => setCondition({ ...condition, value: e.target.value })} placeholder={`Threshold (${WORKFLOW_CONDITIONS.find((c) => c.id === condition.type)?.unit || ""})`} />
              )}
              <p className="text-[10.5px] text-slate-400 mt-1.5">Evaluated against your live records the moment the workflow runs — a skipped run tells you exactly why, in real numbers.</p>
            </FormField>
            <div className="flex justify-center text-slate-300 text-[14px] leading-none">↓</div>
            <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="rounded border-slate-300" /> Enabled
            </label>

            <div className="pt-2">
              {/* Drop zone above the first step */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropAt(0)}
                className="h-3 -mb-1 rounded-full transition-colors"
              />
              {steps.length === 0 && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropAt(0)}
                  className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center"
                >
                  <GitBranch size={22} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-[13px] text-slate-400">Drag a step here to start</p>
                </div>
              )}
              {steps.map((step, i) => {
                const stepType = WORKFLOW_STEP_TYPES.find((t) => t.id === step.type);
                const Icon = stepType?.icon || Circle;
                return (
                  <div key={step.id}>
                    <div
                      draggable
                      onDragStart={() => { dragState.current = { kind: "reorder", index: i }; }}
                      onClick={() => setConfiguring(configuring === step.id ? null : step.id)}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 cursor-grab active:cursor-grabbing hover:border-[#16A34A]/40 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${stepType?.color}14` }}><Icon size={14} style={{ color: stepType?.color }} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#111827]">{stepType?.label}</p>
                          <p className="text-[11px] text-slate-400 truncate">{Object.values(step.config).filter(Boolean).join(" · ") || "Tap to configure"}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} className="text-slate-300 hover:text-[#EF4444] shrink-0" aria-label="Remove step"><X size={15} /></button>
                      </div>
                      {configuring === step.id && stepType && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                          {stepType.fields.map((f) => (
                            <div key={f.key}>
                              <label className="text-[11px] font-medium text-slate-500 block mb-1">{f.label}</label>
                              {f.options ? (
                                <select className={inputClass} value={step.config[f.key] || f.options[0]} onChange={(e) => updateStepConfig(step.id, f.key, e.target.value)}>
                                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <input className={inputClass} value={step.config[f.key] || ""} onChange={(e) => updateStepConfig(step.id, f.key, e.target.value)} placeholder={f.placeholder} />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center py-1.5">
                      <div className="w-px h-4 bg-slate-200" />
                    </div>
                    {/* Drop zone after this step */}
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropAt(i + 1)}
                      className="h-3 -mt-3 rounded-full transition-colors"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ AUTOMATION MARKETPLACE ══════════════ */
/* ------------------------------ AUTOMATION MARKETPLACE ------------------------------ */
export const MARKETPLACE_CATEGORIES = ["All", "Finance", "HR", "Sales", "Inventory"];

export function AutomationMarketplace({ templates, loading, onInstall }) {
  const [category, setCategory] = useState("All");
  const [previewing, setPreviewing] = useState(null);
  const filtered = category === "All" ? templates : templates.filter((t) => t.category === category);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <Store size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          Every template here — official or published by another organization using this software — is built entirely from the same five real step types in your own builder. Installing one just copies its steps into My Workflows; nothing about an installed template behaves differently from one you&apos;d built by hand.
        </p>
      </div>

      <div className="flex items-center gap-1 bg-white border border-slate-200/80 rounded-lg p-1 w-fit overflow-x-auto max-w-full">
        {MARKETPLACE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`text-[12px] font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${category === c ? "bg-[#16A34A] text-white" : "text-slate-500 hover:text-slate-700"}`}>{c}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200/80 h-44 skeleton-shimmer" />)}
        {!loading && filtered.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5 flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10.5px] font-medium text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full">{t.category}</span>
              {t.isOfficial && <span className="text-[10px] text-slate-400 flex items-center gap-1"><CheckCircle2 size={10} /> Official</span>}
            </div>
            <p className="text-[13.5px] font-semibold text-[#111827] mb-1">{t.name}</p>
            <p className="text-[12px] text-slate-500 leading-relaxed mb-3 flex-1">{t.description}</p>
            <div className="flex items-center gap-1 mb-3 flex-wrap">
              {t.steps.map((s, i) => {
                const stepType = WORKFLOW_STEP_TYPES.find((wt) => wt.id === s.type);
                const Icon = stepType?.icon || Circle;
                return <div key={i} className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${stepType?.color}14` }} title={stepType?.label}><Icon size={11} style={{ color: stepType?.color }} /></div>;
              })}
            </div>
            <p className="text-[10.5px] text-slate-400 mb-3">By {t.publisherName} · {t.installCount} install{t.installCount === 1 ? "" : "s"}</p>
            <button onClick={() => onInstall(t)} className="btn-primary text-white text-[12.5px] font-medium rounded-lg py-2.5 w-full">Install</button>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState icon={Store} title="No templates in this category yet" hint="Publish one of your own workflows to get this category started." />
          </div>
        )}
      </div>
    </div>
  );
}

export function PublishTemplatePanel({ workflow, onClose, onPublish }) {
  const [category, setCategory] = useState("Finance");
  const [description, setDescription] = useState("");
  const hasEmailStep = workflow.steps.some((s) => s.type === "draft_email");

  function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) return;
    onPublish({ workflow, category, description: description.trim() });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Automation Marketplace</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Publish "{workflow.name}"</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {MARKETPLACE_CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Description for other organizations" required>
            <textarea className={inputClass} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this automation do, and when should someone install it?" />
          </FormField>
          {hasEmailStep && (
            <div className="flex items-start gap-2 bg-[#F59E0B]/10 rounded-lg p-3">
              <AlertCircle size={13} className="text-[#F59E0B] shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-[#8a670a] leading-relaxed">This workflow includes an email step with a recipient address — that&apos;s cleared automatically before publishing, since it&apos;s your own contact data, not something that belongs in a shared template.</p>
            </div>
          )}
          <p className="text-[11px] text-slate-400">Published under your company&apos;s name — visible to any organization using this software.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!description.trim()} className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5 disabled:opacity-40">Publish</button>
        </div>
      </form>
    </div>
  );
}
