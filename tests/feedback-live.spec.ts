import { test, expect as baseExpect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";

test.skip(
  process.env.RUN_CONNECTED_LIVE !== "1",
  "Opt-in: creates and cleans isolated hosted test data.",
);
test.use({ trace: "off", screenshot: "only-on-failure", actionTimeout: 30000 });
const expect = baseExpect.configure({ timeout: 30000 });

test("interações antes do pedido, moderação, controles do restaurante e isolamento", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240000);
  loadEnvFile(".env.local");
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const tenant = randomUUID(),
    other = randomUUID(),
    cat = randomUUID(),
    product = randomUUID(),
    notOrdered = randomUUID(),
    table = randomUUID();
  const slug = `feedback-${randomUUID().slice(0, 8)}`;
  const email = `${slug}@example.test`,
    password = `${randomUUID()}Aa1!`;
  let userId: string | undefined;
  const guest = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const outsider = await browser.newContext({ baseURL });
  const customer = await guest.newPage();
  await customer.emulateMedia({ reducedMotion: "reduce" });
  const origin = new URL(baseURL!).origin;
  const endpoint = `/api/restaurants/${tenant}/products/${product}/feedback`;
  const post = (path: string, data: unknown) =>
    guest.request.post(path, { headers: { origin }, data });
  const checked = async (result: { error: { message: string } | null }) => {
    if (result.error) throw new Error(result.error.message);
  };
  try {
    const user = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (user.error || !user.data.user)
      throw new Error("Test account creation failed");
    userId = user.data.user.id;
    await checked(
      await service.from("restaurants").insert(
        [
          {
            id: tenant,
            name: "Casa do teste",
            slug,
            accepting_orders: true,
            opening_hours: Array.from({ length: 7 }, (_, day) => ({
              day,
              open: "00:00",
              close: "23:59",
            })),
          },
          { id: other, name: "Outro teste", slug: `${slug}-other` },
        ],
        { defaultToNull: false },
      ),
    );
    await checked(
      await service
        .from("restaurant_members")
        .insert({ restaurant_id: tenant, user_id: userId, role: "owner" }),
    );
    await checked(
      await service
        .from("categories")
        .insert({ id: cat, restaurant_id: tenant, name: "Pratos" }),
    );
    await checked(
      await service.from("products").insert(
        [
          {
            id: product,
            restaurant_id: tenant,
            category_id: cat,
            name: "Burger da casa",
            price_cents: 2990,
            published: true,
            photo_url: `${origin}/images/burger.jpg`,
            description: "Pão macio, carne na brasa e queijo.",
          },
          {
            id: notOrdered,
            restaurant_id: tenant,
            category_id: cat,
            name: "Outro prato",
            price_cents: 1000,
            published: true,
          },
        ],
        { defaultToNull: false },
      ),
    );
    await checked(
      await service
        .from("dining_tables")
        .insert({ id: table, restaurant_id: tenant, number: 1 }),
    );
    const login = await page.request.post("/api/auth", {
      headers: { origin },
      data: { action: "login", email, password },
    });
    expect(login.status()).toBe(200);
    await page.goto(`/gestao/${tenant}`);
    await page
      .getByRole("button", { name: "Configurações", exact: true })
      .click();
    await page.getByLabel("E-mail de privacidade").fill("privacy@example.test");
    await page
      .getByLabel("Link de avaliação no Google")
      .fill("https://g.page/r/test/review");
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.getByRole("status")).toContainText("Alteração salva");
    await customer.goto(`/r/${slug}`);
    await customer
      .getByRole("button", { name: "Curtir Burger da casa", exact: true })
      .click();
    await expect(
      customer.getByRole("button", {
        name: "Descurtir Burger da casa",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(customer.getByRole("dialog")).toHaveCount(0);
    await customer
      .getByRole("button", { name: "Descurtir Burger da casa", exact: true })
      .click();
    await expect(
      customer.getByRole("button", {
        name: "Curtir Burger da casa",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    await customer
      .getByRole("button", { name: "Comentários de Burger da casa" })
      .click();
    const beforeOrder = customer.getByRole("dialog");
    await expect(
      beforeOrder.getByRole("button", { name: "Curtir prato", exact: true }),
    ).toBeVisible();
    await beforeOrder
      .getByLabel("Seu comentário (opcional)")
      .fill("Parece delicioso! Ainda vou pedir.");
    await beforeOrder
      .getByRole("button", { name: "Curtir prato", exact: true })
      .click();
    await expect(beforeOrder.getByRole("status")).toHaveText(
      "Curtida registrada.",
    );
    await expect(
      beforeOrder.getByLabel("Seu comentário (opcional)"),
    ).toHaveValue("Parece delicioso! Ainda vou pedir.");
    expect(
      (await (await guest.request.get(endpoint)).json()).commentCount,
    ).toBe(0);
    await beforeOrder.getByRole("button", { name: "Salvar avaliação" }).click();
    await expect(beforeOrder.getByRole("status")).toHaveText(
      "Avaliação salva no cardápio.",
    );
    const pre = await (await guest.request.get(endpoint)).json();
    expect(pre.likes).toBe(1);
    expect(pre.eligibleOrderId).toBeNull();
    expect(pre.comments[0].verifiedPurchase).toBe(false);
    expect(pre.googleReviewUrl).toBe("");
    await expect(
      beforeOrder.getByText("Visitante", { exact: true }),
    ).toBeVisible();
    await customer.screenshot({
      path: ".impeccable/review/social-before-order.png",
    });
    await customer.reload();
    await customer
      .getByRole("button", { name: "Comentários de Burger da casa" })
      .click();
    await expect(
      beforeOrder.getByRole("button", { name: "Curti este prato" }),
    ).toHaveAttribute("aria-pressed", "true");
    await beforeOrder
      .getByRole("button", { name: "Remover avaliação" })
      .click();
    await expect(beforeOrder.getByRole("status")).toHaveText(
      "Sua avaliação foi removida.",
    );
    await customer.getByRole("button", { name: "Fechar", exact: true }).click();
    const placed = await post(`/api/restaurants/${tenant}/orders`, {
      key: randomUUID(),
      table_id: table,
      name: "Cliente teste",
      phone: "11999990001",
      marketing_consent: false,
      items: [
        { product_id: product, quantity: 1, expected_price: 2990, note: "" },
      ],
    });
    expect(placed.status()).toBe(201);
    const order = (await placed.json()).order;
    const payload = {
      order_id: order.id,
      liked: true,
      comment: "Gostei da comida.",
    };
    expect((await post(endpoint, { liked: false, comment: "" })).status()).toBe(
      200,
    );
    await customer.goto(`/r/${slug}/pedido/${order.id}`);
    await expect(
      customer.getByRole("button", { name: "Avaliar Burger da casa" }),
    ).toHaveCount(0);
    for (const [expected_status, status] of [
      ["recebido", "em_preparo"],
      ["em_preparo", "pronto"],
      ["pronto", "entregue"],
    ]) {
      const result = await page.request.patch(
        `/api/restaurants/${tenant}/orders/${order.id}`,
        { headers: { origin }, data: { expected_status, status } },
      );
      expect(result.status()).toBe(200);
    }
    await expect(
      customer.getByRole("button", { name: "Avaliar Burger da casa" }),
    ).toBeVisible();
    await expect(
      customer.getByRole("link", { name: "Avaliar no Google" }),
    ).toHaveAttribute("href", "https://g.page/r/test/review");
    await customer.screenshot({
      path: ".impeccable/review/feedback-order-mobile.png",
      fullPage: true,
    });
    await customer
      .getByRole("button", { name: "Avaliar Burger da casa" })
      .click();
    const modal = customer.getByRole("dialog");
    await modal
      .getByRole("button", { name: "Curtir prato", exact: true })
      .click();
    await expect(modal.getByRole("status")).toHaveText("Curtida registrada.");
    await modal
      .getByLabel("Seu comentário (opcional)")
      .fill("Ponto da carne ótimo! Voltaria para provar os outros pratos.");
    await modal.getByRole("button", { name: "Salvar avaliação" }).click();
    await expect(modal.getByRole("status")).toHaveText(
      "Avaliação salva no cardápio.",
    );
    await expect(modal.getByText("1 curtida", { exact: true })).toBeVisible();
    await expect(
      modal.getByRole("button", { name: "Curti este prato" }),
    ).toHaveAttribute("aria-pressed", "true");
    await customer.screenshot({
      path: ".impeccable/review/feedback-mobile.png",
      fullPage: false,
    });
    await modal.getByRole("button", { name: "Fechar", exact: true }).click();
    await customer.setViewportSize({ width: 1440, height: 1000 });
    await customer
      .getByRole("button", { name: "Avaliar Burger da casa" })
      .click();
    await expect(
      modal.getByRole("button", { name: "Curti este prato" }),
    ).toBeVisible();
    await customer.screenshot({
      path: ".impeccable/review/feedback-desktop.png",
      fullPage: false,
    });
    await modal
      .getByRole("heading", { name: "Conversa sobre o prato" })
      .scrollIntoViewIfNeeded();
    await customer.screenshot({
      path: ".impeccable/review/feedback-comments-desktop.png",
      fullPage: false,
    });
    await modal.getByRole("button", { name: "Fechar", exact: true }).click();
    await customer.setViewportSize({ width: 714, height: 668 });
    await customer
      .getByRole("button", { name: "Avaliar Burger da casa" })
      .click();
    await expect(
      modal.getByRole("button", { name: "Curti este prato" }),
    ).toBeVisible();
    await customer.screenshot({
      path: ".impeccable/review/feedback-user-714.png",
      fullPage: false,
    });
    await customer.reload();
    await customer
      .getByRole("button", { name: "Avaliar Burger da casa" })
      .click();
    await expect(
      modal.getByRole("button", { name: "Curti este prato" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect((await post(endpoint, payload)).status()).toBe(200);
    expect((await post(endpoint, payload)).status()).toBe(200);
    expect((await (await guest.request.get(endpoint)).json()).likes).toBe(1);
    const publicData = await (await outsider.request.get(endpoint)).json();
    expect(publicData.mine).toBeNull();
    expect(publicData.eligibleOrderId).toBeNull();
    expect(JSON.stringify(publicData)).not.toContain("11999990001");
    expect(
      (
        await outsider.request.post(endpoint, {
          headers: { origin },
          data: payload,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await outsider.request.post(`/api/restaurants/${tenant}/session`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await outsider.request.post(endpoint, {
          headers: { origin },
          data: payload,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await post(
          `/api/restaurants/${other}/products/${product}/feedback`,
          payload,
        )
      ).status(),
    ).toBe(401);
    expect(
      (
        await post(
          `/api/restaurants/${tenant}/products/${notOrdered}/feedback`,
          payload,
        )
      ).status(),
    ).toBe(200);
    await outsider.request.post(endpoint, {
      headers: { origin },
      data: { liked: false, comment: "" },
    });
    await post(`/api/restaurants/${tenant}/products/${notOrdered}/feedback`, {
      liked: false,
      comment: "",
    });
    await page.reload();
    await page.getByRole("button", { name: "Avaliações", exact: true }).click();
    await expect(
      page.getByText("Gostei da comida.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".impeccable/review/feedback-admin-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".impeccable/review/feedback-admin-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Ocultar comentário", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Restaurar comentário" }),
    ).toBeVisible();
    expect(
      (await (await guest.request.get(endpoint)).json()).commentCount,
    ).toBe(0);
    await post(endpoint, payload);
    expect(
      (await (await guest.request.get(endpoint)).json()).commentCount,
    ).toBe(0);
    await page.getByRole("button", { name: "Restaurar comentário" }).click();
    await expect(
      page.getByRole("button", { name: "Ocultar comentário", exact: true }),
    ).toBeVisible();
    expect(
      (await (await guest.request.get(endpoint)).json()).commentCount,
    ).toBe(1);
    await page
      .getByLabel("Permitir curtidas e comentários no cardápio")
      .click();
    await expect(
      page.getByLabel("Permitir curtidas e comentários no cardápio"),
    ).not.toBeChecked();
    expect((await post(endpoint, payload)).status()).toBe(403);
    const disabled = await (await outsider.request.get(endpoint)).json();
    expect(disabled.enabled).toBe(false);
    expect(disabled.comments).toEqual([]);
    const checkMenu = await guest.newPage();
    await checkMenu.goto(`/r/${slug}`);
    await expect(
      checkMenu.getByRole("button", { name: "Comentários de Burger da casa" }),
    ).toHaveCount(0);
    await checkMenu.close();
    await page.screenshot({
      path: ".impeccable/review/social-admin-controls.png",
      fullPage: true,
    });
    await page
      .getByLabel("Permitir curtidas e comentários no cardápio")
      .click();
    await expect(
      page.getByLabel("Permitir curtidas e comentários no cardápio"),
    ).toBeChecked();
    expect((await (await guest.request.get(endpoint)).json()).enabled).toBe(
      true,
    );
    expect(
      (
        await outsider.request.post(`/api/restaurants/${tenant}/catalog`, {
          headers: { origin },
          data: { action: "feedback_settings", enabled: false },
        })
      ).status(),
    ).toBe(401);
    await modal.getByRole("button", { name: "Remover avaliação" }).click();
    await expect(modal.getByRole("status")).toHaveText(
      "Sua avaliação foi removida.",
    );
    await expect(modal.getByText("0 curtidas", { exact: true })).toBeVisible();
    await expect(
      modal.getByRole("link", { name: "Avaliar no Google" }),
    ).toBeVisible();
    await customer.goto(`/r/${slug}`);
    await customer.setViewportSize({ width: 390, height: 844 });
    await customer.screenshot({
      path: ".impeccable/review/feedback-reels-mobile.png",
      fullPage: true,
    });
    await customer
      .getByRole("button", {
        name: "Comentários de Burger da casa",
        exact: true,
      })
      .click();
    await expect(
      customer.getByRole("button", { name: "Curtir prato", exact: true }),
    ).toBeVisible();
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await checked(
      await service
        .from("guest_sessions")
        .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
        .eq("restaurant_id", tenant),
    );
    expect((await post(endpoint, payload)).status()).toBe(401);
  } finally {
    await guest.close();
    await outsider.close();
    await checked(
      await service.from("restaurants").delete().in("id", [tenant, other]),
    );
    if (userId) await checked(await service.auth.admin.deleteUser(userId));
  }
});
