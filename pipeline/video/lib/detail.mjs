/**
 * 抓單則公告內文並抽出字與圖。
 * API：POST .../api/Bulletin/BulletinDetail?pbid=<id>，body {"pbid":<id>}（GET 會 405）。
 */
import { REFERER, UA } from "../../announce/lib/bulletin.mjs";

const API = "https://maplestoryclassic.beanfun.com/api/Bulletin/BulletinDetail";

export async function fetchDetail(id, { fetcher = fetch } = {}) {
  const response = await fetcher(`${API}?pbid=${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Referer: REFERER },
    body: JSON.stringify({ pbid: Number(id) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`公告內文 HTTP ${response.status}`);
  const json = await response.json();
  if (json?.code !== 1) throw new Error(`公告內文 code=${json?.code}`);
  const t = json.data?.myDataSet?.table;
  if (!t) throw new Error("公告內文沒有 table，官網格式可能改了");
  return { id: String(t.bullentinId ?? id), title: String(t.title ?? "").trim(), startDate: String(t.startDate ?? ""), html: t.content ?? null };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = s =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

// 固定法務段：整段丟掉（開頭可帶「1.」編號）
const LEGAL = /^(?:\d+[.、]\s*)?(?:此為機會中獎商品|圖片與文案僅供參考|詳細道具資訊請依遊戲中|若有任何特殊異動)/;

export function extractContent(html) {
  if (!html) return { text: "", images: [] };
  const images = [...new Set([...html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["'](https:\/\/[^"']+)["']/gi)].map(m => decode(m[1])))];
  const paras = html
    .replace(/<img\b[^>]*>/gi, " ")
    .split(/<\/p>|<br\s*\/?>|<\/div>|<\/li>/i)
    .map(p => decode(p.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // 只丟「注意事項」標題行與法務開頭段落；標題底下的活動期間等規則是來源，要留
  const kept = paras.filter(p => !/^注意事項[：:]?$/.test(p) && !LEGAL.test(p));
  return { text: kept.join("\n"), images };
}
