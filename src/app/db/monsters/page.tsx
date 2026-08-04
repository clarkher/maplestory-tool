import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { MonsterDb } from "./MonsterDb";

export const metadata: Metadata = {
  title: "怪物資料｜數值、抗性、出沒地圖、掉落物",
  description: "新楓之谷經典版怪物查詢：等級、HP、經驗、攻防命中迴避、屬性抗性、出沒地圖與刷怪點數量、掉落物一覽。",
  alternates: { canonical: "/db/monsters" },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <MonsterDb />
    </Suspense>
  );
}
