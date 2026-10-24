import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDemoJob,
  defaultProfile,
  filterPublications,
  persistedSchema,
  profileSchema,
  publications,
  requestSchema,
  type Job,
} from "../src/lib/domain";
test("validates app brief and blocks non-web URL", () => {
  assert.equal(profileSchema.safeParse(defaultProfile).success, true);
  assert.equal(
    profileSchema.safeParse({ ...defaultProfile, url: "javascript:alert(1)" })
      .success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...defaultProfile, hook: "" }).success,
    false,
  );
});
test("caps request size at ten", () => {
  assert.equal(
    requestSchema.safeParse({ name: "캠페인", count: "10" }).success,
    true,
  );
  assert.equal(
    requestSchema.safeParse({ name: "캠페인", count: 11 }).success,
    false,
  );
});
test("filters account and inclusive dates", () => {
  assert.equal(
    filterPublications(
      publications,
      "@yorigo.daily",
      "2026-09-20",
      "2026-09-20",
    ).length,
    1,
  );
  assert.equal(
    filterPublications(publications, "all", "2027-01-01", "").length,
    0,
  );
});
test("composition waits for both assets and terminal state is stable", () => {
  const job: Job = {
    id: "test",
    name: "test",
    count: 3,
    profile: defaultProfile,
    createdAt: new Date().toISOString(),
    hook: "queued",
    demo: "waiting",
    composition: "blocked",
  };
  let next = advanceDemoJob(job);
  assert.equal(next.hook, "running");
  next = advanceDemoJob(next);
  assert.equal(next.composition, "blocked");
  next = advanceDemoJob(next);
  assert.equal(next.demo, "ready");
  assert.equal(next.composition, "blocked");
  next = advanceDemoJob(next);
  assert.equal(next.composition, "ready");
  assert.deepEqual(advanceDemoJob(next), next);
  assert.equal(job.hook, "queued");
});
test("rejects corrupt persisted state", () => {
  assert.equal(
    persistedSchema.safeParse({
      profile: defaultProfile,
      jobs: [{ id: "bad" }],
      approved: [],
    }).success,
    false,
  );
});
