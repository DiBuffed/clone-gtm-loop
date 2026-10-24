import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // 개발 서버는 기본적으로 localhost만 허용하므로, Playwright가 쓰는
  // 127.0.0.1을 추가한다. 이 옵션은 개발 모드에서만 적용된다.
  // 없으면 dev 서버를 띄운 채 E2E를 돌릴 때 dev 리소스가 차단되어 실패한다.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
