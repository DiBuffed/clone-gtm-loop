import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOverrides,
  captionsForExport,
  lintCaptions,
  locate,
  noOverrides,
  outputDuration,
  planFileSchema,
  remapCaptions,
  toOutput,
  toSource,
  workName,
} from "../src/lib/autocut";
import { sampleCaptions, samplePlan } from "../src/lib/autocut-sample";
const plan = samplePlan.plan;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test("sample plan matches the plan.json contract", () => {
  assert.equal(planFileSchema.safeParse(samplePlan).success, true);
  near(outputDuration(plan), 2.5 + 2.9 / 3 + 2.6 + 2.4 / 3 + 1.85);
});

test("maps between source and edited time both ways", () => {
  near(toOutput(plan, 0.5), 0); // 잘린 시작 대기는 편집본 0초로 붙는다
  near(toOutput(plan, 2.25), 1);
  near(toOutput(plan, 4.75), 2.5 + 1 / 3); // 3배속 구간
  for (const out of [0.4, 2.7, 5, 8]) near(toOutput(plan, toSource(plan, out)), out);
});

test("locates the cut a playhead is inside", () => {
  const at = locate(plan, 14);
  assert.equal(at.cut?.reason, "끝 대기");
  assert.equal(at.segment, null);
  assert.equal(locate(plan, 0.2).segment?.start, 1.25);
});

test("restoring a cut and undoing a speed-up rebuild the edit", () => {
  const edited = applyOverrides(plan, { restored: [0], normalSpeed: [1] });
  assert.equal(edited.cuts.length, 1);
  assert.deepEqual(edited.segments[0], { start: 0, end: 9.25, speed: 1 }); // 이어진 원속도 조각은 합친다
  near(outputDuration(edited), outputDuration(plan) + 1.25 + 2.9 - 2.9 / 3);
  assert.deepEqual(applyOverrides(plan, noOverrides), plan);
});

test("captions follow their scene when the edit changes", () => {
  const edited = applyOverrides(plan, { restored: [0], normalSpeed: [] });
  const [moved] = remapCaptions([{ ...sampleCaptions[1] }], plan, edited);
  near(moved.start, sampleCaptions[1].start + 1.25);
});

test("the opening hook and closing call to action stay pinned", () => {
  const edited = applyOverrides(plan, { restored: [0, 1], normalSpeed: [] });
  const moved = remapCaptions(sampleCaptions, plan, edited);
  near(moved[0].start, 0);
  near(moved[0].end, sampleCaptions[0].end + 1.25);
  assert.ok(Math.abs(moved.at(-1)!.end - outputDuration(edited)) < 1e-3);
});

test("hype checks catch the common mistakes", () => {
  const ok = lintCaptions(sampleCaptions, outputDuration(plan));
  assert.deepEqual(ok.filter((c) => !c.ok).map((c) => c.id), []);
  const bad = lintCaptions(
    [
      { start: 3, end: 4, text: "이 문장은 열네 글자를 훌쩍 넘어갑니다", style: "hype" },
      { start: 3.5, end: 5, text: "겹침", style: "hype" },
    ],
    8,
  );
  assert.deepEqual(
    bad.filter((c) => !c.ok).map((c) => c.id),
    ["hook", "cta", "length", "timing"],
  );
});

test("exports captions sorted and without blanks", () => {
  const out = captionsForExport(
    [
      { start: 2, end: 3, text: "둘", style: "hype" },
      { start: 0, end: 1, text: " ", style: "hype" },
      { start: 1, end: 2, text: "하나", style: "punch" },
    ],
    plan,
  );
  assert.deepEqual(out.captions.map((c) => c.text), ["하나", "둘"]);
  assert.equal(out.timeline, "output");
});

test("work folder name comes from the video file", () => {
  assert.equal(workName("/Users/me/Desktop/demo v2.mp4"), "demo v2");
  assert.equal(workName("C:\\rec\\app.mov"), "app");
});
