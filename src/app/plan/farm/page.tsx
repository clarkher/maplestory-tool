import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { FarmPlanner } from "./FarmPlanner";

export const metadata: Metadata = {
  title: "刷寶物｜想要的東西去哪打最快",
  description:
    "勾選你想要的道具，排出哪一張地圖一趟能同時收到最多樣，附上會掉的怪與刷怪點數量，還能直接導航過去。",
  alternates: { canonical: "/plan/farm" },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <FarmPlanner />
    </Suspense>
  );
}
