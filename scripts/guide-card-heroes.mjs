/**
 * 攻略專區卡片／頁面的主圖（v1.88）：給「不是職業攻略文」的頁面畫一張 16:9 主圖，畫風跟職業攻略文主圖一樣。
 *
 * 用法：
 *   node scripts/guide-card-heroes.mjs                   只做底稿（不花錢），印出哪幾張還缺圖
 *   node scripts/guide-card-heroes.mjs --ai              缺主圖的才呼叫 AI 畫（會花錢）
 *   node scripts/guide-card-heroes.mjs third-job --ai    只做這幾張（可列多個 slug）
 *   node scripts/guide-card-heroes.mjs pq-moon --ai --regen   重畫（不看快取、蓋掉 public 的圖）
 *
 * 做法：
 *   1. 底稿＝真的地圖畫面（public/assets/map_renders）或 AI 背景（data/guide-backdrops），貼上真的怪／NPC 圖
 *      （public/assets/monster_frames、public/assets/npcs，最近鄰放大保留像素感），1536×864。
 *   2. 底稿丟 Azure gpt-image-2 edits 重繪成動畫風主圖，prompt 寫在下面 SCENES 每一張的 idea。
 *   3. 存 public/assets/guides/<slug>/hero.webp、hero.jpg（都壓在 300KB 內）。
 *
 * 快取：data/cache/guide-images/（gitignore）。底稿存 cardsrc-<slug>.png，AI 原檔存 cardhero-<slug>-<雜湊>.png，
 *   prompt 跟底稿都沒變就直接用快取，不再花錢。
 * AI：金鑰讀 ~/.ai-keys.env（逐行用第一個 = 切，絕不印）。gpt-image-2 失敗或 429 換 gpt-image-2.5-flare 一次，再掛就停，不重試。
 * 跑完每張都要自己用眼睛看：不准有字、怪要認得出來、不像楓之谷就加 --regen 重畫一次。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = path.join(ROOT, "public/assets");
const PUBLIC_DIR = path.join(ASSETS, "guides");
const BACKDROP_DIR = path.join(ROOT, "data/guide-backdrops");
const CACHE = process.env.ARTICLE_IMG_CACHE ?? path.join(ROOT, "data/cache/guide-images");
const W = 1536;
const H = 864;
const MAX_BYTES = 300 * 1024;

const STYLE =
  "Repaint this side-scrolling game scene as a high-quality 2D anime-style game key art illustration in the spirit of a bright cute fantasy MMORPG: clean confident line art, rich painted shading, dramatic lighting and atmospheric depth, polished and appealing, vivid saturated colors.";
const RULES =
  "Absolutely no text, no letters, no numbers, no logos, no watermarks, no signs with writing, no UI, no speech bubbles anywhere in the image. Widescreen 16:9 composition, nothing important cut off.";

/**
 * 每張主圖的設定。
 * base：{ render: 地圖 id, crop: [left, top, width, height], fill: 透明處墊的顏色 } 或 { backdrop: 主題名 }。
 * sprites：貼上去的真圖。x 是腳的中心（畫面寬比例），y 是腳底（畫面高比例），h 是高度（畫面高比例），flip 左右翻。
 * idea：prompt 裡這張要畫什麼。
 */
const SCENES = [
  {
    slug: "third-job",
    base: { render: 211000001, crop: [48, 330, 768, 432], fill: "#5a3e2b" },
    sprites: [
      { file: "npcs/2020008.png", x: 0.07, y: 0.92, h: 0.26 },
      { file: "npcs/2020009.png", x: 0.17, y: 0.92, h: 0.26 },
      { file: "npcs/2020010.png", x: 0.27, y: 0.92, h: 0.26 },
      { file: "npcs/2020011.png", x: 0.37, y: 0.92, h: 0.26 },
      { file: "npcs/2020013.png", x: 0.47, y: 0.92, h: 0.26 },
    ],
    idea: [
      "This is the elders' hall in a snowy mountain town: a warm wooden interior with a fireplace, lanterns and portraits, and frosty windows.",
      "The five hooded instructors in long robes with gold trim (brown with a sword, olive-green with red hair, crimson with a bow, deep blue with a scar, purple with a pistol) stand in a row on the left half, watching; keep each one's robe color, hood and item exactly like the sprites, faces shaded under their hoods.",
      "On the right half, in the foreground, add a young adventurer with spiky brown hair in a light blue tunic and brown boots, holding a short sword, in a fighting stance facing right toward a dark shadow clone of himself: the same silhouette and pose mirrored, made of swirling black and violet smoke with glowing red eyes.",
      "Purple magic sparks between them, the instructors lit warmly by the fire, the clone casting a cold violet glow. A trial of strength, epic but friendly.",
    ].join(" "),
  },
  {
    // v1.95 陸服楓葉商會情報：射手村香菇屋前的楓葉武器攤（武器小圖是台服客戶端那 19 把裡的 5 把）
    slug: "maple-leaf-shop",
    base: { render: 100000000, crop: [795, 0, 405, 228], fill: "#9fd3f0" },
    sprites: [
      { file: "items/1302030.png", x: 0.2, y: 0.86, h: 0.26 },
      { file: "items/1382012.png", x: 0.32, y: 0.86, h: 0.26 },
      { file: "items/1452022.png", x: 0.44, y: 0.86, h: 0.26 },
      { file: "items/1472032.png", x: 0.56, y: 0.86, h: 0.2 },
      { file: "items/1492021.png", x: 0.68, y: 0.86, h: 0.2 },
    ],
    idea: [
      "Turn the scene into a cozy autumn mushroom village at golden hour: mushroom-cap houses with yellow and red caps, warm sunset light, bright red and orange maple leaves drifting through the air and piled on the ground.",
      "In the foreground is a wooden market stall with a red cloth canopy, and on its rack and counter the maple-leaf weapons from the sprites are displayed: a sword, a staff, a bow, a throwing-star claw and a pistol, each made of glowing red-orange maple leaf shapes with gold trim. Keep each weapon recognizable like its sprite, same shape and colors.",
      "Next to the stall stands a cheerful young adventurer with short brown hair in a light tunic, holding up a shiny maple-leaf coin with a maple leaf emblem, eyes sparkling as she looks at the weapons. A small pile of the same maple-leaf coins sits on the counter. Warm, festive, inviting mood.",
    ].join(" "),
  },
  {
    slug: "halloween",
    base: { backdrop: "snow" },
    sprites: [{ file: "monster_frames/9602795.png", x: 0.66, y: 0.9, h: 0.62 }],
    idea: [
      "Turn the scene into a snowy village festival at night: deep blue night sky with a big full moon and stars, gentle falling snow, strings of warm orange paper lanterns, glowing carved jack-o'-lantern pumpkins on the snow, and colorful festival masks hanging on a wooden stall.",
      "The monster is a red-maned white werewolf: a tall hunched white wolf-man with a huge spiky crimson mane, a crimson tail, a dark scar mark on its chest and thigh and yellow eyes. Keep it instantly recognizable as the same creature as the sprite, same shape, same colors.",
      "On the left add a cheerful young adventurer girl with short pink hair wearing a small cute black eye mask and a warm red scarf, holding a glowing pumpkin lantern and a short sword, facing the werewolf. Playful spooky mood, not scary.",
    ].join(" "),
  },
  {
    slug: "guide-1-30",
    base: { render: 1000000, crop: [0, 100, 1000, 563] },
    sprites: [
      { file: "monster_frames/100100.png", x: 0.56, y: 0.82, h: 0.14 },
      { file: "monster_frames/1210102.png", x: 0.74, y: 0.82, h: 0.24, flip: true },
    ],
    idea: [
      "A beginner's first adventure on a small sunny maple island: green grassy hills, mushroom houses, a little wooden harbor with a sailing ship in the far distance heading to a bigger continent, bright blue sky with fluffy clouds.",
      "The monsters are a little blue-green snail with a spiral shell and a pale lavender body, and an orange mushroom with a big orange cap with yellow spots and a cream round body with a small smile. Keep them instantly recognizable as the same creatures as the sprites, same shape, same colors. Do not add other monster types.",
      "On the left add a happy beginner adventurer boy with short spiky brown hair in a plain white shirt, blue shorts and brown shoes, holding a wooden stick, stepping forward with a confident grin, with a tiny red maple leaf floating near him. Cheerful, warm, inviting.",
    ].join(" "),
  },
  {
    slug: "pq-moon",
    base: { backdrop: "meadow" },
    sprites: [{ file: "npcs/1012112.png", x: 0.52, y: 0.88, h: 0.42 }],
    idea: [
      "Turn the scene into a calm night meadow under a huge glowing full moon that fills the upper sky, soft starlight, fireflies, and patches of pale yellow primrose flowers blooming on small grassy hills.",
      "In the center is the character from the sprite: a small girl wearing a pink bunny costume with long bunny ears, a white face patch on the hood and a red bow tie, with brown hair and big brown eyes. Keep her costume exactly like the sprite. She looks up at the moon happily.",
      "Next to her add a small white moon rabbit pounding rice cakes with a wooden mallet in a wooden mortar, and four small adventurers of a party (a warrior, a mage, an archer and a thief, seen from behind or the side) planting primrose seeds around them. Dreamy, cozy, teamwork mood.",
    ].join(" "),
  },
  {
    slug: "updates",
    base: { backdrop: "meadow" },
    sprites: [
      { file: "items/1302000.png", x: 0.68, y: 0.92, h: 0.16 },
      { file: "items/2000000.png", x: 0.82, y: 0.92, h: 0.12 },
    ],
    idea: [
      "Turn the scene into a sunny village square of a cute fantasy adventure world: cobblestone ground, cozy cottages, a big wooden notice board with pinned blank parchment scrolls and ribbons (the paper is completely blank, no writing at all), and a few colorful flags.",
      "On the left add a cheerful young adventurer with spiky brown hair, a light blue tunic and a small backpack, looking up at the notice board with wide excited eyes and a big smile, one hand pointing at it.",
      "On the right ground add the two small item props from the sprites, a sword and a red potion bottle, glowing with soft sparkles as if they are brand-new rewards. Keep each one's shape and colors like the sprites, and add no other objects on the ground. Warm, curious, fresh-update-day mood.",
    ].join(" "),
  },
  {
    slug: "pq-kerning",
    base: { render: 103000800, crop: [0, 317, 1200, 675], fill: "#2f4a3a" },
    sprites: [
      { file: "npcs/9020000.png", x: 0.14, y: 0.92, h: 0.44 },
      { file: "monster_frames/9300003.png", x: 0.7, y: 0.92, h: 0.5, flip: true },
    ],
    idea: [
      "A damp underground swamp stage below a city: mossy floating platforms, hanging vines and ropes, murky green glow, a small wooden hut.",
      "On the left is the guide from the sprite: a slim woman with very long pale blonde hair, a lilac outfit and a tall wooden staff topped with a glowing blue orb. Keep her exactly like the sprite.",
      "On the right is the boss: a huge glossy bright green slime blob with yellow cross-shaped eyes and a thin curved antenna tipped with a green ball, surrounded by three small bouncing green slimes. Keep it instantly recognizable as the same creature as the sprite.",
      "In the middle add a party of four young adventurers (a warrior with a sword, a mage with a staff, an archer with a bow, a thief with throwing stars) charging at the giant slime together. Energetic teamwork mood.",
    ].join(" "),
  },
  {
    // v1.98 冒險家的戒指任務線：魔法森林圖書館的漢斯把戒指交給冒險家（戒指小圖是三選一那三枚）
    slug: "adventurer-ring",
    base: { render: 101000003, crop: [0, 200, 816, 459], fill: "#3b2a4a" },
    sprites: [
      { file: "npcs/1032001.png", x: 0.3, y: 0.92, h: 0.42 },
      { file: "items/1113372.png", x: 0.56, y: 0.42, h: 0.1 },
      { file: "items/1113373.png", x: 0.64, y: 0.36, h: 0.1 },
      { file: "items/1113374.png", x: 0.72, y: 0.42, h: 0.1 },
    ],
    idea: [
      "A cozy magic library inside a giant tree: tall wooden bookshelves, floating glowing books, warm candlelight and soft green magic sparkles.",
      "On the left is the old wizard from the sprite: a small elderly man with a long white beard, a pointed hat and robes, holding a staff. Keep him exactly like the sprite.",
      "He is holding out his hand toward a young adventurer with short brown hair in a light tunic standing on the right, and between them three small rings float in the air glowing softly (one red, one blue, one purple), each shaped like the ring sprites.",
      "Warm, heartfelt master-and-apprentice mood, a reward at the end of a long journey.",
    ].join(" "),
  },
  {
    // v1.98 勳章總整理：勇士之村的名譽神官達利額頒勳章
    slug: "medals",
    base: { render: 102000000, crop: [0, 400, 1200, 675], fill: "#c9b48a" },
    sprites: [
      { file: "npcs/9000040.png", x: 0.3, y: 0.92, h: 0.46 },
      { file: "items/1142004.png", x: 0.6, y: 0.5, h: 0.14 },
    ],
    idea: [
      "A rocky warrior village on a cliff in bright daylight: stone paths, wooden huts, totem poles, blue sky.",
      "On the left is the priest from the sprite. Keep the priest exactly like the sprite: same outfit, colors and pose.",
      "The priest is pinning a shiny gold medal shaped like the medal sprite onto the chest of a proud young adventurer with spiky brown hair in a light tunic, standing on the right. A few other medals glint on a small wooden display stand behind them.",
      "Proud, celebratory, achievement mood.",
    ].join(" "),
  },
  {
    // v1.98 愛情象徵：五位給愛情象徵的村民（瑪亞、羅雯、義安、內拉、艾利遜）在射手村
    slug: "love-symbols",
    base: { render: 100000000, crop: [0, 0, 405, 228], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/1012101.png", x: 0.1, y: 0.92, h: 0.34 },
      { file: "npcs/1032101.png", x: 0.25, y: 0.92, h: 0.34 },
      { file: "npcs/1022007.png", x: 0.75, y: 0.92, h: 0.34 },
      { file: "npcs/1052103.png", x: 0.88, y: 0.92, h: 0.34 },
      { file: "items/4031683.png", x: 0.5, y: 0.45, h: 0.14 },
    ],
    idea: [
      "A sunny village with mushroom-cap houses, green hills and soft pink petals drifting in the air.",
      "Keep the four villagers from the sprites exactly like the sprites (same hair, outfits and colors), two on the left and two on the right, each holding out a small glowing heart-shaped token like the heart sprite.",
      "In the middle stands a young adventurer with short brown hair in a light tunic, looking a little puzzled, holding several of the glowing heart tokens in both hands. Sweet, light-hearted, slightly curious mood.",
    ].join(" "),
  },
];

/* ------------------------------------------------------------------ 參數 */

const args = process.argv.slice(2);
const ALLOW_AI = args.includes("--ai");
const REGEN = args.includes("--regen");
const only = args.filter(a => !a.startsWith("--"));
for (const slug of only) if (!SCENES.some(s => s.slug === slug)) throw new Error(`沒有這張：${slug}`);

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

/** 失敗或 429 換下一個部署一次，再掛就丟出去讓整支停下。不重試（429 是額度用完） */
async function editImage(label, prompt, image) {
  let last = "";
  for (const model of AI_MODELS) {
    try {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", prompt);
      form.set("size", `${W}x${H}`);
      form.append("image[]", new Blob([image], { type: "image/png" }), "input0.png");
      const response = await fetch(`${AI_BASE}/edits`, {
        method: "POST",
        headers: { "api-key": loadKey() },
        body: form,
        signal: AbortSignal.timeout(290_000),
      });
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

/* ------------------------------------------------------------------ 底稿 */

async function baseLayer(base) {
  if (base.render) {
    const [left, top, width, height] = base.crop;
    const img = sharp(path.join(ASSETS, "map_renders", `${base.render}.webp`)).extract({ left, top, width, height });
    // render 背景透明，墊一層天色
    const filled = await img.flatten({ background: base.fill ?? "#9fd3f0" }).png().toBuffer();
    return sharp(filled).resize(W, H, { fit: "cover", kernel: "nearest" }).png().toBuffer();
  }
  return sharp(path.join(BACKDROP_DIR, `${base.backdrop}.webp`)).resize(W, H, { fit: "cover" }).png().toBuffer();
}

async function sourceImage(scene) {
  const layers = [];
  for (const s of scene.sprites) {
    const file = path.join(ASSETS, s.file);
    const meta = await sharp(file).metadata();
    const h = Math.round(H * s.h);
    const w = Math.round((meta.width / meta.height) * h);
    let img = sharp(file).resize(w, h, { kernel: "nearest" });
    if (s.flip) img = img.flop();
    const left = Math.max(0, Math.min(W - w, Math.round(W * s.x - w / 2)));
    const top = Math.max(0, Math.min(H - h, Math.round(H * s.y - h)));
    layers.push({ input: await img.png().toBuffer(), left, top });
  }
  return sharp(await baseLayer(scene.base)).composite(layers).png().toBuffer();
}

/* ------------------------------------------------------------------ 輸出 */

async function writeUnder(pipeline, file, encode, start) {
  for (let quality = start; quality >= 40; quality -= 4) {
    const buffer = await encode(pipeline(), quality).toBuffer();
    if (buffer.length <= MAX_BYTES) {
      fs.writeFileSync(file, buffer);
      return buffer.length;
    }
  }
  throw new Error(`${file} 壓不到 300KB`);
}

const sha = text => createHash("sha256").update(text).digest("hex").slice(0, 12);

fs.mkdirSync(CACHE, { recursive: true });
const missing = [];
for (const scene of SCENES) {
  if (only.length && !only.includes(scene.slug)) continue;
  console.log(scene.slug);
  const dir = path.join(PUBLIC_DIR, scene.slug);
  const webp = path.join(dir, "hero.webp");
  const jpg = path.join(dir, "hero.jpg");
  const source = await sourceImage(scene);
  fs.writeFileSync(path.join(CACHE, `cardsrc-${scene.slug}.png`), source);
  const prompt = [STYLE, scene.idea, RULES].join(" ");
  const cached = path.join(CACHE, `cardhero-${scene.slug}-${sha(prompt + source.toString("base64"))}.png`);
  if (!fs.existsSync(cached) || REGEN) {
    if (fs.existsSync(webp) && !REGEN) {
      console.log("  public 已有主圖，快取沒有對應原檔，照舊留著（要重畫加 --regen --ai）");
      continue;
    }
    if (!ALLOW_AI) {
      missing.push(scene.slug);
      continue;
    }
    fs.writeFileSync(cached, await editImage(scene.slug, prompt, source));
  }
  fs.mkdirSync(dir, { recursive: true });
  const meta = await sharp(cached).metadata();
  const pipeline = () => sharp(cached).removeAlpha().resize(W, H, { fit: "cover" });
  const jpgBytes = await writeUnder(pipeline, jpg, (p, q) => p.jpeg({ quality: q, mozjpeg: true }), 88);
  const webpBytes = await writeUnder(pipeline, webp, (p, q) => p.webp({ quality: q }), 80);
  console.log(`  原檔 ${meta.width}×${meta.height}，jpg ${(jpgBytes / 1024).toFixed(0)}KB、webp ${(webpBytes / 1024).toFixed(0)}KB`);
}
if (missing.length) console.log(`還缺主圖（要畫加 --ai）：${missing.join("、")}`);
