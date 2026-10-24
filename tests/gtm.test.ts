import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import * as store from "../src/server/gtm/store";
import * as service from "../src/server/gtm/service";
import * as auth from "../src/server/gtm/auth";
import * as media from "../src/server/gtm/media";
import { tick } from "../tools/gtm/worker";
import os from "node:os";
import path from "node:path";
import {
  funnel,
  decide,
  type Event,
  type Experiment,
} from "../src/server/gtm/model";
const dir = mkdtempSync(path.join(os.tmpdir(), "ugc-gtm-test-"));
process.env.GTM_DATA_DIR = dir;
process.env.GTM_ADMIN_TOKEN = "a".repeat(64);
after(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
const now = Date.now(),
  day = 86400000;
function event(
  name: Event["name"],
  at: number,
  recipeId = "r1",
  extra: Partial<Event> = {},
): Event {
  return {
    eventId: crypto.randomUUID(),
    clickId: crypto.randomUUID(),
    userId: "user",
    recipeId,
    name,
    occurredAt: new Date(at).toISOString(),
    isNewUser: true,
    eligible: true,
    test: false,
    experimentId: "exp",
    ...extra,
  };
}
test("activation requires matching recipe, save after generation, and excludes test/existing users", () => {
  assert.equal(
    funnel(
      [
        event("recipe_generated", now - 1000),
        event("recipe_saved", now, "other"),
      ],
      now,
    ).activated,
    0,
  );
  assert.equal(
    funnel(
      [
        event("recipe_saved", now - 2000),
        event("recipe_generated", now - 1000),
      ],
      now,
    ).activated,
    0,
  );
  assert.equal(
    funnel(
      [
        event("recipe_generated", now - 1000, "r1", { test: true }),
        event("recipe_saved", now, "r1", { test: true }),
      ],
      now,
    ).activated,
    0,
  );
  assert.equal(
    funnel(
      [event("recipe_generated", now - 1000), event("recipe_saved", now)],
      now,
    ).activated,
    1,
  );
  assert.equal(
    funnel(
      [event("recipe_generated", now - 2 * day), event("recipe_saved", now)],
      now,
    ).activated,
    0,
  );
});
test("7-day denominator only includes mature activations; repeat needs another recipe pair", () => {
  const a = now - 8 * day;
  const list = [
    event("recipe_generated", a),
    event("recipe_saved", a + 1000),
    event("recipe_generated", a + 2 * day, "r2"),
    event("recipe_saved", a + 2 * day + 1000, "r2"),
  ];
  assert.deepEqual(funnel(list, now), {
    eligibleUsers: 1,
    activated: 1,
    mature: 1,
    repeated: 1,
    pending: 0,
  });
  assert.equal(funnel(list, a + 3 * day).mature, 0);
  assert.equal(
    funnel(
      list.map((x) => ({ ...x, recipeId: "r1" })),
      now,
    ).repeated,
    0,
  );
});
test("no small-sample winner and no more generation when activation fails", () => {
  const e = { publishedAt: now - 2 * day } as Experiment;
  assert.equal(decide(e, 9, 2, now).ready, false);
  assert.equal(decide(e, 20, 0, now).change, "onboarding");
  assert.equal(decide(e, 20, 2, now).change, "hook");
  assert.equal(decide({ ...e, publishedAt: now }, 20, 2, now).ready, false);
});
test("signed sessions and signed media reject tampering/expiry", () => {
  const cookie = auth.session();
  assert.equal(
    auth.authorized(
      new Request("http://localhost", {
        headers: { cookie: "gtm_session=" + cookie },
      }),
    ),
    true,
  );
  assert.equal(
    auth.authorized(
      new Request("http://localhost", {
        headers: { cookie: "gtm_session=" + cookie + "x" },
      }),
    ),
    false,
  );
  const expires = Date.now() + 1000;
  assert.equal(
    auth.mediaAllowed(
      "asset",
      new URL(
        `https://host/?expires=${expires}&sig=${auth.mediaToken("asset", expires)}`,
      ),
    ),
    true,
  );
  assert.equal(
    auth.mediaAllowed(
      "other",
      new URL(
        `https://host/?expires=${expires}&sig=${auth.mediaToken("asset", expires)}`,
      ),
    ),
    false,
  );
});
test("queue deduplicates, leases jobs atomically, and quarantines ambiguous submissions", () => {
  const c = service.createCampaign({});
  const e = service.createExperiment(c.id, { hook: "테스트 훅입니다" });
  store.enqueue(e.id, "generate");
  store.enqueue(e.id, "generate");
  assert.equal(store.jobs().filter((j) => j.experimentId === e.id).length, 1);
  const j = store.claim(now + 10000)!;
  assert.ok(j);
  assert.equal(store.claim(now + 10000), undefined);
  assert.equal(store.claim(now + 20 * 60000), undefined);
  assert.equal(
    store.jobs().find((x) => x.id === j.id)!.status,
    "needs_attention",
  );
  assert.equal(
    store.get<Experiment>("experiment", e.id)!.state,
    "needs_attention",
  );
});
test("event ingestion deduplicates and pins each user to one experiment", () => {
  const c = service.createCampaign({}),
    e1 = service.createExperiment(c.id, { hook: "첫 번째 훅입니다" }),
    e2 = service.createExperiment(c.id, { hook: "두 번째 훅입니다" });
  const click1 = store.put("click", {
      id: crypto.randomUUID(),
      experimentId: e1.id,
      createdAt: now - 1000,
    }),
    click2 = store.put("click", {
      id: crypto.randomUUID(),
      experimentId: e2.id,
      createdAt: now - 1000,
    });
  const ev = event("recipe_generated", now - 500, "r1", {
    clickId: click1.id,
    userId: "real-user",
  });
  service.recordEvent(ev);
  assert.equal(service.recordEvent(ev).duplicate, true);
  service.recordEvent(
    event("recipe_saved", now, "r1", {
      clickId: click2.id,
      userId: "real-user",
    }),
  );
  assert.equal(service.stats(e1.id).activated, 1);
  assert.equal(service.stats(e2.id).activated, 0);
  assert.throws(() =>
    service.recordEvent({
      ...ev,
      eventId: "bad",
      clickId: crypto.randomUUID(),
    }),
  );
});
test("next experiment is idempotent, changes only hook, and keeps evidence", () => {
  const c = service.createCampaign({}),
    e = service.createExperiment(c.id, {
      hook: "저장한 레시피, 언제 해 먹어요?",
    });
  const reactionAsset = crypto.randomUUID();
  store.put("asset", {
    id: reactionAsset,
    kind: "hook",
    file: "reaction.mp4",
    bytes: 1,
    createdAt: now,
  });
  store.patchExperiment(e.id, {
    state: "published",
    publishedAt: now - 2 * day,
    hookAsset: reactionAsset,
    hookStartSeconds: 1,
  });
  for (let i = 0; i < 10; i++)
    store.put("click", {
      id: crypto.randomUUID(),
      experimentId: e.id,
      createdAt: now - 1000,
    });
  store.put("event", {
    ...event("recipe_generated", now - 1000, "r1", {
      userId: "next-user",
      experimentId: e.id,
    }),
    id: "next-gen",
  });
  store.put("event", {
    ...event("recipe_saved", now, "r1", {
      userId: "next-user",
      experimentId: e.id,
    }),
    id: "next-save",
  });
  const n = service.nextExperiment(e.id);
  assert.notEqual(n.hook, e.hook);
  assert.equal(n.demoSeconds, e.demoSeconds);
  assert.equal(n.hookAsset, reactionAsset);
  assert.equal(n.hookStartSeconds, 1);
  assert.equal(n.introMode, "reaction");
  assert.ok(n.decision?.includes("10"));
  assert.equal(service.nextExperiment(e.id).id, n.id);
});
test("real FFmpeg render preserves audio/silence and produces checked portrait MP4", async () => {
  const hook = path.join(dir, "hook.mp4"),
    demo = path.join(dir, "demo.mp4");
  await media.run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=180x320:d=4.2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=4.2",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-c:a",
    "aac",
    "-shortest",
    hook,
  ]);
  await media.run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=white:s=180x320:d=5.2",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    demo,
  ]);
  const h = await media.register(hook, "hook"),
    d = await media.register(demo, "demo");
  const c = service.createCampaign({}),
    e = service.createExperiment(c.id, {
      hook: "저장한 레시피, 오늘 요리해요",
      hookAsset: h.id,
      demoAsset: d.id,
      demoSeconds: 5,
      hookStartSeconds: 1,
    });
  service.start(e.id, "render");
  await tick();
  const result = store.get<Experiment>("experiment", e.id)!;
  assert.equal(result.state, "review");
  assert.ok(result.outputAsset);
  assert.equal(
    result.checks?.every((c) => c.pass),
    true,
  );
  assert.throws(() => service.start(e.id, "publish"));
  service.approve(e.id);
  assert.equal(store.get<Experiment>("experiment", e.id)!.state, "approved");
  await fs.copyFile(
    media.assetPath(result.outputAsset!),
    path.join("/tmp", "ugc-gtm-render-test.mp4"),
  );
});
test("provider publication persists the media ID and never reposts after metadata failure", async (t) => {
  process.env.IG_GRAPH_VERSION = "v25.0";
  process.env.IG_USER_ID = "123";
  process.env.IG_ACCESS_TOKEN = "test-token";
  const calls: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      calls.push((init?.method || "GET") + " " + u.pathname);
      if (u.pathname.endsWith("/123/media"))
        return Response.json({ id: "container" });
      if (u.pathname.endsWith("/container"))
        return Response.json({ status_code: "FINISHED" });
      if (u.pathname.endsWith("/123/media_publish"))
        return Response.json({ id: "456" });
      return new Response("", { status: 503 });
    },
  );
  const c = service.createCampaign({}),
    e = service.createExperiment(c.id, { hook: "게시 테스트입니다" });
  store.patchExperiment(e.id, {
    state: "approved",
    outputAsset: crypto.randomUUID(),
  });
  store.enqueue(e.id, "publish");
  const j = store
    .jobs()
    .find((j) => j.experimentId === e.id && j.action === "publish")!;
  const { execute } = await import("../tools/gtm/worker");
  await execute(j);
  await execute(j);
  assert.equal(store.get<Experiment>("experiment", e.id)!.mediaId, "456");
  assert.equal(
    calls.filter((c) => c === "POST /v25.0/123/media_publish").length,
    1,
  );
  t.mock.restoreAll();
});
test("ambiguous generation submission is quarantined without automatic resubmission", async (t) => {
  process.env.HF_API_KEY = "test-key";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("network disconnected after server accepted");
  });
  const c = service.createCampaign({});
  const referenceId = crypto.randomUUID(),
    demoId = crypto.randomUUID();
  store.put("asset", {
    id: referenceId,
    kind: "reference",
    file: "unused.jpg",
    bytes: 1,
    createdAt: now,
  });
  store.put("asset", {
    id: demoId,
    kind: "demo",
    file: "unused.mp4",
    bytes: 1,
    createdAt: now,
  });
  const e = service.createExperiment(c.id, {
    hook: "모호한 생성 요청 테스트",
    referenceAsset: referenceId,
    demoAsset: demoId,
  });
  service.start(e.id, "generate");
  // Finish unrelated scheduled metrics from the previous test before running this job.
  store
    .db()
    .prepare("UPDATE jobs SET status='done' WHERE action='metrics'")
    .run();
  await tick();
  await tick();
  assert.equal(calls, 1);
  assert.equal(
    store.get<Experiment>("experiment", e.id)!.state,
    "needs_attention",
  );
  t.mock.restoreAll();
});

test("silent reaction seek trims the video rather than the synthetic audio input", async () => {
  const source = path.join(dir, "silent-window.mp4");
  await media.run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=180x320:d=1",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=180x320:d=3.2",
    "-filter_complex",
    "[0:v][1:v]concat=n=2:v=1:a=0[v]",
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    source,
  ]);
  const h = await media.register(source, "hook"),
    d = await media.register(path.join(dir, "demo.mp4"), "demo");
  const c = service.createCampaign({});
  const e = service.createExperiment(c.id, {
    hook: "무음 리액션 선택 구간 검사",
    hookAsset: h.id,
    demoAsset: d.id,
    hookStartSeconds: 1.1,
    demoSeconds: 5,
  });
  const out = await media.render(e);
  const pixels = await media.run("ffmpeg", [
    "-v",
    "error",
    "-i",
    media.assetPath(out.outputAsset),
    "-frames:v",
    "1",
    "-vf",
    "crop=2:2:100:100,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-",
    "-f",
    "null",
    "-",
  ]);
  const value = Number(/YAVG=(\d+(?:\.\d+)?)/.exec(pixels)?.[1]);
  // Full-range red is brighter than blue in the Y plane; frame zero must be red after seeking.
  assert.ok(value > 65, `Expected red selected window, got Y=${value}`);
});
