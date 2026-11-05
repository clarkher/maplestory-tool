import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { AvatarSim } from "./AvatarSim";

export const metadata: Metadata = {
  title: "紙娃娃｜換髮型、臉型、點裝看穿起來的樣子",
  description: "選髮型、髮色、臉型、瞳色、膚色和 12 類裝備點裝，即時看角色穿起來長怎樣，可以隨機穿搭、下載透明背景圖、分享連結。",
  alternates: { canonical: "/plan/avatar" },
};

export default function Page() {
  return (
    // 電腦版（lg）角色卡、挑衣服卡左右排，容器放寬；手機照舊
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6 lg:max-w-5xl">
      {/* 標題放在 Suspense 外面：靜態 HTML 就有，資料載好時版面不跳 */}
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">紙娃娃</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">換髮型、臉型、點裝，看角色穿起來長怎樣，可以下載或分享。</p>
      </header>
      <Suspense fallback={<LoadingBlock label="載入紙娃娃…" />}>
        <AvatarSim />
      </Suspense>
    </div>
  );
}
