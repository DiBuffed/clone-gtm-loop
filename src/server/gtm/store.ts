import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Asset, Campaign, Click, Event, Experiment, Job } from "./model";
export const dataDir = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.GTM_DATA_DIR || ".gtm-data",
  );
let singleton: DatabaseSync | undefined;
export function db() {
  if (singleton) return singleton;
  fs.mkdirSync(path.join(dataDir(), "media"), { recursive: true });
  const d = new DatabaseSync(path.join(dataDir(), "gtm.sqlite"));
  d.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY,experimentId TEXT NOT NULL,action TEXT NOT NULL,status TEXT NOT NULL,due INTEGER NOT NULL,lease INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,error TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_action ON jobs(experimentId,action);
    CREATE INDEX IF NOT EXISTS ready_jobs ON jobs(status,due);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL);
  `);
  singleton = d;
  return d;
}
export function all<T>(kind: string): T[] {
  return (
    db()
      .prepare("SELECT body FROM documents WHERE kind=? ORDER BY rowid DESC")
      .all(kind) as { body: string }[]
  ).map((r) => JSON.parse(r.body));
}
export function get<T>(kind: string, id: string): T | undefined {
  const r = db()
    .prepare("SELECT body FROM documents WHERE kind=? AND id=?")
    .get(kind, id) as { body: string } | undefined;
  return r ? JSON.parse(r.body) : undefined;
}
export function put<T extends { id: string }>(kind: string, item: T) {
  db()
    .prepare(
      "INSERT INTO documents VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
    )
    .run(kind, item.id, JSON.stringify(item));
  return item;
}
export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function patchExperiment(id: string, patch: Partial<Experiment>) {
  return transaction(() => {
    const e = get<Experiment>("experiment", id);
    if (!e) throw new Error("실험을 찾을 수 없습니다.");
    return put("experiment", { ...e, ...patch });
  });
}
export function jobs() {
  return db()
    .prepare("SELECT * FROM jobs ORDER BY rowid DESC")
    .all() as unknown as Job[];
}
export function enqueue(id: string, action: Job["action"], due = Date.now()) {
  db()
    .prepare(
      `INSERT INTO jobs(id,experimentId,action,status,due) VALUES(?,?,?,'queued',?) ON CONFLICT(experimentId,action) DO NOTHING`,
    )
    .run(randomUUID(), id, action, due);
}
export function claim(now = Date.now()): Job | undefined {
  return transaction(() => {
    // An interrupted network mutation may have succeeded remotely. Never silently repeat it.
    const stale = db()
      .prepare("SELECT * FROM jobs WHERE status='running' AND lease<?")
      .all(now) as unknown as Job[];
    for (const j of stale) {
      const unsafe = j.action === "generate" || j.action === "publish";
      const e = get<Experiment>("experiment", j.experimentId);
      const resumable =
        (j.action === "generate" && e?.providerId) ||
        (j.action === "publish" && e?.containerId && e.state !== "publishing");
      const status = unsafe && !resumable ? "needs_attention" : "queued";
      db()
        .prepare("UPDATE jobs SET status=?,error=? WHERE id=?")
        .run(
          status,
          status === "needs_attention"
            ? "외부 요청 결과 확인 필요. 자동 재요청하지 않습니다."
            : null,
          j.id,
        );
      if (e && status === "needs_attention")
        put("experiment", { ...e, state: "needs_attention" });
    }
    const job = db()
      .prepare(
        "SELECT * FROM jobs WHERE status='queued' AND due<=? ORDER BY due,rowid LIMIT 1",
      )
      .get(now) as unknown as Job | undefined;
    if (!job) return;
    db()
      .prepare(
        "UPDATE jobs SET status='running',lease=?,attempts=attempts+1 WHERE id=?",
      )
      .run(now + 15 * 60000, job.id);
    return {
      ...job,
      status: "running",
      lease: now + 15 * 60000,
      attempts: job.attempts + 1,
    };
  });
}
export function finishJob(
  id: string,
  status: Job["status"],
  error?: string,
  due = Date.now(),
) {
  db()
    .prepare("UPDATE jobs SET status=?,error=?,due=?,lease=0 WHERE id=?")
    .run(status, error ?? null, due, id);
}
export function consumeGenerationSlot() {
  return transaction(() => {
    const key = "hf:" + new Date().toISOString().slice(0, 10);
    const max = Number(process.env.GTM_MAX_DAILY_GENERATIONS || 3);
    const n =
      (
        db().prepare("SELECT count FROM limits WHERE key=?").get(key) as
          | { count: number }
          | undefined
      )?.count ?? 0;
    if (!Number.isInteger(max) || max < 1 || n >= max)
      throw new Error("일일 Higgsfield 생성 요청 한도에 도달했습니다.");
    db()
      .prepare(
        "INSERT INTO limits VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1",
      )
      .run(key);
  });
}
export function snapshot() {
  return {
    campaigns: all<Campaign>("campaign"),
    experiments: all<Experiment>("experiment"),
    assets: all<Asset>("asset"),
    jobs: jobs(),
  };
}
export function eventsFor(id: string) {
  return all<Event & { id: string }>("event").filter(
    (e) => e.experimentId === id,
  );
}
export function clicksFor(id: string) {
  return all<Click>("click").filter((c) => c.experimentId === id);
}
