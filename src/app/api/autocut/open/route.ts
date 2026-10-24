import { guard, openCapCut } from "@/server/autocut";
export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    await openCapCut();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "CapCut을 열지 못했어요." }, { status: 500 });
  }
}
