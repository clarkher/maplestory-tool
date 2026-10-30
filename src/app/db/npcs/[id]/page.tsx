import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenUntil } from "@/components/atlas/OpenUntil";
import { AtlasCard, PlaceRows, QuestRows, ShopRows } from "@/components/atlas/rows";
import { SeoPage } from "@/components/SeoPage";
import { npcImage } from "@/lib/asset-paths";
import { npcSummary, shopRows } from "@/lib/atlas-view";
import { breadcrumbLd, clip, webPageLd } from "@/lib/seo";
import { staticAtlasMaps, staticItemNames, staticModified, staticNpcs } from "@/lib/static-data";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticNpcs().map(npc => ({ id: String(npc.id) }));
}

function find(id: string) {
  return staticNpcs().find(npc => String(npc.id) === id);
}

function atlasMap(id: number) {
  return staticAtlasMaps().find(map => map.id === id);
}

const mapName = (id: number) => atlasMap(id)?.n;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const npc = find((await params).id);
  if (!npc) return {};
  const path = `/db/npcs/${npc.id}`;
  const description = clip(npcSummary(npc, mapName));
  return {
    title: `${npc.n}｜在哪、賣什麼、任務`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${npc.n}｜楓谷幫手`, description, url: path },
  };
}

const chipClass =
  "inline-flex min-h-6 items-center rounded-full border border-[color:var(--paper-edge)] px-2.5 text-xs font-extrabold";

export default async function Page({ params }: Props) {
  const npc = find((await params).id);
  if (!npc) notFound();
  const path = `/db/npcs/${npc.id}`;
  const summary = npcSummary(npc, mapName);
  const itemNames = staticItemNames();

  const places = npc.maps.flatMap(id => {
    const map = atlasMap(id);
    if (!map) return [];
    const sub = [map.rg, map.st].filter(Boolean).join("・");
    return [{ id: map.id, n: map.n, sub: sub || undefined }];
  });
  const lines = shopRows(npc.shop);
  const shopCard = lines.length ? (
    <AtlasCard title="賣什麼" sub={`共 ${lines.length} 樣・參考舊版資料，價格以遊戲裡為準`}>
      <ShopRows lines={lines} nameOf={id => itemNames.get(id) ?? `道具 ${id}`} />
    </AtlasCard>
  ) : null;
  // 整家都是活動店（行商人、祭典管理員）：最後一樣也過期了，整張卡在瀏覽器裡收掉，不會剩一個空的「賣什麼」
  const lastEnd = lines.length && lines.every(line => line.e) ? lines.map(line => line.e!).sort().at(-1) : undefined;

  return (
    <SeoPage
      trail={[{ name: "查資料・NPC", path: "/db/npcs" }, { name: npc.n, path }]}
      kicker="NPC"
      title={npc.n}
      image={npc.img ? npcImage(npc.id) : undefined}
      imageSize={84}
      chips={
        npc.maps.length ? (
          <Link href={`/go?to=${npc.maps[0]}`} className={`${chipClass} tap-safe text-[color:var(--maple)] hover:border-[color:var(--maple)]`}>
            帶我去
          </Link>
        ) : undefined
      }
      lead={summary}
      jsonLd={[
        breadcrumbLd([{ name: "NPC", path: "/db/npcs" }, { name: npc.n, path }]),
        webPageLd({ name: `${npc.n}｜NPC 資料`, path, description: clip(summary), modified: staticModified() }),
      ]}
    >
      {places.length ? (
        <AtlasCard title="在哪">
          <PlaceRows places={places} />
        </AtlasCard>
      ) : null}

      {shopCard && lastEnd ? <OpenUntil end={lastEnd}>{shopCard}</OpenUntil> : shopCard}

      <AtlasCard title="任務">
        {npc.quests?.length ? (
          <QuestRows quests={npc.quests} />
        ) : (
          <p className="text-sm ink-soft">這個 NPC 沒有任務</p>
        )}
      </AtlasCard>
    </SeoPage>
  );
}
