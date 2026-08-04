import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { QuestDb } from "./QuestDb";

export const metadata: Metadata = {
  title: "任務資料｜條件、NPC、獎勵一次看",
  description: "新楓之谷經典版任務查詢：等級與職業條件、接任務與回報的 NPC 位置、要交的道具、要打的怪、完成獎勵與前置任務。",
  alternates: { canonical: "/db/quests" },
};

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <QuestDb />
    </Suspense>
  );
}
