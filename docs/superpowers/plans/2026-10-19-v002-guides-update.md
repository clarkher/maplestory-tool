# V002 攻略資料更新（v1.08）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 10/19 查核報告使用者拍板的 21 項（第 14 項不用做）寫進站上：技能點法說明的過時數字、三轉流程與點數陷阱、三轉能力值核對、殭屍練功點、女神組隊任務主推、兩筆出怪錯、兩條 V002 大任務進必解。

**Architecture:** 內容都在 `data/guides/*.json`（人工研究檔），`npm run data:guides`（`pipeline/build-guides.mjs`）編成 `public/data/guides/*.json`，`npm run data:gear` 編 `public/data/gear.json`。程式只改兩處：組隊任務可以沒有懶人包圖解、可以帶一句說明（`why`）；必解推薦多一種來源 `data`（畫面標「遊戲資料」）。

**Tech Stack:** Next.js 16 + TypeScript、vitest、node:test（pipeline）。

**Spec:** `docs/superpowers/specs/2026-10-19-v002-guides-update-design.md`（報告全文＋最後兩節「使用者拍板」「實作時的調整」，以後兩節為準）

## Global Constraints

- 全部 user-facing 文字繁體中文，零簡體；不用 emoji。
- 會上畫面的研究檔文字不准有：7 位以上數字（地圖／道具編號）、`站內`、`mapId`、`notOpenYet`、`notWorth`、`mustDo`、`unresolved` 等內部用語、屬性代碼、玩家 ID（小寫開頭帶 3 位以上數字）、英數暱稱接冒號、網址（`pipeline/lib/guides.mjs` 的 `LINT_RULES`；`npm run data:guides` 會擋）。網址只放 `sources`。
- 不編造：每句都要對得上 spec 或遊戲資料（`public/data/*.json`）；台服沒證據的寫「參考舊版資料」或「舊版說…」。
- 出怪以台服客戶端資料（`public/data/monsters.json` 的 `sp`／`maps`）為準。
- 研究檔 `warrior-pirate.json`、`archer-thief.json`、`magician.json`、`quests-exp.json`、`pq.json` 是 `JSON.stringify(x, null, 2) + "\n"` 格式，可以用 node 讀進來改完照這個格式寫回；**`gear.json` 不是**這個格式，只能用字串替換（Edit 工具或 node 對原文 replace），不准整份重排。
- 用 node 改研究檔時，每個替換都要斷言「原文剛好出現一次」，對不上就 throw，不准靜默略過。改檔腳本放 scratchpad（`C:/Users/user1/AppData/Local/Temp/claude/C--Users-user1-MapleBook--claude-worktrees-strange-saha-340c45/772c49c9-bdfe-4e6c-b87b-1a9624d1e8ea/scratchpad/`），不進 repo。
- 改完研究檔要跑 `npm run data:guides`（改 gear.json 再加 `npm run data:gear`），把 `public/data/guides/*.json`、`public/data/gear.json` 一起 commit。
- commit message 用 `v1.08 (N/9): …` 開頭，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 分支 `feat/v1.08-guides-v002`（從 origin/dev 開，已建好）。只 commit，不 push（最後一個任務統一處理）。
- gh 指令要 `GH_TOKEN=$(gh auth token --user clarkher)`，不准 `gh auth switch`。

---

### Task 1: 組隊任務可以沒有懶人包圖解、可以帶一句說明

**Files:**
- Modify: `pipeline/lib/guides.mjs`（`pqWindows`）
- Test: `pipeline/lib/guides.test.mjs`
- Modify: `src/lib/types.ts:306`（`GuidePq`）
- Modify: `src/components/route/NowCard.tsx`（`PqCard`，約 176–206 行）
- Modify: `src/components/route/RouteTimeline.tsx:356-362`
- Modify: `src/lib/__tests__/now-plan-realdata.test.ts:383-388`

**Interfaces:**
- Produces: `pq.json` 每筆可以有 `why`（字串，會上畫面、會被 lint）、`guide` 可以省略；`pqWindows()` 回傳的每筆只在研究檔有時才帶 `guide`、`why`。前端型別 `GuidePq = { key; name; quest?; entrance; guide?: string; why?: string; byJob }`。

- [ ] **Step 1: 寫失敗的測試**（加在 `pipeline/lib/guides.test.mjs` 最後）

```js
test("組隊任務：研究檔有 why 就帶出去，沒有 guide 就不帶（女神組隊沒有懶人包圖解）", () => {
  const pqList = [
    { key: "moon", name: "月妙組隊任務", quest: "1200", match: "月妙", entrance: 100000200, guide: "/guide#pq-moon" },
    { key: "goddess", name: "女神組隊任務", quest: "1203", match: "女神", entrance: 200080101, why: "經驗比打野圖慢一點" },
  ];
  const trainByJob = new Map([[410, [{ from: 51, to: 70, kind: "party", name: "女神組隊任務（天空之城 疑問之塔）" }]]]);
  const [moon, goddess] = pqWindows(pqList, trainByJob);
  assert.equal(moon.guide, "/guide#pq-moon");
  assert.equal("why" in moon, false);
  assert.equal("guide" in goddess, false);
  assert.equal(goddess.why, "經驗比打野圖慢一點");
  assert.deepEqual(goddess.byJob, { 410: [51, 70] });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test pipeline/lib/guides.test.mjs`
Expected: 新測試 FAIL（`"guide" in goddess` 是 true，或 `goddess.why` 是 undefined）

- [ ] **Step 3: 改 `pqWindows` 的第一行**

```js
  const result = pqList.map(pq => ({
    key: pq.key, name: pq.name, quest: pq.quest, entrance: pq.entrance,
    ...(pq.guide ? { guide: pq.guide } : {}),
    ...(pq.why ? { why: pq.why } : {}),
    byJob: {},
  }));
```

並把函式上方註解補一句：「`guide`（懶人包圖解）跟 `why`（大卡上的一句說明）研究檔有才帶。」

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test pipeline/lib/guides.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: 前端型別與畫面**

`src/lib/types.ts` 的 `GuidePq` 改成：

```ts
/** 組隊任務：guide 是懶人包圖解的連結（月妙、超綠才有）；why 是大卡上的一句說明（女神組隊：經驗比打野圖慢） */
export type GuidePq = { key: string; name: string; quest?: string; entrance: number; guide?: string; why?: string; byJob: Record<string, [number, number]> };
```

`NowCard.tsx` 的 `PqCard`：在 `<p className="text-[13px] ink-soft">{writer}玩家推薦…</p>` 那個 `<div>` 裡、那行 `<p>` 後面加

```tsx
          {pq.why ? <p className="mt-1 text-[13px] leading-relaxed">{pq.why}</p> : null}
```

按鈕那排改成「有 guide 才放看打法」：

```tsx
        <span className={pq.guide ? "grid grid-cols-[1fr_auto] gap-2" : "grid grid-cols-1"}>
          {routable.has(pq.entrance) ? (
            …（帶我去入口那顆不動）
          ) : <span />}
          {pq.guide ? (
            <Link href={pq.guide} className="tap-safe flex items-center justify-center rounded-full border border-[color:var(--sky)] px-4 text-[14px] font-bold text-[color:var(--sky)]">
              看打法
            </Link>
          ) : null}
        </span>
```

`RouteTimeline.tsx` 356–362 行：`) : row.pq ? (` 改成 `) : row.pq?.guide ? (`，`href={row.pq.guide}` 不動。

`now-plan-realdata.test.ts` 的「看打法連到懶人包裡那個組隊任務自己的段落」：只檢查有 `guide` 的，另外擋「沒有 guide 也沒有 why」：

```ts
  it("看打法連到懶人包裡那個組隊任務自己的段落（/guide#pq-月妙、超綠）；沒有圖解的要有一句說明", () => {
    const pqs = read<GuideCommon>("guides/common.json").pq ?? [];
    const sections = new Set(COMMON_ROUTE.flatMap(step => (step.pq ? [`/guide#pq-${step.pq}`] : [])));
    const bad = pqs
      .filter(pq => (pq.guide !== undefined ? pq.guide !== `/guide#pq-${pq.key}` || !sections.has(pq.guide) : !pq.why))
      .map(pq => `${pq.name}：${pq.guide ?? "沒有圖解也沒有說明"}`);
    expectNone("看打法連不到該組隊任務的段落", bad);
  });
```

- [ ] **Step 6: 型別檢查＋相關測試**

Run: `npx tsc --noEmit -p tsconfig.json`（沒錯誤）、`npx vitest run src/lib/__tests__/now-plan-realdata.test.ts`
Expected: PASS（資料還沒加女神，月妙、超綠照舊有 guide）

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/guides.mjs pipeline/lib/guides.test.mjs src/lib/types.ts src/components/route/NowCard.tsx src/components/route/RouteTimeline.tsx src/lib/__tests__/now-plan-realdata.test.ts
git commit -m "v1.08 (1/9): 組隊任務可以沒有懶人包圖解、可以帶一句說明（女神組隊要用）"
```

---

### Task 2: 必解推薦多一種來源「遊戲資料」

**Files:**
- Modify: `src/lib/types.ts:308-318`（`GuideMustDo`）
- Modify: `src/lib/route-planner.ts`（加 `recFromPlayers`）
- Test: `src/lib/__tests__/route-planner.test.ts`（沒有這支就建 `src/lib/__tests__/rec-source.test.ts`）
- Modify: `src/components/route/TodoList.tsx:110`
- Modify: `src/components/route/RouteTimeline.tsx`（約 389 行「玩家推薦」那顆）
- Modify: `pipeline/build-guides.mjs`（mustDo 的 `v` 檢查）

**Interfaces:**
- Produces: 研究檔 `quests-exp.json` 的 `mustDo[].verified` 可以是 `"tw" | "community" | "legacy" | "data"`；前端 `GuideMustDo.v: Verified | "data"`；`recFromPlayers(rec: GuideMustDo): boolean`（`v !== "data"`）。

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from "vitest";
import { recFromPlayers } from "@/lib/route-planner";
import type { GuideMustDo } from "@/lib/types";

const rec = (v: GuideMustDo["v"]): GuideMustDo => ({ q: "3113", chain: [], name: "女神的寵物（艾利傑）", lv: "83", why: "", v, s: [] });

describe("recFromPlayers：必解推薦是不是玩家攻略", () => {
  it("台服實測、社群整理、舊版經驗都是玩家攻略", () => {
    expect(["tw", "community", "legacy"].map(v => recFromPlayers(rec(v as GuideMustDo["v"])))).toEqual([true, true, true]);
  });
  it("遊戲資料推出來的（還沒有玩家回報）不是", () => {
    expect(recFromPlayers(rec("data"))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run <上面那支>`
Expected: FAIL（`recFromPlayers` 不存在）

- [ ] **Step 3: 實作**

`types.ts` 的 `GuideMustDo`：`v: Verified;` 改成

```ts
  /** 推薦從哪來：玩家攻略（tw／community／legacy），或 data＝只有遊戲資料、還沒有玩家回報（畫面標「遊戲資料」） */
  v: Verified | "data";
```

`route-planner.ts`（`mustDoIndex` 旁邊）：

```ts
/** 這筆必解推薦是不是玩家攻略；data＝研究時只有遊戲資料、還沒有玩家回報（V002 的大任務） */
export function recFromPlayers(rec: GuideMustDo): boolean {
  return rec.v !== "data";
}
```

`TodoList.tsx:110`：

```tsx
        {item.rec && recFromPlayers(item.rec) ? <SourceTag kind="guide" verified={item.rec.v as Verified} /> : <SourceTag kind="data" />}
```

（`import { recFromPlayers } from "@/lib/route-planner"`、`Verified` 型別照檔案現有 import 方式補。「為什麼要解」那顆照舊看 `item.rec`，不用動。）

`RouteTimeline.tsx` 必解列的按鈕文字 `玩家推薦{open ? "" : "・為什麼"}` 改成

```tsx
            {recFromPlayers(item.rec) ? "玩家推薦" : "遊戲資料"}{open ? "" : "・為什麼"}
```

`build-guides.mjs` mustDo 的 `.map(entry => {` 一開頭加：

```js
        if (!["tw", "community", "legacy", "data"].includes(entry.verified)) throw new Error(`必解「${entry.questName}」：verified 只能是 tw／community／legacy／data，寫的是 ${entry.verified}`);
```

並在檔頭註解的「輸入」那段 quests-exp.json 後面補：「必解的 verified 多一種 data：只有遊戲資料、還沒有玩家回報，畫面標『遊戲資料』」。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run <上面那支>`、`npx tsc --noEmit -p tsconfig.json`、`npm run data:guides`
Expected: PASS、無型別錯誤、build 成功（資料還沒有 data，輸出不變，只有 builtAt）

- [ ] **Step 5: Commit**（`public/data/guides/` 只有 builtAt 變就不要 commit 它們：`git checkout -- public/data/guides`）

```bash
git add src/lib/types.ts src/lib/route-planner.ts src/lib/__tests__/<測試檔> src/components/route/TodoList.tsx src/components/route/RouteTimeline.tsx pipeline/build-guides.mjs
git commit -m "v1.08 (2/9): 必解推薦多一種來源「遊戲資料」——還沒有玩家回報的大任務不標成玩家攻略"
```

---

### Task 3: 女神組隊任務進組隊任務表，六個職業 51～70 主推（第 17 項）

**Files:**
- Modify: `data/guides/pq.json`
- Modify: `data/guides/warrior-pirate.json`（110、120、130 的 `training`）
- Modify: `data/guides/archer-thief.json`（410、420 的 `training`）
- Modify: `data/guides/magician.json`（230 的 `training`）
- Regenerate: `public/data/guides/*.json`

**Interfaces:**
- Consumes: Task 1 的 `why`、可省略 `guide`。

- [ ] **Step 1: `pq.json`**：`researchedAt` 改 `"2026-10-19"`，`pq` 陣列最後加

```json
    {
      "key": "goddess",
      "name": "女神組隊任務",
      "quest": "1203",
      "match": "女神",
      "entrance": 200080101,
      "why": "官方：51～70 等、剛好 6 人、限時 60 分鐘，入口在天空之城疑問之塔找溫莉。熟手一場約 22 分鐘，58 等一場大約 8～9% 經驗，比打野圖慢一點；每場給一根女神的羽翼（40 根加溫莉的好感換女神手鐲），還會抽隨機卷軸。"
    }
```

- [ ] **Step 2: 六個職業各加一段**（加在各自 `training` 陣列最後；jobId 110、120、130、410、420、230，內容完全一樣）

```json
        {
          "levelFrom": 51,
          "levelTo": 70,
          "kind": "party",
          "mapName": "女神組隊任務（天空之城 疑問之塔）",
          "mapId": null,
          "mobs": [],
          "why": "板上回覆說賊、僧侶、劍士都滿建議去打。51～70 等、剛好 6 人；58 等一場大約 8～9% 經驗、熟手約 22 分鐘一場，比打野圖慢一點，打一場拿女神的羽翼跟隨機卷軸。隊上劍士、法師、弓箭手、盜賊、海盜都有時，溫莉會給全隊 30 分鐘的隨機增益。",
          "sources": [
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2254",
            "https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20209",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=1291"
          ],
          "verified": "community"
        }
```

- [ ] **Step 3: 重編**

Run: `npm run data:guides`
Expected: 成功；警告裡不准有「女神」相關的「超出遊戲限制」（任務 1203 是 51～70，剛好）。檢查：

```bash
node -e 'const c=require("./public/data/guides/common.json"); const g=c.pq.find(p=>p.key==="goddess"); console.log(JSON.stringify(g)); for (const j of [110,111,120,121,130,131,410,411,420,421,230,231]) if(!g.byJob[j]) throw new Error("缺 "+j); if (g.byJob[310]||g.byJob[320]||g.byJob[210]) throw new Error("不該掛");'
```

Expected: 印出女神那筆，`byJob` 有 6 個二轉＋6 個三轉都是 `[51,70]`，沒有 guide。

- [ ] **Step 4: 真資料測試**

Run: `npx vitest run src/lib/__tests__/now-plan-realdata.test.ts`
Expected: PASS。紅了逐項看：若是「多升一級主推圖掉超過 10 級」在 70→71（組隊結束接野圖）之類的接縫，先確認是設計上的正常結果還是程式錯；正常結果才照該測試現有 `KNOWN_DROPS` 的寫法加例外並寫原因，不准放寬判斷式。

- [ ] **Step 5: Commit**

```bash
git add data/guides/pq.json data/guides/warrior-pirate.json data/guides/archer-thief.json data/guides/magician.json public/data/guides
git commit -m "v1.08 (3/9): 女神組隊任務 51～70 主推——劍士三職、刺客、俠盜、僧侶（板上說滿建議去；獵人照回覆留猴森），大卡寫明經驗比野圖慢"
```

---

### Task 4: 技能點法說明裡改版前的數字（第 3～11 項）

**Files:**
- Modify: `data/guides/archer-thief.json`、`data/guides/magician.json`、`data/guides/warrior-pirate.json`（`jobs[].skillBuilds[].steps[].note`，祭司加一套）
- Regenerate: `public/data/guides/*.json`

用 node 腳本：找到 `jobs` 裡 `jobId` 那一筆、`skillBuilds[B].steps[S]`，斷言 `note === 舊字` 再換成新字（B、S 從 0 起算）。

- [ ] **Step 1: 套用下表**

| 檔 | jobId | B | S | 技能 | 舊 note | 新 note |
|---|---|---|---|---|---|---|
| archer-thief | 421 | 0 | 4 | 落葉斬 | 單體攻擊，有機率把怪打暈，點滿攻擊 450% | 單體攻擊，有機率把怪打暈，點滿攻擊 500% |
| archer-thief | 421 | 0 | 8 | 楓幣護盾 | 點滿撐 120 秒、花的楓幣比較少 | 點滿撐 180 秒、花的楓幣是擋下傷害的 61% |
| archer-thief | 421 | 1 | 3 | 楓幣護盾 | 點越高越省楓幣、撐越久（點滿 120 秒） | 點越高越省楓幣、撐越久（點滿 180 秒） |
| archer-thief | 411 | 0 | 10 | 風魔手裏劍 | 這套主要拿它引怪；25 級就能打 6 隻，跟點滿差不多 | 這套主要拿它引怪；21 級起就能打 6 隻，25 級攻擊 165%、點滿 180% |
| archer-thief | 321 | 0 | 1 | 四連箭 | 主攻招，一次射 4 箭打一隻；也可以先點到 15 | 主攻招，一次射 4 箭打一隻；也可以先點到 15。經典版多了打被冰住的怪有機率直接打死（11 級起 2%、21 級起 3%），剛好配寒冰箭 |
| magician | 221 | 0 | 2 | 極速詠唱 | 點到 11 施法速度就明顯變快 | 舊版說點到 11 施法速度就明顯變快（遊戲裡看不到每一級的數字） |
| magician | 221 | 1 | 2 | 極速詠唱 | 點到 12 持續時間跟點滿的神聖祈禱一樣久，跟祭司一起練時好一起補 | 舊版排法點到 12（遊戲裡看不到每一級的數字） |
| magician | 211 | 0 | 1 | 極速詠唱 | 點到 11 施法就快兩級，三轉招式出手追回二轉的速度 | 舊版說點到 11 施法就快兩級、三轉招式出手追回二轉的速度（遊戲裡看不到每一級的數字） |
| magician | 211 | 1 | 4 | 極速詠唱 | 點到 11 施法就快兩級 | 舊版說點到 11 施法就快兩級（遊戲裡看不到每一級的數字） |
| magician | 211 | 1 | 1 | 致命毒霧 | 毒法的主力：整片放毒、沒有隻數限制，點滿後中毒的怪 40 秒內血都會降到 1 | 毒法的主力：整片放毒、沒有隻數限制，點滿持續 40 秒、70% 機率中毒；舊版說中毒的怪血會一路降到 1（遊戲說明沒寫） |
| magician | 231 | 0 | 2 | 神聖祈禱 | 組隊時全隊打怪經驗變多（點滿是 1.5 倍），當年組隊廣播都在找祈禱點滿的祭司 | 組隊時全隊打怪經驗變多（舊版點滿 1.5 倍；經典版遊戲裡看不到數字，10/16 官方修過一次經驗算法），當年組隊廣播都在找祈禱點滿的祭司 |
| warrior-pirate | 521 | 0 | 5 | 火焰噴射 | 剩下的點；舊文說練功幾乎用不到 | 剩下的點；舊文說練功幾乎用不到，但那是改版前：經典版火焰噴射加強到 190%（寒霜噴射 160%），點滿一樣打 6 隻，還沒有台服實測哪招好用 |
| warrior-pirate | 121 | 0 | 0 | 烈焰之劍 | 先點哪一種屬性，看接下來要打的怪怕什麼（舊文也有先冰的）；拿棍改點烈焰之棍 | 經典版火屬性最痛（點滿 140%，雷 125%、冰 110%），冰原雪域大多數怪怕火，先點火；拿棍改點烈焰之棍 |
| warrior-pirate | 511 | 0 | 1 | 致命暗襲 | 怪被暈住時有機率爆擊，三轉後盡快點滿 | 怪被暈住時有機率爆擊，舊版三轉後盡快點滿；經典版能量暴擊多了打暈（點滿 40%），剛好讓它發動。板上也有人主張先點滿蓄能激發，還沒人實測 |

數字出處（實作者要對一次 `public/data/skills.json` 的 `levels`）：落葉斬 4211002 第 30 級 damage 500；楓幣護盾 4211005 第 20 級 time 180、x 61；風魔手裏劍 4111005 第 21 級 mobCount 6、第 25 級 damage 165、第 30 級 180；四連箭 3211006 第 11 級 prop 2、第 21 級 3；致命毒霧 2111003 第 30 級 time 40、prop 70；火焰噴射 5211004 第 30 級 damage 190、mobCount 6；寒霜噴射 5211005 第 30 級 160；烈焰／雷鳴／寒冰之劍 1211003／1211007／1211005 第 30 級 140／125／110；能量暴擊 5111002 第 30 級 prop 40；極速詠唱 2111005／2211005、神聖祈禱 2311003 的隊員經驗欄位都沒有數字。哪一個對不上就停下來回報，不要改字湊。

- [ ] **Step 2: 祭司 231 加第三套**（`skillBuilds` 陣列最後）

```json
        {
          "label": "經典版板上建議：聖光先點 1、神聖祈禱先滿（巴哈姆特 2026-10-16）",
          "mainstream": false,
          "verified": "community",
          "sources": [
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=1291"
          ],
          "steps": [
            { "skillId": 2311004, "skillName": "聖光", "to": 1, "note": "先點 1 點過渡，有範圍攻擊可以打" },
            { "skillId": 2311001, "skillName": "淨化", "to": 3, "note": "神聖祈禱要先有淨化 3（遊戲規定）" },
            { "skillId": 2311003, "skillName": "神聖祈禱", "to": 30, "note": "先點滿；板上說先滿聖光也行，但組隊會比較難找" },
            { "skillId": 2311004, "skillName": "聖光", "to": 30, "note": "再回頭點滿；聖龍召喚可以晚點，時空門、淨化看自己需要" }
          ]
        }
```

- [ ] **Step 3: 重編＋檢查**

Run: `npm run data:guides`
Expected: 成功、沒有 lint 錯誤、沒有新的「技能…不在站內資料」「超過上限」警告。

- [ ] **Step 4: 測試**

Run: `npx vitest run`（全套）
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/guides public/data/guides
git commit -m "v1.08 (4/9): 三轉點法說明換成經典版數字——神偷落葉斬 500%、楓幣護盾 180 秒、風魔 21 級 6 隻、四連箭冰住秒殺、騎士先火、神槍手火焰噴射 190%；極速詠唱、祈禱看不到數字的改寫舊版說；祭司加板上建議那套"
```

---

### Task 5: 三轉流程（二轉頁）＋三轉點數陷阱（三轉頁）（第 1、2 項）

**Files:**
- Modify: `data/guides/warrior-pirate.json`、`archer-thief.json`、`magician.json`（`jobs[].notes`）
- Regenerate: `public/data/guides/*.json`

- [ ] **Step 1: 12 個三轉職業（111、121、131、511、521、311、321、411、421、211、221、231）的 `notes` 最前面插入**（每個都一樣）

```json
        {
          "text": "三轉的技能點跟一、二轉是同一池：拿去點一、二轉的技能，三轉不會退回來。三轉能用的點數＝（等級−70）×3＋1，120 等共 151 點。10/19 查：三轉技能重置卷只有菇菇通行證 S2 的新角色 70 等高級獎勵有，舊角色還買不到，點錯沒得洗。",
          "sources": [
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2227",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2276",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2225",
            "https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20211"
          ]
        }
```

- [ ] **Step 2: 12 個二轉職業的「三轉怎麼轉」**

槍騎兵 130 現有那條（`text` 開頭是「70 等三轉轉職條件（舊版）：打武術教練」）**整條換掉**；另外 11 個（110、120、210、220、230、310、320、410、420、510、520）在 `notes` 最後新增。文字照職業線填：

| 職業線 | jobId | 三轉教官 | 一轉教官 | 次元之門 | 一轉點數 |
|---|---|---|---|---|---|
| 劍士 | 110、120、130 | 劍士三轉教官泰勒斯 | 武術教練 | 螞蟻礦坑 | 61 |
| 法師 | 210、220、230 | 法師三轉教官羅貝亞 | 漢斯 | 巫婆森林Ⅱ | 67 |
| 弓箭手 | 310、320 | 弓箭手三轉教官蕾妮 | 赫麗娜 | 森林迷宮V | 61 |
| 盜賊 | 410、420 | 盜賊三轉教官阿里可 | 達克魯 | 猴子沼澤地Ⅱ | 61 |
| 海盜 | 510、520 | 海盜三轉教官佩特勞 | 卡伊琳 | 火獨眼獸洞穴II | 61 |

樣板（`{…}` 換成上表；劍士線三職最後多接一句 `舊版說酋長的分身會召喚月牛、放法術，多帶萬能藥；70 等敏捷 80 左右打得中。`）：

```
三轉怎麼轉（10/15 開放）：二轉、70 等到冰原雪域的長老公館找{三轉教官}。接任務前一、二轉的技能點要剛好點完（一轉 {一轉點數} 點、二轉 121 點），多點的會吃掉三轉的點。① 力量的考驗：回去找{一轉教官}，進{次元之門}的次元之門，20 分鐘內打倒 80 等的分身撿黑符，換力量項鍊。② 智慧的考驗：到尖銳的絕壁Ⅱ右上的雪原聖地，交 1 顆黑暗水晶給神聖的石頭答題，全對拿智慧項鍊，答錯一題就燒掉一顆水晶。黑暗水晶是 10 顆黑暗母礦到冰原雪域找伯堅精煉的，大幽靈、巫婆都會掉母礦。次元之門在哪、一次答幾題是照舊版資料整理的，參考舊版資料。
```

`sources`（12 條都一樣；劍士線三職另外加 `https://forum.gamer.com.tw/G2.php?bsn=7650&parent=12526&sn=1277`）：

```json
          "sources": [
            "https://maplestoryclassic-event.beanfun.com/EventAd/EventAd?eventAdId=20209",
            "https://maplestoryclassic.beanfun.com/bulletin?Bid=83960",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2073",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2241",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2242"
          ]
```

確認地名真的在遊戲資料裡（`public/data/maps.json` 的 `zh`）：螞蟻礦坑、巫婆森林Ⅱ、森林迷宮V、猴子沼澤地Ⅱ、火獨眼獸洞穴II、長老公館、尖銳的絕壁Ⅱ（雪原聖地資料裡沒有中文名，照公告寫法即可）。

- [ ] **Step 3: 重編＋檢查**

Run: `npm run data:guides`
Expected: 成功、沒有 lint 錯誤。再檢查：

```bash
node -e 'for (const j of [111,121,131,511,521,311,321,411,421,211,221,231]) { const g=require("./public/data/guides/"+j+".json"); if(!g.notes[0].t.startsWith("三轉的技能點跟一、二轉是同一池")) throw new Error(j); } for (const j of [110,120,130,210,220,230,310,320,410,420,510,520]) { const g=require("./public/data/guides/"+j+".json"); const n=g.notes.filter(x=>x.t.startsWith("三轉怎麼轉")); if(n.length!==1) throw new Error(j+" "+n.length); if(g.notes.some(x=>x.t.includes("三轉轉職條件（舊版）"))) throw new Error("舊的還在 "+j); } console.log("ok")'
```

- [ ] **Step 4: 測試** `npx vitest run` → PASS

- [ ] **Step 5: Commit**

```bash
git add data/guides public/data/guides
git commit -m "v1.08 (5/9): 二轉頁寫三轉怎麼轉（台服跑過的兩段流程、點數要剛好點完），三轉頁最上面提醒點回一二轉不退、舊角色還沒有洗點卷"
```

---

### Task 6: 三轉能力值（第 12、13 項）

**Files:**
- Modify: `data/guides/gear.json`（只准字串替換，不准整份重排）
- Regenerate: `public/data/gear.json`

- [ ] **Step 1: 各條 `text` 後面接一句**（找 `"jobs": [N]` 那一筆的 `text`，舊字整句保留、後面直接接新句）

| jobs | 接在 text 後面 |
|---|---|
| [131] | 遊戲資料核對過：70～120 等的槍、矛跟劍士防具都只要力量、不要敏捷，敏捷留著是為了打得中。 |
| [211, 221, 231] 的「三轉裝備法」 | 遊戲資料核對過：70～120 等的長杖跟法師防具要幸運＝等級＋3（短杖是＋2），跟這條一致。 |
| [311] | 遊戲資料核對過：70～120 等的弓都要力量＝等級＋5（70 等 75、120 等 125），跟這條一致。 |
| [321] | 遊戲資料核對過：70～120 等的弩都要力量＝等級，跟這條一致。 |
| [411] 的「三轉：敏捷只點到拳套需求」 | 遊戲資料核對過：70～120 等的拳套跟盜賊防具都要敏捷＝等級＋40（70 等 110），跟這條一致。 |
| [421] 的「三轉：敏捷只點到短刀需求」 | 遊戲資料核對過：70～120 等幸運型短刀跟盜賊防具都要敏捷＝等級＋40，跟這條一致。 |
| [521] | 遊戲資料核對過：70～100 等的火槍都要力量＝等級，跟這條一致。 |
| [511] | 遊戲資料核對過：70～100 等的指虎都要敏捷＝等級，跟這條一致。 |
| [411] 的「三轉全幸」 | 70 等起拳套跟盜賊防具要敏捷 110、之後每 10 等多 10，等於要靠裝備補 85 敏以上；下面那組敏捷裝全部衝完也只有 19，光靠它穿不上 70 等的拳套。 |
| [421] 的「三轉全幸」 | 70 等起短刀跟盜賊防具要敏捷 110、之後每 10 等多 10，等於要靠裝備補 85 敏以上；下面那組敏捷裝全部衝完也只有 19，光靠它穿不上 70 等的短刀。 |

「三轉全幸」兩筆的 `text` 原文一模一樣，替換時要連 `"jobs": [411]`／`[421]` 一起當定位（或用 node 對原文找第 N 次出現），斷言各換到一次。

數字出處要自己對 `data/raw/artale.json` 或 `public/data/items.json`（裝備需求 reqSTR／reqDEX／reqLUK 之類欄位）抽查至少：70 等弓力 75、70 等拳套敏 110、70 等法師防具幸 73。全幸那組 19＝`public/data/gear.json` 裡 411 全幸那筆 `kit` 的 `v` 加總（10＋5＋3＋1）；對不上就停下來回報。

- [ ] **Step 2: 重編** `npm run data:gear` → 成功；`git diff --stat data/guides/gear.json` 只有這 10 行在變。

- [ ] **Step 3: 測試** `npx vitest run` → PASS

- [ ] **Step 4: Commit**

```bash
git add data/guides/gear.json public/data/gear.json
git commit -m "v1.08 (6/9): 三轉能力值用遊戲資料核對過 70～120 等裝備需求（照二轉公式繼續點）；全幸寫明 70 等起要補 85 敏、那組裝備只有 19"
```

---

### Task 7: 練功點——殭屍、兩筆出怪錯、未開放清單整理（第 15、16、18、19、20B 項）

**Files:**
- Modify: `data/guides/magician.json`、`archer-thief.json`、`warrior-pirate.json`
- Regenerate: `public/data/guides/*.json`

- [ ] **Step 1: 僧侶 230 `training` 最後加**

```json
        {
          "levelFrom": 57,
          "levelTo": 70,
          "kind": "solo",
          "mapName": "亡者之林Ⅳ／廢棄礦坑Ⅰ（殭屍、礦山殭屍）",
          "mapId": 211041400,
          "mobs": [
            { "name": "殭屍", "id": 5130107, "lv": 57 },
            { "name": "礦山殭屍", "id": 5130108, "lv": 57 }
          ],
          "why": "殭屍、礦山殭屍都是 57 等的不死系，群體治癒補得到；板上說這是冰原少數能用群體治癒練等的怪。亡者之林Ⅰ～Ⅳ、廢棄礦坑Ⅰ～Ⅲ都是同一種怪，挑人少的那張。要先在冰雪峽谷Ⅱ最上面找傑夫送過去。",
          "sources": [
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=1291",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2278"
          ],
          "verified": "community"
        }
```

- [ ] **Step 2: 祭司 231 `training` 加**（231 現在是空陣列）

```json
        {
          "levelFrom": 70,
          "levelTo": 85,
          "kind": "solo",
          "mapName": "亡者之林Ⅳ／廢棄礦坑Ⅰ（殭屍、礦山殭屍）",
          "mapId": 211041400,
          "mobs": [
            { "name": "殭屍", "id": 5130107, "lv": 57 },
            { "name": "礦山殭屍", "id": 5130108, "lv": 57 }
          ],
          "why": "滿祈禱的祭司實際打殭屍：單練一隻 190 經驗、有隊友 155＋54。殭屍是不死系，群體治癒跟聖光都打得痛，毒打不動。打到幾等板上沒講，85 是推估。",
          "sources": [
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2278",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=2270",
            "https://forum.gamer.com.tw/C.php?bsn=85994&snA=1291"
          ],
          "verified": "tw"
        }
```

- [ ] **Step 3: 刪 / 改**

- `magician.json` 頂層 `notOpenYet`：刪掉 `jobId` 230、`levelFrom` 55、`levelTo` 70（亡者之林殭屍）那筆，跟 230、70、100（天空之城／冰原雪域：白狼人、雪吉拉…）那筆（第 16 項）。
- `archer-thief.json` 410 `training`：刪掉 `mapName` 是「龍族之地 混種石巨人」那筆（第 18 項；台服龍族之地出冰獨眼獸、青龍、冰龍，沒有混種石巨人）。
- `magician.json` 220 `training` 裡 `mapName`「冰獨眼獸洞穴Ⅱ」、`levelFrom` 57 那筆（第 19 項）：`mapName` → `危險的峽谷Ⅱ`、`mapId` → `106000002`、`mobs` 只留赤龍 `{ "name": "赤龍", "id": 6130100, "lv": 60 }`；研究備註 `note` 換成 `"波波寫在危險的峽谷Ⅱ；遊戲資料 2.0.0 起這張圖有赤龍×17、土龍×5、火肥肥×8，跟波波一致（2026-10-19 改回）。"`。`why`、`sources`、`verified` 不動。
- `magician.json` 的 `unresolved` 裡開頭是「【地圖資料矛盾：危險的峽谷】」那條：最後接 `（2026-10-19：遊戲資料 2.0.0 起危險的峽谷Ⅱ有赤龍×17、土龍×5、火肥肥×8，跟波波一致，冰雷赤龍那段已改掛危險的峽谷Ⅱ。）`
- `magician.json` 210 的 `notes` 裡含「天空之城藍光公園打幼藍獨角獅」那條：「藍光公園」→「藍光公園（現在叫藍光庭園Ⅰ）」。

- [ ] **Step 4: 未開放清單整理（第 20B 項，只刪查不到的字、改成遊戲裡的名字）**——在三份檔頂層 `notOpenYet[].place` 做字串替換，每個斷言剛好一次：

| 檔 | jobId | 舊 | 新 |
|---|---|---|---|
| warrior-pirate | 110 | 天空之城小石球／幼獅、冰原雪域小雪球／野狼／變型雪吉拉 | 天空之城小石球／幼獨角獅、冰原雪域小雪球／野狼 |
| warrior-pirate | 120 | 天空之城（小石球、幼獅、女神之塔洗雲唱） | 天空之城（小石球、幼獨角獅） |
| warrior-pirate | 130 | 天空之城（幼獨、紅黃藍光庭園、天空露台、雲彩公園日月光） | 天空之城（幼獨角獅、紅黃藍光庭園、雲彩公園日月光） |
| warrior-pirate | 510 | 天空幼獨腳獅 | 天空之城幼獨角獅 |
| warrior-pirate | 510 | 女神洗雲唱、 | （刪掉） |
| warrior-pirate | 520 | 天城幼獅 | 天空之城幼獨角獅 |
| archer-thief | 310 | 天空之城 女神之塔洗經驗團、雲彩公園 日月光精靈 | 天空之城 雲彩公園 日月光精靈 |
| archer-thief | 320 | 結冰平原 | 結冰的平原 |
| archer-thief | 320 | 殭屍（礦山殭屍）、藍獅、維京、 | 殭屍（礦山殭屍）、 |
| archer-thief | 410 | 天空之城 幼獅 | 天空之城 幼獨角獅 |
| archer-thief | 410 | 雲彩公園Ⅳ～Ⅵ 蝴蝶精、星光／月光／日光精靈；冰原雪域 小雪球、野狼；女神之塔 | 雲彩公園Ⅳ～Ⅵ 星光／月光／日光精靈；冰原雪域 小雪球、野狼 |
| archer-thief | 420 | 幼獅、利提 | 幼獨角獅、利堤 |
| magician | 210 | 天空之城 藍光公園 幼藍獨角獅 | 天空之城 藍光庭園Ⅰ 幼藍獨角獅 |
| magician | 210 | 天空之城 藍光庭院 藍獨角獅 | 天空之城 藍光庭園 II 藍獨角獅 |

（舊字要先 `grep` 確認原文；跟表上差一兩個字時照原文改，意思不變，並在回報裡列出。）

- [ ] **Step 5: 重編＋檢查**

Run: `npm run data:guides`
Expected: 成功；警告裡不准出現「亡者之林Ⅳ」「危險的峽谷Ⅱ」的「寫的怪…一隻都不出」。

```bash
node -e 'const g=require("./public/data/guides/231.json"); console.log(g.train.map(t=>t.from+"-"+t.to+" "+t.name).join("\n")); const k=require("./public/data/guides/411.json"); if(k.train.some(t=>t.name.includes("龍族之地"))) throw new Error("龍族之地還在"); const i=require("./public/data/guides/221.json"); if(!i.train.some(t=>t.map===106000002)) throw new Error("冰雷赤龍沒改到");'
```

Expected: 231 列得出 57-70 跟 70-85 兩筆殭屍（57-70 是從僧侶沿用的）。

- [ ] **Step 6: 測試** `npx vitest run` → PASS（主推圖跳動之類紅燈照 Task 3 Step 4 的原則處理）

- [ ] **Step 7: Commit**

```bash
git add data/guides public/data/guides
git commit -m "v1.08 (7/9): 僧侶、祭司打殭屍（亡者之林、廢棄礦坑）；刺客「龍族之地 混種石巨人」拿掉、冰雷赤龍改回危險的峽谷Ⅱ（台服出怪）；未開放清單改成遊戲裡的名字"
```

---

### Task 8: 兩條 V002 大任務進必解（第 21 項）

**Files:**
- Modify: `data/guides/quests-exp.json`（`mustDo` 最後加兩筆）
- Regenerate: `public/data/guides/common.json`

**Interfaces:**
- Consumes: Task 2 的 `verified: "data"`。

- [ ] **Step 1: 加兩筆**

```json
    {
      "questName": "女神的寵物（艾利傑）",
      "questId": "3113",
      "suggestedLevel": "83",
      "chain": ["3111", "3112", "3113", "3114"],
      "chainSiteExpTotal": 385600,
      "why": "遊戲資料：天空之城史菲魯納的任務線，第 3 段打艾利傑一隻給 384,000 經驗，大約 83 等一級的 9%。前面要先打星光精靈 50、月光精靈 100、日光精靈 150 隻。艾利傑 83 等、HP 8.7 萬、物防 600，建議組隊打。10/19 查還沒有台服玩家回報解過。",
      "needs": "Lv83 天空之城老婆之屋找史菲魯納。",
      "sourceExp": 384000,
      "sources": [],
      "verified": "data",
      "siteMinLv": 83,
      "siteExp": 384000
    },
    {
      "questName": "雪原的巨人（雪毛怪人）",
      "questId": "3109",
      "suggestedLevel": "90",
      "chain": ["3105", "3106", "3107", "3108", "3109", "3110"],
      "chainSiteExpTotal": 543700,
      "why": "遊戲資料：冰原雪域杰德、史卡圖勒的任務線，打雪毛怪人一隻給 539,700 經驗，大約 90 等一級的 9%。雪毛怪人 90 等、HP 12 萬、物防 800，雪人之谷只有一隻、45 分鐘才重生一次，建議組隊打。10/19 查還沒有台服玩家回報解過。",
      "needs": "Lv90 冰原雪域找杰德。",
      "sourceExp": 539700,
      "sources": [],
      "verified": "data",
      "siteMinLv": 90,
      "siteExp": 539700
    }
```

先用 `public/data/quests.json`、`monsters.json` 核對：3111 要打星光精靈 50、月光精靈 100、日光精靈 150；3113 打艾利傑 384,000；艾利傑 lv 83、hp 87,000、物防（pdd）600；3109 打雪毛怪人 539,700；雪毛怪人 lv 90、hp 120,000、pdd 800、雪人之谷 211040101 一隻、重生 2,700 秒（看 `sp` 或 maps 資料的重生秒數）；`chainSiteExpTotal` 是 chain 各段 `exp` 加總。任何一個對不上就照遊戲資料改字並回報。

- [ ] **Step 2: 重編** `npm run data:guides` → 成功、沒有「任務…不在站內資料」。

- [ ] **Step 3: 確認先解真的列出來**（臨時測試檔，跑完刪掉，不 commit）

```ts
// src/lib/__tests__/zz-v002-quests.test.ts
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { effectiveLevels, nowQuests } from "@/lib/now-plan";
const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const read = (n: string) => JSON.parse(fs.readFileSync(`${DATA}${n}`, "utf8"));
it("83 等暗殺者、90 等十字軍的先解有那兩條", () => {
  const quests = read("quests.json"), monsters = read("monsters.json"), common = read("guides/common.json"), maps = read("maps.json");
  const effective = effectiveLevels(quests, monsters, common);
  const titles = (job: number, level: number) => nowQuests({ level, job, quests, monsters, common, maps, effective }).map(t => t.title);
  expect(titles(411, 83).some(t => t.includes("艾利傑") || t.includes("女神的寵物"))).toBe(true);
  expect(titles(111, 90).some(t => t.includes("雪毛怪人") || t.includes("雪原的巨人"))).toBe(true);
});
```

Run: `npx vitest run src/lib/__tests__/zz-v002-quests.test.ts` → PASS，然後 `rm` 這支。

- [ ] **Step 4: 全套** `npx vitest run` → PASS（「先解」「長線」相關真資料測試紅了逐項看是不是這兩條造成、怎麼修，不准放寬斷言）

- [ ] **Step 5: Commit**

```bash
git add data/guides/quests-exp.json public/data/guides/common.json
git commit -m "v1.08 (8/9): 83 等艾利傑（38.4 萬）、90 等雪毛怪人（54 萬）進先解，標遊戲資料、還沒有台服回報、建議組隊"
```

---

### Task 9: 文件＋整體驗收

**Files:**
- Modify: `README.md`
- Modify: `C:/Users/user1/.claude/projects/C--Users-user1-MapleBook/memory/maplebook-v002-research-1019.md`（記實作結果）

- [ ] **Step 1: README**
  - 首頁「現在去這裡」那段：組隊任務句子補「（10/15 起含女神組隊任務：51～70，劍士三職、刺客、俠盜、僧侶；大卡寫明經驗比打野圖慢）」。
  - 「玩家攻略（`data/guides/`）」那節：`pq.json` 那句補「每筆可以帶 `why`（大卡上的一句說明，會檢查用字）；`guide`（懶人包圖解）有才放看打法」；必解那句補「`verified` 多一種 `data`：只有遊戲資料、還沒有玩家回報（V002 的艾利傑、雪毛怪人），畫面標『遊戲資料』」；最後加一句「2026-10-19 依改版後查核更新過一次（技能說明換成經典版數字、三轉流程、殭屍練功點、女神組隊），報告在 `docs/superpowers/specs/2026-10-19-v002-guides-update-design.md`」。

- [ ] **Step 2: 全套測試＋建置**

Run: `npm test`、`npm run data:verify`、`npx next build --webpack`（或專案現有的 build 指令）
Expected: 全綠。

- [ ] **Step 3: 瀏覽器實測**（dev server，worktree 要另開埠＋`--webpack`，見記憶 maplebook-repo-deploy）
  - 選狂戰士 55 等：主推大卡是「女神組隊任務」，有說明那句、有「帶我去入口」、沒有「看打法」。
  - 選獵人 55 等：主推不是女神組隊。
  - 選祭司 80 等：練功有亡者之林；技能卡有第三套「經典版板上建議」；玩家提醒第一條是點數陷阱。
  - 選神偷 75 等：技能點法落葉斬那步寫 500%。
  - 選暗殺者 83 等：先解有「女神的寵物（艾利傑）」，標籤是「遊戲資料」、點「為什麼要解」看得到說明。
  - 選槍騎兵 60 等：玩家提醒有「三轉怎麼轉」，沒有舊的「三轉轉職條件（舊版）」。
  每個截圖存 scratchpad。

- [ ] **Step 4: Commit 文件**

```bash
git add README.md
git commit -m "v1.08 (9/9): README 補女神組隊、組隊任務說明、必解的遊戲資料來源"
```
