# 官方公告 → 水影片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新官方公告（活動／商城／改版）自動做成 16:9 正片＋9:16 Shorts，放 GitHub prerelease，並在追蹤 issue 留言請使用者審。

**Architecture:** `pipeline/video/` 一組純函式 lib（挑公告、抽內文、對來源、組 HyperFrames 專案）＋三支有副作用的 lib（Azure LLM、Inworld TTS、GitHub）＋入口 `run.mjs`（CI）與 `make.mjs`（本機單支）。新 workflow `announce-video.yml` 在 announce-watch 跑完後接著跑。

**Tech Stack:** Node 22 ESM（`.mjs`，跟 `pipeline/announce` 同風格）、`node --test`、HyperFrames CLI 0.9.40（`npx hyperframes render`）、ffmpeg/ffprobe、Azure OpenAI（officialpmswedencentral：`gpt-5.4` 寫稿與讀圖、`gpt-4o-mini-transcribe` 驗音）、Inworld TTS（`inworld-tts-2`）。

**Spec:** `docs/superpowers/specs/2026-11-13-announce-video-design.md`（版面依據 `docs/superpowers/specs/2026-11-13-announce-video/s2-chosen.png`、`s2.html`）

## Global Constraints

- 繁體台灣用字；UI／片裡零 emoji、零廉價圖示；圖只用官方公告圖、站上 `public/avatar-showcase`、`public/brand-emblem.png`、`public/assets/map_renders`。
- 片裡任何數字、日期都要在「來源」（公告 HTML 文字＋官方圖抄字＋對到的站內頁文字）找得到，對不到整句拿掉。
- 不做片：標題含「例行維護／臨時維護／開機／關機／制裁」。做片：`classify()` 為 event／cash，或標題含「改版／更新」。
- 重試：每則最多 3 次；公告 startDate 超過 7 天不補做。
- prerelease tag 一律 `video-<bulletinId>`，絕不建 `v*` tag。
- 說明欄第一行站內連結帶 `?utm_source=youtube&utm_medium=video&utm_campaign=announce-<id>`。
- 聲音：Inworld voice `default-bwzn5blyrrl-d_slygqzww__clark_20260630`、model `inworld-tts-2`、speakingRate 1.2、deliveryMode STABLE、前綴 `[以台灣口音，親切自然的語氣] `。
- 金鑰只從環境變數讀（`AZURE_OPENAI_KEY`、`INWORLD_API_KEY`、`GH_TOKEN`），不印、不進 repo、不寫預設值。
- 正片 1920×1080、Shorts 1080×1920、30fps。

## Review Focus

1. 公告 HTML 只有圖沒有字（商城公告常見）→ 要靠讀圖拿到來源；讀圖失敗時不得產出沒來源的卡，應跳過並留言。→ Task 2、Task 6 測試。
2. 日期寫法不同（「11/19」「11月19日」「2026/11/19」）同一天要算對到來源。→ Task 3 測試。
3. 同一班排程同時有好幾則新公告 → 一則失敗不能害其他則不做、不能少記次數。→ Task 7 測試。
4. 旁白句子含英數（V002、10%）→ 驗音比對只比中文字＋數字，不因英文大小寫或全半形誤判。→ Task 5 測試。
5. prerelease 已存在（上次上傳到一半失敗）→ 重跑要覆蓋資產不報錯。→ Task 7 測試。

---

### Task 1: 挑公告與記狀態 `lib/pick.mjs`

**Files:** Create `pipeline/video/lib/pick.mjs`、Test `pipeline/video/lib/pick.test.mjs`

**Interfaces:**
- Consumes: `classify(title)` from `pipeline/announce/lib/bulletin.mjs`
- Produces:
  - `shouldMakeVideo(title: string): boolean`
  - `readVideoState(body: string): Map<string, {n: number, done: boolean}>`（註解格式 `<!-- video:84140=done,84087=2 -->`）
  - `writeVideoState(body: string, state: Map): string`（取代或附加這個註解，不動 `<!-- seen:... -->`）
  - `pendingVideos(rows: {bullentinId,title,startDate}[], state, now: number): rows`（要做、沒 done、n<3、startDate 在 7 天內，舊的先）

- [ ] Step 1: 寫測試：`shouldMakeVideo('【閃亮彗星】喵喵管家&軟綿綿雪兔')===true`、`('【2026 橘子週年慶｜Gama Island 探險】')===true`、`('新楓之谷：經典版 《1112(四)V002覺醒與突破例行維護開機公告》')===false`、`('…《1106(五) 商城臨時維護公告》')===false`、`('…遊戲異常行為制裁公告》')===false`、`('V003 改版內容預告')===true`；state 往返（write 後 read 相同、seen 註解原封不動）；pendingVideos 排除 done、n=3、8 天前的。
- [ ] Step 2: `node --test pipeline/video/lib/pick.test.mjs` → FAIL
- [ ] Step 3: 實作
- [ ] Step 4: 同指令 → PASS
- [ ] Step 5: commit `v2.22: 水影片挑公告與重試記錄`

### Task 2: 抓內文、抽字抽圖 `lib/detail.mjs`

**Files:** Create `pipeline/video/lib/detail.mjs`、Test `pipeline/video/lib/detail.test.mjs`、fixture `pipeline/video/lib/__fixtures__/84140.json`（真的 API 回應存檔）

**Interfaces:**
- Produces:
  - `fetchDetail(id: string, {fetcher}?): Promise<{id, title, startDate, html: string|null}>`：`POST https://maplestoryclassic.beanfun.com/api/Bulletin/BulletinDetail?pbid=<id>`，body `{"pbid":<id>}`，headers 同 `bulletin.mjs` 的 UA／Referer；`code!==1` 丟錯。
  - `extractContent(html: string|null): {text: string, images: string[]}`：去 tag、解 HTML entity、合併空白、去掉「注意事項」以下固定的法務段（開頭「此為機會中獎商品」「圖片與文案僅供參考」「詳細道具資訊請依遊戲中」的段落）；images 收 `<img src>` 的 https 網址，去重保序。

- [ ] Step 1: 測試：fixture 84140 → images 含 `https://tw.hicdn.beanfun.com/beanfun/WebImage/1793819119332.jpg`、text 含「喵喵管家」、不含「此為機會中獎商品」；`extractContent(null)` → `{text:'',images:[]}`；fetchDetail 用假 fetcher 回 `code:-2` → reject。
- [ ] Step 2: FAIL → Step 3 實作 → Step 4 PASS → Step 5 commit

### Task 3: 來源比對與站內頁 `lib/facts.mjs`、`lib/site.mjs`

**Files:** Create `pipeline/video/lib/facts.mjs`、`pipeline/video/lib/site.mjs`、Tests 各一

**Interfaces:**
- Produces:
  - `factTokens(s: string): string[]`：抽出日期（正規化成 `M/D`：「11/19」「11月19日」「2026/11/19」「11.19」都變 `11/19`）、時間（`HH:MM`）、其他數字（含小數、百分比、千分位去逗號）。
  - `grounded(sentence: string, sourceText: string): boolean`：sentence 的每個 token 都在 `factTokens(sourceText)` 裡。
  - `filterScript(script: Script, sourceText: string): {script: Script, dropped: string[]}`：cards、narration、shortsNarration、description 逐句過濾。
  - `isUsable(script): boolean`：cards ≥2 且 narration ≥4。
  - `matchSitePage(title: string, text: string, pages: {path,title,keywords,summary}[]): page|null`
  - `sitePages(): {path,title,keywords,summary}[]`：內建一張小表（楓葉商會→`/plan/leaf`；轉蛋／美容院／彗星／商城→`/plan/avatar`；活動→`/guides`；改版→`/updates`；首頁 `/` 當預設），summary 是那頁一兩句白話（寫死，不寫數字）。
  - `utmUrl(path: string, id: string): string` → `https://maplehelper.tw<path>?utm_source=youtube&utm_medium=video&utm_campaign=announce-<id>`
- `Script` 型別（JSDoc）：`{title, subtitle, ticker: string[], cards: {big, line}[], narration: string[], shortsNarration: string[], ytTitle, description, images: string[]}`

- [ ] Step 1: 測試：`factTokens('11月19日開跑，12/9 最後掉幣，機率 0.5%')` 含 `11/19`、`12/9`、`0.5%`；`grounded('11/19 開跑','活動 2026/11/19 起')===true`；`grounded('12/20 結束','活動 2026/11/19 起')===false`；沒數字的句子 `grounded` 為 true；filterScript 丟掉編造日期那句並列在 dropped；utmUrl 字串完全相等。
- [ ] Step 2–5: FAIL → 實作 → PASS → commit

### Task 4: Azure 寫稿與讀圖 `lib/llm.mjs`

**Files:** Create `pipeline/video/lib/llm.mjs`、Test `pipeline/video/lib/llm.test.mjs`（只測組 request 與解析，用假 fetcher）

**Interfaces:**
- Produces:
  - `ocrImage(url: string, {fetcher}?): Promise<string>`：Responses API `POST https://officialpmswedencentral.services.ai.azure.com/openai/v1/responses`，header `api-key`，model `gpt-5.4`，`store:false`，input 帶 `input_image` 網址＋指示「逐字抄出圖上所有中文、數字、日期，不解讀、不補字，沒有字回空字串」。
  - `writeScript({title, startDate, sourceText, site}, {fetcher}?): Promise<Script>`：同端點，`text.format` 用 JSON schema 強制 Script 欄位；prompt 寫死規則（每個數字日期只能抄來源、片頭標題 ≤10 字、卡片大字 ≤8 字、旁白 6～12 句每句 ≤28 字、Shorts 旁白 4～6 句、繁體台灣用字、白話、不寫內部術語、description 第一行留 `{{LINK}}` 讓程式換成 utmUrl）。
  - `transcribe(mp3Path: string): Promise<string>`：`https://officialpmswedencentral.openai.azure.com/openai/deployments/gpt-4o-mini-transcribe/audio/transcriptions?api-version=2025-03-01-preview`，multipart，`prompt`「以下是繁體中文（台灣用字）。」
- [ ] Step 1: 測試：假 fetcher 收到的 body 含 `store:false`、header 有 `api-key`、沒有 `Authorization`；writeScript 解析回傳 `output_text` JSON；回應缺欄位時 reject。
- [ ] Step 2–5: FAIL → 實作 → PASS → commit

### Task 5: 配音與驗音 `lib/voice.mjs`

**Files:** Create `pipeline/video/lib/voice.mjs`、Test `pipeline/video/lib/voice.test.mjs`

**Interfaces:**
- Consumes: `transcribe` (Task 4)
- Produces:
  - `synth(text: string, {fetcher}?): Promise<Buffer>`：`POST https://api.inworld.ai/tts/v1/voice`，`Authorization: Basic ${INWORLD_API_KEY}`，body 照 Global Constraints。
  - `heardOk(src: string, heard: string): boolean`：兩邊都只留中文字＋阿拉伯數字（全形轉半形）；長度比 0.80～1.25、沒有 ≥8 字重複片段。
  - `voiceLines(lines: string[], dir: string, {synth, transcribe, tries=3}): Promise<{file, text, sec}[]>`：每句最多 3 次，挑第一個 heardOk 的；3 次都不過丟錯「第 N 句配音不過：<句子>」。秒數用 ffprobe。
- [ ] Step 1: 測試：`heardOk('V002 開跑 10%','v002開跑10％')===true`；重複片段 false；長度比 0.5 false；voiceLines 用假 synth/transcribe，第 1 次聽錯第 2 次對 → 用第 2 次、synth 被叫 2 次。
- [ ] Step 2–5: FAIL → 實作 → PASS → commit

### Task 6: HyperFrames 快報版面 `pipeline/video/template/`＋`lib/compose.mjs`

**Files:** Create `pipeline/video/template/`（`main.html`、`shorts.html` 範本、`assets/fonts/NotoSansTC-Black.woff2`、`NotoSansTC-Bold.woff2`（OFL，從 Google Fonts 下載）、`assets/brand-emblem.png`）、`pipeline/video/lib/compose.mjs`、Test `compose.test.mjs`

**Interfaces:**
- Produces: `composeProject({script, voice: {file,text,sec}[], shortsVoice, images: string[] (本機檔), avatars: string[], date: 'MM/DD'}, outDir, layout: 'main'|'shorts'): {dir, durationSec}`
  - 場景：片頭（3 秒，照 s2：紅條「快報」、黃條「官方公告 MM/DD」、大標、副標、兩個角色、最下面 ticker）→ 每句旁白一個段落：前 N 句配卡片（大字跳出），中間配官方圖（慢推近），→ 片尾 3 秒「完整整理在 maplehelper.tw」。
  - 字幕：每句旁白一組，時間＝那句音檔的起訖；放 80% 安全框下緣。
  - 旁白 `<audio>` 一句一個（各有 id），時間接續，句間留 0.25 秒。
  - 遵守 HyperFrames contract（`.clip`、`data-start`/`data-duration`、一條 paused timeline、`window.__timelines`）。
- [ ] Step 1: 測試：三句旁白 2.0/3.0/1.5 秒 → durationSec = 3 + (2+3+1.5) + 0.25×3 + 3；產出 index.html 字幕 data-start 依序遞增；html 裡沒有 U+2300–23FF、U+25A0–25FF、U+1F300 以上字元。
- [ ] Step 2: FAIL → Step 3 實作 → Step 4 PASS
- [ ] Step 5: 本機用假音檔（ffmpeg 產靜音）跑 `npx hyperframes check --json` 零 error，`npx hyperframes render` 出 mp4，抽第 1 秒與中段截圖目測對照 s2-chosen.png
- [ ] Step 6: commit

### Task 7: 串起來＋交付 `make.mjs`、`run.mjs`、`lib/github.mjs`、workflow

**Files:** Create `pipeline/video/make.mjs`、`pipeline/video/run.mjs`、`pipeline/video/lib/github.mjs`、`.github/workflows/announce-video.yml`、Test `pipeline/video/lib/github.test.mjs`、`pipeline/video/run.test.mjs`；Modify `README.md`（排程總表加一行＋事件說明）

**Interfaces:**
- `make.mjs <bulletinId> [--out dir]`：fetchDetail → extractContent → 每張圖 ocrImage → sourceText = text＋抄字＋站內頁 summary → writeScript → filterScript → !isUsable 丟錯（訊息寫原因）→ voiceLines（正片、Shorts）→ composeProject×2 → render×2 → 片頭第 1.5 秒抽 `cover.png` → `youtube.txt`（ytTitle、空行、description 換好 utmUrl）。產物在 out dir：`main.mp4`、`shorts.mp4`、`cover.png`、`youtube.txt`。
- `lib/github.mjs`：`upsertRelease(id, title, files[], {call})`（tag `video-<id>`、`prerelease:true`、name `待審｜<title>`、`target_commitish` main；已存在就刪同名資產再上傳）→ 回 `{htmlUrl, assetUrls}`；`renderVideoComment({title, row, release})` → 留言字串（封面圖 markdown、標題、正片／Shorts 下載、「看完上傳到楓谷幫手頻道，標題說明欄在 youtube.txt」）；`renderSkipComment(row, reason)`。
- `run.mjs`：讀追蹤 issue（label「官方公告」）→ `fetchBulletins()` → `pendingVideos` → 逐則 try make＋upsertRelease＋留言、成功記 done；失敗 n+1，n 到 3 才留言 skip；最後一次 PATCH issue 內文（writeVideoState）。`DRY_RUN=true` 只印。`BULLETIN_ID` 有值時只做那則、不看 pending、不改 issue 狀態（給手動測試）。
- workflow：`on: workflow_run (workflows: ["官網公告追蹤"], types: [completed])` ＋ `workflow_dispatch (inputs: bulletin_id, dry_run)`；ubuntu-latest、timeout 40 分；裝 ffmpeg、`fonts-noto-cjk`；`permissions: contents: write, issues: write`；env 帶三把 secret；main 以外分支沒給 bulletin_id 就 dry-run。
- [ ] Step 1: 測試：renderVideoComment 含 `![封面](…cover.png)`、`video-84140`；upsertRelease 用假 call：已存在時先 DELETE 舊資產；run.mjs 用假依賴：三則中第二則 make 丟錯 → 第一、三則 done、第二則 n=1、只 PATCH 一次 issue。
- [ ] Step 2–4: FAIL → 實作 → PASS（`npm test` 全綠）
- [ ] Step 5: 加 Actions secrets：從 `~/.ai-keys.env` 讀值用 `gh secret set AZURE_OPENAI_KEY`、`INWORLD_API_KEY`（stdin 傳，不印）
- [ ] Step 6: 本機 `node pipeline/video/make.mjs 84140` 出片，自己看完、截圖
- [ ] Step 7: push 分支，`gh workflow run announce-video.yml --ref feat/v2.22-announce-video -f bulletin_id=84087` → 雲端出片、prerelease 建好、下載下來看；再跑 `-f bulletin_id=84192` 確認跳過原因
- [ ] Step 8: commit、開 PR → dev，三條 CI 綠後合併
