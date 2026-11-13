// 把稿子＋配音組成 HyperFrames 專案資料夾（正片 1920×1080 或 Shorts 1080×1920）。
// 用法：
//   const { dir, durationSec } = await composeProject(
//     { script, voice, shortsVoice, images, avatars, date: "11/12" }, outDir, "main");
//   接著 `npx hyperframes render` 在 dir 裡出 mp4。
// 時長公式（寫死）：3 秒片頭 + Σ(每句秒數 + 0.25) + 3 秒片尾；第 i 句從 3 + Σ_{j<i}(sec_j + 0.25) 開始。
// 字型不進 repo：ensureFonts() 第一次會從 noto-cjk 下載到快取資料夾；測試傳 fonts 選項就不下載。
import { mkdir, copyFile, readFile, writeFile, rename, open } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(HERE, "../template");
const PUBLIC_DIR = resolve(HERE, "../../../public");

export const OPEN_SEC = 3;
export const END_SEC = 3;
export const GAP_SEC = 0.25;

const FONT_FILES = ["NotoSansTC-Black.otf", "NotoSansTC-Bold.otf"];
// 釘在 noto-cjk 的固定 commit（2026-11-13 的 main），避免上游改檔造成每次出片字型不同
const FONT_COMMIT = "f8d157532fbfaeda587e826d4cd5b21a49186f7c";
const FONT_URL = `https://github.com/notofonts/noto-cjk/raw/${FONT_COMMIT}/Sans/SubsetOTF/TC/`;

/** OTF 檔頭是 "OTTO"。 */
function isOtf(buf) {
  return buf.length >= 4 && buf.toString("ascii", 0, 4) === "OTTO";
}

async function fileIsOtf(file) {
  if (!existsSync(file)) return false;
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    if (size < 100_000) return false;
    const head = Buffer.alloc(4);
    await fh.read(head, 0, 4, 0);
    return isOtf(head);
  } finally {
    await fh.close();
  }
}

const LAYOUTS = {
  main: {
    width: 1920,
    height: 1080,
    headline: { base: 170, maxW: 1100 },
    card: { base: 150, maxW: 1100 },
    cardLine: { size: 52, maxW: 1100 },
    segTitle: { base: 120, maxW: 1100 },
    cap: { base: 62, min: 44, maxW: 1536 },
    endUrl: { base: 150, maxW: 1500 },
    tickerFont: 44,
    tickerGap: 60,
    tickerPad: 100,
    tickerSpeed: 40,
    bgPan: 90,
    imgArea: { left: 260, top: 205, width: 1400, height: 560 },
    // 前兩個角色的位置與高度（照 s2：右側、腳踩在跑馬燈上方）
    avatars: [
      { left: 1250, top: 430, height: 480 },
      { left: 1570, top: 500, height: 410 },
    ],
    // 進段落時角色縮小、往上，讓出字幕位置
    avShift: { scale: 0.72, x: 40, y: -150 },
  },
  shorts: {
    width: 1080,
    height: 1920,
    headline: { base: 150, maxW: 864 },
    card: { base: 140, maxW: 864 },
    cardLine: { size: 46, maxW: 864 },
    segTitle: { base: 96, maxW: 864 },
    cap: { base: 66, min: 46, maxW: 900 },
    endUrl: { base: 120, maxW: 900 },
    tickerFont: 40,
    tickerGap: 54,
    tickerPad: 108,
    tickerSpeed: 36,
    bgPan: 70,
    imgArea: { left: 60, top: 700, width: 960, height: 620 },
    avatars: [
      { left: 200, top: 860, height: 450 },
      { left: 570, top: 910, height: 400 },
    ],
    avShift: null,
  },
};

/** @param {'main'|'shorts'} layout */
export function layoutDims(layout) {
  const l = LAYOUTS[layout];
  if (!l) throw new Error(`不認得的版面：${layout}`);
  return { width: l.width, height: l.height };
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{sec:number}[]} lines
 * @returns {{starts:number[], durationSec:number}}
 */
export function computeTimings(lines) {
  const starts = [];
  let t = OPEN_SEC;
  for (const l of lines) {
    starts.push(r3(t));
    t += l.sec + GAP_SEC;
  }
  return { starts, durationSec: r3(t + END_SEC) };
}

/**
 * 每句旁白配什麼畫面：先依序配卡片；卡片用完輪流放官方圖；沒圖就停在最後一張卡；連卡都沒有放標題。
 * @returns {({kind:'card'|'image', index:number}|{kind:'title'})[]}
 */
export function segmentPlan(nLines, nCards, nImages) {
  const out = [];
  for (let i = 0; i < nLines; i++) {
    if (i < nCards) out.push({ kind: "card", index: i });
    else if (nImages > 0) out.push({ kind: "image", index: (i - nCards) % nImages });
    else if (nCards > 0) out.push({ kind: "card", index: nCards - 1 });
    else out.push({ kind: "title" });
  }
  return out;
}

const TOKEN = /[0-9A-Za-z/.:%~＋+-]/;
const BREAK_AFTER = /[，、。；：！？,;!?\s]/;
const NO_LINE_START = /[，、。；：！？）」』,.;:!?)]/;

/** 估算字寬（以全形字＝1 計）。 */
export function vlen(s) {
  let n = 0;
  for (const c of String(s)) {
    if (c === " ") n += 0.3;
    else if (/[0-9A-Za-z]/.test(c)) n += 0.6;
    else if (/[\x21-\x7e]/.test(c)) n += 0.4;
    else n += 1;
  }
  return n;
}

// 不能從中間切開的詞（長的放前面）
export const PROTECTED = ["楓之谷經典版", "楓谷幫手網站", "楓谷幫手", "maplehelper.tw"];
// 斷在這些字後面比較自然（沒有標點時次選）
const SOFT_AFTER = /[的是跟和在就也還都到從]/;
const CJK = /[\u3400-\u9fff]/;

/**
 * 字幕／標題斷行：放得下就一行；不然切兩行。
 * 優先斷在標點或空白後面（離中間最近）；沒有就挑離中間最近、而且
 * 不在英數串中間（11/21、13:00、KKTIX）、不在兩個一樣的字中間（喵／喵）、不切開 PROTECTED 詞的位置。
 * @returns {string[]}
 */
export function splitCaption(text, maxChars) {
  const t = String(text).trim();
  if (vlen(t) <= maxChars) return [t];
  const chars = [...t];
  const total = vlen(t);
  // 受保護詞涵蓋的字元位置（k 落在 (start, end) 之間就不准斷）
  const inside = new Set();
  for (const term of PROTECTED) {
    const tc = [...term];
    for (let i = 0; i + tc.length <= chars.length; i++) {
      if (chars.slice(i, i + tc.length).join("") === term) for (let k = i + 1; k < i + tc.length; k++) inside.add(k);
    }
  }
  const cands = [];
  for (let k = 1; k < chars.length; k++) {
    const a = chars[k - 1];
    const b = chars[k];
    if (TOKEN.test(a) && TOKEN.test(b)) continue;
    if (NO_LINE_START.test(b)) continue;
    if (inside.has(k)) continue;
    if (a === b && CJK.test(a)) continue;
    const left = chars.slice(0, k).join("").trimEnd();
    const right = chars.slice(k).join("").trimStart();
    if (!left || !right) continue;
    const lv = vlen(left);
    const rv = vlen(right);
    cands.push({ left, right, punct: BREAK_AFTER.test(a) || b === " ", soft: SOFT_AFTER.test(a), fits: lv <= maxChars && rv <= maxChars, diff: Math.abs(lv - rv) });
  }
  if (!cands.length) return [t];
  const pick = (list) => list.sort((x, y) => x.diff - y.diff)[0];
  const best =
    pick(cands.filter((c) => c.fits && c.punct)) ||
    pick(cands.filter((c) => c.fits && c.soft && c.diff <= total * 0.3)) ||
    pick(cands.filter((c) => c.fits)) ||
    pick(cands.filter((c) => c.punct && c.diff <= total * 0.25)) ||
    pick(cands);
  return [best.left, best.right];
}

/** 大標斷行：有空白就挑最平均的空白斷；短的一行；長的照字幕規則切兩行。 */
function splitTitle(text) {
  const t = String(text).trim();
  if (vlen(t) <= 6) return [t];
  const spaces = [...t.matchAll(/ /g)].map((m) => m.index);
  if (spaces.length) {
    let best = null;
    for (const i of spaces) {
      const a = t.slice(0, i).trim();
      const b = t.slice(i + 1).trim();
      const m = Math.max(vlen(a), vlen(b));
      if (!best || m < best.m) best = { lines: [a, b], m };
    }
    return best.lines;
  }
  return splitCaption(t, Math.ceil(vlen(t) / 2) + 1);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const NUM = /\d+(?:[/.:]\d+)*%?/g;

/** 數字、日期上黃色（s2：「11/19」黃色，其他白色）。 */
function accent(s, tag = "span") {
  const e = esc(s);
  return tag === "b" ? e.replace(NUM, (m) => `<b>${m}</b>`) : e.replace(NUM, (m) => `<span class="y">${m}</span>`);
}

function fitSize({ base, maxW }, lines) {
  const w = Math.max(...lines.map(vlen), 1);
  return Math.max(24, Math.min(base, Math.floor(maxW / w)));
}

function titleBlock(text, spec, cls) {
  // 卡片大字：一行放得下（字不小於 72%）就不拆，避免「19／把楓葉武器」這種斷法
  const oneLine = cls === "big" && spec.maxW / Math.max(vlen(text), 1) >= spec.base * 0.72;
  const lines = oneLine ? [String(text).trim()] : splitTitle(text);
  const size = fitSize(spec, lines);
  const hasNum = /\d/.test(text);
  const inner = lines.map((l) => `<span class="hl-line">${hasNum || cls !== "big" ? accent(l) : `<span class="y">${esc(l)}</span>`}</span>`).join("");
  return `<div class="${cls}" style="font-size:${size}px">${inner}</div>`;
}

const FORBIDDEN = /[⌀-⏿■-◿\u{1F300}-\u{10FFFF}\u{2600}-\u{27BF}️]/gu;
function clean(s) {
  return String(s ?? "").replace(FORBIDDEN, "");
}

function captionHtml(text, spec) {
  const shown = clean(text).trim().replace(/[。．]+$/u, "");
  // 字幕行尾的逗號、頓號拿掉（台灣字幕慣例：斷行處不留標點）
  const lines = splitCaption(shown, Math.floor(spec.maxW / spec.base)).map((l) => l.replace(/[，、；：,;:]+$/u, ""));
  const w = Math.max(...lines.map(vlen), 1);
  const size = Math.max(spec.min, Math.min(spec.base, Math.floor(spec.maxW / w)));
  return { size, inner: lines.map((l) => `<span class="cap-line">${esc(l)}</span>`).join("") };
}

/**
 * 卡片補充句：去句尾句號；放不下就自己切兩行（兩行長度平均、優先斷在標點），不讓瀏覽器折出單一個字的尾行。
 * @returns {string}
 */
export function cardLineHtml(text, spec) {
  const t = clean(text).trim().replace(/[。．]+$/u, "");
  const lines = splitCaption(t, Math.floor(spec.maxW / spec.size)).map((l) => l.replace(/[，、；：,;:]+$/u, ""));
  return lines.map((l) => `<span class="ln">${esc(l)}</span>`).join("");
}

function tickerHtml(items, L, durationSec) {
  const list = items.map(clean).filter(Boolean);
  if (!list.length) return { html: "", dist: 0 };
  const cycle = list.reduce((n, s) => n + vlen(s) * L.tickerFont + L.tickerGap, 0);
  const dist = Math.round(L.tickerSpeed * Math.max(0, durationSec - OPEN_SEC));
  const reps = Math.max(1, Math.ceil((L.width + dist) / Math.max(cycle, 1)) + 1);
  const spans = [];
  for (let r = 0; r < reps; r++) for (const s of list) spans.push(`<span>${accent(s, "b")}</span>`);
  return { html: spans.join(""), dist };
}

/** 讀圖片長寬（PNG、JPEG、GIF、WebP 檔頭），讀不到回 null。 */
export function imageSize(buf) {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const kind = buf.toString("ascii", 12, 16);
      if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (kind === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
      }
      if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {
    /* 讀不到就用整塊區域 */
  }
  return null;
}

/** 官方圖的框照圖片比例縮進區域裡置中；不知道比例就用整塊區域。 */
function fitBox(area, size) {
  if (!size || !size.w || !size.h) return area;
  const k = Math.min(area.width / size.w, area.height / size.h);
  const width = Math.round(size.w * k);
  const height = Math.round(size.h * k);
  return { left: Math.round(area.left + (area.width - width) / 2), top: Math.round(area.top + (area.height - height) / 2), width, height };
}

async function ensureCopied(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
}

/**
 * 確保兩個字型檔在快取資料夾，沒有就下載。回傳裝字型的資料夾。
 * @param {string} [cacheDir]
 */
export async function ensureFonts(cacheDir = process.env.VIDEO_CACHE || join(tmpdir(), "maplehelper-video"), { fetcher = fetch } = {}) {
  const dir = join(cacheDir, "fonts");
  await mkdir(dir, { recursive: true });
  for (const name of FONT_FILES) {
    const file = join(dir, name);
    if (await fileIsOtf(file)) continue;
    const res = await fetcher(FONT_URL + name);
    if (!res.ok) throw new Error(`字型下載失敗 ${res.status}：${name}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isOtf(buf)) throw new Error(`字型下載內容不是 OTF：${name}`);
    // 先寫暫存名再改名，中途斷掉不會留下半個檔
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, file);
  }
  return dir;
}

/**
 * @param {{script: import('./facts.mjs').Script, voice: {file:string,text:string,sec:number}[],
 *   shortsVoice?: {file:string,text:string,sec:number}[], images?: string[], avatars?: string[],
 *   date: string, fonts?: string, publicDir?: string}} input
 * @param {string} outDir
 * @param {'main'|'shorts'} layout
 * @returns {Promise<{dir:string, durationSec:number}>}
 */
export async function composeProject(input, outDir, layout) {
  const L = LAYOUTS[layout];
  if (!L) throw new Error(`不認得的版面：${layout}`);
  const { script, date } = input;
  const lines = (layout === "shorts" ? input.shortsVoice : input.voice) || [];
  if (!lines.length) throw new Error(`${layout} 沒有旁白音檔`);
  lines.forEach((l, i) => {
    if (!Number.isFinite(l.sec) || l.sec <= 0) throw new Error(`第 ${i + 1} 句旁白秒數不對：${l.sec}`);
  });
  const images = input.images || [];
  const avatars = (input.avatars || []).slice(0, 2);
  const publicDir = input.publicDir || PUBLIC_DIR;
  const dir = resolve(outDir);
  const assets = join(dir, "assets");
  await mkdir(join(assets, "fonts"), { recursive: true });

  // 素材
  const fontDir = input.fonts || (await ensureFonts());
  for (const f of FONT_FILES) await ensureCopied(join(fontDir, f), join(assets, "fonts", f));
  await ensureCopied(join(TEMPLATE_DIR, "gsap.min.js"), join(assets, "gsap.min.js"));
  await ensureCopied(join(publicDir, "brand-emblem.png"), join(assets, "brand-emblem.png"));
  await ensureCopied(join(publicDir, "assets", "map_renders", "100000000.webp"), join(assets, "map.webp"));
  const avPaths = [];
  for (let i = 0; i < avatars.length; i++) {
    const p = `assets/avatar-${i + 1}${extname(avatars[i]).toLowerCase() || ".png"}`;
    await ensureCopied(avatars[i], join(dir, p));
    avPaths.push(p);
  }
  const imgPaths = [];
  const imgBoxes = [];
  for (let i = 0; i < images.length; i++) {
    const p = `assets/img-${i + 1}${extname(images[i]).toLowerCase() || ".png"}`;
    await ensureCopied(images[i], join(dir, p));
    imgPaths.push(p);
    imgBoxes.push(fitBox(L.imgArea, imageSize(await readFile(images[i]))));
  }
  const voPaths = [];
  for (let i = 0; i < lines.length; i++) {
    const p = `assets/vo-${String(i + 1).padStart(2, "0")}${extname(lines[i].file).toLowerCase() || ".mp3"}`;
    await ensureCopied(lines[i].file, join(dir, p));
    voPaths.push(p);
  }

  // 時間
  const { starts, durationSec } = computeTimings(lines);
  const END = r3(durationSec - END_SEC);
  const plan = segmentPlan(lines.length, (script.cards || []).length, imgPaths.length);
  let avEnd = OPEN_SEC;
  for (let i = 0; i < plan.length && plan[i].kind !== "image"; i++) avEnd = r3(starts[i] + lines[i].sec + GAP_SEC);
  if (!avPaths.length) avEnd = OPEN_SEC;

  const title = clean(script.title);
  const subtitle = clean(script.subtitle);
  const dateText = `官方公告 ${clean(date)}`;
  let track = 0;
  const clip = (id, start, dur, extra = "") => `id="${id}" class="clip${extra}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="${track++}"`;

  const body = [];
  body.push(`<div id="root" data-composition-id="main" data-start="0" data-duration="${durationSec}" data-width="${L.width}" data-height="${L.height}">`);

  body.push(`<div ${clip("bg", 0, durationSec)} style="position:absolute;inset:0;z-index:1"><div class="bg-frame" data-layout-allow-overflow><div class="bg-pan"><img src="assets/map.webp" alt=""></div><div class="bg-dim"></div></div></div>`);

  // 片頭
  body.push(
    `<div ${clip("open", 0, OPEN_SEC)} style="position:absolute;inset:0;z-index:5"><div class="open-in full">` +
      `<div class="bar"><div class="red">快報</div><div class="yel">${esc(dateText)}</div></div>` +
      `<div class="o-text">${titleBlock(title, L.headline, "headline")}${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}</div>` +
      `</div></div>`,
  );

  // 角色
  if (avPaths.length) {
    const imgs = avPaths.map((p, i) => `<img class="av" src="${p}" alt="" style="left:${L.avatars[i].left}px;top:${L.avatars[i].top}px;height:${L.avatars[i].height}px">`).join("");
    body.push(`<div ${clip("avs", 0, avEnd)} style="position:absolute;inset:0;z-index:4"><div class="avs-in full">${imgs}</div></div>`);
  }

  // 段落小條＋品牌
  body.push(`<div ${clip("hdr", OPEN_SEC, END - OPEN_SEC)} style="position:absolute;inset:0;z-index:6"><div class="bar"><div class="red">快報</div><div class="yel">${esc(dateText)}</div></div></div>`);
  body.push(`<div ${clip("brand", 0, END)} style="position:absolute;inset:0;z-index:6"><div class="brand-in"><img src="assets/brand-emblem.png" alt="">楓谷幫手</div></div>`);

  // 段落
  const segs = [];
  plan.forEach((p, i) => {
    const id = `seg-${i + 1}`;
    const start = starts[i];
    const dur = r3((i + 1 < starts.length ? starts[i + 1] : END) - start);
    let inner;
    if (p.kind === "card") {
      const c = script.cards[p.index];
      inner = `<div class="card">${titleBlock(clean(c.big), L.card, "big")}${c.line ? `<div class="line">${cardLineHtml(c.line, L.cardLine)}</div>` : ""}</div>`;
    } else if (p.kind === "image") {
      const t = layout === "shorts" ? `<div class="seg-title">${titleBlock(title, L.segTitle, "headline")}</div>` : "";
      const b = imgBoxes[p.index];
      inner = `${t}<div class="imgbox" data-layout-allow-overflow style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px"><div class="imgpan"><img src="${imgPaths[p.index]}" alt=""></div></div>`;
    } else {
      inner = `<div class="card">${titleBlock(title, L.card, "big")}</div>`;
    }
    body.push(`<div ${clip(id, start, dur, " seg")} style="position:absolute;inset:0;z-index:3"><div class="seg-in full">${inner}</div></div>`);
    segs.push({ id, start, dur, kind: p.kind });
  });

  // 字幕
  const caps = [];
  lines.forEach((l, i) => {
    const id = `cap-${i + 1}`;
    const { size, inner } = captionHtml(l.text, L.cap);
    body.push(`<div ${clip(id, starts[i], l.sec, " cap")} style="z-index:8"><div class="cap-in" style="font-size:${size}px">${inner}</div></div>`);
    caps.push({ id, start: starts[i], dur: r3(l.sec) });
  });

  // 片尾
  const urlSize = fitSize(L.endUrl, ["maplehelper.tw"]);
  body.push(
    `<div ${clip("end", END, END_SEC)} style="position:absolute;inset:0;z-index:5"><div class="end-in">` +
      `<img class="end-logo" src="assets/brand-emblem.png" alt="">` +
      `<div class="end-lead">完整整理在</div>` +
      `<div class="end-url" style="font-size:${urlSize}px">maplehelper.tw</div>` +
      `</div></div>`,
  );

  // 跑馬燈
  const tk = tickerHtml(script.ticker || [], L, durationSec);
  body.push(`<div ${clip("ticker", 0, durationSec)} style="position:absolute;inset:0;z-index:7"><div class="tk-bar" data-layout-allow-overflow><div class="tk-track">${tk.html}</div></div></div>`);

  // 旁白
  lines.forEach((l, i) => {
    body.push(`<audio id="vo-${i + 1}" src="${voPaths[i]}" class="clip" data-start="${starts[i]}" data-duration="${r3(l.sec)}" data-track-index="${track++}" data-volume="1"></audio>`);
  });
  body.push(`</div>`);

  const D = {
    dur: durationSec,
    layout,
    segs,
    caps,
    avEnd,
    hasAvatars: avPaths.length > 0,
    avShift: L.avShift && avEnd > OPEN_SEC ? L.avShift : null,
    tickerDist: tk.dist,
    bgPan: L.bgPan,
  };

  const [tpl, baseCss, tlJs, hfJson] = await Promise.all([
    readFile(join(TEMPLATE_DIR, `${layout}.html`), "utf8"),
    readFile(join(TEMPLATE_DIR, "base.css"), "utf8"),
    readFile(join(TEMPLATE_DIR, "timeline.js"), "utf8"),
    readFile(join(TEMPLATE_DIR, "hyperframes.json"), "utf8"),
  ]);
  const html = tpl
    .replace("/*BASE_CSS*/", () => baseCss)
    .replace("<!--BODY-->", () => body.join("\n    "))
    .replace("/*TIMELINE*/", () => `const D = ${JSON.stringify(D)};\n${tlJs}`);
  await writeFile(join(dir, "index.html"), html);
  await writeFile(join(dir, "hyperframes.json"), hfJson);
  return { dir, durationSec };
}
