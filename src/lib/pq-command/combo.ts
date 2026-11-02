/**
 * 組隊任務「試組合」：n 個位置挑 k 個，照編號小到大一組一組試（超綠爬繩、站平台、跳木桶，女神上層拉桿）。
 * 位置編號從 1 開始，跟攻略的編號一樣（跳木桶 123 → 124 → … → 456）。
 */

/** 試組合的關：stand＝人站上去（繩、平台、桶），pull＝拉桿（誰拉都行） */
export type ComboSpec = { kind: "stand" | "pull"; n: number; k: number; unit: string };
type SayUnit = Pick<ComboSpec, "kind" | "unit">;

/** n 挑 k 的所有組合，字典序 */
export function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push(acc);
      return;
    }
    for (let i = start; i <= n; i++) pick(i + 1, [...acc, i]);
  };
  pick(1, []);
  return out;
}

/** 從這組換到下一組：要離開的位置跟新位置各自小到大配對 */
export function moves(prev: number[], next: number[]): Array<[number, number]> {
  const leave = prev.filter((p) => !next.includes(p)).sort((a, b) => a - b);
  const enter = next.filter((p) => !prev.includes(p)).sort((a, b) => a - b);
  return leave.map((from, i) => [from, enter[i]]);
}

/** 一開始第 i 個人站第 i 個位置；陣列是「第 i 個人站幾號」 */
export function firstAssign(combo: number[]): number[] {
  return [...combo];
}

/** 換到下一組後每個人站幾號：只有要離開的人換位置 */
export function nextAssign(assign: number[], nextCombo: number[]): number[] {
  const pairs = new Map(moves(assign, nextCombo));
  return assign.map((pos) => pairs.get(pos) ?? pos);
}

const COUNT = ["", "一個人", "兩個人", "三個人", "四個人", "五個人", "六個人"];

/**
 * 這組要喊的話。prev／next 是「第 i 個人站幾號」（拉桿就是要拉的那幾根）。
 * 有名字叫名字，沒名字（或空白）寫「站 3 號桶的人」。
 */
export function comboSay(spec: SayUnit, prev: number[] | null, next: number[], names: string[]): string {
  const lead = prev ? "下一組" : "第一組";
  if (spec.kind === "pull") return `${lead}：拉下 ${next.join("、")} ${spec.unit}，其他推回去`;
  const name = (i: number) => names[i]?.trim() || "";
  if (!prev) {
    if (next.every((_, i) => name(i))) return `${lead}：${next.map((pos, i) => `${name(i)} ${pos} ${spec.unit}`).join("、")}，站好別動`;
    return `${lead}：${COUNT[next.length] ?? `${next.length} 個人`}分別站 ${next.join("、")} ${spec.unit}，站好別動`;
  }
  const changed = next
    .map((to, i) => ({ i, from: prev[i], to }))
    .filter((m) => m.from !== m.to)
    .sort((a, b) => a.from - b.from)
    .map((m) => (name(m.i) ? `${name(m.i)}從 ${m.from} ${spec.unit}換到 ${m.to} ${spec.unit}` : `站 ${m.from} ${spec.unit}的人換到 ${m.to} ${spec.unit}`));
  return `${lead}：${changed.join("、")}，其他人別動`;
}
