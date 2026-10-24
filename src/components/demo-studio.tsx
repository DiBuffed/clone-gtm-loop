"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  AudioWaveform,
  Captions,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clapperboard,
  Copy,
  FastForward,
  FolderOpen,
  Loader2,
  PencilLine,
  Scissors,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useDemo } from "./demo-provider";
import { DemoEditor, Flow, type FlowStep, type Source } from "./demo-editor";
import {
  captionsFileSchema,
  planFileSchema,
  workName,
  type Caption,
  type Plan,
  type PlanFile,
} from "@/lib/autocut";

type Env = {
  enabled: boolean;
  python?: boolean;
  capcut?: boolean | null;
  draftsDir?: string | null;
  captionEngine?: "api" | "claude-code" | "none";
  whisper?: boolean;
};
type Result = {
  duration: number;
  output_duration: number;
  removed_ratio: number;
  clips: number;
  cuts: { count: number; seconds: number };
  speedups: { count: number; seconds_saved: number };
  captions: { total: number; hype: number; sub: number; engine: string };
  warning: string;
  draft: { name: string; path: string };
};
type Job = {
  id: string;
  file: string;
  draftName: string;
  createdAt: string;
  status: "queued" | "running" | "done" | "failed";
  step: "edit" | "rebuild";
  log: string[];
  result?: Result;
  error?: string;
};
type Upload = { key: string; name: string; error?: string };

const autoFlow: FlowStep[] = [
  ["영상 넣기", "여기에 끌어다 놓기", "human"],
  ["컷 편집", "멈춤 컷 · 늘어짐 배속", "auto"],
  ["하이프 자막", "Claude가 화면을 보고", "auto"],
  ["CapCut 초안", "드래프트 폴더에 바로", "auto"],
  ["검토·마무리", "필요할 때만", "human"],
  ["Demo 자산 → 합성", "스토리지·워커 연결 후", "later"],
];
const engineLabel = { api: "Claude API", "claude-code": "Claude Code", none: "없음" } as const;
const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const isVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name);

/** 시연 편집: 로컬 실행이면 자동 편집실, 아니면 파일 기반 검토기. */
export function DemoStudio() {
  const [env, setEnv] = useState<Env | null>(null);
  useEffect(() => {
    fetch("/api/autocut/status")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then(setEnv)
      .catch(() => setEnv({ enabled: false }));
  }, []);
  if (!env) return <div className="loading" role="status">편집실 준비 중…</div>;
  if (!env.enabled)
    return (
      <>
        <p className="subnote">
          자동 편집은 운영자 컴퓨터에서 <code>AUTOCUT_LOCAL=1</code>로 띄웠을 때만 켜져요. 지금은
          autocut 결과 파일을 열어 검토하는 화면이에요.
        </p>
        <DemoEditor />
      </>
    );
  return <AutoStudio env={env} />;
}

// 위에서 한눈에(흐름·숫자) 보고, 내려가며 작업(넣기·설정·진행)하고, 맨 아래에서 결과를 훑는다.
// 결과는 영상 한 줄씩이고, 가장 최근 것은 상세가 펼쳐져 있다.
function AutoStudio({ env }: { env: Env }) {
  const { state } = useDemo();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [speed, setSpeed] = useState(3);
  const [speedOn, setSpeedOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(env.captionEngine !== "none");
  const [speechOn, setSpeechOn] = useState(!!env.whisper);
  const [brief, setBrief] = useState(
    `${state.profile.name}\n${state.profile.description}\n후킹: ${state.profile.hook}`,
  );
  const [editing, setEditing] = useState<{ job: Job; source: Source; captions: Caption[] } | null>(null);
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/autocut/jobs");
    if (res.ok) setJobs((await res.json()).jobs);
  }, []);
  const active = uploads.some((u) => !u.error) || jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  const say = (text: string, bad = false) => {
    setMessage(bad ? "" : text);
    setError(bad ? text : "");
  };

  async function send(files: FileList | File[]) {
    const list = Array.from(files).filter(isVideo);
    if (!list.length) return say("영상 파일만 넣을 수 있어요.", true);
    say(`${list.length}개를 편집 순서에 넣었어요.`);
    const options = {
      speed: speedOn,
      slowSpeed: speed,
      captions: captionsOn ? "auto" : "none",
      speech: speechOn,
      brief: captionsOn ? brief : "",
    };
    for (const file of list) {
      const key = crypto.randomUUID();
      setUploads((u) => [...u, { key, name: file.name }]);
      try {
        const res = await fetch("/api/autocut/jobs", {
          method: "POST",
          body: file,
          headers: {
            "x-file-name": encodeURIComponent(file.name),
            "x-options": encodeURIComponent(JSON.stringify(options)),
          },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "업로드에 실패했어요.");
        setUploads((u) => u.filter((x) => x.key !== key));
        await refresh();
      } catch (err) {
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: (err as Error).message } : x)));
      }
    }
  }

  // 화면 어디에 떨어뜨려도 받는다
  useEffect(() => {
    const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!has(e)) return;
      depth.current += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!has(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    };
    const over = (e: DragEvent) => has(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) void sendRef.current(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  async function openCapCut(job: Job) {
    const res = await fetch("/api/autocut/open", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) say(`CapCut을 열었어요. 목록 맨 앞의 “${job.draftName}”을 누르면 편집본이 열려요.`);
    else say(data.error ?? "CapCut을 열지 못했어요.", true);
  }

  async function review(job: Job) {
    try {
      const raw = await (await fetch(`/api/autocut/jobs/${job.id}/files/plan.json`)).json();
      const file: PlanFile = planFileSchema.parse(raw);
      const capRes = await fetch(`/api/autocut/jobs/${job.id}/files/captions.json`);
      const caps = capRes.ok ? captionsFileSchema.safeParse(await capRes.json()) : null;
      setEditing({
        job,
        captions: caps?.success ? caps.data.captions : [],
        source: {
          key: `job:${job.id}`,
          label: job.file,
          raw,
          file,
          video: `/api/autocut/jobs/${job.id}/files/video`,
          sample: false,
        },
      });
      window.scrollTo({ top: 0 });
    } catch {
      say("편집 결과를 불러오지 못했어요.", true);
    }
  }

  async function rebuild(job: Job, plan: Plan, captions: unknown) {
    const res = await fetch(`/api/autocut/jobs/${job.id}/rebuild`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, captions }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return say(data.error ?? "다시 만들지 못했어요.", true);
    setEditing(null);
    await refresh();
    say(`“${job.draftName}” 초안을 다시 만들고 있어요.`);
  }

  if (editing)
    return (
      <DemoEditor
        key={editing.job.id}
        job={{
          source: editing.source,
          captions: editing.captions,
          rebuilding: false,
          onRebuild: (plan, captions) => rebuild(editing.job, plan, captions),
          onBack: () => setEditing(null),
        }}
      />
    );

  const done = jobs.filter((j) => j.status === "done" && j.result);
  const saved = done.reduce((sum, j) => sum + (j.result!.duration - j.result!.output_duration), 0);
  const avg = done.length ? done.reduce((sum, j) => sum + j.result!.removed_ratio, 0) / done.length : 0;
  const waiting = jobs.filter((j) => j.status === "queued" || j.status === "running").length + uploads.filter((u) => !u.error).length;
  const running = jobs.find((j) => j.status === "running");
  const ready = !!(env.python && env.draftsDir);
  // 따로 접고 펼치지 않았으면 가장 최근 작업을 펼쳐 둔다
  const expanded = open === undefined ? (jobs[0]?.id ?? null) : open;
  const checks: [string, boolean, string][] = [
    ["autocut 환경", !!env.python, env.python ? "Python과 pyCapCut 준비됨" : "tools/autocut/.venv를 만들어 주세요"],
    ["CapCut", !!env.capcut, env.capcut ? "설치됨" : "CapCut 데스크톱을 설치하세요"],
    ["드래프트 폴더", !!env.draftsDir, env.draftsDir ?? "CapCut을 한 번 실행하면 생겨요"],
    [
      `자막 엔진 · ${engineLabel[env.captionEngine ?? "none"]}`,
      env.captionEngine !== "none",
      env.captionEngine === "none" ? "API 키나 Claude Code 로그인이 필요해요" : "하이프 자막을 쓸 수 있어요",
    ],
  ];

  return (
    <div className="sx">
      {dragging && (
        <div className="sx-overlay" aria-hidden="true">
          <AudioWaveform size={44} strokeWidth={1.3} />
          <strong>놓으면 바로 편집을 시작해요</strong>
          <span>여러 개면 순서대로</span>
        </div>
      )}

      <Flow steps={autoFlow} here={running ? "컷 편집" : "영상 넣기"} />

      <section className="sx-kpis" aria-label="편집 요약">
        <div>
          <span>편집한 영상</span>
          <strong>{done.length}</strong>
        </div>
        <div>
          <span>줄인 시간</span>
          <strong>{clock(saved)}</strong>
        </div>
        <div>
          <span>평균 줄임</span>
          <strong>{Math.round(avg * 100)}%</strong>
        </div>
        <div>
          <span>진행 · 대기</span>
          <strong className={waiting ? "busy" : ""}>
            {waiting ? <Loader2 size={18} className="sx-spin" /> : null}
            {waiting}
          </strong>
        </div>
      </section>

      <div className="sx-work">
        <div className="sx-col">
          <section className="sx-drop" aria-label="시연 영상 넣기">
            <AudioWaveform size={30} strokeWidth={1.3} />
            <div>
              <h2>여기에 시연 영상을 끌어다 놓으세요</h2>
              <p>화면 어디에 놓아도 돼요. 여러 개면 순서대로 편집하고, 원본은 그대로 둬요.</p>
            </div>
            <button className="button dark" disabled={!ready} onClick={() => input.current?.click()}>
              <FolderOpen size={15} />
              파일에서 고르기
            </button>
            <input
              ref={input}
              type="file"
              accept="video/*"
              multiple
              hidden
              aria-label="시연 영상 선택"
              onChange={(e) => {
                if (e.target.files?.length) void send(e.target.files);
                e.target.value = "";
              }}
            />
          </section>

          <section className="panel sx-settings" aria-label="편집 설정">
            <h2>설정</h2>
            <label className="sx-toggle">
              <input type="checkbox" checked disabled />
              <span>
                <Scissors size={14} /> 멈춘 화면 자르기
                <small>0.8초 넘게 멈추면 잘라요. 동작 뒤 0.5초는 결과를 볼 수 있게 남겨요</small>
              </span>
            </label>
            <label className="sx-toggle">
              <input type="checkbox" checked={speedOn} onChange={(e) => setSpeedOn(e.target.checked)} />
              <span>
                <FastForward size={14} /> 늘어지는 구간 빨리 돌리기
                <small>타자·로딩처럼 화면이 조금씩만 바뀌는 곳</small>
              </span>
              <select value={speed} disabled={!speedOn} aria-label="배속" onChange={(e) => setSpeed(Number(e.target.value))}>
                {[2, 3, 4].map((v) => (
                  <option key={v} value={v}>
                    {v}배속
                  </option>
                ))}
              </select>
            </label>
            <label className="sx-toggle">
              <input
                type="checkbox"
                checked={captionsOn}
                disabled={env.captionEngine === "none"}
                onChange={(e) => setCaptionsOn(e.target.checked)}
              />
              <span>
                <Sparkles size={14} /> 하이프 자막
                <small>
                  {env.captionEngine === "none"
                    ? "API 키나 Claude Code 로그인이 필요해요"
                    : `${engineLabel[env.captionEngine ?? "none"]}가 편집본 화면을 보고 써요`}
                </small>
              </span>
            </label>
            <label className="sx-toggle">
              <input type="checkbox" checked={speechOn} disabled={!env.whisper} onChange={(e) => setSpeechOn(e.target.checked)} />
              <span>
                <Captions size={14} /> 말소리 자막 · 버벅임 컷
                <small>{env.whisper ? "음·어, 같은 말 되풀이를 잘라요" : "faster-whisper를 설치하면 켜져요"}</small>
              </span>
            </label>
            <label className="sx-brief">
              자막에 참고할 앱 소개
              <textarea rows={2} maxLength={2000} value={brief} disabled={!captionsOn} onChange={(e) => setBrief(e.target.value)} />
              <small>앱 프로필에서 가져왔어요. 화면에 없는 기능은 지어내지 않아요.</small>
            </label>
            <ul className="sx-env" aria-label="준비 상태">
              {checks.map(([label, ok, hint]) => (
                <li key={label} className={ok ? "ok" : "bad"} title={hint}>
                  {ok ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}
                  {label}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="sx-col">
          <section className="panel sx-log" aria-label="진행 상황">
            <div className="sx-log-head">
              <span>진행 상황</span>
              {running && (
                <span className="sx-log-now">
                  <Loader2 size={12} className="sx-spin" /> {workName(running.file)}
                </span>
              )}
            </div>
            <pre aria-live="polite">
              {running
                ? running.log.slice(-16).join("\n") || "시작하는 중…"
                : uploads.some((u) => !u.error)
                  ? `올리는 중: ${uploads.filter((u) => !u.error).map((u) => u.name).join(", ")}`
                  : "대기 중"}
            </pre>
          </section>
          <section className="panel sx-how">
            <h2>어떻게 자르나요</h2>
            <ol>
              <li>화면이 얼마나 바뀌는지 0.1초마다 잽니다</li>
              <li>완전히 멈춘 곳은 자르고, 조금씩만 바뀌는 곳은 빨리 돌립니다</li>
              <li>말소리가 있으면 그 구간은 남기고 군말·되풀이만 자릅니다</li>
              <li>Claude가 편집본 프레임을 보고 하이프 자막을 씁니다</li>
              <li>CapCut 초안으로 만들어 드래프트 폴더에 넣습니다</li>
            </ol>
          </section>
        </div>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status" className="success sx-status">
        {message}
      </p>

      <section className="sx-results" aria-label="편집 결과">
        <div className="section-head">
          <h2>
            편집 결과 <span className="muted small">{jobs.length}개</span>
          </h2>
          <div className="dc-legend">
            <span className="keep">남김</span>
            <span className="fast">배속</span>
            <span className="cut">잘림</span>
          </div>
        </div>
        <div className="sx-table">
          <div className="sx-head" aria-hidden="true">
            <span>영상</span>
            <span>잘린 곳 · 배속</span>
            <span>길이</span>
            <span>줄임</span>
            <span>자막</span>
            <span />
          </div>
          {uploads.map((u) => (
            <div className={`sx-row ${u.error ? "failed" : "running"}`} key={u.key}>
              <div className="sx-name">
                <strong>{workName(u.name)}</strong>
                <small>{u.error ?? "올리는 중…"}</small>
              </div>
              <div className="sx-bar-cell">{!u.error && <div className="sx-pulse" />}</div>
            </div>
          ))}
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              expanded={expanded === job.id}
              onToggle={() => setOpen(expanded === job.id ? null : job.id)}
              onOpen={() => void openCapCut(job)}
              onReview={() => void review(job)}
            />
          ))}
          {!jobs.length && !uploads.length && (
            <div className="sx-empty">
              <AudioWaveform size={28} strokeWidth={1.3} />
              <strong>아직 편집한 영상이 없어요</strong>
              <span>위에 시연 영상을 넣으면 여기에 결과가 쌓여요.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function JobRow({
  job,
  expanded,
  onToggle,
  onOpen,
  onReview,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onReview: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [copied, setCopied] = useState(false);
  const r = job.status === "done" ? job.result : undefined;
  const version = r ? `${job.id}:${r.output_duration}:${r.captions.total}` : null;
  useEffect(() => {
    if (!version) return;
    fetch(`/api/autocut/jobs/${job.id}/files/plan.json`)
      .then((res) => res.json())
      .then((raw) => {
        const parsed = planFileSchema.safeParse(raw);
        if (parsed.success) setPlan(parsed.data.plan);
      })
      .catch(() => {});
  }, [version, job.id]);
  const busy = job.status === "running" || job.status === "queued";
  const note =
    job.status === "failed"
      ? job.error
      : job.status === "queued"
        ? "순서를 기다리는 중"
        : job.status === "running"
          ? (job.log.at(-1) ?? (job.step === "rebuild" ? "초안 다시 만드는 중…" : "편집 시작…")).trim()
          : `클립 ${r?.clips}개 · 초안 “${job.draftName}”`;

  const actions = r && (
    <>
      <button className="button primary" onClick={onOpen} aria-label="CapCut 초안 열기">
        <Clapperboard size={14} />
        CapCut 초안 열기
      </button>
      <a
        className={`button subtle ${r.captions.total ? "" : "disabled"}`}
        href={`/api/autocut/jobs/${job.id}/files/captions.srt`}
        aria-disabled={!r.captions.total}
      >
        <Captions size={14} />
        자막 SRT
      </a>
      <button className="button subtle" onClick={onReview}>
        <PencilLine size={14} />
        검토·수정
      </button>
    </>
  );

  return (
    <Fragment>
      <div className={`sx-row ${job.status} ${expanded ? "open" : ""}`}>
        <div className="sx-name">
          <strong title={job.file}>{workName(job.file)}</strong>
          <small title={note}>{note}</small>
        </div>
        <div className="sx-bar-cell">
          {r && plan ? (
            <div className="sx-bar" aria-label={`컷 ${r.cuts.count}곳, 배속 ${r.speedups.count}곳`}>
              {plan.segments.map((s) => (
                <i
                  key={`s${s.start}`}
                  className={s.speed > 1 ? "fast" : "keep"}
                  style={{ left: `${(s.start / plan.duration) * 100}%`, width: `${((s.end - s.start) / plan.duration) * 100}%` }}
                />
              ))}
              {plan.cuts.map((c) => (
                <i
                  key={`c${c.start}`}
                  className="cut"
                  title={c.reason}
                  style={{ left: `${(c.start / plan.duration) * 100}%`, width: `${((c.end - c.start) / plan.duration) * 100}%` }}
                />
              ))}
            </div>
          ) : busy ? (
            <div className="sx-pulse" />
          ) : null}
        </div>
        <div className="sx-len">
          {r ? (
            <>
              {clock(r.duration)} <span>→</span> <b>{clock(r.output_duration)}</b>
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="sx-ratio">{r ? `${Math.round(r.removed_ratio * 1000) / 10}%` : busy ? <Loader2 size={16} className="sx-spin" /> : "—"}</div>
        <div className="sx-caps">
          {r ? (
            r.warning ? (
              <span className="warn" title={r.warning}>
                <TriangleAlert size={13} /> {r.captions.total}
              </span>
            ) : (
              `${r.captions.total}줄`
            )
          ) : (
            "—"
          )}
        </div>
        <div className="sx-actions">
          {r && (
            <button className="button primary sx-quick" onClick={onOpen} aria-label="CapCut 초안 열기">
              <Clapperboard size={14} />
              CapCut
            </button>
          )}
          <button className="icon-button sx-icon" onClick={onToggle} aria-expanded={expanded} aria-label="자세히" title="자세히">
            <ChevronDown size={15} className={expanded ? "flip" : ""} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="sx-detail">
          {r && (
            <>
              <dl className="sx-stats">
                <div>
                  <dt>원본</dt>
                  <dd>{clock(r.duration)}</dd>
                </div>
                <div>
                  <dt>편집본</dt>
                  <dd className="good">{clock(r.output_duration)}</dd>
                </div>
                <div>
                  <dt>잘라냄</dt>
                  <dd>
                    {r.cuts.seconds.toFixed(1)}초 <small>· {r.cuts.count}곳</small>
                  </dd>
                </div>
                <div>
                  <dt>배속으로 줄임</dt>
                  <dd>
                    {r.speedups.seconds_saved.toFixed(1)}초 <small>· {r.speedups.count}곳</small>
                  </dd>
                </div>
                <div>
                  <dt>자막</dt>
                  <dd>
                    {r.captions.total}줄 <small>· {r.captions.engine === "none" ? "없음" : r.captions.engine}</small>
                  </dd>
                </div>
              </dl>
              {r.warning && <p className="dc-warn">{r.warning}</p>}
              <div className="sx-detail-actions">{actions}</div>
              <button
                className="st-path"
                title="경로 복사"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(r.draft.path);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* 복사를 못 해도 경로는 보인다 */
                  }
                }}
              >
                {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                {r.draft.path}
              </button>
            </>
          )}
          {job.status === "failed" && <p className="dc-warn">{job.error}</p>}
          <details className="sx-logs" open={job.status !== "done"}>
            <summary>로그</summary>
            <pre>{job.log.slice(-40).join("\n") || "로그가 아직 없어요."}</pre>
          </details>
        </div>
      )}
    </Fragment>
  );
}
