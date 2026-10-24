"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import "../loop/loop.css";
type Report = {
  generatedAt: string;
  window: { endsAt: string; timezone: string; closed: boolean };
  goals: Record<string, number>;
  baseline: {
    total_users: number | null;
    active_users: number | null;
    verified_at: string | null;
    source: string;
  };
  metrics: Record<
    string,
    { value: number; target: number; measurement: string }
  >;
  cohorts: { mature: number; repeated: number; pending: number };
  verifiedRevenue: {
    amount: number;
    currency: string;
    orders: number;
    source: string;
  };
  actualSpendUsd: null;
  active: { id: string; stage: string; status: string; message?: string }[];
  runner: { heartbeat: number; message: string } | null;
  improvements: { runId: string; nextRunId: string; reason: string }[];
  testRunsExcluded: number;
};
const names: Record<string, string> = {
  attributed_new_activated_users: "신규 적합 활성",
  confirmed_publications: "실제 게시 영상",
  evidence_backed_iterations: "근거 있는 개선",
  qualified_independent_signals: "독립 적합 원문",
};
export default function Results() {
  const [r, setR] = useState<Report | null>(null),
    [error, setError] = useState("");
  async function refresh() {
    try {
      const res = await fetch("/api/gtm/mission", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setR(data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <main className="lp">
      <header className="lp-header">
        <Link className="lp-brand" href="/gtm/loop">
          YoriGO / 7 DAYS
        </Link>
        <Link href="/gtm/loop">루프 실행 화면 ↗</Link>
      </header>
      <div className="lp-intro">
        <div>
          <p className="lp-kicker">CLONE LOOP DAY / GOALS & EVIDENCE</p>
          <h1>
            제출 목표와 실제 성과를
            <br />
            같은 기준으로 비교합니다.
          </h1>
          <p>평가 마감: 2026년 10월 31일 오후 6시 · 한국 시간</p>
        </div>
        <button onClick={() => void refresh()}>기록 새로고침</button>
      </div>
      {error && (
        <p className="lp-alert">
          {error} · <Link href="/gtm/loop">운영자 로그인</Link>
        </p>
      )}
      {r && (
        <>
          <div className="lp-overview">
            {Object.entries(r.metrics).map(([key, m]) => (
              <div key={key}>
                <span>{names[key]}</span>
                <strong>
                  {m.value}
                  <small> / 목표 {m.target}</small>
                </strong>
                <p className="lp-small">
                  {m.measurement === "not_connected" || m.measurement === "no_app_events_received"
                    ? "앱 이벤트 아직 미수신 · 관측 기록만 표시"
                    : "검증 가능한 실행 기록 기준"}
                </p>
              </div>
            ))}
          </div>
          <div className="lp-grid">
            <section className="lp-detail">
              <h2>실행 상태와 한계</h2>
              <p>
                {r.runner?.message || "7일 runner를 아직 시작하지 않았습니다."}
              </p>
              <p className="lp-small">
                최근 runner heartbeat:{" "}
                {r.runner
                  ? new Date(r.runner.heartbeat).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })
                  : "없음"}
                <br />
                집계 시각:{" "}
                {new Date(r.generatedAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </p>
              <div className="lp-evidence">
                <h3>시작 기준선</h3>
                <p>
                  전체 사용자: {r.baseline.total_users ?? "미확인"} · 활성
                  사용자: {r.baseline.active_users ?? "미확인"}
                </p>
                <p className="lp-small">
                  기준선 출처 {r.baseline.source}. 미확인 값을 0으로 간주하지
                  않습니다. 캠페인 귀속과 순증 인과효과는 구분합니다.
                </p>
              </div>
              <div className="lp-evidence">
                <h3>검증된 구매·매출</h3>
                <p>
                  확인된 원장 {r.verifiedRevenue.orders}건 ·{" "}
                  {r.verifiedRevenue.amount.toLocaleString()}{" "}
                  {r.verifiedRevenue.currency}
                </p>
                <p className="lp-small">
                  원장에 없는 구매는 집계하지 않습니다. 장보기 이동은 매출이
                  아닙니다. 실제 공급자 지출은 아직 연결되지 않았습니다.
                </p>
              </div>
              <div className="lp-evidence">
                <h3>7일 재사용</h3>
                <p>
                  재사용 {r.cohorts.repeated} / 관찰 완료 {r.cohorts.mature} ·
                  관찰 대기 {r.cohorts.pending}명
                </p>
                <p className="lp-small">
                  테스트 실행 {r.testRunsExcluded}건은 실제 성과에서
                  제외했습니다.
                </p>
              </div>
              <h3>개선 근거</h3>
              {r.improvements.length ? (
                r.improvements.map((i) => (
                  <article className="lp-evidence" key={i.runId}>
                    <p>{i.reason}</p>
                    <small>
                      {i.runId} → {i.nextRunId}
                    </small>
                  </article>
                ))
              ) : (
                <p className="lp-small">
                  실제 관측과 후속 조사 실행이 연결된 기록이 아직 없습니다.
                </p>
              )}
            </section>
            <aside className="lp-sidebar">
              <h2>진행 중 루프</h2>
              {r.active.length ? (
                r.active.map((a) => (
                  <article className="lp-evidence" key={a.id}>
                    <b>
                      {a.stage} · {a.status}
                    </b>
                    <p>{a.message || "실행 대기"}</p>
                    <small>{a.id}</small>
                  </article>
                ))
              ) : (
                <p className="lp-small">진행 중인 라이브 루프가 없습니다.</p>
              )}
              <p className="lp-small">
                마감 상태: {r.window.closed ? "종료" : "진행 기간"}
                <br />
                목표는 첫 실행 때 고정됩니다.
              </p>
            </aside>
          </div>
        </>
      )}
      <footer>
        실제 고객·실제 게시·실제 관측만 집계 ·{" "}
        <Link href="/gtm/loop">Agentic GTM Loop</Link>
      </footer>
    </main>
  );
}
