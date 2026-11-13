/**
 * 水影片：挑哪些公告要做片、記重試狀態（純函式，不碰網路與檔案）。
 * 狀態藏在追蹤 issue 內文的 HTML 註解 <!-- video:84140=done,84087=2 -->（id=done 做完了；id=N 已失敗 N 次），
 * 跟 bulletin.mjs 的 <!-- seen:... --> 並存，寫的時候放在 seen 前面。
 */
import { classify } from "../../announce/lib/bulletin.mjs";

const MAX_TRIES = 3;
const DAY = 86400000;
const TPE = 8 * 3600000;
const VIDEO = /\n*<!-- video:[0-9a-z=,]* -->/;
const SEEN_AT_END = /\n*(<!-- seen:[0-9,]* -->\s*)$/;

/** 維護、開機、關機、制裁不做；商城外觀、活動、改版／更新做 */
export function shouldMakeVideo(title) {
  if (/維護|異常|補償|開機|關機|制裁/.test(title)) return false;
  const { kind } = classify(title);
  return kind === "event" || kind === "cash" || /改版|更新/.test(title);
}

export function readVideoState(body) {
  const state = new Map();
  const m = (body ?? "").match(/<!-- video:([0-9a-z=,]*) -->/);
  for (const part of (m ? m[1] : "").split(",").filter(Boolean)) {
    const [id, v] = part.split("=");
    if (id && v) state.set(id, v === "done" ? { n: 0, done: true } : { n: Number(v) || 0, done: false });
  }
  return state;
}

const KEEP = 200;

/** 只留 id 最大（最新）的 200 則，免得 issue 內文一直長 */
export function writeVideoState(body, state) {
  const keep = new Set([...state.keys()].sort((a, b) => Number(b) - Number(a)).slice(0, KEEP));
  const text = [...state].filter(([id]) => keep.has(id)).map(([id, s]) => `${id}=${s.done ? "done" : s.n}`).join(",");
  const stripped = (body ?? "").replace(VIDEO, "");
  const comment = `<!-- video:${text} -->`;
  if (SEEN_AT_END.test(stripped)) return stripped.replace(SEEN_AT_END, `\n\n${comment}\n\n$1`);
  return `${stripped}\n\n${comment}`;
}

/** 要做、沒做完、失敗不到 3 次、公告日在 7 天內（台北日期算），舊的先 */
export function pendingVideos(rows, state, now) {
  const todayTpe = Math.floor((now + TPE) / DAY) * DAY; // 台北今天 00:00（以 UTC 毫秒表示的台北牆上時間）
  const cutoff = todayTpe - 7 * DAY;
  return rows
    .filter(r => {
      const s = state.get(r.bullentinId);
      if (s && (s.done || s.n >= MAX_TRIES)) return false;
      const [y, mo, d] = String(r.startDate).split("/").map(Number);
      if (!y || !mo || !d || Date.UTC(y, mo - 1, d) < cutoff) return false;
      return shouldMakeVideo(r.title);
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || Number(a.bullentinId) - Number(b.bullentinId));
}
