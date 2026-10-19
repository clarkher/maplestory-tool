# 祭司 71～85 主推殭屍（v1.09）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 祭司 71～85 等首頁主推卡改推亡者之林（殭屍），不再被「比參考等級低 10 級以上的攻略圖排在遊戲資料後面」擋到後面。

**Architecture:** 研究檔練功段落可以標 `current: true`＝「10/15 改版後台服有人在這個等級實際這樣練」，`build-guides` 原樣帶到 `public/data/guides/*.json` 的 `GuideTrain.current`；`src/lib/now-plan.ts` 的 `mainPick` 判過期時，標了 `current` 的段落不算過期。升級路線「你在這」那一列本來就讀主推（`timeline.ts` 的 `pickRow`），不用另外改。只標祭司 231 那一段（使用者 2026-10-19「繼續做完」＝第 1 項選 A），其他職業的過期規則不變。

**Tech Stack:** TypeScript、vitest、node:test。

**Spec:** `docs/superpowers/specs/2026-10-19-v002-guides-update-design.md`（最後一節「第二輪」）

## Global Constraints

- 只動祭司 231 的 70～85 殭屍段；其他職業、其他段落主推結果不能變（真資料測試全綠為證）。
- 全部文字繁體中文、不用 emoji；研究檔 `magician.json` 是 `JSON.stringify(x, null, 2) + "\n"` 格式，用 node 改、斷言目標只出現一次。
- commit message `v1.09: …` 開頭，結尾空一行加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。分支 `feat/v1.09-priest-zombie`（從 origin/dev 開好了），只 commit 不 push。
- 暫存腳本放 `C:/Users/user1/AppData/Local/Temp/claude/C--Users-user1-MapleBook--claude-worktrees-strange-saha-340c45/772c49c9-bdfe-4e6c-b87b-1a9624d1e8ea/scratchpad/`，不進 repo。

---

### Task 1: 標了 current 的攻略段落不算過期

**Files:**
- Modify: `src/lib/types.ts`（`GuideTrain` 加 `current?: true`）
- Modify: `src/lib/now-plan.ts:821-846`（`mainPick` 的過期判斷）
- Test: `src/lib/__tests__/now-plan-main.test.ts`（「主推大卡：能練的最高圖、過期攻略、封頂」那組，照「比現在低 10 級以上的攻略圖排在遊戲資料後面」那支的寫法）
- Modify: `pipeline/build-guides.mjs`（練功段落輸出帶 `current`）
- Modify: `data/guides/magician.json`（231 的 70～85 段加 `"current": true`）
- Regenerate: `public/data/guides/*.json`
- Modify: `README.md`（主推規則那段「比你低 10 級以上的舊攻略圖排在遊戲資料後面」後面補一句例外）

- [ ] **Step 1: 寫失敗的測試**（放在「比現在低 10 級以上的攻略圖排在遊戲資料後面」那支後面）

```ts
  it("攻略段落標了 current（台服改版後有人在這個等級實際這樣練）就不算過期，照樣排第一（祭司 80 打殭屍）", () => {
    const zombie = 300000020;
    const fresh = 300000021;
    const top = 300000022;
    const guide = guideWith([segment({ map: zombie, name: "殭屍圖", from: 70, to: 85, current: true })]);
    const pick = mainPick({ ...world([{ id: zombie, lv: 57, eff: 100 }, { id: fresh, lv: 73, eff: 500 }, { id: top, lv: 73, eff: 50 }]), level: 80, job: 231, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ map: zombie, source: "guide" });
  });

  it("沒標 current 的同一段照舊算過期（其他職業規則不變）", () => {
    const zombie = 300000023;
    const fresh = 300000024;
    const top = 300000025;
    const guide = guideWith([segment({ map: zombie, name: "殭屍圖", from: 70, to: 85 })]);
    const pick = mainPick({ ...world([{ id: zombie, lv: 57, eff: 100 }, { id: fresh, lv: 73, eff: 500 }, { id: top, lv: 73, eff: 50 }]), level: 80, job: 231, guide });
    if (pick?.kind !== "map") throw new Error("應該是練功圖");
    expect(pick.option).toMatchObject({ source: "data" });
  });
```

（`world(...)` 是這個檔案既有的 helper，先讀它怎麼用；若 job 231 讓 `jobFit` 擋掉測試圖、或 `world` 不支援某參數，照檔案既有寫法調整假資料，但兩支測試要分別證明「有 current → 攻略圖第一」「沒有 current → 遊戲資料第一」。）

- [ ] **Step 2: 跑測試確認第一支失敗**

Run: `npx vitest run src/lib/__tests__/now-plan-main.test.ts`
Expected: 第一支 FAIL（型別錯或主推是 data），第二支 PASS。

- [ ] **Step 3: 實作**

`types.ts` 的 `GuideTrain` 加：

```ts
  /** 台服 10/15 改版後有人在這個等級實際這樣練（例：祭司 80 打殭屍）：主推不套「比參考等級低 10 級以上算過期」 */
  current?: true;
```

`now-plan.ts` `mainPick` 的迴圈：`(isStale(map) ? stale : fresh).push(option);` 改成 `(isStale(map) && !segment.current ? stale : fresh).push(option);`，並在 `STALE_GAP` 的註解補「研究檔標了 current 的段落不算」。

`build-guides.mjs` 練功段落 `return { from, to, kind, map, name, mobs, why, v, s, pq }` 那個物件加 `...(segment.current ? { current: true } : {})`。

`magician.json` 231 `training` 裡 `levelFrom` 70、`levelTo` 85、`mapName`「亡者之林Ⅳ／廢棄礦坑Ⅰ（殭屍、礦山殭屍）」那段加 `"current": true`（放在 `verified` 後面）。

README「比你低 10 級以上的舊攻略圖排在遊戲資料後面」那句後面補：「（改版後台服有人在那個等級實際在練的段落除外，例如祭司 70～85 打殭屍）」。

- [ ] **Step 4: 重編＋測試**

Run: `npm run data:guides`、`npx vitest run src/lib/__tests__/now-plan-main.test.ts`、`npx tsc --noEmit -p tsconfig.json`、全套 `npm test`。
Expected: 全綠。真資料測試（`now-plan-realdata.test.ts`）紅了要逐項看：祭司 70→71（女神組隊結束接殭屍 Lv.57）、85→86（殭屍段結束）這種接縫若被「多升一級主推圖掉超過 10 級」擋到，先確認是新規則的正常結果，才照該檔 `KNOWN_DROPS` 寫法加例外並寫原因；不准放寬判斷式。其他職業的組合不准有任何變化。

- [ ] **Step 5: 真資料確認**（臨時 vitest 檔，跑完刪）：用 `public/data` 跑 `mainPick`，祭司 231 在 71、80、85 等主推是亡者之林Ⅳ（`source: "guide"`），86 等不是；僧侶 230 在 57～70 主推仍是女神組隊；十字軍 111 在 80 等主推跟改之前一樣。

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/now-plan.ts src/lib/__tests__/now-plan-main.test.ts pipeline/build-guides.mjs data/guides/magician.json public/data/guides README.md
git commit -m "v1.09: 祭司 71～85 主推殭屍（亡者之林）——台服改版後實際在練的攻略段落不套「低 10 級排後面」"
```
