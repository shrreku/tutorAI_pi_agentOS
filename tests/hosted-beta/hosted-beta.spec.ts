import { expect, test, type Page } from "@playwright/test";

const apiBase = process.env.HOSTED_BETA_API_BASE ?? "http://localhost:4000";

test.describe("hosted beta launch smoke", () => {
  test("public routes render and login route is reachable", async ({ page }) => {
    await expectNoConsoleErrors(page, async () => {
      for (const path of ["/", "/demo", "/contact", "/privacy", "/terms", "/login"]) {
        await page.goto(path);
        await expect(page.locator("body")).toContainText(/TutorBook|Privacy|Terms|Sign in|Contact|demo/i);
      }
    });
  });

  test("first login, consent, onboarding, templates, analytics, and protected notebook guard", async ({ page }) => {
    const email = `e2e-${Date.now()}@studyagent.local`;

    await expectNoConsoleErrors(page, async () => {
      await page.goto("/login");
      await page.getByLabel(/dev email/i).fill(email);
      await page.getByRole("button", { name: /continue \(dev\)/i }).click();

      await expect(page.getByRole("heading", { name: /beta consent/i })).toBeVisible();
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: /continue to dashboard/i }).click();

      await expect(page.getByRole("heading", { name: /study templates/i })).toBeVisible();
      const setupDialog = page.getByRole("dialog", { name: /quick setup/i });
      if (await setupDialog.isVisible().catch(() => false)) {
        await setupDialog.getByLabel(/what are you trying to learn/i).fill("Hosted beta launch smoke");
        await setupDialog.getByRole("button", { name: /^continue$/i }).click();
        await expect(setupDialog).toBeHidden();
      }

      const templates = await fetchJson<{ templates: unknown[] }>(page, `${apiBase}/api/v1/study-templates`);
      expect(templates.templates.length, "launch must expose 3-8 published templates").toBeGreaterThanOrEqual(3);
      expect(templates.templates.length, "launch must expose 3-8 published templates").toBeLessThanOrEqual(8);

      await page.getByRole("button", { name: /algebra foundations/i }).click();
      await expect(page).toHaveURL(/\/app\/templates\//);
      await page.getByRole("button", { name: /start studying/i }).click();
      await expect(page).toHaveURL(/\/notebooks\//);
      await expect(page.getByRole("heading", { name: /algebra foundations/i })).toBeVisible();
      await expect(page.getByText(/algebra foundations source/i)).toBeVisible();
      await expect(page.getByText(/ready to study/i)).toBeVisible();

      await page.goto("/app/support");
      await page.getByLabel(/what were you trying to learn/i).fill("Whether the hosted beta feedback flow works");
      await page.getByLabel(/yes, it helped/i).check();
      await page.getByLabel(/where did it break down/i).fill("No issue in the smoke path");
      await page.getByRole("button", { name: /submit learning feedback/i }).click();
      await expect(page.getByRole("heading", { name: /thanks for the feedback/i })).toBeVisible();

      const analyticsResponse = await page.request.post(`${apiBase}/api/v1/analytics/events`, {
        data: {
          eventName: "workspace_page_view",
          properties: { source: "playwright_hosted_beta" },
        },
      });
      expect(analyticsResponse.ok()).toBe(true);

      const bypassResponse = await page.request.post(`${apiBase}/api/v1/notebooks`, {
        data: { title: "Bypass", studyTemplateId: "st_test" },
      });
      expect(bypassResponse.status()).toBe(400);
    });
  });
});

async function fetchJson<T>(page: Page, url: string): Promise<T> {
  const response = await page.request.get(url);
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

async function expectNoConsoleErrors(page: Page, action: () => Promise<void>): Promise<void> {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      messages.push(message.text());
    }
  });
  await action();
  expect(messages).toEqual([]);
}
