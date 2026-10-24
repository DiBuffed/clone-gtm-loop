import fs from "node:fs/promises";
import { z } from "zod";
import { get, all } from "../../src/server/gtm/store";
import {
  missionConfig,
  missionTick,
  saveDailyReport,
  missionReport,
} from "../../src/server/gtm/mission";
import { tick } from "../gtm/worker";
import type { Asset } from "../../src/server/gtm/model";
async function main() {
  const once = process.argv.includes("--status");
  if (once) {
    console.log(JSON.stringify(await missionReport(), null, 2));
    return;
  }
  if (!process.env.GTM_ADMIN_TOKEN || process.env.GTM_ADMIN_TOKEN.length < 32)
    throw new Error("먼저 seven-day:prepare와 운영 연결을 설정하세요.");
  const asset =
    process.env.GTM_LOOP_DEMO_ASSET ||
    get<{ id: string; demoAsset: string }>("system", "seven-day-assets")
      ?.demoAsset ||
    all<Asset>("asset").find((a) => a.kind === "demo")?.id;
  if (!asset)
    throw new Error(
      "앱 시연을 업로드하거나 seven-day:prepare -- --demo-path 경로를 실행하세요.",
    );
  let stop = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stop = true;
    });
  let lastReport = 0;
  const mission = await missionConfig();
  process.env.GTM_OPERATION_ENDS_AT = mission.ends_at;
  console.log(
    "7일 GTM runner 시작. 마감: " +
      mission.ends_at +
      "; 실제 연결이 없는 단계는 blocked 상태로 남습니다.",
  );
  while (!stop) {
    if (Date.now() >= Date.parse(mission.ends_at)) {
      await saveDailyReport();
      console.log("평가 기간 종료. 새 생성·게시 실행을 중단했습니다.");
      return;
    }
    try {
      if (await missionTick(asset, Number(process.env.GTM_DEMO_SECONDS || 12)))
        await tick();
      if (Date.now() - lastReport >= 60000) {
        await saveDailyReport();
        lastReport = Date.now();
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : "운영 tick 실패");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  await saveDailyReport();
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : "실행 실패");
  process.exitCode = 1;
});
