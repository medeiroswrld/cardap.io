"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isGestaoPath } from "@/lib/color-mode";

// Keeps html[data-app] and color-scheme in sync on soft navigations (the root
// layout persists, so the head script only runs once).
export function AppScope() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    if (isGestaoPath(pathname)) {
      root.dataset.app = "gestao";
      root.style.colorScheme = root.dataset.mode ?? "";
    } else {
      delete root.dataset.app;
      root.style.colorScheme = "";
    }
  }, [pathname]);
  return null;
}
