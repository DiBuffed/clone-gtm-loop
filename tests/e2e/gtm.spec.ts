import { test, expect } from "@playwright/test";
const token = "test-only-admin-token-000000000000000000000000";
test("GTM console authenticates, creates a real campaign, and stays usable on mobile", async ({
  page,
  request,
}) => {
  const denied = await request.get("/api/gtm/state");
  expect(denied.status()).toBe(401);
  await page.goto("/gtm");
  await expect(
    page.getByRole("heading", { name: "운영 콘솔 연결" }),
  ).toBeVisible();
  await page.getByLabel("운영 키", { exact: true }).fill(token);
  await page.getByRole("button", { name: "연결하기", exact: true }).click();
  await expect(page.getByText("운영 콘솔에 연결했습니다.")).toBeVisible();
  const summary = page
    .locator("summary")
    .filter({ hasText: "새 캠페인 만들기" });
  if (
    !(await summary.evaluate(
      (el) => (el.parentElement as HTMLDetailsElement).open,
    ))
  )
    await summary.click();
  const name = "E2E 요리고 " + Date.now();
  await page.getByLabel("캠페인 이름", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "캠페인 만들기", exact: true })
    .click();
  await expect(page.getByLabel("캠페인 선택")).toHaveValue(/.+/);
  await expect(
    page.getByText("샘플 성과는 표시하지 않습니다.", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/gtm-mobile.png", fullPage: true });
  const state = await page.request.get("/api/gtm/state");
  expect(state.ok()).toBe(true);
  expect(
    (await state.json()).campaigns.some(
      (c: { name: string }) => c.name === name,
    ),
  ).toBe(true);
});
test("GTM rejects cross-origin writes, forged events, invalid media signatures, and oversized inputs", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/gtm/login", {
        headers: { origin: "https://evil.example" },
        data: { token },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/gtm/events", { data: {} })).status()).toBe(
    401,
  );
  expect(
    (
      await request.get("/api/gtm/media/unknown?expires=99999999999999&sig=bad")
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/gtm/login", {
        headers: { origin: "http://127.0.0.1:3000" },
        data: { token },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post("/api/gtm/campaigns", {
        data: { name: "a".repeat(20000) },
      })
    ).status(),
  ).toBe(400);
});

test("uploaded MP4s pass through the durable worker to a protected downloadable result", async ({
  request,
}) => {
  const fs = await import("node:fs/promises"),
    os = await import("node:os"),
    path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gtm-http-"));
  try {
    const file = path.join(dir, "input.mp4");
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=teal:s=180x320:d=5.2",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        file,
      ],
      { stdio: "ignore" },
    );
    const login = await request.post("/api/gtm/login", { data: { token } });
    expect(login.ok()).toBe(true);
    const upload = async (kind: string) => {
      const r = await request.post("/api/gtm/assets?kind=" + kind, {
        data: await fs.readFile(file),
        headers: { "content-type": "video/mp4" },
      });
      expect(r.status()).toBe(201);
      return (await r.json()).id as string;
    };
    const hookAsset = await upload("hook"),
      demoAsset = await upload("demo");
    const c = await (
      await request.post("/api/gtm/campaigns", {
        data: { name: "HTTP pipeline" },
      })
    ).json();
    const e = await (
      await request.post(`/api/gtm/campaigns/${c.id}/experiments`, {
        data: {
          hook: "저장한 레시피, 오늘 만들어봐요",
          hookAsset,
          demoAsset,
          demoSeconds: 5,
        },
      })
    ).json();
    expect(
      (await request.post(`/api/gtm/experiments/${e.id}/render`)).status(),
    ).toBe(202);
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `const job=require('./src/server/gtm/store.ts').jobs().find(j=>j.experimentId===${JSON.stringify(e.id)}&&j.action==='render');require('./tools/gtm/worker.ts').execute(job).catch(e=>{console.error(e);process.exit(1)})`,
      ],
      {
        env: {
          ...process.env,
          GTM_DATA_DIR: ".gtm-data/e2e",
          GTM_ADMIN_TOKEN: token,
        },
        stdio: "pipe",
        timeout: 60000,
      },
    );
    const state = await (await request.get("/api/gtm/state")).json();
    const result = state.experiments.find((x: { id: string }) => x.id === e.id);
    expect(result.state).toBe("review");
    expect(result.checks.every((c: { pass: boolean }) => c.pass)).toBe(true);
    const video = await request.get("/api/gtm/media/" + result.outputAsset, {
      headers: { range: "bytes=0-99" },
    });
    expect(video.status()).toBe(206);
    expect((await video.body()).length).toBe(100);
    expect(
      (
        await request.post(`/api/gtm/experiments/${e.id}/approve`, {
          data: { verified: true },
        })
      ).ok(),
    ).toBe(true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
