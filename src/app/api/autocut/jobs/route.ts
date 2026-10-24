import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { createJob, guard, jobOptionsSchema, listJobs } from "@/server/autocut";
export async function GET(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;
  return Response.json({ jobs: await listJobs() });
}
// 영상은 multipart 대신 본문 그대로 받아 디스크로 흘려 쓴다. 큰 파일을 메모리에 올리지 않는다.
export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;
  const name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
  let options;
  try {
    options = jobOptionsSchema.parse(
      JSON.parse(decodeURIComponent(request.headers.get("x-options") ?? "%7B%7D")),
    );
  } catch {
    return Response.json({ error: "설정 값을 읽지 못했어요." }, { status: 400 });
  }
  if (!request.body) return Response.json({ error: "영상이 비어 있어요." }, { status: 400 });
  try {
    const job = await createJob(request.body as unknown as WebReadableStream<Uint8Array>, name, options);
    return Response.json({ job }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "업로드에 실패했어요." }, { status: 400 });
  }
}
