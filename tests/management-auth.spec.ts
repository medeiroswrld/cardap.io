import { test, expect } from "@playwright/test";

for (const path of [
  "/",
  "/gestao",
  "/gestao/10000000-0000-4000-8000-000000000001",
  "/demo/gestao",
  "/demo/gestao/produtos",
  "/demo/gestao/pedidos",
  "/demo/gestao/metricas",
]) {
  test(`visitante precisa de login em ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Entrar na gestão" }),
    ).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute(
      "type",
      "password",
    );
    await expect(page.locator("#management-navigation")).toHaveCount(0);
    await expect(page.locator('a[href^="/demo/gestao"]')).toHaveCount(0);
  });
}

test("cardápio público permanece aberto e separado da gestão", async ({
  page,
}) => {
  await page.goto("/r/demo");
  await expect(page.locator(".immersive-feed")).toBeVisible();
  await expect(page.locator('a[href*="gestao"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Visualizar lista" }).click();
  await expect(page.locator(".product-list")).toBeVisible();
  await expect(page.locator('a[href*="gestao"]')).toHaveCount(0);
});

test("API de gestão recusa leitura e alteração sem autenticação", async ({
  request,
}) => {
  const id = "10000000-0000-4000-8000-000000000001";
  const result = await request.get(`/api/restaurants/${id}/workspace`);
  expect(result.status()).toBe(401);
  const mutation = await request.post(`/api/restaurants/${id}/catalog`, {
    headers: { Origin: "http://localhost:3000" },
    data: { action: "archive_product", id },
  });
  expect(mutation.status()).toBe(401);
});

test("login recusado não abre o painel", async ({ page }) => {
  await page.route("**/api/auth", (route) =>
    route.fulfill({
      status: 400,
      json: { error: "E-mail ou senha incorretos." },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.com");
  await page.getByLabel("Senha", { exact: true }).fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar no restaurante" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "E-mail ou senha incorretos.",
  );
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({
    path: ".impeccable/review/management-login.png",
    fullPage: true,
  });
});
