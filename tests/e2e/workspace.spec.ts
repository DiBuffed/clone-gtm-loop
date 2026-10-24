import { test, expect } from "@playwright/test";
test("profile persists and request flows into operations", async ({ page }) => {
  await page.goto("/app/profile");
  await page.getByLabel("앱 이름", { exact: true }).fill("테스트 앱");
  await page.getByRole("button", { name: "변경 사항 저장" }).click();
  await expect(page.getByRole("status")).toContainText("저장했습니다");
  await page.reload();
  await expect(page.getByLabel("앱 이름", { exact: true })).toHaveValue(
    "테스트 앱",
  );
  await page.getByRole("link", { name: "콘텐츠", exact: true }).click();
  await page.getByRole("button", { name: "새 제작 요청", exact: true }).click();
  await page.getByLabel("요청 이름").fill("첫 데모 캠페인");
  await page.getByRole("button", { name: "데모 요청 만들기" }).click();
  await page.getByRole("link", { name: "운영 화면에서 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "첫 데모 캠페인" }),
  ).toBeVisible();
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "다음 단계 시뮬레이션" }).click();
  await expect(
    page.getByRole("button", { name: "다음 단계 시뮬레이션" }),
  ).toBeDisabled();
});
test("URL filters, empty state and detail approval", async ({ page }) => {
  await page.goto(
    "/app/calendar?account=%40yorigo.daily&from=2026-09-20&to=2026-09-20",
  );
  await expect(page.locator(".timeline-row")).toHaveCount(1);
  await page.locator(".timeline-content").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "데모 검토 완료", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "데모 검토 완료됨" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/app/calendar?from=2027-01-01");
  await expect(page.getByText("해당 기간에 게시물이 없어요")).toBeVisible();
});
test("mobile navigation and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/overview");
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.getByRole("link", { name: "앱 프로필", exact: true }).click();
  await expect(page.getByLabel("앱 이름", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("corrupt storage recovers without crashing", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("ugc-z-demo-v1", "bad-json"),
  );
  await page.goto("/app/overview");
  await expect(
    page.getByRole("alert").filter({ hasText: "브라우저 저장소" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "대시보드", exact: true }),
  ).toBeVisible();
});
