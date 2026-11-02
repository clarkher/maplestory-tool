import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuestDetailBody } from "@/components/QuestDetailBody";
import { SeoLinks, SeoPage, SeoSection } from "@/components/SeoPage";
import { jobLabel } from "@/lib/item-view";
import { npcHref } from "@/lib/atlas-view";
import { breadcrumbLd, clip, questSummary, webPageLd } from "@/lib/seo";
import { staticAtlasIndex, staticMaps, staticModified, staticMonsters, staticQuests } from "@/lib/static-data";
import type { MapRecord, Quest } from "@/lib/types";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const quest = find((await params).id);
  if (!quest) return {};
  const path = `/db/quests/${quest.id}`;
  const description = clip(questSummary(quest));
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
    [...(quest.pre ?? []), ...(quest.next ? [quest.next] : [])].flatMap(id => {
      const found = all.find(other => other.id === id);
      return found ? [[id, found.n] as [string, string]] : [];
    }),
  );
  const monsterIds = new Set(staticMonsters().map(monster => monster.id));
  const mobs = (quest.needMobs ?? []).filter(mob => monsterIds.has(mob.id));
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
      {jobs ? <p className="text-sm"><span className="ink-faint">可接職業：</span>{jobs}</p> : null}
      {npcLinks.length ? (
        <SeoSection title="接任務、回報的 NPC">
          <SeoLinks links={npcLinks} />
        </SeoSection>
      ) : null}
      <QuestDetailBody quest={quest} maps={mapsFor(quest, staticMaps())} questNames={questNames} npcPages={npcPages} />
      {mobs.length ? (
        <SeoSection title="要打的怪">
          <SeoLinks links={mobs.map(mob => ({ href: `/db/monsters/${mob.id}`, text: mob.n, note: mob.c ? `${mob.c} 隻` : undefined }))} />
        </SeoSection>
      ) : null}
    </SeoPage>
  );
}
