/**
 * 官方公告追蹤（v2.00，11/10 拍板 2A）：抓官網公告列表，新的公告在追蹤 issue 留言通知，不自動改網站。
 * API：POST https://maplestoryclassic.beanfun.com/api/Bulletin/FindBulletin，
 * 回 data.myDataSet.table[]（bullentinId、title、startDate "YYYY/MM/DD"）。v0.48 的開機排程用過同一支。
 */

const API = "https://maplestoryclassic.beanfun.com/api/Bulletin/FindBulletin";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export const bulletinUrl = id => `https://maplestoryclassic.beanfun.com/bulletin?Bid=${id}`;

export async function fetchBulletins({ pageSize = 30, fetcher = fetch } = {}) {
  const response = await fetcher(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Referer: "https://maplestoryclassic.beanfun.com/bulletin" },
    body: JSON.stringify({ pageSize, kind: 0, page: 1, method: 6 }),
  });
  if (!response.ok) throw new Error(`公告列表 HTTP ${response.status}`);
  const rows = (await response.json())?.data?.myDataSet?.table;
  // 空陣列也當錯：官網改版回了別的格式時，不能當成「沒有新公告」默默過去
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("公告列表是空的，官網格式可能改了");
  return rows.map(r => ({ bullentinId: String(r.bullentinId), title: String(r.title ?? "").trim(), startDate: String(r.startDate ?? "") }));
}

// 由上往下第一個對到的算數：「商城臨時維護」算維護不算商城
const KINDS = [
  { kind: "skip", re: /制裁/ },
  { kind: "maintenance", re: /維護|開機|關機|改版|更新|預告/, label: "維護／改版", hint: "可能有新版本：遊戲資料上游更新後會自動接；看要不要寫改版整理（/updates）、調未來視（/future）、改開放地區" },
  { kind: "cash", re: /轉蛋|美容院|彗星|神秘商人|商城|樂豆/, label: "商城外觀", hint: "看紙娃娃（/plan/avatar）穿不穿得到、商城價對不對" },
  { kind: "event", re: /活動|限定|週年|派對|特賣|祭典|節/, label: "活動", hint: "看要不要寫活動攻略；活動店的結束時間（查資料「活動限定・到幾號」）有沒有變" },
];

export function classify(title) {
  const hit = KINDS.find(k => k.re.test(title));
  return hit ?? { kind: "other", label: "其他", hint: "點進去看跟網站有沒有關係" };
}

/** 沒看過的公告，照 id 小到大（舊的先講） */
export function newRows(rows, seen) {
  return rows.filter(r => !seen.has(r.bullentinId)).sort((a, b) => Number(a.bullentinId) - Number(b.bullentinId));
}

// 看過的 id 藏在追蹤 issue 內文最後的 HTML 註解，不另外存檔
const SEEN = /\n*<!-- seen:[0-9,]* -->\s*$/;
const KEEP = 300;

export function readSeen(body) {
  const m = (body ?? "").match(/<!-- seen:([0-9,]*) -->/);
  return new Set(m ? m[1].split(",").filter(Boolean) : []);
}

export function writeSeen(body, ids) {
  const kept = [...new Set(ids)].sort((a, b) => Number(b) - Number(a)).slice(0, KEEP);
  return `${(body ?? "").replace(SEEN, "")}\n\n<!-- seen:${kept.join(",")} -->`;
}

/** 新公告的留言；都不用通知（只有制裁公告）時回空字串 */
export function renderComment(rows) {
  const lines = rows
    .map(r => ({ r, c: classify(r.title) }))
    .filter(({ c }) => c.kind !== "skip")
    .map(({ r, c }) => `- **${c.label}**｜${r.startDate}｜[${r.title}](${bulletinUrl(r.bullentinId)})\n  要看：${c.hint}`);
  return lines.length ? `官網有 ${lines.length} 則新公告：\n\n${lines.join("\n")}` : "";
}
