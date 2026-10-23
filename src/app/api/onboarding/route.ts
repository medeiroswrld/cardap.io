import { setLogUser, withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";
import { invalidateCatalogSlug } from "@/lib/catalog-cache";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
async function handlePOST(request: Request) {
  try {
    checkOrigin(request);
    const supabase = await serverClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError && (!authError.status || authError.status >= 500))
      throw new Error("AUTH_UNAVAILABLE");
    if (!user) throw new Error("UNAUTHORIZED");
    setLogUser(user.id);
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .regex(/^[a-z0-9-]{3,60}$/)
          .refine((s) => s !== "demo", "Slug reservado"),
      })
      .parse(await request.json());
    const { data, error } = await supabase.rpc("onboard_restaurant", {
      p_name: body.name,
      p_slug: body.slug,
    });
    if (error) throw error;
    // A visit before creation may have cached "not found" for this slug.
    invalidateCatalogSlug(body.slug);
    return Response.json({ id: data }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging("/api/onboarding", handlePOST);
