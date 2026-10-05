/**
 * 「帶我去」每一步的傳送門說明。玩家看不懂 sub00、in01 這種代碼，也不需要座標。
 * 名稱只認方向字（east、west、up、top、down、dn、under、bottom），其他一律用它在上一張圖所有傳送門裡的位置判斷；
 * 都判斷不出來就不猜，只說「傳送門」。
 * in／out／st 不是方向：森林迷宮、地鐵的每一步都叫 in／out，照名稱寫「走進建築」會整條路線都在走進建築（final review F2）。
 * market、tp 查過資料：market 只有 2 條、都通到沒開放的圖，tp 一條都沒有，所以也不認。
 */
const NAME_HINTS: Array<[RegExp, string]> = [
  [/^east/i, "右邊"],
  [/^west/i, "左邊"],
  [/^(up|top)/i, "上面"],
  [/^(down|dn|under|bottom)/i, "下面"],
];

export function portalDirection(
  name: string,
  x: number | undefined,
  y: number | undefined,
  siblings: Array<[number, number]>,
): string | null {
  const raw = name.trim();
  for (const [pattern, text] of NAME_HINTS) if (pattern.test(raw)) return text;
  if (x === undefined || y === undefined || (x === 0 && y === 0)) return null;
  const points = siblings.filter(([px, py]) => !(px === 0 && py === 0));
  if (points.length < 2) return null;

  const xs = points.map(([px]) => px);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (maxX - minX >= 300) {
    const ratio = (x - minX) / (maxX - minX);
    if (ratio <= 0.25) return "左邊";
    if (ratio >= 0.75) return "右邊";
  }
  // 楓之谷的座標 y 往下是正
  const ys = points.map(([, py]) => py).sort((a, b) => a - b);
  const middle = ys[Math.floor(ys.length / 2)];
  if (y < middle - 200) return "上面";
  if (y > middle + 200) return "下面";
  return "中間";
}

/** 左邊／右邊／上面／下面／中間都是同一句；看不出來就只說傳送門 */
export function portalSentence(direction: string | null): string {
  if (!direction) return "從上一張圖的傳送門進來";
  return `從上一張圖${direction}的傳送門進來`;
}
