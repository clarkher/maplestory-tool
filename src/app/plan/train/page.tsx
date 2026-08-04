import type { Metadata } from "next";
import { TrainPlanner } from "./TrainPlanner";

export const metadata: Metadata = {
  title: "打怪練功｜這個等級該去哪一張圖",
  description:
    "輸入等級跟職業，排出適合你的練功地圖：刷怪點數量、回生秒數、一輪清完的經驗、命中需求，選好還會帶你走過去。",
  alternates: { canonical: "/plan/train" },
};

export default function Page() {
  return <TrainPlanner />;
}
