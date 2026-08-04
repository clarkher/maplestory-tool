import type { Metadata } from "next";
import { QuestPlanner } from "./QuestPlanner";

export const metadata: Metadata = {
  title: "解任務｜現在接得到的任務都在這",
  description:
    "輸入等級跟職業，列出現在真的接得到的任務：去找哪個 NPC、在哪張圖、要交什麼道具、打什麼怪、拿多少經驗與楓幣。",
  alternates: { canonical: "/plan/quest" },
};

export default function Page() {
  return <QuestPlanner />;
}
