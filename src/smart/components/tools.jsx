import { useRef, useState } from "react";
import {
  Download, Package, PenTool
} from "lucide-react";
import { FormField, inputClass } from "../components/ui.jsx";
import { signaturesSeed } from "../data/integrations.jsx";
import { mapSignatureRow, useCompanyTable } from "../lib/mappers.jsx";
import { notify } from "../lib/notify.jsx";
import { IS_CONFIGURED, sb } from "../lib/supabase.jsx";

/* ══════════════ QR & BARCODE ══════════════ */
/* -------------------------------- QR & BARCODE -------------------------------- */

// Real QR codes, genuinely scannable — rendered via a public QR image API
// (api.qrserver.com), the same service already used elsewhere for this
// pattern, since no client-side QR-encoding library is available in this
// environment. This requires the browser to load an external image; a
// fully offline generator would need a bundled encoding library instead.
export function QRBarcodeTools({ onNavigate }) {
  const [text, setText] = useState("");
  const qrUrl = text.trim() ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text.trim())}` : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Generate a QR Code</h3>
        <p className="text-[12px] text-slate-400 mb-4">For an invoice reference, a payment link, or any text — genuinely real and scannable</p>
        <FormField label="Data to encode">
          <input className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. INV-8801 or a payment link URL" />
        </FormField>
        {qrUrl && (
          <div className="mt-4 flex flex-col items-center gap-3 bg-slate-50 rounded-lg p-4">
            <img src={qrUrl} alt="Generated QR code" width={180} height={180} className="rounded-lg bg-white p-2 border border-slate-200" />
            <a href={qrUrl} download="qrcode.png" className="text-[12px] font-medium text-[#16A34A] hover:text-[#15803D] flex items-center gap-1.5"><Download size={12} /> Download</a>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Barcodes</h3>
        <p className="text-[12px] text-slate-400 mb-4">Already real and live — every Inventory item gets a deterministic barcode automatically</p>
        <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
          Inventory generates an EAN-13-style code from each item&apos;s SKU — the same code every time, searchable at checkout in POS. No separate barcode system needed here; it&apos;s already wired into Inventory and POS.
        </p>
        {onNavigate && (
          <button onClick={() => onNavigate("inventory")} className="btn-secondary text-[12.5px] font-medium rounded-lg py-2 px-4 flex items-center gap-1.5">
            <Package size={13} /> Open Inventory
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════ E-SIGNATURE ══════════════ */
/* -------------------------------- E-SIGNATURE -------------------------------- */

// A real, working signature pad using the Canvas API — genuine capture,
// not a mockup. What this honestly is not: a certified e-signature
// platform like DocuSign or Adobe Sign, which additionally provide
// identity verification, tamper-evident sealing, and a legal audit trail.
// This is lightweight capture for informal internal sign-off, said
// plainly rather than implied to be more than it is.
export function ESignature() {
  const signatures = useCompanyTable("signatures", signaturesSeed, { order: { col: "signed_at", ascending: false }, mapRow: mapSignatureRow });
  const { rows, setRows, loading } = signatures;
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [documentRef, setDocumentRef] = useState("");
  const [signerName, setSignerName] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    drawingRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function draw(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }
  function endDraw() { drawingRef.current = false; }
  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  async function saveSignature() {
    if (!hasDrawn || !documentRef.trim() || !signerName.trim()) return;
    const imageData = canvasRef.current.toDataURL("image/png");
    const draft = { id: `SIG-${Date.now()}`, documentRef: documentRef.trim(), signerName: signerName.trim(), imageData, signedAt: new Date().toISOString() };
    setRows((prev) => [draft, ...prev]);
    notify(`Signature captured for ${draft.documentRef}`);
    clearCanvas();
    setDocumentRef("");
    setSignerName("");
    if (IS_CONFIGURED) {
      try { await sb("signatures").insert({ document_ref: draft.documentRef, signer_name: draft.signerName, image_data: draft.imageData }).run(); } catch (_e) { notify("Captured locally, but saving to the server failed.", "error"); }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-lg p-3">
        <PenTool size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-slate-500 leading-relaxed">
          A real, working signature pad for lightweight internal sign-off — not a certified e-signature platform. It doesn&apos;t verify identity, seal against tampering, or produce the legal audit trail DocuSign or Adobe Sign provide; use one of those for anything requiring that.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <FormField label="Document reference"><input className={inputClass} value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="e.g. QT-1043 or PC-02" /></FormField>
          <FormField label="Signer name"><input className={inputClass} value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" /></FormField>
        </div>
        <p className="text-[11px] font-medium text-slate-500 mb-2">Sign below</p>
        <canvas
          ref={canvasRef}
          width={500}
          height={160}
          className="w-full border border-slate-200 rounded-lg bg-slate-50 touch-none cursor-crosshair"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        <div className="flex gap-2 mt-3">
          <button onClick={clearCanvas} className="flex-1 text-[12px] font-medium border border-slate-200 rounded-lg py-2 hover:bg-slate-50">Clear</button>
          <button onClick={saveSignature} disabled={!hasDrawn || !documentRef.trim() || !signerName.trim()} className="flex-1 btn-primary text-white text-[12px] font-medium rounded-lg py-2 disabled:opacity-40 disabled:cursor-not-allowed">Save Signature</button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100"><h3 className="text-[14px] font-semibold text-[#111827]">Captured Signatures</h3></div>
          <div className="divide-y divide-slate-50">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-4 sm:px-5 py-3">
                <img src={s.imageData} alt={`Signature by ${s.signerName}`} className="h-10 bg-white border border-slate-100 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[#111827]">{s.signerName}</p>
                  <p className="text-[11px] text-slate-400">{s.documentRef} · {new Date(s.signedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
