import { z } from "zod";
export const profileSchema = z.object({
  name: z.string().trim().min(1, "앱 이름을 입력해 주세요.").max(80),
  url: z.union([
    z.literal(""),
    z
      .string()
      .url()
      .refine((v) => /^https?:\/\//.test(v), "웹 주소를 입력해 주세요."),
  ]),
  description: z
    .string()
    .trim()
    .min(10, "앱 설명을 10자 이상 입력해 주세요.")
    .max(2000),
  update: z.string().max(2000),
  hook: z
    .string()
    .trim()
    .min(5, "후킹 요소를 5자 이상 입력해 주세요.")
    .max(500),
  country: z.enum(["대한민국", "미국", "일본"]),
  age: z.enum(["18–24세", "25–34세", "35–44세", "45세 이상"]),
  language: z.enum(["한국어", "English", "日本語"]),
});
export type Profile = z.infer<typeof profileSchema>;
export const jobSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
  count: z.number().int().min(1).max(10),
  hook: z.enum(["queued", "running", "ready", "failed"]),
  demo: z.enum(["waiting", "ready"]),
  composition: z.enum(["blocked", "ready"]),
  profile: profileSchema,
});
export type Job = z.infer<typeof jobSchema>;
export const requestSchema = z.object({
  name: z.string().trim().min(2, "요청 이름을 2자 이상 입력해 주세요.").max(80),
  count: z.coerce.number().int().min(1).max(10),
});
export function advanceDemoJob(job: Job): Job {
  if (job.hook === "queued" || job.hook === "failed")
    return { ...job, hook: "running" };
  if (job.hook === "running") return { ...job, hook: "ready" };
  if (job.demo === "waiting") return { ...job, demo: "ready" };
  return { ...job, composition: "ready" };
}
export const defaultProfile: Profile = {
  name: "요리GO",
  url: "",
  description:
    "SNS에서 발견한 요리 콘텐츠를 레시피로 정리하고, 필요한 재료를 한 번에 장볼 수 있는 앱입니다.",
  update: "여러 레시피의 재료를 한 장바구니에 모으는 기능이 추가됐어요.",
  hook: "저장만 해둔 요리 영상, 오늘 저녁 식탁으로.",
  country: "대한민국",
  age: "25–34세",
  language: "한국어",
};
export type Publication = {
  id: string;
  title: string;
  account: string;
  date: string;
  views: number;
  likes: number;
  comments: number;
  kind: "mint" | "sand" | "pink" | "blue";
  hook: string;
  persona: string;
};
export const publications: Publication[] = [
  {
    id: "v1",
    title: "저장한 레시피가 저녁이 되는 순간",
    account: "@yorigo.daily",
    date: "2026-09-21",
    views: 28400,
    likes: 1240,
    comments: 68,
    kind: "mint",
    hook: "저장만 하고 안 만드는 사람?",
    persona: "민지 · 홈 키친",
  },
  {
    id: "v2",
    title: "오늘 저녁 고민, 여기서 끝",
    account: "@yorigo.daily",
    date: "2026-09-20",
    views: 17200,
    likes: 842,
    comments: 39,
    kind: "sand",
    hook: "퇴근 후 10분이면 충분해요.",
    persona: "지우 · 캐주얼",
  },
  {
    id: "v3",
    title: "장보기 전에 꼭 켜는 앱",
    account: "@yorigo.kitchen",
    date: "2026-09-19",
    views: 9600,
    likes: 426,
    comments: 24,
    kind: "pink",
    hook: "아직도 재료를 하나씩 적어요?",
    persona: "수아 · 스튜디오",
  },
  {
    id: "v4",
    title: "냉장고 속 재료의 새로운 발견",
    account: "@yorigo.kitchen",
    date: "2026-09-18",
    views: 6800,
    likes: 318,
    comments: 17,
    kind: "blue",
    hook: "우리 집 냉장고에 이게 있었다고?",
    persona: "하린 · 내추럴",
  },
];
export function filterPublications(
  items: Publication[],
  account: string,
  from: string,
  to: string,
) {
  return items.filter(
    (p) =>
      (account === "all" || p.account === account) &&
      (!from || p.date >= from) &&
      (!to || p.date <= to),
  );
}
export const persistedSchema = z.object({
  profile: profileSchema,
  jobs: z.array(jobSchema).max(100),
  approved: z.array(z.string()).max(100),
});
export type DemoState = z.infer<typeof persistedSchema>;
export const initialState: DemoState = {
  profile: defaultProfile,
  jobs: [],
  approved: [],
};
