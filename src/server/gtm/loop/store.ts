import { randomUUID } from "node:crypto";
import { all, get, put, transaction } from "../store";
import { loopConfig, stages, type LoopRun, type Stage } from "./model";
import { assetPath } from "../media";
export function createLoop(
  input: unknown,
  parent?: LoopRun,
  mode: "live" | "test" = "live",
) {
  const config = loopConfig.parse(input);
  assetPath(config.demoAsset, "demo");
  return transaction(() => {
    if (parent) {
      const current = get<LoopRun>("loop", parent.id);
      if (current?.decision?.nextRunId)
        return get<LoopRun>("loop", current.decision.nextRunId)!;
      if (parent.round >= parent.config.maxRounds)
        throw new Error("루프 반복 한도에 도달했습니다.");
    }
    const id = randomUUID(),
      now = Date.now();
    const run: LoopRun = {
      id,
      rootId: parent?.rootId || id,
      parentId: parent?.id,
      round: parent ? parent.round + 1 : 1,
      mode,
      createdAt: now,
      updatedAt: now,
      nextAt: now,
      leaseUntil: 0,
      paused: false,
      cancelled: false,
      config,
      generationRequests: 0,
      researchAttempts: 0,
      steps: stages.map((stage) => ({ stage, status: "pending", attempts: 0 })),
      history: [],
    };
    put("loop", run);
    if (parent) {
      const p = get<LoopRun>("loop", parent.id)!;
      put("loop", { ...p, decision: { ...p.decision!, nextRunId: id } });
    }
    return run;
  });
}
export function updateLoop(id: string, fn: (r: LoopRun) => LoopRun) {
  return transaction(() => {
    const r = get<LoopRun>("loop", id);
    if (!r) throw new Error("루프가 없습니다.");
    return put("loop", { ...fn(r), updatedAt: Date.now() });
  });
}
export function recordStep(
  id: string,
  stage: Stage,
  patch: Partial<LoopRun["steps"][number]>,
  message?: string,
) {
  return updateLoop(id, (r) => ({
    ...r,
    steps: r.steps.map((s) => (s.stage === stage ? { ...s, ...patch } : s)),
    history: message
      ? [...r.history.slice(-199), { at: Date.now(), stage, message }]
      : r.history,
  }));
}
export function claimLoop(now = Date.now(), allowTest = false) {
  return transaction(() => {
    const runs = all<LoopRun>("loop")
      .filter(
        (r) =>
          !r.paused &&
          !r.cancelled &&
          r.nextAt <= now &&
          (r.mode === "live" || allowTest),
      )
      .sort((a, b) => a.nextAt - b.nextAt || a.createdAt - b.createdAt);
    for (const r of runs) {
      if (r.leaseUntil > now) continue;
      const s = r.steps.find((s) => s.status !== "succeeded");
      if (!s || ["blocked", "failed", "needs_attention"].includes(s.status))
        continue;
      if (s.status === "running" && s.mutationStartedAt && !s.providerId) {
        s.status = "needs_attention";
        s.message =
          "중단된 외부 생성 요청의 원격 결과를 확인하세요. 자동 재제출하지 않습니다.";
        put("loop", { ...r, steps: r.steps, leaseUntil: 0 });
        continue;
      }
      s.status = "running";
      s.startedAt ??= now;
      s.attempts++;
      r.leaseUntil = now + 15 * 60000;
      r.updatedAt = now;
      put("loop", r);
      return { run: r, stage: s.stage };
    }
  });
}
export function controlLoop(id: string, action: "resume" | "pause" | "cancel") {
  return updateLoop(id, (r) => {
    if (r.mode === "test")
      throw new Error("검증 리플레이는 라이브로 재개할 수 없습니다.");
    if (r.leaseUntil > Date.now())
      throw new Error("현재 단계 실행이 끝난 뒤 제어하세요.");
    if (action === "cancel") return { ...r, cancelled: true, paused: true };
    if (action === "pause") return { ...r, paused: true };
    const s = r.steps.find((s) => s.status !== "succeeded");
    if (s?.status === "needs_attention")
      throw new Error("원격 작업 ID를 복구한 뒤 재개하세요.");
    return {
      ...r,
      paused: false,
      nextAt: Date.now(),
      steps: r.steps.map((x) =>
        x === s ? { ...x, status: "pending" as const, message: undefined } : x,
      ),
    };
  });
}
export function consumeRunGeneration(id: string) {
  updateLoop(id, (r) => {
    if (r.generationRequests >= r.config.maxGenerationRequests)
      throw new Error("루프의 생성 요청 한도에 도달했습니다.");
    return { ...r, generationRequests: r.generationRequests + 1 };
  });
}
export function loopList() {
  return all<LoopRun>("loop").map((r) => ({
    id: r.id,
    rootId: r.rootId,
    parentId: r.parentId,
    round: r.round,
    mode: r.mode,
    createdAt: r.createdAt,
    paused: r.paused,
    cancelled: r.cancelled,
    currentStage:
      r.steps.find((s) => s.status !== "succeeded")?.stage || "done",
    status:
      r.steps.find((s) => s.status !== "succeeded")?.status || "succeeded",
    productUrl: r.config.productUrl,
  }));
}
