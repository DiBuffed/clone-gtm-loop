import Link from "next/link";
export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404 / UGC-Z</p>
      <h1>페이지를 찾을 수 없어요.</h1>
      <Link className="button primary" href="/app/overview">
        대시보드로 돌아가기
      </Link>
    </main>
  );
}
