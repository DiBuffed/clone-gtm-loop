import { getJob, guard } from "@/server/autocut";
export async function GET(request: Request, ctx: RouteContext<"/api/autocut/jobs/[id]">) {
  const blocked = guard(request);
  if (blocked) return blocked;
  const job = await getJob((await ctx.params).id);
  return job ? Response.json({ job }) : Response.json({ error: "작업을 찾지 못했어요." }, { status: 404 });
}
