import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { SkillDb } from "./SkillDb";

export const metadata: Metadata = {
  title: "技能資料｜每一級的實際數值",
  description: "新楓之谷經典版技能查詢：依職業分類，列出每個技能每一級的實際數值，不用自己推算公式。",
  alternates: { canonical: "/db/skills" },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SkillDb />
    </Suspense>
  );
}
