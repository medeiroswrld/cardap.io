"use client";
import { useMenuTheme } from "./use-menu-theme";
import type { MenuTheme } from "@/lib/menu-theme";

// Applies a restaurant's own theme on screens that are otherwise server-rendered.
export function MenuThemeScope({ theme }: { theme?: MenuTheme | null }) {
  useMenuTheme(theme);
  return null;
}
