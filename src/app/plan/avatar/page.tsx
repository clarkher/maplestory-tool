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
    <Suspense fallback={<LoadingBlock label="載入紙娃娃…" />}>
      <AvatarSim />
    </Suspense>
  );
}
