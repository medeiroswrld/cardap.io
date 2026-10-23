import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
test.skip(
  process.env.RUN_CONNECTED_LIVE !== "1",
  "Explicit opt-in: creates and removes isolated hosted test data.",
);
test.use({ trace: "off", actionTimeout: 30000 });

test("Supabase real: cache do cardápio, invalidação e prévia do link", async ({ page, baseURL }) => {
  test.setTimeout(240000);
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const slug = `integration-${suffix}`;
  const email = `integration-${suffix}@example.test`;
  const password = randomUUID() + "Aa1!";
  let userId: string | undefined;
  let tenant: string | undefined;
  try {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Could not create test account");
    userId = created.data.user.id;
    const owner = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const session = await owner.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    const onboard = await owner.rpc("onboard_restaurant", { p_name: "Casa Teste", p_slug: slug });
    if (onboard.error) throw onboard.error;
    tenant = onboard.data as string;
    const { data: category } = await owner
      .from("categories").select("id").eq("restaurant_id", tenant).limit(1).single();
    const product = {
      id: randomUUID(),
      category_id: category!.id,
      name: "Prato teste",
      description: "",
      ingredients: "",
      removable_ingredients: [],
      allergens: "",
      price_cents: 2500,
      photo_url: `${url}/storage/v1/object/public/restaurant-media/${tenant}/teste.webp`,
      published: true,
      available: true,
      position: 0,
    };
    const insert = await owner.from("products").insert({ ...product, restaurant_id: tenant });
    if (insert.error) throw insert.error;

    await page.goto(`/r/${slug}`);
    await expect(page).toHaveTitle("Casa Teste · Cardápio");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", product.photo_url);

    const price = async () =>
      (await (await page.request.get(`/api/catalog/${slug}`)).json()).products[0].price_cents;
    expect(await price()).toBe(2500);
    // Direct DB write bypasses invalidation: the cached catalog must still answer.
    await owner.from("products").update({ price_cents: 2600 }).eq("id", product.id);
    expect(await price()).toBe(2500);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no restaurante" }).click();
    await expect(page).toHaveURL(/\/gestao\/[a-f0-9-]+$/, { timeout: 30000 });
    const save = await page.request.post(`/api/restaurants/${tenant}/catalog`, {
      headers: { origin: baseURL! },
      data: { action: "save_product", product: { ...product, price_cents: 2700 } },
    });
    expect(save.status()).toBe(200);
    expect(await price()).toBe(2700);
  } finally {
    if (tenant) await service.from("restaurants").delete().eq("id", tenant);
    if (userId) await service.auth.admin.deleteUser(userId);
  }
});
