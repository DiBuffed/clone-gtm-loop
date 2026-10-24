import { getJob, guard, jobFile } from "@/server/autocut";
export async function GET(request: Request, ctx: RouteContext<"/api/autocut/jobs/[id]/files/[name]">) {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id, name } = await ctx.params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "작업을 찾지 못했어요." }, { status: 404 });
  return jobFile(job, name, request.headers.get("range"));
}
