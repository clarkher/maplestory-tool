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
    // v2.28 波達系列：天空之城，波達等主人豪克
    slug: "quest-line-3053",
    base: { render: 200000000, crop: [400, 200, 480, 270], fill: "#cfe6f7" },
    sprites: [
      { file: "npcs/2012019.png", x: 0.36, y: 0.9, h: 0.22 },
      { file: "npcs/2030012.png", x: 0.8, y: 0.9, h: 0.34 },
    ],
    idea: [
      "Turn the scene into a bright floating sky city above the clouds: white and pale-blue stone buildings with domes, soft clouds below, clear morning light.",
      "In the left-center sits the small dog from the sprite, keep its look, color and shape exactly like the sprite, waiting patiently at a doorway and looking up hopefully.",
      "On the right stands the bearded explorer from the sprite with goggles on his hat and a big backpack, keep his look exactly like the sprite, reading an old map and not noticing the dog yet.",
      "A young adventurer with short brown hair in a light tunic kneels beside the dog, gently patting it. A few small penguin-king fish shapes lie in a basket next to them. Warm, tender, hopeful mood.",
    ].join(" "),
  },
  {
    // v2.28 珍的挑戰：維多利亞港，煉金術士珍跟黑肥肥
    slug: "quest-line-2010",
    base: { render: 104000000, crop: [380, 60, 480, 270], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/1002100.png", x: 0.3, y: 0.9, h: 0.32 },
      { file: "monster_frames/2230102.png", x: 0.72, y: 0.9, h: 0.24 },
    ],
    idea: [
      "Turn the scene into a sunny harbor town by the sea: wooden docks, sailing ships, seagulls, red-roofed houses, blue water sparkling.",
      "On the left stands the alchemist woman from the sprite, keep her hair, clothes and colors exactly like the sprite, at a small outdoor table full of colorful potion bottles and bubbling flasks.",
      "On the right is the black wild boar monster from the sprite, keep its look like the sprite, snorting. A young adventurer with short brown hair in a light tunic runs toward the alchemist holding up a bundle of boar tusks and spiky mushroom caps.",
      "Bright, adventurous, slightly comedic mood.",
    ].join(" "),
  },
  {
    // v2.28 維多利亞島任務總整理：弓箭手村一帶
    slug: "quests-victoria",
    base: { render: 104000000, crop: [0, 40, 540, 304], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/1002100.png", x: 0.2, y: 0.9, h: 0.22 },
      { file: "npcs/2012019.png", x: 0.86, y: 0.9, h: 0.14 },
    ],
    idea: [
      "Turn the scene into a wide panoramic view of a green fantasy island seen from a hilltop at golden hour: a harbor town, a forest village with giant trees, a rocky warrior town on cliffs, and a dark city in the distance, connected by winding dirt roads.",
      "In the foreground a young adventurer with short brown hair in a light tunic stands at a signpost at a crossroads, holding a long rolled-out quest list scroll and looking out over the island, excited.",
      "Keep the two small characters from the sprites as tiny friendly figures near the road, same look as the sprites. Warm, inviting, sense of many places to explore.",
    ].join(" "),
  },
  {
    // v2.28 龍騎士配點：龍穴，龍騎士對青龍
    slug: "skill-build-spearman",
    base: { render: 105090300, crop: [300, 900, 480, 270], fill: "#3b4a3a" },
    sprites: [{ file: "monster_frames/5130100.png", x: 0.74, y: 0.88, h: 0.42 }],
    idea: [
      "Turn the scene into a dramatic dragon cave: dark rocky walls, glowing green crystals, mist and embers in the air.",
      "On the right the blue dragon monster from the sprite, keep its look, color and shape exactly like the sprite, rears up and roars.",
      "On the left a young dragon knight warrior with short dark hair in blue and silver armor holds a long spear with both hands, braced and calm, a faint blue dragon-shaped aura rising behind him.",
      "Epic but clean, strong rim light on the knight, cool blue and green palette.",
    ].join(" "),
  },
  // v2.30 第二輪：其餘系列任務＋楓之島、冰原雪域任務總整理（sprite 用系列裡最常出現的 NPC、怪）
  {
    slug: "quest-line-1037",
    base: { render: 50000, crop: [360, 182, 480, 270], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/12100.png", x: 0.28, y: 0.9, h: 0.3 },
      { file: "monster_frames/210100.png", x: 0.66, y: 0.9, h: 0.14 },
      { file: "monster_frames/130100.png", x: 0.8, y: 0.9, h: 0.2 },
    ],
    idea: [
      "Turn the scene into a cheerful little starter island village: grassy hills, small wooden houses with round roofs, a calm sea in the background, soft morning sun.",
      "On the left the friendly villager from the sprite, keep the look exactly like the sprite, points toward the field. On the right the small green slime and the little walking tree stump from the sprites, keep their look exactly like the sprites, hop around.",
      "A young beginner adventurer with short brown hair in a plain shirt holds a small wooden sword, eager and a little nervous. Bright, cozy, first-day-of-adventure mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-1009",
    base: { render: 1010000, crop: [360, 59, 480, 270], fill: "#9fd3f0" },
    sprites: [{ file: "npcs/12101.png", x: 0.62, y: 0.9, h: 0.32 }],
    idea: [
      "Turn the scene into a sunny training path on a small starter island: wooden fences, flowers, gentle slopes and a few practice targets.",
      "On the right the instructor from the sprite, keep the look exactly like the sprite, stands with arms crossed giving a friendly test. On the left a young beginner adventurer with short brown hair in a plain shirt jumps over a little gap, determined.",
      "Light, encouraging, playful mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2089",
    base: { render: 103000000, crop: [360, 174, 480, 270], fill: "#5b5560" },
    sprites: [
      { file: "npcs/1052106.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "npcs/1032106.png", x: 0.78, y: 0.9, h: 0.26 },
    ],
    idea: [
      "Split the scene softly between a gritty city of stone buildings and pipes on the left and a magical forest with giant mushrooms on the right, joined by a dirt road.",
      "On the left the bored young man from the sprite, keep the look exactly like the sprite, slumps on a crate yawning. On the right the small fairy from the sprite, keep the look exactly like the sprite, floats with a curious smile.",
      "A young adventurer with short brown hair in a light tunic walks between them carrying a bundle of slime drops and twigs. Light-hearted, comedic mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2162",
    base: { render: 120000100, crop: [442, 0, 315, 177], fill: "#2c3f57" },
    sprites: [
      { file: "npcs/1092007.png", x: 0.26, y: 0.9, h: 0.34 },
      { file: "monster_frames/7130100.png", x: 0.76, y: 0.9, h: 0.4 },
    ],
    idea: [
      "Turn the scene into the deck and cabin of a big wooden pirate ship docked at night, lanterns glowing, a sealed letter lying on a barrel.",
      "On the left the blindfolded swordsman from the sprite, keep the look exactly like the sprite, sits calmly listening. On the right the huge horned bull-headed monster from the sprite, keep the look exactly like the sprite, looms in the shadows.",
      "A young adventurer with short brown hair in a light tunic picks up the old letter, determined. Mysterious, slightly tense mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2082",
    base: { render: 102000000, crop: [360, 700, 480, 270], fill: "#8a6a4a" },
    sprites: [
      { file: "npcs/1022007.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "monster_frames/130100.png", x: 0.64, y: 0.9, h: 0.2 },
      { file: "monster_frames/6220000.png", x: 0.84, y: 0.9, h: 0.34 },
    ],
    idea: [
      "Turn the scene into a rocky highland village at the edge of a dark swamp, dead trees and mist in the distance.",
      "On the left the worried villager from the sprite, keep the look exactly like the sprite, hides behind a rock. In the middle the walking tree stump and on the right the giant swamp crocodile from the sprites, keep their look exactly like the sprites.",
      "A young adventurer with short brown hair in a light tunic stands between them shielding the villager. Brave, slightly spooky but fun mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2171",
    base: { render: 120000300, crop: [446, 0, 308, 173], fill: "#2c3f57" },
    sprites: [
      { file: "npcs/1092002.png", x: 0.3, y: 0.9, h: 0.34 },
      { file: "monster_frames/1210100.png", x: 0.72, y: 0.9, h: 0.16 },
    ],
    idea: [
      "Turn the scene into the inside of a pirate ship training deck: ropes, cannons, wooden crates, sunlight through portholes.",
      "On the left the young pirate from the sprite, keep the look exactly like the sprite, waves for help. On the right the little pink pig from the sprite, keep the look exactly like the sprite, runs around.",
      "A young adventurer with short brown hair in a light tunic chases the pig with a sack. Cheerful, slapstick mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2029",
    base: { render: 103000000, crop: [360, 174, 480, 270], fill: "#5b5560" },
    sprites: [
      { file: "npcs/1052103.png", x: 0.26, y: 0.9, h: 0.3 },
      { file: "monster_frames/3210800.png", x: 0.7, y: 0.9, h: 0.22 },
      { file: "monster_frames/2230102.png", x: 0.86, y: 0.9, h: 0.2 },
    ],
    idea: [
      "Turn the scene into a gritty city street of stone walls and pipes opening onto a jungle path.",
      "On the left the character from the sprite, keep the look exactly like the sprite, holds out a list with a pleading look. On the right the mischievous monkey and the black boar from the sprites, keep their look exactly like the sprites.",
      "A young adventurer with short brown hair in a light tunic nods and rolls up a sleeve. Friendly, busy mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2002",
    base: { render: 104000000, crop: [380, 60, 480, 270], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/1012101.png", x: 0.22, y: 0.9, h: 0.3 },
      { file: "npcs/1022002.png", x: 0.5, y: 0.9, h: 0.3 },
      { file: "monster_frames/3220000.png", x: 0.82, y: 0.9, h: 0.38 },
    ],
    idea: [
      "Turn the scene into a sunny harbor town by the sea: wooden docks, sailing ships, red-roofed houses, sparkling water.",
      "On the left a sick-looking character from the sprite resting on a bench, in the middle the character from the sprite holding a medicine recipe, keep both looks exactly like the sprites. On the right the big tree monster from the sprite, keep its look exactly like the sprite, in a forest edge behind the town.",
      "A young adventurer with short brown hair in a light tunic runs off with a bag of herbs. Warm, caring mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2065",
    base: { render: 101000000, crop: [360, 1700, 480, 270], fill: "#3f6b46" },
    sprites: [
      { file: "npcs/1032104.png", x: 0.26, y: 0.9, h: 0.3 },
      { file: "monster_frames/2130100.png", x: 0.74, y: 0.9, h: 0.24 },
    ],
    idea: [
      "Turn the scene into a deep magical forest with giant tree trunks, glowing mushrooms and an old dig site with fossil bones in the dirt.",
      "On the left the scholar from the sprite, keep the look exactly like the sprite, kneels brushing dirt off a fossil. On the right the dark axe-carrying tree stump monster from the sprite, keep its look exactly like the sprite.",
      "A young adventurer with short brown hair in a light tunic holds up a fossil fragment proudly. Curious, discovery mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2014",
    base: { render: 100000000, crop: [395, 0, 405, 228], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/1012003.png", x: 0.24, y: 0.9, h: 0.32 },
      { file: "npcs/1052000.png", x: 0.74, y: 0.9, h: 0.32 },
    ],
    idea: [
      "Turn the scene into a peaceful village of tall trees and tree houses at sunset.",
      "On the left the old village elder from the sprite, keep the look exactly like the sprite, frowns with arms folded. On the right the character from the sprite, keep the look exactly like the sprite, gestures earnestly asking for something.",
      "A young adventurer with short brown hair in a light tunic stands in the middle as a go-between, holding a letter. Calm, diplomatic mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2019",
    base: { render: 101020001, crop: [360, 2600, 480, 270], fill: "#3f6b46" },
    sprites: [
      { file: "npcs/1061004.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "monster_frames/5220002.png", x: 0.78, y: 0.9, h: 0.38 },
    ],
    idea: [
      "Turn the scene into a misty ancient forest with an old stone library ruin, a glowing mysterious book on a pedestal.",
      "On the left the robed character from the sprite, keep the look exactly like the sprite, points at the book. On the right the undead monkey king from the sprite, keep its look exactly like the sprite, lurks among ruins.",
      "A young adventurer with short brown hair in a light tunic reaches for the glowing book. Mysterious, adventurous mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2144",
    base: { render: 101030404, crop: [360, 600, 480, 270], fill: "#6b5a3a" },
    sprites: [
      { file: "npcs/1022006.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "monster_frames/3220000.png", x: 0.78, y: 0.9, h: 0.38 },
    ],
    idea: [
      "Turn the scene into a dusty excavation site between rocky cliffs and a forest, wooden scaffolds and crates.",
      "On the left the archaeologist from the sprite, keep the look exactly like the sprite, whispers behind a hand as if sharing a rumor. On the right the big tree monster from the sprite, keep its look exactly like the sprite.",
      "A young adventurer with short brown hair in a light tunic listens skeptically. Intriguing, investigative mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2222",
    base: { render: 910100000, crop: [360, 204, 480, 270], fill: "#2f2a3a" },
    sprites: [
      { file: "npcs/1040002.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "monster_frames/5300100.png", x: 0.76, y: 0.9, h: 0.36 },
    ],
    idea: [
      "Turn the scene into a dark haunted forest at dusk: twisted trees, purple fog, floating wisps of light.",
      "On the left the villager from the sprite, keep the look exactly like the sprite, holds a lantern nervously. On the right the witch from the sprite, keep the look exactly like the sprite, hovers casting a spell.",
      "A young adventurer with short brown hair in a light tunic steps forward with a raised weapon. Spooky but heroic mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2157",
    base: { render: 110040000, crop: [360, 282, 480, 270], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/1081100.png", x: 0.22, y: 0.9, h: 0.3 },
      { file: "monster_frames/5220000.png", x: 0.74, y: 0.9, h: 0.4 },
    ],
    idea: [
      "Turn the scene into a bright tropical beach: palm trees, white sand, turquoise waves, a small altar with offerings near the shore.",
      "On the left the islander from the sprite, keep the look exactly like the sprite, prays at the altar. On the right the giant hermit crab from the sprite, keep its look exactly like the sprite, rises from the waves.",
      "A young adventurer with short brown hair in a light tunic carries a basket of shells as an offering. Sunny, slightly mystical mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2213",
    base: { render: 107000300, crop: [360, 179, 480, 270], fill: "#3e4a36" },
    sprites: [
      { file: "npcs/1052002.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "monster_frames/6220000.png", x: 0.76, y: 0.9, h: 0.36 },
    ],
    idea: [
      "Turn the scene into a gloomy swamp at the edge of a dark city, rotting logs, murky water, a knocked-over trash can with papers spilling out.",
      "On the left the shady character from the sprite, keep the look exactly like the sprite, peeks from behind a wall holding a secret note. On the right the giant swamp crocodile from the sprite, keep its look exactly like the sprite, emerges from the water.",
      "A young adventurer with short brown hair in a light tunic reads the crumpled note, alarmed. Conspiratorial, tense mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-2000",
    base: { render: 102000000, crop: [360, 700, 480, 270], fill: "#8a6a4a" },
    sprites: [
      { file: "npcs/1020000.png", x: 0.26, y: 0.9, h: 0.32 },
      { file: "monster_frames/5130101.png", x: 0.76, y: 0.9, h: 0.38 },
    ],
    idea: [
      "Turn the scene into a rocky highland warrior village with a half-built wooden house, logs, stones and tools lying around.",
      "On the left the village chief from the sprite, keep the look exactly like the sprite, proudly points at the unfinished house. On the right the stone golem from the sprite, keep its look exactly like the sprite, lumbers nearby.",
      "A young adventurer with short brown hair in a light tunic carries a stack of building materials. Sturdy, hardworking, cheerful mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-3044",
    base: { render: 200000200, crop: [360, 700, 480, 270], fill: "#cfe6f7" },
    sprites: [
      { file: "npcs/2012018.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "monster_frames/4230105.png", x: 0.76, y: 0.9, h: 0.3 },
    ],
    idea: [
      "Turn the scene into a floating sky city garden above the clouds: white stone, flower beds, a jar of sweet golden syrup on a table.",
      "On the left the character from the sprite, keep the look exactly like the sprite, stirs a pot of syrup happily. On the right the man-eating flower monster from the sprite, keep its look exactly like the sprite, snaps at a bee.",
      "A young adventurer with short brown hair in a light tunic brings a handful of flower nectar. Sweet, bright mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-3086",
    base: { render: 200050001, crop: [160, 330, 480, 270], fill: "#cfe6f7" },
    sprites: [
      { file: "npcs/2032000.png", x: 0.24, y: 0.9, h: 0.3 },
      { file: "monster_frames/5120000.png", x: 0.74, y: 0.9, h: 0.3 },
    ],
    idea: [
      "Turn the scene into a quiet library tower above the clouds, tall bookshelves, a crystal ball glowing with a prophecy.",
      "On the left the assistant from the sprite, keep the look exactly like the sprite, holds a scroll. On the right the glowing sun fairy from the sprite, keep its look exactly like the sprite, floats near a window.",
      "A young adventurer with short brown hair in a light tunic gazes into the crystal ball. Mystical, calm mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-3000",
    base: { render: 211050000, crop: [360, 293, 480, 270], fill: "#dfeaf3" },
    sprites: [
      { file: "npcs/2030002.png", x: 0.26, y: 0.9, h: 0.3 },
      { file: "npcs/2030001.png", x: 0.72, y: 0.9, h: 0.3 },
    ],
    idea: [
      "Turn the scene into a snowy military outpost in icy mountains, a wooden watchtower, footprints leading into a blizzard.",
      "On the left the young soldier from the sprite, keep the look exactly like the sprite, salutes worriedly. On the right the officer from the sprite, keep the look exactly like the sprite, studies a map.",
      "A young adventurer with short brown hair in a warm cloak follows the footprints into the snow. Cold, determined search mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-3004",
    base: { render: 211000100, crop: [360, 49, 480, 270], fill: "#dfeaf3" },
    sprites: [
      { file: "npcs/2020005.png", x: 0.24, y: 0.9, h: 0.32 },
      { file: "monster_frames/7130200.png", x: 0.76, y: 0.9, h: 0.36 },
    ],
    idea: [
      "Turn the scene into a snowy mountain town with a warm-lit study full of ancient books, one huge old tome open with glowing pages.",
      "On the left the scholar from the sprite, keep the look exactly like the sprite, reads the ancient tome. On the right the werewolf from the sprite, keep its look exactly like the sprite, prowls outside in the snow.",
      "A young adventurer with short brown hair in a warm cloak carries a stack of old books. Epic, scholarly, long-journey mood.",
    ].join(" "),
  },
  {
    slug: "quest-line-3105",
    base: { render: 211040102, crop: [168, 600, 480, 270], fill: "#dfeaf3" },
    sprites: [
      { file: "npcs/2020012.png", x: 0.22, y: 0.9, h: 0.34 },
      { file: "monster_frames/8220001.png", x: 0.74, y: 0.9, h: 0.42 },
    ],
    idea: [
      "Turn the scene into a frozen snowfield under a pale sky, ice cliffs and drifting snow.",
      "On the left the snow spirit statue from the sprite, keep the look exactly like the sprite, glows faintly. On the right the huge furry snow beast from the sprite, keep its look exactly like the sprite, roars.",
      "A young adventurer with short brown hair in a warm cloak braces against the wind. Grand, wintry, epic mood.",
    ].join(" "),
  },
  {
    slug: "quests-maple-island",
    base: { render: 1010000, crop: [360, 59, 480, 270], fill: "#9fd3f0" },
    sprites: [
      { file: "npcs/12100.png", x: 0.2, y: 0.9, h: 0.26 },
      { file: "monster_frames/210100.png", x: 0.62, y: 0.9, h: 0.12 },
      { file: "monster_frames/1210102.png", x: 0.8, y: 0.9, h: 0.16 },
    ],
    idea: [
      "Turn the scene into a wide view of a small green starter island: grassy hills, a tiny village, a harbor with a boat waiting to sail to a bigger island.",
      "Keep the villager, the green slime and the little mushroom from the sprites, same look as the sprites.",
      "In the foreground a young beginner adventurer with short brown hair in a plain shirt holds a checklist scroll, looking at the boat. Bright, hopeful, beginning-of-journey mood.",
    ].join(" "),
  },
  {
    slug: "quests-el-nath",
    base: { render: 211000000, crop: [360, 57, 480, 270], fill: "#dfeaf3" },
    sprites: [
      { file: "npcs/2012010.png", x: 0.2, y: 0.9, h: 0.28 },
      { file: "monster_frames/5140000.png", x: 0.8, y: 0.9, h: 0.3 },
    ],
    idea: [
      "Turn the scene into a panoramic view combining a snowy mountain town on the right and a floating white sky city among clouds on the left, linked by a tall tower.",
      "Keep the housekeeper from the sprite on the left and the white wolf from the sprite on the right, same look as the sprites.",
      "In the foreground a young adventurer with short brown hair in a warm cloak holds a long quest list scroll. Grand, adventurous mood.",
    ].join(" "),
  },
  // v2.30 第三輪：其餘 11 條職業線配點（主角穿該職業的打扮，對面是那段等級常打的怪）
  {
    slug: "skill-build-berserker",
    base: { render: 102020000, crop: [360, 500, 480, 270], fill: "#8a6a4a" },
    sprites: [{ file: "monster_frames/5130101.png", x: 0.74, y: 0.9, h: 0.42 }],
    idea: [
      "Turn the scene into a rocky canyon with dust and broken boulders, warm afternoon light.",
      "On the right the stone golem from the sprite, keep its look exactly like the sprite, stomps forward.",
      "On the left a young fighter with short dark hair in red and steel armor swings a big two-handed sword in a wide arc, a red energy aura around the blade. Powerful, fierce mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-page",
    base: { render: 102000000, crop: [360, 700, 480, 270], fill: "#8a6a4a" },
    sprites: [{ file: "monster_frames/2230100.png", x: 0.74, y: 0.9, h: 0.3 }],
    idea: [
      "Turn the scene into a rocky highland at sunset with a stone fortress in the distance.",
      "On the right the fire one-eyed monster from the sprite, keep its look exactly like the sprite, breathes small flames.",
      "On the left a young knight with short light hair in white and silver armor holds a large blunt hammer and a shield, a cool icy glow on the weapon. Noble, steady mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-fire-poison-wizard",
    base: { render: 107000300, crop: [360, 179, 480, 270], fill: "#3e4a36" },
    sprites: [{ file: "monster_frames/3110100.png", x: 0.74, y: 0.9, h: 0.3 }],
    idea: [
      "Turn the scene into a murky swamp with dead trees, green poison mist and glowing embers.",
      "On the right the crocodile from the sprite, keep its look exactly like the sprite, snaps its jaws.",
      "On the left a young wizard with messy dark hair in a deep red robe raises a staff, casting a fireball while green poison mist curls around the crocodile. Intense, slightly unhinged confident grin.",
    ].join(" "),
  },
  {
    slug: "skill-build-ice-lightning-wizard",
    base: { render: 211040102, crop: [168, 600, 480, 270], fill: "#dfeaf3" },
    sprites: [{ file: "monster_frames/8220001.png", x: 0.74, y: 0.9, h: 0.42 }],
    idea: [
      "Turn the scene into a frozen snowfield with ice crystals and storm clouds above.",
      "On the right the huge furry snow beast from the sprite, keep its look exactly like the sprite, half frozen in ice.",
      "On the left a young wizard with silver hair in a blue and white robe holds up a staff, crackling lightning bolts striking down while ice spikes rise from the ground. Cool, electric, dramatic mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-priest",
    base: { backdrop: "ruins" },
    sprites: [{ file: "monster_frames/5220002.png", x: 0.74, y: 0.9, h: 0.42 }],
    idea: [
      "Turn the scene into ancient stone ruins at twilight with ivy and broken pillars.",
      "On the right the undead monkey king from the sprite, keep its look exactly like the sprite, recoils from holy light.",
      "On the left a young priest with soft light hair in a white and gold robe raises a staff, a warm golden healing light bursting outward. Holy, gentle but powerful mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-hunter",
    base: { backdrop: "monkey-forest" },
    sprites: [{ file: "monster_frames/4230101.png", x: 0.76, y: 0.9, h: 0.3 }],
    idea: [
      "Turn the scene into a lush jungle with tall trees, vines and sun rays.",
      "On the right the winged monkey from the sprite, keep its look exactly like the sprite, flutters in the branches.",
      "On the left a young archer with short brown hair in a green hooded tunic draws a longbow, an arrow glowing with light, calm focused eyes. Agile, sharp mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-crossbowman",
    base: { render: 211000100, crop: [360, 49, 480, 270], fill: "#dfeaf3" },
    sprites: [{ file: "monster_frames/5140000.png", x: 0.76, y: 0.9, h: 0.3 }],
    idea: [
      "Turn the scene into a snowy mountain slope with pine trees and falling snow.",
      "On the right the white wolf from the sprite, keep its look exactly like the sprite, lunges.",
      "On the left a young crossbow archer with dark hair in a brown leather coat and scarf aims a heavy crossbow, the bolt trailing frost. Precise, cool mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-assassin",
    base: { render: 107000300, crop: [360, 179, 480, 270], fill: "#3e4a36" },
    sprites: [{ file: "monster_frames/5130103.png", x: 0.74, y: 0.9, h: 0.3 }],
    idea: [
      "Turn the scene into a misty swamp at night with moonlight on the water.",
      "On the right the black crocodile from the sprite, keep its look exactly like the sprite, snarls.",
      "On the left a young assassin with dark hair in a black hooded outfit leaps in the air throwing a spread of glowing throwing stars. Swift, sharp mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-bandit",
    base: { backdrop: "canyon" },
    sprites: [{ file: "monster_frames/7130100.png", x: 0.74, y: 0.9, h: 0.42 }],
    idea: [
      "Turn the scene into a dusty canyon with tall red rock walls.",
      "On the right the huge horned bull-headed monster from the sprite, keep its look exactly like the sprite, swings its weapon.",
      "On the left a young thief with spiky hair in a dark vest and bandana dashes forward with a dagger, coins scattering in the air. Daring, roguish mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-brawler",
    base: { render: 110040000, crop: [360, 282, 480, 270], fill: "#9fd3f0" },
    sprites: [{ file: "monster_frames/5220000.png", x: 0.74, y: 0.9, h: 0.4 }],
    idea: [
      "Turn the scene into a bright tropical beach with palm trees and crashing waves.",
      "On the right the giant hermit crab from the sprite, keep its look exactly like the sprite, raises its claws.",
      "On the left a young pirate brawler with short hair in a sleeveless sailor outfit throws a powerful punch with knuckle gloves, a golden energy shockwave. Energetic, bold mood.",
    ].join(" "),
  },
  {
    slug: "skill-build-gunslinger",
    base: { backdrop: "beach" },
    sprites: [{ file: "monster_frames/4230104.png", x: 0.74, y: 0.9, h: 0.26 }],
    idea: [
      "Turn the scene into a sunny beach near a docked pirate ship.",
      "On the right the blue crab from the sprite, keep its look exactly like the sprite, scuttles sideways.",
      "On the left a young pirate gunslinger with a tricorn hat and long coat fires a pistol, bright muzzle flash and a trail of bullets. Cool, swashbuckling mood.",
    ].join(" "),
  },
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
    slug: "maple-leaf-weapon-jobs",
    base: { render: 100000000, crop: [795, 0, 405, 228], fill: "#9fd3f0" },
    sprites: [
      { file: "items/1432012.png", x: 0.16, y: 0.86, h: 0.3 },
      { file: "items/1472032.png", x: 0.34, y: 0.86, h: 0.2 },
      { file: "items/1452022.png", x: 0.5, y: 0.86, h: 0.28 },
      { file: "items/1482021.png", x: 0.66, y: 0.86, h: 0.2 },
      { file: "items/1382012.png", x: 0.84, y: 0.86, h: 0.3 },
    ],
    idea: [
      "Turn the scene into a bright autumn field outside a mushroom village, red and orange maple leaves swirling in the wind, clear blue sky with soft clouds.",
      "Five young adventurers of different classes stand side by side in heroic poses, each proudly holding one of the maple-leaf weapons from the sprites: a warrior in light armor with the long maple spear, a hooded thief with the maple claw on one hand, an archer with the maple bow drawn, a pirate with the maple knuckle raised as a fist, and a mage in a robe with the maple staff glowing. Keep each weapon recognizable like its sprite, made of red-orange maple leaf shapes with gold trim.",
      "Friendly competitive mood, like a team lineup comparing their new weapons.",
    ].join(" "),
  },
  {
    // v2.46 11/21 發佈會整理：冰原雪域通往廢棄礦坑、遠方殘暴炎魔、聖誕燈
    slug: "classic-roadmap-1121",
    base: { backdrop: "snow" },
    sprites: [{ file: "monster_frames/8800002.png", x: 0.78, y: 0.82, h: 0.5 }],
    idea: [
      "Turn the scene into a snowy mountain valley at dusk: a dark abandoned mine entrance in the cliff glowing with a red crack of light, a frozen path leading to it, deep blue sky with the first stars, small strings of warm Christmas lights on a wooden fence in the foreground.",
      "In the far right background a giant stone idol boss looms over the mountains: keep it instantly recognizable as the same creature as the sprite, a towering rock golem with a golden sun-ray crown, a carved stone face and big stone fists, same shape and colors.",
      "In the foreground a party of four young adventurers (a warrior with a sword, a mage with a staff, an archer with a bow, a thief with throwing stars) holding torches, looking toward the mine with excitement. Epic, anticipating, new-season mood.",
    ].join(" "),
  },
  {
    // v2.46 殘暴炎魔：熔岩祭壇、遠征隊
    slug: "zakum-1217",
    base: { backdrop: "cave" },
    sprites: [{ file: "monster_frames/8800002.png", x: 0.62, y: 0.9, h: 0.78 }],
    idea: [
      "Turn the scene into a huge underground lava altar: rivers of glowing orange lava, dark volcanic rock walls, embers floating in the hot air, a stone platform in the middle.",
      "The boss is a towering stone idol: keep it instantly recognizable as the same creature as the sprite, a rock golem body with a golden sun-ray crown, a carved stone face, stone fists and a dark red cape, same shape and colors. Add several extra stone arms raised around it.",
      "On the left a large expedition party of many small adventurers of different classes lined up on the rock ledge, weapons raised, a mage casting a glowing spell. Epic raid boss battle mood, dramatic lighting.",
    ].join(" "),
  },
  {
    // v2.46 昏暗坑道：礦坑、礦車、信號燈、提燈魔物
    slug: "dim-tunnel-pq",
    base: { backdrop: "cave" },
    sprites: [],
    idea: [
      "Turn the scene into a dim old mine tunnel: wooden support beams, rails with a rusty mine cart, scattered crates and barrels, glowing red ore crystals in the walls, a row of round signal lamps on a wooden board shining red, yellow and green.",
      "Four young adventurers (a warrior, a mage, an archer and a thief) walk carefully along the rails holding lanterns, one of them pushing the mine cart.",
      "Deep in the darkness at the right, a huge shadowy monster made of broken wooden planks and iron bands, carrying a glowing red lantern, opens its glowing red eyes. Tense but adventurous mood, warm lantern light against cold darkness.",
    ].join(" "),
  },
  {
    // v2.46 侵蝕地帶調查：雪地裡的紅色裂縫、三人隊
    slug: "erosion-zone",
    base: { backdrop: "snow" },
    sprites: [],
    idea: [
      "Turn the scene into a snowy cliff with frosty pine trees under a pale winter sky. On the right, a large round swirling rift portal glows deep crimson red and black, cracking the air around it.",
      "Out of the rift crawl a few familiar cute fantasy monsters covered in dark red smoke and glowing red eyes, as if corrupted.",
      "On the left stand exactly three young adventurers as a small party (a warrior with a shield, a mage with a staff, an archer with a bow) ready to fight. Mysterious, slightly dark but still bright and game-like mood.",
    ].join(" "),
  },
  {
    // v2.46 手機版 Beta：菇菇村屋頂上滑手機
    slug: "mobile-beta",
    base: { render: 100000000, crop: [795, 0, 405, 228], fill: "#9fd3f0" },
    sprites: [],
    idea: [
      "Turn the scene into a bright sunny mushroom village with mushroom-cap houses, green grass and fluffy clouds.",
      "A cheerful young adventurer with short brown hair sits on top of a big orange mushroom-cap roof, holding a smartphone in both hands and playing, the screen glowing softly on her smiling face (the screen shows only bright colors, no text).",
      "A small orange mushroom monster peeks curiously over her shoulder at the phone. Relaxed, cozy, play-anywhere mood.",
    ].join(" "),
  },
  {
    // v2.46 泰里送好禮：弓箭手村大樹下發禮物
    slug: "teri-gift-2026",
    base: { render: 100000000, crop: [795, 0, 405, 228], fill: "#9fd3f0" },
    sprites: [{ file: "items/2000005.png", x: 0.66, y: 0.86, h: 0.12 }],
    idea: [
      "Turn the scene into a warm autumn village square under a big tree, red and orange leaves, soft afternoon light, small festive ribbons hanging from the branches.",
      "On the right, a cute chubby hamster merchant with round glasses sits behind a big cloth sack overflowing with wrapped gift boxes, handing out a glowing purple potion vial and blue potion bottles like the sprite.",
      "On the left a happy young adventurer with short brown hair in a light tunic reaches out with both hands to receive the gifts, eyes sparkling. Generous, celebratory, cozy mood.",
    ].join(" "),
  },
  {
    slug: "update-1119",
    base: { render: 100000000, crop: [795, 0, 405, 228], fill: "#9fd3f0" },
    sprites: [],
    idea: [
      "Turn the scene into a festive mushroom village in early winter: light snow falling, red and orange maple leaves still on the trees, soft blue sky.",
      "In the middle stands a cute shop with a big round mirror and hair-styling chairs seen through its open front, a young adventurer with long silver hair tied to one side admiring her new hairstyle in the mirror.",
      "On the left, a young adventurer with white hair dressed in a white snow-angel outfit with small feathered wings and glittering snowflakes around him; on the right, a cheerful adventurer wearing a fluffy yellow baby-chick hat, followed by three tiny yellow chicks hopping on the snow.",
      "Bright, cozy, celebratory mood.",
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
