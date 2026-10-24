import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { get, put } from "./store";
export const connectionNames = [
  "TAVILY_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "HF_API_KEY",
  "IG_ACCESS_TOKEN",
  "IG_USER_ID",
  "IG_GRAPH_VERSION",
] as const;
export type ConnectionName = (typeof connectionNames)[number];
const schema = z.object({
  name: z.enum(connectionNames),
  value: z.string().trim().min(1).max(4096),
});
function key() {
  const token = process.env.GTM_ADMIN_TOKEN;
  if (!token || token.length < 32)
    throw new Error("운영 키를 먼저 설정하세요.");
  return createHash("sha256")
    .update("ugc-z-connections:" + token)
    .digest();
}
export function credential(name: ConnectionName): string | undefined {
  if (process.env[name]) return process.env[name];
  const record = get<{ id: string; cipher: string; iv: string; tag: string }>(
    "credential",
    name,
  );
  if (!record) return;
  try {
    const d = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(record.iv, "hex"),
    );
    d.setAuthTag(Buffer.from(record.tag, "hex"));
    return Buffer.concat([
      d.update(Buffer.from(record.cipher, "hex")),
      d.final(),
    ]).toString();
  } catch {
    return;
  }
}
export function saveConnection(input: unknown) {
  const { name, value } = schema.parse(input);
  if (process.env[name])
    throw new Error(
      "서버 환경 변수에 설정된 항목입니다. 서버 설정에서 변경하세요.",
    );
  if (name === "OPENAI_MODEL" && !/^[a-zA-Z0-9._:-]+$/.test(value))
    throw new Error("모델 이름 형식을 확인하세요.");
  if (name === "IG_GRAPH_VERSION" && !/^v\d+\.\d+$/.test(value))
    throw new Error("Graph 버전 형식은 v숫자.숫자입니다.");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  put("credential", {
    id: name,
    cipher: data.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  });
  return { name, configured: true };
}
export function connectionStatus() {
  return Object.fromEntries(
    connectionNames.map((n) => [
      n,
      {
        configured: !!credential(n),
        source: process.env[n] ? "environment" : "encrypted-store",
      },
    ]),
  );
}
