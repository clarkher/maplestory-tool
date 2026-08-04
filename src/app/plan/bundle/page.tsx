import type { Metadata } from "next";
import { BundlePlanner } from "./BundlePlanner";

export const metadata: Metadata = {
  title: "任務打包｜要跑同一張圖的任務併成一趟",
  description:
    "把需求重疊的任務併在一起：A 任務要 50 個、B 任務要 40 個，一趟收滿 90 個就好。按地點聚合，附上總需求量與刷怪點數。",
  alternates: { canonical: "/plan/bundle" },
};

export default function Page() {
  return <BundlePlanner />;
}
