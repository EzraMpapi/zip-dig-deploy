// The brand mark, extracted once so Login, Signup, and the sidebar (see
// the shell below) all render the identical logo rather than three
// separately-drifting copies of the same clip-path hexagon.
export function BrandMark({ size = 80, textSize = 32 }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: size, height: size,
        background: "linear-gradient(135deg, #22C55E, #15803D)",
        clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
      }}
    >
      <span className="text-white font-bold" style={{ fontFamily: "'Poppins'", fontSize: textSize }}>S</span>
    </div>
  );
}
