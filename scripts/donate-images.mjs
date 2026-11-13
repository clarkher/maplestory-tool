/**
 * 贊助頁的圖（v2.22）：站上寫手角色（紙娃娃）喝珍奶、吃雞排、吃速食套餐，畫風跟攻略文主圖一樣。
 *
 * 用法：
 *   node scripts/donate-images.mjs          只做底稿（不花錢），印出還缺哪幾張
 *   node scripts/donate-images.mjs --ai     缺圖的才呼叫 AI 畫（會花錢）
 *   node scripts/donate-images.mjs tea --ai --regen   重畫這幾張（不看快取、蓋掉 public 的圖）
 *
 * 做法（同 guide-card-heroes.mjs）：
 *   1. 底稿＝射手村地圖畫面（public/assets/map_renders/100000000）＋maplestory.io 的紙娃娃角色（寫手外觀同 job-article-images.mjs 的 PERSONAS），
 *      最近鄰放大保留像素感。
 *   2. 底稿丟 Gemini（gemini-3.1-flash-image-preview，banana 生圖那把金鑰）重繪，prompt 在下面 SCENES 的 idea。
 *   3. 存 public/assets/support/<名字>.webp：hero 1536×864（300KB 內），金額三張 512×512（80KB 內）。
 *
 * 快取：data/cache/guide-images/（gitignore），底稿 donatesrc-<名字>.png、AI 原檔 donate-<名字>-<雜湊>.png，沒變不重花錢。
 * AI 金鑰讀 banana 的 MCP 設定（絕不印）。跑完每張都要自己用眼睛看：不准有字、不准有真實品牌標誌。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/assets/support");
const CACHE = process.env.ARTICLE_IMG_CACHE ?? path.join(ROOT, "data/cache/guide-images");

const STYLE =
  "Repaint this side-scrolling game scene as a high-quality 2D anime-style game key art illustration in the spirit of a bright cute fantasy MMORPG: clean confident line art, rich painted shading, warm lighting, polished and appealing, vivid saturated colors. Keep each character's hair, outfit and colors like the sprites.";
const RULES =
  "Absolutely no text, no letters, no numbers, no logos, no brand marks, no watermarks, no signs with writing, no UI, no speech bubbles anywhere in the image. Food packaging is plain with no logos. Nothing important cut off.";

// 寫手外觀：同 scripts/job-article-images.mjs 的 PERSONAS
const LOOKS = {
  healer: { ids: [31156, 27055, 1051046, 1072077, 1102184], look: "a slim young woman healer with long straight purple hair and a gold hairband, cool half-lidded gray eyes, white and gold priestess robe, small pale pink-white angel wings" },
  archer: { ids: [30127, 23066, 1022037, 1042100, 1062041, 1072391], look: "a frugal young man with neat spiky brown hair and thin rimless glasses, plain checkered shirt with a small orange tie, faded blue denim pants" },
  warrior: { ids: [30231, 23042, 1050084, 1072201, 1102142], look: "a hot-blooded young warrior with wild spiky crimson hair, tight red jumpsuit, red boots, a cape of orange flames" },
  rich: { ids: [35203, 23042, 1003861, 1022041, 1050135, 1072280, 1102158, 1032020], look: "a flashy young man with fluffy platinum blond hair, a tiny golden crown floating above his head, big black sunglasses, white tailcoat tuxedo with a pink bow tie" },
};

/** who：[角色, x（腳中心，畫面寬比例）, 朝右?]；角色高度 h（畫面高比例），腳底在 y */
const SCENES = [
  {
    name: "hero", w: 1536, h: 864, max: 300 * 1024, crop: [700, 0, 405, 228], charH: 0.42, y: 0.93,
    who: [["healer", 0.2, true], ["archer", 0.4, true], ["warrior", 0.6, false], ["rich", 0.8, false]],
    idea: [
      "Turn the scene into a cozy Taiwanese-style night market street in a mushroom village at dusk: warm string lights and paper lanterns, steaming food stalls, a bubble tea stand and a fried chicken stand with plain unmarked signs.",
      "The four adventurers from the sprites hang out together at a small outdoor table, happy and relaxed after a long day of hunting: the purple-haired healer sips a large bubble milk tea with a wide straw and dark tapioca pearls, the glasses guy holds a bubble tea and a giant crispy fried chicken cutlet in a paper bag, the red-haired warrior bites into a huge fried chicken cutlet, the blond guy with the crown has a tray with a burger, fries and a soda cup.",
      "Friendly, warm, grateful mood, like friends treating each other.",
    ].join(" "),
  },
  {
    name: "tea", w: 1024, h: 1024, max: 80 * 1024, crop: [860, 0, 228, 228], charH: 0.62, y: 0.95,
    who: [["healer", 0.5, true]],
    idea: "The purple-haired healer from the sprite happily sips a large cup of bubble milk tea through a wide straw, dark tapioca pearls visible in the clear cup, eyes closed in bliss, in a sunny mushroom village street. Cute, simple, centered character, upper body and cup clearly visible.",
  },
  {
    name: "chicken", w: 1024, h: 1024, max: 80 * 1024, crop: [860, 0, 228, 228], charH: 0.62, y: 0.95,
    who: [["warrior", 0.5, true]],
    idea: "The red-haired warrior from the sprite holds a giant crispy golden fried chicken cutlet in a paper bag in one hand and a bubble milk tea with tapioca pearls in the other, grinning and about to take a big bite, in a mushroom village night market with warm lights. Cute, simple, centered character, the chicken cutlet and the cup clearly visible.",
  },
  {
    name: "burger", w: 1024, h: 1024, max: 80 * 1024, crop: [860, 0, 228, 228], charH: 0.62, y: 0.95,
    who: [["rich", 0.5, true]],
    idea: "The flashy blond guy with the tiny golden crown and sunglasses from the sprite sits proudly with a fast-food meal on a tray in front of him: a big burger, a carton of french fries and a soda cup, all in plain red and yellow packaging with no logos, giving a thumbs up, in a sunny mushroom village street. Cute, simple, centered character, the meal clearly visible.",
  },
];

const sha = value => createHash("sha1").update(value).digest("hex").slice(0, 12);
fs.mkdirSync(CACHE, { recursive: true });

async function download(url, name) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`下載失敗 ${response.status}：${url.slice(0, 120)}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, buffer);
  return buffer;
}

const tw = itemId => ({ itemId, region: "TWMS", version: "256" });
/** renderMode=4 腳在整張圖正中間；flipX 不可靠，抓朝左的自己翻 */
async function character(key) {
  const ids = [2000, 12000, ...LOOKS[key].ids];
  const url = `https://maplestory.io/api/character/${encodeURIComponent(JSON.stringify(ids.map(tw)).slice(1, -1))}/stand1/0?resize=1&renderMode=4&flipX=false`;
  const png = await download(url, `char-${sha(JSON.stringify(ids))}.png`);
  return sharp(png).trim().png().toBuffer();
}

async function sourceImage(scene) {
  const [left, top, width, height] = scene.crop;
  const map = await sharp(path.join(ROOT, "public/assets/map_renders/100000000.webp")).extract({ left, top, width, height }).flatten({ background: "#9fd3f0" }).png().toBuffer();
  const base = await sharp(map).resize(scene.w, scene.h, { fit: "cover", kernel: "nearest" }).png().toBuffer();
  const layers = [];
  for (const [key, x, right] of scene.who) {
    const sprite = await character(key);
    const meta = await sharp(sprite).metadata();
    const h = Math.round(scene.h * scene.charH);
    const w = Math.round((meta.width / meta.height) * h);
    let img = sharp(sprite).resize(w, h, { kernel: "nearest" });
    if (right) img = img.flop();
    layers.push({ input: await img.png().toBuffer(), left: Math.round(scene.w * x - w / 2), top: Math.round(scene.h * scene.y - h) });
  }
  return sharp(base).composite(layers).png().toBuffer();
}

let aiKey = "";
/** Gemini 金鑰：banana 生圖的 MCP 設定（~/.claude/settings.json 的 mcpServers.*.env.GOOGLE_AI_API_KEY），或環境變數。絕不印 */
function loadKey() {
  if (aiKey) return aiKey;
  aiKey = process.env.GOOGLE_AI_API_KEY ?? "";
  if (!aiKey) {
    const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude/settings.json"), "utf8"));
    for (const server of Object.values(settings.mcpServers ?? {})) aiKey ||= server.env?.GOOGLE_AI_API_KEY ?? "";
  }
  if (!aiKey) throw new Error("找不到 GOOGLE_AI_API_KEY（banana 的 MCP 設定或環境變數）");
  return aiKey;
}
const AI_MODEL = "gemini-3.1-flash-image-preview";

/** 底稿＋prompt 丟 Gemini 重繪。失敗就停，不重試（避免偷花錢） */
async function editImage(label, prompt, image, aspectRatio) {
  const body = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/png", data: image.toString("base64") } }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio, imageSize: "2K" } },
  };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": loadKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(290_000),
  });
  const json = await response.json();
  const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!response.ok || !part) throw new Error(`AI ${label} 失敗：HTTP ${response.status} ${JSON.stringify(json).slice(0, 300)}`);
  console.log(`  AI ${label}：${AI_MODEL} 成功`);
  return Buffer.from(part.inlineData.data, "base64");
}

async function writeUnder(input, scene, file) {
  const outW = scene.name === "hero" ? scene.w : 512;
  const outH = scene.name === "hero" ? scene.h : 512;
  for (let quality = 86; quality >= 40; quality -= 4) {
    const buffer = await sharp(input).resize(outW, outH, { fit: "cover" }).webp({ quality }).toBuffer();
    if (buffer.length <= scene.max) {
      fs.writeFileSync(file, buffer);
      return buffer.length;
    }
  }
  throw new Error(`${scene.name} 壓不到 ${scene.max} bytes 以下`);
}

const args = process.argv.slice(2);
const useAi = args.includes("--ai");
const regen = args.includes("--regen");
const only = args.filter(a => !a.startsWith("--"));
fs.mkdirSync(OUT, { recursive: true });

const missing = [];
for (const scene of SCENES.filter(s => only.length === 0 || only.includes(s.name))) {
  const file = path.join(OUT, `${scene.name}.webp`);
  const source = await sourceImage(scene);
  fs.writeFileSync(path.join(CACHE, `donatesrc-${scene.name}.png`), source);
  if (fs.existsSync(file) && !regen) continue;
  const prompt = `${STYLE} ${scene.idea} ${scene.who.map(([key]) => `One character is ${LOOKS[key].look}.`).join(" ")} ${RULES}`;
  const cached = path.join(CACHE, `donate-${scene.name}-${sha(prompt + sha(source.toString("base64")))}.png`);
  if (!useAi && !fs.existsSync(cached)) {
    missing.push(scene.name);
    continue;
  }
  let art;
  if (fs.existsSync(cached) && !regen) art = fs.readFileSync(cached);
  else {
    art = await editImage(scene.name, prompt, source, scene.name === "hero" ? "16:9" : "1:1");
    fs.writeFileSync(cached, art);
  }
  console.log(`${scene.name}：${(await writeUnder(art, scene, file)) >> 10}KB → ${path.relative(ROOT, file)}`);
}
if (missing.length) console.log(`缺圖（加 --ai 才畫）：${missing.join("、")}；底稿在 ${path.relative(ROOT, CACHE)}/donatesrc-*.png`);
