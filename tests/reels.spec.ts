import fs from "node:fs";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

async function swipe(
  page: Page,
  context: BrowserContext,
  axis: "vertical" | "horizontal",
  reverse = false,
) {
  const box = (await page.locator(".immersive-feed").boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const x =
    box.x + box.width * (axis === "horizontal" ? (reverse ? 0.2 : 0.8) : 0.45);
  const y =
    box.y + box.height * (axis === "vertical" ? (reverse ? 0.25 : 0.7) : 0.4);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 12; step++) {
    const distance = ((reverse ? 1 : -1) * step) / 12;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: x + (axis === "horizontal" ? box.width * 0.6 * distance : 0),
          y: y + (axis === "vertical" ? box.height * 0.6 * distance : 0),
        },
      ],
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 320, height: 568 },
]) {
  test(`reels imersivo: mídia integral, gestos e compra em ${viewport.width}x${viewport.height}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/r/demo");
    await expect(
      page.getByRole("button", {
        name: "Ver detalhes de Smash da casa",
        exact: true,
      }),
    ).toBeEnabled();
    const feed = page.getByRole("region", { name: "Cardápio em reels" });
    const first = feed.locator(".immersive-reel").first();
    expect((await first.boundingBox())!.height).toBe(viewport.height);
    expect((await first.locator(".product-media").boundingBox())!.height).toBe(
      viewport.height,
    );
    await expect(
      page.locator(
        ".food-bottom,.bag-aside,.floating-bag,.customer-header,.search-field",
      ),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Adicionar/ })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (viewport.width < 700) await swipe(page, context, "vertical");
    else {
      await feed.hover();
      await page.mouse.wheel(0, viewport.height * 0.7);
    }
    await expect
      .poll(() =>
        feed.evaluate((el) => Math.abs(el.scrollTop - el.clientHeight)),
      )
      .toBeLessThan(2);
    await page
      .getByRole("button", { name: "Ver detalhes de Brasa duplo", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Adicionar •/ })
      .click();
    await expect(feed.locator(".immersive-reel").nth(1)).toHaveAttribute(
      "aria-label",
      /Brasa duplo/,
    );
    await expect
      .poll(() =>
        feed.evaluate((el) => Math.abs(el.scrollTop - el.clientHeight)),
      )
      .toBeLessThan(2);
    await page
      .getByRole("button", { name: "Abrir sacola com 1 itens" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("39,90");
    await page.keyboard.press("Escape");
    await expect(page.locator(".toast")).toBeHidden();
    await page.screenshot({
      path: `.impeccable/review/immersive-${viewport.width}.png`,
    });
    if (viewport.width < 700) {
      await swipe(page, context, "horizontal");
      await expect(
        page.getByRole("button", { name: "Lanches", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => feed.evaluate((el) => el.scrollTop)).toBe(0);
      await swipe(page, context, "horizontal", true);
      await expect(
        page.getByRole("button", { name: "Para você", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await page.getByRole("button", { name: "Bebidas", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Limonada da casa", exact: true }),
    ).toBeVisible();
    await feed.focus();
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() =>
        feed.evaluate((el) => Math.abs(el.scrollTop - el.clientHeight)),
      )
      .toBeLessThan(2);
    await page
      .getByRole("button", { name: "Buscar no cardápio", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Buscar no cardápio" })
      .fill("inexistente");
    await page
      .getByRole("button", { name: "Ver resultados", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Nada por aqui ainda" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ver todo o cardápio" }).click();
    await page.getByRole("button", { name: "Visualizar lista" }).click();
    await expect(page.locator(".product-list")).toBeVisible();
  });
}

test("vídeo do reel ativo toca mudo, pausa fora da tela e ao abrir painel", async ({
  page,
}) => {
  await page.goto("/r/demo");
  await expect(
    page.getByRole("button", { name: "Visualizar lista" }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(localStorage.getItem("brasa:demo:v1"))),
    )
    .toBe(true);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("brasa:demo:v1")!);
    state.products[0].video = "/test-reel.webm";
    state.products[1].video = "/test-reel.webm";
    localStorage.setItem("brasa:demo:v1", JSON.stringify(state));
  });
  await page.route("**/test-reel.webm", (route) =>
    route.fulfill({
      status: 200,
      contentType: "video/webm",
      body: fs.readFileSync("tests/fixtures/reel.webm"),
    }),
  );
  await page.reload();
  const videos = page.locator(".immersive-reel video");
  await expect
    .poll(() =>
      videos
        .nth(0)
        .evaluate(
          (el: HTMLVideoElement) =>
            !el.paused && el.muted && el.currentTime > 0,
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Próximo prato" }).click();
  await expect
    .poll(() => videos.nth(1).evaluate((el: HTMLVideoElement) => !el.paused))
    .toBe(true);
  await expect(videos.nth(0)).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "Sobre a casa", exact: true }).click();
  await expect(videos.nth(1)).toHaveJSProperty("paused", true);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => videos.nth(1).evaluate((el: HTMLVideoElement) => !el.paused))
    .toBe(true);
});
