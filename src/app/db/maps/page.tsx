import type { Metadata } from "next";
import { mapGroups } from "@/lib/atlas-view";
import { DB_HEADS } from "@/lib/db-heads";
import { staticAtlasMaps } from "@/lib/static-data";
import { MapList } from "./MapList";

export const metadata: Metadata = {
  title: "地圖資料｜每張圖的怪物、NPC、傳送門",
  description: "新楓之谷經典版已開放地圖一覽：依大陸與區域分組，每張圖有哪些怪、各幾隻、NPC 在哪、傳送門通去哪。",
  alternates: { canonical: "/db/maps" },
};

export default function Page() {
  // 只把分組、圖名、等級、搜尋字送進瀏覽器，座標留在單張地圖頁
  return <MapList {...DB_HEADS.maps} groups={mapGroups(staticAtlasMaps())} />;
}
