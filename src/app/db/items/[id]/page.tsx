import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLinks, SeoPage, SeoSection, SeoStats } from "@/components/SeoPage";
import { itemImage } from "@/lib/asset-paths";
import { itemPagePath, itemPageTitle, itemSummary } from "@/lib/item-page";
import { equipGroups, itemDescText, shopGroups } from "@/lib/item-view";
import { breadcrumbLd, clip, OG_BASE, webPageLd } from "@/lib/seo";
import { staticItemPageLookup, staticItemPages, staticModified } from "@/lib/static-data";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticItemPages().map(item => ({ id: String(item.id) }));
}

function find(id: string) {
  return staticItemPages().find(item => String(item.id) === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = find((await params).id);
  if (!item) return {};
  const path = itemPagePath(item.id);
  const description = clip(itemSummary(item, staticItemPageLookup()));
  return {
    title: itemPageTitle(item),
    description,
    alternates: { canonical: path },
    openGraph: { ...OG_BASE, title: `${item.n}｜楓谷幫手`, description, url: path },
  };
}

export default async function Page({ params }: Props) {
  const item = find((await params).id);
  if (!item) notFound();
  const lookup = staticItemPageLookup();
  const path = itemPagePath(item.id);
  const summary = itemSummary(item, lookup);
  const { requirements, stats } = equipGroups(item);
  const itemText = itemDescText(item.d);
  const shops = shopGroups(item);
  const questLinks = (ids: string[] | undefined) =>
    (ids ?? []).flatMap(id => {
      const text = lookup.quest(id);
      return text ? [{ href: `/db/quests/${encodeURIComponent(id)}`, text }] : [];
    });
  const drops = (item.dm ?? []).flatMap(id => {
    const text = lookup.monster(id);
    return text ? [{ href: `/db/monsters/${id}`, text }] : [];
  });
  const rewards = questLinks(item.qr);
  const needs = questLinks(item.qq);

  return (
    <SeoPage
      trail={[{ name: "查資料・道具", path: "/db/items" }, { name: item.n, path }]}
      title={item.n}
      lead={summary}
      image={itemImage(item.id)}
      // 沒有怪會掉就不放：查資料卡片給的東西這頁都有了，只剩「在查資料裡看」這種講機制的字（11/10）
      toolHref={drops.length ? `/plan/farm?want=${item.id}` : undefined}
      toolLabel={drops.length ? "排出哪張圖收最快" : undefined}
      jsonLd={[
        breadcrumbLd([{ name: "道具", path: "/db/items" }, { name: item.n, path }]),
        webPageLd({ name: `${item.n}｜道具資料`, path, description: clip(summary), modified: staticModified() }),
      ]}
    >
      {itemText ? <p className="whitespace-pre-wrap text-sm leading-relaxed ink-soft">{itemText}</p> : null}

      {requirements.length ? (
        <SeoSection title="穿戴條件">
          <SeoStats rows={requirements} />
        </SeoSection>
      ) : null}

      {stats.length ? (
        <SeoSection title="裝備數值">
          <SeoStats rows={stats} />
        </SeoSection>
      ) : null}

      {drops.length ? (
        <SeoSection title={`哪些怪會掉（${drops.length} 種，官方未公開機率）`}>
          <SeoLinks links={drops} />
        </SeoSection>
      ) : null}

      {shops.groups.length ? (
        <SeoSection title={`哪裡買得到${shops.fromOldData ? "（參考舊版資料，可能有出入）" : ""}`}>
          <ul className="space-y-1 text-sm">
            {shops.groups.map(group => (
              <li key={`${group.price}-${group.until ?? ""}`}>
                <b className="tabular-nums">{group.price}</b>
                {group.until ? `（活動限定・到 ${group.until}）` : ""}：
                {group.places.map(place => (place.npc ? `${place.place}（${place.npc}）` : place.place)).join("、")}
              </li>
            ))}
          </ul>
        </SeoSection>
      ) : null}

      {rewards.length ? (
        <SeoSection title="哪些任務會給">
          <SeoLinks links={rewards} />
        </SeoSection>
      ) : null}

      {needs.length ? (
        <SeoSection title="哪些任務要用到">
          <SeoLinks links={needs} />
        </SeoSection>
      ) : null}
    </SeoPage>
  );
}
