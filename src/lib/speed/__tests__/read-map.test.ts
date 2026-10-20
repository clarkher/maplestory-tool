// src/lib/speed/__tests__/read-map.test.ts
import fs from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { MapRecord, TrainingRow } from "@/lib/types";
import type { Frame } from "../frame";
import { findMapButton, hammingDistance, readTitle, resolveMap, settleTitle, titleBoxes, type TitleReading, type TitleSettle } from "../read-map";
import { parseNames } from "../names";
import { fullScreenWithMinimap, loadFixture, scaleFrame, widenMinimap } from "./fixture";

const names = parseNames(JSON.parse(fs.readFileSync("public/data/speed-names.json", "utf8")));
const maps: Record<string, MapRecord> = JSON.parse(fs.readFileSync("public/data/maps.json", "utf8"));
const training: TrainingRow[] = JSON.parse(fs.readFileSync("public/data/training.json", "utf8"));
const trainingIds = new Set(training.map(row => row.m));

function cloneFrame(frame: Frame): Frame {
  return { width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data) };
}

function pixelAt(frame: Frame, x: number, y: number): [number, number, number] {
  const i = (y * frame.width + x) * 4;
  return [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
}

function setPixel(frame: Frame, x: number, y: number, r: number, g: number, b: number) {
  const i = (y * frame.width + x) * 4;
  frame.data[i] = r;
  frame.data[i + 1] = g;
  frame.data[i + 2] = b;
}

/** 固定種子的亂數（mulberry32），測試每次跑都一樣 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function medianLum(frame: Frame, rect: { x: number; y: number; w: number; h: number }): number {
  const values: number[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const [r, g, b] = pixelAt(frame, x, y);
      values.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  values.sort((p, q) => p - q);
  return values[Math.floor(values.length / 2)];
}

/** 192 格的假簽章（0101…），把 from 起算的 count 格翻過來，跟原本剛好差 count 格 */
const BASE = "01".repeat(96);
function flip(signature: string, from: number, count: number): string {
  return signature
    .split("")
    .map((c, i) => (i >= from && i < from + count ? (c === "0" ? "1" : "0") : c))
    .join("");
}

describe("小地圖標題", () => {
  it.each([1, 1.5, 2])("放大 %s 倍：找到橘色「地圖」按鈕（基準 82–118、39–50），不會找到標題列的楓葉", async scale => {
    const button = findMapButton(await loadFixture("window-1364.png", scale))!;
    expect(button.x0 / scale).toBeCloseTo(82, -1);
    expect(button.y0 / scale).toBeCloseTo(39, -1);
    expect((button.x1 - button.x0) / (button.y1 - button.y0)).toBeGreaterThan(2.5);
  });

  it("讀得到兩行：兩行都有候選、每行字的框落在預期的列（街道 63–74、地圖名 79–90）", async () => {
    const frame = await loadFixture("window-1364.png");
    const reading = readTitle(frame, names)!;
    expect(reading).not.toBeNull();
    expect(reading.street.length).toBeGreaterThan(10);
    expect(reading.name.length).toBeGreaterThan(100);
    const boxes = titleBoxes(frame)!;
    expect(boxes.street.y0).toBeGreaterThanOrEqual(62);
    expect(boxes.street.y1).toBeLessThanOrEqual(75);
    expect(boxes.name.y0).toBeGreaterThanOrEqual(78);
    expect(boxes.name.y1).toBeLessThanOrEqual(91);
    // 兩行不重疊，街道在上
    expect(boxes.street.y1).toBeLessThanOrEqual(boxes.name.y0);
    // 字在小地圖標題那一欄（左從頭像右邊、右到按鈕右緣）
    for (const box of [boxes.street, boxes.name]) {
      expect(box.x0).toBeGreaterThanOrEqual(47);
      expect(box.x1).toBeLessThanOrEqual(118);
    }
  });

  it.each([1.5, 2])("放大 %s 倍也讀得到，字的框落在放大後的列", async scale => {
    const frame = await loadFixture("window-1364.png", scale);
    expect(readTitle(frame, names)).not.toBeNull();
    const boxes = titleBoxes(frame)!;
    expect(boxes.street.y0 / scale).toBeGreaterThanOrEqual(62);
    expect(boxes.street.y1 / scale).toBeLessThanOrEqual(75);
    expect(boxes.name.y0 / scale).toBeGreaterThanOrEqual(78);
    expect(boxes.name.y1 / scale).toBeLessThanOrEqual(91);
  });

  it("簽章只看標題那兩行：把小地圖本體（y ≥ 100）整塊換成別的畫面，簽章不變", async () => {
    const frame = await loadFixture("window-1364.png");
    const clean = readTitle(frame, names)!.signature;
    const other = cloneFrame(frame);
    const random = seeded(7);
    for (let y = 100; y < other.height; y++) {
      for (let x = 0; x < other.width; x++) {
        const v = Math.floor(random() * 256);
        setPixel(other, x, y, v, v, v);
      }
    }
    expect(readTitle(other, names)!.signature).toBe(clean);
  });

  it("標題那兩行有 ±2 的雜訊：簽章跟乾淨的差不到 6 格（30 次都是；2026-10-20 改抓白字後實測最多 4 格）", async () => {
    const frame = await loadFixture("window-1364.png");
    const clean = readTitle(frame, names)!.signature;
    for (let trial = 0; trial < 30; trial++) {
      const noisy = cloneFrame(frame);
      const random = seeded(1000 + trial);
      for (let y = 55; y < 96; y++) {
        for (let x = 40; x < 125; x++) {
          const i = (y * noisy.width + x) * 4;
          for (let c = 0; c < 3; c++) noisy.data[i + c] += Math.floor(random() * 5) - 2;
        }
      }
      const signature = readTitle(noisy, names)!.signature;
      expect(hammingDistance(signature, clean), `trial ${trial}`).toBeLessThanOrEqual(6);
    }
  });

  it("名字右邊少了一截（模擬少一個字）：簽章差很多，不會被當成同一張圖", async () => {
    const frame = await loadFixture("window-1364.png");
    const clean = readTitle(frame, names)!.signature;
    const shorter = cloneFrame(frame);
    const [r, g, b] = pixelAt(frame, 100, 94); // 面板的淺藍
    for (let y = 77; y < 92; y++) for (let x = 106; x < 120; x++) setPixel(shorter, x, y, r, g, b);
    expect(hammingDistance(readTitle(shorter, names)!.signature, clean)).toBeGreaterThan(10);
  });

  it("小地圖收起來（按鈕還在、底下是遊戲場景）：標題那塊蓋上暗的場景，讀不到標題", async () => {
    const frame = await loadFixture("window-1364.png");
    const scene = cloneFrame(frame);
    // 從樹幹那一帶（x 20–110、y 300–345）複製一塊蓋到標題上
    for (let dy = 0; dy < 40; dy++) {
      for (let dx = 0; dx < 85; dx++) {
        const [r, g, b] = pixelAt(frame, 20 + dx, 300 + dy);
        setPixel(scene, 40 + dx, 56 + dy, r, g, b);
      }
    }
    expect(medianLum(scene, { x: 47, y: 61, w: 71, h: 30 })).toBeLessThan(150);
    expect(readTitle(scene, names)).toBeNull();
    expect(titleBoxes(scene)).toBeNull();
  });

  it("標題那塊是亮的、但字只有一個小點（太矮）：讀不到標題", async () => {
    const frame = await loadFixture("window-1364.png");
    const flat = cloneFrame(frame);
    // 把標題兩行整塊塗成小地圖面板的淺藍，每行只留一個 2×2 的深色點（高 2，不到按鈕高 11 的一半）
    const [r, g, b] = pixelAt(frame, 100, 94);
    for (let y = 56; y < 96; y++) for (let x = 40; x < 125; x++) setPixel(flat, x, y, r, g, b);
    for (const top of [66, 82]) for (let y = top; y < top + 2; y++) for (let x = 70; x < 72; x++) setPixel(flat, x, y, 20, 20, 20);
    expect(medianLum(flat, { x: 47, y: 61, w: 71, h: 30 })).toBeGreaterThanOrEqual(150);
    expect(readTitle(flat, names)).toBeNull();
  });

  // 2026-10-20 使用者「地圖全部都沒抓到」：地圖名的範圍原本是從按鈕往左 35px，小地圖一寬（地圖名靠左、按鈕靠右），字就整個落在範圍外
  it.each([40, 100, 200])("小地圖寬 %s 格（按鈕往右推、地圖名留在左邊）：讀得到，簽章跟原本一樣、認得出森林迷宮Ⅲ", async extra => {
    const frame = await loadFixture("window-1364.png");
    const clean = readTitle(frame, names)!.signature;
    const wide = widenMinimap(frame, extra);
    expect(findMapButton(wide)!.x0).toBeCloseTo(82 + extra, -1);
    const reading = readTitle(wide, names);
    expect(reading).not.toBeNull();
    expect(hammingDistance(reading!.signature, clean)).toBeLessThanOrEqual(6);
    const guess = resolveMap(reading!, maps, trainingIds, {});
    expect(guess).toMatchObject({ mapId: 105040303, confident: true });
  });

  // 放大過的畫面字被抹糊（樣板是 13px 清楚的字），還不到自動認的把握，但第一個候選是對的（玩家點一下就記住）
  it.each([1.25, 1.5, 2])("小地圖加寬 100 格再放大 %s 倍：讀得到，第一個候選是森林迷宮Ⅲ", async scale => {
    const frame = scaleFrame(widenMinimap(await loadFixture("window-1364.png"), 100), scale);
    const reading = readTitle(frame, names);
    expect(reading).not.toBeNull();
    expect(resolveMap(reading!, maps, trainingIds, {}).choices[0]).toBe(105040303);
  });

  it("1920×1080 全螢幕（小地圖貼左上角、加寬 100 格，下面場景有一條比按鈕還長的橘色長條）：跳過長條，讀得到地圖名", async () => {
    const frame = fullScreenWithMinimap(await loadFixture("window-1364.png"), 100);
    const reading = readTitle(frame, names);
    expect(reading).not.toBeNull();
    expect(resolveMap(reading!, maps, trainingIds, {})).toMatchObject({ mapId: 105040303, confident: true });
    // 地圖名的框在小地圖的標題那兩行（全螢幕沒有視窗標題列，比基準截圖高 31 格），不在橘色長條那裡
    const boxes = titleBoxes(frame)!;
    expect(boxes.street.y0).toBeGreaterThanOrEqual(62 - 31);
    expect(boxes.name.y1).toBeLessThanOrEqual(91 - 31);
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

describe("地圖名樣板（public/data/speed-names.json）", () => {
  // 10/15 遊戲資料 2.0.0 加了天空之城、艾納斯島等新圖，樣板沒重產，那些圖永遠認不到。
  // 紅了就在 Windows 跑 npm run speed:glyphs（要微軟正黑體）重產 speed-names.json
  it("maps.json 每張有中文名的圖，地圖名跟街道名都有樣板", () => {
    const have = new Set(names.titles.map(title => title.text));
    const missing = new Set<string>();
    for (const record of Object.values(maps)) {
      if (!record.zh) continue;
      if (!have.has(record.zh)) missing.add(record.zh);
      if (record.st && !have.has(record.st)) missing.add(record.st);
    }
    expect([...missing]).toEqual([]);
  });
});

describe("街道名是空的地圖（雲彩公園、天空階梯、冰原雪域）", () => {
  // 上游 2.0.0（2026-10-15）起雲彩公園、天空階梯、冰雪山丘有街道名了（天空之城、艾納斯島），
  // 下面照 2.0.0 前的樣子（街道空白）測「街道不用比」這條規則——現在還有別的練功圖街道是空的
  const emptyStreet = (id: number) => ({ ...maps[String(id)], st: "" });
  const oldMaps: Record<string, MapRecord> = { ...maps, 200010000: emptyStreet(200010000), 200010200: emptyStreet(200010200), 211000200: emptyStreet(211000200) };

  it("資料裡現在還有街道名是空的練功地圖（有中文名）；雲彩公園Ⅰ、冰雪山丘 2.0.0 起有街道名", () => {
    const empty = [...trainingIds].filter(id => maps[String(id)]?.zh && !maps[String(id)].st);
    expect(empty.length).toBeGreaterThan(0);
    for (const id of [200010000, 211000200]) {
      expect(maps[String(id)].st).not.toBe("");
      expect(trainingIds.has(id)).toBe(true);
    }
  });

  it("街道不用比（給中立分數）：地圖名明顯最像的自動認，而且在候選裡", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "迷霧森林", d: 0.02 }, { text: "黃金海岸", d: 0.09 }],
      name: [{ text: "雲彩公園Ⅰ", d: 0.03 }, { text: "森林迷宮III", d: 0.08 }, { text: "天空階梯Ⅰ", d: 0.095 }],
    };
    const guess = resolveMap(title, oldMaps, trainingIds, {});
    expect(guess.mapId).toBe(200010000);
    expect(guess.confident).toBe(true);
    expect(guess.choices[0]).toBe(200010000);
    expect(guess.choices).toContain(200010200);
  });

  it("冰原雪域（211…）一樣：街道欄沒有任何像的，也認得到、而且不會被有街道名的圖壓過去", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "雪人之谷", d: 0.05 }, { text: "迷霧森林", d: 0.06 }],
      name: [{ text: "冰雪山丘", d: 0.02 }, { text: "森林迷宮III", d: 0.07 }],
    };
    const guess = resolveMap(title, oldMaps, trainingIds, {});
    expect(guess.mapId).toBe(211000200);
    expect(guess.confident).toBe(true);
    expect(guess.choices).toContain(211000200);
  });

  it("地圖名只差一點點的兩張空街道地圖：不自動認，兩張都給候選", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "迷霧森林", d: 0.02 }],
      name: [{ text: "雲彩公園Ⅰ", d: 0.03 }, { text: "天空階梯Ⅰ", d: 0.031 }],
    };
    const guess = resolveMap(title, oldMaps, trainingIds, {});
    expect(guess.confident).toBe(false);
    expect(guess.mapId).toBeNull();
    expect(guess.choices).toEqual(expect.arrayContaining([200010000, 200010200]));
  });
});

describe("記住的簽章（差幾格也認得）", () => {
  const empty = (signature: string): TitleReading => ({ signature, street: [], name: [] });

  it("差 4 格：還是用記下的地圖", () => {
    expect(resolveMap(empty(flip(BASE, 0, 4)), maps, trainingIds, { [BASE]: 777 })).toEqual({ mapId: 777, confident: true, choices: [] });
  });

  it("差 6 格剛好還算；差 7 格不算", () => {
    expect(resolveMap(empty(flip(BASE, 0, 6)), maps, trainingIds, { [BASE]: 777 }).mapId).toBe(777);
    expect(resolveMap(empty(flip(BASE, 0, 7)), maps, trainingIds, { [BASE]: 777 })).toEqual({ mapId: null, confident: false, choices: [] });
  });

  it("好幾筆都在範圍內：取差最少的；一模一樣的永遠先贏", () => {
    const memory = { [flip(BASE, 0, 5)]: 1, [flip(BASE, 20, 2)]: 2 };
    expect(resolveMap(empty(BASE), maps, trainingIds, memory).mapId).toBe(2);
    expect(resolveMap(empty(BASE), maps, trainingIds, { ...memory, [BASE]: 3 }).mapId).toBe(3);
  });

  it("長度不一樣（別的版本的簽章）：不算相近", () => {
    expect(resolveMap(empty(BASE), maps, trainingIds, { [BASE.slice(2)]: 9 }).mapId).toBeNull();
  });
});

describe("hammingDistance", () => {
  it("一樣是 0、每個不同的字元算 1", () => {
    expect(hammingDistance("", "")).toBe(0);
    expect(hammingDistance("0101", "0101")).toBe(0);
    expect(hammingDistance("0101", "0011")).toBe(2);
    expect(hammingDistance("0000:1111", "1000:1110")).toBe(2);
  });

  it("長度不一樣是 Infinity", () => {
    expect(hammingDistance("0101", "010")).toBe(Infinity);
    expect(hammingDistance("", "0")).toBe(Infinity);
  });
});

describe("settleTitle（頁面餵給練功計算當 mapKey 的那個穩定簽章）", () => {
  const start: TitleSettle = { key: null, candidate: null, streak: 0 };
  const feed = (state: TitleSettle, ...signatures: (string | null)[]) => signatures.reduce(settleTitle, state);
  const A = BASE;
  const B = flip(BASE, 0, 40); // 跟 A 差 40 格
  const settledA = feed(start, A, A, A);

  it("第一個 key 也要連續 3 張畫面才出現", () => {
    expect(feed(start, A).key).toBeNull();
    expect(feed(start, A, flip(A, 0, 5)).key).toBeNull();
    expect(feed(start, A, flip(A, 0, 5), flip(A, 0, 9)).key).toBe(flip(A, 0, 9));
  });

  it("候選之間差超過 6 格就重數", () => {
    expect(feed(start, A, A, flip(A, 0, 7), flip(A, 0, 7)).key).toBeNull();
    expect(feed(start, A, A, flip(A, 0, 7), flip(A, 0, 7), flip(A, 0, 7)).key).toBe(flip(A, 0, 7));
    // 差剛好 6 格還算同一個長相
    expect(feed(start, A, flip(A, 0, 6), A).key).toBe(A);
  });

  it("跟現在的 key 差不到 7 格：key 不動（雜訊、小地圖字被擋一下）", () => {
    expect(settledA.key).toBe(A);
    for (const gap of [1, 6, 7]) {
      const next = feed(settledA, flip(A, 0, gap), flip(A, 0, gap), flip(A, 0, gap), flip(A, 0, gap));
      expect(next.key, `差 ${gap} 格`).toBe(A);
    }
  });

  it("差超過 7 格才有機會換：8 格要連續 3 張", () => {
    const far = flip(A, 0, 8);
    expect(feed(settledA, far, far).key).toBe(A);
    expect(feed(settledA, far, far, far).key).toBe(far);
  });

  it("換圖：連續 3 張新的才換；中間夾一張舊的就重數", () => {
    expect(feed(settledA, B, B).key).toBe(A);
    expect(feed(settledA, B, B, B).key).toBe(B);
    expect(feed(settledA, B, B, A, B, B).key).toBe(A);
    expect(feed(settledA, B, B, A, B, B, B).key).toBe(B);
  });

  it("讀不到（null）：重數、但 key 留著", () => {
    expect(feed(settledA, null).key).toBe(A);
    expect(feed(settledA, B, B, null, B, B).key).toBe(A);
    expect(feed(settledA, B, B, null, B, B, B).key).toBe(B);
    expect(feed(start, A, A, null, A).key).toBeNull();
    expect(feed(start, A, A, null, A, A, A).key).toBe(A);
    expect(feed(start, null)).toEqual(start);
  });

  it("長度不一樣的簽章當成完全不同（換版本）", () => {
    const shorter = A.slice(2);
    expect(feed(settledA, shorter, shorter, shorter).key).toBe(shorter);
  });

  it("不改傳進來的狀態", () => {
    const frozen = Object.freeze({ key: A, candidate: null, streak: 0 });
    expect(() => settleTitle(frozen, B)).not.toThrow();
    expect(frozen).toEqual({ key: A, candidate: null, streak: 0 });
  });
});

/**
 * 只差一個字的相鄰地圖（森林迷宮III／IV、火焰之地Ⅱ／Ⅲ…）：簽章要差得夠遠，settleTitle 才會當成換圖、記住的簽章才不會張冠李戴。
 * 合成畫面：拿基準截圖，把標題那塊塗成小地圖面板的淺藍，再把兩行字照遊戲的畫法（白字）畫上去，其他像素都是基準截圖的。
 * 兩種畫法：
 * - 照 public/data/speed-names.json 裡存的字形格子貼出來（不用字型，哪裡都能跑，CI 也跑）
 * - 用 Windows 的微軟正黑體粗體畫 13px 的白字＋右下 1 格陰影（只在有這個字型的機器跑）
 */
const SERIES: [street: string, titles: string[]][] = [
  ["迷霧森林", ["森林迷宮II", "森林迷宮III", "森林迷宮IV", "森林迷宮V"]],
  ["戰火之地", ["火焰之地Ⅰ", "火焰之地Ⅱ", "火焰之地Ⅲ", "火焰之地Ⅴ"]],
  ["冰原雪域", ["冰面Ⅰ", "冰面Ⅱ"]],
];

function panelOf(base: Frame): [number, number, number] {
  return pixelAt(base, 100, 94);
}

function floodTitle(base: Frame): Frame {
  const out = cloneFrame(base);
  const [r, g, b] = panelOf(base);
  for (let y = 56; y < 96; y++) for (let x = 40; x < 125; x++) setPixel(out, x, y, r, g, b);
  return out;
}

/** 字形格子（每格是 0～1 的墨量，8 列）雙線性放大成 11px 高貼上去：街道從 (51,63)、地圖名從 (52,79) */
function renderFromGlyphs(base: Frame, street: string, name: string): Frame {
  const out = floodTitle(base);
  const panel = panelOf(base);
  for (const [text, x0, y0] of [[street, 51, 63], [name, 52, 79]] as const) {
    const entry = names.titles.find(title => title.text === text);
    if (!entry) throw new Error(`字形樣板裡沒有「${text}」`);
    const h = 11;
    const w = Math.round(entry.aspect * h);
    const cell = (x: number, y: number) => entry.grid[y * entry.gw + x];
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const gx = ((px + 0.5) / w) * entry.gw - 0.5;
        const gy = ((py + 0.5) / h) * names.gh - 0.5;
        const xa = Math.max(0, Math.min(entry.gw - 1, Math.floor(gx)));
        const ya = Math.max(0, Math.min(names.gh - 1, Math.floor(gy)));
        const xb = Math.min(entry.gw - 1, xa + 1);
        const yb = Math.min(names.gh - 1, ya + 1);
        const fx = Math.min(1, Math.max(0, gx - xa));
        const fy = Math.min(1, Math.max(0, gy - ya));
        const top = cell(xa, ya) * (1 - fx) + cell(xb, ya) * fx;
        const bottom = cell(xa, yb) * (1 - fx) + cell(xb, yb) * fx;
        const ink = Math.min(1, top * (1 - fy) + bottom * fy);
        const [r, g, b] = panel.map(value => Math.round(value * (1 - ink) + 255 * ink));
        setPixel(out, x0 + px, y0 + py, r, g, b);
      }
    }
  }
  return out;
}

const MSJH = "C:/Windows/Fonts/msjhbd.ttc";
const hasMsjh = fs.existsSync(MSJH) && GlobalFonts.registerFromPath(MSJH, "MsjhForTest");

function renderWithFont(base: Frame, street: string, name: string): Frame {
  const canvas = createCanvas(base.width, base.height);
  const context = canvas.getContext("2d");
  const image = context.createImageData(base.width, base.height);
  image.data.set(floodTitle(base).data);
  context.putImageData(image, 0, 0);
  context.font = '13px "MsjhForTest"';
  context.textBaseline = "alphabetic";
  context.fillStyle = "#0a1418";
  context.fillText(street, 52, 74);
  context.fillText(name, 52, 90);
  context.fillStyle = "#fff";
  context.fillText(street, 51, 73);
  context.fillText(name, 51, 89);
  const { data } = context.getImageData(0, 0, base.width, base.height);
  return { width: base.width, height: base.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

function adjacentMapChecks(render: (base: Frame, street: string, name: string) => Frame) {
  const sign = async (street: string, name: string) => readTitle(render(await loadFixture("window-1364.png"), street, name), names)!.signature;

  it("同一組裡任兩張圖的簽章都差超過 7 格（不會被當成同一張）", async () => {
    for (const [street, titles] of SERIES) {
      const signatures = await Promise.all(titles.map(title => sign(street, title)));
      for (let i = 0; i < titles.length; i++) {
        for (let j = i + 1; j < titles.length; j++) {
          expect(hammingDistance(signatures[i], signatures[j]), `${titles[i]} 跟 ${titles[j]}`).toBeGreaterThan(7);
        }
      }
    }
  });

  it("森林迷宮III 穩定下來之後換成 IV：連續 3 張 IV 就換 key；III 的雜訊不會換", async () => {
    const three = await sign("迷霧森林", "森林迷宮III");
    const four = await sign("迷霧森林", "森林迷宮IV");
    const settled = [three, three, three].reduce(settleTitle, { key: null, candidate: null, streak: 0 } as TitleSettle);
    expect(settled.key).toBe(three);
    const twoFrames = [four, four].reduce(settleTitle, settled);
    expect(twoFrames.key).toBe(three);
    const threeFrames = [four, four, four].reduce(settleTitle, settled);
    expect(threeFrames.key).toBe(four);
    expect(threeFrames.key).not.toBe(three);
  });

  it("記住的簽章不會張冠李戴：記了 III，IV 不會被認成 III；兩張都記了各認各的", async () => {
    const three = await sign("迷霧森林", "森林迷宮III");
    const four = await sign("迷霧森林", "森林迷宮IV");
    const blank = (signature: string): TitleReading => ({ signature, street: [], name: [] });
    expect(resolveMap(blank(four), maps, trainingIds, { [three]: 105040303 })).toEqual({ mapId: null, confident: false, choices: [] });
    const both = { [three]: 105040303, [four]: 105040304 };
    expect(resolveMap(blank(three), maps, trainingIds, both).mapId).toBe(105040303);
    expect(resolveMap(blank(four), maps, trainingIds, both).mapId).toBe(105040304);
  });

  it("同一張圖有 ±2 的雜訊：還是認得記下的那張（差不到 6 格）", async () => {
    const base = await loadFixture("window-1364.png");
    const clean = render(base, "迷霧森林", "森林迷宮III");
    const remembered = readTitle(clean, names)!.signature;
    for (let trial = 0; trial < 10; trial++) {
      const noisy = cloneFrame(clean);
      const random = seeded(500 + trial);
      for (let y = 55; y < 96; y++) {
        for (let x = 40; x < 125; x++) {
          const i = (y * noisy.width + x) * 4;
          for (let c = 0; c < 3; c++) noisy.data[i + c] += Math.floor(random() * 5) - 2;
        }
      }
      const signature = readTitle(noisy, names)!.signature;
      expect(hammingDistance(signature, remembered), `trial ${trial}`).toBeLessThanOrEqual(6);
      expect(resolveMap({ signature, street: [], name: [] }, maps, trainingIds, { [remembered]: 105040303 }).mapId).toBe(105040303);
    }
  });
}

describe("相鄰的地圖（字形樣板貼出來的標題）", () => {
  adjacentMapChecks(renderFromGlyphs);
});

describe.skipIf(!hasMsjh)("相鄰的地圖（微軟正黑體粗體畫出來的標題，只在有這個字型的機器跑）", () => {
  adjacentMapChecks(renderWithFont);
});
