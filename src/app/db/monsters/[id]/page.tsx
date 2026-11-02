import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLinks, SeoPage, SeoSection, SeoStats } from "@/components/SeoPage";
import { mapHref } from "@/lib/atlas-view";
import { monsterImage } from "@/lib/asset-paths";
import { elementalNotes, formatNumber } from "@/lib/format";
import { monsterMaps } from "@/lib/monster-view";
import { breadcrumbLd, clip, monsterSummary, webPageLd } from "@/lib/seo";
import { staticAtlasIndex, staticItemNames, staticMaps, staticModified, staticMonsters, staticQuests } from "@/lib/static-data";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticMonsters().map(monster => ({ id: String(monster.id) }));
}

function find(id: string) {
  return staticMonsters().find(monster => String(monster.id) === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const monster = find((await params).id);
  if (!monster) return {};
  const path = `/db/monsters/${monster.id}`;
  const description = clip(monsterSummary(monster, staticMaps()));
  return {
    title: `${monster.n}｜怪物數值、出沒地圖、掉落物`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${monster.n}｜楓谷幫手`, description, url: path },
  };
}

export default async function Page({ params }: Props) {
  const monster = find((await params).id);
  if (!monster) notFound();
  const maps = staticMaps();
  const atlasIndex = staticAtlasIndex();
  const itemNames = staticItemNames();
  const path = `/db/monsters/${monster.id}`;
  const summary = monsterSummary(monster, maps);
  const { rows: mapRows } = monsterMaps(monster, maps);
  const drops = monster.drops.filter(id => itemNames.has(id));
  const elements = elementalNotes(monster.el);
  // 要打這隻怪的任務
  const quests = staticQuests().filter(quest => quest.needMobs?.some(mob => mob.id === monster.id));

  return (
    <SeoPage
      trail={[{ name: "查資料・怪物", path: "/db/monsters" }, { name: monster.n, path }]}
      title={monster.n}
      lead={summary}
      image={monsterImage(monster.id)}
      toolHref={`/db/monsters?id=${monster.id}`}
      toolLabel="在查資料裡看（可直接帶路）"
      jsonLd={[
        breadcrumbLd([{ name: "怪物", path: "/db/monsters" }, { name: monster.n, path }]),
        webPageLd({ name: `${monster.n}｜怪物資料`, path, description: clip(summary), modified: staticModified() }),
      ]}
    >
      <SeoStats
        rows={[
          ["等級", monster.lv ?? "—"],
          ["HP", formatNumber(monster.hp)],
          ["經驗", formatNumber(monster.exp)],
          ["物理攻擊", monster.pad],
          ["物理防禦", monster.pdd],
          ["魔法攻擊", monster.mad],
          ["魔法防禦", monster.mdd],
          ["命中", monster.acc],
          ["迴避", monster.eva],
          ["移動速度", monster.spd],
          ["不死", monster.und ? "是" : "否"],
        ]}
      />

      {elements.length ? (
        <SeoSection title="屬性抗性">
          <p className="text-sm">{elements.map(element => `${element.element}${element.text}`).join("、")}</p>
        </SeoSection>
      ) : null}

      {mapRows.length ? (
        <SeoSection title={`出沒地圖（${mapRows.length} 張）`}>
          <SeoLinks
            links={mapRows.map(row => ({
              // 有地圖頁連地圖頁（頁上有帶我去），沒有照舊連帶路
              href: mapHref(row.id, atlasIndex),
              text: maps[String(row.id)].zh,
              note: row.spawns ? `${row.spawns} 個刷怪點` : undefined,
            }))}
          />
        </SeoSection>
      ) : null}

      {drops.length ? (
        <SeoSection title={`掉落物（${drops.length} 樣，官方未公開機率）`}>
          <SeoLinks links={drops.map(id => ({ href: `/db/items?id=${id}`, text: itemNames.get(id)! }))} />
        </SeoSection>
      ) : null}

      {quests.length ? (
        <SeoSection title="要打這隻怪的任務">
          <SeoLinks links={quests.map(quest => ({ href: `/db/quests/${quest.id}`, text: quest.n }))} />
        </SeoSection>
      ) : null}
    </SeoPage>
  );
}
