import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { hasRequestContext, logger, setLogUser } from "../observability/logger";
export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
export async function serverClient() {
  if (!isConfigured()) throw new Error("Supabase não configurado");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            // Read-only Server Components are expected; API cookie failure is not.
            if (hasRequestContext()) {
              logger.error("auth.cookie_write_failed", {
                operation: "supabase.auth",
                errorCode: "COOKIE_WRITE_FAILED",
              });
              throw new Error("COOKIE_WRITE_FAILED");
            }
          }
        },
      },
    },
  );
}
export function serviceClient() {
  if (!isConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Integração de dados não configurada");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function requireMember(restaurantId: string, owner = false) {
  const supabase = await serverClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && (!error.status || error.status >= 500))
    throw new Error("AUTH_UNAVAILABLE");
  if (error || !user) throw new Error("UNAUTHORIZED");
  setLogUser(user.id);
  const { data: member, error: membershipError } = await supabase
    .from("restaurant_members")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    logger.error("dependency.failed", {
      operation: "supabase.membership",
      errorCode: "DATABASE_ERROR",
    });
    throw new Error("DATABASE_ERROR");
  }
  if (!member || (owner && member.role !== "owner"))
    throw new Error("FORBIDDEN");
  return { supabase, user, role: member.role };
}
