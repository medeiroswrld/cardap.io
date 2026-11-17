// Dark/light mode for the Fome Play design system (spec K).
export type ColorMode = "dark" | "light";
export const MODE_STORAGE_KEY = "fp:mode";
const GESTAO_PATH = /^\/(gestao|login|redefinir-senha|demo\/gestao)(\/|$)/;

export function resolveMode(stored: string | null, prefersDark: boolean): ColorMode {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}

export function isGestaoPath(pathname: string) {
  return GESTAO_PATH.test(pathname);
}

// Runs inline in <head> before first paint (no flash). Must mirror the two
// functions above; scripts/test-color-mode.mjs checks that they agree.
export const MODE_SCRIPT = `(function(){try{var d=document.documentElement,s=null;try{s=localStorage.getItem(${JSON.stringify(
  MODE_STORAGE_KEY,
)})}catch(e){}var m=s==="dark"||s==="light"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.mode=m;d.style.colorScheme=m;if(${GESTAO_PATH.toString()}.test(location.pathname))d.dataset.app="gestao"}catch(e){}})();`;
