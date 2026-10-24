"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  stages,
  stageLabels,
  type Stage,
  type LoopRun,
} from "@/server/gtm/loop/model";
import type { LoopView } from "@/server/gtm/loop/view";
import type { Asset } from "@/server/gtm/model";
const labels: Record<string, string> = {
  pending: "대기",
  running: "실행 중",
  succeeded: "완료",
  blocked: "연결·검토 필요",
  waiting: "관찰·처리 대기",
  failed: "실패",
  needs_attention: "원격 결과 확인",
};
const keys = [
  "TAVILY_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "HF_API_KEY",
  "IG_ACCESS_TOKEN",
  "IG_USER_ID",
  "IG_GRAPH_VERSION",
] as const;
const keyLabels: Record<(typeof keys)[number], string> = {
  TAVILY_API_KEY: "공개 고객 조사 · Tavily",
  OPENAI_API_KEY: "근거 분석·전략 · OpenAI",
  OPENAI_MODEL: "사용할 Structured Outputs 모델",
  HF_API_KEY: "페르소나·영상 · Higgsfield",
  IG_ACCESS_TOKEN: "배포 · Instagram 토큰",
  IG_USER_ID: "Instagram 프로 계정 ID",
  IG_GRAPH_VERSION: "검증한 Graph API 버전",
};
type Bootstrap = {
  runs: {
    id: string;
    round: number;
    mode: string;
    currentStage: string;
    status: string;
    createdAt: number;
    productUrl: string;
  }[];
  assets: Asset[];
  connections: Record<string, { configured: boolean; source: string }>;
  publicUrl: string | null;
};
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/gtm/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "요청에 실패했습니다.");
  return b;
}
const time = (at?: number) =>
  at ? new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "—";
function Json({ value }: { value: unknown }) {
  return <pre className="lp-json">{JSON.stringify(value ?? {}, null, 2)}</pre>;
}
export function LoopConsole() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null),
    [view, setView] = useState<LoopView | null>(null),
    [active, setActive] = useState(""),
    [stage, setStage] = useState<Stage>("product"),
    [follow, setFollow] = useState(true);
  const [login, setLogin] = useState(false),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("https://yorigo.kr/"),
    [demo, setDemo] = useState(""),
    [seconds, setSeconds] = useState(12),
    [auto, setAuto] = useState(true),
    [publish, setPublish] = useState<"review" | "automatic">("review"),
    [rounds, setRounds] = useState(2),
    [verified, setVerified] = useState(false);
  const [keyName, setKeyName] =
      useState<(typeof keys)[number]>("TAVILY_API_KEY"),
    [keyValue, setKeyValue] = useState(""),
    [recover, setRecover] = useState("");
  const refresh = useCallback(async () => {
    try {
      const b = (await api("loops")) as Bootstrap;
      setBootstrap(b);
      setLogin(true);
      setDemo((v) => v || b.assets.find((a) => a.kind === "demo")?.id || "");
      const id = active || b.runs[0]?.id;
      if (id) {
        const v = (await api("loops/" + id)) as LoopView;
        setView(v);
        if (!active) setActive(id);
        if (follow)
          setStage(
            v.run.steps.find((s) => s.status !== "succeeded")?.stage || "learn",
          );
      }
    } catch (e) {
      const m = (e as Error).message;
      if (m.includes("로그인")) setLogin(false);
      else setError(m);
    }
  }, [active, follow]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [refresh]);
  async function act(
    fn: () => Promise<unknown>,
    notice = "실행 상태를 갱신했습니다.",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(notice);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const r = view?.run,
    s = r?.steps.find((s) => s.stage === stage),
    test = r?.mode === "test";
  const selectedMedia =
    stage === "persona"
      ? r?.referenceAsset
      : stage === "intro"
        ? r?.hookAsset
        : stage === "compose" || stage === "publish"
          ? view?.experiment?.outputAsset
          : undefined;
  const media = view?.media.find((m) => m.id === selectedMedia);
  const passed = r?.signals?.filter((s) => s.qualified).length || 0;
  const current = r?.steps.find((s) => s.status !== "succeeded");
  const canControl = r && r.mode === "live" && !r.cancelled;
  return (
    <main className="lp">
      <header className="lp-header">
        <Link href="/gtm" className="lp-brand">
          UGC-Z <span>/ LOOP</span>
        </Link>
        <span className="lp-header-note">
          FROM CUSTOMER SIGNAL TO NEXT EXPERIMENT
        </span>
        <Link href="/gtm/results">7일 성과 ↗</Link>
        <Link href="/gtm">제작 화면 ↗</Link>
      </header>
      <div className="lp-intro">
        <div>
          <p className="lp-kicker">AGENTIC GTM / YORIGO</p>
          <h1>
            고객을 찾고, 영상을 만들고.
            <br />
            반응으로 다음 시도를 바꿉니다.
          </h1>
          <p>
            제품 주소와 앱 시연에서 시작합니다. 각 노드에서 에이전트의
            입력·근거·판정·결과를 확인하세요.
          </p>
        </div>
        <div className="lp-loop-mark" aria-hidden="true">
          ↻
          <span>
            OBSERVE
            <br />
            CREATE
            <br />
            LEARN
          </span>
        </div>
      </div>
      <div aria-live="polite">
        {error && (
          <p className="lp-alert" role="alert">
            {error}
          </p>
        )}
        {message && <p className="lp-message">{message}</p>}
      </div>
      {!login ? (
        <form
          className="lp-login"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api("login", "POST", { token });
              setToken("");
              setLogin(true);
            }, "실행 화면에 연결했습니다.");
          }}
        >
          <h2>운영자 연결</h2>
          <label>
            운영 키
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={busy}>연결하기</button>
        </form>
      ) : (
        <>
          <section className="lp-setup">
            <details open={!bootstrap?.runs.length}>
              <summary>
                새 루프 시작하기{" "}
                <small>고객과 페르소나는 자동 조사·설계합니다.</small>
              </summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    const run = await api("loops", "POST", {
                      productUrl: url,
                      demoAsset: demo,
                      demoSeconds: seconds,
                      autoLoop: auto,
                      publishMode: publish,
                      maxRounds: rounds,
                      maxGenerationRequests: rounds * 2,
                    });
                    setActive(run.id);
                    setFollow(true);
                  }, "루프를 시작했습니다. 워커가 제품 이해부터 순서대로 실행합니다.");
                }}
                className="lp-setup-form"
              >
                <label>
                  제품 주소
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </label>
                <label>
                  실제 앱 시연
                  <select
                    aria-label="실제 앱 시연" value={demo}
                    onChange={(e) => setDemo(e.target.value)}
                    required
                  >
                    <option value="">업로드한 시연 선택</option>
                    {bootstrap?.assets
                      .filter((a) => a.kind === "demo")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id.slice(0, 8)} ·{" "}
                          {(a.bytes / 1024 / 1024).toFixed(1)}MB
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  시연 업로드
                  <input
                    type="file"
                    accept="video/*"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void act(async () => {
                          const res = await fetch("/api/gtm/assets?kind=demo", {
                            method: "POST",
                            body: file,
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          setDemo(data.id);
                        }, "시연을 저장했습니다.");
                    }}
                  />
                </label>
                <label>
                  사용할 시연 길이 (초)
                  <input
                    type="number"
                    min={5}
                    max={90}
                    step={0.1}
                    value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                  />
                </label>
                <label>
                  최대 라운드
                  <select
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                  >
                    <option value={1}>1라운드</option>
                    <option value={2}>2라운드</option>
                    <option value={3}>3라운드</option>
                  </select>
                </label>
                <label>
                  게시 방식
                  <select
                    value={publish}
                    onChange={(e) =>
                      setPublish(e.target.value as "review" | "automatic")
                    }
                  >
                    <option value="review">영상 검토 후 게시</option>
                    <option value="automatic">
                      검사 통과 후 자동 게시 허용
                    </option>
                  </select>
                </label>
                <label className="lp-check">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                  />
                  성과 근거가 쌓이면 다음 조사·제작으로 자동 연결
                </label>
                <p className="lp-small">
                  공개 신호 최소 2건 · 최근 7일 · 게시 후 최소 60분 및 방문 10건
                  관찰 · 최대 생성 요청 {rounds * 2}건. 연결된 공급자의 실제 API
                  비용이 발생할 수 있습니다.
                </p>
                <button disabled={busy || !demo}>라이브 루프 시작 →</button>
              </form>
            </details>
            <details className="lp-connect">
              <summary>
                연결 설정{" "}
                <small>
                  {
                    Object.values(bootstrap?.connections || {}).filter(
                      (c) => c.configured,
                    ).length
                  }{" "}
                  / {keys.length} 설정
                </small>
              </summary>
              <div className="lp-connection-list">
                {keys.map((k) => (
                  <span key={k}>
                    <i
                      className={
                        bootstrap?.connections[k]?.configured ? "on" : ""
                      }
                    />
                    {keyLabels[k]}
                  </span>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await api("connections", "POST", {
                      name: keyName,
                      value: keyValue,
                    });
                    setKeyValue("");
                  }, "연결 정보를 서버에 암호화해 저장했습니다. 중단된 단계에서 재개하세요.");
                }}
                className="lp-key-form"
              >
                <label>
                  연결 항목
                  <select
                    value={keyName}
                    onChange={(e) => {
                      setKeyName(e.target.value as typeof keyName);
                      setKeyValue("");
                    }}
                  >
                    {keys.map((k) => (
                      <option key={k} value={k}>
                        {keyLabels[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {keyName === "OPENAI_MODEL" ? "모델 이름" : "연결 값"}
                  <input
                    type={
                      keyName === "OPENAI_MODEL" ||
                      keyName === "IG_GRAPH_VERSION" ||
                      keyName === "IG_USER_ID"
                        ? "text"
                        : "password"
                    }
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </label>
                <button disabled={busy || !keyValue}>연결 저장</button>
              </form>
              <p className="lp-small">
                브라우저 저장소에 키를 남기지 않습니다. 서버 환경 변수로 설정된
                항목은 서버에서 변경하세요. 설정 여부와 실제 계정·권한 검증은
                구분합니다.
              </p>
            </details>
          </section>
          <div className="lp-run-bar">
            <label>
              실행 기록
              <select
                aria-label="루프 실행 선택"
                value={active}
                onChange={(e) => {
                  setActive(e.target.value);
                  setFollow(true);
                  setVerified(false);
                }}
              >
                <option value="">실행 선택</option>
                {bootstrap?.runs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.mode === "test" ? "검증 리플레이" : "라이브"} · R
                    {x.round} · {x.productUrl} · {x.id.slice(0, 6)}
                  </option>
                ))}
              </select>
            </label>
            <label className="lp-check">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
              />
              실행 단계 따라가기
            </label>
            {r && (
              <a
                className="lp-export"
                href={"/api/gtm/loops/" + r.id + "/export"}
              >
                클릭 가능한 실행 기록 내보내기 ↗
              </a>
            )}
          </div>
          {!r ? (
            <div className="lp-empty">
              아직 실행한 루프가 없습니다. 제품 주소와 시연 영상으로 첫 조사를
              시작하세요.
            </div>
          ) : (
            <>
              {test && (
                <p className="lp-test-banner">
                  검증 리플레이입니다. 외부 검색·AI 생성·게시·고객 응답은 테스트
                  입력이며 실제 고객 트랙션과 구분합니다. 이 기록에서 라이브
                  실행을 재개하지 않습니다.
                </p>
              )}
              <div className="lp-overview">
                <div>
                  <span>적합 고객 신호</span>
                  <strong>
                    {passed}
                    <small> / {r.sources?.length || 0} 원문</small>
                  </strong>
                </div>
                <div>
                  <span>실제 고유 브라우저 방문</span>
                  <strong>{view?.actual?.clicks || 0}</strong>
                </div>
                <div>
                  <span>실제 신규 적합 활성</span>
                  <strong>{view?.actual?.activated || 0}</strong>
                </div>
                <div>
                  <span>생성 요청 / 한도</span>
                  <strong>
                    {r.generationRequests}
                    <small> / {r.config.maxGenerationRequests}</small>
                  </strong>
                </div>
              </div>
              <div className="lp-flow" aria-label="GTM 루프 단계">
                {stages.map((key, i) => {
                  const st = r.steps.find((s) => s.stage === key)!;
                  return (
                    <button
                      key={key}
                      className={`lp-node ${stage === key ? "selected" : ""} ${st.status}`}
                      onClick={() => {
                        setStage(key);
                        setFollow(false);
                      }}
                    >
                      <span className="lp-node-top">
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <b>
                          {st.status === "succeeded"
                            ? "✓"
                            : st.status === "running"
                              ? "●"
                              : st.status === "blocked"
                                ? "!"
                                : "○"}
                        </b>
                      </span>
                      <strong>{stageLabels[key]}</strong>
                      <small>{labels[st.status]}</small>
                    </button>
                  );
                })}
              </div>
              <div className="lp-grid">
                <section className="lp-detail">
                  <div className="lp-detail-header">
                    <div>
                      <p className="lp-kicker">
                        STEP{" "}
                        {String(stages.indexOf(stage) + 1).padStart(2, "0")} /{" "}
                        {labels[s!.status]}
                      </p>
                      <h2>{stageLabels[stage]}</h2>
                    </div>
                    <span className="lp-status">
                      {test ? "테스트 응답" : `라이브 · ${r.round}라운드`}
                    </span>
                  </div>
                  <p className="lp-stage-message">
                    {s?.message || "이전 단계가 완료되면 자동으로 실행합니다."}
                  </p>
                  {stage === "product" && r.product && (
                    <>
                      <h3>{r.product.title}</h3>
                      {r.product.facts.map((f) => (
                        <div className="lp-evidence" key={f.id}>
                          <b>{f.claim}</b>
                          <blockquote>{f.quote}</blockquote>
                          <a
                            href={f.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            제품 페이지 근거 ↗
                          </a>
                        </div>
                      ))}
                    </>
                  )}
                  {stage === "research" && (
                    <>
                      {r.sources?.map((src) => (
                        <article className="lp-evidence" key={src.id}>
                          <div className="lp-evidence-title">
                            <a href={src.url} target="_blank" rel="noreferrer">
                              {src.title || src.url} ↗
                            </a>
                            <small>
                              {src.provenance === "test_fixture"
                                ? "테스트 원문"
                                : "Tavily 실시간 조회"}
                            </small>
                          </div>
                          <p>{src.text.slice(0, 500)}</p>
                          <small>
                            게시 {src.publishedAt || "날짜 미확인"} · 검색어{" "}
                            {src.query}
                          </small>
                        </article>
                      ))}
                    </>
                  )}
                  {stage === "qualify" &&
                    r.signals?.map((sig) => (
                      <article className="lp-evidence" key={sig.sourceId}>
                        <div className="lp-evidence-title">
                          <b>{sig.qualified ? "통과" : "보류·제외"}</b>
                          <small>
                            {
                              r.sources?.find((x) => x.id === sig.sourceId)
                                ?.title
                            }
                          </small>
                        </div>
                        <blockquote>
                          {sig.quote ||
                            "원문에서 명시적 불편을 확인하지 못했습니다."}
                        </blockquote>
                        <div className="lp-rubric">
                          {sig.checks.map((c) => (
                            <div key={c.name}>
                              <span>
                                {c.name}
                                <small>{c.reason}</small>
                              </span>
                              <b className={"v-" + c.verdict}>{c.verdict}</b>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  {stage === "strategy" && r.plan && (
                    <>
                      <div className="lp-target">
                        <small>행동으로 정의한 타깃</small>
                        <h3>{r.plan.segment}</h3>
                        <p>
                          연결된 독립 원문 {r.plan.evidenceIds.length}건 · 제품
                          기능 {r.plan.factIds.join(", ")}
                        </p>
                      </div>
                      <h3>가상 페르소나 · {r.plan.persona.name}</h3>
                      <p>{r.plan.persona.context}</p>
                      <p>{r.plan.persona.rationale}</p>
                      <p className="lp-small">
                        {r.plan.persona.creativeChoices}
                      </p>
                      <div className="lp-copy">
                        <span>HOOK</span>
                        <strong>{r.plan.hook}</strong>
                        <span>CTA</span>
                        <strong>{r.plan.cta}</strong>
                      </div>
                    </>
                  )}
                  {media &&
                    (media.kind === "reference" ? (
                      <img
                        className="lp-media"
                        src={media.url}
                        alt="타깃 맥락으로 설계한 가상 성인 페르소나"
                      />
                    ) : (
                      <video
                        className="lp-media"
                        controls
                        src={media.url}
                        preload="metadata"
                      />
                    ))}
                  {stage === "compose" && view?.experiment?.checks && (
                    <div className="lp-tech-checks">
                      {view.experiment.checks.map((c) => (
                        <span key={c.name}>
                          {c.pass ? "✓" : "×"} {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {stage === "publish" && view?.experiment && (
                    <>
                      <div className="lp-evidence">
                        <p>제작 상태: {view.experiment.state}</p>
                        <p>
                          게시물 ID: {view.experiment.mediaId || "아직 없음"}
                        </p>
                        {view.experiment.permalink && (
                          <a
                            href={view.experiment.permalink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {test ? "테스트 게시 응답" : "실제 게시물"} ↗
                          </a>
                        )}
                      </div>
                      {canControl && view.experiment.state === "review" && (
                        <div className="lp-approval">
                          <label className="lp-check">
                            <input
                              type="checkbox"
                              checked={verified}
                              onChange={(e) => setVerified(e.target.checked)}
                            />
                            음성·자막·실제 기능·CTA·소재 권한을 확인했습니다.
                          </label>
                          <button
                            disabled={busy || !verified}
                            onClick={() =>
                              void act(
                                () =>
                                  api(`loops/${r.id}/approve`, "POST", {
                                    verified: true,
                                  }),
                                "승인했습니다. 연결된 Instagram에 게시를 진행합니다.",
                              )
                            }
                          >
                            승인하고 게시
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {stage === "measure" && (
                    <>
                      <div className="lp-target">
                        <h3>고객 행동으로 판정합니다.</h3>
                        <p>
                          이번 유입의 신규 적합 사용자가 자기 레시피를 생성하고
                          24시간 내 저장해야 활성화로 셉니다. 7일 관찰이 끝난
                          사용자만 재사용률 분모에 포함합니다.
                        </p>
                        <p className="lp-small">
                          개별 영상의 유입 링크를 실제 클릭 위치에 연결하고,
                          설치 이후 ugc_click_id를 앱 이벤트까지 전달해야
                          합니다.
                        </p>
                      </div>
                      {view?.experiment && (
                        <label>
                          유입 링크
                          <input
                            readOnly
                            value={
                              (bootstrap?.publicUrl || "") +
                              "/r/" +
                              view.experiment.id
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  {stage === "learn" && r.decision && (
                    <div className="lp-target">
                      <small>판단 · {r.decision.change}</small>
                      <h3>{r.decision.reason}</h3>
                      <p>다음 검색어: {r.decision.nextQueries.join(" / ")}</p>
                      {r.decision.nextRunId && (
                        <button
                          onClick={() => {
                            setActive(r.decision!.nextRunId!);
                            setFollow(true);
                          }}
                        >
                          다음 루프 열기 →
                        </button>
                      )}
                      {canControl &&
                        r.decision.change === "hook" &&
                        !r.decision.nextRunId && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                const n = await api(
                                  `loops/${r.id}/next`,
                                  "POST",
                                );
                                setActive(n.id);
                                setFollow(true);
                              })
                            }
                          >
                            근거를 보존하고 다음 루프 시작
                          </button>
                        )}
                    </div>
                  )}
                  <details className="lp-payload" open={!!s?.input}>
                    <summary>단계 입력</summary>
                    <Json value={s?.input} />
                  </details>
                  <details className="lp-payload">
                    <summary>단계 결과·증거</summary>
                    <Json value={s?.output} />
                  </details>
                  <div className="lp-step-meta">
                    <span>시작 {time(s?.startedAt)}</span>
                    <span>완료 {time(s?.finishedAt)}</span>
                    <span>조회·시도 {s?.attempts || 0}회</span>
                    {s?.providerId && <span>공급자 작업 {s.providerId}</span>}
                  </div>
                  {canControl && (
                    <div className="lp-control">
                      <button
                        disabled={
                          busy ||
                          r.leaseUntil > Date.now() ||
                          current?.status === "needs_attention"
                        }
                        onClick={() =>
                          void act(() =>
                            api(`loops/${r.id}/control`, "POST", {
                              action: "resume",
                            }),
                          )
                        }
                      >
                        이 단계에서 재개
                      </button>
                      <button
                        className="lp-secondary"
                        disabled={busy || r.leaseUntil > Date.now()}
                        onClick={() =>
                          void act(() =>
                            api(`loops/${r.id}/control`, "POST", {
                              action: r.paused ? "resume" : "pause",
                            }),
                          )
                        }
                      >
                        {r.paused ? "재개" : "일시 정지"}
                      </button>
                      <button
                        className="lp-secondary"
                        disabled={busy || r.leaseUntil > Date.now()}
                        onClick={() =>
                          void act(
                            () =>
                              api(`loops/${r.id}/control`, "POST", {
                                action: "cancel",
                              }),
                            "루프를 중단했습니다. 이미 제출한 외부 생성 작업은 공급자에서 별도로 확인하세요.",
                          )
                        }
                      >
                        중단
                      </button>
                    </div>
                  )}
                  {canControl &&
                    s?.status === "needs_attention" &&
                    (stage === "persona" || stage === "intro") && (
                      <form
                        className="lp-key-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act(() =>
                            api(`loops/${r.id}/recover`, "POST", {
                              stage,
                              providerId: recover,
                            }),
                          );
                        }}
                      >
                        <label>
                          공급자에서 확인한 원격 작업 UUID
                          <input
                            value={recover}
                            onChange={(e) => setRecover(e.target.value)}
                            required
                          />
                        </label>
                        <button disabled={busy}>작업 ID로 복구</button>
                      </form>
                    )}
                </section>
                <aside className="lp-sidebar">
                  <div className="lp-side-title">
                    <h2>실행 로그</h2>
                    <span>{r.history.length} events</span>
                  </div>
                  <p className="lp-small">
                    시작 {time(r.createdAt)}
                    <br />
                    최근 갱신 {time(r.updatedAt)}
                  </p>
                  <div className="lp-history">
                    {r.history.length ? (
                      r.history
                        .slice()
                        .reverse()
                        .map((h, i) => (
                          <div key={i}>
                            <small>
                              {time(h.at)} · {stageLabels[h.stage]}
                            </small>
                            <p>{h.message}</p>
                          </div>
                        ))
                    ) : (
                      <p className="lp-small">
                        워커가 시작하면 단계별 기록이 나타납니다.
                      </p>
                    )}
                  </div>
                  {view?.jobs.length > 0 && (
                    <details>
                      <summary>제작·게시 작업</summary>
                      <Json
                        value={view.jobs.map((j) => ({
                          action: j.action,
                          status: j.status,
                          attempts: j.attempts,
                          error: j.error,
                        }))}
                      />
                    </details>
                  )}
                </aside>
              </div>
            </>
          )}
        </>
      )}
      <footer>
        UGC-Z · 목표 → 조사 → 실행 → 관측 → 다음 목표 ·{" "}
        <Link href="/gtm">기존 제작·검토 도구</Link>
      </footer>
    </main>
  );
}
