import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuestDetailBody } from "@/components/QuestDetailBody";
import { SeoLinks, SeoPage, SeoSection } from "@/components/SeoPage";
import { jobLabel } from "@/lib/item-view";
import { QuestSteps } from "@/components/QuestSteps";
import { mapRoute, npcHref } from "@/lib/atlas-view";
import { coveredBlocks, questLevel, questSteps } from "@/lib/quest-steps";
import { breadcrumbLd, clip, questSummary, webPageLd } from "@/lib/seo";
import {
  staticAtlasIndex,
  staticHasItemPage,
  staticMaps,
  staticModified,
  staticQuests,
  staticQuestStepContext,
} from "@/lib/static-data";
import type { MapRecord, Quest } from "@/lib/types";

const DESCRIPTION_MAX = 150;

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticQuests().map(quest => ({ id: quest.id }));
}

function find(id: string) {
  return staticQuests().find(quest => quest.id === decodeURIComponent(id));
}

/** 任務卡只用得到它提到的地圖：整份地圖檔 460KB，不整包塞進頁面 */
function mapsFor(quest: Quest, maps: Record<string, MapRecord>): Record<string, MapRecord> {
  const ids = [quest.sNpc, quest.eNpc, ...(quest.npcs ?? [])].flatMap(npc => (npc?.map ? [String(npc.map)] : []));
  return Object.fromEntries(ids.filter(id => maps[id]).map(id => [id, maps[id]]));
}

/** 可接職業：不限職業不寫；[0] 是初心者 */
function jobsText(quest: Quest): string | null {
  if (!quest.jobs?.length) return null;
  const names = [...new Set(quest.jobs.map(job => jobLabel(job)).filter((name): name is string => Boolean(name)))];
  return names.length ? names.join("、") : null;
}

/** 搜尋結果那段話：摘要放得下（150 字）就補從最近城鎮怎麼走到接任務的地方；49 等以下不推傑夫後面 */
function descriptionText(quest: Quest): string {
  const summary = questSummary(quest);
  const map = quest.sNpc?.map;
  if (!map) return summary;
  const ctx = staticQuestStepContext();
  const route = mapRoute(map, ctx.graph, ctx.maps, ctx.nearestTown, questLevel(quest));
  // 要過傑夫的路線得補「參考舊版資料」，搜尋結果那段放不下，就不放
  if (!route || route.gate) return summary;
  const withRoute = `${summary}${route.text}`;
  return withRoute.length <= DESCRIPTION_MAX ? withRoute : summary;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quest = find((await params).id);
  if (!quest) return {};
  const path = `/db/quests/${quest.id}`;
  const description = clip(descriptionText(quest));
  return {
    title: `${quest.n}｜任務攻略：怎麼接、要做什麼、獎勵`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${quest.n}｜楓谷幫手`, description, url: path },
  };
}

export default async function Page({ params }: Props) {
  const quest = find((await params).id);
  if (!quest) notFound();
  const all = staticQuests();
  const path = `/db/quests/${quest.id}`;
  const summary = questSummary(quest);
  const questNames = new Map(
    [...(quest.pre ?? []), ...(quest.preNot ?? []), ...(quest.next ? [quest.next] : [])].flatMap(id => {
      const found = all.find(other => other.id === id);
      return found ? [[id, found.n] as [string, string]] : [];
    }),
  );
  const steps = questSteps(quest, staticQuestStepContext());
  const jobs = jobsText(quest);
  // 接任務、回報、還會碰到的 NPC：有 NPC 頁的才連過去（頁面只帶這個任務用得到的 id）
  const atlasIndex = staticAtlasIndex();
  // 接、回報同一個人併成一個（「接任務、回報」）
  const sameNpc = quest.sNpc && quest.eNpc && quest.sNpc.id === quest.eNpc.id;
  const npcLinks = [
    ...(quest.sNpc ? [{ npc: quest.sNpc, note: sameNpc ? "接任務、回報" : "接任務" }] : []),
    ...(quest.eNpc && !sameNpc ? [{ npc: quest.eNpc, note: "回報" }] : []),
  ].flatMap(({ npc, note }) => {
    const href = npcHref(npc.id, atlasIndex);
    return href ? [{ href, text: npc.n, note }] : [];
  });
  const npcPages = (quest.npcs ?? []).map(npc => npc.id).filter(id => npcHref(id, atlasIndex));
  // 卡片上的道具：有單獨頁的才連過去（頁面只帶這個任務用得到的 id）
  const itemPages = [...new Set(
    [quest.startItems, quest.startNone, quest.needItems, quest.rewardItems, quest.startGiven].flatMap(rows => rows ?? []).map(row => row.id),
  )].filter(staticHasItemPage);

  return (
    <SeoPage
      trail={[{ name: "查資料・任務", path: "/db/quests" }, { name: quest.n, path }]}
      title={quest.n}
      lead={summary}
      toolHref={`/db/quests?id=${quest.id}`}
      toolLabel="在查資料裡看（可打勾、帶路）"
      jsonLd={[
        breadcrumbLd([{ name: "任務", path: "/db/quests" }, { name: quest.n, path }]),
        webPageLd({ name: `${quest.n}｜任務攻略`, path, description: clip(summary), modified: staticModified() }),
      ]}
    >
      <QuestSteps steps={steps} />
      {jobs ? <p className="text-sm"><span className="ink-faint">可接職業：</span>{jobs}</p> : null}
      {npcLinks.length ? (
        <SeoSection title="接任務、回報的 NPC">
          <SeoLinks links={npcLinks} />
        </SeoSection>
      ) : null}
      {/* 上面的步驟已經寫了的區塊（要打的怪、要交的東西、完成後拿到）不再列；任務對話照留 */}
      <QuestDetailBody
        quest={quest}
        maps={mapsFor(quest, staticMaps())}
        questNames={questNames}
        npcPages={npcPages}
        itemPages={itemPages}
        hide={coveredBlocks(quest, steps)}
      />
    </SeoPage>
  );
}
