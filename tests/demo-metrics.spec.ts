import { test, expect } from "./fixtures/authenticated-test";

const key = "brasa:demo:video-views:v1";

test.describe("gestão autenticada", () => {
  test.use({ demoAdmin: true });
  test("vídeo enviado gera métricas locais, atualiza entre abas e respeita filtros e pausa", async ({
    page,
    context,
  }) => {
    await page.goto("/demo/gestao/produtos");
    await page
      .getByRole("button", { name: "Editar Smash da casa", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Escolher foto ou vídeo")
      .setInputFiles("tests/fixtures/reel.webm");
    await expect(dialog.getByRole("status")).toContainText("reel.webm");
    await dialog
      .locator("video")
      .evaluate((video: HTMLVideoElement) => video.play());
    await expect
      .poll(() =>
        dialog
          .locator("video")
          .evaluate((video: HTMLVideoElement) => video.currentTime),
      )
      .toBeGreaterThan(1);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), key),
    ).toBeNull();
    await dialog.getByRole("button", { name: "Publicar produto" }).click();
    await page.goto("/demo/gestao/metricas");
    const cards = page.locator(".dashboard-stats");
    await expect(cards).toContainText("0 s");
    const customer = await context.newPage();
    await customer.goto("/r/demo");
    await expect
      .poll(
        () =>
          customer.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key) || "[]").filter(
                (v: { qualified: boolean }) => v.qualified,
              ).length,
            key,
          ),
        { timeout: 15000 },
      )
      .toBe(1);
    await expect(cards).toContainText("100%");
    const row = page.locator("tbody tr").filter({ hasText: "Smash da casa" });
    await expect(row.locator("td").nth(2)).toHaveText("1");
    await customer
      .getByRole("button", { name: "Pausar vídeo", exact: true })
      .click();
    const paused = await customer.evaluate(
      (key) => localStorage.getItem(key),
      key,
    );
    await customer.waitForTimeout(1500);
    expect(
      await customer.evaluate((key) => localStorage.getItem(key), key),
    ).toBe(paused);
    await page
      .getByLabel("Produto das métricas")
      .selectOption({ label: "Brasa duplo" });
    await expect(cards).toContainText("0 s");
    await expect(
      page.getByText("Ainda não há reprodução de vídeo neste filtro.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.getByLabel("Produto das métricas").selectOption("todos");
    await page.reload();
    await expect(row.locator("td").nth(2)).toHaveText("1");
    await page.screenshot({
      path: ".impeccable/review/demo-metrics-working.png",
      fullPage: true,
    });
    await customer.close();
  });
});

test.describe("gestão autenticada", () => {
  test.use({ demoAdmin: true });
  test("fotos não geram visualizações de vídeo", async ({ page }) => {
    await page.goto("/r/demo");
    await page.getByRole("button", { name: "Próximo prato" }).click();
    await page.goto("/demo/gestao/metricas");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), key),
    ).toBeNull();
    await expect(page.locator(".dashboard-stats")).toContainText("0 s");
  });
});
