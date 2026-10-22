import { withRequestLogging } from "@/lib/observability/logger";
import { logger, setLogUser } from "@/lib/observability/logger";
import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
async function handleGET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next =
    url.searchParams.get("next") === "/redefinir-senha"
      ? "/redefinir-senha"
      : "/gestao";
  if (code) {
    const client = await serverClient();
    const { error, data } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      if (data.user) setLogUser(data.user.id);
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  logger.warn("auth.callback_rejected", {
    operation: "supabase.auth",
    errorCode: "AUTH_REJECTED",
  });
  return NextResponse.redirect(new URL("/login?erro=confirmacao", url.origin));
}

export const GET = withRequestLogging("/auth/confirm", handleGET);
