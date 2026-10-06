/**
 * 10/15 自動上線用：從官方公告列表找「開機公告」。
 * 開機公告的標題（2026-07～10 的實例）：
 *   新楓之谷：經典版 《1001(四)V001初心啟航 例行維護開機公告》
 *   新楓之谷：經典版 《0729(三)V001 初心啟航 開機公告》
 *   新楓之谷：經典版 《0806(四)V001 初心啟航 例行維護開機公告》(18:41 更新)
 * 不算：關機公告、延後開機公告、延長維護公告、改版預告。
 * API：POST https://maplestoryclassic.beanfun.com/api/Bulletin/FindBulletin，回 data.myDataSet.table[]（bullentinId、title、startDate "YYYY/MM/DD"）。
 */
export const BULLETIN_API = "https://maplestoryclassic.beanfun.com/api/Bulletin";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export function isOpeningTitle(title) {
  return /開機公告/.test(title) && !/延後|關機|延長/.test(title);
}

/** "2026/10/15" → "1015" */
export function monthDay(date) {
  const [, month, day] = date.split("/");
  return `${month}${day}`;
}

/** 那一天的開機公告：是開機公告、標題寫著那天（MMDD）、而且是那天以後發的 */
export function findOpening(rows, date) {
  const code = monthDay(date);
  return rows.find(row => isOpeningTitle(row.title) && row.title.includes(code) && row.startDate >= date) ?? null;
}

/** 正式機是不是已經是這一版（看 /data/meta.json 的等級上限） */
export function released(meta, levelCap) {
  return (meta?.release?.levelCap ?? 0) >= levelCap;
}

function headers(referer) {
  return { "Content-Type": "application/json", "User-Agent": UA, Referer: referer };
}

export async function fetchBulletins({ page = 1, pageSize = 30 } = {}) {
  const response = await fetch(`${BULLETIN_API}/FindBulletin`, {
    method: "POST",
    headers: headers("https://maplestoryclassic.beanfun.com/bulletin"),
    body: JSON.stringify({ pageSize, kind: 0, page, method: 6 }),
  });
  if (!response.ok) throw new Error(`公告列表 HTTP ${response.status}`);
  const body = await response.json();
  return body?.data?.myDataSet?.table ?? [];
}

export async function fetchBulletin(id) {
  const response = await fetch(`${BULLETIN_API}/BulletinDetail?pbid=${id}`, {
    method: "POST",
    headers: headers(`https://maplestoryclassic.beanfun.com/bulletin?Bid=${id}`),
    body: "{}",
  });
  if (!response.ok) throw new Error(`公告 ${id} HTTP ${response.status}`);
  const table = (await response.json())?.data?.myDataSet?.table;
  return table ? { bullentinId: String(id), title: table.title ?? "", startDate: table.startDate ?? "" } : null;
}
