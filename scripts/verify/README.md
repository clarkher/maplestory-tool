# 畫面驗收腳本（無頭 Chrome）

換頁第一格、按返回的位置、捲動、邊框顏色、卡片截圖，這些單元測試量不到，要開瀏覽器實際看。
這裡的腳本開無頭 Chrome、走 DevTools 協定，在真的畫面上逐格量、截圖存證。
各支是平行開發時不同 session 寫的，2026-10-07 從 `%TEMP%\maplebook-verify\` 收進來。

查資料四頁的正式驗收不在這裡，是 `npm run verify:db`（`scripts/verify-db.mjs`，見 repo 根目錄 README「查資料頁驗收」）。

## 怎麼跑

```bash
node scripts/verify/<腳本>.mjs <輸出資料夾> <網址> …
```

- 要 Node 22 以上（用到內建的 WebSocket）跟 Chrome。目前只在 Windows 上用過，有幾支收尾用 `taskkill`。
- 網址可以是本機 dev server（先 `npm run dev`），也可以是測試機 https://maplestory-tool-git-dev-clarkhers-projects.vercel.app 。
- 輸出資料夾給 repo 外面的路徑。不給的話自動寫到系統暫存資料夾的 `maplebook-verify-out/<腳本>-<時間>`。
  資料夾裡的 `chrome-profile/` 是無頭 Chrome 的瀏覽器資料，量完可以刪。
- 環境變數（都在 `config.mjs`）：
  - `CHROME_PATH`：Chrome（或 Edge、Chromium）在哪，預設 `C:/Program Files/Google/Chrome/Application/chrome.exe`。
  - `CHROME_PORT`：DevTools 的埠。命令列有給埠就用命令列的，都沒給就用各支的預設值。
- **埠不能撞，別的 session 正在跑的也算**：first-frame 是 9343、scroll-proof 是 9333，reload-open 是 9363，gear-source-shot 是 9365，build-variants-shot 是 9371，back-all 和 card-shot 都是 9347，reload-all 是 9367，
  border-* 和 home-first-frame 在 9400–9799 隨機挑。埠被佔走時，腳本會連進別人的 Chrome、操作別人的分頁。
  不確定就用埠參數或 `CHROME_PORT` 指定沒人用的埠（先 `netstat -ano | findstr :<埠>` 看一下有沒有人在用）。
- **在 Git Bash 裡跑**：`/plan/farm` 這種斜線開頭的參數會被自動改成 Windows 路徑。例如 back-all 的「只跑某頁」
  會一頁都對不到，`results.json` 是空的。指令前面加 `MSYS_NO_PATHCONV=1`，或改用 PowerShell。
- 大多數腳本不判 PASS／FAIL，只把逐格紀錄、截圖、`results.json` 留下來讓人看。
  first-frame 會印 PASS／FAIL，但一律 exit 0。check-first-frame 會判、沒過就 exit 1（GitHub Actions「測試 / 第一格」跑的就是它）。
- 測試機實測時間（2026-10-07）：first-frame 的 nav 段 25 秒、scroll-proof 45 秒、crossdoc（plain）75 秒、
  after-back 35 秒、m13-select 20 秒、navtop2 20 秒、chart 15 秒、back-all 只跑一頁 12 秒、card-shot 一個網址 5 秒、
  gear-source-shot 三個角色 13 秒。
  border-compare 全部跑約 20 分鐘。
- 不會被 `npm test` 跑到：vitest 只抓 `src/**/*.test.ts`，`node --test` 只抓 `pipeline/**/*.test.mjs`。
- `.gitignore` 擋掉這個資料夾裡除了 `.mjs` 跟本檔以外的東西，也擋掉任何 `chrome-profile*/`。
- 新寫的驗收腳本直接放這裡，別只放 `%TEMP%`。寫法：`import { CHROME, chromePort, outDir } from "./config.mjs"`，
  再到本檔補一段。

## 每支在做什麼

### 換頁第一格

#### `check-first-frame.mjs`：自動檢查換頁第一格，沒過 exit 1（v0.68，GitHub Actions「測試 / 第一格」）

```bash
node scripts/verify/check-first-frame.mjs [輸出] [網址，預設 http://localhost:3000]
```

- 七項，只看結構、不看時間（GitHub 的機器快慢不穩，時間門檻會偶發紅燈）：
  1 首頁 → 查資料 → 我的路線，DOM 只有一個狀態、就是完整路線；2 硬重新整理、存過角色，不出現「你現在幾等、什麼職業？」；
  3 硬重新整理、沒存過角色，第一格就看得到那句問題；4 首頁「帶我去」→ /go 第一格就是路線；5 查資料 → 練功地圖排行第一格就是結果；
  7 刺客 35 選了全幸（`ms-build` `{"400":"全幸"}`）：硬重新整理、站內換頁（查資料 → 我的路線）進首頁，「能力值與裝備」卡
  第一次畫出來就是全幸——逐格紀錄裡卡片在的每一格（rAF 跟 DOM 變動都看）選中的都是「全幸」、都有「要湊的敏捷裝備」，
  不會先畫一般點法再跳過去（v0.76）；跑完把角色還原成狂戰士 45、拿掉 `ms-build`；
  6 沒有 hydration 警告、沒接住的錯誤（排在最後跑，涵蓋 1～5、7）。
- 逐格紀錄最少記固定的時間（換頁 4 秒、硬重新整理 3～5 秒），畫面還沒出來就一路記到出來後 1.5 秒、最多 60 秒（v0.76）：
  GitHub 上（`next start`）跟以前一樣，本機 `next dev` 第一次編譯、別的 session 正在改檔重編、CPU 被吃滿時，不會畫面還沒換過去就停、誤報紅。
- 本機跑：先 `next build` 再 `next start`（或直接給測試機網址），約 25 秒。`CI` 環境變數有設時 Chrome 會加 `--no-sandbox`。
  對 `next dev` 也跑得過，但慢很多（2026-10-08 CPU 被別的程式吃滿時實測約 4 分鐘，硬重新整理後卡片 15～23 秒才出來）。
  Windows 上收尾改用 `taskkill` 關 Chrome（v0.76 之前用 `chrome.kill()`，Chrome 常還活著佔著埠，下一次同一個埠會連進舊的那支）。
- 驗過抓得到：故意把首頁、/go、練功排行改回「先畫載入中」、大標改成都看不見，1／3／4／5 紅；對還沒有 v0.54 的正式機跑，2 紅；
  第 7 項把期待的標籤改成「一般點法」，硬重新整理、站內換頁兩段都紅（2026-10-08）。
- 輸出：`results.json`（每項的細節、console；第 7 項的 `reload` 有卡片畫出來幾格、第一格長怎樣、不對的格）、`1-home.png`、
  `7-home-luck.png`（第 7 項跑完捲到卡片）；CI 沒過時整個資料夾上傳成 artifact「first-frame」。

#### `first-frame.mjs`：「10/15 開放」標示第一個畫面就要在（v0.37）

```bash
node scripts/verify/first-frame.mjs <輸出> [網址] [段落，逗號分隔：nav,load,dawn,midnight,stale]
```

- `nav`：站內換頁進查資料四頁跟首頁，清單／首頁畫出來的第一格就要有標示，第一次 commit 就要帶著。
- `load`：直接打開首頁，伺服器給的 HTML 就有 10/15 橫幅，沒有 hydration 警告。
- `dawn`：時鐘調到 10/14 23:59:40，頁面開著跨過 10/15 00:00，橫幅跟角色列的「10/15 開放」都還在（v0.48 起開機才收）。
- `midnight`：瀏覽器時鐘調到開放前 30 秒，頁面開著跨過開放時刻，橫幅跟技能頁標示 1.5 秒內自己收掉。
- `stale`：時鐘調到開放後 20 小時（10/16 10:00）打開舊建置，不報 hydration、橫幅收掉、清單沒標示。
- 開放時刻用環境變數 `OPEN_AT` 改，預設 `2026-10-15T14:00:00+08:00`（`src/lib/release.ts` 的官方開機時刻；那邊改了這裡跟著改）。
  `DUMP_FRAMES=1` 會另存每一格 screencast。
- 輸出：`nav-<頁>-first-frame.png`（清單出現後的第一張 screencast）、`*-final.png`、`results.json`。
- 寫死的資料：二轉 75 等狂戰士、搜尋「幼紅獨角獅」「佛羅利刃」「泰勒斯的介紹函」、技能職業 111。
  整支繞著「10/15 開放」標示，標示拆掉後只剩參考。

#### `home-first-frame.mjs`：站內換頁進首頁的第一個畫面（v0.34）

```bash
node scripts/verify/home-first-frame.mjs <輸出> <網址>
```

- 情境：A 首頁 → 查資料 → 我的路線（A4／A6 是 CPU 慢 4／6 倍）、B 從查資料進站、C 等級加一、D 硬重新整理、
  D2 沒存過角色的人硬重新整理、E 沒選職業、F 不可能的組合（狂戰士 25 等）、G 道具頁的「狂戰士能用」標籤、H 首頁換職業。
- D 的 `questionFrames`／`domQuestion`：存過角色的人硬重新整理時，畫出來的格數／DOM 裡出現「你現在幾等、什麼職業？」
  的次數，v0.54 起都要是 0（大標看不見，位置照留）。D2 是沒存過角色的人，第一格就要看到那句問題。
- G 找 `main button[aria-pressed]` 裡文字以「能用」結尾的那顆（v0.55 起道具頁的「誰能用」下拉換成標籤按鈕，之前找 `select[aria-label="誰能用"]`），
  印出它的文字（`text`，預期「狂戰士能用」）跟 `aria-pressed`（`pressed`，一打開預期 `"false"`）；`textOk`、`pressedOk` 是跟預期值比的結果。
- `ONLY=A6,H` 只跑名稱開頭符合的情境。
- 每一格（rAF，畫出來之前）記高度跟有哪些區塊，另外用 screencast 存真的畫出來的畫面。
- 輸出：`<情境>-cast-<序號>-<毫秒>ms.jpg`（換頁後每一張 screencast）、`<情境>-settled-*.png`、`results.json`
  （含 console 跟 hydration 警告）。console 印整份 JSON，自己判讀。

#### `pages-first-frame.mjs`：站內換頁進 /go、/plan 四頁的第一個畫面，打開「換其他職業」先載攻略（v0.45）

```bash
node scripts/verify/pages-first-frame.mjs <輸出> <網址>
```

- 情境：P1 首頁「帶我去」→ /go、P2 查資料 → 練功地圖排行、P3 查資料 → 現在能接的任務、P4 任務打包（第二次進）、
  P5 道具頁「這個去哪打」→ 打寶、P6 /go 城鎮目的地＋上次自己選的起點、P7 打開「換其他職業」→ 點法師
  （記打開後在背景載了哪些攻略、主推卡有沒有出骨架）、P8／PQ4／PQ6／PF6 CPU 慢 4／6 倍、P9 從捲到底的長頁換頁要回到頂端。
- `ONLY=P7,PQ6` 只跑名稱開頭符合的情境。站內換頁用頁面裡的 `window.next.router.push`（跟點連結一樣不整頁重載）。
- 每一格記兩份：rAF（畫出來之前）跟 MutationObserver（DOM 每次變動）。`painted`／`dom` 只留跟上一格不一樣的狀態，
  只有一個狀態＝第一格就是結果。
- 輸出：`P*-*.png` 截圖、`results.json`（含 console 跟 hydration 警告）。console 印整份 JSON，自己判讀。

### 捲動、按返回、重新整理

#### `scroll-proof.mjs`：換頁捲回頂端、頁內平滑捲動（v0.29）

```bash
node scripts/verify/scroll-proof.mjs <輸出> [網址]
```

- 道具清單捲到底點頁首、道具清單點一筆、首頁「看打法」跳懶人包錨點，手機跟桌機各跑。
- 每個情境跑兩次：現況，跟執行中拿掉 `<html data-scroll-behavior>`（等於修正前）。
- 輸出：`<mobile|desktop>-<after|before>-*.png`（after＝現況、before＝拿掉屬性）、`results.json`（逐格 scrollY、Next 呼叫了哪些捲動）。

#### `back-all.mjs`：全站按返回的位置（v0.40）

```bash
node scripts/verify/back-all.mjs <輸出> <網址> [埠=9347] [只跑某頁，例如 /plan/farm]
```

- 11 種頁面各自捲到底 → 點頁首換頁 → 按返回 → 再按下一頁，逐格記 scrollY。全部跑時最後加一段跨文件返回
  （懶人包 → 別的網址 → 返回）。
- 網址是 localhost 時，會先把每頁整頁開一次等 dev server 編譯。
- 輸出：`<序號>-back-mid.png`（按返回後 0.12 秒）、`<序號>-back-end.png`、`results.json`。
  console 每頁一行：離開的位置、還原前 → 停在哪（位置對不對）、中間滑了幾格。

#### `crossdoc.mjs`：離站再返回、重新整理（v0.40）

```bash
node scripts/verify/crossdoc.mjs <輸出> <網址> [埠=9348] [plain|early] [nobf]
```

- 懶人包、關於、首頁、任務四頁，各量「離站再返回」跟「重新整理」：位置有沒有還原、是不是一路滑過去。
- 第 5 個參數：`plain` 只跑現況，`early` 只跑「一開頭先關平滑」的實驗，不給就兩種都跑。
- 第 6 個參數 `nobf`：關掉返回快取（`--disable-features=BackForwardCache`），離站返回一定整頁重載。
- 輸出：`results.json`，console 每個情境一行。

#### `reload-open.mjs`：展開過的卡片，重新整理、返回之後還在不在、停在不在同一段（v0.59）

```bash
node scripts/verify/reload-open.mjs <輸出> <網址> [埠=9363] [情境，逗號分隔：home,quest,train,bundle,go,guide,guide-pq]
```

- 每個情境跑四種：
  - 重新整理。
  - 離站再返回：關返回快取，一定整頁重載。
  - 站內按返回：點頁尾「資料從哪來」再按返回。
  - 站內重新點進來：點頁首「查資料」，再從查資料頁點回這一頁；這是新的一筆紀錄。帶我去、懶人包 #pq-moon 查資料頁沒有連結，不跑這種。
- 每一種都先從別頁點進來（新的一筆瀏覽紀錄），先記「剛進來時開著幾個」，要等於預設：首頁 1（你在的那段）、懶人包 1（第一步）、
  懶人包 #pq-moon 2（第一步＋月妙自動展開），其他 0。不等於預設就算沒過。
- 再像使用者一樣點開幾張卡：
  - 首頁：還有 N 個任務；長任務線看細節、還有 N 段、第 3 段；為什麼要解；第二列看細節；技能條；裝備看全部；主推理由展開；你在那段的「為什麼」；升級路線第一段。
  - 解任務：連卡住的一起看、三張看細節。
  - 懶人包：收起第一步、點開第二三步。
  - 懶人包 #pq-moon：收起自動展開的月妙（重新整理後網址的 # 還在，要保持收起）。
- 捲到可捲高度 70% 的地方，記下畫面兩個固定點是哪一塊：頁首下方 y=90、畫面中間 y=420。
  回來後同一塊、差 2px 內、開著的數量一樣，才印「同一段」。站內重新點進來要回到預設，才印「照預設」。
- 手機 375×812，角色 Lv.45（job 110）。環境變數 `WAIT`：回來後等幾毫秒再量，預設 5000。
- 輸出：`<情境>-<種類>-1-before.png`／`-2-after.png`、`results.json`。console 每種一行：離開／停的位置、頁高、開著幾個、兩個點對不對得上。
  對不上時多印兩行，是兩邊各看到哪一塊。最後一行印總共幾種、通過幾種。一律 exit 0。
- 已知會沒過的一種（2026-10-07，跟展開無關、改前就這樣）：懶人包 #pq-moon 的站內按返回會停在月妙那步的錨點（1281），
  不是離開的位置（1425）：網址帶 # 的那一筆紀錄，按返回時畫面被捲到錨點，不是瀏覽器記的位置。另外處理。
- 測試機實測時間（2026-10-07）：全跑約 9 分鐘。

#### `reload-all.mjs`：全站重新整理、離站再返回回不回得到原位（v0.44；v0.62 收進來）

```bash
node scripts/verify/reload-all.mjs <輸出> <網址> [埠=9367] [頁面,頁面…]
```

- 預設 10 頁：懶人包、關於、首頁、規劃四頁、怪物清單、道具清單、開著卡片的 `/db/monsters?id=100100`。
  每頁捲到 60% 高度，各量「重新整理」跟「離站再返回」（一律關返回快取，返回一定整頁重載）。
- v0.62 起開著卡片的網址也要回到離開時的位置（之前會跳回卡片頂端：離開 4001 → 停 357）。
- 手機 375 寬。重新整理、返回後等 4 秒再看（環境變數 `WAIT` 改毫秒數）。
- 輸出：每格一張截圖、`results.json`；console 每格一行（離開 → 停在哪、對不對、一載入的逐格位置），最後一行是幾格對。
- 幾支 Chrome 同時跑會互相拖慢，資料還沒到就量，數字會歪：最後一輪一支一支跑。

#### `after-back.mjs`：按完返回後，頁內平滑捲動還在不在（v0.40）

```bash
node scripts/verify/after-back.mjs <輸出> <網址> [埠=9354]
```

- 道具清單按完返回，再用滑鼠點一筆，捲到細節要是平滑的。任務頁按完返回，再用鍵盤 Tab 到「跳到主要內容」按 Enter。
- 兩個都跟「沒按返回」對照。
- 輸出：`item-tap-*.png`、`results.json`。

#### `m13-select.mjs`：道具清單「誰能用」篩選＋按返回（只適用 v0.35～v0.54）

```bash
node scripts/verify/m13-select.mjs <輸出> <網址> [埠=9361]
```

- **v0.55 起不能用**：「誰能用」下拉換成「〇〇能用」「現在就能穿」標籤按鈕，這支找不到下拉選單、會卡在等選項再出錯。
  同一件事（按「〇〇能用」標籤 → 離開再返回 → 篩選還在、清單一樣、捲回原位）改跑 `npm run verify:db` 的 M13（`VERIFY_ONLY=M13`）。
- 選「狂戰士能用的」→ 捲到中間 → 頁首「查資料」→ 返回：篩選還在、清單一樣、捲回原位、直接跳。
- 這是舊查資料頁驗收的 M13 改成下拉選單的版本。
- 輸出：`m13-after-back.png`、`results.json`。
- v0.39 加了捲到底自動載入以後，捲到中間就會多載，`sameList` 會是 false（返回後 180 筆、選完時 60 筆）。
  看 `filterKept`、`positionOk`、`distinctOnItems` 就好。

#### `navtop2.mjs`：從長頁點「我的路線」，首頁有沒有回到頂端（v0.34，PR #45）

```bash
node scripts/verify/navtop2.mjs <輸出> <埠> <網址>
```

- 三個參數都要給，埠在網址前面。
- 任務頁捲到底 → 頁首「我的路線」。A 照常、B 關掉捲動錨定（`overflow-anchor: none`）、C 首頁資料先載過。
- 輸出：`results.json`，console 每個情境一行。

#### `chart.mjs`：按返回的改前／改後對照圖（v0.40）

```bash
node scripts/verify/chart.mjs <輸出> <改前網址> <改後網址> [埠=9370]
```

- 任務頁捲到底 → 頁首「我的路線」→ 按返回，逐格記 scrollY 加上按下去 0.12 秒的截圖，畫成一張圖。
- 輸出：`compare.png`、`compare.html`、`series.json`、`before-0.12s.png`、`after-0.12s.png`。
- 圖的標題跟圖例寫死 v0.40 那次（「改前（v0.42）」「改後（v0.40）」），拿來比別的要先改字。

#### `harness.mjs`：上面幾支共用的無頭 Chrome 工具

crossdoc、after-back、chart、m13-select、navtop2 用它：開 Chrome、`navigate`、`traverse(-1)`（等於按瀏覽器的返回）、
`loadOnce`（返回快取還原的頁面沒有 load 事件，最多等 8 秒）、`shot`、頁面裡的 `__waitFor`／`__settle`／`__sampleFrames`。

### 邊框顏色（v0.41）

#### `border-probe.mjs`：改之前先模擬

```bash
node scripts/verify/border-probe.mjs <輸出> [網址] [--only=狀態,…] [--variants=m-light,d-dark] [--nocrop]
```

- 同一次載入裡用 CSSOM 模擬「`*` 的 border-color 移進 `@layer base`」，跟現況逐元素比對邊框、外框、圓角。
- 34 種頁面狀態 × `m-light`／`m-dark`／`d-light`／`d-dark`（手機／桌機 × 白天／夜晚）。
- 模式 `B` 只改邊框，`BF` 連 `:focus-visible` 一起改。
- 輸出：`report.json`、`crops/<狀態>__<變體>__<模式>__<編號>__before|after.png`。

#### `border-gallery.mjs`：對照頁的截圖（模擬）

```bash
node scripts/verify/border-gallery.mjs <輸出> [網址] [--only=項目,…] [--variants=…]
```

- 每個項目截「現在」「只改邊框」「改後」三張。
- 輸出：`img/<項目>__<變體>__<before|B|BF>.webp`、`manifest.json`。用 `--only` 重截時會保留其他項。

#### `border-compare.mjs`：兩個真站逐元素比對（驗收用）

```bash
node scripts/verify/border-compare.mjs <輸出> <改前網址> <改後網址> [--only=狀態,…] [--variants=…]
```

- 不靠模擬，改前站、改後站各載一次，逐元素比對。
- 全部跑約 20 分鐘，可以用 `--only` 拆三支平行跑（輸出資料夾要分開）。
- 輸出：`report.json`，接著用 `analyze.mjs` 分類。

#### `border-gallery-real.mjs`：兩個真站同一塊各截一張（驗收用）

```bash
node scripts/verify/border-gallery-real.mjs <輸出> <改前網址> <改後網址> [--only=項目,…] [--variants=…]
```

- 輸出：`img/<項目>__<變體>__before|after.webp`、`manifest.json`。

#### `analyze.mjs`：把 report.json 分類

```bash
node scripts/verify/analyze.mjs <report.json> [模式，預設 B]
```

- 吃 border-probe 或 border-compare 的 `report.json`，列出每一類變了幾個元素、出現在哪些頁、改前改後的顏色。
  分不進去的列成「其他」。結果只印在 console。

### 查資料頁卡片

#### `card-shot.mjs`：截怪物卡的屬性抗性（v0.43）

```bash
node scripts/verify/card-shot.mjs <輸出> <檔名前綴> <網址> [<網址> …]
```

- 網址要帶 `?id=`，例如 `/db/monsters?id=130100`。手機 390 寬、桌機 1280 寬各開一次。
- 等「屬性抗性」區塊出現，抓 chip 的文字跟顏色，把卡片捲到固定頁首下面再截。
- 輸出：`<前綴>-<id>-mobile.png`、`<前綴>-<id>-desktop.png`，console 印 JSON。
- v0.39 起長卡片頂端有一條黏著的「收起」列，截圖頂端的怪名會被它蓋住一點。chip 的文字跟顏色不受影響。

### 首頁裝備卡

#### `gear-source-shot.mjs`：武器、卷軸「去哪拿」截圖，可以把瀏覽器時間調到 10/15 之後（v0.66）

```bash
AT=2026-10-16T10:00:00+08:00 node scripts/verify/gear-source-shot.mjs <輸出> <網址> 400:25,100:35,210:45
```

- 第三個參數是要看的角色，`職業代碼:等級`，逗號分隔（400 一轉盜賊、100 劍士、210 火毒巫師）。
  手機 390 寬，每個角色另外開一次首頁（先清 localStorage、sessionStorage，再放 `ms-profile`）。
- `AT`：瀏覽器時鐘調到這個時間（ISO）；不給就用真的時間。調到 10/15 開機之後，看的就是開放後的推薦。
  v0.61 起開放後也先推舊地區的來源：一轉盜賊 25 等狼牙「墮落城市的後街吉姆合成」、劍士 35 等綠蛇刀「小幽靈會掉」、
  火毒巫師 45 等黃色雨傘「青螃蟹會掉」（v0.61 以前，開放後會變成冰原雪域斯考特的店、雲彩公園的月光精靈）。
- 輸出：`<職業>-<等級>.png`（裝備卡從頂端截到武器那塊）、`<職業>-<等級>-route.png`（升級路線「你在這」那一段的「裝備」，
  沒展開會自己點開）、`results.json`；console 印主推武器、去哪拿、路線每一列的字。
- 改前／改後：同一個 `AT` 各跑一次改前、改後的網址（例如正式機 vs 測試機），兩邊的字直接比。

#### `build-variants-shot.mjs`：第二套點法（全幸、裝備法）各角色截圖＋實際點切換、鍵盤、對比（v0.75，v0.76 擴充）

```bash
node scripts/verify/build-variants-shot.mjs <輸出> <網址> [職業:等級:點法,…]
```

- 第三個參數不給就跑預設 11 個：
  `410:35:,410:35:全幸,410:25:全幸,411:80:全幸,420:35:全幸,421:80:全幸,210:50:,210:50:全智+,210:50:裝備法+,200:10:裝備法,110:35:`
  （刺客 35 一般／全幸、刺客 25 全幸、暗殺者 80 全幸、俠盜 35 全幸、神偷 80 全幸、火毒 50 沒選／全智／裝備法、法師 10 裝備法、狂戰士 35）。
  `點法` 空白＝沒選（主推）；後面加 `+`（例：`210:50:裝備法+`）會先點「看全部」再截，看得到點法說明跟玩家提醒。
  每個角色先開同網域的 `/brand-emblem.png` 清 localStorage，再放 `ms-profile` 跟 `ms-build`（`{"400":"全幸"}`，鍵是一轉職業代碼；
  寫主推的名字＝跟沒選一樣），然後開首頁（v0.76 以前先開整頁 `/about`，本機 dev 在 CPU 吃滿時會拖到載入逾時）。
- 點法按鈕 v0.76 起是 `[role="radiogroup"][aria-label="點法"]` 裡的 `[role="radio"]`，選中看 `aria-checked`（之前是 `aria-pressed`）。
  每張卡記 `tabs`（文字、`checked`、`tabIndex`）、`tabText`（按鈕下那行「全幸：…」）、四格、每一區的字。
  展開的法師卡會比 2400 高：暫時把視窗拉到放得下再截（`grown` 記拉到多高，console 會講）。
  截圖前先等卡片、路線那塊裡的圖載完（next/image 預設 lazy，CPU 吃滿時會截到空格），15 秒還沒出來的張數記在 `missingImages`。
- 有點法標籤的角色另外截升級路線「你在這」那一段的「裝備」（沒展開會自己點開），字記在 `route`（段落、每一列）：
  要跟著選的點法換，例如刺客 35 那段（Lv.30–40）全幸是青銅指虎、多一列套服敏捷卷軸，一般點法是鋰礦鬥拳、35 等換銀守護拳套。
- 「click」：刺客 35 沒選 → 點「全幸」→ 重新整理 → 點回「一般點法」，印每一步的標籤、四格、`ms-build`。
  對的結果：全幸亮、`{"400":"全幸"}` → 重新整理還是全幸 → `{}`。
- 「keyboard」：刺客 35 沒選，焦點放在選中那顆，用 DevTools `Input.dispatchKeyEvent` 送右方向鍵兩次。
  對的結果：第一次選中「全幸」、焦點跟過去、Tab 只停「全幸」、`ms-build` 的 400 是全幸；第二次繞回「一般點法」、400 拿掉。console 印 OK／不對。
- 「contrast」：刺客 25 全幸「要湊的敏捷裝備」那一塊，每個有直接文字的元素算字色跟實際背景的對比（WCAG 相對亮度）。
  背景從 `<html>` 一路往下疊（不透明的蓋掉、半透明的跟下層混、`opacity` 照群組合成算），顏色畫在 canvas 上讀回來，oklch 也認得；
  沒算背景圖跟 backdrop-filter。記最低 5 個（字、字色、背景、比值、字級），最低值低於 4.5 印 WARN。只量白天主題。
  2026-10-08 實測 WARN：出處標籤「玩家攻略・台服實測」2.31、小標「要湊的敏捷裝備」2.68、橘色「敏捷 +5」「敏捷 +3」3.33；
  「Lv.30 起」那幾列（深咖啡色）5.34 以上。前兩個是各卡共用的樣式，橘色粗體跟衝卷的「100%」同一個色。
- 輸出：`<職業>-<等級>-<點法>.png`（整張卡，視窗開 2400 高、截圖不含固定頁首）、`route-<職業>-<等級>-<點法>.png`、
  `click-after-reload.png`、`results.json`（上面這些，加 `keyboard`、`contrast`、console 錯誤／警告）。`WIDTH=360` 看安卓換行；`AT` 同 gear-source-shot。
- 預設埠 9371。本機 dev server（已編譯過）跑 11 個角色＋三段實測 2026-10-08 約 5 分鐘（284 秒，那時 CPU 被別的程式吃滿；
  兩個角色加三段約 2 分鐘）。測試機還沒量（v0.75 那版 8 個角色約 40 秒）。

### 沒收進來的

- `db-verify.mjs`：已被 `scripts/verify-db.mjs`（`npm run verify:db`）取代。M1–M19、D1–D3 都在，還多了 N1–N13、D4。
- `back-frames.mjs`：用頁面裡的 `history.back()` 量，量法不對。它量的東西 `back-all.mjs` 跟 `verify-db.mjs` 的 M8 都有。

## 已知的坑

- **Claude 的瀏覽器窗格常是隱藏的**：rAF 完全不跑、平滑捲動不播、按返回不還原位置、`setTimeout` 被節流。
  在那裡看到的不算數，要量就用這裡的無頭腳本（無頭頁面算看得見，動畫照跑）。
- **站內換頁要在頁面裡點連結**（`a.click()`）。`Page.navigate` 是整頁重載，這次瀏覽載過的資料全沒了。
- **按返回／下一頁用 `Page.navigateToHistoryEntry`**（`harness.mjs` 的 `traverse`），等於按瀏覽器的返回鍵。
  不要用頁面裡的 `history.back()`。
- **「第一格」看 rAF 逐格紀錄**（畫出來前那一格）加 MutationObserver（DOM 每次變動，沒畫出來也記），兩個都要看。
  screencast 的時間戳跟頁面的 `Date.now` 差約 100 毫秒，只能當畫面順序看。
- **取樣要在畫完之後**（rAF 之後再排 `setTimeout`），不然會記到沒畫出來的那一格。
- **調瀏覽器時鐘**：用 `Page.addScriptToEvaluateOnNewDocument` 把頁面的 `Date` 換成位移版
  （`class extends Date`，只改 `now()` 跟無參數建構），計時器照真實時間跑。見 `first-frame.mjs` 的 `clockAt`。
  dev 模式整頁載入加載資料要 10 秒上下，時間要留足。
- **注入腳本跑的時候 `<html>` 還沒建好**（`document.documentElement` 是 null），直接設樣式會靜靜失敗。
  要用 MutationObserver 等它出現再設，見 `crossdoc.mjs` 的 `EARLY_AUTO`。
- **等畫面出現用 MutationObserver**，不要用 `setTimeout` 輪詢。
- **收尾的 `Browser.close` 要設等待上限**：Chrome 有時不回應就把連線斷掉，`await` 永遠等不到，
  node 會以 exit 13 提早結束，後面的結果就沒寫出來。這裡的腳本都改成最多等 2 秒（`Promise.race`），新寫的照抄。
  Windows 上 `chrome.kill()` 之後 Chrome 有時還活著，所以腳本最後要 `process.exit(0)`。
- **有些載入沒有 load 事件**：返回快取還原的頁面沒有，等待要設逾時（`harness.mjs` 的 `loadOnce`）。
  同一頁只換 `#` 的 `Page.navigate` 也沒有，要先跳 `about:blank`（border-* 的 `load`）。
- **桌機無頭量不到慢手機的閃**：用 `Emulation.setCPUThrottlingRate` 調慢 4～6 倍（home-first-frame 的 A4／A6）。
- **頁首按鈕有 0.15 秒變色動畫**，截圖裡舊的那顆還是橘色不是 bug。
- **`captureBeyondViewport: true` 會把固定頁首畫進截圖範圍**，蓋住卡片頂端。
  改用 `false`，先把目標捲到頁首下面再截（card-shot）。
- **`Page.captureScreenshot` 的 `clip` 是整頁座標**：`getBoundingClientRect()` 量到的視窗座標要加上 `scrollX`／`scrollY`，
  不然截到的是頁面最上面那一段（全空白）。**高度是負的 clip 會讓它一直不回**，整支腳本卡死不報錯——
  捲動還沒到位就量（全站 `html` 是平滑捲動）最容易算出負的。量位置前先把 `html` 設 `scroll-behavior: auto !important`
  再跳過去，DevTools 呼叫也要設等待上限（gear-source-shot 的 `send` 每個最多 60 秒）。
- **剛開的 Chrome 停在 `about:blank`，再 `Page.navigate` 到 `about:blank` 不會有 load 事件**，沒設逾時會一直等下去。
  第一頁直接導到要量的網址。
- **手機觸控點長頁面底部的輸入框可能點不到**：點完檢查 `activeElement`，沒點中就 `el.focus()`（border-* 的 `tap`）。
- **改前／改後要用每個 commit 固定的部署網址**，不要拿 dev 測試機當改前（它一小時會被合好幾次）。
  `gh api "repos/clarkher/maplestory-tool/deployments?sha=<完整 sha>"` 拿 id，
  再看 `deployments/<id>/statuses` 的 `environment_url`。
  舊部署大約一小時就會被收掉（410），改前要趁剛合併時量。分支名太長、分支預覽網址被截斷時也用這招。
- **寫死的資料會過期**：角色（狂戰士 45 是 `{ level: 45, job: 110 }`）、搜尋字、10/15 日期、頁面上的字
  （「我的路線」「查資料」）。產品或遊戲資料改了對不上，就要跟著改。
