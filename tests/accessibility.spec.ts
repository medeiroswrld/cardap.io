import { test, expect } from "./fixtures/authenticated-test";
import fs from "node:fs";
test.describe("gestão autenticada", () => {
  test.use({ demoAdmin: true });
  test("menu mobile fica inativo quando fechado e contém foco quando aberto", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/demo/gestao");
    const panel = page.locator("#management-navigation");
    await expect
      .poll(() => panel.evaluate((el) => (el as HTMLElement).inert))
      .toBe(true);
    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.click();
    await expect(
      page.getByRole("dialog", { name: "Menu de gestão" }),
    ).toBeVisible();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest("#management-navigation"),
        ),
      ).toBe(true);
    }
    fs.mkdirSync(".impeccable/review", { recursive: true });
    await page.screenshot({
      path: ".impeccable/review/admin-drawer-mobile.png",
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect
      .poll(() => panel.evaluate((el) => (el as HTMLElement).inert))
      .toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(() => panel.evaluate((el) => (el as HTMLElement).inert))
      .toBe(false);
    await expect(
      page.getByRole("link", { name: "Produtos", exact: true }),
    ).toBeVisible();
  });
});

test("sacola e controles mobile têm áreas de toque de 44 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/r/demo");
  for (const label of [
    "Buscar no cardápio",
    "Visualizar lista",
    "Ingredientes de Smash da casa",
  ]) {
    const box = await page
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page
    .getByRole("button", { name: "Ver detalhes de Smash da casa", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Adicionar •/ })
    .click();
  await page.getByRole("button", { name: /Abrir sacola com/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (const label of [
    "Diminuir Smash da casa",
    "Aumentar Smash da casa",
    "Remover Smash da casa",
  ]) {
    const box = await dialog
      .getByRole("button", { name: label, exact: true })
      .boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: ".impeccable/review/bag-mobile.png" });
});
