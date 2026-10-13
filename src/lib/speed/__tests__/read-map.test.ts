// src/lib/speed/__tests__/read-map.test.ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { MapRecord, TrainingRow } from "@/lib/types";
import type { Frame } from "../frame";
import { findMapButton, hammingDistance, readTitle, resolveMap, settleTitle, titleBoxes, type TitleReading, type TitleSettle } from "../read-map";
import { parseNames } from "../names";
import { loadFixture } from "./fixture";

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

  it("標題那兩行有 ±2 的雜訊：簽章跟乾淨的差不到 12 格（30 次都是）", async () => {
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
      expect(hammingDistance(signature, clean), `trial ${trial}`).toBeLessThanOrEqual(12);
    }
  });

  it("名字右邊少了一截（模擬少一個字）：簽章差很多，不會被當成同一張圖", async () => {
    const frame = await loadFixture("window-1364.png");
    const clean = readTitle(frame, names)!.signature;
    const shorter = cloneFrame(frame);
    const [r, g, b] = pixelAt(frame, 100, 94); // 面板的淺藍
    for (let y = 77; y < 92; y++) for (let x = 106; x < 120; x++) setPixel(shorter, x, y, r, g, b);
    expect(hammingDistance(readTitle(shorter, names)!.signature, clean)).toBeGreaterThan(24);
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

describe("街道名是空的地圖（雲彩公園、天空階梯、冰原雪域）", () => {
  it("資料裡這幾張真的沒有街道名，而且是練功地圖", () => {
    for (const id of [200010000, 211000200]) {
      expect(maps[String(id)].zh).not.toBe("");
      expect(maps[String(id)].st).toBe("");
      expect(trainingIds.has(id)).toBe(true);
    }
  });

  it("街道不用比（給中立分數）：地圖名明顯最像的自動認，而且在候選裡", () => {
    const title: TitleReading = {
      signature: "x",
      street: [{ text: "迷霧森林", d: 0.02 }, { text: "黃金海岸", d: 0.09 }],
      name: [{ text: "雲彩公園Ⅰ", d: 0.03 }, { text: "森林迷宮III", d: 0.08 }, { text: "天空階梯Ⅰ", d: 0.095 }],
    };
    const guess = resolveMap(title, maps, trainingIds, {});
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
    const guess = resolveMap(title, maps, trainingIds, {});
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
    const guess = resolveMap(title, maps, trainingIds, {});
    expect(guess.confident).toBe(false);
    expect(guess.mapId).toBeNull();
    expect(guess.choices).toEqual(expect.arrayContaining([200010000, 200010200]));
  });
});

describe("記住的簽章（差幾格也認得）", () => {
  const empty = (signature: string): TitleReading => ({ signature, street: [], name: [] });

  it("差 10 格：還是用記下的地圖", () => {
    expect(resolveMap(empty(flip(BASE, 0, 10)), maps, trainingIds, { [BASE]: 777 })).toEqual({ mapId: 777, confident: true, choices: [] });
  });

  it("差 12 格剛好還算；差 13 格不算", () => {
    expect(resolveMap(empty(flip(BASE, 0, 12)), maps, trainingIds, { [BASE]: 777 }).mapId).toBe(777);
    expect(resolveMap(empty(flip(BASE, 0, 13)), maps, trainingIds, { [BASE]: 777 })).toEqual({ mapId: null, confident: false, choices: [] });
  });

  it("好幾筆都在範圍內：取差最少的；一模一樣的永遠先贏", () => {
    const memory = { [flip(BASE, 0, 8)]: 1, [flip(BASE, 20, 3)]: 2 };
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

  it("候選之間差超過 12 格就重數", () => {
    expect(feed(start, A, A, flip(A, 0, 13), flip(A, 0, 13)).key).toBeNull();
    expect(feed(start, A, A, flip(A, 0, 13), flip(A, 0, 13), flip(A, 0, 13)).key).toBe(flip(A, 0, 13));
  });

  it("跟現在的 key 差不到 24 格：key 不動（雜訊、小地圖字被擋一下）", () => {
    expect(settledA.key).toBe(A);
    for (const gap of [1, 12, 24]) {
      const next = feed(settledA, flip(A, 0, gap), flip(A, 0, gap), flip(A, 0, gap), flip(A, 0, gap));
      expect(next.key, `差 ${gap} 格`).toBe(A);
    }
  });

  it("差超過 24 格才有機會換：25 格要連續 3 張", () => {
    const far = flip(A, 0, 25);
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
