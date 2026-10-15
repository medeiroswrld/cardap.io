import { test, expect as baseExpect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
test.skip(
  process.env.RUN_CONNECTED_LIVE !== "1",
  "Explicit opt-in: creates and removes isolated hosted test data.",
);
test.use({ trace: "off", actionTimeout: 30000, screenshot: "only-on-failure" });
const expect = baseExpect.configure({ timeout: 30000 });
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
    await expect
      .poll(async () => {
        const { data, error } = await service
          .from("photo_view_sessions")
          .select("qualified,visible_seconds")
          .eq("restaurant_id", tenant);
        if (error) throw error;
        return data?.some((v) => v.qualified && Number(v.visible_seconds) >= 1);
      })
      .toBe(true);
    const photoInput = {
      id: randomUUID(),
      product_id: product.id,
      photo_url: product.photo_url,
      sequence: 1,
      visible_seconds: 3,
    };
    const ownerPhoto = await page.request.post(
      `/api/restaurants/${tenant}/photo-views`,
      {
        headers: { origin: new URL(page.url()).origin },
        data: photoInput,
      },
    );
    expect(await ownerPhoto.json()).toEqual({ ignored: true });
    const wrongPhoto = await guest.request.post(
      `/api/restaurants/${tenant}/photo-views`,
      {
        headers: { origin: new URL(page.url()).origin },
        data: { ...photoInput, photo_url: "https://example.test/forged.jpg" },
      },
    );
    expect(wrongPhoto.status()).toBe(400);
    await guest
      .getByRole("button", {
        name: "Ver detalhes de Prato de teste",
        exact: true,
      })
      .click();
    const cartEventResponse = guest.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/restaurants/${tenant}/cart-events`),
      { timeout: 60000 },
    );
    await guest
      .getByRole("dialog")
      .getByRole("button", { name: /^Adicionar •/ })
      .click();
    expect((await cartEventResponse).status()).toBe(200);
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
    const mediaEndpoint = `/api/restaurants/${tenant}/media`;
    const origin = new URL(page.url()).origin;
    const uploadInput = {
      productId: product.id,
      contentType: "video/webm",
      size: 1000,
      duration: 2,
    };
    const anonymousUpload = await guest.request.post(mediaEndpoint, {
      headers: { origin },
      data: uploadInput,
    });
    expect(anonymousUpload.status()).toBe(401);
    const foreignUpload = await page.request.post(
      `/api/restaurants/${tenantIds[1]}/media`,
      { headers: { origin }, data: uploadInput },
    );
    expect(foreignUpload.status()).toBe(403);
    for (const invalid of [
      { size: 20971521 },
      { duration: 46 },
      { contentType: "text/html" },
    ]) {
      const rejected = await page.request.post(mediaEndpoint, {
        headers: { origin },
        data: { ...uploadInput, ...invalid },
      });
      expect(rejected.status()).toBe(400);
    }
    const deniedPath = `${tenant}/${product.id}/unauthorized.webm`;
    const directUpload = await clients[1].storage
      .from("restaurant-videos")
      .upload(deniedPath, new Uint8Array([0]), { contentType: "video/webm" });
    if (!directUpload.error)
      await service.storage.from("restaurant-videos").remove([deniedPath]);
    expect(directUpload.error).toBeTruthy();
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
      modal.getByText("Vídeo pronto para o cardápio", { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const { data: uploadedMedia } = await service
      .from("product_media")
      .select("id,provider_asset_id,playback_url,state")
      .eq("product_id", product.id)
      .single();
    expect(uploadedMedia?.state).toBe("ready");
    expect(uploadedMedia?.provider_asset_id).toMatch(/^storage:/);
    const videoResponse = await guest.request.get(uploadedMedia!.playback_url!);
    expect(videoResponse.ok()).toBe(true);
    expect(videoResponse.headers()["content-type"]).toContain("video/webm");
    const foreignConfirm = await page.request.patch(
      `/api/restaurants/${tenantIds[1]}/media`,
      { headers: { origin }, data: { assetId: uploadedMedia!.id } },
    );
    expect(foreignConfirm.status()).toBe(403);
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
    const photoAssociations = await page.request.get(
      `/api/restaurants/${tenant}/photo-associations?days=30`,
    );
    expect(photoAssociations.status()).toBe(200);
    expect(await photoAssociations.json()).toEqual([
      expect.objectContaining({
        product_id: product.id,
        cart_sessions: 1,
        order_sessions: 1,
        viewer_sessions: 1,
      }),
    ]);
    const foreignPhotos = await clients[1]
      .from("photo_view_sessions")
      .select("id")
      .eq("restaurant_id", tenant);
    expect(foreignPhotos.error).toBeNull();
    expect(foreignPhotos.data).toEqual([]);
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
    await page.getByRole("button", { name: "Métricas", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Fotos", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Foto atual", { exact: true })).toBeVisible();
    await page.screenshot({
      path: ".impeccable/review/photo-metrics-mobile.png",
      fullPage: true,
    });
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
    if (tenantIds.length) {
      const { data: testMedia } = await service
        .from("product_media")
        .select("provider_asset_id")
        .in("restaurant_id", tenantIds);
      const paths = (testMedia || [])
        .map((m) => m.provider_asset_id as string)
        .filter((id) => id?.startsWith("storage:"))
        .map((id) => id.slice("storage:".length));
      if (paths.length) {
        const { error } = await service.storage
          .from("restaurant-videos")
          .remove(paths);
        if (error) throw new Error("Test video cleanup failed");
      }
    }
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
