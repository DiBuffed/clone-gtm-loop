import { randomUUID } from "node:crypto";
import {
  campaignInput,
  experimentInput,
  eventInput,
  hooks,
  funnel,
  decide,
  type Campaign,
  type Experiment,
  type Click,
  type Event,
} from "./model";
import {
  all,
  get,
  put,
  enqueue,
  transaction,
  db,
  eventsFor,
  clicksFor,
} from "./store";
import { assetPath } from "./media";
import { igBase } from "./providers";
import { credential } from "./credentials";
export function createCampaign(input: unknown) {
  return put<Campaign>("campaign", {
    ...campaignInput.parse(input),
    id: randomUUID(),
    createdAt: Date.now(),
  });
}
export function createExperiment(campaignId: string, input: unknown) {
  if (!get<Campaign>("campaign", campaignId))
    throw new Error("캠페인이 없습니다.");
  const parsed = experimentInput.parse(input);
  validateAssets(parsed);
  return put<Experiment>("experiment", {
    ...parsed,
    id: randomUUID(),
    campaignId,
    createdAt: Date.now(),
    round: 1,
    state: "draft",
  });
}
function validateAssets(p: {
  hookAsset?: string;
  demoAsset?: string;
  referenceAsset?: string;
}) {
  if (p.hookAsset) assetPath(p.hookAsset, "hook");
  if (p.demoAsset) assetPath(p.demoAsset, "demo");
  if (p.referenceAsset) assetPath(p.referenceAsset, "reference");
}
export function updateExperiment(id: string, input: unknown) {
  const p = experimentInput.parse(input);
  validateAssets(p);
  return transaction(() => {
    const e = get<Experiment>("experiment", id);
    if (!e || e.state !== "draft")
      throw new Error("초안만 수정할 수 있습니다.");
    return put("experiment", { ...e, ...p });
  });
}
export function start(id: string, action: "generate" | "render" | "publish") {
  return transaction(() => {
    const e = get<Experiment>("experiment", id);
    if (!e) throw new Error("실험이 없습니다.");
    if (action === "generate") {
      if (e.state !== "draft" || !e.referenceAsset || !e.demoAsset)
        throw new Error("초안에 페르소나 이미지와 앱 시연을 지정하세요.");
      if (!credential("HF_API_KEY"))
        throw new Error("HF_API_KEY를 먼저 연결하세요.");
      put("experiment", { ...e, state: "generating" });
    } else if (action === "render") {
      if (e.state !== "draft" || !e.hookAsset || !e.demoAsset)
        throw new Error("초안에 인트로와 앱 시연을 지정하세요.");
      put("experiment", { ...e, state: "rendering" });
    } else {
      if (e.state !== "approved" || !e.outputAsset || e.mediaId)
        throw new Error("검토·승인한 미게시 영상만 게시할 수 있습니다.");
      igBase();
      if (!credential("IG_ACCESS_TOKEN") || !credential("IG_USER_ID"))
        throw new Error("Instagram 연결이 필요합니다.");
      // State remains approved until the worker enters the irreversible publish call.
    }
    enqueue(id, action);
    return get<Experiment>("experiment", id)!;
  });
}
export function approve(id: string) {
  return transaction(() => {
    const e = get<Experiment>("experiment", id);
    if (!e || e.state !== "review" || !e.checks?.every((x) => x.pass))
      throw new Error("영상 검사 통과 후 승인할 수 있습니다.");
    return put("experiment", { ...e, state: "approved" });
  });
}
export function retry(id: string) {
  return transaction(() => {
    const j = db().prepare("SELECT * FROM jobs WHERE id=?").get(id) as
      | { status: string; action: string; experimentId: string }
      | undefined;
    if (!j || j.status !== "failed" || j.action === "publish")
      throw new Error(
        "이 작업은 자동 재시도할 수 없습니다. 원격 요청 상태를 먼저 확인하세요.",
      );
    const e = get<Experiment>("experiment", j.experimentId)!;
    if (j.action === "generate" && !e.providerId)
      throw new Error(
        "새 유료 요청은 기존 실험을 복제한 뒤 명시적으로 실행하세요.",
      );
    db()
      .prepare("UPDATE jobs SET status='queued',due=?,error=NULL WHERE id=?")
      .run(Date.now(), id);
    return { ok: true };
  });
}
export function recordEvent(input: unknown) {
  const e = eventInput.parse(input);
  const at = Date.parse(e.occurredAt);
  if (at > Date.now() + 60000 || at < Date.now() - 30 * 86400000)
    throw new Error("이벤트 시각은 최근 30일이어야 합니다.");
  return transaction(() => {
    const old = get<Event & { id: string }>("event", e.eventId);
    if (old) return { duplicate: true };
    const click = get<Click>("click", e.clickId);
    if (!click || at < click.createdAt - 60000)
      throw new Error("유효한 유입 ID 또는 이벤트 시각이 아닙니다.");
    const attribution =
      get<{ id: string; experimentId: string }>("user", e.userId) ??
      put("user", { id: e.userId, experimentId: click.experimentId });
    put("event", {
      ...e,
      id: e.eventId,
      experimentId: attribution.experimentId,
    });
    return { duplicate: false };
  });
}
export function stats(id: string) {
  const events = eventsFor(id);
  return { clicks: clicksFor(id).length, ...funnel(events) };
}
export function nextExperiment(id: string) {
  return transaction(() => {
    const e = get<Experiment>("experiment", id);
    if (!e) throw new Error("실험이 없습니다.");
    if (e.nextId) return get<Experiment>("experiment", e.nextId)!;
    const c = get<Campaign>("campaign", e.campaignId)!;
    if (e.round >= c.maxRounds)
      throw new Error("캠페인 반복 한도에 도달했습니다.");
    const s = stats(id),
      d = decide(e, s.clicks, s.activated);
    if (!d.ready || d.change !== "hook") throw new Error(d.reason);
    const nextHook =
      hooks[(Math.max(0, hooks.indexOf(e.hook)) + 1) % hooks.length];
    const next: Experiment = {
      ...experimentInput.parse({
        ...e,
        introMode: e.introMode ?? "spoken",
        hook: nextHook,
        hookAsset: e.introMode === "reaction" ? e.hookAsset : undefined,
      }),
      id: randomUUID(),
      campaignId: e.campaignId,
      createdAt: Date.now(),
      round: e.round + 1,
      parentId: e.id,
      state: "draft",
      decision: d.reason,
    };
    put("experiment", next);
    put("experiment", { ...e, nextId: next.id, decision: d.reason });
    return next;
  });
}
export function audit() {
  return all<Experiment>("experiment").map((e) => ({
    ...e,
    stats: stats(e.id),
    recommendation: decide(
      e,
      clicksFor(e.id).length,
      funnel(eventsFor(e.id)).activated,
    ),
  }));
}
