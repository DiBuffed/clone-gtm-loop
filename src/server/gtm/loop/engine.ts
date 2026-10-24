import {
  createCampaign,
  createExperiment,
  start,
  approve,
  stats,
} from "../service";
import {
  all,
  get,
  put,
  transaction,
  consumeGenerationSlot,
  jobs,
} from "../store";
import { credential } from "../credentials";
import {
  api,
  hfHeaders,
  pollHook,
  downloadHook,
  submitHook,
  UncertainMutation,
} from "../providers";
import { signedMediaUrl } from "../auth";
import type { Experiment } from "../model";
import {
  Blocked,
  Waiting,
  type LoopRun,
  type Stage,
  type Decision,
} from "./model";
import {
  claimLoop,
  updateLoop,
  recordStep,
  consumeRunGeneration,
  createLoop,
} from "./store";
import {
  readProduct,
  searchAudience,
  initialQueries,
  extractSignals,
  qualify,
  planAudience,
} from "./research";
const latest = (id: string) => get<LoopRun>("loop", id)!;
const step = (r: LoopRun, s: Stage) => r.steps.find((x) => x.stage === s)!;
function done(id: string, stage: Stage, output: unknown, message: string) {
  recordStep(
    id,
    stage,
    { status: "succeeded", finishedAt: Date.now(), output, message },
    message,
  );
}
function parentOf(r: LoopRun) {
  const id=r.parentId||r.contextRunId; return id ? get<LoopRun>("loop", id) : undefined;
}
function checkGenerationConfig() {
  if (!credential("HF_API_KEY"))
    throw new Blocked("Higgsfield API 키를 연결하세요.");
}
async function generated(r: LoopRun, stage: "persona" | "intro") {
  const current = step(r, stage),
    parent = parentOf(r);
  if (
    parent?.decision?.change === "hook" &&
    parent.plan?.pain === r.plan?.pain
  ) {
    const asset =
      stage === "persona" ? parent.referenceAsset : parent.hookAsset;
    if (asset) {
      updateLoop(r.id, (x) => ({
        ...x,
        ...(stage === "persona"
          ? { referenceAsset: asset }
          : { hookAsset: asset }),
      }));
      done(
        r.id,
        stage,
        { assetId: asset, reusedFrom: parent.id },
        "동일 고객·페르소나를 유지하고 검증된 자산을 재사용했습니다.",
      );
      return;
    }
  }
  checkGenerationConfig();
  let providerId = current.providerId;
  if (!providerId) {
    consumeRunGeneration(r.id);
    consumeGenerationSlot();
    recordStep(
      r.id,
      stage,
      {
        mutationStartedAt: Date.now(),
        input:
          stage === "persona"
            ? {
                prompt: r.plan!.persona.appearancePrompt,
                model: "higgsfield-ai/soul/standard",
              }
            : {
                referenceAsset: r.referenceAsset,
                prompt: r.plan!.persona.context,
                model: "bytedance/seedance-2.0/image-to-video",
              },
      },
      "외부 생성 요청을 제출합니다.",
    );
    if (stage === "persona") {
      const result = await api(
        "https://api.higgsfield.ai/higgsfield-ai/soul/standard",
        {
          method: "POST",
          headers: hfHeaders(),
          body: JSON.stringify({
            prompt: r.plan!.persona.appearancePrompt,
            aspect_ratio: "9:16",
            resolution: "720p",
            batch_size: 1,
            enhance_prompt: false,
          }),
        },
        true,
      );
      if (typeof result.request_id !== "string")
        throw new UncertainMutation(
          "페르소나 생성의 원격 작업 ID를 확인해야 합니다.",
        );
      providerId = result.request_id;
    } else {
      if (!r.referenceAsset)
        throw new Error("생성한 페르소나 이미지가 없습니다.");
      const prompt = `${r.plan!.persona.context}. Vertical close-up at arm's length. Silent reaction: listening, quiet surprise, subtle lifted brows, hand covers mouth, then a soft understated facepalm and faint pleased smile. Small head movement, slight handheld drift. Deep depth of field. Finish reaction within first 3 seconds. No speech, no text, no testimonial. Keep exactly the reference person's appearance.`;
      recordStep(r.id, stage, {
        input: { prompt, referenceAsset: r.referenceAsset },
      });
      providerId = await submitHook(
        prompt,
        signedMediaUrl(r.referenceAsset),
        false,
      );
    }
    recordStep(r.id, stage, { providerId });
  }
  const result = await pollHook(providerId!);
  if (["queued", "in_progress"].includes(result.status))
    throw new Waiting(
      "공급자에서 생성 중입니다. 저장한 작업 ID로 진행 상황을 조회합니다.",
      15000,
    );
  if (result.status !== "completed")
    throw new Error(
      "외부 생성이 완료되지 않았습니다. 공급자 상태를 확인하세요.",
    );
  const url = stage === "persona" ? result.images?.[0]?.url : result.video?.url;
  if (typeof url !== "string")
    throw new Error("생성 결과에 필요한 미디어가 없습니다.");
  const asset = await downloadHook(
    url,
    stage === "persona" ? "reference" : "hook",
  );
  updateLoop(r.id, (x) => ({
    ...x,
    ...(stage === "persona"
      ? { referenceAsset: asset.id }
      : { hookAsset: asset.id }),
  }));
  done(
    r.id,
    stage,
    {
      assetId: asset.id,
      providerId,
      model:
        stage === "persona"
          ? "higgsfield-ai/soul/standard"
          : "bytedance/seedance-2.0/image-to-video",
    },
    stage === "persona"
      ? "타깃 맥락을 반영한 가상 성인 페르소나 이미지를 생성했습니다."
      : "같은 페르소나로 무음 리액션 영상을 생성했습니다.",
  );
}
function ensureExperiment(r: LoopRun) {
  return transaction(() => {
    const current = latest(r.id);
    if (current.experimentId)
      return get<Experiment>("experiment", current.experimentId)!;
    const campaign = createCampaign({
      name: `${r.product!.title.slice(0, 60)} · 루프 ${r.round}`,
      customer: r.plan!.segment,
      persona: r.plan!.persona.context,
      destination: r.config.productUrl,
      autoIterate: false,
      autoPublish: false,
      maxRounds: 1,
    });
    const e = createExperiment(campaign.id, {
      hook: r.plan!.hook,
      cta: r.plan!.cta,
      caption: r.plan!.caption,
      introMode: "reaction",
      hookStartSeconds: 0,
      hookAsset: r.hookAsset,
      referenceAsset: r.referenceAsset,
      demoAsset: r.config.demoAsset,
      demoSeconds: r.config.demoSeconds,
    });
    put("experiment", { ...e, loopRunId: r.id, testRun: r.mode === "test" });
    put("loop", { ...current, campaignId: campaign.id, experimentId: e.id });
    return e;
  });
}
function experimentFailure(e: Experiment) {
  if (e.state === "needs_attention")
    throw new Blocked(
      "외부 요청 결과 확인이 필요합니다. 제작 화면에서 원격 ID를 복구하세요.",
    );
  if (e.state === "failed") {
    const job = jobs().find((j) => j.experimentId === e.id && j.error);
    throw new Blocked(
      job?.error || "제작 작업이 실패했습니다. 작업 기록을 확인하세요.",
    );
  }
}
async function perform(r: LoopRun, stage: Stage) {
  if (stage === "product") {
    recordStep(r.id, stage, { input: { url: r.config.productUrl } });
    const product = await readProduct(r.config.productUrl);
    updateLoop(r.id, (x) => ({ ...x, product }));
    done(
      r.id,
      stage,
      { title: product.title, facts: product.facts },
      "제품 페이지에서 확인한 기능만 판매 근거로 고정했습니다.",
    );
  } else if (stage === "research") {
    const parent = parentOf(r);
    const queries = parent?.decision?.nextQueries.length
      ? parent.decision.nextQueries
      : initialQueries;
    const expanded =
      r.researchAttempts === 0
        ? queries
        : queries.map(
            (q) =>
              q + (r.researchAttempts === 1 ? " 불편 후기" : " 다시 찾기 어렵"),
          );
    recordStep(r.id, stage, {
      input: {
        queries: expanded,
        recencyDays: r.config.recencyDays,
        attempt: r.researchAttempts + 1,
      },
    });
    const found = await searchAudience(expanded);
    const sources =
      r.mode === "test"
        ? found.map((s) => ({ ...s, provenance: "test_fixture" as const }))
        : found;
    updateLoop(r.id, (x) => ({
      ...x,
      sources,
      researchAttempts: x.researchAttempts + 1,
    }));
    done(
      r.id,
      stage,
      { queries: expanded, sourceCount: sources.length, sources },
      `공개 검색 원문 ${sources.length}건을 저장했습니다. 아직 고객으로 확정하지 않았습니다.`,
    );
  } else if (stage === "qualify") {
    if (!r.sources?.length) {
      if (r.researchAttempts < 3) {
        updateLoop(r.id, (x) => ({
          ...x,
          nextAt: Date.now() + 15000,
          steps: x.steps.map((s) =>
            s.stage === "research" || s.stage === "qualify"
              ? { ...s, status: "pending" }
              : s,
          ),
        }));
        return;
      }
      throw new Blocked("검색 결과가 없습니다. 세 번의 조사 후 중단했습니다.");
    }
    recordStep(r.id, stage, {
      input: {
        sourceIds: r.sources.map((s) => s.id),
        recencyDays: r.config.recencyDays,
        productFactIds: r.product!.facts.map((f) => f.id),
      },
    });
    const extracted = await extractSignals(r);
    const signals = qualify(
      r.sources,
      extracted.signals,
      r.product!.facts,
      r.config.recencyDays,
    );
    updateLoop(r.id, (x) => ({ ...x, signals }));
    const n = signals.filter((s) => s.qualified).length;
    recordStep(r.id, stage, {
      output: {
        qualified: n,
        total: signals.length,
        signals,
        minimum: r.config.minSignals,
      },
    });
    if (n < r.config.minSignals) {
      if (r.researchAttempts < 3) {
        updateLoop(r.id, (x) => ({
          ...x,
          nextAt: Date.now() + 15000,
          steps: x.steps.map((s) =>
            s.stage === "research" || s.stage === "qualify"
              ? {
                  ...s,
                  status: "pending",
                  message: "근거가 부족해 검색어를 넓혀 다시 조사합니다.",
                }
              : s,
          ),
        }));
        return;
      }
      throw new Blocked(
        `세 번 조사했지만 통과 신호가 ${n}건입니다. 최소 ${r.config.minSignals}건이 필요하며 UNKNOWN을 통과로 계산하지 않습니다.`,
      );
    }
    done(
      r.id,
      stage,
      {
        qualified: n,
        total: signals.length,
        signals,
        minimum: r.config.minSignals,
      },
      `독립 원문의 적합 신호 ${n}건을 확인했습니다. 사람 수나 고객 전환 수로 세지 않습니다.`,
    );
  } else if (stage === "strategy") {
    recordStep(r.id, stage, {
      input: {
        qualifiedSourceIds: r
          .signals!.filter((s) => s.qualified)
          .map((s) => s.sourceId),
        productFactIds: r.product!.facts.map((f) => f.id),
        parentDecision: parentOf(r)?.decision || null,
      },
    });
    const plan = await planAudience(r, parentOf(r));
    updateLoop(r.id, (x) => ({ ...x, plan }));
    done(
      r.id,
      stage,
      plan,
      "통과한 원문과 제품 기능에 연결된 타깃·가상 페르소나·훅·CTA를 설계했습니다.",
    );
  } else if (stage === "persona" || stage === "intro")
    await generated(r, stage);
  else if (stage === "compose") {
    if (!r.plan || !r.hookAsset || !r.referenceAsset)
      throw new Error("전략·페르소나·인트로 자산이 필요합니다.");
    const e = ensureExperiment(r);
    experimentFailure(e);
    if (e.state === "draft") {
      start(e.id, "render");
      throw new Waiting(
        "인트로·실제 시연·CTA 합성 작업을 워커에 전달했습니다.",
        1000,
      );
    }
    if (!e.outputAsset)
      throw new Waiting("FFmpeg가 업로드 가능한 MP4를 만들고 있습니다.", 1000);
    done(
      r.id,
      stage,
      { experimentId: e.id, assetId: e.outputAsset, checks: e.checks },
      "실제 MP4를 만들고 규격·길이·오디오를 검사했습니다.",
    );
  } else if (stage === "publish") {
    recordStep(r.id, stage, {
      input: {
        experimentId: r.experimentId,
        platform: "Instagram",
        policy: r.config.publishMode,
      },
    });
    const e = get<Experiment>("experiment", r.experimentId!)!;
    experimentFailure(e);
    if (e.mediaId && e.state === "published") {
      done(
        r.id,
        stage,
        {
          mediaId: e.mediaId,
          permalink: e.permalink,
          experimentId: e.id,
          publishedAt: e.publishedAt,
        },
        "실제 게시물 ID를 확인했습니다.",
      );
      return;
    }
    if (e.state === "review") {
      if (r.config.publishMode === "review")
        throw new Blocked(
          "영상 검토 대기입니다. 실행 화면에서 정확성과 소재 권한을 확인하고 승인하세요.",
        );
      approve(e.id);
    }
    if (
      !credential("IG_ACCESS_TOKEN") ||
      !credential("IG_USER_ID") ||
      !credential("IG_GRAPH_VERSION")
    )
      throw new Blocked("Instagram 계정·권한·Graph 버전을 연결하세요.");
    const current = get<Experiment>("experiment", e.id)!;
    if (current.state === "approved") start(e.id, "publish");
    throw new Waiting("실제 Instagram 처리·게시 결과를 기다립니다.", 15000);
  } else if (stage === "measure") {
    const e = get<Experiment>("experiment", r.experimentId!)!;
    if (!e.publishedAt)
      throw new Blocked("실제 게시 시각이 없어 관찰을 시작할 수 없습니다.");
    const elapsed = (Date.now() - e.publishedAt) / 60000,
      s = stats(e.id),
      view = e.metrics?.values.views ?? null;
    const test = r.mode === "test" ? r.testMetrics : undefined;
    const output = {
      actual: { ...s, views: r.mode === "test" ? null : view },
      test: test || null,
      source: r.mode === "test" ? "test_fixture" : "app_events_and_instagram",
      observedMinutes: elapsed,
      minimumMinutes: r.config.observationMinutes,
      minimumVisitors: r.config.minVisitors,
      trackingPath: `/r/${e.id}`,
      attribution: "연결된 앱 이벤트만 집계. 앱스토어 이동은 설치·구매가 아님.",
    };
    recordStep(r.id, stage, { output });
    if (elapsed < r.config.observationMinutes)
      throw new Waiting(
        `최소 ${r.config.observationMinutes}분 관찰 중입니다. 아직 성과 우열을 판정하지 않습니다.`,
        60000,
      );
    done(
      r.id,
      stage,
      output,
      "고유 브라우저 방문·신규 적합 활성·관찰이 끝난 재사용을 집계했습니다.",
    );
  } else {
    const e = get<Experiment>("experiment", r.experimentId!)!,
      s = stats(e.id);
    const values =
      r.mode === "test" && r.testMetrics
        ? r.testMetrics
        : {
            visits: s.clicks,
            activated: s.activated,
            views: e.metrics?.values.views ?? null,
          };
    const decision: Decision = {
      change:
        values.visits < r.config.minVisitors
          ? "wait"
          : values.activated === 0
            ? "onboarding"
            : r.round >= r.config.maxRounds
              ? "stop"
              : "hook",
      reason: "",
      nextQueries: r.plan!.nextQueries,
      evidence: {
        ...values,
        observationMinutes:
          (Date.now() - (e.publishedAt || Date.now())) / 60000,
      },
    };
    decision.reason =
      decision.change === "wait"
        ? `방문 ${values.visits}건으로 최소 ${r.config.minVisitors}건에 못 미칩니다. 표본을 기다리며 추가 제작비를 쓰지 않습니다.`
        : decision.change === "onboarding"
          ? "방문 이후 활성화가 없어 도착 화면과 첫 사용 경로 점검을 우선합니다."
          : decision.change === "stop"
            ? "설정한 반복 한도에 도달했습니다."
            : "활성 고객이 관측됐습니다. 승자 확정 없이 같은 고객·페르소나에서 새 근거와 훅을 탐색합니다.";
    updateLoop(r.id, (x) => ({ ...x, decision }));
    recordStep(r.id, stage, { output: decision });
    if (decision.change === "wait") throw new Waiting(decision.reason, 60000);
    done(r.id, stage, decision, decision.reason);
    if (decision.change === "hook" && r.config.autoLoop) {
      const next = createLoop(r.config, latest(r.id), r.mode);
      recordStep(
        r.id,
        stage,
        { output: { ...decision, nextRunId: next.id } },
        "성과 근거를 보존하고 다음 루프의 고객 조사로 연결했습니다.",
      );
    }
  }
}
export async function tickLoops(options: { allowTest?: boolean } = {}) {
  const claimed = claimLoop(Date.now(), options.allowTest);
  if (!claimed) return false;
  const { run, stage } = claimed;
  try {
    await perform(run, stage);
    updateLoop(run.id, (r) => ({
      ...r,
      leaseUntil: 0,
      nextAt: Math.max(r.nextAt, Date.now()),
    }));
  } catch (error) {
    const status =
      error instanceof Waiting
        ? "waiting"
        : error instanceof Blocked
          ? "blocked"
          : error instanceof UncertainMutation
            ? "needs_attention"
            : "failed";
    const message = error instanceof Error ? error.message : "단계 실행 실패";
    const current = latest(run.id);
    const changed = step(current, stage).message !== message;
    recordStep(
      run.id,
      stage,
      { status, message },
      changed ? message : undefined,
    );
    updateLoop(run.id, (r) => ({
      ...r,
      leaseUntil: 0,
      nextAt: Date.now() + (error instanceof Waiting ? error.delayMs : 0),
    }));
  }
  return true;
}
export async function recoverLoop(
  id: string,
  stage: "persona" | "intro",
  providerId: string,
) {
  const r = latest(id);
  if (
    !r ||
    r.mode !== "live" ||
    r.leaseUntil > Date.now() ||
    step(r, stage).status !== "needs_attention"
  )
    throw new Error("복구할 생성 단계가 없습니다.");
  await pollHook(providerId);
  recordStep(id, stage, {
    providerId,
    status: "waiting",
    message: "원격 작업 ID를 확인했습니다.",
  });
  updateLoop(id, (r) => ({ ...r, nextAt: Date.now() }));
}
