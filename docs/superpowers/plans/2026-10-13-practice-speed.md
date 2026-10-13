# 練功測速 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/plan/speed`「練功測速」：玩家分享遊戲視窗，瀏覽器自己認經驗、等級、職業、地圖、組隊人數，算 10 分鐘經驗跟升級還要多久，每段練功存進資料庫，每張圖有單練／組隊排行。

**Architecture:** 認畫面全在瀏覽器：`src/lib/speed/` 一組純函式（吃 RGBA 畫面、吐讀數），用使用者截圖當測試圖跑 vitest；擷取在 Worker 裡用 MediaStreamTrackProcessor 一秒讀一張。一段怎麼算是純函式狀態機（tracker）。存資料走 Next.js route handler → Neon Postgres（`@neondatabase/serverless`），建表在第一次呼叫時自動做（CREATE IF NOT EXISTS）。頁面是 client component，用站上現有的地圖、怪物、道具、經驗表資料。

**Tech Stack:** Next.js 16（app router、route handler）、React 19、TypeScript、Tailwind 4、vitest、`@neondatabase/serverless`（新，dependency）、`@napi-rs/canvas`（新，devDependency：測試讀 PNG、本機產字形樣板）。

**Spec:** `docs/superpowers/specs/2026-10-13-practice-speed-design.md`

## Global Constraints

- 全部 user-facing 文字繁體中文、零簡體；不放 emoji、不用 icon 套件（狀態用文字或 inline SVG）。寫 .ts/.tsx 前掃 emoji（含 U+2300–23FF、U+25A0–25FF）。
- 不准用假資料撐畫面：讀不到就照實寫「認不到」「排行還沒開」。
- commit message 開頭 `v0.95:`（這一輪的交付編號，2026-10-13 查過 origin/dev 最新是 v0.94，沒人用 v0.95）；結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 分支 `claude/maplestory-exp-calculator-84ca37`（已從 origin/dev 開、已 push），PR 進 `dev`，不碰 `main`。
- 不對資料庫跑 DELETE／UPDATE；建表只用 CREATE TABLE／INDEX IF NOT EXISTS。
- 測試：`npm test` 要過（pipeline node:test＋vitest）；`npm run build` 要過。
- 用字：數字一律 `formatNumber`（src/lib/format.ts）；按鈕字色用 `--on-accent`（記憶：全站小字對比 AA）。
- 驗收腳本放 `scripts/verify/`，用 `config.mjs` 的 `CHROME`、`chromePort`、`outDir`；這輪用埠 **9391**（README 裡沒人用）。
- 認畫面的基準：使用者 10/13 給的視窗模式截圖 1364×799（`src/lib/speed/__fixtures__/window-1364.png`）。在這張圖上：EXP 條 x 809–976、y 778–796（高 18）；文字列 y 766–774（上面 757、761 是兩條白線；「EXP」810–831、406947 在 839–874、「[」875–877、79.73 在 878–904、「%」905–912）；職業字 x 110–176、y 767–778；小地圖「地圖」橘色按鈕 x 82–118、y 39–50；街道名 y 63–73、地圖名 y 79–89；隊伍欄紅血條 x 1298–1360、y 570–575。
- 遊戲字型：狀態列（經驗、職業）跟 Windows 內建「微軟正黑體」(`C:/Windows/Fonts/msjh.ttc`) 對得上；客戶端還內嵌 Gulim／Dotum（韓文 Windows 字型）跟 Noto Sans SC，小地圖標題用哪套還沒驗（截圖是有損壓縮，小字糊掉）。

---

## 檔案

| 檔案 | 做什麼 |
|---|---|
| `src/lib/speed/frame.ts` | 畫面型別（RGBA）、取色、亮度、裁切範圍 |
| `src/lib/speed/ink.ts` | 一塊區域轉成「墨」（0～1）、找文字列、連通塊、縮成格子 |
| `src/lib/speed/glyphs.json` | 數字樣板（微軟正黑體，`npm run speed:glyphs` 產） |
| `src/lib/speed/glyphs.ts` | 認單一個字（0–9、[、]、%） |
| `src/lib/speed/status-bar.ts` | 找下方 HP／MP／EXP 三條 |
| `src/lib/speed/read-exp.ts` | 讀 EXP 那行、用經驗表驗證並反推等級 |
| `src/lib/speed/names.ts` | 名字樣板（職業、街道、地圖名）解析、整行比對排名 |
| `src/lib/speed/read-job.ts` | 職業 |
| `src/lib/speed/read-map.ts` | 小地圖標題：找橘色按鈕、讀兩行、簽章、對到地圖 id |
| `src/lib/speed/read-party.ts` | 組隊人數（隊伍欄紅血條） |
| `src/lib/speed/read-frame.ts` | 一張畫面全部讀完 |
| `src/lib/speed/tracker.ts` | 一段怎麼算（自動／手動、升級、死亡、換圖、60 秒停） |
| `src/lib/speed/format.ts` | 「約 1 小時 20 分」這類字 |
| `src/lib/speed/settings.ts` | 角色 ID、公開、模式、地圖記憶（localStorage） |
| `src/lib/speed/capture.ts`、`capture.worker.ts` | 分享畫面、一秒讀一張 |
| `src/lib/speed/server/rules.ts` | 存一筆的檢查、10 分鐘經驗、上限、進不進排行（純函式） |
| `src/lib/speed/server/db.ts` | Neon 連線、建表 |
| `src/app/api/speed/runs/route.ts` | POST 存一筆 |
| `src/app/api/speed/board/route.ts` | GET 一張圖的排行 |
| `src/app/plan/speed/page.tsx`、`PracticeSpeed.tsx`、`parts.tsx`、`MiniWindow.tsx` | 頁面 |
| `src/lib/speed/gen/glyphs.gen.ts`、`vitest.gen.config.ts` | 本機產樣板（不進 CI） |
| `src/lib/speed/__fixtures__/window-1364.png` | 測試截圖（隊友名打馬賽克） |
| `src/lib/speed/__tests__/*.test.ts` | 單元測試 |
| `src/lib/nav.ts`、`src/components/SiteHeader.tsx` | 導覽列加「練功測速」（只電腦版） |
| `src/app/plan/damage/DamageCalculator.tsx`、`src/lib/damage-view.ts` | `?mob=<id>` 先選好怪 |
| `src/app/privacy/page.tsx` | 隱私頁補一段 |
| `scripts/verify/speed-shot.mjs`、`scripts/verify/README.md` | 無頭 Chrome 驗收 |
| `README.md` | 練功測速一節（資料庫、樣板怎麼重產） |

---

### Task 1: 測試截圖、畫面基本工具、字形樣板

**Files:**
- Create: `src/lib/speed/__fixtures__/window-1364.png`
- Create: `src/lib/speed/frame.ts`、`src/lib/speed/ink.ts`
- Create: `src/lib/speed/gen/glyphs.gen.ts`、`vitest.gen.config.ts`
- Create: `src/lib/speed/glyphs.json`、`public/data/speed-names.json`（產出來的）
- Create: `src/lib/speed/__tests__/fixture.ts`、`src/lib/speed/__tests__/ink.test.ts`
- Modify: `package.json`（devDependency `@napi-rs/canvas`、script `speed:glyphs`）

**Interfaces:**
- Produces:
  - `type Frame = { width: number; height: number; data: Uint8ClampedArray }`
  - `type Rect = { x: number; y: number; w: number; h: number }`
  - `rgbAt(frame, x, y): [number, number, number]`、`lumOf(r, g, b): number`、`clampRect(frame, rect): Rect | null`
  - `type Mask = { w: number; h: number; m: Float32Array }`、`type Box = { x0: number; x1: number; y0: number; y1: number; n: number }`
  - `inkMask(frame, rect, dark = false, hiPct = 0.995): Mask | null`
  - `textRows(mask): [number, number]`、`components(mask, y0, y1, thr = 0.45): Box[]`、`bbox(mask, thr = 0.45): Box | null`、`grid(mask, box, gw, gh): Float32Array`
  - 測試用 `loadFixture(name, scale = 1): Promise<Frame>`（`src/lib/speed/__tests__/fixture.ts`）

- [ ] **Step 1: 做測試截圖（隊友名打馬賽克）**

使用者的截圖在 session scratchpad：`C:\Users\user1\AppData\Local\Temp\claude\C--Users-user1-MapleBook--claude-worktrees-damage-calculator-f03251\7248f1d3-b9e5-4cbf-9073-7b9934f59b19\images\1.webp`。轉 PNG，把隊伍欄兩個隊友的名字（x 1196–1292、y 582–614）用 6px 方塊平均打馬賽克（亮暗保留）：

```bash
mkdir -p src/lib/speed/__fixtures__
python - <<'EOF'
from PIL import Image
src = r"C:\Users\user1\AppData\Local\Temp\claude\C--Users-user1-MapleBook--claude-worktrees-damage-calculator-f03251\7248f1d3-b9e5-4cbf-9073-7b9934f59b19\images\1.webp"
im = Image.open(src).convert("RGB")
x0, y0, x1, y1, b = 1196, 582, 1292, 614, 6
for y in range(y0, y1, b):
    for x in range(x0, x1, b):
        box = (x, y, min(x + b, x1), min(y + b, y1))
        c = im.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0))
        im.paste(c, box)
im.save("src/lib/speed/__fixtures__/window-1364.png")
print(im.size)
EOF
```

Expected: 印出 `(1364, 799)`。打開 PNG 確認隊友名糊掉、你自己的名字跟紅血條還在。

- [ ] **Step 2: 裝 @napi-rs/canvas、加 script**

```bash
npm i -D @napi-rs/canvas
```

`package.json` 的 `scripts` 加一行（放在 `verify:db` 後面）：

```json
"speed:glyphs": "vitest run -c vitest.gen.config.ts"
```

- [ ] **Step 3: 寫 frame.ts**

```ts
// src/lib/speed/frame.ts
/**
 * 練功測速認畫面用的畫面型別：跟瀏覽器 ImageData 一樣的排法（RGBA、一列接一列）。
 * 認畫面的函式全部只吃這個，瀏覽器（Worker 裡的 OffscreenCanvas）跟測試（@napi-rs/canvas 讀 PNG）都給得出來。
 */
export type Frame = { width: number; height: number; data: Uint8ClampedArray };
export type Rect = { x: number; y: number; w: number; h: number };

export function rgbAt(frame: Frame, x: number, y: number): [number, number, number] {
  const i = (y * frame.width + x) * 4;
  return [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
}

export function lumOf(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 範圍夾進畫面、四捨五入成整數；小於 2×2 回 null */
export function clampRect(frame: Frame, rect: Rect): Rect | null {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(frame.width, Math.round(rect.x + rect.w));
  const y1 = Math.min(frame.height, Math.round(rect.y + rect.h));
  return x1 - x >= 2 && y1 - y >= 2 ? { x, y, w: x1 - x, h: y1 - y } : null;
}
```

- [ ] **Step 4: 寫 ink.ts**

```ts
// src/lib/speed/ink.ts
import { clampRect, lumOf, type Frame, type Rect } from "./frame";

/** 一塊區域的「墨」：0＝背景、1＝字。每格是 0～1 的小數（反鋸齒的邊是中間值） */
export type Mask = { w: number; h: number; m: Float32Array };
/** 連通塊的範圍（右、下不含）跟像素數 */
export type Box = { x0: number; x1: number; y0: number; y1: number; n: number };

/**
 * 背景＝這塊亮度的中位數、字＝最亮的那一小撮（hiPct），中間線性對到 0～1。
 * dark：深色字淺色底（小地圖標題），先把亮度反過來。
 */
export function inkMask(frame: Frame, rect: Rect, dark = false, hiPct = 0.995): Mask | null {
  const r = clampRect(frame, rect);
  if (!r) return null;
  const m = new Float32Array(r.w * r.h);
  const all = new Array<number>(m.length);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const i = ((r.y + y) * frame.width + r.x + x) * 4;
      const v = lumOf(frame.data[i], frame.data[i + 1], frame.data[i + 2]);
      const k = y * r.w + x;
      all[k] = m[k] = dark ? 255 - v : v;
    }
  }
  all.sort((a, b) => a - b);
  const bg = all[Math.floor(all.length * 0.5)];
  const hi = all[Math.min(all.length - 1, Math.floor(all.length * hiPct))];
  const span = Math.max(30, hi - bg);
  for (let i = 0; i < m.length; i++) m[i] = Math.min(1, Math.max(0, (m[i] - bg) / span));
  return { w: r.w, h: r.h, m };
}

/** 文字所在的列：整排六成以上都是墨的是 UI 的線（不算），剩下有墨的列裡最長的一段連續列 [起, 迄) */
export function textRows(mask: Mask): [number, number] {
  let best: [number, number] = [0, 0];
  let start = -1;
  for (let y = 0; y <= mask.h; y++) {
    let ink = 0;
    if (y < mask.h) for (let x = 0; x < mask.w; x++) if (mask.m[y * mask.w + x] > 0.5) ink++;
    const isText = y < mask.h && ink > 0 && ink / mask.w <= 0.6;
    if (isText && start < 0) start = y;
    if (!isText && start >= 0) {
      if (y - start > best[1] - best[0]) best = [start, y];
      start = -1;
    }
  }
  return best;
}

/** 列 y0～y1 之間的連通塊（八方向、墨 > thr） */
export function components(mask: Mask, y0: number, y1: number, thr = 0.45): Box[] {
  const { w } = mask;
  const seen = new Uint8Array(w * mask.h);
  const out: Box[] = [];
  const stack: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start] || mask.m[start] <= thr) continue;
      const box: Box = { x0: x, x1: x + 1, y0: y, y1: y + 1, n: 0 };
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const k = stack.pop()!;
        const cx = k % w;
        const cy = (k - cx) / w;
        box.n++;
        box.x0 = Math.min(box.x0, cx);
        box.x1 = Math.max(box.x1, cx + 1);
        box.y0 = Math.min(box.y0, cy);
        box.y1 = Math.max(box.y1, cy + 1);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= w || ny < y0 || ny >= y1) continue;
            const nk = ny * w + nx;
            if (!seen[nk] && mask.m[nk] > thr) {
              seen[nk] = 1;
              stack.push(nk);
            }
          }
        }
      }
      out.push(box);
    }
  }
  return out;
}

/** 整塊墨的範圍；沒有墨回 null */
export function bbox(mask: Mask, thr = 0.45): Box | null {
  let x0 = mask.w, x1 = 0, y0 = mask.h, y1 = 0, n = 0;
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (mask.m[y * mask.w + x] <= thr) continue;
      n++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
  return n ? { x0, x1, y0, y1, n } : null;
}

/** 把 box 範圍縮成 gw×gh 格（面積平均），跟字的大小無關，拿來跟樣板比 */
export function grid(mask: Mask, box: Box, gw: number, gh: number): Float32Array {
  const out = new Float32Array(gw * gh);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const xa = box.x0 + (i * w) / gw;
      const xb = box.x0 + ((i + 1) * w) / gw;
      const ya = box.y0 + (j * h) / gh;
      const yb = box.y0 + ((j + 1) * h) / gh;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          const cover = (Math.min(x + 1, xb) - Math.max(x, xa)) * (Math.min(y + 1, yb) - Math.max(y, ya));
          sum += (mask.m[y * mask.w + x] ?? 0) * cover;
          area += cover;
        }
      }
      out[j * gw + i] = area ? sum / area : 0;
    }
  }
  return out;
}
```

- [ ] **Step 5: 測試用的讀圖工具**

```ts
// src/lib/speed/__tests__/fixture.ts
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Frame } from "../frame";

/** 讀 __fixtures__ 的 PNG，scale ≠ 1 時用平滑縮放模擬別的視窗大小 */
export async function loadFixture(name: string, scale = 1): Promise<Frame> {
  const image = await loadImage(path.resolve(process.cwd(), "src/lib/speed/__fixtures__", name));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
```

- [ ] **Step 6: 寫 ink 的失敗測試**

```ts
// src/lib/speed/__tests__/ink.test.ts
import { describe, expect, it } from "vitest";
import { bbox, components, grid, inkMask, textRows } from "../ink";
import { loadFixture } from "./fixture";

describe("畫面的墨", () => {
  it("EXP 那一行：去掉上面兩條白線（757、761），文字列是 766～774", async () => {
    const frame = await loadFixture("window-1364.png");
    const mask = inkMask(frame, { x: 809, y: 756, w: 167, h: 22 })!;
    const [y0, y1] = textRows(mask);
    expect(756 + y0).toBe(766);
    expect(756 + y1).toBe(775);
  });

  it("連通塊把 406947 切成六個字（數字高 7～9）", async () => {
    const frame = await loadFixture("window-1364.png");
    // 2026-10-13 量的：4 在 839–844、7 在 869–874，875 起是「[」
    const mask = inkMask(frame, { x: 838, y: 762, w: 37, h: 13 })!;
    const boxes = components(mask, 0, mask.h).filter(box => box.y1 - box.y0 >= 5);
    expect(boxes).toHaveLength(6);
    for (const box of boxes) expect(box.y1 - box.y0).toBeGreaterThanOrEqual(7);
  });

  it("格子是面積平均、範圍外算 0", () => {
    const mask = { w: 2, h: 2, m: new Float32Array([1, 0, 0, 1]) };
    expect(Array.from(grid(mask, bbox(mask)!, 1, 1))).toEqual([0.5]);
    expect(Array.from(grid(mask, bbox(mask)!, 2, 2))).toEqual([1, 0, 0, 1]);
  });
});
```

- [ ] **Step 7: 跑測試確認失敗→（frame/ink 已寫）通過**

Run: `npx vitest run src/lib/speed/__tests__/ink.test.ts`
Expected: 3 passed。若第二題切出的塊數不是 6，印出 boxes 看（數字間只有 1px 空隙，反鋸齒邊 >0.45 會黏在一起時把 thr 提到 0.5 再試，並同步改 `components` 的預設值）。

- [ ] **Step 8: 產樣板的 gen 檔與設定**

```ts
// vitest.gen.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

// 本機產練功測速的字形樣板（要 Windows 的微軟正黑體），CI 不跑：npm run speed:glyphs
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["src/**/*.gen.ts"], testTimeout: 600_000 },
});
```

```ts
// src/lib/speed/gen/glyphs.gen.ts
/**
 * 產練功測速的字形樣板（本機跑：npm run speed:glyphs，要 Windows 的字型）。
 * - src/lib/speed/glyphs.json：EXP 那行的字（0–9、[、]、%），微軟正黑體
 * - public/data/speed-names.json：職業名（微軟正黑體）、小地圖的街道名跟地圖名（TITLE_FONT）
 * 只存縮成格子的特徵（每字 8×12、每行高 8 格），不存字型本身。
 * 地圖資料（public/data/maps.json）多了新地圖名就要重跑，不然新圖認不到（頁面會改請玩家點選）。
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { it } from "vitest";
import type { Frame } from "../frame";
import { bbox, components, grid, inkMask } from "../ink";
import { JOB_TEXT } from "../read-job";

const JOB_FONT = "C:/Windows/Fonts/msjh.ttc";
// 小地圖標題的字型：Task 6 用無損截圖比過再定；還沒有無損截圖前先用微軟正黑體
const TITLE_FONT = "C:/Windows/Fonts/msjh.ttc";
const ROOT = process.cwd();

function render(text: string, family: string, px: number): Frame {
  const canvas = createCanvas(Math.ceil(px * (Array.from(text).length + 2)), px * 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = `${px}px "${family}"`;
  context.textBaseline = "alphabetic";
  context.fillText(text, px / 2, px * 1.3);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const hex = (cells: Float32Array) => Array.from(cells, value => Math.min(15, Math.round(value * 15)).toString(16)).join("");

it("產 glyphs.json", () => {
  GlobalFonts.registerFromPath(JOB_FONT, "SpeedDigits");
  const chars = [];
  for (const ch of "0123456789[]%") {
    const frame = render(ch, "SpeedDigits", 96);
    const mask = inkMask(frame, { x: 0, y: 0, w: frame.width, h: frame.height })!;
    const parts = components(mask, 0, mask.h);
    const box = {
      x0: Math.min(...parts.map(part => part.x0)),
      x1: Math.max(...parts.map(part => part.x1)),
      y0: Math.min(...parts.map(part => part.y0)),
      y1: Math.max(...parts.map(part => part.y1)),
      n: 0,
    };
    chars.push({ ch, aspect: round((box.x1 - box.x0) / (box.y1 - box.y0)), h: box.y1 - box.y0, grid: Array.from(grid(mask, box, 8, 12), round) });
  }
  const zero = chars.find(entry => entry.ch === "0")!.h;
  const out = { font: "Microsoft JhengHei", gw: 8, gh: 12, chars: chars.map(({ h, ...rest }) => ({ ...rest, rh: round(h / zero) })) };
  fs.writeFileSync(path.join(ROOT, "src/lib/speed/glyphs.json"), `${JSON.stringify(out)}\n`);
});

it("產 speed-names.json", () => {
  GlobalFonts.registerFromPath(JOB_FONT, "SpeedJob");
  GlobalFonts.registerFromPath(TITLE_FONT, "SpeedTitle");
  const line = (text: string, family: string) => {
    const frame = render(text, family, 48);
    const mask = inkMask(frame, { x: 0, y: 0, w: frame.width, h: frame.height }, false, 0.99)!;
    const box = bbox(mask)!;
    const gw = 8 * Math.max(1, Array.from(text).length);
    return [text, round((box.x1 - box.x0) / (box.y1 - box.y0)), hex(grid(mask, box, gw, 8))];
  };
  const maps = JSON.parse(fs.readFileSync(path.join(ROOT, "public/data/maps.json"), "utf8")) as Record<string, { zh?: string; st?: string }>;
  const titles = new Set<string>();
  for (const record of Object.values(maps)) {
    if (!record.zh) continue;
    titles.add(record.zh);
    if (record.st) titles.add(record.st);
  }
  const jobs = JOB_TEXT.flatMap(([, texts]) => texts);
  const out = {
    jobFont: "Microsoft JhengHei",
    titleFont: path.basename(TITLE_FONT),
    gh: 8,
    cell: 8,
    jobs: jobs.map(text => line(text, "SpeedJob")),
    titles: [...titles].sort().map(text => line(text, "SpeedTitle")),
  };
  fs.writeFileSync(path.join(ROOT, "public/data/speed-names.json"), `${JSON.stringify(out)}\n`);
});
```

（`JOB_TEXT` 在 Task 4 才建立。Task 1 先只跑第一個 `it`：把第二個 `it` 暫時改成 `it.skip`，Task 4 完成後再拿掉 `.skip` 重跑。）

- [ ] **Step 9: 產 glyphs.json**

Run: `npm run speed:glyphs`
Expected: `src/lib/speed/glyphs.json` 出現，`chars` 有 13 筆、每筆 `grid` 96 個數字；「0」的 `rh` 是 1。

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.gen.config.ts src/lib/speed
git commit -m "v0.95: 練功測速——測試截圖（隊友名打馬賽克）、畫面的墨／文字列／連通塊工具、本機產字形樣板

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 找狀態列、讀 EXP 那行

**Files:**
- Create: `src/lib/speed/status-bar.ts`、`src/lib/speed/glyphs.ts`、`src/lib/speed/read-exp.ts`
- Test: `src/lib/speed/__tests__/read-exp.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Frame`、`rgbAt`、`inkMask`、`textRows`、`components`、`grid`、`Box`、`Mask`、`glyphs.json`
- Produces:
  - `type StatusBar = { hp: [number, number]; mp: [number, number]; exp: [number, number]; top: number; bottom: number; scale: number }`
  - `findStatusBar(frame): StatusBar | null`、`BASE_BAR_H = 18`
  - `classifyGlyph(mask, box, digitH): string`
  - `readExpText(frame, bar): string`（例 `"%P 406947[7973%]"`：標籤那組認成什麼不重要，最後一組是數字）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/read-exp.test.ts
import { describe, expect, it } from "vitest";
import { findStatusBar } from "../status-bar";
import { readExpText } from "../read-exp";
import { loadFixture } from "./fixture";

describe("找狀態列", () => {
  it("基準截圖：HP、MP、EXP 三條，EXP 條 809～976、高 18", async () => {
    const bar = findStatusBar(await loadFixture("window-1364.png"))!;
    expect(bar.exp[0]).toBeGreaterThanOrEqual(807);
    expect(bar.exp[0]).toBeLessThanOrEqual(811);
    expect(bar.exp[1]).toBeGreaterThanOrEqual(974);
    expect(bar.exp[1]).toBeLessThanOrEqual(978);
    expect(bar.bottom - bar.top).toBe(18);
    expect(bar.scale).toBeCloseTo(1, 1);
    expect(bar.hp[0]).toBeLessThan(bar.mp[0]);
  });

  it.each([1.25, 1.5, 2])("放大 %s 倍也找得到，scale 跟著變", async scale => {
    const bar = findStatusBar(await loadFixture("window-1364.png", scale))!;
    expect(bar).not.toBeNull();
    expect(bar.scale).toBeCloseTo(scale, 0);
  });

  it("全黑畫面找不到", () => {
    const frame = { width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4) };
    expect(findStatusBar(frame)).toBeNull();
  });
});

describe("讀 EXP 那行", () => {
  it.each([1, 1.25, 1.5, 2])("放大 %s 倍：最後一組的數字開頭是 406947", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    const text = readExpText(frame, findStatusBar(frame)!);
    const last = text.trim().split(/\s+/).pop()!;
    expect(last.replace(/\D/g, "").startsWith("406947")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/read-exp.test.ts`
Expected: FAIL，找不到 `../status-bar`。

- [ ] **Step 3: 寫 status-bar.ts**

```ts
// src/lib/speed/status-bar.ts
import { rgbAt, type Frame } from "./frame";

/** 下方狀態列的 HP、MP、EXP 三條（x 範圍，右不含）、條的上下緣、跟基準截圖比的縮放 */
export type StatusBar = { hp: [number, number]; mp: [number, number]; exp: [number, number]; top: number; bottom: number; scale: number };

/** 基準截圖（1364×799 視窗）裡 EXP 條的高度（含上下的亮邊） */
export const BASE_BAR_H = 18;

const isRed = (r: number, g: number, b: number) => r > 150 && g < 90 && b < 90;
const isBlue = (r: number, g: number, b: number) => b > 150 && r < 110;
const isLime = (r: number, g: number, b: number) => g > 180 && b < 130 && r > 100;

/**
 * 畫面下面兩成裡，紅（HP）藍（MP）黃綠（EXP）最多的那一列就是三條的中間；
 * 那一列從左到右「夠長的亮段」前三段依序是 HP、MP、EXP（長度要差不多，不然當成認錯）。
 * 上下緣：從 EXP 條左邊往內 3px 那一欄，往上往下走到黑框為止。
 */
export function findStatusBar(frame: Frame): StatusBar | null {
  const { width, height } = frame;
  let row = -1;
  let most = 0;
  for (let y = Math.floor(height * 0.8); y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbAt(frame, x, y);
      if (isRed(r, g, b) || isBlue(r, g, b) || isLime(r, g, b)) count++;
    }
    if (count > most) {
      most = count;
      row = y;
    }
  }
  if (row < 0 || most < width * 0.02) return null;

  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const bright = x < width && Math.max(...rgbAt(frame, x, row)) >= 100;
    if (bright && start < 0) start = x;
    if (!bright && start >= 0) {
      if (x - start >= width * 0.05) runs.push([start, x]);
      start = -1;
    }
  }
  if (runs.length < 3) return null;
  const [hp, mp, exp] = runs;
  const widths = [hp, mp, exp].map(([a, b]) => b - a);
  if (Math.max(...widths) > Math.min(...widths) * 1.35) return null;

  const probe = exp[0] + 3;
  let top = row;
  let bottom = row;
  while (top > 0 && Math.max(...rgbAt(frame, probe, top - 1)) >= 40) top--;
  while (bottom < height - 1 && Math.max(...rgbAt(frame, probe, bottom + 1)) >= 40) bottom++;
  const barH = bottom + 1 - top;
  if (barH < 6) return null;
  return { hp, mp, exp, top, bottom: bottom + 1, scale: barH / BASE_BAR_H };
}
```

- [ ] **Step 4: 寫 glyphs.ts**

```ts
// src/lib/speed/glyphs.ts
import data from "./glyphs.json";
import { grid, type Box, type Mask } from "./ink";

/** EXP 那行的字樣板（微軟正黑體，npm run speed:glyphs 產）：寬高比、字高對「0」的比例、8×12 格 */
type Template = { ch: string; aspect: number; rh: number; grid: number[] };
const TEMPLATES = data.chars as Template[];

/**
 * 一個字跟每個樣板比：格子的平均平方差＋寬高比差＋字高差（「.」被當成小點先拿掉了，「[」比數字高、「%」比較寬）。
 * digitH：這一行數字的高度（字高的中位數附近）。
 */
export function classifyGlyph(mask: Mask, box: Box, digitH: number): string {
  const cells = grid(mask, box, data.gw, data.gh);
  const aspect = (box.x1 - box.x0) / (box.y1 - box.y0);
  const rh = (box.y1 - box.y0) / digitH;
  let best = "";
  let bestScore = Infinity;
  for (const template of TEMPLATES) {
    let diff = 0;
    for (let i = 0; i < cells.length; i++) diff += (cells[i] - template.grid[i]) ** 2;
    const score = diff / cells.length + 0.3 * Math.abs(Math.log(aspect / template.aspect)) + 0.6 * Math.abs(Math.log(rh / template.rh));
    if (score < bestScore) {
      bestScore = score;
      best = template.ch;
    }
  }
  return best;
}
```

- [ ] **Step 5: 寫 read-exp.ts 的 readExpText**

```ts
// src/lib/speed/read-exp.ts
import { classifyGlyph } from "./glyphs";
import { components, inkMask, textRows, type Box } from "./ink";
import type { Frame } from "./frame";
import type { StatusBar } from "./status-bar";

/**
 * EXP 條正上方那一行（「EXP 406947[79.73%]」）認成字串：組跟組之間隔得開的插空白。
 * 小數點太小、常黏在旁邊的字上，先當小點拿掉（parseExp 自己補回小數點）；% 是三塊，同一欄重疊的塊併成一個字。
 */
export function readExpText(frame: Frame, bar: StatusBar): string {
  const h = bar.bottom - bar.top;
  const mask = inkMask(frame, { x: bar.exp[0], y: bar.top - 1.2 * h, w: bar.exp[1] - bar.exp[0], h: 1.2 * h });
  if (!mask) return "";
  const [y0, y1] = textRows(mask);
  if (y1 - y0 < 4) return "";
  const parts = components(mask, y0, y1).filter(part => part.n > 1);
  if (!parts.length) return "";
  const heights = parts.map(part => part.y1 - part.y0).sort((a, b) => a - b);
  const digitH = heights[Math.floor(heights.length * 0.6)];
  if (digitH < 5) return "";
  const glyphs: Box[] = [];
  for (const part of parts.filter(p => p.y1 - p.y0 >= digitH * 0.45).sort((a, b) => a.x0 - b.x0)) {
    const last = glyphs[glyphs.length - 1];
    if (last && part.x0 < last.x1 - 0.5) {
      last.x1 = Math.max(last.x1, part.x1);
      last.y0 = Math.min(last.y0, part.y0);
      last.y1 = Math.max(last.y1, part.y1);
      last.n += part.n;
    } else glyphs.push({ ...part });
  }
  let text = "";
  let prev: Box | null = null;
  for (const glyph of glyphs) {
    if (prev && glyph.x0 - prev.x1 > digitH * 0.9) text += " ";
    text += classifyGlyph(mask, glyph, digitH);
    prev = glyph;
  }
  return text;
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run src/lib/speed/__tests__/read-exp.test.ts`
Expected: 全過。2026-10-13 雛型（同一套作法）在 1、1.25、1.5、2 倍都讀到 `406947`；% 那段在 1.25 倍會錯（`7073`），交給 Task 3 的驗證擋掉。
0.75 倍（數字只剩 5px）讀不到是預期的，不測。

- [ ] **Step 7: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——找狀態列三條、EXP 那行切字跟微軟正黑體樣板比對

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 用經驗表驗證、反推等級

**Files:**
- Modify: `src/lib/speed/read-exp.ts`（加 `parseExp`、`levelFor`、`ExpReading`）
- Test: `src/lib/speed/__tests__/parse-exp.test.ts`

**Interfaces:**
- Consumes: `readExpText`、`findStatusBar`（Task 2）；經驗表 `toNext: number[]`（`guides/common.json` 的 `expTable.toNext`，`[n]` 是 Lv.n 升 n+1 要的經驗）
- Produces:
  - `type ExpReading = { exp: number; percent: number; level: number }`
  - `PERCENT_TOLERANCE = 0.06`
  - `levelFor(exp, percent, toNext, hints: number[]): number | null`
  - `parseExp(text, toNext, hints: number[] = []): ExpReading | null`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/parse-exp.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findStatusBar } from "../status-bar";
import { levelFor, parseExp, readExpText } from "../read-exp";
import { loadFixture } from "./fixture";

const toNext: number[] = JSON.parse(fs.readFileSync("public/data/guides/common.json", "utf8")).expTable.toNext;

describe("經驗＋% 反推等級", () => {
  it("406947、79.73% 只對得上 46 等（升級要 510,420）", () => {
    expect(toNext[46]).toBe(510420);
    expect(levelFor(406947, 79.73, toNext, [])).toBe(46);
  });

  it("% 認錯一點（79.78）還在誤差內；認錯很多（70.73）對不上", () => {
    expect(levelFor(406947, 79.78, toNext, [])).toBe(46);
    expect(levelFor(406947, 70.73, toNext, [])).toBeNull();
  });

  it("% 很小時好幾級都對得上：沒有提示就不認，有提示就照提示", () => {
    const exp = Math.round(toNext[30] * 0.0002);
    expect(levelFor(exp, 0.02, toNext, [])).toBeNull();
    expect(levelFor(exp, 0.02, toNext, [30, 31])).toBe(30);
  });

  it("有提示時只認提示裡的等級（避免拆錯位數剛好對到別的等級）", () => {
    expect(levelFor(406947, 79.73, toNext, [47, 48])).toBeNull();
  });
});

describe("parseExp", () => {
  it("有括號照括號切", () => {
    expect(parseExp("%P 406947[7973%]", toNext)).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("括號沒認出來：試著把最後 4 或 3 位當 %，用經驗表挑對的", () => {
    expect(parseExp("649 4069477973%", toNext)).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("認錯的回 null", () => {
    expect(parseExp("648 406947[7073%", toNext)).toBeNull();
    expect(parseExp("", toNext)).toBeNull();
  });

  it.each([1, 1.25, 1.5, 2])("截圖放大 %s 倍：不是讀對就是 null，絕不讀錯", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    const reading = parseExp(readExpText(frame, findStatusBar(frame)!), toNext);
    if (reading) expect(reading).toMatchObject({ exp: 406947, level: 46 });
  });

  it("原尺寸要讀得到（使用者實際的視窗）", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(parseExp(readExpText(frame, findStatusBar(frame)!), toNext)).toMatchObject({ exp: 406947, level: 46 });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/parse-exp.test.ts`
Expected: FAIL，`levelFor` 不存在。

- [ ] **Step 3: 在 read-exp.ts 尾巴加**

```ts
/** 經驗、%、等級。等級不是讀的，是拿經驗跟 % 去經驗表反推的（畫面上的 LV 是小圖，不讀） */
export type ExpReading = { exp: number; percent: number; level: number };

/** 畫面的 % 是四捨五入到小數兩位；再多留一點給百分位認錯 */
export const PERCENT_TOLERANCE = 0.06;

/**
 * 哪一級「經驗 ÷ 升級要的經驗」跟畫面的 % 對得上。
 * hints：已經知道的等級（現在這級、下一級）。有給就只認裡面的；沒給就要剛好一級對得上才認。
 */
export function levelFor(exp: number, percent: number, toNext: number[], hints: number[]): number | null {
  const fits: number[] = [];
  for (let level = 1; level < toNext.length; level++) {
    const need = toNext[level];
    if (!need || exp >= need) continue;
    if (Math.abs((exp / need) * 100 - percent) <= PERCENT_TOLERANCE) fits.push(level);
  }
  if (hints.length) return fits.find(level => hints.includes(level)) ?? null;
  return fits.length === 1 ? fits[0] : null;
}

/**
 * readExpText 的字串 → 經驗、%、等級。看最後一組：有「[」照它切；沒有就試最後 4 位、3 位是 %（小數兩位），
 * 哪一種在經驗表對得上就用哪種。都對不上回 null（這一張丟掉，下一秒再讀）。
 */
export function parseExp(text: string, toNext: number[], hints: number[] = []): ExpReading | null {
  const group = text.trim().split(/\s+/).pop() ?? "";
  const tries: Array<[string, string]> = [];
  const bracket = group.indexOf("[");
  if (bracket > 0) tries.push([group.slice(0, bracket).replace(/\D/g, ""), group.slice(bracket + 1).replace(/\D/g, "")]);
  const digits = group.replace(/\D/g, "");
  for (const size of [4, 3]) if (digits.length > size) tries.push([digits.slice(0, -size), digits.slice(-size)]);
  for (const [expDigits, percentDigits] of tries) {
    if (!expDigits || percentDigits.length < 3 || percentDigits.length > 4 || expDigits.length > 12) continue;
    const exp = Number(expDigits);
    const percent = Number(percentDigits) / 100;
    if (percent >= 100) continue;
    const level = levelFor(exp, percent, toNext, hints);
    if (level !== null) return { exp, percent, level };
  }
  return null;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/speed/__tests__/parse-exp.test.ts`
Expected: 全過。若「原尺寸要讀得到」紅：印出 `readExpText` 看是哪個字認錯，調 `classifyGlyph` 的權重（0.3／0.6）或 `components` 門檻，**不准放寬 `PERCENT_TOLERANCE` 超過 0.06**（再寬會開始誤認）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——經驗跟 % 拿經驗表驗證、反推等級，認錯的整張丟掉

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 名字比對、讀職業

**Files:**
- Create: `src/lib/speed/names.ts`、`src/lib/speed/read-job.ts`
- Modify: `src/lib/speed/gen/glyphs.gen.ts`（第二個 `it` 拿掉 `.skip`）
- Create（產出）: `public/data/speed-names.json`
- Modify: `src/lib/data.ts`（加 `loadSpeedNames`）
- Test: `src/lib/speed/__tests__/read-job.test.ts`

**Interfaces:**
- Consumes: `inkMask`、`bbox`、`grid`、`Mask`（Task 1）、`StatusBar`（Task 2）
- Produces:
  - `type RawSpeedNames = { jobFont: string; titleFont: string; gh: number; cell: number; jobs: [string, number, string][]; titles: [string, number, string][] }`
  - `type NameEntry = { text: string; aspect: number; gw: number; grid: Float32Array }`
  - `type SpeedNames = { gh: number; jobs: NameEntry[]; titles: NameEntry[] }`
  - `type Ranked = { text: string; d: number }`
  - `parseNames(raw): SpeedNames`、`rankText(mask, entries, gh): Ranked[]`（由小到大，全部候選）
  - `JOB_TEXT: Array<[number, string[]]>`、`jobRect(bar): Rect`、`readJob(frame, bar, names): number | null`
  - `loadSpeedNames(): Promise<RawSpeedNames>`（data.ts）

- [ ] **Step 1: 寫 names.ts**

```ts
// src/lib/speed/names.ts
import { bbox, grid, type Mask } from "./ink";

/** public/data/speed-names.json：[字, 寬高比, 格子（每格一個 0–f）]，行高 8 格、每個字 8 格寬 */
export type RawSpeedNames = { jobFont: string; titleFont: string; gh: number; cell: number; jobs: [string, number, string][]; titles: [string, number, string][] };
export type NameEntry = { text: string; aspect: number; gw: number; grid: Float32Array };
export type SpeedNames = { gh: number; jobs: NameEntry[]; titles: NameEntry[] };
export type Ranked = { text: string; d: number };

function entry([text, aspect, cells]: [string, number, string], gh: number): NameEntry {
  const values = new Float32Array(cells.length);
  for (let i = 0; i < cells.length; i++) values[i] = parseInt(cells[i], 16) / 15;
  return { text, aspect, gw: values.length / gh, grid: values };
}

export function parseNames(raw: RawSpeedNames): SpeedNames {
  return { gh: raw.gh, jobs: raw.jobs.map(row => entry(row, raw.gh)), titles: raw.titles.map(row => entry(row, raw.gh)) };
}

/**
 * 一行字跟名單裡每個名字比（整行縮成格子比平均平方差，加寬高比差），差最小的排前面。
 * 名單是封閉的（職業幾十個、地圖幾百個），選最像的就好，不用真的認字。
 */
export function rankText(mask: Mask, entries: NameEntry[], gh: number): Ranked[] {
  const box = bbox(mask);
  if (!box || box.y1 - box.y0 < 4) return [];
  const aspect = (box.x1 - box.x0) / (box.y1 - box.y0);
  const seen = new Map<number, Float32Array>();
  const ranked = entries.map(candidate => {
    let cells = seen.get(candidate.gw);
    if (!cells) {
      cells = grid(mask, box, candidate.gw, gh);
      seen.set(candidate.gw, cells);
    }
    let diff = 0;
    for (let i = 0; i < cells.length; i++) diff += (cells[i] - candidate.grid[i]) ** 2;
    return { text: candidate.text, d: diff / cells.length + 0.4 * Math.abs(Math.log(aspect / candidate.aspect)) };
  });
  return ranked.sort((a, b) => a.d - b.d);
}
```

- [ ] **Step 2: 寫 read-job.ts**

```ts
// src/lib/speed/read-job.ts
import { inkMask } from "./ink";
import { rankText, type SpeedNames } from "./names";
import type { Frame, Rect } from "./frame";
import type { StatusBar } from "./status-bar";

/**
 * 狀態列左下的職業名（客戶端字串表 json_a2909… 裡的寫法，2026-10-13 抽過）→ 站上的職業代碼。
 * 狀態列寫「巫師(冰、雷)」，另一份清單寫「巫師(冰/雷)」，兩種都放。
 */
export const JOB_TEXT: Array<[number, string[]]> = [
  [0, ["初心者"]],
  [100, ["劍士"]], [110, ["狂戰士"]], [111, ["十字軍"]], [120, ["見習騎士"]], [121, ["騎士"]], [130, ["槍騎兵"]], [131, ["龍騎士"]],
  [200, ["法師"]], [210, ["巫師(火、毒)", "巫師(火/毒)"]], [211, ["魔導士(火、毒)", "魔導士(火/毒)"]],
  [220, ["巫師(冰、雷)", "巫師(冰/雷)"]], [221, ["魔導士(冰、雷)", "魔導士(冰/雷)"]], [230, ["僧侶"]], [231, ["祭司"]],
  [300, ["弓箭手"]], [310, ["獵人"]], [311, ["遊俠"]], [320, ["弩弓手"]], [321, ["狙擊手"]],
  [400, ["盜賊"]], [410, ["刺客"]], [411, ["暗殺者"]], [420, ["俠盜"]], [421, ["神偷"]],
  [500, ["海盜"]], [510, ["打手"]], [511, ["格鬥家"]], [520, ["槍手"]], [521, ["神槍手"]],
];

const JOB_OF = new Map(JOB_TEXT.flatMap(([id, texts]) => texts.map(text => [text, id] as const)));

/** 職業那一行：基準截圖在 HP 條左邊 355～256px、EXP 條上緣往上 15px 到上緣（照條高等比例） */
export function jobRect(bar: StatusBar): Rect {
  const h = bar.bottom - bar.top;
  return { x: bar.hp[0] - 20.3 * h, y: bar.top - 0.85 * h, w: 6.1 * h, h: 0.85 * h };
}

/** 最像的比第二像的（不同職業）差夠多才認，不然回 null（頁面改用「我的路線」選的職業） */
export function readJob(frame: Frame, bar: StatusBar, names: SpeedNames): number | null {
  const mask = inkMask(frame, jobRect(bar), false, 0.99);
  if (!mask) return null;
  const ranked = rankText(mask, names.jobs, names.gh);
  const best = ranked[0];
  if (!best || best.d > 0.08) return null;
  const id = JOB_OF.get(best.text)!;
  const runnerUp = ranked.find(row => JOB_OF.get(row.text) !== id);
  return !runnerUp || runnerUp.d - best.d >= 0.008 ? id : null;
}
```

- [ ] **Step 3: 產 speed-names.json**

`src/lib/speed/gen/glyphs.gen.ts` 第二個 `it.skip` 改回 `it`，然後：

Run: `npm run speed:glyphs`
Expected: `public/data/speed-names.json` 出現，`jobs` 34 筆（30 個職業＋4 個斜線寫法）、`titles` 約 370 筆（地圖名＋街道名）。

- [ ] **Step 4: data.ts 加載入函式**

`src/lib/data.ts` 的 `loadSearch` 那行下面加（型別 import 加 `RawSpeedNames`）：

```ts
import type { RawSpeedNames } from "./speed/names";
// …
/** 練功測速的名字樣板（職業、街道、地圖名；本機 npm run speed:glyphs 產） */
export const loadSpeedNames = () => load<RawSpeedNames>("speed-names");
```

- [ ] **Step 5: 寫測試**

```ts
// src/lib/speed/__tests__/read-job.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNames } from "../names";
import { readJob } from "../read-job";
import { findStatusBar } from "../status-bar";
import { loadFixture } from "./fixture";

const names = parseNames(JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8")));

describe("讀職業", () => {
  it.each([1, 1.25, 1.5, 2])("放大 %s 倍：巫師(冰、雷) → 220", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    expect(readJob(frame, findStatusBar(frame)!, names)).toBe(220);
  });

  it("名單裡每個職業都有樣板", () => {
    expect(names.jobs.map(entry => entry.text)).toContain("神槍手");
    expect(names.jobs).toHaveLength(34);
  });
});
```

- [ ] **Step 6: 跑測試**

Run: `npx vitest run src/lib/speed/__tests__/read-job.test.ts`
Expected: 全過（2026-10-13 雛型：最像 0.031、第二像「巫師(火、毒)」0.047，四種倍率都對）。

- [ ] **Step 7: Commit**

```bash
git add src/lib/speed src/lib/data.ts public/data/speed-names.json
git commit -m "v0.95: 練功測速——職業名跟名單比對（狀態列寫法 30 個職業），名字樣板檔

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 組隊人數

**Files:**
- Create: `src/lib/speed/read-party.ts`
- Test: `src/lib/speed/__tests__/read-party.test.ts`

**Interfaces:**
- Consumes: `Frame`、`rgbAt`（Task 1）、`StatusBar`（Task 2）
- Produces: `readParty(frame, bar): number`（至少 1）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/read-party.test.ts
import { describe, expect, it } from "vitest";
import type { Frame } from "../frame";
import { readParty } from "../read-party";
import { findStatusBar } from "../status-bar";
import { loadFixture } from "./fixture";

/** 在畫面上畫紅色或灰色的隊伍血條 */
function paint(frame: Frame, x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) frame.data.set([...rgb, 255], (yy * frame.width + xx) * 4);
}

describe("組隊人數", () => {
  it("基準截圖：三人隊伍，兩個隊友灰掉（不在線）→ 1", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(readParty(frame, findStatusBar(frame)!)).toBe(1);
  });

  it("把灰掉的兩條塗紅（隊友在同一張圖）→ 3", async () => {
    const frame = await loadFixture("window-1364.png");
    paint(frame, 1298, 587, 62, 6, [220, 20, 20]);
    paint(frame, 1298, 604, 62, 6, [220, 20, 20]);
    expect(readParty(frame, findStatusBar(frame)!)).toBe(3);
  });

  it("畫面中間隨便一條紅條（怪物血條）不算組隊", async () => {
    const frame = await loadFixture("window-1364.png");
    paint(frame, 700, 300, 60, 6, [220, 20, 20]);
    expect(readParty(frame, findStatusBar(frame)!)).toBe(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/read-party.test.ts`
Expected: FAIL，`../read-party` 不存在。

- [ ] **Step 3: 寫 read-party.ts**

```ts
// src/lib/speed/read-party.ts
import { rgbAt, type Frame } from "./frame";
import type { StatusBar } from "./status-bar";

type Bar = { x0: number; x1: number; y0: number; y1: number };

const isRed = (r: number, g: number, b: number) => r > 170 && g < 80 && b < 80;

/**
 * 隊伍欄在畫面右側：每個隊友一列，名字＋血條。在同一張圖的隊友血條是紅的，不在線（或不在這張圖）的是灰的。
 * 做法：右邊四分之一、狀態列以上，找寬 40～90px（照縮放）、高 3～10px 的紅條；
 * 左緣對齊（差 4px 內）、上下間距 12～30px 的一串才是隊伍欄，人數＝這串有幾條。找不到＝單練（1）。
 * 2026-10-13 截圖：自己那條紅（x 1298–1360、y 570–575），兩個不在線的隊友灰。
 */
export function readParty(frame: Frame, bar: StatusBar): number {
  const s = bar.scale;
  const x0 = Math.floor(frame.width * 0.75);
  const y0 = Math.floor(frame.height * 0.3);
  const y1 = Math.floor(bar.top - 2 * (bar.bottom - bar.top));
  const bars: Bar[] = [];
  for (let y = y0; y < y1; y++) {
    let start = -1;
    for (let x = x0; x <= frame.width; x++) {
      const red = x < frame.width && isRed(...rgbAt(frame, x, y));
      if (red && start < 0) start = x;
      if (!red && start >= 0) {
        if (x - start >= 30 * s) {
          const open = bars.find(item => item.y1 === y && Math.abs(item.x0 - start) <= 3 * s);
          if (open) open.y1 = y + 1;
          else bars.push({ x0: start, x1: x, y0: y, y1: y + 1 });
        }
        start = -1;
      }
    }
  }
  const sized = bars.filter(item => {
    const w = item.x1 - item.x0;
    const h = item.y1 - item.y0;
    return w >= 40 * s && w <= 90 * s && h >= 3 * s && h <= 10 * s;
  });
  let best = 1;
  for (const first of sized) {
    const column = sized.filter(item => Math.abs(item.x0 - first.x0) <= 4 * s).sort((a, b) => a.y0 - b.y0);
    let run = 1;
    for (let i = 1; i < column.length; i++) {
      const gap = column[i].y0 - column[i - 1].y0;
      run = gap >= 12 * s && gap <= 30 * s ? run + 1 : 1;
      best = Math.max(best, run);
    }
  }
  return best;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/speed/__tests__/read-party.test.ts`
Expected: 3 passed。若第二題拿到 1：印出 `sized` 看兩條塗上的紅條有沒有被找到、間距（587−570＝17、604−587＝17）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——組隊人數只數隊伍欄裡紅的血條（灰掉的隊友不算）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 小地圖標題 → 地圖

**Files:**
- Create: `src/lib/speed/read-map.ts`
- Test: `src/lib/speed/__tests__/read-map.test.ts`
- Maybe modify: `src/lib/speed/gen/glyphs.gen.ts` 的 `TITLE_FONT`（Step 6 決定）

**Interfaces:**
- Consumes: `inkMask`、`components`、`bbox`、`grid`（Task 1）、`rankText`、`SpeedNames`、`Ranked`（Task 4）
- Produces:
  - `findMapButton(frame): { x0: number; x1: number; y0: number; y1: number } | null`
  - `type TitleReading = { signature: string; street: Ranked[]; name: Ranked[] }`
  - `readTitle(frame, names): TitleReading | null`
  - `type MapGuess = { mapId: number | null; confident: boolean; choices: number[] }`
  - `resolveMap(title, maps: Record<string, { zh: string; st: string }>, trainingIds: Set<number>, memory: Record<string, number>): MapGuess`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/read-map.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { MapRecord, TrainingRow } from "@/lib/types";
import { findMapButton, readTitle, resolveMap, type TitleReading } from "../read-map";
import { parseNames } from "../names";
import { loadFixture } from "./fixture";

const names = parseNames(JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8")));
const maps: Record<string, MapRecord> = JSON.parse(fs.readFileSync("public/data/maps.json", "utf8"));
const training: TrainingRow[] = JSON.parse(fs.readFileSync("public/data/training.json", "utf8"));
const trainingIds = new Set(training.map(row => row.m));

describe("小地圖標題", () => {
  it.each([1, 1.5, 2])("放大 %s 倍：找到橘色「地圖」按鈕（基準 82–118、39–50），不會找到標題列的楓葉", async scale => {
    const button = findMapButton(await loadFixture("window-1364.png", scale))!;
    expect(button.x0 / scale).toBeCloseTo(82, -1);
    expect(button.y0 / scale).toBeCloseTo(39, -1);
    expect((button.x1 - button.x0) / (button.y1 - button.y0)).toBeGreaterThan(2.5);
  });

  it("讀得到兩行、簽章固定（同一張畫面兩次一樣）", async () => {
    const frame = await loadFixture("window-1364.png");
    const a = readTitle(frame, names)!;
    const b = readTitle(frame, names)!;
    expect(a.signature).toBe(b.signature);
    expect(a.street.length).toBeGreaterThan(10);
    expect(a.name.length).toBeGreaterThan(100);
  });

  it("記過的簽章直接用記下的地圖", () => {
    const title: TitleReading = { signature: "abc", street: [], name: [] };
    expect(resolveMap(title, maps, trainingIds, { abc: 105040303 })).toEqual({ mapId: 105040303, confident: true, choices: [] });
  });

  it("街道＋地圖名一起排：明顯最像的才自動認，候選最多 5 張、同名的取有練功資料的那張", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "迷霧森林", d: 0.02 }, { text: "黃金海岸", d: 0.09 }],
      name: [{ text: "森林迷宮III", d: 0.03 }, { text: "森林迷宮II", d: 0.06 }, { text: "森林迷宮IV", d: 0.065 }],
    };
    const guess = resolveMap(title, maps, trainingIds, {});
    expect(guess.mapId).toBe(105040303);
    expect(guess.confident).toBe(true);
    expect(guess.choices[0]).toBe(105040303);
    expect(guess.choices.length).toBeLessThanOrEqual(5);
  });

  it("前兩名太接近：不自動認，給候選讓玩家點", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "迷霧森林", d: 0.02 }],
      name: [{ text: "森林迷宮III", d: 0.03 }, { text: "森林迷宮II", d: 0.032 }],
    };
    const guess = resolveMap(title, maps, trainingIds, {});
    expect(guess.confident).toBe(false);
    expect(guess.choices).toEqual(expect.arrayContaining([105040303, 105040302]));
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/read-map.test.ts`
Expected: FAIL，`../read-map` 不存在。

- [ ] **Step 3: 寫 read-map.ts**

```ts
// src/lib/speed/read-map.ts
import { rgbAt, type Frame } from "./frame";
import { bbox, grid, inkMask, type Mask } from "./ink";
import { rankText, type Ranked, type SpeedNames } from "./names";

type Area = { x0: number; x1: number; y0: number; y1: number };

const isOrange = (r: number, g: number, b: number) => r > 200 && g > 130 && g < 210 && b < 90;

/**
 * 小地圖右上角的橘色「地圖」按鈕：畫面左上三成裡的橘色連通塊，左右相鄰（6px 內）、上下重疊的併在一起，
 * 寬至少是高的 2.5 倍才算（視窗標題列的楓葉圖示是方的）。基準截圖 x 82–118、y 39–50。
 */
export function findMapButton(frame: Frame): Area | null {
  const w = Math.floor(frame.width * 0.3);
  const h = Math.floor(frame.height * 0.3);
  const seen = new Uint8Array(w * h);
  const blobs: Area[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !isOrange(...rgbAt(frame, x, y))) continue;
      const blob = { x0: x, x1: x + 1, y0: y, y1: y + 1 };
      const stack = [y * w + x];
      seen[y * w + x] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        const cx = k % w;
        const cy = (k - cx) / w;
        blob.x0 = Math.min(blob.x0, cx);
        blob.x1 = Math.max(blob.x1, cx + 1);
        blob.y0 = Math.min(blob.y0, cy);
        blob.y1 = Math.max(blob.y1, cy + 1);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || !isOrange(...rgbAt(frame, nx, ny))) continue;
          seen[ny * w + nx] = 1;
          stack.push(ny * w + nx);
        }
      }
      blobs.push(blob);
    }
  }
  blobs.sort((a, b) => a.x0 - b.x0);
  const merged: Area[] = [];
  for (const blob of blobs) {
    const near = merged.find(group => blob.x0 - group.x1 <= 6 && blob.x1 >= group.x0 - 6 && blob.y0 < group.y1 && blob.y1 > group.y0);
    if (near) {
      near.x0 = Math.min(near.x0, blob.x0);
      near.x1 = Math.max(near.x1, blob.x1);
      near.y0 = Math.min(near.y0, blob.y0);
      near.y1 = Math.max(near.y1, blob.y1);
    } else merged.push({ ...blob });
  }
  return merged.find(group => group.y1 - group.y0 >= 6 && (group.x1 - group.x0) >= 2.5 * (group.y1 - group.y0)) ?? null;
}

export type TitleReading = { signature: string; street: Ranked[]; name: Ranked[] };

/** 一行字縮成 4×cols 的黑白格子，當成這行字的「長相」：同一個視窗大小下同一張圖每次都一樣 */
function shape(mask: Mask, cols: number): string {
  const box = bbox(mask);
  if (!box) return "";
  return Array.from(grid(mask, box, cols, 4), value => (value > 0.4 ? "1" : "0")).join("");
}

/**
 * 按鈕下面兩行：街道名、地圖名（基準：按鈕下緣往下 11～25px、27～41px，左從按鈕左緣往左 35px 到按鈕右緣；照按鈕高等比例）。
 * signature：兩行的長相，拿來記「這個長相是哪張圖」跟偵測換圖。小地圖收起來（沒有字）回 null。
 */
export function readTitle(frame: Frame, names: SpeedNames): TitleReading | null {
  const button = findMapButton(frame);
  if (!button) return null;
  const bh = button.y1 - button.y0;
  const x = button.x0 - 3.2 * bh;
  const w = button.x1 - x;
  const streetMask = inkMask(frame, { x, y: button.y1 + 1.0 * bh, w, h: 1.27 * bh }, true, 0.99);
  const nameMask = inkMask(frame, { x, y: button.y1 + 2.45 * bh, w, h: 1.28 * bh }, true, 0.99);
  if (!streetMask || !nameMask) return null;
  const signature = `${shape(streetMask, 16)}:${shape(nameMask, 32)}`;
  if (!signature.includes("1")) return null;
  return { signature, street: rankText(streetMask, names.titles, names.gh), name: rankText(nameMask, names.titles, names.gh) };
}

export type MapGuess = { mapId: number | null; confident: boolean; choices: number[] };

/** 自動認的門檻：最像的那張（街道＋地圖名兩個差加起來）要夠像，而且跟下一張不同名的差夠多 */
const MAX_D = 0.16;
const MIN_GAP = 0.012;

/**
 * 標題 → 地圖 id。先看記過的（玩家點選過的長相）；再拿每張有中文名的地圖「街道差＋地圖名差」排。
 * 同一個「街道｜名字」有好幾個 id 時，取有練功資料的那張，都沒有取 id 小的。
 */
export function resolveMap(
  title: TitleReading,
  maps: Record<string, { zh: string; st: string }>,
  trainingIds: Set<number>,
  memory: Record<string, number>,
): MapGuess {
  const remembered = memory[title.signature];
  if (remembered !== undefined) return { mapId: remembered, confident: true, choices: [] };
  const streetD = new Map(title.street.map(row => [row.text, row.d]));
  const nameD = new Map(title.name.map(row => [row.text, row.d]));
  const byKey = new Map<string, { id: number; d: number; trained: boolean }>();
  for (const [key, record] of Object.entries(maps)) {
    if (!record.zh) continue;
    const a = streetD.get(record.st);
    const b = nameD.get(record.zh);
    if (a === undefined || b === undefined) continue;
    const id = Number(key);
    const pair = `${record.st}|${record.zh}`;
    const trained = trainingIds.has(id);
    const old = byKey.get(pair);
    if (!old || (trained && !old.trained) || (trained === old.trained && id < old.id)) byKey.set(pair, { id, d: a + b, trained });
  }
  const ranked = [...byKey.values()].sort((p, q) => p.d - q.d);
  if (!ranked.length) return { mapId: null, confident: false, choices: [] };
  const [best, next] = ranked;
  const confident = best.d <= MAX_D && (!next || next.d - best.d >= MIN_GAP);
  return { mapId: confident ? best.id : null, confident, choices: ranked.slice(0, 5).map(row => row.id) };
}
```

- [ ] **Step 4: 跑測試**

Run: `npx vitest run src/lib/speed/__tests__/read-map.test.ts`
Expected: 全過。

- [ ] **Step 5: 用基準截圖量一次真的排名（記錄，不當測試）**

```bash
npx vitest run src/lib/speed/__tests__/read-map.test.ts -t "簽章" --reporter=verbose
```

另外在測試檔最下面暫時加一段 `console.log(resolveMap(readTitle(frame, names)!, maps, trainingIds, {}))` 看結果，記到 PR 說明，然後拿掉。
2026-10-13 雛型在這張**有損**截圖上認不出（街道名被壓糊），預期 `confident: false`。這不是錯：頁面會讓玩家從候選點一次、之後記住。

- [ ] **Step 6: 有無損截圖時選小地圖標題的字型**

先看 `src/lib/speed/__fixtures__/` 有沒有使用者給的無損 PNG（檔名 `lossless-*.png`；沒有就跳過這一步，`TITLE_FONT` 維持微軟正黑體，PR 說明寫「小地圖標題等無損截圖再調」）。
有的話：在 `glyphs.gen.ts` 把 `TITLE_FONT` 依序換成 `C:/Windows/Fonts/msjh.ttc`、客戶端內嵌的 Gulim（從 `D:/屁哥/maplestory_classic/Maplestory_Classic_Data/StreamingAssets/aa/w/prefab_92f0a4d0c9ccb93c6b19fd0343b50120.bundle` 用 `node scripts/client/decomp.mjs` 解開後找 `ttcf` 開頭那段存成 .ttc，見 scratchpad `spike/font_42370928.ttc` 的抽法：TTC 表頭算最大 offset+length）、`C:/Windows/Fonts/mingliu.ttc`，各跑一次 `npm run speed:glyphs`，看哪個讓無損截圖的 `resolveMap` 拿到 `confident: true` 且是對的那張；選它，加一個 `it` 把那張無損截圖的結果鎖起來。

- [ ] **Step 7: Commit**

```bash
git add src/lib/speed public/data/speed-names.json
git commit -m "v0.95: 練功測速——小地圖標題：找橘色地圖按鈕、讀街道名跟地圖名、對到地圖（不夠像就給候選讓玩家點，點過的記住）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 一張畫面全部讀完

**Files:**
- Create: `src/lib/speed/read-frame.ts`
- Test: `src/lib/speed/__tests__/read-frame.test.ts`

**Interfaces:**
- Consumes: `findStatusBar`、`readExpText`、`parseExp`、`ExpReading`、`readJob`、`readParty`、`readTitle`、`TitleReading`、`SpeedNames`
- Produces:
  - `type ReaderInit = { toNext: number[]; names: SpeedNames }`
  - `type FrameReading = { bar: boolean; exp: ExpReading | null; job: number | null; party: number; title: TitleReading | null }`
  - `readFrame(frame, init, hints: number[]): FrameReading`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/read-frame.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNames } from "../names";
import { readFrame } from "../read-frame";
import { loadFixture } from "./fixture";

const init = {
  toNext: JSON.parse(fs.readFileSync("public/data/guides/common.json", "utf8")).expTable.toNext as number[],
  names: parseNames(JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8"))),
};

describe("一張畫面全部讀完", () => {
  it("基準截圖：46 等、406947 經驗、冰雷巫師、單練、有小地圖標題", async () => {
    const reading = readFrame(await loadFixture("window-1364.png"), init, []);
    expect(reading.bar).toBe(true);
    expect(reading.exp).toMatchObject({ exp: 406947, level: 46 });
    expect(reading.job).toBe(220);
    expect(reading.party).toBe(1);
    expect(reading.title).not.toBeNull();
  });

  it("不是遊戲畫面：什麼都沒有", () => {
    const frame = { width: 640, height: 360, data: new Uint8ClampedArray(640 * 360 * 4).fill(255) };
    expect(readFrame(frame, init, [])).toEqual({ bar: false, exp: null, job: null, party: 1, title: null });
  });

  it("一張 1364×799 讀完要在 150ms 內（每秒讀一張，不能吃電腦）", async () => {
    const frame = await loadFixture("window-1364.png");
    readFrame(frame, init, []);
    const start = performance.now();
    readFrame(frame, init, [46, 47]);
    expect(performance.now() - start).toBeLessThan(150);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/read-frame.test.ts`
Expected: FAIL。

- [ ] **Step 3: 寫 read-frame.ts**

```ts
// src/lib/speed/read-frame.ts
import type { Frame } from "./frame";
import type { SpeedNames } from "./names";
import { parseExp, readExpText, type ExpReading } from "./read-exp";
import { readJob } from "./read-job";
import { readTitle, type TitleReading } from "./read-map";
import { readParty } from "./read-party";
import { findStatusBar } from "./status-bar";

export type ReaderInit = { toNext: number[]; names: SpeedNames };
export type FrameReading = { bar: boolean; exp: ExpReading | null; job: number | null; party: number; title: TitleReading | null };

/** hints：已經知道的等級（現在這級、下一級），讓 % 很小的時候也認得出等級 */
export function readFrame(frame: Frame, init: ReaderInit, hints: number[]): FrameReading {
  const bar = findStatusBar(frame);
  if (!bar) return { bar: false, exp: null, job: null, party: 1, title: null };
  return {
    bar: true,
    exp: parseExp(readExpText(frame, bar), init.toNext, hints),
    job: readJob(frame, bar, init.names),
    party: readParty(frame, bar),
    title: readTitle(frame, init.names),
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/speed/__tests__/read-frame.test.ts`
Expected: 全過。150ms 那題紅的話：`findStatusBar` 掃下面兩成每一格最花時間，改成每隔 2 列掃一次（`y += 2`）再量。

- [ ] **Step 5: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——一張畫面讀完（經驗、等級、職業、組隊、小地圖標題）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 一段怎麼算（tracker）

**Files:**
- Create: `src/lib/speed/tracker.ts`、`src/lib/speed/format.ts`
- Test: `src/lib/speed/__tests__/tracker.test.ts`

**Interfaces:**
- Produces:
  - `type Mode = "auto" | "manual"`
  - `type Sample = { at: number; exp: number; level: number; mapKey: string | null; mapId: number | null; job: number | null; party: number }`
  - `type Segment = { mode: Mode; startedAt: number; endedAt: number; lastChangeAt: number; startLevel: number; level: number; exp: number; job: number | null; party: number; mapKey: string | null; gained: number; levelUps: number; deaths: number; byMap: Record<string, { mapId: number | null; gained: number }> }`
  - `type Tracker = { mode: Mode; manualOn: boolean; manualStartedAt: number | null; last: Sample | null; pending: Sample | null; seg: Segment | null }`
  - `type Step = { tracker: Tracker; closed: Segment | null }`
  - `createTracker(mode)`、`feed(t, sample, toNext): Step`、`tick(t, now): Step`、`startManual(t, now): Tracker`、`stopManual(t, now): Step`、`switchMode(t, mode, now): Step`
  - `durationMs(seg)`、`tenMinuteExp(seg): number | null`、`minutesToLevel(seg, toNext): number | null`、`mainMap(seg): { key: string | null; mapId: number | null }`、`shouldSave(seg): boolean`、`levelHints(t): number[]`
  - `IDLE_MS = 60_000`、`MIN_SAVE_MS = 300_000`
  - format.ts：`durationText(ms): string`（「12 分」「1 小時 5 分」）、`etaText(minutes): string`（「約 25 分鐘」「約 3 小時 10 分」「超過 24 小時」）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/tracker.test.ts
import { describe, expect, it } from "vitest";
import {
  createTracker, durationMs, feed, mainMap, minutesToLevel, shouldSave, startManual, stopManual, switchMode, tenMinuteExp, tick,
  type Sample, type Tracker,
} from "../tracker";
import { durationText, etaText } from "../format";

const toNext = Array.from({ length: 121 }, (_, level) => level * 1000);
const S = (at: number, exp: number, level = 10, extra: Partial<Sample> = {}): Sample => ({ at, exp, level, mapKey: "m1", mapId: 1, job: 220, party: 1, ...extra });

function run(t: Tracker, samples: Sample[]) {
  const closed = [];
  for (const sample of samples) {
    const step = feed(t, sample, toNext);
    t = step.tracker;
    if (step.closed) closed.push(step.closed);
  }
  return { t, closed };
}

describe("自動模式", () => {
  it("前兩張等級一樣才當起點；經驗一動才開始，那一下不算", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100)]);
    expect(t.seg).toMatchObject({ startedAt: 2000, gained: 0 });
  });

  it("之後的變動累加；60 秒沒動自動停，結束時間是最後一次變動", () => {
    let { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(62_000, 1300)]);
    expect(t.seg!.gained).toBe(200);
    expect(tick(t, 100_000).closed).toBeNull();
    const step = tick(t, 122_000);
    expect(step.closed).toMatchObject({ endedAt: 62_000, gained: 200 });
    expect(durationMs(step.closed!)).toBe(60_000);
    t = step.tracker;
    expect(t.seg).toBeNull();
  });

  it("升級：上一級剩的＋新一級的", () => {
    const { t } = run(createTracker("auto"), [S(0, 9900), S(1000, 9900), S(2000, 9950), S(3000, 30, 11)]);
    expect(t.seg).toMatchObject({ gained: 80, levelUps: 1, level: 11 });
  });

  it("死掉（少 1% 以上）照扣、記一次；少一點點當認錯丟掉", () => {
    let { t } = run(createTracker("auto"), [S(0, 5000), S(1000, 5000), S(2000, 5100), S(3000, 5200)]);
    t = run(t, [S(4000, 5195)]).t;
    expect(t.seg).toMatchObject({ gained: 100, deaths: 0 });
    t = run(t, [S(5000, 4700)]).t;
    expect(t.seg).toMatchObject({ gained: -400, deaths: 1 });
  });

  it("等級跳兩級、等級變少：當認錯丟掉", () => {
    const { t } = run(createTracker("auto"), [S(0, 5000), S(1000, 5000), S(2000, 5100), S(3000, 10, 13), S(4000, 10, 9)]);
    expect(t.last!.level).toBe(10);
    expect(t.seg!.gained).toBe(0);
  });

  it("換地圖：舊的這段收掉，新圖經驗一動再開新的一段", () => {
    const { t, closed } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(3000, 1200), S(4000, 1300, 10, { mapKey: "m2", mapId: 2 })]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ mapKey: "m1", gained: 100 });
    expect(t.seg).toMatchObject({ mapKey: "m2", startedAt: 4000, gained: 0 });
  });

  it("組隊人數取這段看過最多的", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(3000, 1200, 10, { party: 3 }), S(4000, 1300)]);
    expect(t.seg!.party).toBe(3);
  });
});

describe("手動模式", () => {
  it("按開始才算、不會自己停、換圖也不停；按停止才收，時間算到按停止", () => {
    let t = run(createTracker("manual"), [S(0, 1000), S(1000, 1000)]).t;
    t = startManual(t, 1500);
    const result = run(t, [S(2000, 1100), S(3000, 1300, 10, { mapKey: "m2", mapId: 2 }), S(4000, 1350, 10, { mapKey: "m2", mapId: 2 })]);
    expect(result.closed).toHaveLength(0);
    expect(tick(result.t, 999_999).closed).toBeNull();
    const step = stopManual(result.t, 600_000);
    expect(step.closed).toMatchObject({ startedAt: 1500, endedAt: 600_000, gained: 350 });
    expect(mainMap(step.closed!)).toEqual({ key: "m2", mapId: 2 });
    expect(durationMs(step.closed!)).toBe(598_500);
  });

  it("還沒讀到任何畫面就按開始：第一張讀數當起點", () => {
    let t = startManual(createTracker("manual"), 0);
    t = run(t, [S(1000, 1000), S(2000, 1000), S(3000, 1100)]).t;
    expect(t.seg).toMatchObject({ startedAt: 0, gained: 100 });
  });

  it("切模式會收掉進行中的那段", () => {
    let t = startManual(run(createTracker("manual"), [S(0, 1000), S(1000, 1000)]).t, 1000);
    t = run(t, [S(2000, 1500)]).t;
    const step = switchMode(t, "auto", 5000);
    expect(step.closed).toMatchObject({ gained: 500, endedAt: 5000 });
    expect(step.tracker.mode).toBe("auto");
    expect(step.tracker.seg).toBeNull();
  });
});

describe("算出來的數字", () => {
  it("10 分鐘經驗用最後一次變動的時間算（休息時不會往下掉）；不到 30 秒不算", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(62_000, 1700)]);
    expect(tenMinuteExp(t.seg!)).toBe(6000);
    const short = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(12_000, 1200)]).t;
    expect(tenMinuteExp(short.seg!)).toBeNull();
  });

  it("升級還要幾分鐘＝（這級要的−現在）÷ 每分鐘", () => {
    const { t } = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100), S(62_000, 1700)]);
    expect(minutesToLevel(t.seg!, toNext)).toBeCloseTo(((10_000 - 1700) / 6000) * 10);
  });

  it("滿 5 分鐘、有拿到經驗才存", () => {
    const base = run(createTracker("auto"), [S(0, 1000), S(1000, 1000), S(2000, 1100)]).t;
    expect(shouldSave({ ...base.seg!, lastChangeAt: 2000 + 299_000, gained: 10 })).toBe(false);
    expect(shouldSave({ ...base.seg!, lastChangeAt: 2000 + 300_000, gained: 10 })).toBe(true);
    expect(shouldSave({ ...base.seg!, lastChangeAt: 2000 + 300_000, gained: 0 })).toBe(false);
  });

  it("時間的字", () => {
    expect(durationText(12 * 60_000 + 5000)).toBe("12 分");
    expect(durationText(65 * 60_000)).toBe("1 小時 5 分");
    expect(etaText(25.2)).toBe("約 26 分鐘");
    expect(etaText(190)).toBe("約 3 小時 10 分");
    expect(etaText(60 * 30)).toBe("超過 24 小時");
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/tracker.test.ts`
Expected: FAIL。

- [ ] **Step 3: 寫 tracker.ts**

```ts
// src/lib/speed/tracker.ts
/**
 * 練功測速「一段」怎麼算（spec「一段怎麼算」）。純函式：每秒丟一張讀數進來，回新的狀態跟剛收掉的那段。
 * - 自動：經驗一動才開始（那一下不算，起點就是那一刻）；60 秒沒動就停，結束算在最後一次變動；換地圖收掉。
 * - 手動：按開始到按停止，中間不停、換圖不停；地圖記拿最多經驗的那張。
 * - 升級：上一級剩的＋新一級的；死掉（少了這級升級經驗 1% 以上）照扣；少一點點、跳兩級、等級變少都當認錯丟掉。
 * - 起點要兩張等級一樣的讀數（第一次反推等級可能剛好對錯）。
 */
export type Mode = "auto" | "manual";
export type Sample = { at: number; exp: number; level: number; mapKey: string | null; mapId: number | null; job: number | null; party: number };
export type Segment = {
  mode: Mode;
  startedAt: number;
  endedAt: number;
  lastChangeAt: number;
  startLevel: number;
  level: number;
  exp: number;
  job: number | null;
  party: number;
  mapKey: string | null;
  gained: number;
  levelUps: number;
  deaths: number;
  byMap: Record<string, { mapId: number | null; gained: number }>;
};
export type Tracker = { mode: Mode; manualOn: boolean; manualStartedAt: number | null; last: Sample | null; pending: Sample | null; seg: Segment | null };
export type Step = { tracker: Tracker; closed: Segment | null };

export const IDLE_MS = 60_000;
export const MIN_SAVE_MS = 5 * 60_000;
const DEATH_SHARE = 0.01;

export function createTracker(mode: Mode): Tracker {
  return { mode, manualOn: false, manualStartedAt: null, last: null, pending: null, seg: null };
}

type Gain = { gain: number; levelUp: boolean; death: boolean };

function gainBetween(prev: Sample, next: Sample, toNext: number[]): Gain | null {
  if (next.level === prev.level) {
    const diff = next.exp - prev.exp;
    if (diff >= 0) return { gain: diff, levelUp: false, death: false };
    return -diff >= (toNext[prev.level] ?? 0) * DEATH_SHARE ? { gain: diff, levelUp: false, death: true } : null;
  }
  if (next.level === prev.level + 1) return { gain: Math.max(0, (toNext[prev.level] ?? 0) - prev.exp) + next.exp, levelUp: true, death: false };
  return null;
}

function newSegment(mode: Mode, from: Sample, at: number): Segment {
  return {
    mode, startedAt: at, endedAt: at, lastChangeAt: at, startLevel: from.level, level: from.level, exp: from.exp,
    job: from.job, party: from.party, mapKey: from.mapKey, gained: 0, levelUps: 0, deaths: 0, byMap: {},
  };
}

function withSample(seg: Segment, sample: Sample, gain: Gain | null): Segment {
  const next: Segment = { ...seg, level: sample.level, exp: sample.exp, job: sample.job ?? seg.job, party: Math.max(seg.party, sample.party) };
  if (!gain || gain.gain === 0) return next;
  const key = sample.mapKey ?? "?";
  const slot = seg.byMap[key] ?? { mapId: sample.mapId, gained: 0 };
  return {
    ...next,
    gained: seg.gained + gain.gain,
    levelUps: seg.levelUps + (gain.levelUp ? 1 : 0),
    deaths: seg.deaths + (gain.death ? 1 : 0),
    lastChangeAt: sample.at,
    endedAt: seg.mode === "auto" ? sample.at : seg.endedAt,
    byMap: { ...seg.byMap, [key]: { mapId: slot.mapId ?? sample.mapId, gained: slot.gained + gain.gain } },
  };
}

export function feed(t: Tracker, sample: Sample, toNext: number[]): Step {
  if (!t.last) {
    if (t.pending && t.pending.level === sample.level) {
      const seg = t.mode === "manual" && t.manualOn && !t.seg ? newSegment("manual", sample, t.manualStartedAt ?? sample.at) : t.seg;
      return { tracker: { ...t, last: sample, pending: null, seg }, closed: null };
    }
    return { tracker: { ...t, pending: sample }, closed: null };
  }
  const gain = gainBetween(t.last, sample, toNext);
  if (!gain) return { tracker: t, closed: null };
  let seg = t.seg;
  let closed: Segment | null = null;
  if (t.mode === "auto") {
    if (seg && sample.mapKey && seg.mapKey && sample.mapKey !== seg.mapKey) {
      closed = seg;
      seg = null;
    }
    if (!seg) {
      if (gain.gain > 0) seg = newSegment("auto", sample, sample.at);
    } else seg = withSample(seg, sample, gain);
  } else if (t.manualOn) {
    seg = withSample(seg ?? newSegment("manual", t.last, t.manualStartedAt ?? sample.at), sample, gain);
  }
  return { tracker: { ...t, last: sample, seg }, closed };
}

export function tick(t: Tracker, now: number): Step {
  if (t.mode !== "auto" || !t.seg || now - t.seg.lastChangeAt < IDLE_MS) return { tracker: t, closed: null };
  return { tracker: { ...t, seg: null }, closed: { ...t.seg, endedAt: t.seg.lastChangeAt } };
}

export function startManual(t: Tracker, now: number): Tracker {
  const seg = t.last ? newSegment("manual", t.last, now) : null;
  return { ...t, manualOn: true, manualStartedAt: now, seg };
}

export function stopManual(t: Tracker, now: number): Step {
  return { tracker: { ...t, manualOn: false, manualStartedAt: null, seg: null }, closed: t.seg ? { ...t.seg, endedAt: now } : null };
}

export function switchMode(t: Tracker, mode: Mode, now: number): Step {
  const closed = t.seg ? { ...t.seg, endedAt: t.seg.mode === "auto" ? t.seg.lastChangeAt : now } : null;
  return { tracker: { ...createTracker(mode), last: t.last, pending: t.pending }, closed };
}

/** 這段多長：自動算到最後一次變動；手動算到按停止（進行中算到最後一次讀數由畫面自己用現在時間算） */
export function durationMs(seg: Segment): number {
  return (seg.mode === "auto" ? seg.lastChangeAt : seg.endedAt) - seg.startedAt;
}

/** 畫面上的 10 分鐘經驗：拿到的 ÷（最後一次變動 − 開始），不到 30 秒或還沒拿到不算 */
export function tenMinuteExp(seg: Segment): number | null {
  const ms = seg.lastChangeAt - seg.startedAt;
  return ms >= 30_000 && seg.gained > 0 ? Math.round((seg.gained / ms) * 600_000) : null;
}

export function minutesToLevel(seg: Segment, toNext: number[]): number | null {
  const per10 = tenMinuteExp(seg);
  const need = (toNext[seg.level] ?? 0) - seg.exp;
  return per10 && need > 0 ? (need / per10) * 10 : null;
}

/** 這段算在哪張圖：拿最多經驗的那張（自動模式一段只有一張） */
export function mainMap(seg: Segment): { key: string | null; mapId: number | null } {
  let best: { key: string | null; mapId: number | null; gained: number } = { key: seg.mapKey, mapId: null, gained: -Infinity };
  for (const [key, slot] of Object.entries(seg.byMap)) if (slot.gained > best.gained) best = { key, mapId: slot.mapId, gained: slot.gained };
  return { key: best.key, mapId: best.mapId };
}

export function shouldSave(seg: Segment): boolean {
  return durationMs(seg) >= MIN_SAVE_MS && seg.gained > 0;
}

/** 給讀畫面用的等級提示：知道現在幾等就給這級跟下一級 */
export function levelHints(t: Tracker): number[] {
  return t.last ? [t.last.level, t.last.level + 1] : [];
}
```

- [ ] **Step 4: 寫 format.ts**

```ts
// src/lib/speed/format.ts
/** 「12 分」「1 小時 5 分」（無條件捨去到分） */
export function durationText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小時 ${minutes % 60} 分` : `${minutes} 分`;
}

/** 升級還要多久：「約 26 分鐘」「約 3 小時 10 分」，超過一天寫「超過 24 小時」（無條件進位到分） */
export function etaText(minutes: number): string {
  const total = Math.ceil(minutes);
  if (total > 24 * 60) return "超過 24 小時";
  const hours = Math.floor(total / 60);
  return hours ? `約 ${hours} 小時 ${total % 60} 分` : `約 ${total} 分鐘`;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/lib/speed/__tests__/tracker.test.ts`
Expected: 全過。

- [ ] **Step 6: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——一段怎麼算：自動（60 秒沒動停、換圖收）／手動（按開始到停止），升級、死亡、認錯丟掉

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 存一筆的規則（純函式）

**Files:**
- Create: `src/lib/speed/server/rules.ts`
- Test: `src/lib/speed/__tests__/rules.test.ts`

**Interfaces:**
- Consumes: `TrainingRow`、`Monster`（src/lib/types.ts）
- Produces:
  - `type RunPayload = { mapId: number | null; mapName: string | null; level: number; job: number | null; charId: string; isPublic: boolean; partySize: number; mode: "auto" | "manual"; startedAt: string; durationSec: number; expGained: number; levelUps: number; deaths: number; clientVer: string }`
  - `type RunRow = RunPayload & { expPer10: number; ranked: boolean }`
  - `checkRun(body: unknown): { ok: true; run: RunPayload } | { ok: false; error: string }`
  - `expPer10(gained, sec): number`
  - `mapCap(mapId, training, monsters): number | null`
  - `toRow(run, cap: number | null): RunRow`
  - `RANK_MIN_SEC = 600`、`RATE_LIMIT_PER_MIN = 6`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/rules.test.ts
import { describe, expect, it } from "vitest";
import type { Monster, TrainingRow } from "@/lib/types";
import { checkRun, expPer10, mapCap, toRow, type RunPayload } from "../server/rules";

const run: RunPayload = {
  mapId: 105040303, mapName: "森林迷宮III", level: 46, job: 220, charId: "芙莉蓮熊芙莉", isPublic: false, partySize: 1, mode: "auto",
  startedAt: "2026-10-13T10:00:00.000Z", durationSec: 900, expGained: 150_000, levelUps: 0, deaths: 0, clientVer: "v0.95",
};

describe("存一筆的檢查", () => {
  it("正常的過；ID 前後空白去掉", () => {
    expect(checkRun({ ...run, charId: "  芙莉蓮熊芙莉 " })).toEqual({ ok: true, run });
  });

  it.each([
    [{ level: 0 }, "等級"],
    [{ level: 121 }, "等級"],
    [{ durationSec: 299 }, "時間"],
    [{ durationSec: 6 * 3600 + 1 }, "時間"],
    [{ expGained: -1 }, "經驗"],
    [{ charId: "a" }, "角色 ID"],
    [{ charId: "一二三四五六七八九十一二三" }, "角色 ID"],
    [{ partySize: 0 }, "組隊"],
    [{ partySize: 7 }, "組隊"],
    [{ mode: "fast" }, "模式"],
    [{ startedAt: "昨天" }, "開始時間"],
  ])("%o 不收（%s）", (patch, word) => {
    const result = checkRun({ ...run, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(word);
  });

  it("不是物件不收", () => {
    expect(checkRun(null).ok).toBe(false);
    expect(checkRun("x").ok).toBe(false);
  });
});

describe("10 分鐘經驗、上限、進排行", () => {
  it("10 分鐘經驗＝拿到的 ÷ 秒數 × 600", () => {
    expect(expPer10(150_000, 900)).toBe(100_000);
  });

  it("上限：每隻怪經驗 × 刷怪點 × (600 ÷ 重生秒數，最少 5 秒、0 當 7 秒) × 3", () => {
    const training = [{ m: 1, mobs: [[10, 20, 0], [11, 1, 10800]] }] as unknown as TrainingRow[];
    const monsters = [{ id: 10, exp: 50 }, { id: 11, exp: 9000 }] as unknown as Monster[];
    expect(mapCap(1, training, monsters)).toBe(Math.round((50 * 20 * (600 / 7) + 9000 * 1 * (600 / 10800)) * 3));
    expect(mapCap(2, training, monsters)).toBeNull();
  });

  it("進排行：滿 10 分鐘、有地圖、沒超過上限", () => {
    expect(toRow(run, 200_000)).toMatchObject({ expPer10: 100_000, ranked: true });
    expect(toRow({ ...run, durationSec: 599 }, 200_000).ranked).toBe(false);
    expect(toRow({ ...run, mapId: null }, 200_000).ranked).toBe(false);
    expect(toRow(run, 99_999).ranked).toBe(false);
    expect(toRow(run, null).ranked).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/rules.test.ts`
Expected: FAIL。

- [ ] **Step 3: 寫 rules.ts**

```ts
// src/lib/speed/server/rules.ts
import type { Monster, TrainingRow } from "@/lib/types";

/** 頁面送來的一段（spec「資料庫」）；伺服器自己算 10 分鐘經驗、進不進排行 */
export type RunPayload = {
  mapId: number | null;
  mapName: string | null;
  level: number;
  job: number | null;
  charId: string;
  isPublic: boolean;
  partySize: number;
  mode: "auto" | "manual";
  startedAt: string;
  durationSec: number;
  expGained: number;
  levelUps: number;
  deaths: number;
  clientVer: string;
};
export type RunRow = RunPayload & { expPer10: number; ranked: boolean };

export const RANK_MIN_SEC = 600;
export const RATE_LIMIT_PER_MIN = 6;
const LEEWAY = 3;

const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

export function checkRun(body: unknown): { ok: true; run: RunPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "格式不對" };
  const b = body as Record<string, unknown>;
  const charId = typeof b.charId === "string" ? b.charId.trim() : "";
  const length = Array.from(charId).length;
  if (length < 2 || length > 12) return { ok: false, error: "角色 ID 要 2～12 個字" };
  if (!isInt(b.level, 1, 120)) return { ok: false, error: "等級不對" };
  if (!isInt(b.durationSec, 300, 6 * 3600)) return { ok: false, error: "時間要 5 分鐘到 6 小時" };
  if (!isInt(b.expGained, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, error: "經驗不對" };
  if (!isInt(b.partySize, 1, 6)) return { ok: false, error: "組隊人數不對" };
  if (b.mode !== "auto" && b.mode !== "manual") return { ok: false, error: "模式不對" };
  if (typeof b.startedAt !== "string" || Number.isNaN(Date.parse(b.startedAt))) return { ok: false, error: "開始時間不對" };
  if (b.mapId !== null && !isInt(b.mapId, 0, 999_999_999)) return { ok: false, error: "地圖不對" };
  if (b.job !== null && !isInt(b.job, 0, 999)) return { ok: false, error: "職業不對" };
  return {
    ok: true,
    run: {
      mapId: b.mapId as number | null,
      mapName: typeof b.mapName === "string" ? b.mapName.slice(0, 40) : null,
      level: b.level,
      job: b.job as number | null,
      charId,
      isPublic: b.isPublic === true,
      partySize: b.partySize,
      mode: b.mode,
      startedAt: b.startedAt,
      durationSec: b.durationSec,
      expGained: b.expGained,
      levelUps: isInt(b.levelUps, 0, 120) ? b.levelUps : 0,
      deaths: isInt(b.deaths, 0, 1000) ? b.deaths : 0,
      clientVer: typeof b.clientVer === "string" ? b.clientVer.slice(0, 20) : "",
    },
  };
}

export function expPer10(gained: number, sec: number): number {
  return Math.round((gained / sec) * 600);
}

/**
 * 這張圖 10 分鐘理論上拿得到的經驗上限（防灌假資料用，故意算寬）：
 * 每隻怪經驗 × 刷怪點 × (600 ÷ 重生秒數)，再 × 3（組隊加成、活動、經驗卷的寬限）。重生秒數 0＝預設 7 秒，最少算 5 秒。
 * 沒有練功資料的圖回 null（不擋）。
 */
export function mapCap(mapId: number, training: TrainingRow[], monsters: Monster[]): number | null {
  const row = training.find(item => item.m === mapId);
  if (!row) return null;
  const expOf = new Map(monsters.map(monster => [monster.id, monster.exp]));
  let sum = 0;
  for (const [mobId, spawns, respawn] of row.mobs) sum += (expOf.get(mobId) ?? 0) * spawns * (600 / Math.max(5, respawn || 7));
  return Math.round(sum * LEEWAY);
}

export function toRow(run: RunPayload, cap: number | null): RunRow {
  const per10 = expPer10(run.expGained, run.durationSec);
  const ranked = run.durationSec >= RANK_MIN_SEC && run.mapId !== null && (cap === null || per10 <= cap);
  return { ...run, expPer10: per10, ranked };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/speed/__tests__/rules.test.ts`
Expected: 全過。

- [ ] **Step 5: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——存一筆的檢查、10 分鐘經驗、每張圖的理論上限、進不進排行

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 資料庫、API

**Files:**
- Create: `src/lib/speed/server/db.ts`、`src/app/api/speed/runs/route.ts`、`src/app/api/speed/board/route.ts`
- Test: `src/lib/speed/__tests__/api.test.ts`
- Modify: `package.json`（dependency `@neondatabase/serverless`）、`.env.example`

**Interfaces:**
- Consumes: `checkRun`、`toRow`、`mapCap`、`RATE_LIMIT_PER_MIN`、`RunRow`（Task 9）
- Produces:
  - `getSql(): NeonQueryFunction | null`（沒有 `DATABASE_URL` 回 null）、`ensureSchema(sql): Promise<void>`、`speedEnv(): string`
  - `POST /api/speed/runs` → 200 `{ ok: true, ranked: boolean }`、400 `{ ok: false, error }`、429、503 `{ ok: false, error: "排行還沒開" }`
  - `GET /api/speed/board?map=<id>` → 200 `{ open: boolean; solo: BoardRow[]; party: BoardRow[] }`
  - `type BoardRow = { name: string | null; job: number | null; level: number; expPer10: number; minutes: number; date: string }`（放 `src/lib/speed/server/rules.ts` 一起 export，頁面也 import 它）

- [ ] **Step 1: 裝套件**

```bash
npm i @neondatabase/serverless
```

`.env.example` 尾巴加：

```
# 練功測速的資料庫（Vercel 專案頁 Storage → Neon 建好後 Vercel 自動放進環境變數，本機不用設；沒設時頁面照樣能量，只是存不了）
# DATABASE_URL=postgres://...
# 擋灌資料用的網路位址雜湊鹽（沒設用預設值；正式機建議在 Vercel 設一個）
# SPEED_SALT=
```

- [ ] **Step 2: rules.ts 加 BoardRow 型別**

```ts
/** 排行一列：name 是 null 代表沒公開（畫面寫「匿名玩家」） */
export type BoardRow = { name: string | null; job: number | null; level: number; expPer10: number; minutes: number; date: string };
```

- [ ] **Step 3: 寫 db.ts**

```ts
// src/lib/speed/server/db.ts
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * 練功測速的資料庫（Neon，Vercel 整合給 DATABASE_URL）。沒設就回 null，API 回 503「排行還沒開」。
 * 建表在第一次呼叫時做（CREATE … IF NOT EXISTS，不刪不改）；同一個執行個體只做一次。
 */
export function getSql(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}

/** 排行只看同一個環境：測試機（preview）的資料不會混進正式機 */
export function speedEnv(): string {
  return process.env.VERCEL_ENV ?? "development";
}

let ready: Promise<void> | null = null;

export function ensureSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS speed_runs (
        id bigserial PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        env text NOT NULL,
        map_id integer,
        map_name text,
        level integer NOT NULL,
        job integer,
        char_id text NOT NULL,
        is_public boolean NOT NULL DEFAULT false,
        party_size integer NOT NULL,
        mode text NOT NULL,
        started_at timestamptz NOT NULL,
        duration_sec integer NOT NULL,
        exp_gained bigint NOT NULL,
        exp_per_10min bigint NOT NULL,
        level_ups integer NOT NULL DEFAULT 0,
        deaths integer NOT NULL DEFAULT 0,
        ranked boolean NOT NULL,
        ip_hash text NOT NULL,
        client_ver text
      )`;
      await sql`CREATE INDEX IF NOT EXISTS speed_runs_board ON speed_runs (env, map_id, ranked, exp_per_10min DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS speed_runs_char ON speed_runs (env, char_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS speed_runs_ip ON speed_runs (ip_hash, created_at DESC)`;
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
}
```

- [ ] **Step 4: 寫 POST route**

```ts
// src/app/api/speed/runs/route.ts
import { createHash } from "node:crypto";
import monsters from "../../../../../public/data/monsters.json";
import training from "../../../../../public/data/training.json";
import { ensureSchema, getSql, speedEnv } from "@/lib/speed/server/db";
import { checkRun, mapCap, RATE_LIMIT_PER_MIN, toRow } from "@/lib/speed/server/rules";
import type { Monster, TrainingRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// TODO(練功測速)：正式機在 Vercel 設 SPEED_SALT；沒設時用這個預設值（只拿來擋同一個位址一直送）
const SALT = process.env.SPEED_SALT ?? "maplebook-speed";

function ipHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${SALT}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(request: Request): Promise<Response> {
  const sql = getSql();
  if (!sql) return Response.json({ ok: false, error: "排行還沒開" }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "格式不對" }, { status: 400 });
  }
  const checked = checkRun(body);
  if (!checked.ok) return Response.json(checked, { status: 400 });
  await ensureSchema(sql);
  const hash = ipHash(request);
  const [{ count }] = (await sql`SELECT count(*)::int AS count FROM speed_runs WHERE ip_hash = ${hash} AND created_at > now() - interval '1 minute'`) as { count: number }[];
  if (count >= RATE_LIMIT_PER_MIN) return Response.json({ ok: false, error: "送太快了，等一下再存" }, { status: 429 });
  const run = checked.run;
  const row = toRow(run, run.mapId === null ? null : mapCap(run.mapId, training as TrainingRow[], monsters as Monster[]));
  await sql`INSERT INTO speed_runs (env, map_id, map_name, level, job, char_id, is_public, party_size, mode, started_at, duration_sec, exp_gained, exp_per_10min, level_ups, deaths, ranked, ip_hash, client_ver)
    VALUES (${speedEnv()}, ${row.mapId}, ${row.mapName}, ${row.level}, ${row.job}, ${row.charId}, ${row.isPublic}, ${row.partySize}, ${row.mode}, ${row.startedAt}, ${row.durationSec}, ${row.expGained}, ${row.expPer10}, ${row.levelUps}, ${row.deaths}, ${row.ranked}, ${hash}, ${row.clientVer})`;
  return Response.json({ ok: true, ranked: row.ranked });
}
```

（JSON 的相對路徑：`src/app/api/speed/runs/route.ts` 往上 5 層到 repo 根目錄。tsconfig 要有 `resolveJsonModule`——現在 `glyphs.ts` 也 import JSON，Task 2 已經驗證過可以。）

- [ ] **Step 5: 寫 GET route**

```ts
// src/app/api/speed/board/route.ts
import { ensureSchema, getSql, speedEnv } from "@/lib/speed/server/db";
import type { BoardRow } from "@/lib/speed/server/rules";

export const dynamic = "force-dynamic";

type Raw = { char_id: string; job: number | null; level: number; exp_per_10min: string | number; duration_sec: number; created_at: string; show: boolean };

function toBoard(rows: Raw[]): BoardRow[] {
  return rows.map(row => ({
    name: row.show ? row.char_id : null,
    job: row.job,
    level: row.level,
    expPer10: Number(row.exp_per_10min),
    minutes: Math.round(row.duration_sec / 60),
    date: new Date(row.created_at).toISOString().slice(0, 10),
  }));
}

/**
 * 一張圖的排行：單練、組隊各前 10。每個角色只留最好的一筆；
 * 公開與否看這個角色最新的一筆（之後改成不公開，舊紀錄也一起變匿名）。快取 5 分鐘。
 */
export async function GET(request: Request): Promise<Response> {
  const map = Number(new URL(request.url).searchParams.get("map"));
  if (!Number.isInteger(map) || map <= 0) return Response.json({ open: false, solo: [], party: [] }, { status: 400 });
  const sql = getSql();
  if (!sql) return Response.json({ open: false, solo: [], party: [] });
  await ensureSchema(sql);
  const env = speedEnv();
  const board = async (solo: boolean) =>
    toBoard((await sql`
      WITH latest AS (
        SELECT DISTINCT ON (char_id) char_id, is_public FROM speed_runs WHERE env = ${env} ORDER BY char_id, created_at DESC
      ), best AS (
        SELECT DISTINCT ON (char_id) char_id, job, level, exp_per_10min, duration_sec, created_at FROM speed_runs
        WHERE env = ${env} AND map_id = ${map} AND ranked AND (party_size = 1) = ${solo}
        ORDER BY char_id, exp_per_10min DESC
      )
      SELECT best.*, latest.is_public AS show FROM best JOIN latest USING (char_id)
      ORDER BY exp_per_10min DESC LIMIT 10`) as Raw[]);
  const [solo, party] = await Promise.all([board(true), board(false)]);
  return Response.json({ open: true, solo, party }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } });
}
```

- [ ] **Step 6: 寫 API 測試（沒有資料庫時的行為）**

```ts
// src/lib/speed/__tests__/api.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/speed/runs/route";
import { GET } from "@/app/api/speed/board/route";

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
});
afterEach(() => {
  if (saved !== undefined) process.env.DATABASE_URL = saved;
});

describe("還沒建資料庫", () => {
  it("存一筆回 503「排行還沒開」", async () => {
    const response = await POST(new Request("http://x/api/speed/runs", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "排行還沒開" });
  });

  it("排行回 open: false、空的", async () => {
    const response = await GET(new Request("http://x/api/speed/board?map=105040303"));
    expect(await response.json()).toEqual({ open: false, solo: [], party: [] });
  });

  it("地圖參數不對回 400", async () => {
    expect((await GET(new Request("http://x/api/speed/board?map=abc"))).status).toBe(400);
  });
});
```

- [ ] **Step 7: 跑測試、建置**

Run: `npx vitest run src/lib/speed/__tests__/api.test.ts && npm run build`
Expected: 3 passed；build 成功，輸出的路由表有 `ƒ /api/speed/board`、`ƒ /api/speed/runs`。

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/speed src/app/api
git commit -m "v0.95: 練功測速——Neon 資料庫（第一次呼叫自動建表）、存一筆（擋灌資料、上限）、每張圖單練／組隊排行

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 分享畫面、每秒讀一張

**Files:**
- Create: `src/lib/speed/capture.ts`、`src/lib/speed/capture.worker.ts`

**Interfaces:**
- Consumes: `readFrame`、`ReaderInit`、`FrameReading`（Task 7）、`parseNames`、`RawSpeedNames`（Task 4）
- Produces:
  - `type CaptureHandle = { stop(): void; setHints(hints: number[]): void; ended: Promise<void> }`
  - `startCapture(init: { toNext: number[]; names: RawSpeedNames }, onReading: (reading: FrameReading, at: number) => void): Promise<CaptureHandle>`
  - 測試掛勾：不是正式機（`process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"`）時，`window.__speedTestStream`（MediaStream）有值就拿它代替 getDisplayMedia

（瀏覽器專用，單元測試量不到；Task 15 用無頭 Chrome 驗。）

- [ ] **Step 1: 寫 worker**

```ts
// src/lib/speed/capture.worker.ts
/// <reference lib="webworker" />
import { parseNames, type RawSpeedNames } from "./names";
import { readFrame, type ReaderInit } from "./read-frame";

/**
 * 背景執行緒：主執行緒把分享畫面的 ReadableStream<VideoFrame> 交過來，這裡一秒處理一張（其他張直接關掉），
 * 畫到 OffscreenCanvas、讀完把結果傳回去。遊戲蓋住瀏覽器時主執行緒的計時器會被放慢，這裡是有畫面進來就跑。
 */
type Start = { type: "start"; readable: ReadableStream<VideoFrame>; toNext: number[]; names: RawSpeedNames };
type Hints = { type: "hints"; hints: number[] };

let init: ReaderInit | null = null;
let hints: number[] = [];

self.onmessage = async (event: MessageEvent<Start | Hints>) => {
  const message = event.data;
  if (message.type === "hints") {
    hints = message.hints;
    return;
  }
  init = { toNext: message.toNext, names: parseNames(message.names) };
  const reader = message.readable.getReader();
  let last = 0;
  let canvas: OffscreenCanvas | null = null;
  for (;;) {
    const { value: frame, done } = await reader.read();
    if (done) break;
    const now = Date.now();
    if (now - last < 1000) {
      frame.close();
      continue;
    }
    last = now;
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    if (!canvas || canvas.width !== width || canvas.height !== height) canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(frame, 0, 0);
    frame.close();
    const image = context.getImageData(0, 0, width, height);
    const reading = readFrame({ width, height, data: image.data }, init, hints);
    self.postMessage({ reading, at: now });
  }
  self.postMessage({ ended: true });
};
```

- [ ] **Step 2: 寫 capture.ts**

```ts
// src/lib/speed/capture.ts
"use client";

import type { RawSpeedNames } from "./names";
import { readFrame, type FrameReading } from "./read-frame";
import { parseNames } from "./names";

export type CaptureHandle = { stop(): void; setHints(hints: number[]): void; ended: Promise<void> };

declare global {
  interface Window {
    /** 驗收腳本塞的假畫面（正式機不理它） */
    __speedTestStream?: MediaStream;
  }
}

async function getStream(): Promise<MediaStream> {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" && window.__speedTestStream) return window.__speedTestStream;
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
}

/**
 * 請玩家分享遊戲視窗，之後一秒讀一張。玩家按瀏覽器的「停止分享」或呼叫 stop() 都會結束（ended 會 resolve）。
 * 有 MediaStreamTrackProcessor（Chrome／Edge）就在 Worker 裡讀；沒有就退回主執行緒用 <video>＋計時器。
 */
export async function startCapture(init: { toNext: number[]; names: RawSpeedNames }, onReading: (reading: FrameReading, at: number) => void): Promise<CaptureHandle> {
  const stream = await getStream();
  const track = stream.getVideoTracks()[0];
  let finish!: () => void;
  const ended = new Promise<void>(resolve => {
    finish = resolve;
  });
  track.addEventListener("ended", () => finish());

  const Processor = (globalThis as { MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } }).MediaStreamTrackProcessor;
  if (Processor) {
    const worker = new Worker(new URL("./capture.worker.ts", import.meta.url), { type: "module" });
    const { readable } = new Processor({ track });
    worker.onmessage = (event: MessageEvent<{ reading?: FrameReading; at?: number; ended?: boolean }>) => {
      if (event.data.ended) finish();
      else if (event.data.reading && event.data.at) onReading(event.data.reading, event.data.at);
    };
    worker.postMessage({ type: "start", readable, toNext: init.toNext, names: init.names }, [readable]);
    ended.then(() => worker.terminate());
    return {
      stop: () => {
        track.stop();
        finish();
      },
      setHints: hints => worker.postMessage({ type: "hints", hints }),
      ended,
    };
  }

  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement("canvas");
  const reader = { toNext: init.toNext, names: parseNames(init.names) };
  let hints: number[] = [];
  const timer = window.setInterval(() => {
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(video, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    onReading(readFrame({ width: canvas.width, height: canvas.height, data: image.data }, reader, hints), Date.now());
  }, 1000);
  ended.then(() => window.clearInterval(timer));
  return {
    stop: () => {
      track.stop();
      finish();
    },
    setHints: next => {
      hints = next;
    },
    ended,
  };
}
```

- [ ] **Step 3: 型別檢查、建置**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: 沒有錯誤。若 `VideoFrame`／`OffscreenCanvas` 型別找不到：tsconfig 的 `lib` 加 `"webworker"` 會跟 `dom` 衝突，改在 worker 檔頂端用 `/// <reference lib="webworker" />`（已寫）並確認 tsconfig `lib` 有 `dom`、`dom.iterable`、`esnext`。

- [ ] **Step 4: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——分享遊戲畫面，背景執行緒一秒讀一張（不支援就退回一般作法），驗收用的假畫面掛勾

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 本機設定（角色 ID、公開、模式、地圖記憶）

**Files:**
- Create: `src/lib/speed/settings.ts`
- Test: `src/lib/speed/__tests__/settings.test.ts`

**Interfaces:**
- Produces:
  - `type SpeedSettings = { charId: string; isPublic: boolean; mode: "auto" | "manual" }`
  - `parseSettings(raw: string | null): SpeedSettings`、`DEFAULT_SETTINGS`
  - `useSpeedSettings(): [SpeedSettings, (next: SpeedSettings) => void, boolean /* loaded */]`
  - `readMapMemory(): Record<string, number>`、`rememberMap(signature: string, mapId: number): void`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/lib/speed/__tests__/settings.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "../settings";

describe("練功測速的本機設定", () => {
  it("沒存過、存壞了都用預設：沒 ID、不公開、自動", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{壞")).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ charId: "", isPublic: false, mode: "auto" });
  });

  it("存過的照用；欄位不對的換成預設", () => {
    expect(parseSettings(JSON.stringify({ charId: "芙莉蓮", isPublic: true, mode: "manual" }))).toEqual({ charId: "芙莉蓮", isPublic: true, mode: "manual" });
    expect(parseSettings(JSON.stringify({ charId: 3, isPublic: "y", mode: "fast" }))).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/lib/speed/__tests__/settings.test.ts`
Expected: FAIL。

- [ ] **Step 3: 寫 settings.ts**

```ts
// src/lib/speed/settings.ts
"use client";

import { useCallback, useEffect, useState } from "react";

/** 存在這台電腦（localStorage）：角色 ID、排行顯不顯示 ID（預設不顯示）、自動／手動 */
export type SpeedSettings = { charId: string; isPublic: boolean; mode: "auto" | "manual" };
export const DEFAULT_SETTINGS: SpeedSettings = { charId: "", isPublic: false, mode: "auto" };

const KEY = "ms-speed";
const MAP_KEY = "ms-speed-maps";

export function parseSettings(raw: string | null): SpeedSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<SpeedSettings>;
    return {
      charId: typeof value.charId === "string" ? value.charId : "",
      isPublic: value.isPublic === true,
      mode: value.mode === "manual" ? "manual" : "auto",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 瀏覽器不讓存（隱私模式、空間滿了）：這次照樣能用，只是下次要重填
  }
}

/** 伺服器上跟第一次畫面都用預設（不會跟伺服器畫的對不起來），掛上去後才換成存的 */
export function useSpeedSettings(): [SpeedSettings, (next: SpeedSettings) => void, boolean] {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setSettings(parseSettings(read(KEY)));
    setLoaded(true);
  }, []);
  const save = useCallback((next: SpeedSettings) => {
    setSettings(next);
    write(KEY, JSON.stringify(next));
  }, []);
  return [settings, save, loaded];
}

/** 玩家點選過「這個標題長相是哪張圖」：下次直接認（只記在這台電腦） */
export function readMapMemory(): Record<string, number> {
  try {
    const value = JSON.parse(read(MAP_KEY) ?? "{}");
    return value && typeof value === "object" ? (value as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function rememberMap(signature: string, mapId: number) {
  write(MAP_KEY, JSON.stringify({ ...readMapMemory(), [signature]: mapId }));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/lib/speed/__tests__/settings.test.ts`
Expected: 2 passed。

- [ ] **Step 5: Commit**

```bash
git add src/lib/speed
git commit -m "v0.95: 練功測速——本機記角色 ID、公開與否（預設不公開）、模式、點選過的地圖

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 練功測速頁

**Files:**
- Create: `src/app/plan/speed/page.tsx`、`src/app/plan/speed/PracticeSpeed.tsx`、`src/app/plan/speed/parts.tsx`、`src/app/plan/speed/MiniWindow.tsx`

**Interfaces:**
- Consumes: `startCapture`、`CaptureHandle`（Task 11）、tracker 全部（Task 8）、`resolveMap`、`MapGuess`（Task 6）、`useSpeedSettings`、`readMapMemory`、`rememberMap`（Task 12）、`BoardRow`（Task 10）、`loadMaps`、`loadMonsters`、`loadItems`、`loadTraining`、`loadGuideCommon`、`loadSpeedNames`、`mapName`、`monsterImage`、`itemImage`（data.ts）、`monsterDrops`（monster-view.ts）、`GoButton`、`LoadingBlock`（PlanShell）、`MapPicker`、`useStoredProfile`、`jobOption`（jobs.ts，拿職業名）、`formatNumber`
- Produces: 頁面 `/plan/speed`

- [ ] **Step 1: page.tsx**

```tsx
// src/app/plan/speed/page.tsx
import type { Metadata } from "next";
import { PracticeSpeed } from "./PracticeSpeed";

export const metadata: Metadata = {
  title: "練功測速｜分享遊戲畫面，自動算 10 分鐘經驗",
  description: "分享楓之谷經典版的遊戲視窗，自動算 10 分鐘拿多少經驗、還要多久升級，看每張圖別人練得多快。",
  alternates: { canonical: "/plan/speed" },
};

export default function Page() {
  return <PracticeSpeed />;
}
```

- [ ] **Step 2: MiniWindow.tsx（小浮窗）**

```tsx
// src/app/plan/speed/MiniWindow.tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type PipApi = { requestWindow(options: { width: number; height: number }): Promise<Window> };

/** 瀏覽器支不支援子母畫面視窗（Document Picture-in-Picture，Chrome／Edge 116 起） */
export function pipSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/**
 * 蓋在遊戲上面的小視窗：開一個子母畫面視窗、把這頁的樣式抄過去、內容用 portal 畫進去。
 * open 變 false 或玩家自己關掉視窗都會收；onClose 讓頁面把按鈕狀態改回來。
 */
export function MiniWindow({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const [pip, setPip] = useState<Window | null>(null);
  useEffect(() => {
    if (!open) return;
    let closed = false;
    let win: Window | null = null;
    (window as unknown as { documentPictureInPicture: PipApi }).documentPictureInPicture.requestWindow({ width: 280, height: 150 }).then(created => {
      if (closed) {
        created.close();
        return;
      }
      win = created;
      for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) created.document.head.appendChild(node.cloneNode(true));
      created.document.documentElement.className = document.documentElement.className;
      created.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? "";
      created.document.body.className = "speed-mini";
      created.addEventListener("pagehide", () => {
        setPip(null);
        onClose();
      });
      setPip(created);
    }, onClose);
    return () => {
      closed = true;
      win?.close();
      setPip(null);
    };
  }, [open, onClose]);
  return pip ? createPortal(children, pip.document.body) : null;
}
```

- [ ] **Step 3: parts.tsx（大數字、地圖面板、排行、設定、說明）**

```tsx
// src/app/plan/speed/parts.tsx
"use client";

import Link from "next/link";
import { GoButton } from "@/components/PlanShell";
import { MapPicker } from "@/components/MapPicker";
import { itemImage, mapName, monsterImage } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { jobOption } from "@/lib/jobs";
import { monsterDrops } from "@/lib/monster-view";
import type { BoardRow } from "@/lib/speed/server/rules";
import type { SpeedSettings } from "@/lib/speed/settings";
import type { Item, MapRecord, Monster, TrainingRow } from "@/lib/types";

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] glass wood-frame p-4 sm:p-5">
      {title ? <h2 className="mb-3 text-lg font-black">{title}</h2> : null}
      {children}
    </section>
  );
}

/** 第一次用：填角色 ID、要不要在排行顯示 */
export function SetupCard({ settings, onSave }: { settings: SpeedSettings; onSave: (next: SpeedSettings) => void }) {
  return (
    <Card title="你的角色">
      <form
        className="space-y-3"
        onSubmit={event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSave({ ...settings, charId: String(data.get("charId") ?? "").trim(), isPublic: data.get("isPublic") === "on" });
        }}
      >
        <label className="block text-sm font-bold">
          角色 ID
          <input name="charId" defaultValue={settings.charId} required minLength={2} maxLength={12} className="mt-1 block w-full rounded-lg border border-[color:var(--paper-edge)] bg-transparent px-3 py-2 text-base font-normal" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isPublic" defaultChecked={settings.isPublic} className="size-4" />
          排行榜顯示我的 ID（不勾就顯示「匿名玩家」）
        </label>
        <button type="submit" className="rounded-full bg-[color:var(--maple)] px-4 py-2 text-sm font-bold text-[color:var(--on-accent)]">
          存好了
        </button>
      </form>
    </Card>
  );
}

export function BigNumber({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-sm font-bold ink-soft">{label}</p>
      <p className="text-[34px] font-black leading-tight tabular-nums">{value}</p>
      {note ? <p className="text-[13px] ink-soft">{note}</p> : null}
    </div>
  );
}

/** 認不出地圖時：候選點一下（記住這個長相），或自己搜 */
export function MapChoices({ choices, maps, onPick }: { choices: number[]; maps: Record<string, MapRecord>; onPick: (mapId: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">你在哪張圖？點一次，之後會記住。</p>
      <div className="flex flex-wrap gap-2">
        {choices.map(id => (
          <button key={id} type="button" onClick={() => onPick(id)} className="rounded-full border border-[color:var(--paper-edge)] px-3 py-1.5 text-sm hover:bg-[color:var(--maple-wash)]">
            {mapName(maps, id)}
          </button>
        ))}
      </div>
      <MapPicker label="找不到就搜尋" value={null} maps={maps} onSelect={onPick} />
    </div>
  );
}

/** 偵測到的地圖：名字、帶我去、這張圖的怪（等級、HP、經驗、掉寶、算傷害） */
export function MapPanel({ mapId, maps, monsters, items, training }: { mapId: number; maps: Record<string, MapRecord>; monsters: Monster[]; items: Map<number, Item>; training: TrainingRow[] }) {
  const row = training.find(item => item.m === mapId);
  const byId = new Map(monsters.map(monster => [monster.id, monster]));
  const mobs = (row?.mobs ?? []).map(([id, spawns]) => ({ monster: byId.get(id), spawns })).filter(entry => entry.monster);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] ink-soft">{maps[String(mapId)]?.st}</p>
          <h2 className="text-lg font-black">{mapName(maps, mapId)}</h2>
        </div>
        <GoButton to={mapId} place={mapName(maps, mapId)} />
      </div>
      {mobs.length ? (
        <ul className="space-y-3">
          {mobs.map(({ monster, spawns }) => {
            const { shown } = monsterDrops(monster!.drops, items);
            return (
              <li key={monster!.id} className="rounded-xl border border-[color:var(--paper-edge)] p-3">
                <div className="flex items-center gap-3">
                  <img src={monsterImage(monster!.id)} alt="" width={40} height={40} className="size-10 object-contain" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{monster!.n}</p>
                    <p className="text-[13px] ink-soft">
                      Lv.{monster!.lv ?? "?"} · HP {formatNumber(monster!.hp)} · 經驗 {formatNumber(monster!.exp)} · {spawns} 隻
                    </p>
                  </div>
                  <Link href={`/plan/damage?mob=${monster!.id}`} className="shrink-0 text-sm font-bold text-[color:var(--sky)] hover:underline">
                    算傷害
                  </Link>
                </div>
                {shown.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {shown.map(itemId => (
                      <span key={itemId} className="inline-flex items-center gap-1 rounded-full bg-[color:var(--maple-wash)] px-2 py-0.5 text-[12px]">
                        <img src={itemImage(itemId)} alt="" width={18} height={18} loading="lazy" className="size-[18px] object-contain" />
                        {items.get(itemId)?.n}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm ink-soft">這張圖沒有怪物資料。</p>
      )}
    </Card>
  );
}

/** 一張圖的排行：單練／組隊兩個分頁，前 10 名 */
export function Leaderboard({ board, tab, onTab }: { board: { open: boolean; solo: BoardRow[]; party: BoardRow[] } | null; tab: "solo" | "party"; onTab: (tab: "solo" | "party") => void }) {
  const rows = board ? board[tab] : [];
  return (
    <Card title="這張圖的實測排行">
      <div className="mb-3 flex gap-1" role="tablist">
        {(["solo", "party"] as const).map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => onTab(key)}
            className={`rounded-full px-3 py-1 text-sm font-bold ${tab === key ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "ink-soft hover:bg-[color:var(--maple-wash)]"}`}
          >
            {key === "solo" ? "單練" : "組隊"}
          </button>
        ))}
      </div>
      {!board ? (
        <p className="text-sm ink-soft">載入中…</p>
      ) : !board.open ? (
        <p className="text-sm ink-soft">排行還沒開。</p>
      ) : rows.length ? (
        <ol className="space-y-1.5">
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`} className="flex items-baseline gap-2 text-sm">
              <span className="w-5 shrink-0 text-right font-black tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold">{row.name ?? "匿名玩家"}</span>
                <span className="ink-soft">
                  {" "}
                  · {row.job !== null ? jobOption(row.job)?.name ?? "" : ""} Lv.{row.level}
                </span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">{formatNumber(row.expPer10)}</span>
              <span className="w-[120px] shrink-0 text-right text-[12px] ink-soft">
                練 {row.minutes} 分 · {row.date.slice(5).replace("-", "/")}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm ink-soft">這張圖還沒有人練滿 10 分鐘。</p>
      )}
      <p className="mt-3 text-[12px] ink-soft">數字是 10 分鐘拿到的經驗。玩家自己量的，沒有驗證。</p>
    </Card>
  );
}

export function Disclaimer() {
  return <p className="text-[13px] leading-relaxed ink-soft">這是玩家做的工具，不是官方的。只看你分享出來的畫面，不讀、不改遊戲程式。用不用由你決定。</p>;
}
```

- [ ] **Step 4: PracticeSpeed.tsx（主頁面）**

```tsx
// src/app/plan/speed/PracticeSpeed.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingBlock } from "@/components/PlanShell";
import { loadGuideCommon, loadItems, loadMaps, loadMonsters, loadSpeedNames, loadTraining, mapName } from "@/lib/data";
import { formatNumber } from "@/lib/format";
import { jobOption } from "@/lib/jobs";
import { useStoredProfile } from "@/lib/profile";
import { startCapture, type CaptureHandle } from "@/lib/speed/capture";
import { durationText, etaText } from "@/lib/speed/format";
import type { RawSpeedNames } from "@/lib/speed/names";
import type { FrameReading } from "@/lib/speed/read-frame";
import { resolveMap, type MapGuess } from "@/lib/speed/read-map";
import type { BoardRow } from "@/lib/speed/server/rules";
import { readMapMemory, rememberMap, useSpeedSettings } from "@/lib/speed/settings";
import {
  createTracker, durationMs, feed, levelHints, mainMap, minutesToLevel, shouldSave, startManual, stopManual, switchMode, tenMinuteExp, tick,
  type Segment, type Tracker,
} from "@/lib/speed/tracker";
import type { Item, MapRecord, Monster, TrainingRow } from "@/lib/types";
import { MiniWindow, pipSupported } from "./MiniWindow";
import { BigNumber, Card, Disclaimer, Leaderboard, MapChoices, MapPanel, SetupCard } from "./parts";

type Data = { maps: Record<string, MapRecord>; monsters: Monster[]; items: Map<number, Item>; training: TrainingRow[]; trainingIds: Set<number>; toNext: number[]; names: RawSpeedNames };
type Board = { open: boolean; solo: BoardRow[]; party: BoardRow[] };
type Status = "idle" | "waiting" | "reading" | "lost";

const CLIENT_VER = "v0.95";

/** 電腦的 Chrome／Edge 才有分享畫面；手機、平板（手指操作）不給 */
function canShare(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !window.matchMedia("(pointer: coarse)").matches;
}

export function PracticeSpeed() {
  const { profile } = useStoredProfile();
  const [settings, saveSettings, settingsLoaded] = useSpeedSettings();
  const [support, setSupport] = useState<"checking" | "ok" | "no">("checking");
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [reading, setReading] = useState<FrameReading | null>(null);
  const [guess, setGuess] = useState<MapGuess | null>(null);
  const [tracker, setTracker] = useState<Tracker>(() => createTracker("auto"));
  const [lastSaved, setLastSaved] = useState<{ seg: Segment; note: string } | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [tab, setTab] = useState<"solo" | "party">("solo");
  const [mini, setMini] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const capture = useRef<CaptureHandle | null>(null);
  // 讀畫面的回呼在按「分享」那一刻就交出去了：狀態跟存檔都走 ref，才不會拿到舊的設定（例如之後才填的角色 ID）
  const trackerRef = useRef(tracker);

  useEffect(() => setSupport(canShare() ? "ok" : "no"), []);
  useEffect(() => {
    if (!settingsLoaded) return;
    trackerRef.current = createTracker(settings.mode);
    setTracker(trackerRef.current);
    // 只在讀到本機設定那一次換模式；之後切模式走 onMode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMaps(), loadMonsters(), loadItems(), loadTraining(), loadGuideCommon(), loadSpeedNames()]).then(
      ([maps, monsters, items, training, common, names]) => {
        if (cancelled) return;
        setData({ maps, monsters, items: new Map(items.map(item => [item.id, item])), training, trainingIds: new Set(training.map(row => row.m)), toNext: common.expTable.toNext, names });
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (seg: Segment | null) => {
      if (!seg || !shouldSave(seg) || !data) return;
      const where = mainMap(seg);
      if (!settings.charId) {
        setLastSaved({ seg, note: "沒填角色 ID，這段沒存進排行。" });
        return;
      }
      const body = {
        mapId: where.mapId,
        mapName: where.mapId !== null ? mapName(data.maps, where.mapId) : null,
        level: seg.startLevel,
        job: seg.job ?? (profile.job >= 0 ? profile.job : null),
        charId: settings.charId,
        isPublic: settings.isPublic,
        partySize: seg.party,
        mode: seg.mode,
        startedAt: new Date(seg.startedAt).toISOString(),
        durationSec: Math.round(durationMs(seg) / 1000),
        expGained: seg.gained,
        levelUps: seg.levelUps,
        deaths: seg.deaths,
        clientVer: CLIENT_VER,
      };
      try {
        const response = await fetch("/api/speed/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const result = (await response.json()) as { ok: boolean; ranked?: boolean; error?: string };
        setLastSaved({ seg, note: result.ok ? (result.ranked ? "存好了，已列入這張圖的排行。" : "存好了（未滿 10 分鐘或認不出地圖，不列排行）。") : response.status === 503 ? "排行還沒開，這段沒存到。" : `沒存到：${result.error ?? "等一下再過來"}` });
      } catch {
        setLastSaved({ seg, note: "沒存到：網路不通，等一下再過來。" });
      }
    },
    [data, settings, profile.job],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const apply = useCallback((step: { tracker: Tracker; closed: Segment | null }) => {
    trackerRef.current = step.tracker;
    setTracker(step.tracker);
    if (step.closed) void saveRef.current(step.closed);
  }, []);
  const closeMini = useCallback(() => setMini(false), []);

  const onReading = useCallback(
    (next: FrameReading, at: number) => {
      if (!data) return;
      setReading(next);
      setStatus(next.bar ? "reading" : "waiting");
      const mapGuess = next.title ? resolveMap(next.title, data.maps, data.trainingIds, readMapMemory()) : null;
      setGuess(mapGuess);
      if (!next.exp) return;
      const step = feed(
        trackerRef.current,
        { at, exp: next.exp.exp, level: next.exp.level, mapKey: next.title?.signature ?? null, mapId: mapGuess?.mapId ?? null, job: next.job, party: next.party },
        data.toNext,
      );
      apply(step);
      capture.current?.setHints(levelHints(step.tracker));
    },
    [data, apply],
  );

  // 每秒：自動模式 60 秒沒動就停；畫面上「練了多久」跟著走
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      apply(tick(trackerRef.current, at));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, apply]);

  const mapId = guess?.mapId ?? null;
  useEffect(() => {
    if (mapId === null) return;
    let cancelled = false;
    setBoard(null);
    fetch(`/api/speed/board?map=${mapId}`)
      .then(response => response.json() as Promise<Board>)
      .then(result => !cancelled && setBoard(result), () => !cancelled && setBoard({ open: false, solo: [], party: [] }));
    return () => {
      cancelled = true;
    };
  }, [mapId, lastSaved]);

  const onStart = async () => {
    if (!data) return;
    try {
      setStatus("waiting");
      const handle = await startCapture({ toNext: data.toNext, names: data.names }, onReading);
      capture.current = handle;
      handle.ended.then(() => {
        capture.current = null;
        setStatus("lost");
        // 分享停了：進行中的那段收掉（自動算到最後一次變動、手動算到現在）
        apply(switchMode(trackerRef.current, trackerRef.current.mode, Date.now()));
      });
    } catch {
      setStatus("idle");
    }
  };

  const onMode = (mode: "auto" | "manual") => {
    saveSettings({ ...settings, mode });
    apply(switchMode(trackerRef.current, mode, Date.now()));
  };

  const seg = tracker.seg;
  const per10 = seg ? tenMinuteExp(seg) : null;
  const eta = seg && data ? minutesToLevel(seg, data.toNext) : null;
  const elapsed = seg ? (seg.mode === "manual" ? now - seg.startedAt : seg.lastChangeAt - seg.startedAt) : 0;
  const jobId = reading?.job ?? (profile.job >= 0 ? profile.job : null);
  const statusText = useMemo(() => {
    if (status === "idle") return "還沒分享畫面";
    if (status === "lost") return "分享停了，再按一次「分享遊戲畫面」";
    if (status === "waiting" || !reading?.bar) return "認不到遊戲畫面：選楓之谷的視窗、別縮到最小";
    if (!reading.exp) return "讀不到經驗：視窗太小或被擋住，放大一點";
    if (tracker.mode === "manual" && !tracker.manualOn) return "按「開始」就開始算";
    if (!seg) return "等經驗一動就開始算";
    return "量中";
  }, [status, reading, tracker, seg]);

  if (support === "no") {
    return (
      <Shell>
        <Card>
          <p className="font-bold">要用電腦的 Chrome 或 Edge 開。</p>
          <p className="mt-1.5 text-sm ink-soft">手機的瀏覽器不能分享畫面。</p>
        </Card>
      </Shell>
    );
  }
  if (failed) {
    return (
      <Shell>
        <Card>
          <p className="font-bold">資料沒載到，等一下再過來。</p>
        </Card>
      </Shell>
    );
  }
  if (!data || support === "checking" || !settingsLoaded) {
    return (
      <Shell>
        <LoadingBlock />
      </Shell>
    );
  }

  return (
    <Shell>
      {!settings.charId ? <SetupCard settings={settings} onSave={saveSettings} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              {status === "idle" || status === "lost" ? (
                <button type="button" onClick={onStart} className="rounded-full bg-[color:var(--maple)] px-4 py-2 font-bold text-[color:var(--on-accent)]">
                  分享遊戲畫面
                </button>
              ) : (
                <button type="button" onClick={() => capture.current?.stop()} className="rounded-full border border-[color:var(--paper-edge)] px-4 py-2 font-bold">
                  停止分享
                </button>
              )}
              <div className="flex rounded-full border border-[color:var(--paper-edge)] p-0.5" role="radiogroup" aria-label="模式">
                {(["auto", "manual"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={tracker.mode === mode}
                    onClick={() => onMode(mode)}
                    className={`rounded-full px-3 py-1 text-sm font-bold ${tracker.mode === mode ? "bg-[color:var(--maple)] text-[color:var(--on-accent)]" : "ink-soft"}`}
                  >
                    {mode === "auto" ? "自動" : "手動"}
                  </button>
                ))}
              </div>
              {tracker.mode === "manual" && status === "reading" ? (
                tracker.manualOn ? (
                  <button type="button" onClick={() => apply(stopManual(trackerRef.current, Date.now()))} className="rounded-full border border-[color:var(--paper-edge)] px-3 py-1.5 text-sm font-bold">
                    停止
                  </button>
                ) : (
                  <button type="button" onClick={() => apply({ tracker: startManual(trackerRef.current, Date.now()), closed: null })} className="rounded-full bg-[color:var(--maple)] px-3 py-1.5 text-sm font-bold text-[color:var(--on-accent)]">
                    開始
                  </button>
                )
              ) : null}
              {pipSupported() && status !== "idle" ? (
                <button type="button" onClick={() => setMini(value => !value)} className="rounded-full border border-[color:var(--paper-edge)] px-3 py-1.5 text-sm font-bold">
                  {mini ? "收起小浮窗" : "小浮窗"}
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-sm ink-soft" role="status">
              {statusText}
              {tracker.mode === "auto" ? "（自動：經驗 1 分鐘沒動就停）" : "（手動：按停止才停）"}
            </p>
          </Card>

          <Card>
            <div className="grid grid-cols-2 gap-4">
              <BigNumber label="10 分鐘經驗" value={per10 !== null ? formatNumber(per10) : "—"} note={per10 !== null && data.toNext[seg!.level] ? `這一級的 ${((per10 / data.toNext[seg!.level]) * 100).toFixed(1)}%` : undefined} />
              <BigNumber label="升級還要" value={eta !== null ? etaText(eta) : "—"} />
              <BigNumber label="這段練了" value={seg ? durationText(elapsed) : "—"} />
              <BigNumber label="這段拿到" value={seg ? formatNumber(seg.gained) : "—"} />
            </div>
            <p className="mt-3 text-[13px] ink-soft">
              {reading?.exp ? `Lv.${reading.exp.level} · 經驗 ${formatNumber(reading.exp.exp)}（${reading.exp.percent.toFixed(2)}%）` : "等級、經驗：還沒讀到"}
              {jobId !== null ? ` · ${jobOption(jobId)?.name ?? ""}` : ""}
              {reading ? ` · ${reading.party > 1 ? `組隊 ${reading.party} 人` : "單練"}` : ""}
            </p>
            {lastSaved ? (
              <p className="mt-2 text-[13px]">
                上一段：{durationText(durationMs(lastSaved.seg))}、拿到 {formatNumber(lastSaved.seg.gained)}。{lastSaved.note}
              </p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          {mapId !== null ? (
            <>
              <MapPanel mapId={mapId} maps={data.maps} monsters={data.monsters} items={data.items} training={data.training} />
              <Leaderboard board={board} tab={tab} onTab={setTab} />
            </>
          ) : guess && reading?.title ? (
            <Card>
              <MapChoices
                choices={guess.choices}
                maps={data.maps}
                onPick={id => {
                  rememberMap(reading.title!.signature, id);
                  setGuess({ mapId: id, confident: true, choices: [] });
                }}
              />
            </Card>
          ) : status !== "idle" ? (
            <Card>
              <p className="text-sm ink-soft">認不到在哪張圖：把小地圖打開。</p>
            </Card>
          ) : null}
        </div>
      </div>
      <Disclaimer />
      <MiniWindow open={mini} onClose={closeMini}>
        <div className="space-y-1 p-3">
          <p className="text-[12px] font-bold ink-soft">10 分鐘經驗</p>
          <p className="text-[26px] font-black leading-none tabular-nums">{per10 !== null ? formatNumber(per10) : "—"}</p>
          <p className="text-[13px]">升級還要 {eta !== null ? etaText(eta) : "—"}</p>
          <p className="text-[12px] ink-soft">{statusText}</p>
        </div>
      </MiniWindow>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-3 sm:py-6">
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">練功測速</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">分享遊戲畫面，自動算 10 分鐘拿多少經驗、還要多久升級；看每張圖別人練得多快。</p>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: 掃 emoji、型別、建置**

```bash
grep -rnP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2300}-\x{23FF}\x{25A0}-\x{25FF}]" src/app/plan/speed src/lib/speed || echo "沒有 emoji"
npx tsc --noEmit -p tsconfig.json
npm run build
```

Expected: 「沒有 emoji」；tsc 沒錯；build 的路由表有 `○ /plan/speed`。（「—」是 U+2014，不在掃的範圍，可以用。）

- [ ] **Step 6: 本機看一眼**

用 preview 工具開 dev server（`.claude/launch.json` 沒有就建一個 `npm run dev -- --webpack -p 3095`，記憶：worktree 起 dev server 要另開埠＋--webpack），開 `http://localhost:3095/plan/speed`：沒填 ID 時出現「你的角色」、按鈕「分享遊戲畫面」、最下面說明一行；手機尺寸（resize_window mobile）出現「要用電腦的 Chrome 或 Edge 開」。截圖存證。

- [ ] **Step 7: Commit**

```bash
git add src/app/plan/speed
git commit -m "v0.95: 練功測速頁——分享畫面、自動／手動、10 分鐘經驗跟升級時間、偵測到的地圖跟怪物掉寶、單練／組隊排行、小浮窗

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 導覽列、傷害計算機 `?mob=`、隱私頁

**Files:**
- Modify: `src/lib/nav.ts`、`src/components/SiteHeader.tsx`、`src/lib/__tests__/nav.test.ts`
- Modify: `src/lib/damage-view.ts`（加 `withMonster`）、`src/app/plan/damage/DamageCalculator.tsx`
- Test: `src/lib/__tests__/damage-view.test.ts`（加一題）
- Modify: `src/app/privacy/page.tsx`

**Interfaces:**
- Produces: `NAV` 多一筆 `{ href: "/plan/speed", label: "練功測速", match: ["/plan/speed"], desktopOnly: true }`；`withMonster(state, data, mobId): CalcState`

- [ ] **Step 1: 改 nav 測試（先紅）**

`src/lib/__tests__/nav.test.ts` 第三個 `it` 的清單改成五顆，再加一題：

```ts
    expect(NAV.map(item => item.label)).toEqual(["我的路線", "算傷害", "練功測速", "帶我去", "查資料"]);
```

```ts
  it("練功測速（v0.95）在測速頁亮它、不亮查資料；只在電腦版出現", () => {
    expect(activeNav("/plan/speed")).toBe("練功測速");
    expect(NAV.find(item => item.label === "練功測速")).toMatchObject({ href: "/plan/speed", desktopOnly: true });
    expect(NAV.filter(item => item.desktopOnly).map(item => item.label)).toEqual(["練功測速"]);
  });
```

Run: `npx vitest run src/lib/__tests__/nav.test.ts` → FAIL。

- [ ] **Step 2: 改 nav.ts**

```ts
export const NAV: Array<{ href: string; label: string; match: string[]; desktopOnly?: true }> = [
  { href: "/", label: "我的路線", match: ["/guide"] },
  // 排在查資料前面：/plan/damage 先亮這顆，其他 /plan 照舊亮查資料
  { href: "/plan/damage", label: "算傷害", match: ["/plan/damage"] },
  // v0.95：要分享遊戲畫面，手機用不了，只在電腦寬度出現（SiteHeader 用 desktopOnly 藏）；同樣要排在查資料前面
  { href: "/plan/speed", label: "練功測速", match: ["/plan/speed"], desktopOnly: true },
  { href: "/go", label: "帶我去", match: ["/go"] },
  { href: "/db", label: "查資料", match: ["/db", "/plan"] },
];
```

（檔頭註解「導覽列的四顆」改成「導覽列的五顆（練功測速只在電腦版）」。）

- [ ] **Step 3: SiteHeader 藏手機版的那顆**

`src/components/SiteHeader.tsx` 的 className 陣列加一項（放在 `active ? … : …` 後面）：

```tsx
                  item.desktopOnly ? "hidden md:inline-block" : "",
```

註解「四顆（v0.85 加「算傷害」）」後面補「；v0.95 加「練功測速」只在 768 寬以上出現，手機維持四顆」。

Run: `npx vitest run src/lib/__tests__/nav.test.ts` → PASS。

- [ ] **Step 4: 傷害計算機 `?mob=` 的失敗測試**

`src/lib/__tests__/damage-view.test.ts` 尾巴加（沿用檔案裡現成的 `data`／`defaultState` 測試資料寫法；找一個檔案裡已用過的職業等級組合，例如現有 `defaultState(data, 410, 35, null)`）：

```ts
describe("網址帶 ?mob= 先選好怪（v0.95 練功測速連過來）", () => {
  it("選單裡有的怪就換成它，沒有的照預設", () => {
    const base = defaultState(data, 410, 35, null);
    const target = monsterChoices(data.monsters, data.maps).find(choice => choice.monster.id !== base.shared.monsterId)!.monster.id;
    expect(withMonster(base, data, target).shared.monsterId).toBe(target);
    expect(withMonster(base, data, 999999999).shared.monsterId).toBe(base.shared.monsterId);
  });
});
```

Run: `npx vitest run src/lib/__tests__/damage-view.test.ts -t "mob"` → FAIL（`withMonster` 不存在）。

- [ ] **Step 5: damage-view.ts 加 withMonster**

```ts
/** 網址帶 ?mob=<id>（練功測速的怪物卡連過來）：選單裡有這隻就換成它，沒有就照原本的 */
export function withMonster(state: CalcState, data: CalcData, mobId: number): CalcState {
  const ok = monsterChoices(data.monsters, data.maps).some(choice => choice.monster.id === mobId);
  return ok ? { ...state, shared: { ...state.shared, monsterId: mobId } } : state;
}
```

- [ ] **Step 6: DamageCalculator 用它**

`src/app/plan/damage/DamageCalculator.tsx` 第 41 行附近 `return savedState ?? defaultState(data, job, startLevel, buildTab);` 改成：

```tsx
    if (savedState) return savedState;
    const fresh = defaultState(data, job, startLevel, buildTab);
    // 練功測速的「算傷害」帶 ?mob=：這次瀏覽還沒動過計算機時先選好那隻怪（資料在瀏覽器載完才算，讀得到網址）
    const mob = Number(new URLSearchParams(window.location.search).get("mob"));
    return mob ? withMonster(fresh, data, mob) : fresh;
```

（import 加 `withMonster`。）

Run: `npx vitest run src/lib/__tests__/damage-view.test.ts` → PASS。

- [ ] **Step 7: 隱私頁**

`src/app/privacy/page.tsx`：「最後更新」改成 `2026 年 10 月 13 日`；「伺服器記錄」那個 Block 前面加：

```tsx
      <Block title="練功測速">
        <p>用「練功測速」時，遊戲畫面只在你的瀏覽器裡辨識，畫面本身不會上傳。</p>
        <p className="mt-2">
          每練完一段（5 分鐘以上），會把你自己填的角色 ID、要不要公開、等級、職業、地圖、組隊人數、練了多久、拿到多少經驗存到我們的資料庫，
          拿來做每張地圖的實測排行、改進練功推薦。你沒勾公開時，排行上只會顯示「匿名玩家」。另外會存網路位址的雜湊值（看不出原本的位址），只用來擋同一個位址一直送資料。
        </p>
      </Block>
```

「我們不需要你的帳號」那段的「你不用給我們電子郵件、電話或任何個人身分資料」後面補「（練功測速的角色 ID 是遊戲裡的名字，不是帳號，填不填由你）」。

- [ ] **Step 8: 全部測試、建置**

Run: `npm test && npm run build`
Expected: 全過。

- [ ] **Step 9: Commit**

```bash
git add src/lib/nav.ts src/components/SiteHeader.tsx src/lib/__tests__ src/lib/damage-view.ts src/app/plan/damage src/app/privacy
git commit -m "v0.95: 導覽列加「練功測速」（只電腦版）、傷害計算機吃 ?mob= 先選好怪、隱私頁寫明練功測速存什麼

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 無頭 Chrome 驗收、文件

**Files:**
- Create: `scripts/verify/speed-shot.mjs`
- Modify: `scripts/verify/README.md`、`README.md`、`docs/superpowers/specs/2026-10-13-practice-speed-design.md`

- [ ] **Step 1: 寫 speed-shot.mjs**

先讀 `scripts/verify/harness.mjs` 跟一支現成的（例如 `damage-shot.mjs`）照它的寫法開 Chrome、連 DevTools、截圖。流程：

1. 開 `${url}/plan/speed`（預設 `http://localhost:3095`），視窗 1440×900。
2. `localStorage.setItem("ms-speed", JSON.stringify({ charId: "驗收用", isPublic: false, mode: "auto" }))`，重新整理。
3. 讀 `src/lib/speed/__fixtures__/window-1364.png` 成 base64，`Runtime.evaluate`：

```js
await new Promise(resolve => {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    const draw = () => context.drawImage(image, 0, 0);
    draw();
    setInterval(draw, 200);
    window.__speedTestStream = canvas.captureStream(5);
    resolve();
  };
  image.src = "data:image/png;base64,<BASE64>";
});
```

4. 點「分享遊戲畫面」，等 5 秒。
5. 抓頁面文字，檢查：有「Lv.46 · 經驗 406,947（79.73%）」、有「冰雷巫師」（`jobOption(220).name`）、有「單練」；地圖那欄出現「森林迷宮III」或「你在哪張圖？」其中一個（基準截圖是有損的，認不出地圖是預期）。
6. 若出現「你在哪張圖？」：點「森林迷宮III」那顆，等 2 秒，檢查出現「這張圖的實測排行」跟至少一隻怪的名字。
7. 截全頁圖 `speed.png`；`results.json` 寫每一項檢查的結果。任何一項沒過 exit 1。

預設埠 9391（`chromePort(9391)`）。

- [ ] **Step 2: 跑驗收**

```bash
npm run build && npx next start -p 3095
```

（另一個終端／背景）

```bash
node scripts/verify/speed-shot.mjs "$TEMP/speed-shot" http://localhost:3095
```

Expected: 全部檢查通過、`speed.png` 看得到大數字區、地圖面板（怪物＋掉寶）、排行（本機沒有 `DATABASE_URL` → 「排行還沒開」）。截圖給使用者看。

- [ ] **Step 3: scripts/verify/README.md 加一節**

在「每支在做什麼」最後加：

```markdown
### 練功測速

#### `speed-shot.mjs`：用測試截圖當假的分享畫面，跑一次練功測速頁（v0.95，埠 9391）

```bash
node scripts/verify/speed-shot.mjs [輸出] [網址，預設 http://localhost:3095]
```

- 頁面在非正式機時認 `window.__speedTestStream`（腳本把 `src/lib/speed/__fixtures__/window-1364.png` 畫到 canvas、`captureStream` 塞進去），不用真的開遊戲。
- 檢查：讀到 Lv.46、經驗 406,947（79.73%）、冰雷巫師、單練；地圖認出來或給候選（基準截圖有損，認不出地圖是預期），點候選後出現怪物跟排行。沒過 exit 1。
- 經驗會不會跟著動、自動停、存進排行：這支量不到（畫面是靜止的），靠 `tracker.test.ts` 跟使用者實際玩一段。
```

並把開頭「埠不能撞」那串加上「speed-shot 是 9391」。

- [ ] **Step 4: README.md 加「練功測速」一節**

放在「查資料頁驗收」那節後面：

```markdown
## 練功測速（/plan/speed，v0.95）

- 認畫面全在瀏覽器（`src/lib/speed/`），畫面不上傳。設計：`docs/superpowers/specs/2026-10-13-practice-speed-design.md`。
- **字形樣板**：`src/lib/speed/glyphs.json`（EXP 的數字）、`public/data/speed-names.json`（職業、街道、地圖名）。
  `public/data/maps.json` 多了新地圖名要在 Windows 上重跑 `npm run speed:glyphs`（要微軟正黑體；CI 不跑），沒重跑的新圖頁面會請玩家點選一次。
- **資料庫**：Vercel 專案頁 Storage → Create Database → Neon（免費方案），Vercel 自動放 `DATABASE_URL`。表在第一次呼叫 API 時自動建（`src/lib/speed/server/db.ts`，只有 CREATE IF NOT EXISTS）。
  沒設 `DATABASE_URL` 時頁面照樣能量，存的時候寫「排行還沒開」。正式機另外設 `SPEED_SALT`（網路位址雜湊的鹽）。
- 排行只看同一個環境（`VERCEL_ENV`）：測試機的資料不會出現在正式機。
- 驗收：`npx vitest run src/lib/speed`、`node scripts/verify/speed-shot.mjs`（見 scripts/verify/README.md）。
```

- [ ] **Step 5: spec 補實作差異**

`docs/superpowers/specs/2026-10-13-practice-speed-design.md` 的「從畫面讀什麼」表後面加一段：

```markdown
### 實作時的發現（2026-10-13）

- 等級不讀畫面上的 LV 小圖：拿經驗跟 % 去經驗表反推（46 等升級要 510,420，畫面 406947／79.73% 只對得上 46 等）；% 認錯的整張丟掉。
- 字形樣板不在瀏覽器裡畫，事先在 Windows 上用字型畫好、只存縮成格子的特徵（`npm run speed:glyphs`）。
- 小地圖標題：使用者給的截圖是有損壓縮，小字糊掉驗不了；先做「不夠像就給候選讓玩家點一次、之後記住」。拿到無損截圖再選字型（客戶端內嵌 Gulim／Dotum／Noto Sans SC）。
- 小地圖用的是遊戲重畫過的小地圖，跟站上存的小地圖圖檔完全不同，不能拿圖比。
- 「認不到就請玩家自己框一次」這版先不做：狀態列是用顏色找三條，不靠固定位置；等實際有人認不到再加。
- 建表不另外跑 `scripts/db/migrate.mjs`：API 第一次被呼叫時自己 CREATE IF NOT EXISTS（本機沒有資料庫的連線字串，也不用把它交出來）。
```

- [ ] **Step 6: Commit、push**

```bash
git add scripts/verify README.md docs/superpowers/specs/2026-10-13-practice-speed-design.md
git commit -m "v0.95 (docs): 練功測速驗收腳本（假的分享畫面）、README、設計補實作發現

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

### Task 16: 開 PR、合進 dev、貼測試機網址

- [ ] **Step 1: 開工前規矩**

```bash
git fetch origin && git log origin/dev --oneline -5
```

確認 origin/dev 沒人用 v0.95；有的話 rebase 到最新 dev（`git pull --rebase origin dev`），衝突解掉再跑一次 `npm test`。

- [ ] **Step 2: 開 PR 進 dev**

```bash
gh pr create --base dev --title "v0.95: 練功測速（分享遊戲畫面算 10 分鐘經驗、每張圖排行）" --body-file <PR 說明檔>
```

PR 說明：做了什麼（白話、對照 spec 拍板 1～6）、測試（`npm test` 數字、speed-shot 截圖）、還要使用者做的（Vercel 建 Neon、無損截圖兩張）、小地圖目前會請玩家點一次。結尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。

- [ ] **Step 3: 等 CI 三條綠**

記憶：等「單元測試」「建置」「第一格」三個名字都出現而且綠（只看沒 pending 會被 Vercel 先好騙到）。`gh pr checks <N>`。建置偶發抓不到字型就 `gh run rerun --failed`。

- [ ] **Step 4: merge 前驗 PR head、merge、驗 dev 收到**

```bash
gh pr view <N> --json headRefOid --jq .headRefOid
git log -1 --pretty=%H
gh pr merge <N> --merge --match-head-commit <SHA>
git fetch origin && git log origin/dev --oneline -5
```

- [ ] **Step 5: 等 Vercel 部署、驗測試機、貼網址**

查 dev 最新 commit 的 Vercel status 是 success（記憶：Vercel 會被限流）。開測試機 `https://maplestory-tool-git-dev-clarkhers-projects.vercel.app/plan/speed` 用 speed-shot 跑一次（`node scripts/verify/speed-shot.mjs "$TEMP/speed-shot-dev" https://maplestory-tool-git-dev-clarkhers-projects.vercel.app`），截圖給使用者，回覆附可點網址。

- [ ] **Step 6: 資料庫建好之後（使用者在 Vercel 建完 Neon 才做）**

在測試機用瀏覽器的 javascript 工具直接打一筆（不是正式機）：

```js
await fetch("/api/speed/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  mapId: 105040303, mapName: "森林迷宮III", level: 46, job: 220, charId: "驗收用", isPublic: true, partySize: 1, mode: "auto",
  startedAt: new Date(Date.now() - 900000).toISOString(), durationSec: 900, expGained: 150000, levelUps: 0, deaths: 0, clientVer: "v0.95",
}) }).then(r => r.json())
```

Expected: `{ ok: true, ranked: true }`；`/api/speed/board?map=105040303` 的 `solo` 有「驗收用」；正式機同一張圖看不到它（env 分開）。截圖給使用者。

- [ ] **Step 7: 刪分支、寫記憶**

刪遠端跟本地 feat 分支。寫記憶 `maplebook-practice-speed.md`（拍板 1～6、等級反推、樣板怎麼重產、資料庫怎麼開、小地圖待無損截圖），MEMORY.md 加一行。
