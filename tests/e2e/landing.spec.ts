import { test, expect } from "@playwright/test";

test("landing renders and reaches the product", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "설치하고 싶게 만드는 앱 영상이, 매일 자동으로 올라갑니다.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "만들고, 올리고, 보고, 다시.",
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "무료로 시작하기", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/overview/);
  await expect(
    page.getByRole("heading", { name: "대시보드", exact: true }),
  ).toBeVisible();
});

test("hero headline cycles through hook variants", async ({ page }) => {
  await page.goto("/");

  const variants = page.locator(".ld-rot > span");
  await expect(variants).toHaveCount(5);
  await expect(page.locator(".ld-rot > span.is-on")).toHaveCount(1);

  // 화면 낭독기에는 고정 문장만 들려야 한다.
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
    "설치하고 싶게 만드는 앱 영상이, 매일 자동으로 올라갑니다.",
  );

  const shown = () => page.locator(".ld-rot > span.is-on").textContent();
  const first = await shown();
  await expect.poll(shown, { timeout: 8000 }).not.toBe(first);
});

test("hero variants all occupy the same height", async ({ page }) => {
  await page.goto("/");

  /*
    문구를 같은 칸에 겹쳐 두므로 칸 높이는 가장 긴 문구가 정한다. 한 문구만
    줄이 바뀌면 칸이 두 줄이 되고, 짧은 문구 밑에 빈 줄이 남는다. 그래서
    문구마다 혼자 있을 때의 높이를 재서 모두 같은지 본다.
  */
  const heights = await page.evaluate(() => {
    const rot = document.querySelector(".ld-rot") as HTMLElement;
    const kids = Array.from(rot.children) as HTMLElement[];
    const saved = kids.map((k) => k.style.display);

    const out = kids.map((_, i) => {
      kids.forEach((k, j) => {
        k.style.display = j === i ? "" : "none";
      });
      return Math.round(rot.getBoundingClientRect().height);
    });

    kids.forEach((k, i) => {
      k.style.display = saved[i];
    });
    return out;
  });

  expect(heights.length).toBe(5);
  expect(new Set(heights).size).toBe(1);
});

test("landing sells the loop, not editing convenience", async ({ page }) => {
  await page.goto("/");

  // 핵심 주장이 자동 업로드와 성과 관리라는 점을 고정한다.
  await expect(
    page.getByRole("heading", { name: "계정에 자동 업로드", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "성과 확인", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "편집이 아니라, 꾸준함이 문제입니다.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("이번 주 7편 자동 업로드")).toBeVisible();
});

test("landing avoids internal jargon", async ({ page }) => {
  await page.goto("/");

  const copy = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        ".landing .ld-hero, .landing .ld-intro, .landing .ld-section, .landing .ld-cta",
      ),
    )
      .map((el) => el.textContent ?? "")
      .join(" "),
  );

  for (const term of [
    "파이프라인",
    "페르소나",
    "브리프",
    "Hook Engine",
    "Demo Engine",
    "9:16",
    "H.264",
    "PostgreSQL",
    "FFmpeg",
    "인코딩",
    "스냅샷",
    "작업 큐",
    "멀티테넌시",
    "presigned",
    "agentic",
  ]) {
    expect(copy).not.toContain(term);
  }

  // "후킹되는"은 수동태라 어색하다. 능동형만 쓴다.
  expect(copy).not.toContain("후킹되는");
});

test("emphasis phrases stay short enough to stick", async ({ page }) => {
  await page.goto("/");

  const marks = page.locator(".landing .ld-mark");
  await expect(marks.first()).toBeVisible();

  const texts = await marks.allInnerTexts();
  expect(texts.length).toBeGreaterThanOrEqual(5);

  for (const t of texts) {
    const s = t.trim();
    // 길어지면 문장이 되어 각인되지 않는다.
    expect(s.length).toBeLessThanOrEqual(12);
    // 강조는 마침표 없이 끊어야 도장처럼 남는다.
    expect(s).not.toMatch(/[.?!]$/);
    expect(s.length).toBeGreaterThan(0);
  }
});

test("the pane headings match their list counts", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "하실 일은 네 가지뿐입니다.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "저희가 하는 일은 여섯 단계입니다",
      exact: true,
    }),
  ).toBeVisible();

  // 제목이 숫자를 말하므로 목록 개수와 어긋나면 안 된다.
  await expect(
    page.locator(".ld-pane").first().locator(".ld-list li"),
  ).toHaveCount(4);
  await expect(page.locator(".ld-pane-tall .ld-list li")).toHaveCount(6);

  // 고객이 하는 일보다 저희가 하는 일이 확실히 많아야 대비가 산다.
  const mine = await page
    .locator(".ld-pane")
    .first()
    .locator(".ld-list li")
    .count();
  const ours = await page.locator(".ld-pane-tall .ld-list li").count();
  expect(ours).toBeGreaterThan(mine);
});

test("stage rows stay one line each", async ({ page }) => {
  /*
    이 규칙은 두 단으로 갈라지는 데스크톱 폭에서만 의미가 있다. 좁은 화면에서는
    목록이 한 단으로 서고 설명이 자연스럽게 두 줄로 접히므로, 검사하는 폭을
    고정해 둔다.
  */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  /*
    단계 설명이 한 줄을 넘기면 그 행만 두 줄이 되어 목록이 들쭉날쭉해진다.
    실측으로 68·106·83·106·83·106px까지 벌어졌다. 설명 길이를 맞춰 두는 한이
    있어도 행 높이는 고르게 유지한다.
  */
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll(".ld-pane-tall .ld-list li")].map((li) => {
      const p = li.querySelector(".ld-task p");
      const lh = p ? parseFloat(getComputedStyle(p).lineHeight) : 0;
      return {
        h: Math.round(li.getBoundingClientRect().height),
        lines: p && lh ? Math.round(p.getBoundingClientRect().height / lh) : 0,
      };
    }),
  );

  expect(rows.length).toBe(6);
  expect(rows.map((r) => r.lines)).toEqual([1, 1, 1, 1, 1, 1]);

  // 첫 행만 위쪽 헤어라인이 없어 그만큼 작고, 나머지는 높이가 같아야 한다.
  const [, ...rest] = rows;
  expect(new Set(rest.map((r) => r.h)).size).toBe(1);
});

test("pricing toggle and FAQ accordion respond", async ({ page }) => {
  await page.goto("/");

  const starter = page.locator(".ld-plan").first();
  await expect(starter.locator(".ld-price strong")).toHaveText("190,000");

  await page.getByRole("button", { name: "연간 결제" }).click();
  await expect(starter.locator(".ld-price strong")).toHaveText("161,500");

  await page.getByRole("button", { name: "월간 결제" }).click();
  await expect(starter.locator(".ld-price strong")).toHaveText("190,000");

  const question = page.getByRole("button", { name: "후킹이 뭔가요?" });
  await expect(question).toHaveAttribute("aria-expanded", "false");
  await question.click();
  await expect(question).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("region", { name: "후킹이 뭔가요?" }),
  ).toContainText("첫 3초");
});

test("mobile menu opens and page does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const burger = page.getByRole("button", { name: "메뉴 열기" });
  await expect(burger).toHaveAttribute("aria-expanded", "false");
  await burger.click();
  await expect(page.getByRole("button", { name: "메뉴 닫기" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await expect(
    page.locator("#ld-mobile-nav").getByRole("link", { name: "어떻게 돌아가나요" }),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  /*
    .landing에 overflow-x: hidden이 걸려 있어서 넘침이 scrollWidth에 잡히지
    않는다. 그래서 버거가 화면 밖으로 밀려 잘려도 이 테스트는 통과했다.
    실제로 화면 안에 들어와 있는지는 요소의 좌표로 직접 봐야 한다.
  */
  const clipped = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll(".ld-nav-inner *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > width + 1 || r.left < -1);
      })
      .map((el) => el.className);
  });

  expect(clipped).toEqual([]);
});

test("scroll reveal never strands a section invisible", async ({ page }) => {
  await page.goto("/");

  /*
    먼저 효과가 실제로 켜져 있는지 본다. 숨겨진 요소가 하나도 없으면 이 테스트는
    아무것도 지켜주지 못한다.
  */
  const hiddenCount = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll(".ld-reveal")].filter(
          (el) => getComputedStyle(el).opacity === "0",
        ).length,
    );

  await expect.poll(hiddenCount, { timeout: 5000 }).toBeGreaterThan(0);

  /*
    상단 메뉴는 앵커 링크라 화면을 건너뛴다. 등장 시점을 놓친 요소가 있으면
    opacity 0으로 남아 내용이 영영 보이지 않는다. 그래서 일부러 건너뛴 뒤
    위아래로 훑어 아무것도 남지 않는지 본다.
  */
  await page.getByRole("navigation", { name: "주요 섹션" }).getByRole("link", {
    name: "자주 묻는 질문",
  }).click();

  await page.evaluate(async () => {
    // 부드러운 스크롤을 끄고 가장 거친 이동을 재현한다.
    document.documentElement.style.scrollBehavior = "auto";
    const sleep = (ms: number) =>
      new Promise((resolve) => window.setTimeout(resolve, ms));
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y <= height; y += 300) {
      window.scrollTo(0, y);
      await sleep(50);
    }
    await sleep(400);
  });

  const stranded = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".ld-reveal")]
        .filter((el) => parseFloat(getComputedStyle(el).opacity) < 1)
        .map((el) => el.className),
    );

  await expect.poll(stranded, { timeout: 5000 }).toEqual([]);
});
