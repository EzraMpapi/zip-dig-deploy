/* ══════════════════════════════════════════════════════════════════════════
   ENTERPRISE DESIGN TOKENS — JavaScript theme object (Phase 1A)

   Mirror of ./tokens.css. Same names, same values. Use `theme` for values
   that must be computed in JS (chart palettes, inline SVG fills, canvas),
   and the CSS custom properties everywhere else. Presentation only — this
   module imports nothing and touches no application state.
   ══════════════════════════════════════════════════════════════════════════ */

export const surface = {
  ground: "#0F1117",
  layer1: "#1A1D27",
  layer2: "#242836",
  layer3: "#2E3343",
  inverse: "#F8F9FC",
};

export const text = {
  primary: "#F1F3F9",
  secondary: "#9DA4B8",
  tertiary: "#636B80",
  inverse: "#1A1D27",
};

export const accent = {
  gold: "#C9A94E",
  emerald: "#2D9F6B",
  steel: "#5B7DB5",
  ruby: "#C84B4B",
  goldSoft: "rgba(201,169,78,0.12)",
  emeraldSoft: "rgba(45,159,107,0.12)",
  steelSoft: "rgba(91,125,181,0.12)",
  rubySoft: "rgba(200,75,75,0.12)",
};

export const border = {
  subtle: "rgba(255,255,255,0.06)",
  default: "rgba(255,255,255,0.10)",
  emphasis: "rgba(255,255,255,0.18)",
};

export const shadow = {
  card: "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
  elevated: "0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)",
  overlay: "0 8px 24px rgba(0,0,0,0.5)",
  ringSteel: "0 0 0 3px rgba(91,125,181,0.15)",
  ringRuby: "0 0 0 3px rgba(200,75,75,0.15)",
};

export const space = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
  "3xl": "64px",
};

export const radius = {
  sm: "4px",
  md: "8px",
  lg: "12px",
  full: "9999px",
};

export const typography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif',
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
};

export const motion = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  smooth: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
  expressive: "400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
};

export const layout = {
  topBarHeight: 56,
  sidebarWidth: 240,
  sidebarCollapsedWidth: 64,
  pageHeaderHeight: 64,
  tapTarget: 44,
  breakpoints: { mobile: 0, tablet: 640, desktop: 1024, wide: 1440 },
};

/** Ordered palette for charts: steel primary, gold secondary, emerald tertiary. */
export const chartPalette = [accent.steel, accent.gold, accent.emerald, accent.ruby, text.tertiary];

export const theme = {
  surface,
  text,
  accent,
  border,
  shadow,
  space,
  radius,
  typography,
  motion,
  layout,
  chartPalette,
};

export default theme;
