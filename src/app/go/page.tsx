import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { GoNavigator } from "./GoNavigator";

export const metadata: Metadata = {
  title: "帶我去｜新楓之谷經典版 地圖路線",
  description:
    "輸入目的地，一段一段告訴你要走哪個傳送門、經過哪幾張圖，還能展開小地圖對照。路線來自客戶端傳送門資料。",
  alternates: { canonical: "/go" },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock label="準備導航…" />}>
      <GoNavigator />
    </Suspense>
  );
}
