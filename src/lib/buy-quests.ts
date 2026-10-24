/**
 * 拍賣買齊就能交的任務（/plan/buy，v1.13）：buy-quests.json 的任務編號跟 quests.json 合成卡片。
 * 哪些任務算是建置時決定的（pipeline/lib/buy-quests.mjs）；這裡排序、篩接得到的、挑最便宜的店。
 */
import { formatNumber } from "./format";
import { isDevQuest, jobLineage, questEligible } from "./planner";
import type { BuyQuestData, Profile, Quest, ShopRow } from "./types";

export type BuyQuestRow = {
  quest: Quest;
  /** 前置任務（站上查得到的）：卡片寫「要先做」 */
  pre: Quest[];
  /** 要交的道具裡 NPC 商店有賣的：道具編號 → 最便宜那家 */
  shops: Map<number, ShopRow>;
  /** 完成後學會的技能名（站上查得到的，照任務原本的順序、不重複） */
  skills: string[];
};

const unitPrice = (shop: ShopRow) => shop.pr / (shop.k ?? 1);

/** 一個最便宜的店（整組賣的除以組數比）；一樣便宜取先列的 */
export function cheapestShop(rows?: ShopRow[]): ShopRow | undefined {
  let best: ShopRow | undefined;
  for (const row of rows ?? []) if (!best || unitPrice(row) < unitPrice(best)) best = row;
  return best;
}

/** 「每個 1,200 楓幣（雜貨商人 · 弓箭手村雜貨店）」；整組賣的寫「2,000 個 1,400 楓幣」 */
export function shopLine(shop: ShopRow): string {
  const price = shop.k ? `${formatNumber(shop.k)} 個 ${formatNumber(shop.pr)} 楓幣` : `每個 ${formatNumber(shop.pr)} 楓幣`;
  return `${price}（${[shop.n, shop.p].filter(Boolean).join(" · ")}）`;
}

/**
 * 經驗高的在前，一樣多的需求等級低的在前；經驗一樣、需求等級也一樣時照任務編號，同一條任務線就會照順序。
 * eligible 給了就只留這個角色現在接得到（questEligible：等級、職業、楓之島）、沒按過「我做完了」的；前置做了沒不擋，卡片寫「要先做」。
 */
export function buyQuestRows(
  data: BuyQuestData,
  quests: Quest[],
  eligible?: { profile: Profile; done: ReadonlySet<string> },
): BuyQuestRow[] {
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const lineage = eligible ? new Set(jobLineage(eligible.profile.job)) : undefined;
  return data.quests
    .map(id => byId.get(id))
    .filter((quest): quest is Quest => Boolean(quest) && !isDevQuest(quest!))
    .filter(quest => !eligible || (questEligible(quest, eligible.profile, lineage) && !eligible.done.has(quest.id)))
    .map(quest => ({
      quest,
      pre: (quest.pre ?? []).map(id => byId.get(id)).filter((pre): pre is Quest => Boolean(pre)),
      shops: new Map(
        (quest.needItems ?? []).flatMap(row => {
          const shop = cheapestShop(data.shops[row.id]);
          return shop ? [[row.id, shop] as [number, ShopRow]] : [];
        }),
      ),
      // 舊版 buy-quests.json 沒有 skills 欄位：不要因為這樣整頁掛掉，當作沒有技能
      skills: [...new Set((quest.rewardSkills ?? []).flatMap(id => (data.skills?.[id] ? [data.skills[id]] : [])))],
    }))
    .sort(
      (a, b) =>
        (b.quest.exp ?? 0) - (a.quest.exp ?? 0) ||
        (a.quest.minLv ?? 0) - (b.quest.minLv ?? 0) ||
        Number(a.quest.id) - Number(b.quest.id),
    );
}
