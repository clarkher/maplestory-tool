// 截圖文字 → 成交紀錄。輸入是 ocr.mjs 的結果：{ width, height, meanLuma, stdLuma, lines:[{ text, words:[{ text, x, y, w, h }] }] }
// 市價分頁的欄位位置要照使用者的真截圖定（Task 10）；這裡先用不靠欄位位置的讀法：一列裡找日期、數量、屬性，剩下的數字是價格。
import { lcs, bestNameScore } from "./match.mjs";

/** 經典版開服日，比這早的交易日期一定是讀錯 */
export const OPEN_DATE = "2026-07-29";
/** 裝備屬性的正式寫法（辨識錯字時照最像的對） */
export const ATTR_LABELS = ["魔法攻擊力", "攻擊力", "物理防禦力", "魔法防禦力", "力量", "敏捷", "智力", "幸運", "命中率", "迴避率", "移動速度", "跳躍力", "HP", "MP"];
/** 認「這是拍賣市價頁」的字（客戶端字串表裡的介面字） */
const PAGE_WORDS = ["市價", "交易日期", "楓之谷拍賣"];

const pad = n => String(n).padStart(2, "0");

/** 全形標點轉半形、標點旁邊的空白拿掉、中文字之間的空白拿掉 */
export function normalizeText(text) {
  return String(text)
    .replace(/／/g, "/").replace(/，/g, ",").replace(/：/g, ":").replace(/＋/g, "+").replace(/．/g, ".")
    .replace(/\s*([,/.:%+])\s*/g, "$1")
    .replace(/(?<=[^\x00-\x7F])\s+(?=[^\x00-\x7F])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 把辨識出來的字照高度重排成一列一列（Windows 的「行」可能把同一列拆開），同一列照左到右 */
export function rowsOf(ocr) {
  const words = ocr.lines.flatMap(l => l.words).filter(w => String(w.text ?? "").trim());
  if (!words.length) return [];
  const hs = words.map(w => w.h).sort((a, b) => a - b);
  const tol = hs[hs.length >> 1] * 0.6;
  const sorted = [...words].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const rows = [];
  for (const w of sorted) {
    const cy = w.y + w.h / 2;
    const row = rows.at(-1);
    if (row && Math.abs(cy - row.cy) <= tol) {
      row.words.push(w);
      row.cy = (row.cy * (row.words.length - 1) + cy) / row.words.length;
    } else rows.push({ cy, words: [w] });
  }
  return rows.map(r => {
    const ws = r.words.sort((a, b) => a.x - b.x);
    const x = Math.min(...ws.map(w => w.x)), y = Math.min(...ws.map(w => w.y));
    const x2 = Math.max(...ws.map(w => w.x + w.w)), y2 = Math.max(...ws.map(w => w.y + w.h));
    return { text: ws.map(w => w.text).join(" "), x, y, w: x2 - x, h: y2 - y };
  });
}

function bestLabel(raw) {
  const rawLen = [...raw].length;
  const labelScores = [];

  for (let i = 0; i < ATTR_LABELS.length; i++) {
    const label = ATTR_LABELS[i];
    const n = [...label].length;
    let bestCount = 0, bestRatio = 0;

    // 拿字尾試 n-1、n、n+1 個字（n＝標籤字數），長度限制在 1 到讀到的字數之間
    for (let len = Math.max(1, n - 1); len <= Math.min(rawLen, n + 1); len++) {
      const tail = [...raw].slice(-len).join("");
      const count = lcs(label, tail);
      const ratio = count / Math.max(n, len);
      if (count > bestCount || (count === bestCount && ratio > bestRatio)) {
        bestCount = count;
        bestRatio = ratio;
      }
    }

    labelScores.push({ label, count: bestCount, ratio: bestRatio, index: i });
  }

  // 排序：共同字數多的在前、比例高的在前、一樣就照 ATTR_LABELS 原本的順序
  labelScores.sort((a, b) =>
    b.count !== a.count ? b.count - a.count :
    b.ratio !== a.ratio ? b.ratio - a.ratio :
    a.index - b.index
  );

  const best = labelScores[0];
  return best.ratio >= 0.6 ? best.label : null;
}

const ATTR_RE = /([^\d\s+,]{1,6})\+(\d+)/g;

/** 一列文字 → 一筆成交；沒有日期或沒有價格回 null */
export function parseRow(text, today) {
  let s = normalizeText(text);
  let tradedAt = null;
  const full = s.match(/(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (full) {
    tradedAt = `${full[1]}-${pad(full[2])}-${pad(full[3])}`;
    s = s.replace(full[0], " ");
  } else {
    const short = s.match(/(?<![\d,])(\d{1,2})[/.-](\d{1,2})(?![\d,])/);
    if (short) {
      const year = Number(today.slice(0, 4));
      tradedAt = `${year}-${pad(short[1])}-${pad(short[2])}`;
      if (tradedAt > today) tradedAt = `${year - 1}-${pad(short[1])}-${pad(short[2])}`;
      s = s.replace(short[0], " ");
    }
  }
  if (!tradedAt) return null;
  s = s.replace(/\d{1,2}:\d{2}(?::\d{2})?/g, " ");

  let qty = null;
  const q = s.match(/[xX×]\s?(\d+)|(\d+)個/);
  if (q) { qty = Number(q[1] ?? q[2]); s = s.replace(q[0], " "); }

  const attrs = {};
  const unrecognized = [];
  for (const m of s.matchAll(ATTR_RE)) {
    const label = bestLabel(m[1]);
    if (label) attrs[label] = Number(m[2]);
    else unrecognized.push(`${m[1]}+${m[2]}`);
  }
  s = s.replace(ATTR_RE, " ").replace(/\d+%/g, " ");

  const nums = (s.match(/\d[\d,]*\d|\d/g) ?? []).map(x => Number(x.replace(/,/g, ""))).filter(n => n > 0);
  if (!nums.length) return null;

  const out = { tradedAt, price: null, unitPrice: null, qty, attrs: Object.keys(attrs).length ? attrs : null, flags: [...unrecognized.map(u => `讀到屬性但認不出是哪一項：${u}`)] };
  if (nums.length === 1) {
    if (qty && qty > 1) { out.price = nums[0]; out.flags.push("有數量但只讀到一個價格"); }
    else { out.price = out.unitPrice = nums[0]; out.qty = 1; }
  } else if (nums.length === 2) {
    const [small, big] = [...nums].sort((a, b) => a - b);
    out.price = big;
    out.unitPrice = small;
    if (out.qty == null) out.qty = big % small === 0 ? big / small : null;
  } else {
    out.flags.push(`這行讀到 ${nums.length} 個數字，分不出價格`);
  }
  return out;
}

/** 整張很暗又幾乎沒變化＝全螢幕獨佔模式截到的黑畫面 */
export const isBlack = ocr => ocr.meanLuma < 30 && ocr.stdLuma < 6;

/** 一張截圖 → 這件的成交紀錄（或為什麼沒讀到） */
export function parseShot(ocr, { item, today }) {
  if (isBlack(ocr)) return { kind: "black", reason: "截到黑畫面，遊戲改成視窗或無邊框再截", trades: [] };
  const rows = rowsOf(ocr);
  const texts = rows.map(r => r.text);
  if (!PAGE_WORDS.some(w => bestNameScore(w, texts) > 0)) return { kind: "not-auction", reason: "這張不是拍賣的市價頁，略過", trades: [] };
  if (bestNameScore(item, texts) === 0) return { kind: "wrong-item", reason: "對不上，請重截", trades: [] };
  const trades = [];
  for (const r of rows) {
    const t = parseRow(r.text, today);
    if (t) trades.push({ ...t, box: { x: r.x, y: r.y, w: r.w, h: r.h } });
  }
  if (!trades.length) return { kind: "empty", reason: "這張沒讀到價格", trades: [] };
  return { kind: "ok", reason: "", trades };
}
