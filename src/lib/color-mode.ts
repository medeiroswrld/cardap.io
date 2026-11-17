// Dark/light mode for the Fome Play design system (spec K).
export type ColorMode = "dark" | "light";
export const MODE_STORAGE_KEY = "fp:mode";
export type AppScope = "gestao" | "menu";
const GESTAO_PATH = /^\/(gestao|login|redefinir-senha|demo\/gestao)(\/|$)/;
const MENU_PATH = /^\/r\/[^/]+(\/|$)/;

export function resolveMode(stored: string | null, prefersDark: boolean): ColorMode {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}

export function appScope(pathname: string): AppScope | null {
  if (GESTAO_PATH.test(pathname)) return "gestao";
  if (MENU_PATH.test(pathname)) return "menu";
  return null;
}

export function isGestaoPath(pathname: string) {
  return appScope(pathname) === "gestao";
}

// Runs inline in <head> before first paint (no flash). Must mirror the two
// functions above; scripts/test-color-mode.mjs checks that they agree.
export const MODE_SCRIPT = `(function(){try{var d=document.documentElement,s=null;try{s=localStorage.getItem(${JSON.stringify(
  MODE_STORAGE_KEY,
)})}catch(e){}var m=s==="dark"||s==="light"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.mode=m;var p=location.pathname,a=${GESTAO_PATH.toString()}.test(p)?"gestao":${MENU_PATH.toString()}.test(p)?"menu":null;if(a){d.dataset.app=a;d.style.colorScheme=m}}catch(e){}})();`;
