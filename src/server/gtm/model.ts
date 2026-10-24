import { z } from "zod";
export const hooks = [
  "저장한 레시피, 언제 해 먹어요?",
  "재료 보려고 또 돌려보세요?",
  "이거 만들려면 뭐 사야 하지?",
];
export const campaignInput = z.object({
  name: z.string().trim().min(1).max(100).default("요리고 첫 레시피"),
  customer: z
    .string()
    .trim()
    .min(10)
    .max(1000)
    .default(
      "SNS 요리 영상을 저장하지만 재료와 조리법을 다시 확인하는 번거로움 때문에 실행하지 못하는 한국어 사용자",
    ),
  persona: z
    .string()
    .trim()
    .min(5)
    .max(1000)
    .default(
      "Korean adult cooking presenter, casual home kitchen, natural smartphone selfie, consistent appearance",
    ),
  destination: z
    .string()
    .url()
    .refine((v) => new URL(v).protocol === "https:", "HTTPS 주소를 입력하세요.")
    .default("https://yorigo.kr/"),
  autoIterate: z.boolean().default(false),
  autoPublish: z.boolean().default(false),
  maxRounds: z.number().int().min(1).max(3).default(2),
});
export const experimentInput = z.object({
  hook: z.string().trim().min(3).max(65),
  cta: z
    .string()
    .trim()
    .min(3)
    .max(90)
    .default("저장한 요리 영상 하나, 요리고에 넣어보세요."),
  caption: z
    .string()
    .trim()
    .max(1800)
    .default(
      "SNS 레시피를 재료와 조리 순서로 정리하세요. 프로필 링크에서 요리고를 만나보세요. AI 진행자가 소개하는 요리고입니다.",
    ),
  introMode: z.enum(["reaction", "spoken"]).default("reaction"),
  hookStartSeconds: z.number().min(0).max(30).default(0),
  hookAsset: z.string().uuid().optional(),
  demoAsset: z.string().uuid().optional(),
  referenceAsset: z.string().uuid().optional(),
  demoSeconds: z.number().min(5).max(90).default(12),
});
export const eventInput = z.object({
  eventId: z.string().min(1).max(150),
  clickId: z.string().uuid(),
  userId: z.string().min(1).max(150),
  recipeId: z.string().min(1).max(150),
  name: z.enum(["recipe_generated", "recipe_saved", "shopping_opened"]),
  occurredAt: z.string().datetime(),
  isNewUser: z.boolean(),
  eligible: z.boolean(),
  test: z.boolean().default(false),
});
export type Campaign = z.infer<typeof campaignInput> & {
  id: string;
  createdAt: number;
};
export type Experiment = z.infer<typeof experimentInput> & {
  id: string;
  campaignId: string;
  createdAt: number;
  round: number;
  parentId?: string;
  state:
    | "draft"
    | "generating"
    | "rendering"
    | "review"
    | "approved"
    | "publishing"
    | "published"
    | "failed"
    | "needs_attention";
  loopRunId?: string;
  testRun?: boolean;
  providerId?: string;
  outputAsset?: string;
  containerId?: string;
  mediaId?: string;
  permalink?: string;
  publishedAt?: number;
  nextId?: string;
  decision?: string;
  checks?: { name: string; pass: boolean }[];
  metrics?: {
    source: "instagram";
    fetchedAt: number;
    values: Record<string, number>;
    errors: string[];
  };
};
export type Asset = {
  id: string;
  kind: "hook" | "demo" | "reference" | "output";
  file: string;
  bytes: number;
  createdAt: number;
};
export type Job = {
  id: string;
  experimentId: string;
  action: "generate" | "render" | "publish" | "metrics";
  status: "queued" | "running" | "done" | "failed" | "needs_attention";
  due: number;
  lease: number;
  attempts: number;
  error?: string;
};
export type Event = z.infer<typeof eventInput> & { experimentId: string };
export type Click = { id: string; experimentId: string; createdAt: number };

export function funnel(events: Event[], now = Date.now()) {
  // Pair generation/save for the same recipe, in order, within 24h of the user's first generation.
  const users = new Map<string, Event[]>();
  for (const e of events)
    if (
      !e.test &&
      e.isNewUser &&
      e.eligible &&
      Date.parse(e.occurredAt) <= now
    ) {
      users.set(e.userId, [...(users.get(e.userId) ?? []), e]);
    }
  let activated = 0,
    mature = 0,
    repeated = 0;
  for (const list of users.values()) {
    list.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    const first = list.find((e) => e.name === "recipe_generated");
    if (!first) continue;
    const start = Date.parse(first.occurredAt);
    const save = list.find(
      (e) =>
        e.name === "recipe_saved" &&
        e.recipeId === first.recipeId &&
        Date.parse(e.occurredAt) >= start &&
        Date.parse(e.occurredAt) <= start + 86400000,
    );
    if (!save) continue;
    activated++;
    const at = Date.parse(save.occurredAt);
    if (now < at + 7 * 86400000) continue;
    mature++;
    const gen = list.find(
      (e) =>
        e.name === "recipe_generated" &&
        e.recipeId !== first.recipeId &&
        Date.parse(e.occurredAt) >= at + 86400000 &&
        Date.parse(e.occurredAt) <= at + 7 * 86400000,
    );
    if (
      gen &&
      list.some(
        (e) =>
          e.name === "recipe_saved" &&
          e.recipeId === gen.recipeId &&
          Date.parse(e.occurredAt) >= Date.parse(gen.occurredAt) &&
          Date.parse(e.occurredAt) <= at + 7 * 86400000,
      )
    )
      repeated++;
  }
  return {
    eligibleUsers: users.size,
    activated,
    mature,
    repeated,
    pending: activated - mature,
  };
}
export function decide(
  e: Experiment,
  clicks: number,
  activated: number,
  now = Date.now(),
) {
  if (!e.publishedAt || now - e.publishedAt < 86400000)
    return {
      ready: false,
      reason: "게시 후 24시간 관찰을 기다립니다.",
      change: "wait" as const,
    };
  if (clicks < 10)
    return {
      ready: false,
      reason: "고유 방문자 10명 미만입니다. 성과 우열을 판단하지 않습니다.",
      change: "wait" as const,
    };
  if (activated === 0)
    return {
      ready: true,
      reason: `고유 방문 ${clicks}건에서 활성화가 없습니다. 첫 사용 경로를 점검하고 영상 생성을 보류합니다.`,
      change: "onboarding" as const,
    };
  return {
    ready: true,
    reason: `고유 방문 ${clicks}건, 신규 적합 활성 ${activated}명. 승자 확정 없이 다른 문제 훅을 탐색합니다.`,
    change: "hook" as const,
  };
}
