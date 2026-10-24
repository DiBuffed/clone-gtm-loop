"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Menu, Minus, Plus, X, Zap } from "lucide-react";

/* --------------------------------------------------------------------------
   스크롤 등장

   숨김 상태를 CSS에 미리 적어두지 않는다. 스크립트가 실패하면 내용이 투명한
   채로 남기 때문이다. 이 컴포넌트가 살아 있을 때만 숨기고, 화면에 들어오면
   되돌린다. 자바스크립트가 없으면 그냥 다 보인다.

   CSS 스크롤 타임라인(view())도 검토했지만, .landing의 overflow 때문에
   스크롤 기준이 뷰포트가 아니라 .landing 자신으로 잡혀 진행도가 0이나 1에
   붙어버렸다. 그래서 스크립트로 직접 재서 판단한다.
   -------------------------------------------------------------------------- */

const REVEAL_TARGETS = [
  ".ld-intro-inner",
  ".ld-head",
  ".ld-pains",
  ".ld-turn",
  ".ld-steps",
  ".ld-loop",
  ".ld-bento",
  ".ld-split",
  ".ld-toggle",
  ".ld-plans",
  ".ld-plan-note",
  ".ld-faq",
  ".ld-cta .ld-shell",
].join(", ");

export function ScrollReveal() {
  useEffect(() => {
    // 움직임을 줄이도록 설정한 사용자에게는 아무것도 숨기지 않는다.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = document.querySelectorAll<HTMLElement>(
      `.landing ${REVEAL_TARGETS}`,
    );

    /*
      아직 나타나지 않은 요소만 들고 있는다. 한 번 나타난 것은 목록에서 빼서
      스크롤할 때 다시 검사하지 않는다.

      IntersectionObserver도 검토했지만, 앵커 링크(#how, #faq)나 빠른 휠처럼
      화면을 건너뛰면 관측 시점을 놓친 요소가 opacity 0으로 영영 남았다.
      직접 재면 건너뛰든 천천히 내리든 결과가 같다.
    */
    const pending = new Set<HTMLElement>();

    for (const el of targets) {
      /*
        완전히 화면 밖에 있는 것만 숨긴다. 첫 화면에 조금이라도 걸친 요소를
        숨기면 보이는 앞에서 한 번 사라졌다 나타나 깜빡인다.
      */
      if (el.getBoundingClientRect().top < window.innerHeight) continue;
      el.classList.add("ld-reveal");
      pending.add(el);
    }

    if (pending.size === 0) return;

    let frame = 0;

    const sweep = () => {
      frame = 0;
      // 화면 아래 12%는 아직 안 들어온 것으로 본다. 바닥에 닿기 전에 시작한다.
      const line = window.innerHeight * 0.88;
      for (const el of pending) {
        // 화면 위로 지나간 것(top < 0)도 여기서 함께 걸린다.
        if (el.getBoundingClientRect().top >= line) continue;
        el.classList.add("is-in");
        pending.delete(el);
      }
      if (pending.size === 0) {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sweep);
    };

    sweep();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return null;
}

/* --------------------------------------------------------------------------
   히어로 헤드라인 — 후킹 표현이 번갈아 바뀐다.
   여러 후킹 버전을 만든다는 제품 자체를 첫 화면에서 보여준다.
   -------------------------------------------------------------------------- */

/*
  한 줄에 들어가야 하는 문구들. 하나라도 줄이 바뀌면 칸 높이가 두 줄이 되고,
  회전할 때마다 짧은 문구 아래에 빈 줄이 생긴다. 그래서 열여섯 자를 넘기지
  않는다. 검사: hero variants all occupy the same number of lines
*/
const HOOK_VARIANTS = [
  <>
    설치하고 <em>싶게</em> 만드는 영상이,
  </>,
  <>
    내 앱을 <em>써본</em> 듯한 영상이,
  </>,
  <>
    진짜 <em>후기</em> 같은 앱 영상이,
  </>,
  <>
    스크롤을 <em>멈추는</em> 앱 영상이,
  </>,
  <>
    끝까지 <em>보게</em> 되는 앱 영상이,
  </>,
];

/** 문구가 바뀌는 주기. 너무 빠르면 읽기 전에 사라진다. */
const ROTATE_MS = 3200;

export function HeroHeadline() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    // 움직임을 줄이도록 설정한 사용자에게는 문구를 고정한다.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(
      () => setActive((v) => (v + 1) % HOOK_VARIANTS.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <h1 className="ld-up ld-up-1">
      {/*
        화면 낭독기는 회전하는 문구를 매번 다시 읽어 방해가 된다.
        그래서 고정 문장을 하나 두고, 보이는 쪽은 aria-hidden으로 뺀다.
      */}
      <span className="ld-sr">
        설치하고 싶게 만드는 앱 영상이, 매일 자동으로 올라갑니다.
      </span>

      <span className="ld-rot" aria-hidden="true">
        {HOOK_VARIANTS.map((v, i) => (
          <span key={i} className={i === active ? "is-on" : undefined}>
            {v}
          </span>
        ))}
      </span>

      <span aria-hidden="true">
        매일 <span className="ld-mark">자동으로</span> 올라갑니다.
      </span>
    </h1>
  );
}

/* --------------------------------------------------------------------------
   상단 내비게이션
   -------------------------------------------------------------------------- */

const navLinks = [
  { href: "#product", label: "소개" },
  { href: "#how", label: "어떻게 돌아가나요" },
  { href: "#pricing", label: "요금" },
  { href: "#faq", label: "자주 묻는 질문" },
];

/** 인증과 결제가 아직 없어 체험용 제품 화면으로 보낸다. */
const demoHref = "/app/overview";

export function LandingNav() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`ld-nav ${stuck ? "ld-nav-stuck" : ""}`}>
      <div className="ld-shell">
        <div className="ld-nav-inner">
          <Link href="/" className="ld-brand" aria-label="UGC-Z 홈">
            <Zap size={19} fill="currentColor" aria-hidden="true" />
            UGC<b>-Z</b>
            <small>BETA</small>
          </Link>

          <nav className="ld-nav-links" aria-label="주요 섹션">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ld-nav-actions">
            <Link className="ld-btn ld-btn-quiet" href={demoHref}>
              로그인
            </Link>
            <Link className="ld-btn ld-btn-primary" href={demoHref}>
              무료로 시작하기
            </Link>
            <button
              type="button"
              className="ld-burger"
              aria-expanded={open}
              aria-controls="ld-mobile-nav"
              aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        <div
          id="ld-mobile-nav"
          className={`ld-nav-mobile ${open ? "open" : ""}`}
        >
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <div className="ld-nav-mobile-cta">
            <Link className="ld-btn ld-btn-ghost" href={demoHref}>
              로그인
            </Link>
            <Link className="ld-btn ld-btn-primary" href={demoHref}>
              무료로 시작하기
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------------
   요금제 — 편수와 계정 수로 정한다.
   -------------------------------------------------------------------------- */

type Plan = {
  id: string;
  name: string;
  desc: string;
  monthly: number | null;
  focus?: boolean;
  badge?: string;
  features: string[];
  cta: string;
};

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    desc: "한 계정을 꾸준히 돌리시는 분",
    monthly: 190000,
    features: [
      "월 10편까지 만들기",
      "계정 1개 연결",
      "자동 업로드와 예약",
      "영상별 조회수 보기",
    ],
    cta: "Starter로 시작하기",
  },
  {
    id: "growth",
    name: "Growth",
    desc: "여러 계정에 꾸준히 올리시는 분",
    monthly: 490000,
    focus: true,
    badge: "가장 많이 선택",
    features: [
      "월 30편까지 만들기",
      "계정 3개 연결",
      "첫 3초 여러 버전 만들기",
      "잘 된 영상 변형해서 다시 올리기",
      "먼저 만들어 드리기",
    ],
    cta: "Growth로 시작하기",
  },
  {
    id: "scale",
    name: "Scale",
    desc: "여러 앱을 함께 운영하는 팀",
    monthly: null,
    features: [
      "편수 제한 없음",
      "계정 수 제한 없음",
      "앱 여러 개 관리",
      "팀원별 권한 나누기",
      "담당자 배정과 관리",
    ],
    cta: "도입 문의하기",
  },
];

const won = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

export function PricePlans() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <div
        className="ld-toggle"
        role="group"
        aria-label="결제 주기 선택"
        style={{ marginTop: 26 }}
      >
        <button
          type="button"
          aria-pressed={!annual}
          onClick={() => setAnnual(false)}
        >
          월간 결제
        </button>
        <button
          type="button"
          aria-pressed={annual}
          onClick={() => setAnnual(true)}
        >
          연간 결제
        </button>
      </div>

      <div className="ld-plans">
        {plans.map((p) => {
          const price =
            p.monthly === null
              ? null
              : annual
                ? Math.round(p.monthly * 0.85)
                : p.monthly;

          return (
            <div
              key={p.id}
              className={`ld-plan ${p.focus ? "ld-plan-focus" : ""}`}
            >
              <div className="ld-plan-top">
                <h3>{p.name}</h3>
                {p.badge && <span className="ld-plan-badge">{p.badge}</span>}
              </div>
              <p className="ld-plan-desc">{p.desc}</p>

              <div className="ld-price">
                {price === null ? (
                  <strong>별도 견적</strong>
                ) : (
                  <>
                    <strong>{won(price)}</strong>
                    <span>원 / 월</span>
                  </>
                )}
              </div>
              {annual && price !== null && (
                <p
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: "var(--ld-muted)",
                  }}
                >
                  연간 결제 · 15% 할인 적용
                </p>
              )}

              <Link
                className={`ld-btn ${
                  p.focus ? "ld-btn-primary" : "ld-btn-ghost"
                }`}
                href={demoHref}
              >
                {p.cta}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>

              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={15} aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="ld-plan-note">
        표시된 금액은 예시입니다. 실제 요금제와 무료 체험 조건은 확정 전이며,
        로그인과 결제는 아직 연결되지 않았습니다.
      </p>
    </>
  );
}

/* --------------------------------------------------------------------------
   자주 묻는 질문
   -------------------------------------------------------------------------- */

const faqs = [
  {
    q: "UGC 영상이 뭔가요?",
    a: "실제 사용자가 앱을 써보고 직접 찍어 올린 것 같은 짧은 영상입니다. 광고처럼 보이지 않아서 끝까지 보게 되고, 앱이 궁금해지게 만듭니다. UGC-Z는 AI 모델과 앱 화면으로 이런 영상을 만듭니다.",
  },
  {
    q: "영상을 만들고 올리는 걸 다 해주나요?",
    a: "그렇게 만드는 중입니다. 지금 베타에서는 앱 설명을 넣고 영상 제작을 요청하면 만들어지는 것까지 됩니다. 계정 자동 업로드와 조회수 수집은 준비 중입니다.",
  },
  {
    q: "편집을 전혀 모르는데 괜찮나요?",
    a: "네. 편집은 저희가 합니다. 앱 설명만 적어주시면 자막, 음악, 화면 확대까지 알아서 처리됩니다. 프로그램을 따로 배우실 필요가 없습니다.",
  },
  {
    q: "후킹이 뭔가요?",
    a: "사람들이 영상을 넘기지 않고 보게 만드는 앞부분입니다. 보통 첫 3초에서 넘길지 말지가 정해집니다. UGC-Z는 이 첫 3초를 여러 버전으로 만들어 어느 쪽이 잘 통하는지 비교합니다.",
  },
  {
    q: "어디에 올릴 수 있나요?",
    a: "인스타그램 릴스, 유튜브 쇼츠, 틱톡처럼 세로 영상을 쓰는 곳이면 어디든 올릴 수 있습니다. 한 가지 형태로 나오기 때문에 따로 바꿀 필요가 없습니다.",
  },
  {
    q: "영상에 나오는 사람은 누구인가요?",
    a: "AI가 만든 사람입니다. 모델을 따로 섭외하지 않아도 되고, 얼굴과 옷, 배경을 직접 고를 수 있습니다.",
  },
  {
    q: "제 계정 비밀번호를 드려야 하나요?",
    a: "지금은 아니요. 계정 연동 기능은 아직 없고, 준비할 때도 비밀번호를 직접 보관하지 않는 방식으로 붙일 계획입니다. 그 전까지는 만든 영상을 내려받아 직접 올리시면 됩니다.",
  },
  {
    q: "마음에 안 들면 다시 만들 수 있나요?",
    a: "네. 몇 번이든 다시 만들 수 있습니다. 이전 영상도 그대로 남아 있어서 나란히 놓고 비교해 보실 수 있습니다.",
  },
  {
    q: "제 앱 정보가 다른 곳에 공개되나요?",
    a: "아니요. 지금은 서버 없이 브라우저에만 저장되고, 저희 쪽으로 아무것도 전송되지 않습니다.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="ld-faq">
      {faqs.map((f, i) => {
        const expanded = open === i;
        return (
          <div className="ld-faq-item" key={f.q}>
            <button
              type="button"
              className="ld-faq-q"
              aria-expanded={expanded}
              aria-controls={`ld-faq-panel-${i}`}
              id={`ld-faq-button-${i}`}
              onClick={() => setOpen(expanded ? null : i)}
            >
              {f.q}
              {expanded ? (
                <Minus size={17} aria-hidden="true" />
              ) : (
                <Plus size={17} aria-hidden="true" />
              )}
            </button>
            {expanded && (
              <div
                className="ld-faq-a"
                id={`ld-faq-panel-${i}`}
                role="region"
                aria-labelledby={`ld-faq-button-${i}`}
              >
                {f.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
