/**
 * 名字變怪物：假手寫名字產生器（固定種子）。
 * 只給離線算基準（base.gen.ts）跟測試用，網站不載入。兩邊共用同一份，基準跟測試量的是同一種筆跡。
 * 每個字 = 100×100 格裡 8～13 條橫、豎、撇、捺短線（加 ±0.75 抖動），字跟字間隔 110，橫寫或直寫。
 */
import { normalize, splitAtCorners, type Stroke } from "./strokes";

/** mulberry32：固定種子亂數 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function line(rand: () => number, x0: number, y0: number, x1: number, y1: number): Stroke {
  const n = 8;
  const s: Stroke = [];
  for (let i = 0; i <= n; i++) {
    s.push([x0 + ((x1 - x0) * i) / n + (rand() - 0.5) * 1.5, y0 + ((y1 - y0) * i) / n + (rand() - 0.5) * 1.5]);
  }
  return s;
}

/** 一個假中文字（左上角在 ox, oy） */
function char(rand: () => number, ox: number, oy: number): Stroke[] {
  const out: Stroke[] = [];
  const k = 8 + Math.floor(rand() * 6);
  for (let i = 0; i < k; i++) {
    const t = rand();
    const x = ox + 10 + rand() * 80, y = oy + 10 + rand() * 80;
    const L = 20 + rand() * 60;
    if (t < 0.4) out.push(line(rand, x - L / 2, y, x + L / 2, y));
    else if (t < 0.75) out.push(line(rand, x, y - L / 2, x, y + L / 2));
    else if (t < 0.88) out.push(line(rand, x, y, x - L / 2, y + L / 2));
    else out.push(line(rand, x, y, x + L / 2, y + L / 2));
  }
  return out;
}

/** 一個假名字的原始筆畫（畫面座標） */
export function synthName(rand: () => number, chars: number, vertical: boolean): Stroke[] {
  const out: Stroke[] = [];
  for (let c = 0; c < chars; c++) out.push(...char(rand, vertical ? 0 : c * 110, vertical ? c * 110 : 0));
  return out;
}

/** count 個假名字（1～4 字、橫直各半），已切段＋正規化，可直接丟 pickResult */
export function synthSet(seed: number, count: number): Stroke[][] {
  const rand = seeded(seed);
  const out: Stroke[][] = [];
  for (let i = 0; i < count; i++) {
    const chars = 1 + Math.floor(rand() * 4);
    const vertical = rand() < 0.5;
    out.push(normalize(splitAtCorners(synthName(rand, chars, vertical))));
  }
  return out;
}
