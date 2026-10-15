import type { Metadata } from "next";
import { FxPage } from "./FxPage";

export const metadata: Metadata = {
  title: "楓幣匯率｜雪吉拉 1 億楓幣多少台幣、每天走勢",
  description:
    "雪吉拉伺服器 1 億楓幣現在值多少台幣、1 元換幾萬楓幣，附每天的日 K 走勢、5／20 日線和委賣檔位。每 2 小時更新；看的是 8591 賣家的開價（由 maple-classic-wiki.pages.dev 整理），不是成交價。",
  alternates: { canonical: "/price/fx" },
};

type Search = Record<string, string | string[] | undefined>;

/** ?pin=2026-10-12 讓十字線停在那天、?broken=1 看讀不到資料的畫面：只給驗收用，頁面上不提 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const pin = typeof query.pin === "string" ? query.pin : null;
  return <FxPage pin={pin} broken={query.broken === "1"} />;
}
