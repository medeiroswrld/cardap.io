// Per-restaurant menu appearance (migration 018). Pure: the hook in
// components/use-menu-theme.ts applies the variables to the page.
export type PresetId = "brasa" | "pizzaria" | "japones" | "cafeteria" | "acai" | "noite";
export type HeadingFont = "padrao" | "moderna" | "elegante" | "forte" | "rustica" | "divertida";
export type BodyFont = "manrope" | "inter" | "nunito" | "lora";
export type Radius = "reto" | "suave" | "redondo";
export type ResolvedTheme = {
  mode: "light" | "dark";
  brand: string;
  background: string;
  surface: string;
  text: string;
  heading_font: HeadingFont;
  body_font: BodyFont;
  radius: Radius;
  logo_url?: string;
  cover_url?: string;
};
export type MenuTheme = Partial<ResolvedTheme> & { preset?: PresetId | "personalizado" };

type Preset = { label: string } & Omit<ResolvedTheme, "logo_url" | "cover_url">;
export const PRESETS: Record<PresetId, Preset> = {
  brasa: { label: "Brasa", mode: "light", brand: "#a63232", background: "#fff8f2", surface: "#ffffff", text: "#251c1a", heading_font: "padrao", body_font: "manrope", radius: "suave" },
  pizzaria: { label: "Pizzaria", mode: "light", brand: "#c0392b", background: "#fdf6e3", surface: "#ffffff", text: "#2b1d14", heading_font: "rustica", body_font: "nunito", radius: "suave" },
  japones: { label: "Japonês", mode: "dark", brand: "#d7263d", background: "#111111", surface: "#1c1c1c", text: "#f5f5f5", heading_font: "moderna", body_font: "inter", radius: "reto" },
  cafeteria: { label: "Cafeteria", mode: "light", brand: "#6f4e37", background: "#f6efe6", surface: "#fffaf3", text: "#2e221a", heading_font: "elegante", body_font: "lora", radius: "suave" },
  acai: { label: "Açaí", mode: "light", brand: "#6a1b9a", background: "#f7f0fb", surface: "#ffffff", text: "#241430", heading_font: "divertida", body_font: "nunito", radius: "redondo" },
  noite: { label: "Noite", mode: "dark", brand: "#e0a43a", background: "#14110f", surface: "#201b18", text: "#f4ede4", heading_font: "forte", body_font: "inter", radius: "suave" },
};

export const HEADING_FONTS: Record<HeadingFont, { label: string; family: string }> = {
  padrao: { label: "Padrão", family: '"Manrope Variable", sans-serif' },
  moderna: { label: "Moderna", family: '"Montserrat", sans-serif' },
  elegante: { label: "Elegante", family: '"Playfair Display", serif' },
  forte: { label: "Forte", family: '"Bebas Neue", sans-serif' },
  rustica: { label: "Rústica", family: '"Alfa Slab One", serif' },
  divertida: { label: "Divertida", family: '"Baloo 2", sans-serif' },
};
export const BODY_FONTS: Record<BodyFont, { label: string; family: string }> = {
  manrope: { label: "Manrope (padrão)", family: '"Manrope Variable", sans-serif' },
  inter: { label: "Inter", family: '"Inter Variable", sans-serif' },
  nunito: { label: "Nunito", family: '"Nunito Variable", sans-serif' },
  lora: { label: "Lora", family: '"Lora Variable", serif' },
};
const RADIUS: Record<Radius, string> = { reto: "4px", suave: "14px", redondo: "24px" };

export function resolveTheme(theme?: MenuTheme | null): ResolvedTheme {
  const { label: _label, ...base } = PRESETS.brasa;
  void _label;
  const clean = Object.fromEntries(
    Object.entries(theme ?? {}).filter(([key, value]) => key !== "preset" && value !== undefined && value !== ""),
  );
  return { ...base, ...clean } as ResolvedTheme;
}

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function isReadable(theme?: MenuTheme | null) {
  const r = resolveTheme(theme);
  return contrastRatio(r.text, r.background) >= 4.5 && contrastRatio(r.text, r.surface) >= 4.5;
}
export function mix(a: string, b: string, weight: number) {
  const [ca, cb] = [channels(a), channels(b)];
  return (
    "#" +
    ca
      .map((v, i) => Math.round(v * weight + cb[i] * (1 - weight)).toString(16).padStart(2, "0"))
      .join("")
  );
}

const STYLE_KEYS = ["mode", "brand", "background", "surface", "text", "heading_font", "body_font", "radius"];

export function themeVariables(theme?: MenuTheme | null): Record<string, string> {
  // Only style keys restyle the page; a logo/cover-only theme looks like today.
  const values = (theme ?? {}) as Record<string, unknown>;
  if (!STYLE_KEYS.some((key) => values[key] !== undefined && values[key] !== "")) return {};
  const r = resolveTheme(theme);
  return {
    "--brand": r.brand,
    "--brand-dark": mix(r.brand, "#000000", 0.85),
    "--brand-contrast": contrastRatio(r.brand, "#ffffff") >= contrastRatio(r.brand, "#111111") ? "#ffffff" : "#111111",
    "--background": r.background,
    "--surface": r.surface,
    "--text": r.text,
    "--muted": mix(r.text, r.background, 0.68),
    "--border": mix(r.text, r.background, 0.14),
    "--soft": mix(r.text, r.surface, 0.06),
    "--radius": RADIUS[r.radius],
    "--font-sans": BODY_FONTS[r.body_font].family,
    "--font-heading": HEADING_FONTS[r.heading_font].family,
  };
}
