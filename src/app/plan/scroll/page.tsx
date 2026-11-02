import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { ScrollSim } from "./ScrollSim";

export const metadata: Metadata = {
  title: "衝卷模擬｜衝到幾張要準備多少卷軸",
  description: "選一件裝備跟一張卷軸，一張表算出衝到 1 張、2 張…全部成功，各要準備幾張卷軸、幾件裝備、多少楓幣。",
  alternates: { canonical: "/plan/scroll" },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock label="載入卷軸資料…" />}>
      <ScrollSim />
    </Suspense>
  );
}
