import { NextRequest, NextResponse } from "next/server";
import { publicBase } from "@/server/gtm/auth";
import { randomUUID } from "node:crypto";
import { get, put, transaction } from "@/server/gtm/store";
import type { Campaign, Click, Experiment } from "@/server/gtm/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    e = get<Experiment>("experiment", id);
  if (!e || e.state !== "published")
    return new Response("게시된 캠페인이 아닙니다.", { status: 404 });
  const c = get<Campaign>("campaign", e.campaignId);
  if (!c) return new Response("캠페인 없음", { status: 404 });
  let visitor = req.cookies.get("gtm_visitor")?.value;
  if (!visitor || !/^[a-f0-9-]{36}$/.test(visitor)) visitor = randomUUID();
  const click = transaction(() => {
    const key = `${e.id}:${visitor}`;
    const old = get<{ id: string; clickId: string }>("visitor", key);
    if (old) return get<Click>("click", old.clickId)!;
    const click = put<Click>("click", {
      id: randomUUID(),
      experimentId: e.id,
      createdAt: Date.now(),
    });
    put("visitor", { id: key, clickId: click.id });
    return click;
  });
  const target = new URL(c.destination);
  target.searchParams.set("utm_source", "ugc-z");
  target.searchParams.set("utm_medium", "social");
  target.searchParams.set("utm_campaign", c.id);
  target.searchParams.set("utm_content", e.id);
  target.searchParams.set("ugc_click_id", click.id);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  res.cookies.set("gtm_visitor", visitor, {
    httpOnly: true,
    sameSite: "lax",
    secure: publicBase().startsWith("https:"),
    maxAge: 30 * 86400,
    path: "/",
  });
  return res;
}
