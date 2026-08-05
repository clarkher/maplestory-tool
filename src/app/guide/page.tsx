import type { Metadata } from "next";
import { GuideContent } from "./GuideContent";

export const metadata: Metadata = {
  title: "1–30 懶人包｜每個職業的建議路線",
  description:
    "台服新楓之谷經典版 1~30 等最省事的一條路：新手任務 → 轉職 → 月妙刷到 21 → 超綠刷到 30。五大職業的轉職地點、素質配點、一轉技能加點，彙整自社群攻略並附出處。",
  alternates: { canonical: "/guide" },
};

export default function Page() {
  return <GuideContent />;
}
