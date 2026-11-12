import type { Metadata } from "next";
import { staticFuture, staticItemHref } from "@/lib/static-data";
import { FutureView } from "./FutureView";
import { withOpenGraph } from "@/lib/seo";

export const metadata: Metadata = withOpenGraph({
  title: "未來視｜下一版大概何時開、現在該囤什麼",
  description: "新楓之谷經典版下一次改版的推估：比對上一版間隔、2005 年台服與 Artale 的順序，列出玩具城、殘暴炎魔、四轉開放前現在就拿得到的材料。全部標明官方或推估。",
  alternates: { canonical: "/future" },
});

/** 玩具城製作材料放幾件：後面的配方數已經少很多 */
const CRAFTS_SHOWN = 8;

export default function Page() {
  const future = staticFuture();
  const ids = [
    ...future.crafts.now.slice(0, CRAFTS_SHOWN).map(row => row.id),
    ...Object.values(future.fourthJob).flatMap(job => job.now.map(row => row.id)),
  ];
  const itemHrefs = Object.fromEntries(ids.map(id => [id, staticItemHref(id)]));
  return <FutureView crafts={future.crafts.now.slice(0, CRAFTS_SHOWN)} notNow={future.crafts.notNow.slice(0, 4)} fourthJob={future.fourthJob} itemHrefs={itemHrefs} />;
}
