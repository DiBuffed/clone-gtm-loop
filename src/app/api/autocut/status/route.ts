import { environment, guard } from "@/server/autocut";
export async function GET(request: Request) {
  const blocked = guard(request);
  if (blocked) return Response.json({ enabled: false });
  return Response.json({ enabled: true, ...(await environment()) });
}
