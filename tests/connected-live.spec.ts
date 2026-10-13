import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
test.skip(
  process.env.RUN_CONNECTED_LIVE !== "1",
  "Explicit opt-in: creates and removes isolated hosted test data.",
);
test.use({ trace: "off", actionTimeout: 15000 });
test("Supabase real: login, catálogo, foto, sincronização de vídeo, pedido e isolamento", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const suffix = randomUUID().slice(0, 8);
  const password = randomUUID() + "Aa1!";
  const email = `integration-${suffix}@example.test`;
  const userIds: string[] = [];
  const tenantIds: string[] = [];
  let photoPath: string | undefined;
  const clients: SupabaseClient[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const loginEmail = i ? `integration-other-${suffix}@example.test` : email;
      const { data, error } = await service.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new Error(
          "Could not create isolated test account: " + error?.message,
        );
      userIds.push(data.user.id);
      const client = createClient(url, publicKey, {
        auth: { persistSession: false },
      });
      const session = await client.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (session.error) throw session.error;
      clients.push(client);
    }
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no restaurante" }).click();
    await expect(
      page.getByRole("heading", { name: "Vamos abrir a casa." }),
    ).toBeVisible();
    await page.getByLabel("Nome do restaurante").fill("Restaurante de teste");
    await page.getByLabel("Endereço do cardápio").fill(`integration-${suffix}`);
    const onboardResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/onboarding") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Criar meu restaurante" }).click();
    const onboard = await onboardResponse;
    expect(onboard.status()).toBe(200);
    const tenant = (await onboard.json()).id as string;
    tenantIds.push(tenant);
    await expect(page).toHaveURL(/\/gestao\/[a-f0-9-]+$/, { timeout: 30000 });
    const other = await clients[1].rpc("onboard_restaurant", {
      p_name: "Outro restaurante de teste",
      p_slug: `other-${suffix}`,
    });
    if (other.error) throw other.error;
    tenantIds.push(other.data);
    await expect(
      page.getByRole("heading", { name: "Visão geral", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Configurações", exact: true })
      .click();
    await page.getByLabel("E-mail de privacidade").fill("privacy@example.test");
    await page.getByLabel("Número de mesas").fill("3");
    for (let day = 0; day < 7; day++) {
      await page.locator(`input[name="day-${day}"]`).check();
      await page.getByLabel(`Abertura ${day}`, { exact: true }).fill("00:00");
      await page.getByLabel(`Fechamento ${day}`, { exact: true }).fill("23:59");
    }
    await page.getByLabel("Habilitar pedidos nos horários acima").check();
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.getByRole("status")).toContainText("Alteração salva");
    await page.getByRole("button", { name: "Produtos", exact: true }).click();
    await page.getByRole("button", { name: "Novo produto" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nome", { exact: true }).fill("Prato de teste");
    await modal.getByLabel("Preço (R$)").fill("25.50");
    await modal
      .getByLabel("Descrição", { exact: true })
      .fill("Produto temporário de validação.");
    await modal
      .getByLabel("Ingredientes", { exact: true })
      .fill("Pão, carne e queijo.");
    await modal
      .getByLabel("Escolher foto ou vídeo")
      .setInputFiles("public/images/burger.jpg");
    await expect(modal.locator('img[alt="Foto escolhida"]')).toBeVisible();
    await modal.getByLabel("Publicar no cardápio").check();
    await modal
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Prato de teste" }),
    ).toBeVisible();
    const { data: products } = await service
      .from("products")
      .select("id,photo_url")
      .eq("restaurant_id", tenant);
    const product = products![0];
    photoPath = product.photo_url?.split("/restaurant-media/")[1];
    await page.screenshot({
      path: ".impeccable/review/connected-admin-desktop.png",
      fullPage: true,
    });
    const customer = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const guest = await customer.newPage();
    await guest.goto(`/r/integration-${suffix}?mesa=2`);
    await expect(guest.locator(".demo-banner")).toHaveCount(0);
    await expect(
      guest.getByRole("heading", { name: "Prato de teste" }),
    ).toBeVisible();
    await guest
      .getByRole("button", {
        name: "Ver detalhes de Prato de teste",
        exact: true,
      })
      .click();
    await guest
      .getByRole("dialog")
      .getByRole("button", { name: /^Adicionar •/ })
      .click();
    await expect
      .poll(async () => {
        const { count, error } = await service
          .from("cart_add_events")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", tenant);
        if (error) throw error;
        return count;
      })
      .toBe(1);
    const associations = await page.request.get(
      `/api/restaurants/${tenant}/associations?days=30`,
    );
    expect(associations.status()).toBe(200);
    expect(await associations.json()).toEqual([]);
    // Only Cloudflare's upload/processing responses are simulated. The owner
    // login, database, anonymous catalog refresh and playback use the real app.
    const assetId = randomUUID();
    const playbackUrl = new URL("/__test-reel.webm", page.url()).href;
    await guest.route("**/__test-reel.webm", (route) =>
      route.fulfill({
        path: "tests/fixtures/reel.webm",
        contentType: "video/webm",
      }),
    );
    await page.route("**/__test-upload", (route) =>
      route.fulfill({ status: 200 }),
    );
    let statusChecks = 0;
    await page.route(`**/api/restaurants/${tenant}/media`, async (route) => {
      if (route.request().method() === "POST") {
        const { error } = await service.from("product_media").insert({
          id: assetId,
          restaurant_id: tenant,
          product_id: product.id,
          provider_asset_id: randomUUID().replaceAll("-", ""),
          kind: "video",
          state: "processing",
        });
        if (error) throw error;
        await route.fulfill({
          json: {
            assetId,
            uploadURL: new URL("/__test-upload", page.url()).href,
          },
        });
      } else if (route.request().method() === "PATCH") {
        statusChecks++;
        const state = statusChecks === 1 ? "processing" : "ready";
        if (state === "ready") {
          const { error } = await service
            .from("product_media")
            .update({
              state,
              playback_url: playbackUrl,
              duration_seconds: 2,
            })
            .eq("id", assetId)
            .eq("restaurant_id", tenant);
          if (error) throw error;
        }
        await route.fulfill({ json: { state } });
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Editar produto", exact: true })
      .click();
    await modal
      .getByLabel("Escolher foto ou vídeo")
      .setInputFiles("tests/fixtures/reel.webm");
    await expect(modal.getByRole("status")).toContainText("reel.webm");
    await modal
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await expect(
      modal.getByText("Processando vídeo", { exact: true }),
    ).toBeVisible();
    await expect(
      modal.getByText("Vídeo pronto para o cardápio", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    expect(statusChecks).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("Escape");
    // No navigation or reload: the already-open customer menu must update.
    const reelVideo = guest.locator(".immersive-reel").first().locator("video");
    await expect(reelVideo).toBeVisible({ timeout: 35000 });
    await expect
      .poll(() =>
        reelVideo.evaluate(
          (video: HTMLVideoElement) => !video.paused && video.currentTime > 0,
        ),
      )
      .toBe(true);
    await expect(
      guest.getByRole("button", { name: /Abrir sacola com 1/ }),
    ).toBeVisible();
    await guest.getByRole("button", { name: /Abrir sacola com/ }).click();
    await guest.getByRole("button", { name: "Revisar pedido" }).click();
    await guest
      .getByLabel("Como podemos chamar você?")
      .fill("Cliente de teste");
    await guest.getByLabel("WhatsApp com DDD").fill("11999990001");
    await guest
      .getByRole("button", { name: "Enviar pedido", exact: true })
      .click();
    await expect(guest).toHaveURL(/\/pedido\/[a-f0-9-]+$/);
    await expect(
      guest.getByText("Recebido", { exact: true }).first(),
    ).toBeVisible();
    await guest.screenshot({
      path: ".impeccable/review/connected-order-mobile.png",
      fullPage: true,
    });
    const orderId = guest.url().split("/").at(-1)!;
    const stranger = await browser.newContext();
    const denied = await stranger.request.get(
      `/api/restaurants/${tenant}/orders/${orderId}`,
    );
    expect(denied.status()).toBe(401);
    await stranger.close();
    await page.getByRole("button", { name: "Pedidos", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Iniciar preparo" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Iniciar preparo" }).click();
    await page
      .getByLabel("Estimativa de preparo em minutos (opcional)")
      .fill("12");
    await page.getByRole("button", { name: "Confirmar atualização" }).click();
    await expect(guest.locator(".status-pill")).toHaveText("Em preparo", {
      timeout: 15000,
    });
    const privateOrders = await clients[1]
      .from("orders")
      .select("id")
      .eq("restaurant_id", tenant);
    expect(privateOrders.error).toBeNull();
    expect(privateOrders.data).toEqual([]);
    const privateContacts = await clients[1]
      .from("contacts")
      .select("id")
      .eq("restaurant_id", tenant);
    expect(privateContacts.data).toEqual([]);
    const intrusion = await clients[1]
      .from("categories")
      .insert({ restaurant_id: tenant, name: "Intrusão" });
    expect(intrusion.error?.code).toBe("42501");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".impeccable/review/connected-admin-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await customer.close();
  } finally {
    if (photoPath)
      await service.storage.from("restaurant-media").remove([photoPath]);
    const dangling = await service
      .from("restaurants")
      .select("id")
      .in("slug", [`integration-${suffix}`, `other-${suffix}`]);
    for (const row of dangling.data || [])
      if (!tenantIds.includes(row.id)) tenantIds.push(row.id);
    for (const id of tenantIds) {
      const { error } = await service.from("restaurants").delete().eq("id", id);
      if (error) console.error("Test tenant cleanup failed", id, error.code);
    }
    for (const id of userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.error("Test account cleanup failed", id, error.code);
    }
  }
});
