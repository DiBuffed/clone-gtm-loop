import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { all, get, put, transaction } from "./store";
import { credential } from "./credentials";
import { funnel, type Experiment, type Event } from "./model";
import type { LoopRun } from "./loop/model";
import { createLoop, updateLoop } from "./loop/store";
const configSchema = z.object({
  product: z.string(),
  product_url: z.string().url(),
  repository: z.string().url(),
  evaluation_timezone: z.literal("Asia/Seoul"),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  goals_locked_before_results: z.literal(true),
  goals: z.object({
    attributed_new_activated_users: z.number().int().nonnegative(),
    confirmed_publications: z.number().int().positive(),
    evidence_backed_iterations: z.number().int().nonnegative(),
    qualified_independent_signals: z.number().int().nonnegative(),
  }),
  baseline: z.object({
    total_users: z.number().nullable(),
    active_users: z.number().nullable(),
    verified_at: z.string().nullable(),
    source: z.string(),
  }),
  activation_definition: z.string(),
  revenue_definition: z.string(),
  status: z.string(),
});
export async function missionConfig() {
  const current = configSchema.parse(
    JSON.parse(
      await fs.readFile(path.join(process.cwd(), "mission.json"), "utf8"),
    ),
  );
  const locked = get<{ id: string; config: z.infer<typeof configSchema> }>(
    "mission-lock",
    "submission",
  );
  if (
    locked &&
    (JSON.stringify(current.goals) !== JSON.stringify(locked.config.goals) ||
      current.ends_at !== locked.config.ends_at)
  )
    throw new Error(
      "제출 목표/마감이 첫 실행 기록과 다릅니다. 원래 목표를 유지하고 변경 이유는 별도 기록하세요.",
    );
  if (!locked)
    put("mission-lock", {
      id: "submission",
      config: current,
      lockedAt: Date.now(),
    });
  return locked?.config || current;
}
export const revenueInput = z.object({
  orderId: z.string().min(1).max(150),
  experimentId: z.string().uuid(),
  amount: z.number().nonnegative(),
  currency: z.literal("KRW"),
  occurredAt: z.string().datetime(),
  verified: z.literal(true),
  source: z.enum(["affiliate_settlement", "order_backend"]),
  reference: z.string().min(1).max(300),
});
export function recordRevenue(input: unknown) {
  const r = revenueInput.parse(input);
  const e = get<Experiment>("experiment", r.experimentId);
  if (!e?.mediaId || e.testRun)
    throw new Error("실제 게시된 캠페인의 검증 주문만 기록합니다.");
  return transaction(() => {
    const old = get("revenue", r.orderId);
    if (old) return { duplicate: true };
    put("revenue", { ...r, id: r.orderId });
    return { duplicate: false };
  });
}
export async function missionReport(now = Date.now()) {
  const m = await missionConfig(),
    start = Date.parse(m.starts_at),
    end = Date.parse(m.ends_at);
  const within = (at: number) => at >= start && at <= Math.min(now, end);
  const runs = all<LoopRun>("loop").filter(
    (r) => r.mode === "live" && within(r.createdAt),
  );
  const ids = new Set(runs.map((r) => r.id));
  const exp = all<Experiment>("experiment").filter(
    (e) => !e.testRun && e.loopRunId && ids.has(e.loopRunId),
  );
  const eids = new Set(exp.map((e) => e.id));
  const events = all<Event & { id: string }>("event").filter(
    (e) => eids.has(e.experimentId) && within(Date.parse(e.occurredAt)),
  );
  const cohorts = funnel(events, Math.min(now, end));
  const published = exp.filter(
    (e) => e.mediaId && e.publishedAt && within(e.publishedAt),
  );
  const urls = new Set<string>();
  for (const r of runs)
    for (const sig of r.signals || [])
      if (sig.qualified) {
        const src = r.sources?.find((s) => s.id === sig.sourceId);
        if (src?.provenance === "tavily_live") urls.add(src.url);
      }
  const improved = runs.filter(
    (r) =>
      r.decision?.change === "hook" &&
      r.decision.nextRunId &&
      r.steps.find((s) => s.stage === "learn")?.status === "succeeded" &&
      runs
        .find((n) => n.id === r.decision!.nextRunId)
        ?.steps.find((s) => s.stage === "research")?.status === "succeeded",
  );
  const revenue = all<z.infer<typeof revenueInput> & { id: string }>(
    "revenue",
  ).filter(
    (r) =>
      r.verified &&
      eids.has(r.experimentId) &&
      within(Date.parse(r.occurredAt)),
  );
  const active = runs.filter(
    (r) => !r.cancelled && r.steps.some((s) => s.status !== "succeeded"),
  );
  return {
    generatedAt: new Date(now).toISOString(),
    window: {
      startsAt: m.starts_at,
      endsAt: m.ends_at,
      timezone: m.evaluation_timezone,
      closed: now >= end,
    },
    product: m.product,
    repository: m.repository,
    goals: m.goals,
    baseline: m.baseline,
    metrics: {
      attributed_new_activated_users: {
        value: cohorts.activated,
        target: m.goals.attributed_new_activated_users,
        measurement: events.length ? "receiving_verified_events" : "no_app_events_received",
      },
      confirmed_publications: {
        value: published.length,
        target: m.goals.confirmed_publications,
        measurement: "confirmed_media_ids",
      },
      evidence_backed_iterations: {
        value: improved.length,
        target: m.goals.evidence_backed_iterations,
        measurement: "observed_decision_and_next_research",
      },
      qualified_independent_signals: {
        value: urls.size,
        target: m.goals.qualified_independent_signals,
        measurement: "unique_live_source_urls",
      },
    },
    cohorts,
    views: published.reduce(
      (sum, e) => sum + (e.metrics?.values.views || 0),
      0,
    ),
    viewsMeasuredPosts: published.filter(
      (e) => typeof e.metrics?.values.views === "number",
    ).length,
    verifiedRevenue: {
      amount: revenue.reduce((sum, r) => sum + r.amount, 0),
      currency: "KRW",
      orders: revenue.length,
      source: revenue.length ? "verified_ledger" : "no_verified_orders",
    },
    actualSpendUsd: null,
    liveRuns: runs.length,
    testRunsExcluded: all<LoopRun>("loop").filter((r) => r.mode === "test")
      .length,
    active: active.map((r) => ({
      id: r.id,
      round: r.round,
      stage: r.steps.find((s) => s.status !== "succeeded")?.stage,
      status: r.steps.find((s) => s.status !== "succeeded")?.status,
      message: r.steps.find((s) => s.status !== "succeeded")?.message,
      paused: r.paused,
    })),
    published: published.map((e) => ({
      experimentId: e.id,
      mediaId: e.mediaId,
      permalink: e.permalink,
      publishedAt: e.publishedAt,
    })),
    improvements: improved.map((r) => ({
      runId: r.id,
      nextRunId: r.decision!.nextRunId,
      reason: r.decision!.reason,
    })),
    runner:
      get<{
        id: string;
        heartbeat: number;
        startedAt: number;
        message: string;
      }>("system", "seven-day-runner") || null,
  };
}
function credentialEvents() {
  return !!process.env.GTM_EVENTS_TOKEN;
}
export async function saveDailyReport() {
  const report = await missionReport();
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await fs.mkdir("reports", { recursive: true });
  await fs.writeFile(
    path.join("reports", day + ".json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  put("daily-report", { id: day, ...report });
  return report;
}
export async function missionTick(demoAsset: string, demoSeconds = 12) {
  const m = await missionConfig(),
    now = Date.now();
  const old = get<{
    id: string;
    startedAt: number;
    lastDay?: string;
    lastRootId?: string;
    contextRunId?: string;
  }>("system", "seven-day-runner");
  const state = {
    id: "seven-day-runner",
    startedAt: old?.startedAt || now,
    lastDay: old?.lastDay,
    lastRootId: old?.lastRootId,
    contextRunId: old?.contextRunId,
    heartbeat: now,
    message: "",
  };
  if (now >= Date.parse(m.ends_at)) {
    put("system", {
      ...state,
      message: "평가 기간 종료. 새 유료 생성과 게시를 중단합니다.",
    });
    return false;
  }
  if (now < Date.parse(m.starts_at)) {
    put("system", { ...state, message: "평가 기간 시작 대기." });
    return false;
  }
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const report = await missionReport();
  if (
    report.metrics.confirmed_publications.value >=
    m.goals.confirmed_publications
  ) {
    put("system", {
      ...state,
      message: "게시 목표 도달. 새 루트 실행 없이 관측을 유지합니다.",
    });
    return true;
  }
  const own = old?.lastRootId
    ? all<LoopRun>("loop").filter((r) => r.rootId === old.lastRootId)
    : [];
  if (own.some((r) => r.cancelled || r.paused)) {
    put("system", {
      ...state,
      message:
        "운영자가 중단·정지한 루프가 있습니다. 자동으로 새 루프를 만들지 않습니다.",
    });
    return true;
  }
  if (own.some((r) => r.steps.some((s) => s.status !== "succeeded"))) {
    put("system", {
      ...state,
      message: "진행 중 루프의 연결·검토·관측을 기다립니다.",
    });
    return true;
  }
  if (own.some((r) => r.decision?.change === "onboarding")) {
    put("system", {
      ...state,
      message: "활성화 병목을 수정하기 전까지 추가 제작을 보류합니다.",
    });
    return true;
  }
  if (old?.lastDay !== day) {
    const remaining =
      m.goals.confirmed_publications -
      report.metrics.confirmed_publications.value;
    const run = createLoop({
      productUrl: m.product_url,
      demoAsset,
      demoSeconds,
      autoLoop: true,
      publishMode:
        process.env.GTM_PUBLISH_MODE === "automatic" ? "automatic" : "review",
      maxRounds: Math.min(3, remaining),
      maxGenerationRequests: Math.min(6, remaining * 2),
    });
    const last = own.sort((a, b) => b.round - a.round)[0];
    if (last) updateLoop(run.id, (r) => ({ ...r, contextRunId: last.id }));
    put("system", {
      ...state,
      lastDay: day,
      lastRootId: run.id,
      message:
        "오늘의 루프를 시작했습니다. 키가 없으면 해당 단계에서 중단합니다.",
    });
  } else
    put("system", {
      ...state,
      message: "오늘의 루트를 완료했습니다. 다음 한국 날짜에 다시 조사합니다.",
    });
  return true;
}
