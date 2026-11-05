import { test, expect as baseExpect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
test.skip(
  process.env.RUN_CONNECTED_LIVE !== "1",
  "Explicit opt-in: creates and removes isolated hosted test data (requires migration 012).",
);
test.use({ trace: "off", actionTimeout: 30000, screenshot: "only-on-failure" });
const expect = baseExpect.configure({ timeout: 30000 });

test("Supabase real: CRM de clientes, etiquetas, campanha e exclusão", async ({ page }) => {
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
  const vipPhone = "11900000001";
  const erasePhone = "11900000002";
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
    const onboard = await owner.rpc("onboard_restaurant", { p_name: "Casa CRM", p_slug: slug });
    if (onboard.error) throw onboard.error;
    tenant = onboard.data as string;
    const must = <T,>(r: { data: T; error: { message: string } | null }): NonNullable<T> => {
      if (r.error || r.data == null) throw new Error("Fixture failed: " + r.error?.message);
      return r.data as NonNullable<T>;
    };

    const category = must(
      await service.from("categories").select("id").eq("restaurant_id", tenant).limit(1).single(),
    );
    const product = must(
      await service
        .from("products")
        .insert({ restaurant_id: tenant, category_id: category.id, name: "Prato teste", price_cents: 2500, published: true })
        .select("id")
        .single(),
    );
    const table = must(
      await service.from("dining_tables").insert({ restaurant_id: tenant, number: 1 }).select("id").single(),
    );
    const guest = must(
      await service
        .from("guest_sessions")
        .insert({
          restaurant_id: tenant,
          token_hash: "c".repeat(64),
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        })
        .select("id")
        .single(),
    );
    must(
      await service
        .from("contacts")
        .insert([
          { restaurant_id: tenant, name: "Ana VIP", phone: vipPhone, marketing_status: "authorized" },
          { restaurant_id: tenant, name: "Bia Remover", phone: erasePhone, marketing_status: "not_authorized" },
          { restaurant_id: tenant, name: "Caio Novo", phone: "11900000003", marketing_status: "not_authorized" },
        ])
        .select("id"),
    );
    const placeOrder = async (phone: string, total: number, daysAgo: number, status = "entregue") => {
      const order = must(
        await service
          .from("orders")
          .insert({
            restaurant_id: tenant,
            guest_session_id: guest.id,
            table_id: table.id,
            customer_name: "X",
            customer_phone: phone,
            total_cents: total,
            idempotency_key: randomUUID(),
            payload_hash: "h",
            status,
            fulfillment: "mesa",
            created_at: new Date(Date.now() - daysAgo * 86400_000).toISOString(),
          })
          .select("id")
          .single(),
      );
      must(
        await service
          .from("order_items")
          .insert({
            restaurant_id: tenant,
            order_id: order.id,
            product_id: product.id,
            product_name: "Prato teste",
            unit_price_cents: 100,
            quantity: 1,
          })
          .select("id"),
      );
      return order.id as string;
    };
    // VIP by spend (R$ 600,00); the cancelled order must not count.
    await placeOrder(vipPhone, 60000, 2);
    await placeOrder(vipPhone, 9999, 1, "cancelado");
    await placeOrder(erasePhone, 2000, 3);
    await placeOrder("11900000003", 2000, 1);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no restaurante" }).click();
    await expect(page).toHaveURL(/\/gestao\/[a-f0-9-]+$/, { timeout: 30000 });

    await page.getByRole("button", { name: "Clientes", exact: true }).click();
    await expect(page.getByRole("button", { name: "VIP: 1" })).toBeVisible();

    await page.getByRole("button", { name: `Ana VIP, ${vipPhone}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Total gasto")).toBeVisible();
    await expect(dialog.getByText(/R\$\s*600,00/).first()).toBeVisible();

    await dialog.getByLabel("Nova etiqueta").fill("Teste");
    await dialog.getByRole("button", { name: "Adicionar etiqueta" }).click();
    await dialog.getByLabel(/^Anotações/).fill("Prefere mesa na janela");
    await dialog.getByRole("button", { name: "Salvar etiquetas e anotações" }).click();
    await expect
      .poll(async () => {
        const { data } = await service
          .from("contacts")
          .select("tags,notes")
          .eq("restaurant_id", tenant!)
          .eq("phone", vipPhone)
          .single();
        return JSON.stringify(data);
      })
      .toBe(JSON.stringify({ tags: ["Teste"], notes: "Prefere mesa na janela" }));
    if (await dialog.isVisible()) await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const campaign = page.getByRole("region", { name: "Campanha no WhatsApp" });
    await campaign.getByLabel("Segmento").selectOption("vip");
    await campaign.getByRole("button", { name: "Montar lista" }).click();
    await expect(campaign.getByText("1 cliente(s) na lista")).toBeVisible();
    await expect(campaign.getByRole("link", { name: "Abrir no WhatsApp: Ana VIP" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/55/,
    );

    await page.getByRole("button", { name: `Bia Remover, ${erasePhone}` }).click();
    const erase = page.getByRole("dialog");
    await erase.getByRole("button", { name: "Excluir dados do cliente" }).click();
    await erase.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
    await erase.getByRole("button", { name: "Excluir definitivamente" }).click();
    await expect(erase).toBeHidden();
    const gone = await service
      .from("contacts")
      .select("id")
      .eq("restaurant_id", tenant)
      .eq("phone", erasePhone);
    expect(gone.error).toBeNull();
    expect(gone.data).toHaveLength(0);
    const orders = await service
      .from("orders")
      .select("customer_name,customer_phone")
      .eq("restaurant_id", tenant)
      .eq("total_cents", 2000)
      .eq("customer_name", "Cliente removido");
    expect(orders.error).toBeNull();
    expect(orders.data).toHaveLength(1);
    expect(orders.data![0].customer_phone).toBe("");
  } finally {
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
