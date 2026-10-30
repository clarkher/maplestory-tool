import type { Metadata } from "next";
import { HalloweenGuide } from "./HalloweenGuide";

export const metadata: Metadata = {
  title: "萬聖節任務攻略｜雪原的面具祭典 1～3 章",
  description: "新楓之谷經典版 2026 萬聖節「雪原的面具祭典」三章任務照順序列好：找誰、交什麼、要打的怪去哪張圖打，可以邊做邊打勾。",
  alternates: { canonical: "/event/halloween" },
};

export default function Page() {
  return <HalloweenGuide />;
}
