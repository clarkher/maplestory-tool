/**
 * build-guides.mjs 用的純函式：攻略文字檢查、組隊任務等級範圍、關鍵獎勵驗證。
 * 抽出來是為了能單獨測（guides.test.mjs）。
 */

/** 攻略文字裡不該上畫面的內部筆記。label 是 build 失敗時印給人看的原因。 */
export const LINT_RULES = [
  { re: /\d{7,}/, label: "地圖／道具編號" },
  { re: /mapId|monsters\.json|quests\.json|items\.json|站內/, label: "站內資料的內部用語" },
  { re: /\bel\s*[{=]?\s*[fiklph]\s*:/, label: "屬性代碼" },
  // 小寫字母開頭、後面帶 3 位以上數字的英數串（gappyhay493、a20017428）；Lv100、MP100、V001 是大寫開頭不算
  { re: /\b[a-z][a-z0-9_]*\d{3,}\b/, label: "玩家 ID" },
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
  "sources", "s", "sourcesRead", "unresolved", "note", "sourceExpNote", "needs", "mapId", "questId", "chain", "skillId", "id",
  "relatedQuestIds", "siteDataVersion", "game", "scope", "items", "entrance", "guide", "match", "key",
]);

export function lintResearch(value, where = "", issues = []) {
  if (typeof value === "string") {
    for (const issue of lintText(value)) issues.push({ where, ...issue });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => lintResearch(item, `${where}[${index}]`, issues));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!HIDDEN_KEYS.has(key)) lintResearch(item, where ? `${where}.${key}` : key, issues);
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
 * 每個職業打各組隊任務的等級範圍，從攻略的組隊段落整理。
 * trainByJob: Map<jobId, Array<{ from, to, kind, name }>>
 */
export function pqWindows(pqList, trainByJob) {
  const result = pqList.map(pq => ({ key: pq.key, name: pq.name, entrance: pq.entrance, guide: pq.guide, byJob: {} }));
  for (const [job, segments] of trainByJob) {
    for (const segment of segments) {
      const key = pqKeyOf(pqList, segment);
      if (!key) continue;
      const entry = result.find(pq => pq.key === key);
      const window = entry.byJob[job];
      entry.byJob[job] = window ? [Math.min(window[0], segment.from), Math.max(window[1], segment.to)] : [segment.from, segment.to];
    }
  }
  return result;
}

/** 關鍵獎勵：label 必填；items 只留站內有的道具 id，其餘回報 */
export function normalizeReward(raw, itemIds) {
  if (!raw) return { reward: undefined, dropped: [] };
  if (!raw.label) throw new Error("reward 缺 label");
  const all = raw.items || [];
  return {
    reward: { label: raw.label, items: all.filter(id => itemIds.has(id)) },
    dropped: all.filter(id => !itemIds.has(id)),
  };
}
