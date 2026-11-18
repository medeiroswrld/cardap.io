import { logFailure, setLogUser, withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { serverClient, serviceClient } from "@/lib/supabase/server";
import { invalidateCatalogSlug } from "@/lib/catalog-cache";
import { apiError, checkOrigin, noStore } from "@/lib/server-security";
import { enforceBillingLimit } from "@/lib/rate-limit";
import { asaasConfigFromEnv, asaasFromEnv } from "@/lib/asaas";
import { isValidDocument, normalizeDocument, normalizePhone } from "@/lib/cpf-cnpj";
import { slugFromName } from "@/lib/plans";
import { provisionCheckout } from "@/lib/billing-server";

const schema = z.object({
  plan: z.enum(["essencial", "profissional"]),
  cycle: z.enum(["mensal", "anual"]),
  restaurantName: z.string().trim().min(2).max(80),
  ownerName: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  phone: z
    .string()
    .max(30)
    .transform(normalizePhone)
    .pipe(z.string().regex(/^[0-9]{10,11}$/)),
  document: z
    .string()
    .max(30)
    .refine(isValidDocument, "INVALID_DOCUMENT"),
  password: z.string().min(8).max(128),
  acceptTerms: z.literal(true),
});

async function createOwnerAccount(email: string, password: string, name: string) {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") throw new Error("EMAIL_IN_USE");
    if (error.code === "weak_password") throw new Error("WEAK_PASSWORD");
    if (!error.status || error.status >= 500 || error.status === 429) throw new Error("AUTH_UNAVAILABLE");
    throw new Error("INVALID_INPUT");
  }
  return data.user.id;
}

async function onboardWithUniqueSlug(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  name: string,
) {
  const base = slugFromName(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix =
      attempt === 0
        ? ""
        : attempt < 6
          ? `-${attempt + 1}`
          : `-${Math.random().toString(36).slice(2, 6)}`;
    const slug = base.slice(0, 60 - suffix.length).replace(/-+$/, "") + suffix;
    const { data, error } = await supabase.rpc("onboard_restaurant", { p_name: name, p_slug: slug });
    if (!error) {
      invalidateCatalogSlug(slug);
      return data as string;
    }
    if (error.code !== "23505") throw error;
  }
  throw new Error("STATE_CONFLICT");
}

async function handlePOST(request: Request) {
  try {
    checkOrigin(request);
    await enforceBillingLimit(request);
    const input = schema.parse(await request.json());
    // Fail before creating anything when billing is not configured.
    if (!asaasConfigFromEnv()) throw new Error("BILLING_UNAVAILABLE");
    const userId = await createOwnerAccount(input.email, input.password, input.ownerName);
    setLogUser(userId);
    let restaurantId: string;
    try {
      const supabase = await serverClient();
      const signedIn = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (signedIn.error) throw new Error("AUTH_UNAVAILABLE");
      restaurantId = await onboardWithUniqueSlug(supabase, input.restaurantName);
    } catch (error) {
      // No restaurant yet: do not leave an orphan login behind.
      const removed = await serviceClient().auth.admin.deleteUser(userId);
      if (removed.error) logFailure(removed.error, "supabase.auth");
      throw error;
    }
    const { data: started, error: startError } = await serviceClient().rpc("start_subscription", {
      p_restaurant: restaurantId,
      p_plan: input.plan,
      p_cycle: input.cycle,
      p_want_founder: input.plan === "profissional" && input.cycle === "mensal",
    });
    if (startError) {
      // The restaurant exists (pendente): gestao offers "Tentar gerar o pagamento de novo".
      logFailure(startError, "supabase.billing");
      return Response.json({ redirect: "/gestao" }, { headers: noStore });
    }
    try {
      const invoiceUrl = await provisionCheckout(asaasFromEnv(), {
        restaurantId,
        plan: input.plan,
        cycle: input.cycle,
        founder: Boolean(started?.founder),
        customer: {
          name: input.ownerName,
          cpfCnpj: normalizeDocument(input.document),
          email: input.email,
          mobilePhone: input.phone,
        },
      });
      // founder/priceCents: the real price the buyer gets (the founder price may be gone).
      return Response.json(
        { redirect: invoiceUrl, founder: Boolean(started?.founder), priceCents: Number(started?.price_cents) },
        { headers: noStore },
      );
    } catch (error) {
      logFailure(error, "asaas.api");
      const documentRejected = error instanceof Error && error.message === "INVALID_DOCUMENT";
      return Response.json(
        { redirect: documentRejected ? "/gestao?pagamento=documento" : "/gestao" },
        { headers: noStore },
      );
    }
  } catch (error) {
    return apiError(error);
  }
}

export const POST = withRequestLogging("/api/billing/subscribe", handlePOST);
