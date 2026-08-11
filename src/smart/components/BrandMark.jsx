import markAsset from "@/assets/smart-manager-mark.png.asset.json";

/**
 * BrandMark – the official SMART MANAGER hexagon logo.
 *
 * @param {Object} props
 * @param {number} [props.size=80] – Width and height in pixels.
 * @param {string} [props.className=""] – Additional CSS classes.
 * @param {boolean} [props.spin=false] – Whether the logo spins continuously.
 * @param {string} [props.alt="SMART MANAGER logo"] – Alt text for accessibility.
 */
export function BrandMark({
  size = 80,
  className = "",
  spin = false,
  alt = "SMART MANAGER logo",
}) {
  return (
    <div
      className={`flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={markAsset.url}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.18))",
          animation: spin ? "spin 8s linear infinite" : undefined,
        }}
      />
    </div>
  );
}
