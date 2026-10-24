import { z } from "zod";
// tools/autocut이 만드는 plan.json·captions.json과 같은 형식이다.
// 시각은 초 단위. plan은 원본 기준, 자막은 편집본(CapCut 타임라인) 기준이다.

const segmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  speed: z.number().min(0.1).max(10),
});
const cutSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  reason: z.string().max(200),
});
export const planFileSchema = z.object({
  source: z.object({
    path: z.string(),
    duration: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().positive(),
    has_audio: z.boolean(),
  }),
  plan: z.object({
    duration: z.number().positive(),
    segments: z.array(segmentSchema).min(1).max(500),
    cuts: z.array(cutSchema).max(500),
    events: z.array(z.number()).max(500).default([]),
  }),
});
export type PlanFile = z.infer<typeof planFileSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type Cut = z.infer<typeof cutSchema>;
export type Plan = PlanFile["plan"];

export const captionStyles = ["hype", "punch", "sub"] as const;
export type CaptionStyle = (typeof captionStyles)[number];
export const captionSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().max(80),
  style: z.enum(captionStyles),
});
export type Caption = z.infer<typeof captionSchema>;
export const captionsFileSchema = z.object({
  captions: z.array(captionSchema).max(200),
});

export const MAX_LINE = 14;

/** 운영자가 자동 판단을 되돌린 것. 인덱스는 원래 plan의 cuts·segments 기준. */
export type Overrides = { restored: number[]; normalSpeed: number[] };
export const noOverrides: Overrides = { restored: [], normalSpeed: [] };

const round = (v: number) => Math.round(v * 1000) / 1000;
const outLength = (s: Segment) => (s.end - s.start) / s.speed;

export function outputDuration(plan: Plan) {
  return plan.segments.reduce((sum, s) => sum + outLength(s), 0);
}

/** 원본 시각 → 편집본 시각. 잘린 구간이면 다음 남은 지점으로 붙는다. */
export function toOutput(plan: Plan, t: number) {
  let acc = 0;
  for (const s of plan.segments) {
    if (t < s.start) return acc;
    if (t <= s.end) return acc + (t - s.start) / s.speed;
    acc += outLength(s);
  }
  return acc;
}

/** 편집본 시각 → 원본 시각. */
export function toSource(plan: Plan, out: number) {
  let acc = 0;
  for (const s of plan.segments) {
    const len = outLength(s);
    if (out <= acc + len) return s.start + Math.max(0, out - acc) * s.speed;
    acc += len;
  }
  return plan.segments.at(-1)?.end ?? 0;
}

/** 원본 시각이 속한 조각. 잘린 구간이면 그 뒤 첫 조각과 함께 cut을 돌려준다. */
export function locate(plan: Plan, t: number) {
  const index = plan.segments.findIndex((s) => t >= s.start && t < s.end);
  if (index >= 0) return { segment: plan.segments[index], cut: null };
  const next = plan.segments.find((s) => s.start >= t) ?? null;
  const cut = plan.cuts.find((c) => t >= c.start && t < c.end) ?? null;
  return { segment: next, cut };
}

export function applyOverrides(base: Plan, o: Overrides): Plan {
  const pieces: Segment[] = [
    ...base.segments.map((s, i) =>
      o.normalSpeed.includes(i) ? { ...s, speed: 1 } : s,
    ),
    ...base.cuts
      .filter((_, i) => o.restored.includes(i))
      .map((c) => ({ start: c.start, end: c.end, speed: 1 })),
  ].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  for (const p of pieces) {
    const last = segments.at(-1);
    if (last && last.speed === p.speed && Math.abs(last.end - p.start) < 1e-6)
      segments[segments.length - 1] = { ...last, end: p.end };
    else segments.push({ ...p });
  }
  return {
    ...base,
    segments,
    cuts: base.cuts.filter((_, i) => !o.restored.includes(i)),
  };
}

/**
 * 편집 계획이 바뀌어도 자막이 같은 장면에 머물도록 시각을 옮긴다.
 * 다만 0초에 붙은 후킹과 끝에 붙은 행동 유도는 장면이 아니라 영상의 처음과 끝에
 * 속하므로 그 자리에 둔다.
 */
export function remapCaptions(captions: Caption[], from: Plan, to: Plan) {
  const fromEnd = outputDuration(from),
    toEnd = round(outputDuration(to));
  const move = (t: number) => round(toOutput(to, toSource(from, t)));
  return captions.map((c) => {
    const start = c.start <= 0.05 ? 0 : move(c.start);
    const end = c.end >= fromEnd - 0.05 ? toEnd : move(c.end);
    return { ...c, start, end: Math.max(start + 0.3, end) };
  });
}

export const longestLine = (text: string) =>
  Math.max(0, ...text.split("\n").map((l) => Array.from(l.trim()).length));

export type Check = { id: string; label: string; ok: boolean; detail: string };

/** 하이프 자막 규칙 점검. tools/autocut/autocut/captions.py의 HYPE_GUIDE와 같은 규칙이다. */
export function lintCaptions(captions: Caption[], duration: number): Check[] {
  const hype = captions.filter((c) => c.style !== "sub" && c.text.trim());
  const long = hype.filter((c) => longestLine(c.text) > MAX_LINE);
  const punches = hype.filter((c) => c.style === "punch").length;
  const covered = hype.reduce(
    (sum, c) => sum + Math.max(0, Math.min(c.end, duration) - c.start),
    0,
  );
  const overlaps = captionStyles.some((style) => {
    const list = captions
      .filter((c) => c.style === style)
      .sort((a, b) => a.start - b.start);
    return list.some((c, i) => i > 0 && c.start < list[i - 1].end - 0.01);
  });
  const outside = captions.filter(
    (c) => c.start >= duration || c.end > duration + 0.05 || c.end <= c.start,
  );
  return [
    {
      id: "hook",
      label: "첫 1.5초 후킹",
      ok: hype.some((c) => c.start < 1.5),
      detail: "시작하자마자 시선을 잡는 한 줄이 있어야 해요.",
    },
    {
      id: "cta",
      label: "마지막 행동 유도",
      ok: hype.some((c) => c.end >= duration - 1.5),
      detail: "끝 1.5초 안에 다운로드·검색 같은 한 줄을 두세요.",
    },
    {
      id: "length",
      label: `한 줄 ${MAX_LINE}자 이내`,
      ok: long.length === 0,
      detail: long.length
        ? `넘친 자막: ${long.map((c) => `“${c.text}”`).join(", ")}`
        : "짧을수록 읽히고, 읽혀야 남아요.",
    },
    {
      id: "punch",
      label: "punch는 두 번까지",
      ok: punches <= 2,
      detail: `지금 ${punches}번. 자주 치면 한 방이 아니게 돼요.`,
    },
    {
      id: "breath",
      label: "화면이 숨 쉴 틈",
      ok: duration === 0 || covered / duration <= 0.8,
      detail: `자막이 편집본의 ${Math.round((covered / Math.max(duration, 0.001)) * 100)}%를 덮고 있어요. 80% 이하로.`,
    },
    {
      id: "timing",
      label: "겹침·범위",
      ok: !overlaps && outside.length === 0,
      detail: "같은 스타일끼리 겹치거나 편집본 밖으로 나간 자막이 없어야 해요.",
    },
  ];
}

export function planForExport(raw: unknown, plan: Plan) {
  const base = typeof raw === "object" && raw ? raw : {};
  return {
    ...base,
    plan: { ...plan, output_duration: round(outputDuration(plan)) },
  };
}

export function captionsForExport(captions: Caption[], plan: Plan) {
  return {
    timeline: "output",
    output_duration: round(outputDuration(plan)),
    captions: [...captions]
      .filter((c) => c.text.trim())
      .sort((a, b) => a.start - b.start),
  };
}

export function workName(path: string) {
  const file = path.split(/[\\/]/).pop() ?? path;
  return file.replace(/\.[^.]+$/, "") || "video";
}
