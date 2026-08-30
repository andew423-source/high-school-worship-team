import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "고등부 찬양팀 운영 센터", template: "%s · 고등부 찬양팀" },
  description: "조 편성, 토요모임 출결, 주일 등단 배정을 한 흐름으로 관리하는 찬양팀 운영 사이트",
  openGraph: { title: "고등부 찬양팀 운영 센터", description: "조 편성부터 출결과 등단표까지", locale: "ko_KR", type: "website", images: [{ url: "/og.png", width: 1536, height: 864, alt: "찬양팀 운영 센터" }] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
