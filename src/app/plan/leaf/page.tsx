import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { LeafPlanner } from "./LeafPlanner";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "楓葉武器衝卷規劃器｜楓葉商會每天換什麼",
  description: "楓之谷經典版楓葉商會 11/19～12/9：選一把楓葉武器跟一種衝法，日曆排好每天換武器還是卷軸，算出最後攻擊多少、衝到幾以上的機會、楓幣要準備多少。",
  alternates: { canonical: "/plan/leaf" },
});

export default function Page() {
  return (
    <div className="space-y-3.5 py-3 sm:py-6">
      <header>
        <p className="text-[13px] font-bold ink-soft">活動工具・楓葉商會 11/19～12/16</p>
        <h1 className="mt-1 text-[26px] font-black tracking-tight sm:text-[32px]">楓葉武器衝卷規劃器</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">選一種衝法，日曆告訴你每天換什麼，看最後攻擊多少。</p>
      </header>
      <Suspense fallback={<LoadingBlock label="排日曆中…" />}>
        <LeafPlanner />
      </Suspense>
    </div>
  );
}
