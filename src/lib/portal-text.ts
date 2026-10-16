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

/** 靠 NPC 傳送的那一步（傳送門名稱 `npc:<NPC 名>:<站的位置>`，pipeline/lib/npc-warps.mjs）；一般傳送門回 null */
export function npcWarp(via: string): { npc: string; spot: string } | null {
  const [kind, npc, spot] = via.split(":");
  return kind === "npc" && npc ? { npc, spot: spot ?? "" } : null;
}

/** 跟上一張圖最上面的傑夫說話，他會送你進來 */
export function npcSentence({ npc, spot }: { npc: string; spot: string }): string {
  return `跟上一張圖${spot}的${npc}說話，他會送你進來`;
}

/** 等級門檻那一行。台服查不到門檻，數字是舊版的（2026-10-16 使用者拍板 A），台服確認後改 npc-warps.mjs 跟這句 */
export function npcLevelNote(npc: string, minLevel: number): string {
  return `（${npc}只讓 ${minLevel} 等以上的人進去，參考舊版資料）`;
}

/** 左邊／右邊／上面／下面／中間都是同一句；看不出來就只說傳送門 */
export function portalSentence(direction: string | null): string {
  if (!direction) return "從上一張圖的傳送門進來";
  return `從上一張圖${direction}的傳送門進來`;
}
