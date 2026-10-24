# 拍賣買齊就能交的任務：全優化（v1.14）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/plan/buy` 加上使用者 10/24 第二輪要的全部優化（12 點＋「前面也不用打怪」篩選）。

**Architecture:** 純前端。資料邏輯全放 `src/lib/buy-quests.ts`（純函式、vitest），頁面 `src/app/plan/buy/BuyQuestPlanner.tsx` 只畫；「我做完了」按鈕從任務圖鑑抽成共用元件；首頁先解清單下面加一行入口。不動建置、不動資料檔。

**Tech Stack:** Next 16 App Router、React 19、Tailwind 4、vitest。

**Spec:** 上一輪規格 `docs/superpowers/specs/2026-10-24-buy-quests-design.md`；這一輪的設計在對話裡拍板（下面「拍板」逐字列出，是這份計畫的依據）。

## 拍板（2026-10-24 第二輪，使用者回「全優化」＋「1A 2A 3A 4A」）

- 新篩選：連前置任務也不打怪——整串前置都是「交拍賣買得到的東西」或「只找人對話」的才列（實算 59 個）。按鈕名「前面也不用打怪」（1A）
- 1 整條線合計：有前置的卡多一行「連前面一起做：共 N 段，合計經驗 X」＋合計要交（只算整串都不用打怪的；按過「我做完了」的前置不算）
- 2 花多少錢：要交的東西全部 NPC 商店都有賣才寫「全部在 NPC 商店買：約 N 楓幣」（拍賣成交價不在站上，不編）
- 4 上游沒名字的道具（「未命名道具 2040516」）寫「名字不明的卷軸」（卷軸編號 2040000–2049999），其他寫「名字不明的道具」
- 5 職業限定獎勵：有填職業就只顯示這個職業拿得到的，沒填照舊全列
- 6 單一道具要 200 個以上：標「量多，拍賣可能要分幾次才買得齊」
- 7 回報 NPC 跟接任務不同人：多一格「回報」
- 8 每張卡加「我做完了」，按了不會馬上消失，下次進來才不列
- 9 地區：「全部地區」下拉選單，跟任務圖鑑同一套，排序照舊經驗高的在前（2A）
- 10 首頁「出發前，先解這 N 個任務」下面加一行「不想打怪？看拍賣買齊就能交的任務」（3A）
- 11 在「帶我去」選過起點城鎮：起點有賣就寫那家，沒有才寫最便宜的
- 12 先顯示 20 個，按「還有 N 個任務」展開，重新整理記得
- 3 個完全沒獎勵的任務照列（4A）

## Global Constraints

- user-facing 字繁體中文、不用 emoji、不用 icon set；寫完掃 emoji（含 U+2300–23FF、U+25A0–25FF）
- 不編價格：拍賣價一律不寫；商店價只用 buy-quests.json 的 shops；舊版資料標「參考舊版資料，可能有出入」
- 不改 A 壞 B：任務圖鑑的「我做完了」抽出去後外觀、行為逐字一樣（`scripts/verify-db.mjs` 的 G2 會點它）
- commit 訊息開頭 `v1.14`，結尾空一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；只 commit 不 push
- worktree 指令：vitest `node ../../../node_modules/vitest/vitest.mjs run`、tsc `node ../../../node_modules/typescript/bin/tsc --noEmit -p .`、管線測試 `node --test "pipeline/**/*.test.mjs"`

---

### Task 1: 卡片資料邏輯（`src/lib/buy-quests.ts`）

**Files:**
- Modify: `src/lib/buy-quests.ts`
- Modify: `src/lib/__tests__/buy-quests.test.ts`

**Interfaces:**
- Produces（Task 2 照名字用）：
  - `type BuyQuestOptions = { eligible?: Profile; done?: ReadonlySet<string>; noFightChain?: boolean; region?: string; job?: number; startTown?: number; townOf?: (mapId: number) => number | undefined }`
  - `type BuyQuestChain = { steps: number; exp: number; items: QuestRef[] }`
  - `type BuyQuestRow = { quest: Quest; pre: Quest[]; shops: Map<number, ShopRow>; shopNear: Set<number>; skills: string[]; rewards: QuestReward[]; chain?: BuyQuestChain; noFight: boolean; shopTotal?: number; big: boolean }`
  - `buyQuestRows(data: BuyQuestData, quests: Quest[], options?: BuyQuestOptions): BuyQuestRow[]`
  - `buyQuestRegions(data: BuyQuestData, quests: Quest[]): string[]`
  - 也 export：`cheapestShop`、`shopLine`、`pickShop`、`chainSteps`、`rewardFitsJob`、`displayItemName`、`npcShopTotal`、`BIG_AMOUNT`

- [ ] **Step 1: 改測試（先紅）** — `src/lib/__tests__/buy-quests.test.ts`

既有的「只看接得到的」那個測試改成新參數（`{ eligible: { level: 25, job: 100 }, done: new Set(["6"]) }`），import 加新函式，檔尾加：

```ts
describe("連前面一起做（整串前置）", () => {
  const byIdOf = (list: Quest[]) => new Map(list.map(quest => [quest.id, quest]));
  const talk = q("t", {});
  const buyPre = q("b", { exp: 1000, needItems: [{ id: 4000000, n: "藍寶殼", c: 10 }] });
  const fight = q("f", { needMobs: [{ id: 100100, n: "嫩寶", c: 10 }] });
  const hidden = q("h", { needItems: [{ id: 4031041, n: "休咪的錢包", c: 1 }] });
  const buySet = new Set(["b", "x", "y", "z"]);

  it("前置是只找人對話、或交拍賣買得到的：整串照要做的順序列出（前面的在前，最後是自己）", () => {
    const x = q("x", { pre: ["b"], needItems: [{ id: 4000001, n: "嫩寶殼", c: 5 }] });
    const b = { ...buyPre, pre: ["t"] };
    expect(chainSteps(x, byIdOf([x, b, talk]), buySet, new Set())!.map(quest => quest.id)).toEqual(["t", "b", "x"]);
  });
  it("前置要打怪、或要交拍賣買不到的（任務道具）、或站上查不到：回 undefined", () => {
    const y = q("y", { pre: ["f"] });
    const z = q("z", { pre: ["h"] });
    const w = q("x", { pre: ["404"] });
    expect(chainSteps(y, byIdOf([y, fight]), buySet, new Set())).toBeUndefined();
    expect(chainSteps(z, byIdOf([z, hidden]), buySet, new Set())).toBeUndefined();
    expect(chainSteps(w, byIdOf([w]), buySet, new Set())).toBeUndefined();
  });
  it("按過「我做完了」的前置不算、也不往前找（打怪的那段做完了就沒關係）", () => {
    const y = q("y", { pre: ["f"] });
    expect(chainSteps(y, byIdOf([y, fight]), buySet, new Set(["f"]))!.map(quest => quest.id)).toEqual(["y"]);
  });
  it("卡片：有前置才有 chain，段數、合計經驗、合計要交（同一個道具相加）", () => {
    const first = q("y", { exp: 2000, needItems: [{ id: 4000000, n: "藍寶殼", c: 10 }, { id: 4000001, n: "嫩寶殼", c: 3 }] });
    const second = q("z", { exp: 5000, pre: ["y"], needItems: [{ id: 4000000, n: "藍寶殼", c: 5 }] });
    const rows = buyQuestRows({ quests: ["y", "z"], shops: {}, skills: {} }, [first, second]);
    const z = rows.find(row => row.quest.id === "z")!;
    expect(z.noFight).toBe(true);
    expect(z.chain).toEqual({ steps: 2, exp: 7000, items: [{ id: 4000000, n: "藍寶殼", c: 15 }, { id: 4000001, n: "嫩寶殼", c: 3 }] });
    expect(rows.find(row => row.quest.id === "y")!.chain).toBeUndefined();
  });
  it("篩「前面也不用打怪」：前置要打怪的不列", () => {
    const ok = q("y", { exp: 10 });
    const bad = q("z", { exp: 20, pre: ["f"] });
    const rows = buyQuestRows({ quests: ["y", "z"], shops: {}, skills: {} }, [ok, bad, fight], { noFightChain: true });
    expect(rows.map(row => row.quest.id)).toEqual(["y"]);
  });
});

describe("職業限定獎勵", () => {
  it("上游 job 碼：第 1 位劍士、2 法師、3 弓箭手、4 盜賊、5 海盜、第 0 位初心者；沒有碼、沒選職業都算拿得到", () => {
    expect(rewardFitsJob(2099202, 110)).toBe(true);
    expect(rewardFitsJob(2099202, 210)).toBe(false);
    expect(rewardFitsJob(4100, 230)).toBe(true);
    expect(rewardFitsJob(8200, 320)).toBe(true);
    expect(rewardFitsJob(16400, 420)).toBe(true);
    expect(rewardFitsJob(32800, 510)).toBe(true);
    expect(rewardFitsJob(1049601, 0)).toBe(true);
    expect(rewardFitsJob(1049601, 110)).toBe(false);
    expect(rewardFitsJob(undefined, 110)).toBe(true);
    expect(rewardFitsJob(2099202, -1)).toBe(true);
  });
  it("卡片：給了職業就只留拿得到的；沒給照舊全列", () => {
    const quest = q("2034", {
      exp: 2200,
      rewardItems: [{ id: 1072001, n: "綠鬥士鞋", c: 1, job: 2099202 }, { id: 1072075, n: "白魔法鞋", c: 1, job: 4100 }, { id: 2000000, n: "紅色藥水", c: 5 }],
    });
    const data = { quests: ["2034"], shops: {}, skills: {} };
    expect(buyQuestRows(data, [quest], { job: 210 })[0].rewards.map(item => item.n)).toEqual(["白魔法鞋", "紅色藥水"]);
    expect(buyQuestRows(data, [quest])[0].rewards).toHaveLength(3);
  });
});

describe("名字、量、錢、店", () => {
  it("上游沒名字的：卷軸寫「名字不明的卷軸」，其他寫「名字不明的道具」，有名字的照舊", () => {
    expect(displayItemName({ id: 2040516, n: "未命名道具 2040516" })).toBe("名字不明的卷軸");
    expect(displayItemName({ id: 1302999, n: "未命名道具 1302999" })).toBe("名字不明的道具");
    expect(displayItemName({ id: 2040001, n: "頭盔防禦卷軸60%" })).toBe("頭盔防禦卷軸60%");
  });
  it("卡片的獎勵、要交的東西沒名字時也換掉", () => {
    const quest = q("3052", { exp: 1, needItems: [{ id: 4000000, n: "藍寶殼", c: 1 }], rewardItems: [{ id: 2040516, n: "未命名道具 2040516", c: 1, rand: 1 }] });
    const rows = buyQuestRows({ quests: ["3052"], shops: {}, skills: {} }, [quest]);
    expect(rows[0].rewards[0]).toEqual({ id: 2040516, n: "名字不明的卷軸", c: 1, rand: 1 });
  });
  it(`量多：單一道具要 ${200} 個以上才算`, () => {
    expect(BIG_AMOUNT).toBe(200);
    const rows = buyQuestRows(
      { quests: ["a", "b"], shops: {}, skills: {} },
      [q("a", { exp: 2, needItems: [{ id: 1, n: "詛咒娃娃", c: 200 }] }), q("b", { exp: 1, needItems: [{ id: 1, n: "詛咒娃娃", c: 199 }] })],
    );
    expect(rows.map(row => row.big)).toEqual([true, false]);
  });
  it("NPC 商店買齊的錢：全部都有賣才算（整組賣的除組數再乘數量）；有一樣沒賣就沒有", () => {
    const shops = new Map<number, ShopRow>([[1, { p: "弓箭手村", pr: 30 }], [2, { p: "遠端商店", pr: 1400, k: 100 }]]);
    expect(npcShopTotal([{ id: 1, n: "蘋果", c: 20 }, { id: 2, n: "箭", c: 50 }], shops)).toBe(1300);
    expect(npcShopTotal([{ id: 1, n: "蘋果", c: 20 }, { id: 3, n: "冰獨眼獸之尾巴", c: 50 }], shops)).toBeUndefined();
    expect(npcShopTotal([], shops)).toBeUndefined();
  });
  it("挑店：起點城鎮有賣就挑那家（多家取便宜的），沒有才挑最便宜的", () => {
    const far: ShopRow = { p: "弓箭手村雜貨店", m: 100000102, pr: 30 };
    const home: ShopRow = { p: "冰原雪域雜貨店", m: 211000102, pr: 40 };
    const townOf = (mapId: number) => ({ 100000102: 100000000, 211000102: 211000000 })[mapId];
    expect(pickShop([far, home], 211000000, townOf)).toBe(home);
    expect(pickShop([far, home], 104000000, townOf)).toBe(far);
    expect(pickShop([far, home])).toBe(far);
  });
  it("卡片：起點有賣的道具記在 shopNear", () => {
    const home: ShopRow = { p: "冰原雪域雜貨店", m: 211000102, pr: 40 };
    const quest = q("3100", { exp: 1, needItems: [{ id: 2010000, n: "蘋果", c: 20 }] });
    const rows = buyQuestRows({ quests: ["3100"], shops: { 2010000: [home] }, skills: {} }, [quest], {
      startTown: 211000000,
      townOf: mapId => (mapId === 211000102 ? 211000000 : undefined),
    });
    expect([...rows[0].shopNear]).toEqual([2010000]);
    expect(rows[0].shopTotal).toBe(800);
  });
});

describe("地區", () => {
  const quests = [q("1", { exp: 3, cat: "維多利亞島" }), q("2", { exp: 2, cat: "冰原雪域" }), q("3", { exp: 1, cat: "維多利亞島" })];
  const data = { quests: ["1", "2", "3"], shops: {}, skills: {} };
  it("下拉選單的選項：清單裡有的地區，照名字排", () => {
    expect(buyQuestRegions(data, quests)).toEqual(["冰原雪域", "維多利亞島"].sort());
  });
  it("選了地區只列那個地區，空字串＝全部", () => {
    expect(buyQuestRows(data, quests, { region: "維多利亞島" }).map(row => row.quest.id)).toEqual(["1", "3"]);
    expect(buyQuestRows(data, quests, { region: "" })).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/buy-quests.test.ts`
Expected: FAIL（`chainSteps` 等沒有 export、`buyQuestRows` 第三個參數格式不同）

- [ ] **Step 3: 實作** — 整個 `src/lib/buy-quests.ts` 換成：

```ts
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
```

注意：卡片上「要交的東西」也要套 `displayItemName`（Task 2 畫的時候 map），lib 的 `rewards` 已經換好。

- [ ] **Step 4: 跑測試確認通過＋型別**

Run: `node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/buy-quests.test.ts && node ../../../node_modules/typescript/bin/tsc --noEmit -p .`
Expected: 全 PASS。tsc 會在 `src/app/plan/buy/BuyQuestPlanner.tsx` 報第三個參數格式不同——**這一步只改那一行讓型別過**：`buyQuestRows(data, quests, eligibleOn ? { eligible: profile, done } : { done })`，畫面其他的留給 Task 2。

- [ ] **Step 5: 全套測試＋Commit**

Run: `node --test "pipeline/**/*.test.mjs" && node ../../../node_modules/vitest/vitest.mjs run`

```bash
git add src/lib/buy-quests.ts src/lib/__tests__/buy-quests.test.ts src/app/plan/buy/BuyQuestPlanner.tsx
git commit -m "v1.14 (1/2): 拍賣買齊任務的卡片資料——整條線合計、前面也不用打怪、職業限定獎勵、NPC 商店總價、起點的店、地區"
```

---

### Task 2: 畫面、「我做完了」共用、首頁入口、README

**Files:**
- Create: `src/components/DoneButton.tsx`（從 `src/app/db/quests/QuestDb.tsx` 搬出來）
- Modify: `src/app/db/quests/QuestDb.tsx`（刪掉本地的 DoneButton，改 import；`setQuestDone` 若沒別處用就從 import 拿掉）
- Create: `src/lib/go-start.ts`
- Modify: `src/app/go/GoNavigator.tsx`（`START_KEY` 改 import `GO_START_KEY`，其他不動）
- Modify: `src/app/plan/buy/BuyQuestPlanner.tsx`
- Modify: `src/components/route/TodoList.tsx`（首頁入口）
- Modify: `README.md`（v1.13 那段後面補 v1.14）

**Interfaces:**
- Consumes: Task 1 的 `buyQuestRows`、`buyQuestRegions`、`displayItemName`、`shopLine`、`BuyQuestRow`、`BuyQuestOptions`；`loadNearestTown()`（`src/lib/data.ts`，回 `Record<string, [number, number]>`＝地圖 → [城鎮, 步數]）；`useVisitState`（`src/lib/visit-state.ts`）
- Produces: `DoneButton({ id, onToggle? })`、`GO_START_KEY`、`readGoStart(): number | null`

- [ ] **Step 1: `src/components/DoneButton.tsx`**

```tsx
"use client";

import { setQuestDone, useDoneQuests } from "@/lib/done-quests";

/**
 * 「我做完了」：點一下記成做完了（記在這台裝置的瀏覽器），按鈕變楓葉綠底白字「做完了」，再點一下取消。
 * 大小跟篩選標籤（FilterTag）一樣，高 36px 的膠囊。任務圖鑑的任務卡、拍賣買齊就能交的任務（/plan/buy）的卡片用；首頁用的 QuestDetailBody 不放。
 * onToggle：按下去之後通知頁面（/plan/buy 拿來讓剛按的那張先留在畫面上）。
 */
export function DoneButton({ id, onToggle }: { id: string; onToggle?: (id: string, done: boolean) => void }) {
  const done = useDoneQuests().has(id);
  return (
    <button
      type="button"
      aria-pressed={done}
      onClick={() => {
        setQuestDone(id, !done);
        onToggle?.(id, !done);
      }}
      className={[
        "inline-flex min-h-9 shrink-0 touch-manipulation items-center whitespace-nowrap rounded-full border px-[11px] text-[13px] font-bold transition-colors",
        done
          ? "border-[color:var(--leaf)] bg-[color:var(--leaf)] text-[color:var(--on-accent)]"
          : "border-[color:var(--paper-edge)] bg-[color:var(--paper)] hover:bg-[color:var(--maple-wash)]",
      ].join(" ")}
    >
      {done ? "做完了" : "我做完了"}
    </button>
  );
}
```

`QuestDb.tsx`：刪掉檔尾的 `function DoneButton` 與它上面的註解，加 `import { DoneButton } from "@/components/DoneButton";`，`setQuestDone` 若檔內沒別處用就從 `@/lib/done-quests` 的 import 拿掉（`useDoneQuests` 還要用）。

- [ ] **Step 2: `src/lib/go-start.ts`**

```ts
/** 「帶我去」記的起點城鎮（GoNavigator 寫、/plan/buy 讀來挑最近的店）：localStorage 的地圖編號 */
export const GO_START_KEY = "ms-go-start";

/** 讀不到、停用本機儲存、不是正整數都回 null */
export function readGoStart(): number | null {
  try {
    const value = Number(localStorage.getItem(GO_START_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
```

`GoNavigator.tsx`：`const START_KEY = "ms-go-start";` 改成 `import { GO_START_KEY as START_KEY } from "@/lib/go-start";`（放 import 區；上面那行註解留著移到 import 旁），其他不動。

- [ ] **Step 3: `src/app/plan/buy/BuyQuestPlanner.tsx` 整個換成：**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DoneButton } from "@/components/DoneButton";
import { FilterTag } from "@/components/FilterTag";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import { ItemChips } from "@/components/QuestDetailBody";
import { buyQuestRegions, buyQuestRows, displayItemName, shopLine, type BuyQuestRow } from "@/lib/buy-quests";
import { loadBuyQuests, loadNearestTown, loadQuests, npcImage, peekBuyQuests, peekQuests } from "@/lib/data";
import { useDoneQuests } from "@/lib/done-quests";
import { formatNumber, rewardSummary } from "@/lib/format";
import { npcPlace } from "@/lib/go-label";
import { readGoStart } from "@/lib/go-start";
import { useProfile } from "@/lib/profile";
import { useRemembered } from "@/lib/remember";
import type { BuyQuestData, Quest, QuestNpc } from "@/lib/types";
import { useVisitState } from "@/lib/visit-state";

/** 先畫幾張，其餘按「還有 N 個任務」才展開 */
const FIRST_SHOWN = 20;

export function BuyQuestPlanner() {
  const { profile, setProfile, isComplete } = useProfile();
  // 這次瀏覽載過的資料直接拿：站內換頁進來第一個畫面就是清單
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [data, setData] = useState<BuyQuestData | null>(peekBuyQuests);
  const [error, setError] = useState<string | null>(null);
  // 跟任務圖鑑同一套：角色填完整才出現「只看我接得到的」；做完的（任務卡按過「我做完了」）不列
  const [onlyEligible, setOnlyEligible] = useRemembered("plan:buy:onlyEligible", false);
  const [noFightOnly, setNoFightOnly] = useRemembered("plan:buy:noFight", false);
  const [region, setRegion] = useRemembered("plan:buy:region", "");
  const eligibleOn = onlyEligible && isComplete;
  const done = useDoneQuests();
  // 在這一頁剛按「我做完了」的先留在畫面上（不然一按就跳走），下次進來才不列
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useVisitState("plan:buy:all", false);
  // 「帶我去」選過起點城鎮：起點有賣的店優先（要地圖 → 城鎮的對照，選過起點才載）
  const [startTown, setStartTown] = useState<number | null>(null);
  const [townOf, setTownOf] = useState<((mapId: number) => number | undefined) | null>(null);

  useEffect(() => {
    if (quests && data) return;
    Promise.all([loadQuests(), loadBuyQuests()])
      .then(([questData, buyData]) => {
        setQuests(questData);
        setData(buyData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  useEffect(() => {
    const start = readGoStart();
    if (!start) return;
    loadNearestTown()
      .then(table => {
        setStartTown(start);
        setTownOf(() => (mapId: number) => table[String(mapId)]?.[0]);
      })
      // 載不到就照舊挑最便宜的
      .catch(() => {});
  }, []);

  const doneHere = useMemo(() => new Set([...done].filter(id => !keep.has(id))), [done, keep]);
  const regions = useMemo(() => (quests && data ? buyQuestRegions(data, quests) : []), [quests, data]);
  const rows = useMemo(
    () =>
      quests && data
        ? buyQuestRows(data, quests, {
            eligible: eligibleOn ? profile : undefined,
            done: doneHere,
            noFightChain: noFightOnly,
            region,
            job: profile.job >= 0 ? profile.job : undefined,
            startTown: startTown ?? undefined,
            townOf: townOf ?? undefined,
          })
        : [],
    [quests, data, eligibleOn, profile, doneHere, noFightOnly, region, startTown, townOf],
  );
  const shown = showAll ? rows : rows.slice(0, FIRST_SHOWN);
  const onToggleDone = (id: string) => setKeep(before => new Set(before).add(id));

  return (
    <PlanShell
      title="拍賣買齊就能交的任務"
      lead="要交的東西全都能在拍賣買到、不用打怪。買齊直接交，先看拿多少經驗、什麼獎勵。"
      profile={profile}
      onProfileChange={setProfile}
      needsProfile={false}
    >
      {error ? (
        <EmptyBlock title="資料載入失敗" hint={error} />
      ) : !quests || !data ? (
        <LoadingBlock />
      ) : (
        <>
          <p className="rounded-xl bg-[color:var(--sky-wash)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
            只列要交的東西<strong className="font-bold">全都能交易</strong>、不用打怪的任務；任務道具不能交易，所以那些任務不列。
            拍賣沒有公開成交價，只有全部 NPC 商店都買得到的任務才寫要花多少。
          </p>

          <div className="space-y-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={region}
                onChange={event => setRegion(event.target.value)}
                className="tap-safe rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[color:var(--maple)]"
                aria-label="地區"
              >
                <option value="">全部地區</option>
                {regions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <FilterTag on={noFightOnly} onClick={() => setNoFightOnly(!noFightOnly)}>前面也不用打怪</FilterTag>
              {isComplete ? (
                <FilterTag on={onlyEligible} onClick={() => setOnlyEligible(!onlyEligible)}>只看我接得到的</FilterTag>
              ) : null}
            </div>
            {noFightOnly ? (
              <p className="text-xs ink-faint">前置任務也只要交拍賣買得到的東西、或找人對話；做完的在卡片按<span className="whitespace-nowrap">「我做完了」</span>就不算</p>
            ) : null}
            <p className="text-xs ink-faint">共 {rows.length} 個任務 · 經驗高的在前</p>
          </div>

          {rows.length ? (
            <>
              <ul className="space-y-3">
                {shown.map(row => <BuyCard key={row.quest.id} row={row} onToggleDone={onToggleDone} />)}
              </ul>
              {rows.length > FIRST_SHOWN ? (
                <button
                  type="button"
                  onClick={() => setShowAll(value => !value)}
                  aria-expanded={showAll}
                  className="tap-safe w-full rounded-full border border-[color:var(--paper-edge)] text-[14px] font-bold"
                >
                  {showAll ? "收起" : `還有 ${rows.length - FIRST_SHOWN} 個任務`}
                </button>
              ) : null}
            </>
          ) : eligibleOn ? (
            <EmptyBlock
              title={`Lv.${profile.level} 現在接得到的任務裡，沒有買齊就能交的`}
              hint="關掉「只看我接得到的」可以看全部。"
            />
          ) : (
            <EmptyBlock title="目前沒有買齊就能交的任務" hint={noFightOnly || region ? "換個地區、或關掉「前面也不用打怪」看看。" : undefined} />
          )}
        </>
      )}
    </PlanShell>
  );
}

function BuyCard({ row, onToggleDone }: { row: BuyQuestRow; onToggleDone: (id: string) => void }) {
  const { quest, pre, shops, shopNear, skills, rewards, chain, shopTotal, big } = row;
  // 楓幣是負的＝交任務要付錢，不是獎勵：獎勵那行只放正的，要付的寫在「要交的東西」底下
  const reward = rewardSummary(quest.exp, quest.money && quest.money > 0 ? quest.money : undefined, quest.pop);
  const pay = quest.money && quest.money < 0 ? -quest.money : 0;
  const needItems = (quest.needItems ?? []).map(item => ({ ...item, n: displayItemName(item) }));
  const sold = needItems.filter(item => shops.has(item.id));
  const oldData = sold.some(item => shops.get(item.id)?.o);
  const startNpc = quest.sNpc;
  // 回報的人跟接任務不同才多一格
  const endNpc = quest.eNpc && quest.eNpc.id !== startNpc?.id ? quest.eNpc : undefined;

  return (
    <li className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-4">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-black leading-snug">
            <Link href={`/db/quests?id=${quest.id}`} className="hover:text-[color:var(--maple)]">{quest.n}</Link>
          </h2>
          <p className="mt-0.5 text-[12px] ink-faint">
            {quest.cat}
            {quest.minLv ? ` · Lv.${quest.minLv}${quest.maxLv ? `–${quest.maxLv}` : "+"}` : ""}
          </p>
          {reward ? (
            <p className="mt-1 font-bold text-[color:var(--gold)]">{reward}</p>
          ) : (
            <p className="mt-1 text-[13px] ink-soft">不給經驗</p>
          )}
        </div>
        <DoneButton id={quest.id} onToggle={onToggleDone} />
      </header>

      <section>
        <h3 className="mb-1.5 text-[13px] font-black">要交的東西</h3>
        <ItemChips rows={needItems} />
        {big ? <p className="mt-1.5 text-[12px] ink-soft">量多，拍賣可能要分幾次才買得齊</p> : null}
        {pay ? <p className="mt-1.5 text-[13px] font-bold">另外要付 {formatNumber(pay)} 楓幣</p> : null}
        {sold.length ? (
          <div className="mt-1.5 text-[12px] leading-relaxed ink-soft">
            <p>NPC 商店也買得到{oldData ? "（參考舊版資料，可能有出入）" : ""}</p>
            <ul className="space-y-0.5">
              {sold.map(item => (
                <li key={item.id}>
                  <span className="font-bold">{item.n}</span>：{shopLine(shops.get(item.id)!)}
                  {shopNear.has(item.id) ? <span className="whitespace-nowrap">，你的起點就有</span> : null}
                </li>
              ))}
            </ul>
            {shopTotal !== undefined ? (
              <p className="mt-0.5 font-bold text-[color:var(--ink)]">全部在 NPC 商店買：約 {formatNumber(shopTotal)} 楓幣</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {rewards.length || skills.length ? (
        <section>
          <h3 className="mb-1.5 text-[13px] font-black">完成後拿到</h3>
          {rewards.length ? <ItemChips rows={rewards} /> : null}
          {rewards.some(item => item.rand) ? (
            <p className="mt-1 text-[11px] ink-faint">標「隨機」的是從裡面隨機給一樣，不是全拿</p>
          ) : null}
          {skills.length ? (
            <p className="mt-1 text-[13px]">學會技能：<strong className="font-bold">{skills.join("、")}</strong></p>
          ) : null}
        </section>
      ) : null}

      {pre.length ? (
        <div className="space-y-1 text-[13px]">
          <p>
            <span className="ink-faint">要先做：</span>
            {pre.map((item, index) => (
              <span key={item.id}>
                {index > 0 ? "、" : ""}
                <Link href={`/db/quests?id=${item.id}`} className="font-bold hover:text-[color:var(--maple)]">{item.n}</Link>
              </span>
            ))}
          </p>
          {chain ? (
            <p className="text-[12px] leading-relaxed ink-soft">
              連前面一起做：共 {chain.steps} 段，合計經驗 <strong className="font-bold text-[color:var(--gold)]">{formatNumber(chain.exp)}</strong>
              <br />
              合計要交：{chain.items.map(item => `${item.n} ×${formatNumber(item.c ?? 1)}`).join("、")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={endNpc ? "grid gap-2 sm:grid-cols-2" : undefined}>
        {startNpc ? <NpcBox title="接任務" npc={startNpc} /> : null}
        {endNpc ? <NpcBox title="回報" npc={endNpc} /> : null}
      </div>
    </li>
  );
}

function NpcBox({ title, npc }: { title: string; npc: QuestNpc }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[color:var(--paper-deep)] p-2.5">
      <Image src={npcImage(npc.id)} alt="" width={32} height={32} className="size-8 object-contain" unoptimized />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] ink-faint">{title}</p>
        <p className="truncate font-bold">{npc.n}</p>
        {npc.mapName ? <p className="truncate text-[12px] ink-faint">{npc.mapName}</p> : null}
      </div>
      {npc.map ? <GoButton to={npc.map} label="路線" place={npcPlace(npc.n, npc.mapName, npc.mapName ?? "")} /> : null}
    </div>
  );
}
```

（`QuestNpc` 在 `src/lib/types.ts` 已有 export；`--ink` 在 globals.css 有定義。）

- [ ] **Step 4: 首頁入口** — `src/components/route/TodoList.tsx` 的 `TodoList`，在 `{items.length > FIRST_SHOWN ? (<button …/>) : null}` 之後、`</section>` 之前加：

```tsx
      <Link href="/plan/buy" className="block px-1 pt-0.5 text-[13px] font-bold text-[color:var(--maple)] hover:underline">
        不想打怪？看拍賣買齊就能交的任務
      </Link>
```

（檔案已 import `Link`。）

- [ ] **Step 5: README** — 找到「拍賣買齊就能交的任務」（v1.13）那段，後面接一段：

```md
v1.14（10/24 第二輪拍板「全優化」）：篩選加「全部地區」下拉、「前面也不用打怪」（整串前置都是交拍賣買得到的或只找人對話；按過「我做完了」的前置不算）；
卡片加「我做完了」（按了先留在畫面上，下次進來才不列）、有前置的寫「連前面一起做：共 N 段、合計經驗、合計要交」、要付楓幣的寫「另外要付」、
職業限定獎勵有填職業只列拿得到的（上游 job 碼第 0～5 位＝初心者、劍士、法師、弓箭手、盜賊、海盜）、上游沒名字的寫「名字不明的卷軸」、
單一道具 200 個以上提醒拍賣可能要分幾次、回報 NPC 不同人多一格、全部 NPC 商店都有賣才寫總價、「帶我去」選過起點城鎮就優先寫起點的店；
先畫 20 張、按「還有 N 個任務」展開。首頁「出發前，先解這 N 個任務」下面加入口。「我做完了」按鈕抽成 `src/components/DoneButton.tsx`（任務圖鑑共用）。
```

- [ ] **Step 6: emoji 掃描＋全套測試＋型別**

emoji 掃描用寫成檔案的 node 腳本（放 scratchpad），掃 `src/app/plan/buy/*.tsx src/lib/buy-quests.ts src/components/DoneButton.tsx src/lib/go-start.ts src/components/route/TodoList.tsx`。
Run: `node --test "pipeline/**/*.test.mjs" && node ../../../node_modules/vitest/vitest.mjs run && node ../../../node_modules/typescript/bin/tsc --noEmit -p .`
Expected: 沒有 emoji、全 PASS、tsc 沒錯

- [ ] **Step 7: Commit**

```bash
git add src/components/DoneButton.tsx src/app/db/quests/QuestDb.tsx src/lib/go-start.ts src/app/go/GoNavigator.tsx src/app/plan/buy/BuyQuestPlanner.tsx src/components/route/TodoList.tsx README.md
git commit -m "v1.14 (2/2): 拍賣買齊任務頁全優化——地區、前面也不用打怪、我做完了、整條線合計、起點的店、看更多；首頁加入口"
```

---

### 驗收（主 session 做）

- 本機另開埠 dev server：`/plan/buy` 手機 375＋桌機截圖
- 「前面也不用打怪」開：數量 59；地區選冰原雪域只剩冰原雪域
- 湯寶寶的特餐④ 卡：「連前面一起做」段數與合計經驗對得上 ①～④（含不用交東西的前置）
- 填劍士：酋長蓋房子只剩劍士那幾張卷軸；收集毛皮衣材料寫「名字不明的卷軸」
- 「我做完了」按了留在畫面、開「只看我接得到的」重新整理後不列；任務圖鑑的「我做完了」照舊
- localStorage `ms-go-start` 設冰原雪域（211000000）：珀斯上尉的秘密商店行寫「你的起點就有」
- 運送糧食給史菲魯納有「全部在 NPC 商店買」；看更多：先 20 張、展開後重新整理還是展開
- 首頁先解下面有入口；console 沒錯
