import type { Metadata } from "next";
import { staticMeta } from "@/lib/static-data";
import { AboutContent } from "./AboutContent";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "資料從哪來｜來源、更新方式與限制",
  description: "楓谷幫手的資料來源：遊戲數值來自客戶端匯出、地圖路線來自 v83 地圖檔，以及我們刻意不提供掉落機率與每小時經驗的原因。",
  alternates: { canonical: "/about" },
});

export default function Page() {
  return <AboutContent meta={staticMeta()} />;
}
