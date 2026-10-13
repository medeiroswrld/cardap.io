import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

async function addToBag(page: Page) {
  await page
    .getByRole("button", { name: "Ver detalhes de Smash da casa", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Adicionar •/ })
    .click();
  await page.getByRole("button", { name: /Abrir sacola com/ }).click();
}

test("cardápio: busca, categorias, lista e sacola persistente", async ({
  page,
}) => {
  await page.goto("/r/demo");
  await expect(
    page.getByRole("region", { name: "Cardápio em reels" }),
  ).toBeVisible();
  await addToBag(page);
  await expect(page.locator(".bag-item")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: /Abrir sacola com/ }).click();
  await expect(page.locator(".bag-item")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page
    .locator(".immersive-categories")
    .getByRole("button", { name: "Bebidas" })
    .click();
  await expect(page.locator(".immersive-reel").first()).toContainText(
    "Limonada da casa",
  );
  await page.getByRole("button", { name: "Visualizar lista" }).click();
  await expect(page.locator(".product-list")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Buscar no cardápio" })
    .fill("inexistente");
  await expect(page.getByText("Nada por aqui ainda")).toBeVisible();
  await page.getByRole("button", { name: "Ver todo o cardápio" }).click();
  await expect(page.locator(".food-card")).toHaveCount(9);
});

test("pedido: checkout, uma gravação, acompanhamento e atualização entre abas", async ({
  page,
  context,
}) => {
  await page.goto("/r/demo?mesa=8");
  await addToBag(page);
  await page
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Como podemos chamar você?" })
    .fill("Cliente de teste");
  await page
    .getByRole("textbox", { name: "WhatsApp com DDD" })
    .fill("11999990000");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page
    .getByRole("button", { name: "Enviar pedido de demonstração" })
    .click();
  await expect(page).toHaveURL(/\/pedido\//);
  await expect(
    page.getByRole("heading", { name: "Pedido de demonstração salvo!" }),
  ).toBeVisible();
  await expect(page.locator(".tracking-subtitle")).toContainText("Mesa 08");
  const orderUrl = page.url();
  const admin = await context.newPage();
  await admin.goto("/demo/gestao/pedidos");
  const card = admin
    .locator(".order-card")
    .filter({ hasText: "Cliente de teste" });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Iniciar preparo" }).click();
  await expect(
    page.locator(".tracking-card").first().getByRole("heading"),
  ).toHaveText("Em preparo");
  await card.getByRole("button", { name: "Marcar como pronto" }).click();
  await expect(
    page.locator(".tracking-card").first().getByRole("heading"),
  ).toHaveText("Pronto");
  await card.getByRole("button", { name: "Confirmar entrega" }).click();
  await expect(
    page.getByRole("heading", { name: "Bom apetite!" }),
  ).toBeVisible();
  await admin.goto("/demo/gestao/contatos");
  await expect(
    admin.getByText("Não autorizado", { exact: true }),
  ).toBeVisible();
  await page.goto("/r/demo");
  await expect(page.locator(".bag-item")).toHaveCount(0);
  await page.goto(orderUrl);
  await expect(
    page.getByRole("heading", { name: "Bom apetite!" }),
  ).toBeVisible();
});

test("uma sessão diferente não acessa o pedido por URL", async ({
  page,
  browser,
}) => {
  await page.goto("/r/demo");
  await addToBag(page);
  await page
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Como podemos chamar você?" })
    .fill("Teste isolado");
  await page
    .getByRole("textbox", { name: "WhatsApp com DDD" })
    .fill("11988880000");
  await page
    .getByRole("button", { name: "Enviar pedido de demonstração" })
    .click();
  await expect(page).toHaveURL(/\/pedido\//);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(page.url());
  await expect(
    otherPage.getByRole("heading", {
      name: "Pedido não encontrado nesta sessão",
    }),
  ).toBeVisible();
  await other.close();
});

test("produto editado atualiza o catálogo e preço antigo exige nova confirmação", async ({
  page,
  context,
}) => {
  await page.goto("/r/demo");
  await addToBag(page);
  const admin = await context.newPage();
  await admin.goto("/demo/gestao/produtos");
  await admin
    .getByRole("button", { name: "Editar Smash da casa", exact: true })
    .click();
  await admin
    .getByRole("textbox", { name: "Preço (R$)", exact: true })
    .fill("35.90");
  await admin.getByRole("button", { name: "Publicar produto" }).click();
  await expect(
    page.locator(".immersive-reel").first().locator(".immersive-price"),
  ).toContainText("35,90");
  await page
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Como podemos chamar você?" })
    .fill("Teste de preço");
  await page
    .getByRole("textbox", { name: "WhatsApp com DDD" })
    .fill("11999990000");
  await page
    .getByRole("button", { name: "Enviar pedido de demonstração" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Um preço mudou");
  await expect(page).not.toHaveURL(/\/pedido\//);
});

test("categorias, disponibilidade e perfil operacional", async ({ page }) => {
  await page.goto("/demo/gestao/categorias");
  await page.getByRole("button", { name: "Nova categoria" }).click();
  await page
    .getByRole("textbox", { name: "Nome da categoria" })
    .fill("Especiais");
  await page.getByRole("button", { name: "Salvar categoria" }).click();
  await expect(
    page.locator(".category-row").filter({ hasText: "Especiais" }),
  ).toHaveCount(1);
  await page.goto("/demo/gestao/produtos");
  await page
    .getByRole("switch", {
      name: "Disponibilidade de Smash da casa",
      exact: true,
    })
    .click();
  await page.goto("/r/demo");
  await page
    .getByRole("button", { name: "Ver detalhes de Smash da casa", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Indisponível", exact: true }),
  ).toBeDisabled();
  await page.goto("/demo/gestao/contatos");
  await page.getByLabel("Simular perfil").selectOption("operacao");
  await expect(
    page.getByRole("heading", { name: "Acesso reservado ao dono" }),
  ).toBeVisible();
});

test("mobile: detalhes, observação, checkout e navegação por teclado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/r/demo");
  await page
    .getByRole("button", { name: "Ver detalhes de Smash da casa" })
    .click();
  await page
    .getByRole("textbox", { name: "Alguma observação?" })
    .fill("Sem molho");
  await page
    .getByRole("button", { name: "Aumentar quantidade", exact: true })
    .click();
  await page.getByRole("button", { name: "Adicionar • R$ 65,80" }).click();
  await page.getByRole("button", { name: /Abrir sacola com/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Sem molho");
  await expect(page.getByRole("dialog")).toContainText("65,80");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("rotas reais nunca viram demonstração e exigem sessão", async ({
  page,
  request,
}) => {
  await page.goto("/r/restaurante-inexistente");
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Adicionar Smash da casa", exact: true }),
  ).toHaveCount(0);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Entrar no restaurante" }),
  ).toBeVisible();
  await page.goto("/gestao");
  await expect(page).toHaveURL(/\/login$/);
  const privateResponse = await request.get(
    "/api/restaurants/00000000-0000-4000-8000-000000000001/workspace",
  );
  expect([401, 503]).toContain(privateResponse.status());
  const response = await request.post(
    "/api/restaurants/00000000-0000-4000-8000-000000000001/orders",
    { data: {} },
  );
  expect(response.status()).not.toBe(200);
});

test("capturas desktop e mobile", async ({ page }) => {
  fs.mkdirSync(".impeccable/review", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/r/demo");
  await expect(
    page.getByRole("button", {
      name: "Ver detalhes de Smash da casa",
      exact: true,
    }),
  ).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: ".impeccable/review/desktop.png",
    fullPage: true,
  });
  await page.goto("/demo/gestao");
  await expect(
    page.getByRole("heading", { name: "Tudo pronto para um bom serviço." }),
  ).toBeVisible();
  await page.screenshot({
    path: ".impeccable/review/admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/r/demo");
  await expect(
    page.getByRole("button", {
      name: "Ver detalhes de Smash da casa",
      exact: true,
    }),
  ).toBeEnabled();
  await page.screenshot({
    path: ".impeccable/review/mobile.png",
    fullPage: true,
  });
  await page.goto("/demo/gestao");
  await page.screenshot({
    path: ".impeccable/review/admin-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("mobile imersivo abre compra e informações em painéis", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/r/demo");
  const media = (await page.locator(".immersive-reel").first().boundingBox())!;
  expect(media.height).toBe(844);
  await expect(page.locator(".food-bottom")).toHaveCount(0);
  await addToBag(page);
  await expect(page.getByRole("dialog")).toContainText("32,90");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sobre a casa" }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Meus pedidos" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Receber novidades" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Um lugar para as boas novidades",
  );
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("[role=dialog]"),
    ),
  ).toBe(true);
});

test("consentimento pode ser revogado e cancelamento exige motivo", async ({
  page,
}) => {
  await page.goto("/r/demo");
  await addToBag(page);
  await page
    .getByRole("button", { name: "Revisar pedido", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Como podemos chamar você?" })
    .fill("Teste consentimento");
  await page
    .getByRole("textbox", { name: "WhatsApp com DDD" })
    .fill("11977770000");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Enviar pedido de demonstração" })
    .click();
  await expect(page).toHaveURL(/\/pedido\//);
  const url = page.url();
  await page.goto("/demo/gestao/contatos");
  await page
    .getByRole("button", { name: "Detalhes de Teste consentimento" })
    .click();
  await page
    .getByRole("button", { name: "Revogar autorização de marketing" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Autorização revogada");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Revogado", { exact: true })).toBeVisible();
  await page.goto("/demo/gestao/pedidos");
  await page
    .locator(".order-card")
    .filter({ hasText: "Teste consentimento" })
    .locator(".order-card-title")
    .click();
  await page
    .getByRole("button", { name: "Cancelar pedido", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Motivo do cancelamento" })
    .fill("Cancelamento solicitado no teste");
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Pedido cancelado" }),
  ).toBeVisible();
  await expect(
    page.getByText("Cancelamento solicitado no teste"),
  ).toBeVisible();
});

test("mesas geram QR e link com identificação correta", async ({ page }) => {
  await page.goto("/demo/gestao/configuracoes");
  await page.getByRole("button", { name: "Mesas e QR codes" }).click();
  await page.getByLabel("Gerar link para").selectOption("7");
  await expect(page.getByLabel("Link da mesa")).toHaveValue(
    /\/r\/demo\?mesa=7$/,
  );
  await expect(
    page.getByRole("img", { name: "QR code do cardápio para a mesa 7" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar QR code" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("brasa-mesa-7.png");
});
