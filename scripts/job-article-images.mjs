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
  老班長: {
    hair: 30660, face: 23095, items: [1002505, 1042177, 1062121, 1072303, 1012024], pose: "alert", tint: "#4a5a32",
    look: "a grizzled veteran drill sergeant with short black hair, a thick curled black moustache and a hard stare, a khaki army field cap with a small red badge, an olive green hooded military jacket, camouflage trousers and brown combat boots, gripping a long polearm with a heavy spiked steel head",
  },
  騎士道潔癖: {
    hair: 30293, face: 20087, items: [1050083, 1102246, 1072010], pose: "stabO1", tint: "#b39a4e",
    look: "an immaculate noble young knight with neatly combed golden blond hair and an upright stern gaze, polished black and silver plate armor, a spotless red cape trimmed with white fur, shiny black shoes, holding a very long thin silver two-handed sword",
  },
  社恐槍兵: {
    hair: 33795, face: 20083, items: [1010002, 1042001, 1062059, 1072441], pose: "alert", tint: "#27384f",
    look: "a shy young spearman hiding behind long glossy bright blue hair that covers half his face, a dark gray cloth mask over his nose and mouth, nervous downcast eyes, a black sleeveless hooded vest, faded black jeans and black ninja boots, holding a very long polearm at the full length of his arms",
  },
  擾民龍騎: {
    hair: 33801, face: 20015, items: [1002338, 1050060, 1102033, 1072163], pose: "alert", tint: "#7d1a14",
    look: "a loud furious dragon knight in a tall white helmet with a red dragon crest, angry shouting eyes, crimson and orange armor, a red dragon-pattern cape, red dragon-hide boots, holding a very long dragon spear with a wide pale blue blade",
  },
  沒藍焦慮症: {
    hair: 35075, face: 20097, items: [1053997, 1022022, 1072234], pose: "alert", tint: "#3a6aa8",
    look: "an anxious skinny young mage with fluffy pale blue hair, huge blue spiral-swirl glasses, pale blue pajamas and fluffy slippers shaped like blue slimes, holding a small plain wooden wand",
  },
  牢底坐穿自虐狂: {
    hair: 30612, face: 20021, items: [1053315, 1073282], pose: "stabO1", tint: "#a4551a",
    look: "a cheerfully unhinged wizard with a tall spiky red-orange mohawk and eyes squeezed shut in a happy grin, a black and white striped prison uniform, bare ankles with a chained iron ball, holding a small plain wooden wand",
  },
  冷面理組: {
    hair: 33540, face: 23091, items: [1052340, 1022033, 1072010], pose: "stand1", tint: "#3e4a55",
    look: "a handsome stone-faced young scientist with neatly side-parted black hair, black square glasses and emotionless eyes, a long white lab coat, black dress shoes, holding a large closed yellow umbrella like a lance",
  },
  控場強迫症: {
    hair: 30295, face: 20005, items: [1052908, 1102149, 1082276, 1072447], pose: "alert", tint: "#3f83ad",
    look: "a prim perfectionist mage with short tidy royal blue hair and calm precise eyes, a pale blue snowflake winter outfit, white ice gloves and boots, huge perfectly symmetrical glowing cyan ice wings spread behind him, holding a large closed yellow umbrella",
  },
  過勞神職: {
    hair: 35086, face: 23024, items: [1050026, 1102077, 1072285], pose: "stand1", tint: "#7c6f8f",
    look: "an exhausted young priest with messy pale lavender hair in a loose bun, sleepy half-closed eyes with tired bags, a white priest robe, a heavy quilt blanket draped over his shoulders like a cape, worn brown slippers, dragging a large closed yellow umbrella",
  },
  遠距離派: {
    hair: 33724, face: 23010, items: [1002158, 1040022, 1062061, 1072034], pose: "shoot1", tint: "#2f6b3c",
    look: "an aloof young ranger with long green hair and far-gazing eyes under a wide-brimmed olive green hunter hat with a steel plate, a forest green hunter tunic, olive trousers and green leather boots, drawing a tall wooden battle bow",
  },
  野外求生狂: {
    hair: 33937, face: 25019, items: [1042084, 1062056, 1102072, 1010000, 1072217], pose: "shoot1", tint: "#6b5a34",
    look: "a rugged survivalist with wind-tossed ash brown hair and a full brown beard, a camouflage hooded military vest, camouflage cargo pants, a lime green multi-pocket backpack, brown canvas boots, drawing a large ornate golden yellow bow",
  },
  零件控: {
    hair: 33222, face: 20016, items: [1022083, 1042182, 1062040, 1082222, 1102202], pose: "shoot2", tint: "#5a5148",
    look: "a gear-obsessed young tinkerer with swept-up platinum white hair, big black ski goggles, a denim hooded shirt, light blue work overalls and mechanical gloves, a short purple tech cape with a blue thruster glow, aiming an ornate crossbow",
  },
  巷口小混混: {
    hair: 30813, face: 20009, items: [1022015, 1042138, 1062051, 1072187], pose: "stabO1", tint: "#3c3c3c",
    look: "a cocky street punk with slicked blond hair, big black aviator sunglasses and a sneering mouth, a white tank top, baggy dark jeans and blue polka-dot flip-flops, a small dark spiked claw on his fist",
  },
  彬彬有禮殺手: {
    hair: 30600, face: 20098, items: [1002259, 1022040, 1052055, 1102150, 1072010], pose: "stand1", tint: "#1d1d26",
    look: "a perfectly polite assassin with a small courteous smile, a tall black top hat with a dark red band, a round blue monocle, slick black hair, a sleek black leather suit, a black vampire cape with sharp points, black dress shoes, a yellow lightning-patterned claw on his fist",
  },
  破產船長: {
    hair: 33357, face: 23053, items: [1002649, 1052104, 1102053, 1022062, 1072321], pose: "stand1", tint: "#5e3f24",
    look: "a broke ex-captain clinging to his dignity, scruffy brown hair, an oversized black pirate captain hat with gold trim and a skull emblem, a black skull eyepatch, a shabby brown pirate coat, a ragged torn cape and old captain boots, holding a red rubber toilet plunger as a weapon",
  },
  健身教練: {
    hair: 30490, face: 20024, items: [1002318, 1040135, 1060049, 1072232], pose: "stabO1", tint: "#b5472a",
    look: "a pumped-up fitness coach with short spiky black hair, a red headband and burning eyes, a tight bright orange top showing bulging muscles and abs, dark track pants, red boxing shoes, fists clenched in heavy knuckle gauntlets",
  },
  嘴砲牛仔: {
    hair: 30667, face: 20006, items: [1002384, 1050101, 1102156, 1072303], pose: "alert", tint: "#9a6a2c",
    look: "a smirking handsome gunslinger with a wide tan cowboy hat, a very long red scarf streaming in the wind, a western cowboy shirt and jeans, brown boots, holding a flashy pistol",
  },
  佛系神射手: {
    hair: 31430, bald: true, face: 20026, items: [1050007, 1102144, 1072284], pose: "shoot1", tint: "#c7a24a",
    look: "a serene bald monk-like sharpshooter with eyes peacefully closed, a white martial-arts gi with navy trousers, a funny little old white-bearded master carried on his back like a backpack, monk shoes, aiming a golden flintlock pistol",
  },
};

/** 地圖→背景主題。背景只墊在透明處，模糊過，不會蓋住地圖 */
const BACKDROP_OF = {
  101040001: "canyon", 101030001: "canyon", 106000101: "burnt", 106000110: "burnt", 106000140: "burnt", 101030103: "ruins",
  107000000: "swamp", 107000200: "swamp", 107000403: "swamp",
  100040103: "monkey-forest", 100040110: "monkey-forest",
  101020009: "tree-hollow", 101020010: "tree-hollow",
  105050200: "cave", 103000104: "subway",
  101040002: "canyon", 101030402: "canyon", 101030404: "canyon", 101030406: "canyon",
  106000001: "burnt", 106000002: "burnt",
  101030101: "ruins", 106010102: "ruins",
  107000001: "swamp", 107000400: "swamp", 107000402: "swamp",
  100040001: "monkey-forest", 100040100: "monkey-forest", 100040101: "monkey-forest",
  105050000: "cave", 105070100: "cave", 105070300: "cave", 105080000: "cave", 105090400: "cave", 105090600: "cave",
  103000101: "subway", 103000200: "subway", 103000804: "subway", 910340500: "subway",
  103010001: "construction", 102040001: "construction",
  104030001: "meadow", 100020000: "meadow",
  104010001: "beach", 110020001: "beach", 110040000: "beach",
  101030110: "barracks", 101030111: "barracks",
  100040105: "dark-forest", 100040106: "dark-forest", 105040303: "dark-forest", 105040304: "dark-forest", 105040306: "dark-forest",
  211040001: "snow", 211041100: "snow", 211041200: "snow", 211041400: "snow",
  200010111: "sky-garden", 200010130: "sky-garden", 200010131: "sky-garden", 200080000: "sky-garden",
};
/** 文章的地圖代號 → maplestory.io GMS/83 抓得到的代號。910340500 是第一次組隊任務最後一關的新編號，舊版同一關是 103000804 */
const MAP_SOURCE = { 910340500: 103000804 };
const BACKDROP_PROMPT = {
  canyon: "A bright rocky canyon under a clear blue afternoon sky with distant tan sandstone mesas and thin clouds",
  burnt: "A scorched wasteland at dusk with an orange-red hazy sky, drifting embers and distant silhouettes of dead trees and smoke",
  ruins: "A warm desert canyon sky at late afternoon with distant sandstone cliffs and ancient stone ruins",
  swamp: "A dense jungle swamp with giant twisted vines, mossy trees, soft green light shafts and hanging leaves",
  "monkey-forest": "A lush deep forest of huge old trees with layered green foliage, dappled golden sunlight and floating leaves",
  "tree-hollow": "The inside of a colossal hollow tree with dark brown bark walls, faint teal glowing spores and dim light from above",
  cave: "A deep cave lit by glowing fungi and dark blue-purple rock walls with soft mist",
  subway: "A gloomy abandoned underground subway tunnel with rusty pipes, dim yellow lamps and dark concrete walls",
  construction: "A half-built city skyline under a clear morning sky with distant steel girders, tower cranes and scaffolding in soft blue haze",
  meadow: "Gentle rolling green hills under a bright blue sky with puffy white clouds and small distant trees",
  beach: "A sunny tropical beach with turquoise sea, soft white sand dunes on the horizon, distant palm trees and fluffy clouds",
  barracks: "A grim fortified military camp at dusk with distant dark stone walls, wooden watchtowers, tattered banners without any emblem and an overcast purple sky",
  "dark-forest": "A shadowy enchanted forest of huge dark twisted trees with purple-green mist, faint moonlight shafts and glowing motes",
  snow: "A frozen snowy mountain range under a pale winter sky with distant white peaks, bare frosted dead trees and drifting snowflakes",
  "sky-garden": "A serene garden floating high in the sky, bright pastel clouds, distant floating islands with trimmed hedges and soft golden light",
};

const STYLE_RULES = "Absolutely no text, no letters, no numbers, no logos, no watermarks, no signs with writing, no UI, no speech bubbles anywhere in the image. No extra characters besides the ones already in the scene.";

/**
 * 每篇的設定。weapon 要是文章寫到的武器（腳本會查）。
 * hero：主圖構圖。pick 是站的平台（遊戲座標，對不上腳本會報錯），char／mobs 的 x 是畫面寬的比例、right 決定朝向。
 * hero.look 選填：這篇拿的武器跟 PERSONAS 的 look 寫的不同時，整句換掉。
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
    cards: { 101040001: { x: 1100, y: 2055 } },
    hero: {
      map: 101040001, mob: 2230102, pose: "alert",
      pick: { x: 1100, y: 2055 },
      char: { x: 0.8, right: false }, mobs: [{ x: 0.3, right: true }],
      idea: "Dramatic dusk silhouette: he stands alone on the right with his cloak sweeping in the wind, facing left, one black wild boar on the left across rocky ground, large orange sunset behind, long shadows. Lonely and cool.",
    },
  },
  "100-10-30": {
    weapon: 1442007,
    hero: {
      map: 103010001, mob: 1120100, pose: "alert",
      pick: { x: -1300, y: 497 },
      char: { x: 0.3, right: true }, mobs: [{ x: 0.68, right: false }],
      idea: "Bright morning high on a steel-girder construction site. He stands square and upright like inspecting a recruit, polearm planted, barking orders at the three-eyed octopus in front of him. Clean blue sky, crisp daylight, slightly low heroic angle.",
    },
  },
  "110-51-70": {
    weapon: 1402006,
    hero: {
      map: 105080000, mob: 5130100, pose: "alert",
      pick: { x: 690, y: 850 },
      char: { x: 0.78, right: false }, mobs: [{ x: 0.3, right: true }],
      idea: "He leaps in from the right mid-roar with greatsword swinging down, flames trailing him, a blue drake rearing on the left. Close framing, strong diagonal energy, sparks and dust, cave lit with orange firelight.",
    },
  },
  "120-31-50": {
    weapon: 1402006,
    hero: {
      map: 101040001, mob: 2230102, pose: "stabO1",
      pick: { x: 850, y: 2055 },
      char: { x: 0.72, right: false }, mobs: [{ x: 0.28, right: true }],
      idea: "Formal duel in clear soft morning light: he stands upright on the right with his sword held out in a knight's salute, cape neat, looking displeased, while one black wild boar paws the ground on the left. Elegant, orderly, a little absurd.",
    },
  },
  "120-51-70": {
    weapon: 1402006,
    hero: {
      map: 105080000, mob: 5130100, pose: "stabO1",
      pick: { x: 760, y: 600 },
      char: { x: 0.25, right: true }, mobs: [{ x: 0.66, right: false }],
      idea: "He holds a perfect textbook knight's guard on the left, armor spotless and gleaming, while a blue drake snarls on the right. A single cold pale beam of light falls on him in a dark cave. Serious, noble mood, cool blue tones.",
    },
  },
  "130-31-50": {
    weapon: 1432005,
    hero: {
      map: 101030001, mob: 2230102, pose: "alert",
      pick: { x: 630, y: 2205 },
      char: { x: 0.26, right: true }, mobs: [{ x: 0.72, right: false }],
      idea: "Medium shot, both clearly visible and large: he leans back as far as he can on the left, arms fully extended, poking a very long polearm at a black wild boar on the right, the blade just reaching it. Awkward, shy body language, warm late afternoon canyon light.",
    },
  },
  "130-51-70": {
    weapon: 1442005,
    hero: {
      map: 105040304, mob: 5130102, pose: "stabT1",
      pick: { x: 270, y: 1995 },
      char: { x: 0.2, right: true }, mobs: [{ x: 0.72, right: false }],
      idea: "Low camera looking up: a towering obsidian golem fills the right side, and he is small on the left, stabbing from the longest possible distance with his long polearm, eyes averted. Dim green-purple forest cavern light, strong sense of scale.",
    },
  },
  "131-71-90": {
    weapon: 1432007,
    hero: {
      map: 211040001, mob: 6130103, pose: "alert",
      pick: { x: 360, y: -296 },
      char: { x: 0.22, right: true }, mobs: [{ x: 0.55, right: false }, { x: 0.72, right: false }, { x: 0.9, right: false }],
      idea: "He roars with his whole body on the left, visible shockwave rings of air and snow blasting to the right, a row of three penguin kings being blown back and panicking. Snow cliffs, white and icy blue, loud and chaotic energy.",
    },
  },
  "200-10-30": {
    weapon: 1372005,
    hero: {
      map: 103000101, mob: 1210103, pose: "alert",
      pick: { x: 1400, y: 198 },
      char: { x: 0.84, right: false }, mobs: [{ x: 0.14, right: true }, { x: 0.32, right: true }, { x: 0.5, right: true }],
      idea: "He backs away on the right, sweating and clutching his wand, a growing queue of blue slimes coming at him from the left along a long subway platform. Comic tension, dim yellow station lamps.",
    },
  },
  "210-31-50": {
    weapon: 1372005,
    hero: {
      map: 103000200, mob: 3230101, pose: "stabO1",
      pick: { x: 1600, y: 198 },
      char: { x: 0.36, right: true }, mobs: [{ x: 0.6, right: false }, { x: 0.74, right: false }, { x: 0.88, right: false }],
      idea: "Grinning happily left of center, he fires one tiny fire arrow from his wand at a crowd of little ghosts drifting toward him in a dark subway tunnel. Warm small orange flame against a cold teal tunnel, cheerful and doomed.",
    },
  },
  "220-31-50": {
    weapon: 1302016,
    hero: {
      map: 105040303, mob: 3230100, pose: "stand1",
      pick: { x: 135, y: 915 },
      char: { x: 0.5, right: true }, mobs: [{ x: 0.2, right: true }, { x: 0.8, right: false }],
      idea: "Perfectly centered and motionless, expression blank, he holds up the umbrella while branching chain lightning arcs out left and right into a wind cyclops on each side. Symmetrical composition, dark forest, cold blue-white lightning as the only light.",
    },
  },
  "220-51-70": {
    weapon: 1302016,
    hero: {
      map: 100040105, mob: 5300100, pose: "stand1",
      pick: { x: 540, y: 278 },
      char: { x: 0.2, right: true }, mobs: [{ x: 0.58, right: false }, { x: 0.84, right: false }],
      idea: "Purple night in an evil forest: a huge lightning flash from behind turns him into a sharp backlit figure on the left, white lab coat glowing, while witches on brooms scatter on the right. Moody, high contrast.",
    },
  },
  "221-71-90": {
    weapon: 1302016,
    hero: {
      map: 200010111, mob: 5120001, pose: "alert",
      pick: { x: -200, y: 83 },
      char: { x: 0.13, right: true }, mobs: [{ x: 0.42, right: false }, { x: 0.58, right: false }, { x: 0.74, right: false }, { x: 0.9, right: false }],
      idea: "A perfectly evenly spaced straight row of four red unicorn lions, each frozen solid in an identical ice block, and he stands on the left admiring how neat they are, wings spread. Crimson sky garden, pale ice-blue glow, orderly and satisfying.",
    },
  },
  "230-51-70": {
    weapon: 1302016,
    hero: {
      map: 101030110, mob: 5150001, pose: "alert",
      pick: { x: -40, y: -178 },
      char: { x: 0.25, right: true }, mobs: [{ x: 0.6, right: false }, { x: 0.85, right: false }],
      idea: "She walks in from the left not even looking at them, umbrella raised lazily, a wave of golden holy light rolling over skeleton soldiers on the right in a torch-lit army camp. Warm gold against cold stone, unimpressed and cool.",
      look: "a slim young woman healer with long straight purple hair streaked with a gold hairband, cool half-lidded gray eyes, wearing a white and gold priestess robe, white shoes, small pale pink-white angel wings with a soft blue glow, holding a large closed yellow umbrella",
    },
  },
  "231-71-90": {
    weapon: 1302016,
    hero: {
      map: 211041400, mob: 5130107, pose: "stand1",
      pick: { x: 1750, y: -386 },
      char: { x: 0.5, right: false }, mobs: [{ x: 0.24, right: true }, { x: 0.78, right: false }],
      idea: "Pale snowy morning fog in a dead forest. He slumps half asleep in the center, leaning on the umbrella with the quilt around his shoulders, while holy light bursts on its own and a zombie shuffles in from each side. Tired, deadpan comedy.",
    },
  },
  "231-91-120": {
    weapon: 1302016,
    hero: {
      map: 211041400, mob: 5130107, pose: "stand1",
      pick: { x: 2070, y: 34 },
      char: { x: 0.78, right: false }, mobs: [{ x: 0.22, right: true }],
      idea: "Lonely dusk in a misty dead forest: he stands small on the right, one thin column of holy light in the purple-orange sky falling on a single zombie far to the left. Long shadow, nobody else around, overtime feeling.",
    },
  },
  "300-10-30": {
    weapon: 1452000,
    hero: {
      map: 107000001, mob: 2130103, pose: "shoot1",
      pick: { x: -540, y: -119 },
      char: { x: 0.22, right: true }, mobs: [{ x: 0.7, right: false }, { x: 0.86, right: false }],
      idea: "Medium shot, all clearly visible and large, bright and readable: he draws his bow on the left with an arrow in flight, two green snakes rearing up on the right across a small gap on the swamp ledge. Bright sunlit green, sharp and confident.",
    },
  },
  "310-51-70": {
    weapon: 1452004,
    hero: {
      map: 100040103, mob: 4230101, pose: "shoot1",
      pick: { x: 810, y: -52 },
      char: { x: 0.75, right: false }, mobs: [{ x: 0.12, right: true }, { x: 0.32, right: true }],
      idea: "Close framing at golden dusk in the forest: he is on the right, squinting calmly along a bow with blazing red and gold phoenix tips, while two angel monkeys scamper in from the left. Warm orange light, long shadows, shrewd and focused.",
      look: "a handsome frugal young archer with neat spiky brown hair and thin rimless glasses, calm half-lidded eyes, wearing a plain checkered shirt with a small orange tie, faded blue denim work pants and worn brown leather shoes, drawing an ornate phoenix bow with red and gold tips",
    },
  },
  "311-71-90": {
    weapon: 1452011,
    hero: {
      map: 105040306, mob: 5150000, pose: "shoot1",
      pick: { x: 90, y: 2715 },
      char: { x: 0.14, right: true }, mobs: [{ x: 0.62, right: false }],
      idea: "He kneels low at the left with his backpack on, firing upward, and a dense rain of arrows falls out of the sky onto one hulking stone golem at center right. Shafts of moonlight through dark giant trees, epic scale.",
    },
  },
  "311-91-120": {
    weapon: 1452011,
    hero: {
      map: 200010131, mob: 5120003, pose: "shoot1",
      pick: { x: -200, y: 83 },
      char: { x: 0.8, right: false }, mobs: [{ x: 0.2, right: true }, { x: 0.42, right: true }],
      idea: "Fresh dawn in a green sky garden: he stands on the right, bow drawn, hair and beard in the wind, two blue unicorn lions bounding toward him from the left. Clear pastel light, clouds below the garden, adventurous open-air mood.",
    },
  },
  "320-31-50": {
    weapon: 1462005,
    hero: {
      map: 100040110, mob: 3210800, pose: "shoot2",
      pick: { x: 360, y: -562 },
      char: { x: 0.2, right: true }, mobs: [{ x: 0.62, right: false }, { x: 0.82, right: false }],
      idea: "Under the forest floor canopy he fires two parallel glowing bolts at once from his crossbow toward two monkeys on the right, both bolts mid flight. Technical and exact, deep green forest with a shaft of sunlight.",
    },
  },
  "320-51-70": {
    weapon: 1462008,
    hero: {
      map: 105040306, mob: 5150000, pose: "shoot2",
      pick: { x: 90, y: 2295 },
      char: { x: 0.88, right: false }, mobs: [{ x: 0.42, right: true }],
      idea: "Mirrored view: he aims from the far right and a piercing golden bolt punches through a huge stone golem on the left, stone chips flying in a line. Dark forest, golden bolt as the key light, gear-head satisfaction.",
    },
  },
  "400-10-30": {
    weapon: 1472007,
    hero: {
      map: 103000804, mob: 9300003, pose: "stabO1",
      pick: { x: 135, y: -1455 },
      char: { x: 0.2, right: true }, mobs: [{ x: 0.68, right: false }],
      idea: "He struts on the left, chin up, mouth running, flicking a small throwing star at a giant green slime that fills the right side and looks totally unbothered. Comedic size difference, dim stone stage with greenish light.",
    },
  },
  "410-51-70": {
    weapon: 1472018,
    hero: {
      map: 107000400, mob: 5130103, pose: "alert",
      pick: { x: 900, y: -119 },
      char: { x: 0.22, right: true }, mobs: [{ x: 0.62, right: false }, { x: 0.86, right: false }],
      idea: "Flashy pose on a swamp ledge in sickly green light: he flings shining throwing stars with an arrogant grin, and the stars leave gleaming golden trails toward two black crocodiles on the right. Gaudy gold against the gloomy swamp.",
    },
  },
  "411-71-90": {
    weapon: 1472026,
    hero: {
      map: 211041400, mob: 5130107, pose: "alert",
      pick: { x: 800, y: 34 },
      char: { x: 0.7, right: false }, mobs: [{ x: 0.34, right: true }],
      idea: "He bows politely on the right, one hand on his chest and top hat tipped, while a zombie on the left is already collapsing with throwing stars in it. Cold blue mist, snow on dead trees, elegant and chilling.",
    },
  },
  "411-91-120": {
    weapon: 1472026,
    hero: {
      map: 211041400, mob: 5130107, pose: "alert",
      pick: { x: 1970, y: -386 },
      char: { x: 0.32, right: true }, mobs: [{ x: 0.68, right: false }, { x: 0.86, right: false }],
      idea: "Blood-red dusk behind dead trees: he stands with his cape flowing, calmly adjusting his monocle, and one huge spinning throwing star flies in a straight line through two zombies on the right. Sharp silhouettes, red and black, ruthless and refined.",
    },
  },
  "420-51-70": {
    weapon: 1332015,
    hero: {
      map: 107000400, mob: 5130103, pose: "stabO1",
      pick: { x: -450, y: -660 },
      char: { x: 0.7, right: false }, mobs: [{ x: 0.26, right: true }],
      idea: "Moonlit night on a high swamp platform: he crouches into a lunge on the right with his cloak flaring, the short winged blade drawn, a black crocodile on the left below a huge full moon. Cool blue and crimson accents, brooding and overly dramatic.",
      look: "a brooding lone-wolf rogue with spiky dark gray hedgehog hair, a black eyepatch over one eye, a cold stare, wearing a black butler-style outfit under a huge black high-collared reaper cloak with a crimson glowing edge, holding a short winged dagger",
    },
  },
  "500-10-30": {
    weapon: 1322009,
    hero: {
      map: 103010001, mob: 1120100, pose: "stand1",
      pick: { x: -1240, y: 231 },
      char: { x: 0.66, right: false }, mobs: [{ x: 0.26, right: true }],
      idea: "Sunset on a high girder: he stands on the right with the plunger raised like a captain's sword and his torn cape blowing, facing a three-eyed octopus on the left. City skyline in orange behind, heroic pose, shabby clothes, proud and pitiful.",
    },
  },
  "510-31-50": {
    weapon: 1482006,
    hero: {
      map: 105040303, mob: 3230100, pose: "stabO1",
      pick: { x: 90, y: 1995 },
      char: { x: 0.42, right: true }, mobs: [{ x: 0.64, right: false }],
      idea: "Tight close framing like a boxing match: he drives a huge punch into a wind cyclops, muscles bulging, sweat flying, his mouth shouting one more rep. Dense trees blurred behind, strong rim light, impact burst.",
    },
  },
  "510-51-70": {
    weapon: 1482008,
    hero: {
      map: 107000400, mob: 5130103, pose: "stabO1",
      pick: { x: 200, y: 120 },
      char: { x: 0.34, right: true }, mobs: [{ x: 0.58, right: false }],
      idea: "Mid uppercut in a dark swamp: he launches a black crocodile upward from the mud with a blow, water droplets and muck flying in a big arc, clear shafts of light behind him. Explosive power, deep green and gold colors.",
    },
  },
  "520-31-50": {
    weapon: 1492006,
    hero: {
      map: 101030404, mob: 1130100, pose: "alert",
      pick: { x: 850, y: 1300 },
      char: { x: 0.82, right: false }, mobs: [{ x: 0.14, right: true }, { x: 0.34, right: true }],
      idea: "High-noon western showdown on rocky ground: he stands on the right, hat tilted, scarf whipping, pistol at his hip, smirking and talking, with two axe stumps facing him from the left. Bright sun, dust in the air, long hard shadows.",
    },
  },
  "520-51-70": {
    weapon: 1492008,
    hero: {
      map: 200010111, mob: 5120001, pose: "alert",
      pick: { x: -200, y: 83 },
      char: { x: 0.5, right: true }, mobs: [{ x: 0.15, right: true }, { x: 0.85, right: false }],
      idea: "Center stage in a red-lit sky garden at sunset: he fires a wild spread of bullets to both sides, muzzle flash lighting his grin, one red unicorn lion on each side. Flashy, showboating.",
    },
  },
  "521-71-90": {
    weapon: 1492009,
    hero: {
      map: 211041200, mob: 5130107, pose: "shoot1",
      pick: { x: 1400, y: -356 },
      char: { x: 0.24, right: true }, mobs: [{ x: 0.76, right: false }],
      idea: "Quiet falling snow in a dead forest, almost like an ink wash painting: with eyes closed he fires one single calm shot, a thin trail hanging in the air, and a zombie far to the right is about to drop. Pale, still, peaceful, lots of empty space.",
    },
  },
};

/** 路線卡的預設平台（每篇都一樣時放這，篇別的 cards 優先）。自動挑會站到雕像前面、頭被裁掉的圖才寫 */
const CARD_PICK = {
  104030001: { x: 150, y: 1115 },
  101030110: { x: -40, y: -178 },
  101030111: { x: 65, y: 215 },
  200010111: { x: -200, y: 83 },
  200010131: { x: -200, y: 83 },
  211040001: { x: 360, y: -266 },
  101030402: { x: 1020, y: 1580 },
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
  const source = MAP_SOURCE[id] ?? id;
  const png = await download(`https://maplestory.io/api/GMS/83/map/${source}/render`, `map-${source}.png`, { timeout: 180_000 });
  const json = JSON.parse((await download(`https://maplestory.io/api/GMS/83/map/${source}`, `map-${source}.json`)).toString("utf8"));
  const raw = await rawOf(png);
  const footholds = Object.values(json.footholds);
  const { dx, dy, score } = calibrate(raw, footholds, source);
  // 106010102 整張是神殿磚牆，落腳線上方多半不透明所以分數低；疊線看過位移是對的
  if (score < 0.2 && id !== 106010102) throw new Error(`地圖 ${id} 的落腳線對不上圖（比對分數 ${score.toFixed(2)}）`);
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
  // 光頭髮型本來就什麼都不畫（bald: true），不比
  for (const id of [...(persona.bald ? [] : [persona.hair]), persona.face, ...persona.items, weapon]) {
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
  const list = bestCrop(map, CARD.w, CARD.h, char, mobs, mobIds, config.cards?.[step.map] ?? CARD_PICK[step.map]);
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
    `The main character is ${hero.look ?? persona.look}. Keep the exact same outfit colors, hair and weapon as the sprite in the image, with chibi-free but still stylized heroic proportions and a good-looking face.`,
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
  1120100: "a three-eyed octopus: a round purple and magenta bumpy head with three staring white eyes and curling pink tentacles",
  5130100: "a blue drake: a teal-gray four-legged lizard dragon with dorsal plates along its back, a long tail and a pale snout",
  5130102: "an obsidian golem: a huge humanoid of dark gray carved stone blocks with spiral carvings, green moss on its shoulders and head, small red eyes",
  5150000: "a hybrid stone golem: a huge humanoid of mixed dark gray and pale tan carved stone blocks with spiral carvings, green moss on its shoulders and head, small red eyes",
  6130103: "a penguin king: a chubby blue penguin with a white belly, orange beak and feet, and a small golden crown",
  1210103: "a blue slime: a shiny translucent blue teardrop-shaped blob with small black eyes and a tiny smile",
  3230101: "a little ghost: a small white hooded wisp with a round dark face and two pale eyes",
  3230100: "a wind cyclops: a green lizard-like creature with one big eye, a wide toothy grin and a long tail",
  5300100: "a witch: a small hunched old witch in a dark gray robe and pointed hat with a crescent moon, riding a straw broom",
  5120001: "a red unicorn lion: a small fluffy white cat-like creature with a red-tipped spiky mane, a small orange horn and big blue eyes",
  5120003: "a blue unicorn lion: a small fluffy white cat-like creature with a blue-tipped spiky mane, a small orange horn and big green eyes",
  5150001: "a skeleton soldier: a hunched skeleton wearing a brown leather helmet and swinging a wooden club",
  5130107: "a zombie: a gaunt gray-green undead man with messy pale hair, tattered gray clothes, shuffling with a wooden club",
  2130103: "a green snake: a small bright green coiled snake with big round eyes",
  3110100: "a crocodile: a long low green crocodile with a pale belly and half-lidded eyes",
  5130103: "a black crocodile: a long low dark olive-brown crocodile with a pale belly and half-lidded eyes",
  9300003: "a giant green slime: a huge glossy bright green blob with yellow cross-shaped eyes and a thin curved antenna tipped with a green ball",
  1130100: "an axe stump: a walking brown tree stump with one round eye, thick roots as legs and a steel axe stuck in its top",
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
