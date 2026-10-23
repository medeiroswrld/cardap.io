import { test, expect } from "@playwright/test";

test("cabeçalhos de segurança no cardápio e na API", async ({ request }) => {
  for (const path of ["/r/demo", "/api/catalog/INVALIDO"]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  }
});

test("demo funciona sem violações de CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto("/r/demo");
  await expect(page.getByRole("region", { name: "Cardápio em reels" })).toBeVisible();
  await page.getByRole("button", { name: "Ver detalhes de Smash da casa", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visualizar lista" }).click();
  await expect(page.locator(".product-list")).toBeVisible();
  expect(violations).toEqual([]);
});
