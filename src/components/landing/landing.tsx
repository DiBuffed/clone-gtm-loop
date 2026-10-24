import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Copy,
  Film,
  LayoutDashboard,
  Music,
  Repeat,
  Scissors,
  ShieldCheck,
  TrendingUp,
  Type,
  Upload,
  Users,
  Wand2,
} from "lucide-react";
import {
  Faq,
  HeroHeadline,
  LandingNav,
  PricePlans,
  ScrollReveal,
} from "@/components/landing/landing-client";

/** 인증과 결제가 아직 없어 체험용 제품 화면으로 보낸다. */
const demoHref = "/app/overview";

/** 한 바퀴 도는 구조. 이게 제품의 핵심이다. */
const loop = [
  {
    t: "앱 UGC 영상 만들기",
    d: "앱 설명을 넣으면 실제 사용자가 앱을 써보는 듯한 영상을 여러 개 만듭니다. 같은 사람이 계속 나오게 하면서 첫 3초만 바꿔, 어느 쪽이 잘 먹히는지 비교합니다.",
    meta: "여러 개 한 번에",
  },
  {
    t: "계정에 자동 업로드",
    d: "만든 영상을 정한 시간에 계정에 올립니다. 인스타그램 릴스, 유튜브 쇼츠, 틱톡에 그대로 올라갑니다.",
    meta: "예약 · 자동 게시",
  },
  {
    t: "성과 확인",
    d: "영상마다 조회수와 반응이 자동으로 모입니다. 어떤 후킹이 통했는지, 어떤 계정이 잘 나가는지 한눈에 보입니다.",
    meta: "자동 집계",
  },
  {
    t: "잘 된 영상으로 다시",
    d: "반응이 좋았던 영상을 여러 버전으로 다시 만듭니다. 잘 된 걸 그대로 반복하지 않고 조금씩 바꿔서 더 넓게 퍼뜨립니다.",
    meta: "다시 1번으로",
  },
];

const pains = [
  {
    Icon: Clock3,
    t: "맡길 사람이 없습니다",
    d: "크리에이터를 섭외하면 편마다 비용과 시간이 들고, 직접 찍자니 앱 개발만으로도 벅찹니다.",
  },
  {
    Icon: Repeat,
    t: "한두 편 만들고 멈춥니다",
    d: "UGC는 계속 올라가야 효과가 나는데, 바쁘면 몇 편 올리고 그대로 끝납니다.",
  },
  {
    Icon: BarChart3,
    t: "뭐가 먹혔는지 모릅니다",
    d: "어떤 영상이 반응이 좋았는지 기록이 남지 않아서, 다음에도 또 처음부터 시작합니다.",
  },
];

const features = [
  {
    Icon: Wand2,
    t: "첫 3초 후킹",
    d: "사람들이 영상을 넘길지 말지는 첫 3초에 정해집니다. 같은 사람이 계속 나오게 하면서 옷과 배경, 표정만 바꿔 여러 개를 만듭니다.",
    spec: ["같은 사람 유지", "옷 · 배경 바꾸기", "표정 · 손짓", "여러 개 만들기"],
  },
  {
    Icon: Scissors,
    t: "자동 편집",
    d: "앱 화면 녹화를 넣으면 멈춘 곳은 자르고 늘어진 곳은 빠르게 돌린 뒤, 자막과 음악을 붙입니다.",
    spec: ["멈춘 구간 자르기", "느린 구간 배속", "자막", "음악"],
  },
  {
    Icon: Upload,
    t: "자동 업로드",
    d: "만든 영상이 정한 시간에 계정에 올라갑니다. 매번 손으로 올릴 필요가 없습니다.",
    spec: ["예약 게시", "릴스 · 쇼츠 · 틱톡"],
  },
  {
    Icon: Users,
    t: "계정 관리",
    d: "여러 계정을 한 곳에서 봅니다. 어느 계정에 무엇이 올라갔는지 헷갈리지 않습니다.",
    spec: ["계정별 보기", "여러 앱"],
  },
  {
    Icon: TrendingUp,
    t: "성과 리포트",
    d: "조회수와 반응이 영상별로 자동으로 모입니다. 다음에 무엇을 만들면 좋을지 감이 생깁니다.",
    spec: ["조회수", "반응", "순위"],
  },
  {
    Icon: Copy,
    t: "잘 된 영상은 변형해서",
    d: "반응이 좋았던 영상을 그대로 반복하면 효과가 떨어집니다. 조금씩 바꾼 여러 버전으로 다시 내보냅니다.",
    spec: ["후킹 바꾸기", "길이 바꾸기", "여러 버전"],
  },
];

const customerPoints = [
  "앱 설명 적어두기",
  "영상 만들어 달라고 신청하기",
  "올라간 영상과 반응 보기",
  "잘 된 영상은 다시 신청하기",
];

/*
  저희가 대신 하는 일. 영상 한 편에도 이만큼이 들어간다.
  고객이 보지 않는 부분이라 더 자세히 적는다.

  한때 열두 개를 납작하게 나열했다. '실패한 작업을 다시 돌립니다' 같은 내부
  배관 작업이 '후킹을 여러 개 기획합니다'와 같은 무게로 놓여서, 목록이 남의
  할 일 목록처럼 읽혔다. 지금은 단계로 묶고, 자막·음악·규격 같은 잔손질은
  단계 설명에 흡수시킨다.

  설명은 스물여섯 자 안팎으로 맞춘다. 한 줄을 넘기면 행 높이가 단계마다
  달라져 목록이 들쭉날쭉해진다(실측 68·106·83·106·83·106px). 개수를 바꾸면
  아래 제목의 숫자도 같이 바꾼다. 검사: the pane headings match their list counts
*/
const operatorPoints = [
  {
    t: "소재 정리",
    d: "앱 설명과 타겟을 읽고 보여줄 기능을 정합니다.",
  },
  {
    t: "후킹 설계",
    d: "첫 3초에 쓸 문구와 상황을 여러 개 만듭니다.",
  },
  {
    t: "배우 고정",
    d: "AI 모델의 얼굴과 옷, 배경을 끝까지 유지합니다.",
  },
  {
    t: "영상 제작",
    d: "앱 쓰는 장면을 만들고 자막과 음악을 붙입니다.",
  },
  {
    t: "검수",
    d: "사람이 마지막으로 한 번 더 봅니다. 어색하면 다시 만듭니다.",
  },
  {
    t: "게시와 측정",
    d: "정한 시간에 올리고 조회수와 반응을 모아 정리합니다.",
  },
];

export function Landing() {
  return (
    <div className="landing">
      <LandingNav />
      <ScrollReveal />

      {/* ---------------------------------------------------------------- 히어로 */}
      <section className="ld-hero">
        <div className="ld-shell">
          <span className="ld-pill ld-up">
            <i aria-hidden="true" />
            앱 UGC 마케팅 자동화 · 베타 무료
          </span>

          <HeroHeadline />

          <p className="ld-hero-lead ld-up ld-up-2">
            앱 설명만 적어두세요. 실제 사용자가 앱을 써보고 올린 것 같은 UGC
            영상을 만들어 계정에 올리고, 어떤 영상이 반응이 좋았는지까지
            챙깁니다. 크리에이터 섭외도, 촬영도, 편집도 필요 없습니다.
          </p>

          <div className="ld-hero-cta ld-up ld-up-3">
            <Link className="ld-btn ld-btn-primary ld-btn-lg" href={demoHref}>
              무료로 시작하기
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="ld-btn ld-btn-ghost ld-btn-lg" href="#how">
              어떻게 돌아가는지 보기
            </Link>
          </div>

          <p className="ld-hero-note ld-up ld-up-4">
            베타 데모입니다. 로그인과 결제는 아직 준비 중이고, 버튼을 누르면
            체험용 화면으로 이동합니다.
          </p>

          {/*
            제품 목업.
            예전에는 브라우저 창에 신호등 점 세 개를 찍고 세로 영상 세 개를
            나란히 넣었습니다. 브라우저가 세로 영상을 나란히 보여주는 일은
            없으니 그저 장식이었습니다.

            지금은 제품의 두 축을 그대로 보여줍니다. 왼쪽은 만들어진 영상,
            오른쪽은 올라갈 예약과 성과입니다.
          */}
          <div className="ld-stage ld-up ld-up-4">
            <div className="ld-stage-grid">
              <div className="ld-phone">
                <div className="ld-phone-art" aria-hidden="true" />
                <div className="ld-phone-ui">
                  <div className="ld-phone-prog" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div>
                    <p className="ld-phone-cap">이거 매번 까먹지 않나요?</p>
                    <div className="ld-phone-foot">
                      <span>@myapp.daily</span>
                      <span>28.4만</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ld-stage-side">
                <div className="ld-stage-block">
                  <h3>이번 주 7편 자동 업로드</h3>
                  <ul className="ld-sched">
                    <li>
                      <time>월 09:40</time>
                      <span>@myapp.daily</span>
                      <em>예약</em>
                    </li>
                    <li>
                      <time>수 12:15</time>
                      <span>@myapp.daily</span>
                      <em>예약</em>
                    </li>
                    <li>
                      <time>금 08:05</time>
                      <span>@myapp.kr</span>
                      <em>예약</em>
                    </li>
                    <li>
                      <time>일 19:30</time>
                      <span>@myapp.kr</span>
                      <em>예약</em>
                    </li>
                  </ul>
                </div>

                <div className="ld-stage-stats">
                  <div>
                    <strong>28.4만</strong>
                    <span>이번 주 조회</span>
                  </div>
                  <div>
                    <strong>7편</strong>
                    <span>올라간 영상</span>
                  </div>
                  <div>
                    <strong>2개</strong>
                    <span>돌리는 계정</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ 소개 문단 */}
      <section className="ld-intro" id="product">
        <div className="ld-shell">
          <div className="ld-intro-inner">
            <p className="ld-kicker">UGC-Z를 소개합니다</p>
            <h2>
              앱을 만드는 일과 <span className="ld-mark">알리는 일</span>은
              다릅니다.
            </h2>

            <div className="ld-intro-body">
              <p>
                좋은 앱을 만들어도, 영상이 없으면 아무도 모릅니다. 그런데 영상을
                만들려면 편집을 배워야 하고, 외주를 맡기면 편당 수십만 원에 며칠을
                기다려야 합니다. 고치고 싶으면 또 며칠입니다.
              </p>
              <p>
                <strong>UGC-Z는 이 과정을 대신합니다.</strong> 앱 설명을 한 번
                적어두면, AI가 영상을 만들고 다듬어서 올릴 수 있는 형태로
                내놓습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- 문제 제기 */}
      <section className="ld-section">
        <div className="ld-shell">
          <div className="ld-head">
            <p className="ld-kicker">여기서 멈춥니다</p>
            <h2>
              편집이 아니라, <span className="ld-mark">꾸준함</span>이
              문제입니다.
            </h2>
            <p>한 편 잘 만드는 것보다, 매주 올리는 게 더 어렵습니다.</p>
          </div>

          <div className="ld-pains">
            {pains.map((p) => (
              <div className="ld-pain" key={p.t}>
                <h3>
                  <p.Icon size={16} aria-hidden="true" />
                  {p.t}
                </h3>
                <p>{p.d}</p>
              </div>
            ))}
          </div>

          <p className="ld-turn">
            만들고, 올리고, 보는 일을 <span className="ld-mark">한 바퀴</span>로
            묶어 계속 돌립니다.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- 어떻게 돌아가나요 */}
      <section className="ld-section" id="how">
        <div className="ld-shell">
          <div className="ld-head">
            <p className="ld-kicker">한 바퀴</p>
            <h2>만들고, 올리고, 보고, 다시.</h2>
            <p>
              한 바퀴 돌 때마다 어떤 영상이 내 앱에 통하는지 알게 됩니다. 그래서
              다음 영상이 조금씩 더 잘 됩니다.
            </p>
          </div>

          <div className="ld-steps">
            {loop.map((s, i) => (
              <div className="ld-step" key={s.t}>
                <span className="ld-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                  <span className="ld-step-meta">{s.meta}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="ld-loop">
            <span aria-hidden="true">
              <Repeat size={15} />
            </span>
            네 번째가 끝나면 <span className="ld-mark">다시 첫 번째</span>. 잘 된
            영상이 다음 영상의 재료가 됩니다.
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- 벤토 */}
      <section className="ld-section">
        <div className="ld-shell">
          <div className="ld-head">
            <p className="ld-kicker">들어 있는 것</p>
            <h2>
              만드는 것부터 <span className="ld-mark">올리는 것까지</span>.
            </h2>
            <p>
              크리에이터 섭외도, 편집 프로그램도, 매번 손으로 올릴 필요도 없습니다.
            </p>
          </div>

          <div className="ld-bento">
            {features.map((f) => (
              <article className="ld-card" key={f.t}>
                <h3>
                  <f.Icon size={16} aria-hidden="true" />
                  {f.t}
                </h3>
                <p>{f.d}</p>
                {/* 테두리 칩 네 개 대신 한 줄. 칩은 어디에도 남지 않는다. */}
                <p className="ld-meta">{f.spec.join(" · ")}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- 화면 구성 */}
      <section className="ld-section">
        <div className="ld-shell">
          <div className="ld-head">
            <p className="ld-kicker">화면 구성</p>
            <h2>
              하실 일은 <span className="ld-mark">네 가지</span>뿐입니다.
            </h2>
            <p>
              나머지는 저희가 합니다. 같은 일을 양쪽에 나눠 놓고 보시면
              차이가 보입니다.
            </p>
          </div>

          <div className="ld-split">
            <div className="ld-pane">
              <span className="ld-pane-role">
                <LayoutDashboard size={13} aria-hidden="true" />
                내 화면
              </span>
              <h3>고객님은 네 가지만 하시면 됩니다</h3>
              <p>어려운 설정은 없습니다. 처음 화면에서 순서대로 따라가면 됩니다.</p>
              <ul className="ld-list">
                {customerPoints.map((c) => (
                  <li key={c}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="ld-pane ld-pane-dark ld-pane-tall">
              <span className="ld-pane-role">
                <ShieldCheck size={13} aria-hidden="true" />
                UGC-Z 화면
              </span>
              <h3>저희가 하는 일은 여섯 단계입니다</h3>
              <p>
                영상 한 편에도 이만큼이 들어갑니다. 고객님은 신청만 하시면 되고,
                이 과정은 전부 저희가 합니다.
              </p>
              {/* 체크 표시 대신 번호. 순서가 있는 일이라는 게 한눈에 보인다. */}
              <ul className="ld-list">
                {operatorPoints.map((o, i) => (
                  <li key={o.t}>
                    <span className="ld-task-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="ld-task">
                      <strong>{o.t}</strong>
                      <p>{o.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- 요금제 */}
      <section className="ld-section" id="pricing">
        <div className="ld-shell">
          <div className="ld-head">
            <p className="ld-kicker">요금제</p>
            <h2>
              <span className="ld-mark">편수와 계정 수</span>로 정합니다.
            </h2>
            <p>
              베타 기간에는 무료로 쓸 수 있습니다. 아래 금액은 아직 확정되지
              않은 예시입니다.
            </p>
          </div>

          <PricePlans />
        </div>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section className="ld-section" id="faq">
        <div className="ld-shell">
          <div className="ld-head">
            <p className="ld-kicker">자주 묻는 질문</p>
            <h2>궁금한 것들</h2>
          </div>

          <Faq />
        </div>
      </section>

      {/* ------------------------------------------------------------ 마지막 CTA */}
      <section className="ld-cta">
        <div className="ld-shell">
          <p className="ld-kicker">지금 시작</p>
          <h2>
            내 앱의 <span className="ld-mark">첫 UGC 영상</span>부터.
          </h2>
          <p>
            앱 설명만 있으면 됩니다. 로그인 없이도 체험용 화면에서 바로
            해보실 수 있습니다.
          </p>
          <div className="ld-cta-actions">
            <Link className="ld-btn ld-btn-light ld-btn-lg" href={demoHref}>
              무료로 시작하기
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <p className="ld-cta-note">
            베타 데모 · 실제 AI 생성과 자동 업로드는 아직 실행되지 않습니다.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------------- 푸터 */}
      <footer className="ld-footer">
        <div className="ld-shell">
          <div className="ld-footer-grid">
            <div className="ld-footer-about">
              <span className="ld-brand">
                <Clapperboard size={19} aria-hidden="true" />
                UGC<b>-Z</b>
              </span>
              <p>
                앱을 UGC 영상으로 알리는 마케팅 자동화 서비스입니다. 앱을 써보는
                영상을 만들어 계정에 올리고, 반응까지 관리합니다.
              </p>
            </div>

            <div className="ld-footer-col">
              <h3>알아보기</h3>
              <ul>
                <li>
                  <a href="#product">서비스 소개</a>
                </li>
                <li>
                  <a href="#how">어떻게 돌아가나요</a>
                </li>
                <li>
                  <a href="#pricing">요금</a>
                </li>
                <li>
                  <a href="#faq">자주 묻는 질문</a>
                </li>
              </ul>
            </div>

            <div className="ld-footer-col">
              <h3>체험해 보기</h3>
              <ul>
                <li>
                  <Link href="/app/overview">대시보드</Link>
                </li>
                <li>
                  <Link href="/app/content">콘텐츠</Link>
                </li>
                <li>
                  <Link href="/app/calendar">게시 일정</Link>
                </li>
                <li>
                  <Link href="/app/profile">앱 프로필</Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="ld-footer-bottom">
            <span>© 2026 UGC-Z. 베타 데모입니다.</span>
            <div>
              <span>
                <Film size={12} aria-hidden="true" /> 샘플 데이터 · 실제 영상
                아님
              </span>
              <span>
                <Type size={12} aria-hidden="true" /> 로그인 · 결제 준비 중
              </span>
              <span>
                <Music size={12} aria-hidden="true" /> 이용약관 준비 중
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
