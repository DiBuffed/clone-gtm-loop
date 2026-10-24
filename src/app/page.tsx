import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import "./landing.css";

export const metadata: Metadata = {
  title: "UGC-Z — 앱 마케팅을 UGC 영상으로, 자동으로",
  description:
    "앱 설명만 적어두세요. 앱을 써보는 UGC 영상을 만들어 계정에 올리고, 어떤 영상이 반응이 좋았는지까지 관리합니다. 앱을 만드는 팀을 위한 UGC 마케팅 자동화.",
  openGraph: {
    type: "website",
    title: "UGC-Z — 앱 마케팅을 UGC 영상으로, 자동으로",
    description:
      "만들고, 올리고, 보고, 다시. 한 바퀴 돌 때마다 어떤 영상이 통하는지 알게 됩니다.",
    siteName: "UGC-Z",
    locale: "ko_KR",
  },
};

export default function Page() {
  return <Landing />;
}
