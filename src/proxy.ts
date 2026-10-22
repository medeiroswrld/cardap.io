import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logProxyFailure } from "./lib/observability/logger";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  try {
    const { error } = await supabase.auth.getUser();
    if (error && (!error.status || error.status >= 500)) logProxyFailure();
  } catch {
    logProxyFailure();
    // Route/page authorization still runs. Do not propagate provider messages.
  }
  return response;
}
export const config = {
  matcher: [
    "/gestao/:path*",
    "/demo/gestao/:path*",
    "/api/auth/:path*",
    "/api/restaurants/:path*",
    "/redefinir-senha",
  ],
};
