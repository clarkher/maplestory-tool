import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { GuildSim } from "./GuildSim";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "公會徽章｜挑底圖、圖案、顏色先看成品",
  description: "挑公會徽章的底圖、圖案和顏色，放大看也看遊戲裡實際大小；可以隨機配一個、下載圖片、分享連結給公會的人。",
  alternates: { canonical: "/plan/guild" },
});

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      {/* 標題放在 Suspense 外面：靜態 HTML 就有，版面不跳 */}
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">公會徽章</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">挑底圖、圖案和顏色，先看看公會徽章做出來長怎樣。</p>
      </header>
      <Suspense fallback={<LoadingBlock label="載入公會徽章…" />}>
        <GuildSim />
      </Suspense>
    </div>
  );
}
