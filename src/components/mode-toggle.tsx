"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { MODE_STORAGE_KEY, type ColorMode } from "@/lib/color-mode";

const MODE_EVENT = "fp:mode-change";

function currentMode(): ColorMode {
  return document.documentElement.dataset.mode === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  window.addEventListener(MODE_EVENT, onChange);
  return () => window.removeEventListener(MODE_EVENT, onChange);
}

// Server render and hydration both use "light"; the real mode is read after hydration.
const serverMode = (): ColorMode => "light";

export function ModeToggle({ className = "", compact = false, iconSize = 17 }: { className?: string; compact?: boolean; iconSize?: number }) {
  const mode = useSyncExternalStore(subscribe, currentMode, serverMode);
  const next: ColorMode = mode === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={`mode-toggle ${compact ? "mode-toggle-compact" : ""} ${className}`.replace(/\s+/g, " ").trim()}
      aria-label={next === "dark" ? "Ativar modo noturno" : "Ativar modo claro"}
      onClick={() => {
        const root = document.documentElement;
        root.dataset.mode = next;
        root.style.colorScheme = next;
        try {
          localStorage.setItem(MODE_STORAGE_KEY, next);
        } catch {}
        window.dispatchEvent(new Event(MODE_EVENT));
      }}
    >
      {next === "dark" ? <Moon size={iconSize} /> : <Sun size={iconSize} />}
      <span className={compact ? "sr-only" : undefined}>{next === "dark" ? "Modo noturno" : "Modo claro"}</span>
    </button>
  );
}
