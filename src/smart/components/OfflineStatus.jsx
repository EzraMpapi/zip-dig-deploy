import { useEffect, useState } from "react";
import {
  Cloud,
  CloudOff,
  Database,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import * as offline from "../lib/offline/index.jsx";

/* ══════════════════════════════════════════════════════════════════════════
   OFFLINE STATUS + LOCAL WORKSPACE UI

   Presentation only. Every decision it displays — whether the app is online,
   how many operations are waiting, when the last sync landed — is owned by
   the sync engine; this component subscribes and renders.
   ══════════════════════════════════════════════════════════════════════════ */

export function useSyncStatus() {
  const [status, setStatus] = useState(() => offline.syncEngine.getStatus());
  useEffect(() => offline.syncEngine.subscribe(setStatus), []);
  return status;
}

const MODE_STYLE = {
  online: {
    label: "Online",
    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    Icon: Cloud,
  },
  offline: {
    label: "Offline",
    cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    Icon: CloudOff,
  },
  syncing: { label: "Syncing", cls: "bg-sky-500/10 text-sky-400 border-sky-500/30", Icon: Loader2 },
};

function relative(iso) {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

export function SyncStatusPill({ onOpen }) {
  const status = useSyncStatus();
  const meta = MODE_STYLE[status.mode] || MODE_STYLE.online;
  const { Icon } = meta;
  const waiting = status.pending + status.failed;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={status.lastError || `Last sync ${relative(status.lastSyncAt)}`}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${meta.cls}`}
    >
      <Icon size={12} className={status.mode === "syncing" ? "animate-spin" : ""} />
      <span>{meta.label}</span>
      {waiting > 0 && (
        <span className="rounded-full bg-white/10 px-1.5 py-[1px] text-[10px] tabular-nums">
          {waiting}
        </span>
      )}
    </button>
  );
}

export function OfflineWorkspacePanel({ onClose }) {
  const status = useSyncStatus();
  const [modules, setModules] = useState([]);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setModules(await offline.summary());
    setQueue(await offline.queue());
  }

  useEffect(() => {
    refresh();
  }, [status.pending, status.failed, status.lastSyncAt]);

  async function doSync() {
    setBusy(true);
    try {
      await offline.syncEngine.syncNow();
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function doExport(moduleId) {
    const backup = await offline.exportWorkspace(moduleId);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-workspace-${moduleId || "all"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await offline.importWorkspace(JSON.parse(String(reader.result)));
        refresh();
      } catch (error) {
        console.warn("[offline] restore failed:", error.message);
      }
    };
    reader.readAsText(file);
  }

  const total = modules.reduce((sum, m) => sum + m.count, 0);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-end bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="mt-12 w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#12161d] text-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Database size={14} /> Local workspace
          </div>
          <SyncStatusPill />
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-white/10 px-4 py-3 text-center text-[11px]">
          <Stat label="Records" value={total} />
          <Stat label="Waiting" value={status.pending} />
          <Stat label="Failed" value={status.failed} />
        </div>

        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-[11px] text-slate-400">
          <span>Last sync {relative(status.lastSyncAt)}</span>
          <button
            type="button"
            onClick={doSync}
            disabled={busy}
            className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw size={11} className={busy ? "animate-spin" : ""} /> Sync now
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto px-4 py-2">
          {!offline.offlineAvailable() && (
            <p className="py-4 text-center text-[11px] text-amber-400">
              This browser blocks local storage, so offline mode is unavailable in this session.
            </p>
          )}
          {modules.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 border-b border-white/5 py-2 text-[12px] last:border-0"
            >
              <span className="flex-1 truncate">{m.label}</span>
              <span className="tabular-nums text-slate-400">{m.count}</span>
              {m.pending > 0 && (
                <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-400 tabular-nums">
                  {m.pending}
                </span>
              )}
              <button
                type="button"
                title={`Export ${m.label}`}
                onClick={() => doExport(m.id)}
                className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                <Download size={12} />
              </button>
            </div>
          ))}
          {offline.offlineAvailable() && !modules.length && (
            <p className="py-4 text-center text-[11px] text-slate-500">
              Nothing stored locally yet — open a module while online and its data is mirrored here.
            </p>
          )}
        </div>

        {queue.some((q) => q.status === "failed") && (
          <div className="border-t border-white/10 px-4 py-2 text-[11px] text-rose-400">
            {queue.filter((q) => q.status === "failed").length} operation(s) were rejected by the
            server and need review.
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-[11px]">
          <button
            type="button"
            onClick={() => doExport(null)}
            className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 font-semibold hover:bg-white/5"
          >
            <Download size={11} /> Backup all
          </button>
          <label className="flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 font-semibold hover:bg-white/5">
            <Upload size={11} /> Restore
            <input type="file" accept="application/json" className="hidden" onChange={doImport} />
          </label>
          <button
            type="button"
            onClick={async () => {
              await offline.clearCompletedQueue();
              refresh();
            }}
            className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-slate-400 hover:bg-white/5"
          >
            <Trash2 size={11} /> Clear log
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] py-2">
      <div className="text-base font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
