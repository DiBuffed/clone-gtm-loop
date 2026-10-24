"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Asset, Campaign, Experiment, Job } from "@/server/gtm/model";
import { hooks } from "@/server/gtm/model";
type ExperimentView = Experiment & {
  stats: {
    clicks: number;
    eligibleUsers: number;
    activated: number;
    mature: number;
    repeated: number;
    pending: number;
  };
  recommendation: { ready: boolean; reason: string; change: string };
};
type State = {
  campaigns: Campaign[];
  experiments: ExperimentView[];
  assets: Asset[];
  jobs: Job[];
  connections: {
    higgsfield: boolean;
    instagram: boolean;
    events: boolean;
    publicUrl: string | null;
    worker: { body: string } | null;
  };
};
const labels: Record<string, string> = {
  draft: "초안",
  generating: "인트로 생성 중",
  rendering: "MP4 합성 중",
  review: "영상 검토",
  approved: "승인 완료",
  publishing: "게시 처리 중",
  published: "게시 완료",
  failed: "실패",
  needs_attention: "원격 결과 확인 필요",
  queued: "대기",
  running: "실행 중",
  done: "완료",
};
async function request(url: string, method = "GET", input?: unknown) {
  const r = await fetch("/api/gtm/" + url, {
    method,
    headers: input ? { "Content-Type": "application/json" } : undefined,
    body: input ? JSON.stringify(input) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "요청 실패");
  return data;
}
export function GtmConsole() {
  const [state, setState] = useState<State | null>(null),
    [loggedIn, setLoggedIn] = useState(false),
    [token, setToken] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [campaignId, setCampaignId] = useState(""),
    [selected, setSelected] = useState("");
  const [name, setName] = useState("요리고 첫 레시피"),
    [customer, setCustomer] = useState(
      "SNS 요리 영상을 저장하지만 재료와 조리법을 다시 확인하는 번거로움 때문에 실행하지 못하는 한국어 사용자",
    );
  const [persona, setPersona] = useState(
      "Korean adult cooking presenter, casual home kitchen, natural smartphone selfie, consistent appearance",
    ),
    [destination, setDestination] = useState("https://yorigo.kr/"),
    [auto, setAuto] = useState(false),
    [autoPublish, setAutoPublish] = useState(false);
  const [hook, setHook] = useState(hooks[0]),
    [cta, setCta] = useState("저장한 요리 영상 하나, 요리고에 넣어보세요."),
    [caption, setCaption] = useState(
      "SNS 레시피를 재료와 조리 순서로 정리하세요. 프로필 링크에서 요리고를 만나보세요. AI 진행자가 소개하는 요리고입니다.",
    );
  const [hookAsset, setHookAsset] = useState(""),
    [demoAsset, setDemoAsset] = useState(""),
    [referenceAsset, setReferenceAsset] = useState(""),
    [seconds, setSeconds] = useState(12),
    [introMode, setIntroMode] = useState<"reaction" | "spoken">("reaction"),
    [hookStartSeconds, setHookStartSeconds] = useState(0),
    [verified, setVerified] = useState(false),
    [recoverId, setRecoverId] = useState("");
  const refresh = useCallback(async () => {
    try {
      const s = await request("state");
      setState(s);
      setLoggedIn(true);
      setCampaignId((v) => v || s.campaigns[0]?.id || "");
    } catch (e) {
      if ((e as Error).message.includes("로그인")) setLoggedIn(false);
      else setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);
  async function act(fn: () => Promise<unknown>, message = "저장했습니다.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(kind: string, file: File | undefined) {
    if (!file) return;
    await act(async () => {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("파일은 100MB 이하로 올려주세요.");
      const r = await fetch("/api/gtm/assets?kind=" + kind, {
        method: "POST",
        body: file,
      });
      const a = await r.json();
      if (!r.ok) throw new Error(a.error);
      if (kind === "hook") setHookAsset(a.id);
      if (kind === "demo") setDemoAsset(a.id);
      if (kind === "reference") setReferenceAsset(a.id);
    }, "파일 검사를 마치고 저장했습니다.");
  }
  const exps =
      state?.experiments.filter((e) => e.campaignId === campaignId) || [],
    e = exps.find((e) => e.id === selected) || exps[0];
  const c = state?.campaigns.find((c) => c.id === campaignId);
  const worker = state?.connections.worker
    ? (JSON.parse(state.connections.worker.body) as { heartbeat: number })
    : null;
  const workerLive = worker && Date.now() - worker.heartbeat < 20 * 60000;
  const media = (id: string) => "/api/gtm/media/" + id;
  const tracking =
    e && state?.connections.publicUrl
      ? `${state.connections.publicUrl}/r/${e.id}`
      : null;
  const assets = (kind: string) =>
    state?.assets.filter((a) => a.kind === kind) || [];
  const input = {
    hook,
    cta,
    caption,
    demoSeconds: seconds,
    introMode,
    hookStartSeconds,
    hookAsset: hookAsset || undefined,
    demoAsset: demoAsset || undefined,
    referenceAsset: referenceAsset || undefined,
  };
  return (
    <main className="gtm">
      <header className="gtm-top">
        <Link href="/admin/operations" className="gtm-brand">
          UGC-Z <span>/ GTM</span>
        </Link>
        <span>YORIGO CAMPAIGN LAB</span>
        <Link href="/gtm/loop">전체 GTM 루프 ↗</Link>
        {loggedIn && (
          <button
            className="gtm-quiet"
            onClick={() =>
              void act(async () => {
                await request("logout", "POST");
                setLoggedIn(false);
                setState(null);
              })
            }
          >
            로그아웃
          </button>
        )}
      </header>
      <div className="gtm-intro">
        <p className="gtm-eyebrow">만들고, 알리고, 다음 시도를 배우세요.</p>
        <h1>
          영상 한 편에서
          <br />
          실제 고객의 첫 사용까지.
        </h1>
        <p>
          AI 진행자 3초 + 실제 앱 시연. 게시물마다 유입과 활성화를 연결합니다.
        </p>
      </div>
      <div aria-live="polite">
        {error && (
          <p className="gtm-error" role="alert">
            {error}
          </p>
        )}
        {notice && <p className="gtm-notice">{notice}</p>}
      </div>
      {!loggedIn ? (
        <form
          className="gtm-login"
          onSubmit={(ev) => {
            ev.preventDefault();
            void act(async () => {
              await request("login", "POST", { token });
              setToken("");
              setLoggedIn(true);
            }, "운영 콘솔에 연결했습니다.");
          }}
        >
          <h2>운영 콘솔 연결</h2>
          <p>
            서버에 설정한 운영 키로 접속합니다. 키는 브라우저에 저장하지
            않습니다.
          </p>
          <label>
            운영 키
            <input
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(ev) => setToken(ev.target.value)}
              required
            />
          </label>
          <button disabled={busy}>연결하기</button>
        </form>
      ) : (
        <>
          <section className="gtm-connections" aria-label="실제 연동 상태">
            {[
              ["Higgsfield", state?.connections.higgsfield],
              ["Instagram", state?.connections.instagram],
              ["앱 이벤트 키", state?.connections.events],
              ["작업 워커", workerLive],
            ].map(([name, ok]) => (
              <span key={String(name)}>
                <i className={ok ? "on" : ""} />
                {name} · {ok ? "설정됨" : "연결 필요"}
              </span>
            ))}
            <small>설정됨은 실제 계정·권한 검증 완료를 뜻하지 않습니다.</small>
          </section>
          <section className="gtm-section">
            <div className="gtm-section-title">
              <div>
                <p className="gtm-eyebrow">01 / 고객과 실험</p>
                <h2>한 고객, 한 문제에서 시작합니다.</h2>
              </div>
              <select
                aria-label="캠페인 선택"
                value={campaignId}
                onChange={(ev) => {
                  setCampaignId(ev.target.value);
                  setSelected("");
                }}
              >
                <option value="">캠페인 선택</option>
                {state?.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <details open={!state?.campaigns.length}>
              <summary>새 캠페인 만들기</summary>
              <form
                className="gtm-form"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void act(async () => {
                    const c = await request("campaigns", "POST", {
                      name,
                      customer,
                      persona,
                      destination,
                      autoIterate: auto,
                      autoPublish,
                      maxRounds: 2,
                    });
                    setCampaignId(c.id);
                  });
                }}
              >
                <label>
                  캠페인 이름
                  <input
                    value={name}
                    onChange={(ev) => setName(ev.target.value)}
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  도착 주소
                  <input
                    type="url"
                    value={destination}
                    onChange={(ev) => setDestination(ev.target.value)}
                    required
                  />
                </label>
                <label className="gtm-wide">
                  고객의 구체적인 불편
                  <textarea
                    value={customer}
                    onChange={(ev) => setCustomer(ev.target.value)}
                    minLength={10}
                    maxLength={1000}
                    required
                  />
                </label>
                <label className="gtm-wide">
                  페르소나 지시문
                  <textarea
                    value={persona}
                    onChange={(ev) => setPersona(ev.target.value)}
                    minLength={5}
                    maxLength={1000}
                    required
                  />
                </label>
                <label className="gtm-check gtm-wide">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(ev) => setAuto(ev.target.checked)}
                  />
                  관측 조건 충족 시 다음 훅 자동 생성 (최대 2라운드, 일일 생성
                  한도 적용)
                </label>
                <label className="gtm-check gtm-wide">
                  <input
                    type="checkbox"
                    checked={autoPublish}
                    onChange={(ev) => setAutoPublish(ev.target.checked)}
                  />
                  후속 라운드 검사 통과 시 자동 게시 허용 (첫 영상은 직접 검토)
                </label>
                <button disabled={busy}>캠페인 만들기</button>
              </form>
            </details>
            {c && (
              <p className="gtm-context">
                {c.customer}
                <br />
                <small>
                  반복 {c.autoIterate ? "자동" : "수동"} · 후속 게시{" "}
                  {c.autoPublish ? "자동" : "검토 후 수동"} · 최대 {c.maxRounds}
                  라운드
                </small>
              </p>
            )}
          </section>
          {c && (
            <section className="gtm-section">
              <div className="gtm-section-title">
                <div>
                  <p className="gtm-eyebrow">02 / 제작</p>
                  <h2>훅을 바꾸고, 시연은 재사용합니다.</h2>
                </div>
              </div>
              <form
                className="gtm-form"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void act(async () => {
                    const e = await request(
                      `campaigns/${campaignId}/experiments`,
                      "POST",
                      input,
                    );
                    setSelected(e.id);
                  }, "실험 초안을 만들었습니다. 아래에서 생성 또는 합성을 실행하세요.");
                }}
              >
                <div className="gtm-wide gtm-hook-options">
                  {hooks.map((h) => (
                    <button
                      type="button"
                      className={h === hook ? "active" : "gtm-quiet"}
                      onClick={() => setHook(h)}
                      key={h}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                <label>
                  첫 3초 훅 자막
                  <input
                    value={hook}
                    onChange={(ev) => setHook(ev.target.value)}
                    maxLength={65}
                    required
                  />
                </label>
                <label>
                  CTA
                  <input
                    value={cta}
                    onChange={(ev) => setCta(ev.target.value)}
                    maxLength={90}
                    required
                  />
                </label>
                <label className="gtm-wide">
                  게시물 캡션
                  <textarea
                    value={caption}
                    onChange={(ev) => setCaption(ev.target.value)}
                    maxLength={1800}
                  />
                </label>
                {(["reference", "hook", "demo"] as const).map((kind) => (
                  <div className="gtm-asset" key={kind}>
                    <label>
                      {kind === "reference"
                        ? "페르소나 이미지 · AI 생성용"
                        : kind === "hook"
                          ? "기존 인트로 · 3초 이상"
                          : "실제 앱 시연 · 5초 이상"}
                      <select
                        value={
                          kind === "reference"
                            ? referenceAsset
                            : kind === "hook"
                              ? hookAsset
                              : demoAsset
                        }
                        onChange={(ev) =>
                          ({
                            reference: setReferenceAsset,
                            hook: setHookAsset,
                            demo: setDemoAsset,
                          })[kind](ev.target.value)
                        }
                      >
                        <option value="">자산 선택</option>
                        {assets(kind).map((a) => (
                          <option value={a.id} key={a.id}>
                            {a.id.slice(0, 8)} ·{" "}
                            {(a.bytes / 1024 / 1024).toFixed(1)}MB
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gtm-file">
                      파일 업로드
                      <input
                        type="file"
                        accept={kind === "reference" ? "image/*" : "video/*"}
                        disabled={busy}
                        onChange={(ev) =>
                          void upload(kind, ev.target.files?.[0])
                        }
                      />
                    </label>
                  </div>
                ))}
                <label>
                  인트로 방식
                  <select
                    value={introMode}
                    onChange={(ev) =>
                      setIntroMode(ev.target.value as "reaction" | "spoken")
                    }
                  >
                    <option value="reaction">무음 리액션 + 훅 자막</option>
                    <option value="spoken">대사를 말하는 진행자</option>
                  </select>
                </label>
                <label>
                  인트로 시작 위치 (초)
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    value={hookStartSeconds}
                    onChange={(ev) =>
                      setHookStartSeconds(Number(ev.target.value))
                    }
                  />
                </label>
                <label>
                  시연 길이 (초)
                  <input
                    type="number"
                    min={5}
                    max={90}
                    step={0.1}
                    value={seconds}
                    onChange={(ev) => setSeconds(Number(ev.target.value))}
                  />
                </label>
                <p className="gtm-help">
                  Higgsfield는 5초를 생성하고 선택한 위치부터 3초를 사용합니다.
                  리액션 또는 음성이 잘리지 않는지 검토하세요. 기존 인트로가
                  있으면 생성 비용 없이 합성할 수 있습니다.
                </p>
                <button
                  disabled={
                    busy || !demoAsset || (!hookAsset && !referenceAsset)
                  }
                >
                  실험 초안 만들기
                </button>
              </form>
            </section>
          )}
          <section className="gtm-section">
            <div className="gtm-section-title">
              <div>
                <p className="gtm-eyebrow">03 / 실행과 검토</p>
                <h2>실제 파일과 작업 기록.</h2>
              </div>
              <span>{exps.length}개 실험</span>
            </div>
            {!e ? (
              <p className="gtm-help">
                캠페인과 첫 실험을 만들어주세요. 샘플 성과는 표시하지 않습니다.
              </p>
            ) : (
              <div className="gtm-experiments">
                <nav aria-label="실험 목록">
                  {exps.map((x) => (
                    <button
                      className={x.id === e.id ? "active" : "gtm-quiet"}
                      key={x.id}
                      onClick={() => {
                        setSelected(x.id);
                        setVerified(false);
                        setRecoverId("");
                      }}
                    >
                      <span>
                        {x.round}라운드 · {labels[x.state]}
                      </span>
                      <strong>{x.hook}</strong>
                      <small>{x.id.slice(0, 8)}</small>
                    </button>
                  ))}
                </nav>
                <div className="gtm-detail">
                  <div className="gtm-detail-head">
                    <h3>{e.hook}</h3>
                    <span className="gtm-status">{labels[e.state]}</span>
                  </div>
                  {e.outputAsset ? (
                    <video
                      key={e.outputAsset}
                      src={media(e.outputAsset)}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <div className="gtm-video-empty">
                      {labels[e.state]}
                      <small>검사에 통과한 MP4가 여기에 표시됩니다.</small>
                    </div>
                  )}
                  <div className="gtm-actions">
                    {e.state === "draft" && (
                      <>
                        <button
                          disabled={
                            busy ||
                            !e.referenceAsset ||
                            !state?.connections.higgsfield
                          }
                          onClick={() =>
                            void act(
                              () =>
                                request(`experiments/${e.id}/generate`, "POST"),
                              "유료 생성 작업을 큐에 넣었습니다.",
                            )
                          }
                        >
                          AI 인트로 생성 → 합성
                        </button>
                        <button
                          className="gtm-quiet"
                          disabled={busy || !e.hookAsset}
                          onClick={() =>
                            void act(
                              () =>
                                request(`experiments/${e.id}/render`, "POST"),
                              "합성 작업을 큐에 넣었습니다.",
                            )
                          }
                        >
                          기존 인트로로 합성
                        </button>
                      </>
                    )}
                    {e.outputAsset && (
                      <a href={media(e.outputAsset)} download={`${e.id}.mp4`}>
                        MP4 다운로드 ↗
                      </a>
                    )}
                  </div>
                  {e.checks && (
                    <ul className="gtm-checks">
                      {e.checks.map((c) => (
                        <li key={c.name}>
                          {c.pass ? "✓" : "×"} {c.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.state === "review" && (
                    <>
                      <label className="gtm-check">
                        <input
                          type="checkbox"
                          checked={verified}
                          onChange={(ev) => setVerified(ev.target.checked)}
                        />
                        음성·자막·실제 기능·CTA·소재 사용 권한을 확인했습니다.
                      </label>
                      <button
                        disabled={busy || !verified}
                        onClick={() =>
                          void act(
                            () =>
                              request(`experiments/${e.id}/approve`, "POST", {
                                verified: true,
                              }),
                            "영상을 승인했습니다. 게시는 별도로 실행하세요.",
                          )
                        }
                      >
                        검토 완료
                      </button>
                    </>
                  )}
                  {e.state === "approved" && (
                    <button
                      disabled={busy || !state?.connections.instagram}
                      onClick={() =>
                        void act(
                          () => request(`experiments/${e.id}/publish`, "POST"),
                          "실제 Instagram 게시 작업을 큐에 넣었습니다.",
                        )
                      }
                    >
                      연결된 Instagram에 게시
                    </button>
                  )}
                  {e.permalink && (
                    <p>
                      <a href={e.permalink} target="_blank" rel="noreferrer">
                        실제 게시물 열기 ↗
                      </a>
                    </p>
                  )}
                  {e.state === "published" && (
                    <div className="gtm-tracking">
                      <label>
                        이 실험의 유입 링크
                        <input
                          readOnly
                          value={
                            tracking || "GTM_PUBLIC_URL 설정이 필요합니다."
                          }
                          onFocus={(ev) => ev.target.select()}
                        />
                      </label>
                      <small>
                        이 링크를 실제 클릭 경로에 사용하세요. 공통 프로필
                        링크만 쓰면 영상별 귀속을 보장할 수 없습니다. 앱 설치
                        후에도 ugc_click_id 전달이 필요합니다.
                      </small>
                    </div>
                  )}
                  {(e.state === "needs_attention" || e.state === "failed") && (
                    <details>
                      <summary>원격 작업 복구</summary>
                      <p>
                        공급자 콘솔에서 확인한 Higgsfield 작업 UUID 또는 실제
                        Instagram 게시물 숫자 ID를 입력하세요. 불명확한 요청을
                        다시 보내지 않습니다.
                      </p>
                      <input
                        aria-label="복구 ID"
                        value={recoverId}
                        onChange={(ev) => setRecoverId(ev.target.value)}
                      />
                      <button
                        disabled={busy || !recoverId}
                        onClick={() =>
                          void act(() =>
                            request(
                              `experiments/${e.id}/recover`,
                              "POST",
                              /^\d+$/.test(recoverId)
                                ? { mediaId: recoverId }
                                : { providerId: recoverId },
                            ),
                          )
                        }
                      >
                        원격 ID 확인 후 복구
                      </button>
                    </details>
                  )}
                  <div className="gtm-jobs">
                    {state?.jobs
                      .filter((j) => j.experimentId === e.id)
                      .map((j) => (
                        <div key={j.id}>
                          <span>
                            {j.action} · {labels[j.status]} · {j.attempts}회
                          </span>
                          {j.error && <p className="gtm-error">{j.error}</p>}
                          {j.status === "failed" && j.action !== "publish" && (
                            <button
                              className="gtm-quiet"
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  request(`jobs/${j.id}/retry`, "POST"),
                                )
                              }
                            >
                              기존 작업 재시도
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </section>
          {e && (
            <section className="gtm-section">
              <p className="gtm-eyebrow">04 / 증거와 다음 실행</p>
              <h2>조회수 다음의 행동을 봅니다.</h2>
              <div className="gtm-stats">
                {[
                  ["고유 브라우저 방문", e.stats.clicks],
                  ["신규 적합 사용자", e.stats.eligibleUsers],
                  ["첫 생성 + 저장", e.stats.activated],
                  ["7일 재사용", `${e.stats.repeated} / ${e.stats.mature}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="gtm-help">
                7일 관찰 대기 {e.stats.pending}명 · 테스트·기존·부적합 사용자는
                활성화 집계에서 제외됩니다. 방문은 로그인 사용자 기준이 아닌
                브라우저 기준입니다.
              </p>
              <div className="gtm-metrics">
                <h3>Instagram 실제 응답</h3>
                {e.metrics ? (
                  <>
                    <p>
                      {Object.entries(e.metrics.values)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(" · ") || "사용 가능한 지표 없음"}
                    </p>
                    <small>
                      수집{" "}
                      {new Date(e.metrics.fetchedAt).toLocaleString("ko-KR")}
                      {e.metrics.errors.length > 0 &&
                        ` · 미수집: ${e.metrics.errors.join(", ")}`}
                    </small>
                  </>
                ) : (
                  <p>아직 수집된 지표가 없습니다.</p>
                )}
                {e.mediaId && (
                  <button
                    className="gtm-quiet"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        request(`experiments/${e.id}/metrics`, "POST"),
                      )
                    }
                  >
                    다시 수집
                  </button>
                )}
              </div>
              <div className="gtm-decision">
                <span>규칙 기반 다음 판단</span>
                <p>{e.recommendation.reason}</p>
                {e.decision && <small>기록된 결정: {e.decision}</small>}
                <button
                  disabled={
                    busy ||
                    e.recommendation.change !== "hook" ||
                    e.round >= (c?.maxRounds || 2) ||
                    !!e.nextId
                  }
                  onClick={() =>
                    void act(async () => {
                      const next = await request(
                        `experiments/${e.id}/next`,
                        "POST",
                      );
                      setSelected(next.id);
                    }, "관측 근거를 기록하고 다음 훅 초안을 만들었습니다.")
                  }
                >
                  {e.nextId ? "다음 실험 생성됨" : "관측으로 다음 실험 만들기"}
                </button>
              </div>
            </section>
          )}
        </>
      )}
      <footer>
        UGC-Z / 실제 운영 화면 · 기존 데모 데이터와 분리 ·{" "}
        <Link href="/admin/operations">제작 관리로 돌아가기</Link>
      </footer>
    </main>
  );
}
