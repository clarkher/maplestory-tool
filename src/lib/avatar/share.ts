/**
 * 紙娃娃的分享連結：/api/avatar/share?<穿搭> 回一小頁帶 og 標籤的 HTML（LINE、Discord 才有預覽圖），人打開馬上轉去 /plan/avatar。
 * 純函式，Worker 會打包這支：不 import 任何資料檔（avatar.json 不進 Worker），資料只在 shareQuery（瀏覽器端）傳進來。
 * 網址參數比一般網址多寫（route 手上沒有資料檔，不知道預設是什麼）：
 *   g=1 女（男不寫）、s 膚色、h 髮型、f 臉型、w 道具 id 用「.」接（都一定寫）、p 動作、e 表情、x=1 翻面（跟預設一樣就不寫）、
 *   j＝這套裡要用日服畫的 id（髮型、臉型、日服裝備，用「.」接；全是台服就不寫）
 * readShare 把進來的參數當壞人：只認不超過 8 位的數字、w 最多 12 件、p 與 e 只認已知的鍵、g 只認 1；
 * 圖片網址跟頁面網址全部由我們自己組，從不把進來的字串原樣放進輸出。
 */
import { EMOS, POSES, defaultOutfit, itemIndex } from "./outfit";
import type { Outfit } from "./outfit";
import { WEAR_ORDER, msioUrl, part, stanceFor, styleRegion } from "./render";
import type { Part } from "./render";
import type { AvatarData, Region } from "./types";

const PAGE = "/plan/avatar";
const TITLE = "看看我的紙娃娃";
const DESCRIPTION = "楓谷幫手紙娃娃：換髮型、穿點裝，看角色穿起來的樣子";
const SITE_NAME = "楓谷幫手";

/**
 * 預覽圖放大幾倍：Facebook 不收 200px 以下的圖，預設角色 4 倍只有 172×272，6 倍 258×408（實測）。
 * 下載還是 4 倍（useAvatarActions），這裡只管分享連結的 og:image。
 */
const OG_RESIZE = 6;

/** w 最多幾件：12 格各一件 */
const MAX_WEAR = WEAR_ORDER.length;
/** j 最多看幾個：12 件裝備加髮型、臉型 */
const MAX_JP = MAX_WEAR + 2;

/** 用「.」接起來的數字，壞的（不是 1～8 位數字）逐個丟，丟完再取前 max 個 */
function idList(raw: string | null, max: number): number[] {
  return (raw ?? "")
    .split(".")
    .filter((t) => /^\d{1,8}$/.test(t))
    .slice(0, max)
    .map(Number);
}

/** 單一數字欄位：1～8 位數字才算，不然當沒寫 */
function oneId(raw: string | null): number | undefined {
  return raw !== null && /^\d{1,8}$/.test(raw) ? Number(raw) : undefined;
}

/** 瀏覽器端：這套穿搭 → 分享連結的參數（不含「?」） */
export function shareQuery(o: Outfit, data: AvatarData): string {
  const items = itemIndex(data);
  const jp: number[] = [];
  const q: string[] = [];
  if (o.g === 1) q.push("g=1");
  q.push(`s=${o.skin}`, `h=${o.hair}`, `f=${o.face}`);
  if (styleRegion(data, "hair", o.hair) === "j") jp.push(o.hair);
  if (styleRegion(data, "face", o.face) === "j") jp.push(o.face);
  // 順序、取捨跟 characterUrl 一樣：資料裡沒有、畫不出來（沒有 r）的不放，route 才畫得出一模一樣的圖
  const ids: number[] = [];
  for (const k of WEAR_ORDER) {
    const id = o.wear[k];
    const item = id === undefined ? undefined : items.get(id);
    if (!item?.r) continue;
    ids.push(item.id);
    if (item.r === "j") jp.push(item.id);
  }
  q.push(`w=${ids.join(".")}`);
  if (o.pose !== "stand") q.push(`p=${o.pose}`);
  if (o.emo !== "default") q.push(`e=${o.emo}`);
  if (o.flip) q.push("x=1");
  if (jp.length > 0) q.push(`j=${jp.join(".")}`);
  return q.join("&");
}

/**
 * route 端：分享連結的參數 → 開頁網址（page，不含 j）＋預覽圖網址（image）。
 * 缺 s、h、f 其中一個就畫不出圖：image 是 null，page 帶著有的（呼叫的人 302 過去）。沒寫 w 當預設衣服（跟頁面開起來一樣）。
 */
export function readShare(params: URLSearchParams): { page: string; image: string | null } {
  const female = params.get("g") === "1";
  const skin = oneId(params.get("s"));
  const hair = oneId(params.get("h"));
  const face = oneId(params.get("f"));
  const wearGiven = params.has("w") ? idList(params.get("w"), MAX_WEAR) : null;
  const pose = POSES.find((x) => x.key === params.get("p"))?.key ?? "stand";
  const emo = EMOS.find((x) => x.key === params.get("e"))?.key ?? "default";
  const flip = params.get("x") === "1";

  // 開頁網址：只放驗過的值，用我們自己的順序重寫（跟 outfitQuery 一樣只寫跟預設不一樣的），不含 j
  const q: string[] = [];
  if (female) q.push("g=1");
  if (skin !== undefined) q.push(`s=${skin}`);
  if (hair !== undefined) q.push(`h=${hair}`);
  if (face !== undefined) q.push(`f=${face}`);
  if (wearGiven) q.push(`w=${wearGiven.join(".")}`);
  if (pose !== "stand") q.push(`p=${pose}`);
  if (emo !== "default") q.push(`e=${emo}`);
  if (flip) q.push("x=1");
  const page = q.length > 0 ? `${PAGE}?${q.join("&")}` : PAGE;
  if (skin === undefined || hair === undefined || face === undefined) return { page, image: null };

  const d = defaultOutfit(female ? 1 : 0).wear;
  const wear = wearGiven ?? WEAR_ORDER.flatMap((k) => (d[k] === undefined ? [] : [d[k]]));
  const jp = new Set(idList(params.get("j"), MAX_JP));
  const where = (id: number): Region => (jp.has(id) ? "j" : "t");
  // 順序跟 characterUrl 一樣：膚色身體、膚色頭、髮型、臉型（表情放在臉型），再來是裝備
  const parts: Part[] = [
    part(skin, "t"),
    part(skin + 10000, "t"),
    part(hair, where(hair)),
    part(face, where(face), emo === "default" ? undefined : emo),
    ...wear.map((id) => part(id, where(id))),
  ];
  // 槍、矛（武器 id 前三碼 143、144）才要 stand2／walk2；沒有資料檔看不出哪件是武器，直接看前三碼
  const spear = wear.find((id) => Math.floor(id / 10000) === 143 || Math.floor(id / 10000) === 144);
  const image = msioUrl(parts, stanceFor(pose, spear === undefined ? undefined : { id: spear }), 0, { resize: OG_RESIZE, mode: 0, flip });
  return { page, image };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * 給爬蟲的 og 標籤＋給人的轉址（location.replace，沒有 JavaScript 就靠 meta refresh）。沒有任何看得到的字。
 * 屬性值逐個跳脫；放進 script 的網址用 JSON 字串，小於符號寫成 unicode 跳脫，不會提早結束 script。
 */
export function shareHtml(page: string, image: string): string {
  const to = JSON.stringify(page).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>${TITLE}</title>
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url=${esc(page)}">
<script>location.replace(${to})</script>
</head>
<body></body>
</html>
`;
}
