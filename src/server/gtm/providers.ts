import fs from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { dataDir } from "./store";
import { register } from "./media";
import { credential } from "./credentials";
export class UncertainMutation extends Error {}
const HF = "https://api.higgsfield.ai";
export async function api(
  url: string,
  init: RequestInit = {},
  mutation = false,
) {
  const deadline = process.env.GTM_OPERATION_ENDS_AT;
  if (mutation && deadline && Date.now() >= Date.parse(deadline))
    throw new Error("운영 마감 이후 새 생성·게시 요청을 중단했습니다.");
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  } catch {
    if (mutation)
      throw new UncertainMutation(
        "외부 요청 결과가 불명확합니다. 공급자 콘솔에서 확인하세요.",
      );
    throw new Error("외부 서비스 연결에 실패했습니다.");
  }
  if (!response.ok) {
    if (mutation && response.status >= 500)
      throw new UncertainMutation(
        `외부 요청 결과 확인 필요 (HTTP ${response.status}).`,
      );
    throw new Error(
      `외부 서비스 HTTP ${response.status}. 키·권한·입력을 확인하세요.`,
    );
  }
  try {
    return await response.json();
  } catch {
    if (mutation)
      throw new UncertainMutation(
        "외부 응답을 해석하지 못했습니다. 원격 결과 확인이 필요합니다.",
      );
    throw new Error("외부 응답을 해석하지 못했습니다.");
  }
}
export function hfHeaders() {
  const key = credential("HF_API_KEY");
  if (!key) throw new Error("HF_API_KEY가 연결되지 않았습니다.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}
export async function submitHook(
  prompt: string,
  imageUrl: string,
  generateAudio = false,
) {
  const r = await api(
    `${HF}/bytedance/seedance-2.0/image-to-video`,
    {
      method: "POST",
      headers: hfHeaders(),
      body: JSON.stringify({
        image_url: imageUrl,
        prompt,
        duration: 5,
        resolution: "720p",
        generate_audio: generateAudio,
      }),
    },
    true,
  );
  if (typeof r.request_id !== "string")
    throw new UncertainMutation(
      "Higgsfield 작업 ID를 받지 못했습니다. 콘솔에서 확인하세요.",
    );
  return r.request_id as string;
}
export async function pollHook(id: string) {
  return api(`${HF}/requests/${encodeURIComponent(id)}/status`, {
    headers: hfHeaders(),
  });
}
export async function downloadHook(
  url: string,
  kind: "hook" | "reference" = "hook",
) {
  let u = new URL(url);
  const hosts = (process.env.GTM_HF_MEDIA_HOSTS || "higgsfield.ai")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const allowed = (u: URL) =>
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    (!u.port || u.port === "443") &&
    hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  let response: Response | undefined;
  for (let n = 0; n < 4; n++) {
    if (!allowed(u))
      throw new Error(
        "Higgsfield 미디어 호스트를 GTM_HF_MEDIA_HOSTS에 허용한 후 재시도하세요.",
      );
    response = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    });
    if (response.status >= 300 && response.status < 400) {
      u = new URL(response.headers.get("location") || "", u);
      continue;
    }
    break;
  }
  if (!response?.ok || !response.body)
    throw new Error("생성 영상 다운로드 실패.");
  const tmp = path.join(dataDir(), `download-${crypto.randomUUID()}.mp4`),
    file = await fs.open(tmp, "wx");
  try {
    let bytes = 0;
    for await (const chunk of Readable.fromWeb(response.body as never)) {
      bytes += chunk.byteLength;
      if (bytes > 100 * 1024 * 1024) {
        throw new Error("생성 영상이 100MB를 넘습니다.");
      }
      await file.write(chunk);
    }
    await file.close();
    return await register(tmp, kind);
  } finally {
    await file.close().catch(() => {});
    await fs.rm(tmp, { force: true });
  }
}
export function igBase() {
  const version = credential("IG_GRAPH_VERSION");
  if (!/^v\d+\.\d+$/.test(version || ""))
    throw new Error("검증한 IG_GRAPH_VERSION을 설정하세요.");
  return `https://graph.instagram.com/${version}`;
}
function igHeaders() {
  const key = credential("IG_ACCESS_TOKEN");
  if (!key || !credential("IG_USER_ID"))
    throw new Error("Instagram 계정·토큰이 연결되지 않았습니다.");
  return { Authorization: `Bearer ${key}` };
}
export async function ig(
  path: string,
  params: Record<string, string> = {},
  post = false,
) {
  const url = new URL(`${igBase()}/${path}`);
  if (!post)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return api(
    url.toString(),
    {
      method: post ? "POST" : "GET",
      headers: igHeaders(),
      ...(post ? { body: new URLSearchParams(params) } : {}),
    },
    post,
  );
}
export async function createContainer(videoUrl: string, caption: string) {
  const r = await ig(
    `${credential("IG_USER_ID")}/media`,
    {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: "true",
    },
    true,
  );
  if (typeof r.id !== "string")
    throw new UncertainMutation("Instagram 컨테이너 ID 확인 필요.");
  return r.id as string;
}
export async function publishContainer(id: string) {
  const r = await ig(
    `${credential("IG_USER_ID")}/media_publish`,
    { creation_id: id },
    true,
  );
  if (typeof r.id !== "string")
    throw new UncertainMutation("Instagram 게시물 ID 확인 필요.");
  return r.id as string;
}
export async function insights(id: string) {
  const values: Record<string, number> = {},
    errors: string[] = [];
  for (const metric of [
    "views",
    "reach",
    "likes",
    "comments",
    "saved",
    "shares",
  ]) {
    try {
      const r = await ig(`${id}/insights`, { metric });
      const n =
        r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value;
      if (typeof n === "number") values[metric] = n;
      else errors.push(metric);
    } catch {
      errors.push(metric);
    }
  }
  return {
    source: "instagram" as const,
    fetchedAt: Date.now(),
    values,
    errors,
  };
}
