"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Clock3,
  Eye,
  Film,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  Link2,
  Menu,
  Plus,
  Scissors,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useDemo } from "./demo-provider";
import { DemoStudio } from "./demo-studio";
import { Badge, Empty } from "./ui";
import {
  advanceDemoJob,
  filterPublications,
  profileSchema,
  publications,
  requestSchema,
  type Profile,
  type Publication,
} from "@/lib/domain";

const customerNav: [string, string, LucideIcon][] = [
  ["overview", "대시보드", LayoutDashboard],
  ["content", "콘텐츠", Clapperboard],
  ["calendar", "게시 일정", CalendarDays],
  ["profile", "앱 프로필", SlidersHorizontal],
  ["settings", "설정", Settings2],
];
const adminNav: [string, string, LucideIcon][] = [
  ["operations", "제작 관리", Layers3],
  ["demo", "시연 편집", Scissors],
  ["assets", "자산 검수", Film],
  ["integrations", "연동 현황", Link2],
];
const titles: Record<string, [string, string]> = {
  overview: ["대시보드", "앱의 다음 성장을, 한눈에."],
  content: ["콘텐츠", "좋은 후킹에서 시작되는 다음 이야기."],
  calendar: ["게시 일정", "언제, 어떤 계정에 올라갔는지 확인하세요."],
  profile: ["앱 프로필", "앱을 가장 잘 아는 당신의 이야기를 들려주세요."],
  settings: ["워크스페이스 설정", "계정과 서비스 연결을 관리하세요."],
  operations: ["제작 관리", "후킹부터 시연까지, 제작 흐름을 한곳에서."],
  demo: ["시연 편집", "늘어진 시연을, 멈춰 보는 영상으로."],
  assets: ["자산 검수", "고객에게 전달하기 전 마지막 확인."],
  integrations: ["연동 현황", "외부 서비스 연결과 구현 범위를 확인하세요."],
};
const fmt = (value: number) => new Intl.NumberFormat("ko-KR").format(value);
export function Workspace({
  section,
  mode,
}: {
  section: string;
  mode: "customer" | "admin";
}) {
  const { state, ready, storageError } = useDemo();
  const [mobile, setMobile] = useState(false),
    [request, setRequest] = useState(false),
    [selected, setSelected] = useState<Publication | null>(null);
  const nav = mode === "customer" ? customerNav : adminNav;
  return (
    <div className="workspace">
      <a className="skip" href="#main">
        본문으로 이동
      </a>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link href="/app/overview" className="brand">
          <span className="brand-icon">
            <Zap size={21} fill="currentColor" />
          </span>
          UGC<span className="brand-z">-Z</span>
          <small>BETA</small>
        </Link>
        <div className="workspace-select">
          <span className="app-icon">Y</span>
          <div>
            <strong>
              {mode === "customer" ? state.profile.name : "UGC-Z Studio"}
            </strong>
            <small>
              {mode === "customer" ? "앱 워크스페이스" : "내부 운영 · 데모"}
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">
          {mode === "customer" ? "WORKSPACE" : "STUDIO"}
        </p>
        <nav aria-label="주 메뉴">
          {nav.map(([key, label, Icon]) => (
            <Link
              key={key}
              href={`/${mode === "customer" ? "app" : "admin"}/${key}`}
              onClick={() => setMobile(false)}
              className={`nav-item ${key === section ? "active" : ""}`}
              aria-current={key === section ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
              {key === "content" && state.jobs.length > 0 && (
                <span className="nav-count">{state.jobs.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <Link className="nav-item" href="/gtm/loop"><FlaskConical size={18} />실제 GTM 루프</Link>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="mini-z">
              <Sparkles size={16} />
            </span>
            <strong>작은 시작, 더 큰 성장.</strong>
            <p>
              앱 이야기 하나로 시작하는
              <br />
              나만의 콘텐츠 루프.
            </p>
            <Link href="/app/profile">
              앱 정보 다듬기 <ArrowUpRight size={14} />
            </Link>
          </div>
          <Link
            className="mode-link"
            href={mode === "customer" ? "/admin/operations" : "/app/overview"}
          >
            <ShieldCheck size={16} />
            {mode === "customer"
              ? "운영 화면 살펴보기"
              : "고객 화면으로 돌아가기"}
            <ArrowRight size={14} />
          </Link>
          <div className="user">
            <span className="avatar">D</span>
            <div>
              <strong>Demo workspace</strong>
              <small>로컬 프런트엔드 미리보기</small>
            </div>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="메뉴 열기"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              {mode === "customer" ? "Workspace" : "Studio"} <span>/</span>{" "}
              <strong>{titles[section][0]}</strong>
            </span>
          </div>
          <div className="top-right">
            <span className="demo-dot" />
            데모 워크스페이스<span className="top-avatar">D</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {mode === "customer"
                  ? "YOUR NEXT GROWTH LOOP"
                  : "BEHIND THE CONTENT"}
              </p>
              <h1>{titles[section][0]}</h1>
              <p>{titles[section][1]}</p>
            </div>
            {mode === "customer" &&
              section !== "profile" &&
              section !== "settings" && (
                <button
                  className="button primary"
                  onClick={() => setRequest(true)}
                  disabled={!ready}
                >
                  <Plus size={17} />새 제작 요청
                </button>
              )}
            {mode === "admin" && (
              <Badge tone="amber">인증 미연결 · 데모 전용</Badge>
            )}
          </div>
          {section !== "demo" && (
            <div className="demo-notice">
              <FlaskConical size={15} />
              <span>
                샘플 데이터로 보는 미리보기입니다. 실제 AI 생성·게시·결제는
                실행되지 않습니다.
              </span>
            </div>
          )}
          {storageError && (
            <p role="alert" className="error">
              브라우저 저장소를 사용할 수 없거나 저장 데이터가 손상됐습니다.
              변경 사항이 유지되지 않을 수 있어요.
            </p>
          )}
          {!ready ? (
            <div className="loading" role="status">
              워크스페이스 불러오는 중…
            </div>
          ) : (
            <>
              {section === "overview" && (
                <Overview
                  onRequest={() => setRequest(true)}
                  onSelect={setSelected}
                />
              )}
              {(section === "content" || section === "assets") && (
                <Content
                  admin={mode === "admin"}
                  onSelect={setSelected}
                  onRequest={() => setRequest(true)}
                />
              )}
              {section === "calendar" && (
                <Suspense fallback={<p>필터 불러오는 중…</p>}>
                  <Calendar onSelect={setSelected} />
                </Suspense>
              )}
              {section === "profile" && <ProfileForm />}
              {(section === "settings" || section === "integrations") && (
                <Settings admin={mode === "admin"} />
              )}
              {section === "operations" && <Operations />}
              {section === "demo" && <DemoStudio />}
            </>
          )}
          <footer className="page-footer">
            <span>
              UGC-Z <span>·</span> Made for your next chapter.
            </span>
            <span>Frontend preview / v0.1</span>
          </footer>
        </main>
      </div>
      {request && <RequestModal onClose={() => setRequest(false)} />}
      {selected && (
        <ContentModal item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Overview({
  onRequest,
  onSelect,
}: {
  onRequest: () => void;
  onSelect: (p: Publication) => void;
}) {
  const { state } = useDemo();
  const totals = publications.reduce(
    (a, p) => ({
      views: a.views + p.views,
      reactions: a.reactions + p.likes + p.comments,
    }),
    { views: 0, reactions: 0 },
  );
  return (
    <>
      <div className="overview-toolbar">
        <h2>
          이번 주의 한눈 보기 <span className="muted small">샘플</span>
        </h2>
        <Link
          className="button subtle"
          href="/app/calendar?from=2026-09-15&to=2026-09-21"
        >
          <CalendarDays size={15} />
          9월 15일 – 21일
          <ChevronDown size={14} />
        </Link>
      </div>
      <section className="metrics" aria-label="샘플 성과 요약">
        {[
          [Eye, "총 조회수", fmt(totals.views), "샘플 게시물 4개 합계"],
          [Clapperboard, "게시된 콘텐츠", "4", "두 개의 데모 계정"],
          [Users, "좋아요 · 댓글", fmt(totals.reactions), "집계된 반응 수"],
          [
            Clock3,
            "내 제작 요청",
            String(state.jobs.length),
            "이 브라우저에 저장된 요청",
          ],
        ].map(([Icon, label, value, detail], i) => {
          const I = Icon as LucideIcon;
          return (
            <div className="metric" key={i}>
              <div className="metric-label">
                {label as string}
                <I size={17} />
              </div>
              <strong>{value as string}</strong>
              <small>{detail as string}</small>
            </div>
          );
        })}
      </section>
      <div className="feature-row">
        <section className="story-panel">
          <div className="story-copy">
            <p className="eyebrow">
              <Sparkles size={14} /> YOUR APP, MORE STORIES
            </p>
            <h2>
              앱의 좋은 순간을,
              <br />
              사람들이 멈춰 보는 영상으로.
            </h2>
            <p>
              후킹, 페르소나, 앱 시연까지.
              <br />
              당신은 앱 이야기에만 집중하세요.
            </p>
            <button className="button dark" onClick={onRequest}>
              첫 번째 콘텐츠 루프 시작하기
              <ArrowRight size={16} />
            </button>
            <span className="story-foot">
              앱 정보 입력 · 요청 검토 · 제작 결과 확인
            </span>
          </div>
          <div className="phone-art" aria-hidden="true">
            <div className="phone-back">
              <div className="phone-speaker" />
              <span>
                MADE FOR
                <br />
                <b>YOUR APP.</b>
              </span>
              <div className="orbit" />
              <small>Hook → Demo → Growth</small>
            </div>
            <div className="floating-tag">
              <span>✦</span> One brief. More possibilities.
            </div>
          </div>
        </section>
        <section className="panel next-panel">
          <div className="section-head">
            <h2>다음으로 할 일</h2>
            <span className="round-count">2</span>
          </div>
          <Link className="task-link" href="/app/profile">
            <span className="task-icon">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <strong>앱의 최신 소식 알려주기</strong>
              <p>업데이트와 후킹 요소를 추가하세요.</p>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <button className="task-link" onClick={onRequest}>
            <span className="task-icon mint-icon">
              <Clapperboard size={18} />
            </span>
            <div>
              <strong>새 콘텐츠 제작 요청</strong>
              <p>타겟에 맞는 다음 이야기를 준비하세요.</p>
            </div>
            <ArrowUpRight size={17} />
          </button>
          <div className="quiet-note">
            <ShieldCheck size={17} />
            <p>
              게시 기능은 아직 연결되지 않았어요.
              <br />
              제작 흐름부터 차근차근 완성합니다.
            </p>
          </div>
        </section>
      </div>
      <section>
        <div className="section-head">
          <div>
            <h2>최근 콘텐츠</h2>
            <p>날짜별 게시 결과와 반응을 확인하세요.</p>
          </div>
          <Link href="/app/content" className="text-link">
            전체 보기
            <ArrowRight size={15} />
          </Link>
        </div>
        <div className="content-grid">
          {publications.map((p) => (
            <ContentCard key={p.id} item={p} onClick={() => onSelect(p)} />
          ))}
        </div>
      </section>
      <div className="insight-strip">
        <span className="task-icon">
          <BarChart3 size={19} />
        </span>
        <div>
          <strong>조회수 다음은, 왜 잘됐는지.</strong>
          <p>
            성과 분석과 자동 A/B 테스트는 게시·측정 연동 후 제공할 예정입니다.
          </p>
        </div>
        <Badge>예정</Badge>
      </div>
    </>
  );
}

function Artwork({ item }: { item: Publication }) {
  return (
    <div className={`artwork ${item.kind}`}>
      <span className="art-label">
        UGC-Z / CONCEPT {item.id.slice(1).padStart(2, "0")}
      </span>
      <div className="art-title">{item.hook}</div>
      <div className="mini-phone">
        <span className="mini-time">9:41</span>
        <span className="recipe-label">오늘의 레시피</span>
        <div className="food-art">
          <span>✳</span>
        </div>
        <strong>오늘은, 집에서.</strong>
        <div className="fake-line" />
        <div className="fake-line short" />
        <span className="recipe-button">레시피 살펴보기 →</span>
      </div>
      <span className="art-pill">콘셉트 이미지 · 영상 아님</span>
    </div>
  );
}
function ContentCard({
  item,
  onClick,
}: {
  item: Publication;
  onClick: () => void;
}) {
  return (
    <button className="content-card" onClick={onClick}>
      <Artwork item={item} />
      <div className="content-meta">
        <div className="content-date">
          <Badge tone="green">게시됨 · 샘플</Badge>
          <span>{item.date.slice(5).replace("-", ".")}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.account}</p>
        <div className="content-stats">
          <span>
            <Eye size={14} />
            {fmt(item.views)}
          </span>
          <span>좋아요 {fmt(item.likes)}</span>
          <ArrowUpRight size={15} />
        </div>
      </div>
    </button>
  );
}
function Content({
  admin,
  onSelect,
  onRequest,
}: {
  admin: boolean;
  onSelect: (p: Publication) => void;
  onRequest: () => void;
}) {
  const { state } = useDemo();
  const [tab, setTab] = useState("all");
  return (
    <>
      <div className="tabs" role="group" aria-label="콘텐츠 필터">
        {[
          ["all", "전체 콘텐츠"],
          ["requests", "내 제작 요청"],
          ["approved", "검토 완료"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={id === tab ? "active" : ""}
            aria-pressed={id === tab}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "requests" && <span>{state.jobs.length}</span>}
          </button>
        ))}
      </div>
      {tab === "requests" ? (
        <>
          <JobList />
          {!state.jobs.length && (
            <Empty
              title="아직 제작 요청이 없어요"
              body="앱 정보와 후킹 요소를 입력하고 첫 요청을 만들어보세요."
              action={
                <button className="button primary" onClick={onRequest}>
                  <Plus size={16} />새 제작 요청
                </button>
              }
            />
          )}
        </>
      ) : (
        <>
          <p className="subnote">
            {admin
              ? "Hook/Demo 실제 파일 검수는 스토리지 연결 후 활성화됩니다. 현재는 콘셉트 검토만 가능합니다."
              : "콘셉트 썸네일과 샘플 성과입니다. 실제 영상은 아직 연결되지 않았습니다."}
          </p>
          <div className="content-grid">
            {publications
              .filter(
                (p) => tab !== "approved" || state.approved.includes(p.id),
              )
              .map((p) => (
                <ContentCard key={p.id} item={p} onClick={() => onSelect(p)} />
              ))}
          </div>
          {tab === "approved" && !state.approved.length && (
            <Empty
              title="검토 완료한 콘셉트가 없어요"
              body="콘텐츠를 열어 데모 검토 완료를 눌러보세요."
            />
          )}
        </>
      )}
    </>
  );
}

function Calendar({ onSelect }: { onSelect: (p: Publication) => void }) {
  const params = useSearchParams();
  const account = params.get("account") || "all",
    from = params.get("from") || "",
    to = params.get("to") || "";
  const invalid = !!(from && to && from > to);
  const items = invalid
    ? []
    : filterPublications(publications, account, from, to);
  return (
    <>
      <form action="/app/calendar" className="filters">
        <label>
          계정
          <select name="account" defaultValue={account}>
            <option value="all">모든 계정</option>
            <option>@yorigo.daily</option>
            <option>@yorigo.kitchen</option>
          </select>
        </label>
        <label>
          시작일
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          종료일
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="button dark" type="submit">
          조회하기
        </button>
        <Link className="button subtle" href="/app/calendar">
          초기화
        </Link>
      </form>
      {invalid && (
        <p role="alert" className="error">
          종료일은 시작일 이후여야 합니다.
        </p>
      )}
      <div className="section-head">
        <h2>
          게시 타임라인{" "}
          <span className="muted small">{items.length}개 · 샘플</span>
        </h2>
        <Badge>한국 시간 기준</Badge>
      </div>
      <div className="timeline">
        {items.map((p) => (
          <div className="timeline-row" key={p.id}>
            <div className="timeline-day">
              <strong>{p.date.slice(8)}</strong>
              <span>2026년 9월</span>
            </div>
            <button className="timeline-content" onClick={() => onSelect(p)}>
              <span className={`tile ${p.kind}`}>
                <Film size={22} />
              </span>
              <div>
                <Badge tone="green">게시됨 · 샘플</Badge>
                <h3>{p.title}</h3>
                <p>{p.account} · Instagram Reels</p>
              </div>
              <div className="timeline-metric">
                <strong>{fmt(p.views)}</strong>
                <span>조회수</span>
              </div>
              <ArrowUpRight size={18} />
            </button>
          </div>
        ))}
      </div>
      {!items.length && (
        <Empty
          title="해당 기간에 게시물이 없어요"
          body="다른 날짜나 계정을 선택해 주세요. 샘플 데이터는 2026년 9월 18–21일입니다."
        />
      )}
    </>
  );
}

function ProfileForm() {
  const { state, update } = useDemo();
  const [form, setForm] = useState<Profile>(state.profile),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const change = (key: keyof Profile, value: string) => {
    setForm({ ...form, [key]: value });
    setMessage("");
  };
  return (
    <form
      className="profile-layout"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const result = profileSchema.safeParse(form);
        if (!result.success) {
          setError(result.error.issues[0].message);
          return;
        }
        update((s) => ({ ...s, profile: result.data }));
        setMessage("이 브라우저에 앱 정보를 저장했습니다.");
      }}
    >
      <div>
        <section className="form-panel">
          <div className="section-head">
            <div>
              <h2>앱의 기본 정보</h2>
              <p>콘텐츠 제작의 기준이 되는 정보예요.</p>
            </div>
            <span className="number-label">01</span>
          </div>
          <label>
            앱 이름
            <input
              value={form.name}
              required
              maxLength={80}
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <label>
            앱스토어 / 웹사이트 주소 <span className="optional">선택</span>
            <input
              value={form.url}
              type="url"
              placeholder="https://"
              onChange={(e) => change("url", e.target.value)}
            />
          </label>
          <label>
            어떤 앱인가요?
            <textarea
              value={form.description}
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
        </section>
        <section className="form-panel">
          <div className="section-head">
            <div>
              <h2>지금 전하고 싶은 이야기</h2>
              <p>최신 업데이트와 후킹 포인트를 자유롭게 알려주세요.</p>
            </div>
            <span className="number-label">02</span>
          </div>
          <label>
            최근 앱 업데이트
            <textarea
              value={form.update}
              maxLength={2000}
              rows={3}
              onChange={(e) => change("update", e.target.value)}
            />
          </label>
          <label>
            사람들이 멈춰 볼 한 문장
            <textarea
              value={form.hook}
              required
              minLength={5}
              maxLength={500}
              rows={2}
              onChange={(e) => change("hook", e.target.value)}
            />
            <small>고객의 고민이나 앱이 바꿔주는 순간을 적어보세요.</small>
          </label>
        </section>
        <section className="form-panel">
          <div className="section-head">
            <div>
              <h2>누구에게 닿고 싶나요?</h2>
              <p>다음 제작 요청에 적용할 타겟을 설정하세요.</p>
            </div>
            <span className="number-label">03</span>
          </div>
          <div className="form-three">
            {(
              [
                ["country", "국가", ["대한민국", "미국", "일본"]],
                [
                  "age",
                  "연령대",
                  ["18–24세", "25–34세", "35–44세", "45세 이상"],
                ],
                ["language", "콘텐츠 언어", ["한국어", "English", "日本語"]],
              ] as const
            ).map(([key, label, options]) => (
              <label key={key}>
                {label}
                <select
                  value={form[key]}
                  onChange={(e) => change(key, e.target.value)}
                >
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
        <div className="form-actions">
          <span role="status">{message}</span>
          <button className="button primary" type="submit">
            <Check size={16} />
            변경 사항 저장
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <aside className="profile-tip">
        <Sparkles size={24} />
        <h3>
          좋은 콘텐츠는
          <br />
          좋은 브리프에서.
        </h3>
        <p>
          기능을 나열하기보다, 앱이 사용자에게 어떤 변화를 만드는지 알려주세요.
        </p>
        <blockquote>
          “레시피 자동 추출 기능”보다
          <br />
          <strong>“저장해둔 요리를 오늘 저녁으로”</strong>
        </blockquote>
        <div className="divider" />
        <p>
          변경 내용은 이후 새 요청에 적용됩니다. 기존 요청에는 당시의 앱 정보가
          보존됩니다.
        </p>
        <small>
          현재 입력 내용은 이 브라우저에만 저장됩니다. 개인정보나 비밀 키는
          입력하지 마세요.
        </small>
      </aside>
    </form>
  );
}

function Settings({ admin }: { admin: boolean }) {
  return (
    <>
      <section className="panel settings-intro">
        <ShieldCheck size={25} />
        <div>
          <h2>
            {admin
              ? "구현 상태를 투명하게."
              : "아직 연결하지 않은 워크스페이스입니다."}
          </h2>
          <p>
            현재는 프런트엔드 데모입니다. 로그인, 권한 분리와 외부 서비스 연결은
            다음 개발 단계입니다.
          </p>
        </div>
      </section>
      <div className="integration-list">
        {[
          [
            "Higgsfield",
            "AI 후킹 영상 생성",
            "공식 API 및 사용 권한 검증 후 연결",
          ],
          [
            "Demo Engine",
            "앱 시연 편집",
            "autocut(tools/autocut) · 로컬 CLI로 컷편집·CapCut 드래프트 생성, 워커 연결 예정",
            "로컬 CLI",
          ],
          [
            "Composer",
            "최종 영상 결합",
            "후킹 + 시연 + 자막 + 음악 · 다음 단계",
          ],
          ["Instagram", "게시·성과 수집", "계정 연결과 API 범위 확인 후 구현"],
          [
            "Authentication",
            "로그인·조직별 권한",
            "서버에서 인증·조직 소속·운영자 권한 검사 필요",
          ],
          ["Billing", "결제·사용량", "결제 및 과금이 발생하지 않는 데모"],
        ].map(([name, title, desc, status]) => (
          <div className="integration-row" key={name}>
            <span className="integration-icon">
              <Link2 size={20} />
            </span>
            <div>
              <strong>
                {name} <span>{title}</span>
              </strong>
              <p>{desc}</p>
            </div>
            <Badge tone={status ? "green" : undefined}>
              {status ?? "미연결"}
            </Badge>
          </div>
        ))}
      </div>
      <div className="coming-soon">
        <p className="eyebrow">LATER, NOT YET</p>
        <h3>먼저 제작 루프를 완성합니다.</h3>
        <p>
          자동 A/B 테스트, 계정 워밍업, DM 자동화, 크리에이터 마켓플레이스와
          챌린지 정산은 이번 버전에 포함하지 않습니다.
        </p>
      </div>
    </>
  );
}

function JobList() {
  const { state } = useDemo();
  return (
    <div className="job-list">
      {state.jobs.map((job) => (
        <div className="job-row" key={job.id}>
          <span className="task-icon">
            <Clapperboard size={19} />
          </span>
          <div>
            <strong>{job.name}</strong>
            <p>
              {job.profile.name} · {job.profile.country} · {job.count}개 요청
            </p>
            <small>
              {new Date(job.createdAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </small>
          </div>
          <Badge tone={job.composition === "ready" ? "green" : "amber"}>
            {job.composition === "ready" ? "데모 단계 완료" : "데모 요청 접수"}
          </Badge>
        </div>
      ))}
    </div>
  );
}
function Operations() {
  const { state, update } = useDemo();
  const [msg, setMsg] = useState("");
  const labels = {
    queued: "대기",
    running: "진행 중",
    ready: "완료",
    failed: "실패",
    waiting: "대기",
    blocked: "선행 작업 대기",
  };
  return (
    <>
      <div className="ops-stats">
        <div>
          <span>로컬 제작 요청</span>
          <strong>{state.jobs.length}</strong>
        </div>
        <div>
          <span>진행 중 · 데모</span>
          <strong>
            {state.jobs.filter((j) => j.composition !== "ready").length}
          </strong>
        </div>
        <div>
          <span>실제 API 호출 / 비용</span>
          <strong>
            0 <small>/ ₩0</small>
          </strong>
        </div>
      </div>
      <div className="section-head">
        <h2>제작 파이프라인</h2>
        <Badge>모든 상태 변경은 시뮬레이션</Badge>
      </div>
      <p className="subnote">
        후킹 생성과 시연 편집은 독립된 작업입니다. 두 결과물을 모두 준비한 뒤
        최종 합성을 연결합니다.
      </p>
      {state.jobs.length ? (
        <div className="ops-jobs">
          {state.jobs.map((job) => (
            <section className="panel ops-job" key={job.id}>
              <div className="section-head">
                <div>
                  <h3>{job.name}</h3>
                  <p>
                    {job.profile.name} · {job.count} variants ·{" "}
                    {job.id.slice(0, 8)}
                  </p>
                </div>
                <Badge tone={job.composition === "ready" ? "green" : "amber"}>
                  {job.composition === "ready" ? "데모 완료" : "데모 진행"}
                </Badge>
              </div>
              <div className="pipeline">
                {[
                  ["Hook / Higgsfield", job.hook],
                  ["Demo / 편집 실행기", job.demo],
                  ["Compose / FFmpeg", job.composition],
                ].map(([title, status]) => (
                  <div key={title}>
                    <span>{title}</span>
                    <strong>{labels[status as keyof typeof labels]}</strong>
                  </div>
                ))}
              </div>
              <div className="ops-actions">
                <small>실제 파일·영상이 생성되지는 않습니다.</small>
                <button
                  className="button subtle"
                  disabled={job.composition === "ready"}
                  onClick={() => {
                    update((s) => ({
                      ...s,
                      jobs: s.jobs.map((j) =>
                        j.id === job.id ? advanceDemoJob(j) : j,
                      ),
                    }));
                    setMsg(
                      "데모 상태만 변경했습니다. 외부 서비스는 호출하지 않았습니다.",
                    );
                  }}
                >
                  다음 단계 시뮬레이션
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title="첫 제작 요청을 기다리고 있어요"
          body="고객 화면에서 요청을 만들면 여기에 표시됩니다."
          action={
            <Link className="button primary" href="/app/content">
              고객 콘텐츠 화면 열기
              <ArrowRight size={16} />
            </Link>
          }
        />
      )}
      <p role="status" className="success">
        {msg}
      </p>
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function RequestModal({ onClose }: { onClose: () => void }) {
  const { state, update } = useDemo();
  const [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <Modal
      title={done ? "요청이 저장됐어요" : "새 제작 요청"}
      onClose={onClose}
    >
      {done ? (
        <div className="request-success">
          <CheckCircle2 size={42} />
          <h3>다음 이야기를 준비할 차례예요.</h3>
          <p>
            데모 요청을 이 브라우저에 저장했습니다.
            <br />
            AI 호출이나 과금은 발생하지 않았습니다.
          </p>
          <Link
            className="button primary"
            href="/admin/operations"
            onClick={onClose}
          >
            운영 화면에서 확인
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const result = requestSchema.safeParse(Object.fromEntries(data));
            if (!result.success) {
              setError(result.error.issues[0].message);
              return;
            }
            if (state.jobs.length >= 100) {
              setError("데모는 최대 100개 요청을 저장할 수 있습니다.");
              return;
            }
            update((s) => ({
              ...s,
              jobs: [
                {
                  id: crypto.randomUUID(),
                  name: result.data.name,
                  count: result.data.count,
                  createdAt: new Date().toISOString(),
                  hook: "queued",
                  demo: "waiting",
                  composition: "blocked",
                  profile: { ...s.profile },
                },
                ...s.jobs,
              ],
            }));
            setDone(true);
          }}
        >
          <p className="modal-desc">
            저장된 앱 정보와 타겟을 바탕으로 제작 요청을 만듭니다.
          </p>
          <label>
            요청 이름
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="예: 장바구니 업데이트 소개"
              autoFocus
            />
          </label>
          <label>
            영상 개수
            <select name="count" defaultValue="10">
              <option value="3">3개</option>
              <option value="5">5개</option>
              <option value="10">10개</option>
            </select>
          </label>
          <div className="brief-summary">
            <span>현재 앱 브리프</span>
            <h3>{state.profile.name}</h3>
            <p>{state.profile.hook}</p>
            <small>
              {state.profile.country} · {state.profile.age} ·{" "}
              {state.profile.language}
            </small>
          </div>
          <div className="upload-placeholder">
            <Upload size={20} />
            <span>앱 시연 파일 업로드는 스토리지 연결 후 제공됩니다.</span>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="button primary full" type="submit">
            <Plus size={17} />
            데모 요청 만들기
          </button>
          <p className="privacy-note">
            실제 영상 생성이나 결제가 발생하지 않습니다.
          </p>
        </form>
      )}
    </Modal>
  );
}
function ContentModal({
  item,
  onClose,
}: {
  item: Publication;
  onClose: () => void;
}) {
  const { state, update } = useDemo();
  const approved = state.approved.includes(item.id);
  return (
    <Modal title="콘텐츠 상세" onClose={onClose}>
      <div className="detail-grid">
        <Artwork item={item} />
        <div>
          <Badge tone="green">샘플 게시물</Badge>
          <h3>{item.title}</h3>
          <p className="muted">
            {item.account}
            <br />
            {item.date}
          </p>
          <dl>
            <div>
              <dt>조회수</dt>
              <dd>{fmt(item.views)}</dd>
            </div>
            <div>
              <dt>좋아요</dt>
              <dd>{fmt(item.likes)}</dd>
            </div>
            <div>
              <dt>댓글</dt>
              <dd>{fmt(item.comments)}</dd>
            </div>
            <div>
              <dt>페르소나</dt>
              <dd>{item.persona}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="detail-note">
        <Sparkles size={18} />
        <p>
          이 화면은 콘셉트 미리보기입니다. 실제 영상 재생·다운로드 및 성과 원인
          분석은 미연결입니다.
        </p>
      </div>
      <button
        className={`button ${approved ? "subtle" : "primary"} full`}
        disabled={approved}
        onClick={() =>
          update((s) => ({
            ...s,
            approved: [...new Set([...s.approved, item.id])],
          }))
        }
      >
        <Check size={17} />
        {approved ? "데모 검토 완료됨" : "데모 검토 완료"}
      </button>
    </Modal>
  );
}
