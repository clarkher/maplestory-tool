# 野王計時 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新頁 `/plan/boss`「野王計時」：記野王打死的頻道，排出「下一個去這裡」，可開隊友房間同步，匿名回收重生間隔。

**Architecture:** 純函式（`src/lib/boss/`）算狀態、排序、提醒、間隔；前端紀錄存 localStorage；房間與間隔走 Next API route ＋既有 Neon（`getSql`）。頁面是 client component，版面照候選圖 B。

**Tech Stack:** Next 16 App Router、React、Tailwind（站上 CSS 變數）、vitest、`@neondatabase/serverless`。

**Spec:** `docs/superpowers/specs/2026-10-29-boss-timer-design.md`

## Global Constraints

- 全部使用者可見文字繁體中文；禁 emoji 與 icon set（狀態用文字）；寫完掃 U+2300–23FF、U+25A0–25FF、emoji。
- 字色用站上變數（`--ink`、`--ink-soft`、`--gold`、`--leaf`、`--maple`、`--on-accent`），按鈕字用 `--on-accent` 不寫死白字（AA 規則）。
- 狀態文字照抄：「還要 N 分」「可能出了」「一定出了」「打死 N 分了」「沒王 N 分前」「沒記錄」「下一個去這裡」「記一筆」「剛打死」「沒王」「有記錄的頻道（N）」「看全部 60 頻」。
- 伺服器只有兩台：雪吉拉、菇菇寶貝；頻道 1～60。
- 紀錄超過 12 小時不顯示；提醒在 min 前 3 分鐘；房間輪詢 20 秒、分頁看不見就停；房間 24 小時沒人記失效；寫入上限每個位址每分鐘 30 次送出（每次最多 100 筆）。
- 回收間隔：前後兩筆都是 kill、間隔 10 分鐘～6 小時才送；20 筆以上才顯示「本站玩家回報：N 筆，中位數 X 分」，兩台伺服器合算。
- 資料庫只 CREATE／ALTER／INSERT（presence 用 INSERT … ON CONFLICT），不跑 DELETE；過期用查詢過濾。
- 沒設 `DATABASE_URL`：房間按鈕寫「房間功能還沒開」，個人模式照用。
- 測試：`node ../../../node_modules/vitest/vitest.mjs run src/lib/boss`（worktree 沒自己的 node_modules）。

## Review Focus

1. 同一頻道連點兩次「剛打死」（手滑）→ 間隔 < 10 分不送；排序用最新那筆。→ Task 2 測試 `ignores double tap`。
2. 補記「幾分鐘前打死」的時間比現有最新那筆還早 → 不蓋掉較新的那筆。→ Task 1 測試 `backfill older than latest does not win`。
3. 電腦時鐘比伺服器快／慢幾分鐘、送來的 at 在未來 → 伺服器拒收超過現在 5 分鐘的；畫面上負的經過時間當 0。→ Task 1 `future at clamps to 0`、Task 4 `rejects at > now+5min`。
4. 輸入框打 0、61、空白、「12頻」→ 不記，提示「頻道是 1～60」。→ Task 6 `parseChannel`。
5. 房間代碼打小寫或混了看錯的字（o→0）→ 轉大寫、不在字母表就提示「代碼不對」。→ Task 3 `normalizes lowercase`。

---

### Task 1: 重生資料＋狀態計算

**Files:**
- Create: `data/boss/respawn.json`、`src/lib/boss/types.ts`、`src/lib/boss/state.ts`
- Test: `src/lib/boss/__tests__/state.test.ts`

**Interfaces:**
- Produces:
  - `type ServerKey = "xuejila" | "gugu"`；`SERVERS: { key: ServerKey; name: string }[]`（雪吉拉、菇菇寶貝）
  - `type BossDef = { id: number; name: string; maps: string[]; min: number | null; max: number | null; samples: number; confidence: "高" | "中" | null; note?: string; sources: string[] }`；`BOSSES: BossDef[]`（照 spec 表的順序，從 respawn.json 讀）
  - `type BossEvent = { id: string; server: ServerKey; boss: number; ch: number; kind: "kill" | "empty"; at: number } | { id: string; server: ServerKey; boss: number; ch: number; kind: "retract"; target: string; at: number }`
  - `type ChannelState = { ch: number; kind: "none" | "wait" | "maybe" | "sure" | "since" | "empty"; minutes: number; label: string; event?: BossEvent }`
  - `latestByChannel(events: BossEvent[], server: ServerKey, boss: number, now: number): Map<number, BossEvent>`
  - `channelState(ch: number, latest: BossEvent | undefined, boss: BossDef, now: number): ChannelState`
  - `rankNext(states: ChannelState[]): ChannelState[]`（只含有紀錄的）
  - `EXPIRE_MS = 12 * 3600_000`

respawn.json 欄位照 BossDef（`name` 中文、`maps` 中文地圖名陣列），數值照 spec「重生時間」表；殭屍猴王、沼澤巨鱷 `note: "兩張圖算同一隻，未證實"`；巨居蟹 `confidence: "中"`；sources 用 `docs/research/2026-10-29-boss-timer.md` 列的網址。

- [ ] **Step 1: 寫失敗測試**（蘑菇王 min 45 max 60；紅寶王 45/45；艾利傑 null）
  - `wait below min`：打死 30 分 → `{kind:"wait", label:"還要 15 分"}`；打死 44.2 分 → `"還要 1 分"`（進位）
  - `maybe at min and max`：45 分、60 分都是 `"可能出了"`；60.1 分 `"一定出了"`
  - `fixed respawn`：紅寶王 45 分 `"可能出了"`、45.5 分 `"一定出了"`
  - `no prediction`：艾利傑 37.9 分 → `{kind:"since", label:"打死 37 分了"}`
  - `empty`：沒王 5.4 分前 → `"沒王 5 分前"`；沒紀錄 → `{kind:"none", label:"沒記錄"}`
  - `expired after 12h`：12 小時又 1 秒前的紀錄不在 `latestByChannel`
  - `retract removes target`：kill 後 retract 它 → 該頻道回到前一筆（或沒紀錄）
  - `backfill older than latest does not win`：先 kill at=10:00，再補記 kill at=9:30 → 最新是 10:00；同 at 看陣列先後（後面的贏）
  - `future at clamps to 0`：at 比 now 晚 2 分 → minutes 0、`"還要 45 分"`
  - `rankNext order`：sure（打死久的先）→ maybe（久的先）→ wait（剩少的先）→ since（久的先）→ empty（久的先）；none 不出現
- [ ] **Step 2:** 跑 `node ../../../node_modules/vitest/vitest.mjs run src/lib/boss` → FAIL（模組不存在）
- [ ] **Step 3:** 實作上面 Interfaces（minutes 用經過分鐘，wait 的 N＝`Math.ceil(min - t)`，since／empty 的 N＝`Math.floor(t)`）
- [ ] **Step 4:** 跑測試 → PASS
- [ ] **Step 5:** commit `v1.18 (1/7): 野王重生資料與頻道狀態計算`

### Task 2: 提醒與回收間隔

**Files:**
- Create: `src/lib/boss/remind.ts`、`src/lib/boss/interval.ts`
- Test: `src/lib/boss/__tests__/remind.test.ts`、`src/lib/boss/__tests__/interval.test.ts`

**Interfaces:**
- Consumes: Task 1 全部
- Produces:
  - `dueReminders(events: BossEvent[], server: ServerKey, now: number, fired: Set<string>): { eventId: string; boss: BossDef; ch: number }[]`——有 min 的王、目前最新那筆是 kill、`now >= at + (min-3) 分`、還沒超過 max、`fired` 沒有
  - `REMIND_BEFORE_MIN = 3`
  - `intervalOnKill(prev: BossEvent | undefined, next: BossEvent): number | null`（秒；兩筆都 kill、同伺服器同王同頻道、10 分～6 小時）
  - `medianMinutes(seconds: number[]): number`（四捨五入到整數分）
- [ ] **Step 1: 寫失敗測試**
  - `remind at min minus 3`：蘑菇王打死 41.9 分 → 空；42 分 → 一筆；61 分 → 空（已過 max）；`fired` 含它 → 空；艾利傑永遠空；最新是 empty 的頻道不提醒
  - `interval basic`：kill 10:00 → kill 10:51 → 3060
  - `ignores double tap`：間隔 2 分 → null；7 小時 → null；前一筆是 empty → null；不同頻道 → null
  - `median`：[2700,2760,3600] → 46；偶數個取中間兩個平均
- [ ] **Step 2:** 跑測試 → FAIL
- [ ] **Step 3:** 實作
- [ ] **Step 4:** 跑測試 → PASS
- [ ] **Step 5:** commit `v1.18 (2/7): 野王提醒時間與回收間隔判斷`

### Task 3: 房間代碼＋前端存檔

**Files:**
- Create: `src/lib/boss/room-code.ts`、`src/lib/boss/store.ts`
- Test: `src/lib/boss/__tests__/room-code.test.ts`、`src/lib/boss/__tests__/store.test.ts`

**Interfaces:**
- Produces:
  - `ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"`；`newRoomCode(random?: () => number): string`（6 碼）；`normalizeRoomCode(input: string): string | null`（去空白、轉大寫、長度 6、全在字母表，否則 null）
  - `type BossPrefs = { server: ServerKey; boss: number; room: string | null; remind: boolean; device: string }`
  - `loadEvents(storage: Storage, now: number): BossEvent[]`（壞 JSON 回 []、丟掉超過 12 小時的）；`saveEvents(storage: Storage, events: BossEvent[]): void`；`loadPrefs(storage: Storage): BossPrefs`（預設 xuejila、BOSSES[0].id、null、false、新 uuid）；`savePrefs(storage, prefs)`
  - 鍵：`ms-boss:events`、`ms-boss:prefs`；讀寫都包 try/catch
- [ ] **Step 1: 寫失敗測試**：`newRoomCode` 6 碼且只含字母表；`normalizes lowercase`（`" k7q2ab "` → `"K7Q2AB"`、含 `O` 或 `0` 或長度 5 → null）；`loadEvents` 壞 JSON 回 []、過期丟掉；prefs 存讀一致（用簡單的 Map 假 Storage）
- [ ] **Step 2:** 跑 → FAIL；**Step 3:** 實作；**Step 4:** 跑 → PASS
- [ ] **Step 5:** commit `v1.18 (3/7): 房間代碼與瀏覽器存檔`

### Task 4: 伺服器檢查規則＋資料表

**Files:**
- Create: `src/lib/boss/server/rules.ts`、`src/lib/boss/server/db.ts`
- Test: `src/lib/boss/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: Task 1 型別、Task 3 `normalizeRoomCode`、`src/lib/speed/server/db.ts` 的 `getSql`、`speedEnv`
- Produces:
  - `checkEvent(raw: unknown, now: number): BossEvent | null`——id 1～40 字英數與 `-`；server 兩個之一；boss 在 BOSSES；ch 整數 1～60；kind 三種；at 在 `[now-12h, now+5min]`；retract 要有 target
  - `checkEventBatch(raw: unknown, now: number): BossEvent[] | null`（陣列 1～100 筆，任一筆不合就整批 null）
  - `checkInterval(raw: unknown): { server: ServerKey; boss: number; seconds: number } | null`（seconds 600～21600 整數）
  - `BOSS_WRITES_PER_MIN = 30`；`ROOM_TTL_MS = 24 * 3600_000`；`ONLINE_MS = 120_000`；`MIN_REPORT_SAMPLES = 20`
  - `ensureBossSchema(sql): Promise<void>`——一個 transaction 建：`boss_rooms(code text PRIMARY KEY, env text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`、`boss_events(seq bigserial PRIMARY KEY, room text NOT NULL, env text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), ip_hash text NOT NULL, eid text NOT NULL, server text NOT NULL, boss integer NOT NULL, ch integer NOT NULL, kind text NOT NULL, at timestamptz NOT NULL, target text)`、索引 `(room, seq)`、`(ip_hash, created_at)`、`boss_presence(room text, device text, seen_at timestamptz NOT NULL, PRIMARY KEY (room, device))`、`boss_intervals(id bigserial PRIMARY KEY, env text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), ip_hash text NOT NULL, server text NOT NULL, boss integer NOT NULL, seconds integer NOT NULL)`
  - `bossIpHash(request: Request): string`（照 speed 的作法：SALT 用 `process.env.SPEED_SALT ?? "maplebook-speed"`、混 UTC 日期）
- [ ] **Step 1: 寫失敗測試**：合格事件通過；`rejects at > now+5min`、超過 12 小時前、ch 0／61／1.5、未知 boss、retract 沒 target、id 有空白 → null；批次 101 筆 → null；間隔 599、21601、小數 → null
- [ ] **Step 2:** 跑 → FAIL；**Step 3:** 實作；**Step 4:** 跑 → PASS
- [ ] **Step 5:** commit `v1.18 (4/7): 野王房間與間隔的檢查規則、資料表`

### Task 5: API routes

**Files:**
- Create: `src/app/api/boss/rooms/route.ts`、`src/app/api/boss/events/route.ts`、`src/app/api/boss/intervals/route.ts`

**Interfaces:**
- Consumes: Task 4 全部
- Produces（全部 `dynamic = "force-dynamic"`、只收 `application/json`、沒 DB 回 503 `{ok:false,error:"房間功能還沒開"}`、DB 錯回 500 不帶細節）：
  - `POST /api/boss/rooms` → `{ ok: true, code }`（撞號重抽最多 5 次）
  - `GET /api/boss/events?room=CODE&since=SEQ&device=ID` → `{ ok: true, events: BossEvent[], seq: number, online: number }`；房間不存在或 24 小時內沒有任何事件也不是 24 小時內建的 → 404 `{ok:false,error:"房間已失效"}`；同時 upsert presence；online＝2 分鐘內 seen 的 device 數
  - `POST /api/boss/events` body `{ room, device, events }` → `{ ok: true, seq }`；同 ip_hash 一分鐘內送出次數（以 `created_at` 不同的批次計：同一批 INSERT 同一個 now()）≥ 30 → 429 `{ok:false,error:"送太快了，等一下再記"}`
  - `POST /api/boss/intervals` body `{ server, boss, seconds }` → `{ ok: true }`（同樣限流）
  - `GET /api/boss/intervals` → `{ ok: true, stats: { [boss: string]: { n: number; median: number } } }`（只回 n ≥ 20 的；env 過濾）
- [ ] **Step 1:** 實作三支 route（規則都在 Task 4 測過，這裡是接線）
- [ ] **Step 2:** `node ../../../node_modules/typescript/bin/tsc --noEmit -p .` → 無錯
- [ ] **Step 3:** 本機 dev server（沒 DATABASE_URL）打 `curl -X POST -H "content-type: application/json" localhost:<埠>/api/boss/rooms` → 503「房間功能還沒開」
- [ ] **Step 4:** commit `v1.18 (5/7): 野王房間與間隔 API`

### Task 6: 頁面

**Files:**
- Create: `src/app/plan/boss/page.tsx`、`src/app/plan/boss/BossTimer.tsx`、`src/app/plan/boss/parts.tsx`、`src/lib/boss/input.ts`、`src/lib/boss/__tests__/input.test.ts`、`src/lib/boss/sound.ts`

**Interfaces:**
- Consumes: Task 1～3、Task 5 的 API
- Produces: `parseChannel(input: string): number | null`（全形數字轉半形、去「頻」字與空白，1～60 整數才回）

版面（照候選 B，`scratchpad` 的 B-light.png）：
1. `h1` 野王計時；說明「打死就按一下，幫你算哪個頻道快出了。重生時間是台服玩家實測。」
2. 伺服器兩顆（`FilterTag` 或同款 36px 標籤，aria-pressed）
3. 隊友房間列（`--sky-wash` 底）：沒在房間 → 「隊友房間」＋「開房間」＋「輸入代碼」；在房間 → 「隊友房間 XXXXXX・N 人在線」＋「分享代碼」（複製 `/plan/boss?room=XXXXXX`）＋「離開」；503 時 → 「房間功能還沒開」
4. 王的橫向卡（可左右滑；圖 `/assets/monster_frames/<id>.png`、名字、`45～60 分`／`約 45 分`／`還沒有台服實測`），選中的橘框
5. 選中王的說明：地圖、「台服玩家實測，N 筆」（可展開出處連結）、note、本站回報行（≥20 筆）
6. 「下一個去這裡」大卡（第一名狀態色邊框、`40px` 頻道號、狀態＋「打死 N 分了」、下一行「再來是 …」最多 4 個）；沒紀錄 → 「還沒有紀錄：打死王時輸入頻道，按「剛打死」。」；沒實測的王 → 「這隻還沒有台服實測，只能幫你記打死多久了」
7. 「記一筆」：輸入框（`inputMode="numeric"`、placeholder「頻道 1～60」）＋「剛打死」（實心 `--maple`）＋「沒王」；下面「補記：幾分鐘前打死」展開成分鐘輸入；不合法提示「頻道是 1～60」；記完 toast「已記 22 頻 剛打死・復原」5 秒
8. 「有記錄的頻道（N）」清單：每列「22 頻」＋狀態膠囊＋「打死 N 分前」；點一列展開「剛打死」「沒王」「刪掉」；「看全部 60 頻」展開 5 欄 60 格（格內頻道號＋狀態字）
9. 提醒開關「快出時提醒我（響一聲＋通知）」：打開時 `Notification.requestPermission()`；每 15 秒跑 `dueReminders`，有就 `playBeep()`（Web Audio 兩聲 880Hz 0.15 秒）＋`new Notification("蘑菇王 22 頻快出了", { body: "再 3 分鐘進入重生時間" })`，fired 記在記憶體
10. 狀態每 15 秒重算（`setInterval`），分頁回到前景立刻重算

資料流：events 存 localStorage（每次改動 `saveEvents`）；在房間時記一筆先寫本機再 POST，失敗不擋本機、顯示「沒送到隊友，等一下會再送」並在下次輪詢前重送；輪詢 GET since，新事件合進本機（id 去重）；加入房間時把本機這台伺服器 12 小時內的事件一次 POST；網址有 `?room=` 自動加入。記 kill 時用 `intervalOnKill(記之前該頻道最新那筆, 新事件)`，有值就 POST `/api/boss/intervals`（不管有沒有房間；房間裡別人送來的事件不觸發）。

- [ ] **Step 1: 寫失敗測試** `parseChannel`：`"22"`→22、`"２２"`→22、`"12頻"`→12、`" 7 "`→7、`"0"`、`"61"`、`""`、`"1.5"`、`"abc"` → null
- [ ] **Step 2:** 跑 → FAIL；**Step 3:** 實作 input.ts；**Step 4:** 跑 → PASS
- [ ] **Step 5:** 實作 page.tsx（metadata：title「野王計時｜打死就記，算哪個頻道快出了」、description、canonical `/plan/boss`）、BossTimer.tsx、parts.tsx、sound.ts
- [ ] **Step 6:** tsc 無錯；emoji 掃描無結果
- [ ] **Step 7:** commit `v1.18 (6/7): 野王計時頁面`

### Task 7: 入口、文件、全套測試

**Files:**
- Modify: `src/lib/nav.ts`（`/plan/boss` 那顆排在「帶我去」前、`match: ["/plan/boss"]`，要排在查資料前面）、`src/app/db/page.tsx`（工具清單加 `{ href: "/plan/boss", title: "野王計時", lead: "打死就記，算哪個頻道快出了，可以開房間跟隊友同步", image: "/assets/monster_frames/6130101.png" }`）、`src/app/sitemap.ts`（`/plan/boss` priority 0.8）、`README.md`（加一段野王計時：資料來源、為什麼不用客戶端 mobTime、房間與間隔）
- 若有測 nav 的測試（`grep -rn "NAV" src --include=*.test.ts`）一併更新
- [ ] **Step 1:** 改上面四個檔
- [ ] **Step 2:** `node ../../../node_modules/vitest/vitest.mjs run` 全綠；tsc 無錯
- [ ] **Step 3:** 手機 360 寬看導覽列：「查資料」還在畫面內嗎？被擠出去 → 停下來回報（spec：不自己改名）
- [ ] **Step 4:** commit `v1.18 (7/7): 導覽列、查資料入口、README 加野王計時`
