import type { Caption, PlanFile } from "./autocut";
// tools/autocut/tests/make_sample.py로 만든 16초짜리 가짜 시연 영상을 실제로 분석한 결과.
// 영상은 public/demo/autocut-sample.mp4에 있다.
export const samplePlan: PlanFile = {
  source: {
    path: "autocut-sample.mp4",
    duration: 16,
    width: 540,
    height: 960,
    fps: 30,
    has_audio: true,
  },
  plan: {
    duration: 16,
    segments: [
      { start: 1.25, end: 3.75, speed: 1 },
      { start: 3.75, end: 6.65, speed: 3 },
      { start: 6.65, end: 9.25, speed: 1 },
      { start: 9.25, end: 11.65, speed: 3 },
      { start: 11.65, end: 13.5, speed: 1 },
    ],
    cuts: [
      { start: 0, end: 1.25, reason: "시작 대기" },
      { start: 13.5, end: 16, reason: "끝 대기" },
    ],
    events: [],
  },
};
export const sampleVideo = "/demo/autocut-sample.mp4";
export const sampleCaptions: Caption[] = [
  { start: 0, end: 1.6, text: "이거 모르면 손해", style: "hype" },
  { start: 1.8, end: 3.3, text: "기다림 없이 바로", style: "hype" },
  { start: 3.5, end: 4.4, text: "끝.", style: "punch" },
  { start: 6.0, end: 7.0, text: "입력도 3초 컷", style: "hype" },
  { start: 7.2, end: 8.7, text: "지금 다운로드", style: "hype" },
];
