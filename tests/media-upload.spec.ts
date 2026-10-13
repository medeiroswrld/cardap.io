import { test, expect } from "./fixtures/authenticated-test";

test.describe("gestão autenticada", () => {
  test.use({ demoAdmin: true });
  test("seleciona vídeo no cadastro, publica e reproduz após recarregar", async ({
    page,
  }) => {
    await page.goto("/demo/gestao/produtos");
    await page
      .getByRole("button", { name: "Editar Smash da casa", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('input[type="url"]')).toHaveCount(0);
    await dialog
      .getByLabel("Escolher foto ou vídeo")
      .setInputFiles("tests/fixtures/reel.webm");
    await expect(dialog.getByRole("status")).toContainText("reel.webm");
    await expect
      .poll(() =>
        dialog.locator("video").evaluate((el: HTMLVideoElement) => el.duration),
      )
      .toBe(2);
    await page.screenshot({
      path: ".impeccable/review/video-picker-desktop.png",
    });
    await dialog.getByRole("button", { name: "Publicar produto" }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto("/r/demo");
    const video = page.locator(".immersive-reel").first().locator("video");
    await expect
      .poll(() =>
        video.evaluate(
          (el: HTMLVideoElement) => !el.paused && el.currentTime > 0,
        ),
      )
      .toBe(true);
    await page.reload();
    await expect
      .poll(() =>
        video.evaluate(
          (el: HTMLVideoElement) => !el.paused && el.currentTime > 0,
        ),
      )
      .toBe(true);
    await page.goto("/demo/gestao/produtos");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Editar Smash da casa", exact: true })
      .click();
    await expect
      .poll(() =>
        dialog.locator("video").evaluate((el: HTMLVideoElement) => el.duration),
      )
      .toBe(2);
    await dialog.locator(".media-picker").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".impeccable/review/video-picker-mobile.png",
    });
  });
});

test.describe("gestão autenticada", () => {
  test.use({ demoAdmin: true });
  test("seletor mantém foto e rejeita arquivo inválido sem alterar o produto", async ({
    page,
  }) => {
    await page.goto("/demo/gestao/produtos");
    await page
      .getByRole("button", { name: "Editar Smash da casa", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const picker = dialog.getByLabel("Escolher foto ou vídeo");
    await picker.setInputFiles({
      name: "arquivo.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
    await expect(dialog.getByRole("alert")).toContainText("Escolha JPG");
    await picker.setInputFiles({
      name: "video.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("invalid video"),
    });
    await expect(dialog.getByRole("alert")).toContainText(
      "Não foi possível abrir",
    );
    await picker.setInputFiles("public/images/burger.jpg");
    await expect(dialog.getByRole("status")).toContainText("burger.jpg");
    await dialog.getByRole("button", { name: "Publicar produto" }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await page
      .getByRole("button", { name: "Editar Smash da casa", exact: true })
      .click();
    await expect(dialog.getByAltText("Foto escolhida")).toHaveAttribute(
      "src",
      /^data:image\/jpeg/,
    );
    await picker.setInputFiles("tests/fixtures/reel.webm");
    await expect(dialog.locator("video")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Editar Smash da casa", exact: true })
      .click();
    await expect(dialog.locator("video")).toHaveCount(0);
  });
});
