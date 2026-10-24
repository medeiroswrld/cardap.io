import { test, expect } from "./fixtures/authenticated-test";

test("demo stays table-only: no pickup/delivery choice in checkout", async ({ page }) => {
  await page.goto("/r/demo");
  await page.getByRole("button", { name: "Ver detalhes de Smash da casa", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Adicionar •/ }).click();
  await page.getByRole("button", { name: /Abrir sacola com/ }).click();
  await page.getByRole("button", { name: "Revisar pedido", exact: true }).click();
  await expect(page.getByLabel("Mesa")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Entrega" })).toHaveCount(0);
});
