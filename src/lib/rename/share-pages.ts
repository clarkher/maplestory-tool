/**
 * 名字變怪物的分享靜態頁 /plan/rename/m/<id>（建置時用）：
 * 每隻能被配到的怪都要一頁——shapes.json 的本尊 id 跟每個換色 alt id，再加一坨 poop。
 * 名字照 shapes.json（本尊用 n、alt 用自己的 n），跟遊戲裡結果卡寫的一樣。
 * 只給伺服器頁面用：shapes.json 很大，不要讓前端 bundle 靜態引入這支。
 */
import shapesJson from "./shapes.json";

/** 只用得到 id、名字 */
const SHAPES: { id: number; n: string; alt?: { id: number; n: string }[] }[] = shapesJson.shapes;

/** generateStaticParams 用：全部 id 字串＋"poop" */
export function sharePageIds(): string[] {
  const ids = new Set<string>();
  for (const s of SHAPES) {
    ids.add(String(s.id));
    for (const a of s.alt ?? []) ids.add(String(a.id));
  }
  ids.add("poop");
  return [...ids];
}

/** 怪名；poop 回 null；不認得的 id 回 undefined */
export function sharePageName(id: string): string | null | undefined {
  if (id === "poop") return null;
  for (const s of SHAPES) {
    if (String(s.id) === id) return s.n;
    const alt = s.alt?.find(a => String(a.id) === id);
    if (alt) return alt.n;
  }
  return undefined;
}

/**
 * 結果卡「{怪}在哪打／怎麼去 →」連 /db/monsters/<id>：那一頁照現在的遊戲資料產，資料更新拿掉的怪會 404。
 * 頁面（伺服器）把現在資料的怪 id 丟進來，回 shapes.json 裡（本尊＋alt）還在的那些，傳給 RenameGame；不在的就不放連結。
 */
export function liveShapeIds(live: Iterable<number>): number[] {
  const have = new Set(live);
  const out: number[] = [];
  for (const s of SHAPES) for (const id of [s.id, ...(s.alt ?? []).map(a => a.id)]) if (have.has(id)) out.push(id);
  return out;
}

/** og:title：建置產預覽圖時「｜」前面是大標、後面是副標 */
export function shareOgTitle(n: string | null): string {
  return n ? `我從今天起是「${n}」｜名字變怪物` : "測出來是一坨｜名字變怪物";
}
