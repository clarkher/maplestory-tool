# 第二套點法（全幸、裝備法）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首頁「能力值與裝備」卡讓盜賊切「一般點法／全幸」、法師切「全智／裝備法」，第二套的能力值、武器、要湊的裝備、衝卷都照那套算，並記住玩家選的。

**Architecture:** 研究檔 statRules 加 `tab`（切換標籤字）跟 `kit`（要湊的裝備 id）；`pipeline/build-gear.mjs` 用遊戲資料把 kit 換算成點數／等級／需求／拿法寫進 `public/data/gear.json`。`src/lib/gear.ts` 加 kit 疊加跟「差最少點的下一把」；`src/lib/gear-view.ts` 的 `gearPlan` 多吃一個 `tab`；`GearCard.tsx` 畫切換列與「要湊的裝備」區，選擇存 localStorage（`src/lib/build-choice.ts`）。

**Tech Stack:** Next.js 16（全站靜態）、React 19、TypeScript、Tailwind v4、vitest 5（`src/**/*.test.ts`）、node:test（`pipeline/**/*.test.mjs`）。

**Spec:** `docs/superpowers/specs/2026-10-08-build-variants-design.md`

## Global Constraints

- 全程繁體中文（註解、測試名稱、畫面字），寫法照周圍程式：註解講「為什麼」、用玩家看得懂的字。
- UI 不准 emoji、不准圖示套件；道具圖用 `itemImage(id)`＋`Sprite`。
- 不編造：kit 的點數、等級、需求、拿法全從遊戲資料算；找不到就不收並警告。
- 遊戲內用字照客戶端（敏捷、幸運、智力、力量；卷軸名照遊戲資料）。
- 不改升級路線（`bandGear`、`RouteTimeline.tsx` 不動）。
- 指令：worktree 沒有自己的 node_modules。vitest：`node ../../../node_modules/vitest/vitest.mjs run <檔>`；node:test：`node --test pipeline/lib/gear.test.mjs`；型別：`node ../../../node_modules/typescript/bin/tsc --noEmit -p .`。在 PowerShell 跑（Bash 工具的 PATH 沒有 node）。
- 重建 gear.json 前提：`data/raw/artale.json` 已在 worktree（2026-10-08 已抓好；沒有的話合成來源會整個消失，不准 commit 那種 gear.json）。重建後 `git diff --stat public/data/gear.json` 只准有 rules 那段跟 builtAt 變。
- commit 訊息開頭用 `v0.72:`（commit 前再查一次 `git log --all --oneline | grep -oE "v0\.[0-9]+" | sort -t. -k2 -n -u | tail -3`，被佔了就往上跳）。結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

---

### Task 1：研究檔加 tab、kit；pipeline 換算 kit；重建 gear.json

**Files:**
- Modify: `data/guides/gear.json`（statRules）
- Modify: `pipeline/lib/gear.mjs`（`convertStatRules` 帶 tab；新增 `buildKit`）
- Modify: `pipeline/build-gear.mjs`（rules 掛上 kit、開頭註解寫新欄位）
- Test: `pipeline/lib/gear.test.mjs`
- Regenerate: `public/data/gear.json`

**Interfaces:**
- Produces（`public/data/gear.json` 的 rules 每一條可能多）：
  - `tab?: string`
  - `kit?: Array<{ ids: number[]; n: string; slot: string; lv: number; stat: "STR"|"DEX"|"INT"|"LUK"; v: number; req?: Partial<Record<StatKey, number>>; scroll?: { id: number; n: string; slot: string; stat: string; rate: number; times: number }; src: GearSource; o?: string }>`
- `buildKit(entries, stat, itemsById, ctx, warn)` → 上面那個陣列。

- [ ] **Step 1：寫失敗的測試**（加在 `pipeline/lib/gear.test.mjs` 最後，import 補 `buildKit`）

```js
/* ------------------------------------------------------------ buildKit */

const kitCtx = { monstersById: new Map([[7, { id: 7, n: "超級綠水靈", lv: 40, maps: [100000000] }]]), questsById: new Map(), maps: { 100000000: { zh: "弓箭手村" } }, openMap, v002Date: "2026-10-15" };
const kitItems = new Map(
  [
    { id: 1050018, n: "藍色桑那服", c: "裝備", s: "套服", eq: { reqLevel: 30, tuc: 10 }, dm: [7] },
    { id: 1051017, n: "紅色桑那服", c: "裝備", s: "套服", eq: { reqLevel: 30, tuc: 10 }, dm: [7] },
    { id: 2040500, n: "套服敏捷卷軸100%", c: "消耗", s: "卷軸", d: "套服附加敏捷提升屬性。 成功率：100%，DEX+1" },
    { id: 1002089, n: "綠色斗笠", c: "裝備", s: "帽子", eq: { reqLevel: 25, reqDEX: 30, incDEX: 3, tuc: 7 }, dm: [7] },
    { id: 9, n: "絕版帽", c: "裝備", s: "帽子", eq: { reqLevel: 10, incDEX: 5 } },
  ].map(item => [item.id, item]),
);

test("buildKit：點數＝道具本身＋可衝次數×卷軸點數；同一件好幾個 id 合併；需求、等級照遊戲資料", () => {
  const kit = buildKit([{ items: [1050018, 1051017], scroll: 2040500 }, { items: [1002089] }], "DEX", kitItems, kitCtx);
  assert.equal(kit.length, 2);
  assert.deepEqual(
    { ...kit[0], src: undefined },
    { ids: [1050018, 1051017], n: "藍色桑那服／紅色桑那服", slot: "套服", lv: 30, stat: "DEX", v: 10, scroll: { id: 2040500, n: "套服敏捷卷軸", slot: "套服", stat: "敏捷", rate: 100, times: 10 }, src: undefined },
  );
  assert.equal(kit[0].src.drops[0].n, "超級綠水靈");
  assert.deepEqual({ ...kit[1], src: undefined }, { ids: [1002089], n: "綠色斗笠", slot: "帽子", lv: 25, stat: "DEX", v: 3, req: { DEX: 30 }, src: undefined });
});

test("buildKit：找不到、拿不到、加不到這個屬性的整件不收並警告（不編造）", () => {
  const warnings = [];
  const kit = buildKit([{ items: [404] }, { items: [9] }, { items: [1050018] }], "DEX", kitItems, kitCtx, message => warnings.push(message));
  assert.deepEqual(kit, []);
  assert.equal(warnings.length, 3);
});

test("convertStatRules：研究檔寫了 tab 就帶過去", () => {
  const [rule] = convertStatRules([{ jobs: [410], label: "全幸", main: "LUK", secondary: null, tab: "全幸", text: "x", sources: [], verified: "tw" }]);
  assert.equal(rule.tab, "全幸");
});
```

- [ ] **Step 2：跑測試確認失敗**

Run（PowerShell）：`node --test pipeline/lib/gear.test.mjs`
Expected：FAIL，`buildKit` is not exported / `rule.tab` undefined。

- [ ] **Step 3：實作**

`pipeline/lib/gear.mjs`：`convertStatRules` 的物件加一行（放在 weapons 那行後面）：

```js
    // 卡片上方切換用的標籤字（盜賊「一般點法／全幸」、法師「全智／裝備法」）；主推跟另一套都寫了才會出現切換
    ...(rule.tab ? { tab: rule.tab } : {}),
```

在 `convertBefore` 後面加：

```js
/**
 * 研究檔 kit（這套點法要湊的裝備，全幸的敏捷裝）→ 畫面用的 GearKit[]。研究檔只寫道具 id 跟要衝的 100% 卷軸 id，
 * 點數、等級、需求、拿法都從遊戲資料算，不照抄攻略的數字：
 * 點數＝道具本身的這項屬性＋（有寫卷軸時）可衝次數 × 卷軸說明裡這項屬性加的點數（桑那服 10 次 × 套服敏捷卷軸 DEX+1＝10）。
 * 同一件有好幾個 id（藍色／紅色桑那服）合併成一件：名字用「／」接、拿法合併、數值看第一個 id。
 * 找不到道具、完全拿不到、卷軸讀不出這項屬性、最後加不到點的，整件不收並警告（結婚戒指這類拿不到的不寫進畫面）。
 */
export function buildKit(entries, stat, itemsById, ctx, warn = () => {}) {
  const kit = [];
  for (const entry of entries ?? []) {
    const ids = entry.items ?? [];
    const items = ids.map(id => itemsById.get(id)).filter(Boolean);
    if (!ids.length || items.length !== ids.length) {
      warn(`要湊的裝備 ${ids.join("、")}：遊戲資料找不到，略過`);
      continue;
    }
    const name = items.map(item => item.n).join("／");
    const src = mergeSources(items.map(item => buildSource(item, ctx)));
    if (!hasAnySource(src)) {
      warn(`要湊的裝備 ${name}：沒有拿得到的來源，略過`);
      continue;
    }
    const eq = items[0].eq ?? {};
    let value = eq[`inc${stat}`] ?? 0;
    let scroll;
    if (entry.scroll !== undefined) {
      const scrollItem = itemsById.get(entry.scroll);
      const parsed = scrollItem ? parseScroll(scrollItem) : null;
      const per = parsed ? Number(new RegExp(`${stat}\\+(\\d+)`).exec(parsed.effect)?.[1] ?? 0) : 0;
      if (!parsed || !per || !eq.tuc) {
        warn(`要湊的裝備 ${name}：卷軸 ${entry.scroll} 讀不出 ${stat} 或這件不能衝卷，略過`);
        continue;
      }
      value += eq.tuc * per;
      scroll = { id: scrollItem.id, n: parsed.n, slot: parsed.slot, stat: parsed.stat, rate: parsed.rate, times: eq.tuc };
    }
    if (!value) {
      warn(`要湊的裝備 ${name}：加不到 ${stat}，略過`);
      continue;
    }
    const piece = { ids, n: name, slot: items[0].s, lv: eq.reqLevel ?? 0, stat, v: value };
    const req = buildReq(eq);
    if (req) piece.req = req;
    if (scroll) piece.scroll = scroll;
    piece.src = src;
    if (ctx.v002Date && allSourcesV002(src)) piece.o = ctx.v002Date;
    kit.push(piece);
  }
  return kit;
}
```

`pipeline/build-gear.mjs`：import 補 `buildKit`；`rules = convertStatRules(research.statRules);` 改成：

```js
    // 要湊的裝備（kit）在這裡用遊戲資料換算：點數、等級、需求、拿法都不照抄研究檔
    const itemsById = new Map(items.map(item => [item.id, item]));
    rules = convertStatRules(research.statRules).map((rule, index) => {
      const kit = research.statRules[index].kit;
      return kit ? { ...rule, kit: buildKit(kit, rule.secondary?.stat ?? rule.main, itemsById, ctx, warn) } : rule;
    });
```

並在檔頭「輸出」說明下補一行：`rules 的 tab（切換標籤字）照研究檔帶；kit（要湊的裝備）由 buildKit 從遊戲資料換算`。

- [ ] **Step 4：改研究檔 `data/guides/gear.json`**
  - `"jobs": [400, 410]` 的「幸運為主，敏捷只點到拳套需求」加 `"tab": "一般點法"`。
  - `"jobs": [400, 410]` 的「全幸：敏捷停在 25，其餘全幸」加 `"tab": "全幸"` 跟
    `"kit": [{ "items": [1050018, 1051017], "scroll": 2040500 }, { "items": [1102053], "scroll": 2041018 }, { "items": [1002089] }, { "items": [1072369] }]`。
  - `"jobs": [411]` 的「三轉：敏捷只點到拳套需求，其餘全幸」加 `"tab": "一般點法"`。
  - 「三轉全幸：敏捷停在 25」原本 `"jobs": [411, 421]`：拆成兩條。第一條 `"jobs": [411]`，加 `"tab": "全幸"` 跟同一份 kit；第二條 `"jobs": [421]`，其餘欄位照抄、不加 tab／kit（俠盜全幸經典版查不到攻略，不給切換）。
  - 法師 `"jobs": [200, 210, 220, 230]` 的「全點智力」、`[211, 221, 231]` 的「三轉：全點智力」加 `"tab": "全智"`；兩條裝備法加 `"tab": "裝備法"`。

- [ ] **Step 5：跑測試確認通過、重建 gear.json**

Run：`node --test pipeline/lib/gear.test.mjs` → 全部 PASS。
Run：`node pipeline/build-gear.mjs` → 警告不能多出「要湊的裝備」開頭的。
Run：`node -e "const g=require('./public/data/gear.json'); for (const r of g.rules.filter(r=>r.kit)) console.log(r.jobs, r.kit.map(k=>k.n+'+'+k.v+'@'+k.lv).join(' '))"`
Expected：兩行（[400,410]、[411]），都是 `藍色桑那服／紅色桑那服+10@30 破舊的披風+5@25 綠色斗笠+3@25 黏稠稠鞋子+1@30`。
Run：`git diff --stat public/data/gear.json` → 只有 rules 附近跟 builtAt。

- [ ] **Step 6：Commit**

```bash
git add data/guides/gear.json pipeline/lib/gear.mjs pipeline/lib/gear.test.mjs pipeline/build-gear.mjs public/data/gear.json
git commit -m "v0.72 (1/4): 研究檔點法加切換標籤與全幸要湊的裝備，建置時從遊戲資料換算點數與拿法"
```

---

### Task 2：`gear.ts`：kit 疊加、差最少點的下一把、單組卷軸

**Files:**
- Modify: `src/lib/gear.ts`
- Test: `src/lib/__tests__/gear.test.ts`

**Interfaces:**
- Consumes：Task 1 的 rules 欄位。
- Produces：
  - `type GearKit = { ids: number[]; n: string; slot: string; lv: number; stat: StatKey; v: number; req?: Partial<Record<StatKey, number>>; scroll?: { id: number; n: string; slot: string; stat: string; rate: number; times: number }; src: GearSource; o?: string }`
  - `StatRule` 多 `tab?: string; kit?: GearKit[]`
  - `kitStats(kit: GearKit[], level: number, base: Record<StatKey, number>, beforeOpen?: boolean): { stats: Record<StatKey, number>; worn: GearKit[]; later: GearKit[] }`
  - `nearestUpgrade(weapons: GearWeapon[], job: number, level: number, wear: Record<StatKey, number>, best: GearWeapon | null, opts?: { beforeOpen?: boolean; types?: string[] }): GearWeapon | null`
  - `scrollFamily(scrolls: GearScroll[], job: number, slot: string, stat: string, level?: number): { slot: string; stat: string; options: GearScroll[] } | null`

- [ ] **Step 1：寫失敗的測試**（加在 `gear.test.ts` 最後，import 補 `kitStats, nearestUpgrade, scrollFamily` 跟 type `GearKit`）

```ts
const piece = (over: Partial<GearKit> & Pick<GearKit, "n" | "lv" | "v">): GearKit => ({ ids: [1], slot: "帽子", stat: "DEX", src: { quests: [{ id: "1", n: "任務" }] }, ...over });

describe("kitStats：空身加上要湊的裝備", () => {
  const cape = piece({ n: "破舊的披風", lv: 25, v: 5 });
  const hat = piece({ n: "綠色斗笠", lv: 25, v: 3, req: { DEX: 30 } });
  const robe = piece({ n: "桑那服", lv: 30, v: 10 });
  const base = { STR: 4, DEX: 25, INT: 4, LUK: 112 };

  it("等級不夠的不算，排在 later", () => {
    const result = kitStats([cape, hat, robe], 20, base);
    expect(result.stats.DEX).toBe(25);
    expect(result.worn).toEqual([]);
    expect(result.later.map(k => k.n)).toEqual(["破舊的披風", "綠色斗笠", "桑那服"]);
  });

  it("先穿上的會讓後面的穿得上（披風 +5 才戴得上要敏捷 30 的斗笠），順序不影響", () => {
    const result = kitStats([hat, cape, robe], 25, base);
    expect(result.stats.DEX).toBe(33);
    expect(result.worn.map(k => k.n)).toEqual(["綠色斗笠", "破舊的披風"]);
    expect(result.later.map(k => k.n)).toEqual(["桑那服"]);
  });

  it("10/15 前不算只有 V002 才拿得到的", () => {
    const later = piece({ n: "V002 帽", lv: 10, v: 9, o: "2026-10-15" });
    expect(kitStats([later], 30, base, true).stats.DEX).toBe(25);
    expect(kitStats([later], 30, base, false).stats.DEX).toBe(34);
  });

  it("不改到傳進來的 base", () => {
    kitStats([cape], 30, base);
    expect(base.DEX).toBe(25);
  });
});

describe("nearestUpgrade：比現在這把強、穿不上的裡面，差最少點的那把", () => {
  const claw = (id: number, n: string, lv: number, atk: number, dex: number) =>
    weapon({ id, n, s: "拳套", lv, job: 8, atk, req: { DEX: dex, LUK: 0 }, src: source({ shops: [{ p: "店", pr: 1 }] }) });
  const weapons = [claw(1, "青銅指虎", 20, 14, 40), claw(2, "狼牙", 25, 16, 50), claw(3, "銀守護拳套", 35, 20, 70), claw(4, "護腕", 40, 22, 80)];
  const wear = { STR: 4, DEX: 44, INT: 4, LUK: 162 };

  it("刺客 35 全幸（敏捷 44）：狼牙只差 6，不是攻擊最高的銀守護拳套；等級還沒到的護腕不算", () => {
    expect(nearestUpgrade(weapons, 410, 35, wear, weapons[0])?.n).toBe("狼牙");
  });

  it("都穿得上或沒有更強的回 null", () => {
    expect(nearestUpgrade(weapons, 410, 35, { ...wear, DEX: 999 }, weapons[2])).toBeNull();
  });
});

describe("scrollFamily：單一部位單一屬性的一組卷軸", () => {
  const scrolls = [
    scroll({ id: 1, n: "套服敏捷卷軸", slot: "套服", stat: "敏捷", rate: 60, effect: "DEX+2，命中率+1", src: source({ shops: [{ p: "店", pr: 1 }] }) }),
    scroll({ id: 2, n: "套服敏捷卷軸", slot: "套服", stat: "敏捷", rate: 100, effect: "DEX+1", src: source({ shops: [{ p: "店", pr: 1 }] }) }),
  ];
  it("成功率高的在前；沒有拿得到的回 null", () => {
    expect(scrollFamily(scrolls, 410, "套服", "敏捷")?.options.map(s => s.rate)).toEqual([100, 60]);
    expect(scrollFamily(scrolls, 410, "披風", "敏捷")).toBeNull();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/gear.test.ts` → FAIL（沒有 export）。

- [ ] **Step 3：實作**（`src/lib/gear.ts`）

在 `GearNote` 型別前加 `GearKit` 型別（註解：「這套點法要湊的裝備（全幸的敏捷裝），pipeline/lib/gear.mjs 的 buildKit 從遊戲資料換算」），`StatRule` 加：

```ts
  /** 卡片上方切換用的標籤字（「全幸」「裝備法」）；主推跟另一套都有才出現切換 */
  tab?: string;
  /** 這套點法要湊的裝備：武器、防具要的副屬性靠這些補（全幸的敏捷） */
  kit?: GearKit[];
```

在 `statTargets` 後面加：

```ts
/**
 * 空身能力值加上要湊的裝備：等級到了、要求的能力值（空身＋已經穿上的）夠了才算穿上，
 * 一直套到沒有新的能穿為止——破舊的披風 +5 讓敏捷到 30，才戴得上要敏捷 30 的綠色斗笠，跟研究檔寫的順序無關。
 * worn 照研究檔順序；later 是還穿不上的（等級不夠、需求不夠、10/15 前只有 V002 拿得到）。
 */
export function kitStats(
  kit: GearKit[],
  level: number,
  base: Record<StatKey, number>,
  beforeOpen = false,
): { stats: Record<StatKey, number>; worn: GearKit[]; later: GearKit[] } {
  const stats = { ...base };
  const wornSet = new Set<GearKit>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const piece of kit) {
      if (wornSet.has(piece) || piece.lv > level || (beforeOpen && piece.o)) continue;
      if (!STAT_KEYS.every(key => (piece.req?.[key] ?? 0) <= stats[key])) continue;
      stats[piece.stat] += piece.v;
      wornSet.add(piece);
      changed = true;
    }
  }
  return { stats, worn: kit.filter(piece => wornSet.has(piece)), later: kit.filter(piece => !wornSet.has(piece)) };
}
```

在 `weaponPicks` 後面加：

```ts
/**
 * 「空身再點幾點就能用」的那把：拿得到、比現在這把強、照 wear 穿不上的裡面，差的點數加起來最少的；
 * 同分攻擊／魔力高的先。全幸用：35 等差 6 點敏捷的狼牙，比差 26 點的銀守護拳套實際。
 */
export function nearestUpgrade(
  weapons: GearWeapon[],
  job: number,
  level: number,
  wear: Record<StatKey, number>,
  best: GearWeapon | null,
  opts: { beforeOpen?: boolean; types?: string[] } = {},
): GearWeapon | null {
  const magic = isMagicJob(job);
  const bestOffense = best ? offenseStat(best, magic) : -Infinity;
  const missing = (w: GearWeapon) => statShortfall(w, wear).reduce((sum, entry) => sum + entry.short, 0);
  return (
    candidatePool(weapons, job, magic, opts.types)
      .filter(w => w.lv <= level && (!opts.beforeOpen || !w.o) && obtainableBy(w.src, job, level))
      .filter(w => offenseStat(w, magic) > bestOffense && !canWear(w, wear))
      .sort((a, b) => missing(a) - missing(b) || offenseStat(b, magic) - offenseStat(a, magic))[0] ?? null
  );
}
```

把 `scrollPicks` 裡的 `addFamily` 抽成 export：

```ts
/** 一個部位一種屬性的一組卷軸（100%／60%／10%），只收這個職業拿得到的、成功率高的在前；一張都沒有回 null */
export function scrollFamily(
  scrolls: GearScroll[],
  job: number,
  slot: string,
  stat: string,
  level?: number,
): { slot: string; stat: string; options: GearScroll[] } | null {
  const options = scrolls.filter(s => s.slot === slot && s.stat === stat && obtainableBy(s.src, job, level)).sort((a, b) => b.rate - a.rate);
  return options.length ? { slot, stat, options } : null;
}
```

`scrollPicks` 內改成呼叫它（行為不變）：

```ts
  const addFamily = (slot: string, stat: string) => {
    const family = scrollFamily(scrolls, job, slot, stat, level);
    if (family) families.push(family);
  };
```

- [ ] **Step 4：跑測試確認通過**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/gear.test.ts src/lib/__tests__/gear-realdata.test.ts src/lib/__tests__/gear-view.test.ts` → 全部 PASS。

- [ ] **Step 5：Commit**

```bash
git add src/lib/gear.ts src/lib/__tests__/gear.test.ts
git commit -m "v0.72 (2/4): 能力值與裝備的算法加要湊的裝備、差最少點的下一把"
```

---

### Task 3：`gear-view.ts`：tabsFor、gearPlan 吃 tab

**Files:**
- Modify: `src/lib/gear-view.ts`
- Test: `src/lib/__tests__/gear-view.test.ts`

**Interfaces:**
- Consumes：Task 2 的 `kitStats`、`nearestUpgrade`、`scrollFamily`、`StatRule.tab/kit`。
- Produces：
  - `tabsFor(rules: StatRule[], job: number): Array<{ tab: string; rule: StatRule }>`（主推排第一；主推沒 tab 或不到兩條回 `[]`）
  - `gearPlan(gear, job, level, beforeOpen, tab?: string | null)`；`GearPlan` 多：
    - `tabs: Array<{ tab: string; rule: StatRule }>`
    - `kit: { stat: StatKey; base: number; wear: number; total: number; worn: Array<{ piece: GearKit; source: SourcePick | null }>; later: Array<{ piece: GearKit; source: SourcePick | null }> } | null`
    - `diff: { tab: string; stat: StatKey; delta: number } | null`（選了第二套才有：這套主屬性減主推主屬性）
    - `compare: { tab: string; weapon: GearWeapon; need: { stat: StatKey; value: number } | null } | null`（選了第二套、主推這級的武器跟現在不同才有；need＝全幸穿不上那把時，那把要的副屬性）
  - 選了 kit 規則時 `stronger`＝`nearestUpgrade` 的結果、`strongerShort` 對「空身＋kit」算；`strongerVia` 一律 null。

- [ ] **Step 1：寫失敗的測試**（加在 `gear-view.test.ts` 的真資料區後面；import 補 `tabsFor`）

```ts
describe("tabsFor：卡片上方的點法切換", () => {
  it("刺客：一般點法、全幸；暗殺者也有；法師各轉都是全智、裝備法", () => {
    expect(tabsFor(gear.rules, 410).map(t => t.tab)).toEqual(["一般點法", "全幸"]);
    expect(tabsFor(gear.rules, 400).map(t => t.tab)).toEqual(["一般點法", "全幸"]);
    expect(tabsFor(gear.rules, 411).map(t => t.tab)).toEqual(["一般點法", "全幸"]);
    for (const job of [200, 210, 220, 230, 211, 221, 231]) expect(tabsFor(gear.rules, job).map(t => t.tab)).toEqual(["全智", "裝備法"]);
  });

  it("俠盜、神偷、劍士、弓箭手、海盜沒有切換", () => {
    for (const job of [420, 421, 100, 110, 131, 310, 320, 510, 520]) expect(tabsFor(gear.rules, job)).toEqual([]);
  });
});

describe("真資料：gearPlan 選了第二套", () => {
  it("刺客 35 全幸：四格敏 25、幸 162；敏捷靠裝備補 19 到 44，拳套是青銅指虎；空身先點到 31 就能用狼牙；一般點法這級用銀守護拳套", () => {
    const plan = gearPlan(gear, 410, 35, true, "全幸");
    expect(plan.rule?.tab).toBe("全幸");
    expect(plan.targets).toEqual({ STR: 4, DEX: 25, INT: 4, LUK: 162 });
    expect(plan.kit).toMatchObject({ stat: "DEX", base: 25, total: 19, wear: 44 });
    expect(plan.kit?.worn.map(k => k.piece.n)).toEqual(["藍色桑那服／紅色桑那服", "破舊的披風", "綠色斗笠", "黏稠稠鞋子"]);
    expect(plan.kit?.worn[0].source).toMatchObject({ kind: "quest" });
    expect(plan.best?.n).toBe("青銅指虎");
    expect(plan.stronger?.n).toBe("狼牙");
    expect(plan.strongerShort).toEqual([{ stat: "DEX", short: 6 }]);
    expect(plan.strongerVia).toBeNull();
    expect(plan.diff).toEqual({ tab: "一般點法", stat: "LUK", delta: 45 });
    expect(plan.compare).toMatchObject({ tab: "一般點法", weapon: { n: "銀守護拳套" }, need: { stat: "DEX", value: 70 } });
    expect(plan.others.map(r => r.tab)).toContain("一般點法");
  });

  it("刺客 35 全幸的衝卷：套服敏捷卷軸、拳套攻擊卷軸，再來披風敏捷卷軸", () => {
    const plan = gearPlan(gear, 410, 35, true, "全幸");
    expect(plan.families.slice(0, 3).map(f => `${f.slot}${f.stat}`)).toEqual(["套服敏捷", "拳套攻擊", "披風敏捷"]);
  });

  it("刺客 25 全幸：披風 +5 後才戴得上斗笠，敏捷 33 → 鋼鐵拳套；桑那服、鞋子 30 等才有", () => {
    const plan = gearPlan(gear, 410, 25, true, "全幸");
    expect(plan.kit).toMatchObject({ total: 8, wear: 33 });
    expect(plan.kit?.later.map(k => k.piece.lv)).toEqual([30, 30]);
    expect(plan.best?.n).toBe("鋼鐵拳套");
  });

  it("暗殺者 80 全幸：還是青銅指虎（一般點法是閃電甲）", () => {
    const plan = gearPlan(gear, 411, 80, false, "全幸");
    expect(plan.best?.n).toBe("青銅指虎");
    expect(plan.compare?.weapon.n).toContain("閃電甲");
  });

  it("火毒巫師 50 裝備法：大魔法師短杖；比全智少 49 智力；全智這級用黃色雨傘；沒有要湊的裝備", () => {
    const plan = gearPlan(gear, 210, 50, true, "裝備法");
    expect(plan.best?.n).toBe("大魔法師短杖");
    expect(plan.targets).toEqual({ STR: 4, DEX: 4, INT: 209, LUK: 53 });
    expect(plan.diff).toEqual({ tab: "全智", stat: "INT", delta: -49 });
    expect(plan.compare).toMatchObject({ tab: "全智", weapon: { n: "黃色雨傘" }, need: null });
    expect(plan.kit).toBeNull();
  });

  it("魔導士（火毒）70 裝備法：天使之翼", () => {
    expect(gearPlan(gear, 211, 70, false, "裝備法").best?.n).toBe("天使之翼");
  });

  it("沒選、選了主推、選了這個職業沒有的標籤：都照主推（diff、compare、kit 都是 null）", () => {
    for (const tab of [undefined, null, "一般點法", "裝備法"]) {
      const plan = gearPlan(gear, 410, 35, true, tab);
      expect(plan.rule?.tab).toBe("一般點法");
      expect(plan.best?.n).toBe("銀守護拳套");
      expect(plan.diff).toBeNull();
      expect(plan.compare).toBeNull();
      expect(plan.kit).toBeNull();
    }
    expect(gearPlan(gear, 420, 35, true, "全幸").rule?.label).toBe("幸運為主，敏捷只點到短刀需求");
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/gear-view.test.ts` → FAIL。

- [ ] **Step 3：實作**（`src/lib/gear-view.ts`）

import 補 `kitStats, nearestUpgrade, scrollFamily, type GearKit`。

`notesFor` 後面加：

```ts
/**
 * 卡片上方的點法切換：這個職業的主推跟其他點法裡有寫 tab 的，主推排第一。
 * 主推沒有 tab、或湊不到兩條，回空陣列（不出現切換——俠盜、劍士、弓箭手）。
 */
export function tabsFor(rules: StatRule[], job: number): Array<{ tab: string; rule: StatRule }> {
  const { main, others } = rulesFor(rules, job);
  if (!main?.tab) return [];
  const tabs = [main, ...others].filter(rule => rule.tab).map(rule => ({ tab: rule.tab!, rule }));
  return tabs.length > 1 ? tabs : [];
}
```

`GearPlan` 型別加 `tabs`、`kit`、`diff`、`compare`（照 Interfaces），`EMPTY_PLAN` 補 `tabs: [], kit: null, diff: null, compare: null`。

`gearPlan` 改成：

```ts
export function gearPlan(gear: GearData, job: number, level: number, beforeOpen: boolean, tab?: string | null): GearPlan {
  const magic = isMagicJob(job);
  if (job <= 0) return { magic, ...EMPTY_PLAN };

  const found = rulesFor(gear.rules, job);
  const tabs = tabsFor(gear.rules, job);
  // 選了第二套（全幸、裝備法）就換那條；沒選、選了主推、這個職業沒有那個標籤都照主推
  const chosen = tab ? tabs.find(entry => entry.tab === tab && entry.rule !== found.main)?.rule ?? null : null;
  const rule = chosen ?? found.main;
  const others = chosen ? [found.main!, ...found.others].filter(other => other !== chosen) : found.others;
  const inherited = found.inherited;

  // 空身的四格（每個等級只算一次，weaponPicks 會拿很多等級來問）
  const baseAt = targetsAtFor(gear, job, rule, beforeOpen);
  const targets = baseAt ? baseAt(level) : null;
  // 穿不穿得上看「空身＋要湊的裝備」（全幸的敏捷裝）；沒有 kit 的點法就是空身
  const wearAt = rule?.kit?.length && baseAt ? (lv: number) => kitStats(rule.kit!, lv, baseAt(lv), beforeOpen).stats : baseAt;

  const picks = weaponPicks(gear.weapons, job, level, { targetsAt: wearAt, beforeOpen, types: rule?.weapons });
  const source = (weapon: GearWeapon) => closestSource(weapon.src, level, job);
  const wearNow = wearAt ? wearAt(level) : null;

  const kitNow = rule?.kit?.length && targets ? kitStats(rule.kit, level, targets, beforeOpen) : null;
  const kitPick = (piece: GearKit) => ({ piece, source: closestSource(piece.src, level, job) });
  const kit =
    kitNow && targets && rule
      ? {
          stat: rule.kit![0].stat,
          base: targets[rule.kit![0].stat],
          wear: kitNow.stats[rule.kit![0].stat],
          total: kitNow.worn.reduce((sum, piece) => sum + piece.v, 0),
          worn: kitNow.worn.map(kitPick),
          later: kitNow.later.map(kitPick),
        }
      : null;

  // 全幸：「再強一點」改成差最少點的那把（空身再點幾點就能用），不再找別的點法
  const stronger = kit && wearNow ? nearestUpgrade(gear.weapons, job, level, wearNow, picks.best, { beforeOpen, types: rule?.weapons }) : picks.stronger;

  // 選了第二套：跟主推比主屬性、主推這級用哪把
  let diff: GearPlan["diff"] = null;
  let compare: GearPlan["compare"] = null;
  if (chosen && found.main?.tab && targets) {
    const mainAt = targetsAtFor(gear, job, found.main, beforeOpen)!;
    diff = { tab: found.main.tab, stat: chosen.main, delta: targets[chosen.main] - mainAt(level)[chosen.main] };
    const mainBest = weaponPicks(gear.weapons, job, level, { targetsAt: mainAt, beforeOpen, types: found.main.weapons }).best;
    if (mainBest && mainBest.id !== picks.best?.id) {
      const short = wearNow ? statShortfall(mainBest, wearNow)[0] : undefined;
      compare = { tab: found.main.tab, weapon: mainBest, need: kit && short ? { stat: short.stat, value: mainBest.req![short.stat]! } : null };
    }
  }

  const families = mergeKitFamilies(
    scrollPicks(gear.scrolls, job, picks.best?.s ?? null, rule?.main ?? null, level),
    (rule?.kit ?? []).flatMap(piece => (piece.scroll ? [scrollFamily(gear.scrolls, job, piece.scroll.slot, piece.scroll.stat, level)] : [])),
  ).map(family => {
    const pick = familyPick(family.options, beforeOpen);
    return { ...family, pick, source: closestSource(pick.src, level, job) };
  });

  return {
    magic,
    rule,
    others,
    inherited,
    tabs,
    targets,
    kit,
    diff,
    compare,
    best: picks.best,
    bestSource: picks.best ? source(picks.best) : null,
    bestShort: picks.best && wearNow ? statShortfall(picks.best, wearNow) : [],
    alternatives: picks.alternatives.map(weapon => ({ weapon, source: source(weapon) })),
    next: picks.next,
    stronger,
    strongerShort: stronger && wearNow ? statShortfall(stronger, wearNow) : [],
    strongerVia: !kit && stronger ? otherRuleThatWears(gear, job, level, others, stronger, beforeOpen) : null,
    families,
    notes: notesFor(gear.notes, job),
  };
}

/** 這套點法空身的四格，每個等級只算一次；equip 類型才吃 equipRequirement。沒有點法回 undefined */
function targetsAtFor(gear: GearData, job: number, rule: StatRule | null, beforeOpen: boolean) {
  if (!rule) return undefined;
  const cache = new Map<number, Record<StatKey, number>>();
  return (lv: number) => {
    let targets = cache.get(lv);
    if (!targets) {
      const equipReq = rule.secondary?.type === "equip" ? equipRequirement(gear.weapons, job, lv, rule, beforeOpen) : undefined;
      targets = statTargets(rule, lv, equipReq);
      cache.set(lv, targets);
    }
    return targets;
  };
}

/**
 * 要湊的裝備的卷軸（全幸：套服敏捷、披風敏捷）插進衝卷：第一組最前面（這套點法靠它穿得上武器），
 * 其餘排在武器卷後面；原本就有同一組的不重複。
 */
function mergeKitFamilies<T extends { slot: string; stat: string }>(base: T[], kitFamilies: Array<T | null>): T[] {
  const extra = kitFamilies.filter((family): family is T => family !== null && !base.some(b => b.slot === family.slot && b.stat === family.stat));
  if (!extra.length) return base;
  return [extra[0], ...base.slice(0, 1), ...extra.slice(1), ...base.slice(1)];
}
```

（`otherRuleThatWears` 照舊；原本 gearPlan 裡的 cache／targetsAt 段落刪掉改用 `targetsAtFor`。import 確認有 `equipRequirement`、`statTargets`、`statShortfall`、`StatKey`。）

- [ ] **Step 4：跑測試確認通過**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__` → 全部 PASS（舊的 gearPlan 測試不能壞）。
Run：`node ../../../node_modules/typescript/bin/tsc --noEmit -p .` → 沒有錯。

- [ ] **Step 5：Commit**

```bash
git add src/lib/gear-view.ts src/lib/__tests__/gear-view.test.ts
git commit -m "v0.72 (3/4): 能力值與裝備卡的組裝可以切第二套點法——全幸照空身＋敏捷裝挑拳套、跟主推比差多少"
```

---

### Task 3b：法師「裝備法」頁的轉換提醒（洗點／不洗點）

使用者 2026-10-08 追加：「都加 洗點不洗點都加 要跟用戶說清楚洗點要多花真錢」。只在選了「裝備法」時，「看全部」的玩家提醒・能力值多兩條；全智那頁不出現。

**Files:**
- Modify: `data/guides/gear.json`（gearNotes 加兩條，帶 `"tab": "裝備法"`）
- Modify: `pipeline/lib/gear.mjs`（`convertNotes` 帶 tab）＋ `pipeline/lib/gear.test.mjs`
- Modify: `src/lib/gear.ts`（`GearNote` 加 `tab?: string`）
- Modify: `src/lib/gear-view.ts`（`notesFor(notes, job, tab?)`；`gearPlan` 傳 `rule?.tab`）＋ `src/lib/__tests__/gear-view.test.ts`
- Regenerate: `public/data/gear.json`

**Interfaces:**
- Produces：`notesFor(notes: GearNote[], job: number, tab?: string)`：有寫 tab 的提醒只在那套點法出現；沒寫的照舊。

- [ ] **Step 1：寫失敗的測試**

`pipeline/lib/gear.test.mjs` 加：
```js
test("convertNotes：研究檔寫了 tab 就帶過去（只在那套點法出現的提醒）", () => {
  const [note] = convertNotes([{ jobs: [210], topic: "stat", tab: "裝備法", text: "x", sources: [], verified: "tw" }]);
  assert.equal(note.tab, "裝備法");
});
```
`src/lib/__tests__/gear-view.test.ts` 的 notesFor 區加：
```ts
  it("寫了 tab 的提醒只在選了那套點法時出現", () => {
    const tabbed = [note({ jobs: [210], topic: "stat", t: "轉換", tab: "裝備法" }), note({ jobs: [210], topic: "stat", t: "共通" })];
    expect(notesFor(tabbed, 210).flatMap(group => group.notes.map(n => n.t))).toEqual(["共通"]);
    expect(notesFor(tabbed, 210, "裝備法").flatMap(group => group.notes.map(n => n.t))).toEqual(["轉換", "共通"]);
  });
```
真資料區加：
```ts
  it("火毒巫師選裝備法：玩家提醒・能力值有洗點（寫明要花真錢）跟不洗點兩條；全智不出現", () => {
    const stat = (tab?: string) => gearPlan(gear, 210, 50, true, tab).notes.find(group => group.topic === "stat")?.notes.map(n => n.t) ?? [];
    expect(stat("裝備法").filter(t => t.startsWith("全智轉裝備法"))).toHaveLength(2);
    expect(stat("裝備法").some(t => t.includes("洗點") && t.includes("真錢"))).toBe(true);
    expect(stat("裝備法").some(t => t.includes("不洗點"))).toBe(true);
    expect(stat().some(t => t.startsWith("全智轉裝備法"))).toBe(false);
  });
```

- [ ] **Step 2：跑測試確認失敗**（`node --test pipeline/lib/gear.test.mjs`、`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/gear-view.test.ts`）

- [ ] **Step 3：實作**
- `convertNotes`：物件加 `...(note.tab ? { tab: note.tab } : {})`。
- `GearNote` 型別加 `/** 只在這套點法出現（「裝備法」的轉換提醒）；沒寫就每套都出現 */ tab?: string;`。
- `notesFor(notes, job, tab?: string)`：`found` 的篩選加 `&& (!entry.tab || entry.tab === tab)`；函式註解補一句。
- `gearPlan` 回傳的 `notes: notesFor(gear.notes, job, rule?.tab)`。

- [ ] **Step 4：研究檔 gearNotes 加兩條**（放在「經典版不能卡裝」那條前面）

```json
    {
      "jobs": [200, 210, 211, 220, 221, 230, 231],
      "topic": "stat",
      "tab": "裝備法",
      "text": "全智轉裝備法・洗點（要花真錢）：用商城的「能力點數重配捲軸」，一張把 1 點智力退回來改點幸運，要儲值真錢買（巴哈玩家說洗 1 點約 20 台幣）。要洗的張數大約是「等級－1」（幸運從 4 補到等級＋3）：40 等約 39 張，照玩家說的價錢約 780 台幣；先穿幸運裝備（褐色斗笠＋3 等）可以少洗幾張。有錢 20 幾等就能轉，但要穿上法杖跟法師裝，傷害才會上來。",
      "sources": ["https://forum.gamer.com.tw/C.php?bsn=85994&snA=345", "https://forum.gamer.com.tw/C.php?bsn=85994&snA=1288"],
      "verified": "tw"
    },
    {
      "jobs": [200, 210, 211, 220, 221, 230, 231],
      "topic": "stat",
      "tab": "裝備法",
      "text": "全智轉裝備法・不洗點（不花錢）：之後升級的點全點幸運就好。例如 40 等開始全點幸運，50 等幸運 54，就穿得上 48 等的大魔法師短杖（要幸運 50）；補到之前繼續拿黃色雨傘。也有人到 55～60 等才改，不刻意花錢洗。",
      "sources": ["https://forum.gamer.com.tw/C.php?bsn=85994&snA=345"],
      "verified": "tw"
    },
```

- [ ] **Step 5：跑測試、重建 gear.json**（`node pipeline/build-gear.mjs`；diff 只准 notes、builtAt 變）

- [ ] **Step 6：Commit** — 主旨 `v0.72 (3b/4): 法師裝備法頁加「全智怎麼轉裝備法」——洗點要花真錢、不洗點慢慢補`

---

### Task 4：記住選擇＋卡片畫面＋README

**Files:**
- Create: `src/lib/build-choice.ts`
- Test: `src/lib/__tests__/build-choice.test.ts`
- Modify: `src/components/route/GearCard.tsx`
- Modify: `README.md`（「能力值與裝備」那條）

**Interfaces:**
- Consumes：Task 3 的 `gearPlan(..., tab)`、`GearPlan.tabs/kit/diff/compare`。
- Produces：`useBuildChoice(job: number): readonly [string | null, (tab: string | null) => void]`；純函式 `parseBuildChoices(raw: string): Record<string, string>`、`withBuildChoice(choices, line: number, tab: string | null): Record<string, string>`。

- [ ] **Step 1：寫失敗的測試** `src/lib/__tests__/build-choice.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseBuildChoices, withBuildChoice } from "@/lib/build-choice";

describe("build-choice：每個系別記一套點法", () => {
  it("存壞了、沒存過都當作沒選", () => {
    expect(parseBuildChoices("")).toEqual({});
    expect(parseBuildChoices("{壞掉")).toEqual({});
    expect(parseBuildChoices("[1,2]")).toEqual({});
    expect(parseBuildChoices('{"400":"全幸","200":3}')).toEqual({ "400": "全幸" });
  });

  it("選了記在一轉職業代碼底下；選回主推（null）就拿掉", () => {
    expect(withBuildChoice({}, 400, "全幸")).toEqual({ "400": "全幸" });
    expect(withBuildChoice({ "400": "全幸", "200": "裝備法" }, 400, null)).toEqual({ "200": "裝備法" });
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run：`node ../../../node_modules/vitest/vitest.mjs run src/lib/__tests__/build-choice.test.ts` → FAIL（沒有這個檔）。

- [ ] **Step 3：實作 `src/lib/build-choice.ts`**

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";
import { baseJob } from "./jobs";

/**
 * 首頁「能力值與裝備」卡選的點法（全幸、裝備法），每個系別記一份：鍵是一轉職業代碼（刺客、暗殺者都記在 400），
 * 升等、二轉、三轉都還是那套；選回主推就拿掉。存 localStorage（跟角色一樣關掉再開還在），
 * 用跟 lib/profile.ts 同一招：同一個分頁存了自己通知，別的分頁改了靠 storage 事件。
 * 卡片只在讀到角色之後才畫，所以這裡不會碰到伺服器那一格（server snapshot 一律當沒選）。
 */
const STORAGE_KEY = "ms-build";
const listeners = new Set<() => void>();

export function parseBuildChoices(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

export function withBuildChoice(choices: Record<string, string>, line: number, tab: string | null): Record<string, string> {
  const next = { ...choices };
  if (tab) next[String(line)] = tab;
  else delete next[String(line)];
  return next;
}

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useBuildChoice(job: number) {
  const line = baseJob(job);
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const tab = parseBuildChoices(raw)[String(line)] ?? null;
  const setTab = useCallback(
    (next: string | null) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(withBuildChoice(parseBuildChoices(readRaw()), line, next)));
      } catch {
        // 存不進去（隱私模式、空間滿了）：這次就不記，畫面照樣不換——寧可不換也不要假裝記住
      }
      for (const listener of listeners) listener();
    },
    [line],
  );
  return [tab, setTab] as const;
}
```

（確認 `baseJob` 是 `src/lib/jobs.ts` 的 export；不是的話用同檔現有的系別函式。）

- [ ] **Step 4：卡片畫面 `src/components/route/GearCard.tsx`**

1. import 補 `FilterTag`（`@/components/FilterTag`）、`useBuildChoice`（`@/lib/build-choice`），type 補 `GearKit`（`@/lib/gear`）。
2. `GearContent`：
```tsx
  const [chosen, setChosen] = useBuildChoice(job);
  const plan = useMemo(() => gearPlan(gear, job, level, where.beforeOpen, chosen), [gear, job, level, where.beforeOpen, chosen]);
```
並在 `<StatBlock …/>` 前面加 `<TabRow plan={plan} onPick={setChosen} />`；`<WeaponBlock …/>` 後面加 `{plan.kit ? <KitBlock plan={plan} where={where} /> : null}`。
3. 新元件 `TabRow`（放在 Block 後面）：
```tsx
/** 點法切換（盜賊一般點法／全幸、法師全智／裝備法）：選主推就清掉記住的值 */
function TabRow({ plan, onPick }: { plan: GearPlan; onPick: (tab: string | null) => void }) {
  if (!plan.tabs.length) return null;
  return (
    <div role="group" aria-label="點法" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[12px] font-black ink-faint">點法</span>
      {plan.tabs.map(({ tab, rule }) => (
        <FilterTag key={tab} on={rule === plan.rule} onClick={() => onPick(rule.mainstream ? null : tab)}>
          {tab}
        </FilterTag>
      ))}
    </div>
  );
}
```
4. `StatBlock`：`{inherited ? …}` 前面加
```tsx
      {plan.diff ? (
        <p className="rounded-lg bg-[color:var(--gold-wash)] px-2.5 py-1.5 text-[12px] leading-snug">
          比「{plan.diff.tab}」{plan.diff.delta >= 0 ? "多" : "少"} {Math.abs(plan.diff.delta)} {STAT_WORD[plan.diff.stat]}
          {plan.kit ? `；${plan.rule?.weapons?.[0] ?? "武器"}要的${STAT_WORD[plan.kit.stat]}靠下面的裝備補` : ""}
        </p>
      ) : null}
```
5. `WeaponBlock`：
   - `stronger` 那段最前面加 kit 的寫法（`plan.kit && stronger` 時）：
```tsx
          {stronger && plan.kit ? (
            <WeaponLine weapon={stronger}>
              空身{STAT_WORD[plan.kit.stat]}先點到 {plan.kit.base + (plan.strongerShort.find(s => s.stat === plan.kit!.stat)?.short ?? 0)} 就能用 <NameLink weapon={stronger} />
              <span className="whitespace-nowrap">（{offenseText(stronger, magic)}）</span>
            </WeaponLine>
          ) : stronger && plan.strongerVia ? (
```
   - `strongerVia` 那行字：有 tab 時寫「點上面「{plan.strongerVia.tab}」就能用」，沒有照舊「改用另一種點法「{label}」就能用」。
   - `next` 那段後面加 compare：
```tsx
          {plan.compare ? (
            <WeaponLine weapon={plan.compare.weapon}>
              {plan.compare.tab}這級用 <NameLink weapon={plan.compare.weapon} />
              <span className="whitespace-nowrap">（{offenseText(plan.compare.weapon, magic)}）</span>
              {plan.compare.need ? `，${plan.rule?.tab}要${STAT_WORD[plan.compare.need.stat]} ${plan.compare.need.value} 才穿得上` : ""}
            </WeaponLine>
          ) : null}
```
6. 新元件 `KitBlock`：
```tsx
/** 全幸要湊的敏捷裝：每件加幾點、去哪拿、要衝什麼卷、要先有多少能力值；等級還沒到的排後面變淡 */
function KitBlock({ plan, where }: { plan: GearPlan; where: Where }) {
  const kit = plan.kit!;
  const word = STAT_WORD[kit.stat];
  const row = ({ piece, source }: { piece: GearKit; source: SourcePick | null }, later: boolean) => (
    <li key={piece.ids[0]} className={`flex gap-2.5 ${later ? "opacity-60" : ""}`}>
      <ItemBox id={piece.ids[0]} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-[14px] font-bold leading-snug">
          <Link href={`/db/items?id=${piece.ids[0]}`}>{piece.n}</Link>
          <span className="whitespace-nowrap text-[13px] font-black text-[color:var(--maple)]">{word} +{piece.v}</span>
          {later && piece.lv > 0 ? <span className="whitespace-nowrap text-[12px] font-bold ink-faint">Lv.{piece.lv} 起</span> : null}
        </p>
        {piece.scroll || piece.req ? (
          <Chunks
            parts={[
              ...(piece.scroll ? [`衝${piece.scroll.n} ${piece.scroll.rate}% ${piece.scroll.times} 次`] : []),
              ...Object.entries(piece.req ?? {}).map(([stat, value]) => `要先有${STAT_WORD[stat as StatKey]} ${value}`),
            ]}
            className="block text-[12px] ink-soft"
          />
        ) : null}
        <SourceLine pick={source} where={where} />
      </div>
    </li>
  );
  return (
    <Block label={`要湊的${word}裝備`} tag={plan.rule ? <SourceTag kind="guide" verified={plan.rule.v} /> : undefined}>
      <ul className="space-y-2.5">
        {kit.worn.map(entry => row(entry, false))}
        {kit.later.map(entry => row(entry, true))}
      </ul>
      <p className="text-[13px] font-bold">
        合計：{word} {kit.base}＋{kit.total}＝{kit.wear}
      </p>
    </Block>
  );
}
```
7. `hasMore` 不變；「看全部」裡的點法說明照 `plan.rule`（已經是選的那套），其他點法照 `plan.others`。

- [ ] **Step 5：README**

`README.md` 「能力值與裝備」那條句尾補：「盜賊（刺客這條）跟法師在卡片上方可以切第二套點法（全幸、裝備法）：能力值、武器、衝卷照那套算，全幸另外列要湊的敏捷裝備；選了會記住（每個系別一份），升級路線照主推。法師選裝備法時，「看全部」的玩家提醒多「全智怎麼轉裝備法」：洗點（商城道具，要花真錢）跟不洗點兩種。」

- [ ] **Step 6：跑全部測試、型別**

Run：`node ../../../node_modules/vitest/vitest.mjs run` → 全部 PASS。
Run：`node --test "pipeline/**/*.test.mjs"` → 全部 PASS。
Run：`node ../../../node_modules/typescript/bin/tsc --noEmit -p .` → 沒有錯。
Run：掃 emoji：`node -e "const s=require('fs').readFileSync('src/components/route/GearCard.tsx','utf8')+require('fs').readFileSync('src/lib/build-choice.ts','utf8'); console.log(/[⌀-⏿■-◿\u{1F300}-\u{1FAFF}☀-➿]/u.test(s))"` → `false`。

- [ ] **Step 7：Commit**

```bash
git add src/lib/build-choice.ts src/lib/__tests__/build-choice.test.ts src/components/route/GearCard.tsx README.md
git commit -m "v0.72 (4/4): 能力值與裝備卡上方可以切第二套點法——盜賊全幸列要湊的敏捷裝，法師裝備法；記住每個系別選的"
```

---

### Task 5（主 session 做）：實測、PR、測試機

- 本機 dev server（另開埠、`next dev --webpack`）＋無頭 Chrome 手機 390 截圖：刺客 35 一般／全幸、刺客 25 全幸、暗殺者 80 全幸、火毒 50 全智／裝備法、俠盜 35（沒有切換）、重新整理後全幸還在。
- `scripts/verify/check-first-frame.mjs` 跑過（沒有 hydration 警告）。
- 推分支 → PR 進 dev → 三條「測試」綠 → 合併 → 查 Vercel 狀態 → 測試機截圖回報。
