"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
const hasSession = () => /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);

// The page is static, so the session hint comes from the Supabase cookie in the browser.
// /gestao still checks the real session; this only picks the label.
export function AuthLink({ className = "" }: { className?: string }) {
  const signedIn = useSyncExternalStore(noop, hasSession, () => false);
  return (
    <Link className={className} href={signedIn ? "/gestao" : "/login"}>
      {signedIn ? "Ir para a gestão" : "Entrar"}
    </Link>
  );
}
