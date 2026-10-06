# 道具卡優化 12 項（v0.30）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 道具卡用遊戲說明框的字、長的值不再斷行、武器先看攻擊力＋攻擊速度、「佔兩格」不跟標題打架、清單看得到攻速、新增「哪裡買得到」（只列已開放的地方，舊版資料標出來）。

**Architecture:** 欄位名在 `src/lib/format.ts`；數值分組、排序、清單小字、店家分組都是 `src/lib/item-view.ts` 的純函式（vitest 測）；格子要不要佔兩欄是新檔 `src/lib/stat-layout.ts`；店家清單在資料管線新檔 `pipeline/lib/shops.mjs`（node:test 測）產生 `items.json` 的 `sp`；畫面在 `src/components/DbBrowser.tsx`（StatGrid）與 `src/app/db/items/ItemDb.tsx`。

**Tech Stack:** Next.js 16（App Router、static export）、React 19、TypeScript strict、Tailwind 4、vitest、node:test、Node 22。

**Spec:** `docs/superpowers/specs/2026-10-06-item-card-polish-design.md`

## Global Constraints

- 分支：`feat/item-card-polish`（已從 `origin/dev` 19254f6f 開好）。每個任務 commit 在這條分支上。**不准 push、不准開 PR、不准碰 `main`**——交付由 controller 做。
- commit message 以 `v0.30:` 開頭（繁體中文摘要），結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（用別的模型就寫自己的）。
- 相容性（另一支 session 依賴）：`item-view.ts` 的 `canJobUse`、`usableBy`，`format.ts` 的 `equipStatValue` 簽名與行為不准改；items.json 現有欄位（`c／s／eq／dm／sh／qr／qq／un／d／price`）不准改，只准新增 `sp`。
- 畫面文字：繁體中文、一般玩家秒懂；不准出現「v83」「私服」「heavenms」、地圖或道具編號、英文代碼。遊戲用字照 spec 的客戶端對照表（攻擊力、魔法攻擊力、防禦力、魔法防禦力、命中率、迴避率、HP、MP、可使用捲軸次數、樂豆點、楓幣、商城）。
- `.ts/.tsx/.mjs` 不准有 emoji（掃 U+2300–23FF、U+25A0–25FF、U+2600–27BF、U+1F000+）。
- TDD：每個邏輯改動先寫會失敗的測試、看它失敗、再實作。
- 指令（worktree 根目錄 `C:/Users/user1/MapleBook/.claude/worktrees/ecstatic-mclaren-7947a1`，已 `npm ci`）：
  - 單一 vitest 檔：`npx vitest run src/lib/__tests__/<檔名>`
  - 管線測試：`node --test pipeline/lib/<檔名>.test.mjs`
  - 全部：`npm test`；型別：`npx tsc --noEmit -p . --incremental false`
- 資料只在 Task 5 重建，用主 checkout 的 `C:/Users/user1/MapleBook/data/raw/artale.json`（複製進 worktree 的 `data/raw/`，那裡被 .gitignore 擋著）；`data/raw/*` 不准 commit；不要跑 `npm run data:artale` 重抓。
- 暫存檔只放 scratchpad：`C:/Users/user1/AppData/Local/Temp/claude/C--Users-user1-MapleBook--claude-worktrees-ecstatic-mclaren-7947a1/8f927b5a-0bd1-4f2c-9b27-d8386304739b/scratchpad`。

---

## File Structure

| 檔案 | 責任 | 任務 |
|---|---|---|
| `src/lib/format.ts` | 欄位名（`equipStatLabel`）改遊戲用字；新增匯出 `attackSpeedLabel` | 1、4 |
| `src/lib/stat-layout.ts`（新） | `statSpansTwo`：值太長要不要佔兩欄 | 2 |
| `src/components/DbBrowser.tsx` | `StatGrid` 用 `statSpansTwo` 加 `col-span-2`、`grid-flow-row-dense` | 2 |
| `src/lib/item-view.ts` | `equipGroups` 武器排序＋佔兩格判斷；新增 `itemNote`、`shopGroups` | 3、4、6 |
| `pipeline/lib/shops.mjs`（新） | `shopRows`：上游商店 → 已開放地點的店家清單 | 5 |
| `pipeline/build.mjs` | `buildItems` 加 `sp` | 5 |
| `src/lib/types.ts` | `ShopRow`、`Item.sp` | 5 |
| `public/data/items.json`、`public/data/meta.json` | 重建（多 `sp`、`builtAt` 更新） | 5 |
| `src/app/db/items/ItemDb.tsx` | 清單小字用 `itemNote`；「哪裡買得到」區塊；沒來源的說明改字 | 4、6 |
| 測試 | `format.test.ts`、`format-realdata.test.ts`、`item-view.test.ts`、`item-view-realdata.test.ts`、`stat-layout.test.ts`（新）、`pipeline/lib/shops.test.mjs`（新） | 1–6 |

---

### Task 1: 裝備數值的欄位名寫遊戲說明框的字

**Files:**
- Modify: `src/lib/format.ts:94-121`（`equipStatLabel`）
- Test: `src/lib/__tests__/format.test.ts`（檔尾新增）、`src/lib/__tests__/item-view.test.ts:94,102,113,119,121`（舊字改新字）

**Interfaces:**
- Produces: `equipStatLabel(key)` 回傳新字：`incPAD→攻擊力`、`incMAD→魔法攻擊力`、`incPDD→防禦力`、`incMDD→魔法防禦力`、`incACC→命中率`、`incEVA→迴避率`、`incMHP→HP`、`incMMP→MP`、`tuc→可使用捲軸次數`。之後的任務的測試都用這些字。

- [ ] **Step 1: 寫會失敗的測試**

在 `src/lib/__tests__/format.test.ts` 檔尾加：

```ts
describe("裝備數值的欄位名寫遊戲說明框的字", () => {
  it("攻擊力、魔法攻擊力、防禦力、魔法防禦力、命中率、迴避率、HP、MP、可使用捲軸次數（經典版客戶端的字）", () => {
    expect(equipStatLabel("incPAD")).toBe("攻擊力");
    expect(equipStatLabel("incMAD")).toBe("魔法攻擊力");
    expect(equipStatLabel("incPDD")).toBe("防禦力");
    expect(equipStatLabel("incMDD")).toBe("魔法防禦力");
    expect(equipStatLabel("incACC")).toBe("命中率");
    expect(equipStatLabel("incEVA")).toBe("迴避率");
    expect(equipStatLabel("incMHP")).toBe("HP");
    expect(equipStatLabel("incMMP")).toBe("MP");
    expect(equipStatLabel("tuc")).toBe("可使用捲軸次數");
  });

  it("本來就跟遊戲一樣的不動：力量、移動速度、跳躍力", () => {
    expect(equipStatLabel("incSTR")).toBe("力量");
    expect(equipStatLabel("incSpeed")).toBe("移動速度");
    expect(equipStatLabel("incJump")).toBe("跳躍力");
  });
});
```

在 `src/lib/__tests__/item-view.test.ts` 把舊字換成新字（只換字，其他不動）：

- 第 94 行：`stats: [["攻擊力", "97"], ["可使用捲軸次數", "7"]],`
- 第 102 行：`stats: [["攻擊力", "5"]],`
- 第 113 行：`expect(equipGroups(fashionHat)).toEqual({ requirements: [], stats: [["防禦力", "1"]] });`
- 第 119 行：`expect(equipGroups(bow).stats).toEqual([["攻擊力", "50"], ["裝備欄位", "雙手，不能配盾"], ["攻擊速度", "快（5）"]]);`
- 第 121 行：`expect(equipGroups(oneSlot).stats).toEqual([["攻擊力", "97"], ["可使用捲軸次數", "7"], ["攻擊速度", "普通（6）"]]);`

- [ ] **Step 2: 跑測試，確認失敗**

Run: `npx vitest run src/lib/__tests__/format.test.ts src/lib/__tests__/item-view.test.ts`
Expected: FAIL——新 describe 期待「攻擊力」實際是「物理攻擊」；item-view 那 5 個斷言同樣因為舊字失敗。

- [ ] **Step 3: 實作**

把 `src/lib/format.ts` 的 `equipStatLabel`（含上面一行空白，取代整個函式）換成：

```ts
/**
 * 裝備數值的欄位名，寫遊戲說明框的字（經典版客戶端介面字串「攻擊力 : +{0}」「可使用捲軸次數 : {0}」…，
 * 對照表見 docs/superpowers/specs/2026-10-06-item-card-polish-design.md）。需求類欄位客戶端沒有現成的字，照舊。
 */
export function equipStatLabel(key: string): string {
  const labels: Record<string, string> = {
    reqLevel: "需求等級",
    reqJob: "需求職業",
    reqSTR: "需求力量",
    reqDEX: "需求敏捷",
    reqINT: "需求智力",
    reqLUK: "需求幸運",
    incSTR: "力量",
    incDEX: "敏捷",
    incINT: "智力",
    incLUK: "幸運",
    incMHP: "HP",
    incMMP: "MP",
    incPAD: "攻擊力",
    incMAD: "魔法攻擊力",
    incPDD: "防禦力",
    incMDD: "魔法防禦力",
    incACC: "命中率",
    incEVA: "迴避率",
    incSpeed: "移動速度",
    incJump: "跳躍力",
    tuc: "可使用捲軸次數",
    islot: "裝備欄位",
    attackSpeed: "攻擊速度",
  };
  return labels[key] ?? key;
}
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `npx vitest run src/lib/__tests__/format.test.ts src/lib/__tests__/item-view.test.ts src/lib/__tests__/format-realdata.test.ts src/lib/__tests__/item-view-realdata.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/__tests__/format.test.ts src/lib/__tests__/item-view.test.ts
git commit -m "v0.30: 道具卡欄位名寫遊戲說明框的字（攻擊力、防禦力、命中率、可使用捲軸次數…）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 長的值佔兩欄，不在格子裡斷行

**Files:**
- Create: `src/lib/stat-layout.ts`
- Modify: `src/components/DbBrowser.tsx`（import 區、`StatGrid` 整個函式）
- Test: `src/lib/__tests__/stat-layout.test.ts`（新）

**Interfaces:**
- Produces: `statSpansTwo(value: string | number): boolean`（`@/lib/stat-layout`）。

- [ ] **Step 1: 寫會失敗的測試**

建立 `src/lib/__tests__/stat-layout.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { statSpansTwo } from "@/lib/stat-layout";

describe("數值格子太長就佔兩欄", () => {
  it("三個職業、上衣＋褲裙（佔兩格）、五個職業全列在一欄裡會斷行，佔兩欄", () => {
    expect(statSpansTwo("劍士、弓箭手、盜賊")).toBe(true);
    expect(statSpansTwo("上衣＋褲裙（佔兩格）")).toBe(true);
    expect(statSpansTwo("劍士、法師、弓箭手、盜賊、海盜")).toBe(true);
  });

  it("剛好 7 個中文字放得下，第 8 個就要佔兩欄", () => {
    expect(statSpansTwo("一二三四五六七")).toBe(false);
    expect(statSpansTwo("一二三四五六七八")).toBe(true);
  });

  it("短的維持一欄：雙手，不能配盾、劍士、弓箭手、比較慢（9）", () => {
    expect(statSpansTwo("雙手，不能配盾")).toBe(false);
    expect(statSpansTwo("劍士、弓箭手")).toBe(false);
    expect(statSpansTwo("比較慢（9）")).toBe(false);
  });

  it("數字比中文窄：七位數照樣一欄，十幾位數才佔兩欄", () => {
    expect(statSpansTwo(1234567)).toBe(false);
    expect(statSpansTwo("1,234,567")).toBe(false);
    expect(statSpansTwo("1,234,567,890,123")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `npx vitest run src/lib/__tests__/stat-layout.test.ts`
Expected: FAIL——找不到 `@/lib/stat-layout`。

- [ ] **Step 3: 實作**

建立 `src/lib/stat-layout.ts`：

```ts
/**
 * 數值格子（components/DbBrowser.tsx 的 StatGrid，道具卡、怪物卡共用）要不要佔兩欄。
 *
 * 值太長會在格子裡斷行，同一列另一格被撐高、空一大塊（「劍士、弓箭手、盜賊」「上衣＋褲裙（佔兩格）」）。
 * 2026-10-06 在測試機量過（15px 粗體）：中文字與全形標點一個 15px、數字約 9px；
 * 值能用的寬度最窄是 640px 寬的四欄（107.5px）跟 360px 手機的兩欄（119px），放得下 7 個中文字，第 8 個就斷行。
 * 所以超過 7 個中文字寬就佔兩欄；佔兩欄後最窄也有約 240px，五個職業全列（15 個字）也放得下。
 */
const MAX_ONE_COLUMN_WIDTH = 7;

/** 半形字（數字、英文、逗號）大約是中文字的六成寬 */
const HALF_WIDTH = 0.6;

export function statSpansTwo(value: string | number): boolean {
  let width = 0;
  for (const char of String(value)) width += (char.codePointAt(0) ?? 0) > 0xff ? 1 : HALF_WIDTH;
  return width > MAX_ONE_COLUMN_WIDTH;
}
```

`src/components/DbBrowser.tsx`：在 `import Link from "next/link";` 下一行加

```ts
import { statSpansTwo } from "@/lib/stat-layout";
```

把整個 `StatGrid` 函式換成：

```tsx
/**
 * 數值格子：手機兩欄、寬螢幕四欄。值太長（statSpansTwo）就佔兩欄，不在格子裡斷行；
 * grid-flow-row-dense 讓後面短的格子回頭補空位，不會留一個洞。
 */
export function StatGrid({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <dl className="grid grid-flow-row-dense grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className={`rounded-xl bg-[color:var(--paper-deep)] px-3 py-2${statSpansTwo(value) ? " col-span-2" : ""}`}
        >
          <dt className="text-[12px] ink-faint">{label}</dt>
          {/* break-keep：擠不下時只在「、」換行，「劍士、弓箭手、盜賊」不會把盜賊切成兩行 */}
          <dd className="break-keep text-[15px] font-black tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 4: 跑測試與型別檢查**

Run: `npx vitest run src/lib/__tests__/stat-layout.test.ts` → PASS
Run: `npx tsc --noEmit -p . --incremental false` → 沒有錯誤

- [ ] **Step 5: Commit**

```bash
git add src/lib/stat-layout.ts src/lib/__tests__/stat-layout.test.ts src/components/DbBrowser.tsx
git commit -m "v0.30: 數值格子太長就佔兩欄——上衣＋褲裙（佔兩格）、三個職業不再斷行把同一列撐高

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 武器先排攻擊力、攻擊速度；「佔兩格」只寫真的套服和雙手武器

**Files:**
- Modify: `src/lib/item-view.ts:65-89`（`equipGroups` 與上方常數）
- Test: `src/lib/__tests__/item-view.test.ts:117-122`（換掉那個 it）、`src/lib/__tests__/item-view-realdata.test.ts`（檔尾新增 describe）、`src/lib/__tests__/format-realdata.test.ts`（改一個 it）

**Interfaces:**
- Consumes: Task 1 的欄位名（攻擊力、防禦力、可使用捲軸次數、敏捷）。
- Produces: `equipGroups(item)` 簽名不變；`stats` 的順序與內容依下列規則。

- [ ] **Step 1: 寫會失敗的測試**

`src/lib/__tests__/item-view.test.ts`：把整個 `it("裝備欄位只留佔兩格的「雙手，不能配盾」，只佔一格的不給格子；攻擊速度寫成字", ...)`（第 117–122 行）換成下面四個 it：

```ts
  it("武器先排攻擊力、攻擊速度（挑武器時一起看），其他照資料順序", () => {
    const bow: Item = {
      id: 1452003, n: "測試弓", c: "裝備", s: "弓",
      eq: { reqLevel: 35, reqJob: 4, incDEX: 2, incPAD: 50, tuc: 7, islot: "WpSi", attackSpeed: 5 },
    };
    expect(equipGroups(bow).stats).toEqual([
      ["攻擊力", "50"], ["攻擊速度", "快（5）"], ["敏捷", "2"], ["可使用捲軸次數", "7"], ["裝備欄位", "雙手，不能配盾"],
    ]);
  });

  it("沒有攻擊速度的（手套也有攻擊力）照資料順序，不搬", () => {
    const glove: Item = { id: 1082000, n: "測試手套", c: "裝備", s: "手套", eq: { incDEX: 1, incPAD: 2, incPDD: 3 } };
    expect(equipGroups(glove).stats).toEqual([["敏捷", "1"], ["攻擊力", "2"], ["防禦力", "3"]]);
  });

  it("只佔一格的裝備欄位不給格子；攻擊速度照樣寫成字", () => {
    const oneSlot: Item = { ...spear, eq: { ...spear.eq, islot: "Wp", attackSpeed: 6 } };
    expect(equipGroups(oneSlot).stats).toEqual([["攻擊力", "97"], ["攻擊速度", "普通（6）"], ["可使用捲軸次數", "7"]]);
  });

  it("「佔兩格」只寫真的套服（105 開頭）跟雙手武器（14 開頭）；標題寫上衣的上衣、武器外觀不寫，免得跟標題打架", () => {
    const overall: Item = { id: 1051000, n: "鋼鐵鎧甲", c: "裝備", s: "套服", eq: { incPDD: 28, islot: "MaPn" } };
    expect(equipGroups(overall).stats).toEqual([["防禦力", "28"], ["裝備欄位", "上衣＋褲裙（佔兩格）"]]);
    const top: Item = { id: 1042167, n: "樸素的武士上衣", c: "裝備", s: "上衣", eq: { incPDD: 3, islot: "MaPn" } };
    expect(equipGroups(top).stats).toEqual([["防禦力", "3"]]);
    const cover: Item = { id: 1702000, n: "測試武器外觀", c: "時裝", s: "武器外觀", eq: { islot: "WpSi" } };
    expect(equipGroups(cover).stats).toEqual([]);
  });
```

`src/lib/__tests__/item-view-realdata.test.ts` 檔尾加（`Item` 已經 import 了）：

```ts
describe("真資料：裝備數值的順序與佔兩格", () => {
  it("拖把（1442004）的裝備數值先寫攻擊力 47、攻擊速度慢（8）", () => {
    const mop = items.find(item => item.id === 1442004)!;
    expect(equipGroups(mop).stats.slice(0, 2)).toEqual([["攻擊力", "47"], ["攻擊速度", "慢（8）"]]);
  });

  it("有攻擊力的武器，攻擊速度都緊接在攻擊力後面", () => {
    const weapons = items.filter(item => item.eq?.attackSpeed !== undefined && item.eq?.incPAD !== undefined);
    expect(weapons.length).toBeGreaterThan(0);
    const wrong = weapons.filter(item => {
      const labels = equipGroups(item).stats.map(([label]) => label);
      return labels.indexOf("攻擊速度") !== labels.indexOf("攻擊力") + 1;
    });
    expect(wrong.map(item => item.id)).toEqual([]);
  });

  it("寫「上衣＋褲裙（佔兩格）」的都是套服、寫「雙手，不能配盾」的都是「裝備」分類的武器；樸素的武士上衣（標題寫上衣）不寫", () => {
    const slotText = (item: Item) => equipGroups(item).stats.find(([label]) => label === "裝備欄位")?.[1];
    const overalls = items.filter(item => slotText(item) === "上衣＋褲裙（佔兩格）");
    const twoHanded = items.filter(item => slotText(item) === "雙手，不能配盾");
    expect(overalls.length).toBeGreaterThan(0);
    expect(twoHanded.length).toBeGreaterThan(0);
    expect(overalls.filter(item => item.s !== "套服").map(item => `${item.id} ${item.s}`)).toEqual([]);
    expect(twoHanded.filter(item => item.c !== "裝備").map(item => `${item.id} ${item.c}`)).toEqual([]);
    expect(slotText(items.find(item => item.id === 1042167)!)).toBeUndefined();
  });
});
```

`src/lib/__tests__/format-realdata.test.ts`：把 `it("裝備欄位：雷神之錘寫雙手、標題寫上衣的樸素的武士上衣寫上衣＋褲裙，海神叉（槍）不顯示", ...)` 整個換成（只換說明文字與 1042167 → 1051000；這裡測的是「字」，哪些道具真的顯示由 item-view 的真資料檢查負責）：

```ts
  it("裝備欄位的字：雷神之錘（雙手武器）寫雙手、鋼鐵鎧甲（套服）寫上衣＋褲裙，海神叉（槍）不給格子", () => {
    const slot = (id: number) => equipStatValue("islot", items.find(i => i.id === id)!.eq!.islot);
    expect(slot(1422012)).toBe("雙手，不能配盾");
    expect(slot(1051000)).toBe("上衣＋褲裙（佔兩格）");
    expect(slot(1432008)).toBeNull();
  });
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `npx vitest run src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts`
Expected: FAIL——弓的順序是「攻擊力、敏捷…攻擊速度」；樸素的武士上衣、武器外觀還在寫佔兩格；拖把前兩格是「攻擊力、可使用捲軸次數」。（format-realdata 那個改寫的 it 現在就會過——它只換了例子，預期如此。）

- [ ] **Step 3: 實作**

`src/lib/item-view.ts`：在 `export type StatRow = [string, string];` 上面加：

```ts
/** 武器的「裝備數值」先排攻擊力、攻擊速度：挑武器時這兩個一起看。其他照資料順序（就是遊戲說明框的順序）。 */
const WEAPON_LEAD_KEYS = ["incPAD", "attackSpeed"];

/**
 * 「佔兩格」只寫真的那一類：套服（105 開頭）、雙手武器（140–149 開頭的雙手劍／斧／棍、弓、弩）。
 * 有 91 件 104 開頭的上衣（多半是時裝）跟 61 件 170 開頭的武器外觀，資料也標 MaPn／WpSi，
 * 但遊戲把它們分在上衣、武器外觀，標題也這樣寫；穿了會不會真的佔兩格查不到，寫了只會跟標題打架，所以不寫。
 */
function showsSlot(item: Item, islot: string): boolean {
  const kind = Math.floor(item.id / 10000);
  if (islot === "MaPn") return kind === 105;
  if (islot === "WpSi") return kind >= 140 && kind < 150;
  return true;
}
```

把 `equipGroups`（含上方的註解）整個換成：

```ts
/**
 * 道具卡的數值拆兩組：「穿戴條件」（等級、職業、力敏智幸，固定順序）跟「裝備數值」。
 * 「裝備數值」照資料順序；武器（有攻擊速度）把攻擊力、攻擊速度提到最前面。
 * 「裝備」沒寫職業限制就補一格「不限職業」，玩家才知道誰都能用；時裝不補。
 */
export function equipGroups(item: Item): { requirements: StatRow[]; stats: StatRow[] } {
  const eq = item.eq;
  if (!eq) return { requirements: [], stats: [] };
  const requirements: StatRow[] = [];
  for (const key of REQUIREMENT_KEYS) {
    const value = key === "reqJob" && eq.reqJob === undefined && item.c === "裝備" ? 0 : eq[key];
    if (value !== undefined) requirements.push(...statRows(key, value));
  }
  const lead = eq.attackSpeed === undefined ? [] : WEAPON_LEAD_KEYS.filter(key => eq[key] !== undefined);
  const rest = Object.keys(eq).filter(key => !REQUIREMENT_KEYS.includes(key) && !lead.includes(key));
  const stats = [...lead, ...rest]
    .filter(key => key !== "islot" || showsSlot(item, String(eq.islot)))
    .flatMap(key => statRows(key, eq[key]));
  return { requirements, stats };
}
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `npx vitest run src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts src/lib/__tests__/format-realdata.test.ts src/lib/__tests__/format.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/item-view.ts src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts src/lib/__tests__/format-realdata.test.ts
git commit -m "v0.30: 武器先排攻擊力、攻擊速度；「佔兩格」只寫真的套服和雙手武器，不跟標題的上衣、武器外觀打架

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 道具清單的小字附攻擊速度

**Files:**
- Modify: `src/lib/format.ts`（`attackSpeedText` → 匯出 `attackSpeedLabel`；`equipStatValue` 一行）
- Modify: `src/lib/item-view.ts`（import、新增 `itemNote`）
- Modify: `src/app/db/items/ItemDb.tsx`（import、`note:` 一行）
- Test: `src/lib/__tests__/format.test.ts`、`src/lib/__tests__/item-view.test.ts`、`src/lib/__tests__/item-view-realdata.test.ts`

**Interfaces:**
- Produces: `attackSpeedLabel(speed: number): string | null`（`@/lib/format`）；`itemNote(item: Item): string`（`@/lib/item-view`）。
- `equipStatValue("attackSpeed", n)` 行為不變（認得寫「字（數字）」、認不得寫原數字）——另一支 session 依賴它。

- [ ] **Step 1: 寫會失敗的測試**

`src/lib/__tests__/format.test.ts`：第 2 行 import 加上 `attackSpeedLabel`：

```ts
import { attackSpeedLabel, equipStatLabel, equipStatValue, levelRange, respawnText, sourceLabels } from "@/lib/format";
```

在 `describe("裝備的攻擊速度", ...)` 裡最後加一個 it：

```ts
  it("attackSpeedLabel：認得的寫「字（數字）」，認不得的回 null（清單就不寫）", () => {
    expect(attackSpeedLabel(8)).toBe("慢（8）");
    expect(attackSpeedLabel(3)).toBe("更快（3）");
    expect(attackSpeedLabel(12)).toBeNull();
  });
```

`src/lib/__tests__/item-view.test.ts`：import 加上 `itemNote`（照字母順序放在 `itemKeywords` 後面），檔尾加：

```ts
describe("道具清單右邊的小字", () => {
  it("武器寫種類＋攻擊速度：矛 · 慢（8）", () => {
    const mop: Item = { id: 1442004, n: "拖把", c: "裝備", s: "矛", eq: { incPAD: 47, attackSpeed: 8 } };
    expect(itemNote(mop)).toBe("矛 · 慢（8）");
  });

  it("不是武器的只寫種類，沒有種類寫分類", () => {
    expect(itemNote(medal)).toBe("勳章");
    expect(itemNote({ id: 4000000, n: "任務道具", c: "其他" })).toBe("其他");
  });

  it("認不得的攻擊速度不寫，不露出光禿禿的數字", () => {
    const odd: Item = { id: 1442999, n: "測試矛", c: "裝備", s: "矛", eq: { attackSpeed: 12 } };
    expect(itemNote(odd)).toBe("矛");
  });
});
```

`src/lib/__tests__/item-view-realdata.test.ts`：import 加上 `itemNote`，在 `describe("真資料：找道具", ...)` 裡最後加：

```ts
  it("清單小字：拖把寫「矛 · 慢（8）」，每件有攻擊速度的武器都帶得出攻擊速度", () => {
    expect(itemNote(items.find(item => item.id === 1442004)!)).toBe("矛 · 慢（8）");
    const weapons = items.filter(item => typeof item.eq?.attackSpeed === "number");
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons.filter(item => !itemNote(item).includes("（")).map(item => item.id)).toEqual([]);
  });
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `npx vitest run src/lib/__tests__/format.test.ts src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts`
Expected: FAIL——`attackSpeedLabel`、`itemNote` 不存在。

- [ ] **Step 3: 實作**

`src/lib/format.ts`：把

```ts
function attackSpeedText(speed: number): string {
  const word = ATTACK_SPEED_WORDS[speed];
  // 認不得的值照原值寫，不猜快慢
  return word ? `${word}（${speed}）` : String(speed);
}
```

換成

```ts
/** 攻擊速度寫成「字（數字）」（道具卡、道具清單共用）；認不得的值回 null，不猜快慢 */
export function attackSpeedLabel(speed: number): string | null {
  const word = ATTACK_SPEED_WORDS[speed];
  return word ? `${word}（${speed}）` : null;
}
```

`equipStatValue` 裡的那一行換成（認不得的照原值寫，行為跟以前一樣）：

```ts
  if (key === "attackSpeed" && typeof value === "number") return attackSpeedLabel(value) ?? String(value);
```

`src/lib/item-view.ts`：第 1 行改成

```ts
import { attackSpeedLabel, equipStatLabel, equipStatValue } from "./format";
```

在 `itemKeywords` 函式下面加：

```ts
/** 道具清單右邊的小字：種類（沒有種類寫分類）；武器加攻擊速度，比武器不用一件件點進去。認不得的攻擊速度不寫。 */
export function itemNote(item: Item): string {
  const kind = item.s || item.c;
  const speed = item.eq?.attackSpeed;
  const label = typeof speed === "number" ? attackSpeedLabel(speed) : null;
  return label ? `${kind} · ${label}` : kind;
}
```

`src/app/db/items/ItemDb.tsx`：import 那段（第 8–10 行）改成

```ts
import {
  compareItems, equipGroups, itemKeywords, itemNote, jobLabel, sortCategories, subcategoryOptions, usableBy, wearFit, type WearFit,
} from "@/lib/item-view";
```

`entries` 裡的 `note: item.s || item.c,` 改成 `note: itemNote(item),`。

- [ ] **Step 4: 跑測試與型別檢查**

Run: `npx vitest run src/lib/__tests__/format.test.ts src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts src/lib/__tests__/format-realdata.test.ts` → PASS
Run: `npx tsc --noEmit -p . --incremental false` → 沒有錯誤

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/item-view.ts src/app/db/items/ItemDb.tsx src/lib/__tests__/format.test.ts src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts
git commit -m "v0.30: 道具清單小字附攻擊速度（矛 · 慢（8）），比武器不用一件件點進去

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 資料管線產生「哪裡買得到」店家清單（items.json 的 sp）

**Files:**
- Create: `pipeline/lib/shops.mjs`、`pipeline/lib/shops.test.mjs`
- Modify: `pipeline/build.mjs`（import 區、第 103 行 `buildItems(...)` 呼叫、第 484 行 `buildItems` 簽名、record 的 `sh:` 下面）
- Modify: `src/lib/types.ts`（`Item` 上方加 `ShopRow`、`Item` 加 `sp`）
- Regenerate: `public/data/items.json`、`public/data/meta.json`

**Interfaces:**
- Produces（Task 6 依賴）：items.json 每件道具可能有 `sp: ShopRow[]`，
  `ShopRow = { p: string; n?: string; m?: number; pr: number; k?: number; c?: 1; o?: 1 }`（`src/lib/types.ts` 匯出）。
  p 地點、n NPC（商城沒有；NPC 名已經包含在地點名裡也不寫）、m 地點的地圖 id、pr 標價、k 一組幾個（1 不寫）、c=1 樂豆點（沒寫是楓幣）、o=1 取自舊版資料。

- [ ] **Step 1: 寫會失敗的測試**

建立 `pipeline/lib/shops.test.mjs`：

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { shopRows } from "./shops.mjs";

const context = {
  openRegions: ["維多利亞島", "冰原雪域"],
  mapRecords: {
    100000101: { zh: "", ret: 100000000 },
    100000000: { zh: "弓箭手村" },
    200000001: { zh: "", ret: 200000000 },
    200000000: { zh: "天空之城" },
    230000002: { zh: "", ret: 230000000 },
    230000000: { zh: "" },
  },
};

const npcShop = overrides => ({
  sourceType: "npcShop",
  sourceFile: "heavenms_db_database.sql",
  merchantName: "克爾",
  price: 24000,
  count: 1,
  currency: "楓幣",
  maps: [{ id: 100000101, name: "弓箭手村武器店", unnamed: false, regionName: "維多利亞島" }],
  ...overrides,
});

test("有名字、地區已開放的店寫那張圖的名字跟 NPC，標出取自舊版資料", () => {
  assert.deepEqual(shopRows([npcShop()], context), [{ p: "弓箭手村武器店", n: "克爾", m: 100000101, pr: 24000, o: 1 }]);
});

test("店那張圖沒名字、但回城的城鎮有名字：寫城鎮名（天空之城），地圖 id 用城鎮的", () => {
  const shop = npcShop({ merchantName: "妖精 諾麗", maps: [{ id: 200000001, name: "未命名地圖 200000001", unnamed: true, regionName: "" }] });
  assert.deepEqual(shopRows([shop], context), [{ p: "天空之城", n: "妖精 諾麗", m: 200000000, pr: 24000, o: 1 }]);
});

test("還沒開放的城鎮（水世界）的店不列，玩家去不了", () => {
  const shop = npcShop({ merchantName: "卡利", maps: [{ id: 230000002, name: "未命名地圖 230000002", unnamed: true, regionName: "" }] });
  assert.equal(shopRows([shop], context), undefined);
});

test("有名字但地區還沒開放的店也不列", () => {
  const shop = npcShop({ maps: [{ id: 220000001, name: "玩具城武器店", unnamed: false, regionName: "玩具城" }] });
  assert.equal(shopRows([shop], context), undefined);
});

test("商城寫「商城」、記樂豆點、整組賣的記件數；下架的限時售價不列", () => {
  const cash = (price, count, hidden) => ({ sourceType: "cashShop", merchantName: "商城", price, count, currency: "點數", maps: [], hiddenByDefault: hidden });
  assert.deepEqual(shopRows([cash(40, 1, true), cash(220, 1, false), cash(1980, 10, false)], context), [
    { p: "商城", pr: 220, c: 1 },
    { p: "商城", pr: 1980, k: 10, c: 1 },
  ]);
});

test("通行證遠端商店沒有地圖也列（經典版的功能，上游手動補的，不標舊版）；其他沒地圖的不列", () => {
  const remote = {
    sourceType: "npcShop", sourceFile: "manual", sourceLabel: "楓之谷通行證遠端商店", merchantName: "遠端商店",
    price: 500, count: 1, currency: "楓幣", maps: [],
  };
  const nowhere = npcShop({ merchantName: "唐唐", maps: [] });
  assert.deepEqual(shopRows([remote, nowhere], context), [{ p: "楓之谷通行證遠端商店", pr: 500 }]);
});

test("同一家店同一個價錢重複只留一筆；沒有店、沒有標價的回 undefined", () => {
  assert.deepEqual(shopRows([npcShop(), npcShop()], context), [{ p: "弓箭手村武器店", n: "克爾", m: 100000101, pr: 24000, o: 1 }]);
  assert.equal(shopRows([npcShop({ price: 0 })], context), undefined);
  assert.equal(shopRows([], context), undefined);
  assert.equal(shopRows(undefined, context), undefined);
});
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `node --test pipeline/lib/shops.test.mjs`
Expected: FAIL——`Cannot find module ... shops.mjs`。

- [ ] **Step 3: 實作 shops.mjs**

建立 `pipeline/lib/shops.mjs`：

```js
/**
 * 道具卡「哪裡買得到」的店家清單（items.json 的 sp）。
 *
 * 上游（artale.json 的 item.sources.shops）有三種來源：
 *  - NPC 商店：大多取自 v83 私服資料庫（sourceFile heavenms_db_database.sql），不是台服經典版客戶端，
 *    經典版實際賣什麼、賣多少可能不同——記 o: 1，前端標「參考舊版資料，可能有出入」。
 *  - 上游作者手動補的經典版商店（sourceFile manual：通行證遠端商店、雜貨商店的共鳴石交換券、任務解鎖商店）。
 *  - 商城（cashShop，客戶端的商城資料，價格是樂豆點）。
 *
 * 2026-10-06：NPC 商店 2,720 筆裡 1,891 筆只在「未命名地圖」——玩具城、水世界、神木村這些經典版還沒開放的城鎮，
 * 列出來玩家也去不了。所以只留：
 *  1. 店那張圖有中文名、所在地區已開放（跟 build.mjs 收地圖中文名同一套規則，地區空白照舊放行）→ 寫那張圖的名字；
 *  2. 那張圖沒名字，但它回城的城鎮有名字（天空之城、冰原雪域這種官方補過名字的）→ 寫城鎮名；
 *  3. 沒有地圖的：只認通行證遠端商店，其他查不到在哪的不列。
 * 下架的限時售價（hiddenByDefault）不列；同一家店同一個價錢只留一筆。
 */

/** 上游的貨幣：「點數」是商城的樂豆點，其他是楓幣 */
const CASH_CURRENCY = "點數";
/** NPC 商店的舊版來源 */
const OLD_SOURCE = "heavenms_db_database.sql";
/** 沒有地圖、但確定經典版有的店 */
const REMOTE_SHOP = "楓之谷通行證遠端商店";

/**
 * @param {Array<object> | undefined} shops 上游 item.sources.shops
 * @param {{ openRegions: string[], mapRecords: Record<string, { zh: string, ret?: number }> }} context
 *   openRegions＝build.mjs 的 RELEASE.mapRegions；mapRecords＝buildMaps 的 records（要有 zh、ret）
 * @returns {Array<{ p: string, n?: string, m?: number, pr: number, k?: number, c?: 1, o?: 1 }> | undefined}
 */
export function shopRows(shops, { openRegions, mapRecords }) {
  if (!Array.isArray(shops) || !shops.length) return undefined;
  const rows = [];
  const seen = new Set();
  for (const shop of shops) {
    if (!shop || shop.hiddenByDefault) continue;
    const price = Number(shop.price);
    if (!(price > 0)) continue;
    const where = shopPlace(shop, openRegions, mapRecords);
    if (!where) continue;
    const npc = shop.sourceType === "cashShop" ? "" : String(shop.merchantName || "");
    const count = Number(shop.count) || 1;
    const row = {
      p: where.place,
      n: npc && !where.place.includes(npc) ? npc : undefined,
      m: where.mapId,
      pr: price,
      k: count > 1 ? count : undefined,
      c: shop.currency === CASH_CURRENCY ? 1 : undefined,
      o: shop.sourceFile === OLD_SOURCE ? 1 : undefined,
    };
    for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
    const key = JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows.length ? rows : undefined;
}

/** 店在哪：回 { place, mapId? }；還沒開放、查不到在哪的回 null */
function shopPlace(shop, openRegions, mapRecords) {
  if (shop.sourceType === "cashShop") return { place: "商城" };
  const map = (shop.maps || [])[0];
  if (!map) return shop.sourceLabel === REMOTE_SHOP ? { place: REMOTE_SHOP } : null;
  const id = Number(map.id);
  if (!map.unnamed && map.name && (!map.regionName || openRegions.includes(map.regionName))) {
    return { place: map.name, mapId: id };
  }
  const town = mapRecords[String(id)]?.ret;
  const townName = town === undefined ? "" : mapRecords[String(town)]?.zh;
  return townName ? { place: townName, mapId: town } : null;
}
```

- [ ] **Step 4: 跑管線測試，確認通過**

Run: `node --test pipeline/lib/shops.test.mjs`
Expected: 7 tests PASS。

- [ ] **Step 5: 接進 build.mjs**

`pipeline/build.mjs`：
- import 區，`import { officialName } from "./lib/map-names.mjs";` 下一行加 `import { shopRows } from "./lib/shops.mjs";`
- 第 103 行 `const items = buildItems(artale, monsters);` 改成 `const items = buildItems(artale, monsters, maps);`
- 第 484 行 `function buildItems(artale, monsters) {` 改成 `function buildItems(artale, monsters, maps) {`
- record 裡 `sh: sources.shops?.length || undefined,` 下一行加：

```js
      // 哪裡買得到：只列經典版已經開放的地方；NPC 商店大多是舊版資料，前端會標出來（見 lib/shops.mjs）
      sp: shopRows(sources.shops, { openRegions: RELEASE.mapRegions, mapRecords: maps.records }),
```

（record 下面原本的迴圈會把 `undefined` 刪掉，沒有店的道具不會多出 `sp`。）

- [ ] **Step 6: 型別**

`src/lib/types.ts`：在 `export type Item = {` 上面加：

```ts
/**
 * 道具「哪裡買得到」的一家店（pipeline/lib/shops.mjs，只列經典版已開放的地方）。
 * p 地點、n NPC（商城沒有）、m 地點的地圖 id（看是不是 10/15 才開放）、pr 標價、
 * k 一組幾個（1 個不寫）、c=1 商城的樂豆點（沒寫是楓幣）、o=1 取自舊版資料（經典版實際可能不同）。
 */
export type ShopRow = { p: string; n?: string; m?: number; pr: number; k?: number; c?: 1; o?: 1 };
```

`Item` 裡把 `sh?: number;` 換成：

```ts
  /** 店家數（含還沒開放城鎮的店）；v002.ts 用來判斷「有店賣就不是 V002 限定」 */
  sh?: number;
  /** 哪裡買得到（見 ShopRow） */
  sp?: ShopRow[];
```

- [ ] **Step 7: 重建資料**

```bash
cp "C:/Users/user1/MapleBook/data/raw/artale.json" data/raw/artale.json
node pipeline/build.mjs
node pipeline/verify.mjs
git status --short
git diff --stat
```

Expected：
- `verify.mjs` 全部通過。
- `git status` 只有 `public/data/items.json`、`public/data/meta.json`（加上 Step 5、6 改的程式）是 modified；`data/raw/artale.json` 不會出現（被 .gitignore 擋）。
- `git diff public/data/meta.json` 只有 `builtAt` 一行變了（這行一定要 commit：前端拿它當 `items.json?v=` 的快取版本）。
- 如果 `items.json`、`meta.json` 以外的資料檔也變了，**停下來回報 DONE_WITH_CONCERNS**，不要 commit。

抽查（印出來附在報告裡）：

```bash
node -e "const items=require('./public/data/items.json');const pick=id=>JSON.stringify(items.find(i=>i.id===id)?.sp);console.log(pick(1442004));console.log(pick(5068302));console.log(items.filter(i=>i.sp).length, items.reduce((n,i)=>n+(i.sp?.length||0),0))"
```

Expected：拖把（1442004）有弓箭手村武器店、勇士之村武器店（24000、o:1），沒有水世界的卡利；記憶音樂盒（5068302）是 `[{"p":"商城","pr":220,"c":1},{"p":"商城","pr":1980,"k":10,"c":1}]`；有 sp 的道具 1,450 件、1,917 筆（2026-10-06 實數，含 fix round 1 多列的 17 筆科爾分店；計畫初稿寫 1,505／2,052 是沒扣掉 184 筆價格不明的商城資料）。

- [ ] **Step 8: 全部測試與型別**

Run: `npm test` → 全部 PASS（node:test 管線測試＋vitest）
Run: `npx tsc --noEmit -p . --incremental false` → 沒有錯誤

- [ ] **Step 9: Commit**

```bash
git add pipeline/lib/shops.mjs pipeline/lib/shops.test.mjs pipeline/build.mjs src/lib/types.ts public/data/items.json public/data/meta.json
git commit -m "v0.30: 道具資料加「哪裡買得到」店家清單——只列經典版已開放的地方，舊版資料做記號

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 道具卡「哪裡買得到」區塊；沒有來源的說明改白話

**Files:**
- Modify: `src/lib/item-view.ts`（import、新增 `ShopPlace`／`ShopGroup` 型別與 `shopGroups`）
- Modify: `src/app/db/items/ItemDb.tsx`（import、`renderDetail` 傳 `maps`、`ItemDetail` 新 prop、新區塊、說明文字）
- Test: `src/lib/__tests__/item-view.test.ts`、`src/lib/__tests__/item-view-realdata.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `ShopRow`、`Item.sp`、重建後的 `public/data/items.json`；Task 4 改過的 item-view import 行。
- Produces: `shopGroups(item: Item, opensLater?: (mapId: number) => boolean): { groups: ShopGroup[]; fromOldData: boolean }`，
  `ShopGroup = { price: string; places: ShopPlace[] }`，`ShopPlace = { place: string; npc?: string; later: boolean }`。
  `later`＝這家店的地點 10/15 才開放（由呼叫端傳進來的 `opensLater` 判斷；沒傳就全部 false）；同一組裡 `later` 的排最後。
- 2026-10-06 計畫修正（controller ruling）：紅色藥水這類到處都賣的，資料順序會把冰原雪域、天空之城（10/15 才開）排在最前面，
  玩家現在要買卻先看到去不了的地方，所以「現在去得了的先列」，並把 10/15 判斷收進 `shopGroups`（純函式、可測），畫面只看 `later`。

- [ ] **Step 1: 寫會失敗的測試**

`src/lib/__tests__/item-view.test.ts`：import 加上 `shopGroups`，檔尾加：

```ts
describe("哪裡買得到", () => {
  it("同一個價錢的店家排在一起，價錢只寫一次；有舊版資料要標", () => {
    const mop: Item = {
      id: 1442004, n: "拖把", c: "裝備", s: "矛",
      sp: [
        { p: "弓箭手村武器店", n: "克爾", m: 100000101, pr: 24000, o: 1 },
        { p: "勇士之村武器店", n: "利伯", m: 102000001, pr: 24000, o: 1 },
      ],
    };
    expect(shopGroups(mop)).toEqual({
      groups: [{
        price: "24,000 楓幣",
        places: [
          { place: "弓箭手村武器店", npc: "克爾", later: false },
          { place: "勇士之村武器店", npc: "利伯", later: false },
        ],
      }],
      fromOldData: true,
    });
  });

  it("10/15 才開放的店標 later、排在同一組最後；現在去得了的先列（其餘照資料順序）", () => {
    const redPotion: Item = {
      id: 2000000, n: "紅色藥水", c: "消耗", s: "藥水",
      sp: [
        { p: "冰原雪域", n: "哈娜", m: 211000000, pr: 50, o: 1 },
        { p: "弓箭手村雜貨店", n: "露娜", m: 100000102, pr: 50, o: 1 },
        { p: "楓之谷通行證遠端商店", pr: 50 },
      ],
    };
    const opensLater = (mapId: number) => mapId === 211000000;
    expect(shopGroups(redPotion, opensLater).groups[0].places).toEqual([
      { place: "弓箭手村雜貨店", npc: "露娜", later: false },
      { place: "楓之谷通行證遠端商店", later: false },
      { place: "冰原雪域", npc: "哈娜", later: true },
    ]);
    // 沒傳判斷就當全部現在都去得了，照資料順序
    expect(shopGroups(redPotion).groups[0].places.map(place => place.place)).toEqual(["冰原雪域", "弓箭手村雜貨店", "楓之谷通行證遠端商店"]);
  });

  it("商城寫樂豆點、整組賣的寫幾個，不同價錢分開列；全是商城不標舊版", () => {
    const box: Item = { id: 5068302, n: "記憶音樂盒", c: "現金", sp: [{ p: "商城", pr: 220, c: 1 }, { p: "商城", pr: 1980, k: 10, c: 1 }] };
    expect(shopGroups(box)).toEqual({
      groups: [
        { price: "220 樂豆點", places: [{ place: "商城", later: false }] },
        { price: "10 個 1,980 樂豆點", places: [{ place: "商城", later: false }] },
      ],
      fromOldData: false,
    });
  });

  it("沒有店家的道具是空的", () => {
    expect(shopGroups(potion)).toEqual({ groups: [], fromOldData: false });
  });
});
```

`src/lib/__tests__/item-view-realdata.test.ts`：import 加上 `shopGroups`，再加兩行 import：

```ts
import { isV002Map } from "@/lib/v002";
import type { MapRecord } from "@/lib/types";
```

（`MapRecord` 跟現有的 `import type { Item } from "@/lib/types";` 合併成 `import type { Item, MapRecord } from "@/lib/types";`。）檔尾加：

```ts
describe("真資料：哪裡買得到", () => {
  const maps = JSON.parse(fs.readFileSync(`${DATA}maps.json`, "utf8")) as Record<string, MapRecord>;
  const opensLater = (mapId: number) => isV002Map(maps[String(mapId)]);

  it("紅色藥水：10/15 才開的冰原雪域、天空之城排在最後，現在去得了的雜貨店先列", () => {
    const { groups } = shopGroups(items.find(item => item.id === 2000000)!, opensLater);
    const places = groups[0].places;
    expect(places[0].later).toBe(false);
    expect(places.filter(place => place.later).map(place => place.place).sort()).toEqual(["冰原雪域", "天空之城"]);
    expect(places.slice(-2).every(place => place.later)).toBe(true);
  });

  it("拖把：弓箭手村武器店、勇士之村武器店都是 24,000 楓幣，標舊版資料；水世界（還沒開放）的店不列", () => {
    const { groups, fromOldData } = shopGroups(items.find(item => item.id === 1442004)!);
    expect(fromOldData).toBe(true);
    expect(groups.map(group => group.price)).toEqual(["24,000 楓幣"]);
    const places = groups[0].places.map(place => place.place);
    expect(places).toContain("弓箭手村武器店");
    expect(places).toContain("勇士之村武器店");
    expect(groups[0].places.map(place => place.npc)).not.toContain("卡利");
  });

  it("記憶音樂盒：商城 220 樂豆點、10 個 1,980 樂豆點；下架的限時售價（40、360）不列", () => {
    const { groups, fromOldData } = shopGroups(items.find(item => item.id === 5068302)!);
    expect(groups.map(group => group.price)).toEqual(["220 樂豆點", "10 個 1,980 樂豆點"]);
    expect(fromOldData).toBe(false);
  });

  it("店家地點都有名字，沒有「未命名地圖」", () => {
    const bad = items.flatMap(item => (item.sp ?? []).filter(row => !row.p || row.p.includes("未命名")).map(row => `${item.id} ${row.p}`));
    expect(bad).toEqual([]);
  });

  it("天空之城、冰原雪域的店都帶得出開放日（畫面標 10/15 開放）", () => {
    const rows = items.flatMap(item => item.sp ?? []).filter(row => row.p === "天空之城" || row.p === "冰原雪域");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter(row => row.m === undefined || !isV002Map(maps[String(row.m)])).map(row => `${row.p} ${row.n}`)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試，確認失敗**

Run: `npx vitest run src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts`
Expected: FAIL——`shopGroups` 不存在。

- [ ] **Step 3: 實作 shopGroups**

`src/lib/item-view.ts`：
- 第 1 行改成 `import { attackSpeedLabel, equipStatLabel, equipStatValue, formatNumber } from "./format";`
- `import type { Item, Profile } from "./types";` 改成 `import type { Item, Profile, ShopRow } from "./types";`
- 檔尾加：

```ts
/** later：這家店的地點 10/15 才開放（畫面標「10/15 開放」） */
export type ShopPlace = { place: string; npc?: string; later: boolean };
export type ShopGroup = { price: string; places: ShopPlace[] };

/** 標價寫法：楓幣、商城的樂豆點（客戶端「{0}楓幣」「{0}個{1}樂豆點」）；整組賣的寫「10 個 1,980 樂豆點」 */
function shopPriceText(row: ShopRow): string {
  const amount = `${formatNumber(row.pr)} ${row.c ? "樂豆點" : "楓幣"}`;
  return row.k ? `${row.k} 個 ${amount}` : amount;
}

/**
 * 「哪裡買得到」：同一個標價的店家排在一起，價錢只寫一次（一般道具每家都賣一樣的價錢）。
 * opensLater 判斷店的地點是不是 10/15 才開放（呼叫端用 maps.json 跟現在日期判斷）；這種店排在同一組最後——
 * 紅色藥水這類到處都賣的，玩家現在要買，先看到現在去得了的地方。其餘照資料順序。
 * fromOldData：有任何一家取自舊版資料，畫面要標「參考舊版資料，可能有出入」。
 */
export function shopGroups(
  item: Item,
  opensLater: (mapId: number) => boolean = () => false,
): { groups: ShopGroup[]; fromOldData: boolean } {
  const groups: ShopGroup[] = [];
  for (const row of item.sp ?? []) {
    const price = shopPriceText(row);
    let group = groups.find(entry => entry.price === price);
    if (!group) {
      group = { price, places: [] };
      groups.push(group);
    }
    group.places.push({ place: row.p, npc: row.n, later: row.m !== undefined && opensLater(row.m) });
  }
  // sort 是穩定排序：later 一樣的維持資料順序
  for (const group of groups) group.places.sort((a, b) => Number(a.later) - Number(b.later));
  return { groups, fromOldData: (item.sp ?? []).some(row => row.o === 1) };
}
```

- [ ] **Step 4: 跑測試，確認通過**

Run: `npx vitest run src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts`
Expected: PASS。

- [ ] **Step 5: 畫面**

`src/app/db/items/ItemDb.tsx`：
- item-view 的 import 加上 `shopGroups`（放在 `itemNote` 後面、`jobLabel` 前面照字母順序也可以，保持一行內）。
- `import { isV002Item, v002MonsterIds, v002QuestIds } from "@/lib/v002";` 改成 `import { isV002Item, isV002Map, v002MonsterIds, v002QuestIds } from "@/lib/v002";`
- `renderDetail` 裡 `<ItemDetail` 加一個 prop：`maps={maps ?? {}}`（放在 `questIndex={questIndex}` 下一行）。
- `ItemDetail` 的參數解構加 `maps,`（放在 `questIndex,` 後面），型別加：

```ts
  /** 店家地點要看是不是 10/15 才開放 */
  maps: Record<string, MapRecord>;
```

- `ItemDetail` 函式本體 `const { requirements, stats } = equipGroups(item);` 下一行加（`notOpenYet` 是函式開頭既有的 `useBeforeV002()`）：

```ts
  // 店的地點 10/15 才開放、而且現在還沒到：標「10/15 開放」並排在最後
  const shops = shopGroups(item, mapId => notOpenYet && isV002Map(maps[String(mapId)]));
```
- 在「哪些任務會給」那個區塊（`{item.qr?.length ? (` … `) : null}`）**後面**、「哪些任務要用到」前面加：

```tsx
      {shops.groups.length ? (
        <Section title="哪裡買得到" extra={shops.fromOldData ? "參考舊版資料，可能有出入" : undefined}>
          <div className="space-y-2">
            {shops.groups.map(group => (
              <div key={group.price} className="space-y-1">
                <p className="text-[13px] font-black tabular-nums">{group.price}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {group.places.map((place, index) => (
                    <li
                      key={`${index}-${place.place}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--paper-deep)] px-2.5 py-1"
                    >
                      <span className="text-[13px] font-bold">{place.place}</span>
                      {place.npc ? <span className="text-[11px] ink-faint">{place.npc}</span> : null}
                      {place.later ? <Chip tone="gold">10/15 開放</Chip> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
```

- 最後那段沒有來源的說明換成（出現條件不變）：

```tsx
      {!item.dm?.length && !item.qr?.length && !item.qq?.length ? (
        <p className="rounded-xl bg-[color:var(--paper-deep)] px-3 py-2.5 text-sm ink-soft">
          目前查不到哪隻怪會掉、哪個任務給。
        </p>
      ) : null}
```

- [ ] **Step 6: 全部測試、型別、建置、emoji**

Run: `npm test` → 全部 PASS
Run: `npx tsc --noEmit -p . --incremental false` → 沒有錯誤
Run: `npm run build` → 成功
Run（emoji 掃描，應該沒有輸出）：

```bash
node -e "const fs=require('fs');const files=['src/lib/item-view.ts','src/lib/format.ts','src/lib/stat-layout.ts','src/components/DbBrowser.tsx','src/app/db/items/ItemDb.tsx','src/lib/types.ts','pipeline/lib/shops.mjs','pipeline/build.mjs'];for(const f of files){const t=fs.readFileSync(f,'utf8');for(const ch of t){const c=ch.codePointAt(0);if((c>=0x2300&&c<=0x23ff)||(c>=0x25a0&&c<=0x25ff)||(c>=0x2600&&c<=0x27bf)||c>=0x1f000)console.log(f,ch,c.toString(16))}}"
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/item-view.ts src/app/db/items/ItemDb.tsx src/lib/__tests__/item-view.test.ts src/lib/__tests__/item-view-realdata.test.ts
git commit -m "v0.30: 道具卡「哪裡買得到」——店家、NPC、標價，舊版資料標出來；沒有來源的說明改白話

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 驗證與交付（controller 做，不派 subagent）

1. 全部任務 review 過、final review 過之後：`npm test`、`npx tsc --noEmit -p . --incremental false`、`npm run build`。
2. commit 前 `git log --all --oneline | grep v0.30` 確認版號沒被別支用掉。
3. push `feat/item-card-polish`，等 Vercel 分支預覽 `https://maplestory-tool-git-feat-item-card-polish-clarkhers-projects.vercel.app` 建好。
4. Playwright（本機 Chrome、zh-TW）在 375×812 與 1280×900 截圖：拖把 1442004、鋼鐵鎧甲 1051000、樸素的武士上衣 1042167、木劍 1402001、記憶音樂盒 5068302、一件在天空之城有賣的道具（看 10/15 開放標示）、清單搜尋「拖把」（小字「矛 · 慢（8）」）、怪物頁（StatGrid 沒被改壞）。
5. PR → `dev`（`GH_TOKEN=$(gh auth token --user clarkher) gh pr create --base dev`），squash merge，刪分支；dev 測試機再驗一次並貼網址。
6. 告訴 feat/gear-card 那支 session `sp` 的格式（`ShopRow`）。
