import { z } from "zod";
export const stages = [
  "product",
  "research",
  "qualify",
  "strategy",
  "persona",
  "intro",
  "compose",
  "publish",
  "measure",
  "learn",
] as const;
export type Stage = (typeof stages)[number];
export const stageLabels: Record<Stage, string> = {
  product: "제품 이해",
  research: "고객 신호 조사",
  qualify: "바이너리 판정",
  strategy: "타깃·페르소나 설계",
  persona: "페르소나 이미지",
  intro: "리액션 영상",
  compose: "시연·CTA 합성",
  publish: "SNS 배포",
  measure: "실제 트랙션",
  learn: "학습·다음 루프",
};
export const loopConfig = z.object({
  productUrl: z
    .string()
    .url()
    .refine((v) => new URL(v).protocol === "https:"),
  demoAsset: z.string().uuid(),
  demoSeconds: z.number().min(5).max(90).default(12),
  autoLoop: z.boolean().default(true),
  publishMode: z.enum(["review", "automatic"]).default("review"),
  maxRounds: z.number().int().min(1).max(3).default(2),
  maxGenerationRequests: z.number().int().min(2).max(6).default(4),
  recencyDays: z.number().int().min(1).max(30).default(7),
  minSignals: z.number().int().min(1).max(5).default(2),
  observationMinutes: z.number().int().min(15).max(1440).default(60),
  minVisitors: z.number().int().min(5).max(100).default(10),
});
export type LoopConfig = z.infer<typeof loopConfig>;
export type Check = {
  name: string;
  verdict: "YES" | "NO" | "UNKNOWN";
  reason: string;
};
export type ProductFact = {
  id: string;
  claim: string;
  quote: string;
  sourceUrl: string;
};
export type Source = {
  id: string;
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
  dateSource: "provider" | "unknown";
  retrievedAt: number;
  query: string;
  provenance: "tavily_live" | "test_fixture";
  kind: "consumer" | "unverified";
};
export type Signal = {
  sourceId: string;
  quote: string;
  pain: "saved_overload" | "replay_ingredients" | "shopping_friction" | "none";
  factIds: string[];
  consumerExpression: boolean;
  checks: Check[];
  qualified: boolean;
};
export const planSchema = z.object({
  segment: z.string().min(10).max(500),
  pain: z.enum(["saved_overload", "replay_ingredients", "shopping_friction"]),
  evidenceIds: z.array(z.string()).min(1).max(10),
  factIds: z.array(z.string()).min(1).max(5),
  persona: z.object({
    name: z.string().min(1).max(50),
    context: z.string().min(10).max(500),
    appearancePrompt: z.string().min(30).max(2000),
    rationale: z.string().min(10).max(600),
    creativeChoices: z.string().min(5).max(500),
  }),
  hook: z.string().min(3).max(65),
  cta: z.string().min(3).max(90),
  caption: z.string().min(5).max(1800),
  nextQueries: z.array(z.string().min(5).max(200)).min(1).max(3),
});
export type Plan = z.infer<typeof planSchema>;
export type Step = {
  stage: Stage;
  status:
    | "pending"
    | "running"
    | "succeeded"
    | "blocked"
    | "waiting"
    | "failed"
    | "needs_attention";
  attempts: number;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
  input?: unknown;
  output?: unknown;
  providerId?: string;
  mutationStartedAt?: number;
};
export type Decision = {
  change: "wait" | "onboarding" | "hook" | "stop";
  reason: string;
  nextQueries: string[];
  evidence: {
    visits: number;
    activated: number;
    views: number | null;
    observationMinutes: number;
  };
  nextRunId?: string;
};
export type LoopRun = {
  id: string;
  rootId: string;
  parentId?: string;
  contextRunId?: string;
  round: number;
  mode: "live" | "test";
  createdAt: number;
  updatedAt: number;
  nextAt: number;
  leaseUntil: number;
  paused: boolean;
  cancelled: boolean;
  config: LoopConfig;
  campaignId?: string;
  experimentId?: string;
  steps: Step[];
  generationRequests: number;
  researchAttempts: number;
  product?: { title: string; text: string; facts: ProductFact[] };
  sources?: Source[];
  signals?: Signal[];
  plan?: Plan;
  referenceAsset?: string;
  hookAsset?: string;
  decision?: Decision;
  testMetrics?: { visits: number; activated: number; views: number };
  history: { at: number; stage: Stage; message: string }[];
};
export class Blocked extends Error {}
export class Waiting extends Error {
  constructor(
    message: string,
    public delayMs = 15000,
  ) {
    super(message);
  }
}
