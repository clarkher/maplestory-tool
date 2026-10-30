import type { Metadata } from "next";
import { npcListRows } from "@/lib/atlas-view";
import { DB_HEADS } from "@/lib/db-heads";
import { staticAtlasMaps, staticNpcs } from "@/lib/static-data";
import { NpcList } from "./NpcList";

export const metadata: Metadata = {
  title: "NPC 資料｜在哪、賣什麼、任務",
  description: "新楓之谷經典版 NPC 一覽：每個 NPC 在哪張圖、商店賣什麼、有哪些任務，可以只看有賣東西或有任務的。",
  alternates: { canonical: "/db/npcs" },
};

export default function Page() {
  // 只把名字、第一張圖名、有沒有店與任務送進瀏覽器，商品與任務清單留在單個 NPC 頁
  const names = new Map(staticAtlasMaps().map(map => [map.id, map.n]));
  return <NpcList {...DB_HEADS.npcs} rows={npcListRows(staticNpcs(), id => names.get(id))} />;
}
