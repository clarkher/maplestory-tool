// 每日影片（v2.35）：下一批要做哪些題目。資料直接讀 public/data（跟網站同一份）。
// 題目 key：mob-<怪物 id>、go-<目的地圖 id>；做過的 key 從頻道上傳過的片的說明欄連結 utm_campaign 認（daily.mjs）。
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(import.meta.dirname, "../../../public/data");
const load = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

/** 手做的那幾集（utm 不是照 key 命名的），當作做過 */
export const MADE_BY_HAND = ["mob-2230101", "go-105050000"];

/** 怪物：被越多張練功圖推薦的越先做，同分低等先做；沒有出沒地圖的不做 */
export function mobTopics({ monsters = load("monsters.json"), training = load("training.json") } = {}) {
  const list = Array.isArray(monsters) ? monsters : Object.values(monsters);
  const hits = new Map();
  for (const t of training) for (const [id] of t.mobs ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
  return list
    .filter((m) => (m.sp ?? []).length > 0)
    .sort((a, b) => (hits.get(b.id) ?? 0) - (hits.get(a.id) ?? 0) || a.lv - b.lv || a.id - b.id)
    .map((m) => ({ key: `mob-${m.id}`, kind: "mob", id: m.id, name: m.n, path: `/db/monsters/${m.id}` }));
}

/** 地圖：練功推薦圖照效率排（同一張只做一次），出發點＝離它最近的城鎮；自己就是城鎮的不做 */
export function goTopics({ training = load("training.json"), nearest = load("nearest-town.json") } = {}) {
  const seen = new Set();
  const out = [];
  for (const t of [...training].sort((a, b) => b.eff - a.eff)) {
    if (seen.has(t.m)) continue;
    seen.add(t.m);
    const town = nearest[String(t.m)]?.[0];
    if (!town || town === t.m) continue;
    out.push({ key: `go-${t.m}`, kind: "go", id: t.m, from: town, path: `/go?to=${t.m}&from=${town}` });
  }
  return out;
}

/** 從 topics 挑前 n 個還沒做過的 */
export function nextTopics(topics, done, n) {
  return topics.filter((t) => !done.has(t.key)).slice(0, n);
}
