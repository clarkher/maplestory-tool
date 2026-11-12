import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { PqCommand } from "./PqCommand";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "組隊指揮｜月妙、超綠、女神組隊任務一關一關照著喊",
  description: "隊長用的組隊任務小抄：月妙、超級綠水靈、女神組隊任務每一關要做什麼、要喊什麼，按一下複製；超綠爬繩、站平台、跳木桶幫你算下一組誰換到哪。",
  alternates: { canonical: "/plan/pq" },
});

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-3.5 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">組隊指揮</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">一關一關照著做，要喊的話按一下就複製，貼到隊伍聊天。</p>
      </header>
      <Suspense fallback={<LoadingBlock label="載入組隊任務…" />}>
        <PqCommand />
      </Suspense>
    </div>
  );
}
