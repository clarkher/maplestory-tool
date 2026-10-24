/**
 * 拍賣買齊就能交的任務（/plan/buy，v1.13；v1.14 全優化）：buy-quests.json 的任務編號跟 quests.json 合成卡片。
 * 哪些任務算是建置時決定的（pipeline/lib/buy-quests.mjs）；這裡排序、篩選、挑店、算整條線。
 */
import { formatNumber } from "./format";
import { isDevQuest, jobLineage, questEligible } from "./planner";
import type { BuyQuestData, Profile, Quest, QuestRef, QuestReward, ShopRow } from "./types";

/** 單一道具要這麼多個以上，卡片提醒拍賣可能要分幾次才買得齊 */
export const BIG_AMOUNT = 200;

export type BuyQuestOptions = {
  /** 只看這個角色現在接得到的（questEligible：等級、職業、楓之島） */
  eligible?: Profile;
  /** 按過「我做完了」的：「只看接得到的」不列；整串前置裡不算 */
  done?: ReadonlySet<string>;
  /** 只留「前面也不用打怪」的：整串前置都是交拍賣買得到的、或只找人對話 */
  noFightChain?: boolean;
  /** 地區（quest.cat），空字串或沒給＝全部 */
  region?: string;
  /** 職業代碼：給了就只列這個職業拿得到的職業限定獎勵 */
  job?: number;
  /** 「帶我去」記的起點城鎮（地圖編號），跟 townOf 一起給才會優先挑起點的店 */
  startTown?: number;
  /** 地圖 → 所在城鎮（nearest-town.json） */
  townOf?: (mapId: number) => number | undefined;
};

/** 連前面一起做：還沒做完的段數（含自己）、合計經驗、合計要交（同一道具相加，照第一次出現的順序） */
export type BuyQuestChain = { steps: number; exp: number; items: QuestRef[] };

export type BuyQuestRow = {
  quest: Quest;
  /** 前置任務（站上查得到的）：卡片寫「要先做」 */
  pre: Quest[];
  /** 要交的道具裡 NPC 商店有賣的：道具編號 → 挑出來那家（起點城鎮優先，否則最便宜） */
  shops: Map<number, ShopRow>;
  /** 挑出來的店就在起點城鎮的道具 */
  shopNear: Set<number>;
  /** 完成後學會的技能名（站上查得到的，照任務原本的順序、不重複） */
  skills: string[];
  /** 獎勵道具：職業限定的只留這個職業拿得到的；上游沒名字的換成「名字不明的卷軸」 */
  rewards: QuestReward[];
  /** 有前置、而且整串都不用打怪時才有 */
  chain?: BuyQuestChain;
  /** 整串前置（沒做完的）都不用打怪 */
  noFight: boolean;
  /** 要交的東西全部 NPC 商店都有賣時，照挑出來的店加總的楓幣 */
  shopTotal?: number;
  /** 有單一道具要 BIG_AMOUNT 個以上 */
  big: boolean;
};

const unitPrice = (shop: ShopRow) => shop.pr / (shop.k ?? 1);

/** 一個最便宜的店（整組賣的除以組數比）；一樣便宜取先列的 */
export function cheapestShop(rows?: ShopRow[]): ShopRow | undefined {
  let best: ShopRow | undefined;
  for (const row of rows ?? []) if (!best || unitPrice(row) < unitPrice(best)) best = row;
  return best;
}

/** 起點城鎮有賣就挑那裡最便宜的一家；沒有起點、或起點沒賣，挑全部裡最便宜的 */
export function pickShop(rows?: ShopRow[], startTown?: number, townOf?: (mapId: number) => number | undefined): ShopRow | undefined {
  if (startTown && townOf) {
    const near = (rows ?? []).filter(row => row.m !== undefined && townOf(row.m) === startTown);
    if (near.length) return cheapestShop(near);
  }
  return cheapestShop(rows);
}

/** 「每個 1,200 楓幣（雜貨商人 · 弓箭手村雜貨店）」；整組賣的寫「2,000 個 1,400 楓幣」 */
export function shopLine(shop: ShopRow): string {
  const price = shop.k ? `${formatNumber(shop.k)} 個 ${formatNumber(shop.pr)} 楓幣` : `每個 ${formatNumber(shop.pr)} 楓幣`;
  return `${price}（${[shop.n, shop.p].filter(Boolean).join(" · ")}）`;
}

/** 要交的東西全部有挑到店才加總（四捨五入到整數）；沒有要交的、或有一樣沒賣，回 undefined */
export function npcShopTotal(needItems: QuestRef[], shops: ReadonlyMap<number, ShopRow>): number | undefined {
  if (!needItems.length || needItems.some(item => !shops.has(item.id))) return undefined;
  return Math.round(needItems.reduce((sum, item) => sum + unitPrice(shops.get(item.id)!) * (item.c ?? 1), 0));
}

/**
 * 上游任務獎勵的 job 碼是位元：第 0 位初心者、第 1 位劍士、2 法師、3 弓箭手、4 盜賊、5 海盜
 * （再上面幾位是皇家騎士團、狂狼勇士那幾系，經典版沒有）。2026-10-24 對過：酋長蓋房子的劍士卷軸 2099202、法師 4100、弓 8200、盜賊 16400、海盜 32800。
 * 沒有碼、沒選職業（-1）、不認得的職業都當拿得到。
 */
export function rewardFitsJob(mask: number | undefined, job: number): boolean {
  if (!mask || job < 0) return true;
  const branch = Math.floor(job / 100);
  if (branch > 5) return true;
  return (mask & (1 << branch)) !== 0;
}

/** 上游沒名字的道具寫成「未命名道具 2040516」：卷軸（2040000–2049999）寫「名字不明的卷軸」，其他寫「名字不明的道具」，不編名字 */
export function displayItemName(item: Pick<QuestRef, "id" | "n">): string {
  if (!item.n.startsWith("未命名道具")) return item.n;
  return item.id >= 2040000 && item.id <= 2049999 ? "名字不明的卷軸" : "名字不明的道具";
}

const renamed = <T extends QuestRef>(item: T): T => {
  const n = displayItemName(item);
  return n === item.n ? item : { ...item, n };
};

/** 這一段能不能不打怪做完：不用打怪，而且要交的東西都在拍賣買得到（在清單裡）或根本不用交（只找人對話） */
function noFightStep(quest: Quest, buySet: ReadonlySet<string>): boolean {
  if (quest.needMobs?.length) return false;
  return !quest.needItems?.length || buySet.has(quest.id);
}

/**
 * 從第一段做到這段要做的任務，照要做的順序（前面的在前，最後是自己）。前置有好幾個時每一個都要。
 * 按過「我做完了」的前置不算、也不往前找；有一段要打怪、要交拍賣買不到的、或站上查不到，回 undefined。
 */
export function chainSteps(quest: Quest, byId: ReadonlyMap<string, Quest>, buySet: ReadonlySet<string>, done: ReadonlySet<string>): Quest[] | undefined {
  const order: Quest[] = [];
  const seen = new Set<string>();
  const visit = (current: Quest): boolean => {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    for (const id of current.pre ?? []) {
      if (done.has(id)) continue;
      const pre = byId.get(id);
      if (!pre || !noFightStep(pre, buySet) || !visit(pre)) return false;
    }
    order.push(current);
    return true;
  };
  return visit(quest) ? order : undefined;
}

function chainSummary(steps: Quest[]): BuyQuestChain | undefined {
  if (steps.length < 2) return undefined;
  const totals = new Map<number, QuestRef>();
  for (const step of steps) {
    for (const item of step.needItems ?? []) {
      const before = totals.get(item.id);
      totals.set(item.id, { id: item.id, n: displayItemName(item), c: (before?.c ?? 0) + (item.c ?? 1) });
    }
  }
  return { steps: steps.length, exp: steps.reduce((sum, step) => sum + (step.exp ?? 0), 0), items: [...totals.values()] };
}

/** 下拉選單的地區：清單裡有的 quest.cat，照名字排（跟任務圖鑑一樣） */
export function buyQuestRegions(data: BuyQuestData, quests: Quest[]): string[] {
  const listed = new Set(data.quests);
  return [...new Set(quests.filter(quest => listed.has(quest.id) && !isDevQuest(quest) && quest.cat).map(quest => quest.cat))].sort();
}

/**
 * 經驗高的在前，一樣多的需求等級低的在前；經驗一樣、需求等級也一樣時照任務編號，同一條任務線就會照順序。
 * eligible 給了就只留這個角色現在接得到、沒按過「我做完了」的；前置做了沒不擋，卡片寫「要先做」。
 */
export function buyQuestRows(data: BuyQuestData, quests: Quest[], options: BuyQuestOptions = {}): BuyQuestRow[] {
  const { eligible, done = new Set<string>(), noFightChain, region, job, startTown, townOf } = options;
  const byId = new Map(quests.map(quest => [quest.id, quest]));
  const buySet = new Set(data.quests);
  const lineage = eligible ? new Set(jobLineage(eligible.job)) : undefined;
  return data.quests
    .map(id => byId.get(id))
    .filter((quest): quest is Quest => quest !== undefined)
    .filter(quest => !isDevQuest(quest))
    .filter(quest => !region || quest.cat === region)
    .filter(quest => !eligible || (questEligible(quest, eligible, lineage) && !done.has(quest.id)))
    .map((quest): BuyQuestRow => {
      const shops = new Map<number, ShopRow>();
      const shopNear = new Set<number>();
      for (const item of quest.needItems ?? []) {
        const shop = pickShop(data.shops[item.id], startTown, townOf);
        if (!shop) continue;
        shops.set(item.id, shop);
        if (startTown && townOf && shop.m !== undefined && townOf(shop.m) === startTown) shopNear.add(item.id);
      }
      const steps = chainSteps(quest, byId, buySet, done);
      return {
        quest,
        pre: (quest.pre ?? []).map(id => byId.get(id)).filter((pre): pre is Quest => Boolean(pre)),
        shops,
        shopNear,
        // 舊版 buy-quests.json 沒有 skills 欄位：不要因為這樣整頁掛掉，當作沒有技能
        skills: [...new Set((quest.rewardSkills ?? []).flatMap(id => (data.skills?.[id] ? [data.skills[id]] : [])))],
        rewards: (quest.rewardItems ?? []).filter(item => job === undefined || rewardFitsJob(item.job, job)).map(renamed),
        chain: steps ? chainSummary(steps) : undefined,
        noFight: Boolean(steps),
        shopTotal: npcShopTotal(quest.needItems ?? [], shops),
        big: (quest.needItems ?? []).some(item => (item.c ?? 1) >= BIG_AMOUNT),
      };
    })
    .filter(row => !noFightChain || row.noFight)
    .sort(
      (a, b) =>
        (b.quest.exp ?? 0) - (a.quest.exp ?? 0) ||
        (a.quest.minLv ?? 0) - (b.quest.minLv ?? 0) ||
        Number(a.quest.id) - Number(b.quest.id),
    );
}
