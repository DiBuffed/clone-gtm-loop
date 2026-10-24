import type { Metadata, Viewport } from "next";
import { DemoProvider } from "@/components/demo-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: "UGC-Z — Your next growth loop",
  description: "앱을 설명하세요. 다음 콘텐츠는 UGC-Z와 함께.",
  robots: { index: false, follow: false },
};
// 흰 테마. 브라우저 UI(주소창·스크롤바)도 같은 색을 쓰게 한다.
export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
