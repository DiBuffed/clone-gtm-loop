"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  Copy,
  Download,
  FastForward,
  FileJson,
  FolderOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
  UserRound,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { useDemo } from "./demo-provider";
import { Badge } from "./ui";
import {
  applyOverrides,
  captionSchema,
  captionStyles,
  captionsFileSchema,
  captionsForExport,
  lintCaptions,
  locate,
  longestLine,
  MAX_LINE,
  noOverrides,
  outputDuration,
  planFileSchema,
  planForExport,
  remapCaptions,
  toOutput,
  toSource,
  workName,
  type Caption,
  type CaptionStyle,
  type Overrides,
  type Plan,
  type PlanFile,
} from "@/lib/autocut";
import { sampleCaptions, samplePlan, sampleVideo } from "@/lib/autocut-sample";

type Row = Caption & { id: string };
export type Source = {
  key: string;
  label: string;
  raw: unknown;
  file: PlanFile;
  video: string | null;
  sample: boolean;
};
type Player = ReturnType<typeof usePlayer>;

const STORE = "ugc-z-autocut-v1";
const storedSchema = z.object({
  key: z.string(),
  overrides: z.object({
    restored: z.array(z.number().int().min(0)).max(500),
    normalSpeed: z.array(z.number().int().min(0)).max(500),
  }),
  captions: z.array(captionSchema).max(200),
});

const sampleSource: Source = {
  key: "sample:autocut-sample.mp4",
  label: "샘플 · 가짜 앱 시연 16초",
  raw: samplePlan,
  file: samplePlan,
  video: sampleVideo,
  sample: true,
};

// 자동화 로드맵. 사람이 붙는 칸이 줄어드는 게 목표다.
export type FlowStep = [string, string, "auto" | "human" | "later"];
const reviewFlow: FlowStep[] = [
  ["녹화본", "지금은 로컬 파일", "human"],
  ["컷 분석", "autocut analyze", "auto"],
  ["컷 검토", "이 화면", "human"],
  ["하이프 자막", "Claude Code · API", "auto"],
  ["CapCut 드래프트", "autocut build", "auto"],
  ["마무리", "CapCut에서 확인·내보내기", "human"],
  ["Demo 자산 → 합성", "스토리지·워커 연결 후", "later"],
];
const flowKind: Record<string, [string, string, LucideIcon]> = {
  auto: ["자동", "green", Bot],
  human: ["사람", "amber", UserRound],
  later: ["예정", "neutral", Hourglass],
};
const styleLabel: Record<CaptionStyle, string> = {
  hype: "hype · 핵심",
  punch: "punch · 한 방",
  sub: "sub · 말소리",
};

const clock = (t: number) => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};
const secs = (t: number) => `${t.toFixed(1)}초`;
const withIds = (list: Caption[]): Row[] =>
  list.map((c) => ({ ...c, id: crypto.randomUUID() }));
const strip = (rows: Row[]): Caption[] =>
  rows.map(({ start, end, text, style }) => ({ start, end, text, style }));

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- 재생

/**
 * 렌더링 없이 편집본을 미리 본다. 원본 영상을 틀어 두고 잘린 구간은 건너뛰고,
 * 배속 구간은 playbackRate를 바꾼다. 영상이 없으면 가상 시계로 같은 일을 한다.
 */
function usePlayer(plan: Plan, duration: number, hasVideo: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(plan.segments[0]?.start ?? 0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"edit" | "raw">("edit");
  const timeRef = useRef(time);
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const seek = useCallback((t: number) => {
    const next = Math.min(Math.max(0, t), duration);
    timeRef.current = next;
    setTime(next);
    if (video.current) video.current.currentTime = next;
  }, [duration]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const stop = (at: number) => {
      setPlaying(false);
      video.current?.pause();
      timeRef.current = at;
      setTime(at);
    };
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const p = planRef.current;
      const v = hasVideo ? video.current : null;
      let t = v ? v.currentTime : timeRef.current;
      if (mode === "edit") {
        const { segment } = locate(p, t);
        if (!segment) return stop(p.segments.at(-1)?.end ?? duration);
        if (t < segment.start) {
          t = segment.start;
          if (v) v.currentTime = t;
        }
        if (v) v.playbackRate = segment.speed;
        else t += dt * segment.speed;
      } else {
        if (v) v.playbackRate = 1;
        else t += dt;
        if (t >= duration) return stop(duration);
      }
      timeRef.current = t;
      setTime(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, mode, hasVideo, duration]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      video.current?.pause();
      return;
    }
    const p = planRef.current;
    const end = mode === "edit" ? (p.segments.at(-1)?.end ?? duration) : duration;
    if (timeRef.current >= end - 0.05)
      seek(mode === "edit" ? p.segments[0].start : 0);
    setPlaying(true);
    video.current?.play().catch(() => setPlaying(false));
  };

  return { video, time, playing, mode, setMode, seek, toggle, setPlaying };
}

// ---------------------------------------------------------------- 화면

export type EditorJob = {
  source: Source;
  captions: Caption[];
  rebuilding: boolean;
  onRebuild: (plan: Plan, captions: ReturnType<typeof captionsForExport>) => Promise<void>;
  onBack: () => void;
};

/** 편집 결과 검토기. job이 없으면 샘플·로컬 파일로, 있으면 자동 편집 작업의 결과로 연다. */
export function DemoEditor({ job }: { job?: EditorJob } = {}) {
  const { state, update } = useDemo();
  const [source, setSource] = useState<Source>(job?.source ?? sampleSource);
  const [overrides, setOverrides] = useState<Overrides>(noOverrides);
  const [rows, setRows] = useState<Row[]>(() => withIds(job?.captions ?? sampleCaptions));
  const [tab, setTab] = useState<"cuts" | "captions" | "export">("cuts");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  const objectUrl = useRef<string | null>(null);

  const base = source.file.plan;
  const duration = base.duration;
  const plan = useMemo(() => applyOverrides(base, overrides), [base, overrides]);
  const outDur = outputDuration(plan);
  const captions = useMemo(() => strip(rows), [rows]);
  const checks = useMemo(() => lintCaptions(captions, outDur), [captions, outDur]);
  const player = usePlayer(plan, duration, !!source.video);
  const edited = overrides.restored.length + overrides.normalSpeed.length > 0;
  const name = source.sample ? "sample" : workName(source.file.source.path);

  // 브라우저에 남겨 둔 검토 내용은 같은 영상일 때만 되살린다
  useEffect(() => {
    if (job) return setRestored(false); // 작업 결과는 서버에 있으니 브라우저에 따로 남기지 않는다
    try {
      const raw = localStorage.getItem(STORE);
      const parsed = raw ? storedSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success && parsed.data.key === sampleSource.key) {
        setOverrides(parsed.data.overrides);
        setRows(withIds(parsed.data.captions));
      }
    } catch {
      /* 저장소를 못 쓰면 샘플 그대로 시작한다 */
    }
    setRestored(true);
  }, [job]);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({ key: source.key, overrides, captions }),
      );
    } catch {
      /* 저장 실패는 조용히 넘긴다. 내려받기로 결과를 챙길 수 있다 */
    }
  }, [restored, source.key, overrides, captions]);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const say = (text: string) => {
    setMessage(text);
    setError("");
  };
  const changeOverrides = (next: Overrides) => {
    const nextPlan = applyOverrides(base, next);
    setRows((list) =>
      remapCaptions(strip(list), plan, nextPlan).map((c, i) => ({
        ...c,
        id: list[i].id,
      })),
    );
    setOverrides(next);
    say("편집 계획을 바꿨어요. 자막은 같은 장면을 따라 옮겼습니다.");
  };
  const toggleIn = (list: number[], i: number) =>
    list.includes(i) ? list.filter((x) => x !== i) : [...list, i];

  async function openFiles(files: FileList | File[]) {
    let file: PlanFile | null = null,
      raw: unknown = null,
      caps: Caption[] | null = null,
      video: string | null = null;
    const problems: string[] = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith("video/")) {
        video = URL.createObjectURL(f);
        continue;
      }
      if (!f.name.endsWith(".json")) {
        problems.push(`${f.name}: plan.json·captions.json·영상만 열 수 있어요.`);
        continue;
      }
      try {
        const json = JSON.parse(await f.text());
        if (json && "plan" in json) {
          const parsed = planFileSchema.safeParse(json);
          if (parsed.success) [file, raw] = [parsed.data, json];
          else problems.push(`${f.name}: autocut plan.json 형식이 아니에요.`);
        } else {
          const parsed = captionsFileSchema.safeParse(json);
          if (parsed.success) caps = parsed.data.captions;
          else problems.push(`${f.name}: captions.json 형식이 아니에요.`);
        }
      } catch {
        problems.push(`${f.name}: JSON을 읽지 못했어요.`);
      }
    }
    if (video) {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = video;
    }
    player.setPlaying(false);
    if (file) {
      const next: PlanFile = file;
      setSource({
        key: `${next.source.path}:${next.plan.duration}`,
        label: workName(next.source.path),
        raw,
        file: next,
        video,
        sample: false,
      });
      setOverrides(noOverrides);
      setRows(withIds(caps ?? []));
      player.seek(next.plan.segments[0].start);
    } else if (caps || video) {
      if (caps) setRows(withIds(caps));
      if (video) setSource((s) => ({ ...s, video }));
    }
    if (problems.length) {
      setError(problems.join(" "));
      setMessage("");
    } else if (file || caps || video) {
      say(
        [file && "편집 계획", caps && "자막", video && "원본 영상"]
          .filter(Boolean)
          .join(" · ") + "을 열었어요.",
      );
    }
  }

  const resetToSample = () => {
    player.setPlaying(false);
    setSource(sampleSource);
    setOverrides(noOverrides);
    setRows(withIds(sampleCaptions));
    player.seek(samplePlan.plan.segments[0].start);
    say("샘플로 돌아왔어요.");
  };

  return (
    <div className="dc">
      {job ? (
        <div className="dc-source">
          <span className="task-icon mint-icon">
            <Clapperboard size={18} />
          </span>
          <div>
            <strong>
              {source.label} <Badge tone="green">자동 편집 결과</Badge>
            </strong>
            <p>컷과 자막을 고친 뒤 내보내기에서 CapCut 초안을 다시 만드세요.</p>
          </div>
          <button className="button subtle" onClick={job.onBack}>
            <Undo2 size={15} />
            결과 목록으로
          </button>
        </div>
      ) : (
        <>
          <Flow steps={reviewFlow} here="컷 검토" />
          <SourceBar source={source} onFiles={openFiles} onSample={resetToSample} />
        </>
      )}
      <section className="dc-stats" aria-label="편집 요약">
        <div>
          <span>길이</span>
          <strong>
            {secs(duration)} <ArrowRight size={16} /> {secs(outDur)}
          </strong>
        </div>
        <div>
          <span>줄인 비율</span>
          <strong>{Math.round((1 - outDur / duration) * 100)}%</strong>
        </div>
        <div>
          <span>컷 · 배속</span>
          <strong>
            {plan.cuts.length}
            <small> · {plan.segments.filter((s) => s.speed > 1).length}</small>
          </strong>
        </div>
        <div>
          <span>자막 점검</span>
          <strong>
            {checks.filter((c) => c.ok).length}
            <small> / {checks.length}</small>
          </strong>
        </div>
      </section>

      <div className="dc-grid">
        <Preview
          player={player}
          plan={plan}
          file={source.file}
          video={source.video}
          captions={captions}
          outDur={outDur}
          onMismatch={() =>
            setError("영상 길이가 편집 계획과 달라요. 같은 영상의 plan.json인지 확인해 주세요.")
          }
        />
        <section className="panel dc-side">
          <div className="tabs" role="group" aria-label="검토 단계">
            {(
              [
                ["cuts", "컷 검토", plan.cuts.length + plan.segments.filter((s) => s.speed > 1).length],
                ["captions", "자막", rows.length],
                ["export", "내보내기", null],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
                {count !== null && <span>{count}</span>}
              </button>
            ))}
          </div>
          {tab === "cuts" && (
            <CutList
              base={base}
              overrides={overrides}
              edited={edited}
              onRestore={(i) =>
                changeOverrides({ ...overrides, restored: toggleIn(overrides.restored, i) })
              }
              onSpeed={(i) =>
                changeOverrides({ ...overrides, normalSpeed: toggleIn(overrides.normalSpeed, i) })
              }
              onReset={() => changeOverrides(noOverrides)}
              onSeek={(t) => {
                player.setMode("raw");
                player.seek(t);
              }}
            />
          )}
          {tab === "captions" && (
            <CaptionEditor
              rows={rows}
              setRows={setRows}
              checks={checks}
              outDur={outDur}
              now={toOutput(plan, player.time)}
              onSeek={(out) => {
                player.setMode("edit");
                player.seek(toSource(plan, out));
              }}
            />
          )}
          {tab === "export" && (
            <Export
              name={name}
              edited={edited}
              onPlan={() => {
                download("plan.json", planForExport(source.raw, plan));
                say("plan.json을 내려받았어요. work 폴더의 파일을 바꿔 넣으세요.");
              }}
              onCaptions={() => {
                download("captions.json", captionsForExport(captions, plan));
                say("captions.json을 내려받았어요.");
              }}
              jobs={state.jobs}
              onDone={(id) => {
                update((s) => ({
                  ...s,
                  jobs: s.jobs.map((j) => (j.id === id ? { ...j, demo: "ready" } : j)),
                }));
                say("제작 요청의 Demo 단계를 완료로 표시했어요. 합성은 Hook까지 준비된 뒤에 열립니다.");
              }}
              failing={checks.filter((c) => !c.ok).length}
              rebuild={
                job && {
                  busy: job.rebuilding,
                  run: () => job.onRebuild(plan, captionsForExport(captions, plan)),
                }
              }
            />
          )}
        </section>
      </div>

      <Timeline
        base={base}
        plan={plan}
        overrides={overrides}
        captions={captions}
        player={player}
        outDur={outDur}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" className="success">
        {message}
      </p>
    </div>
  );
}

export function Flow({ steps, here }: { steps: FlowStep[]; here: string }) {
  return (
    <ol className="dc-flow" aria-label="시연 편집 흐름" style={{ "--steps": steps.length } as CSSProperties}>
      {steps.map(([title, detail, kind], i) => {
        const [label, tone, Icon] = flowKind[kind];
        return (
          <li key={title} className={`${kind} ${title === here ? "here" : ""}`}>
            <span className="dc-flow-step">{String(i + 1).padStart(2, "0")}</span>
            <strong>{title}</strong>
            <small>{detail}</small>
            <Badge tone={tone}>
              <Icon size={10} /> {label}
            </Badge>
          </li>
        );
      })}
    </ol>
  );
}

function SourceBar({
  source,
  onFiles,
  onSample,
}: {
  source: Source;
  onFiles: (files: FileList | File[]) => void;
  onSample: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dc-source ${over ? "over" : ""}`}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <span className="task-icon mint-icon">
        <Clapperboard size={18} />
      </span>
      <div>
        <strong>
          {source.label}
          {source.sample && <Badge>샘플</Badge>}
          {!source.video && <Badge tone="amber">영상 미연결</Badge>}
        </strong>
        <p>
          작업 폴더의 plan.json · captions.json · 원본 영상을 한꺼번에 끌어다
          놓으세요. 파일은 이 브라우저 밖으로 나가지 않아요.
        </p>
      </div>
      {!source.sample && (
        <button className="button subtle" onClick={onSample}>
          <RotateCcw size={15} />
          샘플
        </button>
      )}
      <button className="button dark" onClick={() => input.current?.click()}>
        <FolderOpen size={15} />
        작업 파일 열기
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".json,application/json,video/*"
        aria-label="작업 파일 선택"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Preview({
  player,
  plan,
  file,
  video,
  captions,
  outDur,
  onMismatch,
}: {
  player: Player;
  plan: Plan;
  file: PlanFile;
  video: string | null;
  captions: Caption[];
  outDur: number;
  onMismatch: () => void;
}) {
  const { width, height } = file.source;
  const out = toOutput(plan, player.time);
  const here = locate(plan, player.time);
  const showing =
    player.mode === "edit"
      ? captions.filter((c) => c.text.trim() && out >= c.start && out < c.end)
      : [];
  return (
    <section className="panel dc-preview">
      <div
        className="dc-screen"
        style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${Math.round((440 * width) / height)}px)` }}
      >
        {video ? (
          <video
            ref={player.video}
            src={video}
            playsInline
            preload="auto"
            onEnded={() => player.setPlaying(false)}
            onLoadedMetadata={(e) => {
              if (Math.abs(e.currentTarget.duration - file.source.duration) > 0.5) onMismatch();
              e.currentTarget.currentTime = player.time;
            }}
          />
        ) : (
          <div className="dc-novideo">
            <Clapperboard size={26} />
            <p>원본 영상을 함께 열면 편집본을 그대로 틀어 볼 수 있어요.</p>
          </div>
        )}
        {showing.map((c) => (
          <p key={`${c.start}-${c.text}`} className={`dc-cap ${c.style}`}>
            {c.text}
          </p>
        ))}
        {player.mode === "raw" && here.cut && (
          <span className="dc-flag cut">
            <Scissors size={12} /> {here.cut.reason} · 편집본에서 빠짐
          </span>
        )}
        {player.mode === "raw" && !here.cut && here.segment && here.segment.speed > 1 && (
          <span className="dc-flag fast">
            <FastForward size={12} /> 편집본에서 {here.segment.speed}배속
          </span>
        )}
      </div>
      <div className="dc-controls">
        <button
          className="button primary dc-play"
          onClick={player.toggle}
          aria-label={player.playing ? "일시정지" : "재생"}
        >
          {player.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="dc-time">
          {player.mode === "edit"
            ? `${clock(out)} / ${clock(outDur)}`
            : `${clock(player.time)} / ${clock(file.source.duration)}`}
        </span>
        <div className="dc-seg" role="group" aria-label="미리보기 기준">
          {(
            [
              ["edit", "편집본"],
              ["raw", "원본"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={player.mode === id}
              className={player.mode === id ? "active" : ""}
              onClick={() => player.setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="dc-hint">
        {player.mode === "edit"
          ? "잘린 곳은 건너뛰고 배속은 그대로 적용해 틀어요. 렌더링하지 않은 미리보기예요."
          : "원본 그대로 틀면서 어디가 빠지고 빨라지는지 표시해요."}
      </p>
    </section>
  );
}

function CutList({
  base,
  overrides,
  edited,
  onRestore,
  onSpeed,
  onReset,
  onSeek,
}: {
  base: Plan;
  overrides: Overrides;
  edited: boolean;
  onRestore: (i: number) => void;
  onSpeed: (i: number) => void;
  onReset: () => void;
  onSeek: (t: number) => void;
}) {
  const fast = base.segments
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.speed > 1);
  if (!base.cuts.length && !fast.length)
    return <p className="subnote">자를 곳을 찾지 못했어요. 이미 잘 다듬어진 영상이에요.</p>;
  return (
    <>
      <div className="dc-list-head">
        <p>
          자동으로 판단한 {base.cuts.length + fast.length}곳 중{" "}
          <strong>{overrides.restored.length + overrides.normalSpeed.length}곳</strong>을
          되돌렸어요.
        </p>
        {edited && (
          <button className="text-link dc-link" onClick={onReset}>
            <Undo2 size={13} /> 자동 판단으로
          </button>
        )}
      </div>
      <ul className="dc-list">
        {base.cuts.map((c, i) => {
          const off = overrides.restored.includes(i);
          return (
            <li key={`c${i}`} className={off ? "off" : ""}>
              <button className="dc-jump cut" onClick={() => onSeek(c.start)} aria-label={`${clock(c.start)}로 이동`}>
                <Scissors size={15} />
              </button>
              <div>
                <strong>{c.reason}</strong>
                <small>
                  {clock(c.start)}–{clock(c.end)} · {secs(c.end - c.start)}
                </small>
              </div>
              <button className="button subtle" aria-pressed={off} onClick={() => onRestore(i)}>
                {off ? "다시 자르기" : "살리기"}
              </button>
            </li>
          );
        })}
        {fast.map((s) => {
          const off = overrides.normalSpeed.includes(s.i);
          return (
            <li key={`s${s.i}`} className={off ? "off" : ""}>
              <button className="dc-jump fast" onClick={() => onSeek(s.start)} aria-label={`${clock(s.start)}로 이동`}>
                <FastForward size={15} />
              </button>
              <div>
                <strong>늘어지는 구간 · {s.speed}배속</strong>
                <small>
                  {clock(s.start)}–{clock(s.end)} · {secs(s.end - s.start)} →{" "}
                  {secs((s.end - s.start) / s.speed)}
                </small>
              </div>
              <button className="button subtle" aria-pressed={off} onClick={() => onSpeed(s.i)}>
                {off ? `다시 ${s.speed}배속` : "원속도로"}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="dc-hint">
        타자·로딩처럼 조금씩만 바뀌는 곳은 자르지 않고 빨리 돌려요. 무슨 일이
        있었는지는 보이되 기다리지 않게요.
      </p>
    </>
  );
}

function CaptionEditor({
  rows,
  setRows,
  checks,
  outDur,
  now,
  onSeek,
}: {
  rows: Row[];
  setRows: (fn: (rows: Row[]) => Row[]) => void;
  checks: ReturnType<typeof lintCaptions>;
  outDur: number;
  now: number;
  onSeek: (out: number) => void;
}) {
  const edit = (id: string, patch: Partial<Caption>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  const num = (v: string) => Math.round(Math.min(Math.max(0, Number(v) || 0), outDur) * 10) / 10;
  return (
    <>
      <ul className="dc-checks" aria-label="하이프 자막 점검">
        {checks.map((c) => (
          <li key={c.id} className={c.ok ? "ok" : "bad"} title={c.detail}>
            {c.ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
            {c.label}
          </li>
        ))}
      </ul>
      {checks.filter((c) => !c.ok).map((c) => (
        <p key={c.id} className="dc-warn">
          {c.detail}
        </p>
      ))}
      <ul className="dc-captions">
        {sorted.map((r) => {
          const over = r.style !== "sub" && longestLine(r.text) > MAX_LINE;
          return (
            <li key={r.id}>
              <button className="dc-jump" onClick={() => onSeek(r.start)} aria-label={`${clock(r.start)}부터 보기`}>
                <Play size={13} />
              </button>
              <label className="dc-num">
                <span className="sr-only">시작</span>
                <input type="number" step={0.1} min={0} max={outDur} value={r.start}
                  onChange={(e) => edit(r.id, { start: num(e.target.value) })} />
              </label>
              <label className="dc-num">
                <span className="sr-only">끝</span>
                <input type="number" step={0.1} min={0} max={outDur} value={r.end}
                  onChange={(e) => edit(r.id, { end: num(e.target.value) })} />
              </label>
              <label className="dc-text">
                <span className="sr-only">자막 문구</span>
                <input value={r.text} maxLength={80} placeholder="자막 문구"
                  aria-invalid={over}
                  onChange={(e) => edit(r.id, { text: e.target.value })} />
                <small className={over ? "over" : ""}>
                  {longestLine(r.text)}/{MAX_LINE}
                </small>
              </label>
              <label className="dc-style">
                <span className="sr-only">스타일</span>
                <select value={r.style} onChange={(e) => edit(r.id, { style: e.target.value as CaptionStyle })}>
                  {captionStyles.map((s) => (
                    <option key={s} value={s}>
                      {styleLabel[s]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="icon-button" aria-label={`“${r.text || "빈 자막"}” 지우기`}
                onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}>
                <Trash2 size={15} />
              </button>
            </li>
          );
        })}
      </ul>
      {!rows.length && (
        <p className="subnote">
          아직 자막이 없어요. Claude Code에게 “이 영상 자막 써줘”라고 하거나 여기서 직접 추가하세요.
        </p>
      )}
      <button
        className="button subtle full"
        disabled={rows.length >= 200 || outDur - now < 0.3}
        onClick={() => {
          const start = Math.round(now * 10) / 10;
          setRows((list) => [
            ...list,
            { id: crypto.randomUUID(), start, end: Math.min(outDur, start + 1.5), text: "", style: "hype" },
          ]);
        }}
      >
        <Plus size={15} />
        {clock(now)}에 자막 추가
      </button>
    </>
  );
}

function Export({
  name,
  edited,
  onPlan,
  onCaptions,
  jobs,
  onDone,
  failing,
  rebuild,
}: {
  rebuild?: { busy: boolean; run: () => Promise<void> };
  name: string;
  edited: boolean;
  onPlan: () => void;
  onCaptions: () => void;
  jobs: { id: string; name: string; demo: string; profile: { name: string } }[];
  onDone: (id: string) => void;
  failing: number;
}) {
  const [job, setJob] = useState("");
  const [copied, setCopied] = useState(false);
  const command = `cd tools/autocut\n.venv/bin/python -m autocut build work/${name}`;
  return (
    <ol className="dc-steps">
      {rebuild ? (
        <li>
          <strong>CapCut 초안 다시 만들기</strong>
          <p>고친 컷과 자막으로 같은 이름의 초안을 덮어써요.</p>
          <button className="button primary" disabled={rebuild.busy} onClick={() => void rebuild.run()}>
            <Clapperboard size={15} />
            {rebuild.busy ? "만드는 중…" : "CapCut 초안 다시 만들기"}
          </button>
          <div className="dc-buttons">
            <button className="button subtle" onClick={onCaptions}>
              <Download size={15} />
              captions.json
            </button>
          </div>
        </li>
      ) : (
        <>
      <li>
        <strong>작업 폴더에 넣기</strong>
        <p>
          <code>tools/autocut/work/{name}/</code>에 내려받은 파일을 덮어쓰세요.
        </p>
        <div className="dc-buttons">
          <button className="button subtle" onClick={onCaptions}>
            <Download size={15} />
            captions.json
          </button>
          <button className="button subtle" onClick={onPlan} disabled={!edited}>
            <FileJson size={15} />
            plan.json
            {edited && <Badge tone="amber">수정됨</Badge>}
          </button>
        </div>
        {!edited && <small>컷을 바꾸지 않았으면 plan.json은 그대로 두면 돼요.</small>}
      </li>
      <li>
        <strong>CapCut 드래프트 만들기</strong>
        <div className="dc-code">
          <pre>{command}</pre>
          <button
            className="icon-button"
            aria-label="명령 복사"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(command);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
        <small>
          CapCut 목록에 <b>{name}_autocut</b>이 생겨요. Claude Code에게 “autocut
          빌드해줘”라고 해도 됩니다.
        </small>
      </li>
        </>
      )}
      <li>
        <strong>제작 요청에 반영</strong>
        {jobs.length ? (
          <>
            <label>
              <span className="sr-only">제작 요청</span>
              <select value={job} onChange={(e) => setJob(e.target.value)}>
                <option value="">연결할 제작 요청 선택</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id} disabled={j.demo === "ready"}>
                    {j.name} · {j.profile.name}
                    {j.demo === "ready" ? " (완료)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary full" disabled={!job} onClick={() => onDone(job)}>
              <Check size={15} />
              Demo 완료로 표시
            </button>
            {failing > 0 && (
              <small className="dc-warn-inline">
                자막 점검 {failing}개가 남아 있어요. 그래도 표시할 수는 있어요.
              </small>
            )}
            <Link className="text-link" href="/admin/operations">
              제작 관리에서 보기 <ArrowRight size={13} />
            </Link>
          </>
        ) : (
          <p>
            연결할 제작 요청이 없어요.{" "}
            <Link className="text-link" href="/app/content">
              고객 화면에서 요청 만들기 <ArrowRight size={13} />
            </Link>
          </p>
        )}
      </li>
    </ol>
  );
}

function Timeline({
  base,
  plan,
  overrides,
  captions,
  player,
  outDur,
}: {
  base: Plan;
  plan: Plan;
  overrides: Overrides;
  captions: Caption[];
  player: Player;
  outDur: number;
}) {
  const duration = base.duration;
  const pct = (t: number, of = duration) => `${(Math.min(Math.max(t, 0), of) / of) * 100}%`;
  const out = toOutput(plan, player.time);
  const restoredCuts = base.cuts.filter((_, i) => overrides.restored.includes(i));
  const seekFrom = (e: ReactMouseEvent<HTMLDivElement>, of: number, map: (x: number) => number) => {
    const box = e.currentTarget.getBoundingClientRect();
    player.seek(map(((e.clientX - box.left) / box.width) * of));
  };
  let acc = 0;
  const outPieces = plan.segments.map((s) => {
    const piece = { ...s, at: acc, len: (s.end - s.start) / s.speed };
    acc += piece.len;
    return piece;
  });
  return (
    <section className="panel dc-timeline" aria-label="타임라인">
      <div className="section-head">
        <h2>타임라인</h2>
        <div className="dc-legend">
          <span className="keep">남김</span>
          <span className="fast">배속</span>
          <span className="cut">잘림</span>
          <span className="restored">되살림</span>
          <span className="cap">자막</span>
        </div>
      </div>
      <div className="dc-row">
        <span>원본 {secs(duration)}</span>
        <div
          className="dc-track"
          onClick={(e) => {
            player.setMode("raw");
            seekFrom(e, duration, (x) => x);
          }}
        >
          {plan.segments.map((s) => (
            <i key={`k${s.start}`} className={s.speed > 1 ? "fast" : "keep"}
              style={{ left: pct(s.start), width: pct(s.end - s.start) }} />
          ))}
          {plan.cuts.map((c) => (
            <i key={`x${c.start}`} className="cut" title={c.reason}
              style={{ left: pct(c.start), width: pct(c.end - c.start) }} />
          ))}
          {restoredCuts.map((c) => (
            <i key={`r${c.start}`} className="restored" title={`${c.reason} (되살림)`}
              style={{ left: pct(c.start), width: pct(c.end - c.start) }} />
          ))}
          {base.events.map((t) => (
            <b key={`e${t}`} className="dc-event" style={{ left: pct(t) }} title="화면 전환" />
          ))}
          <em className="dc-head" style={{ left: pct(player.time) }} />
        </div>
      </div>
      <div className="dc-row">
        <span>편집본 {secs(outDur)}</span>
        <div className="dc-out" style={{ width: pct(outDur) }}>
          <div className="dc-lane" aria-hidden="true">
            {captions.filter((c) => c.text.trim()).map((c) => (
              <i key={`${c.start}-${c.text}`} className={c.style}
                style={{ left: pct(c.start, outDur), width: pct(c.end - c.start, outDur) }}
                title={c.text} />
            ))}
          </div>
          <div
            className="dc-track"
            onClick={(e) => {
              player.setMode("edit");
              seekFrom(e, outDur, (x) => toSource(plan, x));
            }}
          >
            {outPieces.map((p) => (
              <i key={`o${p.start}`} className={p.speed > 1 ? "fast" : "keep"}
                style={{ left: pct(p.at, outDur), width: pct(p.len, outDur) }} />
            ))}
            <em className="dc-head" style={{ left: pct(out, outDur) }} />
          </div>
        </div>
      </div>
    </section>
  );
}
