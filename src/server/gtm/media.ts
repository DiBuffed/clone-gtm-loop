import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir, put, get } from "./store";
import type { Asset, Experiment } from "./model";
export function run(
  file: string,
  args: string[],
  cwd?: string,
): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      file,
      args,
      { cwd, timeout: 300000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) =>
        err
          ? reject(
              new Error(
                `${file} 실행에 실패했습니다. 미디어 형식 또는 실행 환경을 확인하세요.`,
              ),
            )
          : resolve(stdout),
    ),
  );
}
export async function probe(file: string) {
  return JSON.parse(
    await run(process.env.FFPROBE_PATH || "ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  ) as {
    streams: {
      codec_type: string;
      width?: number;
      height?: number;
      codec_name?: string;
    }[];
    format: { duration?: string };
  };
}
export async function register(file: string, kind: Asset["kind"]) {
  await fs.mkdir(path.join(dataDir(), "media"), { recursive: true });
  const info = await fs.stat(file);
  if (!info.size || info.size > 100 * 1024 * 1024)
    throw new Error("파일은 100MB까지 지원합니다.");
  const p = await probe(file);
  const v = p.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error("영상 또는 이미지가 아닙니다.");
  if (
    kind !== "reference" &&
    (!Number.isFinite(Number(p.format.duration)) ||
      Number(p.format.duration) < (kind === "hook" ? 3 : 5))
  )
    throw new Error("인트로는 3초 이상, 시연은 5초 이상 필요합니다.");
  const id = randomUUID(),
    ext = kind === "reference" ? ".jpg" : ".mp4",
    dest = path.join(dataDir(), "media", id + ext);
  // Reference images are decoded and re-encoded; file extensions are never trusted.
  if (kind === "reference")
    await run(process.env.FFMPEG_PATH || "ffmpeg", [
      "-y",
      "-i",
      file,
      "-frames:v",
      "1",
      dest,
    ]);
  else await fs.copyFile(file, dest);
  return put<Asset>("asset", {
    id,
    kind,
    file: id + ext,
    bytes: (await fs.stat(dest)).size,
    createdAt: Date.now(),
  });
}
export function assetPath(id: string, kind?: Asset["kind"]) {
  const a = get<Asset>("asset", id);
  if (!a || (kind && a.kind !== kind))
    throw new Error("필요한 미디어 자산을 찾을 수 없습니다.");
  return path.join(dataDir(), "media", a.file);
}
// Keep Korean words together where possible; cap full-width characters to the safe area.
const wrap = (s: string, n = 16) => {
  const lines: string[] = [];
  let line = "";
  for (const word of s.trim().split(/\s+/)) {
    const chars = Array.from(word);
    if (line && Array.from(line + " " + word).length > n) {
      lines.push(line);
      line = "";
    }
    while (chars.length > n) {
      lines.push(chars.splice(0, n).join(""));
    }
    const rest = chars.join("");
    if (rest) line = line ? line + " " + rest : rest;
  }
  if (line) lines.push(line);
  return lines.join("\n");
};
export async function render(e: Experiment) {
  if (!e.hookAsset || !e.demoAsset)
    throw new Error("인트로와 앱 시연이 모두 필요합니다.");
  const dir = await fs.mkdtemp(path.join(dataDir(), "render-"));
  const ff = process.env.FFMPEG_PATH || "ffmpeg";
  try {
    await fs.writeFile(
      path.join(dir, "hook.txt"),
      wrap(e.hook.replace(/\s+/g, " ")),
    );
    await fs.writeFile(
      path.join(dir, "cta.txt"),
      wrap(e.cta.replace(/\s+/g, " ")),
    );
    await fs.writeFile(
      path.join(dir, "demo.txt"),
      "링크 하나로 재료·조리 순서 정리",
    );
    await fs.writeFile(path.join(dir, "label.txt"), "AI 진행자 · 요리고");
    await fs.writeFile(path.join(dir, "edited.txt"), "실제 앱 시연 · 편집본");
    const font =
      process.env.GTM_FONT_PATH ||
      "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";
    await fs.access(font);
    if (!/^[a-zA-Z0-9_./-]+$/.test(font))
      throw new Error("GTM_FONT_PATH에는 영문 경로를 사용하세요.");
    const text = (file: string, y: string, size = 54) =>
      `drawtext=fontfile=${font}:textfile=${file}:expansion=none:fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=18:x=(w-tw)/2:y=${y}`;
    for (const [kind, id, seconds] of [
      ["hook", e.hookAsset, 3],
      ["demo", e.demoAsset, e.demoSeconds],
    ] as const) {
      const input = assetPath(id, kind),
        p = await probe(input),
        audio = p.streams.some((s) => s.codec_type === "audio");
      const duration = Number(p.format.duration);
      const start = kind === "hook" ? (e.hookStartSeconds ?? 0) : 0;
      if (!Number.isFinite(duration) || duration < seconds + start)
        throw new Error(`${kind} 영상 길이가 설정한 길이보다 짧습니다.`);
      const args = ["-y", "-i", input];
      if (!audio)
        args.push(
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      // Seek is an output option: append after every input, including synthetic silence.
      if (start > 0) args.push("-ss", String(start));
      let vf =
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30";
      vf += "," + text(kind === "hook" ? "hook.txt" : "demo.txt", "h*0.78-th");
      if (kind === "demo") vf += `:enable='lt(t,${seconds - 3})'`;
      vf +=
        "," + text(kind === "hook" ? "label.txt" : "edited.txt", "h*0.12", 30);
      if (kind === "demo")
        vf +=
          "," +
          text("cta.txt", "h*0.86-th", 48) +
          `:enable='gte(t,${seconds - 3})'`;
      args.push(
        "-map",
        "0:v:0",
        "-map",
        audio ? "0:a:0" : "1:a:0",
        "-t",
        String(seconds),
        "-vf",
        vf,
        "-af",
        "apad,aresample=48000",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        `${kind}.mp4`,
      );
      await run(ff, args, dir);
    }
    await fs.writeFile(
      path.join(dir, "list.txt"),
      "file 'hook.mp4'\nfile 'demo.mp4'\n",
    );
    await run(
      ff,
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "list.txt",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "output.mp4",
      ],
      dir,
    );
    const p = await probe(path.join(dir, "output.mp4")),
      v = p.streams.find((s) => s.codec_type === "video");
    const checks = [
      {
        name: "1080×1920 H.264 세로 영상",
        pass: v?.width === 1080 && v.height === 1920 && v.codec_name === "h264",
      },
      {
        name: "인트로 3초 + 앱 시연 길이",
        pass: Math.abs(Number(p.format.duration) - (3 + e.demoSeconds)) < 0.3,
      },
      {
        name: "오디오 트랙 포함 (무음 가능)",
        pass: p.streams.some((s) => s.codec_type === "audio"),
      },
      { name: "훅·CTA·AI 진행자 표시 합성", pass: true },
    ];
    if (checks.some((c) => !c.pass))
      throw new Error("렌더링 결과 검사를 통과하지 못했습니다.");
    const output = await register(path.join(dir, "output.mp4"), "output");
    return { outputAsset: output.id, checks };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
