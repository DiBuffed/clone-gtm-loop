import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
const token = "test-only-admin-token-000000000000000000000000";
test("loop console starts from product+demo and exposes all ten inspectable stages on mobile", async ({
  page,
}) => {
  await page.goto("/gtm/loop");
  await page.getByLabel("운영 키", { exact: true }).fill(token);
  await page.getByRole("button", { name: "연결하기", exact: true }).click();
  await expect(page.getByText("실행 화면에 연결했습니다.")).toBeVisible();
  const file = await fs.readFile("public/demo/autocut-sample.mp4");
  const upload = await page.request.post("/api/gtm/assets?kind=demo", {
    data: file,
  });
  expect(upload.ok()).toBe(true);
  const asset = await upload.json();
  const summary = page
    .locator("summary")
    .filter({ hasText: "새 루프 시작하기" });
  if (
    !(await summary.evaluate(
      (el) => (el.parentElement as HTMLDetailsElement).open,
    ))
  )
    await summary.click();
  await page
    .getByLabel("제품 주소", { exact: true })
    .fill("https://yorigo.kr/");
  await page.getByLabel("실제 앱 시연", { exact: true }).selectOption(asset.id);
  await page
    .getByRole("button", { name: "라이브 루프 시작 →", exact: true })
    .click();
  await expect(page.locator(".lp-node")).toHaveCount(10);
  await page.locator(".lp-node").nth(3).click();
  await expect(page.locator(".lp-detail h2")).toHaveText("타깃·페르소나 설계");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const runId = await page.getByLabel("루프 실행 선택").inputValue();
  const response = await page.request.get("/api/gtm/loops/" + runId);
  const state = await response.json();
  expect(state.run.steps[0].status).toBe("pending");
  expect(state.actual).toBeNull();
});
test("connections require login and return configuration status without secret values", async ({
  request,
}) => {
  expect((await request.get("/api/gtm/loops")).status()).toBe(401);
  expect(
    (
      await request.post("/api/gtm/connections", {
        data: { name: "OPENAI_API_KEY", value: "test-secret" },
      })
    ).status(),
  ).toBe(401);
  expect((await request.post("/api/gtm/login", { data: { token } })).ok()).toBe(
    true,
  );
  const secret = "fixture-encrypted-key-only-for-e2e";
  const saved = await request.post("/api/gtm/connections", {
    data: { name: "OPENAI_API_KEY", value: secret },
  });
  expect(saved.ok()).toBe(true);
  expect(await saved.text()).not.toContain(secret);
  const b = await request.get("/api/gtm/loops");
  expect(await b.text()).not.toContain(secret);
});
