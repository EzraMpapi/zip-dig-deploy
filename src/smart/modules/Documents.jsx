import { useMemo, useRef, useState } from "react";
import {
  Brain, Eye, FileText, Folder, FolderOpen, Grid3x3, History, List, LoaderCircle, PenTool,
  ScanText, Search, Tag, UploadCloud, Users, X
} from "lucide-react";
import { ConfirmDeleteButton, EmptyState, FormField, inputClass } from "../components/ui.jsx";
import { DOC_FOLDERS, FILE_TYPE_STYLE, runOCR } from "../data/documents.jsx";
import { signaturesSeed } from "../data/integrations.jsx";
import { TODAY, docId } from "../lib/format.jsx";
import { mapSignatureRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ DOCUMENTS ══════════════ */
/* --------------------------------- DOCUMENTS ----------------------------------- */
export function Documents({ filesHook, company }) {
  const [folder, setFolder] = useState("all");
  const [view, setView] = useState("grid");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const { rows: files, setRows: setFiles, loading, error } = filesHook;

  const folderCounts = useMemo(() => {
    const map = {};
    DOC_FOLDERS.forEach((f) => (map[f] = 0));
    files.forEach((f) => { map[f.folder] = (map[f.folder] || 0) + 1; });
    return map;
  }, [files]);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      const matchesFolder = folder === "all" || f.folder === folder;
      const q = query.trim().toLowerCase();
      const matchesQ = !q || f.name.toLowerCase().includes(q) || (f.content || "").toLowerCase().includes(q);
      return matchesFolder && matchesQ;
    });
  }, [files, folder, query]);

  const totalSizeLabel = useMemo(() => {
    const totalMB = files.reduce((s, f) => {
      const n = parseFloat(f.size);
      return s + (f.size.includes("KB") ? n / 1024 : n);
    }, 0);
    return `${totalMB.toFixed(1)} MB`;
  }, [files]);

  async function addFile(form) {
    const draft = {
      id: docId("DOC"),
      name: form.name,
      type: form.type,
      folder: form.folder,
      size: `${(0.1 + Math.random() * 2).toFixed(1)} MB`,
      uploadedBy: "You",
      date: TODAY.toISOString().slice(0, 10),
      linkedRecord: form.linkedRecord || null,
      content: form.content || "",
      versions: [],
    };
    setFiles((prev) => [draft, ...prev]);
    setShowForm(false);
    notify(`Uploaded: ${draft.name}`);
    if (IS_CONFIGURED) {
      try {
        const header = await sb("documents").insert({
          name: draft.name, file_type: draft.type, folder: draft.folder,
          size_label: draft.size, linked_record: draft.linkedRecord, content: draft.content, versions: draft.versions,
        }).single().run();
        if (header?.id) setFiles((prev) => prev.map((f) => (f.id === draft.id ? { ...f, dbId: header.id } : f)));
      } catch (_e) { notify("File added locally, but saving to the server failed.", "error"); }
    }
  }

  async function addVersion(fileId, versionForm) {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    const newVersion = { version: (file.versions?.length || 0) + 1, date: TODAY.toISOString().slice(0, 10), size: versionForm.size || file.size, note: versionForm.note || "" };
    const updatedVersions = [...(file.versions || []), { version: file.versions?.length ? file.versions[file.versions.length - 1].version : 0, date: file.date, size: file.size, note: "Previous version" }];
    // The version being replaced is archived into the history; the file's
    // own top-level date/size become the new version's — so "current" is
    // always what the document actually is right now, and history is a
    // real, ordered trail of what it used to be, not a guess.
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, date: newVersion.date, size: newVersion.size, versions: updatedVersions } : f)));
    setSelected((s) => (s && s.id === fileId ? { ...s, date: newVersion.date, size: newVersion.size, versions: updatedVersions } : s));
    notify(`New version added to ${file.name}`);
    if (IS_CONFIGURED && file.dbId) {
      try { await sb("documents").eq("id", file.dbId).update({ size_label: newVersion.size, versions: updatedVersions, created_at: newVersion.date }).run(); } catch (_e) { notify("Version saved locally, but the server update failed.", "error"); }
    }
  }

  async function deleteFile(id) {
    const file = files.find((f) => f.id === id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelected(null);
    if (IS_CONFIGURED && file?.dbId) {
      try { await sb("documents").eq("id", file.dbId).delete().run(); } catch (_e) { notify("Couldn't delete the file on the server.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      {IS_CONFIGURED && error && (
        <div className="bg-[#EF4444]/5 border border-[#EF4444]/20 text-[#EF4444] text-[12.5px] rounded-lg px-3.5 py-2.5">
          Couldn't reach Supabase ({error}) — showing last known data.
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#111827] tracking-tight">Documents</h1>
          <p className="text-[13px] text-slate-500 mt-1">{files.length} files · {totalSizeLabel} stored</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary text-white text-[13px] font-medium px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-sm shrink-0"
        >
          <UploadCloud size={15} /> Upload File
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
        {/* Folder sidebar */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-2.5 h-fit lg:sticky lg:top-0">
          <button
            onClick={() => setFolder("all")}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] mb-0.5 transition-colors ${
              folder === "all" ? "bg-[#16A34A]/8 text-[#111827] font-medium" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2"><FolderOpen size={15} className="text-slate-400" /> All Files</span>
            <span className="text-[11px] text-slate-400 font-mono">{files.length}</span>
          </button>
          {DOC_FOLDERS.map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] mb-0.5 transition-colors ${
                folder === f ? "bg-[#16A34A]/8 text-[#111827] font-medium" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="flex items-center gap-2 truncate"><Folder size={15} className="text-slate-400 shrink-0" /> <span className="truncate">{f}</span></span>
              <span className="text-[11px] text-slate-400 font-mono shrink-0">{folderCounts[f] || 0}</span>
            </button>
          ))}
        </div>

        {/* File area */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 sm:max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[13px] outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A]/30 transition-all"
              />
            </div>
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 shrink-0">
              <button onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} className={`p-1.5 rounded-md ${view === "grid" ? "bg-white shadow-sm text-[#111827]" : "text-slate-400"}`}>
                <Grid3x3 size={15} />
              </button>
              <button onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} className={`p-1.5 rounded-md ${view === "list" ? "bg-white shadow-sm text-[#111827]" : "text-slate-400"}`}>
                <List size={15} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className={view === "grid" ? "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3" : "space-y-2"}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200/80 p-4 h-24 skeleton-shimmer" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
              <EmptyState
                icon={FileText}
                title={files.length === 0 ? "No documents yet" : "No files match your search"}
                hint={files.length === 0 ? "Upload contracts, statements, and compliance records to keep them alongside the records they relate to." : "Try a different search term or folder."}
                actionLabel={files.length === 0 ? "Upload File" : undefined}
                onAction={files.length === 0 ? () => setShowForm(true) : undefined}
              />
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map((f) => {
                const meta = FILE_TYPE_STYLE[f.type] || FILE_TYPE_STYLE.pdf;
                const Icon = meta.Icon;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelected(f)}
                    className="text-left bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 hover:border-[#16A34A]/50 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}14` }}>
                        <Icon size={17} style={{ color: meta.color }} />
                      </div>
                      <span className="text-[9.5px] font-bold tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: `${meta.color}14`, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[12.5px] font-medium text-[#111827] leading-snug line-clamp-2 min-h-[32px]">{f.name}</p>
                    <p className="text-[11px] text-slate-400 mt-2">{f.size} · {f.date}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Folder</th>
                      <th className="px-4 py-3 font-medium">Uploaded</th>
                      <th className="px-4 py-3 font-medium text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((f) => {
                      const meta = FILE_TYPE_STYLE[f.type] || FILE_TYPE_STYLE.pdf;
                      const Icon = meta.Icon;
                      return (
                        <tr key={f.id} onClick={() => setSelected(f)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 cursor-pointer transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Icon size={15} style={{ color: meta.color }} className="shrink-0" />
                              <span className="text-[#111827] font-medium truncate">{f.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{f.folder}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono">{f.date} · {f.uploadedBy}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-500">{f.size}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && <FilePanel file={selected} company={company} onClose={() => setSelected(null)} onDelete={deleteFile} onAddVersion={addVersion} />}
      {showForm && <FileFormPanel onClose={() => setShowForm(false)} onSubmit={addFile} />}
    </div>
  );
}

export function FilePanel({ file, company, onClose, onDelete, onAddVersion }) {
  const meta = FILE_TYPE_STYLE[file.type] || FILE_TYPE_STYLE.pdf;
  const Icon = meta.Icon;
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  // Real signatures for this specific document — reuses the exact same
  // table and pad already built for Integrations' E-Signature tool
  // (section 25), not a second, parallel signature system. A document's
  // signatures are just that same table filtered to this document's id.
  const signatures = useCompanyTable("signatures", signaturesSeed, { order: { col: "signed_at", ascending: false }, mapRow: mapSignatureRow });
  const fileSignatures = signatures.rows.filter((s) => s.documentRef === file.id);

  async function generateSummary() {
    if (!file.content?.trim()) return;
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: `You summarize business documents for ${company.name}. Write 2-4 short sentences covering what this document is and the key facts in it (parties, dates, amounts, terms) — whatever's actually present in the text. Plain text, no markdown.`,
          messages: [{ role: "user", content: file.content }],
        }),
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      setSummary((data.content?.find((c) => c.type === "text")?.text || "").trim());
    } catch (e) {
      setSummaryError("Couldn't reach the AI service. Try again in a moment.");
    } finally {
      setSummaryBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[440px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}14` }}>
              <Icon size={20} style={{ color: meta.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold text-[#111827] leading-snug break-words">{file.name}</p>
              <p className="text-[11.5px] text-slate-400">{file.folder}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">File size</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">{file.size}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-400 mb-1">{file.versions?.length > 0 ? "Current version" : "Uploaded"}</p>
            <p className="text-[15px] font-mono font-semibold text-[#111827]">{file.date}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-3">
          <Users size={14} className="text-slate-400" /> Uploaded by {file.uploadedBy}
        </div>
        {file.linkedRecord && (
          <div className="flex items-center gap-2.5 text-[13px] text-slate-600 mb-5">
            <Tag size={14} className="text-slate-400" /> Linked to record <span className="font-mono text-[#16A34A] font-medium">{file.linkedRecord}</span>
          </div>
        )}

        {/* Version History — a real, ordered trail of what this document
            used to be, not a single-shot file with no memory of change. */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><History size={12} /> Version History</p>
            <button onClick={() => setShowVersionForm(true)} className="text-[11px] font-medium text-[#16A34A] hover:text-[#15803D]">+ New Version</button>
          </div>
          {(!file.versions || file.versions.length === 0) ? (
            <p className="text-[12px] text-slate-400">No prior versions — this is the only one on record.</p>
          ) : (
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 text-[12px] bg-[#16A34A]/5">
                <span className="font-medium text-[#111827]">Version {file.versions.length + 1} (current)</span>
                <span className="text-slate-400 font-mono">{file.date}</span>
              </div>
              {[...file.versions].reverse().map((v) => (
                <div key={v.version} className="flex items-center justify-between px-3 py-2 text-[12px] border-t border-slate-50">
                  <span className="text-slate-600">Version {v.version}{v.note ? ` — ${v.note}` : ""}</span>
                  <span className="text-slate-400 font-mono">{v.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Document Summary — real, from real extracted/entered text.
            Honest when there's nothing to summarize yet, rather than
            calling the API on an empty string and returning something
            that looks like a summary but isn't grounded in anything. */}
        <div className="mb-5">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Brain size={12} /> AI Summary</p>
          {!file.content?.trim() ? (
            <p className="text-[12px] text-slate-400">No text content on this document yet — scan it with OCR or add text on upload to enable summarization.</p>
          ) : summary ? (
            <div className="bg-[#16A34A]/5 border border-[#16A34A]/20 rounded-lg p-3">
              <p className="text-[12.5px] text-slate-700 leading-relaxed">{summary}</p>
            </div>
          ) : (
            <button onClick={generateSummary} disabled={summaryBusy} className="btn-secondary text-[12px] font-medium rounded-lg py-2 px-3 flex items-center gap-1.5 disabled:opacity-50">
              {summaryBusy ? <><LoaderCircle size={12} className="animate-spin" /> Summarizing...</> : <><Brain size={12} /> Generate Summary</>}
            </button>
          )}
          {summaryError && <p className="text-[11.5px] text-[#EF4444] mt-1.5">{summaryError}</p>}
        </div>

        {/* Electronic Signatures — the exact same signature pad and table
            as Integrations' E-Signature tool, scoped to this one document. */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><PenTool size={12} /> Signatures</p>
            <button onClick={() => setShowSignaturePad(true)} className="text-[11px] font-medium text-[#16A34A] hover:text-[#15803D]">+ Sign Document</button>
          </div>
          {fileSignatures.length === 0 ? (
            <p className="text-[12px] text-slate-400">Not signed yet.</p>
          ) : (
            <div className="space-y-2">
              {fileSignatures.map((s) => (
                <div key={s.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-2">
                  <img src={s.imageData} alt={`Signature by ${s.signerName}`} className="h-8 bg-white" />
                  <div className="min-w-0"><p className="text-[12px] font-medium text-[#111827] truncate">{s.signerName}</p><p className="text-[10.5px] text-slate-400">{new Date(s.signedAt).toLocaleDateString()}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
          <button className="flex items-center justify-center gap-1.5 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">
            <Eye size={13} /> Preview
          </button>
          <ConfirmDeleteButton label="Delete file" onConfirm={() => onDelete(file.id)} />
        </div>
      </div>

      {showVersionForm && <VersionUploadPanel currentSize={file.size} onClose={() => setShowVersionForm(false)} onSubmit={(v) => { onAddVersion(file.id, v); setShowVersionForm(false); }} />}
      {showSignaturePad && (
        <DocumentSignaturePad
          documentId={file.id}
          onClose={() => setShowSignaturePad(false)}
          onSigned={(entry) => { signatures.setRows((prev) => [entry, ...prev]); setShowSignaturePad(false); }}
        />
      )}
    </div>
  );
}

export function VersionUploadPanel({ currentSize, onClose, onSubmit }) {
  const [note, setNote] = useState("");
  const [size, setSize] = useState(currentSize);
  function handleSubmit(e) { e.preventDefault(); onSubmit({ note, size }); }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[360px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Version History</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">New Version</h2></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex-1 space-y-4">
          <FormField label="What changed?"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated pricing terms" /></FormField>
          <FormField label="New file size"><input className={inputClass} value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 1.3 MB" /></FormField>
          <p className="text-[11.5px] text-slate-400">The previous version moves into history below; this becomes the current one.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="flex-1 text-[12px] font-medium btn-primary text-white rounded-lg py-2.5">Save New Version</button>
        </div>
      </form>
    </div>
  );
}

// A lean, document-scoped version of the exact same canvas signature pad
// built for Integrations (section 25) — same drawing logic, same table,
// just pre-filled with this document's id rather than a typed-in reference.
export function DocumentSignaturePad({ documentId, onClose, onSigned }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [signerName, setSignerName] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }
  function startDraw(e) { e.preventDefault(); drawingRef.current = true; const ctx = canvasRef.current.getContext("2d"); const { x, y } = getPos(e, canvasRef.current); ctx.beginPath(); ctx.moveTo(x, y); }
  function draw(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getPos(e, canvasRef.current);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y); ctx.stroke();
    setHasDrawn(true);
  }
  function endDraw() { drawingRef.current = false; }
  function clearCanvas() { const c = canvasRef.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setHasDrawn(false); }

  async function save() {
    if (!hasDrawn || !signerName.trim()) return;
    const imageData = canvasRef.current.toDataURL("image/png");
    const draft = { id: `SIG-${Date.now()}`, documentRef: documentId, signerName: signerName.trim(), imageData, signedAt: new Date().toISOString() };
    onSigned(draft);
    notify(`Signed by ${draft.signerName}`);
    if (IS_CONFIGURED) {
      try { await sb("signatures").insert({ document_ref: documentId, signer_name: draft.signerName, image_data: imageData }).run(); } catch (_e) { notify("Signed locally, but saving to the server failed.", "error"); }
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[400px] bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="flex items-start justify-between mb-5">
          <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">{documentId}</p><h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Sign Document</h2></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="text-[11.5px] text-slate-400 mb-4">A lightweight signature capture for internal sign-off — not a certified e-signature platform (no identity verification or legal audit trail). See Integrations for the same disclosure.</p>
        <FormField label="Signer name" required><input className={inputClass} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" /></FormField>
        <p className="text-[11px] font-medium text-slate-500 mt-4 mb-2">Sign below</p>
        <canvas
          ref={canvasRef} width={340} height={140}
          className="w-full border border-slate-200 rounded-lg bg-slate-50 touch-none cursor-crosshair"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        <div className="flex gap-2 mt-3">
          <button onClick={clearCanvas} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2 hover:bg-slate-50">Clear</button>
          <button onClick={save} disabled={!hasDrawn || !signerName.trim()} className="flex-1 btn-primary text-white text-[12px] font-medium rounded-lg py-2 disabled:opacity-40 disabled:cursor-not-allowed">Save Signature</button>
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );
}

export function FileFormPanel({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", type: "pdf", folder: DOC_FOLDERS[0], linkedRecord: "", content: "" });
  const [touched, setTouched] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState(null);
  const valid = form.name.trim();

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }
  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(form);
  }

  async function handleScanFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);
    setOcrBusy(true);
    setOcrProgress(0);
    if (!form.name.trim()) set("name", file.name);
    const result = await runOCR(file, setOcrProgress);
    setOcrBusy(false);
    if (result.ok) {
      set("content", result.text);
      notify(result.text ? "Text extracted from the scan." : "OCR ran, but found no readable text in this image.");
    } else {
      setOcrError(result.error);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-[#111827]/20 backdrop-blur-[2px]" onClick={onClose} />
      <form onSubmit={handleSubmit} className="relative w-full sm:w-[420px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col" style={{ animation: "slideIn .15s ease-out" }}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Documents</p>
            <h2 className="text-[18px] font-semibold text-[#111827] mt-0.5">Upload File</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 flex-1 space-y-4">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center text-center">
            <UploadCloud size={22} className="text-slate-300 mb-2" />
            <p className="text-[12px] text-slate-400 mb-3">This is a demo register — raw files aren&apos;t stored, but scanning one below does run real OCR and keeps the extracted text.</p>
            <label className="text-[12px] font-medium text-[#16A34A] border border-[#16A34A]/30 rounded-lg px-3 py-2 cursor-pointer hover:bg-[#16A34A]/5 transition-colors flex items-center gap-1.5">
              <ScanText size={13} /> Scan a document (OCR)
              <input type="file" accept="image/*" className="hidden" onChange={handleScanFile} disabled={ocrBusy} />
            </label>
            {ocrBusy && <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5"><LoaderCircle size={11} className="animate-spin" /> Reading text... {ocrProgress}%</p>}
            {ocrError && <p className="text-[11px] text-[#EF4444] mt-2">{ocrError}</p>}
          </div>

          <FormField label="File name" required>
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Vendor Agreement — ABC Ltd.pdf" />
            {touched && !form.name.trim() && <p className="text-[11px] text-[#EF4444] mt-1">File name is required.</p>}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Type">
              <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
                {Object.entries(FILE_TYPE_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FormField>
            <FormField label="Folder">
              <select className={inputClass} value={form.folder} onChange={(e) => set("folder", e.target.value)}>
                {DOC_FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Linked record (optional)">
            <input className={inputClass} value={form.linkedRecord} onChange={(e) => set("linkedRecord", e.target.value)} placeholder="e.g. INV-8801, SO-2117, EMP-104" />
          </FormField>

          <FormField label="Text content (for search & AI summary)">
            <textarea className={inputClass} rows={5} value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="Populated automatically by Scan (OCR) above, or type/paste it yourself." />
            <p className="text-[11px] text-slate-400 mt-1">Full-text search and AI summaries both work from this — a document with no text here can only be found by its file name.</p>
          </FormField>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2.5 hover:bg-slate-50 transition-colors">Cancel</button>
          <button type="submit" className="flex-1 btn-primary text-white text-[12px] font-medium rounded-lg py-2.5">Upload</button>
        </div>
      </form>
    </div>
  );
}
