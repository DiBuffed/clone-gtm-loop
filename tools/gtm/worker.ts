import {
  claim,
  finishJob,
  get,
  enqueue,
  patchExperiment,
  consumeGenerationSlot,
  all,
  put,
} from "../../src/server/gtm/store";
import {
  type Campaign,
  type Experiment,
  type Job,
} from "../../src/server/gtm/model";
import { render } from "../../src/server/gtm/media";
import { signedMediaUrl } from "../../src/server/gtm/auth";
import {
  submitHook,
  pollHook,
  downloadHook,
  createContainer,
  publishContainer,
  ig,
  insights,
  UncertainMutation,
} from "../../src/server/gtm/providers";
import { tickLoops } from "../../src/server/gtm/loop/engine";
import { nextExperiment, start } from "../../src/server/gtm/service";

export async function execute(job: Job, allowTest = false) {
  let e = get<Experiment>("experiment", job.experimentId);
  if (!e) throw new Error("실험이 없습니다.");
  if (e.testRun && !allowTest)
    throw new Error("테스트 루프는 라이브 워커에서 실행하지 않습니다.");
  if (job.action === "generate") {
    if (!e.providerId) {
      if (!e.referenceAsset) throw new Error("페르소나 이미지가 없습니다.");
      const c = get<Campaign>("campaign", e.campaignId)!;
      consumeGenerationSlot();
      const spoken = (e.introMode ?? "spoken") === "spoken";
      const prompt = spoken
        ? `${c.persona}. Vertical 9:16 presenter video. Say this Korean sentence clearly within the first 2.5 seconds, then pause: "${e.hook}". Natural expression. No text overlays. No claims of personal product usage. Keep the reference person's appearance.`
        : `${c.persona}. Vertical 9:16 close-up selfie, lens at arm's length. Silent nonverbal reaction: quiet surprise, eyes slightly wider, brows gently lifted, then an unhurried hand covering the mouth and soft understated facepalm with a faint pleased smile. Small head motion and slight handheld drift. Deep depth of field, subject and background sharp. Complete the reaction within the first 3 seconds. No speech, no lip-sync, no text overlays. Keep the reference person's appearance.`;
      const id = await submitHook(
        prompt,
        signedMediaUrl(e.referenceAsset),
        spoken,
      );
      e = patchExperiment(e.id, { providerId: id, state: "generating" });
    }
    const result = await pollHook(e.providerId!);
    if (["queued", "in_progress"].includes(result.status)) {
      if (Date.now() - e.createdAt > 24 * 3600000)
        throw new Error(
          "생성이 24시간 대기 중입니다. 잔액·공급자 상태를 확인하세요. 기존 작업 ID는 보존됩니다.",
        );
      finishJob(job.id, "queued", undefined, Date.now() + 15000);
      return;
    }
    if (result.status !== "completed" || typeof result.video?.url !== "string")
      throw new Error(
        "Higgsfield 생성이 완료되지 않았습니다. 공급자 작업을 확인하세요.",
      );
    const asset = await downloadHook(result.video.url);
    patchExperiment(e.id, { hookAsset: asset.id, state: "rendering" });
    enqueue(e.id, "render");
  } else if (job.action === "render") {
    if (e.outputAsset) {
      finishJob(job.id, "done");
      return;
    }
    const output = await render(e);
    const c = get<Campaign>("campaign", e.campaignId)!;
    const auto = !!e.parentId && c.autoPublish;
    patchExperiment(e.id, { ...output, state: auto ? "approved" : "review" });
    if (auto) enqueue(e.id, "publish");
  } else if (job.action === "publish") {
    if (e.mediaId) {
      finishJob(job.id, "done");
      return;
    }
    if (!e.outputAsset) throw new Error("완성 영상이 없습니다.");
    if (!e.containerId) {
      if (e.state !== "approved")
        throw new Error("승인한 영상만 게시할 수 있습니다.");
      const id = await createContainer(
        signedMediaUrl(e.outputAsset),
        e.caption,
      );
      e = patchExperiment(e.id, { containerId: id });
    }
    const r = await ig(e.containerId!, { fields: "status_code" });
    if (["IN_PROGRESS"].includes(r.status_code)) {
      if (job.attempts > 120)
        throw new Error(
          "Instagram 처리 시간이 초과되었습니다. 컨테이너 상태를 확인하세요.",
        );
      finishJob(job.id, "queued", undefined, Date.now() + 30000);
      return;
    }
    if (r.status_code === "PUBLISHED")
      throw new UncertainMutation(
        "이미 게시된 컨테이너입니다. 게시물 ID를 확인하여 복구하세요.",
      );
    if (r.status_code !== "FINISHED")
      throw new Error("Instagram 컨테이너가 게시 가능한 상태가 아닙니다.");
    patchExperiment(e.id, { state: "publishing" });
    const mediaId = await publishContainer(e.containerId!);
    // Persist publication before fetching optional metadata: metadata failure must never repost.
    patchExperiment(e.id, {
      mediaId,
      state: "published",
      publishedAt: Date.now(),
    });
    try {
      const info = await ig(mediaId, { fields: "permalink" });
      patchExperiment(e.id, { permalink: info.permalink });
    } catch {
      /* metrics can retry metadata */
    }
    enqueue(e.id, "metrics", Date.now() + 60000);
  } else {
    if (!e.mediaId) throw new Error("게시물 ID가 없습니다.");
    const metrics = await insights(e.mediaId);
    patchExperiment(e.id, { metrics });
    if (!e.permalink) {
      try {
        const info = await ig(e.mediaId, { fields: "permalink" });
        patchExperiment(e.id, { permalink: info.permalink });
      } catch {
        /* keep publication */
      }
    }
    // Refresh hourly for seven days. Unsupported metrics remain explicitly unavailable.
    if (e.publishedAt && Date.now() - e.publishedAt < 7 * 86400000) {
      finishJob(job.id, "queued", undefined, Date.now() + 3600000);
      return;
    }
  }
  finishJob(job.id, "done");
}
export async function tick() {
  put("system", { id: "worker", heartbeat: Date.now() });
  const job = claim();
  if (job) {
    try {
      await execute(job);
    } catch (error) {
      const uncertain = error instanceof UncertainMutation;
      finishJob(
        job.id,
        uncertain ? "needs_attention" : "failed",
        error instanceof Error ? error.message : "작업 실패",
      );
      if (job.action !== "metrics")
        patchExperiment(job.experimentId, {
          state: uncertain ? "needs_attention" : "failed",
        });
    }
  }
  for (const c of all<Campaign>("campaign").filter((c) => c.autoIterate)) {
    for (const e of all<Experiment>("experiment").filter(
      (e) =>
        e.campaignId === c.id &&
        e.state === "published" &&
        !e.nextId &&
        e.round < c.maxRounds,
    )) {
      try {
        const next = nextExperiment(e.id);
        if (next.hookAsset && next.demoAsset) start(next.id, "render");
        else if (next.referenceAsset && next.demoAsset)
          start(next.id, "generate");
      } catch {
        /* waiting for evidence, limits, or operator configuration */
      }
    }
  }
  await tickLoops();
  return !!job;
}
async function main() {
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  console.log("UGC-Z GTM worker started (durable SQLite queue).");
  while (!stopping) {
    try {
      await tick();
    } catch {
      console.error(
        "Worker tick failed; retrying without exposing provider credentials.",
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/gtm/worker.ts"))
  void main();
