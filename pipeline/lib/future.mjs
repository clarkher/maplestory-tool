/**
 * 未來視（/future）的材料清單：沒開放城鎮的配方要什麼、四轉任務線要什麼，哪些現在就拿得到。
 * 規格：docs/superpowers/specs/2026-11-06-future-view-design.md
 */

/** 還沒開放的城鎮：配方組別名「玩具城：武器製作」冒號前面是這幾個才算。開放了就從這裡拿掉 */
export const CLOSED_CRAFT_TOWNS = ["玩具城", "神木村", "武陵"];

/** 現在就能找 NPC 合成的城鎮。「0 轉技能『強化合成』」不是 NPC，不算 */
export const OPEN_CRAFT_TOWNS = ["勇士之村", "魔法森林", "鯨魚號", "弓箭手村", "墮落城市", "天空之城", "冰原雪域", "流浪煉金術師"];

const CRAFT_KINDS = new Set(["npcDialog", "manualNpcDialog"]);
/** 製作材料是 4xxxxxx；手套這類拿舊裝備升級的底材不算材料 */
const isMaterialId = id => id >= 4000000 && id < 5000000;
const unnamed = name => !name || name.startsWith("未命名");
const townOf = groupLabel => String(groupLabel ?? "").split("：")[0];

/** 一件道具現在怎麼拿：已開放的怪（站上 dm）、不限時的楓幣店（站上 sp）、已開放城鎮的合成 */
export function howToGet(item, { monsters, craftTowns = [] }) {
  const out = [];
  const byId = new Map(monsters.map(monster => [monster.id, monster]));
  const mobs = (item.dm ?? []).map(id => byId.get(id)).filter(Boolean).sort((a, b) => (a.lv ?? 0) - (b.lv ?? 0));
  if (mobs.length) {
    const shown = mobs.slice(0, 2);
    const more = mobs.length > 2 ? `等 ${mobs.length} 種怪` : "";
    out.push({ kind: "mob", text: `打${shown.map(mob => mob.n).join("、")}${more}`, ids: shown.map(mob => mob.id) });
  }
  const shop = (item.sp ?? []).find(row => !row.u && !row.e && !row.c);
  if (shop) out.push({ kind: "shop", text: `${shop.n ?? shop.p}賣 ${shop.pr.toLocaleString("en-US")} 楓幣` });
  const town = craftTowns.find(name => OPEN_CRAFT_TOWNS.includes(name));
  if (town) out.push({ kind: "craft", text: `${town}合成` });
  return out;
}

/** 道具 id → 能做出它的城鎮（站上資料沒有配方，配方看上游） */
function craftTownsById(rawItems) {
  const towns = new Map();
  for (const item of rawItems) {
    for (const craft of item.sources?.crafts ?? []) {
      if (!CRAFT_KINDS.has(craft.sourceKind)) continue;
      const id = Number(craft.primaryOutput?.id);
      if (id !== Number(item.id)) continue;
      towns.set(id, [...new Set([...(towns.get(id) ?? []), townOf(craft.groupLabel)])]);
    }
  }
  return towns;
}

/**
 * 沒開放城鎮的配方用到哪些材料。同一個配方會掛在成品跟每個材料底下，用 recipeId 去重。
 * now：現在拿得到，照配方數排；notNow：只能等開放（拿來寫「現在囤也沒用」）。
 */
export function closedCraftMaterials(rawItems, siteItems, monsters) {
  const recipes = new Map();
  for (const item of rawItems) {
    for (const craft of item.sources?.crafts ?? []) {
      if (CRAFT_KINDS.has(craft.sourceKind) && CLOSED_CRAFT_TOWNS.includes(townOf(craft.groupLabel))) recipes.set(craft.recipeId, craft);
    }
  }
  const counts = new Map();
  for (const craft of recipes.values()) {
    for (const material of new Set((craft.materials ?? []).map(row => Number(row.id)))) {
      const entry = counts.get(material) ?? { recipes: 0, towns: new Set() };
      entry.recipes += 1;
      entry.towns.add(townOf(craft.groupLabel));
      counts.set(material, entry);
    }
  }
  const siteById = new Map(siteItems.map(item => [item.id, item]));
  const craftTowns = craftTownsById(rawItems);
  const now = [];
  const notNow = [];
  for (const [id, entry] of counts) {
    const item = siteById.get(id);
    if (!isMaterialId(id) || !item || unnamed(item.n)) continue;
    const row = { id, n: item.n, recipes: entry.recipes, towns: [...entry.towns] };
    const how = howToGet(item, { monsters, craftTowns: craftTowns.get(id) });
    if (how.length) now.push({ ...row, how });
    else notNow.push(row);
  }
  const byCount = (a, b) => b.recipes - a.recipes || a.id - b.id;
  return { now: now.sort(byCount), notNow: notNow.sort(byCount) };
}

/** 從舊客戶端的任務表留下四轉任務線（6100～6999，6800 那條 200 等的不算）。只跑一次，輸出進版控 */
export function snapshotFourthJob(quests) {
  return quests
    .filter(quest => /^6[1-9]\d\d$/.test(String(quest.id)) && String(quest.id) !== "6800" && (quest.startRequirements?.jobs ?? []).length)
    .map(quest => ({
      id: String(quest.id),
      n: quest.name,
      jobs: quest.startRequirements.jobs,
      items: (quest.completeRequirements?.items ?? [])
        .filter(row => (row.count ?? 0) > 0)
        .map(row => ({ id: Number(row.id), n: row.name, c: row.count })),
    }));
}

/** 冒險家三轉、四轉才算（結尾 1、2 的三位數）；三轉接的任務線算進四轉 */
const fourthOf = job => (job < 1000 && job % 10 === 2 ? job : job < 1000 && job % 10 === 1 ? job + 1 : null);

/** 每個四轉職業：現在拿得到的材料（同道具加總）跟要等開放的。未命名道具不列 */
export function fourthJobNeeds(snapshot, siteItems, monsters, rawItems = []) {
  const siteById = new Map(siteItems.map(item => [item.id, item]));
  const craftTowns = craftTownsById(rawItems);
  const jobs = {};
  for (const quest of snapshot) {
    for (const job of new Set(quest.jobs.map(fourthOf).filter(Boolean))) {
      const bucket = (jobs[job] ??= new Map());
      for (const row of quest.items) {
        const entry = bucket.get(row.id) ?? { id: row.id, n: row.n, c: 0, quests: [] };
        entry.c += row.c;
        if (!entry.quests.includes(quest.n)) entry.quests.push(quest.n);
        bucket.set(row.id, entry);
      }
    }
  }
  const out = {};
  for (const [job, bucket] of Object.entries(jobs)) {
    const now = [];
    const later = [];
    for (const entry of bucket.values()) {
      if (unnamed(entry.n)) continue;
      const item = siteById.get(entry.id);
      const how = item ? howToGet(item, { monsters, craftTowns: craftTowns.get(entry.id) }) : [];
      if (how.length) now.push({ ...entry, how });
      else later.push(entry);
    }
    out[job] = { now, later };
  }
  return out;
}
