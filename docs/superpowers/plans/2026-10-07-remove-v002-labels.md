# V002 開放後拆掉「10/15 開放」標籤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** V002 開放之後，把只在開放前才會出現的東西整批拆掉——「10/15 開放」標籤、首頁那條「已經照 10/15 改版排好…」橫幅、開放前專用的推薦分支、建置時間——開放後的畫面跟拆之前一模一樣，只少了永遠不會出現的東西。

**Architecture:** 先把測試改成「開放後」的樣子、在還沒動的程式上跑綠（把開放後的行為鎖住），再由下往上拆：lib（`gear.ts`／`gear-view.ts`／`item-view.ts` 的 `beforeOpen`、`opensLater`）→ 畫面呼叫端（首頁、查資料四頁、帶我去）→ 刪 `release.ts`、`v002.ts`、`MAPLEBOOK_BUILD_TIME` → 文件與註解。資料（`public/data/*`、`maps.json` 的 `o`）跟 pipeline 的邏輯一律不動。最後用無頭 Chrome 比對拆前、拆後同一組畫面的文字，一字不差才算過。

**Tech Stack:** Next.js 16 app router＋React 19＋TypeScript（strict）、Tailwind v4、Vitest（`src/lib/__tests__`）、node:test（`pipeline/**/*.test.mjs`）、無頭 Chrome 走 DevTools 協定（Node 22 內建 WebSocket）、GitHub＋Vercel（分支預覽、dev 測試機）。

**Spec:** 本檔「設計決定」一節。來源：使用者 2026-10-07 拍板「V002 開放後，把 10/15 開放標籤相關的程式整批拆掉——開放後那些判斷永遠是 false，是死程式」。

## Global Constraints

- 全程繁體中文（註解、測試名稱、commit、PR、回報）；程式碼、指令、檔名保留英文。
- **只進 dev，不准合進 main。** dev → main（正式機）要使用者當輪明講。
- `gh` 一律加 `GH_TOKEN=$(gh auth token --user clarkher)`（PowerShell：`$env:GH_TOKEN = (gh auth token --user clarkher)`），**不要 `gh auth switch`**。
- 版號 **v0.46**（2026-10-07 跟其他 session 講好的）。commit 前再查一次：`git log --all --oneline | grep -oE "v0\.[0-9]+" | sort -t. -k2 -n -u`；v0.46 被別支用掉了就往上跳空號，PR 說明寫原因。commit 訊息 `v0.46:` 開頭。
- **開放後的畫面要跟拆之前完全一樣**，只少了永遠不會出現的東西。不順手改任何文案、排序、版面。
- 不動 `public/data/*`（不重建資料）；pipeline 只改註解，不改邏輯。
- `maps.json` 的 `o` 欄位、`GearWeapon.o`／`GearScroll.o`／來源的 `o` 都留著（見 D1）。
- `ShopRow.o`（`o: 1`＝「取自舊版資料」）跟 V002 無關，**不准動**。
- CharacterBar「`可以三轉了（照舊版）`」這句維持開放後的樣子（使用者沒選這項）。
- UI 不加 emoji；不加任何新東西（新區塊、新按鈕、新提示）。
- 不在主 checkout（`C:\Users\user1\MapleBook`）切分支；自己開 worktree。
- 動到別的 session 正在改的檔案前，先 `ListAgents` 問清楚（同 repo 平行的 session 很多）。

---

## 開工條件（排程照這個判斷）

1. **已經開放**：現在時間 ≥ `src/lib/release.ts` 裡的開放時刻（最新 dev 上的版本；v0.48 會加 `V002_OPEN_TIME`＝官方開機時刻，沒有就用 `V002_OPEN_DATE` 的台灣時間 00:00）。還沒到 → 不動手，改期到開放時刻之後。
2. **開機後重新部署那支 workflow 跑完了**（v0.48 加的 `.github/workflows/v002-open.yml`＋`scripts/v002-open.mjs`）：正式機 https://maplestory-tool-three.vercel.app 首頁 HTML 已經沒有那條橫幅（「已經照 10/15 改版排好」或「開機後才能去」都沒有；v0.48 也可能用「GitHub issue「V002 開機後重新部署：完成」已關閉」表示跑完，見共用筆記 v002-open-time.md）。還沒 → 這支 workflow 先不刪，其餘照拆，PR 說明寫清楚、回報時提醒使用者。
3. 使用者選的最早開工時間到了（排程的觸發時間）。

## 設計決定

- **D1 `o` 欄位留著。** 它不只給標籤用：pipeline 挑「掉落怪要顯示哪張地圖」時優先挑不是 V002 的（`pipeline/lib/gear.mjs` 的 `dropSources`），只有 V002 拿得到的武器／卷軸帶 `o`，兩把武器數值完全一樣時先推不是只有 V002 才拿得到的（`src/lib/gear.ts` 的 `rankWeapon`／`rankNext`）。拿掉 `o` 會改到推薦結果，違反「畫面一樣」。所以 `o` 跟這兩個排序都不動，只改提到 `release.ts`／`v002.ts` 的註解。
- **D2 pipeline 邏輯不動。** `pipeline/lib/gear.mjs` 的 `isV002Quest` 仍然決定任務來源帶不帶 `o`（D1 的排序要用），它原本「鏡射 `src/lib/v002.ts`」——前端那支拆掉後，它就是唯一的一份，註解改成這樣說。
- **D3 開放前專用的推薦分支一起拆**（開放後 `beforeOpen` 永遠是 false）：`weaponPicks` 的 `beforeOpen` 過濾、`equipRequirement` 的 `beforeOpen`、`closestSource` 的「先找現在就開的店／合成／怪」那段、`familyPick`（開放後就是 `options[0]`）、`sourceOpensLater`、`shopGroups` 的 `opensLater` 與 `later`、`monsterMaps` 的 `isLater`（v0.50 加的，`src/lib/monster-view.ts`）。
  **例外**：如果開工時 dev 上的 `closestSource` 已經改成「開放後也先推舊地區」的永久規則（使用者另外決定的話會有一支 session 先做），那段就不是死程式，不拆，照它現在的樣子留。判斷方法：`closestSource` 還有沒有 `beforeOpen` 參數——有才拆。
  背景（2026-10-07 試算，29 職 × 10～120 等每 5 級）：開放後裝備卡有 284 處武器推薦、466 處卷軸推薦跟開放前不一樣；其中 59 處（全在 50 等以下）是同一把武器改推「冰原雪域／天空之城的店」，例：劍士 35 等綠蛇刀「小幽靈會掉」→「冰原雪域的斯考特賣 200,000 楓幣」。這是 10/15 起正式機本來就會有的行為，不是拆標籤造成的；要不要改是另一個產品決定。
- **D4 ItemDb 不再載 `maps.json`。** 道具頁載地圖只為了兩件事：V002 道具標籤、店家地點標「10/15 開放」。兩個都拆了就沒人用，連同載入一起拿掉（清單少等一個檔，最後畫面一樣）。
- **D5 `DbBrowser` 的 `badge` 欄位拿掉。** 只有「10/15 開放」在用。
- **D6 `scripts/verify/first-frame.mjs`**（v0.47 收進 repo 的話）整支都在驗「10/15 開放」第一格就在／跨午夜收掉／舊建置——標示拆了它就沒東西可驗，刪掉，README 跟著拿掉那段。
- **D7 舊的計畫文件**（`docs/superpowers/plans/2026-10-0x-*.md`）是歷史紀錄，不改。

## 檔案地圖（2026-10-07 在 dev `79ed4921` 盤點；開工時 Task 0 會再盤一次）

刪除：
- `src/lib/release.ts`、`src/lib/v002.ts`
- `src/lib/__tests__/release.test.ts`、`release-hook.test.ts`、`v002.test.ts`、`v002-realdata.test.ts`
- `.github/workflows/v002-open.yml`、`scripts/v002-open.mjs`（v0.48；開工條件 2 成立才刪）
- `scripts/verify/first-frame.mjs`（v0.47；D6）

修改（lib）：
- `src/lib/gear.ts`：`weaponPicks`、`equipRequirement`、`closestSource` 拿掉 `beforeOpen`；`GearSource` 註解
- `src/lib/gear-view.ts`：刪 `sourceOpensLater`、`familyPick`；`otherRuleThatWears`、`gearPlan`、`bandGear` 拿掉 `beforeOpen`
- `src/lib/item-view.ts`：`shopGroups` 拿掉 `opensLater`、`ShopPlace.later`
- `src/lib/monster-view.ts`（v0.50）：`monsterMaps` 拿掉 `isLater`
- `src/lib/types.ts`：三段註解（`MapRecord.o`、`ShopRow` 的 `m`、`Item.sh`）

修改（畫面）：
- 首頁：`src/components/route/{GearCard,RouteTimeline,CharacterBar,RouteHome,NowCard}.tsx`
- 查資料：`src/app/db/{items/ItemDb,monsters/MonsterDb,quests/QuestDb,skills/SkillDb}.tsx`、`src/components/QuestDetailBody.tsx`、`src/components/DbBrowser.tsx`
- 帶我去：`src/app/go/GoNavigator.tsx`
- `src/components/route/bits.tsx`：`Chip` 的註解
- `next.config.mjs`：`MAPLEBOOK_BUILD_TIME` 兩處

修改（測試）：`src/lib/__tests__/{gear,gear-view,gear-realdata,item-view,item-view-realdata,now-plan-realdata,db-browse}.test.ts`、`monster-view` 的測試（v0.50）

修改（文件／註解）：`README.md`、`pipeline/build.mjs`、`pipeline/build-gear.mjs`、`pipeline/lib/gear.mjs`

**不在範圍**（同名但無關，不准動）：攻略資料的 `notOpenYet`（`src/lib/types.ts` 的 `GuideJob`、`pipeline/build-guides.mjs`、`pipeline/lib/guides.mjs` 的用語檢查）＝玩家攻略提到的未開放地點；`ShopRow.o`＝舊版資料旗標；`SkillStrip` 的 `later` 狀態、`now-plan` 的 `laterMaterials`；`src/lib/jobs.ts`、`profile.ts`、`route.ts`、`timeline.ts` 講 V002 內容的註解（說的是事實，不是標籤）。

## 指令備忘（Windows；worktree 沒有自己的 node_modules）

在 worktree 根目錄（`C:\Users\user1\MapleBook\.claude\worktrees\remove-v002-labels`）用 PowerShell：

```powershell
node ..\..\..\node_modules\vitest\vitest.mjs run                          # 全部 vitest
node ..\..\..\node_modules\vitest\vitest.mjs run src/lib/__tests__/gear.test.ts
node --test "pipeline/**/*.test.mjs"                                         # pipeline
node ..\..\..\node_modules\typescript\bin\tsc --noEmit -p .                  # 型別
```

Bash 工具的 PATH 沒有 `/usr/bin` 跟 node：git／grep 前面加 `export PATH="/usr/bin:/mingw64/bin:$PATH";`，node／gh 用 PowerShell（gh 在 `C:\Program Files\GitHub CLI\gh.exe`）。

下面用到的代號：
- `BASE_SHA`：Task 0 Step 1 開分支時 origin/dev 的 sha（拆前對照）。
- `<暫存>`：這次執行自己的暫存資料夾（session 的 scratchpad；沒有就用 `%TEMP%\maplebook-remove-v002`）。暫存檔不准寫進 repo 或系統目錄。
- `<N>`：Task 8 開出來的 PR 編號。

---

### Task 0: 開工前準備與重新盤點

**Files:** 不改檔。

- [ ] **Step 1: 開 worktree（從最新 dev）**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
cd C:/Users/user1/MapleBook
git fetch origin
git worktree add .claude/worktrees/remove-v002-labels -b feat/remove-v002-labels origin/dev
cd .claude/worktrees/remove-v002-labels
git rev-parse HEAD
```

把印出來的 sha 記成 `BASE_SHA`（拆前對照用）。分支已經存在（之前跑過一半）→ 先看 `gh pr list --head feat/remove-v002-labels --state all`：已合併就跳到 Task 8 Step 6 驗收；PR 開著就接著做；都沒有就 `git worktree add .claude/worktrees/remove-v002-labels feat/remove-v002-labels` 接著做。

- [ ] **Step 2: 基準測試全綠**

跑「指令備忘」的三條。全綠才往下。有紅：不是這次造成的——看失敗的檔案在不在「檔案地圖」裡；不在就記下來寫進 PR 說明、照樣往下；在的話先 `git log origin/dev -5 -- <檔案>` 看是誰剛改的，用 `ListAgents`／`SendMessage` 問那支 session，問不到就在共用筆記留言、推播通知使用者後停下。

- [ ] **Step 3: 重新盤點（會多出 10/07 之後別的 session 加的東西）**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
git grep -n -E "useBeforeV002|beforeV002|onV002Open|opensOn|V002_OPEN|@/lib/release|@/lib/v002|isV002|v002Monster|v002Quest|beforeOpen|notOpenYet|opensLater|isLater|sourceOpensLater|familyPick|OpenChip|10/15|MAPLEBOOK_BUILD_TIME|\blater\b" -- src next.config.mjs README.md scripts .github
```

每一筆對到「檔案地圖」。多出來的照「設計決定」同一套規則處理（開放前才會出現的拆、`o` 跟排序留）；看不懂是不是死程式的，先問寫的那支 session（`git log -1 --format=%s -- <檔案>` 看版號，`ListAgents` 找人）。

- [ ] **Step 4: 讀共用筆記，確認 v0.48 的 workflow 跑完沒**

讀 `C:\Users\user1\AppData\Roaming\Claude\side-session-notes\local_02cc686d-6f5d-46a1-8346-47ff8bf56d33\v002-open-time.md`（v0.48 那支會寫：workflow 檔名、怎麼判斷跑完）。再自己驗一次：

```powershell
(Invoke-WebRequest https://maplestory-tool-three.vercel.app/ -UseBasicParsing).Content -match "已經照 10/15 改版排好|開機後才能去"
```

`False` ＝ 正式機已經在開機後重建過 → Task 7 刪 workflow。`True` → workflow 先留著（開工條件 2）。

---

### Task 1: 測試先改成「開放後」的樣子（程式不動）

這一步刻意沒有 RED：程式還沒動，`beforeOpen` 傳 `false` 跑出來的就是開放後的行為。把測試鎖在這個行為上，之後拆程式時測試一改就紅＝拆壞了。

**Files:**
- Modify: `src/lib/__tests__/gear.test.ts`、`gear-view.test.ts`、`gear-realdata.test.ts`、`item-view.test.ts`、`item-view-realdata.test.ts`

**Interfaces:**
- Consumes: 現有的 `weaponPicks(weapons, job, level, { beforeOpen? })`、`equipRequirement(weapons, job, level, rule, beforeOpen?)`、`closestSource(src, level, beforeOpen?, job?)`、`gearPlan(gear, job, level, beforeOpen)`、`bandGear(gear, job, from, to, beforeOpen)`
- Produces: 只測開放後行為的測試（Task 2 再把 `false` 拿掉）

- [ ] **Step 1: `gear.test.ts`**

1. 「`beforeOpen：10/15 前只算現在拿得到的武器，不讓只有 V002 掉的武器把敏捷目標拉高`」改成只留開放後那半：

```ts
  it("只有 V002 掉的拳套也算進敏捷目標（開放後都拿得到）", () => {
    const v002Claw = weapon({ id: 1, n: "只有 V002 掉的拳套", s: "拳套", lv: 40, atk: 24, job: 8, req: { DEX: 90 }, o: "2026-10-15" });
    const openClaw = weapon({ id: 2, n: "現在拿得到的拳套", s: "拳套", lv: 40, atk: 22, job: 8, req: { DEX: 80 } });
    expect(equipRequirement([v002Claw, openClaw], 410, 40, dexEquipRule)).toEqual({ DEX: 90 });
  });
```

2. 整個刪掉：「`beforeOpen：best／stronger 都不會選到只有 V002 來源的武器`」、「`beforeOpen 略過 V002 來源，整組都是 V002 才退回原本的`」、「`10/15 前跳過只在 10/15 才開的城鎮的合成 NPC`」。
3. 「`下一把同分時優先選沒有 o 的`」**留著**（D1）。
4. 「`beforeOpen 要跨層看：non-V002 的任務贏過只有 V002 的掉落（弩攻擊卷軸實例）`」改成：

```ts
  it("掉落跟任務比誰好拿：30 等時 31 等的小雪球比 40 等的任務近（弩攻擊卷軸實例）", () => {
    const src: GearSource = {
      drops: [{ m: 1, n: "小雪球", lv: 31, map: 1, o: "2026-10-15" }],
      quests: [{ id: "2001", n: "酋長蓋房子", minLv: 40 }],
    };
    expect(closestSource(src, 30, false)).toEqual({ kind: "drop", drop: src.drops![0] });
  });
```

5. 「`closestSource：10/15 前跳過 10/15 才開的城鎮的店，改推現在打得到的怪；之後才推那家店`」改成：

```ts
  it("closestSource：有店就推店（冰原雪域的店也一樣）", () => {
    const src = source({
      shops: [{ p: "冰原雪域", n: "斯考特", m: 211000000, pr: 250000, o: "2026-10-15" }],
      drops: [{ m: 1, n: "火石球", lv: 40, map: 1 }],
    });
    expect(closestSource(src, 38, false)).toEqual({ kind: "shop", shop: src.shops![0] });
  });
```

（D3 的例外成立時——`closestSource` 已經沒有 `beforeOpen`——4、5 照 dev 上現有的測試，不改。）

6. 檢查：`grep -n -E "beforeOpen: true|, true\)" src/lib/__tests__/gear.test.ts` 不應再有 `weaponPicks`／`equipRequirement`／`closestSource` 傳 `true` 的呼叫。

- [ ] **Step 2: `gear-view.test.ts`**

1. 所有 `gearPlan(…, true)` 改 `gearPlan(…, false)`、`bandGear(…, true)` 改 `bandGear(…, false)`：

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
sed -i -E 's/(gearPlan\([^)]*), true\)/\1, false)/; s/(bandGear\([^)]*), true\)/\1, false)/' src/lib/__tests__/gear-view.test.ts
```

2. `describe("sourceText／sourceOpensLater：怎麼拿"` 改名 `describe("sourceText：怎麼拿"`，刪掉裡面的「`只有 V002 才拿得到的來源回開放日，其他回 undefined`」。
3. 整個刪掉 `describe("familyPick：一組卷軸裡最好拿的那張"`。
4. 「`每組卷軸都挑了一張，10/15 前不挑只有 V002 才拿得到的（同一組還有別張時）`」改成：

```ts
  it("每組卷軸挑成功率最高的那張", () => {
    for (const job of [110, 210, 310, 410, 420, 520]) {
      const plan = gearPlan(gear, job, 50, false);
      expect(plan.families.length).toBeGreaterThan(0);
      for (const family of plan.families) expect(family.pick).toBe(family.options[0]);
    }
  });
```

5. 「`10/15 前同等級有現在拿得到的，就不推只有 V002 才拿得到的`」改成（開放後靠 D1 的同分排序，結果一樣是 402）：

```ts
  it("同等級同攻擊時，先推不是只有 V002 才拿得到的（拳套40 兩把一樣強）", () => {
    const band = bandGear(fixture, 410, 40, 49, false);
    expect(band.weapons.map(entry => entry.weapon.id)).toEqual([402]);
  });
```

6. 「`刺客 30–39：從 30 等起、依等級排、10/15 前來源都現在拿得到`」改名「`刺客 30–39：從 30 等起、依等級排`」，刪掉 `for (const entry of band.weapons) expect(sourceOpensLater(entry.source!)).toBeUndefined();` 那行。
7. 「合成的寫法」那個測試刪掉 `expect(sourceOpensLater({ kind: "craft", craft: { ...craft, o: "2026-10-15" } })).toBe("2026-10-15");` 那行。
8. 測試名稱拿掉「（10/15 前）」「現在就拿得到」這類字（例：「`刺客 Lv35（10/15 前）：…；下一把 40 等、現在就拿得到`」→「`刺客 Lv35：銀守護拳套（同數值裡拿法最多），墮落城市後街吉姆合成；下一把 40 等`」）。
9. import 拿掉 `familyPick`、`sourceOpensLater`。

- [ ] **Step 3: 跑 `gear-view.test.ts`，把開放後才會變的期望值照實改**

Run: `node ..\..\..\node_modules\vitest\vitest.mjs run src/lib/__tests__/gear-view.test.ts`

2026-10-07 用當時的資料試過，只有一個會紅：

```
FAIL 真資料：狼牙（台服靠後街吉姆合成） > 一轉盜賊 25 等推狼牙，來源是合成
AssertionError: expected 'shop' to be 'craft'
```

原因：狼牙的店在冰原雪域（斯考特 60,000 楓幣），開放後 `closestSource`「有店就推店」。這是**開放後本來就會這樣**（10/15 起正式機就是這個推薦），不是拆壞。照實改期望值，describe 名稱跟著改：

```ts
describe("真資料：狼牙", () => {
  it("一轉盜賊 25 等推狼牙，開放後冰原雪域的店有賣就推店", () => {
    const plan = gearPlan(gear, 400, 25, false);
    expect(plan.best?.n).toBe("狼牙");
    expect(plan.bestSource).toMatchObject({ kind: "shop", shop: { p: "冰原雪域" } });
  });
```

規則：**這一步的程式還沒改，`false` 跑出來的值就是開放後的真相**，期望值照它改；每一個改了期望值的測試，名稱、舊值、新值都寫進 PR 說明。如果開工時這個測試本來就過（例如 D3 的例外成立、或資料變了），不用改。紅的不只這一個也照同一條規則處理。

- [ ] **Step 4: `gear-realdata.test.ts`**

整個刪掉 `describe("真資料：刺客（410）Lv35，10/15 前（beforeOpen）"`；檔頭註解提到 `v002-realdata.test.ts` 的那段拿掉。

- [ ] **Step 5: `item-view.test.ts`、`item-view-realdata.test.ts`**

`item-view.test.ts` 整個刪掉：「`10/15 才開放的店標 later、排在同一組最後；現在去得了的先列（其餘照資料順序）`」、「`整組都是 10/15 才開的價錢排在現在買得到的價錢後面`」。（`later: false` 先留著，Task 2 再拿。）

`item-view-realdata.test.ts` 整個刪掉：「`紅色藥水：10/15 才開的冰原雪域、天空之城排在最後，現在去得了的雜貨店先列`」、「`冷酷之心、精鋼拳套、褐色無袖服：現在買得到的價錢排第一組`」、「`10/15 才開的地區（世界地圖 WorldMap020、WorldMap021）的店全部帶得出開放日，畫面才標得到 10/15 開放`」；刪掉 `const opensLater = …`、`import { isV002Map } from "@/lib/v002";`；`const maps = …` 沒人用了也刪。

- [ ] **Step 6: 全部跑一次**

Run: vitest 全部＋tsc（指令備忘）
Expected: 全綠。

- [ ] **Step 7: Commit**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
git add src/lib/__tests__
git commit -m "v0.46: 測試改成開放後的樣子（程式還沒動）——開放前才有的情境拿掉，開放後會變的期望值照實寫

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 裝備推薦拿掉 `beforeOpen`（lib＋首頁裝備卡＋升級路線的裝備）

**Files:**
- Modify: `src/lib/gear.ts`、`src/lib/gear-view.ts`
- Modify: `src/components/route/GearCard.tsx`、`src/components/route/RouteTimeline.tsx`（只動 `BandGearBlock`、`BandSource`）
- Test: `src/lib/__tests__/gear.test.ts`、`gear-view.test.ts`

**Interfaces:**
- Produces（之後的 task 跟畫面都照這個用）：
  - `weaponPicks(weapons, job, level, opts: { targetsAt?; types? } = {})`
  - `equipRequirement(weapons, job, level, rule)`
  - `closestSource(src: GearSource, level: number, job?: number): SourcePick | null`
  - `gearPlan(gear: GearData, job: number, level: number): GearPlan`
  - `bandGear(gear: GearData, job: number, from: number, to: number): BandGear`
  - 刪掉：`familyPick`、`sourceOpensLater`

- [ ] **Step 1: 測試改成新的呼叫方式（RED）**

`gear.test.ts`：`closestSource(x, n, false)` → `closestSource(x, n)`；`closestSource(x, n, false, job)` → `closestSource(x, n, job)`（例：`closestSource(source({ quests: [quest] }), 70, false, 110)` → `closestSource(source({ quests: [quest] }), 70, 110)`）。
`gear-view.test.ts`：

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
sed -i -E 's/(gearPlan\([^)]*), false\)/\1)/; s/(bandGear\([^)]*), false\)/\1)/' src/lib/__tests__/gear-view.test.ts
grep -n -E "closestSource\([^)]*(true|false)" src/lib/__tests__/*.ts   # 應該沒有輸出
```

- [ ] **Step 2: 確認會紅**

Run: tsc（指令備忘）
Expected: FAIL，類似 `Expected 4 arguments, but got 3.`（gearPlan）、`Expected 5 arguments, but got 4.`（bandGear）、`Argument of type 'number' is not assignable to parameter of type 'boolean'.`（closestSource 的 job）。

- [ ] **Step 3: 改 `src/lib/gear.ts`**

`weaponPicks`：

```ts
  opts: { targetsAt?: (level: number) => Record<StatKey, number>; types?: string[] } = {},
): { best: GearWeapon | null; alternatives: GearWeapon[]; next: GearWeapon | null; stronger: GearWeapon | null } {
  const magic = isMagicJob(job);
  const { targetsAt, types } = opts;
  const pool = candidatePool(weapons, job, magic, types);

  // 現在拿得到：等級夠、只靠任務拿的要現在還接得了（沒過等級上限）
  const eligibleNow = pool.filter(w => w.lv <= level && obtainableBy(w.src, job, level));
```

文件註解裡 next 那段刪掉「`10/15 前 next 仍可能是只有 V002 來源的武器（nothing else），畫面自己標「10/15 開放」，這裡不因為 beforeOpen 就直接濾掉（跟 best／alternatives／stronger 不同）。`」，保留「同分優先選非 V002 的」。

`equipRequirement`：拿掉最後一個參數 `beforeOpen = false,` 跟「`// beforeOpen 跟 weaponPicks 一樣：…`」那行註解，呼叫改：

```ts
    const req = weaponPicks(candidates, job, l, { types: rule.weapons }).best?.req;
```

`closestSource`：

```ts
/**
 * 最好拿的來源：商店優先；否則掉落跟任務一起比誰最好拿（見 dropCost／questCost）——
 * 35 等刺客的手套攻擊卷軸推 40 等任務「珍的最後一個挑戰」，不推 55 等巨居蟹。
 *
 * 給了 job：只看這個職業接得到、獎勵也發給這個職業的任務（questFits）。
 */
export function closestSource(src: GearSource, level: number, job?: number): SourcePick | null {
  const shops = src.shops ?? [];
  const drops = src.drops ?? [];
  // 接不到的任務不算：職業不對、獎勵不發給這個職業、過了等級上限
  const quests = (src.quests ?? []).filter(quest => job === undefined || questFits(quest, job, level));

  // 合成：材料湊齊就一定做得出來，比要看運氣的掉落、任務可靠，排在商店後面
  const crafts = src.crafts ?? [];
  if (shops.length) return { kind: "shop", shop: shops[0] };
  if (crafts.length) return { kind: "craft", craft: crafts[0] };
  return easiest(drops, quests, level);
}
```

（`if (beforeOpen) { … }` 整段刪掉。D3 例外成立就不動 `closestSource`。）

`GearSource` 註解：shops 的「`o：店在 10/15 才開的城鎮（冰原雪域、天空之城）。`」→「`o：店在 V002 才放行的城鎮（冰原雪域、天空之城）。`」；crafts 的「`o 10/15 才開的城鎮`」→「`o V002 才放行的城鎮`」；quests 的「`o：V002 任務（同 src/lib/v002.ts 的規則）`」→「`o：V002 任務（規則見 pipeline/lib/gear.mjs 的 isV002Quest）`」。

- [ ] **Step 4: 改 `src/lib/gear-view.ts`**

刪掉 `sourceOpensLater`（含上面的註解）。刪掉 `familyPick`（含上面三行註解）。

`otherRuleThatWears`：拿掉 `beforeOpen: boolean,` 參數，裡面改 `equipRequirement(gear.weapons, job, level, other)`。

`gearPlan`：

```ts
/**
 * 卡片要的一切，照 gear-realdata.test.ts 的方式組：能力值目標 targetsAt 只有 equip 類型的點法才吃
 * equipRequirement，而且每個等級只算一次（weaponPicks 會拿很多個等級來問）。初心者（0）回空的一包。
 */
export function gearPlan(gear: GearData, job: number, level: number): GearPlan {
```

裡面：`equipRequirement(gear.weapons, job, lv, rule)`；`weaponPicks(gear.weapons, job, level, { targetsAt, types: rule?.weapons })`；`const source = (weapon: GearWeapon) => closestSource(weapon.src, level, job);`；卷軸：

```ts
  const families = scrollPicks(gear.scrolls, job, picks.best?.s ?? null, rule?.main ?? null, level).map(family => {
    const pick = family.options[0];
    return { ...family, pick, source: closestSource(pick.src, level, job) };
  });
```

`strongerVia: picks.stronger ? otherRuleThatWears(gear, job, level, others, picks.stronger) : null,`

`bandGear`：簽名 `export function bandGear(gear: GearData, job: number, from: number, to: number): BandGear {`；裡面 `equipRequirement(gear.weapons, stage, lv, rule)`、`weaponPicks(gear.weapons, stage, level, { targetsAt, types: rule?.weapons }).best`、`closestSource(best.src, level, stage)`；卷軸：

```ts
  const families = scrollPicks(gear.scrolls, lastStage, last?.weapon.s ?? null, null, to).map(family => {
    const pick = family.options[0];
    return { ...family, pick, source: closestSource(pick.src, from, lastStage) };
  });
```

`GearFamily`（或 `pick` 欄位）的註解如果提到 `familyPick`／10/15，改成「成功率最高的那張（options[0]）」。

- [ ] **Step 5: 改 `src/components/route/GearCard.tsx`**

- import：從 `@/lib/gear-view` 拿掉 `sourceOpensLater`；刪 `import { useBeforeV002 } from "@/lib/release";`；`./bits` 拿掉 `Chip`（這檔沒有別的 `<Chip`）。
- `type Where` 刪掉 `beforeOpen` 跟它的註解：

```ts
type Where = {
  maps: Record<string, MapRecord>;
  /** 傳送門資料走得到的地圖（跟主推卡、先解同一份），有才給「帶我去」 */
  routable: Set<number>;
};
```

- `GearCard` 刪 `const beforeOpen = useBeforeV002();`，`where={{ maps, routable }}`。
- `GearContent`：`const plan = useMemo(() => gearPlan(gear, job, level), [gear, job, level]);`
- 刪掉整個 `function OpenChip(…)`，以及所有 `<OpenChip … />`（最強武器名後、下一把、卷軸每一張、其他武器名後，共 4～5 處）。
- `SourceLine` 拿掉 `chip` 參數跟 `{chip ? <OpenChip … /> : null}` 那行：

```tsx
function SourceLine({ pick, where }: { pick: SourcePick | null; where: Where }) {
```

呼叫端的 `chip={false}`、`chip={!pick.o}` 一起拿掉。
- 卷軸那段兩行 JSX 註解（「這張只有 V002 才拿得到（披風力量卷軸100%）…」「這張本身已經標了 10/15 開放…」）刪掉。

- [ ] **Step 6: 改 `src/components/route/RouteTimeline.tsx` 的 `BandGearBlock`、`BandSource`**

```tsx
function BandGearBlock({ job, band, maps }: { job: number; band: Band; maps: Record<string, MapRecord> }) {
  // 這次瀏覽載過就直接拿：換頁回首頁時展開的那一段不會晚一格才冒出裝備
  const [gear, setGear] = useState<GearData | null>(peekGear);
  useEffect(() => {
    let cancelled = false;
    loadGear()
      .then(data => {
        if (!cancelled) setGear(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // 一段是 from 到 to 前一級（下一段從 to 開始）；最後一段（100–120）含上限那一級
  const last = band.to >= LEVEL_CAP ? band.to : band.to - 1;
  const plan = useMemo(() => (gear ? bandGear(gear, job, band.from, last) : null), [gear, job, band.from, last]);
```

刪 `const beforeOpen = useBeforeV002();`、整個 `const chip = …`；兩處 `<BandSource … chip={chip} />` 拿掉 `chip={chip}`。

```tsx
/** 一段裡「怎麼拿」那一行；合成另外一行寫材料 */
function BandSource({ pick, label }: { pick: SourcePick; label: (id: number) => string }) {
  return (
    <span className="block text-[12px] ink-soft">
      {sourceText(pick, label)}
      {pick.kind === "craft" ? <span className="block ink-faint">材料：{craftMaterialsText(pick.craft)}</span> : null}
    </span>
  );
}
```

import 改 `import { bandGear, craftMaterialsText, offenseText, sourceText, type SourcePick } from "@/lib/gear-view";`。（`useBeforeV002`、`Chip` 這檔別處還在用，Task 4 再拿。）

- [ ] **Step 7: 跑測試**

Run: tsc＋vitest 全部
Expected: 全綠。tsc 有錯就是還有呼叫端沒改（`grep -rn "gearPlan(\|bandGear(\|closestSource(\|equipRequirement(" src` 找）。

- [ ] **Step 8: Commit**

```bash
git add src/lib/gear.ts src/lib/gear-view.ts src/components/route/GearCard.tsx src/components/route/RouteTimeline.tsx src/lib/__tests__
git commit -m "v0.46: 裝備推薦拿掉開放前專用的分支（beforeOpen、familyPick、sourceOpensLater），裝備卡與升級路線不再有 10/15 標籤

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 「哪裡買得到」與怪物出沒地圖拿掉 `opensLater`／`isLater`

**Files:**
- Modify: `src/lib/item-view.ts`、`src/app/db/items/ItemDb.tsx`（只動 `ItemDetail` 的店家那段）
- Modify（v0.50 有進 dev 才有）：`src/lib/monster-view.ts`、`src/app/db/monsters/MonsterDb.tsx` 的 `monsterMaps(…)` 呼叫
- Test: `src/lib/__tests__/item-view.test.ts`、`monster-view` 的測試

**Interfaces:**
- Produces：`shopGroups(item: Item): { groups: ShopGroup[]; fromOldData: boolean }`、`type ShopPlace = { place: string; npc?: string }`；`monsterMaps(monster, maps)`（拿掉第三個參數）

- [ ] **Step 1: 測試先改（RED）**

`item-view.test.ts` 所有 `places` 期望值拿掉 `later: false`，例如：

```ts
        places: [
          { place: "弓箭手村武器店", npc: "克爾" },
          { place: "勇士之村武器店", npc: "利伯" },
        ],
```

```ts
        { price: "220 樂豆點", places: [{ place: "商城" }] },
        { price: "10 個 1,980 樂豆點", places: [{ place: "商城" }] },
```

`monster-view` 的測試：刪掉專門測「10/15 才開的排後面」的情境；其他呼叫拿掉第三個參數。

- [ ] **Step 2: 確認會紅**

Run: `node ..\..\..\node_modules\vitest\vitest.mjs run src/lib/__tests__/item-view.test.ts`
Expected: FAIL（`toEqual` 多了 `later` 欄位）。

- [ ] **Step 3: 改 `src/lib/item-view.ts`**

```ts
export type ShopPlace = { place: string; npc?: string };
export type ShopGroup = { price: string; places: ShopPlace[] };
```

```ts
/**
 * 「哪裡買得到」：同一個標價的店家排在一起，價錢只寫一次（一般道具每家都賣一樣的價錢）。其餘照資料順序。
 * fromOldData：有任何一家取自舊版資料，畫面要標「參考舊版資料，可能有出入」。
 */
export function shopGroups(item: Item): { groups: ShopGroup[]; fromOldData: boolean } {
  const groups: ShopGroup[] = [];
  for (const row of item.sp ?? []) {
    const price = shopPriceText(row);
    let group = groups.find(entry => entry.price === price);
    if (!group) {
      group = { price, places: [] };
      groups.push(group);
    }
    group.places.push({ place: row.p, npc: row.n });
  }
  return { groups, fromOldData: (item.sp ?? []).some(row => row.o === 1) };
}
```

（兩個 `sort` 跟 `allLater` 刪掉：開放後 `later` 全是 false，排序本來就不動。）

- [ ] **Step 4: 改 `ItemDb.tsx` 的 `ItemDetail` 店家那段**

```tsx
  const { requirements, stats } = equipGroups(item);
  const shops = shopGroups(item);
```

刪掉上面那行註解「店的地點 10/15 才開放、而且現在還沒到…」；店家清單刪掉 `{place.later ? <Chip tone="gold">10/15 開放</Chip> : null}`。v002 的 import 拿掉 `isV002Map`（其他的 Task 5 再拿）。

- [ ] **Step 5: `monster-view.ts`（有的話）**

`monsterMaps` 拿掉 `isLater` 參數跟用到它的排序鍵；`MonsterDb.tsx` 呼叫改 `monsterMaps(monster, maps)`。註解裡「10/15 才開的排後面」拿掉。

- [ ] **Step 6: 跑測試**

Run: tsc＋vitest 全部
Expected: 全綠。

- [ ] **Step 7: Commit**

```bash
git add src/lib/item-view.ts src/app/db/items/ItemDb.tsx src/lib/__tests__ src/lib/monster-view.ts src/app/db/monsters/MonsterDb.tsx
git commit -m "v0.46: 哪裡買得到、怪物出沒地圖拿掉「10/15 才開放排後面」的判斷

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（`monster-view.ts` 不存在就從 `git add` 拿掉那兩個檔。）

---

### Task 4: 首頁其他標示（角色列、橫幅、主推卡、升級路線）

**Files:**
- Modify: `src/components/route/CharacterBar.tsx`、`RouteHome.tsx`、`NowCard.tsx`、`RouteTimeline.tsx`

- [ ] **Step 1: 守門檢查（RED）**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
git grep -n -E "useBeforeV002|10/15|beforeOpen|notOpenYet|showV002Banner" -- src/components/route/CharacterBar.tsx src/components/route/RouteHome.tsx src/components/route/NowCard.tsx src/components/route/RouteTimeline.tsx
```

Expected: 有輸出（還沒拆）。

- [ ] **Step 2: `CharacterBar.tsx`**

刪 `import { useBeforeV002 } from "@/lib/release";`、`const beforeOpen = useBeforeV002();`。兩個三元式只留開放後那邊：

```tsx
            ? `${option?.line} · 二轉 · ${THIRD_JOB_LEVEL} 等可以三轉了（照舊版）`
```

```tsx
                  <p className="text-[11px] font-bold ink-faint">三轉</p>
```

- [ ] **Step 3: `RouteHome.tsx`**

刪 import、`const showV002Banner = useBeforeV002();`、橫幅上面那行 JSX 註解跟整段：

```tsx
      {showV002Banner ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          已經照 10/15 改版排好：三轉、Lv.120、天空之城／冰原雪域／廢礦區，要 2026/10/15 開機後才能去。
        </p>
      ) : null}
```

（v0.48 可能改過這段的字，照當時的內容整段刪。）

- [ ] **Step 4: `NowCard.tsx` 的 `MapCard`**

刪 import、`const notOpenYet = useBeforeV002();`、標題後的 `{record?.o && notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}`。`Chip` import 留著（這檔還有別的 `<Chip`）。

- [ ] **Step 5: `RouteTimeline.tsx`**

`BandDetail`：刪 `const beforeOpen = useBeforeV002();`，還沒三轉那句只留開放後：

```tsx
      {stuckInSecondJob ? (
        <p className="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2 text-[13px] leading-relaxed">
          還沒三轉：三轉後按上面「換其他職業」選你的三轉職業，這段會換成那個職業的攻略。
        </p>
      ) : null}
```

練功列（`row.map`／`notOpenYet` 那個元件）：刪「`// V002 才放行的圖（冰原雪域、廢礦）要 10/15 開機後才能去…`」註解、`const beforeOpen = …`、`const notOpenYet = …`，以及標題後兩處 `{notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}`。
import：刪 `useBeforeV002`；`./bits` 拿掉 `Chip`（這檔已經沒有 `<Chip`，先 `grep -c "<Chip" src/components/route/RouteTimeline.tsx` 確認是 0）。

- [ ] **Step 6: 守門檢查（GREEN）＋測試**

Step 1 的 grep 沒有輸出；tsc＋vitest 全綠。

- [ ] **Step 7: Commit**

```bash
git add src/components/route
git commit -m "v0.46: 首頁拿掉 V002 開放前的橫幅與標示（角色列、主推卡、升級路線）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 查資料四頁、任務細節、帶我去

**Files:**
- Modify: `src/app/db/items/ItemDb.tsx`、`monsters/MonsterDb.tsx`、`quests/QuestDb.tsx`、`skills/SkillDb.tsx`
- Modify: `src/components/QuestDetailBody.tsx`、`src/components/DbBrowser.tsx`、`src/components/route/bits.tsx`、`src/app/go/GoNavigator.tsx`

- [ ] **Step 1: 守門檢查（RED）**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
git grep -n -E "useBeforeV002|@/lib/v002|10/15|notOpenYet|badge|isV002" -- src/app src/components
```

Expected: 有輸出。

- [ ] **Step 2: `ItemDb.tsx`**

- import：刪 `useBeforeV002`、整行 `@/lib/v002`；`@/lib/data` 拿掉 `loadMaps`、`peekMaps`；`@/lib/types` 拿掉 `MapRecord`（沒人用的話）。`Chip` 留著（穿戴條件的小標籤還在用，先 `grep -n "<Chip" src/app/db/items/ItemDb.tsx` 確認）。
- 清單元件：刪 `const notOpenYet = useBeforeV002();`、`v002Monsters`／`v002Quests` 兩個 `useMemo` 跟上面的註解、`badge: …` 那行；`useMemo` 依賴陣列拿掉 `v002Monsters, v002Quests, notOpenYet`。
- 不再載地圖（D4）：刪 `const [maps, setMaps] = useState<Record<string, MapRecord> | null>(peekMaps);`；載入改 `Promise.all([loadItems(), loadMonsters(), loadQuests()])`，`.then` 裡的解構跟 `setMaps(…)` 一起改；`loading={!items || !monsters || !quests}`。
- `ItemDetail`：呼叫端拿掉 `maps={maps ?? {}}`、`isV002={…}`；型別跟解構拿掉 `maps`（含「店家地點要看是不是 10/15 才開放」註解）、`isV002`；刪 `const notOpenYet = useBeforeV002();`；標題刪 `{isV002 && notOpenYet ? <span className="ml-1.5 align-middle"><Chip tone="gold">10/15 開放</Chip></span> : null}`。

- [ ] **Step 3: `MonsterDb.tsx`**

刪 `useBeforeV002`、`@/lib/v002`、`Chip` 三個 import（`grep -c "<Chip"` 拆完是 0 才刪 `Chip`）；清單元件刪 `notOpenYet`、`badge` 那行、依賴陣列的 `notOpenYet`；`MonsterDetail` 刪 `notOpenYet`、名字後的 chip、出沒地圖每一列的 `{isV002Map(maps[String(mapId)]) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : null}`（v0.50 改過的話，`monsterMaps` 的呼叫在 Task 3 已處理）。

- [ ] **Step 4: `QuestDb.tsx`**

同上：import 三個；清單元件 `notOpenYet`／`badge`／依賴；`QuestDetail` 標題的 chip；`NpcBlock` 的 `notOpenYet` 跟 `{isV002Map(maps[String(npc.map)]) && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : null}`。

- [ ] **Step 5: `SkillDb.tsx`**

import 三個（`useBeforeV002`、`isV002Skill`、`Chip`）；清單元件 `notOpenYet`／`badge`／依賴；細節的 `notOpenYet` 跟標題 chip。

- [ ] **Step 6: `QuestDetailBody.tsx`、`GoNavigator.tsx`**

`QuestDetailBody`：刪 `useBeforeV002`、`isV002Map`、`Chip` import、`const notOpenYet`、NPC 地圖那行的 chip。
`GoNavigator`：刪 `useBeforeV002`、`Chip` import、`const notOpenYet = useBeforeV002();`、`{record?.o && notOpenYet ? <Chip tone="gold">10/15 開放</Chip> : null}`。

- [ ] **Step 7: `DbBrowser.tsx`、`bits.tsx`**

`DbBrowser`：entry 型別刪 `badge?: React.ReactNode;` 跟它的註解；清單刪 `{entry.badge}`。
`bits.tsx` 的 `Chip` 註解改：

```tsx
/** 小標籤：職業專屬提示、組隊這種短短一句都用它，顏色挑 tone 就好，不要另外做樣式。 */
```

- [ ] **Step 8: 守門檢查（GREEN）＋測試**

Step 1 的 grep 只剩 `isV002`（如果有的話只能出現在 pipeline 相關註解，`src/app`、`src/components` 應該完全沒有輸出）；tsc＋vitest 全綠。

- [ ] **Step 9: Commit**

```bash
git add src/app src/components
git commit -m "v0.46: 查資料四頁、任務細節、帶我去拿掉「10/15 開放」標示；道具頁不再為了標示多載地圖

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 刪 `release.ts`、`v002.ts`、建置時間

**Files:**
- Delete: `src/lib/release.ts`、`src/lib/v002.ts`、`src/lib/__tests__/{release,release-hook,v002,v002-realdata}.test.ts`
- Modify: `next.config.mjs`

- [ ] **Step 1: 守門檢查（RED）**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
git grep -n -E "@/lib/release|@/lib/v002|MAPLEBOOK_BUILD_TIME|useBeforeV002|beforeV002|onV002Open" -- src next.config.mjs
```

Expected: 只剩 `release.ts`、`v002.ts`、那四個測試檔、`next.config.mjs` 自己。其他檔還有 → 回頭補 Task 2～5。

- [ ] **Step 2: 刪檔**

```bash
git rm src/lib/release.ts src/lib/v002.ts src/lib/__tests__/release.test.ts src/lib/__tests__/release-hook.test.ts src/lib/__tests__/v002.test.ts src/lib/__tests__/v002-realdata.test.ts
```

（v0.48 若另外加了只給 `release.ts` 用的測試或 fake，一起刪；`src/lib/__tests__/fake-server.ts` 還有別的測試在用就留。）

- [ ] **Step 3: `next.config.mjs`**

刪前三行（兩行註解＋`process.env.MAPLEBOOK_BUILD_TIME ??= …`）跟 `env: { MAPLEBOOK_BUILD_TIME: process.env.MAPLEBOOK_BUILD_TIME },`。開頭變成：

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
```

- [ ] **Step 4: 守門檢查（GREEN）＋測試**

Step 1 的 grep 沒有輸出；tsc＋vitest＋pipeline 全綠。

- [ ] **Step 5: Commit**

```bash
git add -A src/lib next.config.mjs
git commit -m "v0.46: 刪掉 release.ts、v002.ts 與建置時間（開放後永遠是「已開放」）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 文件、註解、開機後重新部署的 workflow

**Files:**
- Modify: `README.md`、`src/lib/types.ts`、`pipeline/build.mjs`、`pipeline/build-gear.mjs`、`pipeline/lib/gear.mjs`、`src/lib/__tests__/now-plan-realdata.test.ts`、`src/lib/__tests__/db-browse.test.ts`、`src/lib/__tests__/gear-realdata.test.ts`
- Delete（開工條件 2 成立才刪）：`.github/workflows/v002-open.yml`、`scripts/v002-open.mjs`（＋它自己的測試）
- Delete（D6）：`scripts/verify/first-frame.mjs`

- [ ] **Step 1: README**

開機日期照 Task 0 查到的實際開放時刻寫（延後開機就寫實際那天）。

開頭那段改成（「現為 V002」那行後面）：

```md
> 本作是遊戲橘子代理（NEXON Korea 授權）、2026-07-29 上線，現為 **V002**（2026-10-15 開機）：三轉、Lv.120、新地區天空之城／冰原雪域／廢礦區。
> 其他開放地區：**楓之島、維多利亞島**（含奇幻村、螞蟻礦坑）。
```

（原本「V002 內容已上線、2026/10/15 開機後才能玩…」「畫面上會標 10/15 開放…」「舊內容現在就能玩…」三行換成上面兩行；Artale 那行不動。）

「能力值與裝備」那條刪掉「`；只有 10/15 改版後才拿得到的標「10/15 開放」`」。

「已經收錄不等於玩家這個時間點能去」那一段（講 `o`、`release.ts`、`MAPLEBOOK_BUILD_TIME` 的）改成：

```md
V002 這次才放行的地圖（冰原雪域、廢礦區，以及上面補缺的天空之城、冰原雪域兩座城鎮本身）在 `maps.json`
多帶一個 `o` 欄位（開放日 `"2026-10-15"`）。開放前前端用它標「10/15 開放」，開放後那些程式已經拆掉（v0.46）；
`o` 留著是因為裝備推薦還在用：掉落怪挑一張不是 V002 的地圖來顯示、兩把武器數值完全一樣時先推不是只有 V002 才拿得到的。
```

驗收腳本那節（v0.47 寫的）如果提到 `first-frame.mjs`，那幾行一起拿掉。

- [ ] **Step 2: 註解**

`src/lib/types.ts`：
- `MapRecord.o`：`/** V002 才放行的地圖才有：開放日（YYYY-MM-DD，目前只有 "2026-10-15"）。標示已拆（v0.46），留給裝備推薦排序用（見 README） */`
- `ShopRow` 註解的「`m 地點的地圖 id（看是不是 10/15 才開放）`」→「`m 地點的地圖 id`」
- `Item.sh`：`/** 店家數（含還沒開放城鎮的店） */`

`pipeline/build.mjs` 的 `V002_OPEN_DATE` 註解：

```js
/**
 * V002 開機日（官方公告 https://maplestoryclassic.beanfun.com/bulletin?Bid=83849）。
 * 帶這個日期的地圖（maps.json 的 o）＝ V002 才放行的地圖。開放前前端用它標「10/15 開放」（v0.46 已拆），
 * 現在留給 build-gear 用：掉落地圖優先挑不是 V002 的、只有 V002 拿得到的武器／卷軸帶 o（同分排序用）。
 */
```

`pipeline/build-gear.mjs` 檔頭「`任務是不是 V002 的判斷鏡射 src/lib/v002.ts 的 isV002Quest（pipeline 不能 import TypeScript，lib/gear.mjs 手動保持邏輯一致）。`」→「`任務是不是 V002 的判斷在 lib/gear.mjs 的 isV002Quest。`」

`pipeline/lib/gear.mjs` 的 `isV002Quest` 註解：

```js
/**
 * 任務是不是 V002 才有：等級限制超過 100、接取地圖是 V002 地圖、或可接職業全是三轉代碼。
 */
```

- [ ] **Step 3: 測試名稱與檔頭**

- `now-plan-realdata.test.ts`：「`V002 才放行的地圖有開放日（o 欄位是 2026-10-15），楓之島、維多利亞島的地圖沒有（Task 15：直接讀 maps.json，不呼叫 src/lib/release.ts）`」→ 拿掉括號那段。
- `db-browse.test.ts`：「`內容一樣只是重算（角色讀好、10/15 標籤冒出來），不算換，…`」→「`內容一樣只是重算（例如角色讀好），不算換，…`」（後半照原文）。
- `gear-realdata.test.ts` 檔頭如果 Task 1 還沒改，拿掉 `v002-realdata.test.ts` 的參照。

- [ ] **Step 4: v0.48 的 workflow（開工條件 2 成立才做）**

```bash
git rm .github/workflows/v002-open.yml scripts/v002-open.mjs
git grep -n -E "v002-open" -- . ':!docs/superpowers/plans'   # 還有引用（README、package.json、測試）就一起改掉
```

沒成立：不刪，PR 說明寫「v002-open workflow 還沒跑完（正式機首頁還有橫幅），先留著」，回報時提醒使用者。

- [ ] **Step 5: `scripts/verify/first-frame.mjs`（D6，有的話）**

```bash
git rm scripts/verify/first-frame.mjs
git grep -n "first-frame" -- . ':!docs/superpowers/plans'   # README、其他腳本的引用一起拿掉
```

- [ ] **Step 6: 全部測試＋最終守門**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
git grep -n -E "10/15 開放|useBeforeV002|@/lib/release|@/lib/v002|beforeOpen|MAPLEBOOK_BUILD_TIME|sourceOpensLater|familyPick|opensLater|isLater" -- . ':!docs/superpowers/plans'
```

Expected: 沒有輸出（README 新寫的那句「開放前前端用它標「10/15 開放」」例外，pipeline/build.mjs 註解同理——這兩處是說明歷史，可以留）。tsc＋vitest＋pipeline 全綠。

- [ ] **Step 7: Commit**

```bash
git add -A README.md src pipeline scripts .github
git commit -m "v0.46: 文件與註解跟著改——o 欄位留著的原因寫進 README；開機後重新部署的 workflow 跑完一起刪

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 驗收與交付（拆前拆後比對 → PR → dev → 測試機）

**Files:**
- Create（不進 commit）：工作暫存資料夾的 `compare-after-open.mjs`

- [ ] **Step 1: 開兩台 dev server（拆前、拆後）**

```bash
export PATH="/usr/bin:/mingw64/bin:$PATH"
cd C:/Users/user1/MapleBook
git worktree add --detach .claude/worktrees/v002-before <BASE_SHA>
```

用 `preview_start`：在 `.claude/worktrees/remove-v002-labels/.claude/launch.json` 臨時加兩組（驗完還原、不進 commit），埠避開 3000（常被別的 session 佔著）。`.claude/worktrees/*` 沒有自己的 node_modules，Turbopack 找不到 next，一定要 `--webpack`：

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "v002-before", "runtimeExecutable": "node", "runtimeArgs": ["C:/Users/user1/MapleBook/node_modules/next/dist/bin/next", "dev", "--webpack", "-p", "3061", "C:/Users/user1/MapleBook/.claude/worktrees/v002-before"], "port": 3061 },
    { "name": "v002-after", "runtimeExecutable": "node", "runtimeArgs": ["C:/Users/user1/MapleBook/node_modules/next/dist/bin/next", "dev", "--webpack", "-p", "3062", "C:/Users/user1/MapleBook/.claude/worktrees/remove-v002-labels"], "port": 3062 }
  ]
}
```

（launch.json 本來就有內容的話，只在 `configurations` 裡加這兩組。）

兩台都要在**開放時刻之後**才啟動（拆前那台的 `MAPLEBOOK_BUILD_TIME` 是啟動時間，開放前啟動會把橫幅畫進第一格）。

- [ ] **Step 2: 寫比對腳本到工作暫存資料夾**

```js
// compare-after-open.mjs：拆前／拆後同一組畫面逐一比對（v0.46 拆 V002 標籤）
// 用法：node compare-after-open.mjs <輸出資料夾> <拆前網址> <拆後網址> <public/data 資料夾> [--at=2026-10-16T12:00:00+08:00] [--only=情境名,情境名]
// 每個情境 × 手機／桌機：設好角色 → 打開 → 等畫面 1.5 秒沒變動 → 抓 body 文字＋截圖。
// 兩邊文字要一字不差，而且都不能出現「10/15 開放」或橫幅。--at 把瀏覽器時鐘調到那個時間（在開放前測試時才需要）。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [OUT, BEFORE, AFTER, DATA] = process.argv.slice(2, 6);
const AT = process.argv.find(arg => arg.startsWith("--at="))?.slice(5);
const ONLY = process.argv.find(arg => arg.startsWith("--only="))?.slice(7).split(",");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9361;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(OUT, { recursive: true });

const read = name => JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
const monsters = read("monsters.json");
const quests = read("quests.json");
const skills = read("skills.json");
const idOf = (list, pred, what) => {
  const hit = list.find(pred);
  if (!hit) throw new Error(`資料裡找不到${what}`);
  return hit.id;
};

const P = {
  刺客35: { level: 35, job: 410 },
  狂戰士70: { level: 70, job: 110 },
  十字軍105: { level: 105, job: 111 },
  祭司75: { level: 75, job: 231 },
  初心者8: { level: 8, job: 0 },
};
const SCENES = [
  ...Object.entries(P).map(([name, profile]) => ({ name: `首頁-${name}`, url: "/", profile })),
  { name: "帶我去-天空之城到冰原雪域", url: "/go?from=200000000&to=211000000", profile: P.十字軍105 },
  { name: "道具-紅色藥水", url: "/db/items?id=2000000", profile: P.刺客35 },
  { name: "道具-狼牙", url: "/db/items?id=1472007", profile: P.刺客35 },
  { name: "道具-清單", url: "/db/items", profile: P.刺客35 },
  { name: "怪物-黑格里芬", url: `/db/monsters?id=${idOf(monsters, m => m.n === "黑格里芬", "黑格里芬")}`, profile: P.十字軍105 },
  { name: "怪物-清單", url: "/db/monsters", profile: P.十字軍105 },
  { name: "任務-百等以上", url: `/db/quests?id=${idOf(quests, q => (q.minLv ?? 0) > 100, "100 等以上的任務")}`, profile: P.十字軍105 },
  { name: "任務-清單", url: "/db/quests", profile: P.十字軍105 },
  { name: "技能-鬥氣集中", url: `/db/skills?id=${idOf(skills, s => s.n === "鬥氣集中", "鬥氣集中")}`, profile: P.十字軍105 },
  { name: "技能-清單", url: "/db/skills", profile: P.十字軍105 },
];
const VIEWPORTS = { 手機: { width: 390, height: 844, mobile: true }, 桌機: { width: 1280, height: 900, mobile: false } };

async function getJSON(url) {
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(url)).json(); } catch { await sleep(200); }
  }
  throw new Error(`DevTools 沒起來：${url}`);
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) for (const listener of listeners) listener(msg);
  });
  const opened = new Promise(resolve => ws.addEventListener("open", resolve));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { opened, send, listeners };
}

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "chrome-profile")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const target = (await getJSON(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === "page");
const page = connect(target.webSocketDebuggerUrl);
await page.opened;
await page.send("Page.enable");
await page.send("Runtime.enable");
await page.send("Network.enable");
// 還在路上的請求（資料檔）：全部回來、而且畫面 1.5 秒沒變才截，免得抓到「讀取中」
const inflight = new Set();
page.listeners.add(m => {
  if (m.method === "Network.requestWillBeSent") inflight.add(m.params.requestId);
  if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") inflight.delete(m.params.requestId);
});
async function networkIdle(max = 45000) {
  const t0 = Date.now();
  let idleSince = Date.now();
  while (Date.now() - t0 < max) {
    if (inflight.size > 0) idleSince = Date.now();
    else if (Date.now() - idleSince > 1500) return;
    await sleep(100);
  }
}

async function evaluate(expression) {
  const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
const loaded = () => new Promise(resolve => {
  const listener = m => { if (m.method === "Page.loadEventFired") { page.listeners.delete(listener); resolve(); } };
  page.listeners.add(listener);
  setTimeout(() => { page.listeners.delete(listener); resolve(); }, 60000);
});
// 畫面 1.5 秒沒有任何變動、而且看不到「讀取中」的字或 aria-busy 才算穩定（最多等 45 秒：dev 模式第一次打開要編譯）。
// 讀取中的字照 src 裡的 LoadingBlock、DbBrowser、GearCard、NowCard、RouteTimeline；有新的讀取字樣就加進來。
const QUIET = `new Promise(resolve => {
  const loading = () => /載入中…|整理資料中…|載入地圖資料…|讀取[^\\n]{0,12}中…|讀取你的角色…/.test(document.body.innerText)
    || !!document.querySelector('[aria-busy="true"]');
  let timer;
  const finish = () => { mo.disconnect(); resolve(); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => (loading() ? arm() : finish()), 1500); };
  const mo = new MutationObserver(arm);
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  arm();
  setTimeout(finish, 45000);
})`;
// 每次整頁載入前：清掉記憶、設角色；有 --at 就把時鐘調過去（計時器照真實時間跑）
const setup = profile => `(() => {
  ${AT ? `const RealDate = Date; const offset = ${Date.parse(AT)} - RealDate.now();
  class ShiftedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = ShiftedDate;` : ""}
  try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("ms-profile", ${JSON.stringify(JSON.stringify(profile))}); } catch {}
})();`;

async function capture(base, side, scene, vpName, vp) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: setup(scene.profile) });
  try {
    inflight.clear();
    const done = loaded();
    await page.send("Page.navigate", { url: base + scene.url });
    await done;
    await networkIdle();
    await evaluate(QUIET);
    const text = await evaluate("document.body.innerText");
    const file = `${scene.name}-${vpName}-${side}.png`;
    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, "base64"));
    return { text, file };
  } finally {
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  }
}

const rows = [];
for (const scene of SCENES.filter(s => !ONLY || ONLY.includes(s.name))) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const before = await capture(BEFORE, "拆前", scene, vpName, vp);
    const after = await capture(AFTER, "拆後", scene, vpName, vp);
    const same = before.text === after.text;
    const label = /10\/15 開放|已經照 10\/15 改版排好|開機後才能去/.test(before.text + after.text);
    rows.push({ scene: scene.name, viewport: vpName, same, label, before: before.file, after: after.file });
    if (!same) fs.writeFileSync(path.join(OUT, `${scene.name}-${vpName}-差異.txt`), `拆前：\n${before.text}\n\n拆後：\n${after.text}\n`);
    console.log(`${same && !label ? "OK " : "BAD"} ${scene.name} ${vpName}${same ? "" : "（文字不一樣）"}${label ? "（還看得到 10/15 標示）" : ""}`);
  }
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(rows, null, 2));
spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
const bad = rows.filter(row => !row.same || row.label);
console.log(`${rows.length - bad.length}/${rows.length} 個畫面一樣`);
process.exit(bad.length ? 1 : 0);
```

- [ ] **Step 3: 先跑對照組（拆前對拆前），找出本來就會變的畫面**

```powershell
node <暫存>\compare-after-open.mjs <暫存>\control http://localhost:3061 http://localhost:3061 C:\Users\user1\MapleBook\.claude\worktrees\remove-v002-labels\public\data
```

Expected: 全部 OK。有 BAD 先看 `*-差異.txt`：其中一邊還在讀取（「載入中…」「整理資料中…」這類字）＝等待條件不夠，把那個讀取字樣加進腳本 `QUIET` 的 `loading()`，用 `--only=<情境名>` 重跑到 OK（2026-10-07 試跑時「怪物-黑格里芬 桌機」就是這樣，已補）；真的本來就會變（時間、隨機）的才記下來，Step 4 那幾個改看截圖比對。

- [ ] **Step 4: 正式比對（拆前對拆後）**

```powershell
node <暫存>\compare-after-open.mjs <暫存>\compare http://localhost:3061 http://localhost:3062 C:\Users\user1\MapleBook\.claude\worktrees\remove-v002-labels\public\data
```

Expected: `30/30 個畫面一樣`（15 個情境 × 手機／桌機），而且沒有「還看得到 10/15 標示」。有 BAD：打開 `*-差異.txt` 看差在哪——差的是 10/15 標示以外的東西＝拆壞了，回到對應的 Task 用 superpowers:systematic-debugging 找原因修好，再跑一次；**不准改腳本或期望值來過關**。拆前那邊出現 10/15 標示＝dev server 是開放前啟動的（Step 1 的提醒），重啟拆前那台再跑。

跑完把 3061、3062 兩台關掉，`git worktree remove .claude/worktrees/v002-before`，`.claude/launch.json` 還原。

- [ ] **Step 5: 推分支、開 PR 進 dev**

```powershell
$env:GH_TOKEN = (& "C:\Program Files\GitHub CLI\gh.exe" auth token --user clarkher)
git push -u origin feat/remove-v002-labels
& "C:\Program Files\GitHub CLI\gh.exe" pr create --base dev --head feat/remove-v002-labels --title "v0.46: V002 開放後拆掉「10/15 開放」標籤的程式（畫面不變）" --body-file <暫存>\pr-body.md
```

PR 說明（`pr-body.md`）要有：拆了什麼（檔案清單）、留了什麼跟原因（D1、D2、D3 例外有沒有成立、workflow 有沒有刪）、Task 1 改了期望值的測試（名稱、舊值→新值）、比對結果（N/N 一樣，對照組有幾個本來就不穩定）、測試指令結果、排程這次是幾點開工的。最後一行 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。

- [ ] **Step 6: 等分支預覽建好、合進 dev**

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" api "repos/clarkher/maplestory-tool/commits/$(git rev-parse HEAD)/status" --jq ".state"
```

`success` 再合（`pending` 就等；`failure` 看 Vercel 建置記錄修好、開**新**分支新 PR，不往已開的 PR 再推）。合併前確認 PR head 跟本機一致：

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" pr view <N> --json headRefOid --jq .headRefOid
git rev-parse HEAD
& "C:\Program Files\GitHub CLI\gh.exe" pr merge <N> --squash --delete-branch
git fetch origin; git log origin/dev --oneline -5    # 要看到這次的 v0.46
```

- [ ] **Step 7: 測試機實測**

等 dev 部署好（`gh api "repos/clarkher/maplestory-tool/commits/<dev 最新 sha>/status"` 是 success），用比對腳本對測試機跑一次（拆前、拆後都填測試機網址，只是拿它抓文字跟截圖）：

```powershell
node <暫存>\compare-after-open.mjs <暫存>\dev-site https://maplestory-tool-git-dev-clarkhers-projects.vercel.app https://maplestory-tool-git-dev-clarkhers-projects.vercel.app C:\Users\user1\MapleBook\.claude\worktrees\remove-v002-labels\public\data
```

Expected: 全部 OK、沒有 10/15 標示。挑首頁（刺客 35、十字軍 105）、道具-紅色藥水、怪物-黑格里芬的手機截圖給使用者看。

- [ ] **Step 8: 收尾**

- `git worktree remove .claude/worktrees/remove-v002-labels`（分支 GitHub 已刪）。
- 記憶 `C:\Users\user1\.claude\projects\C--Users-user1-MapleBook\memory\maplebook-1015-release.md` 補一段：v0.46 已拆掉 10/15 標籤的程式（PR 連結），`o` 留著的原因。
- 共用筆記寫結果；推播通知使用者；回報貼可點連結：PR、測試機 https://maplestory-tool-git-dev-clarkhers-projects.vercel.app 。**不合 main**——提醒使用者要上正式機時說一聲。
