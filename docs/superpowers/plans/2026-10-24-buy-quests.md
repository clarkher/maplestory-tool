# 拍賣買齊就能交的任務（v1.13）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新開 `/plan/buy`，列出要交的道具全都能在拍賣買到、不用打怪的任務，每張卡寫要交什麼、經驗、獎勵道具。

**Architecture:** 建置時 `pipeline/lib/buy-quests.mjs` 從上游原始任務與道具交易狀態挑出任務編號、附上 NPC 商店價，寫成小檔 `public/data/buy-quests.json`；
前端 `src/lib/buy-quests.ts` 把它跟 `quests.json` 合成卡片資料（排序、篩接得到的、挑最便宜的店），`src/app/plan/buy/` 畫卡片。

**Tech Stack:** Node（`node --test`）、Next 16 App Router、React 19、Tailwind 4、vitest。

**Spec:** `docs/superpowers/specs/2026-10-24-buy-quests-design.md`

## Global Constraints

- 全部 user-facing 字繁體中文、不用 emoji、不用 icon set（狀態用文字）；寫完掃 emoji（含 U+2300–23FF、U+25A0–25FF）
- 不編價格：拍賣價一律不寫；商店價只用 `items.json` 的 `sp`，舊版資料標「參考舊版資料，可能有出入」
- 能交易＝上游 `trade.status === "unlimited"` 且沒有 `flags.quest`；查的是任務原本要的道具編號（`tradeVariants`），查不到當不能交易
- commit 訊息開頭 `v1.13:`，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- worktree 裡跑測試：`node --test "pipeline/**/*.test.mjs"`、`node ../../../node_modules/vitest/vitest.mjs run`、型別 `node ../../../node_modules/typescript/bin/tsc --noEmit -p .`

---

### Task 1: 建置挑任務、寫 `buy-quests.json`

**Files:**
- Create: `pipeline/lib/buy-quests.mjs`
- Create: `pipeline/lib/buy-quests.test.mjs`
- Modify: `pipeline/build.mjs`（import、main 裡寫檔、meta.counts）
- Modify: `pipeline/verify.mjs`（兩個 check）
- Output: `public/data/buy-quests.json`、`public/data/meta.json`

**Interfaces:**
- Produces: `tradeTable(rawItems) → Map<number, trade>`、`isTradeable(trade) → boolean`、`buyQuestIds(rawQuests, tradeOf, listed: Set<string>) → string[]`、`buyQuestShops(questIds, quests, itemsById) → Record<string, ShopRow[]>`
- 檔案格式：`{ "quests": string[], "shops": { [itemId]: ShopRow[] } }`

- [ ] **Step 1: 寫失敗的測試** `pipeline/lib/buy-quests.test.mjs`

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { buyQuestIds, buyQuestShops, isTradeable, tradeTable } from "./buy-quests.mjs";

const free = { status: "unlimited", label: "無限交易", note: "", flags: {} };
const rawItems = [
  { id: 4000023, name: "冰獨眼獸之尾巴", trade: free },
  { id: 4031041, name: "休咪的錢包", trade: { status: "unlimited", flags: { quest: 1 } } },
  {
    id: 2000000, name: "紅色藥水", trade: free,
    tradeVariants: [{ id: 2000000, ...free }, { id: 2001500, status: "blocked", flags: { tradeBlock: 1 } }],
  },
  { id: 4000099, name: "不能交易的", trade: { status: "blocked", flags: { tradeBlock: 1 } } },
];
const tradeOf = tradeTable(rawItems);
const quest = (id, items, monsters = []) => ({
  id, completeRequirements: { items: items.map(itemId => ({ id: itemId, count: 1 })), monsters: monsters.map(mobId => ({ id: mobId })) },
});
const listedAll = ids => new Set(ids);

test("無限交易、沒有任務道具標記才算能交易", () => {
  assert.equal(isTradeable(free), true);
  assert.equal(isTradeable({ status: "unlimited", flags: { quest: 1 } }), false);
  assert.equal(isTradeable({ status: "blocked", flags: {} }), false);
  assert.equal(isTradeable(undefined), false);
});

test("只交能交易的道具、不用打怪的任務收進來", () => {
  assert.deepEqual(buyQuestIds([quest(2206, [4000023])], tradeOf, listedAll(["2206"])), ["2206"]);
});

test("要打怪的不收，就算要交的道具能交易", () => {
  assert.deepEqual(buyQuestIds([quest(1, [4000023], [100100])], tradeOf, listedAll(["1"])), []);
});

test("要交任務道具（上游標無限交易、但有 quest 標記）的不收", () => {
  assert.deepEqual(buyQuestIds([quest(2057, [4031041]), quest(2, [4000023, 4031041])], tradeOf, listedAll(["2057", "2"])), []);
});

test("合併的道具看任務原本要的編號：要活動版 2001500 的不收、要 2000000 的收", () => {
  const quests = [quest(10, [2001500]), quest(11, [2000000])];
  assert.deepEqual(buyQuestIds(quests, tradeOf, listedAll(["10", "11"])), ["11"]);
});

test("查不到交易資料、不能交易、沒有要交道具（對話任務）的都不收", () => {
  const quests = [quest(20, [9999999]), quest(21, [4000099]), quest(22, [])];
  assert.deepEqual(buyQuestIds(quests, tradeOf, listedAll(["20", "21", "22"])), []);
});

test("站上沒有的任務（還沒開放）不收", () => {
  assert.deepEqual(buyQuestIds([quest(30, [4000023])], tradeOf, listedAll([])), []);
});

test("商店：只看符合的任務要交的道具，去掉商城樂豆點，沒有店的不寫", () => {
  const apple = { p: "弓箭手村", n: "雜貨商人", m: 100000102, pr: 30, o: 1 };
  const itemsById = new Map([
    [2010000, { id: 2010000, sp: [apple, { p: "商城", pr: 100, c: 1 }] }],
    [4000023, { id: 4000023 }],
    [2000000, { id: 2000000, sp: [{ p: "商城", pr: 50, c: 1 }] }],
    [2000001, { id: 2000001, sp: [{ p: "勇士之村", pr: 160 }] }],
  ]);
  const quests = [
    { id: "3100", needItems: [{ id: 2010000, n: "蘋果", c: 20 }, { id: 4000023, n: "冰獨眼獸之尾巴", c: 50 }, { id: 2000000, n: "紅色藥水", c: 1 }] },
    { id: "9", needItems: [{ id: 2000001, n: "橘色藥水", c: 1 }] },
  ];
  assert.deepEqual(buyQuestShops(["3100"], quests, itemsById), { 2010000: [apple] });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test pipeline/lib/buy-quests.test.mjs`
Expected: FAIL（`Cannot find module './buy-quests.mjs'`）

- [ ] **Step 3: 實作** `pipeline/lib/buy-quests.mjs`

```js
/**
 * 「拍賣買齊就能交的任務」（/plan/buy，v1.13）：要交的道具全都能交易、不用打怪的任務，
 * 跟這些道具在 NPC 商店的價錢。build.mjs 寫成 public/data/buy-quests.json。
 *
 * 能不能交易看上游的 trade：status 是 unlimited、而且沒有 flags.quest。
 * 上游把任務道具（quest: 1，休咪的錢包、白花…）也標 unlimited，但遊戲裡任務道具不能交易、拍賣買不到。
 * 上游把同名道具併成一筆（紅色藥水 2000000 底下有不能交易的活動版 2001500），每個編號自己的交易狀態在 tradeVariants，
 * 所以查的是任務原本要的那個編號。查不到的當作不能交易（寧可少列）。
 */

/** 每個道具編號（含併進別筆的）的交易狀態 */
export function tradeTable(rawItems) {
  const table = new Map();
  for (const item of rawItems || []) {
    if (item?.trade) table.set(Number(item.id), item.trade);
    for (const variant of item?.tradeVariants || []) table.set(Number(variant.id), variant);
  }
  return table;
}

export function isTradeable(trade) {
  return trade?.status === "unlimited" && !trade.flags?.quest;
}

/**
 * @param {Array<object>} rawQuests 上游 artale.quests
 * @param {Map<number, object>} tradeOf tradeTable 的結果
 * @param {Set<string>} listed 站上有的任務編號（quests.json 的 id，已經濾過開放地區、等級上限、轉職階段）
 * @returns {string[]} 符合的任務編號，照上游順序
 */
export function buyQuestIds(rawQuests, tradeOf, listed) {
  return (rawQuests || [])
    .filter(quest => listed.has(String(quest.id)))
    .filter(quest => {
      const complete = quest.completeRequirements || {};
      const items = complete.items || [];
      if (!items.length || complete.monsters?.length) return false;
      return items.every(row => isTradeable(tradeOf.get(Number(row?.id))));
    })
    .map(quest => String(quest.id));
}

/**
 * 這些任務要交的道具裡，NPC 商店有賣的：items.json 的 sp 去掉商城（c: 1，樂豆點）那幾列。
 * quests.json 的 needItems 是合併後的編號，跟 items.json 對得上。
 * @returns {Record<string, Array<object>>} 道具編號 → 店家列
 */
export function buyQuestShops(questIds, quests, itemsById) {
  const wanted = new Set(questIds);
  const shops = {};
  for (const quest of quests) {
    if (!wanted.has(quest.id)) continue;
    for (const row of quest.needItems || []) {
      const rows = (itemsById.get(row.id)?.sp || []).filter(shop => !shop.c);
      if (rows.length) shops[row.id] = rows;
    }
  }
  return shops;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test pipeline/lib/buy-quests.test.mjs`
Expected: 8 個 PASS

- [ ] **Step 5: 接進 `pipeline/build.mjs`**

import 區（在 `import { shopRows } from "./lib/shops.mjs";` 下面）加：

```js
import { buyQuestIds, buyQuestShops, tradeTable } from "./lib/buy-quests.mjs";
```

`main()` 裡 `const search = buildSearch(...)` 下一行加：

```js
  // 拍賣買齊就能交的任務（/plan/buy）：要交的道具全能交易、不用打怪（lib/buy-quests.mjs）
  const buyIds = buyQuestIds(artale.quests, tradeTable(artale.items), new Set(quests.list.map(quest => quest.id)));
  const buyQuests = { quests: buyIds, shops: buyQuestShops(buyIds, quests.list, items.byId) };
```

`report["search.json"] = ...` 下一行加：

```js
  report["buy-quests.json"] = write("buy-quests.json", buyQuests);
```

`meta.counts` 裡 `farmableItems` 下一行加：

```js
      buyQuests: buyIds.length,
```

- [ ] **Step 6: 加 `pipeline/verify.mjs` 檢查**

`main()` 讀檔區最後加：

```js
  const buyQuests = readJson(path.join(OUT, "buy-quests.json"));
```

`check("任務數量合理（僅已開放）", ...)` 下面加：

```js
  // 拍賣買齊就能交的任務（/plan/buy）：2026-10-24 上游 2.0.0 是 100 個
  const questById = new Map((quests ?? []).map(quest => [quest.id, quest]));
  const buyIds = buyQuests?.quests ?? [];
  const buyBad = buyIds.filter(id => !questById.get(id)?.needItems?.length || questById.get(id)?.needMobs?.length);
  check("拍賣買齊就能交的任務數量合理", buyIds.length >= 60 && buyIds.length <= 200, `${buyIds.length} 個`);
  check("拍賣買齊就能交的任務都在任務表、都要交道具、都不用打怪", buyBad.length === 0, buyBad.length ? buyBad.slice(0, 5).join("、") : `${buyIds.length} 個`);
```

- [ ] **Step 7: 重建資料並驗證**

Run: `node pipeline/build.mjs && node pipeline/verify.mjs`
Expected: 輸出列表有 `buy-quests.json`；verify 兩條新的 `ok`，`100 個`；整體 exit 0。
再跑 `git status --short public/data`：只有 `buy-quests.json`（新）跟 `meta.json`（builtAt、counts.buyQuests）變，其他資料檔不變（有變就停下來查，不要一起 commit）。

- [ ] **Step 8: 全部管線測試**

Run: `node --test "pipeline/**/*.test.mjs"`
Expected: 全 PASS

- [ ] **Step 9: Commit**

```bash
git add pipeline/lib/buy-quests.mjs pipeline/lib/buy-quests.test.mjs pipeline/build.mjs pipeline/verify.mjs public/data/buy-quests.json public/data/meta.json
git commit -m "v1.13 (1/3): 建置挑出拍賣買齊就能交的任務——要交的道具全能交易、不用打怪，任務道具不算"
```

---

### Task 2: 前端合成卡片資料

**Files:**
- Modify: `src/lib/types.ts`（加 `BuyQuestData`）
- Modify: `src/lib/data.ts`（`loadBuyQuests`、`peekBuyQuests`）
- Create: `src/lib/buy-quests.ts`
- Create: `src/lib/__tests__/buy-quests.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `buy-quests.json` 格式
- Produces:
  - `type BuyQuestData = { quests: string[]; shops: Record<string, ShopRow[]> }`
  - `loadBuyQuests(): Promise<BuyQuestData>`、`peekBuyQuests(): BuyQuestData | null`
  - `type BuyQuestRow = { quest: Quest; pre: Quest[]; shops: Map<number, ShopRow> }`
  - `cheapestShop(rows?: ShopRow[]): ShopRow | undefined`
  - `buyQuestRows(data: BuyQuestData, quests: Quest[], eligible?: { profile: Profile; done: ReadonlySet<string> }): BuyQuestRow[]`
  - `shopLine(shop: ShopRow): string`

- [ ] **Step 1: 寫失敗的測試** `src/lib/__tests__/buy-quests.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buyQuestRows, cheapestShop, shopLine } from "@/lib/buy-quests";
import type { BuyQuestData, Quest, ShopRow } from "@/lib/types";

const q = (id: string, extra: Partial<Quest> = {}): Quest => ({ id, n: `任務${id}`, cat: "維多利亞島", ...extra });

describe("最便宜的店", () => {
  it("整組賣的除以組數比；一樣便宜取先列的；沒有店回 undefined", () => {
    const a: ShopRow = { p: "弓箭手村", pr: 30 };
    const b: ShopRow = { p: "通行證遠端商店", pr: 1400, k: 100 };
    const c: ShopRow = { p: "勇士之村", pr: 30 };
    expect(cheapestShop([a, b])).toBe(b);
    expect(cheapestShop([a, c])).toBe(a);
    expect(cheapestShop(undefined)).toBeUndefined();
    expect(cheapestShop([])).toBeUndefined();
  });
  it("一行字：每個 N 楓幣（NPC · 地點）；整組寫 N 個 N 楓幣；沒有 NPC 只寫地點", () => {
    expect(shopLine({ p: "弓箭手村雜貨店", n: "雜貨商人", pr: 1200 })).toBe("每個 1,200 楓幣（雜貨商人 · 弓箭手村雜貨店）");
    expect(shopLine({ p: "楓之谷通行證遠端商店", pr: 1400, k: 2000 })).toBe("2,000 個 1,400 楓幣（楓之谷通行證遠端商店）");
  });
});

describe("卡片資料", () => {
  const quests = [
    q("1", { exp: 3000, minLv: 20, needItems: [{ id: 2010000, n: "蘋果", c: 20 }] }),
    q("2", { exp: 36000, minLv: 40, pre: ["3"], needItems: [{ id: 4000023, n: "冰獨眼獸之尾巴", c: 50 }] }),
    q("3", { exp: 3000, minLv: 10 }),
    q("4", { n: "開發測試用", exp: 99999 }),
    q("5", { exp: 5000, minLv: 30, jobs: [400] }),
    q("6", { minLv: 10 }),
  ];
  const apple: ShopRow = { p: "弓箭手村", n: "雜貨商人", pr: 30, o: 1 };
  const data: BuyQuestData = { quests: ["1", "2", "4", "5", "6", "404"], shops: { 2010000: [apple] } };

  it("經驗高的在前，一樣多的需求等級低的在前；沒經驗的排最後；開發測試用、查不到的不列", () => {
    expect(buyQuestRows(data, quests).map(row => row.quest.id)).toEqual(["2", "5", "1", "6"]);
  });
  it("前置任務帶出來；商店有賣的道具帶最便宜那家", () => {
    const rows = buyQuestRows(data, quests);
    expect(rows.find(row => row.quest.id === "2")!.pre.map(pre => pre.id)).toEqual(["3"]);
    expect(rows.find(row => row.quest.id === "1")!.shops.get(2010000)).toBe(apple);
    expect(rows.find(row => row.quest.id === "2")!.shops.size).toBe(0);
  });
  it("只看接得到的：等級不到、別的職業、按過做完了的都不列", () => {
    const rows = buyQuestRows(data, quests, { profile: { level: 25, job: 100 }, done: new Set(["6"]) });
    expect(rows.map(row => row.quest.id)).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/buy-quests.test.ts`
Expected: FAIL（找不到 `@/lib/buy-quests`）

- [ ] **Step 3: 型別與載入**

`src/lib/types.ts` 在 `ShopRow` 那段下面加：

```ts
/** 拍賣買齊就能交的任務（pipeline/lib/buy-quests.mjs 輸出的 buy-quests.json）：quests 任務編號、shops 要交的道具在 NPC 商店的店家列（沒有商城） */
export type BuyQuestData = { quests: string[]; shops: Record<string, ShopRow[]> };
```

`src/lib/data.ts`：type import 加 `BuyQuestData`；`peekFarming` 下一行加
`export const peekBuyQuests = () => peek<BuyQuestData>("buy-quests");`；
`loadSearch` 下一行加
`export const loadBuyQuests = () => load<BuyQuestData>("buy-quests");`

- [ ] **Step 4: 實作** `src/lib/buy-quests.ts`

```ts
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
 * 經驗高的在前，一樣多的需求等級低的在前。
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
    }))
    .sort((a, b) => (b.quest.exp ?? 0) - (a.quest.exp ?? 0) || (a.quest.minLv ?? 0) - (b.quest.minLv ?? 0));
}
```

- [ ] **Step 5: 跑測試確認通過＋型別**

Run: `node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/buy-quests.test.ts && node ../../../node_modules/typescript/bin/tsc --noEmit -p .`
Expected: 5 個 PASS；tsc 沒有錯

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/data.ts src/lib/buy-quests.ts src/lib/__tests__/buy-quests.test.ts
git commit -m "v1.13 (2/3): 拍賣買齊就能交的任務卡片資料——經驗排序、只看接得到的、商店挑最便宜那家"
```

---

### Task 3: `/plan/buy` 頁面、入口、文件

**Files:**
- Modify: `src/components/QuestDetailBody.tsx`（`ItemChips` 改成 export，其他不動）
- Create: `src/app/plan/buy/page.tsx`
- Create: `src/app/plan/buy/BuyQuestPlanner.tsx`
- Modify: `src/app/db/page.tsx`（TOOLS 在「任務打包」後面加一列）
- Modify: `src/app/sitemap.ts`（`/plan/bundle` 後面加 `/plan/buy`）
- Modify: `README.md`（查資料工具那句、資料管線輸出）

**Interfaces:**
- Consumes: `buyQuestRows`、`shopLine`、`BuyQuestRow`（Task 2）、`loadBuyQuests`、`peekBuyQuests`
- Produces: 路由 `/plan/buy`

- [ ] **Step 1: `ItemChips` export**

`src/components/QuestDetailBody.tsx` 的 `function ItemChips(` 改成 `export function ItemChips(`，上面註解補一行「拍賣買齊就能交的任務（/plan/buy）也用」。

- [ ] **Step 2: `src/app/plan/buy/page.tsx`**

```tsx
import type { Metadata } from "next";
import { BuyQuestPlanner } from "./BuyQuestPlanner";

export const metadata: Metadata = {
  title: "拍賣買齊就能交的任務｜不用打怪，買齊直接交",
  description: "要交的東西全都能在拍賣買到、不用打怪的任務：每個任務要交什麼、拿多少經驗、什麼獎勵道具，照經驗排好。",
  alternates: { canonical: "/plan/buy" },
};

export default function Page() {
  return <BuyQuestPlanner />;
}
```

- [ ] **Step 3: `src/app/plan/buy/BuyQuestPlanner.tsx`**

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FilterTag } from "@/components/FilterTag";
import { EmptyBlock, GoButton, LoadingBlock, PlanShell } from "@/components/PlanShell";
import { ItemChips } from "@/components/QuestDetailBody";
import { buyQuestRows, shopLine, type BuyQuestRow } from "@/lib/buy-quests";
import { loadBuyQuests, loadQuests, npcImage, peekBuyQuests, peekQuests } from "@/lib/data";
import { useDoneQuests } from "@/lib/done-quests";
import { rewardSummary } from "@/lib/format";
import { npcPlace } from "@/lib/go-label";
import { useProfile } from "@/lib/profile";
import { useRemembered } from "@/lib/remember";
import type { BuyQuestData, Quest } from "@/lib/types";

export function BuyQuestPlanner() {
  const { profile, setProfile, isComplete } = useProfile();
  // 這次瀏覽載過的資料直接拿：站內換頁進來第一個畫面就是清單
  const [quests, setQuests] = useState<Quest[] | null>(peekQuests);
  const [data, setData] = useState<BuyQuestData | null>(peekBuyQuests);
  const [error, setError] = useState<string | null>(null);
  // 跟任務圖鑑同一套：角色填完整才出現「只看我接得到的」；做完的（任務卡按過「我做完了」）不列
  const [onlyEligible, setOnlyEligible] = useRemembered("plan:buy:onlyEligible", false);
  const eligibleOn = onlyEligible && isComplete;
  const done = useDoneQuests();

  useEffect(() => {
    if (quests && data) return;
    Promise.all([loadQuests(), loadBuyQuests()])
      .then(([questData, buyData]) => {
        setQuests(questData);
        setData(buyData);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const rows = useMemo(
    () => (quests && data ? buyQuestRows(data, quests, eligibleOn ? { profile, done } : undefined) : []),
    [quests, data, eligibleOn, profile, done],
  );

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
            拍賣沒有公開成交價，這裡不寫要花多少。
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs ink-faint">共 {rows.length} 個任務 · 經驗高的在前</p>
            {isComplete ? (
              <FilterTag on={onlyEligible} onClick={() => setOnlyEligible(!onlyEligible)}>只看我接得到的</FilterTag>
            ) : null}
          </div>

          {rows.length ? (
            <ul className="space-y-3">
              {rows.map(row => <BuyCard key={row.quest.id} row={row} />)}
            </ul>
          ) : (
            <EmptyBlock
              title={`Lv.${profile.level} 現在接得到的任務裡，沒有買齊就能交的`}
              hint="關掉「只看我接得到的」可以看全部。"
            />
          )}
        </>
      )}
    </PlanShell>
  );
}

function BuyCard({ row }: { row: BuyQuestRow }) {
  const { quest, pre, shops } = row;
  const reward = rewardSummary(quest.exp, quest.money);
  const sold = (quest.needItems ?? []).filter(item => shops.has(item.id));
  const oldData = sold.some(item => shops.get(item.id)?.o);
  const npc = quest.sNpc;

  return (
    <li className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-4">
      <header>
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
      </header>

      <section>
        <h3 className="mb-1.5 text-[13px] font-black">要交的東西</h3>
        <ItemChips rows={quest.needItems ?? []} />
        {sold.length ? (
          <ul className="mt-1.5 space-y-0.5 text-[12px] leading-relaxed ink-soft">
            {sold.map(item => (
              <li key={item.id}>商店有賣：{item.n} {shopLine(shops.get(item.id)!)}</li>
            ))}
            {oldData ? <li className="ink-faint">商店參考舊版資料，可能有出入</li> : null}
          </ul>
        ) : null}
      </section>

      {quest.rewardItems?.length ? (
        <section>
          <h3 className="mb-1.5 text-[13px] font-black">完成後拿到</h3>
          <ItemChips rows={quest.rewardItems} />
          {quest.rewardItems.some(item => item.rand) ? (
            <p className="mt-1 text-[11px] ink-faint">標「隨機」的是從裡面隨機給一樣，不是全拿</p>
          ) : null}
        </section>
      ) : null}

      {pre.length ? (
        <p className="text-[13px]">
          <span className="ink-faint">要先做：</span>
          {pre.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? "、" : ""}
              <Link href={`/db/quests?id=${item.id}`} className="font-bold hover:text-[color:var(--maple)]">{item.n}</Link>
            </span>
          ))}
        </p>
      ) : null}

      {npc ? (
        <div className="flex items-center gap-2 rounded-xl bg-[color:var(--paper-deep)] p-2.5">
          <Image src={npcImage(npc.id)} alt="" width={32} height={32} className="size-8 object-contain" unoptimized />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] ink-faint">接任務</p>
            <p className="truncate font-bold">{npc.n}</p>
            {npc.mapName ? <p className="truncate text-[12px] ink-faint">{npc.mapName}</p> : null}
          </div>
          {npc.map ? <GoButton to={npc.map} label="路線" place={npcPlace(npc.n, npc.mapName, npc.mapName ?? "")} /> : null}
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 4: 入口與 sitemap**

`src/app/db/page.tsx` 的 `TOOLS`，`/plan/bundle` 那列後面加：

```tsx
  { href: "/plan/buy", title: "拍賣買齊就能交的任務", lead: "不用打怪，買齊東西直接交，看拿多少經驗、什麼獎勵", image: "/assets/items/4000031.png" },
```

`src/app/sitemap.ts`：`{ path: "/plan/bundle", priority: 0.9 },` 後面加 `{ path: "/plan/buy", priority: 0.8 },`

- [ ] **Step 5: README**

`README.md`「舊的單項工具（練功排行、可接任務、打寶、任務打包）跟…」那句改成含「拍賣買齊就能交的任務」，並在後面加一段：

```md
「拍賣買齊就能交的任務」（`/plan/buy`，v1.13）：要交的道具全都能交易、不用打怪的任務，照經驗排，寫要交什麼、經驗、獎勵道具、NPC 商店有沒有賣。
能不能交易看上游道具的 `trade`（`unlimited` 而且沒有 `quest` 標記——上游把任務道具也標成 unlimited，遊戲裡其實不能交易），
查的是任務原本要的那個編號（同名道具併成一筆時，各編號的狀態在 `tradeVariants`）。建置時 `pipeline/lib/buy-quests.mjs` 挑好寫進 `public/data/buy-quests.json`，
`verify.mjs` 擋數量不合理、有要打怪的。拍賣價格沒有資料，不寫花費。
```

- [ ] **Step 6: emoji 掃描＋全部測試＋型別**

Run（Git Bash）：
`grep -nP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2300}-\x{23FF}\x{25A0}-\x{25FF}]' src/app/plan/buy/*.tsx src/lib/buy-quests.ts || echo 沒有emoji`
`npm test` 等價：`node --test "pipeline/**/*.test.mjs" && node ../../../node_modules/vitest/vitest.mjs run`
`node ../../../node_modules/typescript/bin/tsc --noEmit -p .`
Expected: 沒有 emoji、全 PASS、tsc 沒錯

- [ ] **Step 7: Commit**

```bash
git add src/components/QuestDetailBody.tsx src/app/plan/buy src/app/db/page.tsx src/app/sitemap.ts README.md
git commit -m "v1.13 (3/3): 新頁「拍賣買齊就能交的任務」——要交的東西、經驗、獎勵道具，查資料加入口"
```

---

### 驗收（主 session 做，不派工）

- worktree 另開埠起 dev server（`next dev --webpack -p 3013`，`.claude/launch.json` 臨時加一組、驗完還原）
- `/plan/buy` 手機 390、桌機各截一張；第一張卡＝特殊料理3：冰獨眼獸之尾巴 ×50、經驗 36,000、棒冰棒 ×50
- 對照 `/db/quests?id=2206` 經驗、獎勵一致；「只看我接得到的」填 Lv.30 劍士後數量變少、沒有 Lv.40 的
- 商店有賣那行：3100 運送糧食給史菲魯納（蘋果、雞蛋、柳橙）
- console 沒錯、沒有 hydration 警告
- `/db` 看得到新入口
