import type { Metadata } from "next";
import { BuyQuestPlanner } from "./BuyQuestPlanner";

export const metadata: Metadata = {
  title: "拍賣買齊就能交的任務｜不用打怪，買齊直接交",
  description: "要交的東西全都能在拍賣買到、不用打怪的任務：每個任務要交什麼、拿多少經驗、什麼獎勵道具，照經驗排好。",
  alternates: { canonical: "/plan/buy" },
};

export default function Page() {
  return <BuyQuestPlanner />;
}
