/**
 * build-guides.mjs 用的純函式：攻略文字檢查、組隊任務等級範圍、關鍵獎勵驗證。
 * 抽出來是為了能單獨測（guides.test.mjs）。
 */

/** 攻略文字裡不該上畫面的內部筆記。label 是 build 失敗時印給人看的原因。 */
export const LINT_RULES = [
  { re: /\d{7,}/, label: "地圖／道具編號" },
  // 站內資料檔名、欄位名，以及研究檔自己的欄位名（「見 notWorth」是給整理的人看的指標）
  { re: /mapId|monsters\.json|quests\.json|items\.json|站內|notOpenYet|notWorth|mustDo|unresolved/, label: "站內資料的內部用語" },
  // 怪物屬性的鍵（pipeline/lib/elemental.mjs 的 ELEMENT_KEY），多了新屬性這裡也要補
  { re: /\bel\s*[{=]?\s*[fiklphd]\s*:/, label: "屬性代碼" },
  // 小寫字母開頭、帶 3 位以上數字的英數串，數字後面接字母、中間有大寫也算（gappyhay493、w851228w）；
  // Lv100、MP100、V001、AP295 是大寫開頭不算
  { re: /(?<![A-Za-z0-9_])[a-z][A-Za-z0-9_]*\d{3,}[A-Za-z0-9_]*/, label: "玩家 ID" },
  // 英數暱稱當署名接冒號（HSZERO：、uranus7：）；網址開頭、全大寫加數字的段落／版本標記（PART1：、V001：）不算
  { re: /(?<![A-Za-z0-9_.])(?!https?:|[A-Z]+\d+[：:])[A-Za-z][A-Za-z0-9_]{3,}[：:]/, label: "玩家署名" },
  // 網址放出處欄位（sources），會上畫面的文字裡不留一串網址
  { re: /https?:\/\//, label: "網址" },
];

export function lintText(text) {
  if (typeof text !== "string") return [];
  const issues = [];
  for (const rule of LINT_RULES) {
    const match = text.match(rule.re);
    if (match) issues.push({ label: rule.label, match: match[0] });
  }
  return issues;
}

/** 不會上畫面的欄位（出處、研究備註、id）不檢查 */
const HIDDEN_KEYS = new Set([
  "sources", "s", "source", "url", "sourcesRead", "unresolved", "sourceExpNote", "needs", "mapId", "questId", "chain", "skillId", "id",
  "relatedQuestIds", "siteDataVersion", "game", "scope", "items", "entrance", "guide", "match", "key",
]);

/**
 * note 要看掛在哪：技能點法每一步的 note 會畫在技能條的完整順序裡，要檢查；
 * 練功段落、整條點法、升級表衝突值上的 note 是研究備註，build 不輸出或輸出了也不畫，不檢查。
 */
const RENDERED_NOTE_AT = /(^|\.)steps\[\d+\]$/;

function hiddenKey(key, where) {
  if (HIDDEN_KEYS.has(key)) return true;
  return key === "note" && !RENDERED_NOTE_AT.test(where);
}

export function lintResearch(value, where = "", issues = []) {
  if (typeof value === "string") {
    for (const issue of lintText(value)) issues.push({ where, ...issue });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => lintResearch(item, `${where}[${index}]`, issues));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!hiddenKey(key, where)) lintResearch(item, where ? `${where}.${key}` : key, issues);
    }
  }
  return issues;
}

/** 這個練功段落是哪個組隊任務；只看組隊段落，同時提到兩個時算清單裡先出現的 */
export function pqKeyOf(pqList, segment) {
  if (segment.kind !== "party") return undefined;
  return pqList.find(pq => new RegExp(pq.match).test(segment.name))?.key;
}

/**
 * 每個職業打各組隊任務的等級範圍，從攻略的組隊段落整理，再裁進遊戲的等級限制。
 * 研究檔抄錯一個數字就會變成主推大卡（超綠寫到 35 等，遊戲 30 等以上就進不去），所以以遊戲資料為準：
 * 範圍裁進任務的 [minLv, maxLv]（沒有上限用 levelCap），裁完變空的整筆拿掉，每一筆都列警告。
 * trainByJob: Map<jobId, Array<{ from, to, kind, name }>>
 * quests: Map<任務 id, { minLv?, maxLv? }>，對應 pq.json 每筆的 quest
 * guide（懶人包圖解）跟 why（大卡上的一句說明）研究檔有才帶。
 */
export function pqWindows(pqList, trainByJob, { quests = new Map(), levelCap = Infinity, warn = () => {} } = {}) {
  const result = pqList.map(pq => ({
    key: pq.key, name: pq.name, quest: pq.quest, entrance: pq.entrance,
    ...(pq.guide ? { guide: pq.guide } : {}),
    ...(pq.why ? { why: pq.why } : {}),
    byJob: {},
  }));
  for (const [job, segments] of trainByJob) {
    for (const segment of segments) {
      const key = pqKeyOf(pqList, segment);
      if (!key) continue;
      const entry = result.find(pq => pq.key === key);
      const window = entry.byJob[job];
      entry.byJob[job] = window ? [Math.min(window[0], segment.from), Math.max(window[1], segment.to)] : [segment.from, segment.to];
    }
  }
  for (const [index, pq] of pqList.entries()) {
    const limit = quests.get(String(pq.quest)) ?? {};
    const low = limit.minLv ?? 1;
    const high = limit.maxLv ?? levelCap;
    const { byJob } = result[index];
    for (const [job, [from, to]] of Object.entries(byJob)) {
      const clipped = [Math.max(from, low), Math.min(to, high)];
      if (clipped[0] === from && clipped[1] === to) continue;
      if (clipped[0] > clipped[1]) {
        delete byJob[job];
        warn(`組隊任務「${pq.name}」：職業 ${job} 的範圍 ${from}–${to} 整段在遊戲限制 ${low}–${high} 外，拿掉`);
      } else {
        byJob[job] = clipped;
        warn(`組隊任務「${pq.name}」：職業 ${job} 的範圍 ${from}–${to} 超出遊戲限制，裁成 ${clipped[0]}–${clipped[1]}`);
      }
    }
  }
  return result;
}

/**
 * 地圖 → 出的怪，給 mobsNotOnRow／rowTextIssues 對照：{ maps: { 地圖 id: { zh, mobs: [怪 id] } }, mobs: { 怪 id: 名字 } }。
 * 出怪看 monsters.json 的 sp（台服客戶端，客戶端沒有才是 v83，build.mjs 的 mergeSpawns）；
 * sp 整個沒有的怪（樹妖王這類首領）才看 maps（上游宣告它出在哪）。沒中文名的圖玩家去不了，不收。
 */
export function spawnTable(maps, monsterList) {
  const table = { maps: {}, mobs: {} };
  for (const monster of monsterList) {
    const where = monster.sp?.length ? monster.sp.map(([map]) => map) : monster.maps ?? [];
    for (const map of new Set(where)) {
      const zh = maps[String(map)]?.zh;
      if (!zh) continue;
      (table.maps[map] ??= { zh, mobs: [] }).mobs.push(monster.id);
      table.mobs[monster.id] = monster.n;
    }
  }
  return table;
}

const ROMAN = { I: "Ⅰ", II: "Ⅱ", III: "Ⅲ", IV: "Ⅳ", V: "Ⅴ", VI: "Ⅵ", VII: "Ⅶ", VIII: "Ⅷ", IX: "Ⅸ" };
const NUMERALS = "ⅠⅡⅢⅣⅤⅥⅦⅧⅨ";

/** 森林迷宮III 跟森林迷宮Ⅲ 算同一個字；「火焰之地（Ⅰ／Ⅴ）」「火焰之地Ⅰ／Ⅴ」「沼澤地Ⅰ～Ⅲ」展開成每張圖的全名 */
function normalizeMapText(text) {
  const series = (base, list) => list.map(numeral => base + numeral).join("／");
  return String(text)
    .replace(/(?<![A-Za-z0-9])[IVX]+(?![A-Za-z0-9])/g, roman => ROMAN[roman] ?? roman)
    .replace(/([\u4e00-\u9fff]+)（([Ⅰ-Ⅸ](?:／[Ⅰ-Ⅸ])+)）/g, (_, base, list) => series(base, list.split("／")))
    .replace(/([\u4e00-\u9fff]+)([Ⅰ-Ⅸ])[～~]([Ⅰ-Ⅸ])/g, (_, base, from, to) => series(base, [...NUMERALS.slice(NUMERALS.indexOf(from), NUMERALS.indexOf(to) + 1)]))
    .replace(/([\u4e00-\u9fff]+)([Ⅰ-Ⅸ](?:／[Ⅰ-Ⅸ])+)/g, (_, base, list) => series(base, list.split("／")));
}

/** 正規化後的地圖名 → 地圖 id（同名的圖不只一張），長的在前：「猴子沼澤地Ⅲ」不能被認成「沼澤地Ⅲ」 */
function mapNameIndex(table) {
  const index = new Map();
  for (const [id, { zh }] of Object.entries(table.maps)) {
    const name = normalizeMapText(zh);
    index.set(name, [...(index.get(name) ?? []), id]);
  }
  return new Map([...index].sort(([a], [b]) => b.length - a.length));
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 這段文字寫到哪幾張圖（地圖 id 字串）。名字比對是逐字的，「地鐵一號線」這種簡寫不算 */
export function mapsNamedIn(text, table) {
  const ids = [];
  let rest = normalizeMapText(text);
  for (const [name, mapIds] of mapNameIndex(table)) {
    if (!rest.includes(name)) continue;
    ids.push(...mapIds);
    rest = rest.split(name).join("＿");
  }
  return ids;
}

/**
 * 練功列（{ name, map, mobs, pq }）寫的怪，哪些不在這張圖、也不在這列寫到的其他圖 → 回傳那些怪的 id。
 * 例：龍族狩獵場 寫青龍、土龍，台服只出青龍；森林迷宮IV 寫石巨人、黑曜石巨人，台服只出黑曜石巨人。
 * 不判斷的列：沒有地圖（map 是 null，沒講在哪打）、組隊任務（關卡裡的怪是任務叫出來的，刷怪表沒有）、寫到的圖都沒有出怪資料。
 */
export function mobsNotOnRow(row, table) {
  if (!row.map || row.pq) return [];
  const here = new Set();
  for (const id of [String(row.map), ...mapsNamedIn(row.name, table)]) {
    for (const mob of table.maps[id]?.mobs ?? []) here.add(mob);
  }
  if (!here.size) return [];
  return row.mobs.filter(id => !here.has(id));
}

/** 一段字裡提到哪些怪（長的名字先比，「黑鱷魚」不會多算一隻「鱷魚」）；後面接「系」是整類（石巨人系＝名字有石巨人的都算） */
function mobClaims(claim, table) {
  const names = [...new Set(Object.values(table.mobs))].filter(Boolean).sort((a, b) => b.length - a.length);
  const found = [];
  let rest = claim;
  for (const name of names) {
    if (!rest.includes(name)) continue;
    found.push({ name, family: rest.includes(`${name}系`) });
    rest = rest.split(name).join("＿");
  }
  return found;
}

/**
 * 練功列文字裡「地圖名接怪名」的寫法對不對得上出怪，回傳問題清單（字串）。
 * 認的寫法：名稱的「地圖（怪）」「地圖 怪」、說明的「地圖（怪）」；幾張圖用／連著共用一組怪時，每張圖都要出得到其中一隻、每隻都要有一張圖出。
 * 說明內文順口提到的（「鱷魚潭Ⅱ 經驗遠比石巨人高」）不是在講這張圖有什麼，不抓；這也是為什麼不比整句。
 */
export function rowTextIssues(row, table) {
  const index = mapNameIndex(table);
  if (!index.size) return [];
  const names = [...index.keys()].map(escapeRegExp).join("|");
  const issues = [];
  const scan = (text, label, tail) => {
    const pattern = new RegExp(`((?:${names})(?:／(?:${names}))*)${tail}`, "g");
    for (const match of normalizeMapText(text).matchAll(pattern)) {
      const claims = mobClaims(match.slice(2).find(Boolean) ?? "", table);
      if (!claims.length) continue;
      const spawnsOf = name => new Set((index.get(name) ?? []).flatMap(id => table.maps[id].mobs.map(mob => table.mobs[mob])));
      const matches = (claim, spawned) => (claim.family ? [...spawned].some(name => name.includes(claim.name)) : spawned.has(claim.name));
      const groupMaps = match[1].split("／");
      for (const name of groupMaps) {
        if (!claims.some(claim => matches(claim, spawnsOf(name)))) issues.push(`${label}「${match[0]}」：${name}不出${claims.map(claim => claim.name).join("、")}`);
      }
      for (const claim of claims) {
        if (!groupMaps.some(name => matches(claim, spawnsOf(name)))) issues.push(`${label}「${match[0]}」：${groupMaps.join("、")}不出${claim.name}`);
      }
    }
  };
  scan(row.name ?? "", "名稱", "(?:（([^）]*)）|\\s+([^；。（]*))");
  scan(row.why ?? "", "說明", "（([^）]*)）");
  return [...new Set(issues)];
}

/** 關鍵獎勵：label 必填；items 只留站內有的道具 id，其餘回報；permanent（永久有用、不會過期）照帶。questName 只用在錯誤訊息 */
export function normalizeReward(raw, itemIds, questName = "") {
  if (!raw) return { reward: undefined, dropped: [] };
  if (!raw.label) throw new Error(`${questName ? `必解「${questName}」的 ` : ""}reward 缺 label`);
  const all = raw.items || [];
  return {
    reward: { label: raw.label, items: all.filter(id => itemIds.has(id)), ...(raw.permanent ? { permanent: true } : {}) },
    dropped: all.filter(id => !itemIds.has(id)),
  };
}

/** 三轉的等級：官方 10/15 公告 70 等（跟 src/lib/jobs.ts THIRD_JOB_LEVEL 同一個數字） */
export const THIRD_JOB_LEVEL = 70;

/**
 * 三轉（111、211…）的攻略檔補上二轉 70 等以上的練功段與無攻略段：
 * 那些是台服玩家在 V001 用二轉打出來的經驗，V002 起那個等級的人都是三轉。
 */
export function inheritParentTrain(outputs) {
  for (const output of outputs.values()) {
    if (output.job % 10 === 0) continue;
    const parent = outputs.get(`${output.job - (output.job % 10)}.json`);
    if (!parent) continue;
    output.train = [...output.train, ...parent.train.filter(segment => segment.to >= THIRD_JOB_LEVEL)];
    output.gaps = [...output.gaps, ...parent.gaps.filter(gap => gap.to >= THIRD_JOB_LEVEL)];
  }
}
