/**
 * build-gear.mjs 用的純函式：卷軸說明解析、掉落／任務來源、武器與卷軸組裝、研究檔格式轉換。
 * 抽出來是為了能單獨測（gear.test.mjs），風格跟 lib/guides.mjs 一致。
 */
import { CLASSIC_JOB_IDS } from "./classic-jobs.mjs";

/** GearWeapon.s／items.json 的 s 用的武器種類（src/lib 畫面與查資料頁也是這 16 種）。 */
export const WEAPON_TYPES = [
  "單手劍", "雙手劍", "單手斧", "雙手斧", "單手棍", "雙手棍", "槍", "矛",
  "短杖", "長杖", "弓", "弩", "拳套", "短刀", "指虎", "火槍",
];

/** 卷軸名字開頭認得的部位／武器種類；短劍→短刀、褲子→褲裙是卷軸說明跟道具種類用詞不一致，正規化成 items.json 的 s。 */
const SLOT_TOKENS = {
  手套: "手套", 披風: "披風", 套服: "套服", 上衣: "上衣",
  褲裙: "褲裙", 褲子: "褲裙", 鞋子: "鞋子", 耳環: "耳環", 頭盔: "頭盔", 盾牌: "盾牌",
  單手劍: "單手劍", 雙手劍: "雙手劍", 單手斧: "單手斧", 雙手斧: "雙手斧",
  單手棍: "單手棍", 雙手棍: "雙手棍", 槍: "槍", 矛: "矛",
  短杖: "短杖", 長杖: "長杖", 弓: "弓", 弩: "弩",
  拳套: "拳套", 短刀: "短刀", 短劍: "短刀", 指虎: "指虎", 火槍: "火槍",
};
const SLOT_TOKEN_RE = new RegExp(`^(${Object.keys(SLOT_TOKENS).sort((a, b) => b.length - a.length).join("|")})`);

/** stat 欄位的正規化：只有「敏捷性」這種跟六大主屬性同義但用字不同的才轉，其餘照名字（防禦、生命、跳躍…）。 */
const STAT_ALIASES = { 敏捷性: "敏捷" };

/** 卷軸名字格式：部位/武器種類＋屬性＋卷軸＋成功率%（結尾），例如「拳套攻擊卷軸60%」。 */
const SCROLL_NAME_RE = /^(.+?)卷軸\s*(\d+)\s*%\s*$/;

/** 說明文字裡「成功率：60%，」或「成功機率：60%、」這段，吃掉後剩下的就是效果描述。 */
const RATE_CLAUSE_RE = /成功(?:率|機率)\s*[:：]?\s*\d+\s*%\s*[,，、]?\s*/;

/** 效果描述裡失敗處罰那段（詛咒卷軸常有，少數非詛咒卷軸也有）不算進 effect。 */
const FAILURE_CLAUSE_RE = /#c|若?失敗/;

function extractEffect(desc) {
  const text = typeof desc === "string" ? desc : "";
  const match = text.match(RATE_CLAUSE_RE);
  const rest = match ? text.slice(match.index + match[0].length) : text;
  return rest.split(FAILURE_CLAUSE_RE)[0].trim().replace(/[。\s]+$/, "");
}

/**
 * 卷軸名字＋說明解析成結構化欄位。詛咒卷軸（會壞裝）跟不是「部位/武器種類＋屬性＋卷軸」格式的
 * （寵物、包包、週年慶活動名、企鵝國王的…、一級單手武器…這種沒有具體種類的）一律回 null，
 * 由呼叫端決定要不要收（這版不推詛咒卷軸；格式不對的本來就不該出現在武器/卷軸清單）。
 *
 * n 是「名字去掉成功率」，保留卷軸實際顯示的字（短劍不會改寫成短刀，褲子不會改寫成褲裙）；
 * slot／stat 是給程式比對用的正規化欄位。
 */
export function parseScroll(item) {
  const raw = typeof item?.n === "string" ? item.n.trim() : "";
  if (!raw || raw.includes("詛咒")) return null;
  const nameMatch = raw.match(SCROLL_NAME_RE);
  if (!nameMatch) return null;
  const [, body, rateText] = nameMatch;
  const slotMatch = body.match(SLOT_TOKEN_RE);
  if (!slotMatch) return null;
  const rawSlot = slotMatch[1];
  const statRaw = body.slice(rawSlot.length).replace(/\s+/g, "");
  if (!statRaw) return null;
  return {
    n: `${rawSlot}${statRaw}卷軸`,
    slot: SLOT_TOKENS[rawSlot],
    stat: STAT_ALIASES[statRaw] ?? statRaw,
    rate: Number(rateText),
    effect: extractEffect(item.d),
  };
}

/** 給 build-gear.mjs：從 maps.json 做一個「這張圖開放了嗎」的查詢函式，跟 build-guides.mjs 的 openMap 同一個判準（有中文名）。 */
export function openMapFrom(maps) {
  return mapId => {
    if (mapId == null) return null;
    const record = maps[String(mapId)];
    return record?.zh ? { id: Number(mapId), o: record.o } : null;
  };
}

/** 一隻怪的出沒地圖裡，挑一張已開放的來顯示；優先選非 V002 的，都沒有才退而求其次用 V002 的那張。 */
function pickOpenMap(mapIds, openMap) {
  let v002Fallback = null;
  for (const mapId of mapIds ?? []) {
    const open = openMap(mapId);
    if (!open) continue;
    if (!open.o) return open;
    v002Fallback ??= open;
  }
  return v002Fallback;
}

/**
 * 道具的掉落來源：只收出現在已開放地圖的怪，依怪物等級由低到高，最多 8 隻。
 * 怪物一隻都沒出現在已開放地圖（含 V002）就不收；只在 V002 地圖出現的帶 o。
 */
export function dropSources(item, monstersById, openMap) {
  const rows = [];
  for (const monsterId of item.dm ?? []) {
    const monster = monstersById.get(monsterId);
    if (!monster) continue;
    const picked = pickOpenMap(monster.maps, openMap);
    if (!picked) continue;
    rows.push({ m: monster.id, n: monster.n, lv: monster.lv ?? 0, map: picked.id, ...(picked.o ? { o: picked.o } : {}) });
  }
  rows.sort((a, b) => a.lv - b.lv);
  return rows.slice(0, 8);
}

/**
 * 鏡射 src/lib/jobs.ts 的 jobTier：第幾轉（0 初心者／不認得、1 一轉、2 二轉、3 三轉）。
 * pipeline 是純 node 腳本不能 import TypeScript（跟 classic-jobs.mjs 同樣的理由），數字規則手動保持一致。
 */
function jobTier(job) {
  if (job <= 0 || !CLASSIC_JOB_IDS.has(job)) return 0;
  if (job % 100 === 0) return 1;
  return job % 10 === 0 ? 2 : 3;
}

/**
 * 鏡射 src/lib/v002.ts 的 isV002Quest：任務是不是 V002 才有（等級限制超過 100、接取地圖是 V002 地圖、
 * 或可接職業全是三轉代碼）。同樣因為 pipeline 不能 import TypeScript，手動保持邏輯一致。
 */
export function isV002Quest(quest, maps) {
  if ((quest.minLv ?? 0) > 100) return true;
  const startMap = quest.sNpc?.map;
  if (startMap != null && maps[String(startMap)]?.o) return true;
  if (quest.jobs && quest.jobs.length > 0 && quest.jobs.every(job => jobTier(job) === 3)) return true;
  return false;
}

/**
 * 道具的任務來源：只收站內查得到的任務 id，V002 任務（鏡射 isV002Quest）帶 o，依需求等級排序。
 * items.json 的 qr 沒有跟著 quests.json 的放行範圍重新過濾過（任務可能因為等級上限、職業開放度被拿掉），
 * 所以查不到的 id 在這裡才會抓到，用 warn 列出來（跟 lib/guides.mjs 的 pqWindows 同樣的 warn callback 寫法）。
 */
export function questSources(item, questsById, maps, v002Date, warn = () => {}) {
  const rows = [];
  for (const questId of item.qr ?? []) {
    const quest = questsById.get(questId);
    if (!quest) {
      warn(`道具 ${item.n}（${item.id}）：任務 ${questId} 不在站內資料，略過`);
      continue;
    }
    // 接任務的 NPC 沒有名字或是亂碼（散發烈焰氣息的劍：「???? ?」）：遊戲裡找不到人接，不算拿得到
    if (quest.sNpc && (!quest.sNpc.n || quest.sNpc.n.includes("?"))) {
      warn(`道具 ${item.n}（${item.id}）：任務 ${quest.n}（${questId}）接任務的 NPC 沒有名字，略過`);
      continue;
    }
    // 接任務的 NPC 站在沒開放（沒中文名）的地圖：去不了（同 src/lib/route-planner.ts 的 questReachable）
    if (quest.sNpc && (quest.sNpc.map === undefined || !maps[String(quest.sNpc.map)]?.zh)) continue;
    const row = { id: quest.id, n: quest.n };
    // 要先解的前置任務等級更高時，用最高的那個（2115 本身 10 等，但要先解 30 等的 2109）
    const minLv = chainMinLv(quest, questsById);
    if (minLv) row.minLv = minLv;
    if (quest.maxLv) row.maxLv = quest.maxLv;
    if (v002Date && isV002Quest(quest, maps)) row.o = v002Date;
    // 任務限定職業、或這個獎勵只發給某些職業（弓攻擊卷軸只給弓箭手）：前端照玩家職業過濾，不推接不到的任務
    if (quest.jobs?.length) row.jobs = quest.jobs;
    const reward = (quest.rewardItems ?? []).find(entry => entry.id === item.id);
    if (reward?.job !== undefined) row.rj = reward.job;
    // 好幾樣獎勵抽一樣（珍的最後一個挑戰：60% 或 10% 隨機給一張），畫面要寫「隨機給」
    if (reward?.rand) row.rand = 1;
    rows.push(row);
  }
  rows.sort((a, b) => (a.minLv ?? 0) - (b.minLv ?? 0));
  return rows;
}

/** 這個任務連同一路上的前置任務，最高的需求等級；都沒寫回 0 */
function chainMinLv(quest, questsById, seen = new Set()) {
  if (seen.has(quest.id)) return 0;
  seen.add(quest.id);
  let level = quest.minLv ?? 0;
  for (const id of quest.pre ?? []) {
    const previous = questsById.get(id);
    if (previous) level = Math.max(level, chainMinLv(previous, questsById, seen));
  }
  return level;
}

/**
 * 道具的商店來源：照 items.json 的 sp 店家清單（pipeline/lib/shops.mjs 已經只留開放的地圖或有名字的城鎮）。
 * 商城（樂豆點）不算；店在 10/15 才開的城鎮（冰原雪域、天空之城）帶 o。現在就開的店排前面、再比便宜，最多 3 家。
 * 上游的 sh 是「幾筆販售資料」，連還沒開放的城鎮都算進去，不能拿來說「商店買得到」。
 */
export function shopSources(item, maps, v002Date) {
  const rows = [];
  const seen = new Set();
  for (const shop of item.sp ?? []) {
    if (shop.c) continue;
    const row = { p: shop.p };
    if (shop.n) row.n = shop.n;
    if (shop.m !== undefined) row.m = shop.m;
    row.pr = shop.pr;
    if (v002Date && shop.m !== undefined && maps[String(shop.m)]?.o) row.o = v002Date;
    const key = `${row.p}\u0000${row.n ?? ""}\u0000${row.pr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return sortShops(rows);
}

/** NPC 對話裡的合成（城鎮的工匠），0 轉技能「強化合成」（itemMake）是後期版本才有的，經典版沒有，不收 */
const CRAFT_KINDS = new Set(["npcDialog", "manualNpcDialog"]);

/**
 * 道具的合成來源（data/raw/artale.json 的 item.sources.crafts）：城鎮 NPC 合成，例如墮落城市的後街吉姆做狼牙
 * （台服經典版玩家拿狼牙就是靠合成，店都在還沒開的城鎮；2026-10-07 查證）。
 * NPC 站在開放地圖（有中文名）才算；只在 10/15 才開的地圖帶 o；還沒開放的城鎮不算。最多 2 筆，現在就開的排前面。
 */
export function craftSources(recipes, maps, v002Date) {
  const rows = [];
  const seen = new Set();
  for (const recipe of recipes ?? []) {
    if (!CRAFT_KINDS.has(recipe.sourceKind)) continue;
    let place = null;
    for (const npc of recipe.npcs ?? []) {
      for (const where of npc.maps ?? []) {
        const record = maps[String(where.id)];
        if (!record?.zh) continue;
        const candidate = { n: npc.name, m: where.id, later: Boolean(record.o) };
        if (!place || (place.later && !candidate.later)) place = candidate;
      }
    }
    if (!place) continue;
    const row = { n: place.n, m: place.m, mats: (recipe.materials ?? []).map(mat => ({ id: mat.id, n: mat.name, c: mat.count ?? 1 })) };
    if (recipe.meso) row.fee = recipe.meso;
    if (recipe.randomReward) row.rand = 1;
    if (v002Date && place.later) row.o = v002Date;
    const key = JSON.stringify([row.n, row.m, row.mats, row.fee]);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows.sort((a, b) => Number(Boolean(a.o)) - Number(Boolean(b.o))).slice(0, 2);
}

/** 現在就開的店排前面、再比便宜，最多 3 家 */
function sortShops(rows) {
  return rows.sort((a, b) => Number(Boolean(a.o)) - Number(Boolean(b.o)) || a.pr - b.pr).slice(0, 3);
}

/** 這個 GearSource 有沒有任何一種拿法（商店／掉落／任務）。沒有就是現在完全拿不到，不該收進清單。 */
export function hasAnySource(src) {
  return Boolean(src.shops?.length || src.crafts?.length || src.drops?.length || src.quests?.length);
}

/** 這個 GearSource 是不是「所有來源都要等 V002」：商店、掉落、任務全部帶 o（10/15 才開的城鎮的店也算） */
export function allSourcesV002(src) {
  const lists = [src.shops ?? [], src.crafts ?? [], src.drops ?? [], src.quests ?? []];
  if (lists.every(list => !list.length)) return false;
  return lists.every(list => list.every(entry => entry.o));
}

/** 組一個道具的 GearSource：哪幾家店賣、掉落怪、任務，沒有的欄位不給。 */
export function buildSource(item, ctx) {
  const { monstersById, questsById, maps, openMap, v002Date, craftsById, warn = () => {} } = ctx;
  const src = {};
  const shops = shopSources(item, maps, v002Date);
  if (shops.length) src.shops = shops;
  const crafts = craftSources(craftsById?.get(item.id), maps, v002Date);
  if (crafts.length) src.crafts = crafts;
  const drops = dropSources(item, monstersById, openMap);
  if (drops.length) src.drops = drops;
  const quests = questSources(item, questsById, maps, v002Date, warn);
  if (quests.length) src.quests = quests;
  return src;
}

/** 合併好幾筆 GearSource（同名同成功率的卷軸被拆成好幾個 id 時用）：掉落依怪物 id 去重、店家去重、任務依 id 去重。 */
export function mergeSources(list) {
  const src = {};
  const shopByKey = new Map();
  for (const entry of list) {
    for (const shop of entry.shops ?? []) {
      const key = `${shop.p}\u0000${shop.n ?? ""}\u0000${shop.pr}`;
      if (!shopByKey.has(key)) shopByKey.set(key, shop);
    }
  }
  if (shopByKey.size) src.shops = sortShops([...shopByKey.values()]);

  const craftByKey = new Map();
  for (const entry of list) {
    for (const craft of entry.crafts ?? []) {
      const key = JSON.stringify([craft.n, craft.m, craft.mats, craft.fee]);
      if (!craftByKey.has(key)) craftByKey.set(key, craft);
    }
  }
  if (craftByKey.size) src.crafts = [...craftByKey.values()].slice(0, 2);

  const dropByMonster = new Map();
  for (const entry of list) for (const drop of entry.drops ?? []) if (!dropByMonster.has(drop.m)) dropByMonster.set(drop.m, drop);
  if (dropByMonster.size) src.drops = [...dropByMonster.values()].sort((a, b) => a.lv - b.lv).slice(0, 8);

  const questById = new Map();
  for (const entry of list) for (const quest of entry.quests ?? []) if (!questById.has(quest.id)) questById.set(quest.id, quest);
  if (questById.size) src.quests = [...questById.values()];

  return src;
}

/**
 * 全部卷軸道具 → GearScroll[]。同名（去掉成功率）同成功率的好幾個 id 合併成一筆，
 * src 合併、id 取「拿得到的那個」裡最小的（有些舊 id 純粹是資料重複、完全沒有來源，不該被拿去當代表 id）。
 * 整組合併後還是完全沒有來源（常見於週年慶活動卷軸）就整筆不收。
 */
export function buildScrolls(items, ctx) {
  const groups = new Map();
  for (const item of items) {
    if (item.un) continue;
    const parsed = parseScroll(item);
    if (!parsed) continue;
    const key = `${parsed.n}\u0000${parsed.rate}`;
    const group = groups.get(key) ?? { parsed, entries: [] };
    group.entries.push({ id: item.id, src: buildSource(item, ctx) });
    groups.set(key, group);
  }

  const scrolls = [];
  for (const { parsed, entries } of groups.values()) {
    const obtainable = entries.filter(entry => hasAnySource(entry.src));
    if (!obtainable.length) continue;
    const id = Math.min(...obtainable.map(entry => entry.id));
    const src = mergeSources(entries.map(entry => entry.src));
    const scroll = { id, n: parsed.n, slot: parsed.slot, stat: parsed.stat, rate: parsed.rate, effect: parsed.effect, src };
    if (ctx.v002Date && allSourcesV002(src)) scroll.o = ctx.v002Date;
    scrolls.push(scroll);
  }
  return scrolls;
}

/** 道具的 reqSTR/DEX/INT/LUK → GearWeapon.req（只收有寫的，沒有一個就不給這個欄位）。 */
function buildReq(eq) {
  const req = {};
  for (const stat of ["STR", "DEX", "INT", "LUK"]) {
    const value = eq[`req${stat}`];
    if (value) req[stat] = value;
  }
  return Object.keys(req).length ? req : undefined;
}

/** 一件武器道具 → GearWeapon；完全沒有來源（拿不到）回 null，不編造玩家拿不到的裝備。 */
export function buildWeapon(item, ctx) {
  const src = buildSource(item, ctx);
  if (!hasAnySource(src)) return null;
  const eq = item.eq ?? {};
  const weapon = { id: item.id, n: item.n, s: item.s, lv: eq.reqLevel ?? 0 };
  if (eq.incPAD) weapon.atk = eq.incPAD;
  if (eq.incMAD) weapon.mag = eq.incMAD;
  if (eq.attackSpeed !== undefined) weapon.spd = eq.attackSpeed;
  const req = buildReq(eq);
  if (req) weapon.req = req;
  weapon.job = eq.reqJob ?? 0;
  if (eq.tuc) weapon.tuc = eq.tuc;
  weapon.src = src;
  if (ctx.v002Date && allSourcesV002(src)) weapon.o = ctx.v002Date;
  return weapon;
}

/* -------------------------------------------------------- 研究檔格式轉換 */

/** 研究檔 statRules（text／sources／verified）→ 畫面用的 StatRule（t／s／v）；研究檔沒有就回空陣列，不能失敗。 */
export function convertStatRules(researchRules) {
  return (researchRules ?? []).map(rule => ({
    jobs: rule.jobs, label: rule.label, main: rule.main, secondary: rule.secondary ?? null,
    // 這套點法用的武器種類（一轉盜賊「拳套需求」只看拳套、一轉海盜「指虎需求」只看指虎）；沒寫就照職業能用的全部
    ...(rule.weapons?.length ? { weapons: rule.weapons } : {}),
    // 卡片上方切換用的標籤字（盜賊「一般點法／全幸」、法師「全智／裝備法」）；主推跟另一套都寫了才會出現切換
    ...(rule.tab ? { tab: rule.tab } : {}),
    // 點法按鈕下那行白話說明（選中那套的好處跟代價，「全幸：前期打得比較痛，但敏捷要靠裝備湊」）
    ...(rule.tabText ? { tabText: rule.tabText } : {}),
    t: rule.text, s: rule.sources, v: rule.verified,
    mainstream: Boolean(rule.mainstream),
  }));
}

/** 研究檔 gearNotes（text／sources／verified）→ 畫面用的 GearNote（t／s／v）；items、tab 有才帶。 */
export function convertNotes(researchNotes) {
  return (researchNotes ?? []).map(note => ({
    jobs: note.jobs, topic: note.topic, t: note.text, s: note.sources, v: note.verified,
    ...(note.items?.length ? { items: note.items } : {}),
    // 只在這套點法出現的提醒（法師「裝備法」的全智轉換）；沒寫就每套都出現
    ...(note.tab ? { tab: note.tab } : {}),
  }));
}

/** 研究檔 beforeAdvancement（text／sources／verified）→ 畫面用的 before（t／s／v）；沒有就不給這個欄位。 */
export function convertBefore(before) {
  if (!before) return undefined;
  return { t: before.text, s: before.sources, v: before.verified };
}

/**
 * 研究檔 kit（這套點法要湊的裝備，全幸的敏捷裝）→ 畫面用的 GearKit[]。研究檔只寫道具 id 跟要衝的 100% 卷軸 id，
 * 點數、等級、需求、拿法都從遊戲資料算，不照抄攻略的數字：
 * 點數＝道具本身的這項屬性＋（有寫卷軸時）可衝次數 × 卷軸說明裡這項屬性加的點數（桑那服 10 次 × 套服敏捷卷軸 DEX+1＝10）。
 * 同一件有好幾個 id（藍色／紅色桑那服）合併成一件：名字用「／」接、拿法合併、數值看第一個 id。
 * 找不到道具、遊戲資料標成不收錄（un）的、完全拿不到、卷軸讀不出這項屬性、最後加不到點的，整件不收並警告（結婚戒指這類拿不到的不寫進畫面）。
 * 有寫卷軸時還要兩條都成立才收：卷軸成功率是 100（點數是「衝滿」算出來的，不是 100 的卷軸會失敗，畫面上的總點數就不準）、
 * 卷軸部位跟道具部位對得上（套服卷軸寫給帽子，是研究檔 id 寫錯，不能默默算成加得上）。
 */
export function buildKit(entries, stat, itemsById, ctx, warn = () => {}) {
  const kit = [];
  for (const entry of entries ?? []) {
    const ids = entry.items ?? [];
    const items = ids.map(id => itemsById.get(id)).filter(item => item && !item.un);
    if (!ids.length || items.length !== ids.length) {
      warn(`要湊的裝備 ${ids.join("、")}：遊戲資料找不到或標成不收錄，略過`);
      continue;
    }
    const name = items.map(item => item.n).join("／");
    const src = mergeSources(items.map(item => buildSource(item, ctx)));
    if (!hasAnySource(src)) {
      warn(`要湊的裝備 ${name}：沒有拿得到的來源，略過`);
      continue;
    }
    const eq = items[0].eq ?? {};
    let value = eq[`inc${stat}`] ?? 0;
    let scroll;
    if (entry.scroll !== undefined) {
      const scrollItem = itemsById.get(entry.scroll);
      const parsed = scrollItem ? parseScroll(scrollItem) : null;
      const per = parsed ? Number(new RegExp(`${stat}\\+(\\d+)`).exec(parsed.effect)?.[1] ?? 0) : 0;
      if (!parsed || !per || !eq.tuc) {
        warn(`要湊的裝備 ${name}：卷軸 ${entry.scroll} 讀不出 ${stat} 或這件不能衝卷，略過`);
        continue;
      }
      if (parsed.rate !== 100) {
        warn(`要湊的裝備 ${name}：卷軸 ${entry.scroll} 成功率 ${parsed.rate}%，不是 100%，衝滿的點數算不準，略過`);
        continue;
      }
      if (parsed.slot !== items[0].s) {
        warn(`要湊的裝備 ${name}（${items[0].s}）：卷軸 ${entry.scroll} 是${parsed.slot}卷軸，部位對不上，略過`);
        continue;
      }
      value += eq.tuc * per;
      scroll = { id: scrollItem.id, n: parsed.n, slot: parsed.slot, stat: parsed.stat, rate: parsed.rate, times: eq.tuc };
    }
    if (!value) {
      warn(`要湊的裝備 ${name}：加不到 ${stat}，略過`);
      continue;
    }
    const piece = { ids, n: name, slot: items[0].s, lv: eq.reqLevel ?? 0, stat, v: value };
    const req = buildReq(eq);
    if (req) piece.req = req;
    if (scroll) piece.scroll = scroll;
    piece.src = src;
    if (ctx.v002Date && allSourcesV002(src)) piece.o = ctx.v002Date;
    kit.push(piece);
  }
  return kit;
}
