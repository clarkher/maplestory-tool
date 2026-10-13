// src/lib/speed/read-exp.ts
import { classifyGlyph } from "./glyphs";
import { components, inkMask, textRows, type Box } from "./ink";
import type { Frame } from "./frame";
import type { StatusBar } from "./status-bar";

/**
 * EXP 條正上方那一行（「EXP 406947[79.73%]」）認成字串：組跟組之間隔得開的插空白。
 * 只框條上方 0.8 倍條高（剛好罩住字）：框到 1.0 倍以上會把字上面的白色 UI 線（基準圖 757、761 列）一起框進來，
 * 那些線比字亮，拉高了「最亮」的基準，縮放過的細筆畫就變淡、被切成碎塊（1.25、1.5 倍讀不出來）。
 * 小數點太小、常黏在旁邊的字上，先當小點拿掉（parseExp 自己補回小數點）；% 是三塊，同一欄重疊的塊併成一個字。
 */
export function readExpText(frame: Frame, bar: StatusBar): string {
  const h = bar.bottom - bar.top;
  const mask = inkMask(frame, { x: bar.exp[0], y: bar.top - 0.8 * h, w: bar.exp[1] - bar.exp[0], h: 0.8 * h });
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
