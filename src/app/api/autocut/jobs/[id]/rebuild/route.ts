import { z } from "zod";
import { captionsFileSchema, planFileSchema } from "@/lib/autocut";
import { guard, rebuildJob } from "@/server/autocut";
const bodySchema = z.object({
  plan: planFileSchema.shape.plan,
  captions: captionsFileSchema.extend({ output_duration: z.number().optional(), timeline: z.string().optional() }),
});
export async function POST(request: Request, ctx: RouteContext<"/api/autocut/jobs/[id]/rebuild">) {
  const blocked = guard(request);
  if (blocked) return blocked;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "편집 계획이나 자막 형식이 맞지 않아요." }, { status: 400 });
  try {
    const job = await rebuildJob((await ctx.params).id, parsed.data.plan, parsed.data.captions);
    return Response.json({ job });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "다시 만들지 못했어요." }, { status: 409 });
  }
}
