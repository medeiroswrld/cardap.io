"use client";
import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { appScope } from "@/lib/color-mode";

// Keeps html[data-app] and color-scheme in sync on soft navigations (the root
// layout persists, so the head script only runs once).
export function AppScope() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const root = document.documentElement;
    const scope = appScope(pathname);
    if (scope) {
      root.dataset.app = scope;
      // A restaurant with its own theme owns color-scheme (useMenuTheme).
      if (!(scope === "menu" && root.dataset.ownTheme)) root.style.colorScheme = root.dataset.mode ?? "";
    } else if (root.dataset.app) {
      // Leaving a scope: clear only what it set.
      delete root.dataset.app;
      root.style.colorScheme = "";
    }
  }, [pathname]);
  return null;
}
