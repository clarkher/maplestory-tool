import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtlasCard, DoorRows, MobRows, NpcRows } from "@/components/atlas/rows";
import { MapView } from "@/components/atlas/MapView";
import { SeoPage } from "@/components/SeoPage";
import { mapRenderImage } from "@/lib/asset-paths";
import { doorList, levelRange, mapSection, mapSummary, openShopCount } from "@/lib/atlas-view";
import { breadcrumbLd, clip, webPageLd } from "@/lib/seo";
import { staticAtlasIndex, staticAtlasMaps, staticMapRenders, staticMaps, staticModified, staticNpcs } from "@/lib/static-data";
import type { AtlasMap } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticAtlasMaps().map(map => ({ id: String(map.id) }));
}

function find(id: string) {
  return staticAtlasMaps().find(map => String(map.id) === id);
}

/** 圖名：先找圖鑑，再找 maps.json 的中文名；都沒有就 undefined */
function mapName(id: number): string | undefined {
  return staticAtlasMaps().find(map => map.id === id)?.n || staticMaps()[String(id)]?.zh || undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const map = find((await params).id);
  if (!map) return {};
  const path = `/db/maps/${map.id}`;
  const description = clip(mapSummary(map, mapName));
  return {
    title: `${map.n}｜怪物、NPC、傳送門`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${map.n}｜楓谷幫手`, description, url: path },
  };
}

const chipClass =
  "inline-flex min-h-6 items-center rounded-full border border-[color:var(--paper-edge)] px-2.5 text-xs font-extrabold";

export default async function Page({ params }: Props) {
  const map = find((await params).id);
  if (!map) notFound();
  const path = `/db/maps/${map.id}`;
  const summary = mapSummary(map, mapName);
  const mapPages = new Set(staticAtlasIndex().maps);
  const npcInfo = new Map(staticNpcs().map(npc => [npc.id, npc]));
  const version = staticMapRenders()[String(map.id)];

  const levels = levelRange(map.mobs);
  const retName = map.ret && map.ret !== map.id ? mapName(map.ret) : undefined;
  const place = mapSection(map);

  const npcs = map.npcs.map(npc => {
    const info = npcInfo.get(npc.id);
    // 過期的活動店不算（NPC 頁「賣什麼」那張卡也藏掉了）
    const selling = info ? openShopCount(info) : 0;
    const note = info?.quests?.length
      ? `有 ${info.quests.length} 個任務`
      : selling
        ? `賣 ${selling} 樣東西`
        : undefined;
    return { id: npc.id, n: npc.n, img: Boolean(info?.img), note };
  });
  const doors = doorList(map.doors).map(door => ({
    to: door.to,
    n: door.n,
    href: mapPages.has(door.to) ? `/db/maps/${door.to}` : `/go?to=${door.to}`,
  }));

  return (
    <SeoPage
      trail={[{ name: "查資料・地圖", path: "/db/maps" }, { name: map.n, path }]}
      kicker={place || undefined}
      title={map.n}
      chips={
        <>
          {levels ? <span className={`${chipClass} ink-soft`}>怪物 {levels}</span> : null}
          {retName ? <span className={`${chipClass} ink-soft`}>回城：{retName}</span> : null}
          <Link href={`/go?to=${map.id}`} className={`${chipClass} tap-safe text-[color:var(--maple)] hover:border-[color:var(--maple)]`}>
            帶我去
          </Link>
        </>
      }
      lead={summary}
      jsonLd={[
        breadcrumbLd([{ name: "地圖", path: "/db/maps" }, { name: map.n, path }]),
        webPageLd({ name: `${map.n}｜地圖資料`, path, description: clip(summary), modified: staticModified() }),
      ]}
    >
      {/* 沒有畫面圖（抓圖失敗）或沒有範圍就整張卡不放，只留清單 */}
      {version && map.b ? (
        <AtlasCard title="地圖畫面">
          <MapView map={map as AtlasMap & { b: [number, number, number, number] }} src={`${mapRenderImage(map.id)}?v=${version}`} />
        </AtlasCard>
      ) : null}

      {map.mobs.length ? (
        <AtlasCard title="怪物" sub="全部打完就是這麼多隻">
          <MobRows mobs={map.mobs} />
        </AtlasCard>
      ) : null}

      {npcs.length ? (
        <AtlasCard title="NPC">
          <NpcRows npcs={npcs} />
        </AtlasCard>
      ) : null}

      {doors.length ? (
        <AtlasCard title="門通往">
          <DoorRows doors={doors} />
        </AtlasCard>
      ) : null}
    </SeoPage>
  );
}
