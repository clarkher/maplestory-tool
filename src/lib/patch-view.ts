/**
 * 改版單版頁（/updates/<版本>）用的純函式：說明比對、改動類別、全部新東西分組。
 * 不碰 fs，client 元件也可以 import。
 */
import type { PatchFile } from "./patches";

export type DiffPart = { t: "same" | "del" | "ins"; v: string };

/** 逐字比對：切掉共同前後綴，中間一段刪、一段加（不做 LCS；說明改動多半只動一個數字） */
export function textDiff(before: string, after: string): DiffPart[] {
  const a = Array.from(before);
  const b = Array.from(after);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const parts: DiffPart[] = [
    { t: "same", v: a.slice(0, pre).join("") },
    { t: "del", v: a.slice(pre, a.length - suf).join("") },
    { t: "ins", v: b.slice(pre, b.length - suf).join("") },
    { t: "same", v: a.slice(a.length - suf).join("") },
  ];
  return parts.filter(p => p.v);
}

const DIGIT = /[0-9]/;

/**
 * 畫面用：textDiff 切在數字中間時（1500 → 1200 只標 5 → 2），把兩邊相連的數字吃進改動段，整個數字換。
 */
export function numberDiff(before: string, after: string): DiffPart[] {
  const parts = textDiff(before, after);
  const del = parts.find(p => p.t === "del")?.v ?? "";
  const ins = parts.find(p => p.t === "ins")?.v ?? "";
  if (!del && !ins) return parts;
  let head = parts[0]?.t === "same" ? Array.from(parts[0].v) : [];
  let tail = parts[parts.length - 1]?.t === "same" && parts.length > 1 ? Array.from(parts[parts.length - 1].v) : [];
  let d = Array.from(del);
  let i = Array.from(ins);
  if (DIGIT.test(d[0] ?? "") || DIGIT.test(i[0] ?? "")) {
    let k = head.length;
    while (k > 0 && DIGIT.test(head[k - 1])) k--;
    const moved = head.slice(k);
    head = head.slice(0, k);
    d = [...moved, ...d];
    i = [...moved, ...i];
  }
  if (DIGIT.test(d[d.length - 1] ?? "") || DIGIT.test(i[i.length - 1] ?? "")) {
    let k = 0;
    while (k < tail.length && DIGIT.test(tail[k])) k++;
    const moved = tail.slice(0, k);
    tail = tail.slice(k);
    d = [...d, ...moved];
    i = [...i, ...moved];
  }
  return ([
    { t: "same", v: head.join("") },
    { t: "del", v: d.join("") },
    { t: "ins", v: i.join("") },
    { t: "same", v: tail.join("") },
  ] as DiffPart[]).filter(p => p.v);
}

export const CHANGED_KIND_ORDER = ["說明", "商店", "掉落", "能力", "名稱"] as const;

type ChangedRow = PatchFile["changed"][number];

/** 改了的類別與筆數，照固定順序；0 筆的不列（順序表外的類別排最後） */
export function changedKinds(rows: Pick<ChangedRow, "kind">[]): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const order: string[] = [...CHANGED_KIND_ORDER, ...[...counts.keys()].filter(k => !(CHANGED_KIND_ORDER as readonly string[]).includes(k))];
  return order.filter(k => counts.get(k)).map(kind => ({ kind, count: counts.get(kind)! }));
}

type Added = PatchFile["added"];
export type AddedGroup =
  | { type: "item"; label: string; count: number; rows: Added["items"] }
  | { type: "quest"; label: string; count: number; rows: Added["quests"] }
  | { type: "monster"; label: string; count: number; rows: Added["monsters"] }
  | { type: "map"; label: string; count: number; rows: Added["maps"] };

/** 依 key 分組，數量多到少（同數照第一次出現的順序） */
function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return [...m.entries()].sort((x, y) => y[1].length - x[1].length);
}

/**
 * 全部新東西分組：道具照子分類（多到少）、任務照地區（多到少）、怪物一組、地圖一組。
 * 髮型臉型只在 counts.looks，差異檔本來就不逐筆列，這裡不出組。
 * 子分類名跟別的大類撞名（裝備・戒指／時裝・戒指）才標大類；子分類跟大類同名（消耗/消耗）只寫一次。
 */
export function addedGroups(patch: Pick<PatchFile, "added">): AddedGroup[] {
  const { items, quests, monsters, maps } = patch.added;
  const cats = new Map<string, Set<string>>();
  for (const i of items) {
    if (!cats.has(i.s)) cats.set(i.s, new Set());
    cats.get(i.s)!.add(i.c);
  }
  const itemLabel = (i: Added["items"][number]) =>
    i.s === i.c || !i.s ? i.c : (cats.get(i.s)!.size > 1 ? `${i.c}・${i.s}` : i.s);
  const out: AddedGroup[] = [];
  for (const [label, rows] of groupBy(items, itemLabel)) out.push({ type: "item", label, count: rows.length, rows });
  for (const [label, rows] of groupBy(quests, q => q.area || "其他")) out.push({ type: "quest", label, count: rows.length, rows });
  if (monsters.length) out.push({ type: "monster", label: "怪物", count: monsters.length, rows: monsters });
  if (maps.length) out.push({ type: "map", label: "地圖", count: maps.length, rows: maps });
  return out;
}
