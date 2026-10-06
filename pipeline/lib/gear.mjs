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
    const row = { id: quest.id, n: quest.n };
    if (quest.minLv) row.minLv = quest.minLv;
    if (v002Date && isV002Quest(quest, maps)) row.o = v002Date;
    // 任務限定職業、或這個獎勵只發給某些職業（弓攻擊卷軸只給弓箭手）：前端照玩家職業過濾，不推接不到的任務
    if (quest.jobs?.length) row.jobs = quest.jobs;
    const reward = (quest.rewardItems ?? []).find(entry => entry.id === item.id);
    if (reward?.job !== undefined) row.rj = reward.job;
    rows.push(row);
  }
  rows.sort((a, b) => (a.minLv ?? 0) - (b.minLv ?? 0));
  return rows;
}

/** 這個 GearSource 有沒有任何一種拿法（商店／掉落／任務）。沒有就是現在完全拿不到，不該收進清單。 */
export function hasAnySource(src) {
  return Boolean(src.shop || src.drops?.length || src.quests?.length);
}

/** 這個 GearSource 是不是「所有來源都要等 V002」：有商店賣就不算（商店隨時買得到）；掉落跟任務要全部帶 o。 */
export function allSourcesV002(src) {
  if (src.shop) return false;
  const drops = src.drops ?? [];
  const quests = src.quests ?? [];
  if (!drops.length && !quests.length) return false;
  return drops.every(drop => drop.o) && quests.every(quest => quest.o);
}

/** 組一個道具的 GearSource：商店賣幾間、掉落怪、任務，沒有的欄位不給。 */
export function buildSource(item, ctx) {
  const { monstersById, questsById, maps, openMap, v002Date, warn = () => {} } = ctx;
  const src = {};
  if (item.sh) src.shop = item.sh;
  const drops = dropSources(item, monstersById, openMap);
  if (drops.length) src.drops = drops;
  const quests = questSources(item, questsById, maps, v002Date, warn);
  if (quests.length) src.quests = quests;
  return src;
}

/** 合併好幾筆 GearSource（同名同成功率的卷軸被拆成好幾個 id 時用）：掉落依怪物 id 去重、商店取最大、任務依 id 去重。 */
export function mergeSources(list) {
  const src = {};
  const shops = list.map(entry => entry.shop).filter(Boolean);
  if (shops.length) src.shop = Math.max(...shops);

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
    t: rule.text, s: rule.sources, v: rule.verified,
    mainstream: Boolean(rule.mainstream),
  }));
}

/** 研究檔 gearNotes（text／sources／verified）→ 畫面用的 GearNote（t／s／v）；items 有才帶。 */
export function convertNotes(researchNotes) {
  return (researchNotes ?? []).map(note => ({
    jobs: note.jobs, topic: note.topic, t: note.text, s: note.sources, v: note.verified,
    ...(note.items?.length ? { items: note.items } : {}),
  }));
}

/** 研究檔 beforeAdvancement（text／sources／verified）→ 畫面用的 before（t／s／v）；沒有就不給這個欄位。 */
export function convertBefore(before) {
  if (!before) return undefined;
  return { t: before.text, s: before.sources, v: before.verified };
}
