// src/lib/speed/read-exp.ts
import { classifyGlyph, matchGlyph } from "./glyphs";
import { components, inkMask, textRows, type Box, type Mask } from "./ink";
import { clampRect, type Frame, type Rect } from "./frame";
import type { StatusBar } from "./status-bar";

/**
 * EXP 條正上方那一行（「EXP 406947[79.73%]」）認成字串：組跟組之間隔得開的插空白。
 * 只框條上方 0.8 倍條高（剛好罩住字）：框到 1.0 倍以上會把字上面的白色 UI 線（基準圖 757、761 列）一起框進來，
 * 那些線比字亮，拉高了「最亮」的基準，縮放過的細筆畫就變淡、被切成碎塊（1.25、1.5 倍讀不出來）。
 * 字是遊戲自己的點陣字（status-font.ts），樣板照各種縮放先模擬過（glyphs.json）；括號是黃綠色，另外看顏色補墨（addYellowInk）。
 * % 是三塊（兩個小圈＋斜線），先把同一欄重疊的塊併成一個字，再把太矮的（小數點、雜點）拿掉——
 * 先拿掉的話，縮放後變矮的小圈會被丟掉、只剩斜線，% 就被認成 /。小數點拿掉後 parseExp 自己補回來。
 */
export function readExpText(frame: Frame, bar: StatusBar): string {
  const h = bar.bottom - bar.top;
  const rect = { x: bar.exp[0], y: bar.top - 0.8 * h, w: bar.exp[1] - bar.exp[0], h: 0.8 * h };
  const mask = inkMask(frame, rect);
  if (!mask) return "";
  addYellowInk(frame, rect, mask);
  const [y0, y1] = textRows(mask);
  if (y1 - y0 < 4) return "";
  const parts = components(mask, y0, y1).filter(part => part.n > 1);
  if (!parts.length) return "";
  const digitH = digitHeight(parts);
  if (digitH < 5) return "";
  // 小數點（長寬都很小的點）先拿掉再併：縮放後它會擦到隔壁字的邊，留著就被併進去，7 跟小數點變成一個 %
  const merged = mergeColumns(parts.filter(part => part.x1 - part.x0 > DOT_SIZE * digitH || part.y1 - part.y0 > DOT_SIZE * digitH));
  const glyphs = joinBroken(
    mask,
    merged.filter(glyph => glyph.y1 - glyph.y0 >= digitH * 0.45).flatMap(glyph => splitWide(mask, glyph, digitH)),
    digitH,
  );
  let text = "";
  let prev: Box | null = null;
  for (const glyph of glyphs) {
    if (prev && glyph.x0 - prev.x1 > digitH * 0.9) text += " ";
    text += classifyGlyph(mask, glyph, digitH);
    prev = glyph;
  }
  return text;
}

/**
 * 數字的高度：夠高的塊（最高的六成以上，排除 % 的小圈、小數點、碎片）裡偏矮的那一段（四分之一位置）。
 * 「EXP」字樣跟括號比數字高 2 格，經驗位數少的時候（例如 8[0.18%]）它們的數量跟數字差不多，
 * 取中間會拿到字樣的高度，「EXP」跟數字中間的空白就不夠寬、黏成同一組，字樣被當成經驗的前幾位。
 */
export function digitHeight(parts: Box[]): number {
  const tallest = Math.max(...parts.map(part => part.y1 - part.y0));
  const heights = parts
    .map(part => part.y1 - part.y0)
    .filter(height => height >= 0.6 * tallest)
    .sort((a, b) => a - b);
  return heights[Math.floor(heights.length * 0.25)];
}

/**
 * 從左到右，x 範圍重疊超過半格的塊併成同一個字（% 的三塊、碎掉的筆畫）。
 * 放大 1.15 倍時 % 會碎成四塊、彼此只重疊 1 格，所以門檻不能拉高（小數點靠呼叫端先拿掉，不靠這裡擋）。
 */
export function mergeColumns(parts: Box[]): Box[] {
  const glyphs: Box[] = [];
  for (const part of [...parts].sort((a, b) => a.x0 - b.x0)) {
    const last = glyphs[glyphs.length - 1];
    if (last && part.x0 < last.x1 - 0.5) {
      last.x1 = Math.max(last.x1, part.x1);
      last.y0 = Math.min(last.y0, part.y0);
      last.y1 = Math.max(last.y1, part.y1);
      last.n += part.n;
    } else glyphs.push({ ...part });
  }
  return glyphs;
}

/** 長寬都不到字高三成的塊是小數點或雜點（% 的小圈是字高的四成多，不會被當成點） */
const DOT_SIZE = 0.3;

/** 最寬的字是 %（7 格寬、跟字一樣高），比字高寬 1.3 倍以上的就是兩個字黏在一起 */
const MAX_GLYPH_ASPECT = 1.3;

/**
 * 黏在一起的字切開：視窗放大接近 1 倍（例如 1.05 倍）時，字跟字中間只有 1 格的空隙會被抹成半亮，連通塊就把兩個字連成一塊。
 * 框比字高寬 1.3 倍以上，就在中間（離兩邊各至少 0.3 個字高）找墨最少的那一欄切開，切完還太寬就再切。
 */
export function splitWide(mask: Mask, box: Box, digitH: number): Box[] {
  const width = box.x1 - box.x0;
  if (width <= MAX_GLYPH_ASPECT * digitH) {
    if (width <= 0.95 * digitH) return [box];
    // 差不多一個 % 寬：可能是 %，也可能是數字黏著括號或小數點。切開以後（小數點那半丟掉）每一半都比整塊更像某個字才切
    const halves = cutAtThinnest(mask, box, digitH)?.filter(half => half.y1 - half.y0 >= digitH * 0.45);
    if (!halves?.length) return [box];
    const whole = matchGlyph(mask, box, digitH).score;
    return Math.max(...halves.map(half => matchGlyph(mask, half, digitH).score)) < whole ? halves : [box];
  }
  const halves = cutAtThinnest(mask, box, digitH);
  return halves ? halves.filter(half => half.y1 - half.y0 >= digitH * 0.45).flatMap(half => splitWide(mask, half, digitH)) : [box];
}

/**
 * 斷掉的字接回去：% 的斜線只有 1 格寬，放大 1.15 倍時中段淡到門檻以下，左右兩半互不重疊，各自被當成一個很不像的「1」。
 * 相鄰兩塊合起來比各自都更像某個字才接；真的「11」每個都很像 1，合起來反而不像，不會被接。
 */
export function joinBroken(mask: Mask, glyphs: Box[], digitH: number): Box[] {
  const out: Array<{ box: Box; score: number }> = [];
  for (const box of glyphs) {
    const score = matchGlyph(mask, box, digitH).score;
    const prev = out[out.length - 1];
    if (prev && box.x0 - prev.box.x1 <= 0.25 * digitH) {
      const joined = { x0: prev.box.x0, x1: box.x1, y0: Math.min(prev.box.y0, box.y0), y1: Math.max(prev.box.y1, box.y1), n: prev.box.n + box.n };
      const joinedScore = matchGlyph(mask, joined, digitH).score;
      if (joinedScore < Math.min(prev.score, score)) {
        out[out.length - 1] = { box: joined, score: joinedScore };
        continue;
      }
    }
    out.push({ box, score });
  }
  return out.map(entry => entry.box);
}

/** 在中間（離兩邊各至少 0.3 個字高）找墨最少的那一欄切成兩半；切不出兩塊有墨的回 null */
function cutAtThinnest(mask: Mask, box: Box, digitH: number): [Box, Box] | null {
  const margin = Math.max(1, Math.round(0.3 * digitH));
  let cut = -1;
  let least = Infinity;
  for (let x = box.x0 + margin; x < box.x1 - margin; x++) {
    let ink = 0;
    for (let y = box.y0; y < box.y1; y++) ink += mask.m[y * mask.w + x];
    if (ink < least) {
      least = ink;
      cut = x;
    }
  }
  if (cut < 0) return null;
  const left = shrink(mask, { ...box, x1: cut });
  const right = shrink(mask, { ...box, x0: cut + 1 });
  return left && right ? [left, right] : null;
}

/** 框縮到裡面真的有墨（> 0.45）的範圍；沒有墨回 null */
function shrink(mask: Mask, box: Box): Box | null {
  let x0 = box.x1, x1 = box.x0, y0 = box.y1, y1 = box.y0, n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (mask.m[y * mask.w + x] <= 0.45) continue;
      n++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + 1);
    }
  }
  return n ? { x0, x1, y0, y1, n } : null;
}

/** 偏黃多少（紅綠平均減藍）比底色多這麼多就算滿墨 */
const YELLOW_SPAN = 40;

/**
 * 括號是黃綠色（客戶端原色 153,204,51；基準截圖裡約 167,182,135），亮度只有白字的一半多：
 * 視窗一縮放，1 格寬的括號被抹淡到門檻以下，就整個漏掉、或碎成小塊被認成 1、5。
 * 白字跟灰底都不偏黃，所以另外看「偏黃多少」當墨，跟亮度的墨取大的（只有 EXP 那行用）。
 */
export function addYellowInk(frame: Frame, rect: Rect, mask: Mask): void {
  const r = clampRect(frame, rect);
  if (!r || r.w !== mask.w || r.h !== mask.h) return;
  const yellow = new Float32Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const i = ((r.y + y) * frame.width + r.x + x) * 4;
      yellow[y * r.w + x] = (frame.data[i] + frame.data[i + 1]) / 2 - frame.data[i + 2];
    }
  }
  const bg = Float32Array.from(yellow).sort()[Math.floor(yellow.length / 2)];
  // 顏色常被壓縮抹到旁邊（截圖、分享畫面都是），只靠偏黃會把括號旁邊的暗底也算成墨、跟隔壁的字黏在一起：
  // 所以偏黃的墨不超過亮度墨的兩倍，暗底再黃也補不起來
  for (let k = 0; k < yellow.length; k++) {
    const tint = Math.min(1, Math.max(0, (yellow[k] - bg) / YELLOW_SPAN));
    mask.m[k] = Math.max(mask.m[k], Math.min(tint, 2 * mask.m[k]));
  }
}

/** 經驗、%、等級。等級不是讀的，是拿經驗跟 % 去經驗表反推的（畫面上的 LV 是小圖，不讀） */
export type ExpReading = { exp: number; percent: number; level: number };

/** 畫面的 % 是四捨五入到小數兩位；再多留一點給百分位認錯 */
export const PERCENT_TOLERANCE = 0.06;

/**
 * 哪一級「經驗 ÷ 升級要的經驗」跟畫面的 % 對得上。
 * hints：已經知道的等級（現在這級、下一級）。有給就只在裡面找；沒給就在全部等級裡找。
 * 不管有沒有給，都要「剛好一級」對得上才認：兩級以上都對得上（例如剛升級、經驗很小）分不出來，回 null，不挑較低的。
 */
export function levelFor(exp: number, percent: number, toNext: number[], hints: number[]): number | null {
  const fits: number[] = [];
  for (let level = 1; level < toNext.length; level++) {
    const need = toNext[level];
    if (!need || exp >= need) continue;
    if (Math.abs((exp / need) * 100 - percent) <= PERCENT_TOLERANCE) fits.push(level);
  }
  const candidates = hints.length ? fits.filter(level => hints.includes(level)) : fits;
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * readExpText 的字串 → 經驗、%、等級。只看最後一組。
 * 有「[」就只照它切（括號切不出來、或經驗有前導零，就是 null，不改用最後幾位硬湊——硬湊會湊出另一個自洽的錯答案）。
 * 百分比只取到「%」：視窗放大後最後的 ] 偶爾被認成數字（1.5 倍 ] 變 1），多出來的不算進去。
 * 還不知道等級（沒有提示）時，% 一定要認得出來才算：% 被認成數字以後分不出百分比到哪裡，硬試會讀錯
 * （2026-10-17 審查量的：認錯一個數字再加上 % 認成數字，沒提示時試前 4、3 位的讀錯率 25%，有 % 時 2.76%）。
 * 有提示時，括號後面沒有 % 又有 4 位以上：先試前 4 位、再試前 3 位（百分比小數兩位，只會是 3 或 4 位），經驗表對得上才用。
 * 沒有「[」才試最後 4 位、3 位是 %（小數兩位），哪一種在經驗表對得上就用哪種；% 取最後一個（「EXP」字樣常被認成 %）。
 * 遊戲不會顯示前導零的經驗，有就丟掉（單獨一個 0 除外）。都對不上回 null（這一張丟掉，下一秒再讀）。
 */
export function parseExp(text: string, toNext: number[], hints: number[] = []): ExpReading | null {
  const group = text.trim().split(/\s+/).pop() ?? "";
  const tries: Array<[string, string]> = [];
  const bracket = group.indexOf("[");
  const percentSign = bracket >= 0 ? group.indexOf("%", bracket + 1) : group.lastIndexOf("%");
  if (percentSign < 0 && !hints.length) return null;
  if (bracket >= 0) {
    if (bracket > 0) {
      const expDigits = group.slice(0, bracket).replace(/\D/g, "");
      const after = group.slice(bracket + 1, percentSign >= 0 ? percentSign : undefined).replace(/\D/g, "");
      if (percentSign >= 0 || after.length < 4) tries.push([expDigits, after]);
      else for (const size of [4, 3]) tries.push([expDigits, after.slice(0, size)]);
    }
  } else {
    const digits = (percentSign >= 0 ? group.slice(0, percentSign) : group).replace(/\D/g, "");
    for (const size of [4, 3]) if (digits.length > size) tries.push([digits.slice(0, -size), digits.slice(-size)]);
  }
  for (const [expDigits, percentDigits] of tries) {
    if (!expDigits || percentDigits.length < 3 || percentDigits.length > 4 || expDigits.length > 12) continue;
    if (expDigits.length > 1 && expDigits[0] === "0") continue;
    const exp = Number(expDigits);
    const percent = Number(percentDigits) / 100;
    if (percent >= 100) continue;
    const level = levelFor(exp, percent, toNext, hints);
    if (level !== null) return { exp, percent, level };
  }
  return null;
}
