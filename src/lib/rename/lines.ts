/**
 * 名字變怪物：NPC 台詞。
 * Seg＝一段字（可上色）；Seg[]＝一行；Seg[][]＝多行，每個元素是一行（不插空行，留白由畫面處理）。
 */
import type { Result } from "./match";

export type Seg = { t: string; c?: "blue" | "red" };

/** 開場 */
const OPENING: Seg[][] = [
  [{ t: "新來的冒險者？" }],
  [{ t: "要登錄" }, { t: "冒險者名冊", c: "blue" }, { t: "的話，先在登記書上簽你的 " }, { t: "ID", c: "blue" }, { t: "。" }],
  [{ t: "簽完多出來的筆畫……我會" }, { t: "幫你收著", c: "red" }, { t: "的。" }],
];

/** 拒絕後的換句話，index 0＝第 1 次拒絕 */
const DECLINES: Seg[][][] = [
  [[{ t: "……你剛剛是不是手滑了？要登錄冒險者名冊嗎？" }]],
  [[{ t: "冒險者名冊只差你一個了。" }]],
  [[{ t: "我會一直問喔。" }]],
  [[{ t: "真的不簽？" }]],
];

/** 0＝開場；1～4 依序換句話；第 5 次起在第 3、4 句輪播（鬼打牆） */
export function introLines(declines: number): Seg[][] {
  if (declines <= 0) return OPENING;
  if (declines <= DECLINES.length) return DECLINES[declines - 1];
  return DECLINES[2 + ((declines - 3) % 2)];
}

export const EMPTY_LINES: Seg[][] = [[{ t: "還沒簽喔。在登記書上寫你的 ID 吧。" }]];

/** 看別人的分享連結（重播頁、解不開的靜態卡）時 NPC 說的 */
export function replayLines(r: Result): Seg[][] {
  const head: Seg[] = [{ t: "這是別的冒險者的登記書。" }];
  const tail: Seg[] = [{ t: "換你簽簽看？" }];
  if (r.kind === "monster") return [head, [{ t: "他從那天起是" }, { t: `「${r.n}」`, c: "blue" }], tail];
  return [head, [{ t: "拉完了，測出來是一坨。" }], tail];
}

export function resultLines(r: Result): Seg[][] {
  if (r.kind === "empty") return EMPTY_LINES;
  if (r.kind === "poop") return [[{ t: "拉完了，測出來是一坨。建議換個暱稱。" }]];
  return [
    [{ t: "簽好了。多的筆畫我收下囉。" }],
    [{ t: "從今天起，你的名字是" }, { t: `「${r.n}」`, c: "blue" }],
  ];
}
