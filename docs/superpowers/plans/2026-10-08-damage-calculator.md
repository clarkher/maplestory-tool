# 傷害計算機（v0.79）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/plan/damage` 傷害計算機：選職業、技能、怪物，兩組（點法／等級／武器／能力值）並排算能力視窗攻擊力、技能每一下與一次總傷害、打怪幾下、爆擊，並列出一下／兩下打死的怪。

**Architecture:** 純公式放 `src/lib/damage.ts`，技能表放 `src/lib/damage-skills.ts`，預設值與組裝放 `src/lib/damage-view.ts`（只呼叫既有 `gear.ts`／`gear-view.ts`／`skill-plan.ts`／`planner.ts`，不改它們）；彈藥資料由 `pipeline/lib/gear.mjs` 多產一欄 `ammo` 進 `gear.json`；畫面在 `src/app/plan/damage/`。

**Tech Stack:** Next.js 16（全站靜態、client component 讀 `/data/*.json`）、React 19、TypeScript、Tailwind 4、vitest 5、node:test。

**Spec:** `docs/superpowers/specs/2026-10-08-damage-calculator-design.md`

## Global Constraints

- 全程繁體中文（程式碼識別字英文）；畫面不用 emoji 與 U+2300–23FF、U+25A0–25FF 字元，圖只用遊戲圖（`/assets/items/`、`/assets/skills/`、`/assets/monster_frames/`、`/jobs/<id>.webp`）；狀態用文字或 `@/components/Icons`。
- 不編造：查不到的機制不算、寫原因；可信度三級字樣照抄：「玩家依客戶端整理」「舊版公式」「舊版國際服公式，經典版沒驗證」。
- 不改 `src/lib/gear.ts`、`src/lib/gear-view.ts` 的既有函式（只 import）；`GearCard.tsx` 只加一行連結。
- 計算機改職業、等級不寫回角色（不呼叫 `saveProfile`）。
- commit 訊息 `v0.79 (n/N): …` 開頭、結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；docs／驗收腳本跟程式分開 commit。
- 跑測試：worktree 沒有 node_modules —— `node ../../../node_modules/vitest/vitest.mjs run <檔>`（PowerShell 跑，Bash 的 PATH 沒有 node）；pipeline 測試 `node --test pipeline/lib/gear.test.mjs`；型別 `node ../../../node_modules/typescript/bin/tsc --noEmit -p .`。
- Edit／Write 工具會把「反斜線 u 加四碼」轉成真字元：程式裡不要寫這種跳脫。

---

### Task 1：彈藥資料進 gear.json

**Files:**
- Modify: `pipeline/lib/gear.mjs`（加 `AMMO_KINDS`、`parseAmmoAttack`、`parseAmmoLevel`、`buildAmmo`）
- Modify: `pipeline/build-gear.mjs`（產 `ammo`、開頭註解、console）
- Modify: `src/lib/gear.ts`（只加型別 `GearAmmo`、`GearData.ammo?`）
- Test: `pipeline/lib/gear.test.mjs`
- Regenerate: `public/data/gear.json`

**Interfaces:**
- Produces（TS）：
  ```ts
  export type GearAmmo = { id: number; n: string; kind: "飛鏢" | "箭矢" | "弩箭" | "子彈"; atk: number; lv: number; src: GearSource; o?: string };
  // GearData 多一欄 ammo?: GearAmmo[]
  ```
- Produces（pipeline）：`buildAmmo(item, ctx) → GearAmmo | null`

- [ ] **Step 1：寫會失敗的測試**（加在 `pipeline/lib/gear.test.mjs` 最後，import 補 `buildAmmo, parseAmmoAttack, parseAmmoLevel`）

```js
/* ------------------------------------------------------------ buildAmmo */

test("parseAmmoAttack：說明裡的「攻擊力 + N」（空白有沒有都要抓得到），沒寫回 0", () => {
  assert.equal(parseAmmoAttack("用鋼鐵做成的飛鏢。消耗完可再補充。 #c等級限制：10, 攻擊力+25"), 25);
  assert.equal(parseAmmoAttack("盜賊的禮物，以鋼鐵所鑄成的飛鏢。 攻擊力+ 15"), 15);
  assert.equal(parseAmmoAttack("裝有青銅弓箭的專用矢筒，必須與弓一起使用。 攻擊力 + 1"), 1);
  assert.equal(parseAmmoAttack("弓專用的箭矢"), 0);
  assert.equal(parseAmmoAttack(undefined), 0);
});

test("parseAmmoLevel：「等級限制：N」，沒寫回 0", () => {
  assert.equal(parseAmmoLevel("#c等級限制：10, 攻擊力+25"), 10);
  assert.equal(parseAmmoLevel("攻擊力+16"), 0);
});

test("buildAmmo：id 前四碼決定種類，來源跟武器同一套；拿不到、不收錄、不是彈藥回 null", () => {
  const monstersById = new Map([[5, { id: 5, n: "怪", lv: 50, maps: [100000000] }]]);
  const ctx = { monstersById, questsById: new Map(), maps: { 100000000: { zh: "弓箭手村" } }, openMap, v002Date: "2026-10-15" };
  const star = buildAmmo({ id: 2070005, n: "雷之鏢", c: "消耗", s: "飛鏢", d: "#c等級限制：10, 攻擊力+25", dm: [5] }, ctx);
  assert.deepEqual({ ...star, src: undefined }, { id: 2070005, n: "雷之鏢", kind: "飛鏢", atk: 25, lv: 10, src: undefined });
  assert.equal(star.src.drops.length, 1);
  assert.equal(buildAmmo({ id: 2061001, n: "青銅弩箭", c: "消耗", s: "箭矢", d: "攻擊力 + 1", dm: [5] }, ctx).kind, "弩箭");
  assert.equal(buildAmmo({ id: 2060000, n: "箭矢", c: "消耗", s: "箭矢", d: "弓專用的箭矢", dm: [5] }, ctx).kind, "箭矢");
  assert.equal(buildAmmo({ id: 2330003, n: "高等子彈", c: "消耗", s: "子彈", d: "攻擊力+16", dm: [5] }, ctx).atk, 16);
  assert.equal(buildAmmo({ id: 2070005, n: "雷之鏢", c: "消耗", s: "飛鏢", d: "攻擊力+25" }, ctx), null, "沒有來源");
  assert.equal(buildAmmo({ id: 2331000, n: "未命名", c: "消耗", s: "子彈", un: 1, dm: [5] }, ctx), null, "不收錄");
  assert.equal(buildAmmo({ id: 2000000, n: "紅色藥水", c: "消耗", s: "藥水", dm: [5] }, ctx), null, "不是彈藥");
});
```

- [ ] **Step 2：跑測試確認失敗**

Run（PowerShell）：`node --test pipeline/lib/gear.test.mjs`
Expected：FAIL，`buildAmmo` 不是 export（SyntaxError: does not provide an export named 'buildAmmo'）

- [ ] **Step 3：實作**（`pipeline/lib/gear.mjs`，放在 `buildWeapon` 後面）

```js
/* -------------------------------------------------------- 彈藥（傷害計算機的總攻擊） */

/** 道具 id 前四碼 → 彈藥種類（遊戲自己的分類：2070 飛鏢給拳套、2060 弓的箭矢、2061 弩箭、2330 火槍的子彈） */
export const AMMO_KINDS = { 2070: "飛鏢", 2060: "箭矢", 2061: "弩箭", 2330: "子彈" };

/** 道具說明裡的「攻擊力 + N」（「攻擊力+25」「攻擊力+ 15」「攻擊力 + 1」都有）；箭矢、弩箭矢說明本來就沒寫，回 0 */
export function parseAmmoAttack(desc) {
  const match = /攻擊力\s*\+\s*(\d+)/.exec(desc ?? "");
  return match ? Number(match[1]) : 0;
}

/** 道具說明裡的「等級限制：N」，沒寫回 0 */
export function parseAmmoLevel(desc) {
  const match = /等級限制\s*[:：]\s*(\d+)/.exec(desc ?? "");
  return match ? Number(match[1]) : 0;
}

/** 一個彈藥道具 → GearAmmo；不是彈藥、不收錄、拿不到回 null（跟武器一樣不編造拿不到的東西） */
export function buildAmmo(item, ctx) {
  const kind = AMMO_KINDS[Math.floor(item.id / 1000)];
  if (!kind || item.un) return null;
  const src = buildSource(item, ctx);
  if (!hasAnySource(src)) return null;
  const ammo = { id: item.id, n: item.n, kind, atk: parseAmmoAttack(item.d), lv: parseAmmoLevel(item.d), src };
  if (ctx.v002Date && allSourcesV002(src)) ammo.o = ctx.v002Date;
  return ammo;
}
```

`pipeline/build-gear.mjs`：import 加 `buildAmmo`；`armor` 之後加

```js
  // 彈藥（傷害計算機算總攻擊用）：飛鏢、箭矢、弩箭、子彈，只收拿得到的
  const ammo = items
    .map(item => buildAmmo(item, ctx))
    .filter(Boolean)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.atk - b.atk || a.id - b.id);
```

`gear` 物件在 `armor,` 後面加 `ammo,`；console 在法師防具那行後面加

```js
  console.log(`[gear] 彈藥 ${ammo.length} 種：${["飛鏢", "箭矢", "弩箭", "子彈"].map(kind => `${kind} ${ammo.filter(entry => entry.kind === kind).length}`).join("、")}`);
```

開頭註解「輸出：」那段補一行：`ammo（彈藥）：飛鏢、箭矢、弩箭、子彈的攻擊力（道具說明抽）、等級限制、拿法，傷害計算機算總攻擊用`。

`src/lib/gear.ts`：在 `GearScroll` 型別後面加

```ts
/** 彈藥（pipeline/lib/gear.mjs 的 buildAmmo）：kind 照道具 id 前四碼，atk／lv 從道具說明抽，src 同武器 */
export type GearAmmo = { id: number; n: string; kind: "飛鏢" | "箭矢" | "弩箭" | "子彈"; atk: number; lv: number; src: GearSource; o?: string };
```

`GearData` 加一欄（optional，舊的 gear.json 沒有也不壞）：`  /** 彈藥，傷害計算機用 */\n  ammo?: GearAmmo[];`

- [ ] **Step 4：跑測試確認通過、重產資料**

Run：`node --test pipeline/lib/gear.test.mjs` → PASS
Run：`node pipeline/build-gear.mjs` → 印出「彈藥 N 種：飛鏢 …」，飛鏢至少 10、子彈至少 5。
確認：`node -e "const g=require('./public/data/gear.json');console.log(g.ammo.find(a=>a.id===2070000))"` 印出海星鏢 atk 15、有 shops。

- [ ] **Step 5：Commit**

```bash
git add pipeline/lib/gear.mjs pipeline/lib/gear.test.mjs pipeline/build-gear.mjs src/lib/gear.ts public/data/gear.json
git commit -m "v0.79 (1/8): gear.json 多一欄彈藥——飛鏢、箭矢、弩箭、子彈的攻擊力從道具說明抽，拿法跟武器同一套"
```

---

### Task 2：傷害公式（damage.ts）

**Files:**
- Create: `src/lib/damage.ts`
- Test: `src/lib/__tests__/damage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Stats = Record<StatKey, number>;
  export type Range = { min: number; max: number };
  export type Element = "f" | "i" | "l" | "p" | "h";
  export const PANEL_COEF: Record<string, { min: number; max: number; main: StatKey; sec: StatKey[] }>;
  export const NO_MASTERY = 0.1;
  export function rawPanel(type: string, stats: Stats, attack: number, mastery: number): Range | null;
  export function floorRange(range: Range): Range;
  export function panelRange(type: string, stats: Stats, attack: number, mastery: number): Range | null;
  export function luckySevenBase(stats: Stats, attack: number): Range;
  export function dragonRoarBase(stats: Stats, attack: number, mastery: number): Range;
  export function arrowBombBase(stats: Stats, attack: number): Range;
  export function magicBase(int: number, magic: number, spellAttack: number, mastery: number): Range;
  export function levelGap(charLevel: number, mobLevel: number): number;
  export function elementFactor(element: Element | undefined, mobEl: Record<string, string> | undefined): number | "immune";
  export function chargeFactor(element: Element, level: number, percent: number, mobEl: Record<string, string> | undefined): number | "immune";
  export function combineFactors(factors: Array<number | "immune">): number | "immune";
  export type HitTarget = { lv: number; pdd: number; mdd: number };
  export type HitInput = { base: Range; magic: boolean; modifier: number | "immune"; ignoreDefense: boolean; multiplier: number; charLevel: number; target: HitTarget | null };
  export function hitRange(input: HitInput): Range;
  export function average(range: Range): number;
  export function expectedHit(normal: Range, crit: Range | null, rate: number): number;
  export function killCounts(hp: number, expectedUse: number, bestUse: number, worstUse: number): { avg: number; fastest: number; slowest: number };
  export function diffPercent(a: number, b: number): number;
  export function sureHitAccuracy(charLevel: number, monster: { lv: number | null; eva: number }): number;
  ```

- [ ] **Step 1：寫會失敗的測試** `src/lib/__tests__/damage.test.ts`

```ts
/**
 * 傷害公式（src/lib/damage.ts）。例子出自研究筆記：
 * side-session-notes/local_88ec5ceb…/2026-10-08-傷害公式研究.md、local_bac19159…/2026-10-08-傷害公式補查.md
 */
import { describe, expect, it } from "vitest";
import {
  arrowBombBase,
  average,
  chargeFactor,
  combineFactors,
  diffPercent,
  dragonRoarBase,
  elementFactor,
  expectedHit,
  hitRange,
  killCounts,
  levelGap,
  luckySevenBase,
  magicBase,
  panelRange,
  rawPanel,
  sureHitAccuracy,
} from "@/lib/damage";

const stats = (STR: number, DEX: number, INT: number, LUK: number) => ({ STR, DEX, INT, LUK });

describe("能力視窗攻擊力（波波：依客戶端計算式整理）", () => {
  it("拳套：主幸運、副力＋敏，上下限各自取整", () => {
    // 刺客 50 一般點法：幸 172、敏 90、力 4，赤紅手甲 26＋海星鏢 15，精準暗器 20 級 60%
    expect(panelRange("拳套", stats(4, 90, 4, 172), 41, 0.6)).toEqual({ min: 175, max: 292 });
  });
  it("單手斧上下限係數不同（3.2／4.4）", () => {
    const r = rawPanel("單手斧", stats(100, 20, 4, 4), 50, 0.6)!;
    expect(r.max).toBeCloseTo(((4.4 * 100 + 20) * 50) / 100);
    expect(r.min).toBeCloseTo(((3.2 * 100 * 0.9 * 0.6 + 20) * 50) / 100);
  });
  it("弓：主敏、副力；不認得的武器回 null", () => {
    expect(rawPanel("弓", stats(55, 207, 4, 4), 66, 0.6)!.max).toBeCloseTo(((3.4 * 207 + 55) * 66) / 100);
    expect(rawPanel("短杖", stats(4, 4, 200, 4), 30, 0.6)).toBeNull();
  });
});

describe("技能基本傷害（舊版公式）", () => {
  it("雙飛斬：幸運×5.0／×2.5×攻÷100，乘 150% 後＝研究的例子 187～375", () => {
    const base = luckySevenBase(stats(4, 25, 4, 100), 50);
    expect(base).toEqual({ min: 125, max: 250 });
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 1.5, charLevel: 30, target: null })).toEqual({ min: 187, max: 375 });
    // 爆擊：150%＋100%＝250% → 312～625
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 2.5, charLevel: 30, target: null })).toEqual({ min: 312, max: 625 });
  });
  it("龍咆哮：力量係數固定 4.0", () => {
    const r = dragonRoarBase(stats(300, 60, 4, 4), 100, 0.6);
    expect(r.max).toBeCloseTo(((300 * 4 + 60) * 100) / 100);
    expect(r.min).toBeCloseTo(((300 * 4 * 0.6 * 0.9 + 60) * 100) / 100);
  });
  it("強弓／強弩：除以 150、熟練度固定 10%", () => {
    const r = arrowBombBase(stats(50, 200, 4, 4), 75);
    expect(r.max).toBeCloseTo(((200 * 3.4 + 50) * 75) / 150);
    expect(r.min).toBeCloseTo(((200 * 3.4 * 0.1 * 0.9 + 50) * 75) / 150);
  });
  it("魔法：魔攻含智力，熟練度看法術", () => {
    // 智 208、黃色雨傘魔攻 52 → 魔 260；火焰箭 30 級 基本攻擊 120、熟練度 60%
    const r = magicBase(208, 260, 120, 0.6);
    expect(r.max).toBeCloseTo(((260 * 260) / 1000 + 260) / 30 * 120 + (208 / 200) * 120);
    expect(r.min).toBeCloseTo(((260 * 260) / 1000 + 260 * 0.6 * 0.9) / 30 * 120 + (208 / 200) * 120);
  });
});

describe("打怪（舊版國際服公式，經典版沒驗證）", () => {
  const base = { min: 200, max: 400 };
  const target = { lv: 50, pdd: 100, mdd: 80 };
  it("等級差只算怪比較高的時候", () => {
    expect(levelGap(50, 55)).toBe(5);
    expect(levelGap(60, 55)).toBe(0);
  });
  it("物理：先扣防禦（上限×0.5、下限×0.6）再乘技能%", () => {
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 2, charLevel: 50, target })).toEqual({
      min: Math.floor((200 - 60) * 2),
      max: Math.floor((400 - 50) * 2),
    });
  });
  it("物理：怪高 10 級先乘 0.9 再扣防禦", () => {
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: false, multiplier: 1, charLevel: 40, target })).toEqual({
      min: Math.floor(200 * 0.9 - 60),
      max: Math.floor(400 * 0.9 - 50),
    });
  });
  it("魔法：扣 魔防×0.5／0.6×(1＋0.01×等級差)，不乘技能%", () => {
    expect(hitRange({ base, magic: true, modifier: 1, ignoreDefense: false, multiplier: 1, charLevel: 45, target })).toEqual({
      min: Math.floor(200 - 80 * 0.6 * 1.05),
      max: Math.floor(400 - 80 * 0.5 * 1.05),
    });
  });
  it("無視防禦：只乘等級差，不扣防禦", () => {
    expect(hitRange({ base, magic: false, modifier: 1, ignoreDefense: true, multiplier: 1, charLevel: 50, target })).toEqual({ min: 200, max: 400 });
  });
  it("扣到負的最少 1；免疫每下 1", () => {
    expect(hitRange({ base: { min: 10, max: 20 }, magic: false, modifier: 1, ignoreDefense: false, multiplier: 1, charLevel: 50, target })).toEqual({ min: 1, max: 1 });
    expect(hitRange({ base, magic: true, modifier: "immune", ignoreDefense: false, multiplier: 1, charLevel: 50, target })).toEqual({ min: 1, max: 1 });
  });
  it("屬性：弱 1.5、抗 0.5、免疫、沒寫 1；沒有屬性的攻擊一律 1", () => {
    expect(elementFactor("f", { f: "w" })).toBe(1.5);
    expect(elementFactor("i", { i: "r" })).toBe(0.5);
    expect(elementFactor("l", { l: "i" })).toBe("immune");
    expect(elementFactor("h", { f: "w" })).toBe(1);
    expect(elementFactor(undefined, { f: "w" })).toBe(1);
  });
  it("白騎士充能：一般乘 damage%，弱 ×(105%＋1.5%×等級)，抗 ×(95%−1.5%×等級)", () => {
    expect(chargeFactor("f", 30, 120, undefined)).toBeCloseTo(1.2);
    expect(chargeFactor("f", 30, 120, { f: "w" })).toBeCloseTo(1.2 * 1.5);
    expect(chargeFactor("f", 30, 120, { f: "r" })).toBeCloseTo(1.2 * 0.5);
    expect(chargeFactor("i", 30, 110, { i: "i" })).toBe("immune");
  });
  it("修正相乘，有一個免疫就免疫", () => {
    expect(combineFactors([1.4, 1.5])).toBeCloseTo(2.1);
    expect(combineFactors([1.5, "immune"])).toBe("immune");
    expect(combineFactors([])).toBe(1);
  });
});

describe("期望、幾下打死、差幾 %、命中", () => {
  it("期望：上下限平均；有爆擊照機率加權", () => {
    expect(average({ min: 100, max: 300 })).toBe(200);
    expect(expectedHit({ min: 100, max: 300 }, { min: 200, max: 400 }, 0.5)).toBe(250);
    expect(expectedHit({ min: 100, max: 300 }, null, 0.5)).toBe(200);
  });
  it("幾下打死：無條件進位", () => {
    expect(killCounts(3200, 611.8, 892, 330)).toEqual({ avg: 6, fastest: 4, slowest: 10 });
  });
  it("差幾 %：四捨五入；差不到 0.5% 是 0", () => {
    expect(diffPercent(611.8, 591.6)).toBe(3);
    expect(diffPercent(100.4, 100)).toBe(0);
  });
  it("必中命中：迴避×(3.68＋0.14×等級差) 無條件進位", () => {
    expect(sureHitAccuracy(50, { lv: 50, eva: 18 })).toBe(Math.ceil(18 * 3.68));
    expect(sureHitAccuracy(50, { lv: 55, eva: 20 })).toBe(Math.ceil(20 * (3.68 + 0.7)));
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage.test.ts`
Expected：FAIL（Cannot find module '@/lib/damage'）

- [ ] **Step 3：實作** `src/lib/damage.ts`

```ts
/**
 * 傷害計算機（/plan/damage，v0.79）的純公式。出處與可信度見 docs/superpowers/specs/2026-10-08-damage-calculator-design.md：
 * 能力視窗＝波波攻略島「依客戶端計算式整理」；技能基本傷害＝舊版公式（楓錄、楓憶、舊版公式彙整一致）；
 * 打怪（防禦、等級差、屬性）、爆擊、命中＝舊版國際服公式，經典版沒驗證。
 * 這裡不碰資料格式（技能表、預設值在 damage-skills.ts／damage-view.ts），測試在 __tests__/damage.test.ts。
 */
import type { StatKey } from "./gear";

export type Stats = Record<StatKey, number>;
export type Range = { min: number; max: number };
/** 火冰雷毒聖（怪物資料 el 的鍵） */
export type Element = "f" | "i" | "l" | "p" | "h";

/** 能力視窗的武器係數（下限／上限）、主屬性、副屬性（波波面板計算器；單手斧棍、雙手斧棍、槍矛的上下限係數不同） */
export const PANEL_COEF: Record<string, { min: number; max: number; main: StatKey; sec: StatKey[] }> = {
  單手劍: { min: 4.0, max: 4.0, main: "STR", sec: ["DEX"] },
  雙手劍: { min: 4.6, max: 4.6, main: "STR", sec: ["DEX"] },
  單手斧: { min: 3.2, max: 4.4, main: "STR", sec: ["DEX"] },
  單手棍: { min: 3.2, max: 4.4, main: "STR", sec: ["DEX"] },
  雙手斧: { min: 3.4, max: 4.8, main: "STR", sec: ["DEX"] },
  雙手棍: { min: 3.4, max: 4.8, main: "STR", sec: ["DEX"] },
  槍: { min: 3.0, max: 5.0, main: "STR", sec: ["DEX"] },
  矛: { min: 3.0, max: 5.0, main: "STR", sec: ["DEX"] },
  短刀: { min: 3.6, max: 3.6, main: "LUK", sec: ["STR", "DEX"] },
  拳套: { min: 3.6, max: 3.6, main: "LUK", sec: ["STR", "DEX"] },
  弓: { min: 3.4, max: 3.4, main: "DEX", sec: ["STR"] },
  弩: { min: 3.6, max: 3.6, main: "DEX", sec: ["STR"] },
  指虎: { min: 4.8, max: 4.8, main: "STR", sec: ["DEX"] },
  火槍: { min: 3.6, max: 3.6, main: "DEX", sec: ["STR"] },
};

/** 沒學精準技能的熟練度 */
export const NO_MASTERY = 0.1;

/** 能力視窗攻擊力，不取整（技能計算接著用）：上限＝(上限係數×主＋副)×攻÷100，下限＝(下限係數×主×0.9×熟＋副)×攻÷100 */
export function rawPanel(type: string, stats: Stats, attack: number, mastery: number): Range | null {
  const coef = PANEL_COEF[type];
  if (!coef) return null;
  const main = stats[coef.main];
  const sec = coef.sec.reduce((sum, key) => sum + stats[key], 0);
  return {
    min: ((coef.min * main * 0.9 * mastery + sec) * attack) / 100,
    max: ((coef.max * main + sec) * attack) / 100,
  };
}

export function floorRange(range: Range): Range {
  return { min: Math.floor(range.min), max: Math.floor(range.max) };
}

/** 能力視窗上顯示的攻擊力（無條件捨去） */
export function panelRange(type: string, stats: Stats, attack: number, mastery: number): Range | null {
  const raw = rawPanel(type, stats, attack, mastery);
  return raw && floorRange(raw);
}

/** 雙飛斬每一鏢的基本傷害（還沒乘 150%）：幸運×5.0／×2.5×攻÷100，跟精準暗器無關 */
export function luckySevenBase(stats: Stats, attack: number): Range {
  return { min: (stats.LUK * 2.5 * attack) / 100, max: (stats.LUK * 5.0 * attack) / 100 };
}

/** 龍咆哮：不用武器係數，力量固定 ×4.0 */
export function dragonRoarBase(stats: Stats, attack: number, mastery: number): Range {
  return {
    min: ((stats.STR * 4.0 * mastery * 0.9 + stats.DEX) * attack) / 100,
    max: ((stats.STR * 4.0 + stats.DEX) * attack) / 100,
  };
}

/** 強弓／強弩：用弓敲的公式，除以 150、熟練度固定 10% */
export function arrowBombBase(stats: Stats, attack: number): Range {
  return {
    min: ((stats.DEX * 3.4 * 0.1 * 0.9 + stats.STR) * attack) / 150,
    max: ((stats.DEX * 3.4 + stats.STR) * attack) / 150,
  };
}

/** 魔法：((魔²÷1000＋魔)÷30＋智÷200)×法術基本攻擊；下限把第二個魔換成 魔×熟×0.9。魔＝智力＋裝備魔攻＋增益 */
export function magicBase(int: number, magic: number, spellAttack: number, mastery: number): Range {
  const square = (magic * magic) / 1000;
  return {
    min: ((square + magic * mastery * 0.9) / 30 + int / 200) * spellAttack,
    max: ((square + magic) / 30 + int / 200) * spellAttack,
  };
}

/** 等級差：怪物比你高才算，你比怪高是 0 */
export function levelGap(charLevel: number, mobLevel: number): number {
  return Math.max(0, mobLevel - charLevel);
}

/** 屬性倍率：弱點 1.5、抗性 0.5、免疫（每下 1）、沒寫或攻擊沒有屬性 1 */
export function elementFactor(element: Element | undefined, mobEl: Record<string, string> | undefined): number | "immune" {
  if (!element) return 1;
  const value = mobEl?.[element];
  if (value === "w") return 1.5;
  if (value === "r") return 0.5;
  if (value === "i") return "immune";
  return 1;
}

/** 白騎士充能：一般怪乘 damage%；弱點再 ×(105%＋1.5%×充能等級)；抗性 ×(95%−1.5%×充能等級)；免疫 */
export function chargeFactor(element: Element, level: number, percent: number, mobEl: Record<string, string> | undefined): number | "immune" {
  const base = percent / 100;
  const value = mobEl?.[element];
  if (value === "i") return "immune";
  if (value === "w") return base * (1.05 + 0.015 * level);
  if (value === "r") return base * (0.95 - 0.015 * level);
  return base;
}

/** 好幾個修正相乘；有一個是免疫就整個免疫 */
export function combineFactors(factors: Array<number | "immune">): number | "immune" {
  let product = 1;
  for (const factor of factors) {
    if (factor === "immune") return "immune";
    product *= factor;
  }
  return product;
}

export type HitTarget = { lv: number; pdd: number; mdd: number };

/**
 * 每一下的傷害範圍（取整後）。順序照舊版公式彙整第 1～10 步：基本傷害×修正 → 扣防禦（物理先乘等級差）
 * → ×傷害倍率（(技能%＋爆擊加成)÷100，魔法給 1）→ 夾在 1～99,999 → 無條件捨去。target 是 null＝打木樁。
 */
export type HitInput = {
  base: Range;
  magic: boolean;
  modifier: number | "immune";
  ignoreDefense: boolean;
  multiplier: number;
  charLevel: number;
  target: HitTarget | null;
};

const clampHit = (value: number) => Math.min(99999, Math.max(1, Math.floor(value)));

export function hitRange(input: HitInput): Range {
  if (input.modifier === "immune") return { min: 1, max: 1 };
  let min = input.base.min * input.modifier;
  let max = input.base.max * input.modifier;
  const target = input.target;
  if (target) {
    const gap = levelGap(input.charLevel, target.lv);
    if (input.magic) {
      if (!input.ignoreDefense) {
        min -= target.mdd * 0.6 * (1 + 0.01 * gap);
        max -= target.mdd * 0.5 * (1 + 0.01 * gap);
      }
    } else {
      min *= 1 - 0.01 * gap;
      max *= 1 - 0.01 * gap;
      if (!input.ignoreDefense) {
        min -= target.pdd * 0.6;
        max -= target.pdd * 0.5;
      }
    }
  }
  return { min: clampHit(min * input.multiplier), max: clampHit(max * input.multiplier) };
}

export function average(range: Range): number {
  return (range.min + range.max) / 2;
}

/** 每一下的期望：上下限平均；有爆擊時 (1−機率)×一般＋機率×爆擊 */
export function expectedHit(normal: Range, crit: Range | null, rate: number): number {
  return crit ? (1 - rate) * average(normal) + rate * average(crit) : average(normal);
}

/** 幾次打死：約＝HP÷一次期望，最快＝HP÷一次最高，最慢＝HP÷一次最低，都無條件進位 */
export function killCounts(hp: number, expectedUse: number, bestUse: number, worstUse: number): { avg: number; fastest: number; slowest: number } {
  return { avg: Math.ceil(hp / expectedUse), fastest: Math.ceil(hp / bestUse), slowest: Math.ceil(hp / worstUse) };
}

/** a 比 b 多幾 %（四捨五入到整數，b 比較大時是負的） */
export function diffPercent(a: number, b: number): number {
  return Math.round((a / b - 1) * 100);
}

/** 物理必中的命中：迴避×(3.68＋0.14×等級差)（舊版公式彙整；波波命中門檻同一條） */
export function sureHitAccuracy(charLevel: number, monster: { lv: number | null; eva: number }): number {
  return Math.ceil(monster.eva * (3.68 + 0.14 * levelGap(charLevel, monster.lv ?? 0)));
}
```

- [ ] **Step 4：跑測試確認通過**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage.test.ts` → PASS（全部）

- [ ] **Step 5：Commit**

```bash
git add src/lib/damage.ts src/lib/__tests__/damage.test.ts
git commit -m "v0.79 (2/8): 傷害公式——能力視窗、雙飛斬、龍咆哮、強弓、魔法、扣防禦、屬性、充能、爆擊期望、幾下打死"
```

---

### Task 3：技能表（damage-skills.ts）

**Files:**
- Create: `src/lib/damage-skills.ts`
- Test: `src/lib/__tests__/damage-skills.test.ts`

**Interfaces:**
- Consumes：`Element` from `./damage`；`Skill` from `./types`；`jobLineage` from `./planner`；`jobTier` from `./jobs`；`isMagicJob` from `./gear`。
- Produces:
  ```ts
  export type DamageKind = "normal" | "lucky" | "dragonRoar" | "arrowBomb" | "magic";
  export type SkillRule = { hits?: number; kind: DamageKind; element?: Element; crit?: "throw" | "bow"; ignoreDef?: "always" | "notHigher"; pierce?: true; weapons?: string[]; note?: string };
  export const BASIC_ATTACK = 0;
  export const BASIC_RULE: SkillRule;
  export const SKILL_RULES: Record<number, SkillRule>;
  export const NOT_CALCULATED: Record<number, string>;
  export const CRIT_SKILL: { throw: number; bow: number };   // 4100001、3000001
  export const AMP_SKILLS: number[];                         // 2110001、2210001
  export const BUFFS: Array<{ id: number; stat: "pad" | "mad" }>;
  export const CHARGES: Array<{ id: number; element: Element; weapons: string[] }>;
  export function masterySkillFor(weaponType: string, job: number): number | null;
  export function hitsAt(rule: SkillRule, row: Record<string, number> | undefined): number;
  export function attackSkillIds(skills: Map<number, Skill>, job: number): number[];
  export function notCalculatedFor(skills: Map<number, Skill>, job: number): Array<{ id: number; name: string; reason: string }>;
  ```

- [ ] **Step 1：寫會失敗的測試** `src/lib/__tests__/damage-skills.test.ts`

```ts
/**
 * 技能表：真資料常駐檢查（跟 gear-realdata.test.ts 同一招直接讀 public/data）——
 * skills.json 裡經典版職業每個有 damage 或 mad 的技能，都要在技能表裡（算、或列為沒算／增益／充能／爆擊被動），
 * 遊戲資料進來新技能沒處理就紅。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AMP_SKILLS,
  BASIC_ATTACK,
  BUFFS,
  CHARGES,
  CRIT_SKILL,
  NOT_CALCULATED,
  SKILL_RULES,
  attackSkillIds,
  hitsAt,
  masterySkillFor,
  notCalculatedFor,
} from "@/lib/damage-skills";
import { JOB_OPTIONS } from "@/lib/jobs";
import type { Skill } from "@/lib/types";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const skillList = JSON.parse(fs.readFileSync(`${DATA}skills.json`, "utf8")) as Skill[];
const skills = new Map(skillList.map(skill => [skill.id, skill]));
const classicJobs = new Set(JOB_OPTIONS.map(job => job.id));

describe("真資料：每個攻擊技能都有處理", () => {
  const handled = new Set<number>([
    ...Object.keys(SKILL_RULES).map(Number),
    ...Object.keys(NOT_CALCULATED).map(Number),
    ...BUFFS.map(buff => buff.id),
    ...CHARGES.map(charge => charge.id),
    CRIT_SKILL.throw,
    CRIT_SKILL.bow,
  ]);
  const attacking = skillList.filter(skill => classicJobs.has(skill.job) && skill.levels?.some(row => row.damage || row.mad));
  it.each(attacking.map(skill => [skill.id, skill.n] as const))("%s %s", id => {
    expect(handled.has(id)).toBe(true);
  });
  it("技能表裡的 id 都存在、而且不會同時算又列為沒算", () => {
    for (const id of Object.keys(SKILL_RULES).map(Number)) {
      expect(skills.has(id), String(id)).toBe(true);
      expect(NOT_CALCULATED[id], String(id)).toBeUndefined();
    }
  });
  it("增益、充能、魔力激發、爆擊被動的 id 都存在", () => {
    for (const id of [...BUFFS.map(b => b.id), ...CHARGES.map(c => c.id), ...AMP_SKILLS, CRIT_SKILL.throw, CRIT_SKILL.bow]) {
      expect(skills.has(id), String(id)).toBe(true);
    }
  });
});

describe("下數照台服技能說明", () => {
  it("雙飛斬 2、四連箭 4、3連發 3、魔力爪 2、昇龍拳 2，其餘 1", () => {
    expect(hitsAt(SKILL_RULES[4001344], undefined)).toBe(2);
    expect(hitsAt(SKILL_RULES[3111006], undefined)).toBe(4);
    expect(hitsAt(SKILL_RULES[5210000], undefined)).toBe(3);
    expect(hitsAt(SKILL_RULES[2001005], undefined)).toBe(2);
    expect(hitsAt(SKILL_RULES[5101003], undefined)).toBe(2);
    expect(hitsAt(SKILL_RULES[1001004], undefined)).toBe(1);
  });
  it("迴旋斬看該級 attackCount", () => {
    const savage = skills.get(4201005)!;
    expect(hitsAt(SKILL_RULES[4201005], savage.levels![0])).toBe(savage.levels![0].attackCount);
    expect(hitsAt(SKILL_RULES[4201005], savage.levels![29])).toBe(6);
  });
});

describe("職業能選的技能", () => {
  it("刺客：普通攻擊在最前，接一轉、二轉算得出來的攻擊技能", () => {
    const ids = attackSkillIds(skills, 410);
    expect(ids[0]).toBe(BASIC_ATTACK);
    expect(ids).toContain(4001344);
    expect(ids).toContain(4101005);
    expect(ids).not.toContain(4100001);
    expect(ids).not.toContain(4201005);
  });
  it("法師沒有普通攻擊", () => {
    expect(attackSkillIds(skills, 210)).not.toContain(BASIC_ATTACK);
    expect(attackSkillIds(skills, 210)).toContain(2101004);
  });
  it("十字軍的沒算清單有黑暗之劍、終極之劍", () => {
    const names = notCalculatedFor(skills, 111).map(entry => entry.name);
    expect(names).toContain("黑暗之劍");
    expect(names).toContain("終極之劍");
  });
});

describe("熟練度技能", () => {
  it("劍看職業線、拳套是精準暗器、指虎精通指虎、法杖沒有", () => {
    expect(masterySkillFor("單手劍", 111)).toBe(1100000);
    expect(masterySkillFor("雙手劍", 121)).toBe(1200000);
    expect(masterySkillFor("拳套", 411)).toBe(4100000);
    expect(masterySkillFor("指虎", 510)).toBe(5100001);
    expect(masterySkillFor("短杖", 210)).toBeNull();
    expect(masterySkillFor("拳套", 400)).toBeNull();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage-skills.test.ts`
Expected：FAIL（Cannot find module '@/lib/damage-skills'）

- [ ] **Step 3：實作** `src/lib/damage-skills.ts`

```ts
/**
 * 傷害計算機的技能表：每個攻擊技能一次打幾下、用哪條公式、什麼屬性、會不會爆擊、要什麼武器。
 * 下數依台服技能說明（skills.json 的 desc／levelText），特殊公式與爆擊、屬性依研究補查
 * （side-session-notes/local_bac19159…/2026-10-08-傷害公式補查.md）。查不到的放 NOT_CALCULATED，畫面列出原因。
 * 真資料測試 __tests__/damage-skills.test.ts 擋「遊戲資料有新的攻擊技能沒處理」。
 */
import type { Element } from "./damage";
import { isMagicJob } from "./gear";
import { jobTier } from "./jobs";
import { jobLineage } from "./planner";
import type { Skill } from "./types";

export type DamageKind = "normal" | "lucky" | "dragonRoar" | "arrowBomb" | "magic";

export type SkillRule = {
  /** 一次打幾下（台服說明），沒寫 1；該級有 attackCount 時以它為準（迴旋斬） */
  hits?: number;
  kind: DamageKind;
  element?: Element;
  /** throw＝強力投擲（拳套丟飛鏢）、bow＝霸王箭（弓、弩） */
  crit?: "throw" | "bow";
  /** always＝無視防禦（龍之獻祭）、notHigher＝角色等級 ≥ 怪物等級時無視（落葉斬） */
  ignoreDef?: "always" | "notHigher";
  /** 穿透之箭：後面每隻少一成 */
  pierce?: true;
  /** 台服說明寫明要的武器（「發射 2 個飛鏢」→ 拳套、「用短劍」→ 短刀） */
  weapons?: string[];
  /** 細節裡多寫的一句 */
  note?: string;
};

/** 「普通攻擊」用的假 id（不是遊戲技能） */
export const BASIC_ATTACK = 0;
export const BASIC_RULE: SkillRule = { kind: "normal" };

export const SKILL_RULES: Record<number, SkillRule> = {
  // 劍士
  1001004: { kind: "normal" }, // 魔天一擊
  1001005: { kind: "normal" }, // 劍氣縱橫
  1111008: { kind: "normal", note: "台服資料滿等只有攻擊力 30%，照資料算" }, // 虎咆哮
  1311003: { kind: "normal", weapons: ["槍"] }, // 無雙槍「揮舞長槍」
  1311004: { kind: "normal", weapons: ["矛"] }, // 無雙矛「揮舞矛」
  1311005: { kind: "normal", ignoreDef: "always" }, // 龍之獻祭「無視防禦的攻擊」
  1311006: { kind: "dragonRoar" }, // 龍咆哮
  // 法師
  2001004: { kind: "magic" }, // 魔靈彈
  2001005: { kind: "magic", hits: 2 }, // 魔力爪「攻擊一個敵人兩次」
  2101004: { kind: "magic", element: "f" }, // 火焰箭
  2101005: { kind: "magic", element: "p", note: "只算命中那一下，中毒的持續傷害沒算" }, // 毒霧
  2201004: { kind: "magic", element: "i" }, // 冰錐術
  2201005: { kind: "magic", element: "l" }, // 電閃雷鳴
  2301005: { kind: "magic", element: "h" }, // 神聖之箭
  2111002: { kind: "magic", element: "f" }, // 末日烈焰
  2111006: { kind: "magic", note: "火、毒混合屬性怎麼算查不到，沒套屬性" }, // 火毒合擊
  2211002: { kind: "magic", element: "i" }, // 冰風暴
  2211003: { kind: "magic", element: "l" }, // 落雷凝聚
  2211006: { kind: "magic", note: "冰、雷混合屬性怎麼算查不到，沒套屬性" }, // 冰雷合擊
  2311004: { kind: "magic", element: "h" }, // 聖光
  // 弓箭手
  3001004: { kind: "normal", crit: "bow" }, // 斷魂箭
  3001005: { kind: "normal", hits: 2, crit: "bow" }, // 二連箭「兩次攻擊」
  3101003: { kind: "arrowBomb", weapons: ["弓"] }, // 強弓
  3201003: { kind: "arrowBomb", weapons: ["弩"] }, // 強弩
  3201005: { kind: "normal", crit: "bow", pierce: true }, // 穿透之箭
  3111003: { kind: "normal", crit: "bow", weapons: ["弓"], note: "火屬性加成兩個來源寫法不同，沒套屬性" }, // 烈火箭
  3111004: { kind: "normal", crit: "bow", weapons: ["弓"] }, // 箭雨
  3111006: { kind: "normal", hits: 4, crit: "bow" }, // 四連箭「4 次攻擊」
  3211003: { kind: "normal", crit: "bow", weapons: ["弩"], note: "冰屬性加成兩個來源寫法不同，沒套屬性" }, // 寒冰箭
  3211004: { kind: "normal", crit: "bow", weapons: ["弩"] }, // 升龍弩
  3211006: { kind: "normal", hits: 4, crit: "bow" }, // 四連箭
  // 盜賊
  4001334: { kind: "normal", hits: 2, weapons: ["短刀"] }, // 劈空斬「用短劍刺殺敵人兩次」
  4001344: { kind: "lucky", hits: 2, crit: "throw", weapons: ["拳套"] }, // 雙飛斬「發射 2 個飛鏢」
  4101005: { kind: "normal", crit: "throw", weapons: ["拳套"] }, // 吸血術
  4201004: { kind: "normal" }, // 妙手術
  4201005: { kind: "normal", weapons: ["短刀"] }, // 迴旋斬（下數看 attackCount）
  4111005: { kind: "normal", crit: "throw", weapons: ["拳套"] }, // 風魔手裏劍（三個飛鏢是消耗量，不是下數）
  4211002: { kind: "normal", ignoreDef: "notHigher" }, // 落葉斬
  // 海盜
  5001001: { kind: "normal" }, // 衝擊拳
  5001002: { kind: "normal" }, // 旋風斬
  5001003: { kind: "normal", hits: 2, weapons: ["火槍"] }, // 雙子星攻擊「兩顆子彈」
  5101002: { kind: "normal" }, // 迴旋肘擊
  5101003: { kind: "normal", hits: 2 }, // 昇龍拳「連續兩次攻擊」
  5101004: { kind: "normal" }, // 狂暴衝擊
  5201001: { kind: "normal", weapons: ["火槍"] }, // 散射「發射子彈」
  5201002: { kind: "normal" }, // 炸彈投擲
  5201004: { kind: "normal", note: "子彈攻擊力算不算進去沒人確定，照算" }, // 偽裝射擊
  5201006: { kind: "normal", weapons: ["火槍"] }, // 脫離戰場「利用火槍的後座力」
  5111002: { kind: "normal" }, // 能量暴擊
  5111004: { kind: "normal" }, // 損人利己
  5111006: { kind: "normal" }, // 衝擊波
  5210000: { kind: "normal", hits: 3, weapons: ["火槍"] }, // 3連發
  5211004: { kind: "normal", element: "f", note: "持續燒傷沒算" }, // 火焰噴射
  5211005: { kind: "normal", element: "i" }, // 寒霜噴射
  5211006: { kind: "normal" }, // 指定攻擊
};

export const NOT_CALCULATED: Record<number, string> = {
  1100002: "被動、機率觸發，打幾隻查不到",
  1100003: "被動、機率觸發，打幾隻查不到",
  1200002: "被動、機率觸發，打幾隻查不到",
  1200003: "被動、機率觸發，打幾隻查不到",
  1300002: "被動、機率觸發，打幾隻查不到",
  1300003: "被動、機率觸發，打幾隻查不到",
  3100001: "被動、機率觸發，打幾隻查不到",
  3200001: "被動、機率觸發，打幾隻查不到",
  1111003: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1111004: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1111005: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1111006: "要看鬥氣珠數，鬥氣倍率各家寫法不同",
  1211002: "跟充能怎麼疊查不到",
  2111003: "毒霧的持續傷害怎麼算查不到",
  2311006: "召喚獸的傷害另有算法，沒查到",
  3111005: "召喚獸的傷害另有算法，沒查到",
  3211005: "召喚獸的傷害另有算法，沒查到",
  5211001: "召喚獸的傷害另有算法，沒查到",
  5211002: "召喚獸的傷害另有算法，沒查到",
  3110001: "不是爆擊，是貼臉時改成射箭＋秒殺機率，查不到專門公式",
  3210001: "不是爆擊，是貼臉時改成射箭＋秒殺機率，查不到專門公式",
  4111002: "分身追加的傷害沒算",
  1111002: "鬥氣集中的加成各家寫法不同",
};

export const CRIT_SKILL = { throw: 4100001, bow: 3000001 };
/** 魔力激發（三轉火毒、冰雷）：魔法基本傷害 × 該級 y% */
export const AMP_SKILLS = [2110001, 2210001];
/** 加攻擊／魔攻的增益（激勵、龍之魂、精神強化×2） */
export const BUFFS: Array<{ id: number; stat: "pad" | "mad" }> = [
  { id: 1101006, stat: "pad" },
  { id: 1311008, stat: "pad" },
  { id: 2101001, stat: "mad" },
  { id: 2201001, stat: "mad" },
];
const SWORDS = ["單手劍", "雙手劍"];
const BLUNTS = ["單手棍", "雙手棍"];
/** 白騎士充能：劍的烈焰／寒冰／雷鳴之劍，棍的之棍 */
export const CHARGES: Array<{ id: number; element: Element; weapons: string[] }> = [
  { id: 1211003, element: "f", weapons: SWORDS },
  { id: 1211004, element: "f", weapons: BLUNTS },
  { id: 1211005, element: "i", weapons: SWORDS },
  { id: 1211006, element: "i", weapons: BLUNTS },
  { id: 1211007, element: "l", weapons: SWORDS },
  { id: 1211008, element: "l", weapons: BLUNTS },
];

/** 武器種類 → 精準技能（劍看職業線：狂戰士線 1100000、騎士線 1200000）；這一線沒有就 null */
export function masterySkillFor(weaponType: string, job: number): number | null {
  const lineage = jobLineage(job);
  const has = (code: number) => lineage.includes(code);
  if (SWORDS.includes(weaponType)) return has(110) ? 1100000 : has(120) ? 1200000 : null;
  const table: Record<string, [number, number]> = {
    單手斧: [110, 1100001],
    雙手斧: [110, 1100001],
    單手棍: [120, 1200001],
    雙手棍: [120, 1200001],
    槍: [130, 1300000],
    矛: [130, 1300001],
    弓: [310, 3100000],
    弩: [320, 3200000],
    拳套: [410, 4100000],
    短刀: [420, 4200000],
    指虎: [510, 5100001],
    火槍: [520, 5200000],
  };
  const entry = table[weaponType];
  return entry && has(entry[0]) ? entry[1] : null;
}

/** 一次打幾下：該級有 attackCount 用它，否則用技能表的 hits，都沒有 1 */
export function hitsAt(rule: SkillRule, row: Record<string, number> | undefined): number {
  return row?.attackCount ?? rule.hits ?? 1;
}

/** 這個職業一路上來（一轉→三轉）算得出來的攻擊技能；物理職業最前面是普通攻擊 */
export function attackSkillIds(skills: Map<number, Skill>, job: number): number[] {
  const lineage = new Set(jobLineage(job));
  const ids = [...skills.values()]
    .filter(skill => lineage.has(skill.job) && SKILL_RULES[skill.id])
    .sort((a, b) => jobTier(a.job) - jobTier(b.job) || a.id - b.id)
    .map(skill => skill.id);
  return isMagicJob(job) ? ids : [BASIC_ATTACK, ...ids];
}

/** 這個職業一路上來沒算的技能（畫面列名字跟原因） */
export function notCalculatedFor(skills: Map<number, Skill>, job: number): Array<{ id: number; name: string; reason: string }> {
  const lineage = new Set(jobLineage(job));
  return [...skills.values()]
    .filter(skill => lineage.has(skill.job) && NOT_CALCULATED[skill.id])
    .sort((a, b) => jobTier(a.job) - jobTier(b.job) || a.id - b.id)
    .map(skill => ({ id: skill.id, name: skill.n, reason: NOT_CALCULATED[skill.id] }));
}
```

- [ ] **Step 4：跑測試確認通過**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage-skills.test.ts` → PASS。
若「每個攻擊技能都有處理」有紅：看是哪個 id，讀它在 skills.json 的 desc，照說明歸類（算的加進 SKILL_RULES、查不到的加進 NOT_CALCULATED 並寫原因），不要為了過測試亂歸。

- [ ] **Step 5：Commit**

```bash
git add src/lib/damage-skills.ts src/lib/__tests__/damage-skills.test.ts
git commit -m "v0.79 (3/8): 技能表——每個攻擊技能打幾下（台服說明）、公式種類、屬性、爆擊、要什麼武器；查不到的列原因"
```

---

### Task 4：預設值（damage-view.ts 前半）

**Files:**
- Create: `src/lib/damage-view.ts`
- Test: `src/lib/__tests__/damage-view.test.ts`

**Interfaces:**
- Consumes：`gearPlan`、`tabsFor` from `./gear-view`；`kitStats`、`isMagicJob`、`weaponTypesFor`、`GearAmmo`、`GearData`、`GearWeapon`、`StatKey` from `./gear`；`canJobUse` from `./item-view`；`jobOption`、`jobTier`、`minLevelFor`、`previousJob`、`SECOND_JOB_LEVEL`、`THIRD_JOB_LEVEL`、`stageJob`、`tierStartLevel` from `./jobs`；`jobLineage`、`planTraining` from `./planner`；`buildProgress`、`mainBuild`、`spAtLevel` from `./skill-plan`；Task 3 的 `attackSkillIds`、`BASIC_ATTACK`。
- Produces:
  ```ts
  export const LEVEL_CAP = 120;
  export type CalcData = { gear: GearData; skills: Map<number, Skill>; guides: Record<number, GuideJob | undefined>; monsters: Monster[]; maps: Record<string, MapRecord>; training: TrainingRow[]; beforeOpen: boolean };
  export type GroupConfig = { tab: string | null; level: number; weaponId: number | null; ammoId: number | null; extra: number; stats: Record<StatKey, number>; buffs: number[]; charge: number | null; levels: Record<number, number> };
  export type SharedConfig = { job: number; skillId: number; skillLevel: number; monsterId: number | null };
  export type CalcState = { shared: SharedConfig; groups: [GroupConfig, GroupConfig] };
  export const AMMO_KIND: Record<string, GearAmmo["kind"]>;
  export function branchName(job: number): string | undefined;
  export function skillLevelsAt(job: number, level: number, guides: CalcData["guides"], skills: Map<number, Skill>): { levels: Record<number, number>; guided: boolean };
  export function ammoChoices(ammo: GearAmmo[], weaponType: string): GearAmmo[];
  export function defaultAmmo(ammo: GearAmmo[], weaponType: string, level: number, beforeOpen: boolean): GearAmmo | null;
  export function weaponChoices(gear: GearData, job: number): GearWeapon[];
  export function clampLevel(job: number, level: number): number;
  export function defaultGroup(data: CalcData, job: number, level: number, tab: string | null): GroupConfig;
  export function defaultMonster(data: CalcData, job: number, level: number): number | null;
  export type MonsterChoice = { monster: Monster; v002: boolean };
  export function monsterChoices(monsters: Monster[], maps: Record<string, MapRecord>): MonsterChoice[];
  export function groupLabels(groups: [GroupConfig, GroupConfig]): [string, string];
  export function parseState(raw: string | null): CalcState | null;
  ```
  （`defaultSkill`、`defaultState` 在 Task 5，因為要用 `computeGroup` 比哪個技能最痛。）

- [ ] **Step 1：寫會失敗的測試** `src/lib/__tests__/damage-view.test.ts`

```ts
/**
 * 傷害計算機的預設值與組裝（src/lib/damage-view.ts），用真資料（public/data）跑：
 * 跟 gear-realdata.test.ts 一樣直接讀檔，不用假資料撐。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GearData } from "@/lib/gear";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "@/lib/types";
import {
  ammoChoices,
  clampLevel,
  defaultAmmo,
  defaultGroup,
  defaultMonster,
  groupLabels,
  monsterChoices,
  parseState,
  skillLevelsAt,
  weaponChoices,
  type CalcData,
} from "@/lib/damage-view";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = <T>(file: string) => JSON.parse(fs.readFileSync(`${DATA}${file}`, "utf8")) as T;
const gear = read<GearData>("gear.json");
const skillList = read<Skill[]>("skills.json");
const guides: Record<number, GuideJob | undefined> = {};
for (const file of fs.readdirSync(`${DATA}guides`)) {
  const code = Number(file.replace(".json", ""));
  if (Number.isFinite(code)) guides[code] = read<GuideJob>(`guides/${file}`);
}
const data: CalcData = {
  gear,
  skills: new Map(skillList.map(skill => [skill.id, skill])),
  guides,
  monsters: read<Monster[]>("monsters.json"),
  maps: read<Record<string, MapRecord>>("maps.json"),
  training: read<TrainingRow[]>("training.json"),
  // 測試固定當作已開放（10/15 之後），不跟著跑測試的日期變
  beforeOpen: false,
};

describe("技能等級照主流技能點法", () => {
  it("刺客 50：一轉的雙飛斬、二轉的精準暗器都有點", () => {
    const { levels, guided } = skillLevelsAt(410, 50, guides, data.skills);
    expect(guided).toBe(true);
    expect(levels[4001344]).toBeGreaterThan(0);
    expect(levels[4100000]).toBeGreaterThan(0);
  });
  it("刺客 25 還是一轉：二轉技能都是 0", () => {
    const { levels } = skillLevelsAt(410, 25, guides, data.skills);
    expect(levels[4100000] ?? 0).toBe(0);
  });
  it("沒有那一轉的攻略：那一轉的技能一律最高等級，guided 是 false", () => {
    const { levels, guided } = skillLevelsAt(410, 50, { ...guides, 410: undefined }, data.skills);
    expect(guided).toBe(false);
    expect(levels[4100000]).toBe(data.skills.get(4100000)!.levels!.length);
  });
});

describe("彈藥", () => {
  it("拳套只列飛鏢；預設是商店買得到的（海星鏢）", () => {
    const ammo = gear.ammo ?? [];
    expect(ammoChoices(ammo, "拳套").every(entry => entry.kind === "飛鏢")).toBe(true);
    expect(defaultAmmo(ammo, "拳套", 50, false)?.id).toBe(2070000);
  });
  it("不用彈藥的武器回空的", () => {
    expect(ammoChoices(gear.ammo ?? [], "單手劍")).toEqual([]);
    expect(defaultAmmo(gear.ammo ?? [], "單手劍", 50, false)).toBeNull();
  });
});

describe("武器選單", () => {
  it("刺客只有拳套；法師是有魔攻、職業用得到的", () => {
    expect(weaponChoices(gear, 410).every(weapon => weapon.s === "拳套")).toBe(true);
    const mage = weaponChoices(gear, 210);
    expect(mage.length).toBeGreaterThan(0);
    expect(mage.every(weapon => (weapon.mag ?? 0) > 0)).toBe(true);
  });
});

describe("一組的預設", () => {
  it("刺客 50 一般點法：赤紅手甲、幸 172、敏 90、海星鏢", () => {
    const group = defaultGroup(data, 410, 50, null);
    expect(group.tab).toBe("一般點法");
    expect(group.weaponId).toBe(1472019);
    expect(group.stats).toEqual({ STR: 4, DEX: 90, INT: 4, LUK: 172 });
    expect(group.ammoId).toBe(2070000);
  });
  it("刺客 50 全幸：敏捷含要湊的裝備（空身 25＋裝備）", () => {
    const group = defaultGroup(data, 410, 50, "全幸");
    expect(group.tab).toBe("全幸");
    expect(group.stats.LUK).toBe(237);
    expect(group.stats.DEX).toBeGreaterThan(25);
  });
  it("等級夾在職業的轉職等級到 120", () => {
    expect(clampLevel(411, 50)).toBe(70);
    expect(clampLevel(410, 200)).toBe(120);
  });
});

describe("怪物", () => {
  it("選單只收有中文名地圖的怪、依等級排、標出 V002", () => {
    const choices = monsterChoices(data.monsters, data.maps);
    expect(choices.length).toBeGreaterThan(50);
    expect(choices.every((choice, index) => index === 0 || (choices[index - 1].monster.lv ?? 0) <= (choice.monster.lv ?? 0))).toBe(true);
    expect(choices.some(choice => choice.v002)).toBe(true);
  });
  it("預設怪＝練功排行第一名那張圖的主力怪", () => {
    const id = defaultMonster(data, 410, 50);
    expect(id).not.toBeNull();
    expect(data.monsters.find(monster => monster.id === id)).toBeDefined();
  });
});

describe("組名", () => {
  const base = defaultGroup(data, 410, 50, null);
  it("點法不同寫點法名", () => {
    expect(groupLabels([base, { ...base, tab: "全幸" }])).toEqual(["一般點法", "全幸"]);
  });
  it("同點法不同等級寫等級", () => {
    expect(groupLabels([base, { ...base, level: 60 }])).toEqual(["Lv.50", "Lv.60"]);
  });
  it("都一樣寫左組、右組", () => {
    expect(groupLabels([base, base])).toEqual(["左組", "右組"]);
  });
});

describe("記下來的設定", () => {
  it("壞掉的字串、少欄位都當沒記", () => {
    expect(parseState(null)).toBeNull();
    expect(parseState("{")).toBeNull();
    expect(parseState(JSON.stringify({ shared: { job: 410 } }))).toBeNull();
  });
  it("正常的照原樣讀回來", () => {
    const group = defaultGroup(data, 410, 50, null);
    const state = { shared: { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null }, groups: [group, group] };
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage-view.test.ts`
Expected：FAIL（Cannot find module '@/lib/damage-view'）

- [ ] **Step 3：實作** `src/lib/damage-view.ts`（前半）

```ts
/**
 * 傷害計算機（/plan/damage）的預設值與組裝：兩組的點法、武器、能力值、彈藥、技能等級怎麼來，
 * 一組設定怎麼算成畫面要的一包（computeGroup）、一下／兩下打死的怪（killLists）。
 * 公式在 damage.ts、技能表在 damage-skills.ts；點法、武器沿用 gear-view.ts 的 gearPlan（不改它）。
 * 測試在 __tests__/damage-view.test.ts（真資料）。
 */
import { isMagicJob, kitStats, weaponTypesFor, type GearAmmo, type GearData, type GearWeapon, type StatKey } from "./gear";
import { gearPlan } from "./gear-view";
import { canJobUse } from "./item-view";
import { jobOption, jobTier, minLevelFor, previousJob, SECOND_JOB_LEVEL, stageJob, THIRD_JOB_LEVEL, tierStartLevel } from "./jobs";
import { jobLineage, planTraining } from "./planner";
import { buildProgress, mainBuild, spAtLevel } from "./skill-plan";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "./types";

/** 經典版等級上限（meta.json release.levelCap） */
export const LEVEL_CAP = 120;

export type CalcData = {
  gear: GearData;
  skills: Map<number, Skill>;
  /** 職業代碼 → 攻略（載不到的是 undefined） */
  guides: Record<number, GuideJob | undefined>;
  monsters: Monster[];
  maps: Record<string, MapRecord>;
  training: TrainingRow[];
  beforeOpen: boolean;
};

export type GroupConfig = {
  /** 點法標籤（「一般點法」「全幸」）；這個職業沒有第二套是 null */
  tab: string | null;
  level: number;
  weaponId: number | null;
  ammoId: number | null;
  /** 其他攻擊（法師是其他魔攻）：手套衝卷、其他裝備 */
  extra: number;
  stats: Record<StatKey, number>;
  /** 勾了的增益技能 id */
  buffs: number[];
  /** 白騎士充能技能 id */
  charge: number | null;
  /** 技能 id → 等級（精準、爆擊、魔力激發、增益、充能用；預設照技能點法） */
  levels: Record<number, number>;
};

export type SharedConfig = { job: number; skillId: number; skillLevel: number; monsterId: number | null };
export type CalcState = { shared: SharedConfig; groups: [GroupConfig, GroupConfig] };

/** 武器種類 → 彈藥種類 */
export const AMMO_KIND: Record<string, GearAmmo["kind"]> = { 拳套: "飛鏢", 弓: "箭矢", 弩: "弩箭", 火槍: "子彈" };

/** 一轉攻略有好幾條主流時（海盜分打手、槍手）用二轉職業名挑：二轉是自己、三轉是上一轉 */
export function branchName(job: number): string | undefined {
  const tier = jobTier(job);
  if (tier === 2) return jobOption(job)?.name;
  if (tier === 3) return jobOption(previousJob(job))?.name;
  return undefined;
}

/**
 * 照研究檔的主流技能點法，這個職業在這個等級每個技能點到幾級：一轉、二轉已經過了的用那一轉最後一級的點數，
 * 現在這一轉用現在的點數（skill-plan 的 buildProgress）。某一轉沒有攻略時那一轉的技能一律最高等級、guided＝false。
 */
export function skillLevelsAt(
  job: number,
  level: number,
  guides: CalcData["guides"],
  skills: Map<number, Skill>,
): { levels: Record<number, number>; guided: boolean } {
  const levels: Record<number, number> = {};
  let guided = true;
  const current = stageJob(job, level);
  for (const stage of [...jobLineage(job)].reverse()) {
    if (stage <= 0 || level < tierStartLevel(stage)) continue;
    const guide = guides[stage];
    const build = guide ? mainBuild(guide.builds, branchName(job)) : undefined;
    if (!build) {
      guided = false;
      for (const skill of skills.values()) if (skill.job === stage && skill.levels?.length) levels[skill.id] = skill.levels.length;
      continue;
    }
    const lastLevel = stage === current ? level : (jobTier(stage) === 1 ? SECOND_JOB_LEVEL : THIRD_JOB_LEVEL) - 1;
    const progress = buildProgress(build, spAtLevel(stage, lastLevel));
    for (const step of progress.steps) {
      if (step.id === null) continue;
      const reached = step.state === "done" ? step.to : step.state === "now" ? progress.current?.reached ?? 0 : 0;
      levels[step.id] = Math.max(levels[step.id] ?? 0, reached);
    }
  }
  return { levels, guided };
}

/** 這種武器用的彈藥，攻擊力低到高 */
export function ammoChoices(ammo: GearAmmo[], weaponType: string): GearAmmo[] {
  const kind = AMMO_KIND[weaponType];
  if (!kind) return [];
  return ammo.filter(entry => entry.kind === kind).sort((a, b) => a.atk - b.atk || a.lv - b.lv || a.id - b.id);
}

/** 預設彈藥：等級夠、現在拿得到的裡面，商店買得到的攻擊力最高那種；沒有商店賣的就挑拿得到的裡攻擊力最高的 */
export function defaultAmmo(ammo: GearAmmo[], weaponType: string, level: number, beforeOpen: boolean): GearAmmo | null {
  const usable = ammoChoices(ammo, weaponType).filter(entry => entry.lv <= level && !(beforeOpen && entry.o));
  const sold = usable.filter(entry => entry.src.shops?.some(shop => !(beforeOpen && shop.o)));
  const pool = sold.length ? sold : usable;
  return pool.length ? pool[pool.length - 1] : null;
}

/** 武器選單：物理職業照職業能用的種類，法師是有魔攻、職業用得到的（跟 gear.ts 的候選同一套規則），需求等級低到高 */
export function weaponChoices(gear: GearData, job: number): GearWeapon[] {
  const usable = (weapon: GearWeapon) => canJobUse(weapon.job, job) === true;
  const types = new Set(weaponTypesFor(job));
  const list = isMagicJob(job)
    ? gear.weapons.filter(weapon => (weapon.mag ?? 0) > 0 && usable(weapon))
    : gear.weapons.filter(weapon => types.has(weapon.s) && usable(weapon));
  return [...list].sort((a, b) => a.lv - b.lv || a.s.localeCompare(b.s) || a.id - b.id);
}

/** 等級夾在這個職業的轉職等級到 120 */
export function clampLevel(job: number, level: number): number {
  return Math.min(LEVEL_CAP, Math.max(minLevelFor(job), Math.round(level) || 1));
}

/** 一組的預設：gearPlan 的點法（含要湊的裝備）、主推武器、商店彈藥、技能點法的等級；其他攻擊 0、增益不勾 */
export function defaultGroup(data: CalcData, job: number, level: number, tab: string | null): GroupConfig {
  const lv = clampLevel(job, level);
  const plan = gearPlan(data.gear, job, lv, data.beforeOpen, tab);
  const naked = plan.targets ?? { STR: 4, DEX: 4, INT: 4, LUK: 4 };
  const stats = plan.rule?.kit?.length && plan.targets ? kitStats(plan.rule.kit, lv, plan.targets, data.beforeOpen).stats : naked;
  const weapon = plan.best;
  return {
    tab: plan.rule?.tab ?? null,
    level: lv,
    weaponId: weapon?.id ?? null,
    ammoId: weapon ? defaultAmmo(data.gear.ammo ?? [], weapon.s, lv, data.beforeOpen)?.id ?? null : null,
    extra: 0,
    stats: { ...stats },
    buffs: [],
    charge: null,
    levels: skillLevelsAt(job, lv, data.guides, data.skills).levels,
  };
}

/** 預設怪：練功排行（planTraining）以這個等級排出的第一名那張圖的主力怪 */
export function defaultMonster(data: CalcData, job: number, level: number): number | null {
  const byId = new Map(data.monsters.map(monster => [monster.id, monster]));
  return planTraining({ job, level }, data.training, byId, 1)[0]?.lead?.id ?? null;
}

export type MonsterChoice = { monster: Monster; v002: boolean };

/** 怪物選單：出現在有中文名地圖的怪（不收錄、沒有等級的不列），依等級低到高；v002＝出現的有名地圖全是 V002 的 */
export function monsterChoices(monsters: Monster[], maps: Record<string, MapRecord>): MonsterChoice[] {
  return monsters
    .filter(monster => !monster.un && monster.lv !== null)
    .map(monster => ({ monster, named: monster.maps.filter(id => maps[String(id)]?.zh) }))
    .filter(entry => entry.named.length > 0)
    .map(({ monster, named }) => ({ monster, v002: named.every(id => Boolean(maps[String(id)]?.o)) }))
    .sort((a, b) => (a.monster.lv ?? 0) - (b.monster.lv ?? 0) || a.monster.id - b.monster.id);
}

/** 兩組的名字：點法不同寫點法、等級不同寫等級、都一樣寫左組右組 */
export function groupLabels(groups: [GroupConfig, GroupConfig]): [string, string] {
  const [a, b] = groups;
  if (a.tab && b.tab && a.tab !== b.tab) return [a.tab, b.tab];
  if (a.level !== b.level) return [`Lv.${a.level}`, `Lv.${b.level}`];
  return ["左組", "右組"];
}

function isGroup(value: unknown): value is GroupConfig {
  const group = value as GroupConfig;
  return Boolean(group) && typeof group.level === "number" && typeof group.stats === "object" && Array.isArray(group.buffs) && typeof group.levels === "object";
}

/** 記在瀏覽紀錄裡的設定：壞掉或少欄位都當沒記（回 null，畫面改用預設） */
export function parseState(raw: string | null): CalcState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalcState;
    const shared = parsed?.shared;
    if (!shared || typeof shared.job !== "number" || typeof shared.skillId !== "number" || typeof shared.skillLevel !== "number") return null;
    if (!Array.isArray(parsed.groups) || parsed.groups.length !== 2 || !parsed.groups.every(isGroup)) return null;
    return parsed;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4：跑測試確認通過**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage-view.test.ts` → PASS。
（`defaultGroup(…, 410, 50, "全幸")` 的 LUK 237、一般點法的 DEX 90 / LUK 172 是 2026-10-08 用 gearPlan 實際跑出來的數字；若研究檔改過造成不同，先用 `gearPlan` 印出來核對，確認是研究檔改的才改測試。）

- [ ] **Step 5：Commit**

```bash
git add src/lib/damage-view.ts src/lib/__tests__/damage-view.test.ts
git commit -m "v0.79 (4/8): 計算機的預設值——兩組的點法、武器、能力值（含要湊的裝備）、彈藥、技能點法等級、預設怪"
```

---

### Task 5：算一組、兩組預設、一下／兩下名單（damage-view.ts 後半）

**Files:**
- Modify: `src/lib/damage-view.ts`（加在檔尾）
- Test: `src/lib/__tests__/damage-view.test.ts`（加 describe）

**Interfaces:**
- Consumes：Task 2 全部公式；Task 3 `SKILL_RULES`、`BASIC_RULE`、`BASIC_ATTACK`、`NOT_CALCULATED`、`CRIT_SKILL`、`AMP_SKILLS`、`BUFFS`、`CHARGES`、`masterySkillFor`、`hitsAt`、`attackSkillIds`；`statShortfall` from `./gear`；`tabsFor` from `./gear-view`。
- Produces:
  ```ts
  export type Unready = { ok: false; reason: string };
  export type HitPair = { hit: Range; use: Range; crit: { hit: Range; use: Range } | null };
  export type GroupResult = Unready | {
    ok: true; name: string; magic: boolean; hits: number; attack: number; panel: Range | null; magicPower: number | null;
    critRate: number | null; short: Array<{ stat: StatKey; short: number }>; notes: string[];
    raw: HitPair; vs: (HitPair & { kills: { avg: number; fastest: number; slowest: number }; accuracy: number | null }) | null;
    expectedUse: number;
  };
  export function computeGroup(data: CalcData, shared: SharedConfig, group: GroupConfig, target: Monster | null): GroupResult;
  export function defaultSkill(data: CalcData, job: number, group: GroupConfig): { skillId: number; skillLevel: number };
  export function defaultState(data: CalcData, job: number, level: number, buildTab: string | null): CalcState;
  export function regroup(data: CalcData, job: number, group: GroupConfig, change: { tab?: string | null; level?: number }): GroupConfig;
  export type KillEntry = { monster: Monster; v002: boolean; minUse: number };
  export function killLists(data: CalcData, shared: SharedConfig, group: GroupConfig, choices: MonsterChoice[]): { one: KillEntry[]; two: KillEntry[] } | null;
  export function diffText(labels: [string, string], a: GroupResult, b: GroupResult): string | null;
  export function sameGroups(groups: [GroupConfig, GroupConfig]): boolean;
  ```

- [ ] **Step 1：寫會失敗的測試**（加在 `damage-view.test.ts` 最後；import 補 `computeGroup, defaultSkill, defaultState, diffText, killLists, regroup, sameGroups`）

```ts
describe("算一組", () => {
  const shared = { job: 410, skillId: 4001344, skillLevel: 20, monsterId: null };
  const group = defaultGroup(data, 410, 50, null);
  it("刺客 50 一般點法雙飛斬：能力視窗 175～292、每鏢乘 150%、一次 2 鏢", () => {
    const result = computeGroup(data, shared, { ...group, levels: { ...group.levels, 4100000: 20, 4100001: 30 } }, null);
    if (!result.ok) throw new Error(result.reason);
    expect(result.panel).toEqual({ min: 175, max: 292 });
    expect(result.hits).toBe(2);
    // 幸 172、總攻 41：每鏢 172×2.5×41÷100×1.5＝264.45 → 264；172×5×41÷100×1.5＝528.9 → 528
    expect(result.raw.hit).toEqual({ min: 264, max: 528 });
    expect(result.raw.use).toEqual({ min: 528, max: 1056 });
    // 強力投擲 30 級：機率 50%、爆擊 150%＋100%
    expect(result.critRate).toBeCloseTo(0.5);
    expect(result.raw.crit!.hit).toEqual({ min: 440, max: 881 });
  });
  it("選了怪：扣防禦、算幾次打死、必中命中", () => {
    const dragon = data.monsters.find(monster => monster.n === "青龍")!;
    const result = computeGroup(data, shared, group, dragon);
    if (!result.ok) throw new Error(result.reason);
    expect(result.vs).not.toBeNull();
    expect(result.vs!.hit.max).toBeLessThan(result.raw.hit.max);
    expect(result.vs!.kills.avg).toBeGreaterThan(0);
    expect(result.vs!.accuracy).toBeGreaterThan(0);
  });
  it("武器用不了這個技能：寫原因不給數字", () => {
    const result = computeGroup(data, { ...shared, skillId: 4001334, skillLevel: 20 }, group, null);
    expect(result).toEqual({ ok: false, reason: "拳套用不了劈空斬" });
  });
  it("沒算的技能：寫原因", () => {
    const result = computeGroup(data, { ...shared, job: 111, skillId: 1111003, skillLevel: 30 }, defaultGroup(data, 111, 80, null), null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("鬥氣");
  });
  it("法師：魔攻＝智力＋武器魔攻＋其他；火焰箭打火弱的怪 ×1.5、法師沒有爆擊", () => {
    const mage = defaultGroup(data, 210, 40, null);
    const shared210 = { job: 210, skillId: 2101004, skillLevel: 30, monsterId: null };
    const raw = computeGroup(data, shared210, mage, null);
    if (!raw.ok) throw new Error(raw.reason);
    const weapon = gear.weapons.find(w => w.id === mage.weaponId)!;
    expect(raw.magicPower).toBe(mage.stats.INT + (weapon.mag ?? 0));
    expect(raw.critRate).toBeNull();
    // 沒有防禦、等級比角色低的假靶，只差在火弱不弱
    const plainTarget = { ...data.monsters[0], lv: 1, pdd: 0, mdd: 0, el: undefined };
    const weakTarget = { ...plainTarget, el: { f: "w" } };
    const plain = computeGroup(data, shared210, mage, plainTarget);
    const weak = computeGroup(data, shared210, mage, weakTarget);
    if (!plain.ok || !weak.ok) throw new Error("算不出來");
    expect(Math.abs(weak.vs!.hit.max - plain.vs!.hit.max * 1.5)).toBeLessThanOrEqual(1);
  });
  it("穿不上的武器照算，寫差幾點", () => {
    const weak = { ...group, stats: { ...group.stats, DEX: 25 } };
    const result = computeGroup(data, shared, weak, null);
    if (!result.ok) throw new Error(result.reason);
    expect(result.short).toEqual([{ stat: "DEX", short: 65 }]);
  });
});

describe("兩組預設", () => {
  it("刺客 50：左一般點法、右全幸，同等級；技能預設雙飛斬", () => {
    const state = defaultState(data, 410, 50, null);
    expect(state.groups[0].tab).toBe("一般點法");
    expect(state.groups[1].tab).toBe("全幸");
    expect(state.groups[1].level).toBe(50);
    expect(state.shared.skillId).toBe(4001344);
    expect(state.shared.monsterId).not.toBeNull();
  });
  it("首頁選了全幸：左全幸、右一般點法", () => {
    const state = defaultState(data, 410, 50, "全幸");
    expect(state.groups[0].tab).toBe("全幸");
    expect(state.groups[1].tab).toBe("一般點法");
  });
  it("狂戰士 50（沒有第二套）：右邊同一套、等級拉到下一把武器、武器是那把", () => {
    const state = defaultState(data, 110, 50, null);
    const next = gearPlanNext(110, 50);
    expect(next).not.toBeNull();
    expect(state.groups[1].level).toBe(next!.lv);
    expect(state.groups[1].weaponId).toBe(next!.id);
  });
  it("換點法、換等級：能力值、武器重設成那套那級的預設，其他攻擊、增益留著", () => {
    const group = { ...defaultGroup(data, 410, 50, null), extra: 7, buffs: [] };
    const changed = regroup(data, 410, group, { tab: "全幸" });
    expect(changed.tab).toBe("全幸");
    expect(changed.stats.LUK).toBe(237);
    expect(changed.extra).toBe(7);
    expect(regroup(data, 410, group, { level: 60 }).level).toBe(60);
  });
  it("兩組一樣看得出來", () => {
    const group = defaultGroup(data, 410, 50, null);
    expect(sameGroups([group, { ...group }])).toBe(true);
    expect(sameGroups([group, { ...group, extra: 1 }])).toBe(false);
  });
});

describe("一下／兩下打死", () => {
  const state = defaultState(data, 410, 50, null);
  const choices = monsterChoices(data.monsters, data.maps);
  const lists = killLists(data, { ...state.shared, skillId: 4001344, skillLevel: 20 }, state.groups[0], choices)!;
  it("兩張不重複、等級高到低", () => {
    const one = new Set(lists.one.map(entry => entry.monster.id));
    expect(lists.two.every(entry => !one.has(entry.monster.id))).toBe(true);
    for (const list of [lists.one, lists.two]) {
      expect(list.every((entry, index) => index === 0 || (list[index - 1].monster.lv ?? 0) >= (entry.monster.lv ?? 0))).toBe(true);
    }
  });
  it("一下＝最低一次 ≥ HP；兩下＝最低一次×2 ≥ HP", () => {
    expect(lists.one.length).toBeGreaterThan(0);
    expect(lists.one.every(entry => entry.minUse >= entry.monster.hp)).toBe(true);
    expect(lists.two.every(entry => entry.minUse < entry.monster.hp && entry.minUse * 2 >= entry.monster.hp)).toBe(true);
  });
});

describe("差多少的字", () => {
  const ok = (expectedUse: number) => ({ ok: true, expectedUse }) as unknown as Parameters<typeof diffText>[1];
  it("大的比小的多幾 %；差不到 1% 寫差不多；有一組算不出來不寫", () => {
    expect(diffText(["一般點法", "全幸"], ok(611.8), ok(591.6))).toBe("一般點法比全幸多約 3%");
    expect(diffText(["一般點法", "全幸"], ok(591.6), ok(611.8))).toBe("全幸比一般點法多約 3%");
    expect(diffText(["A", "B"], ok(100), ok(100.3))).toBe("兩組差不多");
    expect(diffText(["A", "B"], { ok: false, reason: "x" }, ok(1))).toBeNull();
  });
});

function gearPlanNext(job: number, level: number) {
  return gearPlan(gear, job, level, false, null).next;
}
```

（`gearPlan` 要 import：`import { gearPlan } from "@/lib/gear-view";` 加在測試檔 import 區。）

- [ ] **Step 2：跑測試確認失敗**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage-view.test.ts`
Expected：FAIL（computeGroup 等不是 export）

- [ ] **Step 3：實作**（`src/lib/damage-view.ts`：import 區補上，檔尾加）

import 區改成：

```ts
import {
  arrowBombBase,
  combineFactors,
  chargeFactor,
  diffPercent,
  dragonRoarBase,
  elementFactor,
  expectedHit,
  hitRange,
  killCounts,
  luckySevenBase,
  magicBase,
  NO_MASTERY,
  panelRange,
  rawPanel,
  sureHitAccuracy,
  type Range,
} from "./damage";
import {
  AMP_SKILLS,
  attackSkillIds,
  BASIC_ATTACK,
  BASIC_RULE,
  BUFFS,
  CHARGES,
  CRIT_SKILL,
  hitsAt,
  masterySkillFor,
  NOT_CALCULATED,
  SKILL_RULES,
} from "./damage-skills";
import { isMagicJob, kitStats, statShortfall, weaponTypesFor, type GearAmmo, type GearData, type GearWeapon, type StatKey } from "./gear";
import { gearPlan, tabsFor } from "./gear-view";
```

檔尾：

```ts
/* ------------------------------------------------------------------ 算一組 */

export type Unready = { ok: false; reason: string };
export type HitPair = { hit: Range; use: Range; crit: { hit: Range; use: Range } | null };
export type GroupResult =
  | Unready
  | {
      ok: true;
      name: string;
      magic: boolean;
      hits: number;
      /** 物理總攻擊（武器＋彈藥＋其他＋增益）；法師 0 */
      attack: number;
      /** 能力視窗攻擊力（取整）；法師、認不得的武器 null */
      panel: Range | null;
      /** 法師的魔攻（智力＋武器魔攻＋其他＋精神強化） */
      magicPower: number | null;
      critRate: number | null;
      short: Array<{ stat: StatKey; short: number }>;
      notes: string[];
      /** 打木樁 */
      raw: HitPair;
      /** 打選的怪；沒選怪 null */
      vs: (HitPair & { kills: { avg: number; fastest: number; slowest: number }; accuracy: number | null }) | null;
      /** 一次的期望（選了怪用扣完防禦的） */
      expectedUse: number;
    };

type Prepared = {
  ok: true;
  name: string;
  magic: boolean;
  hits: number;
  attack: number;
  panel: Range | null;
  magicPower: number | null;
  critRate: number | null;
  short: Array<{ stat: StatKey; short: number }>;
  notes: string[];
  at(target: Monster | null): { hit: Range; crit: Range | null };
};

const times = (range: Range, hits: number): Range => ({ min: range.min * hits, max: range.max * hits });

function rowAt(skill: Skill | undefined, level: number): Record<string, number> | null {
  if (!skill?.levels?.length || level <= 0) return null;
  return skill.levels[Math.min(level, skill.levels.length) - 1];
}

function prepare(data: CalcData, shared: SharedConfig, group: GroupConfig): Prepared | Unready {
  const job = shared.job;
  const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId);
  if (!weapon) return { ok: false, reason: "先選一把武器" };
  const isBasic = shared.skillId === BASIC_ATTACK;
  const skill = isBasic ? undefined : data.skills.get(shared.skillId);
  const rule = isBasic ? BASIC_RULE : SKILL_RULES[shared.skillId];
  if (!rule || (!isBasic && !skill)) {
    const reason = NOT_CALCULATED[shared.skillId];
    return { ok: false, reason: reason ? `這個技能沒算：${reason}` : "先選一個技能" };
  }
  const name = skill?.n ?? "普通攻擊";
  if (rule.weapons && !rule.weapons.includes(weapon.s)) return { ok: false, reason: `${weapon.s}用不了${name}` };

  const lineage = new Set(jobLineage(job));
  const inLine = (id: number) => lineage.has(data.skills.get(id)?.job ?? -1);
  const levelOf = (id: number) => group.levels[id] ?? 0;
  // 勾了的增益、選的充能：技能點法沒點的照最高等級（使用者自己勾的）
  const chosenRow = (id: number) => rowAt(data.skills.get(id), levelOf(id) || (data.skills.get(id)?.levels?.length ?? 0));
  const row = rowAt(skill, Math.max(1, shared.skillLevel)) ?? {};
  const magic = rule.kind === "magic";
  const buffSum = (stat: "pad" | "mad") =>
    BUFFS.filter(buff => buff.stat === stat && group.buffs.includes(buff.id) && inLine(buff.id)).reduce((sum, buff) => sum + (chosenRow(buff.id)?.[stat] ?? 0), 0);

  const ammo = (data.gear.ammo ?? []).find(entry => entry.id === group.ammoId && entry.kind === AMMO_KIND[weapon.s]);
  const attack = (weapon.atk ?? 0) + (ammo?.atk ?? 0) + group.extra + buffSum("pad");
  const masteryId = masterySkillFor(weapon.s, job);
  const masteryM = masteryId !== null ? rowAt(data.skills.get(masteryId), levelOf(masteryId))?.M : undefined;
  const mastery = masteryM ? masteryM / 100 : NO_MASTERY;
  const stats = group.stats;

  let base: Range | null;
  let magicPower: number | null = null;
  let amp = 1;
  if (magic) {
    magicPower = stats.INT + (weapon.mag ?? 0) + group.extra + buffSum("mad");
    base = magicBase(stats.INT, magicPower, row.mad ?? 0, (row.M ?? 0) / 100);
    const ampId = AMP_SKILLS.find(id => inLine(id) && levelOf(id) > 0);
    if (ampId !== undefined) amp = (rowAt(data.skills.get(ampId), levelOf(ampId))?.y ?? 100) / 100;
  } else if (rule.kind === "lucky") base = luckySevenBase(stats, attack);
  else if (rule.kind === "dragonRoar") base = dragonRoarBase(stats, attack, mastery);
  else if (rule.kind === "arrowBomb") base = arrowBombBase(stats, attack);
  else base = rawPanel(weapon.s, stats, attack, mastery);
  if (!base) return { ok: false, reason: `${weapon.s}的攻擊力公式查不到` };

  const percent = isBasic ? 100 : row.damage ?? 100;
  const critKind = rule.crit ?? (isBasic ? (weapon.s === "拳套" ? "throw" : weapon.s === "弓" || weapon.s === "弩" ? "bow" : undefined) : undefined);
  const critFits = critKind === "throw" ? weapon.s === "拳套" : critKind === "bow" ? weapon.s === "弓" || weapon.s === "弩" : false;
  const critId = critKind && critFits ? CRIT_SKILL[critKind] : null;
  const critRow = critId !== null && inLine(critId) ? rowAt(data.skills.get(critId), levelOf(critId)) : null;
  const crit = critRow ? { rate: (critRow.prop ?? 0) / 100, bonus: (critRow.damage ?? 100) - 100 } : null;

  const charge = group.charge !== null ? CHARGES.find(entry => entry.id === group.charge && entry.weapons.includes(weapon.s) && inLine(entry.id)) : undefined;
  const chargeLevel = charge ? levelOf(charge.id) || (data.skills.get(charge.id)?.levels?.length ?? 0) : 0;
  const chargePercent = charge ? chosenRow(charge.id)?.damage ?? 100 : 100;

  const notes: string[] = [];
  if (rule.note) notes.push(rule.note);
  if (rule.pierce) notes.push("穿透的第二隻起每隻少一成（這裡寫第一隻）");
  if (ammo && ammo.kind !== "飛鏢") notes.push(`${ammo.kind}的攻擊力算進總攻擊只有私服資料，台服沒驗證`);

  const finalBase = { min: base.min, max: base.max };
  return {
    ok: true,
    name,
    magic,
    hits: hitsAt(rule, row),
    attack: magic ? 0 : attack,
    panel: magic ? null : panelRange(weapon.s, stats, attack, mastery),
    magicPower,
    critRate: crit?.rate ?? null,
    short: statShortfall(weapon, stats),
    notes,
    at(target) {
      const factors: Array<number | "immune"> = [amp];
      if (rule.element && target) factors.push(elementFactor(rule.element, target.el));
      if (charge) factors.push(chargeFactor(charge.element, chargeLevel, chargePercent, target?.el));
      const modifier = combineFactors(factors);
      const hitTarget = target ? { lv: target.lv ?? 0, pdd: target.pdd ?? 0, mdd: target.mdd ?? 0 } : null;
      const ignoreDefense = rule.ignoreDef === "always" || (rule.ignoreDef === "notHigher" && target !== null && group.level >= (target.lv ?? 0));
      const input = { base: finalBase, magic, modifier, ignoreDefense, charLevel: group.level, target: hitTarget };
      return {
        hit: hitRange({ ...input, multiplier: magic ? 1 : percent / 100 }),
        crit: crit ? hitRange({ ...input, multiplier: (percent + crit.bonus) / 100 }) : null,
      };
    },
  };
}

function pairOf(prepared: Prepared, target: Monster | null): HitPair {
  const { hit, crit } = prepared.at(target);
  return { hit, use: times(hit, prepared.hits), crit: crit ? { hit: crit, use: times(crit, prepared.hits) } : null };
}

/** 一組設定算成畫面要的一包：能力視窗、打木樁、打選的怪（扣防禦、幾次打死、必中命中）、一次期望 */
export function computeGroup(data: CalcData, shared: SharedConfig, group: GroupConfig, target: Monster | null): GroupResult {
  const prepared = prepare(data, shared, group);
  if (!prepared.ok) return prepared;
  const raw = pairOf(prepared, null);
  const rate = prepared.critRate ?? 0;
  const expectedOf = (pair: HitPair) => prepared.hits * expectedHit(pair.hit, pair.crit?.hit ?? null, rate);
  let vs: Extract<GroupResult, { ok: true }>["vs"] = null;
  if (target) {
    const pair = pairOf(prepared, target);
    const best = pair.crit ? pair.crit.use.max : pair.use.max;
    vs = {
      ...pair,
      kills: killCounts(target.hp, expectedOf(pair), best, pair.use.min),
      accuracy: prepared.magic ? null : sureHitAccuracy(group.level, target),
    };
  }
  const { at: _at, ...rest } = prepared;
  return { ...rest, raw, vs, expectedUse: vs ? expectedOf(vs) : expectedOf(raw) };
}

/* ------------------------------------------------------------------ 預設技能、兩組預設 */

/** 預設技能：技能點法在這個等級有點、武器用得了的攻擊技能裡，打木樁一次期望最高的；都沒有就普通攻擊（法師是第一個法術） */
export function defaultSkill(data: CalcData, job: number, group: GroupConfig): { skillId: number; skillLevel: number } {
  const ids = attackSkillIds(data.skills, job);
  let best: { skillId: number; skillLevel: number; value: number } | null = null;
  for (const id of ids) {
    const skillLevel = id === BASIC_ATTACK ? 1 : group.levels[id] ?? 0;
    if (skillLevel <= 0) continue;
    const result = computeGroup(data, { job, skillId: id, skillLevel, monsterId: null }, group, null);
    if (result.ok && (!best || result.expectedUse > best.value)) best = { skillId: id, skillLevel, value: result.expectedUse };
  }
  if (best) return { skillId: best.skillId, skillLevel: best.skillLevel };
  const first = ids[0] ?? BASIC_ATTACK;
  return { skillId: first, skillLevel: first === BASIC_ATTACK ? 1 : data.skills.get(first)?.levels?.length ?? 1 };
}

/**
 * 兩組預設：左＝首頁選的點法（沒選＝主推）；右＝第二套點法（有的話），沒有就同一套、等級拉到下一把武器、武器換那把，
 * 連下一把都沒有就跟左邊一樣。技能、怪物用左組算。
 */
export function defaultState(data: CalcData, job: number, level: number, buildTab: string | null): CalcState {
  const tabs = tabsFor(data.gear.rules, job);
  const leftTab = buildTab && tabs.some(entry => entry.tab === buildTab) ? buildTab : tabs[0]?.tab ?? null;
  const left = defaultGroup(data, job, level, leftTab);
  const otherTab = tabs.find(entry => entry.tab !== left.tab)?.tab;
  let right: GroupConfig;
  if (otherTab) right = defaultGroup(data, job, left.level, otherTab);
  else {
    const next = gearPlan(data.gear, job, left.level, data.beforeOpen, leftTab).next;
    right = next ? withWeapon(data, defaultGroup(data, job, Math.max(next.lv, left.level), leftTab), next) : structuredClone(left);
  }
  return { shared: { job, ...defaultSkill(data, job, left), monsterId: defaultMonster(data, job, left.level) }, groups: [left, right] };
}

function withWeapon(data: CalcData, group: GroupConfig, weapon: GearWeapon): GroupConfig {
  const ammo = defaultAmmo(data.gear.ammo ?? [], weapon.s, group.level, data.beforeOpen);
  return { ...group, weaponId: weapon.id, ammoId: ammo?.id ?? null };
}

/** 換點法、換等級：能力值、武器、彈藥、技能等級重設成那套那級的預設；其他攻擊、增益、充能留著 */
export function regroup(data: CalcData, job: number, group: GroupConfig, change: { tab?: string | null; level?: number }): GroupConfig {
  const fresh = defaultGroup(data, job, change.level ?? group.level, change.tab !== undefined ? change.tab : group.tab);
  return { ...fresh, extra: group.extra, buffs: group.buffs, charge: group.charge };
}

export function sameGroups(groups: [GroupConfig, GroupConfig]): boolean {
  return JSON.stringify(groups[0]) === JSON.stringify(groups[1]);
}

/* ------------------------------------------------------------------ 一下／兩下打死 */

export type KillEntry = { monster: Monster; v002: boolean; minUse: number };

/**
 * 一下打死＝這組用一次選的技能、扣完防禦的最低一次 ≥ HP；兩下＝最低一次×2 ≥ HP、不在一下那張。爆擊不算（要穩穩打死）。
 * 等級高到低，同等級 HP 高的先。這組算不出來（武器用不了、沒算的技能）回 null。
 */
export function killLists(data: CalcData, shared: SharedConfig, group: GroupConfig, choices: MonsterChoice[]): { one: KillEntry[]; two: KillEntry[] } | null {
  const prepared = prepare(data, shared, group);
  if (!prepared.ok) return null;
  const one: KillEntry[] = [];
  const two: KillEntry[] = [];
  for (const { monster, v002 } of choices) {
    const minUse = prepared.at(monster).hit.min * prepared.hits;
    if (minUse >= monster.hp) one.push({ monster, v002, minUse });
    else if (minUse * 2 >= monster.hp) two.push({ monster, v002, minUse });
  }
  const order = (a: KillEntry, b: KillEntry) => (b.monster.lv ?? 0) - (a.monster.lv ?? 0) || b.monster.hp - a.monster.hp || a.monster.id - b.monster.id;
  return { one: one.sort(order), two: two.sort(order) };
}

/** 「一般點法比全幸多約 3%」：大的比小的；差不到 1% 寫「兩組差不多」；有一組算不出來不寫 */
export function diffText(labels: [string, string], a: GroupResult, b: GroupResult): string | null {
  if (!a.ok || !b.ok) return null;
  const [big, small, bigLabel, smallLabel] = a.expectedUse >= b.expectedUse ? [a, b, labels[0], labels[1]] : [b, a, labels[1], labels[0]];
  const percent = diffPercent(big.expectedUse, small.expectedUse);
  return percent < 1 ? "兩組差不多" : `${bigLabel}比${smallLabel}多約 ${percent}%`;
}
```

（`AMMO_KIND` 在 Task 4 已定義於同檔，`prepare` 直接用。）

- [ ] **Step 4：跑測試確認通過**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/damage-view.test.ts src/lib/__tests__/damage.test.ts src/lib/__tests__/damage-skills.test.ts` → PASS
Run：`node ../../../node_modules/typescript/bin/tsc --noEmit -p .` → 沒有錯誤
（`raw.crit!.hit` 的 440～881：每鏢基本 176.3～352.6 × 250% ＝ 440.75～881.5 → 440～881。若精準暗器／強力投擲在 skills.json 的數值不同，先印出 levels 核對再改。）

- [ ] **Step 5：Commit**

```bash
git add src/lib/damage-view.ts src/lib/__tests__/damage-view.test.ts
git commit -m "v0.79 (5/8): 算一組——打木樁、打怪、爆擊、幾次打死、必中命中；兩組預設、換點法換等級、一下／兩下打死名單、差多少"
```

---

### Task 6：計算機頁面（共用設定、結果、分頁設定、怎麼算的）

**Files:**
- Create: `src/app/plan/damage/page.tsx`
- Create: `src/app/plan/damage/DamageCalculator.tsx`
- Create: `src/app/plan/damage/parts.tsx`
- Delete（不 commit 的暫存）：`src/app/plan/damage-mock/`（候選版面頁，做完這個 task 刪掉）

**Interfaces:**
- Consumes：Task 4、5 的全部 export；`loadGear`、`loadSkills`、`loadMonsters`、`loadMaps`、`loadTraining`、`loadGuide`、`itemImage`、`skillImage`、`monsterImage` from `@/lib/data`；`useStoredProfile` from `@/lib/profile`；`useBuildChoice` from `@/lib/build-choice`；`useBeforeV002` from `@/lib/release`；`useVisitState` from `@/lib/visit-state`；`skillJobGroups`、`jobAvatar`、`minLevelFor` from `@/lib/jobs`；`gearPlan`、`tabsFor`、`STAT_ORDER`、`STAT_WORD`、`shortText` from `@/lib/gear-view`；`Sprite`、`SourceLinks` from `@/components/route/bits`；`ChoiceGroup` from `@/components/ChoiceGroup`；`LoadingBlock` from `@/components/PlanShell`；`ChevronRight`、`ChevronDown` from `@/components/Icons`。
- Produces：`DamageCalculator`（default export 不用，named export）；`parts.tsx` 匯出 `SharedCard`、`ResultCard`、`GroupEditor`、`HowCard`、`Tag`。Task 7 的 `KillCard` 會插在 `ResultCard` 與 `GroupEditor` 之間，props：`{ data: CalcData; state: CalcState; active: 0 | 1; label: string; onPick: (monsterId: number) => void; beforeOpen: boolean }`。

- [ ] **Step 1：page.tsx**

```tsx
import type { Metadata } from "next";
import { DamageCalculator } from "./DamageCalculator";

export const metadata: Metadata = {
  title: "傷害計算機｜兩套點法、兩把武器並排比打怪",
  description: "選職業、技能、武器跟能力值，算能力視窗攻擊力、技能每一下多少、打怪幾下打死；兩組並排看差多少，列出一下、兩下打得死的怪。",
  alternates: { canonical: "/plan/damage" },
};

export default function Page() {
  return <DamageCalculator />;
}
```

- [ ] **Step 2：DamageCalculator.tsx（資料、狀態、版面）**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "@/components/Icons";
import { LoadingBlock } from "@/components/PlanShell";
import { useBuildChoice } from "@/lib/build-choice";
import { loadGear, loadGuide, loadMaps, loadMonsters, loadSkills, loadTraining } from "@/lib/data";
import {
  computeGroup,
  defaultState,
  diffText,
  groupLabels,
  parseState,
  type CalcData,
  type CalcState,
  type GroupConfig,
  type SharedConfig,
} from "@/lib/damage-view";
import type { GearData } from "@/lib/gear";
import { minLevelFor } from "@/lib/jobs";
import { jobLineage } from "@/lib/planner";
import { useStoredProfile } from "@/lib/profile";
import { useBeforeV002 } from "@/lib/release";
import type { GuideJob, MapRecord, Monster, Skill, TrainingRow } from "@/lib/types";
import { useVisitState } from "@/lib/visit-state";
import { KillCard } from "./KillCard";
import { GroupEditor, HowCard, ResultCard, SharedCard } from "./parts";

type BaseData = { gear: GearData; skills: Map<number, Skill>; monsters: Monster[]; maps: Record<string, MapRecord>; training: TrainingRow[] };

/** 這個職業一路上來的攻略（一轉→三轉）；載完才回物件，載不到的那轉是 undefined（畫面退回技能最高等級） */
function useGuides(job: number): Record<number, GuideJob | undefined> | null {
  const [loaded, setLoaded] = useState<{ job: number; guides: Record<number, GuideJob | undefined> } | null>(null);
  useEffect(() => {
    if (job <= 0) return;
    let cancelled = false;
    const codes = jobLineage(job).filter(code => code > 0);
    Promise.all(codes.map(code => loadGuide(code).then(guide => [code, guide] as const, () => [code, undefined] as const))).then(entries => {
      if (!cancelled) setLoaded({ job, guides: Object.fromEntries(entries) });
    });
    return () => {
      cancelled = true;
    };
  }, [job]);
  return loaded?.job === job ? loaded.guides : null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/db" className="hover:text-[color:var(--maple)]">查資料</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">傷害計算機</span>
      </nav>
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">傷害計算機</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">選武器、能力值、技能，看打一下多痛；兩套並排，直接看差多少。</p>
      </header>
      {children}
    </div>
  );
}

export function DamageCalculator() {
  const { profile, loaded } = useStoredProfile();
  const beforeOpen = useBeforeV002();
  const [base, setBase] = useState<BaseData | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useVisitState<string | null>("damage:state", null);
  const [active, setActive] = useVisitState<number>("damage:tab", 0);
  // 換職業：先記下要換成誰，等那個職業的攻略載好再算預設
  const [pendingJob, setPendingJob] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadGear(), loadSkills(), loadMonsters(), loadMaps(), loadTraining()])
      .then(([gear, skills, monsters, maps, training]) => {
        if (!cancelled) setBase({ gear, skills: new Map(skills.map(skill => [skill.id, skill])), monsters, maps, training });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const savedState = useMemo(() => parseState(saved), [saved]);
  const job = pendingJob ?? savedState?.shared.job ?? profile.job;
  const [buildTab] = useBuildChoice(Math.max(job, 0));
  const guides = useGuides(job);
  const data: CalcData | null = useMemo(
    () => (base && guides ? { ...base, guides, beforeOpen } : null),
    [base, guides, beforeOpen],
  );
  const startLevel = Math.max(profile.level || 0, job > 0 ? minLevelFor(job) : 1);

  useEffect(() => {
    if (pendingJob === null || !data) return;
    setSaved(JSON.stringify(defaultState(data, pendingJob, Math.max(savedState?.groups[0].level ?? startLevel, minLevelFor(pendingJob)), buildTab)));
    setPendingJob(null);
  }, [pendingJob, data, savedState, startLevel, buildTab, setSaved]);

  const state: CalcState | null = useMemo(() => {
    if (pendingJob !== null || !data || job <= 0) return null;
    return savedState ?? defaultState(data, job, startLevel, buildTab);
  }, [pendingJob, data, job, savedState, startLevel, buildTab]);

  if (failed) return <Shell><p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px]">資料讀取失敗，重新整理一次試試。</p></Shell>;
  if (!loaded) return <Shell><LoadingBlock /></Shell>;

  const update = (next: CalcState) => setSaved(JSON.stringify(next));
  const pickJob = (next: number) => setPendingJob(next);

  if (job <= 0) {
    return (
      <Shell>
        <SharedCard data={null} state={null} job={job} onJob={pickJob} onShared={() => {}} beforeOpen={beforeOpen} />
        <p className="rounded-[var(--radius-card)] border border-dashed border-[color:var(--paper-edge)] px-4 py-8 text-center text-[15px] ink-soft">
          {job === 0 ? "轉職後才有攻擊技能可以算，先選一個職業看看" : "先選職業，下面就會算出來"}
        </p>
      </Shell>
    );
  }
  if (!data || !state) return <Shell><LoadingBlock label="整理武器、技能跟怪物中…" /></Shell>;

  const setShared = (patch: Partial<SharedConfig>) => update({ ...state, shared: { ...state.shared, ...patch } });
  const setGroup = (index: 0 | 1, next: GroupConfig) =>
    update({ ...state, groups: (index === 0 ? [next, state.groups[1]] : [state.groups[0], next]) as [GroupConfig, GroupConfig] });
  const target = state.shared.monsterId !== null ? data.monsters.find(monster => monster.id === state.shared.monsterId) ?? null : null;
  const results = [computeGroup(data, state.shared, state.groups[0], target), computeGroup(data, state.shared, state.groups[1], target)] as const;
  const labels = groupLabels(state.groups);
  const tab = (active === 1 ? 1 : 0) as 0 | 1;

  return (
    <Shell>
      <SharedCard data={data} state={state} job={job} onJob={pickJob} onShared={setShared} beforeOpen={beforeOpen} />
      <ResultCard data={data} state={state} labels={labels} results={results} target={target} diff={diffText(labels, results[0], results[1])} />
      <KillCard data={data} state={state} active={tab} label={labels[tab]} onPick={monsterId => setShared({ monsterId })} beforeOpen={beforeOpen} />
      <GroupEditor data={data} state={state} labels={labels} active={tab} onActive={index => setActive(index)} onGroup={setGroup} />
      <HowCard data={data} job={job} level={state.groups[0].level} />
    </Shell>
  );
}
```

注意：`KillCard` 是 Task 7 才建；這一步先在 `DamageCalculator.tsx` 暫時拿掉 `KillCard` 那行與 import，Task 7 再加回來。

- [ ] **Step 3：parts.tsx（共用設定卡、結果卡、分頁設定卡、怎麼算的）**

```tsx
"use client";

import { ChoiceGroup } from "@/components/ChoiceGroup";
import { Sprite, SourceLinks } from "@/components/route/bits";
import { itemImage, monsterImage, skillImage } from "@/lib/data";
import { ammoChoices, clampLevel, LEVEL_CAP, monsterChoices, regroup, sameGroups, skillLevelsAt, weaponChoices, type CalcData, type CalcState, type GroupConfig, type GroupResult, type SharedConfig } from "@/lib/damage-view";
import { AMP_SKILLS, attackSkillIds, BASIC_ATTACK, BUFFS, CHARGES, CRIT_SKILL, masterySkillFor, notCalculatedFor } from "@/lib/damage-skills";
import type { Range } from "@/lib/damage";
import { gearPlan, tabsFor, STAT_ORDER, STAT_WORD, shortText } from "@/lib/gear-view";
import { isMagicJob, type StatKey } from "@/lib/gear";
import { jobAvatar, minLevelFor, skillJobGroups } from "@/lib/jobs";
import { jobLineage } from "@/lib/planner";
import type { Monster } from "@/lib/types";

const fmt = (range: Range) => `${range.min.toLocaleString()}～${range.max.toLocaleString()}`;
const TONES = ["maple", "sky"] as const;

/** 可信度小標：照規格三級字樣 */
export function Tag({ level }: { level: "client" | "legacy" | "unverified" }) {
  const text = level === "client" ? "玩家依客戶端整理" : level === "legacy" ? "舊版公式" : "舊版國際服公式，經典版沒驗證";
  const tone = level === "unverified" ? "bg-[color:var(--gold-wash)] text-[color:var(--gold)]" : "bg-[color:var(--sky-wash)] text-[color:var(--sky)]";
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{text}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[color:var(--paper-edge)] py-2 last:border-0">
      <span className="shrink-0 text-[13px] font-bold ink-soft">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">{children}</span>
    </div>
  );
}

const SELECT = "min-w-0 max-w-[60vw] truncate rounded-lg border border-[color:var(--paper-edge)] bg-[color:var(--glass-strong)] px-2 py-1.5 text-[14px] font-bold sm:max-w-none";

/* ------------------------------------------------------------------ 共用設定 */

export function SharedCard({ data, state, job, onJob, onShared, beforeOpen }: {
  data: CalcData | null; state: CalcState | null; job: number; onJob: (job: number) => void; onShared: (patch: Partial<SharedConfig>) => void; beforeOpen: boolean;
}) {
  const avatar = job > 0 ? jobAvatar(job) : undefined;
  const skillIds = data && job > 0 ? attackSkillIds(data.skills, job) : [];
  const skill = data && state && state.shared.skillId !== BASIC_ATTACK ? data.skills.get(state.shared.skillId) : undefined;
  const missing = data && job > 0 ? notCalculatedFor(data.skills, job) : [];
  const monsters = data ? monsterChoices(data.monsters, data.maps) : [];
  return (
    <section aria-label="共用設定" className="rounded-[var(--radius-card)] glass wood-frame px-3.5 py-1.5">
      <Row label="職業">
        {avatar ? <Sprite src={avatar} size={22} /> : null}
        <select aria-label="職業" className={SELECT} value={job > 0 ? job : ""} onChange={event => onJob(Number(event.target.value))}>
          {job <= 0 ? <option value="">選職業</option> : null}
          {skillJobGroups().map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Row>
      {data && state ? (
        <>
          <Row label="技能">
            {skill ? <Sprite src={skillImage(skill.id)} size={22} /> : null}
            <select
              aria-label="技能"
              className={SELECT}
              value={state.shared.skillId}
              onChange={event => {
                const id = Number(event.target.value);
                const learned = state.groups[0].levels[id] ?? 0;
                const max = data.skills.get(id)?.levels?.length ?? 1;
                onShared({ skillId: id, skillLevel: id === BASIC_ATTACK ? 1 : learned || max });
              }}
            >
              {skillIds.map(id => <option key={id} value={id}>{id === BASIC_ATTACK ? "普通攻擊" : data.skills.get(id)?.n}</option>)}
            </select>
            {skill?.levels?.length ? (
              <select aria-label="技能等級" className={SELECT} value={state.shared.skillLevel} onChange={event => onShared({ skillLevel: Number(event.target.value) })}>
                {skill.levels.map((_, index) => <option key={index} value={index + 1}>Lv.{index + 1}</option>)}
              </select>
            ) : null}
          </Row>
          {missing.length ? <p className="pb-1 text-[12px] ink-faint">沒算的：{missing.map(entry => entry.name).filter((name, index, all) => all.indexOf(name) === index).join("、")}（原因在最下面）</p> : null}
          <Row label="打哪隻怪">
            {state.shared.monsterId !== null ? <Sprite src={monsterImage(state.shared.monsterId)} size={24} /> : null}
            <select
              aria-label="打哪隻怪"
              className={SELECT}
              value={state.shared.monsterId ?? ""}
              onChange={event => onShared({ monsterId: event.target.value === "" ? null : Number(event.target.value) })}
            >
              <option value="">不選怪（打木樁）</option>
              {monsters.map(({ monster, v002 }) => (
                <option key={monster.id} value={monster.id}>{`${monster.n} Lv.${monster.lv}${v002 && beforeOpen ? "（10/15 開放）" : ""}`}</option>
              ))}
            </select>
          </Row>
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ 結果 */

export function ResultCard({ data, state, labels, results, target, diff }: {
  data: CalcData; state: CalcState; labels: [string, string]; results: readonly [GroupResult, GroupResult]; target: Monster | null; diff: string | null;
}) {
  const first = results.find(result => result.ok);
  const name = first?.ok ? first.name : "技能";
  const hits = first?.ok ? first.hits : 1;
  const shown = (result: GroupResult) => (result.ok ? (result.vs ?? result.raw).use : null);
  const scale = Math.max(1, ...results.map(result => shown(result)?.max ?? 0));
  return (
    <section aria-label="結果" className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-3.5">
      <header className="flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="text-[15px] font-black">{name}一次（{hits} 下）</h2>
        {target ? <Tag level="unverified" /> : <Tag level="legacy" />}
      </header>
      {results.map((result, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-black" style={{ color: `var(--${TONES[index]})` }}>{labels[index]}</span>
            <span className="text-[20px] font-black tabular-nums">{result.ok ? fmt(shown(result)!) : "—"}</span>
          </div>
          {result.ok ? (
            <>
              <div className="relative h-3 rounded-full bg-[color:var(--paper-deep)]" aria-hidden>
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{ left: `${(shown(result)!.min / scale) * 100}%`, width: `${Math.max(1, ((shown(result)!.max - shown(result)!.min) / scale) * 100)}%`, background: `var(--${TONES[index]})` }}
                />
              </div>
              <p className="text-[12px] ink-soft">
                {[
                  result.vs && target ? `打${target.n}約 ${result.vs.kills.avg} 次` : null,
                  result.panel ? `能力視窗 ${fmt(result.panel)}` : result.magicPower !== null ? `魔攻 ${result.magicPower}` : null,
                ].filter(Boolean).join("・")}
              </p>
            </>
          ) : (
            <p className="text-[12px] ink-soft">{result.reason}</p>
          )}
        </div>
      ))}
      {sameGroups(state.groups) ? <p className="rounded-lg bg-[color:var(--paper-deep)] px-2.5 py-1.5 text-[13px]">兩組一樣，改下面右組的設定來比</p> : diff ? <p className="rounded-lg bg-[color:var(--leaf-wash)] px-2.5 py-1.5 text-[13px] font-bold">{diff}</p> : null}
      <details className="group">
        <summary className="cursor-pointer text-[13px] font-bold text-[color:var(--sky)]">看細節</summary>
        <Details labels={labels} results={results} target={target} />
      </details>
    </section>
  );
}

function Details({ labels, results, target }: { labels: [string, string]; results: readonly [GroupResult, GroupResult]; target: Monster | null }) {
  const cell = (result: GroupResult, pick: (ok: Extract<GroupResult, { ok: true }>) => string | null) => (result.ok ? pick(result) ?? "—" : "—");
  const rows: Array<[string, (ok: Extract<GroupResult, { ok: true }>) => string | null, ("client" | "legacy" | "unverified")?]> = [
    ["能力視窗攻擊力", ok => (ok.panel ? fmt(ok.panel) : null), "client"],
    ["魔攻", ok => (ok.magicPower !== null ? String(ok.magicPower) : null)],
    ["總攻擊", ok => (ok.magic ? null : String(ok.attack))],
    ["每一下（木樁）", ok => fmt(ok.raw.hit), "legacy"],
    ["爆擊那一下", ok => (ok.raw.crit && ok.critRate !== null ? `${fmt(ok.raw.crit.hit)}（${Math.round(ok.critRate * 100)}%）` : null), "unverified"],
  ];
  if (target) {
    rows.push(
      [`打${target.n}每一下`, ok => (ok.vs ? fmt(ok.vs.hit) : null), "unverified"],
      [`打${target.n}爆擊`, ok => (ok.vs?.crit ? fmt(ok.vs.crit.hit) : null), "unverified"],
      ["幾次打死", ok => (ok.vs ? `約 ${ok.vs.kills.avg}（最快 ${ok.vs.kills.fastest}、最慢 ${ok.vs.kills.slowest}）` : null), "unverified"],
      ["要不 miss，命中要", ok => (ok.vs?.accuracy ? String(ok.vs.accuracy) : null), "unverified"],
    );
  }
  const visible = rows.filter(([, pick]) => results.some(result => result.ok && pick(result) !== null));
  return (
    <div className="mt-2 space-y-2">
      <table className="w-full table-fixed text-[13px]">
        <thead>
          <tr>
            <th className="w-[38%]" />
            {labels.map((label, index) => <th key={index} className="pb-1 text-right text-[12px] font-black" style={{ color: `var(--${TONES[index]})` }}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {visible.map(([label, pick, level]) => (
            <tr key={label} className="border-t border-[color:var(--paper-edge)]">
              <th scope="row" className="py-1.5 pr-1 text-left text-[12px] font-bold ink-soft">
                {label}
                {level === "unverified" ? <span className="ml-1 text-[10px] text-[color:var(--gold)]">未驗證</span> : null}
              </th>
              {results.map((result, index) => <td key={index} className="py-1.5 text-right font-bold tabular-nums">{cell(result, pick)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {results.map((result, index) =>
        result.ok && (result.short.length || result.notes.length) ? (
          <p key={index} className="text-[12px] ink-soft">
            <span className="font-bold" style={{ color: `var(--${TONES[index]})` }}>{labels[index]}：</span>
            {[result.short.length ? `穿不上：${shortText(result.short)}（照樣算）` : null, ...result.notes].filter(Boolean).join("；")}
          </p>
        ) : null,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 分頁設定 */

function Stepper({ stat, value, onChange }: { stat: StatKey; value: number; onChange: (value: number) => void }) {
  const set = (next: number) => onChange(Math.max(4, Math.min(9999, Math.round(next) || 4)));
  return (
    <div className="rounded-lg bg-[color:var(--paper-deep)] px-1 py-1 text-center">
      <label className="block text-[11px] font-bold ink-soft" htmlFor={`stat-${stat}`}>{STAT_WORD[stat]}</label>
      <div className="flex items-center justify-center gap-1">
        <button type="button" aria-label={`${STAT_WORD[stat]}減 1`} className="grid size-8 place-items-center rounded-md bg-[color:var(--glass-strong)] text-[16px] font-black" onClick={() => set(value - 1)}>−</button>
        <input id={`stat-${stat}`} inputMode="numeric" className="w-14 bg-transparent text-center text-[17px] font-black tabular-nums" value={value} onChange={event => set(Number(event.target.value))} />
        <button type="button" aria-label={`${STAT_WORD[stat]}加 1`} className="grid size-8 place-items-center rounded-md bg-[color:var(--glass-strong)] text-[16px] font-black" onClick={() => set(value + 1)}>＋</button>
      </div>
    </div>
  );
}

function LevelSelect({ label, id, data, group, onChange }: { label: string; id: number; data: CalcData; group: GroupConfig; onChange: (levels: Record<number, number>) => void }) {
  const max = data.skills.get(id)?.levels?.length ?? 0;
  if (!max) return null;
  return (
    <Row label={label}>
      <select aria-label={label} className={SELECT} value={group.levels[id] ?? 0} onChange={event => onChange({ ...group.levels, [id]: Number(event.target.value) })}>
        {Array.from({ length: max + 1 }, (_, level) => <option key={level} value={level}>{level === 0 ? "沒學" : `Lv.${level}`}</option>)}
      </select>
    </Row>
  );
}

export function GroupEditor({ data, state, labels, active, onActive, onGroup }: {
  data: CalcData; state: CalcState; labels: [string, string]; active: 0 | 1; onActive: (index: 0 | 1) => void; onGroup: (index: 0 | 1, group: GroupConfig) => void;
}) {
  const job = state.shared.job;
  const group = state.groups[active];
  const set = (patch: Partial<GroupConfig>) => onGroup(active, { ...group, ...patch });
  const tabs = tabsFor(data.gear.rules, job);
  const weapons = weaponChoices(data.gear, job);
  const weapon = data.gear.weapons.find(entry => entry.id === group.weaponId);
  const ammo = weapon ? ammoChoices(data.gear.ammo ?? [], weapon.s) : [];
  const magic = isMagicJob(job);
  const lineage = new Set(jobLineage(job));
  const inLine = (id: number) => lineage.has(data.skills.get(id)?.job ?? -1);
  const buffs = BUFFS.filter(buff => inLine(buff.id));
  const charges = weapon ? CHARGES.filter(charge => inLine(charge.id) && charge.weapons.includes(weapon.s)) : [];
  const masteryId = weapon ? masterySkillFor(weapon.s, job) : null;
  const critId = weapon?.s === "拳套" ? CRIT_SKILL.throw : weapon && (weapon.s === "弓" || weapon.s === "弩") ? CRIT_SKILL.bow : null;
  const ampId = AMP_SKILLS.find(inLine);
  // 全幸這種要湊裝備的點法：寫出預設的副屬性是「空身＋裝備」各多少（使用者改過那格就不寫）
  const plan = gearPlan(data.gear, job, group.level, data.beforeOpen, group.tab);
  const kitHint = plan.kit && group.stats[plan.kit.stat] === plan.kit.wear ? `${STAT_WORD[plan.kit.stat]}：空身 ${plan.kit.base}＋裝備 ${plan.kit.total}` : null;
  const amount = (id: number, stat: "pad" | "mad") => {
    const levels = data.skills.get(id)?.levels ?? [];
    return levels[(group.levels[id] || levels.length) - 1]?.[stat] ?? 0;
  };
  return (
    <section aria-label="兩組設定" className="rounded-[var(--radius-card)] glass wood-frame p-3.5">
      <div role="tablist" aria-label="改哪一組" className="mb-2 grid grid-cols-2 gap-1 rounded-full bg-[color:var(--paper-deep)] p-1">
        {labels.map((label, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={active === index}
            onClick={() => onActive(index as 0 | 1)}
            className={`rounded-full py-1.5 text-[13px] ${active === index ? "font-black text-white" : "font-bold ink-soft"}`}
            style={active === index ? { background: `var(--${TONES[index]})` } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={labels[active]}>
        {tabs.length > 1 ? (
          <div className="py-2">
            <ChoiceGroup label="點法" options={tabs.map(entry => entry.tab)} value={group.tab ?? tabs[0].tab} onChange={tab => onGroup(active, regroup(data, job, group, { tab }))} />
          </div>
        ) : null}
        <Row label="等級">
          <select aria-label="等級" className={SELECT} value={group.level} onChange={event => onGroup(active, regroup(data, job, group, { level: clampLevel(job, Number(event.target.value)) }))}>
            {Array.from({ length: LEVEL_CAP - minLevelFor(job) + 1 }, (_, index) => minLevelFor(job) + index).map(level => <option key={level} value={level}>Lv.{level}</option>)}
          </select>
        </Row>
        <p className="pb-1 text-right text-[11px] ink-faint">換點法、等級會把能力值、武器重設成那套的預設</p>
        <Row label="武器">
          {weapon ? <Sprite src={itemImage(weapon.id)} size={22} /> : null}
          <select aria-label="武器" className={SELECT} value={group.weaponId ?? ""} onChange={event => {
            const next = data.gear.weapons.find(entry => entry.id === Number(event.target.value));
            const nextAmmo = next ? ammoChoices(data.gear.ammo ?? [], next.s) : [];
            set({ weaponId: next?.id ?? null, ammoId: nextAmmo.some(entry => entry.id === group.ammoId) ? group.ammoId : nextAmmo[0]?.id ?? null });
          }}>
            {weapons.map(entry => <option key={entry.id} value={entry.id}>{`Lv.${entry.lv} ${entry.n}（${magic ? `魔攻 ${entry.mag ?? 0}` : `攻擊 ${entry.atk ?? 0}`}）${entry.o && data.beforeOpen ? "（10/15 開放）" : ""}`}</option>)}
          </select>
        </Row>
        {ammo.length ? (
          <Row label={ammo[0].kind}>
            {group.ammoId ? <Sprite src={itemImage(group.ammoId)} size={22} /> : null}
            <select aria-label={ammo[0].kind} className={SELECT} value={group.ammoId ?? ""} onChange={event => set({ ammoId: Number(event.target.value) })}>
              {ammo.map(entry => <option key={entry.id} value={entry.id}>{`${entry.n}（攻擊 +${entry.atk}）`}</option>)}
            </select>
          </Row>
        ) : null}
        <Row label={magic ? "其他魔攻" : "其他攻擊"}>
          <input aria-label={magic ? "其他魔攻" : "其他攻擊"} inputMode="numeric" className={`${SELECT} w-20 text-right`} value={group.extra} onChange={event => set({ extra: Math.max(0, Math.min(999, Math.round(Number(event.target.value)) || 0)) })} />
        </Row>
        <p className="pb-1 text-right text-[11px] ink-faint">手套衝卷、其他裝備加的{magic ? "魔攻" : "攻擊"}</p>
        <div className="grid grid-cols-2 gap-1.5 py-2">
          {STAT_ORDER.map(stat => <Stepper key={stat} stat={stat} value={group.stats[stat]} onChange={value => set({ stats: { ...group.stats, [stat]: value } })} />)}
        </div>
        {kitHint ? <p className="text-[12px] font-bold">{kitHint}</p> : null}
        <p className="text-[11px] ink-faint">預設是首頁「能力值與裝備」那套點法（含要湊的裝備），身上其他裝備加的自己加</p>
        {buffs.length || charges.length ? (
          <div className="space-y-1.5 py-2">
            <p className="text-[13px] font-bold ink-soft">增益</p>
            {buffs.map(buff => (
              <label key={buff.id} className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={group.buffs.includes(buff.id)} onChange={event => set({ buffs: event.target.checked ? [...group.buffs, buff.id] : group.buffs.filter(id => id !== buff.id) })} />
                <Sprite src={skillImage(buff.id)} size={20} />
                {data.skills.get(buff.id)?.n}（{buff.stat === "pad" ? "攻擊" : "魔攻"} +{amount(buff.id, buff.stat)}）
              </label>
            ))}
            {charges.length ? (
              <Row label="充能">
                <select aria-label="充能" className={SELECT} value={group.charge ?? ""} onChange={event => set({ charge: event.target.value === "" ? null : Number(event.target.value) })}>
                  <option value="">不用</option>
                  {charges.map(charge => <option key={charge.id} value={charge.id}>{data.skills.get(charge.id)?.n}</option>)}
                </select>
              </Row>
            ) : null}
          </div>
        ) : null}
        <details className="pt-1">
          <summary className="cursor-pointer text-[13px] font-bold text-[color:var(--sky)]">技能等級（預設照主流技能點法）</summary>
          {masteryId !== null ? <LevelSelect label={data.skills.get(masteryId)?.n ?? "精準"} id={masteryId} data={data} group={group} onChange={levels => set({ levels })} /> : null}
          {critId !== null && inLine(critId) ? <LevelSelect label={data.skills.get(critId)?.n ?? "爆擊"} id={critId} data={data} group={group} onChange={levels => set({ levels })} /> : null}
          {ampId !== undefined ? <LevelSelect label={data.skills.get(ampId)?.n ?? "魔力激發"} id={ampId} data={data} group={group} onChange={levels => set({ levels })} /> : null}
          {charges.map(charge => (group.charge === charge.id ? <LevelSelect key={charge.id} label={data.skills.get(charge.id)?.n ?? "充能"} id={charge.id} data={data} group={group} onChange={levels => set({ levels })} /> : null))}
        </details>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 怎麼算的 */

export function HowCard({ data, job, level }: { data: CalcData; job: number; level: number }) {
  const missing = notCalculatedFor(data.skills, job);
  const { guided } = skillLevelsAt(job, level, data.guides, data.skills);
  return (
    <details className="rounded-[var(--radius-card)] glass wood-frame p-3.5">
      <summary className="cursor-pointer text-[15px] font-black">怎麼算的</summary>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed">
        <p><Tag level="client" /> 能力視窗攻擊力：依客戶端計算式整理的公式，還沒跟台服遊戲畫面逐筆對過。</p>
        <p><Tag level="legacy" /> 技能倍率（雙飛斬、魔法、龍咆哮、強弓…）：舊版公式，楓錄、楓憶跟舊版公式彙整寫法一致。</p>
        <p><Tag level="unverified" /> 打怪（防禦、等級差、屬性）、爆擊、命中：舊版國際服的公式，台服經典版沒人實測過，數字可能不準。</p>
        {guided ? null : <p className="font-bold">這個職業還沒有技能點法攻略，技能等級先用最高等級</p>}
        <SourceLinks urls={["https://bobogameguides.com/maplestory-classic/tools/attack-power/", "https://ayumilovemaple.wordpress.com/2009/09/06/maplestory-formula-compilation/", "https://oddjobs.codeberg.page/dmg-calc/"]} />
        {missing.length ? (
          <div>
            <p className="font-bold">沒算的</p>
            <ul className="list-disc pl-5">
              {missing.map(entry => <li key={entry.id}>{entry.name}：{entry.reason}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
```

注意：`−`（U+2212）、`＋`（U+FF0B）不在禁用字元範圍；寫完跑 `grep -nP "[\x{2300}-\x{23FF}\x{25A0}-\x{25FF}\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/app/plan/damage/*.tsx` 要沒有輸出。

- [ ] **Step 4：型別、測試、瀏覽器驗證**

Run：`node ../../../node_modules/typescript/bin/tsc --noEmit -p .` → 沒有錯誤。
刪掉 `src/app/plan/damage-mock/`（暫存候選頁）。
本機 dev server（`.claude/launch.json` 的 `damage-calc`，埠 3217，`next dev --webpack`；這份 launch.json 改動不進 commit）開 `http://localhost:3217/plan/damage`：
- localStorage 先放 `ms-profile`＝`{"level":50,"job":410}`（無頭 Chrome：`Page.addScriptToEvaluateOnNewDocument` 或先開首頁設好再進）。
- 確認：結果卡兩列「一般點法」「全幸」、數字是區間、長條有畫；「看細節」展開表格有能力視窗 175～292；換到「全幸」分頁，武器是青銅指虎；改技能成「普通攻擊」數字有變；選「不選怪」後「打…約 N 次」消失；console 沒有 hydration 警告或錯誤（`read_console_messages`）。
- 手機 390 寬截一張整頁存 scratchpad。

- [ ] **Step 5：Commit**

```bash
git add src/app/plan/damage/page.tsx src/app/plan/damage/DamageCalculator.tsx src/app/plan/damage/parts.tsx
git commit -m "v0.79 (6/8): 傷害計算機頁面——共用設定、結果大字＋長條、看細節、兩組分頁設定（點法、等級、武器、彈藥、能力值、增益、技能等級）、怎麼算的"
```

---

### Task 7：一下／兩下打死（K2）

**Files:**
- Create: `src/app/plan/damage/KillCard.tsx`
- Modify: `src/app/plan/damage/DamageCalculator.tsx`（加回 `KillCard` import 與那一行）

**Interfaces:**
- Consumes：`killLists`、`monsterChoices`、`type CalcData`、`type CalcState`、`type KillEntry` from `@/lib/damage-view`；`monsterImage` from `@/lib/data`；`Sprite` from `@/components/route/bits`；`CloseIcon` from `@/components/Icons`。
- Produces：`KillCard({ data, state, active, label, onPick, beforeOpen })`。

- [ ] **Step 1：實作** `src/app/plan/damage/KillCard.tsx`

```tsx
"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CloseIcon } from "@/components/Icons";
import { Sprite } from "@/components/route/bits";
import { monsterImage } from "@/lib/data";
import { killLists, monsterChoices, type CalcData, type CalcState, type KillEntry } from "@/lib/damage-view";

const CELL = 38;
const GAP = 6;

/** 這個寬度一排放得下幾格（收起來時顯示兩排） */
function useColumns() {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(7);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setColumns(Math.max(1, Math.floor((element.clientWidth + GAP) / (CELL + GAP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, columns] as const;
}

function Section({ title, list, beforeOpen, onOpen }: { title: string; list: KillEntry[]; beforeOpen: boolean; onOpen: (entry: KillEntry) => void }) {
  const [ref, columns] = useColumns();
  const [open, setOpen] = useState(false);
  const limit = columns * 2;
  const shown = open ? list : list.slice(0, limit);
  return (
    <div>
      <h3 className="mb-2 text-[15px] font-black">
        {title}
        <span className="ml-1 text-[13px] font-bold ink-soft">{list.length} 隻</span>
      </h3>
      <div ref={ref} className="flex flex-wrap" style={{ gap: GAP }}>
        {list.length === 0 ? <p className="text-[13px] ink-soft">沒有</p> : null}
        {shown.map(entry => (
          <button
            key={entry.monster.id}
            type="button"
            title={`${entry.monster.n} Lv.${entry.monster.lv}`}
            aria-label={`${entry.monster.n} Lv.${entry.monster.lv}`}
            onClick={() => onOpen(entry)}
            className="relative grid place-items-center rounded-lg bg-[color:var(--paper-deep)] transition-transform hover:-translate-y-0.5 hover:ring-2 hover:ring-[color:var(--maple-soft)]"
            style={{ width: CELL, height: CELL }}
          >
            <Sprite src={monsterImage(entry.monster.id)} size={30} />
            <span className="absolute -bottom-1 right-0 rounded bg-[color:var(--wood-deep)] px-0.5 text-[9px] font-bold leading-tight text-white">Lv.{entry.monster.lv}</span>
            {entry.v002 && beforeOpen ? <span className="absolute -top-1 left-0 rounded bg-[color:var(--gold)] px-0.5 text-[8px] font-bold leading-tight text-white">10/15</span> : null}
          </button>
        ))}
      </div>
      {list.length > limit ? (
        <button type="button" onClick={() => setOpen(value => !value)} className="mt-1.5 text-[13px] font-bold text-[color:var(--sky)]" aria-expanded={open}>
          {open ? "收起來" : `看全部 ${list.length} 隻`}
        </button>
      ) : null}
    </div>
  );
}

function Sheet({ entry, kind, onClose, onPick }: { entry: KillEntry; kind: string; onClose: () => void; onPick: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { monster } = entry;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${monster.n} Lv.${monster.lv}`}
        className="w-full max-w-3xl rounded-t-2xl border-t border-[color:var(--paper-edge)] bg-[color:var(--paper)] px-4 pb-5 pt-2 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.3)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[color:var(--paper-edge)]" />
        <div className="flex items-start gap-2.5">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[color:var(--paper-deep)]">
            <Sprite src={monsterImage(monster.id)} size={44} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-black">
              {monster.n} <span className="text-[13px] ink-soft">Lv.{monster.lv}</span>
            </p>
            <p className="text-[12px] ink-soft">HP {monster.hp.toLocaleString()}・經驗 {monster.exp.toLocaleString()}</p>
            <p className="text-[12px] font-bold text-[color:var(--leaf)]">最低一次 {entry.minUse.toLocaleString()}，穩穩{kind}</p>
          </div>
          <button type="button" aria-label="關掉" onClick={onClose} className="grid size-9 place-items-center rounded-full ink-soft">
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button ref={first} type="button" onClick={onPick} className="rounded-full bg-[color:var(--maple)] py-2.5 text-[14px] font-bold text-white">設成要打的怪</button>
          <Link href={`/db/monsters?id=${monster.id}`} className="rounded-full border border-[color:var(--paper-edge)] py-2.5 text-center text-[14px] font-bold">看掉寶、出沒地點</Link>
        </div>
      </div>
    </div>
  );
}

export function KillCard({ data, state, active, label, onPick, beforeOpen }: {
  data: CalcData; state: CalcState; active: 0 | 1; label: string; onPick: (monsterId: number) => void; beforeOpen: boolean;
}) {
  const choices = useMemo(() => monsterChoices(data.monsters, data.maps), [data]);
  const lists = useMemo(() => killLists(data, state.shared, state.groups[active], choices), [data, state, active, choices]);
  const [selected, setSelected] = useState<{ entry: KillEntry; kind: string } | null>(null);
  return (
    <section aria-label="一下、兩下打死的怪" className="space-y-3 rounded-[var(--radius-card)] glass wood-frame p-3.5">
      {lists ? (
        <>
          <Section title="一下打死" list={lists.one} beforeOpen={beforeOpen} onOpen={entry => setSelected({ entry, kind: "一下" })} />
          <Section title="兩下打死" list={lists.two} beforeOpen={beforeOpen} onOpen={entry => setSelected({ entry, kind: "兩下" })} />
          <p className="text-[11px] ink-faint">照「{label}」算、最低傷害也打得死才算；等級高的排前面。打怪公式是舊版國際服的，經典版沒驗證。</p>
        </>
      ) : (
        <p className="text-[13px] ink-soft">「{label}」這組算不出來（看上面的原因），名單出不來</p>
      )}
      {selected ? (
        <Sheet
          entry={selected.entry}
          kind={selected.kind}
          onClose={() => setSelected(null)}
          onPick={() => {
            onPick(selected.entry.monster.id);
            setSelected(null);
          }}
        />
      ) : null}
    </section>
  );
}
```

（`CloseIcon` 吃 `IconProps`，有 `size`。）

- [ ] **Step 2：DamageCalculator.tsx 加回 KillCard**

import 加 `import { KillCard } from "./KillCard";`，`<ResultCard …/>` 後面加
`<KillCard data={data} state={state} active={tab} label={labels[tab]} onPick={monsterId => setShared({ monsterId })} beforeOpen={beforeOpen} />`

- [ ] **Step 3：型別、瀏覽器驗證**

Run：`node ../../../node_modules/typescript/bin/tsc --noEmit -p .` → 沒有錯誤；emoji 掃描沒有輸出。
瀏覽器（刺客 50）：
- 一下打死、兩下打死各有圖示、右下角「Lv.N」、等級高的在前；超過兩排出現「看全部 N 隻」，點了展開、再點收起。
- 點一個圖示：底部小卡出現（名字、Lv、HP、經驗、「最低一次 N，穩穩一下」）；「設成要打的怪」→ 上面「打哪隻怪」換成牠、結果數字跟著變、小卡收起；Esc、點外面都關得掉；「看掉寶、出沒地點」開 `/db/monsters?id=…`。
- 切到「全幸」分頁，名單跟著換（數量可能不同）。
- 桌機 1280：滑鼠移到圖示有原生提示「名字 Lv.N」。

- [ ] **Step 4：Commit**

```bash
git add src/app/plan/damage/KillCard.tsx src/app/plan/damage/DamageCalculator.tsx
git commit -m "v0.79 (7/8): 一下打死／兩下打死的怪——圖示角落寫等級、高到低、先顯示兩排；點了底部小卡可設成要打的怪或看掉寶"
```

---

### Task 8：入口、網站地圖、驗收腳本、README

**Files:**
- Modify: `src/app/db/page.tsx`（`TOOLS` 加一筆）
- Modify: `src/components/route/GearCard.tsx`（`GearContent` 的 `</Frame>` 前加一行連結）
- Modify: `src/app/sitemap.ts`
- Create: `scripts/verify/damage-shot.mjs`
- Modify: `scripts/verify/README.md`（加一段）

- [ ] **Step 1：入口三處**

`src/app/db/page.tsx` 的 `TOOLS` 在「練功地圖排行」後面插：

```ts
  { href: "/plan/damage", title: "傷害計算機", lead: "兩套點法、兩把武器並排，看打怪差多少、哪些怪一下打得死", image: "/assets/skills/4001344.png" },
```

`src/components/route/GearCard.tsx` 的 `GearContent`，在「看全部」按鈕那段 `) : null}` 之後、`</Frame>` 之前加：

```tsx
      <Link href="/plan/damage" className="flex items-center justify-center gap-0.5 pt-0.5 text-[13px] font-bold text-[color:var(--sky)] hover:underline">
        算算看打怪多痛
        <ChevronRight size={14} />
      </Link>
```

（`Link`、`ChevronRight` 這個檔已經 import。）

`src/app/sitemap.ts` 在 `/plan/bundle` 後面加 `{ path: "/plan/damage", priority: 0.8 },`。

- [ ] **Step 2：驗收腳本** `scripts/verify/damage-shot.mjs`

```js
// 傷害計算機（/plan/damage，v0.79）截圖＋抓字：各角色整頁、點一隻怪的底部小卡、看細節展開、夜晚、360 寬
// 用法：node scripts/verify/damage-shot.mjs <輸出資料夾> <網址> [職業:等級,…]
//   例：node scripts/verify/damage-shot.mjs out http://localhost:3217
//   預設 4 個：刺客 50、火毒巫師 40、狂戰士 50、槍手 60
// 輸出：<職業>-<等級>.png（手機 390 整頁）、<職業>-<等級>-sheet.png（點一下打死第一隻的小卡）、
//       <職業>-<等級>-details.png（看細節展開）、410-50-dark.png、410-50-360.png、results.json（結果卡、名單數、細節表的字）
// 環境變數 WIDTH 改寬度（預設 390）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CHROME, chromePort, outDir } from "./config.mjs";

const OUT = outDir(process.argv[2], "damage-shot");
const BASE = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const ROLES = (process.argv[4] ?? "410:50,210:40,110:50,520:60").split(",").map(entry => entry.split(":").map(Number));
const WIDTH = Number(process.env.WIDTH ?? 390);
const PORT = chromePort(9383);
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`, "--no-first-run", "--hide-scrollbars", `--window-size=${WIDTH},900`, "about:blank"], { stdio: "ignore" });

async function getJSON(url) {
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(200); }
  }
  throw new Error(`DevTools 沒起來：${url}`);
}

const page = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find(entry => entry.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener("message", ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method) events.push(msg);
});
await new Promise(resolve => ws.addEventListener("open", resolve));
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools 逾時：${method}`)); }, 120000);
  pending.set(id, msg => { clearTimeout(timer); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

async function open(url, profile, dark = false, width = WIDTH) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  events.length = 0;
  await send("Page.navigate", { url: `${BASE}/` });
  for (let i = 0; i < 300 && !events.some(e => e.method === "Page.loadEventFired"); i++) await sleep(100);
  await evaluate(`localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify(profile))}); sessionStorage.clear(); true`);
  events.length = 0;
  await send("Page.navigate", { url });
  for (let i = 0; i < 300 && !events.some(e => e.method === "Page.loadEventFired"); i++) await sleep(100);
  // 等結果卡出現（資料載完）
  for (let i = 0; i < 600; i++) {
    if (await evaluate(`Boolean(document.querySelector('section[aria-label="結果"]'))`)) break;
    await sleep(100);
  }
  await evaluate(`document.documentElement.style.scrollBehavior = "auto"; true`);
  await sleep(800);
}

async function shot(file, width = WIDTH) {
  const height = await evaluate(`Math.ceil(document.documentElement.scrollHeight)`);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: width < 768 });
  await sleep(500);
  const image = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 } });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(image.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
}

const results = {};
try {
  for (const [job, level] of ROLES) {
    const key = `${job}-${level}`;
    await open(`${BASE}/plan/damage`, { level, job });
    await shot(`${key}.png`);
    results[key] = await evaluate(`({
      result: document.querySelector('section[aria-label="結果"]')?.innerText,
      kills: [...document.querySelectorAll('section[aria-label="一下、兩下打死的怪"] h3')].map(h => h.innerText),
      shared: [...document.querySelectorAll('section[aria-label="共用設定"] select')].map(s => s.selectedOptions[0]?.text),
    })`);
    // 點細節
    await evaluate(`document.querySelector('section[aria-label="結果"] details').open = true; true`);
    await sleep(300);
    results[key].details = await evaluate(`document.querySelector('section[aria-label="結果"] table')?.innerText`);
    await shot(`${key}-details.png`);
    // 點一下打死的第一隻
    const clicked = await evaluate(`(() => { const b = document.querySelector('section[aria-label="一下、兩下打死的怪"] button[aria-label]'); if (!b) return null; b.click(); return b.getAttribute("aria-label"); })()`);
    await sleep(400);
    results[key].sheet = clicked ? await evaluate(`document.querySelector('[role="dialog"]')?.innerText`) : null;
    if (clicked) await shot(`${key}-sheet.png`);
  }
  await open(`${BASE}/plan/damage`, { level: 50, job: 410 }, true);
  await shot("410-50-dark.png");
  await open(`${BASE}/plan/damage`, { level: 50, job: 410 }, false, 360);
  await shot("410-50-360.png", 360);
  results.overflow360 = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  ws.close();
  chrome.kill();
}
console.log(`輸出：${OUT}`);
process.exit(0);
```

`scripts/verify/README.md` 在腳本清單後面加一段：

```md
### damage-shot.mjs（傷害計算機，v0.79）

`node scripts/verify/damage-shot.mjs <輸出> <網址> [職業:等級,…]`（預設刺客 50、火毒巫師 40、狂戰士 50、槍手 60；埠 9383）。
每個角色存整頁、看細節展開、點「一下打死」第一隻的底部小卡，另外刺客 50 存夜晚與 360 寬；`results.json` 有結果卡、名單數、細節表的字，`overflow360` 是 360 寬有沒有橫向捲動。
角色用 localStorage `ms-profile` 帶入，sessionStorage 每次清掉（計算機的設定記在瀏覽紀錄，不清會沿用上一個角色的）。
```

- [ ] **Step 3：全部測試、建置、驗收腳本**

Run：`npm test` 等價（PowerShell）：`node --test "pipeline/**/*.test.mjs"; node ../../../node_modules/vitest/vitest.mjs run` → 全綠（本機沒有 rsync 的那幾個會 skip，照舊）。
Run：`node ../../../node_modules/typescript/bin/tsc --noEmit -p .` → 沒有錯誤。
Run（dev server 開著）：`node scripts/verify/damage-shot.mjs <scratchpad>\damage-shot http://localhost:3217` → 每個角色有圖、`results.json` 的 result 有兩組數字、`overflow360` 是 false。看過每張截圖（Read 工具）確認沒有破版、沒有 emoji。
首頁（刺客 50）「能力值與裝備」卡底部看得到「算算看打怪多痛」、點了到計算機；查資料頁有「傷害計算機」卡片。

- [ ] **Step 4：Commit**（程式、驗收腳本分開）

```bash
git add src/app/db/page.tsx src/components/route/GearCard.tsx src/app/sitemap.ts
git commit -m "v0.79 (8/8): 入口——查資料「排行與規劃」多「傷害計算機」、首頁能力值卡底下「算算看打怪多痛」、網站地圖"
git add scripts/verify/damage-shot.mjs scripts/verify/README.md
git commit -m "v0.79 (驗收): 傷害計算機截圖腳本——各角色整頁、看細節、點怪的小卡、夜晚、360 寬"
```

---

## 收尾（不是 task，照 CLAUDE.md 流程）

1. `git fetch origin` → `git rebase origin/dev`；再查一次 v0.79 沒被別人用掉（`git log --all --oneline | grep v0.79`，只能是自己的）。
2. push `feat/damage-calc`（push 卡住照記憶 maplebook-repo-deploy 的 credential helper 解法）。
3. 開 PR → dev（rebase 合併；docs、驗收、程式各自的 commit 保留），等「測試」三條綠（單元測試、建置、第一格）。
4. 合併 → 查 dev commit 的 Vercel status 是 success → 測試機 `https://maplestory-tool-git-dev-clarkhers-projects.vercel.app/plan/damage` 跑 `damage-shot.mjs`、截圖給使用者。
5. 使用者的能力視窗截圖到了：每張寫成 `damage.test.ts` 一筆（等級、四項、總攻擊、顯示範圍），對上就把 `Tag level="client"` 的字改成「跟遊戲對過」（另開一輪 v0.xx）。
