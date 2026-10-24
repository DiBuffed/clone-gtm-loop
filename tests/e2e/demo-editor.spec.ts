import { test, expect, type Page } from "@playwright/test";
import { samplePlan } from "../../src/lib/autocut-sample";
// 자동 편집실은 로컬 실행(AUTOCUT_LOCAL=1)에서만 켜진다. 환경과 무관하게 검사하려고 서버 응답을 고정한다.
const reviewOnly = (page: Page) =>
  page.route("**/api/autocut/status", (r) => r.fulfill({ json: { enabled: false } }));
test("reviewing cuts reshapes the edit and captions follow", async ({
  page,
}) => {
  await reviewOnly(page);
  await page.goto("/admin/demo");
  const stats = page.getByLabel("편집 요약");
  await expect(stats).toContainText("16.0초");
  await expect(stats).toContainText("8.7초");
  await page.getByRole("button", { name: "살리기" }).first().click();
  await expect(stats).toContainText("10.0초");
  await expect(page.getByRole("button", { name: "다시 자르기" })).toBeVisible();
  await page.getByRole("button", { name: "자동 판단으로" }).click();
  await expect(stats).toContainText("8.7초");
});
test("caption checks flag long lines and exports need a request", async ({
  page,
}) => {
  await page.goto("/app/content");
  await page.getByRole("button", { name: "새 제작 요청", exact: true }).click();
  await page.getByLabel("요청 이름").fill("시연 편집 캠페인");
  await page.getByRole("button", { name: "데모 요청 만들기" }).click();
  await reviewOnly(page);
  await page.goto("/admin/demo");
  await page.getByRole("button", { name: /^자막/ }).click();
  const check = page.locator(".dc-checks li", { hasText: "14자 이내" });
  await expect(check).toHaveClass(/ok/);
  await page
    .getByLabel("자막 문구")
    .nth(1)
    .fill("기다림 없이 바로 결과가 보입니다");
  await expect(check).toHaveClass(/bad/);
  await page.getByRole("button", { name: "내보내기" }).click();
  await expect(page.getByRole("button", { name: "plan.json" })).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "captions.json" }).click();
  expect((await download).suggestedFilename()).toBe("captions.json");
  await page.getByLabel("제작 요청").selectOption({ label: "시연 편집 캠페인 · 요리GO" });
  await page.getByRole("button", { name: "Demo 완료로 표시" }).click();
  await page.getByRole("link", { name: "제작 관리에서 보기" }).click();
  await expect(
    page.locator(".pipeline > div", { hasText: "Demo" }),
  ).toContainText("완료");
});
test("demo editor fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reviewOnly(page);
  await page.goto("/admin/demo");
  await page.getByRole("button", { name: /^자막/ }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("editing room summarizes jobs and opens the latest in CapCut", async ({
  page,
}) => {
  const job = {
    id: "3f1c2a4e-1111-4222-8333-944455556666",
    file: "yorigo demo.mp4",
    draftName: "yorigo demo_autocut",
    createdAt: "2026-09-30T00:00:00.000Z",
    status: "done",
    step: "edit",
    log: [],
    result: {
      duration: 16, output_duration: 8.72, removed_ratio: 0.455, clips: 5,
      cuts: { count: 2, seconds: 3.75 }, speedups: { count: 2, seconds_saved: 3.53 },
      captions: { total: 5, hype: 5, sub: 0, engine: "api" }, warning: "",
      draft: { name: "yorigo demo_autocut", path: "/Users/me/Movies/CapCut/yorigo demo_autocut" },
    },
  };
  await page.route("**/api/autocut/status", (r) =>
    r.fulfill({ json: { enabled: true, python: true, capcut: true, draftsDir: "/x", captionEngine: "api", whisper: false } }),
  );
  await page.route("**/api/autocut/jobs", (r) => r.fulfill({ json: { jobs: [job] } }));
  await page.route("**/files/plan.json", (r) => r.fulfill({ json: samplePlan }));
  let opened = false;
  await page.route("**/api/autocut/open", (r) => {
    opened = true;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/demo");
  await expect(page.getByText("여기에 시연 영상을 끌어다 놓으세요")).toBeVisible();
  await expect(page.getByLabel("편집 요약")).toContainText("46%");
  const row = page.locator(".sx-row", { hasText: "yorigo demo" });
  await expect(row).toContainText("45.5%");
  await expect(row.locator(".sx-bar i")).toHaveCount(7);
  // 가장 최근 결과는 상세가 펼쳐져 있다
  const detail = page.locator(".sx-detail");
  await expect(detail).toContainText("배속으로 줄임");
  await detail.getByRole("button", { name: "CapCut 초안 열기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "yorigo demo_autocut" })).toBeVisible();
  expect(opened).toBe(true);
});

test("editing room fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/autocut/status", (r) =>
    r.fulfill({ json: { enabled: true, python: true, capcut: true, draftsDir: "/x", captionEngine: "none", whisper: false } }),
  );
  await page.route("**/api/autocut/jobs", (r) => r.fulfill({ json: { jobs: [] } }));
  await page.goto("/admin/demo");
  await expect(page.getByText("아직 편집한 영상이 없어요")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
