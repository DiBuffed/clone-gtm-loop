import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { register } from "../../src/server/gtm/media";
import { put } from "../../src/server/gtm/store";
async function main() {
  const existing = await fs.readFile(".env.local", "utf8").catch(() => "");
  const additions: string[] = [];
  for (const name of ["GTM_ADMIN_TOKEN", "GTM_EVENTS_TOKEN"])
    if (
      !process.env[name] &&
      !new RegExp("^" + name + "=.+", "m").test(existing)
    ) {
      const value = randomBytes(32).toString("hex");
      additions.push(name + "=" + value);
      process.env[name] = value;
    }
  if (!existing && !process.env.GTM_DATA_DIR)
    additions.push("GTM_DATA_DIR=.gtm-data");
  if (additions.length)
    await fs.appendFile(
      ".env.local",
      (existing.endsWith("\n") || !existing ? "" : "\n") +
        additions.join("\n") +
        "\n",
      { mode: 0o600 },
    );
  const index = process.argv.indexOf("--demo-path");
  let demoAsset: string | undefined;
  if (index >= 0) {
    const file = process.argv[index + 1];
    if (!file) throw new Error("시연 파일 경로가 필요합니다.");
    demoAsset = (await register(file, "demo")).id;
    put("system", { id: "seven-day-assets", demoAsset });
  }
  console.log(
    JSON.stringify({
      operatorKeys: "configured_in_ignored_env_file",
      demoAsset: demoAsset || "not_registered",
      next: "운영 키는 .env.local에서 확인해 /gtm/loop에 로그인하고 공급자 키를 연결하세요. 키 값은 이 출력에 포함하지 않습니다.",
    }),
  );
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : "준비 실패");
  process.exitCode = 1;
});
