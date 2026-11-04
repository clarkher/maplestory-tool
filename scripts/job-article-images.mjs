/**
 * 攻略文的圖（v1.49）：讀 src/data/job-articles/ 的文章，產生主圖、寫手小頭像、路線卡圖跟清單 images.gen.json。
 *
 * 用法：
 *   npm run article:images                      全部文章，已有的 AI 圖不重花錢
 *   npm run article:images -- 230               只做職業 230 的文章（可列多個）
 *   npm run article:images -- --ai              允許呼叫 AI（新文章、新背景、--regen-hero 才需要；沒加又缺圖會列出來並停下）
 *   npm run article:images -- 230 --regen-hero  重畫這篇主圖（要一起加 --ai，會花錢）
 *   npm run article:images -- --no-hero         只做路線卡跟頭像，主圖先跳過（調位置時用）
 *   npm run article:images -- --sheet <檔名>    另外輸出一張全部圖的總表 png
 *
 * 產出（版面約定見 README「放圖」）：
 *   public/assets/guides/<slug>/hero.webp、hero.jpg   AI 重繪的主圖，16:9、不准有字，jpg 300KB 內
 *   public/assets/guides/<slug>/author.webp           寫手頭像 96×96，素底
 *   public/assets/guides/<slug>/<地圖id>.webp         路線卡圖 400×225 原始像素（頁面用 pixelated 顯示），真地圖＋真怪＋角色，背景是 AI 畫的（data/guide-backdrops/），200KB 內
 *   src/data/job-articles/images.gen.json             清單，頁面只畫清單裡有的圖
 *
 * 新文章要做的事：
 *   1. PERSONAS 加這位寫手的外觀（鍵是文章 persona.name）。項目 id 要在 public/data/avatar.json 查得到，
 *      而且要真的畫得出來：腳本會每項拿掉比對一次，畫不出來直接報錯（maplestory.io 缺圖不會報錯，只會默默不畫）。
 *   2. ARTICLES 加這篇的武器（要是文章寫到的武器）跟主圖構圖（hero）。五張主圖構圖要不一樣。
 *   3. BACKDROP_OF 加新地圖的背景主題。新主題跑一次 --ai，背景存在 data/guide-backdrops/（進版控，之後不花錢）。
 *   4. 跑完每張都要自己用眼睛看：角色飄空、陷地、怪重疊、站到磚牆、主圖走樣或有字。站錯地方在 ARTICLES 的 cards 指定平台。
 *
 * 資料來源：
 *   - 地圖：maplestory.io GMS/83 的 render（TWMS 回 503）跟地圖 JSON（真的落腳線 footholds、怪的出生點 mobs）。
 *     render 背景透明，墊 AI 背景。render 的座標跟遊戲座標差一個位移，用落腳線對透明度校正出來（calibrate）。
 *   - 站的位置一律站在真的落腳線上，所以不會飄空或站進牆裡。public/assets/maps/*.png 是模糊縮圖，不准當底。
 *   - 角色：maplestory.io character，renderMode=4 腳在整張圖正中間。怪：public/assets/monster_frames/<id>.png。
 *
 * 快取：data/cache/guide-images/（gitignore，可用環境變數 ARTICLE_IMG_CACHE 換）。放下載的地圖、角色、AI 主圖原檔。
 * AI：Azure gpt-image-2，金鑰讀 ~/.ai-keys.env（逐行用第一個 = 切，絕不印）。失敗或 429 換 gpt-image-2.5-flare 一次，再掛就停，不重試。
 * 主圖已經在 public/ 而且快取沒有原檔時，照舊留著，不重畫，要重畫才用 --regen-hero。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES_DIR = path.join(ROOT, "src/data/job-articles");
const MANIFEST = path.join(ARTICLES_DIR, "images.gen.json");
const PUBLIC_DIR = path.join(ROOT, "public/assets/guides");
const FRAMES_DIR = path.join(ROOT, "public/assets/monster_frames");
const BACKDROP_DIR = path.join(ROOT, "data/guide-backdrops");
const CACHE = process.env.ARTICLE_IMG_CACHE ?? path.join(ROOT, "data/cache/guide-images");

/* ------------------------------------------------------------------ 設定 */

/** 路線卡：400×225 原始像素，不放大。頁面用 pixelated 顯示，瀏覽器放大的結果跟檔案先放大一樣，檔案約小 5 倍 */
const CARD = { w: 400, h: 225, zoom: 1, maxBytes: 200 * 1024 };
/** 主圖的底稿：384×216 放大 4 倍給 AI 重繪，所以出來是 1536×864 */
const HERO = { w: 384, h: 216, zoom: 4, maxBytes: 300 * 1024 };
const AUTHOR = { size: 96, crop: 62 };

/**
 * 每位寫手一套外觀（鍵是文章的 persona.name）。項目都查得到 public/data/avatar.json。
 * hair 尾數是髮色（1 紅、6 紫、7 棕…），pose 是路線卡的動作，tint 是小頭像底色，look 是主圖 prompt 裡的外觀描述。
 */
const PERSONAS = {
  毒舌奶媽: {
    hair: 31156, face: 27055, items: [1051046, 1072077, 1102184], pose: "stand1", tint: "#5b3f8c",
    look: "a slim young woman healer with long straight purple hair streaked with a gold hairband, cool half-lidded gray eyes, wearing a white and gold priestess robe, white shoes, small pale pink-white angel wings with a soft blue glow, holding a small plain wooden wand",
  },
  熱血莽夫: {
    hair: 30231, face: 23042, items: [1050084, 1072201, 1102142], pose: "alert", tint: "#8c2f1f",
    look: "a hot-blooded young warrior with wild spiky crimson hair, sharp determined eyes, wearing a tight red jumpsuit and red boots, a cape of orange flames behind him, gripping a very long thin silver two-handed greatsword with a yellow wrapped hilt",
  },
  窮酸精算師: {
    hair: 30127, face: 23066, items: [1022037, 1042100, 1062041, 1072391], pose: "shoot1", tint: "#4f5b3a",
    look: "a handsome frugal young archer with neat spiky brown hair and thin rimless glasses, calm half-lidded eyes, wearing a plain checkered shirt with a small orange tie, faded blue denim work pants and worn brown leather shoes, drawing a dark curved recurve bow with red and gold tips",
  },
  守財奴兼暴發戶: {
    hair: 35203, face: 23042, items: [1003861, 1022041, 1050135, 1072280, 1102158, 1032020], pose: "alert", tint: "#8a6d1d",
    look: "a flashy nouveau-riche young man with fluffy platinum blond hair, a tiny golden crown floating above his head, big black sunglasses and dangling gold earrings, wearing a white tailcoat tuxedo with a pink bow tie, golden shoes and an iridescent peacock-feather tail cape, with a steel-gray claw gauntlet on his fist",
  },
  中二孤狼: {
    hair: 30230, face: 23063, items: [1022173, 1052602, 1103131], pose: "stabO1", tint: "#2c2c34",
    look: "a brooding lone-wolf rogue with spiky dark gray hedgehog hair, a black eyepatch over one eye, a cold stare, wearing a black butler-style outfit under a huge black high-collared reaper cloak with a crimson glowing edge, holding a short crystal-blue dagger",
  },
};

/** 地圖→背景主題。背景只墊在透明處，模糊過，不會蓋住地圖 */
const BACKDROP_OF = {
  101040001: "canyon", 106000110: "burnt", 106000140: "burnt", 101030103: "ruins",
  107000000: "swamp", 107000200: "swamp", 107000403: "swamp",
  100040103: "monkey-forest", 100040110: "monkey-forest",
  101020009: "tree-hollow", 101020010: "tree-hollow",
  105050200: "cave", 103000104: "subway",
};
const BACKDROP_PROMPT = {
  canyon: "A bright rocky canyon under a clear blue afternoon sky with distant tan sandstone mesas and thin clouds",
  burnt: "A scorched wasteland at dusk with an orange-red hazy sky, drifting embers and distant silhouettes of dead trees and smoke",
  ruins: "A warm desert canyon sky at late afternoon with distant sandstone cliffs and ancient stone ruins",
  swamp: "A dense jungle swamp with giant twisted vines, mossy trees, soft green light shafts and hanging leaves",
  "monkey-forest": "A lush deep forest of huge old trees with layered green foliage, dappled golden sunlight and floating leaves",
  "tree-hollow": "The inside of a colossal hollow tree with dark brown bark walls, faint teal glowing spores and dim light from above",
  cave: "A deep cave lit by glowing fungi and dark blue-purple rock walls with soft mist",
  subway: "A gloomy abandoned underground subway tunnel with rusty pipes, dim yellow lamps and dark concrete walls",
};

const STYLE_RULES = "Absolutely no text, no letters, no numbers, no logos, no watermarks, no signs with writing, no UI, no speech bubbles anywhere in the image. No extra characters besides the ones already in the scene.";

/**
 * 每篇的設定。weapon 要是文章寫到的武器（腳本會查）。
 * hero：主圖構圖。pick 是站的平台（遊戲座標，對不上腳本會報錯），actors 的 x 是畫面寬的比例、team 決定朝向。
 * cards：路線卡指定平台 { 地圖id: { x, y } }，沒寫就照分數自動挑。
 */
const ARTICLES = {
  "110-31-50": {
    weapon: 1402006,
    cards: { 101040001: { x: 950, y: 1695 }, 106000110: { x: 400, y: 2025 } },
    hero: {
      map: 101040001, mob: 2230102, pose: "alert",
      pick: { x: 700, y: 1695 },
      char: { x: 0.28, right: true }, mobs: [{ x: 0.62, right: false }, { x: 0.84, right: false }],
      idea: "He charges forward from the left, greatsword extended, flames streaming behind him, with the black wild boars stampeding toward him from the right. Energetic, low dynamic angle.",
    },
  },
  "230-31-50": {
    weapon: 1372005,
    cards: { 101040001: { x: -100, y: 2205 }, 105050200: { x: 407, y: 64 } },
    hero: {
      map: 105050200, mob: 2230101, pose: "alert",
      pick: { x: 407, y: 64 },
      char: { x: 0.74, right: false }, mobs: [{ x: 0.42, right: true }, { x: 0.2, right: true }],
      idea: "She stands on the right, facing left, wand raised, unimpressed, soft golden-white healing light falling from above onto the zombie mushrooms on the left, inside a dark glowing cave.",
    },
  },
  "310-31-50": {
    weapon: 1452000,
    cards: { 101040001: { x: 500, y: 1695 } },
    hero: {
      map: 100040103, mob: 4230101, pose: "shoot1",
      pick: { x: 600, y: 368 },
      char: { x: 0.14, right: true }, mobs: [{ x: 0.72, right: false }, { x: 0.9, right: false }],
      idea: "Wide shot: he is small on the far left, calmly aiming his bow across a long stretch of forest platform, with angel monkeys in the distance on the right. Lots of open space, calm and precise mood, sunlight through trees.",
    },
  },
  "410-31-50": {
    weapon: 1472009,
    cards: { 101040001: { x: 1700, y: 2205 }, 101030103: { x: -300, y: 405 } },
    hero: {
      map: 100040110, mob: 3210800, pose: "alert",
      pick: { x: 360, y: -562 },
      char: { x: 0.5, right: true }, mobs: [{ x: 0.17, right: true }, { x: 0.84, right: false }],
      idea: "Centered and symmetrical: he stands dead center posing smugly, with one monkey on each side of him facing him. Theatrical spotlight of sunlight on him, deep green forest around.",
    },
  },
  "420-31-50": {
    weapon: 1332012,
    cards: { 101040001: { x: 1100, y: 2055 }, 106000140: { x: 1950, y: 1905 }, 101020009: { x: 45, y: 285 } },
    hero: {
      map: 106000140, mob: 3210100, pose: "alert",
      pick: { x: 1950, y: 1905 },
      char: { x: 0.8, right: false }, mobs: [{ x: 0.3, right: true }],
      idea: "Dramatic dusk silhouette: he stands alone on the right with his cloak sweeping in the wind, facing left, one fire boar on the left with flaming mane across burnt ground, large orange sunset behind, long shadows. Lonely and cool.",
    },
  },
};

/* ------------------------------------------------------------------ 共用 */

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyJobs = args.filter((value, i) => /^\d+$/.test(value) && args[i - 1] !== "--sheet").map(Number);
const ALLOW_AI = flag("ai");
const REGEN_HERO = flag("regen-hero");
const NO_HERO = flag("no-hero");
const SHEET = option("sheet");

const sha = value => createHash("sha1").update(value).digest("hex").slice(0, 12);
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
fs.mkdirSync(CACHE, { recursive: true });

async function download(url, name, { timeout = 90_000 } = {}) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`下載失敗 ${response.status}：${url.slice(0, 120)}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, buffer);
  return buffer;
}

const rawOf = async input => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

/** 透明度疊圖，超出畫面的部分裁掉（sharp 的 composite 超出會報錯） */
function blit(canvas, sprite, left, top) {
  for (let y = 0; y < sprite.height; y++) {
    const cy = y + top;
    if (cy < 0 || cy >= canvas.height) continue;
    for (let x = 0; x < sprite.width; x++) {
      const cx = x + left;
      if (cx < 0 || cx >= canvas.width) continue;
      const s = (y * sprite.width + x) * 4;
      const a = sprite.data[s + 3] / 255;
      if (a === 0) continue;
      const d = (cy * canvas.width + cx) * 4;
      for (let c = 0; c < 3; c++) canvas.data[d + c] = Math.round(sprite.data[s + c] * a + canvas.data[d + c] * (1 - a));
      canvas.data[d + 3] = 255;
    }
  }
}

const alphaBox = sprite => {
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      if (sprite.data[(y * sprite.width + x) * 4 + 3] > 128) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  return { x0, x1, y0, y1 };
};

/* ------------------------------------------------------------------ AI */

let aiKey;
function loadKey() {
  if (aiKey) return aiKey;
  for (const line of fs.readFileSync(path.join(os.homedir(), ".ai-keys.env"), "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#") && line.slice(0, i).trim() === "gpt-image-2_apikey") aiKey = line.slice(i + 1).trim();
  }
  if (!aiKey) throw new Error("~/.ai-keys.env 找不到 gpt-image-2_apikey");
  return aiKey;
}
const AI_BASE = "https://officialpmswedencentral.services.ai.azure.com/openai/v1/images";
const AI_MODELS = ["gpt-image-2", "gpt-image-2.5-flare"];

/** 失敗或 429 換下一個部署一次，再掛就丟出去讓整支停下。不重試（CLAUDE.md：429 是額度用完） */
async function callImageApi(label, send) {
  let last = "";
  for (const model of AI_MODELS) {
    try {
      const response = await send(model);
      const text = await response.text();
      if (response.ok) {
        console.log(`  AI ${label}：${model} 成功`);
        return Buffer.from(JSON.parse(text).data[0].b64_json, "base64");
      }
      last = `${model} HTTP ${response.status} ${text.slice(0, 300)}`;
    } catch (error) {
      last = `${model} ${error.message}`;
    }
    console.log(`  AI ${label}：${last}`);
  }
  throw new Error(`AI 兩個部署都失敗，停止：${label}`);
}

const generateImage = (label, prompt, size) =>
  callImageApi(label, model =>
    fetch(`${AI_BASE}/generations`, {
      method: "POST",
      headers: { "api-key": loadKey(), "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
      signal: AbortSignal.timeout(280_000),
    }),
  );

const editImage = (label, prompt, size, images) =>
  callImageApi(label, model => {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt);
    form.set("size", size);
    images.forEach((buffer, i) => form.append("image[]", new Blob([buffer], { type: "image/png" }), `input${i}.png`));
    return fetch(`${AI_BASE}/edits`, { method: "POST", headers: { "api-key": loadKey() }, body: form, signal: AbortSignal.timeout(290_000) });
  });

/* ------------------------------------------------------------------ 背景 */

const backdropFile = theme => path.join(BACKDROP_DIR, `${theme}.webp`);
const backdropCache = new Map();
async function backdrop(theme, w, h) {
  const key = `${theme}-${w}-${h}`;
  if (!backdropCache.has(key)) backdropCache.set(key, await rawOf(await sharp(backdropFile(theme)).resize(w, h, { fit: "cover" }).blur(1.2).png().toBuffer()));
  const base = backdropCache.get(key);
  return { ...base, data: Buffer.from(base.data) };
}

async function ensureBackdrop(theme) {
  if (fs.existsSync(backdropFile(theme))) return;
  const what = BACKDROP_PROMPT[theme];
  if (!what) throw new Error(`背景主題 ${theme} 沒有寫 prompt`);
  const png = await generateImage(
    `背景 ${theme}`,
    `${what}. Hand-painted 2D side-scrolling game background art, bright saturated cartoon style, soft focus, distant parallax layer only, no ground platform in the foreground, no people, no creatures, no text, no logo.`,
    "1536x1024",
  );
  fs.mkdirSync(BACKDROP_DIR, { recursive: true });
  await sharp(png).resize(800, 533).webp({ quality: 82 }).toFile(backdropFile(theme));
}

/* ------------------------------------------------------------------ 地圖：落腳線 → 畫面座標 */

const mapCache = new Map();
async function loadMap(id) {
  if (mapCache.has(id)) return mapCache.get(id);
  const png = await download(`https://maplestory.io/api/GMS/83/map/${id}/render`, `map-${id}.png`, { timeout: 180_000 });
  const json = JSON.parse((await download(`https://maplestory.io/api/GMS/83/map/${id}`, `map-${id}.json`)).toString("utf8"));
  const raw = await rawOf(png);
  const footholds = Object.values(json.footholds);
  const { dx, dy, score } = calibrate(raw, footholds, id);
  if (score < 0.2) throw new Error(`地圖 ${id} 的落腳線對不上圖（比對分數 ${score.toFixed(2)}）`);
  const map = { id, raw, json, dx, dy, score, chains: buildChains(footholds, dx, dy, raw.width) };
  mapCache.set(id, map);
  return map;
}

/** render 跟遊戲座標差一個位移：找一個位移，讓最多落腳線正下方是實心、正上方是空的。結果進快取，不用每次算 */
function calibrate(raw, footholds, id) {
  const file = path.join(CACHE, `calibrate-${id}.json`);
  if (fs.existsSync(file)) return readJson(file);
  const flat = footholds.filter(f => f.x2 > f.x1 && Math.abs(f.y2 - f.y1) <= 2);
  const samples = [];
  for (const f of flat) for (let x = f.x1 + 4; x < f.x2 - 2; x += 18) samples.push([x, f.y1]);
  const step = Math.max(1, Math.floor(samples.length / 240));
  const picks = samples.filter((_, i) => i % step === 0);
  const xs = picks.map(p => p[0]);
  const ys = picks.map(p => p[1]);
  const opaque = new Uint8Array(raw.width * raw.height);
  for (let i = 0; i < opaque.length; i++) opaque[i] = raw.data[i * 4 + 3] > 200 ? 1 : 0;
  const minDx = -Math.min(...xs) - 300, maxDx = raw.width - Math.max(...xs) + 300;
  const minDy = -Math.min(...ys) - 300, maxDy = raw.height - Math.max(...ys) + 300;
  let best = { dx: 0, dy: 0, score: -1 };
  for (let dx = minDx; dx <= maxDx; dx++) {
    for (let dy = minDy; dy <= maxDy; dy++) {
      let hit = 0;
      for (const [x, y] of picks) {
        const px = x + dx;
        if (px < 0 || px >= raw.width) continue;
        const below = y + dy + 4, above = y + dy - 26;
        if (below >= 0 && below < raw.height && above >= 0 && opaque[below * raw.width + px] && !opaque[above * raw.width + px]) hit++;
      }
      if (hit > best.score) best = { dx, dy, score: hit };
    }
  }
  const result = { dx: best.dx, dy: best.dy, score: best.score / picks.length };
  fs.writeFileSync(file, JSON.stringify(result));
  return result;
}

/** 走得上去的落腳線接成一條條平台（洞穴、沼澤的地面是小起伏，所以坡度放寬，高低差另外在 scoreCrop 扣分）。天花板（x1 > x2）、牆（x1 = x2）不算 */
function buildChains(footholds, dx, dy, width) {
  const byId = new Map(footholds.map(f => [f.id, f]));
  const walkable = f => f && f.x2 > f.x1 && Math.abs(f.y2 - f.y1) <= Math.max((f.x2 - f.x1) * 0.85, 4);
  const chains = [];
  for (const f of footholds) {
    if (!walkable(f)) continue;
    const prev = byId.get(f.prev);
    if (walkable(prev) && prev.x2 === f.x1) continue;
    const segs = [f];
    let cur = f;
    for (;;) {
      const next = byId.get(cur.next);
      if (!walkable(next) || next.x1 !== cur.x2 || segs.includes(next)) break;
      segs.push(next);
      cur = next;
    }
    const left = segs[0].x1 + dx, right = cur.x2 + dx;
    if (right < 0 || left > width) continue;
    chains.push({
      left, right, length: right - left,
      segs: segs.map(s => ({ x1: s.x1 + dx, x2: s.x2 + dx, y1: s.y1 + dy, y2: s.y2 + dy })),
    });
  }
  return chains;
}

function groundAt(chain, px) {
  for (const s of chain.segs) if (px >= s.x1 && px <= s.x2) return Math.round(s.y1 + ((px - s.x1) / (s.x2 - s.x1)) * (s.y2 - s.y1));
  return px < chain.left ? chain.segs[0].y1 : chain.segs.at(-1).y2;
}

/* ------------------------------------------------------------------ 角色、怪 */

const tw = itemId => ({ itemId, region: "TWMS", version: "256" });
/** renderMode=4 的 flipX 不可靠，一律抓原始朝左的圖，要朝右自己翻（腳在正中間，翻了腳還在中間） */
const charUrl = (ids, pose, frame) =>
  `https://maplestory.io/api/character/${encodeURIComponent(JSON.stringify(ids.map(tw)).slice(1, -1))}/${pose}/${frame}?resize=1&renderMode=4&flipX=false`;
const BODY = [2000, 12000];
const lookIds = (persona, weapon) => [...BODY, persona.hair, persona.face, ...persona.items, ...(weapon ? [weapon] : [])];

const fetchChar = async (ids, pose, frame) => {
  const key = sha(JSON.stringify([ids, pose, frame]));
  return download(charUrl(ids, pose, frame), `char-${key}.png`, { timeout: 60_000 });
};

/** 角色 sprite：renderMode=4 腳在正中間，footX、footY 就是圖的中心 */
async function charSprite(persona, weapon, pose, right) {
  const png = await fetchChar(lookIds(persona, weapon), pose, 0);
  const raw = await rawOf(right ? await sharp(png).flop().png().toBuffer() : png);
  return { ...raw, footX: raw.width / 2, footY: raw.height / 2, box: alphaBox(raw) };
}

/** 怪：圖的底部當腳，sprite 原本朝左，right=true 才翻面 */
async function mobSprite(id, right) {
  const file = path.join(FRAMES_DIR, `${id}.png`);
  if (!fs.existsSync(file)) throw new Error(`沒有怪圖 ${file}`);
  const raw = await rawOf(right ? await sharp(file).flop().png().toBuffer() : file);
  return { ...raw, footX: raw.width / 2, footY: raw.height - 2, box: alphaBox(raw) };
}

/** 檢查外觀：id 要在 avatar.json、每一項拿掉要真的少東西（maplestory.io 缺圖不報錯，只默默不畫） */
async function verifyLook(name, persona, weapon, avatar) {
  const index = new Map([...avatar.hair, ...avatar.face, ...avatar.items].map(item => [item.id, item]));
  const names = [];
  const hairBase = persona.hair - (persona.hair % 10);
  const hair = index.get(hairBase);
  if (!hair) throw new Error(`${name}：髮型 ${persona.hair} 不在 avatar.json`);
  if (!hair.t?.includes(persona.hair % 10)) throw new Error(`${name}：髮型 ${persona.hair} 沒有這個髮色`);
  names.push(`${persona.hair} ${hair.n}`);
  const face = index.get(persona.face);
  if (!face) throw new Error(`${name}：臉型 ${persona.face} 不在 avatar.json`);
  names.push(`${persona.face} ${face.n}`);
  for (const id of [...persona.items, weapon]) {
    const item = index.get(id);
    if (!item) throw new Error(`${name}：項目 ${id} 不在 avatar.json`);
    names.push(`${id} ${item.n}`);
  }
  const full = await rawOf(await fetchChar(lookIds(persona, weapon), "alert", 0));
  for (const id of [persona.hair, persona.face, ...persona.items, weapon]) {
    const without = await rawOf(await fetchChar(lookIds(persona, weapon).filter(x => x !== id), "alert", 0));
    if (without.width === full.width && without.height === full.height && without.data.equals(full.data)) {
      throw new Error(`${name}：項目 ${id} 拿掉後畫面一模一樣，等於沒畫出來，換一件`);
    }
  }
  return names;
}

/* ------------------------------------------------------------------ 場景 */

const opaqueFraction = (raw, x0, y0, x1, y1, test = (r, g, b, a) => a > 200) => {
  let hit = 0, total = 0;
  for (let y = Math.max(0, y0); y < Math.min(raw.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(raw.width, x1); x++) {
      const i = (y * raw.width + x) * 4;
      total++;
      if (test(raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3])) hit++;
    }
  }
  return total ? hit / total : 1;
};

/** 在一條平台上排角色跟怪。腳要踩在平台上，圖不出畫面；放不下就少一隻怪 */
function layoutCard(map, chain, cropLeft, W, char, mobs) {
  for (let count = mobs.length; count >= 1; count--) {
    const list = mobs.slice(0, count);
    const leftEdge = cropLeft + 4 + (char.footX - char.box.x0);
    const rightSprite = list.at(-1);
    const rightEdge = cropLeft + W - 4 - (rightSprite.box.x1 - rightSprite.footX);
    const feetL = Math.max(chain.left + 10, leftEdge);
    const feetR = Math.min(chain.right - 10, rightEdge);
    if (feetR <= feetL) continue;
    const widths = [char, ...list].map(s => s.box.x1 - s.box.x0);
    // 怪跟角色、怪跟怪之間至少留多少（只有一隻怪也不要貼臉）
    const need = widths.slice(1, -1).reduce((sum, w) => sum + w, 0) + (char.box.x1 - char.footX) + (rightSprite.footX - rightSprite.box.x0) + 36 + (count - 1) * 12;
    const span = feetR - feetL;
    if (span < need) continue;
    const free = span - need;
    const gap = free / (count + 1);
    const feet = [feetL + Math.min(gap, 40)];
    let cursor = feet[0] + (char.box.x1 - char.footX) + 36 + gap;
    for (let i = 0; i < count; i++) {
      const sprite = list[i];
      const foot = cursor + (sprite.footX - sprite.box.x0);
      feet.push(foot);
      cursor = foot + (sprite.box.x1 - sprite.footX) + 12 + gap;
    }
    return { sprites: [char, ...list], feet: feet.map(Math.round) };
  }
  return null;
}

/** 這條平台、這個裁切的分數：有這隻怪的出生點、平台夠長、演員上方沒東西擋、畫面不要一大片黑 */
function scoreCrop(map, chain, cropLeft, cropTop, W, H, placed, mobIds) {
  const spawns = (map.json.mobs ?? []).filter(m => mobIds.includes(m.id) && m.x + map.dx >= chain.left - 4 && m.x + map.dx <= chain.right + 4 && Math.abs(m.y + map.dy - groundAt(chain, m.x + map.dx)) < 12);
  let score = spawns.length ? 30 : 0;
  score += (Math.min(chain.length, 420) / 420) * 40;
  // 平台要撐滿畫面，不要半邊懸空
  score += ((Math.min(chain.right, cropLeft + W) - Math.max(chain.left, cropLeft)) / W) * 30;
  for (let i = 0; i < placed.sprites.length; i++) {
    const foot = placed.feet[i];
    const gy = groundAt(chain, foot);
    score -= opaqueFraction(map.raw, foot - 18, gy - 72, foot + 18, gy - 12) * 40;
  }
  const heights = placed.feet.map(foot => groundAt(chain, foot));
  score -= Math.max(0, Math.max(...heights) - Math.min(...heights) - 10) * 1.5;
  score -= opaqueFraction(map.raw, cropLeft, cropTop, cropLeft + W, cropTop + H, (r, g, b, a) => a > 200 && r + g + b < 40) * 120;
  // 裁切超出地圖（要補透明）扣分
  const inside = Math.max(0, Math.min(cropLeft + W, map.raw.width) - Math.max(cropLeft, 0)) * Math.max(0, Math.min(cropTop + H, map.raw.height) - Math.max(cropTop, 0));
  score -= (1 - inside / (W * H)) * 60;
  return score;
}

const nearestChain = (map, pick) => {
  const distance = c => Math.abs(groundAt(c, pick.x + map.dx) - (pick.y + map.dy));
  const hit = map.chains
    .filter(c => pick.x + map.dx >= c.left && pick.x + map.dx <= c.right && distance(c) <= 60)
    .sort((a, b) => distance(a) - distance(b))[0];
  if (!hit) throw new Error(`地圖 ${map.id} 的 (${pick.x}, ${pick.y}) 不在任何平台上`);
  return hit;
};

function bestCrop(map, W, H, char, mobs, mobIds, pick) {
  const candidates = [];
  const chains = pick ? [nearestChain(map, pick)] : map.chains.filter(c => c.length >= 130);
  for (const chain of chains) {
    const centers = pick
      ? [pick.x + map.dx]
      : [(chain.left + chain.right) / 2, ...(map.json.mobs ?? []).filter(m => mobIds.includes(m.id) && m.x + map.dx > chain.left && m.x + map.dx < chain.right).slice(0, 3).map(m => m.x + map.dx)];
    for (const center of centers) {
      const cropLeft = Math.round(Math.max(0, Math.min(map.raw.width - W, center - W / 2)));
      const ground = groundAt(chain, Math.max(chain.left, Math.min(chain.right, center)));
      const cropTop = Math.round(Math.max(0, Math.min(map.raw.height - H, ground - H * 0.76)));
      const placed = layoutCard(map, chain, cropLeft, W, char, mobs);
      if (!placed) continue;
      candidates.push({ chain, cropLeft, cropTop, placed, score: scoreCrop(map, chain, cropLeft, cropTop, W, H, placed, mobIds) });
    }
  }
  if (!candidates.length) throw new Error(`地圖 ${map.id} 找不到放得下的平台`);
  return candidates.sort((a, b) => b.score - a.score);
}

const cropRaw = (raw, left, top, w, h) => {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y + top;
    if (sy < 0 || sy >= raw.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = x + left;
      if (sx < 0 || sx >= raw.width) continue;
      raw.data.copy(out, (y * w + x) * 4, (sy * raw.width + sx) * 4, (sy * raw.width + sx) * 4 + 4);
    }
  }
  return { data: out, width: w, height: h };
};

async function renderScene(map, crop, W, H) {
  const canvas = await backdrop(BACKDROP_OF[map.id], W, H);
  blit(canvas, cropRaw(map.raw, crop.cropLeft, crop.cropTop, W, H), 0, 0);
  // 怪先畫，角色蓋在最上面
  const order = crop.placed.sprites.map((sprite, i) => ({ sprite, foot: crop.placed.feet[i] })).reverse();
  for (const { sprite, foot } of order) {
    const gy = groundAt(crop.chain, foot);
    blit(canvas, sprite, Math.round(foot - sprite.footX - crop.cropLeft), Math.round(gy - sprite.footY - crop.cropTop));
  }
  return canvas;
}

const canvasPng = (canvas, zoom = 1) =>
  sharp(canvas.data, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .removeAlpha()
    .resize(canvas.width * zoom, canvas.height * zoom, { kernel: "nearest" })
    .png()
    .toBuffer();

async function writeWebp(input, file, maxBytes, startQuality = 88) {
  for (let quality = startQuality; quality >= 40; quality -= 6) {
    const buffer = await sharp(input).webp({ quality }).toBuffer();
    if (buffer.length <= maxBytes) {
      fs.writeFileSync(file, buffer);
      return buffer.length;
    }
  }
  throw new Error(`${file} 壓不到 ${maxBytes} bytes`);
}

/* ------------------------------------------------------------------ 各種圖 */

async function makeCard(entry, step, persona, weapon, dir) {
  const map = await loadMap(step.map);
  const config = ARTICLES[entry.key];
  const char = await charSprite(persona, weapon, persona.pose, true);
  const mobIds = [...new Set(step.mobs)];
  // 同種或不同種都最多兩隻，只有一種就放兩隻
  const shown = (mobIds.length >= 2 ? mobIds.slice(0, 2) : [mobIds[0], mobIds[0]]);
  const mobs = await Promise.all(shown.map(id => mobSprite(id, false)));
  const list = bestCrop(map, CARD.w, CARD.h, char, mobs, mobIds, config.cards?.[step.map]);
  const crop = list[0];
  const canvas = await renderScene(map, crop, CARD.w, CARD.h);
  const png = await canvasPng(canvas, CARD.zoom);
  const file = path.join(dir, `${step.map}.webp`);
  const bytes = await writeWebp(png, file, CARD.maxBytes);
  console.log(`  ${step.map}.webp ${(bytes / 1024).toFixed(0)}KB 校正 ${map.score.toFixed(2)} 平台 x${crop.chain.left - map.dx}～${crop.chain.right - map.dx} y${crop.chain.segs[0].y1 - map.dy} 放 ${crop.placed.sprites.length - 1} 隻怪`);
  return { w: CARD.w * CARD.zoom, h: CARD.h * CARD.zoom };
}

async function makeAuthor(persona, weapon, dir) {
  const raw = await rawOf(await sharp(await fetchChar(lookIds(persona, null), "alert", 0)).flop().png().toBuffer());
  // 腳在正中間，頭大約在腳上方 46 格
  const side = AUTHOR.crop;
  const left = Math.round(raw.width / 2 - side / 2 + 2);
  const top = Math.round(raw.height / 2 - 46 - side / 2 - 2);
  const sprite = cropRaw(raw, left, top, side, side);
  const bg = sharp({ create: { width: side, height: side, channels: 4, background: persona.tint } });
  const canvas = await rawOf(await bg.png().toBuffer());
  blit(canvas, sprite, 0, 0);
  const png = await canvasPng(canvas);
  const buffer = await sharp(png).resize(AUTHOR.size, AUTHOR.size, { kernel: "nearest" }).webp({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(dir, "author.webp"), buffer);
  return { w: AUTHOR.size, h: AUTHOR.size };
}

/** 主圖底稿：依 hero 設定的比例站位。平台要容得下，站不下會報錯，不默默改位置 */
async function heroSource(entry, persona, weapon, jobName) {
  const { hero } = ARTICLES[entry.key];
  const map = await loadMap(hero.map);
  const W = HERO.w, H = HERO.h;
  const char = await charSprite(persona, weapon, hero.pose, hero.char.right);
  const mobs = await Promise.all(hero.mobs.map(m => mobSprite(hero.mob, m.right)));
  const pick = hero.pick;
  let chain, cropLeft, cropTop;
  if (pick) {
    chain = nearestChain(map, pick);
    cropLeft = Math.round(Math.max(0, Math.min(map.raw.width - W, pick.x + map.dx - W / 2)));
    const ground = groundAt(chain, pick.x + map.dx);
    cropTop = Math.round(Math.max(0, Math.min(map.raw.height - H, ground - H * 0.8)));
  } else {
    const list = bestCrop(map, W, H, char, mobs, [hero.mob], null);
    ({ chain, cropLeft, cropTop } = list[0]);
  }
  const feet = [hero.char, ...hero.mobs].map(a => cropLeft + Math.round(a.x * W));
  const off = feet.filter(x => x < chain.left || x > chain.right);
  if (off.length) throw new Error(`${entry.slug} 主圖：有人站在平台外（平台畫面座標 ${chain.left - cropLeft}～${chain.right - cropLeft}），調 hero.pick 或 x`);
  const crop = { chain, cropLeft, cropTop, placed: { sprites: [char, ...mobs], feet } };
  const canvas = await renderScene(map, crop, W, H);
  const png = await canvasPng(canvas, HERO.zoom);
  const refs = [png];
  return { png, refs, jobName };
}

const heroPrompt = (hero, persona, mobName) =>
  [
    "Repaint this side-scrolling game scene as a high-quality 2D anime-style game key art illustration: clean confident line art, rich painted shading, dramatic lighting and atmospheric depth, polished and appealing.",
    `The main character is ${persona.look}. Keep the exact same outfit colors, hair and weapon as the sprite in the image, with chibi-free but still stylized heroic proportions and a good-looking face.`,
    `The monster is ${mobName}: keep it instantly recognizable as the same creature as the sprite in the image, same shape, same colors, same features. Do not invent new monster types and do not add more monsters.`,
    `Keep the same location, the same ground and the same positions of the character and monsters as the image. ${hero.idea}`,
    "Widescreen 16:9 composition, nothing important cut off.",
    STYLE_RULES,
  ].join(" ");

async function makeHero(entry, persona, weapon, dir, plan) {
  const { hero } = ARTICLES[entry.key];
  const webp = path.join(dir, "hero.webp");
  const jpg = path.join(dir, "hero.jpg");
  const exists = fs.existsSync(webp) && fs.existsSync(jpg);
  const source = await heroSource(entry, persona, weapon);
  const mobName = HERO_MOB_LOOK[hero.mob];
  if (!mobName) throw new Error(`HERO_MOB_LOOK 沒寫怪 ${hero.mob} 的外觀`);
  const prompt = heroPrompt(hero, persona, mobName);
  const cacheKey = sha(prompt + source.png.toString("base64"));
  const cached = path.join(CACHE, `hero-${entry.slug}-${cacheKey}.png`);
  fs.writeFileSync(path.join(CACHE, `herosrc-${entry.slug}.png`), source.png);
  // --regen-hero 不看快取：prompt、底稿沒變時快取鍵一樣，先看快取就不會真的重畫
  if (!fs.existsSync(cached) || REGEN_HERO) {
    if (exists && !REGEN_HERO) {
      console.log("  主圖：public 已有，快取沒有對應原檔，照舊留著（要重畫用 --regen-hero --ai）");
      return metaSize(webp);
    }
    if (!ALLOW_AI) {
      plan.push(`${entry.slug} 主圖`);
      return exists ? metaSize(webp) : null;
    }
    const png = await editImage(`主圖 ${entry.slug}`, prompt, `${HERO.w * HERO.zoom}x${HERO.h * HERO.zoom}`, source.refs);
    fs.writeFileSync(cached, png);
  }
  const meta = await sharp(cached).metadata();
  const pipeline = () => sharp(cached).removeAlpha();
  let jpgBytes = 0;
  for (let quality = 88; quality >= 50; quality -= 4) {
    const buffer = await pipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
    jpgBytes = buffer.length;
    if (buffer.length <= HERO.maxBytes) {
      fs.writeFileSync(jpg, buffer);
      break;
    }
  }
  if (jpgBytes > HERO.maxBytes) throw new Error(`${entry.slug} hero.jpg 壓不到 300KB`);
  const webpBytes = await writeWebp(await pipeline().png().toBuffer(), webp, HERO.maxBytes, 84);
  console.log(`  hero ${meta.width}×${meta.height} jpg ${(jpgBytes / 1024).toFixed(0)}KB webp ${(webpBytes / 1024).toFixed(0)}KB`);
  return { w: meta.width, h: meta.height };
}

const metaSize = async file => {
  const meta = await sharp(file).metadata();
  return { w: meta.width, h: meta.height };
};

/** 主圖 prompt 裡怪的外觀（看 monster_frames 寫的） */
const HERO_MOB_LOOK = {
  2230102: "a black wild boar with a dark bristly body, small tusks and an angry face",
  2230101: "a zombie mushroom: a round pale white blob body with blank eyes under a wide dull gray-brown mushroom cap, a yellow paper talisman stuck on its forehead with only an abstract red squiggle on it and no readable characters",
  4230101: "an angel monkey: a chubby gray monkey with a thin golden halo floating above its head, holding a yellow banana, with dark blue feet",
  3210800: "a chubby tan-brown monkey standing upright with a pale face and belly, big round ears, holding a yellow banana",
  3210100: "a fire boar: a stocky dark brown wild boar with white tusks and a mane of bright yellow-orange flames along its back",
};

/* ------------------------------------------------------------------ 主流程 */

/** 職業 slug 表在 TypeScript（job-article.ts），這裡直接讀原始碼，只有一份不用同步 */
function jobSlugs() {
  const source = fs.readFileSync(path.join(ROOT, "src/lib/job-article.ts"), "utf8");
  const block = /export const JOB_SLUGS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
  if (!block) throw new Error("job-article.ts 找不到 JOB_SLUGS");
  return Object.fromEntries([...block[1].matchAll(/(\d+):\s*"([^"]+)"/g)].map(m => [Number(m[1]), m[2]]));
}

function loadEntries() {
  const slugs = jobSlugs();
  return fs
    .readdirSync(ARTICLES_DIR)
    .flatMap(file => {
      const match = /^(\d+)-(\d+)-(\d+)\.json$/.exec(file);
      if (!match) return [];
      const job = Number(match[1]);
      if (onlyJobs.length && !onlyJobs.includes(job)) return [];
      if (!slugs[job]) throw new Error(`職業 ${job} 沒有 slug`);
      const key = `${match[1]}-${match[2]}-${match[3]}`;
      const article = readJson(path.join(ARTICLES_DIR, file));
      return [{ key, job, slug: `${slugs[job]}-${match[2]}-${match[3]}`, article, raw: JSON.stringify(article) }];
    });
}

/** 同一張圖在文章裡出現多步（主推＋備案）只出一張，怪合起來 */
function stepsByMap(article) {
  const byMap = new Map();
  for (const step of article.steps) {
    const hit = byMap.get(step.map);
    if (hit) hit.mobs.push(...step.mobs.filter(m => !hit.mobs.includes(m)));
    else byMap.set(step.map, { map: step.map, mobs: [...step.mobs] });
  }
  return [...byMap.values()];
}

async function makeSheet(entries, manifest, file) {
  const tile = { w: 400, h: 225 };
  const rows = [];
  for (const entry of entries) {
    const dir = path.join(PUBLIC_DIR, entry.slug);
    const row = [];
    if (manifest[entry.slug]?.hero) row.push(path.join(dir, "hero.jpg"));
    row.push(...Object.keys(manifest[entry.slug]?.steps ?? {}).map(map => path.join(dir, `${map}.webp`)));
    rows.push({ slug: entry.slug, row, author: path.join(dir, "author.webp") });
  }
  const cols = Math.max(...rows.map(r => r.row.length));
  const labelH = 34;
  const width = cols * (tile.w + 6) + 112;
  const height = rows.length * (tile.h + labelH);
  const layers = [];
  for (const [r, { slug, row, author }] of rows.entries()) {
    const top = r * (tile.h + labelH);
    const label = await sharp({ text: { text: `<span foreground="white">${slug}</span>`, rgba: true, dpi: 130 } }).png().toBuffer();
    layers.push({ input: label, left: 8, top: top + 4 });
    if (fs.existsSync(author)) layers.push({ input: await sharp(author).png().toBuffer(), left: 8, top: top + labelH + 4 });
    for (const [c, image] of row.entries()) {
      layers.push({ input: await sharp(image).resize(tile.w, tile.h).png().toBuffer(), left: 112 + c * (tile.w + 6), top: top + labelH });
    }
  }
  await sharp({ create: { width, height, channels: 3, background: "#222228" } }).composite(layers).png().toFile(file);
  console.log(`總表：${file}`);
}

async function main() {
  const entries = loadEntries();
  const avatar = readJson(path.join(ROOT, "public/data/avatar.json"));
  const manifest = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : {};
  const plan = [];

  const themes = new Set();
  for (const entry of entries) {
    for (const step of entry.article.steps) {
      const theme = BACKDROP_OF[step.map];
      if (!theme) throw new Error(`${entry.key}：地圖 ${step.map} 沒有背景主題，加進 BACKDROP_OF`);
      themes.add(theme);
    }
  }
  for (const theme of themes) {
    if (fs.existsSync(backdropFile(theme))) continue;
    if (ALLOW_AI) await ensureBackdrop(theme);
    else plan.push(`背景 ${theme}`);
  }
  if (plan.length) {
    console.error(`缺這些圖，要呼叫 AI（會花錢），確認後加 --ai：\n  ${plan.join("\n  ")}`);
    process.exit(1);
  }

  for (const entry of entries) {
    console.log(`== ${entry.slug}`);
    const personaName = entry.article.persona?.name;
    const persona = PERSONAS[personaName];
    if (!persona) throw new Error(`${entry.key}：寫手「${personaName}」沒有外觀，加進 PERSONAS`);
    const config = ARTICLES[entry.key];
    if (!config) throw new Error(`${entry.key}：沒有設定，加進 ARTICLES`);
    if (!entry.raw.includes(`{{weapon:${config.weapon}}}`) && !entry.raw.includes(`#${config.weapon}`)) throw new Error(`${entry.key}：武器 ${config.weapon} 文章沒寫到`);
    const names = await verifyLook(personaName, persona, config.weapon, avatar);
    console.log(`  外觀：${names.join("、")}`);

    const dir = path.join(PUBLIC_DIR, entry.slug);
    fs.mkdirSync(dir, { recursive: true });
    const steps = {};
    for (const step of stepsByMap(entry.article)) steps[String(step.map)] = await makeCard(entry, step, persona, config.weapon, dir);
    // 文章拿掉的步驟，圖也清掉
    for (const file of fs.readdirSync(dir)) {
      const match = /^(\d+)\.webp$/.exec(file);
      if (match && !steps[match[1]]) fs.rmSync(path.join(dir, file));
    }
    const author = await makeAuthor(persona, config.weapon, dir);
    const hero = NO_HERO ? manifest[entry.slug]?.hero : await makeHero(entry, persona, config.weapon, dir, plan);
    manifest[entry.slug] = { ...(hero ? { hero } : {}), author, steps };
  }

  // 清單只留有文章的，順序固定（diff 才乾淨）。只跑部分職業時，其他篇不動
  const known = new Set(onlyJobs.length ? Object.keys(manifest) : entries.map(entry => entry.slug));
  const sorted = Object.fromEntries(Object.keys(manifest).filter(slug => known.has(slug)).sort().map(slug => [slug, manifest[slug]]));
  fs.writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
  if (plan.length) console.error(`這些還沒做，要呼叫 AI（會花錢），確認後加 --ai：\n  ${plan.join("\n  ")}`);
  if (SHEET) await makeSheet(entries, sorted, SHEET);
  if (plan.length) process.exit(1);
}

await main();
