import type { Metadata } from "next";
import { FxPage } from "./FxPage";

export const metadata: Metadata = {
  title: "楓幣匯率｜雪吉拉 1 億楓幣多少台幣、每天走勢",
  description:
    "雪吉拉伺服器 1 億楓幣現在值多少台幣、1 元換幾萬楓幣，附每天的日 K 走勢、5／20 日線和委賣檔位。每 2 小時更新；看的是 8591 賣家的開價（由 maple-classic-wiki.pages.dev 整理），不是成交價。",
  alternates: { canonical: "/price/fx" },
};

/** 靜態頁：?pin=、?broken=1 是驗收用的，由 FxPage 在瀏覽器裡讀網址（不在這裡讀，免得整頁變動態） */
export default function Page() {
  return <FxPage />;
}
