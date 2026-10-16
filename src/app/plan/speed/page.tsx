// src/app/plan/speed/page.tsx
import type { Metadata } from "next";
import { PracticeSpeed } from "./PracticeSpeed";

export const metadata: Metadata = {
  title: "練功測速｜分享遊戲畫面，自動算 10 分鐘經驗",
  description: "分享楓之谷經典版的遊戲視窗，自動算 10 分鐘拿多少經驗、還要多久升級，看每張圖別人練得多快。",
  alternates: { canonical: "/plan/speed" },
};

export default function Page() {
  return <PracticeSpeed />;
}
