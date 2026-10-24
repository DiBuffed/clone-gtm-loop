// 관리자 화면에서 영상을 받아 tools/autocut을 실행하는 로컬 전용 작업 실행기.
//
// 인증이 아직 없으므로 이 기능은 운영자 컴퓨터에서만 켠다: .env.local에 AUTOCUT_LOCAL=1이
// 있고, 요청이 localhost로 들어올 때만 동작한다. 공개 배포에서는 꺼져 있다.
// 작업 상태는 메모리와 work/jobs/<id>/job.json에 둔다. 워커와 DB가 생기면 이 파일을 대체한다.
import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { z } from "zod";

// 번들러가 이 경로를 따라가 파일을 추적하지 않게 런타임에 조립한다. tools/autocut/.venv에는
// 프로젝트 밖(시스템 Python)을 가리키는 심볼릭 링크가 있어서, 추적하면 빌드가 멈춘다.
const ROOT = [process.cwd(), "tools", "autocut"].join(path.sep);
const PYTHON = path.join(ROOT, ".venv", "bin", "python");
const JOBS = path.join(ROOT, "work", "jobs");
const MAX_BYTES = 2 * 1024 ** 3;
const VIDEO_EXT = [".mp4", ".mov", ".m4v", ".webm", ".mkv"];
const DRAFTS = path.join(os.homedir(), "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft");

export const jobOptionsSchema = z.object({
  speed: z.boolean().default(true),
  slowSpeed: z.number().min(1.5).max(6).default(3),
  captions: z.enum(["auto", "none"]).default("auto"),
  speech: z.boolean().default(true),
  brief: z.string().max(2000).default(""),
});
export type JobOptions = z.infer<typeof jobOptionsSchema>;

export type JobStatus = "queued" | "running" | "done" | "failed";
export type Job = {
  id: string;
  file: string;
  draftName: string;
  createdAt: string;
  finishedAt?: string;
  status: JobStatus;
  step: "edit" | "rebuild";
  options: JobOptions;
  log: string[];
  result?: Record<string, unknown>;
  error?: string;
};

type Store = { jobs: Map<string, Job>; queue: { id: string; args: string[] }[]; running: boolean; loaded: boolean };
// 개발 서버의 코드 교체(HMR)에도 작업 목록이 날아가지 않게 전역에 둔다.
const g = globalThis as unknown as { __autocut?: Store };
const store: Store = (g.__autocut ??= { jobs: new Map(), queue: [], running: false, loaded: false });

// ---------------------------------------------------------------- 접근 제한

export function guard(request: Request): Response | null {
  if (process.env.AUTOCUT_LOCAL !== "1")
    return Response.json({ error: "자동 편집은 로컬 실행에서만 켜집니다 (AUTOCUT_LOCAL=1)." }, { status: 404 });
  // 헤더는 클라이언트가 꾸밀 수 있어서 실수로 열리는 것만 막는다. 네트워크에서 아예 닿지 않게
  // 하려면 `npm run studio`(127.0.0.1에만 바인딩)로 띄운다.
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  const from = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const loopback = (v: string) => ["localhost", "127.0.0.1", "::1", "[::1]", "::ffff:127.0.0.1"].includes(v);
  if (!loopback(host) || !loopback(from))
    return Response.json({ error: "이 컴퓨터(localhost)에서만 사용할 수 있습니다." }, { status: 403 });
  return null;
}

// ---------------------------------------------------------------- 상태

let whisper: boolean | null = null;
function hasWhisper(): Promise<boolean> {
  if (whisper !== null) return Promise.resolve(whisper);
  return new Promise((resolve) =>
    execFile(PYTHON, ["-c", "import faster_whisper"], (err) => resolve((whisper = !err))),
  );
}
function claudeCli() {
  const candidates = [path.join(os.homedir(), ".local", "bin", "claude"), path.join(os.homedir(), ".claude", "local", "claude")];
  return candidates.find((c) => existsSync(c)) ?? null;
}

export async function environment() {
  const engine = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "api" : claudeCli() ? "claude-code" : "none";
  return {
    python: existsSync(PYTHON),
    capcut: process.platform === "darwin" ? existsSync("/Applications/CapCut.app") : null,
    draftsDir: existsSync(DRAFTS) ? DRAFTS : null,
    captionEngine: engine,
    whisper: existsSync(PYTHON) ? await hasWhisper() : false,
  };
}

// ---------------------------------------------------------------- 작업 목록

const jobDir = (id: string) => path.join(JOBS, id);
const workDir = (id: string) => path.join(jobDir(id), "work");

async function load() {
  if (store.loaded) return;
  store.loaded = true;
  const ids = await fs.readdir(JOBS).catch(() => [] as string[]);
  for (const id of ids) {
    try {
      const job = JSON.parse(await fs.readFile(path.join(jobDir(id), "job.json"), "utf8")) as Job;
      if (job.status === "running" || job.status === "queued") {
        job.status = "failed";
        job.error = "서버가 다시 시작되어 작업이 중단됐습니다. 다시 넣어 주세요.";
      }
      store.jobs.set(id, job);
    } catch {
      /* 망가진 작업 폴더는 건너뛴다 */
    }
  }
}

const saving = new Map<string, NodeJS.Timeout>();
function save(job: Job, now = false) {
  const write = () => fs.writeFile(path.join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2)).catch(() => {});
  clearTimeout(saving.get(job.id));
  if (now) return void write();
  saving.set(job.id, setTimeout(write, 500));
}

export async function listJobs() {
  await load();
  return [...store.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getJob(id: string) {
  await load();
  return z.string().uuid().safeParse(id).success ? (store.jobs.get(id) ?? null) : null;
}

function safeName(name: string) {
  const base = path.basename(name).normalize("NFC");
  const ext = path.extname(base).toLowerCase();
  if (!VIDEO_EXT.includes(ext)) return null;
  const stem = base.slice(0, -ext.length).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 80) || "video";
  return stem + ext;
}

export async function createJob(body: WebReadableStream<Uint8Array>, fileName: string, options: JobOptions) {
  await load();
  const file = safeName(fileName);
  if (!file) throw new Error(`영상 파일만 넣을 수 있어요 (${VIDEO_EXT.join(", ")}).`);
  const id = crypto.randomUUID();
  await fs.mkdir(jobDir(id), { recursive: true });
  let bytes = 0;
  const limit = new Transform({
    transform(chunk, _enc, done) {
      bytes += chunk.length;
      done(bytes > MAX_BYTES ? new Error("영상은 2GB까지 넣을 수 있어요.") : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body), limit, createWriteStream(path.join(jobDir(id), file)));
  } catch (err) {
    await fs.rm(jobDir(id), { recursive: true, force: true });
    throw err;
  }

  const stem = file.slice(0, file.lastIndexOf("."));
  const taken = new Set([...store.jobs.values()].map((j) => j.draftName));
  let draftName = `${stem}_autocut`;
  for (let n = 2; taken.has(draftName); n++) draftName = `${stem}_autocut_${n}`;

  const job: Job = {
    id, file, draftName, options, status: "queued", step: "edit",
    createdAt: new Date().toISOString(), log: [],
  };
  store.jobs.set(id, job);
  save(job, true);
  const args = [
    "-m", "autocut", "run", path.join(jobDir(id), file),
    "--work", workDir(id), "--name", draftName,
    "--captions", options.captions, "--speech", options.speech ? "auto" : "off",
    ...(options.speed ? ["--slow-speed", String(options.slowSpeed)] : ["--no-speed"]),
    ...(options.brief.trim() ? ["--brief", options.brief.trim()] : []),
  ];
  enqueue(id, args);
  return job;
}

/** 검토 화면에서 고친 계획·자막으로 드래프트를 다시 만든다. */
export async function rebuildJob(id: string, plan: unknown, captions: unknown) {
  const job = await getJob(id);
  if (!job) throw new Error("작업을 찾지 못했습니다.");
  if (job.status === "running" || job.status === "queued") throw new Error("작업이 아직 진행 중이에요.");
  const planPath = path.join(workDir(id), "plan.json");
  const raw = JSON.parse(await fs.readFile(planPath, "utf8"));
  await fs.writeFile(planPath, JSON.stringify({ ...raw, plan }, null, 2));
  await fs.writeFile(path.join(workDir(id), "captions.json"), JSON.stringify(captions, null, 2));
  Object.assign(job, { status: "queued", step: "rebuild", error: undefined });
  job.log.push("", "— 검토 내용으로 다시 만들기 —");
  save(job, true);
  enqueue(id, ["-m", "autocut", "build", workDir(id), "--name", job.draftName]);
  return job;
}

function enqueue(id: string, args: string[]) {
  store.queue.push({ id, args });
  void pump();
}

async function pump() {
  if (store.running) return;
  const next = store.queue.shift();
  if (!next) return;
  const job = store.jobs.get(next.id);
  if (!job) return void pump();
  store.running = true;
  job.status = "running";
  save(job, true);
  const child = spawn(PYTHON, next.args, {
    cwd: ROOT,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PATH: `${process.env.PATH ?? ""}:${path.join(os.homedir(), ".local", "bin")}`,
    },
  });
  let partial = "";
  const onData = (chunk: Buffer) => {
    const lines = (partial + chunk.toString("utf8")).split("\n");
    partial = lines.pop() ?? "";
    job.log.push(...lines.map((l) => l.replace(/\s+$/, "")).filter(Boolean));
    if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
    save(job);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const code: number = await new Promise((resolve) => {
    child.on("error", (err) => {
      job.log.push(`실행하지 못했습니다: ${err.message}`);
      resolve(-1);
    });
    child.on("close", (c) => resolve(c ?? -1));
  });
  if (partial.trim()) job.log.push(partial.trim());
  try {
    if (code !== 0) throw new Error(job.log.at(-1) ?? `종료 코드 ${code}`);
    job.result = JSON.parse(await fs.readFile(path.join(workDir(job.id), "result.json"), "utf8"));
    job.status = "done";
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
  }
  job.finishedAt = new Date().toISOString();
  save(job, true);
  store.running = false;
  void pump();
}

// ---------------------------------------------------------------- 파일·CapCut

const FILES: Record<string, [string, string]> = {
  "captions.srt": ["captions.srt", "application/x-subrip; charset=utf-8"],
  "captions.json": ["captions.json", "application/json"],
  "plan.json": ["plan.json", "application/json"],
  "result.json": ["result.json", "application/json"],
};

export async function jobFile(job: Job, name: string, range: string | null): Promise<Response> {
  if (name === "video") return serveVideo(path.join(jobDir(job.id), job.file), range);
  const entry = FILES[name];
  if (!entry) return Response.json({ error: "없는 파일입니다." }, { status: 404 });
  try {
    const data = await fs.readFile(path.join(workDir(job.id), entry[0]));
    const download = name.endsWith(".srt") ? `attachment; filename*=UTF-8''${encodeURIComponent(job.draftName)}.srt` : "inline";
    return new Response(data, { headers: { "Content-Type": entry[1], "Content-Disposition": download } });
  } catch {
    return Response.json({ error: "아직 만들어지지 않았어요." }, { status: 404 });
  }
}

async function serveVideo(file: string, range: string | null): Promise<Response> {
  const { size } = await fs.stat(file);
  const type = file.endsWith(".mov") ? "video/quicktime" : file.endsWith(".webm") ? "video/webm" : "video/mp4";
  const match = range?.match(/bytes=(\d*)-(\d*)/);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  const handle = await fs.open(file);
  const stream = handle.createReadStream({ start, end });
  stream.on("close", () => void handle.close().catch(() => {}));
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: match ? 206 : 200,
    headers: {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

/**
 * CapCut을 연다. CapCut에는 특정 초안을 바로 여는 공식 방법이 없어서, 앱을 앞으로 가져오면
 * 방금 만든 초안이 목록 맨 앞(최근 수정순)에 있다.
 */
export function openCapCut(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === "darwin")
      execFile("open", ["-a", "CapCut"], (err) => (err ? reject(new Error("CapCut을 열지 못했어요. 설치돼 있는지 확인해 주세요.")) : resolve()));
    else reject(new Error("지금은 macOS에서만 CapCut을 바로 열 수 있어요."));
  });
}
