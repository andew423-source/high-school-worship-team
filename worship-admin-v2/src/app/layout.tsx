import type { Metadata } from "next";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "고등부 찬양팀",
    template: "%s | 고등부 찬양팀",
  },
  description: "조 편성, 출결, 등단을 한곳에서 관리하는 고등부 찬양팀 운영 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body><QueryProvider>{children}</QueryProvider></body>
    </html>
  );
}
