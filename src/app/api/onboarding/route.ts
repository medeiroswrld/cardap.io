import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const supabase = await serverClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("UNAUTHORIZED");
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
    if (error)
      return Response.json(
        {
          error:
            "Não foi possível criar. Confira se o endereço já está em uso e se as migrations foram aplicadas.",
        },
        { status: 400, headers: noStore },
      );
    return Response.json({ id: data }, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
