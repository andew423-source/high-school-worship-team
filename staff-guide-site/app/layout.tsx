import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "고등부 찬양팀 스탭 운영 가이드",
  description: "첫 모임 면접, 학생 호출, 나눔마블 진행을 위한 스탭용 모바일 가이드",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
