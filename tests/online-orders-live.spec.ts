import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
test.skip(
  process.env.RUN_CONNECTED_LIVE !== "1",
  "Explicit opt-in: creates and removes isolated hosted test data (needs migration 011 applied).",
);
test.use({ trace: "off", actionTimeout: 30000 });

test("Supabase real: pedido de entrega do checkout ao aceite e entrega", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(300000);
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
  const customerContext = await browser.newContext({
    baseURL,
  });
  try {
    // 1. Conta, restaurante e produto de R$ 25
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Could not create test account");
    userId = created.data.user.id;
    const owner = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const session = await owner.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    const onboard = await owner.rpc("onboard_restaurant", { p_name: "Casa Entrega", p_slug: slug });
    if (onboard.error) throw onboard.error;
    tenant = onboard.data as string;
    const { data: category } = await owner
      .from("categories").select("id").eq("restaurant_id", tenant).limit(1).single();
    const insert = await owner.from("products").insert({
      id: randomUUID(),
      restaurant_id: tenant,
      category_id: category!.id,
      name: "Prato entrega",
      description: "",
      ingredients: "",
      removable_ingredients: [],
      allergens: "",
      price_cents: 2500,
      photo_url: `${url}/storage/v1/object/public/restaurant-media/${tenant}/teste.webp`,
      published: true,
      available: true,
      position: 0,
    });
    if (insert.error) throw insert.error;

    // 2. Configurações de pedidos online e bairro
    const settings = await owner.rpc("save_restaurant_settings", {
      p_restaurant: tenant,
      p_tables: 1,
      p_settings: {
        name: "Casa Entrega",
        subtitle: "",
        phone: "",
        address: "",
        privacy_email: "privacy@example.test",
        retention_days: 365,
        accepting_orders: true,
        opening_hours: Array.from({ length: 7 }, (_, day) => ({
          day,
          open: "00:00",
          close: "23:59:59",
        })),
        pickup_enabled: true,
        delivery_enabled: true,
        delivery_min_order_cents: 3000,
      },
    });
    if (settings.error) throw settings.error;
    const zone = await owner.rpc("save_delivery_zone", {
      p_restaurant: tenant,
      p_id: randomUUID(),
      p_name: "Centro",
      p_fee: 700,
      p_estimate: 40,
      p_active: true,
      p_position: 0,
    });
    if (zone.error) throw zone.error;

    // 3. Cliente faz o pedido de entrega
    const customer = await customerContext.newPage();
    await customer.goto(`/r/${slug}`);
    await customer.getByRole("button", { name: "Ver detalhes de Prato entrega", exact: true }).click();
    const detail = customer.getByRole("dialog");
    await detail.getByRole("button", { name: "Aumentar quantidade" }).click();
    await detail.getByRole("button", { name: /^Adicionar •/ }).click();
    await customer.getByRole("button", { name: /Abrir sacola com/ }).click();
    await customer.getByRole("button", { name: "Revisar pedido", exact: true }).click();
    await customer.getByRole("radio", { name: "Entrega" }).check();
    await customer.getByLabel("Bairro").selectOption({ index: 1 }); // index 0 is "Escolha o bairro"
    await customer.getByLabel("Rua", { exact: true }).fill("Rua das Flores");
    await customer.getByLabel("Número", { exact: true }).fill("123");
    await customer.getByRole("radio", { name: "Dinheiro" }).check();
    await customer.getByLabel(/Troco para quanto/).fill("100");
    await customer.getByLabel("Como podemos chamar você?").fill("Cliente Teste");
    await customer.getByLabel("WhatsApp com DDD").fill("(11) 99999-0000");
    await customer.getByRole("button", { name: "Enviar pedido", exact: true }).click();
    await expect(customer).toHaveURL(new RegExp(`/r/${slug}/pedido/[a-f0-9-]+$`), { timeout: 30000 });
    await expect(customer.getByText("Aguardando o restaurante aceitar").first()).toBeVisible();

    // 4. Conferência no banco
    const { data: order, error: orderError } = await service
      .from("orders")
      .select("id,total_cents,fulfillment")
      .eq("restaurant_id", tenant)
      .single();
    if (orderError) throw orderError;
    expect(order.total_cents).toBe(5700);
    expect(order.fulfillment).toBe("entrega");
    const { data: address, error: addressError } = await service
      .from("order_addresses")
      .select("zone_name")
      .eq("order_id", order.id)
      .single();
    if (addressError) throw addressError;
    expect(address.zone_name).toBe("Centro");

    // 5. Gestão: aceitar e conduzir até a entrega
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no restaurante" }).click();
    await expect(page).toHaveURL(/\/gestao\/[a-f0-9-]+$/, { timeout: 30000 });
    await page.getByRole("button", { name: "Pedidos", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Aguardando aceite/ })).toBeVisible();
    await expect(page.getByText("Cliente novo")).toBeVisible();
    const advance = async (action: string, estimate?: string) => {
      await page.getByRole("button", { name: action, exact: true }).click();
      if (estimate) await page.getByLabel("Tempo estimado em minutos").fill(estimate);
      await page.getByRole("button", { name: "Confirmar atualização" }).click();
    };
    await advance("Aceitar pedido", "30");
    await advance("Iniciar preparo");
    await advance("Marcar pronto");
    await advance("Saiu para entrega");
    await expect(page.getByRole("button", { name: "Confirmar entrega", exact: true })).toBeVisible();
    await advance("Confirmar entrega");

    // 6. Cliente vê o pedido entregue
    await customer.reload();
    await expect(customer.getByText("Entregue").first()).toBeVisible({ timeout: 30000 });
    await expect(customer.getByText(/Entregar em Rua/)).toBeVisible();
  } finally {
    await customerContext.close();
    try {
      if (tenant) {
        const { error } = await service.from("restaurants").delete().eq("id", tenant);
        if (error) console.error("Test tenant cleanup failed", tenant, error.code);
      }
    } finally {
      if (userId) {
        const { error } = await service.auth.admin.deleteUser(userId);
        if (error) console.error("Test account cleanup failed", userId, error.code);
      }
    }
  }
});
