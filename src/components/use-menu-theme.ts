"use client";
import { useLayoutEffect } from "react";
import { resolveTheme, themeVariables, type MenuTheme } from "@/lib/menu-theme";

// Writes the restaurant's variables on <html> while a customer screen is open,
// so modals rendered in portals inherit them. Removed on unmount.
export function useMenuTheme(theme?: MenuTheme | null) {
  const key = JSON.stringify(theme ?? {});
  useLayoutEffect(() => {
    const parsed = JSON.parse(key) as MenuTheme;
    const variables = themeVariables(parsed);
    const root = document.documentElement;
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    if (Object.keys(variables).length) {
      root.style.colorScheme = resolveTheme(parsed).mode;
      root.dataset.ownTheme = "1";
    }
    return () => {
      for (const name of Object.keys(variables)) root.style.removeProperty(name);
      delete root.dataset.ownTheme;
      // A scope that remains active keeps following the user's mode.
      root.style.colorScheme = root.dataset.app ? (root.dataset.mode ?? "") : "";
    };
  }, [key]);
}
