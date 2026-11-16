/**
 * 每頁自己的分享預覽圖（v2.31，11/16 使用者選 B 底圖＋單筆資料頁也要）。
 *
 * 用法：node scripts/og/build-og.mjs [out 資料夾]（npm run build:cf 建完網頁後自動跑，不用自己叫）
 *
 * 做法：掃 out/ 每個 html，og:image 指到 /og/... 的（src/lib/seo.ts 的 ogImageFor）就照那頁的 og:title、og:description 畫一張
 *   1200×630 jpg 放 out/og/...。頁面寫什麼字就畫什麼字，不在這裡另外組句子；首頁跟攻略文（有自己的主圖）不會指到 /og/，不產。
 * 版面：弓箭手村底圖（bg.jpg，跟全站預覽圖 public/og.jpg 同一張 AI 圖）＋左邊奶油色字卡＋右邊那筆資料的遊戲圖
 *   （怪、NPC、道具、技能用原圖最近鄰放大保留像素感；地圖用地圖全景；任務用接任務的 NPC；工具頁、清單頁只有字）。
 * 字型：fonts/ 的 Noto Sans TC 500、900（Google Fonts 的靜態檔，OFL），建置機不用另外裝字。
 * 圖要在道具圖搬去 .cf-items 之前跑（道具頁要讀 out/assets/items）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1200;
const H = 630;
const MAX_BYTES = 200 * 1024;
const SITE_SUFFIX = "楓谷幫手";

GlobalFonts.registerFromPath(path.join(HERE, "fonts", "NotoSansTC-500.ttf"), "OG Regular");
GlobalFonts.registerFromPath(path.join(HERE, "fonts", "NotoSansTC-900.ttf"), "OG Black");

/** og:image 網址 → out/ 底下的相對檔名；不是 /og/ 開頭的回 null */
export function ogImagePath(url) {
  const pathname = url.replace(/^https?:\/\/[^/]+/, "");
  if (!pathname.startsWith("/og/") || !pathname.endsWith(".jpg")) return null;
  return path.join(...pathname.slice(1).split("/"));
}

const unescape = text =>
  text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");

function meta(html, property) {
  const match = html.match(new RegExp(`<meta property="og:${property}" content="([^"]*)"`));
  return match ? unescape(match[1]) : "";
}

/** og:title 用「｜」分段，最後一段是站名：第一段當大標、中間當副標 */
export function readOgMeta(html) {
  const parts = meta(html, "title").split("｜").filter(part => part && part !== SITE_SUFFIX);
  return { title: parts[0] ?? "", ...(parts.length > 1 ? { subtitle: parts.slice(1).join("｜") } : {}), description: meta(html, "description"), image: meta(html, "image") };
}

const LABELS = { monsters: "怪物", maps: "地圖", npcs: "NPC", items: "道具", quests: "任務", skills: "技能" };

/** 頁面網址 → 配哪張遊戲圖（public 底下的相對路徑，前面的沒有就用下一個） */
export function spriteFor(pagePath, quests) {
  const match = pagePath.match(/^\/db\/(monsters|maps|npcs|items|quests|skills)\/(\d+)$/);
  if (!match) return null;
  const [, type, id] = match;
  if (type === "monsters") return { kind: "sprite", files: [`assets/monster_frames/${id}.png`, `assets/monsters/${id}.png`] };
  if (type === "maps") return { kind: "map", files: [`assets/map_renders/${id}.webp`] };
  if (type === "quests") {
    const npc = quests.find(quest => quest.id === id)?.sNpc?.id;
    return npc ? { kind: "sprite", files: [`assets/npcs/${npc}.png`] } : null;
  }
  return { kind: "sprite", files: [`assets/${type}/${id}.png`] };
}

/**
 * 照寬度折行：中文一個字一個字斷，英數（Lv.80、760,500）整串不切；超過 maxLines 最後一行收成「…」。
 * measure 傳進來，測試不用真的字型。
 */
export function wrapText(text, maxWidth, maxLines, measure) {
  const tokens = text.match(/[A-Za-z0-9.,%+\-~～:]+|\s+|./gu) ?? [];
  const lines = [];
  let line = "";
  for (const token of tokens) {
    // 句讀、右括號不放行首：超出一點也擠在這行尾巴（字卡右邊有留白）
    if (measure(line + token) <= maxWidth || !line || /^[，。、；：）」』】》！？…,.]$/u.test(token)) {
      line += token;
      continue;
    }
    // 左括號不掛在行尾：帶到下一行
    const open = line.match(/[（「『【《(]+$/u)?.[0] ?? "";
    lines.push(line.slice(0, line.length - open.length).trimEnd());
    line = open + token.trimStart();
  }
  if (line) lines.push(line.trimEnd());
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

let background;
let leaf;
async function staticImages() {
  background ??= await loadImage(fs.readFileSync(path.join(HERE, "bg.jpg")));
  leaf ??= await loadImage(fs.readFileSync(path.join(HERE, "..", "..", "src", "app", "icon.png")));
  return { background, leaf };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function loadFirst(files, assetsDir) {
  for (const file of files) {
    const full = path.join(assetsDir, file);
    if (!fs.existsSync(full)) continue;
    // canvas 讀 webp 不一定行，一律先轉 png
    return loadImage(await sharp(full).png().toBuffer());
  }
  return null;
}

/** 畫一張：card＝{ title, subtitle?, description, label? }；art＝spriteFor 的結果或 null */
export async function renderCard(card, art, assetsDir) {
  const { background, leaf } = await staticImages();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(background, 0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  const picture = art ? await loadFirst(art.files, assetsDir) : null;
  const hasArt = Boolean(picture);
  // 字卡：有遊戲圖的放左邊 58%，沒有的寬一點
  const cardX = 40;
  const cardY = 40;
  const cardW = hasArt ? 690 : 820;
  const cardH = H - 80;
  ctx.fillStyle = "rgba(255, 248, 231, 0.95)";
  roundRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#8a5a2b";
  ctx.stroke();

  if (picture) {
    // 右邊放遊戲圖：白色圓角底板，像素圖整數倍放大
    const boxX = cardX + cardW + 30;
    const boxW = W - boxX - 40;
    const boxY = 60;
    const boxH = H - 120;
    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    roundRect(ctx, boxX, boxY, boxW, boxH, 22);
    ctx.fill();
    if (art.kind === "map") {
      // 地圖整張很寬，縮進框裡只剩一條線：改成填滿框、裁中間那段
      const scale = Math.max(boxW / picture.width, boxH / picture.height);
      const w = picture.width * scale;
      const h = picture.height * scale;
      ctx.save();
      roundRect(ctx, boxX, boxY, boxW, boxH, 22);
      ctx.clip();
      // 地圖圖檔的天空是透明的，先鋪天空色，不然會透出後面的底圖
      const sky = ctx.createLinearGradient(0, boxY, 0, boxY + boxH);
      sky.addColorStop(0, "#bfe3f7");
      sky.addColorStop(1, "#eef8fd");
      ctx.fillStyle = sky;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(picture, boxX + (boxW - w) / 2, boxY + (boxH - h) / 2, w, h);
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#8a5a2b";
      roundRect(ctx, boxX, boxY, boxW, boxH, 22);
      ctx.stroke();
    } else {
      // 像素圖整數倍放大
      const pad = 36;
      const fit = Math.min((boxW - pad * 2) / picture.width, (boxH - pad * 2) / picture.height);
      const scale = fit < 1 ? fit : Math.max(1, Math.floor(fit));
      const w = picture.width * scale;
      const h = picture.height * scale;
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.drawImage(picture, boxX + (boxW - w) / 2, boxY + (boxH - h) / 2, w, h);
    }
    ctx.imageSmoothingEnabled = false;
  }

  const textX = cardX + 44;
  const textW = cardW - 88;
  let y = cardY + 58;
  if (card.label) {
    ctx.font = "30px 'OG Black'";
    const labelW = ctx.measureText(card.label).width + 36;
    ctx.fillStyle = "#c2551f";
    roundRect(ctx, textX, y - 6, labelW, 48, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(card.label, textX + 18, y + 18);
    y += 72;
  } else {
    y += 10;
  }

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#3b2412";
  // 標題太長就縮字，縮到 56 還放不下就折成兩行
  let size = 84;
  ctx.font = `${size}px 'OG Black'`;
  while (size > 56 && ctx.measureText(card.title).width > textW) {
    size -= 4;
    ctx.font = `${size}px 'OG Black'`;
  }
  const titleLines = wrapText(card.title, textW, 2, text => ctx.measureText(text).width);
  for (const line of titleLines) {
    y += size;
    ctx.fillText(line, textX, y);
    y += 8;
  }

  if (card.subtitle) {
    ctx.font = "34px 'OG Black'";
    ctx.fillStyle = "#8a4b1d";
    for (const line of wrapText(card.subtitle, textW, 1, text => ctx.measureText(text).width)) {
      y += 46;
      ctx.fillText(line, textX, y);
    }
  }

  // 描述：放到底部品牌列上面為止
  const brandY = cardY + cardH - 46;
  ctx.font = "30px 'OG Regular'";
  ctx.fillStyle = "#5a3d22";
  const lineH = 44;
  const room = Math.max(0, Math.floor((brandY - 40 - (y + 18)) / lineH));
  y += 18;
  for (const line of wrapText(card.description, textW, Math.min(room, 5), text => ctx.measureText(text).width)) {
    y += lineH;
    ctx.fillText(line, textX, y);
  }

  // 底部品牌：楓葉＋楓谷幫手＋網址
  ctx.drawImage(leaf, textX, brandY - 30, 52, 52);
  ctx.font = "32px 'OG Black'";
  ctx.fillStyle = "#3b2412";
  ctx.fillText("楓谷幫手", textX + 64, brandY + 8);
  const nameW = ctx.measureText("楓谷幫手").width;
  ctx.font = "26px 'OG Regular'";
  ctx.fillStyle = "#8a6a4a";
  ctx.fillText("maplehelper.tw・新楓之谷經典版", textX + 64 + nameW + 18, brandY + 6);

  // 畫布直接出 jpg：先存 png 再給 sharp 壓 mozjpeg 一張要 0.3 秒以上，3,600 張會讓 Workers Builds 超時（v2.31 量的）
  for (let quality = 85; quality >= 55; quality -= 10) {
    const jpg = await canvas.encode("jpeg", quality);
    if (jpg.length <= MAX_BYTES) return jpg;
  }
  return canvas.encode("jpeg", 45);
}

function* htmlFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_next" || entry.name === "assets" || entry.name === "og") continue;
      yield* htmlFiles(full);
    } else if (entry.name.endsWith(".html")) yield full;
  }
}

/** 掃 outDir 產圖，回傳產了幾張。assetsDir 是遊戲圖所在（預設 outDir，public 的東西建完都在 out/） */
export async function buildOgImages(outDir, { assetsDir = outDir } = {}) {
  const questsFile = path.join(outDir, "data", "quests.json");
  const raw = fs.existsSync(questsFile) ? JSON.parse(fs.readFileSync(questsFile, "utf8")) : [];
  const quests = Array.isArray(raw) ? raw : Object.values(raw);
  let made = 0;
  for (const file of htmlFiles(outDir)) {
    const og = readOgMeta(fs.readFileSync(file, "utf8"));
    const target = og.image && ogImagePath(og.image);
    if (!target) continue;
    const pagePath = `/${path.relative(outDir, file).replace(/\\/g, "/").replace(/(\/index)?\.html$/, "")}`;
    const type = pagePath.match(/^\/db\/(\w+)\/\d+$/)?.[1];
    const jpg = await renderCard({ ...og, label: LABELS[type] }, spriteFor(pagePath, quests), assetsDir);
    const dest = path.join(outDir, target);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, jpg);
    made += 1;
  }
  return made;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? path.join(HERE, "..", "..", "out"));
  const started = Date.now();
  const made = await buildOgImages(out);
  console.log(`[og] 產了 ${made} 張分享預覽圖（${((Date.now() - started) / 1000).toFixed(1)} 秒）`);
}
