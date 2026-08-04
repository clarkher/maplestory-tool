import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { ItemDb } from "./ItemDb";

export const metadata: Metadata = {
  title: "道具資料｜裝備數值與掉落來源",
  description: "新楓之谷經典版道具查詢：裝備數值、需求等級、說明，以及哪些怪會掉、哪些任務會給、哪些任務要用到。",
  alternates: { canonical: "/db/items" },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ItemDb />
    </Suspense>
  );
}
