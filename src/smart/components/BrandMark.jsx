import markAsset from "@/assets/smart-manager-mark.png.asset.json";

// The brand mark, extracted once so Login, Signup, the portals and the sidebar
// all render the identical logo rather than separately-drifting copies.
// `textSize` is kept in the signature for call-site compatibility; the mark is
// now the official SMART MANAGER hexagon icon, so no letterform is drawn.
export function BrandMark({ size = 80, textSize: _textSize, className = "", spin = false }) {
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={markAsset.url}
        alt="SMART MANAGER logo"
        width={size}
        height={size}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.18))",
          animation: spin ? "es-logo-spin 8s linear infinite" : undefined,
        }}
      />
    </div>
  );
}
