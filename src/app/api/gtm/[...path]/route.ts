import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import {
  authorized,
  equal,
  mediaAllowed,
  sameOrigin,
  session,
  publicBase,
} from "@/server/gtm/auth";
import {
  dataDir,
  snapshot,
  db,
  get,
  put,
  transaction,
  enqueue,
} from "@/server/gtm/store";
import { register, assetPath } from "@/server/gtm/media";
import {
  createCampaign,
  createExperiment,
  updateExperiment,
  start,
  approve,
  retry,
  recordEvent,
  audit,
  nextExperiment,
} from "@/server/gtm/service";
import type { Asset, Experiment } from "@/server/gtm/model";
import { ig, pollHook } from "@/server/gtm/providers";
import {
  credential,
  connectionStatus,
  saveConnection,
} from "@/server/gtm/credentials";
import { createLoop, controlLoop, loopList } from "@/server/gtm/loop/store";
import { loopView, exportLoop } from "@/server/gtm/loop/view";
import { recoverLoop } from "@/server/gtm/loop/engine";
import type { LoopRun } from "@/server/gtm/loop/model";
import { missionReport, recordRevenue } from "@/server/gtm/mission";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function body(req: Request) {
  if (Number(req.headers.get("content-length")) > 16384)
    throw new Error("요청이 너무 큽니다.");
  const reader = req.body?.getReader();
  if (!reader) return {};
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new Error("요청이 너무 큽니다.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}
function loginAllowed() {
  return transaction(() => {
    const key = "login:" + Math.floor(Date.now() / 600000);
    const n =
      (
        db().prepare("SELECT count FROM limits WHERE key=?").get(key) as
          | { count: number }
          | undefined
      )?.count ?? 0;
    db()
      .prepare(
        "INSERT INTO limits VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1",
      )
      .run(key);
    return n < 10;
  });
}
async function serveMedia(req: NextRequest, id: string) {
  const a = get<Asset>("asset", id);
  if (!a) return json({ error: "미디어 없음" }, 404);
  const file = await fs.open(assetPath(id));
  const { size } = await file.stat();
  const range = req.headers.get("range");
  let start = 0,
    end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      await file.close();
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (start > end || start >= size) {
      await file.close();
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
  }
  const stream = file.createReadStream({ start, end, autoClose: true });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": a.kind === "reference" ? "image/jpeg" : "video/mp4",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
async function handler(req: NextRequest, context: Context) {
  try {
    const { path: p } = await context.params;
    const key = p.join("/");
    if (req.method === "POST" && (key === "events" || key === "revenue")) {
      const token = process.env.GTM_EVENTS_TOKEN;
      if (
        !token ||
        token.length < 32 ||
        !equal(req.headers.get("authorization") || "", `Bearer ${token}`)
      )
        return json({ error: "이벤트 인증 필요" }, 401);
      return json(key === "events" ? recordEvent(await body(req)) : recordRevenue(await body(req)));
    }
    if (req.method === "POST" && !sameOrigin(req))
      return json({ error: "허용되지 않은 Origin" }, 403);
    if (req.method === "POST" && key === "login") {
      const token = process.env.GTM_ADMIN_TOKEN;
      if (!token || token.length < 32)
        return json(
          { error: "서버에 GTM_ADMIN_TOKEN을 32자 이상 설정하세요." },
          503,
        );
      if (!loginAllowed())
        return json(
          { error: "로그인 시도가 많습니다. 10분 후 다시 시도하세요." },
          429,
        );
      const input = await body(req);
      if (typeof input.token !== "string" || !equal(input.token, token))
        return json({ error: "운영 키가 일치하지 않습니다." }, 401);
      const res = json({ ok: true });
      res.cookies.set("gtm_session", session(), {
        httpOnly: true,
        secure: publicBase().startsWith("https:"),
        sameSite: "strict",
        path: "/",
        maxAge: 43200,
      });
      return res;
    }
    if (req.method === "GET" && p[0] === "media" && p.length === 2) {
      if (!authorized(req) && !mediaAllowed(p[1], req.nextUrl))
        return json({ error: "인증 필요" }, 401);
      return serveMedia(req, p[1]);
    }
    if (!authorized(req))
      return json({ error: "운영자 로그인이 필요합니다." }, 401);
    if (req.method === "GET" && key === "mission") return json(await missionReport());
    if (req.method === "GET" && key === "loops")
      return json({
        runs: loopList(),
        connections: connectionStatus(),
        assets: snapshot().assets,
        publicUrl: process.env.GTM_PUBLIC_URL || null,
      });
    if (req.method === "POST" && key === "loops")
      return json(createLoop(await body(req)), 201);
    if (req.method === "POST" && key === "connections")
      return json(saveConnection(await body(req)));
    if (p[0] === "loops" && p.length >= 2) {
      const id = z.string().uuid().parse(p[1]);
      if (req.method === "GET" && p.length === 2) return json(loopView(id));
      if (req.method === "GET" && p.length === 3 && p[2] === "export")
        return new Response(await exportLoop(id), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="gtm-loop-${id.slice(0, 8)}.html"`,
            "Cache-Control": "no-store",
          },
        });
      if (req.method === "POST" && p.length === 3) {
        if (p[2] === "control") {
          const b = z
            .object({ action: z.enum(["resume", "pause", "cancel"]) })
            .parse(await body(req));
          return json(controlLoop(id, b.action));
        }
        if (p[2] === "approve") {
          const b = await body(req);
          const run = get<LoopRun>("loop", id);
          if (b.verified !== true || !run?.experimentId || run.mode !== "live")
            throw new Error("라이브 영상과 권한을 확인하세요.");
          approve(run.experimentId);
          return json(controlLoop(id, "resume"));
        }
        if (p[2] === "recover") {
          const b = z
            .object({
              stage: z.enum(["persona", "intro"]),
              providerId: z.string().uuid(),
            })
            .parse(await body(req));
          await recoverLoop(id, b.stage, b.providerId);
          return json({ ok: true });
        }
        if (p[2] === "next") {
          const run = get<LoopRun>("loop", id);
          if (!run || run.mode !== "live" || run.decision?.change !== "hook")
            throw new Error("다음 실험 근거가 없습니다.");
          return json(createLoop(run.config, run), 201);
        }
      }
    }
    if (req.method === "GET" && key === "state")
      return json({
        ...snapshot(),
        experiments: audit(),
        connections: {
          higgsfield: !!credential("HF_API_KEY"),
          instagram: !!(
            credential("IG_ACCESS_TOKEN") &&
            credential("IG_USER_ID") &&
            credential("IG_GRAPH_VERSION")
          ),
          events: !!process.env.GTM_EVENTS_TOKEN,
          publicUrl: process.env.GTM_PUBLIC_URL || null,
          worker:
            db()
              .prepare(
                "SELECT body FROM documents WHERE kind='system' AND id='worker'",
              )
              .get() || null,
        },
      });
    if (req.method === "POST" && key === "logout") {
      const res = json({ ok: true });
      res.cookies.set("gtm_session", "", {
        httpOnly: true,
        path: "/",
        maxAge: 0,
      });
      return res;
    }
    if (req.method === "POST" && key === "assets") {
      const kind = z
        .enum(["hook", "demo", "reference"])
        .parse(req.nextUrl.searchParams.get("kind"));
      if (!req.body) return json({ error: "파일이 없습니다." }, 400);
      const max = 100 * 1024 * 1024;
      if (Number(req.headers.get("content-length")) > max)
        return json({ error: "100MB 이하 파일을 사용하세요." }, 413);
      // Limit actual streamed bytes, including requests without Content-Length.
      db();
      const tmp = path.join(dataDir(), `upload-${randomUUID()}`);
      const handle = await fs.open(tmp, "wx");
      try {
        let bytes = 0;
        const limit = new Transform({
          transform(chunk, _enc, done) {
            bytes += chunk.length;
            done(bytes > max ? new Error("100MB 초과") : null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(req.body as never),
          limit,
          handle.createWriteStream(),
        );
        return json(await register(tmp, kind), 201);
      } finally {
        await handle.close().catch(() => {});
        await fs.rm(tmp, { force: true });
      }
    }
    if (req.method === "POST" && key === "campaigns")
      return json(createCampaign(await body(req)), 201);
    if (
      req.method === "POST" &&
      p[0] === "campaigns" &&
      p[2] === "experiments" &&
      p.length === 3
    )
      return json(createExperiment(p[1], await body(req)), 201);
    if (
      req.method === "POST" &&
      p[0] === "jobs" &&
      p[2] === "retry" &&
      p.length === 3
    )
      return json(retry(p[1]));
    if (p[0] === "experiments" && p.length >= 2) {
      const id = z.string().uuid().parse(p[1]);
      if (req.method === "PATCH" && p.length === 2)
        return json(updateExperiment(id, await body(req)));
      if (req.method === "POST" && p.length === 3) {
        if (["generate", "render", "publish"].includes(p[2]))
          return json(
            start(id, p[2] as "generate" | "render" | "publish"),
            202,
          );
        if (p[2] === "approve") {
          const b = await body(req);
          if (b.verified !== true)
            throw new Error(
              "훅 음성·기능 정확성·CTA·소재 사용 권한을 확인하세요.",
            );
          return json(approve(id));
        }
        if (p[2] === "next") return json(nextExperiment(id), 201);
        if (p[2] === "metrics") {
          const e = get<Experiment>("experiment", id);
          if (!e?.mediaId) throw new Error("게시물이 없습니다.");
          enqueue(id, "metrics");
          db()
            .prepare(
              "UPDATE jobs SET status='queued',due=? WHERE experimentId=? AND action='metrics' AND status!='running'",
            )
            .run(Date.now(), id);
          return json({ ok: true });
        }
        if (p[2] === "recover") {
          const b = z
            .object({
              providerId: z.string().uuid().optional(),
              mediaId: z.string().regex(/^\d+$/).optional(),
            })
            .parse(await body(req));
          const e = get<Experiment>("experiment", id);
          if (!e || !["needs_attention", "failed"].includes(e.state))
            throw new Error("복구 대상이 아닙니다.");
          if (b.mediaId) {
            const r = await ig(b.mediaId, { fields: "id,permalink,timestamp" });
            if (r.id !== b.mediaId || !Number.isFinite(Date.parse(r.timestamp)))
              throw new Error("게시물 검증 실패");
            put("experiment", {
              ...e,
              mediaId: b.mediaId,
              permalink: r.permalink,
              publishedAt: Date.parse(r.timestamp),
              state: "published",
            });
            db()
              .prepare(
                "UPDATE jobs SET status='done' WHERE experimentId=? AND action='publish'",
              )
              .run(id);
            enqueue(id, "metrics");
          } else if (b.providerId) {
            await pollHook(b.providerId);
            put("experiment", {
              ...e,
              providerId: b.providerId,
              state: "generating",
            });
            db()
              .prepare(
                "UPDATE jobs SET status='queued',due=?,error=NULL WHERE experimentId=? AND action='generate'",
              )
              .run(Date.now(), id);
          } else throw new Error("공급자 작업 ID 또는 게시물 ID가 필요합니다.");
          return json({ ok: true });
        }
      }
    }
    return json({ error: "경로 없음" }, 404);
  } catch (error) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "입력 형식을 확인하세요."
            : error instanceof Error
              ? error.message
              : "요청 실패",
      },
      400,
    );
  }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
