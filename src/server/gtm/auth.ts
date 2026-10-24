import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function secret() {
  const s = process.env.GTM_ADMIN_TOKEN;
  if (!s || s.length < 32)
    throw new Error("GTM_ADMIN_TOKEN을 32자 이상 설정하세요.");
  return s;
}
export function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function session() {
  const expiry = Date.now() + 12 * 3600000;
  const value = `${expiry}.${randomBytes(16).toString("hex")}`;
  return `${value}.${sign(value)}`;
}
export function authorized(req: Request) {
  if (!process.env.GTM_ADMIN_TOKEN || process.env.GTM_ADMIN_TOKEN.length < 32)
    return false;
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("gtm_session="))
    ?.slice(12);
  if (!cookie) return false;
  const [expiry, nonce, signature] = cookie.split(".");
  return (
    Number(expiry) > Date.now() &&
    !!nonce &&
    !!signature &&
    equal(signature, sign(`${expiry}.${nonce}`))
  );
}
export function mediaToken(id: string, expires: number) {
  return sign(`media:${id}:${expires}`);
}
export function mediaAllowed(id: string, url: URL) {
  const exp = Number(url.searchParams.get("expires"));
  const sig = url.searchParams.get("sig") || "";
  return (
    Number.isFinite(exp) && exp > Date.now() && equal(sig, mediaToken(id, exp))
  );
}
export function publicBase() {
  const u = new URL(process.env.GTM_PUBLIC_URL || "http://localhost:3000");
  if (
    process.env.NODE_ENV === "production" &&
    u.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  )
    throw new Error("GTM_PUBLIC_URL은 공개 HTTPS 주소여야 합니다.");
  return u.origin;
}
export function signedMediaUrl(id: string) {
  const exp = Date.now() + 48 * 3600000;
  return `${publicBase()}/api/gtm/media/${id}?expires=${exp}&sig=${mediaToken(id, exp)}`;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === publicBase();
}
