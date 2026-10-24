import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import * as store from "../src/server/gtm/store";
import * as media from "../src/server/gtm/media";
import { credential, saveConnection } from "../src/server/gtm/credentials";
import {
  createLoop,
  updateLoop,
  controlLoop,
  claimLoop,
} from "../src/server/gtm/loop/store";
import { qualify } from "../src/server/gtm/loop/research";
import { tickLoops } from "../src/server/gtm/loop/engine";
import { loopView, exportLoop } from "../src/server/gtm/loop/view";
import type { LoopRun, Source, Stage } from "../src/server/gtm/loop/model";
import type { Experiment } from "../src/server/gtm/model";
import { execute } from "../tools/gtm/worker";
const dir = mkdtempSync(path.join(os.tmpdir(), "ugc-loop-"));
process.env.GTM_DATA_DIR = dir;
process.env.GTM_ADMIN_TOKEN = "test-only-loop-admin-".repeat(4);
for (const k of [
  "HF_API_KEY",
  "TAVILY_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "IG_ACCESS_TOKEN",
  "IG_USER_ID",
  "IG_GRAPH_VERSION",
])
  delete process.env[k];
after(async () => {
  if (!process.env.GTM_LOOP_REPLAY_OUTPUT)
    await fs.rm(dir, { recursive: true, force: true });
});
const now = Date.now();
function source(
  id: string,
  text: string,
  date: string | null = new Date(now - 3600000).toISOString(),
): Source {
  return {
    id,
    url: "https://example.invalid/post/" + id,
    title: "테스트 시나리오 · 실제 고객 아님",
    text,
    publishedAt: date,
    dateSource: date ? "provider" : "unknown",
    retrievedAt: now,
    query: "테스트 검색",
    provenance: "test_fixture",
    kind: "consumer",
  };
}
const facts = [
  {
    id: "recipe_link",
    claim: "SNS 레시피 링크 정리",
    quote: "링크를 넣으면 레시피 정리",
    sourceUrl: "https://yorigo.kr/",
  },
];
test("binary rubric holds unknown dates, altered quotes, duplicates and marketing-only material", () => {
  const text = "저는 레시피를 저장만 해두고 다시 못 찾아서 불편해요.";
  const a = source("a", text),
    b = source("b", text, null),
    c = { ...source("c", text), url: a.url };
  const raw = [a, b, c].map((s) => ({
    sourceId: s.id,
    quote: text,
    pain: "saved_overload" as const,
    factIds: ["recipe_link"],
    consumerExpression: true,
  }));
  const checks = qualify([a, b, c], raw, facts, 7, now);
  assert.equal(checks[0].qualified, true);
  assert.equal(
    checks[1].checks.find((c) => c.name === "최근 7일")!.verdict,
    "UNKNOWN",
  );
  assert.equal(checks[2].qualified, false);
  assert.equal(
    qualify(
      [a],
      [{ ...raw[0], quote: "없는 말을 만들었습니다." }],
      facts,
      7,
      now,
    )[0].qualified,
    false,
  );
  assert.equal(
    qualify(
      [source("old", text, new Date(now - 8 * 86400000).toISOString())],
      [{ ...raw[0], sourceId: "old" }],
      facts,
      7,
      now,
    )[0].qualified,
    false,
  );
});
test("provider credentials are encrypted and absent from plaintext database documents", () => {
  const value = "fixture-tavily-key-123456";
  saveConnection({ name: "TAVILY_API_KEY", value });
  assert.equal(credential("TAVILY_API_KEY"), value);
  const record = store.get("credential", "TAVILY_API_KEY");
  assert.equal(JSON.stringify(record).includes(value), false);
  store.db().prepare("DELETE FROM documents WHERE kind='credential'").run();
});
test("missing connections block a stage and do not create a persona or success event", async (t) => {
  const id = randomUUID();
  store.put("asset", {
    id,
    kind: "demo",
    file: "unused.mp4",
    bytes: 1,
    createdAt: now,
  });
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        '<html><title>요리고</title><meta name="description" content="SNS 레시피 링크를 재료 목록과 장보기로 정리합니다."></html>',
      ),
  );
  const r = createLoop({ productUrl: "https://yorigo.kr/", demoAsset: id });
  await tickLoops();
  await tickLoops();
  const result = store.get<LoopRun>("loop", r.id)!;
  assert.equal(result.steps[0].status, "succeeded");
  assert.equal(result.steps[1].status, "blocked");
  assert.equal(result.referenceAsset, undefined);
  assert.equal(controlLoop(r.id, "resume").steps[1].status, "pending");
  t.mock.restoreAll();
});
test("expired in-flight generation without remote ID is quarantined rather than resubmitted", () => {
  const id = randomUUID();
  store.put("asset", {
    id,
    kind: "demo",
    file: "unused.mp4",
    bytes: 1,
    createdAt: now,
  });
  const r = createLoop(
    { productUrl: "https://yorigo.kr/", demoAsset: id },
    undefined,
    "test",
  );
  updateLoop(r.id, (x) => ({
    ...x,
    leaseUntil: now - 1,
    nextAt: 0,
    steps: x.steps.map((s) =>
      s.stage === "persona"
        ? { ...s, status: "running", mutationStartedAt: now - 1000 }
        : ["product", "research", "qualify", "strategy"].includes(s.stage)
          ? { ...s, status: "succeeded" }
          : s,
    ),
  }));
  claimLoop(Date.now(), true);
  assert.equal(
    store.get<LoopRun>("loop", r.id)!.steps.find((s) => s.stage === "persona")!
      .status,
    "needs_attention",
  );
});
test("complete two-round loop records research, creates persona, publishes once, learns and reuses persona for a new hook", async (t) => {
  // Pause previous fixtures so this test owns the queue.
  for (const r of store.all<LoopRun>("loop"))
    updateLoop(r.id, (x) => ({ ...x, paused: true }));
  Object.assign(process.env, {
    TAVILY_API_KEY: "test-tavily",
    OPENAI_API_KEY: "test-openai",
    OPENAI_MODEL: "fixture-structured-model",
    HF_API_KEY: "test-hf",
    IG_ACCESS_TOKEN: "test-ig",
    IG_USER_ID: "123",
    IG_GRAPH_VERSION: "v25.0",
  });
  let hookFile = process.env.GTM_REPLAY_HOOK_FILE,
    demoFile = process.env.GTM_REPLAY_DEMO_FILE;
  if (!hookFile) {
    hookFile = path.join(dir, "hook.mp4");
    await media.run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=teal:s=180x320:d=5",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      hookFile,
    ]);
  }
  if (!demoFile) {
    demoFile = path.join(dir, "demo.mp4");
    await media.run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=white:s=180x320:d=12.2",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      demoFile,
    ]);
  }
  const portrait = path.join(dir, "portrait.jpg");
  await media.run("ffmpeg", ["-y", "-i", hookFile, "-frames:v", "1", portrait]);
  const demo = await media.register(demoFile, "demo");
  const byteVideo = await fs.readFile(hookFile),
    byteImage = await fs.readFile(portrait);
  process.env.GTM_HF_MEDIA_HOSTS = "fixture.example";
  const requests = new Map<string, "persona" | "intro">();
  const calls: string[] = [];
  let personaCalls = 0,
    introCalls = 0,
    published = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      calls.push((init?.method || "GET") + " " + u.hostname + u.pathname);
      if (u.hostname === "yorigo.kr")
        return new Response(
          '<html><title>요리GO · SNS 레시피 정리</title><meta name="description" content="SNS 레시피 링크를 넣으면 재료 정리와 장보기까지 연결합니다."></html>',
        );
      if (u.hostname === "api.tavily.com")
        return Response.json({
          results: [
            {
              url: "https://example.invalid/consumer-a",
              title: "테스트 신호 A · 실제 고객 아님",
              raw_content:
                "저는 레시피를 저장만 해두고 다시 못 찾아서 불편해요.",
              published_date: new Date(now - 3600000).toISOString(),
            },
            {
              url: "https://example.invalid/consumer-b",
              title: "테스트 신호 B · 실제 고객 아님",
              raw_content: "제가 저장한 레시피가 쌓여서 다시 찾기 힘들어요.",
              published_date: new Date(now - 7200000).toISOString(),
            },
            {
              url: "https://example.invalid/unknown-date",
              title: "날짜 미확인 · 보류 검증",
              raw_content: "저는 저장한 레시피를 다시 못 찾아서 불편해요.",
            },
          ],
        });
      if (u.hostname === "api.openai.com") {
        const b = JSON.parse(String(init?.body)),
          input = JSON.parse(b.input);
        let output: unknown;
        if (b.text.format.name === "customer_signals")
          output = {
            signals: input.sources.map((s: Source) => ({
              sourceId: s.id,
              quote: s.text,
              pain: "saved_overload",
              factIds: ["recipe_link"],
              consumerExpression: true,
            })),
          };
        else
          output = {
            segment:
              "SNS 요리 영상을 저장하지만 다시 찾는 번거로움 때문에 요리하지 못하는 한국어 사용자",
            pain: "saved_overload",
            evidenceIds: input.qualified
              .slice(0, 2)
              .map((s: { sourceId: string }) => s.sourceId),
            factIds: ["recipe_link"],
            persona: {
              name: "집밥 메이트",
              context:
                "저장한 요리 영상을 다시 찾아 저녁을 준비하는 성인 진행자",
              appearancePrompt:
                "Photorealistic fictional adult Korean-market cooking presenter, natural home kitchen, casual light shirt, friendly contained expression, smartphone selfie close-up, deep depth of field, vertical 9:16, no text",
              rationale:
                "원문의 저장 후 재탐색 불편을 일상 주방 맥락으로 보여줍니다.",
              creativeChoices:
                "진행자의 외모·성별·연령은 광고용 창작 설정이며 원문 작성자의 인구통계가 아닙니다.",
            },
            hook: input.previous
              ? "저장한 요리 영상, 이번엔 만들어봐요"
              : "저장한 레시피, 이렇게 정리한다고?",
            cta: "저장한 영상 하나, 요리고에 넣어보세요.",
            caption:
              "요리고가 SNS 레시피 링크를 정리해드립니다. 프로필 링크에서 시작하세요. AI 진행자가 소개합니다.",
            nextQueries: ['"레시피" "저장" "다시 찾기"'],
          };
        return Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(output) }],
            },
          ],
        });
      }
      if (u.hostname === "api.higgsfield.ai" && init?.method === "POST") {
        const id = randomUUID(),
          isImage = u.pathname.includes("/soul/");
        requests.set(id, isImage ? "persona" : "intro");
        if (isImage) personaCalls++;
        else introCalls++;
        return Response.json({ request_id: id, status: "queued" });
      }
      if (u.hostname === "api.higgsfield.ai") {
        const id = u.pathname.split("/")[2],
          kind = requests.get(id);
        return Response.json(
          kind === "persona"
            ? {
                status: "completed",
                images: [{ url: "https://fixture.example/portrait.jpg" }],
              }
            : {
                status: "completed",
                video: { url: "https://fixture.example/reaction.mp4" },
              },
        );
      }
      if (u.hostname === "fixture.example")
        return new Response(
          new Uint8Array(u.pathname.endsWith(".jpg") ? byteImage : byteVideo),
        );
      if (u.hostname === "graph.instagram.com") {
        if (u.pathname.endsWith("/123/media_publish"))
          return Response.json({ id: String(70000 + ++published) });
        if (u.pathname.endsWith("/123/media"))
          return Response.json({ id: "container-" + (published + 1) });
        if (u.pathname.includes("/container-"))
          return Response.json({ status_code: "FINISHED" });
        return Response.json({
          id: u.pathname.split("/").pop(),
          permalink: "https://example.invalid/test-post-" + published,
        });
      }
      throw new Error("Unexpected outbound request " + u.hostname + u.pathname);
    },
  );
  const root = createLoop(
    {
      productUrl: "https://yorigo.kr/",
      demoAsset: demo.id,
      demoSeconds: 12,
      publishMode: "automatic",
      autoLoop: true,
      maxRounds: 2,
      observationMinutes: 60,
    },
    undefined,
    "test",
  );
  for (let i = 0; i < 100; i++) {
    for (const r of store
      .all<LoopRun>("loop")
      .filter((x) => x.rootId === root.id)) {
      updateLoop(r.id, (x) => ({
        ...x,
        nextAt: 0,
        testMetrics: { visits: 12, activated: 2, views: 320 },
      }));
      if (r.experimentId) {
        const e = store.get<Experiment>("experiment", r.experimentId);
        if (e?.publishedAt)
          store.patchExperiment(e.id, { publishedAt: Date.now() - 61 * 60000 });
      }
    }
    await tickLoops({ allowTest: true });
    for (const j of store
      .jobs()
      .filter(
        (j) =>
          j.status === "queued" && ["render", "publish"].includes(j.action),
      )) {
      await execute(j, true);
    }
    const runs = store.all<LoopRun>("loop").filter((x) => x.rootId === root.id);
    const failed = runs.flatMap((r) =>
      r.steps
        .filter((s) =>
          ["failed", "blocked", "needs_attention"].includes(s.status),
        )
        .map((s) => ({ stage: s.stage, message: s.message })),
    );
    assert.deepEqual(failed, []);
    if (
      runs.length === 2 &&
      runs.every((r) => r.steps.every((s) => s.status === "succeeded"))
    )
      break;
  }
  const runs = store
    .all<LoopRun>("loop")
    .filter((x) => x.rootId === root.id)
    .sort((a, b) => a.round - b.round);
  assert.equal(runs.length, 2);
  assert.ok(runs.every((r) => r.steps.every((s) => s.status === "succeeded")));
  assert.equal(personaCalls, 1);
  assert.equal(introCalls, 1);
  assert.equal(published, 2);
  assert.equal(runs[1].referenceAsset, runs[0].referenceAsset);
  assert.notEqual(runs[1].plan!.hook, runs[0].plan!.hook);
  assert.equal(runs[0].decision!.nextRunId, runs[1].id);
  assert.equal(loopView(root.id).actual!.activated, 0);
  assert.equal(
    runs[0].steps.find((s) => s.stage === "measure")!.output &&
      (
        runs[0].steps.find((s) => s.stage === "measure")!.output as {
          test: { activated: number };
        }
      ).test.activated,
    2,
  );
  assert.equal(calls.filter((c) => c.includes("/123/media_publish")).length, 2);
  const html = await exportLoop(root.id);
  assert.ok(html.includes("검증 리플레이"));
  assert.ok(html.includes("data:video/mp4;base64,"));
  assert.equal(html.includes("test-openai"), false);
  if (process.env.GTM_LOOP_REPLAY_OUTPUT) {
    await fs.mkdir(process.env.GTM_LOOP_REPLAY_OUTPUT, { recursive: true });
    await fs.writeFile(
      path.join(
        process.env.GTM_LOOP_REPLAY_OUTPUT,
        "gtm-loop-interactive.html",
      ),
      html,
    );
    await fs.writeFile(
      path.join(process.env.GTM_LOOP_REPLAY_OUTPUT, "replay-state.json"),
      JSON.stringify({
        dataDir: dir,
        rootId: root.id,
        runIds: runs.map((r) => r.id),
      }),
    );
  }
  t.mock.restoreAll();
});
