import { withRequestLogging } from "@/lib/observability/logger";
import { logFailure, setLogUser } from "@/lib/observability/logger";
import { z } from "zod";
import { serverClient } from "@/lib/supabase/server";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
const schema = z.object({
  action: z.enum(["login", "recover", "signup", "logout"]),
  email: z.email().optional(),
  password: z.string().min(8).max(128).optional(),
});
async function handlePOST(request: Request) {
  try {
    checkOrigin(request);
    const input = schema.parse(await request.json());
    const client = await serverClient();
    if (input.action === "logout") {
      const { error } = await client.auth.signOut();
      if (error) throw new Error("AUTH_UNAVAILABLE");
      return Response.json({ ok: true }, { headers: noStore });
    }
    if (!input.email) throw new Error("EMAIL_REQUIRED");
    if (input.action === "recover") {
      const { error } = await client.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/redefinir-senha`,
      });
      if (error && error.code !== "user_not_found") {
        logFailure(new Error("AUTH_UNAVAILABLE"), "supabase.auth");
        return Response.json(
          {
            error:
              "Não foi possível solicitar o e-mail de recuperação agora. Tente novamente mais tarde ou fale com o suporte.",
          },
          { status: 503, headers: noStore },
        );
      }
      return Response.json(
        {
          ok: true,
          message:
            "Se houver uma conta com este e-mail, você receberá as instruções.",
        },
        { headers: noStore },
      );
    }
    if (!input.password) throw new Error("PASSWORD_REQUIRED");
    const result =
      input.action === "signup"
        ? await client.auth.signUp({
            email: input.email,
            password: input.password,
            options: {
              emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
            },
          })
        : await client.auth.signInWithPassword({
            email: input.email,
            password: input.password,
          });
    if (result.error) {
      if (!result.error.status || result.error.status >= 500)
        throw new Error("AUTH_UNAVAILABLE");
      logFailure(new Error("AUTH_REJECTED"), "supabase.auth");
      return Response.json(
        {
          error:
            "Não foi possível entrar ou cadastrar. Confira os dados e a confirmação do e-mail.",
        },
        { status: 400, headers: noStore },
      );
    }
    if (result.data.user) setLogUser(result.data.user.id);
    return Response.json(
      { ok: true, confirmation: input.action === "signup" },
      { headers: noStore },
    );
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging("/api/auth", handlePOST);
